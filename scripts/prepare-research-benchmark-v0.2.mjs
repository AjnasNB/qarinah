import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPinnedDevelopmentDataset } from "../bench/research/swe-bench-lite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json");
const { corpus } = await loadPinnedDevelopmentDataset();

assert.equal(corpus.counts.totalTasks, 300);
assert.equal(corpus.counts.heldoutTasks, 240);
assert.equal(corpus.repositoryCountAudit.officialPageDeclaredCount, 11);
assert.equal(corpus.repositoryCountAudit.pinnedRevisionObservedCount, 12);
assert.equal(corpus.repositoryCountAudit.discrepancy, true);
assert.match(corpus.generatedFrom.sourceArtifact.sha256, /^sha256:[a-f0-9]{64}$/u);
assert.ok(corpus.tasks.some((task) => task.changedSymbols.length > 0));

if (process.argv.includes("--write")) {
  await writeFile(artifactPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, artifactPath)} (${corpus.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(corpus, committed, "The v0.2 development corpus no longer matches its committed artifact.");
  process.stdout.write(`Verified exploratory development corpus (${corpus.contentDigest}).\n`);
}
