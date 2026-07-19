#!/usr/bin/env node
import process from "node:process";
import {
  QarinahError,
  appendEvent,
  approveWorkspaceTrust,
  captureClaudeHook,
  captureCodexHook,
  compileContext,
  exportOkf,
  initializeWorkspace,
  inspectWorkspacePolicy,
  loadIndex,
  loadWorkspace,
  rebuildDerivedState,
  renderContextPackMarkdown,
  revokeWorkspaceTrust,
  runMcpServer,
  setWorkspaceEnabled,
  verifyStore
} from "../src/index.js";

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${name} requires a value.`);
  return args[index + 1];
}

function positionals(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      index += 1;
      continue;
    }
    values.push(args[index]);
  }
  return values;
}

function integerOption(args, name, fallback) {
  const value = option(args, name);
  if (value === undefined) return fallback;
  if (!/^[0-9]+$/.test(value)) throw new TypeError(`${name} must be a positive integer.`);
  return Number(value);
}

function parseRelations(args) {
  const relations = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--relation") continue;
    const value = args[index + 1];
    const separator = value?.indexOf(":") ?? -1;
    if (separator < 1 || separator === value.length - 1) throw new TypeError("--relation must use type:target.");
    relations.push({ type: value.slice(0, separator), target: value.slice(separator + 1) });
    index += 1;
  }
  return relations;
}

function strictValueOptions(args, command, allowedOptions) {
  const allowed = new Set(allowedOptions);
  const seen = new Set();
  const values = new Map();
  const positionalValues = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positionalValues.push(value);
      continue;
    }
    if (!allowed.has(value)) throw new TypeError(`${command} does not support ${value}.`);
    if (seen.has(value)) throw new TypeError(`${command} received ${value} more than once.`);
    if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
    seen.add(value);
    values.set(value, args[index + 1]);
    index += 1;
  }
  return { values, positionals: positionalValues };
}

const RECORD_STDIN_JSON_MAX_BYTES = 128 * 1024;
const QUERY_STDIN_JSON_MAX_BYTES = 16 * 1024;
const RECORD_STDIN_JSON_FIELDS = new Set([
  "kind", "title", "body", "data", "actor", "sessionId", "turnId", "confidence",
  "relations", "sourceId", "retention"
]);
const QUERY_STDIN_JSON_FIELDS = new Set([
  "query", "format", "limit", "maxChars", "maxTokens", "reserveTokens", "asOf"
]);

async function readStdin(maximumBytes = 1_048_576) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new TypeError(`stdin exceeds ${maximumBytes} bytes.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readStdinJsonRequest(args, command, maximumBytes, allowedFields) {
  if (!args.includes("--stdin-json")) return null;
  if (args.length !== 1 || args[0] !== "--stdin-json") {
    throw new TypeError(`${command} --stdin-json cannot be combined with positional arguments or other options.`);
  }
  const text = await readStdin(maximumBytes);
  if (text.trim() === "") throw new TypeError(`${command} --stdin-json requires one JSON object on stdin.`);
  let request;
  try {
    request = JSON.parse(text);
  } catch {
    throw new TypeError(`${command} --stdin-json requires valid JSON.`);
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError(`${command} --stdin-json requires a JSON object.`);
  }
  const unknown = Object.keys(request).filter((field) => !allowedFields.has(field));
  if (unknown.length > 0) {
    throw new TypeError(`${command} --stdin-json contains unknown field(s): ${unknown.join(", ")}.`);
  }
  return request;
}

