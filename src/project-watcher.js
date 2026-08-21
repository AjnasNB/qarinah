import { readFile, stat } from "node:fs/promises";
import { abortableDelay, throwIfAborted, validateAbortSignal } from "./abort.js";
import { deepFreezeJson, sha256 } from "./canonical.js";
import { runCodingContextHarness } from "./coding-harness.js";
import { rebuildDerivedState } from "./indexer.js";
import { scanProjectStructure } from "./project-structure.js";
import { buildSymbolGraph } from "./symbol-graph.js";
import { atomicWriteFile, loadWorkspace, secureStoragePath } from "./workspace.js";

export const PROJECT_MEMORY_CYCLE_SCHEMA_VERSION = "qarinah.project-memory-cycle.v2";
const PROJECT_MEMORY_CYCLE_STATE_SCHEMA_VERSION = "qarinah.project-memory-cycle-state.v1";
const MAX_CYCLE_STATE_BYTES = 64 * 1024;
const CYCLE_PHASES = Object.freeze(["started", "scan-complete", "symbols-complete", "compaction-complete", "derived-complete", "completed", "failed"]);

const DEFAULT_QUERY = "project decisions changes tool outcomes tests failures next steps";

function integer(value, label, minimum, maximum, fallback) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return selected;
}

function boolean(value, label, fallback) {
  const selected = value ?? fallback;
  if (typeof selected !== "boolean") throw new TypeError(`${label} must be a boolean.`);
  return selected;
}

function normalizeCycleOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Project memory cycle options must be a record.");
  }
  const allowed = new Set([
    "cwd", "query", "compact", "symbols", "rebuild", "maxChars", "maxTokens", "limit",
    "maxSummaryChars", "scan", "signal", "clock"
  ]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`Project memory cycle options contain unknown field(s): ${unknown.join(", ")}.`);
  if (options.cwd !== undefined && (typeof options.cwd !== "string" || options.cwd.trim() === "")) {
    throw new TypeError("cwd must be a non-empty path string.");
  }
  if (options.query !== undefined && (typeof options.query !== "string" || options.query.length > 4_096)) {
    throw new TypeError("query must be a string up to 4096 characters.");
  }
  if (options.scan !== undefined && (!options.scan || typeof options.scan !== "object" || Array.isArray(options.scan))) {
    throw new TypeError("scan must be a project structure scan options record.");
  }
  if (options.clock !== undefined && typeof options.clock !== "function") throw new TypeError("clock must be a function.");
  const now = options.clock === undefined ? new Date() : options.clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("clock must return a valid Date.");
  return Object.freeze({
    cwd: options.cwd ?? process.cwd(),
    query: options.query ?? DEFAULT_QUERY,
    compact: boolean(options.compact, "compact", true),
    symbols: boolean(options.symbols, "symbols", true),
    rebuild: boolean(options.rebuild, "rebuild", true),
    maxChars: integer(options.maxChars, "maxChars", 512, 1_000_000, 12_000),
    maxTokens: options.maxTokens === undefined ? undefined : integer(options.maxTokens, "maxTokens", 128, 1_000_000),
    limit: integer(options.limit, "limit", 1, 64, 20),
    maxSummaryChars: integer(options.maxSummaryChars, "maxSummaryChars", 256, 16_384, 2_000),
    scan: Object.freeze({ ...(options.scan ?? {}) }),
    signal: validateAbortSignal(options.signal),
    generatedAt: now.toISOString()
  });
}

function normalizeWatcherOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Project memory watcher options must be a record.");
  }
  const allowed = new Set([
    "cwd", "query", "compact", "symbols", "rebuild", "maxChars", "maxTokens", "limit",
    "maxSummaryChars", "scan", "signal", "clock", "intervalMs", "onCycle", "onError"
  ]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`Project memory watcher options contain unknown field(s): ${unknown.join(", ")}.`);
  if (options.onCycle !== undefined && typeof options.onCycle !== "function") throw new TypeError("onCycle must be a function.");
  if (options.onError !== undefined && typeof options.onError !== "function") throw new TypeError("onError must be a function.");
  const { intervalMs: _intervalMs, onCycle: _onCycle, onError: _onError, ...cycle } = options;
  return Object.freeze({
    cycle,
    intervalMs: integer(options.intervalMs, "intervalMs", 250, 3_600_000, 2_000),
    onCycle: options.onCycle ?? null,
    onError: options.onError ?? null,
    signal: validateAbortSignal(options.signal)
  });
}

function cycleStateCore(workspace, cycleId, generatedAt, phase, sourceSnapshotHash = null, failureCode = null) {
  return {
    schemaVersion: PROJECT_MEMORY_CYCLE_STATE_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    cycleId,
    generatedAt,
    phase,
    phaseOrdinal: CYCLE_PHASES.indexOf(phase),
    sourceSnapshotHash,
    failureCode
  };
}

