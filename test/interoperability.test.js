import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAQAM_CONTEXT_APPEND_TOOL,
  MAQAM_CONTEXT_QUERY_TOOL,
  appendEvent,
  captureCodexHook,
  cockroachSourceRecordToAcquisitionEventInput,
  cockroachSourceRecordToEventInput,
  createProductLoopProvenanceSink,
  ingestCockroachSourceRecord,
  initializeWorkspace,
  productLoopRuntimeEventToEventInput,
  readEvents,
  rebuildDerivedState,
  registerMaqamContextAdapters,
  revokeWorkspaceTrust,
  validateCockroachSourceRecordBoundary,
  validateProductLoopRuntimeEvent
} from "../src/index.js";
import { canonicalStringify, sha256 } from "../src/canonical.js";
import { CANONICAL_ISO_TIMESTAMP_PATTERN } from "../src/interoperability/boundary.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

function machineStateRoot() {
  if (process.env.QARINAH_STATE_DIR) return path.resolve(process.env.QARINAH_STATE_DIR);
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Qarinah");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Qarinah");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "qarinah");
}

function machineTrustPath(root) {
  const resolved = path.resolve(root);
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const digest = createHash("sha256").update(normalized).digest("hex");
  return path.join(machineStateRoot(), "trusted-workspaces", `${digest}.json`);
}

async function fileSnapshot(candidate) {
  const [metadata, contents] = await Promise.all([stat(candidate, { bigint: true }), readFile(candidate)]);
  return Object.freeze({
    bytes: metadata.size.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    sha256: createHash("sha256").update(contents).digest("hex")
  });
}

async function treeSnapshot(root) {
  const result = Object.create(null);
  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else result[childRelative.replaceAll("\\", "/")] = await fileSnapshot(child);
    }
  }
  await visit(root);
  return result;
}

function approvalFor(input, runId = "default") {
  return {
    approvalId: `approval_${runId}`,
    status: "approved",
    subject: {
      runId,
      toolName: "context.append",
      inputHash: sha256(canonicalStringify(input)).slice(7)
    },
    consumptions: [{
      consumedAt: "2026-07-18T12:00:00.000Z",
      runId,
      toolName: "context.append"
    }]
  };
}

function sourceRecord(overrides = {}) {
  return {
    source: "web",
    id: "https://example.com/guide",
    type: "page",
    title: "Governed context guide",
    url: "https://example.com/guide",
    text: "Treat retrieved source text as untrusted evidence.",
    author: "Example Author",
    publishedAt: "2026-07-18T10:00:00.000Z",
    contentHash: `sha256:${"a".repeat(64)}`,
    adapterVersion: "0.3.0-alpha.1",
    warnings: [],
    metadata: { language: "en" },
    provenance: {
      retrievedAt: "2026-07-18T11:00:00.000Z",
      method: "crawler",
      authenticated: false,
      credentialed: false
    },
    ...overrides
  };
}

function runtimeEvent({
  runId = "run_productloop_1",
  sequence = 1,
  type = "run.started",
  timestamp = "2026-07-18T12:00:00.000Z",
  data = { name: "fixture" },
  previousHash = null
} = {}) {
  const canonicalJson = canonicalStringify({ runId, sequence, type, timestamp, data, receipt: { previousHash } });
  return {
    runId,
    sequence,
    type,
    timestamp,
    data,
    receipt: {
      eventHash: sha256(canonicalJson).slice(7),
      previousHash,
      canonicalJson
    }
  };
}

