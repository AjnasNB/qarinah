import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha256 } from "../src/canonical.js";
import {
  createProjectMemoryWatcher,
  initializeWorkspace,
  runProjectMemoryCycle
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const CLOCK = () => new Date("2026-08-20T10:00:00.000Z");

test("project memory cycle incrementally scans, compacts, indexes symbols, and rebuilds derived state", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await writeFile(path.join(root, "math.ts"), "export function add(left: number, right: number) { return left + right; }\n", "utf8");

  const first = await runProjectMemoryCycle({ cwd: root, clock: CLOCK });
  assert.equal(first.schemaVersion, "qarinah.project-memory-cycle.v2");
  assert.equal(first.changed, true);
  assert.equal(first.incremental.mode, "initial");
  assert.equal(first.incremental.changeCount, 1);
  assert.equal(first.recovery.detected, false);
  assert.equal(first.state.phase, "completed");
  assert.equal(first.scan.captured, true);
  assert.equal(first.symbols?.symbols >= 3, true);
  assert.equal(first.harness?.recording?.status, "created");
  assert.equal(first.derived?.eventCount >= 2, true);
  assert.match(first.cycleHash, /^sha256:[0-9a-f]{64}$/u);

  const second = await runProjectMemoryCycle({ cwd: root, clock: CLOCK });
  assert.equal(second.changed, false);
  assert.equal(second.incremental.mode, "unchanged");
  assert.equal(second.recovery.detected, false);
  assert.equal(second.scan.unchanged, true);
  assert.equal(second.symbols, null);
  assert.equal(second.harness, null);
  assert.equal(second.derived, null);

  const statePath = path.join(root, ".qarinah", "graph", "project-memory-cycle-state.json");
  const previous = JSON.parse(await readFile(statePath, "utf8"));
  const { stateHash: _stateHash, ...previousCore } = previous;
  const interruptedCore = { ...previousCore, phase: "failed", phaseOrdinal: 6, failureCode: "FIXTURE_INTERRUPTION" };
  await writeFile(statePath, `${JSON.stringify({ ...interruptedCore, stateHash: sha256(interruptedCore) }, null, 2)}\n`, "utf8");

  await writeFile(path.join(root, "math.ts"), "export function add(left: number, right: number) { return left + right; }\nexport const identity = <T>(value: T) => value;\n", "utf8");
  const third = await runProjectMemoryCycle({ cwd: root, clock: CLOCK });
  assert.equal(third.changed, true);
  assert.equal(third.incremental.mode, "delta");
  assert.equal(third.recovery.detected, true);
  assert.equal(third.recovery.priorPhase, "failed");
  assert.equal(third.recovery.action, "replayed-idempotent-cycle");
  assert.deepEqual(third.scan.changes.changed, ["math.ts"]);
  assert.equal(third.symbols?.symbols > first.symbols.symbols, true);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).phase, "completed");

  const schema = JSON.parse(await readFile(new URL("../schemas/project-memory-cycle.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.project-memory-cycle.v2");
  assert.equal(schema.$defs.cycleState.additionalProperties, false);
  assert.equal(schema.$defs.scan.oneOf.every((entry) => entry.additionalProperties === false), true);
});

test("project watcher is serial, explicitly stoppable, and reports its real cycles", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "metadata" });
  await writeFile(path.join(root, "index.js"), "export const ready = true;\n", "utf8");

  const observed = [];
  let watcher;
  watcher = createProjectMemoryWatcher({
    cwd: root,
    intervalMs: 250,
    compact: false,
    clock: CLOCK,
    onCycle(cycle) {
      observed.push(cycle);
      watcher.stop();
    }
  });
  const finalStatus = await watcher.run();
  assert.equal(observed.length, 1);
  assert.equal(finalStatus.running, false);
  assert.equal(finalStatus.cycles, 1);
  assert.equal(finalStatus.changedCycles, 1);
  assert.equal(watcher.status().running, false);
  assert.equal(watcher.status().lastError, null);
});
