import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFinalTaskManifestInputs, VERIFIED_DATASET_REVISION } from "../bench/final/swe-bench-verified.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liteCorpus = JSON.parse(await readFile(path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json"), "utf8"));
const outputPath = path.join(root, "bench", "final", "final-task-manifest-v1.json");
const { manifest } = await loadFinalTaskManifestInputs(liteCorpus);

assert.equal(manifest.generatedFrom.datasetRevision, VERIFIED_DATASET_REVISION);
assert.equal(manifest.counts.sourceTasks, 500);
assert.equal(manifest.counts.eligibleFinalRetrievalTasks + manifest.counts.excludedTasks, 500);
assert.equal(manifest.counts.agentSampleTasks, Math.min(40, manifest.counts.eligibleFinalRetrievalTasks));
assert.equal(new Set(manifest.agentSample.instanceIds).size, manifest.agentSample.instanceIds.length);
assert.equal(manifest.resultsObserved, false);
assert.ok(manifest.tasks.every((task) => task.priorDevelopmentMemoryCount > 0));
const excludedIds = new Set(manifest.exclusions.tasks.map((task) => task.instanceId));
assert.ok(manifest.tasks.every((task) => !excludedIds.has(task.instanceId)));

if (process.argv.includes("--write")) {
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${manifest.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(manifest, committed, "Final task manifest drifted from the pinned sources and frozen rules.");
  process.stdout.write(`Verified final task manifest (${manifest.contentDigest}).\n`);
}
