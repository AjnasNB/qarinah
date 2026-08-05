import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "bench", "final", "final-task-manifest-v1.json"), "utf8"));
const lite = JSON.parse(await readFile(path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const { contentDigest, ...content } = manifest;

assert.equal(contentDigest, sha256(JSON.stringify(content)));
assert.equal(manifest.schemaVersion, "qarinah.final-task-manifest.v1");
assert.equal(manifest.status, "frozen-before-qarinah-or-model-evaluation");
assert.equal(manifest.protocol.tag, "research-protocol-v1");
assert.equal(manifest.protocol.commit, "3e05fa30f3007fd67a6b5aba2613f14dcb896fd7");
assert.equal(manifest.generatedFrom.datasetRevision, "c104f840cc67f8b6eec6f759ebc8b2693d585d4a");
assert.equal(manifest.generatedFrom.sourceArtifact.bytes, 2_096_679);
assert.equal(manifest.generatedFrom.sourceArtifact.sha256, "sha256:a45b1fe4e2f0c8390b2b2938ac83e92ed5979000856808f3679c07812e9e6dcd");
assert.deepEqual(manifest.counts, {
  sourceTasks: 500,
  eligibleFinalRetrievalTasks: 387,
  excludedTasks: 113,
  eligibleRepositories: 12,
  agentSampleTasks: 40
});
assert.deepEqual(manifest.exclusions.counts, {
  USED_IN_LITE_DEVELOPMENT: 93,
  NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY: 20
});
assert.equal(manifest.resultsObserved, false);
assert.equal(manifest.tasks.length, 387);
assert.equal(manifest.tasks.filter((task) => task.selectedForAgentExperiment).length, 40);
assert.equal(new Set(manifest.agentSample.instanceIds).size, 40);
assert.ok(manifest.tasks.every((task) => task.priorDevelopmentMemoryCount > 0));

const liteIds = new Set(lite.tasks.map((task) => task.instanceId));
assert.ok(manifest.tasks.every((task) => !liteIds.has(task.instanceId)));
assert.ok(manifest.exclusions.tasks.filter((task) => task.reason === "USED_IN_LITE_DEVELOPMENT")
  .every((task) => liteIds.has(task.instanceId)));
for (const task of manifest.tasks) {
  for (const forbidden of ["problemStatement", "goldPatch", "testPatch", "modelOutcome", "qarinahScore"]) {
    assert.equal(Object.hasOwn(task, forbidden), false, `Final task contains forbidden result or target content field ${forbidden}.`);
  }
}

assert.equal(packageJson.scripts["prepare:research-final:v1"], "node scripts/prepare-final-task-manifest-v1.mjs");
assert.equal(packageJson.scripts["check:research-final-manifest"], "node scripts/verify-final-task-manifest-v1.mjs");

process.stdout.write(`Final manifest is frozen with 387 retrieval tasks and a deterministic 40-task agent sample (${contentDigest}).\n`);