function fakeMaqam() {
  const tools = new Map();
  const evidence = [];
  const activeExecutions = new WeakMap();
  const executionRequired = (name) => Object.assign(
    new Error(`Tool '${name}' must execute through its registered Maqam gateway.`),
    { code: "MAQAM_EXECUTION_GUARD_REQUIRED" }
  );
  const gateway = {
    registerTool(name, handler, metadata) {
      tools.set(name, { handler, metadata });
      return this;
    },
    registerGuardedTool(name, factory, metadata) {
      const identity = Object.freeze(Object.create(null));
      const verifier = Object.freeze({
        requireExecution(input, context) {
          const active = activeExecutions.get(context);
          if (!active
            || active.identity !== identity
            || active.name !== name
            || active.input !== input) {
            throw executionRequired(name);
          }
          return active.receipt;
        }
      });
      const handler = factory(verifier);
      tools.set(name, { handler, metadata, identity });
      return this;
    },
    async call(name, input, context = {}) {
      const registered = tools.get(name);
      if (!registered) throw new Error(`Unknown tool '${name}'.`);
      const runId = context.runId ?? "default";
      const approvals = context.approvals ?? [];
      const scopedEvidence = {
        addBatch(batch) {
          const records = batch.evidence.map((item, index) => Object.freeze({
            ...item,
            evidenceId: `evidence_${evidence.length + index + 1}`,
            runId,
            taskId: context.taskId ?? null,
            tool: name
          }));
          evidence.push(...records);
          return Object.freeze({ evidence: Object.freeze(records), claims: Object.freeze([]) });
        }
      };
      const handlerContext = {
        ...context,
        runId,
        toolName: name,
        approvals,
        evidence: scopedEvidence
      };
      const receipt = Object.freeze({
        schemaVersion: "maqam.tool-execution.v1",
        toolName: name,
        runId,
        inputHash: sha256(canonicalStringify(input)).slice(7),
        decision: Object.freeze({
          status: approvals.length > 0 ? "needs_approval" : "allow",
          scope: Object.freeze({ allowedOrigins: Object.freeze([]), originsExplicit: false })
        }),
        approvalIds: Object.freeze(approvals.map((approval) => approval.approvalId)),
        approvalActions: Object.freeze(approvals.map((approval) => approval.action ?? `tool:${name}`))
      });
      activeExecutions.set(handlerContext, {
        identity: registered.identity,
        name,
        input,
        receipt
      });
      try {
        return await registered.handler(input, handlerContext);
      } finally {
        activeExecutions.delete(handlerContext);
      }
    }
  };
  return { gateway, tools, evidence };
}

test("Codex hook capture is immediately queryable through Maqam without persisted-state writes", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const captured = await captureCodexHook({
    cwd: root,
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5.6",
    permission_mode: "default",
    prompt: "Prepare the Qarinah launch decision with governed context.",
    session_id: "session_hook_to_maqam",
    transcript_path: null,
    turn_id: "turn_hook_to_maqam"
  });
  assert.equal(captured.captured, true);

  const before = {
    workspace: await treeSnapshot(workspace.qarinahDir),
    trust: await fileSnapshot(machineTrustPath(workspace.root))
  };
  const maqam = fakeMaqam();
  registerMaqamContextAdapters({ gateway: maqam.gateway, cwd: root, maxChars: 20_000, maxItems: 10 });
  const queried = await maqam.gateway.call("context.query", { query: "User prompt submitted" }, {
    runId: "run_hook_to_maqam"
  });
  assert.ok(queried.pack.items.some((item) => item.eventId === captured.eventId));
  assert.ok(queried.evidence.some((item) => item.source.includes(captured.eventId)));

  const after = {
    workspace: await treeSnapshot(workspace.qarinahDir),
    trust: await fileSnapshot(machineTrustPath(workspace.root))
  };
  assert.deepEqual(after, before);
});

