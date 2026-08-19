import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const sha256 = async (relativePath) => `sha256:${createHash("sha256").update(await readFile(path.join(root, relativePath))).digest("hex")}`;
const historicalPaperSourceCommit = "785b3b1734b92bf37f91c41bc6b48a71c0149a92";
const readHistoricalBlob = (relativePath) => execFileSync(
  "git",
  ["show", `${historicalPaperSourceCommit}:${relativePath}`],
  { cwd: root, encoding: "buffer", windowsHide: true }
);

const packageJson = await readJson("package.json");
const release = await readJson("bench/results/benchmark-release-0.1.6.json");
const software = await readJson("bench/results/software-task-context-0.1.0.json");
const continuation = await readJson("bench/results/continuation-context-0.1.6.json");
const multifile = await readJson("bench/results/multifile-context-0.1.6.json");
const historicalSmoke = await readJson("bench/results/codex-cross-session-continuation-0.1.5.json");
const currentResearch = await readJson("bench/results/research-retrieval-development-v0.4.json");
const finalManifest = await readJson("bench/final/final-task-manifest-v1.json");
const abstentionControls = await readJson("bench/final/final-abstention-controls-v1.json");
const contamination = await readJson("bench/final/contamination-audit-v1.json");
const paperPdf = await readFile(path.join(root, release.paperArtifact.path));
const paperSourceReceipt = (await readFile(path.join(root, release.paperArtifact.sourceReceiptPath), "utf8")).trim();
const paperPdfReceipt = (await readFile(path.join(root, release.paperArtifact.pdfReceiptPath), "utf8")).trim();
const paperBuildMetadata = await readJson(release.paperArtifact.buildMetadataPath);
const paperSourcePaths = [
  "docs/WHITEPAPER.md",
  "scripts/build-whitepaper-pdf.py",
  "scripts/build-whitepaper-pdf-v1.3.py"
];
const paperSourceBytes = await Promise.all(
  paperSourcePaths.map(async (relativePath) => readHistoricalBlob(relativePath))
);
const whitePaperSource = paperSourceBytes[0].toString("utf8");

execFileSync("git", ["merge-base", "--is-ancestor", historicalPaperSourceCommit, "HEAD"], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true
});

