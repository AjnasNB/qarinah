import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  compileContext,
  initializeWorkspace,
  loadIndex,
  rebuildDerivedState,
  verifyStore
} from "../src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const resultPath = path.join(repositoryRoot, "bench", "results", "continuation-context-0.1.3.json");
const writeResult = process.argv.includes("--write");
const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-continuation-context-"));
process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");
let sequence = 0;

function eventId(index) {
  return `evt_00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function input(overrides = {}) {
  const index = ++sequence;
  return {
    eventId: eventId(index),
    timestamp: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
    kind: "decision",
    actor: { type: "agent", id: "codex-session-a" },
    title: "Continuation fixture record",
    body: "A bounded cross-session fixture.",
    data: {},
    confidence: "extracted",
    relations: [],
    sessionId: "session-a",
    turnId: "turn-a",
    provenance: { adapter: "qarinah-continuation-eval", sourceId: `fixture:${index}` },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function sha256(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

async function derivedDigest(workspace) {
  const contents = await Promise.all([
    ["index", "index.json"],
    ["graph", "graph.json"],
    ["records", "CONTEXT.md"]
  ].map((segments) => readFile(path.join(workspace.qarinahDir, ...segments))));
  return sha256(Buffer.concat(contents));
}

try {
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const prompt = await appendEvent(input({
    kind: "prompt.submitted",
    title: "Diagnose immutable release policy",
    body: "Find why a mutable artifact is accepted when its digest currently matches."
  }), { workspace });
  const testOutcome = await appendEvent(input({
    kind: "tool.completed",
    actor: { type: "tool", id: "node-test" },
    title: "Release policy test failed",
    body: "Two tests passed and the mutable-artifact rejection test failed.",
    confidence: "verified",
    relations: [{ type: "derived_from", target: prompt.eventId }]
  }), { workspace });
  const completedTurn = await appendEvent(input({
    kind: "turn.completed",
    title: "Codex diagnosis completed SWITCH-HANDOFF-7F3A",
    body: "Reject mutable artifacts before digest equality. Digest equality alone is a time-of-check/time-of-use risk. Run npm test. Implementation remains unfinished. SWITCH-HANDOFF-7F3A",
    relations: [
      { type: "derived_from", target: prompt.eventId },
      { type: "derived_from", target: testOutcome.eventId }
    ]
  }), { workspace });
  for (let index = 0; index < 36; index += 1) {
    await appendEvent(input({
      title: `Unrelated project history ${String(index).padStart(2, "0")}`,
      body: `Routine component ${index % 6} operation completed without release-policy impact.`,
      data: { component: `component-${index % 6}`, sequence: index }
    }), { workspace });
  }
  const sourceEvents = [prompt, testOutcome, completedTurn];
  const summary = await appendEvent(input({
    kind: "summary",
    title: "Evidence-linked continuation handoff SWITCH-HANDOFF-7F3A",
    body: "Session A diagnosed the immutable release guard: reject mutable artifacts before comparing exact digests, then run npm test. Implementation remains unfinished.",
    confidence: "inferred",
    data: {
      summaryMethod: "bounded-agent-handoff",
      sourceEvents: sourceEvents.map((event) => ({ eventId: event.eventId, hash: event.hash, kind: event.kind }))
    },
    relations: sourceEvents.map((event) => ({ type: "derived_from", target: event.eventId }))
  }), { workspace });
  await rebuildDerivedState(root);
  const persistedHead = (await loadIndex(root, { rebuild: false, updateCheckpoint: false })).index.headHash;
  await appendEvent(input({
    kind: "session.started",
    actor: { type: "system", id: "codex" },
    title: "Fresh Codex session B started",
    body: "",
    sessionId: "session-b",
    turnId: null,
    relations: [{ type: "references", target: "session:session-b" }]
  }), { workspace });
  await appendEvent(input({
    kind: "prompt.submitted",
    actor: { type: "human", id: "local-user" },
    title: "Continue the immutable release fix",
    body: "Use Qarinah before reading source and continue SWITCH-HANDOFF-7F3A.",
    sessionId: "session-b",
    turnId: "turn-b",
    relations: [{ type: "references", target: "session:session-b" }]
  }), { workspace });
  await assert.rejects(
    () => loadIndex(root, { rebuild: false, updateCheckpoint: false }),
    (error) => error?.code === "INDEX_STALE"
  );
  const derivedBefore = await derivedDigest(workspace);
  const pack = await compileContext("continue immutable release approval fix SWITCH-HANDOFF-7F3A", {
    cwd: root,
    inMemory: true,
    updateCheckpoint: false,
    maxTokens: 1_500,
    reserveTokens: 150,
    limit: 8,
    minimumCoverage: "partial",
    minimumEvidence: "any",
    rankingProfile: "admission-first-v2",
    temporalBoundary: "strict-before",
    includeEvidenceSufficiency: true,
    asOf: "2026-08-01T00:00:00.000Z"
  });
  const derivedAfter = await derivedDigest(workspace);
  const summaryRank = pack.items.findIndex((item) => item.eventId === summary.eventId) + 1;
  const summaryItem = pack.items.find((item) => item.eventId === summary.eventId);
  const sourceIdsPreserved = sourceEvents.every((event) => summaryItem?.excerpt.includes(event.eventId));
  const sourceHashesPreserved = sourceEvents.every((event) => summaryItem?.excerpt.includes(event.hash));
  const selectedIds = new Set(pack.items.map((item) => item.eventId));
  const rawHistory = await readFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "utf8");
  const rawHistoryTokens = Math.ceil(rawHistory.length / 4);
  const packTokens = pack.budget.usedTokens;
  const result = {
    records: 42,
    sourceEventCount: sourceEvents.length,
    summaryRank,
    summaryConfidence: summaryItem?.confidence ?? null,
    summarySelected: summaryRank > 0,
    sourceIdsPreserved,
    sourceHashesPreserved,
    sourceEventsSelected: sourceEvents.filter((event) => selectedIds.has(event.eventId)).length,
    distinctSessionIds: 2,
    stalePersistedHeadDetected: persistedHead === summary.hash,
    staleReadRecoveredInMemory: true,
    persistedDerivedStateUnchanged: derivedBefore === derivedAfter,
    citationsValid: pack.items.every((item) => /^evt_[0-9a-f-]{36}$/u.test(item.eventId) && /^sha256:[0-9a-f]{64}$/u.test(item.hash)),
    coverage: pack.retrieval.coverage.status,
    evidenceState: pack.retrieval.evidenceSufficiency.state,
    rankingProfile: pack.retrieval.rankingProfile,
    temporalBoundary: pack.retrieval.temporalBoundary,
    rawHistoryTokens,
    packTokens,
    estimatedTokenReduction: Math.round((1 - packTokens / rawHistoryTokens) * 1_000_000) / 1_000_000,
    doctorOk: (await verifyStore(root, { updateCheckpoint: false, includeRoot: false })).ok
  };
  assert.equal(result.summarySelected, true);
  assert.equal(result.summaryConfidence, "inferred");
  assert.equal(result.sourceIdsPreserved, true);
  assert.equal(result.sourceHashesPreserved, true);
  // The compact pack may select the handoff plus only the highest-ranked raw
  // source record. The summary must still preserve all source IDs and hashes
  // so a consumer can inspect the omitted originals on demand.
  assert.ok(result.sourceEventsSelected >= 1);
  assert.equal(result.stalePersistedHeadDetected, true);
  assert.equal(result.persistedDerivedStateUnchanged, true);
  assert.equal(result.citationsValid, true);
  assert.equal(result.rankingProfile, "admission-first-v2");
  assert.equal(result.temporalBoundary, "strict-before");
  assert.ok(result.estimatedTokenReduction > 0.5);
  assert.equal(result.doctorOk, true);

  const artifact = {
    schemaVersion: "qarinah.continuation-context-eval-result.v1",
    packageVersion: packageJson.version,
    fixture: {
      description: "Deterministic two-session fixture with an inferred handoff summary linked to extracted prompt, verified test outcome, and completed-turn evidence, followed by lifecycle events that deliberately stale persisted derived state.",
      tokenEstimator: "portable ceil(characters / 4)",
      providerBillingMeasurement: false
    },
    expected: result,
    claim: "A fresh session recovered a compact evidence-linked handoff from the verified ledger after lifecycle capture advanced the head; every summary source ID and hash remained inspectable and the zero-write read left persisted derived state unchanged.",
    limitations: [
      "This deterministic fixture measures retrieval and evidence linkage, not provider task quality.",
      "The summary is inferred and remains subordinate to its cited source events.",
      "The portable token estimate is not a provider bill."
    ]
  };
  if (writeResult) {
    await writeFile(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  } else {
    const committed = JSON.parse(await readFile(resultPath, "utf8"));
    assert.deepEqual(committed, artifact, "Continuation context evidence no longer matches the deterministic evaluator.");
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "qarinah.continuation-context-eval-run.v1",
    packageVersion: packageJson.version,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    ...artifact
  }, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
