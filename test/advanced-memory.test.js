import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  compileContext,
  compileFederatedContext,
  evaluateContextQuality,
  initializeWorkspace,
  inspectMemoryFreshness,
  inspectSqliteReadModel,
  querySqliteReadModel,
  rebuildDerivedState,
  recordMemoryScopeAttachment,
  resolveActiveMemoryScopes,
  revokeMemoryScopeAttachment
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

test("SQLite is a complete rebuildable read model while JSONL remains authoritative", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({ title: "SQLite authority test", body: "Ledger first." }), { cwd: root });
  await rebuildDerivedState(root);
  const report = await inspectSqliteReadModel(await import("../src/workspace.js").then(({ loadWorkspace }) => loadWorkspace(root)));
  assert.equal(report.journalMode, "wal");
  for (const table of [
    "events", "nodes", "edges", "citations", "documents", "sources", "decisions", "conflicts",
    "supersessions", "freshness", "context_packs", "context_pack_items", "agent_disclosures",
    "sync_outbox", "events_fts", "read_model_migrations"
  ]) assert.ok(report.tables.includes(table), table);
  const first = await compileContext("SQLite authority", { cwd: root });
  const sqlite = await querySqliteReadModel(
    await import("../src/workspace.js").then(({ loadWorkspace }) => loadWorkspace(root)),
    "SQLite authority",
    { headHash: report.headHash }
  );
  assert.equal(sqlite.candidates[0].eventId, first.items[0].eventId);
  await import("node:fs/promises").then(({ rm }) => rm(path.join(root, ".qarinah", "index", "qarinah.db")));
  const rebuilt = await compileContext("SQLite authority", { cwd: root, rebuild: true });
  assert.equal(rebuilt.items[0].eventId, first.items[0].eventId);
});

test("temporal, disclosure, repository, and host attachment boundaries fail closed", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const base = {
    kind: "decision",
    actor: { type: "human", id: "owner" },
    body: "Release key rotation decision.",
    confidence: "verified",
    temporal: { validFrom: "2099-08-01T00:00:00.000Z" },
    provenance: { adapter: "test", sourceId: "authority-test" }
  };
  const frontend = await appendEvent({
    ...base,
    title: "Frontend release key",
    repository: { id: "frontend", branch: "main", commit: "abc123" },
    disclosure: { scopes: ["engineering.frontend"], classification: "restricted" }
  }, { cwd: root });
  await appendEvent({
    ...base,
    title: "Infrastructure release key",
    repository: { id: "infrastructure", branch: "main", commit: "def456" },
    disclosure: { scopes: ["engineering.infrastructure"], classification: "restricted" },
    provenance: { adapter: "test", sourceId: "infra-authority-test" }
  }, { cwd: root });
  await recordMemoryScopeAttachment({
    attachmentId: "mem_frontend_run",
    agentId: "agent-a",
    runId: "run-1",
    scopes: ["engineering.frontend"],
    repositories: ["frontend"],
    attachedAt: "2099-08-02T00:00:00.000Z",
    expiresAt: "2099-08-03T00:00:00.000Z",
    assignedBy: "maqam.policy"
  }, { cwd: root });
  await rebuildDerivedState(root);
  const attachment = await resolveActiveMemoryScopes({
    cwd: root, agentId: "agent-a", runId: "run-1", asOf: "2099-08-02T12:00:00.000Z", required: true
  });
  const pack = await compileContext("release key", {
    cwd: root,
    asOf: attachment.asOf,
    authorityScopes: attachment.scopes,
    repositoryIds: attachment.repositories
  });
  assert.deepEqual(pack.items.filter((item) => item.kind === "decision").map((item) => item.eventId), [frontend.eventId]);
  assert.ok(pack.retrieval.filters.unauthorized >= 1);

  await revokeMemoryScopeAttachment({
    attachmentId: "mem_frontend_run",
    agentId: "agent-a",
    runId: "run-1",
    scopes: ["engineering.frontend"],
    repositories: ["frontend"],
    attachedAt: "2099-08-02T00:00:00.000Z",
    expiresAt: "2099-08-03T00:00:00.000Z",
    revokedAt: "2099-08-02T13:00:00.000Z",
    assignedBy: "maqam.policy"
  }, { cwd: root });
  await assert.rejects(
    resolveActiveMemoryScopes({ cwd: root, agentId: "agent-a", runId: "run-1", asOf: "2099-08-02T14:00:00.000Z", required: true }),
    (error) => error.code === "MEMORY_ATTACHMENT_REQUIRED"
  );
});

test("freshness binds citations to file hashes and reports stale event ids", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const file = path.join(root, "policy.md");
  await writeFile(file, "allow v1\n", "utf8");
  const event = await appendEvent(eventInput({
    title: "Cited policy",
    freshness: { files: [{ path: "policy.md", hash: hash("allow v1\n") }] }
  }), { cwd: root });
  await writeFile(file, "allow v2\n", "utf8");
  const result = await inspectMemoryFreshness({ cwd: root });
  assert.equal(result.status, "stale");
  assert.ok(result.staleEventIds.includes(event.eventId));
});

test("federated retrieval keeps repositories separate while exposing typed relationships", async (t) => {
  const frontend = await temporaryDirectory(t);
  const backend = await temporaryDirectory(t);
  await initializeWorkspace(frontend, { capture: "content" });
  await initializeWorkspace(backend, { capture: "content" });
  await appendEvent(eventInput({ title: "Shared contract frontend" }), { cwd: frontend });
  await appendEvent(eventInput({ title: "Shared contract backend" }), { cwd: backend });
  const result = await compileFederatedContext("shared contract", {
    workspaces: [
      { cwd: frontend, authority: "frontend-team", repositoryId: "frontend" },
      { cwd: backend, authority: "backend-team", repositoryId: "backend" }
    ],
    relationships: [{ from: "frontend", to: "backend", type: "shares_contract" }]
  });
  assert.equal(result.authorityBoundary, "separate-packs");
  assert.deepEqual(result.repositoryGraph, [{ from: "frontend", to: "backend", type: "shares_contract" }]);
  assert.deepEqual(result.workspaces.map((entry) => entry.repositoryId), ["frontend", "backend"]);
});

test("quality evaluation covers authority, temporal, isolation, token, cost, and outcome metrics", () => {
  const result = evaluateContextQuality([{
    requiredDecisionIds: ["d1"], recalledDecisionIds: ["d1"],
    returnedCitationIds: ["c1"], validCitationIds: ["c1"],
    expectedStaleIds: ["s1"], rejectedStaleIds: ["s1"],
    expectedConflictIds: ["x1"], detectedConflictIds: ["x1"],
    expectedSupersededIds: ["old"], resolvedSupersededIds: ["old"],
    crossRepositoryAttemptIds: ["infra"], rejectedCrossRepositoryIds: ["infra"],
    expectedUnauthorizedIds: ["secret"], rejectedUnauthorizedIds: ["secret"],
    baselineContextTokens: 10_000, contextTokensSupplied: 500,
    taskCompleted: true, repeatedMistakeExpected: true, repeatedMistakeAvoided: true,
    latencyMs: 12, baselineCost: 1, actualCost: 0.05
  }]);
  assert.equal(result.metrics.supersessionCorrectness, 1);
  assert.equal(result.metrics.crossRepositoryIsolation, 1);
  assert.equal(result.metrics.unauthorizedDisclosureRejection, 1);
  assert.equal(result.metrics.contextTokenReduction, 0.95);
  assert.equal(result.metrics.netCostPerCompletedTask, 0.05);
});