assert.equal(release.schemaVersion, "qarinah.benchmark-release.v2");
assert.equal(packageJson.version, "0.4.0");
assert.equal(release.packageVersion, "0.1.6");
assert.equal(release.paperVersion, "1.3");
assert.equal(release.status, "release-candidate-locally-verified-not-published");
assert.equal(release.receiptScope, "timestamped-pre-publication-local-verification");
assert.match(release.lifecycleSemantics, /not a live publication-status endpoint/u);
assert.equal(release.preparedAt, "2026-08-08");
assert.equal(release.paperArtifact.status, "local-release-candidate-zenodo-version-doi-reserved");
assert.equal(release.paperArtifact.conceptDoi, "10.5281/zenodo.21547684");
assert.equal(release.paperArtifact.newVersionDoi, "10.5281/zenodo.21843240");
assert.equal(release.paperArtifact.zenodoDraftRecordId, "21843240");
assert.equal(release.paperArtifact.doiStatus, "reserved-draft-not-registered-or-published");
assert.equal(await sha256(release.paperArtifact.path), release.paperArtifact.sha256);
assert.equal(await sha256(release.paperArtifact.sourceReceiptPath), release.paperArtifact.sourceReceiptSha256);
assert.equal(await sha256(release.paperArtifact.pdfReceiptPath), release.paperArtifact.pdfReceiptSha256);
assert.equal(await sha256(release.paperArtifact.buildMetadataPath), release.paperArtifact.buildMetadataSha256);
assert.ok(paperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii")));
assert.ok(paperPdf.length > 150_000);
assert.equal(
  paperPdfReceipt,
  `${release.paperArtifact.sha256.slice("sha256:".length)}  ${release.paperArtifact.path}`
);
const paperSourceHash = createHash("sha256");
for (const [index, sourceBytes] of paperSourceBytes.entries()) {
  if (index) paperSourceHash.update(Buffer.from([0]));
  paperSourceHash.update(sourceBytes);
}
const paperSourceDigest = paperSourceHash.digest("hex");
assert.equal(paperSourceReceipt, `${paperSourceDigest}  ${paperSourcePaths.join("+")}`);
assert.equal(paperBuildMetadata.schemaVersion, "qarinah.white-paper-build.v1");
assert.equal(paperBuildMetadata.paperVersion, "1.3");
assert.equal(paperBuildMetadata.combinedSourceSha256, `sha256:${paperSourceDigest}`);
assert.equal(
  paperBuildMetadata.sourceDigestAlgorithm,
  "sha256(file-bytes + NUL + file-bytes + NUL + file-bytes; listed order)"
);
assert.deepEqual(
  paperBuildMetadata.sources,
  paperSourcePaths.map((relativePath, index) => ({
    path: relativePath,
    sha256: `sha256:${createHash("sha256").update(paperSourceBytes[index]).digest("hex")}`
  }))
);
assert.equal(paperBuildMetadata.generator.command, "python scripts/build-whitepaper-pdf-v1.3.py");
for (const field of ["pythonImplementation", "pythonVersion", "reportlabVersion", "platform"]) {
  assert.match(paperBuildMetadata.generator[field], /\S/u, `generator.${field} must be recorded`);
}
assert.deepEqual(paperBuildMetadata.generator.fonts.map(({ role }) => role), ["body", "bold", "italic", "monospace"]);
for (const font of paperBuildMetadata.generator.fonts) {
  assert.match(font.registeredName, /\S/u);
  if (font.fileName === null) assert.equal(font.sha256, null);
  else assert.match(font.sha256, /^[0-9a-f]{64}$/u);
}
assert.match(whitePaperSource, /\*\*Paper version:\*\* 1\.3/u);
assert.match(whitePaperSource, /\*\*Implementation:\*\* Qarinah `0\.1\.6`/u);
assert.match(whitePaperSource, /\[10\.5281\/zenodo\.21843240\]\(https:\/\/doi\.org\/10\.5281\/zenodo\.21843240\)/u);
assert.match(whitePaperSource, /\[10\.5281\/zenodo\.21547684\]\(https:\/\/doi\.org\/10\.5281\/zenodo\.21547684\)/u);

assert.deepEqual(release.portableTokenEstimator, {
  method: "ceil(characters / 4)",
  exactProviderTokenizer: false,
  providerBillingMeasurement: false
});

for (const artifact of [
  ...release.headlineContextResults.map((result) => result.artifact),
  release.multiFileProjectStudy.artifact,
  ...release.realRepositoryDevelopmentStudy.artifacts,
  release.providerBackedProductSmoke.historicalReceipt.artifact,
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

assert.equal(continuation.packageVersion, release.packageVersion);
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

assert.equal(multifile.packageVersion, release.packageVersion);
assert.equal(release.multiFileProjectStudy.totalFiles, multifile.fixture.totalFiles);
assert.equal(release.multiFileProjectStudy.positiveQueriesPassed, multifile.fixture.totalPositiveQueries);
assert.equal(release.multiFileProjectStudy.unsupportedQueriesCorrectlyRejected, multifile.fixture.totalUnsupportedQueries);
assert.equal(release.multiFileProjectStudy.allScalesPassed, multifile.expected.allScalesPassed);
assert.deepEqual(
  release.multiFileProjectStudy.scales.map(({ fileCount, positiveQueriesPassed, minimumEstimatedReduction }) => ({
    fileCount,
    positiveQueriesPassed,
    minimumEstimatedReduction
  })),
  multifile.expected.scales.map((scale) => ({
    fileCount: scale.fileCount,
    positiveQueriesPassed: scale.exactQueries + scale.typoTolerantQueries,
    minimumEstimatedReduction: scale.minimumEstimatedReduction
  }))
);

const development = release.realRepositoryDevelopmentStudy;
const staticSetting = currentResearch.expected.settings.static;
const onlineSetting = currentResearch.expected.settings.onlinePrequential;
assert.equal(currentResearch.packageVersion, release.packageVersion);
assert.equal(currentResearch.implementation.evidenceSufficiencyMethod, "evidence-sufficiency-v2");
assert.equal(development.dataset.tasks, currentResearch.expected.corpus.tasks);
assert.equal(development.dataset.heldoutQueries, currentResearch.expected.corpus.heldoutTasks);
assert.equal(development.dataset.rawTestParquetSha256, currentResearch.expected.corpus.rawTestParquetSha256);
assert.equal(development.onlinePrequential.scorableQueries, onlineSetting.methods.qarinahV2.scorableTasks);
assert.equal(development.onlinePrequential.qarinahV2RecallAt10, onlineSetting.methods.qarinahV2.meanRecallAt10);
assert.equal(development.onlinePrequential.qarinahV2MeanReciprocalRank, onlineSetting.methods.qarinahV2.meanReciprocalRank);
assert.equal(development.onlinePrequential.balancedV1MeanReciprocalRank, onlineSetting.methods.balancedV1.meanReciprocalRank);
assert.equal(development.onlinePrequential.graphRankingImprovement, 0);
assert.equal(onlineSetting.methods.qarinahV2.meanReciprocalRank, onlineSetting.methods.bm25Admitted.meanReciprocalRank);
assert.equal(onlineSetting.methods.qarinahV2NoGraph.meanReciprocalRank, onlineSetting.methods.qarinahV2.meanReciprocalRank);
assert.equal(development.productionBoundEvidenceGate.method, "evidence-sufficiency-v2");

for (const [releasedName, sourceSetting] of [
  ["static", staticSetting],
  ["onlinePrequential", onlineSetting]
]) {
  const releasedGate = development.productionBoundEvidenceGate[releasedName];
  const sourceGate = sourceSetting.directDecision;
  assert.equal(releasedGate.acceptedDirect, sourceGate.acceptedDirect);
  assert.equal(releasedGate.queries, sourceGate.tasks);
  assert.equal(releasedGate.observedFalseAccepts, sourceGate.falsePositive);
  assert.equal(releasedGate.structuralOracleNegativeQueries, sourceGate.noPositiveUnderStructuralOracle);
  assert.equal(releasedGate.acceptanceCoverage, sourceGate.acceptanceCoverage);
  assert.equal(releasedGate.acceptedPrecisionExact95Lower, sourceGate.confidenceIntervals95.acceptedPrecision.lower);
  assert.equal(releasedGate.falseAcceptanceRateExact95Upper, sourceGate.confidenceIntervals95.falseAcceptanceRate.upper);
}
assert.equal(development.productionBoundEvidenceGate.humanValidatedRelevance, false);
assert.deepEqual(development.artifacts.map(({ role }) => role), [
  "current-production-bound-development-v0.4",
  "historical-development-v0.2",
  "historical-threshold-calibration-v0.3"
]);

const provider = release.providerBackedProductSmoke;
assert.equal(provider.currentReleaseReceiptPresent, false);
assert.equal(provider.currentReleaseProviderCalls, 0);
assert.equal(provider.currentReleaseClaimEligible, false);
assert.equal(provider.historicalReceipt.packageVersion, "0.1.5");
assert.equal(historicalSmoke.packageVersion, "0.1.5");
assert.equal(historicalSmoke.classification, "provider-backed-product-smoke-not-controlled-research");
assert.equal(historicalSmoke.isolation.distinctThreadIds, true);
assert.equal(historicalSmoke.isolation.nativeResumeUsed, false);
assert.equal(historicalSmoke.handoff.contextQueryObservedInAgentB, true);
assert.equal(historicalSmoke.outcome.acceptanceTestsPassed, true);

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
assert.ok(release.claimBoundary.some((claim) => claim.includes("reserved for a Zenodo draft") && claim.includes("not registered or published")));
assert.ok(release.claimBoundary.some((claim) => claim.includes("historical Qarinah 0.1.5")));

console.log(JSON.stringify({
  ok: true,
  status: release.status,
  packageVersion: release.packageVersion,
  paperVersion: release.paperVersion,
  paperSha256: release.paperArtifact.sha256,
  versionDoi: release.paperArtifact.newVersionDoi,
  doiStatusAtReceiptCreation: release.paperArtifact.doiStatus,
  headlineResults: release.headlineContextResults.map(({ id, displayReduction }) => ({ id, displayReduction })),
  productionEvidenceGate: {
    staticAcceptedDirect: development.productionBoundEvidenceGate.static.acceptedDirect,
    onlineAcceptedDirect: development.productionBoundEvidenceGate.onlinePrequential.acceptedDirect,
    observedFalseAccepts: 0
  },
  providerReceiptScope: provider.historicalReceipt.classification,
  confirmatoryResultsObserved: release.frozenConfirmatoryProtocol.resultsObserved
}, null, 2));
