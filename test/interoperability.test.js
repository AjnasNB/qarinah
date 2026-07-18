import assert from "node:assert/strict";
import test from "node:test";
import {
  MAQAM_CONTEXT_APPEND_TOOL,
  MAQAM_CONTEXT_QUERY_TOOL,
  appendEvent,
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
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

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
  const gateway = {
    registerTool(name, handler, metadata) {
      tools.set(name, { handler, metadata });
      return this;
    },
    async call(name, input, context = {}) {
      const registered = tools.get(name);
      if (!registered) throw new Error(`Unknown tool '${name}'.`);
      const runId = context.runId ?? "run_fake";
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
      return registered.handler(input, {
        ...context,
        runId,
        toolName: name,
        approvals: context.approvals ?? [],
        evidence: scopedEvidence
      });
    }
  };
  const defineToolAdapter = (spec) => {
    assert.equal(spec.schemaVersion, "maqam.tool-adapter.v1");
    assert.deepEqual(spec.invoke.governance.effects, spec.effects);
    assert.equal(spec.invoke.governance.risk, spec.risk);
    return Object.freeze(spec);
  };
  const registerToolAdapter = (target, adapter) => target.registerTool(adapter.name, adapter.invoke, adapter.metadata);
  return { gateway, defineToolAdapter, registerToolAdapter, tools, evidence };
}

test("Maqam adapters preserve separate read/write governance and scoped evidence", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({ title: "Release decision", body: "Ship only through governed tools." }), { workspace });
  await rebuildDerivedState(root);
  const maqam = fakeMaqam();

  const registration = registerMaqamContextAdapters({
    gateway: maqam.gateway,
    defineToolAdapter: maqam.defineToolAdapter,
    registerToolAdapter: maqam.registerToolAdapter,
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

  const before = (await readEvents(root)).length;
  await assert.rejects(
    maqam.gateway.call("context.append", { event: eventInput({ title: "Unapproved write" }) }, { runId: "run_append" }),
    (error) => error.code === "MAQAM_APPROVAL_REQUIRED"
  );
  assert.equal((await readEvents(root)).length, before);

  const approval = {
    status: "approved",
    subject: { runId: "run_append", toolName: "context.append", inputHash: "sha256:fixture" },
    consumptions: [{ runId: "run_append", toolName: "context.append" }]
  };
  const appended = await maqam.gateway.call("context.append", {
    event: eventInput({ title: "Approved context write" })
  }, { runId: "run_append", taskId: "persist", approvals: [approval] });
  assert.equal(appended.event.title, "Approved context write");
  assert.equal(appended.evidence.runId, "run_append");
  assert.equal(appended.evidence.tool, "context.append");
  const refreshed = await maqam.gateway.call("context.query", { query: "approved context" }, { runId: "run_after_append" });
  assert.ok(refreshed.pack.items.some((item) => item.eventId === appended.event.eventId));
});

test("Cockroach SourceRecord boundary is strict and contentHash drives idempotent revisions", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const input = sourceRecord();
  const validated = validateCockroachSourceRecordBoundary(input);
  assert.equal(Object.isFrozen(validated.metadata), true);
  assert.equal(validated.provenance.retrievedAt, "2026-07-18T11:00:00.000Z");

  const firstInput = cockroachSourceRecordToEventInput(input);
  const sameInput = cockroachSourceRecordToEventInput(structuredClone(input));
  assert.equal(firstInput.eventId, sameInput.eventId);
  assert.equal(firstInput.data.trust, "untrusted");
  assert.equal(firstInput.data.upstreamContentHash, input.contentHash);
  assert.ok(firstInput.relations.some((relation) => relation.type === "references" && relation.target === input.url));
  assert.ok(firstInput.relations.some((relation) => relation.type === "references" && relation.target === `author:${input.author}`));
  assert.ok(firstInput.relations.some((relation) => relation.type === "references" && relation.target.startsWith("acquisition:")));

  const first = await ingestCockroachSourceRecord(input, { cwd: root });
  const replay = await ingestCockroachSourceRecord(structuredClone(input), { cwd: root });
  assert.equal(replay.hash, first.hash);
  assert.equal((await readEvents(root)).length, 1);

  const revision = sourceRecord({
    text: "The source published a changed revision.",
    contentHash: `sha256:${"b".repeat(64)}`
  });
  const second = await ingestCockroachSourceRecord(revision, { cwd: root });
  assert.notEqual(second.eventId, first.eventId);
  assert.equal((await readEvents(root)).length, 2);

  assert.throws(() => validateCockroachSourceRecordBoundary({ ...input, unexpected: true }), /unknown field/);
  assert.throws(() => validateCockroachSourceRecordBoundary({ ...input, contentHash: "sha256:BAD" }), /lowercase sha256/);
  const accessor = { ...input };
  Object.defineProperty(accessor, "title", { enumerable: true, get: () => "executed" });
  assert.throws(() => validateCockroachSourceRecordBoundary(accessor), /enumerable data property/);
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
    data: { stepId: "research", toolName: "crawler.read", output: { ok: true } },
    previousHash: started.receipt.eventHash
  });
  const validated = validateProductLoopRuntimeEvent(started);
  assert.equal(validated.runId, started.runId);
  assert.equal(validated.receipt.eventHash, started.receipt.eventHash);
  assert.deepEqual({ ...validated.data }, started.data);
  assert.equal(productLoopRuntimeEventToEventInput(completed).kind, "tool.completed");

  await sink.record(started);
  await sink.record(structuredClone(started));
  await sink.record(completed);
  const events = await readEvents(root);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "session.started");
  assert.equal(events[1].kind, "tool.completed");
  assert.equal(events[1].data.runtimeEvent.receipt.eventHash, completed.receipt.eventHash);
  assert.ok(events[1].relations.some((relation) => relation.target === `productloop-receipt:${started.receipt.eventHash}`));

  const tampered = structuredClone(completed);
  tampered.data.output.ok = false;
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

test("ProductLoop sink writes require current machine-local Qarinah trust", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const sink = createProductLoopProvenanceSink({ cwd: root });
  await revokeWorkspaceTrust(root);
  await assert.rejects(sink.record(runtimeEvent()), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
});