function validCycleState(value, workspaceId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = ["schemaVersion", "workspaceId", "cycleId", "generatedAt", "phase", "phaseOrdinal", "sourceSnapshotHash", "failureCode", "stateHash"];
  if (Object.keys(value).sort().join("\0") !== keys.sort().join("\0")) return false;
  if (value.schemaVersion !== PROJECT_MEMORY_CYCLE_STATE_SCHEMA_VERSION || value.workspaceId !== workspaceId
    || !/^cycle_[0-9a-f]{32}$/u.test(value.cycleId) || !CYCLE_PHASES.includes(value.phase)
    || value.phaseOrdinal !== CYCLE_PHASES.indexOf(value.phase)
    || (value.sourceSnapshotHash !== null && !/^sha256:[0-9a-f]{64}$/u.test(value.sourceSnapshotHash))
    || (value.failureCode !== null && (typeof value.failureCode !== "string" || value.failureCode.length > 128))
    || !/^sha256:[0-9a-f]{64}$/u.test(value.stateHash)) return false;
  const { stateHash, ...core } = value;
  return sha256(core) === stateHash;
}

async function readCycleState(workspace) {
  const candidate = await secureStoragePath(workspace, ["graph", "project-memory-cycle-state.json"], { type: "file", allowMissing: true });
  let metadata;
  try {
    metadata = await stat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ status: "none", state: null });
    throw error;
  }
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_CYCLE_STATE_BYTES) return Object.freeze({ status: "invalid", state: null });
  try {
    const parsed = JSON.parse(await readFile(candidate, "utf8"));
    return validCycleState(parsed, workspace.config.workspaceId)
      ? Object.freeze({ status: "valid", state: deepFreezeJson(parsed) })
      : Object.freeze({ status: "invalid", state: null });
  } catch (error) {
    if (error instanceof SyntaxError) return Object.freeze({ status: "invalid", state: null });
    throw error;
  }
}

