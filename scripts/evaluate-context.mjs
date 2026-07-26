import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  compileContext,
  initializeWorkspace
} from "../src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-context-eval-"));
process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");
let inputSequence = 0;

function input(overrides = {}) {
  const timestamp = new Date(Date.UTC(2026, 3, 1, 0, inputSequence++)).toISOString();
  return {
    kind: "decision",
    actor: { type: "human", id: "eval-owner" },
    title: "Context evaluation record",
    body: "A bounded fixture for retrieval evaluation.",
    data: {},
    confidence: "claimed",
    relations: [],
    provenance: { adapter: "qarinah-context-eval", sourceId: null },
    retention: { class: "project", expiresAt: null },
    timestamp,
    ...overrides
  };
}

try {
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const approval = await appendEvent(input({
    title: "Bind approval to exact artifact hash",
    body: "A release approval is valid only for the reviewed tarball digest and tool input."
  }), { workspace });
  const postgres = await appendEvent(input({
    kind: "source",
    title: "PostgreSQL authentication incident runbook",
    body: "Rotate database credentials through the governed secret manager."
  }), { workspace });
  const governed = await appendEvent(input({
    title: "Govern database credential rotation",
    body: "Use the incident runbook as evidence before rotation.",
    relations: [{ type: "derived_from", target: postgres.eventId }]
  }), { workspace });
  const legacy = await appendEvent(input({
    timestamp: "2026-01-01T00:00:00.000Z",
    title: "Use legacy crawler release gate",
    body: "The old gate permitted mutable release inputs."
  }), { workspace });
  const current = await appendEvent(input({
    timestamp: "2026-02-01T00:00:00.000Z",
    title: "Use immutable crawler release gate",
    body: "The current gate binds tag, commit, tarball hash, and registry integrity.",
    relations: [{ type: "supersedes", target: legacy.eventId }]
  }), { workspace });
  const conflict = await appendEvent(input({
    timestamp: "2026-03-01T00:00:00.000Z",
    kind: "claim",
    title: "Crawler release exception claimed",
    body: "An unverified source claims mutable inputs remain acceptable.",
    relations: [{ type: "contradicts", target: current.eventId }]
  }), { workspace });
  for (let index = 0; index < 48; index += 1) {
    await appendEvent(input({
      title: `Unrelated fixture ${String(index).padStart(2, "0")}`,
      body: `Component ${index % 7} completed a routine local operation.`,
      data: { component: `component-${index % 7}`, sequence: index }
    }), { workspace });
  }

  const cases = [
    { query: "exact approval artifact digest", expected: approval.eventId },
    { query: "postgress authentcation runbok", expected: postgres.eventId },
    { query: "govern database credential rotation", expected: governed.eventId },
    { query: "immutable crawler release integrity", expected: current.eventId }
  ];
  let reciprocalRank = 0;
  let recallAtFive = 0;
  let totalPackChars = 0;
  const queryStarted = performance.now();
  for (const fixture of cases) {
    const pack = await compileContext(fixture.query, {
      cwd: root,
      maxChars: 4_000,
      maxTokens: 1_000,
      reserveTokens: 150,
      limit: 8,
      inMemory: true,
      asOf: "2026-07-20T00:00:00.000Z"
    });
    const rank = pack.items.findIndex((item) => item.eventId === fixture.expected) + 1;
    if (rank > 0 && rank <= 5) recallAtFive += 1;
    if (rank > 0) reciprocalRank += 1 / rank;
    totalPackChars += pack.budget.usedChars;
  }
  const conflictPack = await compileContext("crawler release exception", {
    cwd: root,
    maxChars: 5_000,
    limit: 10,
    inMemory: true,
    asOf: "2026-07-20T00:00:00.000Z"
  });
  const conflictVisible = conflictPack.retrieval.conflicts?.some((entry) => (
    entry.eventIds.includes(current.eventId) && entry.eventIds.includes(conflict.eventId)
  )) === true;
  const oldExcluded = conflictPack.retrieval.exclusions?.some((entry) => entry.eventId === legacy.eventId) === true;
  const queryMs = performance.now() - queryStarted;
  const logText = await readFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "utf8");
  const rawCharsPerQuery = logText.length;
  const averagePackChars = totalPackChars / cases.length;
  const result = {
    schemaVersion: "qarinah.context-eval.v1",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    records: 54,
    cases: cases.length,
    recallAt5: recallAtFive / cases.length,
    meanReciprocalRank: reciprocalRank / cases.length,
    conflictRecall: conflictVisible ? 1 : 0,
    supersessionPrecision: oldExcluded ? 1 : 0,
    averagePackChars: Math.round(averagePackChars),
    rawCharsPerQuery,
    characterReduction: Math.round((1 - averagePackChars / rawCharsPerQuery) * 10_000) / 10_000,
    queryMs: Math.round(queryMs * 100) / 100
  };
  const committed = JSON.parse(await readFile(
    path.join(repositoryRoot, "bench", "results", "context-evaluation-0.1.1.json"),
    "utf8"
  ));
  assert.equal(committed.schemaVersion, "qarinah.context-eval-result.v1");
  assert.equal(committed.packageVersion, "0.1.1");
  assert.deepEqual(
    Object.fromEntries(Object.keys(committed.expected).map((key) => [key, result[key]])),
    committed.expected,
    "The deterministic context evaluator no longer matches the committed release evidence."
  );
  if (result.recallAt5 < 1
    || result.meanReciprocalRank < 0.75
    || result.conflictRecall !== 1
    || result.supersessionPrecision !== 1
    || result.characterReduction < 0.5) {
    throw new Error(`Context evaluation threshold failed: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
