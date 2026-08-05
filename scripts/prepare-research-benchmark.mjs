import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPinnedDataset } from "../bench/research/swe-bench-lite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(root, "bench", "research", "swe-bench-lite-v1.json");
const { corpus } = await loadPinnedDataset();

assert.deepEqual(corpus.counts, {
  repositories: 12,
  totalTasks: 300,
  warmupTasks: 60,
  heldoutTasks: 240
});
assert.equal(new Set(corpus.tasks.map((task) => task.instanceId)).size, 300);
assert.ok(corpus.tasks.every((task) => task.changedFiles.length > 0));

if (process.argv.includes("--write")) {
  await writeFile(artifactPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, artifactPath)} (${corpus.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(corpus, committed, "The pinned research corpus no longer matches its committed metadata artifact.");
  process.stdout.write(`Verified 12 repositories, 300 tasks, and the 60/240 chronological split (${corpus.contentDigest}).\n`);
}
