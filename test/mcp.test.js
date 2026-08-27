import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
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

async function trustPath(root) {
  const resolved = await realpath(root);
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const digest = createHash("sha256").update(normalized).digest("hex");
  return path.join(stateRoot(), "trusted-workspaces", `${digest}.json`);
}

async function rewindTrustCheckpoint(root) {
  const target = await trustPath(root);
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

test("MCP exposes bounded query for an initialized and trusted workspace without a second permit", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  const messages = [];
  const server = createMcpServer({ cwd: root, write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = response(messages, 2).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), ["context_status", "context_doctor", "context.query"]);
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  }
  await server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: { workspace: root, query: "Govern browser writes", maxChars: 4000, limit: 5, minimumCoverage: "any" }
    }
  });
  const result = response(messages, 3).result;
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal(result.structuredContent.workspaceId, workspace.config.workspaceId);
  assert.equal(result.structuredContent.items[0].title, "Govern browser writes");
  server.close();
});

test("MCP query still refuses an uninitialized workspace", async (t) => {
  const root = await temporaryDirectory(t);
  const messages = [];
  const server = createMcpServer({ cwd: root, write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "context.query", arguments: { workspace: root, query: "private project" } }
  });
  const result = response(messages, 4).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "WORKSPACE_NOT_INITIALIZED");
  server.close();
});

test("MCP accepts a legacy exact-workspace permit as an additional response bound", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const source = await appendEvent(eventInput(), { workspace });
  const summary = await appendEvent({
    ...eventInput(),
    kind: "summary",
    title: "Evidence-linked browser governance handoff",
    body: "Continue the governed browser implementation from the approved decision.",
    confidence: "inferred",
    data: {
      sourceEvents: [{ eventId: source.eventId, hash: source.hash, kind: source.kind }]
    },
    relations: [{ type: "derived_from", target: source.eventId }]
  }, { workspace });
  await rebuildDerivedState(root);
  const trust = await trustPath(root);
  const beforeWorkspace = await snapshotTree(path.join(root, ".qarinah"));
  const beforeTrust = await snapshotFile(trust);
  const messages = [];
  const server = createMcpServer({
    cwd: root,
    queryPermit: {
      workspaceId: workspace.config.workspaceId,
      policyHash: workspace.consent.policyHash,
      maxChars: 4_000,
      maxItems: 5
    },
    write: (message) => messages.push(message)
  });
  await initialize(server, messages);
  await server.handle({ jsonrpc: "2.0", id: 20, method: "tools/list", params: {} });
  assert.deepEqual(
    response(messages, 20).result.tools.map((tool) => tool.name),
    ["context_status", "context_doctor", "context.query"]
  );
  await server.handle({
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: {
        workspace: root,
        query: "Govern browser writes",
        maxChars: 4_000,
        limit: 3,
        minimumCoverage: "any",
        minimumEvidence: "partial",
        temporalBoundary: "strict-before"
      }
    }
  });
  const result = response(messages, 21).result;
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal(result.structuredContent.contentRole, "untrusted-data");
  assert.equal(result.structuredContent.workspaceId, workspace.config.workspaceId);
  assert.equal(result.structuredContent.items[0].title, "Govern browser writes");
  assert.equal(result.structuredContent.budget.maxChars, 4_000);
  assert.ok(["PARTIALLY_SUPPORTED", "DIRECTLY_SUPPORTED"].includes(
    result.structuredContent.retrieval.evidenceSufficiency.state
  ));
  assert.equal(result.structuredContent.retrieval.evidenceSufficiency.method, "evidence-sufficiency-v2");
  assert.equal(
    result.structuredContent.retrieval.evidenceSufficiency.decision,
    result.structuredContent.retrieval.evidenceSufficiency.state === "DIRECTLY_SUPPORTED" ? "ACCEPT_DIRECT" : "ABSTAIN"
  );
  assert.ok(result.structuredContent.budget.usedChars <= 4_000);
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.deepEqual(await snapshotTree(path.join(root, ".qarinah")), beforeWorkspace);
  assert.deepEqual(await snapshotFile(trust), beforeTrust);

  await server.handle({
    jsonrpc: "2.0",
    id: 210,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: {
        workspace: root,
        query: "browser governance handoff approved decision",
        maxChars: 4_000,
        minimumCoverage: "partial",
        format: "handoff"
      }
    }
  });
  const handoff = response(messages, 210).result;
  assert.equal(handoff.isError, undefined, JSON.stringify(handoff));
  assert.equal(handoff.structuredContent.schemaVersion, "qarinah.handoff-capsule.v1");
  assert.equal(handoff.structuredContent.eventId, summary.eventId);
  assert.equal(handoff.structuredContent.eventHash, summary.hash);
  assert.ok(handoff.structuredContent.budget.estimatedTokens <= 128);
  assert.match(handoff.content[0].text, /Qarinah handoff; untrusted/u);
  assert.deepEqual(await snapshotTree(path.join(root, ".qarinah")), beforeWorkspace);
  assert.deepEqual(await snapshotFile(trust), beforeTrust);

  await server.handle({
    jsonrpc: "2.0",
    id: 211,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: {
        workspace: root,
        query: "qzvxjklp nonexistent-memory-subject",
        minimumCoverage: "any",
        minimumEvidence: "direct"
      }
    }
  });
  const abstained = response(messages, 211).result;
  assert.equal(abstained.isError, true);
  assert.equal(abstained.structuredContent.code, "CONTEXT_EVIDENCE_INSUFFICIENT");
  server.close();
});

