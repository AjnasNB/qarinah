import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const livePath = path.join(root, "bench", "results", "live-workspace-volume-2026-07-21.json");
const live = JSON.parse(await readFile(livePath, "utf8"));
const softwareTaskPath = path.join(root, "bench", "results", "software-task-context-0.1.0-alpha.2.json");
const softwareTask = JSON.parse(await readFile(softwareTaskPath, "utf8"));

assert.equal(live.schemaVersion, "qarinah.workspace-volume-observation.v1");
assert.equal(live.claimEligible, false);
assert.equal(live.tokenEstimator.method, "ceil(chars/4)");
assert.equal(live.tokenEstimator.exact, false);
assert.equal(live.tokenEstimator.providerBillingMeasurement, false);
assert.equal(live.pack.estimatedTokens, Math.ceil(live.pack.characters / 4));

for (const baseline of live.baselines) {
  assert.equal(baseline.estimatedTokens, Math.ceil(baseline.characters / 4));
  const reduction = Math.round((1 - live.pack.characters / baseline.characters) * 1_000_000) / 1_000_000;
  assert.equal(baseline.reduction, reduction, `${baseline.label} reduction does not match its character counts.`);
}

for (const key of ["summaryEventHash", "projectSnapshotEventHash", "projectSnapshotHash"]) {
  assert.match(live.provenance[key], /^sha256:[a-f0-9]{64}$/u);
}

assert.equal(softwareTask.schemaVersion, "qarinah.software-task-context-eval-result.v1");
assert.equal(softwareTask.fixture.records, 240);
assert.equal(softwareTask.fixture.cases, 6);
assert.equal(softwareTask.tokenEstimator.method, "ceil(chars/4)");
assert.equal(softwareTask.tokenEstimator.exact, false);
assert.equal(softwareTask.tokenEstimator.providerBillingMeasurement, false);
assert.equal(softwareTask.expected.allTargetsInTopFive, true);
assert.equal(softwareTask.expected.allCoverageDirect, true);
assert.equal(softwareTask.expected.modelSummaryItems, 0);
assert.equal(softwareTask.expected.scenarios.length, softwareTask.fixture.cases);

let totalBaselineEstimatedTokens = 0;
let totalQarinahEstimatedTokens = 0;
for (const scenario of softwareTask.expected.scenarios) {
  assert.equal(scenario.baselineChars, scenario.currentSourceChars + scenario.fullHistoryChars);
  assert.equal(scenario.qarinahChars, scenario.currentSourceChars + scenario.packChars);
  assert.equal(scenario.baselineEstimatedTokens, Math.ceil(scenario.baselineChars / 4));
  assert.equal(scenario.qarinahEstimatedTokens, Math.ceil(scenario.qarinahChars / 4));
  const scenarioReduction = Math.round((1 - scenario.qarinahEstimatedTokens / scenario.baselineEstimatedTokens) * 1_000_000) / 1_000_000;
  assert.equal(scenario.estimatedTokenReduction, scenarioReduction);
  assert.ok(scenario.estimatedTokenReduction >= 0.9);
  assert.ok(scenario.targetRank > 0 && scenario.targetRank <= 5);
  assert.equal(scenario.coverage, "direct");
  assert.equal(scenario.summaryItems, 0);
  totalBaselineEstimatedTokens += scenario.baselineEstimatedTokens;
  totalQarinahEstimatedTokens += scenario.qarinahEstimatedTokens;
}

assert.equal(softwareTask.expected.totalBaselineEstimatedTokens, totalBaselineEstimatedTokens);
assert.equal(softwareTask.expected.totalQarinahEstimatedTokens, totalQarinahEstimatedTokens);
const weightedReduction = Math.round((1 - totalQarinahEstimatedTokens / totalBaselineEstimatedTokens) * 1_000_000) / 1_000_000;
assert.equal(softwareTask.expected.weightedEstimatedTokenReduction, weightedReduction);
assert.equal(
  softwareTask.expected.minimumScenarioEstimatedTokenReduction,
  Math.min(...softwareTask.expected.scenarios.map((scenario) => scenario.estimatedTokenReduction))
);

process.stdout.write("Benchmark evidence arithmetic and claim boundaries are valid.\n");
