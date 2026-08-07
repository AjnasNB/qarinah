import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const sha256 = async (relativePath) => `sha256:${createHash("sha256").update(await readFile(path.join(root, relativePath))).digest("hex")}`;

const packageJson = await readJson("package.json");
const release = await readJson("bench/results/benchmark-release-0.1.5.json");
const software = await readJson("bench/results/software-task-context-0.1.0.json");
const continuation = await readJson("bench/results/continuation-context-0.1.5.json");
const smoke = await readJson("bench/results/codex-cross-session-continuation-0.1.5.json");
const retrieval = await readJson("bench/results/research-retrieval-development-v0.2.json");
const sufficiency = await readJson("bench/results/research-sufficiency-development-v0.3.json");
const finalManifest = await readJson("bench/final/final-task-manifest-v1.json");
const abstentionControls = await readJson("bench/final/final-abstention-controls-v1.json");
const contamination = await readJson("bench/final/contamination-audit-v1.json");

assert.equal(release.schemaVersion, "qarinah.benchmark-release.v1");
assert.equal(release.packageVersion, packageJson.version);
assert.equal(release.packageVersion, "0.1.5");
assert.equal(release.paperVersion, "1.1");
assert.deepEqual(release.portableTokenEstimator, {
  method: "ceil(characters / 4)",
  exactProviderTokenizer: false,
  providerBillingMeasurement: false
});

for (const artifact of [
  ...release.headlineContextResults.map((result) => result.artifact),
  ...release.realRepositoryDevelopmentStudy.artifacts,
  release.providerBackedProductSmoke.artifact,
  ...release.frozenConfirmatoryProtocol.artifacts
]) {
  assert.match(artifact.sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(await sha256(artifact.path), artifact.sha256, `${artifact.path} hash must match the release manifest`);
}

const [primary, capsule, auditPack] = release.headlineContextResults;
assert.equal(primary.id, "six-task-repeated-context");
assert.equal(primary.baselineEstimatedTokens, software.expected.totalBaselineEstimatedTokens);
assert.equal(primary.qarinahEstimatedTokens, software.expected.totalQarinahEstimatedTokens);
assert.equal(primary.exactReduction, software.expected.weightedEstimatedTokenReduction);
assert.equal(primary.displayReduction, "98.7148%");
assert.equal(software.expected.records, 240);
assert.equal(software.expected.cases, 6);
assert.equal(software.expected.allTargetsInTopFive, true);
assert.equal(software.expected.allCoverageDirect, true);

assert.equal(capsule.id, "two-session-model-facing-capsule");
assert.equal(capsule.baselineEstimatedTokens, continuation.expected.rawHistoryTokens);
assert.equal(capsule.qarinahEstimatedTokens, continuation.expected.capsuleTokens);
assert.equal(capsule.exactReduction, continuation.expected.capsuleEstimatedTokenReduction);
assert.equal(capsule.displayReduction, "98.75%");
assert.equal(continuation.expected.capsuleSummaryEventLinked, true);
assert.equal(continuation.expected.capsuleManifestLinked, true);

assert.equal(auditPack.id, "two-session-complete-audit-pack");
assert.equal(auditPack.baselineEstimatedTokens, continuation.expected.rawHistoryTokens);
assert.equal(auditPack.qarinahEstimatedTokens, continuation.expected.packTokens);
assert.equal(auditPack.exactReduction, continuation.expected.estimatedTokenReduction);
assert.equal(auditPack.displayReduction, "89.05%");
assert.equal(continuation.expected.sourceIdsPreserved, true);
assert.equal(continuation.expected.sourceHashesPreserved, true);

assert.equal(smoke.packageVersion, packageJson.version);
assert.equal(smoke.classification, "provider-backed-product-smoke-not-controlled-research");
assert.equal(smoke.isolation.distinctThreadIds, true);
assert.equal(smoke.isolation.nativeResumeUsed, false);
assert.equal(smoke.handoff.contextQueryObservedInAgentB, true);
assert.equal(smoke.outcome.acceptanceTestsPassed, true);

const online = retrieval.expected.settings.onlinePrequential;
const development = release.realRepositoryDevelopmentStudy;
assert.equal(development.dataset.tasks, retrieval.expected.corpus.tasks);
assert.equal(development.dataset.heldoutQueries, retrieval.expected.corpus.heldoutTasks);
assert.equal(development.dataset.rawTestParquetSha256, retrieval.expected.corpus.rawTestParquetSha256);
assert.equal(development.onlinePrequential.scorableQueries, online.methods.qarinahV2.scorableTasks);
assert.equal(development.onlinePrequential.qarinahV2RecallAt10, online.methods.qarinahV2.meanRecallAt10);
assert.equal(development.onlinePrequential.qarinahV2MeanReciprocalRank, online.methods.qarinahV2.meanReciprocalRank);
assert.equal(development.onlinePrequential.balancedV1MeanReciprocalRank, online.methods.balancedV1.meanReciprocalRank);
assert.equal(development.onlinePrequential.graphRankingImprovement, 0);
assert.equal(online.methods.qarinahV2.meanReciprocalRank, online.methods.bm25Admitted.meanReciprocalRank);
assert.equal(online.methods.qarinahV2NoGraph.meanReciprocalRank, online.methods.qarinahV2.meanReciprocalRank);

for (const setting of ["static", "onlinePrequential"]) {
  const releasedGate = development.conservativeEvidenceGate[setting];
  const sourceGate = sufficiency.settings[setting].directDecision;
  assert.equal(releasedGate.acceptedDirect, sourceGate.acceptedDirect);
  assert.equal(releasedGate.queries, sourceGate.tasks);
  assert.equal(releasedGate.observedFalseAccepts, sourceGate.falsePositive);
  assert.equal(releasedGate.structuralOracleNegativeQueries, sourceGate.noPositiveUnderStructuralOracle);
  assert.equal(releasedGate.acceptanceCoverage, sourceGate.acceptanceCoverage);
  assert.equal(releasedGate.falseAcceptanceRateExact95Upper, sourceGate.confidenceIntervals95.falseAcceptanceRate.upper);
}
assert.equal(development.conservativeEvidenceGate.humanValidatedRelevance, false);

assert.equal(finalManifest.resultsObserved, false);
assert.equal(finalManifest.counts.sourceTasks, 500);
assert.equal(finalManifest.counts.eligibleFinalRetrievalTasks, 387);
assert.equal(finalManifest.counts.agentSampleTasks, 40);
assert.equal(abstentionControls.resultsObserved, false);
assert.equal(abstentionControls.tasks.length, 20);
assert.equal(contamination.exact_instance_overlap, 0);
assert.equal(contamination.near_duplicate_candidates.length, 0);
assert.equal(contamination.finalResultsObservedBeforeAudit, false);
assert.equal(release.frozenConfirmatoryProtocol.resultsObserved, false);

assert.deepEqual(release.citations.map(({ id }) => id), [
  "swe-bench-iclr-2024",
  "swe-bench-lite-pinned-dataset",
  "bm25-okapi-trec-3",
  "longmemeval-iclr-2025",
  "swe-bench-verified"
]);
for (const citation of release.citations) assert.match(citation.url, /^https:\/\//u);

console.log(JSON.stringify({
  ok: true,
  packageVersion: release.packageVersion,
  paperVersion: release.paperVersion,
  headlineResults: release.headlineContextResults.map(({ id, displayReduction }) => ({ id, displayReduction })),
  realRepositoryQueries: development.dataset.heldoutQueries,
  confirmatoryResultsObserved: release.frozenConfirmatoryProtocol.resultsObserved
}, null, 2));
