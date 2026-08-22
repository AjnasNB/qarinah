#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import {
  QarinahError,
  appendEvent,
  approveWorkspaceTrust,
  backupAgentArchives,
  buildSessionContextReceipts,
  buildDeveloperMemoryView,
  buildSymbolGraph,
  buildProjectOverview,
  buildProofContext,
  captureClaudeHook,
  captureCodexHook,
  compileContext,
  compileTaskMemoryPack,
  consolidateProjectFacts,
  createContentArchive,
  createContextHandoffCapsule,
  createProjectMemoryWatcher,
  cryptographicallyEraseContentArchiveVault,
  deleteContentArchive,
  exportOkf,
  garbageCollectContentArchive,
  initializeWorkspace,
  inspectMemoryFreshness,
  inspectWorkspacePolicy,
  installHostIntegration,
  importAgentArchive,
  loadIndex,
  listGitWorktrees,
  listContentArchives,
  loadWorkspace,
  measureMemoryFootprint,
  queryLinkedProjectMemory,
  readEvents,
  rebuildDerivedState,
  renderProjectOverviewMarkdown,
  renderProofContextMarkdown,
  renderContextPackMarkdown,
  renderCodingContextHarnessMarkdown,
  restoreContentArchive,
  searchSymbols,
  revokeWorkspaceTrust,
  runMcpServer,
  scanProjectStructure,
  runCodingContextHarness,
  runProjectMemoryCycle,
  serveMemoryDashboard,
  setWorkspaceEnabled,
  setupWorkspace,
  previewHostInstall,
  uninstallHostIntegration,
  verifyStore,
  verifyContentArchive,
  writeMemoryDashboard
} from "../src/index.js";
import {
  activationTrackingStatus,
  configureActivationTracking,
  recordActivationEvent
} from "../src/activation.js";
import { createDemoWorkspace } from "../src/demo.js";

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

function dashboardOptions(args) {
  const values = new Map();
  const projects = [];
  let serve = false;
  let worktrees = false;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--serve") {
      if (serve) throw new TypeError("dashboard received --serve more than once.");
      serve = true;
      continue;
    }
    if (name === "--worktrees") {
      if (worktrees) throw new TypeError("dashboard received --worktrees more than once.");
      worktrees = true;
      continue;
    }
    if (!["--output", "--baseline-tokens", "--delivered-tokens", "--port", "--project"].includes(name)) {
      if (name.startsWith("--")) throw new TypeError(`dashboard does not support ${name}.`);
      throw new TypeError("dashboard accepts options only.");
    }
    if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${name} requires a value.`);
    const value = args[index + 1];
    index += 1;
    if (name === "--project") {
      if (projects.length >= 31) throw new TypeError("dashboard supports at most 31 additional --project paths.");
      projects.push(value);
      continue;
    }
    if (values.has(name)) throw new TypeError(`dashboard received ${name} more than once.`);
    values.set(name, value);
  }
  return { values, projects, serve, worktrees };
}

const RECORD_STDIN_JSON_MAX_BYTES = 128 * 1024;
const QUERY_STDIN_JSON_MAX_BYTES = 16 * 1024;
const RECORD_STDIN_JSON_FIELDS = new Set([
  "kind", "title", "body", "data", "actor", "sessionId", "turnId", "confidence",
  "relations", "sourceId", "retention", "temporal", "repository", "freshness", "disclosure"
]);
const QUERY_STDIN_JSON_FIELDS = new Set([
  "query", "format", "limit", "maxChars", "maxTokens", "reserveTokens", "asOf", "minimumCoverage",
  "minimumEvidence", "rankingProfile", "temporalBoundary", "includeEvidenceSufficiency",
  "authorityScopes", "repositoryIds"
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
    ...(Object.hasOwn(request, "temporal") ? { temporal: request.temporal } : {}),
    ...(Object.hasOwn(request, "repository") ? { repository: request.repository } : {}),
    ...(Object.hasOwn(request, "freshness") ? { freshness: request.freshness } : {}),
    ...(Object.hasOwn(request, "disclosure") ? { disclosure: request.disclosure } : {}),
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
  if (!["json", "markdown", "handoff"].includes(format)) throw new TypeError("format must be json, markdown, or handoff.");
  const minimumCoverage = Object.hasOwn(request, "minimumCoverage") ? request.minimumCoverage : "any";
  if (!["any", "partial", "direct"].includes(minimumCoverage)) {
    throw new TypeError("minimumCoverage must be any, partial, or direct.");
  }
  const minimumEvidence = Object.hasOwn(request, "minimumEvidence") ? request.minimumEvidence : "any";
  if (!["any", "partial", "direct"].includes(minimumEvidence)) {
    throw new TypeError("minimumEvidence must be any, partial, or direct.");
  }
  const rankingProfile = Object.hasOwn(request, "rankingProfile") ? request.rankingProfile : "admission-first-v2";
  if (!["balanced-v1", "admission-first-v2"].includes(rankingProfile)) {
    throw new TypeError("rankingProfile must be balanced-v1 or admission-first-v2.");
  }
  const temporalBoundary = Object.hasOwn(request, "temporalBoundary") ? request.temporalBoundary : "inclusive";
  if (!["inclusive", "strict-before"].includes(temporalBoundary)) {
    throw new TypeError("temporalBoundary must be inclusive or strict-before.");
  }
  const includeEvidenceSufficiency = Object.hasOwn(request, "includeEvidenceSufficiency")
    ? request.includeEvidenceSufficiency
    : false;
  if (typeof includeEvidenceSufficiency !== "boolean") {
    throw new TypeError("includeEvidenceSufficiency must be a boolean.");
  }
  const selectors = (field) => {
    if (!Object.hasOwn(request, field)) return undefined;
    if (!Array.isArray(request[field]) || request[field].length > 64
      || request[field].some((value) => typeof value !== "string" || value.length < 1 || value.length > 256)) {
      throw new TypeError(`${field} must contain at most 64 non-empty strings.`);
    }
    return request[field];
  };
  return {
    query,
    format,
    limit: requestInteger(request, "limit", 1, 1_000) ?? 20,
    maxChars: requestInteger(request, "maxChars", 512, 1_000_000),
    maxTokens: requestInteger(request, "maxTokens", 128, 1_000_000),
    reserveTokens: requestInteger(request, "reserveTokens", 0, 999_936),
    asOf: Object.hasOwn(request, "asOf") ? request.asOf : undefined,
    minimumCoverage,
    minimumEvidence,
    rankingProfile,
    temporalBoundary,
    includeEvidenceSufficiency,
    authorityScopes: selectors("authorityScopes"),
    repositoryIds: selectors("repositoryIds")
  };
}

function help() {
  return `Qarinah - evidence-linked context for AI agents

