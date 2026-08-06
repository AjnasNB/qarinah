import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (...segments) => JSON.parse(await readFile(path.join(root, ...segments), "utf8"));
const readText = (...segments) => readFile(path.join(root, ...segments), "utf8");
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

const [repositoryManifest, backup, sufficiency, review, admin, retrieval, schema, research, benchmarks, packageJson] = await Promise.all([
  readJson("bench", "research", "repository-manifest-v0.2.json"),
  readJson("bench", "research", "development-backup-v0.2.json"),
  readJson("bench", "results", "research-sufficiency-development-v0.3.json"),
  readJson("bench", "research", "relevance-audit-review-v0.3.json"),
  readJson("bench", "research", "relevance-audit-admin-v0.3.json"),
  readText("src", "retrieval.js"),
  readJson("schemas", "context-pack.schema.json"),
  readText("docs", "RESEARCH-BENCHMARK.md"),
  readText("docs", "BENCHMARKS.md"),
  readJson("package.json")
]);

const { content_sha256: repositoryDigest, ...repositoryContent } = repositoryManifest;
assert.equal(repositoryDigest, sha256(JSON.stringify(repositoryContent)));
assert.deepEqual(repositoryManifest.splits_loaded, ["test"]);
assert.equal(repositoryManifest.development_split_combined, false);
assert.equal(repositoryManifest.row_count_before_filtering, 300);
assert.equal(repositoryManifest.row_count_after_filtering, 300);
assert.equal(repositoryManifest.exact_repo_identifiers.length, 12);
assert.equal(repositoryManifest.normalized_projects.length, 12);
assert.deepEqual(repositoryManifest.duplicate_instance_ids, []);
assert.equal(repositoryManifest.official_count_resolution.official_page_declared_test_repositories, 11);
assert.equal(repositoryManifest.official_count_resolution.pinned_test_artifact_normalized_projects, 12);
assert.equal(repositoryManifest.official_count_resolution.aliases_or_case_variants_found, false);
assert.ok(repositoryManifest.historical_revision_audit.every((revision) => revision.repository_count === 12));

assert.equal(backup.commit, "bd566ac5ba7b302653b994fd0622d516fa74bbb8");
assert.equal(backup.tag, "research-retrieval-development-v0.2");
assert.equal(backup.bundleSha256, "sha256:909794b4528c48c17bf69fdd3a2d1bfaac2d2c973dc40086e58dd6c7563e5a71");
assert.equal(backup.bundleVerified, true);
assert.equal(backup.remotePublished, false);

assert.equal(sufficiency.productionRule.method, "evidence-sufficiency-v2");
assert.equal(sufficiency.productionRule.directThreshold, 0.65);
assert.equal(sufficiency.claimBoundary.confirmatory, false);
assert.equal(sufficiency.claimBoundary.humanValidatedRelevance, false);
for (const settingName of ["static", "onlinePrequential"]) {
  const setting = sufficiency.settings[settingName];
  assert.equal(setting.directDecision.falsePositive, 0);
  assert.equal(setting.directDecision.falseAcceptanceRate, 0);
  assert.equal(setting.directDecision.acceptedPrecision, 1);
  assert.equal(setting.directDecision.correctAbstentionRate, 1);
  assert.ok(setting.directDecision.acceptedRecall > 0 && setting.directDecision.acceptedRecall < 0.1);
  assert.equal(setting.directDecision.confidenceIntervals95.acceptedPrecision.upper, 1);
  assert.equal(setting.directDecision.confidenceIntervals95.falseAcceptanceRate.lower, 0);
  assert.ok(setting.directDecision.confidenceIntervals95.acceptedPrecision.lower < 1);
  assert.ok(setting.directDecision.confidenceIntervals95.falseAcceptanceRate.upper > 0);
  assert.equal(setting.leaveOneRepositoryOut.aggregate.falsePositive, 0);
  assert.equal(setting.leaveOneRepositoryOut.aggregate.falseAcceptanceRate, 0);
  assert.equal(setting.leaveOneRepositoryOut.aggregate.acceptedPrecision, 1);
}

assert.equal(review.status, "awaiting-two-independent-human-reviewers");
assert.equal(review.cases.length, 49);
assert.ok(review.cases.every((entry) => entry.labels.reviewerA === null
  && entry.labels.reviewerB === null && entry.labels.adjudicated === null));
assert.equal(admin.strata.highScore, 20);
assert.equal(admin.strata.mediumScore, 19);
assert.equal(admin.strata.lowScore, 10);
assert.equal(admin.reviewArtifactSha256, sha256(JSON.stringify(review)));

assert.ok(retrieval.includes('method: "evidence-sufficiency-v2"'));
assert.ok(retrieval.includes("directThreshold: 0.65"));
assert.ok(retrieval.includes('decision === "ABSTAIN"'));
const evidenceSchema = schema.properties.retrieval.properties.evidenceSufficiency;
assert.equal(evidenceSchema.properties.method.const, "evidence-sufficiency-v2");
assert.ok(evidenceSchema.required.includes("decision"));

for (const fragment of [
  "upstream prose/data inconsistency",
  "observed zero direct false accepts",
  "63.06%-100%",
  "73.54%-100%",
  "0%-7.25%",
  "0%-11.22%",
  "3.33% acceptance coverage",
  "5.00% acceptance coverage",
  "not a universal semantic guarantee",
  "awaiting two independent human reviewers"
]) assert.ok(research.includes(fragment), `Research report is missing: ${fragment}`);
assert.ok(benchmarks.includes("conservative development-v0.3 gate"));

assert.equal(packageJson.scripts["prepare:research-repositories:v0.2"], "node scripts/prepare-repository-manifest-v0.2.mjs");
assert.equal(packageJson.scripts["prepare:research-audit:v0.3"], "node scripts/prepare-relevance-audit-v0.3.mjs");
assert.equal(packageJson.scripts["evaluate:research-sufficiency:v0.3"], "node scripts/evaluate-research-sufficiency-v0.3.mjs");
assert.equal(packageJson.scripts["check:research-sufficiency"], "node scripts/verify-research-sufficiency-v0.3.mjs");

process.stdout.write("Repository-count resolution, offline backup, conservative sufficiency gate, and blinded audit artifacts are valid.\n");
