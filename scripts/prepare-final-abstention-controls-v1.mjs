import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchVerifiedRows, VERIFIED_DATASET_REVISION } from "../bench/final/swe-bench-verified.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "bench", "final", "final-abstention-controls-v1.json");
const manifest = JSON.parse(await readFile(path.join(root, "bench", "final", "final-task-manifest-v1.json"), "utf8"));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function parseList(value, label) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new TypeError(`${label} must encode an array.`);
  return parsed;
}

function issueUrl(row) {
  const issue = row.instance_id.match(/-(\d+)$/u)?.[1];
  return issue ? `https://github.com/${row.repo}/issues/${issue}` : null;
}

const rows = await fetchVerifiedRows();
const rowsById = new Map(rows.map((row) => [row.instance_id, row]));
const exclusions = manifest.exclusions.tasks
  .filter((task) => task.reason === "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY")
  .sort((left, right) => left.repository.localeCompare(right.repository) || left.instanceId.localeCompare(right.instanceId));

const tasks = exclusions.map((excluded) => {
  const row = rowsById.get(excluded.instanceId);
  assert.ok(row, `Missing pinned Verified row ${excluded.instanceId}.`);
  return {
    repository: row.repo,
    instanceId: row.instance_id,
    baseCommit: row.base_commit,
    createdAt: new Date(row.created_at).toISOString(),
    version: row.version,
    difficulty: row.difficulty.trim().toLowerCase() || "unknown",
    priorDevelopmentMemoryCount: 0,
    failToPassCount: parseList(row.FAIL_TO_PASS, `${row.instance_id}.FAIL_TO_PASS`).length,
    passToPassCount: parseList(row.PASS_TO_PASS, `${row.instance_id}.PASS_TO_PASS`).length,
    evaluatorOnlyHashes: {
      problemStatement: sha256(row.problem_statement),
      goldPatch: sha256(row.patch),
      goldTestPatch: sha256(row.test_patch)
    },
    sources: {
      dataset: manifest.generatedFrom.sourceArtifact.url,
      repository: `https://github.com/${row.repo}`,
      issue: issueUrl(row),
      baseCommit: `https://github.com/${row.repo}/commit/${row.base_commit}`
    }
  };
});

const content = {
  schemaVersion: "qarinah.final-abstention-controls.v1",
  status: "frozen-before-qarinah-or-model-evaluation",
  protocol: {
    tag: "research-protocol-v1",
    amendment: "A001",
    amendmentDocument: "docs/PROTOCOL-AMENDMENTS.md",
    intendedAmendmentTag: "research-protocol-amendment-001"
  },
  generatedFrom: {
    datasetId: manifest.generatedFrom.datasetId,
    datasetRevision: VERIFIED_DATASET_REVISION,
    config: manifest.generatedFrom.config,
    split: manifest.generatedFrom.split,
    finalTaskManifestDigest: manifest.contentDigest
  },
  population: {
    inclusionRule: "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY",
    count: tasks.length,
    allowedMetrics: [
      "false acceptance",
      "correct abstention",
      "hallucinated-evidence rate",
      "unnecessary context supplied"
    ],
    excludedMetrics: [
      "positive-evidence retrieval recall",
      "coding-handoff utility",
      "SWE-bench resolution improvement"
    ]
  },
  artifactPolicy: {
    upstreamProblemTextRedistributed: false,
    upstreamPatchesRedistributed: false,
    targetGoldAvailableToRetrieverOrAgent: false
  },
  resultsObserved: false,
  tasks
};
const artifact = { ...content, contentDigest: sha256(JSON.stringify(content)) };

assert.equal(tasks.length, 20);
assert.ok(tasks.every((task) => task.priorDevelopmentMemoryCount === 0));
assert.equal(new Set(tasks.map((task) => task.instanceId)).size, 20);

if (process.argv.includes("--write")) {
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${artifact.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(artifact, committed, "Frozen abstention-control manifest drifted from the pinned source.");
  process.stdout.write(`Verified 20 frozen abstention controls (${artifact.contentDigest}).\n`);
}
