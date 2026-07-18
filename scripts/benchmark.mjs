import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { appendEvent, compileContext, initializeWorkspace, rebuildDerivedState, verifyStore } from "../src/index.js";

const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-benchmark-"));
const records = 200;
process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");

try {
  const workspace = await initializeWorkspace(root);
  const appendStarted = performance.now();
  for (let index = 0; index < records; index += 1) {
    await appendEvent({
      kind: index % 5 === 0 ? "decision" : "tool.completed",
      actor: { type: "agent", id: "benchmark" },
      title: `Benchmark record ${index}`,
      body: `Deterministic foundation fixture for component ${index % 17}.`,
      data: { index, component: `component-${index % 17}` },
      confidence: "extracted",
      relations: index === 0 ? [] : [{ type: "derived_from", target: `benchmark:${index - 1}` }],
      provenance: { adapter: "benchmark", sourceId: `fixture:${index}` },
      retention: { class: "session", expiresAt: null }
    }, { workspace });
  }
  const appendMs = performance.now() - appendStarted;

  const buildStarted = performance.now();
  await rebuildDerivedState(root);
  const buildMs = performance.now() - buildStarted;

  const queryStarted = performance.now();
  const pack = await compileContext("component-7 benchmark", { cwd: root, limit: 20, maxChars: 12_000 });
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
    buildMs: Math.round(buildMs * 100) / 100,
    queryMs: Math.round(queryMs * 100) / 100,
    selectedItems: pack.items.length
  }, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