Usage:
  qarinah init [path] [--capture metadata|content]
  qarinah setup [path] [--codex] [--claude] [--cursor] [--kimi] [--antigravity] [--freebuff] [--capture metadata|content] [--allow-query] [--auto-compact] [--share-activation] [--backup-source <export>] [--backup-destination <external-directory>]
  qarinah demo [--output <empty-directory>]
  qarinah activation status | enable | disable
  qarinah install [path] --host codex|claude|cursor|kimi|antigravity|freebuff --scope project [--dry-run] [--capture metadata|content] [--allow-query] [--auto-compact]
  qarinah uninstall [path] --host codex|claude|cursor|kimi|antigravity|freebuff --scope project
  qarinah record --kind <kind> --title <title> [--body <text>] [--data-json <json>] [--relation type:target]
  qarinah record --stdin-json
  qarinah hook codex|claude
  qarinah mcp [--allow-query --workspace-id ws_<id> --policy-hash sha256:<digest>] [--max-chars n] [--max-items n]
  qarinah build | rebuild
  qarinah scan [--max-files n] [--max-file-bytes n] [--max-total-bytes n] [--max-depth n]
  qarinah import <archive-file-or-directory> [--format auto|codex|claude|kimi|portable] [--mode compact|full] [--max-bytes n] [--max-files n] [--max-records n] [--max-line-bytes n]
  qarinah backup <archive-file-or-directory>... --destination <external-directory> [--max-bytes n] [--max-files n]
  qarinah archive create <workspace-path> [--label <name>] [--max-files n] [--max-file-bytes n] [--max-total-bytes n]
  qarinah archive list
  qarinah archive verify <archive-id>
  qarinah archive restore <archive-id> --destination <directory>
  qarinah archive delete <archive-id> --confirm <archive-id>
  qarinah archive gc --confirm-workspace <workspace-id>
  qarinah archive erase-key --confirm-workspace <workspace-id>
  qarinah symbols build
  qarinah symbols query [text] [--limit n] [--kind function,class,...]
  qarinah facts [query] [--record] [--max-facts n] [--max-chars n] [--max-tokens n] [--limit n]
  qarinah proof <query> [--format json|markdown] [--max-tokens n] [--max-chars n] [--limit n] [--symbol-limit n] [--file-limit n] [--fact-limit n] [--persist-symbols]
  qarinah watch [--once] [--interval-ms n] [--no-compact] [--no-symbols] [--no-rebuild] [--query text]
  qarinah overview [--format json|markdown]
  qarinah footprint [query] [--baseline-tokens n] [--rate-per-million n] [--max-chars n] [--max-tokens n]
  qarinah receipts [query] [--session <id>] [--write] [--max-chars n] [--max-tokens n] [--limit n]
  qarinah panel [query] [--current-only] [--limit n]
  qarinah export okf [--output <path>]
  qarinah query [text] [--format json|markdown|handoff] [--limit n] [--max-chars n] [--max-tokens n] [--reserve-tokens n] [--as-of timestamp] [--minimum-coverage any|partial|direct] [--minimum-evidence any|partial|direct]
  qarinah query --stdin-json
  qarinah task-pack debugging|code-review|feature-implementation|database-migration|incident-response|release-preparation|security-review [query]
  qarinah harness [query] [--worktrees] [--record] [--no-rebuild] [--format json|markdown] [--max-chars n] [--max-tokens n] [--reserve-tokens n] [--limit n] [--max-summary-chars n]
  qarinah map [query] [--limit n] [--type memory,file,concept,directory,reference,worktree] [--repository id,...] [--scope id,...] [--as-of timestamp]
  qarinah worktrees
  qarinah freshness
  qarinah dashboard [--output <path>] [--baseline-tokens n --delivered-tokens n]
  qarinah dashboard --serve [--port 8777] [--worktrees] [--project <initialized-project>]...
  qarinah policy [path]
  qarinah trust [path] --capture metadata|content --policy-hash sha256:<digest>
  qarinah untrust
  qarinah enable | disable
  qarinah doctor
  qarinah status
