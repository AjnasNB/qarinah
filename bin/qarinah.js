#!/usr/bin/env node
import process from "node:process";
import {
  QarinahError,
  appendEvent,
  approveWorkspaceTrust,
  captureClaudeHook,
  captureCodexHook,
  compileContext,
  initializeWorkspace,
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

function help() {
  return `Qarinah — evidence-linked context for AI agents

Usage:
  qarinah init [path] [--capture metadata|content]
  qarinah record --kind <kind> --title <title> [--body <text>] [--data-json <json>] [--relation type:target]
  qarinah hook codex|claude
  qarinah mcp
  qarinah build
  qarinah query [text] [--format json|markdown] [--limit n] [--max-chars n]
  qarinah trust [path] --capture metadata|content
  qarinah untrust
  qarinah enable | disable
  qarinah doctor
  qarinah status
`;
}

async function run(argv) {
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
    const target = positionals(args)[0] || process.cwd();
    const capture = option(args, "--capture");
    if (!capture) throw new TypeError("trust requires an explicit --capture metadata|content choice.");
    process.stdout.write(`${JSON.stringify(await approveWorkspaceTrust(target, capture), null, 2)}\n`);
    return;
  }
  if (command === "untrust") {
    process.stdout.write(`${JSON.stringify(await revokeWorkspaceTrust(process.cwd()), null, 2)}\n`);
    return;
  }
  if (command === "record") {
    const dataText = option(args, "--data-json", "{}");
    const data = JSON.parse(dataText);
    const event = await appendEvent({
      kind: option(args, "--kind"),
      title: option(args, "--title"),
      body: option(args, "--body", ""),
      actor: { type: option(args, "--actor-type", "human"), id: option(args, "--actor-id", "local-user") },
      sessionId: option(args, "--session", null),
      turnId: option(args, "--turn", null),
      data,
      confidence: option(args, "--confidence", "claimed"),
      relations: parseRelations(args),
      provenance: { adapter: "qarinah-cli", sourceId: option(args, "--source-id", null) },
      retention: { class: option(args, "--retention", "project"), expiresAt: null }
    });
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
  if (command === "enable" || command === "disable") {
    const config = await setWorkspaceEnabled(process.cwd(), command === "enable");
    process.stdout.write(`${JSON.stringify({ ok: true, enabled: config.enabled }, null, 2)}\n`);
    return;
  }
  if (command === "query" || command === "context") {
    const query = positionals(args).join(" ");
    const pack = await compileContext(query, {
      cwd: process.cwd(),
      limit: integerOption(args, "--limit", 20),
      maxChars: integerOption(args, "--max-chars", undefined)
    });
    const format = option(args, "--format", "json");
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
