import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMatchedTasks, MATCHED_TASK_SCHEMA_VERSION } from "../src/matched-evaluation.js";
const hash = `sha256:${"a".repeat(64)}`;
const receipt = (changes = {}) => ({ schemaVersion: "qarinah.provider-usage.v1", provider: "provider", model: "model", callId: "call", attempt: 1,
  sessionId: "test-session", purpose: "test", outcome: "completed", inputTokens: 100, outputTokens: 50, cachedInputTokens: 25, reasoningTokens: 10, ...changes });
const run = (changes = {}) => ({ configurationHash: hash, outcome: "completed", taskPassed: true, elapsedMs: 1000, retrievalMs: 0, costMicrosUsd: 1000, usage: [receipt()], ...changes });
const sample = () => ({ schemaVersion: MATCHED_TASK_SCHEMA_VERSION, baselineMethod: "project-notes-and-search", pairs: [{ id: "task", repositoryRevision: "a".repeat(40), taskHash: hash,
  baseline: run(), qarinah: run({ elapsedMs: 1100, retrievalMs: 100, costMicrosUsd: 500, usage: [receipt({ sessionId: "qarinah-session", inputTokens: 50, cachedInputTokens: 20 })] }) }] });
test("matched evaluation counts complete calls and retrieval overhead with quality", () => {
  const value = sample();
  value.pairs[0].qarinah.usage.push(receipt({ sessionId: "qarinah-session", attempt: 2, outcome: "failed", inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, reasoningTokens: 0 }));
  const report = evaluateMatchedTasks(value);
  assert.equal(report.qarinah.totalTokens, 115); assert.equal(report.qarinah.attempts, 2);
  assert.equal(report.comparison.costReductionPercent, 50); assert.equal(report.comparison.elapsedReductionPercent, -10);
  assert.equal(report.qualityPreserved, true); assert.match(report.manifestHash, /^sha256:/u);
});

test("aggregate passes cannot hide a paired regression or duplicated provider evidence", () => {
  const value = sample(); value.pairs[0].qarinah.taskPassed = false;
  const other = structuredClone(sample().pairs[0]); other.id = "other";
  other.baseline.taskPassed = false;
  for (const side of ["baseline", "qarinah"]) other[side].usage[0].callId = "other-call";
  value.pairs.push(other);
  const report = evaluateMatchedTasks(value);
  assert.equal(report.comparison.taskPassDifference, 0); assert.equal(report.qualityPreserved, false);
  assert.deepEqual(report.regressions, ["task"]); assert.deepEqual(report.improvements, ["other"]);
  const duplicate = sample(); duplicate.pairs[0].qarinah.usage = structuredClone(duplicate.pairs[0].baseline.usage);
  assert.throws(() => evaluateMatchedTasks(duplicate), /Duplicate provider attempt/u);
});
test("unknown bills or usage never become free calls", () => {
  const value = sample(); value.pairs[0].qarinah.costMicrosUsd = null;
  value.pairs[0].qarinah.usage = [receipt({ sessionId: "qarinah-session", inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null })];
  const report = evaluateMatchedTasks(value);
  assert.equal(report.comparison.costReductionPercent, null); assert.equal(report.comparison.tokenReductionPercent, null);
});
test("incomparable settings, duplicate retries and inconsistent outcomes fail", () => {
  const mismatch = sample(); mismatch.pairs[0].qarinah.configurationHash = `sha256:${"b".repeat(64)}`;
  assert.throws(() => evaluateMatchedTasks(mismatch), /same model/u);
  const duplicate = sample(); duplicate.pairs[0].qarinah.usage.push(receipt());
  assert.throws(() => evaluateMatchedTasks(duplicate), /Duplicate/u);
  const inconsistent = sample(); inconsistent.pairs[0].qarinah.outcome = "failed";
  assert.throws(() => evaluateMatchedTasks(inconsistent), /consistent/u);
});
test("a cost improvement with a failed task is exposed as a quality regression", () => {
  const value = sample(); value.pairs[0].qarinah.taskPassed = false;
  const report = evaluateMatchedTasks(value);
  assert.equal(report.qualityPreserved, false); assert.equal(report.comparison.taskPassDifference, -1);
});
