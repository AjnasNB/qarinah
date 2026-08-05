import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controls = JSON.parse(await readFile(path.join(root, "bench", "final", "final-abstention-controls-v1.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "bench", "final", "final-task-manifest-v1.json"), "utf8"));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const { contentDigest, ...content } = controls;

assert.equal(contentDigest, sha256(JSON.stringify(content)));
assert.equal(controls.schemaVersion, "qarinah.final-abstention-controls.v1");
assert.equal(controls.status, "frozen-before-qarinah-or-model-evaluation");
assert.equal(controls.protocol.amendment, "A001");
assert.equal(controls.population.count, 20);
assert.equal(controls.resultsObserved, false);
assert.equal(controls.tasks.length, 20);
assert.equal(new Set(controls.tasks.map((task) => task.instanceId)).size, 20);
assert.ok(controls.tasks.every((task) => task.priorDevelopmentMemoryCount === 0));
assert.ok(controls.population.excludedMetrics.includes("positive-evidence retrieval recall"));
const excluded = new Set(manifest.exclusions.tasks
  .filter((task) => task.reason === "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY")
  .map((task) => task.instanceId));
assert.deepEqual(new Set(controls.tasks.map((task) => task.instanceId)), excluded);
assert.ok(controls.tasks.every((task) => !manifest.tasks.some((candidate) => candidate.instanceId === task.instanceId)));

process.stdout.write(`Frozen abstention controls are valid (${contentDigest}).\n`);
