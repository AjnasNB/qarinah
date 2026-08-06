import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audit = JSON.parse(await readFile(path.join(root, "bench", "final", "contamination-audit-v1.json"), "utf8"));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const { contentDigest, ...content } = audit;

assert.equal(contentDigest, sha256(JSON.stringify(content)));
assert.equal(audit.schemaVersion, "qarinah.final-contamination-audit.v1");
assert.equal(audit.status, "complete-before-final-evaluation");
assert.deepEqual(audit.populations, {
  developmentTasks: 300,
  finalRetrievalTasks: 387,
  finalAbstentionControls: 20,
  auditedFinalTasks: 407
});
assert.equal(audit.exact_instance_overlap, 0);
assert.equal(audit.issue_url_overlap, 0);
assert.equal(audit.patch_hash_overlap.count, 0);
assert.equal(audit.future_resolution_audit.admittedByFrozenStrictBeforePolicy, 0);
assert.equal(audit.near_duplicate_candidates.length, audit.manually_adjudicated_candidates.length);
assert.equal(audit.finalResultsObservedBeforeAudit, false);

process.stdout.write(`Contamination audit is complete (${contentDigest}).\n`);
