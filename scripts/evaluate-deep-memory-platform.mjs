import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  buildSymbolGraph,
  consolidateProjectFacts,
  createContentArchive,
  initializeWorkspace,
  querySymbolGraph,
  restoreContentArchive,
  runProjectMemoryCycle,
  verifyContentArchive
} from "../src/index.js";
import { sha256 } from "../src/canonical.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const OUTPUT = path.join(ROOT, "bench", "results", `deep-memory-platform-v${packageJson.version}.json`);
const WRITE = process.argv.includes("--write");
const CLOCK = () => new Date("2026-08-20T14:00:00.000Z");

function event(index, overrides = {}) {
  const suffix = String(index).padStart(12, "0");
  return {
    eventId: `evt_10000000-0000-4000-8000-${suffix}`,
    timestamp: `2026-08-20T12:${String(index).padStart(2, "0")}:00.000Z`,
    kind: "decision",
    actor: { type: "human", id: "deep-memory-evaluator" },
    sessionId: "session-deep-memory-evaluator",
    turnId: `turn-${index}`,
    title: `Deep memory event ${index}`,
    body: "Deterministic evidence for the Qarinah deep-memory product acceptance fixture.",
    data: {},
    confidence: "extracted",
    relations: [],
    provenance: { adapter: "deep-memory-evaluator-v1", sourceId: `fixture-${index}` },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function scenario(id, passed, observation) {
  return Object.freeze({ id, passed: Boolean(passed), observation });
}

async function evaluate() {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-deep-memory-eval-"));
  const source = path.join(root, "src");
  const restored = path.join(root, "restored-second-snapshot");
  try {
    await mkdir(source);
    await initializeWorkspace(root, { capture: "content" });
    const shared = "// stable project evidence block for content-defined chunk reuse\n".repeat(6_000);
    const mathV1 = `${shared}\nexport function add(left: number, right: number) {\n  return left + right;\n}\n`;
    const consumer = "import { add } from './math.js';\nexport const total = add(20, 22);\n";
    await writeFile(path.join(source, "math.ts"), mathV1, "utf8");
    await writeFile(path.join(source, "consumer.ts"), consumer, "utf8");

    const decision = await appendEvent(event(1, {
      title: "Keep exact project bytes outside the model pack",
      body: "Use the encrypted content archive for recovery and cited context packs for model delivery."
    }), { cwd: root });
    const outcome = await appendEvent(event(2, {
      kind: "turn.completed",
      title: "Local recovery path completed",
      body: "The restored project must match every source byte before the acceptance scenario passes."
    }), { cwd: root });

    const initialCycle = await runProjectMemoryCycle({ cwd: root, compact: false, clock: CLOCK });
    const unchangedCycle = await runProjectMemoryCycle({ cwd: root, compact: false, clock: CLOCK });
    const graph = await buildSymbolGraph({ cwd: root, persist: true });
    const symbolQuery = querySymbolGraph(graph, "add", { limit: 10 });
    const addSymbol = symbolQuery.results.find((entry) => entry.symbol.name === "add");
    const facts = await consolidateProjectFacts({
      cwd: root,
      query: "project byte recovery",
      maxFacts: 8,
      record: false,
      clock: CLOCK
    });
    const firstArchive = await createContentArchive("src", {
      cwd: root,
      label: "deep memory fixture v1",
      clock: CLOCK
    });

    const mathV2 = `${shared}\nexport function add(left: number, right: number) {\n  return left + right;\n}\n\nexport function subtract(left: number, right: number) {\n  return left - right;\n}\n`;
    await writeFile(path.join(source, "math.ts"), mathV2, "utf8");
    const secondArchive = await createContentArchive("src", {
      cwd: root,
      label: "deep memory fixture v2",
      clock: () => new Date("2026-08-20T14:01:00.000Z")
    });
    const verification = await verifyContentArchive(secondArchive.archiveId, { cwd: root });
    const restore = await restoreContentArchive(secondArchive.archiveId, restored, { cwd: root });
    const restoredMath = await readFile(path.join(restored, "math.ts"), "utf8");
    const restoredConsumer = await readFile(path.join(restored, "consumer.ts"), "utf8");
    const changedCycle = await runProjectMemoryCycle({ cwd: root, compact: false, clock: CLOCK });

    const scenarios = [
      scenario("initial-source-change-is-captured", initialCycle.changed && initialCycle.scan.captured, `${initialCycle.scan.fileCount} source files captured`),
      scenario("unchanged-cycle-creates-no-derived-write", !unchangedCycle.changed && unchangedCycle.symbols === null && unchangedCycle.derived === null, "unchanged cycle suppressed"),
      scenario("changed-file-is-detected", changedCycle.changed && changedCycle.scan.changes.changed.includes("src/math.ts"), "src/math.ts changed"),
      scenario("symbol-graph-is-complete-for-eligible-files", graph.coverage.complete && graph.coverage.indexedFiles === 2, `${graph.coverage.indexedFiles} eligible files indexed`),
      scenario("function-symbol-is-retrievable", addSymbol?.symbol.kind === "function", "add function returned"),
      scenario("cross-file-reference-is-resolved", addSymbol?.symbol.references.some((reference) => reference.path === "src/consumer.ts"), "consumer reference resolved"),
      scenario("facts-are-source-cited", facts.facts.length > 0 && facts.facts.every((fact) => fact.sourceEventIds.length > 0), `${facts.facts.length} cited facts`),
      scenario("decision-and-outcome-remain-retrievable", facts.facts.some((fact) => fact.sourceEventIds.includes(decision.eventId)) && facts.facts.some((fact) => fact.sourceEventIds.includes(outcome.eventId)), "decision and outcome cited"),
      scenario("second-archive-reuses-existing-objects", secondArchive.totals.reusedObjectCount > 0, `${secondArchive.totals.reusedObjectCount} chunks reused`),
      scenario("archive-verification-passes", verification.ok && verification.sourceBytes === secondArchive.totals.sourceBytes, `${verification.sourceBytes} source bytes verified`),
      scenario("restored-file-list-is-exact", restore.restored.join(",") === "consumer.ts,math.ts", `${restore.restored.length} files restored`),
      scenario("restored-bytes-match-second-snapshot", restoredMath === mathV2 && restoredConsumer === consumer, "all restored source bytes match")
    ];
    assert.equal(scenarios.every((entry) => entry.passed), true);
    const base = {
      schemaVersion: "qarinah.deep-memory-platform-evaluation.v1",
      packageVersion: packageJson.version,
      protocol: {
        id: "deep-memory-product-acceptance-v1",
        generatedAt: CLOCK().toISOString(),
        environment: "temporary initialized Qarinah project with two TypeScript files and two encrypted content snapshots",
        scope: "Product acceptance evidence for exact source recovery, snapshot reuse, symbol/reference retrieval, cited fact consolidation, and incremental project refresh. It is not an external comparative benchmark."
      },
      aggregate: {
        scenarioCount: scenarios.length,
        passed: scenarios.filter((entry) => entry.passed).length,
        failed: scenarios.filter((entry) => !entry.passed).length,
        passRate: scenarios.filter((entry) => entry.passed).length / scenarios.length
      },
      observed: {
        sourceFiles: secondArchive.totals.fileCount,
        secondSnapshotSourceBytes: secondArchive.totals.sourceBytes,
        firstSnapshotChunks: firstArchive.totals.chunkCount,
        secondSnapshotChunks: secondArchive.totals.chunkCount,
        secondSnapshotReusedChunks: secondArchive.totals.reusedObjectCount,
        indexedSymbols: graph.coverage.declarations,
        resolvedReferences: graph.coverage.resolvedReferences,
        citedFacts: facts.facts.length,
        restoredFiles: restore.restored.length
      },
      scenarios
    };
    return Object.freeze({ ...base, artifactHash: sha256(base) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const result = await evaluate();
if (WRITE) {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
} else {
  const stored = JSON.parse(await readFile(OUTPUT, "utf8"));
  assert.deepEqual(result, stored, "The checked-in deep-memory result does not match a fresh execution.");
}
process.stdout.write(`${JSON.stringify({ ok: true, result: path.relative(ROOT, OUTPUT), aggregate: result.aggregate, observed: result.observed, artifactHash: result.artifactHash }, null, 2)}\n`);
