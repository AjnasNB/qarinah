import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  MAQAM_CONTEXT_APPEND_TOOL,
  MAQAM_CONTEXT_QUERY_TOOL,
  appendEvent,
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
  const gateway = {
    registerTool(name, handler, metadata) {
      tools.set(name, { handler, metadata });
      return this;
    },
    async call(name, input, context = {}) {
      const registered = tools.get(name);
      if (!registered) throw new Error(`Unknown tool '${name}'.`);
      const runId = context.runId ?? "default";
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
    (error) => error.code === "MAQAM_APPROVAL_SCOPE_MISMATCH"
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
    defineToolAdapter: maqam.defineToolAdapter,
    registerToolAdapter: maqam.registerToolAdapter,
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
