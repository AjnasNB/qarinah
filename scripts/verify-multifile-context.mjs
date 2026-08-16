import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const evidencePackageVersion = packageJson.version;
const result = JSON.parse(await readFile(
  path.join(root, "bench", "results", `multifile-context-${evidencePackageVersion}.json`),
  "utf8"
));
const benchmarks = await readFile(path.join(root, "docs", "BENCHMARKS.md"), "utf8");

assert.equal(result.schemaVersion, "qarinah.multifile-context-eval-result.v1");
assert.equal(result.packageVersion, evidencePackageVersion);
assert.deepEqual(result.fixture.fileCounts, [40, 50, 100]);
assert.equal(result.fixture.totalFiles, 190);
assert.equal(result.fixture.totalPositiveQueries, 380);
assert.equal(result.fixture.totalUnsupportedQueries, 9);
assert.equal(result.fixture.providerBillingMeasurement, false);
assert.equal(result.expected.allScalesPassed, true);
assert.deepEqual(result.expected.scales.map((scale) => scale.fileCount), [40, 50, 100]);

for (const scale of result.expected.scales) {
  assert.equal(scale.eventCount, scale.fileCount + 5);
  assert.equal(scale.exactQueries, scale.fileCount);
  assert.equal(scale.typoTolerantQueries, scale.fileCount);
  assert.equal(scale.cases.length, scale.fileCount * 2);
  assert.equal(scale.allTargetsRankedFirst, true);
  assert.equal(scale.allAnswersPreserved, true);
  assert.equal(scale.allExactQueriesUsedSqlite, true);
  assert.equal(scale.allTypoQueriesUsedFuzzyRetrieval, true);
  assert.equal(scale.allExactQueriesAcceptedDirect, true);
  assert.equal(scale.allTypoQueriesConservativelyAbstained, true);
  assert.equal(scale.persistedInMemoryParity, true);
  assert.equal(scale.projectStructure.filesScanned, scale.fileCount);
  assert.equal(scale.projectStructure.graphFileNodes, scale.fileCount);
  assert.equal(scale.projectStructure.graphReferenceEdges, scale.fileCount);
  assert.equal(scale.projectStructure.latePathAndReferencePreserved, true);
  assert.equal(scale.projectStructure.markdownFirstMiddleLastPathsPreserved, true);
  assert.equal(scale.graphLinkedDecisionRecovered, true);
  assert.equal(scale.supersededDecisionExcluded, true);
  assert.equal(scale.conflictVisible, true);
  assert.equal(scale.sqliteReadModel.eventCountMatchesLedger, true);
  assert.equal(scale.sqliteReadModel.headMatchesLedger, true);
  assert.equal(scale.sqliteReadModel.requiredTablesPresent, true);
  assert.equal(scale.sqliteReadModel.lateFileEvidenceFound, true);
  assert.equal(scale.derivedRepair.staleGraphDetectedAndRebuilt, true);
  assert.equal(scale.derivedRepair.staleMarkdownDetectedAndRebuilt, true);
  assert.equal(scale.derivedRepair.repairedRetrievalRank, 1);
  assert.equal(scale.correctAbstention, true);
  assert.equal(scale.abstention.length, 3);
  assert.equal(scale.abstention.every((control) => (
    control.correctAbstention && control.errorCode === "CONTEXT_COVERAGE_TOO_LOW"
  )), true);
  assert.equal(scale.storeVerified, true);
  assert.ok(scale.minimumEstimatedReduction > 0.9);
  for (const scenario of scale.cases) {
    assert.equal(scenario.targetRank, 1);
    assert.equal(scenario.answerPreserved, true);
    assert.equal(scenario.citationHashPresent, true);
    assert.equal(scenario.manifestHashPresent, true);
    assert.ok(["exact", "typo-tolerant"].includes(scenario.queryType));
    if (scenario.queryType === "exact") {
      assert.equal(scenario.sqliteCandidateUsed, true);
      assert.equal(scenario.coverage, "direct");
      assert.equal(scenario.evidenceDecision, "ACCEPT_DIRECT");
    } else {
      assert.equal(scenario.fuzzyCandidateUsed, true);
      assert.equal(scenario.coverage, "partial");
      assert.equal(scenario.evidenceDecision, "ABSTAIN");
    }
  }
}

assert.equal(packageJson.scripts["evaluate:multifile-context"], "node scripts/evaluate-multifile-context.mjs");
assert.equal(packageJson.scripts["evaluate:multifile-context:write"], "node scripts/evaluate-multifile-context.mjs --write");
assert.equal(packageJson.scripts["check:multifile-context"], "node scripts/verify-multifile-context.mjs");
assert.ok(benchmarks.includes("40-, 50-, and 100-file"));
assert.ok(benchmarks.includes("380 / 380"));
assert.ok(benchmarks.includes("successful fail-closed behavior"));

console.log(JSON.stringify({
  ok: true,
  packageVersion: result.packageVersion,
  fileCounts: result.fixture.fileCounts,
  totalFiles: result.fixture.totalFiles,
  positiveQueriesPassed: result.fixture.totalPositiveQueries,
  unsupportedQueriesCorrectlyRejected: result.fixture.totalUnsupportedQueries
}, null, 2));
