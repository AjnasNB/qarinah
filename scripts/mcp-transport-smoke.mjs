import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendEvent, initializeWorkspace, rebuildDerivedState } from "../src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const timeoutMs = 10_000;

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function substitute(value, variables) {
  return value.replace(/\$\{([^}]+)\}/g, (match, name) => variables[name] ?? match);
}

async function loadHost(name, pluginRoot) {
  const definition = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8")).mcpServers.context;
  const variables = {
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    "user_config.node_path": process.execPath
  };
  return {
    name,
    command: substitute(definition.command, variables),
    args: definition.args.map((argument) => substitute(argument, variables)),
    cwd: definition.cwd ? path.resolve(pluginRoot, definition.cwd) : pluginRoot
  };
}

async function probe(host, workspaceRoot, stateRoot) {
  const child = spawn(host.command, host.args, {
    cwd: host.cwd,
    env: { ...process.env, QARINAH_STATE_DIR: stateRoot },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stderr = "";
  let stdoutBuffer = "";
  let sequence = 0;
  const pending = new Map();
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function receive(message) {
    if (message?.method === "roots/list" && Object.hasOwn(message, "id")) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { roots: [{ uri: pathToFileURL(workspaceRoot).href, name: "MCP smoke workspace" }] }
      });
      return;
    }
    if (!Object.hasOwn(message, "id")) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "MCP request failed."));
    else waiter.resolve(message.result);
  }

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline === -1) break;
      const frame = stdoutBuffer.slice(0, newline).trimEnd();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (frame.length > 0) receive(JSON.parse(frame));
    }
  });

  function request(method, params = undefined) {
    const id = ++sequence;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    return withTimeout(response, `${host.name} ${method}`);
  }

  try {
    const initialized = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "qarinah-transport-smoke", version: packageJson.version }
    });
    assert.equal(initialized.protocolVersion, "2025-06-18");
    assert.equal(initialized.serverInfo.name, "qarinah-context");
    assert.equal(initialized.serverInfo.version, packageJson.version);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    const listed = await request("tools/list", {});
    assert.deepEqual(listed.tools.map((tool) => tool.name), ["context_status", "context_doctor"]);
    for (const tool of listed.tools) {
      assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }

    const status = await request("tools/call", { name: "context_status", arguments: {} });
    assert.equal(status.isError, undefined);
    assert.equal(status.structuredContent.enabled, true);
    assert.equal(status.structuredContent.eventCount, 1);

    const doctor = await request("tools/call", { name: "context_doctor", arguments: {} });
    assert.equal(doctor.isError, undefined);
    assert.equal(doctor.structuredContent.ok, true);
    assert.equal(doctor.structuredContent.derived, "current");
    assert.equal(child.exitCode, null, `${host.name} MCP process exited before the client closed stdin.`);
  } finally {
    child.stdin.end();
  }

  const exit = await withTimeout(new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal }))), `${host.name} shutdown`);
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  assert.equal(stderr, "", `${host.name} wrote unexpected stderr output.`);
  return { host: host.name, server: "qarinah-context", version: packageJson.version, tools: 2 };
}

const sandbox = await mkdtemp(path.join(os.tmpdir(), "qarinah-mcp-smoke-"));
const workspaceRoot = path.join(sandbox, "workspace");
const stateRoot = path.join(sandbox, "state");
const previousStateRoot = process.env.QARINAH_STATE_DIR;

try {
  process.env.QARINAH_STATE_DIR = stateRoot;
  const workspace = await initializeWorkspace(workspaceRoot);
  await appendEvent({
    kind: "decision",
    title: "Verify packaged MCP transport",
    body: "Both packaged hosts must initialize, negotiate roots, list tools, and read the same trusted ledger.",
    confidence: "verified"
  }, { workspace });
  await rebuildDerivedState(workspaceRoot);

  const hosts = await Promise.all([
    loadHost("codex", path.join(repositoryRoot, "integrations", "codex", "qarinah")),
    loadHost("claude", path.join(repositoryRoot, "integrations", "claude", "qarinah"))
  ]);
  const results = [];
  for (const host of hosts) results.push(await probe(host, workspaceRoot, stateRoot));
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} finally {
  if (previousStateRoot === undefined) delete process.env.QARINAH_STATE_DIR;
  else process.env.QARINAH_STATE_DIR = previousStateRoot;
  await rm(sandbox, { recursive: true, force: true });
}