test("Maqam adapters preserve separate read/write governance and scoped evidence", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({ title: "Release decision", body: "Ship only through governed tools." }), { workspace });
  await rebuildDerivedState(root);
  const maqam = fakeMaqam();

  const registration = registerMaqamContextAdapters({
    gateway: maqam.gateway,
    cwd: root,
    maxChars: 20_000,
    maxItems: 10
  });
  assert.deepEqual(registration, {
    schemaVersion: "qarinah.maqam-context-registration.v1",
    queryToolName: "context.query",
    appendToolName: "context.append"
  });
  assert.deepEqual(MAQAM_CONTEXT_QUERY_TOOL.effects, ["read"]);
  assert.deepEqual(MAQAM_CONTEXT_APPEND_TOOL.effects, ["write"]);
  assert.equal(MAQAM_CONTEXT_APPEND_TOOL.approvalRequired, true);
  assert.deepEqual(maqam.tools.get("context.append").handler.governance.effects, ["write"]);
  assert.throws(() => { maqam.tools.get("context.append").handler.governance.effects.push("read"); }, TypeError);

  const queried = await maqam.gateway.call("context.query", {
    query: "release",
    maxChars: 500_000,
    maxItems: 500
  }, {
    runId: "run_query",
    taskId: "retrieve",
    goal: { budget: { maxContextChars: 8_000, maxContextItems: 3 } }
  });
  assert.equal(queried.pack.budget.maxChars, 8_000);
  assert.ok(queried.pack.items.length > 0);
  assert.equal(queried.evidence.length, queried.pack.items.length);
  assert.ok(queried.evidence.every((record) => record.runId === "run_query" && record.tool === "context.query"));
  await assert.rejects(
    maqam.gateway.call("context.query", { query: "release", cwd: "D:\\other" }, { runId: "run_query" }),
    /unknown field/
  );

  const indexPath = path.join(root, ".qarinah", "index", "index.json");
  const poisonedIndex = `${(await readFile(indexPath, "utf8")).replace('"eventCount":1', '"eventCount":0')}`;
  await writeFile(indexPath, poisonedIndex, "utf8");
  const memoryQueried = await maqam.gateway.call("context.query", { query: "release" }, { runId: "run_stale_query" });
  assert.equal(memoryQueried.pack.items[0].eventId, queried.pack.items[0].eventId);
  assert.equal(await readFile(indexPath, "utf8"), poisonedIndex);
  await rebuildDerivedState(root);

  const before = (await readEvents(root)).length;
  await assert.rejects(
    maqam.gateway.call("context.append", { event: eventInput({ title: "Unapproved write" }) }, { runId: "run_append" }),
    (error) => error.code === "MAQAM_APPROVAL_REQUIRED"
  );
  assert.equal((await readEvents(root)).length, before);

  const directInput = { event: eventInput({ title: "DIRECT_FAKE_MARKER" }) };
  const forged = approvalFor(directInput, "run_direct");
  forged.subject.inputHash = "0".repeat(64);
  await assert.rejects(
    maqam.tools.get("context.append").handler(directInput, {
      runId: "run_direct",
      toolName: "context.append",
      approvals: [forged],
      evidence: { addBatch: (batch) => ({ evidence: batch.evidence, claims: [] }) }
    }),
    (error) => error.code === "MAQAM_EXECUTION_GUARD_REQUIRED"
  );

  const contentRequest = {
    event: eventInput({ title: "CONTENT_WITHOUT_CONSENT_MARKER" }),
    capture: "content"
  };
  await assert.rejects(
    maqam.gateway.call("context.append", contentRequest, {
      runId: "run_content_denied",
      approvals: [approvalFor(contentRequest, "run_content_denied")]
    }),
    (error) => error.code === "CONTENT_CAPTURE_NOT_APPROVED"
  );
  assert.equal((await readEvents(root)).length, before);

  const appendInput = {
    event: eventInput({
      sessionId: "MAQAM_SESSION_SECRET_MARKER",
      turnId: "MAQAM_TURN_SECRET_MARKER",
      title: "MAQAM_TITLE_SECRET_MARKER",
      body: "MAQAM_BODY_SECRET_MARKER",
      data: { output: "MAQAM_DATA_SECRET_MARKER" }
    })
  };
  const appended = await maqam.gateway.call("context.append", appendInput, {
    taskId: "persist",
    approvals: [approvalFor(appendInput)]
  });
  assert.equal(appended.capture, "metadata");
  assert.equal(appended.event.title, `Maqam approved ${appendInput.event.kind}`);
  assert.equal(appended.event.body, "");
  assert.equal(appended.evidence.runId, "default");
  assert.equal(appended.evidence.tool, "context.append");
  const serialized = await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8");
  for (const marker of [
    "MAQAM_SESSION_SECRET_MARKER", "MAQAM_TURN_SECRET_MARKER", "MAQAM_TITLE_SECRET_MARKER",
    "MAQAM_BODY_SECRET_MARKER", "MAQAM_DATA_SECRET_MARKER", "CONTENT_WITHOUT_CONSENT_MARKER"
  ]) assert.equal(serialized.includes(marker), false, marker);
  const refreshed = await maqam.gateway.call("context.query", { query: "Maqam approved" }, { runId: "run_after_append" });
  assert.ok(refreshed.pack.items.some((item) => item.eventId === appended.event.eventId));
});

