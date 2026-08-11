import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  importAgentArchive,
  initializeWorkspace,
  measureMemoryFootprint
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

test("memory footprint distinguishes retained storage, imported bytes, and the delivered pack", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const archive = path.join(root, "history.jsonl");
  const content = [
    JSON.stringify({ role: "user", sessionId: "footprint-1", content: "Record the migration decision and test result." }),
    JSON.stringify({ role: "assistant", sessionId: "footprint-1", content: "Migration 18 passed and rollback was verified." }),
    ""
  ].join("\n");
  await writeFile(archive, content, "utf8");
  await importAgentArchive(archive, { cwd: root, format: "portable", mode: "compact" });

  const result = await measureMemoryFootprint({
    cwd: root,
    query: "migration rollback",
    ratePerMillion: 3
  });
  assert.equal(result.schemaVersion, "qarinah.memory-footprint.v1");
  assert.equal(result.retained.importedSourceBytes, Buffer.byteLength(content));
  assert.equal(result.retained.importedSourceBytesKnown, true);
  assert.ok(result.retained.storageBytes.sqlite > 0);
  assert.ok(result.retained.storageBytes.total > result.deliveredPack.renderedBytes);
  assert.match(result.deliveredPack.manifestHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.comparison.source, "portable-chars-div-4-from-compact-import-receipts");
  assert.equal(result.comparison.status, "measured");
  assert.equal(result.comparison.costs.ratePerMillion, 3);
  assert.equal(result.boundaries.tokenEstimator, "portable ceil(characters / 4)");
});

test("memory footprint accepts an explicit comparable baseline without inventing provider billing", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "metadata" });
  const result = await measureMemoryFootprint({ cwd: root, baselineTokens: 10_000, ratePerMillion: 5 });
  assert.equal(result.comparison.source, "caller-supplied");
  assert.equal(result.comparison.baselineTokens, 10_000);
  assert.equal(result.comparison.savedTokens, 10_000 - result.deliveredPack.estimatedTokens);
  assert.equal(result.comparison.costs.baseline, 0.05);
  assert.equal(
    result.comparison.costs.delivered,
    Math.round((result.deliveredPack.estimatedTokens / 1_000_000) * 5 * 1_000_000) / 1_000_000
  );
});

