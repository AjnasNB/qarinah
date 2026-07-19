import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { captureCodexHook, compileContext, initializeWorkspace, rebuildDerivedState, verifyStore } from "../src/index.js";

const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-benchmark-"));
const records = 256;
process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");

try {
  const workspace = await initializeWorkspace(root);
  const inputs = [];
  const appendStarted = performance.now();
  for (let index = 0; index < records; index += 1) {
    const input = {
      cwd: root,
      hook_event_name: "PostToolUse",
      model: "benchmark-model",
      permission_mode: "default",
      session_id: "benchmark-session",
      tool_input: { component: `component-${index % 17}`, index },
      tool_name: "benchmark.tool",
      tool_response: { ok: true, index },
      tool_use_id: `benchmark-tool-${index}`,
      transcript_path: null,
      turn_id: `benchmark-turn-${index}`
    };
    inputs.push(input);
    const captured = await captureCodexHook(input, { cwd: root });
    if (!captured.captured) throw new Error(`Benchmark hook ${index} was not captured.`);
  }
  const appendMs = performance.now() - appendStarted;

  const replayStarted = performance.now();
  for (const input of inputs.filter((_, index) => index % 16 === 0)) {
    const replayed = await captureCodexHook(input, { cwd: root });
    if (!replayed.captured) throw new Error("Benchmark hook replay was not captured.");
  }
  const replayMs = performance.now() - replayStarted;

  const projectionRoot = path.join(workspace.qarinahDir, "index", "event-ids");
  const manifestText = await readFile(path.join(projectionRoot, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  let projectionBytes = Buffer.byteLength(manifestText);
  let projectedEntries = 0;
  let maxBucketEntries = 0;
  for (const name of await readdir(path.join(projectionRoot, "buckets"))) {
    if (!name.endsWith(".json") || !Object.hasOwn(manifest.buckets, name.slice(0, -5))) continue;
    const bucketText = await readFile(path.join(projectionRoot, "buckets", name), "utf8");
    const bucket = JSON.parse(bucketText);
    const entries = Object.values(bucket.entries);
    projectionBytes += Buffer.byteLength(bucketText);
    projectedEntries += entries.length;
    maxBucketEntries = Math.max(maxBucketEntries, entries.length);
    if (entries.some((entry) => Object.keys(entry).sort().join(",") !== "hash,length,offset")) {
      throw new Error("Benchmark found a non-compact event-ID projection entry.");
    }
  }
  const logBytes = Number((await stat(path.join(workspace.qarinahDir, "events", "events.jsonl"))).size);
  if (manifest.schemaVersion !== "qarinah.event-id-index.v2"
    || projectedEntries !== records
    || projectionBytes >= logBytes) {
    throw new Error("Benchmark event-ID projection invariant failed.");
  }

  const buildStarted = performance.now();
  await rebuildDerivedState(root);
  const buildMs = performance.now() - buildStarted;

  const queryStarted = performance.now();
  const pack = await compileContext("Codex tool completed benchmark.tool", {
    cwd: root,
    limit: 20,
    maxChars: 12_000,
    asOf: "2026-07-20T00:00:00.000Z"
  });
  const queryMs = performance.now() - queryStarted;
  const store = await verifyStore(root);
  if (store.eventCount !== records || pack.items.length === 0 || pack.budget.usedChars > pack.budget.maxChars) {
    throw new Error("Benchmark correctness invariant failed.");
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "qarinah.benchmark.v1",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    records,
    appendMs: Math.round(appendMs * 100) / 100,
    replayMs: Math.round(replayMs * 100) / 100,
    buildMs: Math.round(buildMs * 100) / 100,
    queryMs: Math.round(queryMs * 100) / 100,
    logBytes,
    projectionBytes,
    maxBucketEntries,
    selectedItems: pack.items.length
  }, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