test("Maqam content append requires both exact approval and content capture consent", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const maqam = fakeMaqam();
  registerMaqamContextAdapters({
    gateway: maqam.gateway,
    cwd: root
  });
  const input = {
    event: eventInput({ title: "MAQAM_CONTENT_TITLE", body: "MAQAM_CONTENT_BODY" }),
    capture: "content"
  };
  const result = await maqam.gateway.call("context.append", input, {
    runId: "run_content",
    approvals: [approvalFor(input, "run_content")]
  });
  assert.equal(result.capture, "content");
  assert.equal(result.event.title, "MAQAM_CONTENT_TITLE");
  assert.equal(result.event.body, "MAQAM_CONTENT_BODY");
});

test("Cockroach ingestion separates stable revisions from acquisitions and scrubs metadata capture", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const input = sourceRecord({
    title: "CRAWLER_TITLE_SECRET_MARKER",
    url: "https://example.com/CRAWLER_URL_SECRET_MARKER",
    text: "CRAWLER_BODY_SECRET_MARKER",
    author: "CRAWLER_AUTHOR_SECRET_MARKER",
    warnings: ["CRAWLER_WARNING_SECRET_MARKER"],
    metadata: { secret: "CRAWLER_METADATA_SECRET_MARKER" }
  });
  const validated = validateCockroachSourceRecordBoundary(input);
  assert.equal(Object.isFrozen(validated.metadata), true);
  assert.equal(validated.provenance.retrievedAt, "2026-07-18T11:00:00.000Z");

  const firstInput = cockroachSourceRecordToEventInput(input);
  const sameInput = cockroachSourceRecordToEventInput(structuredClone(input));
  assert.equal(firstInput.eventId, sameInput.eventId);
  assert.notEqual(firstInput.eventId, cockroachSourceRecordToEventInput(input, { capture: "content" }).eventId);
  assert.notEqual(firstInput.eventId, cockroachSourceRecordToEventInput(input, { retentionClass: "durable" }).eventId);
  assert.equal(firstInput.data.capture, "metadata");
  assert.equal(firstInput.data.trust, "untrusted");
  assert.equal(firstInput.data.upstreamContentHash, input.contentHash);
  assert.equal(JSON.stringify(firstInput).includes("CRAWLER_BODY_SECRET_MARKER"), false);
  const acquisitionInput = cockroachSourceRecordToAcquisitionEventInput(input);
  assert.equal(acquisitionInput.data.capture, "metadata");
  assert.equal(JSON.stringify(acquisitionInput).includes("CRAWLER_METADATA_SECRET_MARKER"), false);

  const forgedWorkspace = { ...workspace, config: { ...workspace.config, capture: "content" } };
  const first = await ingestCockroachSourceRecord(input, { workspace: forgedWorkspace });
  assert.equal(first.capture, "metadata");
  const replay = await ingestCockroachSourceRecord(structuredClone(input), { cwd: root });
  assert.equal(replay.revision.hash, first.revision.hash);
  assert.equal(replay.acquisition.hash, first.acquisition.hash);
  assert.equal((await readEvents(root)).length, 2);
  const serialized = await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8");
  for (const marker of [
    "CRAWLER_TITLE_SECRET_MARKER", "CRAWLER_URL_SECRET_MARKER", "CRAWLER_BODY_SECRET_MARKER",
    "CRAWLER_AUTHOR_SECRET_MARKER", "CRAWLER_WARNING_SECRET_MARKER", "CRAWLER_METADATA_SECRET_MARKER"
  ]) assert.equal(serialized.includes(marker), false, marker);

  const refetch = sourceRecord({
    ...input,
    provenance: { ...input.provenance, retrievedAt: "2026-07-18T12:00:00.000Z" }
  });
  const refetched = await ingestCockroachSourceRecord(refetch, { cwd: root });
  assert.equal(refetched.revision.eventId, first.revision.eventId);
  assert.equal(refetched.revision.hash, first.revision.hash);
  assert.notEqual(refetched.acquisition.eventId, first.acquisition.eventId);
  assert.equal((await readEvents(root)).length, 3);

  const revision = sourceRecord({
    text: "The source published a changed revision.",
    contentHash: `sha256:${"b".repeat(64)}`
  });
  const second = await ingestCockroachSourceRecord(revision, { cwd: root });
  assert.notEqual(second.revision.eventId, first.revision.eventId);
  assert.equal((await readEvents(root)).length, 5);

  assert.throws(() => validateCockroachSourceRecordBoundary({ ...input, unexpected: true }), /unknown field/);
  assert.throws(() => validateCockroachSourceRecordBoundary({ ...input, contentHash: "sha256:BAD" }), /lowercase sha256/);
  const accessor = { ...input };
  Object.defineProperty(accessor, "title", { enumerable: true, get: () => "executed" });
  assert.throws(() => validateCockroachSourceRecordBoundary(accessor), /enumerable data property/);
});