function requestInteger(request, field, minimum, maximum) {
  if (!Object.hasOwn(request, field)) return undefined;
  const value = request[field];
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function stdinRecordInput(request) {
  if (!Object.hasOwn(request, "kind")) throw new TypeError("record --stdin-json requires kind.");
  if (!Object.hasOwn(request, "title")) throw new TypeError("record --stdin-json requires title.");
  return {
    kind: request.kind,
    title: request.title,
    body: Object.hasOwn(request, "body") ? request.body : "",
    actor: Object.hasOwn(request, "actor") ? request.actor : { type: "human", id: "local-user" },
    sessionId: request.sessionId ?? null,
    turnId: request.turnId ?? null,
    data: Object.hasOwn(request, "data") ? request.data : {},
    confidence: Object.hasOwn(request, "confidence") ? request.confidence : "claimed",
    relations: Object.hasOwn(request, "relations") ? request.relations : [],
    provenance: { adapter: "qarinah-cli", sourceId: request.sourceId ?? null },
    retention: Object.hasOwn(request, "retention")
      ? request.retention
      : { class: "project", expiresAt: null }
  };
}

function stdinQueryInput(request) {
  const query = Object.hasOwn(request, "query") ? request.query : "";
  if (typeof query !== "string" || query.length > 4_096) {
    throw new TypeError("query must be a string up to 4096 characters.");
  }
  const format = Object.hasOwn(request, "format") ? request.format : "json";
  if (!["json", "markdown"].includes(format)) throw new TypeError("format must be json or markdown.");
  return {
    query,
    format,
    limit: requestInteger(request, "limit", 1, 1_000) ?? 20,
    maxChars: requestInteger(request, "maxChars", 512, 1_000_000),
    maxTokens: requestInteger(request, "maxTokens", 128, 1_000_000),
    reserveTokens: requestInteger(request, "reserveTokens", 0, 999_936),
    asOf: Object.hasOwn(request, "asOf") ? request.asOf : undefined
  };
}

function help() {
  return `Qarinah — evidence-linked context for AI agents

Usage:
  qarinah init [path] [--capture metadata|content]
  qarinah record --kind <kind> --title <title> [--body <text>] [--data-json <json>] [--relation type:target]
  qarinah record --stdin-json
  qarinah hook codex|claude
  qarinah mcp
  qarinah build
  qarinah export okf [--output <path>]
  qarinah query [text] [--format json|markdown] [--limit n] [--max-chars n] [--max-tokens n] [--reserve-tokens n] [--as-of timestamp]
  qarinah query --stdin-json
  qarinah policy [path]
  qarinah trust [path] --capture metadata|content --policy-hash sha256:<digest>
  qarinah untrust
  qarinah enable | disable
  qarinah doctor
  qarinah status
`;
}

async function run(argv) {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (![22, 24, 26].includes(nodeMajor)) {
    throw new TypeError(`Qarinah requires Node.js 22, 24, or 26; received ${process.versions.node}.`);
  }
  const [command = "help", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help());
    return;
  }
  if (command === "init") {
    const target = positionals(args)[0] || process.cwd();
    const workspace = await initializeWorkspace(target, { capture: option(args, "--capture", "metadata") });
    process.stdout.write(`${JSON.stringify({ ok: true, root: workspace.root, workspaceId: workspace.config.workspaceId, capture: workspace.config.capture }, null, 2)}\n`);
    return;
  }
  if (command === "trust") {
    const parsed = strictValueOptions(args, "trust", ["--capture", "--policy-hash"]);
    if (parsed.positionals.length > 1) throw new TypeError("trust accepts at most one workspace path.");
    const target = parsed.positionals[0] || process.cwd();
    const capture = parsed.values.get("--capture");
    const policyHash = parsed.values.get("--policy-hash");
    if (!capture || !policyHash) {
      throw new TypeError("trust requires explicit --capture metadata|content and --policy-hash sha256:<digest> choices.");
    }
    process.stdout.write(`${JSON.stringify(await approveWorkspaceTrust(target, capture, policyHash), null, 2)}\n`);
    return;
  }
  if (command === "policy") {
    if (args.length > 1 || args.some((value) => value.startsWith("--"))) {
      throw new TypeError("policy accepts at most one workspace path and no options.");
    }
    process.stdout.write(`${JSON.stringify(await inspectWorkspacePolicy(args[0] || process.cwd()), null, 2)}\n`);
    return;
  }
  if (command === "untrust") {
    process.stdout.write(`${JSON.stringify(await revokeWorkspaceTrust(process.cwd()), null, 2)}\n`);
    return;
  }
  if (command === "record") {
    const request = await readStdinJsonRequest(
      args,
      "record",
      RECORD_STDIN_JSON_MAX_BYTES,
      RECORD_STDIN_JSON_FIELDS
    );
    const input = request === null
      ? {
          kind: option(args, "--kind"),
          title: option(args, "--title"),
          body: option(args, "--body", ""),
          actor: { type: option(args, "--actor-type", "human"), id: option(args, "--actor-id", "local-user") },
          sessionId: option(args, "--session", null),
          turnId: option(args, "--turn", null),
          data: JSON.parse(option(args, "--data-json", "{}")),
          confidence: option(args, "--confidence", "claimed"),
          relations: parseRelations(args),
          provenance: { adapter: "qarinah-cli", sourceId: option(args, "--source-id", null) },
          retention: { class: option(args, "--retention", "project"), expiresAt: null }
        }
      : stdinRecordInput(request);
    const event = await appendEvent(input);
    process.stdout.write(`${JSON.stringify(event, null, 2)}\n`);
    return;
  }
  if (command === "hook") {
    const adapter = positionals(args)[0];
    if (!["codex", "claude"].includes(adapter)) throw new TypeError("hook requires the codex or claude adapter.");
    const input = JSON.parse(await readStdin());
    const result = adapter === "codex" ? await captureCodexHook(input) : await captureClaudeHook(input);
    if (!args.includes("--quiet")) process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "mcp") {
    await runMcpServer();
    return;
  }
  if (command === "build") {
    process.stdout.write(`${JSON.stringify(await rebuildDerivedState(process.cwd()), null, 2)}\n`);
    return;
  }
  if (command === "export") {
    if (args[0] !== "okf"
      || ![1, 3].includes(args.length)
      || (args.length === 3 && (args[1] !== "--output" || args[2].startsWith("--")))) {
      throw new TypeError("export requires `okf` followed by an optional --output <path>.");
    }
    const output = args.length === 3 ? args[2] : undefined;
    process.stdout.write(`${JSON.stringify(await exportOkf({ cwd: process.cwd(), output }), null, 2)}\n`);
    return;
  }
  if (command === "enable" || command === "disable") {
    const config = await setWorkspaceEnabled(process.cwd(), command === "enable");
    process.stdout.write(`${JSON.stringify({ ok: true, enabled: config.enabled }, null, 2)}\n`);
    return;
  }
  if (command === "query" || command === "context") {
    const request = await readStdinJsonRequest(
      args,
      "query",
      QUERY_STDIN_JSON_MAX_BYTES,
      QUERY_STDIN_JSON_FIELDS
    );
    const input = request === null
      ? {
          query: positionals(args).join(" "),
          format: option(args, "--format", "json"),
          limit: integerOption(args, "--limit", 20),
          maxChars: integerOption(args, "--max-chars", undefined),
          maxTokens: integerOption(args, "--max-tokens", undefined),
          reserveTokens: integerOption(args, "--reserve-tokens", undefined),
          asOf: option(args, "--as-of", undefined)
        }
      : stdinQueryInput(request);
    const pack = await compileContext(input.query, {
      cwd: process.cwd(),
      limit: input.limit,
      maxChars: input.maxChars,
      maxTokens: input.maxTokens,
      reserveTokens: input.reserveTokens,
      asOf: input.asOf
    });
    const format = input.format;
    if (format === "json") process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
    else if (format === "markdown") process.stdout.write(renderContextPackMarkdown(pack));
    else throw new TypeError("--format must be json or markdown.");
    return;
  }
  if (command === "doctor") {
    const store = await verifyStore(process.cwd());
    let derived = "current";
    try {
      await loadIndex(process.cwd(), { rebuild: false });
    } catch (error) {
      derived = error?.code === "ENOENT" ? "missing" : (error?.code || "invalid");
    }
    const ok = derived === "current";
    process.stdout.write(`${JSON.stringify({ ...store, ok, derived }, null, 2)}\n`);
    if (!ok) process.exitCode = 2;
    return;
  }
  if (command === "status") {
    const workspace = await loadWorkspace(process.cwd());
    const store = await verifyStore(workspace.root);
    process.stdout.write(`${JSON.stringify({ ...store, enabled: workspace.config.enabled, maxLogBytes: workspace.config.maxLogBytes }, null, 2)}\n`);
    return;
  }
  throw new TypeError(`Unknown command '${command}'.\n\n${help()}`);
}

run(process.argv.slice(2)).catch((error) => {
  const payload = {
    ok: false,
    code: error instanceof QarinahError ? error.code : "QARINAH_ERROR",
    message: error.message
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
