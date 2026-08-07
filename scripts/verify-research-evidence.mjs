import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(await readFile(path.join(root, "bench", "research", "swe-bench-lite-v1.json"), "utf8"));
const result = JSON.parse(await readFile(path.join(root, "bench", "results", "research-retrieval-0.1.2.json"), "utf8"));
const research = await readFile(path.join(root, "docs", "RESEARCH-BENCHMARK.md"), "utf8");
const benchmarks = await readFile(path.join(root, "docs", "BENCHMARKS.md"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

assert.equal(corpus.schemaVersion, "qarinah.research-corpus.swe-bench-lite.v1");
assert.deepEqual(corpus.counts, {
  repositories: 12,
  totalTasks: 300,
  warmupTasks: 60,
  heldoutTasks: 240
});
assert.equal(corpus.repositories.length, 12);
assert.equal(corpus.tasks.length, 300);
assert.equal(new Set(corpus.tasks.map((task) => task.instanceId)).size, 300);
assert.equal(corpus.tasks.filter((task) => task.phase === "warmup").length, 60);
assert.equal(corpus.tasks.filter((task) => task.phase === "heldout").length, 240);
assert.equal(corpus.contentDigest, sha256(JSON.stringify({ repositories: corpus.repositories, tasks: corpus.tasks })));
assert.equal(corpus.artifactPolicy.redistributedUpstreamText, false);
assert.equal(corpus.artifactPolicy.redistributedPatches, false);
for (const task of corpus.tasks) {
  for (const prohibited of ["problem_statement", "problemStatement", "patch", "test_patch", "testPatch", "hints_text"]) {
    assert.equal(Object.hasOwn(task, prohibited), false, `Corpus task ${task.instanceId} redistributes ${prohibited}.`);
  }
  assert.match(task.baseCommit, /^[a-f0-9]{40}$/u);
  assert.ok(task.changedFiles.length > 0);
  for (const digest of Object.values(task.hashes)) assert.match(digest, /^sha256:[a-f0-9]{64}$/u);
}

assert.equal(result.schemaVersion, "qarinah.research-retrieval-eval-result.v1");
// Exploratory v0.1 is a frozen historical artifact. A later package release
// must not relabel the version that produced the observed result.
assert.equal(result.packageVersion, "0.1.2");
assert.equal(result.executionScope.providerModelCalls, 0);
assert.equal(result.executionScope.providerReportedTokens, false);
assert.equal(result.executionScope.sweBenchDockerTaskExecution, false);
assert.equal(result.executionScope.humanCodeReview, false);
assert.equal(result.expected.corpus.digest, corpus.contentDigest);
assert.equal(result.expected.evaluation.heldoutTasks, 240);
assert.equal(result.expected.taskResults.length, 240);
assert.equal(result.expected.evaluation.scorableTasks, result.expected.taskResults.filter((task) => task.scorable).length);
assert.equal(
  result.expected.evaluation.unsupportedByFileOverlapOracle,
  result.expected.evaluation.heldoutTasks - result.expected.evaluation.scorableTasks
);
assert.equal(result.expected.evaluation.scorableTasks, 79);
assert.equal(result.expected.evaluation.unsupportedByFileOverlapOracle, 161);
assert.equal(result.expected.evaluation.coverageGateAccepted, 240);
assert.equal(result.expected.evaluation.noCoverageGateAdditionalAcceptances, 0);
assert.equal(result.expected.evaluation.noTemporalFutureCitations, 971);
assert.equal(result.expected.evaluation.noTemporalFutureCitationRate, 0.424388);

const fullHistory = result.expected.baselines.fullHistory;
const qarinah = result.expected.baselines.qarinah;
assert.equal(
  fullHistory.qarinahEstimatedTokenReduction,
  Math.round((1 - qarinah.totalEstimatedContextTokens / fullHistory.totalEstimatedContextTokens) * 1_000_000) / 1_000_000
);
assert.equal(fullHistory.totalEstimatedContextTokens, 3_502_258);
assert.equal(qarinah.totalEstimatedContextTokens, 923_376);
assert.equal(result.expected.baselines.bm25.meanRecallAt10, 0.68692);
assert.equal(qarinah.meanRecallAt10, 0.518143);
assert.equal(result.expected.baselines.bm25.meanReciprocalRank, 0.429712);
assert.equal(qarinah.meanReciprocalRank, 0.31951);
assert.ok(result.expected.inference.every((comparison) => comparison.observedMeanDifference < 0));
assert.ok(result.expected.inference.every((comparison) => comparison.confidenceInterval95[1] < 0));

const adversarial = result.expected.adversarial;
assert.equal(adversarial.repositories, 12);
assert.equal(adversarial.adversarialRecords, 72);
assert.equal(adversarial.forbiddenRecordsReturned, 0);
for (const property of [
  "allActiveEvidenceReturned", "allFutureRejected", "allExpiredRejected", "allStaleRejected",
  "allUnauthorizedRejected", "allSupersededRejected"
]) assert.equal(adversarial[property], true, `${property} must remain true.`);

for (const fragment of [
  "Research draft; exploratory v0.1 frozen, development v0.2 and historical calibration v0.3 preserved, current production-bound development v0.4 completed, not peer-reviewed and not preregistered",
  "Plain BM25 outperforms the original Qarinah balanced hybrid ranking",
  "0.687 versus 0.518",
  "971 future citations",
  "42.44%",
  "provider-reported usage and does not include",
  "must not claim improved SWE-bench resolve rate"
]) assert.ok(research.includes(fragment), `Research report is missing: ${fragment}`);

for (const repository of corpus.repositories) {
  assert.ok(research.includes(`https://github.com/${repository.repository}`), `Research report must cite ${repository.repository}.`);
}
assert.ok(benchmarks.includes("BM25 outperforms the original balanced-v1 Qarinah ranker"));
assert.ok(packageJson.files.includes("docs/RESEARCH-BENCHMARK.md"));
assert.equal(packageJson.scripts["prepare:research"], "node scripts/prepare-research-benchmark.mjs");
assert.equal(packageJson.scripts["evaluate:research-retrieval"], "node scripts/evaluate-research-retrieval.mjs");

process.stdout.write("Research corpus, claim boundaries, arithmetic, and governance evidence are valid.\n");