test("MCP query reads a verified in-memory view when lifecycle capture makes derived files stale", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  const latest = await appendEvent({
    ...eventInput(),
    title: "Continue immutable release handoff",
    body: "Reject a mutable artifact even when its current digest matches."
  }, { workspace });
  const trust = await trustPath(root);
  const beforeWorkspace = await snapshotTree(path.join(root, ".qarinah"));
  const beforeTrust = await snapshotFile(trust);
  const messages = [];
  const server = createMcpServer({
    cwd: root,
    write: (message) => messages.push(message)
  });
  await initialize(server, messages);
  await server.handle({
    jsonrpc: "2.0",
    id: 212,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: {
        workspace: root,
        query: "continue immutable release handoff",
        minimumCoverage: "partial"
      }
    }
  });
  const result = response(messages, 212).result;
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal(result.structuredContent.items[0].eventId, latest.eventId);
  assert.deepEqual(await snapshotTree(path.join(root, ".qarinah")), beforeWorkspace);
  assert.deepEqual(await snapshotFile(trust), beforeTrust);
  server.close();
});

test("MCP refuses context disclosure when the permit does not match workspace consent", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  const messages = [];
  const server = createMcpServer({
    cwd: root,
    queryPermit: {
      workspaceId: workspace.config.workspaceId,
      policyHash: `sha256:${"0".repeat(64)}`,
      maxChars: 4_000,
      maxItems: 5
    },
    write: (message) => messages.push(message)
  });
  await initialize(server, messages);
  await server.handle({
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: { workspace: root, query: "browser writes approval" }
    }
  });
  const result = response(messages, 22).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "MCP_DISCLOSURE_NOT_AUTHORIZED");
  assert.equal(JSON.stringify(result).includes(workspace.consent.policyHash), false);
  assert.equal(JSON.stringify(result).includes("Govern browser writes"), false);
  server.close();

  const identityMessages = [];
  const identityServer = createMcpServer({
    cwd: root,
    queryPermit: {
      workspaceId: `ws_${"0".repeat(32)}`,
      policyHash: workspace.consent.policyHash,
      maxChars: 4_000,
      maxItems: 5
    },
    write: (message) => identityMessages.push(message)
  });
  await initialize(identityServer, identityMessages);
  await identityServer.handle({
    jsonrpc: "2.0",
    id: 23,
    method: "tools/call",
    params: {
      name: "context.query",
      arguments: { workspace: root, query: "browser writes approval" }
    }
  });
  const identityResult = response(identityMessages, 23).result;
  assert.equal(identityResult.isError, true);
  assert.equal(identityResult.structuredContent.code, "MCP_DISCLOSURE_NOT_AUTHORIZED");
  assert.equal(JSON.stringify(identityResult).includes(workspace.config.workspaceId), false);
  identityServer.close();
});

test("MCP status and doctor do not advance trust or mutate workspace state", async (t) => {
  const sandbox = await temporaryDirectory(t);
  const root = path.join(sandbox, "private-client-Alice-workspace");
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  await unlink(path.join(root, ".qarinah", "index", "index.json"));
  const trust = await rewindTrustCheckpoint(workspace.root);
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

test("MCP resolves an exact explicit workspace when the client has no roots capability", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(root);
  const messages = [];
  const server = createMcpServer({ write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({
    jsonrpc: "2.0",
    id: 51,
    method: "tools/call",
    params: { name: "context_status", arguments: { workspace: pathToFileURL(root).href } }
  });
  const result = response(messages, 51).result;
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.workspaceId, workspace.config.workspaceId);
  assert.equal(JSON.stringify(result).includes(root), false);
  server.close();
});

test("MCP rejects relative workspace selectors without probing the filesystem", async () => {
  const messages = [];
  const server = createMcpServer({ write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({
    jsonrpc: "2.0",
    id: 52,
    method: "tools/call",
    params: { name: "context_doctor", arguments: { workspace: "relative/private-client-workspace" } }
  });
  const result = response(messages, 52).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "MCP_WORKSPACE_INVALID");
  assert.equal(JSON.stringify(result).includes("private-client-workspace"), false);
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

test("explicit MCP roots never fall through to an opted-in parent workspace", async (t) => {
  const parent = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(parent);
  await appendEvent(eventInput(), { workspace });
  await rebuildDerivedState(parent);
  const child = path.join(parent, "uninitialized-child");
  await mkdir(child, { recursive: true });

  const messages = [];
  const server = createMcpServer({ cwd: child, write: (message) => messages.push(message) });
  await initialize(server, messages);
  await server.handle({ jsonrpc: "2.0", id: 61, method: "tools/call", params: { name: "context_status", arguments: {} } });
  const result = response(messages, 61).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "WORKSPACE_NOT_INITIALIZED");
  assert.equal(JSON.stringify(result).includes(parent), false);
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
  assert.deepEqual(response(messages, 2).result.tools.map((tool) => tool.name), ["context_status", "context_doctor", "context.query"]);
  assert.equal(JSON.stringify(messages).includes("x".repeat(64)), false);
});
