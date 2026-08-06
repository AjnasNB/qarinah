import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "bench", "final", "protocol-amendment-001.json");
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const [amendments, protocol, controls, contamination, power, pilot] = await Promise.all([
  readFile(path.join(root, "docs", "PROTOCOL-AMENDMENTS.md")),
  readJson("bench/final/protocol-v1.json"),
  readJson("bench/final/final-abstention-controls-v1.json"),
  readJson("bench/final/contamination-audit-v1.json"),
  readJson("bench/final/paired-power-analysis-v1.json"),
  readJson("bench/final/pilot-authorization-v1.json")
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const content = {
  schemaVersion: "qarinah.final-protocol-amendment-receipt.v1",
  amendmentId: "A001",
  amendmentPath: "docs/PROTOCOL-AMENDMENTS.md",
  amendmentSha256: sha256(amendments),
  baseProtocol: {
    tag: "research-protocol-v1",
    commit: "3e05fa30f3007fd67a6b5aba2613f14dcb896fd7",
    sha256: protocol.protocolSha256
  },
  finalManifest: {
    tag: "research-final-manifest-v1",
    commit: "b20bb87e6d0ab39aed7df00605d38d24deb9da36"
  },
  evidence: {
    abstentionControlsDigest: controls.contentDigest,
    contaminationAuditDigest: contamination.contentDigest,
    pairedPowerAnalysisDigest: power.contentDigest,
    pilotGuardrailDigest: pilot.contentDigest
  },
  intendedTag: "research-protocol-amendment-001",
  addedBeforeFinalResults: true,
  finalQarinahResultsObservedBefore: false,
  providerResultsObservedBefore: false,
  remotePublishedAtCreation: false,
  createdAt: "2026-08-05"
};
const artifact = { ...content, contentDigest: sha256(JSON.stringify(content)) };

assert.equal(controls.resultsObserved, false);
assert.equal(pilot.resultsObserved, false);
assert.equal(contamination.finalResultsObservedBeforeAudit, false);

if (process.argv.includes("--write")) {
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${artifact.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(artifact, committed, "Protocol amendment receipt drifted.");
  process.stdout.write(`Verified protocol amendment A001 (${artifact.contentDigest}).\n`);
}
