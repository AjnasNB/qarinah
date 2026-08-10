import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const livePath = path.join(root, "bench", "results", "live-workspace-volume-2026-07-21.json");
const live = JSON.parse(await readFile(livePath, "utf8"));
const softwareTaskPath = path.join(root, "bench", "results", "software-task-context-0.1.1.json");
const softwareTask = JSON.parse(await readFile(softwareTaskPath, "utf8"));
const longDocumentPath = path.join(root, "bench", "results", "long-document-context-0.1.1.json");
const longDocument = JSON.parse(await readFile(longDocumentPath, "utf8"));
const readme = await readFile(path.join(root, "README.md"), "utf8");
const whitePaper = await readFile(path.join(root, "docs", "WHITEPAPER.md"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const platformCopy = await readFile(path.join(root, "docs", "launch", "PLATFORM-COPY.md"), "utf8");
const publicMetricsCopy = await readFile(path.join(root, "docs", "PUBLIC-METRICS.md"), "utf8");

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

const publicPercent = `${(weightedReduction * 100).toFixed(2)}%`;
const compressionRatio = (totalBaselineEstimatedTokens / totalQarinahEstimatedTokens).toFixed(2);
const savedEstimatedTokens = totalBaselineEstimatedTokens - totalQarinahEstimatedTokens;
const baselineAtOneDollarPerMillion = totalBaselineEstimatedTokens / 1_000_000;
const qarinahAtOneDollarPerMillion = totalQarinahEstimatedTokens / 1_000_000;
const illustrativeUsdPerMillion = 3;
const baselineAtIllustrativeRate = baselineAtOneDollarPerMillion * illustrativeUsdPerMillion;
const qarinahAtIllustrativeRate = qarinahAtOneDollarPerMillion * illustrativeUsdPerMillion;
const savedAtIllustrativeRate = (savedEstimatedTokens / 1_000_000) * illustrativeUsdPerMillion;
const savedAcrossTenRepeatsAtIllustrativeRate = savedAtIllustrativeRate * 10;

assert.equal(publicPercent, "98.71%");
assert.equal(compressionRatio, "77.81");
assert.equal(savedEstimatedTokens, 436_431);
for (const [surface, content] of [
  ["README.md", readme],
  ["docs/WHITEPAPER.md", whitePaper],
  ["package.json description", packageJson.description],
  ["docs/launch/PLATFORM-COPY.md", platformCopy]
]) {
  assert.ok(content.includes(publicPercent), `${surface} must carry the evidence-derived ${publicPercent} claim.`);
}
assert.equal(
  `${readme}\n${whitePaper}\n${packageJson.description}\n${platformCopy}`.toLowerCase().includes("in our six-task benchmark"),
  false,
  "Public-facing copy must lead with the result instead of the removed six-task qualifier."
);
assert.ok(readme.includes(`${compressionRatio}:1 context compression`));
assert.ok(whitePaper.includes(`${compressionRatio}:1 compression ratio`));
assert.ok(whitePaper.includes(`**${totalBaselineEstimatedTokens.toLocaleString("en-US")}**`));
assert.ok(whitePaper.includes(`**${totalQarinahEstimatedTokens.toLocaleString("en-US")}**`));
assert.ok(whitePaper.includes(`${savedEstimatedTokens.toLocaleString("en-US")} fewer estimated input-context tokens`));
assert.ok(readme.includes(`$${baselineAtOneDollarPerMillion.toFixed(4)}`));
assert.ok(readme.includes(`$${qarinahAtOneDollarPerMillion.toFixed(4)}`));
assert.ok(readme.includes(`${publicPercent} lower input-context cost at the same token rate.`));
for (const surface of [readme, platformCopy, publicMetricsCopy]) {
  assert.ok(surface.includes(`${compressionRatio}:1 baseline-to-pack ratio`));
  assert.ok(surface.includes(`$${baselineAtIllustrativeRate.toFixed(6)}`));
  assert.ok(surface.includes(`$${qarinahAtIllustrativeRate.toFixed(6)}`));
  assert.ok(surface.includes(`$${savedAtIllustrativeRate.toFixed(6)}`));
}
assert.ok(readme.includes(`$${savedAcrossTenRepeatsAtIllustrativeRate.toFixed(6)}`));
assert.ok(publicMetricsCopy.includes(`$${savedAcrossTenRepeatsAtIllustrativeRate.toFixed(6)}`));
for (const flatRate of [1, 3, 5, 15]) {
  const baselineCost = baselineAtOneDollarPerMillion * flatRate;
  const qarinahCost = qarinahAtOneDollarPerMillion * flatRate;
  const savedCost = ((savedEstimatedTokens / 1_000_000) * flatRate);
  const readmeCostRow = `| $${flatRate}/M tokens | $${baselineCost.toFixed(6)} | $${qarinahCost.toFixed(6)} | $${savedCost.toFixed(6)} |`;
  assert.ok(readme.includes(readmeCostRow), `README.md must carry the evidence-derived cost row: ${readmeCostRow}`);
}
assert.ok(publicMetricsCopy.includes("Do not say agents run 70x longer"));
assert.ok(whitePaper.includes(`**${publicPercent} lower input-context cost at the same token rate**`));
assert.ok(whitePaper.includes("not a claim of 98.71% lower total application cost"));
assert.ok(whitePaper.includes("not peer-reviewed"));
assert.ok(platformCopy.includes(`${publicPercent} lower input-context cost at the same input-token rate.`));

for (const prohibitedClaim of [
  "smallest verified project memory",
  "every memory points back to proof",
  "only the evidence it needs",
  "only the cited context needed",
    "automatically injects context",
    "90% faster coding",
    "80-90% lower total cost"
  ]) {
  assert.equal(
    `${readme}\n${whitePaper}\n${packageJson.description}\n${platformCopy}`.toLowerCase().includes(prohibitedClaim),
    false,
    `Public copy contains the unsupported claim: ${prohibitedClaim}`
  );
}

assert.equal(longDocument.schemaVersion, "qarinah.long-document-context-eval-result.v1");
assert.equal(longDocument.packageVersion, softwareTask.packageVersion);
assert.ok(longDocument.expected.fixture.sourceEstimatedTokens >= 10_000);
assert.equal(
  longDocument.expected.fixture.sourceEstimatedTokens,
  Math.ceil(longDocument.expected.fixture.sourceChars / 4)
);
assert.match(longDocument.expected.fixture.sourceSha256, /^sha256:[a-f0-9]{64}$/u);
assert.equal(longDocument.expected.fixture.providerBillingMeasurement, false);
assert.equal(longDocument.expected.result.allAnswersPreserved, true);
assert.equal(longDocument.expected.result.allTargetsRankedFirst, true);
assert.equal(longDocument.expected.result.unsupportedQueriesFailedClosed, true);
assert.equal(longDocument.expected.result.modelSummaryItems, 0);
assert.ok(
  longDocument.expected.result.maximumUsedTokens
    <= longDocument.expected.fixture.fixedMaxTokens
);
assert.ok(longDocument.expected.result.minimumEstimatedTokenReduction >= 0.95);
assert.equal(
  longDocument.expected.result.cases.length,
  longDocument.expected.fixture.positiveCases
);
assert.equal(
  longDocument.expected.result.unsupported.length,
  longDocument.expected.fixture.unsupportedCases
);
for (const scenario of longDocument.expected.result.cases) {
  assert.equal(scenario.targetRank, 1);
  assert.equal(scenario.answerPreserved, true);
  assert.equal(scenario.sourceHashPresent, true);
  assert.equal(scenario.manifestHashPresent, true);
  assert.equal(scenario.summaryItems, 0);
  assert.equal(scenario.usedTokens, Math.ceil(scenario.usedChars / 4));
  assert.equal(
    scenario.estimatedTokenReduction,
    Math.round(
      (1 - scenario.usedTokens / longDocument.expected.fixture.sourceEstimatedTokens)
        * 1_000_000
    ) / 1_000_000
  );
}
for (const control of longDocument.expected.result.unsupported) {
  assert.equal(control.failedClosed, true);
  assert.equal(control.errorCode, "CONTEXT_COVERAGE_TOO_LOW");
}
assert.ok(whitePaper.includes(`${longDocument.expected.fixture.positiveCases}`));
assert.ok(whitePaper.includes(`${longDocument.expected.result.unsupported.length} / ${longDocument.expected.result.unsupported.length}`));
assert.ok(
  whitePaper.includes(
    `${(longDocument.expected.result.minimumEstimatedTokenReduction * 100).toFixed(1)}% estimated context reduction`
  )
);

process.stdout.write("Benchmark evidence arithmetic and claim boundaries are valid.\n");
