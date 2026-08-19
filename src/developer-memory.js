import { deepFreezeJson, sha256 } from "./canonical.js";
import { buildMemoryDashboard } from "./dashboard.js";
import { listGitWorktrees } from "./git-worktrees.js";
import { queryLinkedProjectMemory } from "./linked-memory.js";
import { buildSessionContextReceipts } from "./session-receipts.js";
import { loadWorkspace } from "./workspace.js";

export const DEVELOPER_MEMORY_VIEW_SCHEMA_VERSION = "qarinah.developer-memory-view.v1";

function normalizedOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Developer memory options must be a record.");
  const allowed = new Set(["cwd", "query", "includeWorktrees", "limit", "clock"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Developer memory options contain unknown field(s): ${unknown.join(", ")}.`);
  const query = options.query ?? "project decisions tools outcomes conflicts changes";
  if (typeof query !== "string" || query.length > 4_096) throw new TypeError("query must be a string up to 4096 characters.");
  if (options.includeWorktrees !== undefined && typeof options.includeWorktrees !== "boolean") throw new TypeError("includeWorktrees must be a boolean.");
  const limit = options.limit ?? 40;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError("limit must be an integer from 1 to 100.");
  if (options.clock !== undefined && typeof options.clock !== "function") throw new TypeError("clock must be a function.");
  const now = options.clock?.() ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("clock must return a valid Date.");
  return { cwd: options.cwd ?? process.cwd(), query, includeWorktrees: options.includeWorktrees !== false, limit, generatedAt: now.toISOString() };
}

function compactWorkspace(dashboard, current) {
  return {
    current,
    workspaceId: dashboard.workspaceId,
    name: dashboard.workspace.name,
    root: dashboard.workspace.root,
    repositoryId: dashboard.workspace.worktree?.repositoryId ?? dashboard.workspace.repositoryIds[0] ?? null,
    worktreeId: dashboard.workspace.worktree?.worktreeId ?? null,
    branch: dashboard.workspace.worktree?.branch ?? null,
    commit: dashboard.workspace.worktree?.commit ?? null,
    eventCount: dashboard.workspace.eventCount,
    ledgerHeadHash: dashboard.workspace.ledgerHeadHash,
    lastActivityAt: dashboard.workspace.lastActivityAt,
    currentDecisions: dashboard.totals.currentDecisions,
    conflicts: dashboard.totals.conflicts,
    toolEvents: dashboard.totals.tools,
    graphNodes: dashboard.totals.graphNodes,
    graphEdges: dashboard.totals.graphEdges,
    contextSavings: dashboard.contextSavings
  };
}

function timeline(dashboard) {
  return dashboard.activity.map((event) => ({
    eventId: event.eventId,
    timestamp: event.timestamp,
    kind: event.kind,
    title: event.title,
    hash: event.hash,
    repositoryId: event.repositoryId,
    sourceId: event.sourceId,
    category: event.kind === "decision"
      ? "decision"
      : event.kind.startsWith("tool.")
        ? "tool"
        : event.kind === "turn.completed" || event.kind === "summary"
          ? "outcome"
          : "activity"
  }));
}

export async function buildDeveloperMemoryView(options = {}) {
  const normalized = normalizedOptions(options);
  const workspace = await loadWorkspace(normalized.cwd);
  const dashboard = await buildMemoryDashboard({ cwd: workspace.root, clock: () => new Date(normalized.generatedAt) });
  const search = await queryLinkedProjectMemory(normalized.query, {
    cwd: workspace.root,
    limit: normalized.limit,
    asOf: normalized.generatedAt,
    updateCheckpoint: false,
    persist: false
  });
  const receiptIndex = await buildSessionContextReceipts({
    cwd: workspace.root,
    query: normalized.query,
    limit: Math.min(20, normalized.limit),
    write: false,
    clock: () => new Date(normalized.generatedAt)
  });
  const worktrees = [];
  if (normalized.includeWorktrees && workspace.worktree !== null) {
    for (const descriptor of await listGitWorktrees(workspace.root)) {
      if (!descriptor.initialized || descriptor.current) continue;
      const sibling = await buildMemoryDashboard({ cwd: descriptor.root, clock: () => new Date(normalized.generatedAt) });
      worktrees.push(compactWorkspace(sibling, false));
    }
  }
  worktrees.unshift(compactWorkspace(dashboard, true));
  const comparison = {
    repositoryId: workspace.worktree?.repositoryId ?? null,
    worktreeCount: worktrees.length,
    initializedCount: worktrees.length,
    totalEvents: worktrees.reduce((total, entry) => total + entry.eventCount, 0),
    totalCurrentDecisions: worktrees.reduce((total, entry) => total + entry.currentDecisions, 0),
    totalConflicts: worktrees.reduce((total, entry) => total + entry.conflicts, 0),
    divergentHeads: new Set(worktrees.map((entry) => entry.commit).filter(Boolean)).size,
    worktrees
  };
  const base = {
    schemaVersion: DEVELOPER_MEMORY_VIEW_SCHEMA_VERSION,
    generatedAt: normalized.generatedAt,
    query: normalized.query,
    workspace: compactWorkspace(dashboard, true),
    health: {
      ledgerHeadHash: dashboard.workspace.ledgerHeadHash,
      capture: dashboard.capture,
      graphManifestHash: dashboard.linkedGraph.manifestHash,
      graphNodes: dashboard.totals.graphNodes,
      graphEdges: dashboard.totals.graphEdges
    },
    search,
    graph: dashboard.linkedGraph,
    timeline: timeline(dashboard),
    decisions: {
      current: dashboard.currentDecisions,
      superseded: dashboard.supersededDecisions
    },
    conflicts: dashboard.conflicts,
    tools: dashboard.tools,
    outcomes: dashboard.majorChanges,
    sessions: receiptIndex,
    worktreeComparison: comparison,
    boundaries: {
      readOnly: true,
      sourceOfTruth: "The verified workspace ledger is authoritative; graph, timeline, receipts, and comparisons are derived views.",
      worktreeIsolation: "Sibling worktrees are read independently and compared by identity and metrics; their writable stores are never merged.",
      usage: "Session token counts are portable estimates unless a host supplies a separate verified provider receipt."
    }
  };
  return deepFreezeJson({ ...base, manifestHash: sha256(base) });
}