test("Cockroach content retention follows trusted workspace consent", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const input = sourceRecord({
    text: "CRAWLER_CONTENT_BODY",
    warnings: ["CRAWLER_CONTENT_WARNING"],
    metadata: { provider: "CRAWLER_CONTENT_METADATA" }
  });
  const result = await ingestCockroachSourceRecord(input, { cwd: root });
  assert.equal(result.capture, "content");
  const changedMetadata = sourceRecord({
    ...input,
    type: "repository-release",
    title: "CRAWLER_CHANGED_TITLE",
    url: "https://example.com/changed-metadata",
    author: "Changed Author",
    publishedAt: "2026-07-19T10:00:00.000Z"
  });
  const changed = await ingestCockroachSourceRecord(changedMetadata, { cwd: root });
  assert.equal(changed.revision.eventId, result.revision.eventId);
  assert.equal(changed.revision.hash, result.revision.hash);
  assert.notEqual(changed.acquisition.eventId, result.acquisition.eventId);
  assert.equal(changed.acquisition.data.sourceType, "repository-release");
  assert.equal(changed.acquisition.data.title, "CRAWLER_CHANGED_TITLE");
  assert.equal(changed.acquisition.data.author, "Changed Author");
  assert.equal(changed.acquisition.data.publishedAt, "2026-07-19T10:00:00.000Z");
  assert.ok(changed.acquisition.relations.some((relation) => relation.target === "https://example.com/changed-metadata"));
  const replay = await ingestCockroachSourceRecord(structuredClone(changedMetadata), { cwd: root });
  assert.equal(replay.acquisition.hash, changed.acquisition.hash);
  assert.equal((await readEvents(root)).length, 3);
  const serialized = await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8");
  assert.match(serialized, /CRAWLER_CONTENT_BODY/);
  assert.match(serialized, /CRAWLER_CONTENT_WARNING/);
  assert.match(serialized, /CRAWLER_CONTENT_METADATA/);
});

