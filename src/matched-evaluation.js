import { deepFreezeJson, sha256 } from "./canonical.js";
import { snapshotRecordBoundary } from "./interoperability/boundary.js";
import { summarizeProviderUsage, validateProviderUsage } from "./provider-usage.js";

export const MATCHED_TASK_SCHEMA_VERSION = "qarinah.matched-task-evaluation.v1";
const HASH = /^sha256:[0-9a-f]{64}$/u;
const RUN_KEYS = ["configurationHash", "outcome", "taskPassed", "elapsedMs", "retrievalMs", "costMicrosUsd", "usage"];
const integer = (value, label, maximum = 1_000_000_000_000) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new TypeError(`${label} must be a bounded nonnegative integer.`);
  return value;
};
function run(value) {
  const candidate = snapshotRecordBoundary(value, { label: "Task run", keys: RUN_KEYS, maximumBytes: 2_000_000,
    maximumStringLength: 256, maximumArrayLength: 1000, maximumNodes: 30000 });
  if (!HASH.test(candidate.configurationHash) || !["completed", "failed", "cancelled"].includes(candidate.outcome)
    || typeof candidate.taskPassed !== "boolean" || (candidate.taskPassed && candidate.outcome !== "completed")) {
    throw new TypeError("Task runs require a configuration hash and a consistent observed outcome.");
  }
  integer(candidate.elapsedMs, "elapsedMs"); integer(candidate.retrievalMs, "retrievalMs");
  if (candidate.retrievalMs > candidate.elapsedMs) throw new TypeError("retrievalMs is included in elapsedMs.");
  if (candidate.costMicrosUsd !== null) integer(candidate.costMicrosUsd, "costMicrosUsd");
  if (!Array.isArray(candidate.usage) || candidate.usage.length < 1 || candidate.usage.length > 1000) {
    throw new TypeError("Every run requires per-attempt usage, with explicit null counts when unavailable.");
  }
  const usage = candidate.usage.map(validateProviderUsage);
  if (usage.some((receipt) => receipt.purpose !== "test")) throw new TypeError("Evaluation calls must be identified as test usage.");
  const events = usage.map((providerUsage, index) => ({ eventId: `attempt-${index}`, data: { providerUsage } }));
  const summary = summarizeProviderUsage(events);
  if (summary.invalidEventIds.length) throw new TypeError("Duplicate or invalid provider attempt identities.");
  return { ...candidate, usage, tokens: summary.test };
}
const sumKnown = (rows, field) => rows.every((row) => row[field] !== null)
  ? rows.reduce((total, row) => integer(total + row[field], `total ${field}`), 0) : null;
const reduction = (baseline, actual) => baseline === null || actual === null || baseline <= 0 ? null
  : Math.round((baseline - actual) / baseline * 10000) / 100;
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];

export function evaluateMatchedTasks(value) {
  const input = snapshotRecordBoundary(value, { label: "Matched tasks", keys: ["schemaVersion", "baselineMethod", "pairs"],
    maximumBytes: 8_000_000, maximumStringLength: 4096, maximumArrayLength: 1000, maximumNodes: 100000 });
  if (input.schemaVersion !== MATCHED_TASK_SCHEMA_VERSION || !["project-notes-and-search", "native-host", "competitor", "full-history"].includes(input.baselineMethod)
    || !Array.isArray(input.pairs) || input.pairs.length < 1 || input.pairs.length > 500) throw new TypeError("Invalid matched task evaluation.");
  const ids = new Set(), attempts = new Set();
  const pairs = input.pairs.map((value) => {
    const pair = snapshotRecordBoundary(value, { label: "Matched pair", keys: ["id", "repositoryRevision", "taskHash", "baseline", "qarinah"],
      maximumBytes: 4_000_000, maximumStringLength: 4096, maximumArrayLength: 1000, maximumNodes: 60000 });
    if (typeof pair.id !== "string" || !pair.id.trim() || pair.id.length > 128 || ids.has(pair.id)
      || !/^[0-9a-f]{40}$/u.test(pair.repositoryRevision) || !HASH.test(pair.taskHash)) throw new TypeError("Pairs require unique IDs and exact repository/task identities.");
    ids.add(pair.id);
    const baseline = run(pair.baseline), qarinah = run(pair.qarinah);
    for (const receipt of [...baseline.usage, ...qarinah.usage]) {
      const identity = JSON.stringify([receipt.provider, receipt.model, receipt.sessionId, receipt.callId, receipt.attempt]);
      if (attempts.has(identity)) throw new TypeError("Duplicate provider attempt across matched runs.");
      attempts.add(identity);
    }
    if (baseline.configurationHash !== qarinah.configurationHash) throw new TypeError("Paired runs must use the same model, tools, settings, and task conditions.");
    const profiles = (rows) => [...new Set(rows.map(({ provider, model }) => JSON.stringify([provider, model])))].sort();
    if (JSON.stringify(profiles(baseline.usage)) !== JSON.stringify(profiles(qarinah.usage))) throw new TypeError("Paired provider/model profiles differ.");
    return { id: pair.id, repositoryRevision: pair.repositoryRevision, taskHash: pair.taskHash, baseline, qarinah };
  });
  const aggregate = (side) => {
    const rows = pairs.map((pair) => pair[side]);
    return { tasksPassed: rows.filter((row) => row.taskPassed).length,
      attempts: rows.reduce((total, row) => total + row.usage.length, 0),
      totalTokens: sumKnown(rows.map((row) => row.tokens), "totalTokens"),
      costMicrosUsd: sumKnown(rows, "costMicrosUsd"),
      elapsedMs: sumKnown(rows, "elapsedMs"),
      p50ElapsedMs: percentile(rows.map((row) => row.elapsedMs), 0.5),
      p95ElapsedMs: percentile(rows.map((row) => row.elapsedMs), 0.95),
      retrievalMs: sumKnown(rows, "retrievalMs") };
  };
  const baseline = aggregate("baseline"), qarinah = aggregate("qarinah");
  const regressions = pairs.filter(pair => pair.baseline.taskPassed && !pair.qarinah.taskPassed).map(pair => pair.id);
  const improvements = pairs.filter(pair => !pair.baseline.taskPassed && pair.qarinah.taskPassed).map(pair => pair.id);
  const qualityPreserved = regressions.length === 0;
  const result = { schemaVersion: MATCHED_TASK_SCHEMA_VERSION, baselineMethod: input.baselineMethod, pairCount: pairs.length,
    baseline, qarinah, qualityPreserved, regressions, improvements,
    comparison: { tokenReductionPercent: reduction(baseline.totalTokens, qarinah.totalTokens),
      costReductionPercent: reduction(baseline.costMicrosUsd, qarinah.costMicrosUsd),
      elapsedReductionPercent: reduction(baseline.elapsedMs, qarinah.elapsedMs),
      taskPassDifference: qarinah.tasksPassed - baseline.tasksPassed },
    evidenceHash: sha256(input),
    boundary: "Caller-supplied observed runs; not independent validation. All attempts count, including failed retries. Cache is within input and reasoning within output. Retrieval time is within elapsed time. Missing usage and cost stay unknown. A smaller pack alone is not a task benefit." };
  return deepFreezeJson({ ...result, manifestHash: sha256(result) });
}
