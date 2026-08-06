import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receipt = JSON.parse(await readFile(path.join(root, "bench", "final", "protocol-v1.json"), "utf8"));
const amendmentReceipt = JSON.parse(await readFile(path.join(root, "bench", "final", "protocol-amendment-001.json"), "utf8"));
const protocol = await readFile(path.join(root, receipt.protocolPath), "utf8");
const amendments = await readFile(path.join(root, receipt.amendmentsPath), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

assert.equal(receipt.protocolSha256, sha256(protocol));
assert.equal(receipt.amendmentsSha256AtFreeze, "sha256:d9d8a3a5e489c5eb7c006af974e2565ba3b222252cf8b47fa7a05a8ace4eed2f");
assert.equal(amendmentReceipt.amendmentSha256, sha256(amendments));
assert.equal(amendmentReceipt.amendmentId, "A001");
assert.equal(amendmentReceipt.addedBeforeFinalResults, true);
assert.equal(amendmentReceipt.finalQarinahResultsObservedBefore, false);
assert.equal(amendmentReceipt.providerResultsObservedBefore, false);
assert.equal(receipt.implementationParentCommit, "fd8887c99aaf4e2bff58d2764bd59b39d2456c4c");
assert.equal(receipt.intendedTag, "research-protocol-v1");
assert.equal(receipt.taskManifestCreatedAtFreeze, false);
assert.equal(receipt.resultsObservedAtFreeze, false);
assert.equal(receipt.providerExecutionAuthorized, false);
assert.equal(receipt.remotePublished, false);

for (const fragment of [
  "## Research questions and hypotheses",
  "## Final dataset and inclusion rules",
  "## Retrieval conditions",
  "## Context conditions for coding agents",
  "## Agent execution controls",
  "## Primary and secondary metrics",
  "## Cross-agent handoff controls",
  "## Human review",
  "## Statistical analysis",
  "## Missing data and failure handling",
  "## Stopping rules",
  "## Amendments",
  "## Execution gate",
  "one attempt, Pass@1",
  "10,000 deterministic resamples",
  "Missing human review blocks",
  "Missing Docker evaluation blocks"
]) assert.ok(protocol.includes(fragment), `Frozen protocol is missing: ${fragment}`);

assert.ok(amendments.includes("A001"));
assert.ok(amendments.includes("20 no-prior-memory tasks"));
assert.ok(packageJson.files.includes("docs/FINAL-EXPERIMENT-PROTOCOL-v1.md"));
assert.ok(packageJson.files.includes("docs/PROTOCOL-AMENDMENTS.md"));
assert.ok(packageJson.files.includes("bench/final/"));
assert.equal(packageJson.scripts["check:research-protocol"], "node scripts/verify-final-protocol-v1.mjs && node scripts/verify-protocol-amendment-001.mjs");

process.stdout.write(`Final experiment protocol v1 is frozen at ${receipt.protocolSha256}.\n`);