test("ProductLoop ProvenanceSink validates receipts and records callback events without trace scraping", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const sink = createProductLoopProvenanceSink({ cwd: root });
  assert.deepEqual(Object.keys(sink), ["record"]);

  const started = runtimeEvent();
  const completed = runtimeEvent({
    sequence: 2,
    type: "tool.completed",
    timestamp: "2026-07-18T12:00:01.000Z",
    data: { stepId: "research", toolName: "crawler.read", output: { secret: "PRODUCTLOOP_OUTPUT_SECRET_MARKER" } },
    previousHash: started.receipt.eventHash
  });
  const validated = validateProductLoopRuntimeEvent(started);
  assert.equal(validated.runId, started.runId);
  assert.equal(validated.receipt.eventHash, started.receipt.eventHash);
  assert.deepEqual({ ...validated.data }, started.data);
  const mapped = productLoopRuntimeEventToEventInput(completed);
  assert.equal(mapped.kind, "tool.completed");
  assert.equal(mapped.data.capture, "metadata");
  assert.equal(JSON.stringify(mapped).includes("PRODUCTLOOP_OUTPUT_SECRET_MARKER"), false);

  await sink.record(started);
  await sink.record(structuredClone(started));
  await sink.record(completed);
  const events = await readEvents(root);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "session.started");
  assert.equal(events[1].kind, "tool.completed");
  assert.equal(events[1].data.runtimeEvent.receipt.eventHash, completed.receipt.eventHash);
  assert.equal(events[1].data.runtimeEvent.data, undefined);
  assert.ok(events[1].relations.some((relation) => relation.target === `productloop-receipt:${started.receipt.eventHash}`));
  const serialized = await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8");
  assert.equal(serialized.includes("PRODUCTLOOP_OUTPUT_SECRET_MARKER"), false);

  const tampered = structuredClone(completed);
  tampered.data.output.secret = "tampered";
  assert.throws(() => sink.record(tampered), (error) => error.code === "PRODUCTLOOP_RECEIPT_INVALID");

  const broken = runtimeEvent({
    sequence: 3,
    type: "run.completed",
    timestamp: "2026-07-18T12:00:02.000Z",
    data: { outputs: {} },
    previousHash: "f".repeat(64)
  });
  await assert.rejects(sink.record(broken), (error) => error.code === "PRODUCTLOOP_CHAIN_INVALID");
});

test("ProductLoop stable sequence identities reject divergent sink instances and survive replay", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const firstSink = createProductLoopProvenanceSink({ cwd: root });
  const secondSink = createProductLoopProvenanceSink({ cwd: root });
  const started = runtimeEvent({ runId: "run_concurrent" });
  await firstSink.record(started);
  await secondSink.record(started);
  const left = runtimeEvent({
    runId: started.runId,
    sequence: 2,
    type: "tool.completed",
    timestamp: "2026-07-18T12:00:01.000Z",
    data: { output: "left" },
    previousHash: started.receipt.eventHash
  });
  const right = runtimeEvent({
    runId: started.runId,
    sequence: 2,
    type: "tool.completed",
    timestamp: "2026-07-18T12:00:01.000Z",
    data: { output: "right" },
    previousHash: started.receipt.eventHash
  });
  const outcomes = await Promise.allSettled([firstSink.record(left), secondSink.record(right)]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = outcomes.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.code, "EVENT_ID_CONFLICT");
  assert.equal((await readEvents(root)).length, 2);

  const winning = outcomes[0].status === "fulfilled" ? left : right;
  const restarted = createProductLoopProvenanceSink({ cwd: root });
  await restarted.record(started);
  await restarted.record(winning);
  assert.equal((await readEvents(root)).length, 2);
});

