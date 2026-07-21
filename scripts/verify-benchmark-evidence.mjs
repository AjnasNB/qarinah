import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const livePath = path.join(root, "bench", "results", "live-workspace-volume-2026-07-21.json");
const live = JSON.parse(await readFile(livePath, "utf8"));

assert.equal(live.schemaVersion, "qarinah.workspace-volume-observation.v1");
assert.equal(live.claimEligible, false);
assert.equal(live.tokenEstimator.method, "ceil(chars/4)");
assert.equal(live.tokenEstimator.exact, false);
assert.equal(live.tokenEstimator.providerBillingMeasurement, false);
assert.equal(live.pack.estimatedTokens, Math.ceil(live.pack.characters / 4));

for (const baseline of live.baselines) {
  assert.equal(baseline.estimatedTokens, Math.ceil(baseline.characters / 4));
  const reduction = Math.round((1 - live.pack.characters / baseline.characters) * 1_000_000) / 1_000_000;
  assert.equal(baseline.reduction, reduction, `${baseline.label} reduction does not match its character counts.`);
}

for (const key of ["summaryEventHash", "projectSnapshotEventHash", "projectSnapshotHash"]) {
  assert.match(live.provenance[key], /^sha256:[a-f0-9]{64}$/u);
}

process.stdout.write("Benchmark evidence arithmetic and claim boundaries are valid.\n");
