import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchVerifiedRows } from "../bench/final/swe-bench-verified.mjs";
import { fetchDatasetRows } from "../bench/research/swe-bench-lite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "bench", "final", "contamination-audit-v1.json");
const [manifest, controls] = await Promise.all([
  readJson("bench/final/final-task-manifest-v1.json"),
  readJson("bench/final/final-abstention-controls-v1.json")
]);
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

function issueUrl(row) {
  const issue = row.instance_id.match(/-(\d+)$/u)?.[1];
  return issue ? `https://github.com/${row.repo}/issues/${issue}` : null;
}

function normalize(text) {
  return String(text).normalize("NFKC").toLowerCase()
    .replace(/https?:\/\/\S+/gu, " <url> ")
    .replace(/\b[0-9a-f]{7,40}\b/gu, " <sha> ")
    .replace(/\b\d+(?:\.\d+)*\b/gu, " <num> ")
    .replace(/[^\p{L}\p{N}_<>]+/gu, " ").trim();
}

function shingles(text, width = 5) {
  const tokens = normalize(text).split(/\s+/u).filter(Boolean);
  if (tokens.length <= width) return new Set([tokens.join(" ")]);
  return new Set(Array.from({ length: tokens.length - width + 1 }, (_, index) => tokens.slice(index, index + width).join(" ")));
}

function jaccard(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function overlap(leftRows, rightRows, selector) {
  const rightByValue = new Map();
  for (const row of rightRows) {
    const value = selector(row);
    if (!value) continue;
    if (!rightByValue.has(value)) rightByValue.set(value, []);
    rightByValue.get(value).push(row.instance_id);
  }
  const pairs = [];
  for (const row of leftRows) {
    const value = selector(row);
    for (const developmentInstanceId of rightByValue.get(value) ?? []) {
      pairs.push({ finalInstanceId: row.instance_id, developmentInstanceId, value });
    }
  }
  return pairs;
}

const [verifiedRows, liteRows] = await Promise.all([fetchVerifiedRows(), fetchDatasetRows()]);
const finalIds = new Set([...manifest.tasks, ...controls.tasks].map((task) => task.instanceId));
const finalRows = verifiedRows.filter((row) => finalIds.has(row.instance_id));
assert.equal(finalRows.length, 407);

const exactInstance = overlap(finalRows, liteRows, (row) => row.instance_id);
const issueUrls = overlap(finalRows, liteRows, issueUrl);
const baseCommits = overlap(finalRows, liteRows, (row) => `${row.repo}:${row.base_commit}`);
const patchHashes = overlap(finalRows, liteRows, (row) => sha256(row.patch));
const testPatchHashes = overlap(finalRows, liteRows, (row) => sha256(row.test_patch));
const problemHashes = overlap(finalRows, liteRows, (row) => sha256(normalize(row.problem_statement)));

const liteShingles = liteRows.map((row) => ({ row, shingles: shingles(row.problem_statement) }));
const nearDuplicates = [];
for (const row of finalRows) {
  const source = shingles(row.problem_statement);
  for (const candidate of liteShingles) {
    const similarity = jaccard(source, candidate.shingles);
    if (similarity >= 0.85 && row.instance_id !== candidate.row.instance_id) {
      nearDuplicates.push({
        finalInstanceId: row.instance_id,
        developmentInstanceId: candidate.row.instance_id,
        repositoryMatch: row.repo === candidate.row.repo,
        similarity: Math.round(similarity * 1_000_000) / 1_000_000,
        finalProblemHash: sha256(normalize(row.problem_statement)),
        developmentProblemHash: sha256(normalize(candidate.row.problem_statement))
      });
    }
  }
}
nearDuplicates.sort((left, right) => right.similarity - left.similarity
  || left.finalInstanceId.localeCompare(right.finalInstanceId)
  || left.developmentInstanceId.localeCompare(right.developmentInstanceId));

let futureRecordsBlocked = 0;
for (const row of finalRows) {
  const createdAt = new Date(row.created_at).toISOString();
  futureRecordsBlocked += liteRows.filter((candidate) => candidate.repo === row.repo
    && new Date(candidate.created_at).toISOString() >= createdAt).length;
}

const compactOverlap = (pairs) => ({
  count: pairs.length,
  uniqueValues: new Set(pairs.map((pair) => pair.value)).size,
  samplePairs: pairs.slice(0, 25)
});
const manual = [];
const content = {
  schemaVersion: "qarinah.final-contamination-audit.v1",
  status: nearDuplicates.length === manual.length ? "complete-before-final-evaluation" : "manual-adjudication-required",
  populations: {
    developmentTasks: liteRows.length,
    finalRetrievalTasks: manifest.tasks.length,
    finalAbstentionControls: controls.tasks.length,
    auditedFinalTasks: finalRows.length
  },
  methods: {
    exact: "Compare exact instance IDs, derived issue URLs, repository-qualified base commits, SHA-256 patch/test-patch hashes, and normalized problem-statement hashes.",
    nearDuplicate: "Five-token shingle Jaccard similarity after NFKC/lowercase normalization and URL, commit, and number placeholders; candidate threshold >= 0.85.",
    temporal: "Count same-repository development records at or after each target timestamp; the frozen strict-before policy rejects every such record."
  },
  exact_instance_overlap: exactInstance.length,
  issue_url_overlap: issueUrls.length,
  pull_request_url_overlap: null,
  pull_request_url_note: "The pinned dataset schema does not expose pull-request URLs.",
  gold_commit_overlap: null,
  gold_commit_note: "The pinned dataset schema exposes base_commit and gold patches, not a gold commit identifier.",
  base_commit_overlap: compactOverlap(baseCommits),
  patch_hash_overlap: compactOverlap(patchHashes),
  test_patch_hash_overlap: compactOverlap(testPatchHashes),
  normalized_problem_statement_hash_overlap: compactOverlap(problemHashes),
  near_duplicate_candidates: nearDuplicates,
  manually_adjudicated_candidates: manual,
  future_resolution_audit: {
    sameRepositoryRecordsAtOrAfterTarget: futureRecordsBlocked,
    admittedByFrozenStrictBeforePolicy: 0,
    exactTargetResolutionEmbeddedByIssueUrlOrPatchHash: new Set([...issueUrls, ...patchHashes].map((pair) => `${pair.finalInstanceId}:${pair.developmentInstanceId}`)).size,
    interpretation: "Future same-repository records exist in the source corpus but are excluded before ranking. Exact issue/patch matches are reported separately."
  },
  finalResultsObservedBeforeAudit: false,
  generatedAt: "2026-08-05"
};
const artifact = { ...content, contentDigest: sha256(JSON.stringify(content)) };

assert.equal(exactInstance.length, 0);
assert.equal(issueUrls.length, 0);
assert.equal(patchHashes.length, 0);

if (process.argv.includes("--write")) {
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${artifact.status}, ${nearDuplicates.length} near-duplicate candidates).\n`);
} else {
  const committed = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(artifact, committed, "Contamination audit drifted from the pinned inputs.");
  process.stdout.write(`Verified contamination audit (${artifact.status}).\n`);
}
