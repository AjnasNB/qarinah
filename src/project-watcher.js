import { abortableDelay, throwIfAborted, validateAbortSignal } from "./abort.js";
import { deepFreezeJson, sha256 } from "./canonical.js";
import { runCodingContextHarness } from "./coding-harness.js";
import { rebuildDerivedState } from "./indexer.js";
import { scanProjectStructure } from "./project-structure.js";
import { buildSymbolGraph } from "./symbol-graph.js";
import { loadWorkspace } from "./workspace.js";

export const PROJECT_MEMORY_CYCLE_SCHEMA_VERSION = "qarinah.project-memory-cycle.v1";

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

export async function runProjectMemoryCycle(options = {}) {
  const normalized = normalizeCycleOptions(options);
  throwIfAborted(normalized.signal);
  const workspace = await loadWorkspace(normalized.cwd);
  const scan = await scanProjectStructure({
    cwd: workspace.root,
    ...normalized.scan
  });
  throwIfAborted(normalized.signal);

  let symbols = null;
  let harness = null;
  let derived = null;
  if (scan.captured) {
    if (normalized.symbols) {
      const graph = await buildSymbolGraph({ cwd: workspace.root, persist: true });
      symbols = Object.freeze({
        schemaVersion: graph.schemaVersion,
        manifestHash: graph.manifestHash,
        files: graph.coverage.indexedFiles,
        symbols: graph.coverage.declarations,
        references: graph.coverage.resolvedReferences,
        complete: graph.coverage.complete
      });
    }
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
    if (normalized.rebuild) {
      const state = await rebuildDerivedState(workspace.root, { signal: normalized.signal });
      derived = Object.freeze({
        headHash: state.headHash,
        eventCount: state.eventCount,
        linkedNodes: state.linkedMemory.nodes,
        sqliteSchemaVersion: state.readModel.schemaVersion
      });
    }
  }

  const core = {
    schemaVersion: PROJECT_MEMORY_CYCLE_SCHEMA_VERSION,
    generatedAt: normalized.generatedAt,
    workspaceId: workspace.config.workspaceId,
    worktreeId: workspace.worktree?.worktreeId ?? null,
    changed: scan.captured,
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