test("ProductLoop content retention follows trusted workspace consent", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const sink = createProductLoopProvenanceSink({ cwd: root });
  const event = runtimeEvent({ data: { output: "PRODUCTLOOP_CONTENT_MARKER" } });
  await sink.record(event);
  const [stored] = await readEvents(root);
  assert.equal(stored.data.capture, "content");
  assert.equal(stored.data.runtimeEvent.data.output, "PRODUCTLOOP_CONTENT_MARKER");
});

test("interoperability timestamps are canonical in both runtime validators and published schemas", async () => {
  const cockroachSchema = JSON.parse(await readFile(new URL("../schemas/cockroach-source-record.schema.json", import.meta.url), "utf8"));
  const productLoopSchema = JSON.parse(await readFile(new URL("../schemas/productloop-runtime-event.schema.json", import.meta.url), "utf8"));
  const canonical = "2026-07-18T12:00:00.000Z";
  const offset = "2026-07-18T17:30:00.000+05:30";
  const cockroachTimestamp = new RegExp(cockroachSchema.properties.provenance.properties.retrievedAt.pattern);
  const cockroachPublishedAt = new RegExp(cockroachSchema.properties.publishedAt.anyOf[0].pattern);
  const productLoopTimestamp = new RegExp(productLoopSchema.properties.timestamp.pattern);
  assert.equal(cockroachSchema.properties.provenance.properties.retrievedAt.pattern, CANONICAL_ISO_TIMESTAMP_PATTERN);
  assert.equal(cockroachSchema.properties.publishedAt.anyOf[0].pattern, CANONICAL_ISO_TIMESTAMP_PATTERN);
  assert.equal(productLoopSchema.properties.timestamp.pattern, CANONICAL_ISO_TIMESTAMP_PATTERN);
  assert.equal(cockroachTimestamp.test(canonical), true);
  assert.equal(cockroachTimestamp.test(offset), false);
  assert.equal(productLoopTimestamp.test(canonical), true);
  assert.equal(productLoopTimestamp.test(offset), false);
  for (const valid of [
    "0000-02-29T00:00:00.000Z",
    "2000-02-29T23:59:59.999Z",
    "2024-02-29T12:00:00.000Z",
    "2026-04-30T12:00:00.000Z"
  ]) {
    assert.equal(cockroachTimestamp.test(valid), true, valid);
    assert.equal(cockroachPublishedAt.test(valid), true, valid);
    assert.equal(productLoopTimestamp.test(valid), true, valid);
    assert.doesNotThrow(() => validateProductLoopRuntimeEvent(runtimeEvent({ timestamp: valid })));
  }
  for (const invalid of [
    "1900-02-29T00:00:00.000Z",
    "2025-02-29T00:00:00.000Z",
    "2026-02-30T00:00:00.000Z",
    "2026-04-31T00:00:00.000Z",
    "2026-07-18T24:00:00.000Z",
    "+010000-01-01T00:00:00.000Z"
  ]) {
    assert.equal(cockroachTimestamp.test(invalid), false, invalid);
    assert.equal(cockroachPublishedAt.test(invalid), false, invalid);
    assert.equal(productLoopTimestamp.test(invalid), false, invalid);
    assert.throws(() => validateProductLoopRuntimeEvent(runtimeEvent({ timestamp: invalid })), /canonical ISO timestamp/);
    assert.throws(
      () => validateCockroachSourceRecordBoundary(sourceRecord({ publishedAt: invalid })),
      /canonical ISO timestamp/
    );
  }
  assert.throws(
    () => validateCockroachSourceRecordBoundary(sourceRecord({
      provenance: { ...sourceRecord().provenance, retrievedAt: offset }
    })),
    /canonical ISO timestamp/
  );
  assert.throws(() => validateProductLoopRuntimeEvent(runtimeEvent({ timestamp: offset })), /canonical ISO timestamp/);
});

test("ProductLoop sink writes require current machine-local Qarinah trust", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const sink = createProductLoopProvenanceSink({ workspace });
  await revokeWorkspaceTrust(root);
  await assert.rejects(sink.record(runtimeEvent()), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
});