async function writeCycleState(workspace, cycleId, generatedAt, phase, sourceSnapshotHash = null, failureCode = null) {
  const core = cycleStateCore(workspace, cycleId, generatedAt, phase, sourceSnapshotHash, failureCode);
  const state = deepFreezeJson({ ...core, stateHash: sha256(core) });
  const candidate = await secureStoragePath(workspace, ["graph", "project-memory-cycle-state.json"], { type: "file", allowMissing: true });
  await atomicWriteFile(candidate, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export async function runProjectMemoryCycle(options = {}) {
  const normalized = normalizeCycleOptions(options);
  throwIfAborted(normalized.signal);
  const workspace = await loadWorkspace(normalized.cwd);
  const previousState = await readCycleState(workspace);
  const previousHash = previousState.state?.stateHash ?? null;
  const cycleId = `cycle_${sha256({ workspaceId: workspace.config.workspaceId, generatedAt: normalized.generatedAt, previousHash }).slice("sha256:".length, "sha256:".length + 32)}`;
  const recovery = Object.freeze({
    detected: previousState.status === "invalid" || (previousState.status === "valid" && previousState.state.phase !== "completed"),
    priorStatus: previousState.status,
    priorCycleId: previousState.state?.cycleId ?? null,
    priorPhase: previousState.status === "invalid" ? "invalid" : previousState.state?.phase ?? null,
    priorStateHash: previousHash,
    action: previousState.status === "invalid" || (previousState.state && previousState.state.phase !== "completed")
      ? "replayed-idempotent-cycle"
      : "none"
  });
  let state = await writeCycleState(workspace, cycleId, normalized.generatedAt, "started");
  let sourceSnapshotHash = null;

  let symbols = null;
  let harness = null;
  let derived = null;
  try {
    const scan = await scanProjectStructure({
      cwd: workspace.root,
      ...normalized.scan
    });
    sourceSnapshotHash = scan.snapshotHash;
    state = await writeCycleState(workspace, cycleId, normalized.generatedAt, "scan-complete", sourceSnapshotHash);
    throwIfAborted(normalized.signal);

    if (scan.captured) {
      if (normalized.symbols) {
        const graph = await buildSymbolGraph({ cwd: workspace.root, persist: true, signal: normalized.signal });
        symbols = Object.freeze({
          schemaVersion: graph.schemaVersion,
          manifestHash: graph.manifestHash,
          files: graph.coverage.indexedFiles,
          symbols: graph.coverage.declarations,
          references: graph.coverage.resolvedReferences,
          complete: graph.coverage.complete
        });
      }
      state = await writeCycleState(workspace, cycleId, normalized.generatedAt, "symbols-complete", sourceSnapshotHash);
      if (normalized.compact) {
        const result = await runCodingContextHarness({
          cwd: workspace.root,
          query: normalized.query,
          maxChars: normalized.maxChars,
          ...(normalized.maxTokens === undefined ? {} : { maxTokens: normalized.maxTokens }),
          limit: normalized.limit,
          maxSummaryChars: normalized.maxSummaryChars,
          record: true,
          rebuild: false,
          updateCheckpoint: false,
          signal: normalized.signal,
          clock: () => new Date(normalized.generatedAt)
        });
        const current = result.worktrees.find((entry) => entry.status === "ready" && entry.current) ?? result.worktrees[0];
        harness = Object.freeze({
          manifestHash: result.manifestHash,
          sourceHeadHash: current?.source?.sourceHeadHash ?? null,
          packManifestHash: current?.pack?.manifestHash ?? null,
          recording: current?.recording ?? null,
          comparison: current?.comparison ?? null
        });
      }
      state = await writeCycleState(workspace, cycleId, normalized.generatedAt, "compaction-complete", sourceSnapshotHash);
      if (normalized.rebuild) {
        const rebuilt = await rebuildDerivedState(workspace.root, { signal: normalized.signal });
        derived = Object.freeze({
          headHash: rebuilt.headHash,
          eventCount: rebuilt.eventCount,
          linkedNodes: rebuilt.linkedMemory.nodes,
          sqliteSchemaVersion: rebuilt.readModel.schemaVersion
        });
      }
      state = await writeCycleState(workspace, cycleId, normalized.generatedAt, "derived-complete", sourceSnapshotHash);
    }
    const changeCount = scan.captured
      ? scan.changes.added.length + scan.changes.changed.length + scan.changes.deleted.length + scan.changes.renamed.length
      : 0;
    const incremental = Object.freeze({
      mode: scan.captured ? (previousState.status === "none" ? "initial" : "delta") : "unchanged",
      changeCount,
      snapshotHash: scan.snapshotHash
    });
    state = await writeCycleState(workspace, cycleId, normalized.generatedAt, "completed", sourceSnapshotHash);
    const core = {
      schemaVersion: PROJECT_MEMORY_CYCLE_SCHEMA_VERSION,
      generatedAt: normalized.generatedAt,
      workspaceId: workspace.config.workspaceId,
      worktreeId: workspace.worktree?.worktreeId ?? null,
      changed: scan.captured,
      incremental,
      recovery,
      state,
      scan,
      symbols,
      harness,
      derived,
      boundaries: {
        activation: "Explicit long-running command or API call only; Qarinah does not install a hidden background service.",
        scope: "Only the initialized project and its configured capture policy are observed.",
        content: "Ignored, linked, secret-named, dependency, generated, and out-of-root paths remain excluded by the project scanner.",
        compaction: "Compact checkpoints are cited projections; the verified ledger and optional encrypted archive remain the recoverable sources."
      }
    };
    return deepFreezeJson({ ...core, cycleHash: sha256(core) });
  } catch (error) {
    const failureCode = typeof error?.code === "string" ? error.code.slice(0, 128) : typeof error?.name === "string" ? error.name.slice(0, 128) : "ERROR";
    try {
      await writeCycleState(workspace, cycleId, normalized.generatedAt, "failed", sourceSnapshotHash, failureCode);
    } catch {
      // Preserve the primary operation error; an interrupted journal write is detected on the next cycle.
    }
    throw error;
  }
}

export function createProjectMemoryWatcher(options = {}) {
  const normalized = normalizeWatcherOptions(options);
  const stopController = new AbortController();
  const signal = normalized.signal === undefined
    ? stopController.signal
    : AbortSignal.any([normalized.signal, stopController.signal]);
  let running = false;
  let stopping = false;
  let cycles = 0;
  let changedCycles = 0;
  let lastCycle = null;
  let lastError = null;

  const status = () => deepFreezeJson({
    schemaVersion: "qarinah.project-memory-watcher-status.v1",
    running,
    stopping,
    intervalMs: normalized.intervalMs,
    cycles,
    changedCycles,
    lastCycle,
    lastError
  });

  async function run() {
    if (running) throw new TypeError("Project memory watcher is already running.");
    running = true;
    stopping = false;
    try {
      while (!stopping) {
        throwIfAborted(signal);
        try {
          const cycle = await runProjectMemoryCycle({ ...normalized.cycle, signal });
          cycles += 1;
          if (cycle.changed) changedCycles += 1;
          lastCycle = cycle;
          lastError = null;
          if (normalized.onCycle !== null) await normalized.onCycle(cycle);
        } catch (error) {
          if (signal.aborted || stopping) throw error;
          lastError = Object.freeze({
            name: typeof error?.name === "string" ? error.name : "Error",
            code: typeof error?.code === "string" ? error.code : null,
            message: typeof error?.message === "string" ? error.message.slice(0, 1_000) : "Project memory cycle failed."
          });
          if (normalized.onError === null) throw error;
          await normalized.onError(error, status());
        }
        if (!stopping) await abortableDelay(normalized.intervalMs, signal);
      }
    } catch (error) {
      if (!stopping && !normalized.signal?.aborted) throw error;
    } finally {
      running = false;
      stopping = false;
    }
    return status();
  }

  return Object.freeze({
    run,
    stop() {
      stopping = true;
      stopController.abort();
    },
    status
  });
}
