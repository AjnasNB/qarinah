import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(await readFile(path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json"), "utf8"));
const resultBytes = await readFile(path.join(root, "bench", "results", "research-retrieval-development-v0.2.json"));
const result = JSON.parse(resultBytes);
const backup = JSON.parse(await readFile(path.join(root, "bench", "research", "development-backup-v0.2.json"), "utf8"));
const evaluator = await readFile(path.join(root, "scripts", "evaluate-research-retrieval-v0.2.mjs"), "utf8");
const research = await readFile(path.join(root, "docs", "RESEARCH-BENCHMARK.md"), "utf8");
const handoff = await readFile(path.join(root, "docs", "CROSS-AGENT-VIDEO-PROTOCOL.md"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const historicalCommit = "bd566ac5ba7b302653b994fd0622d516fa74bbb8";
const historicalTag = "research-retrieval-development-v0.2";
const run = promisify(execFile);

assert.equal(digest(resultBytes), "sha256:bfe8015811ffbecd5e3c00eb9f4a1e104478605cd605442a1ec96d67582e4b3f");
assert.equal(backup.commit, historicalCommit);
assert.equal(backup.tag, historicalTag);
assert.equal(backup.bundleSha256, "sha256:909794b4528c48c17bf69fdd3a2d1bfaac2d2c973dc40086e58dd6c7563e5a71");
assert.equal(backup.bundleVerified, true);
const resolvedHistoricalCommit = (await run("git", ["rev-parse", `${historicalTag}^{commit}`], { cwd: root })).stdout.trim();
assert.equal(resolvedHistoricalCommit, historicalCommit);
for (const fragment of [
  historicalTag,
  historicalCommit,
  "must not be recomputed with the current production runtime",
  "git worktree add ../qarinah-research-v0.2",
  "evaluate:research-retrieval:v0.4"
]) assert.ok(evaluator.includes(fragment), `Historical v0.2 evaluator guard is missing: ${fragment}`);

assert.equal(corpus.schemaVersion, "qarinah.research-corpus.swe-bench-lite-development.v2");
assert.equal(corpus.splitPolicy.exploratoryReuse, true);
assert.equal(corpus.repositoryCountAudit.officialPageDeclaredCount, 11);
assert.equal(corpus.repositoryCountAudit.pinnedRevisionObservedCount, 12);
assert.equal(corpus.repositoryCountAudit.discrepancy, true);
assert.equal(corpus.repositoryCountAudit.observedRepositories.length, 12);
assert.equal(corpus.generatedFrom.sourceArtifact.bytes, 1_119_540);
assert.equal(
  corpus.generatedFrom.sourceArtifact.sha256,
  "sha256:7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4"
);
assert.equal(corpus.tasks.length, 300);
assert.equal(corpus.contentDigest, digest(JSON.stringify({ repositories: corpus.repositories, tasks: corpus.tasks })));
assert.equal(corpus.relevanceOracle.humanValidated, false);

assert.equal(result.schemaVersion, "qarinah.research-retrieval-development-result.v2");
assert.equal(result.status, "exploratory-development-after-v0.1-inspection");
assert.equal(result.confirmatoryClaimEligible, false);
assert.equal(result.executionScope.providerModelCalls, 0);
assert.equal(result.executionScope.providerReportedTokens, false);
assert.equal(result.executionScope.sweBenchDockerTaskExecution, false);
assert.equal(result.executionScope.humanRelevanceReview, false);
assert.equal(result.expected.corpus.digest, corpus.contentDigest);
assert.equal(result.expected.corpus.exploratoryReuse, true);

for (const settingName of ["static", "onlinePrequential"]) {
  const setting = result.expected.settings[settingName];
  assert.equal(setting.tasks, 240);
  assert.equal(setting.positiveUnderStructuralOracle + setting.noPositiveUnderStructuralOracle, 240);
  for (const metric of ["meanRecallAt1", "meanRecallAt5", "meanRecallAt10", "meanReciprocalRank", "meanNdcgAt10"]) {
    assert.equal(
      setting.methods.qarinahV2[metric],
      setting.methods.bm25Admitted[metric],
      `${settingName} ${metric} must preserve admitted BM25 ranking.`
    );
    assert.equal(
      setting.methods.qarinahV2[metric],
      setting.methods.qarinahV2NoGraph[metric],
      `${settingName} graph ablation changed ${metric}; update the research claim before accepting.`
    );
  }
  assert.ok(setting.noTemporalAblation.futureItems > 0);
  assert.ok(setting.noTemporalAblation.futureItemRate > 0);
  assert.ok(setting.noTemporalAblation.affectedQueries > 0);
}

const online = result.expected.settings.onlinePrequential;
assert.equal(online.positiveUnderStructuralOracle, 209);
assert.equal(online.noPositiveUnderStructuralOracle, 31);
assert.equal(online.methods.qarinahV2.meanRecallAt10, 0.538341);
assert.equal(online.methods.qarinahV2.meanReciprocalRank, 0.695595);
assert.equal(online.methods.balancedV1.meanRecallAt10, 0.473421);
assert.equal(online.methods.balancedV1.meanReciprocalRank, 0.600665);
assert.equal(online.evidenceSufficiency.noPositiveFalseAcceptanceRate, 0.903226);
assert.equal(online.evidenceSufficiency.noPositiveCorrectAbstentionRate, 0.096774);
assert.equal(online.evidenceSufficiency.rocAuc, 0.537892);
assert.equal(online.noTemporalAblation.futureItems, 1_083);
assert.equal(online.noTemporalAblation.futureItemRate, 0.473339);
assert.equal(online.noTemporalAblation.affectedQueries, 240);

assert.equal(result.expected.inference[0].observedMeanDifference, 0);
assert.deepEqual(result.expected.inference[0].confidenceInterval95, [0, 0]);
assert.equal(result.expected.inference[1].clusters, 12);
assert.ok(result.expected.inference[1].confidenceInterval95[0] < 0);
assert.ok(result.expected.inference[1].confidenceInterval95[1] > 0);
assert.ok(result.expected.inference[2].confidenceInterval95[0] > 0);

for (const fragment of [
  "research-benchmark-exploratory-v0.1",
  "1,119,540 bytes",
  "official SWE-bench Lite page",
  "exactly matches admitted BM25 ranking",
  "90.32% false-acceptance rate",
  "1,083 future items",
  "not ready as a fail-closed semantic gate"
]) assert.ok(research.includes(fragment), `Research report is missing: ${fragment}`);

for (const fragment of [
  "Claude Code -> Qarinah -> Codex",
  "Codex -> Qarinah -> Claude Code",
  "machine-readable run record",
  "not statistical research evidence",
  "Never replace missing provider usage"
]) assert.ok(handoff.includes(fragment), `Video protocol is missing: ${fragment}`);

assert.equal(packageJson.scripts["prepare:research:v0.2"], "node scripts/prepare-research-benchmark-v0.2.mjs");
assert.equal(packageJson.scripts["evaluate:research-retrieval:v0.2"], "node scripts/evaluate-research-retrieval-v0.2.mjs");
assert.equal(packageJson.scripts["evaluate:research-retrieval:v0.2:write"], undefined);

process.stdout.write("Development-v0.2 corpus, retrieval results, claim boundaries, and video protocol are valid.\n");
