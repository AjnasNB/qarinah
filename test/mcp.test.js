import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { appendEvent, createMcpServer, initializeWorkspace, rebuildDerivedState, runMcpServer } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

function eventInput() {
  return {
    kind: "decision",
    title: "Govern browser writes",
    body: "Every form submission requires exact approval.",
    confidence: "claimed"
  };
}

function response(messages, id) {
  return messages.find((message) => message.id === id && !message.method);
}

function stateRoot() {
  if (process.env.QARINAH_STATE_DIR) return path.resolve(process.env.QARINAH_STATE_DIR);
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Qarinah");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Qarinah");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "qarinah");
}

function trustPath(root) {
  const normalized = process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
  const digest = createHash("sha256").update(normalized).digest("hex");
  return path.join(stateRoot(), "trusted-workspaces", `${digest}.json`);
}

async function rewindTrustCheckpoint(root) {
  const target = trustPath(root);
  const trust = JSON.parse(await readFile(target, "utf8"));
  trust.checkpoint = {
    eventCount: 0,
    headHash: null,
    logBytes: 0,
    updatedAt: new Date(0).toISOString()
  };
  await writeFile(target, `${JSON.stringify(trust, null, 2)}\n`, "utf8");
  return target;
}

async function snapshotFile(target) {
  const metadata = await stat(target, { bigint: true });
  return {
    bytes: (await readFile(target)).toString("base64"),
    mtimeNs: metadata.mtimeNs.toString(),
    size: metadata.size.toString()
  };
}

async function snapshotTree(root) {
  const result = Object.create(null);
  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const key = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
      if (entry.isDirectory()) await visit(absolute, key);
      else result[key] = await snapshotFile(absolute);
    }
  }
  await visit(root);
  return result;
}

async function initialize(server, messages, capabilities = {}) {
  await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities, clientInfo: { name: "test", version: "1" } }
  });
  assert.equal(response(messages, 1).result.protocolVersion, "2025-06-18");
  await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
}

test("MCP exposes only accurately annotated zero-write diagnostic tools", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  const messages = [];
  const server = createMcpServer({ cwd: root, write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = response(messages, 2).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), ["context_status", "context_doctor"]);
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  }
  await server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "context_query", arguments: { query: "browser approval", maxChars: 4000, limit: 5 } }
  });
  const result = response(messages, 3).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "MCP_TOOL_NOT_FOUND");
  assert.equal(JSON.stringify(result).includes("Govern browser writes"), false);
  server.close();
});

test("MCP status and doctor do not advance trust or mutate workspace state", async (t) => {
  const sandbox = await temporaryDirectory(t);
  const root = path.join(sandbox, "private-client-Alice-workspace");
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  await unlink(path.join(root, ".qarinah", "index", "index.json"));
  const trust = await rewindTrustCheckpoint(root);
  const beforeWorkspace = await snapshotTree(path.join(root, ".qarinah"));
  const beforeTrust = await snapshotFile(trust);
  const messages = [];
  const server = createMcpServer({ cwd: root, write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "context_status", arguments: {} } });
  await server.handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "context_doctor", arguments: {} } });
  assert.equal(response(messages, 4).result.structuredContent.eventCount, 1);
  assert.equal(response(messages, 5).result.structuredContent.ok, false);
  assert.equal(response(messages, 5).result.structuredContent.derived, "missing");
  assert.deepEqual(await snapshotTree(path.join(root, ".qarinah")), beforeWorkspace);
  assert.deepEqual(await snapshotFile(trust), beforeTrust);
  const output = JSON.stringify(messages);
  assert.equal(output.includes(root), false);
  assert.equal(output.includes("private-client-Alice-workspace"), false);
  server.close();
});

test("MCP resolves the active workspace through negotiated roots", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  const messages = [];
  const server = createMcpServer({ write: (message) => messages.push(message) });
  await initialize(server, messages, { roots: { listChanged: true } });
  const call = server.handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "context_status", arguments: {} } });
  await new Promise((resolve) => setImmediate(resolve));
  const rootsRequest = messages.find((message) => message.method === "roots/list");
  assert.ok(rootsRequest);
  await server.handle({
    jsonrpc: "2.0",
    id: rootsRequest.id,
    result: { roots: [{ uri: pathToFileURL(root).href, name: "test workspace" }] }
  });
  await call;
  assert.equal(response(messages, 5).result.structuredContent.workspaceId, workspace.config.workspaceId);
  server.close();
});

test("MCP failures return stable path-free messages", async (t) => {
  const sandbox = await temporaryDirectory(t);
  const privatePath = path.join(sandbox, "private-client-Bob-uninitialized");
  const messages = [];
  const server = createMcpServer({ cwd: privatePath, write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "context_status", arguments: {} } });
  const result = response(messages, 6).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "WORKSPACE_NOT_INITIALIZED");
  assert.equal(JSON.stringify(result).includes(privatePath), false);
  assert.equal(JSON.stringify(result).includes("private-client-Bob-uninitialized"), false);
  server.close();
});

test("stdio transport rejects oversized frames without buffering them into tool calls", async () => {
  const oversized = `${JSON.stringify({ jsonrpc: "2.0", id: 99, method: "oversized", pad: "x".repeat(2048) })}\n`;
  const initializeFrame = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  })}\n`;
  const listFrame = `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`;
  const messages = [];
  await runMcpServer({
    input: Readable.from([Buffer.from(oversized), Buffer.from(`${initializeFrame}${listFrame}`)]),
    maximumFrameBytes: 1024,
    write: (message) => messages.push(message)
  });
  assert.equal(messages.filter((message) => message.error?.code === -32700).length, 1);
  assert.match(messages.find((message) => message.error?.code === -32700).error.message, /1024-byte limit/);
  assert.equal(response(messages, 1).result.protocolVersion, "2025-06-18");
  assert.deepEqual(response(messages, 2).result.tools.map((tool) => tool.name), ["context_status", "context_doctor"]);
  assert.equal(JSON.stringify(messages).includes("x".repeat(64)), false);
});
