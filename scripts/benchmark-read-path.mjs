import { mkdtemp, readFile, rm, writeFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalStringify } from "../src/canonical.js";
import { createEventEnvelope } from "../src/contracts.js";
import { readCacheStatistics } from "../src/verified-read-cache.js";
const sourceIndex = process.argv.indexOf("--source-root");
const sourceRoot = sourceIndex < 0 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(process.argv[sourceIndex + 1]);
const { compileContext, initializeWorkspace, QARINAH_VERSION } = await import(pathToFileURL(path.join(sourceRoot, "src/index.js")).href);
const parent = await realpath(os.tmpdir());
const root = await realpath(await mkdtemp(path.join(parent, "qarinah-read-profile-")));
process.env.QARINAH_STATE_DIR = path.join(root, "machine-state");
const rows = [];
try {
  const { mkdir } = await import("node:fs/promises");
  for (const records of [1000, 10000]) {
    const cwd = path.join(root, `project-${records}`); await mkdir(cwd);
    const workspace = await initializeWorkspace(cwd, { capture: "content" });
    const events = [];
    for (let index = 0; index < records; index++) events.push(createEventEnvelope({ kind: "prompt.submitted",
      title: `Migration ${index}`, body: `Database rollback snapshot evidence-${index}.`,
      actor: { type: "human", id: "fixture" }, provenance: { adapter: "synthetic-profile", sourceId: `source-${index}` } },
    { workspaceId: workspace.config.workspaceId, previousHash: events.at(-1)?.hash ?? null }));
    const ledger = path.join(cwd, ".qarinah/events/events.jsonl");
    await writeFile(ledger, events.map(canonicalStringify).join("\n") + "\n");
    const timings = []; let manifest;
    for (let attempt = 0; attempt < 6; attempt++) {
      const start = performance.now();
      const pack = await compileContext("database rollback snapshot", { cwd, inMemory: true, updateCheckpoint: false,
        asOf: "2099-01-01T00:00:00.000Z", maxChars: 6000, limit: 5 });
      timings.push(Math.round((performance.now() - start) * 100) / 100);
      if (manifest && manifest !== pack.manifestHash) throw new Error("Warm cache changed context identity.");
      if (!pack.items.length) throw new Error("Profile failed to retrieve fixture evidence.");
      manifest = pack.manifestHash;
    }
    const warm = timings.slice(1).sort((a,b) => a-b);
    rows.push({ records, ledgerBytes: (await readFile(ledger)).length, coldMs: timings[0], warmP50Ms: warm[2], warmP95Ms: warm[4], timingsMs: timings,
      manifestStable: true, caches: readCacheStatistics() });
  }
  console.log(JSON.stringify({ schemaVersion: "qarinah.read-path-profile.v1", sourceVersion: QARINAH_VERSION, node: process.version, platform: process.platform,
    samplesPerSize: 6, rows, boundary: "Synthetic local read-path profile; not provider latency, coding success, independent validation, or a cross-product benchmark. Full current ledger bytes and trust remain checked on warm reads." }, null, 2));
} finally {
  const relative = path.relative(parent, root);
  if (!relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(root).startsWith("qarinah-read-profile-")) await rm(root, { recursive: true, force: true });
}