`;
}

async function run(argv) {
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  if (![22, 24, 26].includes(nodeMajor) || (nodeMajor === 22 && nodeMinor < 13)) {
    throw new TypeError(`Qarinah requires Node.js 22, 24, or 26; received ${process.versions.node}.`);
  }
  const [command = "help", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help());
    return;
  }
  if (!["setup", "demo", "activation", "mcp", "hook"].includes(command)) {
    await recordActivationEvent("seven_day_return", { cwd: process.cwd() });
  }
  if (command === "demo") {
    const parsed = strictValueOptions(args, "demo", ["--output"]);
    if (parsed.positionals.length !== 0) throw new TypeError("demo accepts --output <empty-directory> only.");
    process.stdout.write(`${JSON.stringify(await createDemoWorkspace({ output: parsed.values.get("--output") }), null, 2)}\n`);
    return;
  }
  if (command === "activation") {
    if (args.length !== 1 || !["status", "enable", "disable"].includes(args[0])) {
      throw new TypeError("activation requires status, enable, or disable.");
    }
    const result = args[0] === "status"
      ? await activationTrackingStatus({ cwd: process.cwd() })
      : await configureActivationTracking({ cwd: process.cwd(), enabled: args[0] === "enable" });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "init") {
    const target = positionals(args)[0] || process.cwd();
    const workspace = await initializeWorkspace(target, { capture: option(args, "--capture", "metadata") });
    process.stdout.write(`${JSON.stringify({ ok: true, root: workspace.root, workspaceId: workspace.config.workspaceId, capture: workspace.config.capture }, null, 2)}\n`);
    return;
  }
  if (command === "setup") {
    const flags = new Set(["--codex", "--claude", "--cursor", "--kimi", "--antigravity", "--freebuff", "--allow-query", "--auto-compact", "--share-activation"]);
    const values = new Set(["--capture", "--max-chars", "--max-items", "--backup-source", "--backup-destination", "--backup-max-bytes", "--backup-max-files"]);
    const parsed = { positionals: [], flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (!value.startsWith("--")) {
        parsed.positionals.push(value);
        continue;
      }
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`setup received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`setup does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`setup received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    if (parsed.positionals.length > 1) throw new TypeError("setup accepts at most one workspace path.");
    const positive = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new TypeError(`${name} must be a positive integer.`);
      return Number(value);
    };
    const result = await setupWorkspace({
      cwd: parsed.positionals[0] || process.cwd(),
      capture: parsed.values.get("--capture"),
      codex: parsed.flags.has("--codex"),
      claude: parsed.flags.has("--claude"),
      cursor: parsed.flags.has("--cursor"),
      kimi: parsed.flags.has("--kimi"),
      antigravity: parsed.flags.has("--antigravity"),
      freebuff: parsed.flags.has("--freebuff"),
      allowQuery: parsed.flags.has("--allow-query"),
      autoCompact: parsed.flags.has("--auto-compact"),
      shareActivation: parsed.flags.has("--share-activation"),
      maxChars: positive("--max-chars"),
      maxItems: positive("--max-items"),
      backupSources: parsed.values.has("--backup-source") ? [path.resolve(parsed.values.get("--backup-source"))] : undefined,
      backupDestination: parsed.values.has("--backup-destination") ? path.resolve(parsed.values.get("--backup-destination")) : undefined,
      backupMaxBytes: positive("--backup-max-bytes"),
      backupMaxFiles: positive("--backup-max-files")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "install") {
    const flags = new Set(["--dry-run", "--allow-query", "--auto-compact"]);
    const values = new Set(["--host", "--scope", "--capture", "--max-chars", "--max-items"]);
    const parsed = { positionals: [], flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (!value.startsWith("--")) {
        parsed.positionals.push(value);
        continue;
      }
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`install received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`install does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`install received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    if (parsed.positionals.length > 1) throw new TypeError("install accepts at most one workspace path.");
    if (!parsed.values.has("--host") || parsed.values.get("--scope") !== "project") {
      throw new TypeError("install requires --host <supported-host> and explicit --scope project.");
    }
    const positive = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new TypeError(`${name} must be a positive integer.`);
      return Number(value);
    };
    const request = {
      cwd: parsed.positionals[0] || process.cwd(),
      host: parsed.values.get("--host"),
      scope: "project",
      capture: parsed.values.get("--capture"),
      allowQuery: parsed.flags.has("--allow-query"),
      autoCompact: parsed.flags.has("--auto-compact"),
      maxChars: positive("--max-chars"),
      maxItems: positive("--max-items")
    };
    const result = parsed.flags.has("--dry-run")
      ? await previewHostInstall(request)
      : await installHostIntegration(request);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "uninstall") {
    const parsed = strictValueOptions(args, "uninstall", ["--host", "--scope"]);
    if (parsed.positionals.length > 1) throw new TypeError("uninstall accepts at most one workspace path.");
    if (!parsed.values.has("--host") || parsed.values.get("--scope") !== "project") {
      throw new TypeError("uninstall requires --host <supported-host> and explicit --scope project.");
    }
    const result = await uninstallHostIntegration({
      cwd: parsed.positionals[0] || process.cwd(),
      host: parsed.values.get("--host"),
      scope: "project"
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    const valueOptions = new Set(["--workspace-id", "--policy-hash", "--max-chars", "--max-items"]);
    const parsed = { allowQuery: false, values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (value === "--allow-query") {
        if (parsed.allowQuery) throw new TypeError("mcp received --allow-query more than once.");
        parsed.allowQuery = true;
        continue;
      }
      if (!valueOptions.has(value)) throw new TypeError(`mcp does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`mcp received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    const allowQuery = parsed.allowQuery;
    const workspaceId = parsed.values.get("--workspace-id");
    const policyHash = parsed.values.get("--policy-hash");
    if (allowQuery !== (workspaceId !== undefined && policyHash !== undefined)) {
      throw new TypeError("mcp context disclosure requires --allow-query, --workspace-id, and --policy-hash together.");
    }
    const bounded = (name, fallback) => {
      const value = parsed.values.get(name);
      if (value === undefined) return fallback;
      if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new TypeError(`${name} must be a positive integer.`);
      return Number(value);
    };
    const queryPermit = allowQuery
      ? {
          workspaceId,
          policyHash,
          maxChars: bounded("--max-chars", 12_000),
          maxItems: bounded("--max-items", 20)
        }
      : undefined;
    await runMcpServer({ queryPermit });
    return;
  }
  if (command === "build" || command === "rebuild") {
    process.stdout.write(`${JSON.stringify(await rebuildDerivedState(process.cwd()), null, 2)}\n`);
    return;
  }
  if (command === "scan") {
    const parsed = strictValueOptions(args, "scan", ["--max-files", "--max-file-bytes", "--max-total-bytes", "--max-depth"]);
    if (parsed.positionals.length !== 0) throw new TypeError("scan accepts options only and always uses the trusted workspace root.");
    const integer = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/.test(value)) throw new TypeError(`${name} must be a positive integer.`);
      return Number(value);
    };
    const result = await scanProjectStructure({
      cwd: process.cwd(),
      maxFiles: integer("--max-files"),
      maxFileBytes: integer("--max-file-bytes"),
      maxTotalBytes: integer("--max-total-bytes"),
      maxDepth: integer("--max-depth")
    });
    if (result.captured) await rebuildDerivedState(process.cwd());
    if (result.captured) await recordActivationEvent("first_capture", { cwd: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "import") {
    const parsed = strictValueOptions(args, "import", ["--format", "--mode", "--max-bytes", "--max-files", "--max-records", "--max-line-bytes"]);
    if (parsed.positionals.length !== 1) throw new TypeError("import requires exactly one archive file or directory.");
    const integer = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new TypeError(`${name} must be a positive integer.`);
      return Number(value);
    };
    const result = await importAgentArchive(parsed.positionals[0], {
      cwd: process.cwd(),
      format: parsed.values.get("--format") ?? "auto",
      mode: parsed.values.get("--mode") ?? "compact",
      maxBytes: integer("--max-bytes"),
      maxFiles: integer("--max-files"),
      maxRecords: integer("--max-records"),
      maxLineBytes: integer("--max-line-bytes")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "backup") {
    const parsed = strictValueOptions(args, "backup", ["--destination", "--max-bytes", "--max-files"]);
    if (parsed.positionals.length === 0) throw new TypeError("backup requires at least one archive file or directory.");
    const destination = parsed.values.get("--destination");
    if (!destination) throw new TypeError("backup requires --destination <external-directory>.");
    const integer = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new TypeError(`${name} must be a positive integer.`);
      return Number(value);
    };
    const result = await backupAgentArchives(
      parsed.positionals.map((source) => path.resolve(source)),
      path.resolve(destination),
      {
        cwd: process.cwd(),
        maxBytes: integer("--max-bytes"),
        maxFiles: integer("--max-files")
      }
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "archive") {
    const [action, ...archiveArgs] = args;
    if (action === "create") {
      const parsed = strictValueOptions(archiveArgs, "archive create", ["--label", "--max-files", "--max-file-bytes", "--max-total-bytes"]);
      if (parsed.positionals.length !== 1) throw new TypeError("archive create requires exactly one workspace path.");
      const integer = (name) => {
        const value = parsed.values.get(name);
        if (value === undefined) return undefined;
        if (!/^[0-9]+$/u.test(value) || Number(value) < 1) throw new TypeError(`${name} must be a positive integer.`);
        return Number(value);
      };
      process.stdout.write(`${JSON.stringify(await createContentArchive(parsed.positionals[0], {
        cwd: process.cwd(),
        label: parsed.values.get("--label"),
        maxFiles: integer("--max-files"),
        maxFileBytes: integer("--max-file-bytes"),
        maxTotalBytes: integer("--max-total-bytes")
      }), null, 2)}\n`);
      return;
    }
    if (action === "list") {
      if (archiveArgs.length !== 0) throw new TypeError("archive list accepts no arguments.");
      process.stdout.write(`${JSON.stringify(await listContentArchives({ cwd: process.cwd() }), null, 2)}\n`);
      return;
    }
    if (action === "verify") {
      if (archiveArgs.length !== 1 || archiveArgs[0].startsWith("--")) throw new TypeError("archive verify requires exactly one archive id.");
      process.stdout.write(`${JSON.stringify(await verifyContentArchive(archiveArgs[0], { cwd: process.cwd() }), null, 2)}\n`);
      return;
    }
    if (action === "restore") {
      const parsed = strictValueOptions(archiveArgs, "archive restore", ["--destination"]);
      if (parsed.positionals.length !== 1 || !parsed.values.has("--destination")) {
        throw new TypeError("archive restore requires one archive id and --destination <directory>.");
      }
      process.stdout.write(`${JSON.stringify(await restoreContentArchive(
        parsed.positionals[0], parsed.values.get("--destination"), { cwd: process.cwd() }
      ), null, 2)}\n`);
      return;
    }
    if (action === "delete") {
      const parsed = strictValueOptions(archiveArgs, "archive delete", ["--confirm"]);
      if (parsed.positionals.length !== 1 || !parsed.values.has("--confirm")) {
        throw new TypeError("archive delete requires one archive id and --confirm <same-archive-id>.");
      }
      process.stdout.write(`${JSON.stringify(await deleteContentArchive(parsed.positionals[0], {
        cwd: process.cwd(), confirmArchiveId: parsed.values.get("--confirm")
      }), null, 2)}\n`);
      return;
    }
    if (action === "gc" || action === "erase-key") {
      const parsed = strictValueOptions(archiveArgs, `archive ${action}`, ["--confirm-workspace"]);
      if (parsed.positionals.length !== 0 || !parsed.values.has("--confirm-workspace")) {
        throw new TypeError(`archive ${action} requires --confirm-workspace <workspace-id>.`);
      }
      const operation = action === "gc" ? garbageCollectContentArchive : cryptographicallyEraseContentArchiveVault;
      process.stdout.write(`${JSON.stringify(await operation({
        cwd: process.cwd(), confirmWorkspaceId: parsed.values.get("--confirm-workspace")
      }), null, 2)}\n`);
      return;
    }
    throw new TypeError("archive requires create, list, verify, restore, delete, gc, or erase-key.");
  }
  if (command === "symbols") {
    const [action, ...symbolArgs] = args;
    if (action === "build") {
      if (symbolArgs.length !== 0) throw new TypeError("symbols build accepts no arguments.");
      process.stdout.write(`${JSON.stringify(await buildSymbolGraph({ cwd: process.cwd() }), null, 2)}\n`);
      return;
    }
    if (action === "query") {
      const parsed = strictValueOptions(symbolArgs, "symbols query", ["--limit", "--kind"]);
      if (parsed.positionals.length > 1) throw new TypeError("symbols query accepts at most one query string.");
      const limitValue = parsed.values.get("--limit");
      if (limitValue !== undefined && (!/^[0-9]+$/u.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > 500)) {
        throw new TypeError("symbols query --limit must be from 1 to 500.");
      }
      const kinds = parsed.values.get("--kind")?.split(",").map((value) => value.trim()).filter(Boolean);
      process.stdout.write(`${JSON.stringify(await searchSymbols(parsed.positionals[0] ?? "", {
        cwd: process.cwd(),
        limit: limitValue === undefined ? undefined : Number(limitValue),
        kinds
      }), null, 2)}\n`);
      return;
    }
    throw new TypeError("symbols requires build or query.");
  }
  if (command === "facts") {
    const flags = new Set(["--record"]);
    const values = new Set(["--max-facts", "--max-chars", "--max-tokens", "--limit"]);
    const parsed = { positionals: [], flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (!value.startsWith("--")) {
        parsed.positionals.push(value);
        continue;
      }
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`facts received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`facts does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`facts received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    if (parsed.positionals.length > 1) throw new TypeError("facts accepts at most one query string.");
    const numeric = (name, minimum, maximum) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/u.test(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new TypeError(`${name} must be from ${minimum} to ${maximum}.`);
      }
      return Number(value);
    };
    process.stdout.write(`${JSON.stringify(await consolidateProjectFacts({
      cwd: process.cwd(),
      query: parsed.positionals[0],
      record: parsed.flags.has("--record"),
      maxFacts: numeric("--max-facts", 1, 64),
      maxChars: numeric("--max-chars", 512, 1_000_000),
      maxTokens: numeric("--max-tokens", 128, 1_000_000),
      limit: numeric("--limit", 1, 64)
    }), null, 2)}\n`);
    return;
  }
  if (command === "proof") {
    const flags = new Set(["--persist-symbols"]);
    const values = new Set(["--format", "--max-tokens", "--max-chars", "--limit", "--symbol-limit", "--file-limit", "--fact-limit"]);
    const parsed = { positionals: [], flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (!value.startsWith("--")) {
        parsed.positionals.push(value);
        continue;
      }
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`proof received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`proof does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`proof received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    if (parsed.positionals.length !== 1) throw new TypeError("proof requires exactly one quoted query string.");
    const format = parsed.values.get("--format") ?? "json";
    if (!["json", "markdown"].includes(format)) throw new TypeError("proof --format must be json or markdown.");
    const numeric = (name, minimum, maximum) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/u.test(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new TypeError(`${name} must be from ${minimum} to ${maximum}.`);
      }
      return Number(value);
    };
    const proof = await buildProofContext(parsed.positionals[0], {
      cwd: process.cwd(),
      maxTokens: numeric("--max-tokens", 1_024, 1_000_000),
      maxChars: numeric("--max-chars", 512, 1_000_000),
      limit: numeric("--limit", 1, 64),
      symbolLimit: numeric("--symbol-limit", 1, 500),
      fileLimit: numeric("--file-limit", 1, 100),
      factLimit: numeric("--fact-limit", 1, 64),
      persistSymbols: parsed.flags.has("--persist-symbols")
    });
    process.stdout.write(format === "markdown" ? renderProofContextMarkdown(proof) : `${JSON.stringify(proof, null, 2)}\n`);
    return;
  }
  if (command === "watch") {
    const flags = new Set(["--once", "--no-compact", "--no-symbols", "--no-rebuild"]);
    const values = new Set(["--interval-ms", "--query"]);
    const parsed = { flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`watch received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`watch does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`watch received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    const interval = parsed.values.get("--interval-ms");
    if (interval !== undefined && (!/^[0-9]+$/u.test(interval) || Number(interval) < 250 || Number(interval) > 3_600_000)) {
      throw new TypeError("--interval-ms must be from 250 to 3600000.");
    }
    const options = {
      cwd: process.cwd(),
      query: parsed.values.get("--query"),
      compact: !parsed.flags.has("--no-compact"),
      symbols: !parsed.flags.has("--no-symbols"),
      rebuild: !parsed.flags.has("--no-rebuild")
    };
    if (parsed.flags.has("--once")) {
      process.stdout.write(`${JSON.stringify(await runProjectMemoryCycle(options), null, 2)}\n`);
      return;
    }
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const watcher = createProjectMemoryWatcher({
      ...options,
      intervalMs: interval === undefined ? undefined : Number(interval),
      signal: controller.signal,
      onCycle(cycle) {
        process.stdout.write(`${JSON.stringify(cycle)}\n`);
      },
      onError(error) {
        process.stderr.write(`${JSON.stringify({ error: error?.code ?? error?.name ?? "WATCH_CYCLE_FAILED", message: error?.message ?? "Project memory cycle failed." })}\n`);
      }
    });
    try {
      await watcher.run();
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
    return;
  }
  if (command === "overview") {
    const parsed = strictValueOptions(args, "overview", ["--format"]);
    if (parsed.positionals.length !== 0) throw new TypeError("overview accepts options only.");
    const format = parsed.values.get("--format") ?? "markdown";
    if (!["json", "markdown"].includes(format)) throw new TypeError("overview --format must be json or markdown.");
    const overview = await buildProjectOverview({ cwd: process.cwd() });
    process.stdout.write(format === "json" ? `${JSON.stringify(overview, null, 2)}\n` : renderProjectOverviewMarkdown(overview));
    return;
  }
  if (command === "footprint") {
    const parsed = strictValueOptions(args, "footprint", ["--baseline-tokens", "--rate-per-million", "--max-chars", "--max-tokens"]);
    const integer = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/u.test(value)) throw new TypeError(`${name} must be a non-negative integer.`);
      return Number(value);
    };
    const rateValue = parsed.values.get("--rate-per-million");
    const ratePerMillion = rateValue === undefined ? undefined : Number(rateValue);
    if (rateValue !== undefined && (rateValue.trim() === "" || !Number.isFinite(ratePerMillion) || ratePerMillion <= 0)) {
      throw new TypeError("--rate-per-million must be a finite number greater than 0.");
    }
    const result = await measureMemoryFootprint({
      cwd: process.cwd(),
      query: parsed.positionals.join(" ") || undefined,
      baselineTokens: integer("--baseline-tokens"),
      ratePerMillion,
      maxChars: integer("--max-chars"),
      maxTokens: integer("--max-tokens")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "receipts") {
    const flags = new Set(["--write"]);
    const values = new Set(["--session", "--max-chars", "--max-tokens", "--limit"]);
    const parsed = { positionals: [], flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (!value.startsWith("--")) {
        parsed.positionals.push(value);
        continue;
      }
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`receipts received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`receipts does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`receipts received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    const bounded = (name, minimum, maximum) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/u.test(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
      }
      return Number(value);
    };
    const result = await buildSessionContextReceipts({
      cwd: process.cwd(),
      query: parsed.positionals.join(" ") || undefined,
      sessionId: parsed.values.get("--session"),
      maxChars: bounded("--max-chars", 512, 1_000_000),
      maxTokens: bounded("--max-tokens", 128, 1_000_000),
      limit: bounded("--limit", 1, 64),
      write: parsed.flags.has("--write")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "panel") {
    let currentOnly = false;
    let limit;
    const query = [];
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (value === "--current-only") {
        if (currentOnly) throw new TypeError("panel received --current-only more than once.");
        currentOnly = true;
        continue;
      }
      if (value === "--limit") {
        if (limit !== undefined) throw new TypeError("panel received --limit more than once.");
        const selected = args[index + 1];
        if (!selected || !/^[0-9]+$/u.test(selected) || Number(selected) < 1 || Number(selected) > 100) {
          throw new TypeError("--limit must be an integer from 1 to 100.");
        }
        limit = Number(selected);
        index += 1;
        continue;
      }
      if (value.startsWith("--")) throw new TypeError(`panel does not support ${value}.`);
      query.push(value);
    }
    process.stdout.write(`${JSON.stringify(await buildDeveloperMemoryView({
      cwd: process.cwd(),
      query: query.join(" ") || undefined,
      includeWorktrees: !currentOnly,
      limit
    }), null, 2)}\n`);
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
          asOf: option(args, "--as-of", undefined),
          minimumCoverage: option(args, "--minimum-coverage", "any"),
          minimumEvidence: option(args, "--minimum-evidence", "any"),
          rankingProfile: option(args, "--ranking-profile", "admission-first-v2"),
          temporalBoundary: option(args, "--temporal-boundary", "inclusive")
        }
      : stdinQueryInput(request);
    const pack = await compileContext(input.query, {
      cwd: process.cwd(),
      limit: input.limit,
      maxChars: input.maxChars,
      maxTokens: input.maxTokens,
      reserveTokens: input.reserveTokens,
      asOf: input.asOf,
      minimumCoverage: input.minimumCoverage,
      minimumEvidence: input.minimumEvidence,
      rankingProfile: input.rankingProfile,
      temporalBoundary: input.temporalBoundary,
      includeEvidenceSufficiency: input.includeEvidenceSufficiency,
      authorityScopes: input.authorityScopes,
      repositoryIds: input.repositoryIds
    });
    await recordActivationEvent("first_retrieval", { cwd: process.cwd() });
    const format = input.format;
    if (format === "json") process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
    else if (format === "markdown") process.stdout.write(renderContextPackMarkdown(pack));
    else if (format === "handoff") {
      const events = await readEvents(process.cwd());
      await recordActivationEvent("first_cross_session_handoff", { cwd: process.cwd() });
      process.stdout.write(createContextHandoffCapsule(pack, events).text);
    } else throw new TypeError("--format must be json, markdown, or handoff.");
    return;
  }
  if (command === "task-pack") {
    const values = positionals(args);
    const task = values[0];
    if (!task) throw new TypeError("task-pack requires a task name.");
    if (args.some((value) => value.startsWith("--"))) throw new TypeError("task-pack accepts a task name and optional query text only.");
    const pack = await compileTaskMemoryPack(task, values.slice(1).join(" "), { cwd: process.cwd() });
    process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
    return;
  }
  if (command === "harness") {
    const flags = new Set(["--worktrees", "--record", "--no-rebuild", "--quiet"]);
    const values = new Set(["--format", "--max-chars", "--max-tokens", "--reserve-tokens", "--limit", "--max-summary-chars"]);
    const parsed = { positionals: [], flags: new Set(), values: new Map() };
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (!value.startsWith("--")) {
        parsed.positionals.push(value);
        continue;
      }
      if (flags.has(value)) {
        if (parsed.flags.has(value)) throw new TypeError(`harness received ${value} more than once.`);
        parsed.flags.add(value);
        continue;
      }
      if (!values.has(value)) throw new TypeError(`harness does not support ${value}.`);
      if (parsed.values.has(value)) throw new TypeError(`harness received ${value} more than once.`);
      if (index === args.length - 1 || args[index + 1].startsWith("--")) throw new TypeError(`${value} requires a value.`);
      parsed.values.set(value, args[index + 1]);
      index += 1;
    }
    const boundedInteger = (name, minimum, maximum) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/u.test(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
      }
      return Number(value);
    };
    const format = parsed.values.get("--format") ?? "json";
    if (!["json", "markdown"].includes(format)) throw new TypeError("--format must be json or markdown.");
    const result = await runCodingContextHarness({
      cwd: process.cwd(),
      query: parsed.positionals.join(" "),
      scope: parsed.flags.has("--worktrees") ? "repository" : "current",
      record: parsed.flags.has("--record"),
      rebuild: !parsed.flags.has("--no-rebuild"),
      maxChars: boundedInteger("--max-chars", 512, 1_000_000),
      maxTokens: boundedInteger("--max-tokens", 128, 1_000_000),
      reserveTokens: boundedInteger("--reserve-tokens", 0, 999_936),
      limit: boundedInteger("--limit", 1, 64),
      maxSummaryChars: boundedInteger("--max-summary-chars", 256, 16_384)
    });
    if (!parsed.flags.has("--quiet")) {
      process.stdout.write(format === "markdown"
        ? renderCodingContextHarnessMarkdown(result)
        : `${JSON.stringify(result, null, 2)}\n`);
    }
    return;
  }
  if (command === "map") {
    const parsed = strictValueOptions(args, "map", ["--limit", "--type", "--repository", "--scope", "--as-of"]);
    const limitText = parsed.values.get("--limit");
    if (limitText !== undefined && (!/^[0-9]+$/u.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100)) {
      throw new TypeError("--limit must be an integer from 1 to 100.");
    }
    const typeText = parsed.values.get("--type");
    const types = typeText === undefined ? undefined : typeText.split(",").map((value) => value.trim()).filter(Boolean);
    const selectors = (name) => parsed.values.has(name)
      ? parsed.values.get(name).split(",").map((value) => value.trim()).filter(Boolean)
      : undefined;
    const result = await queryLinkedProjectMemory(parsed.positionals.join(" "), {
      cwd: process.cwd(),
      limit: limitText === undefined ? undefined : Number(limitText),
      types,
      repositoryIds: selectors("--repository"),
      authorityScopes: selectors("--scope"),
      asOf: parsed.values.get("--as-of")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "freshness") {
    if (args.length !== 0) throw new TypeError("freshness accepts no arguments.");
    process.stdout.write(`${JSON.stringify(await inspectMemoryFreshness({ cwd: process.cwd() }), null, 2)}\n`);
    return;
  }
  if (command === "worktrees") {
    if (args.length !== 0) throw new TypeError("worktrees accepts no arguments.");
    const worktrees = await listGitWorktrees(process.cwd());
    process.stdout.write(`${JSON.stringify({
      ok: true,
      repositoryId: worktrees[0]?.repositoryId ?? null,
      currentWorktreeId: worktrees.find((entry) => entry.current)?.worktreeId ?? null,
      worktrees
    }, null, 2)}\n`);
    return;
  }
  if (command === "dashboard") {
    const parsed = dashboardOptions(args);
    const usage = (name) => {
      const value = parsed.values.get(name);
      if (value === undefined) return undefined;
      if (!/^[0-9]+$/.test(value)) throw new TypeError(`${name} must be a non-negative integer.`);
      return Number(value);
    };
    if (parsed.serve) {
      if (parsed.values.has("--output") || parsed.values.has("--baseline-tokens") || parsed.values.has("--delivered-tokens")) {
        throw new TypeError("dashboard --serve cannot be combined with snapshot output or caller-supplied token measurements.");
      }
      const portText = parsed.values.get("--port") ?? "8777";
      if (!/^[0-9]+$/.test(portText)) throw new TypeError("--port must be an integer from 1024 to 65535.");
      const port = Number(portText);
      if (port < 1024 || port > 65_535) throw new TypeError("--port must be an integer from 1024 to 65535.");
      const live = await serveMemoryDashboard({
        cwd: process.cwd(), workspaces: parsed.projects, includeWorktrees: parsed.worktrees, port
      });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        live: true,
        url: live.url,
        projects: live.projects
      }, null, 2)}\n`);
      const close = () => { void live.close().finally(() => process.exit(0)); };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
      return;
    }
    if (parsed.values.has("--port") || parsed.projects.length > 0 || parsed.worktrees) {
      throw new TypeError("--port, --project, and --worktrees require dashboard --serve.");
    }
    const result = await writeMemoryDashboard({
      cwd: process.cwd(),
      output: parsed.values.get("--output"),
      baselineTokens: usage("--baseline-tokens"),
      deliveredTokens: usage("--delivered-tokens")
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output: result.output,
      totals: result.data.totals,
      contextSavings: result.data.contextSavings
    }, null, 2)}\n`);
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
