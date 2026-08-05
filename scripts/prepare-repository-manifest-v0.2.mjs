import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET_REVISION, loadRepositoryManifestAudit } from "../bench/research/swe-bench-lite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(root, "bench", "research", "repository-manifest-v0.2.json");
const { manifest } = await loadRepositoryManifestAudit();

assert.equal(manifest.dataset_revision, DATASET_REVISION);
assert.deepEqual(manifest.splits_loaded, ["test"]);
assert.equal(manifest.development_split_combined, false);
assert.equal(manifest.row_count_before_filtering, 300);
assert.equal(manifest.row_count_after_filtering, 300);
assert.equal(manifest.exact_repo_identifiers.length, 12);
assert.equal(manifest.normalized_projects.length, 12);
assert.deepEqual(manifest.duplicate_instance_ids, []);
assert.equal(manifest.repositories.reduce((sum, repository) => sum + repository.task_count, 0), 300);
assert.equal(manifest.historical_revision_audit.length, 6);
assert.ok(manifest.historical_revision_audit.every((revision) => revision.row_count === 300));
assert.ok(manifest.historical_revision_audit.every((revision) => revision.repository_count === 12));

if (process.argv.includes("--write")) {
  await writeFile(artifactPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, artifactPath)} (${manifest.content_sha256}).\n`);
} else {
  const committed = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.deepEqual(manifest, committed, "The repository manifest no longer matches the pinned official artifacts.");
  process.stdout.write(`Verified repository manifest (${manifest.content_sha256}).\n`);
}
