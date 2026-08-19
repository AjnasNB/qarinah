import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { compileContextFromVerifiedEvents } from "./compiler.js";
import { readEvents } from "./store.js";
import { PORTABLE_TOKEN_ESTIMATOR } from "./token-budget.js";
import { atomicWriteFile, loadWorkspace, resolveWithin } from "./workspace.js";

export const SESSION_CONTEXT_RECEIPT_SCHEMA_VERSION = "qarinah.session-context-receipt.v1";
export const SESSION_CONTEXT_RECEIPT_INDEX_SCHEMA_VERSION = "qarinah.session-context-receipt-index.v1";

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Session receipt options must be a record.");
  const allowed = new Set(["cwd", "query", "sessionId", "maxChars", "maxTokens", "limit", "write", "clock"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Session receipt options contain unknown field(s): ${unknown.join(", ")}.`);
  const query = options.query;
  if (query !== undefined && (typeof query !== "string" || query.length > 4_096)) throw new TypeError("query must be a string up to 4096 characters.");
  if (options.sessionId !== undefined && (typeof options.sessionId !== "string" || options.sessionId.length < 1 || options.sessionId.length > 256)) {
    throw new TypeError("sessionId must be a non-empty string up to 256 characters.");
  }
  const integer = (value, label, minimum, maximum, fallback) => {
    const selected = value ?? fallback;
    if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
      throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
    }
    return selected;
  };
  if (options.write !== undefined && typeof options.write !== "boolean") throw new TypeError("write must be a boolean.");
  if (options.clock !== undefined && typeof options.clock !== "function") throw new TypeError("clock must be a function.");
  const generated = options.clock?.() ?? new Date();
  if (!(generated instanceof Date) || !Number.isFinite(generated.getTime())) throw new TypeError("clock must return a valid Date.");
  return {
    cwd: options.cwd ?? process.cwd(),
    query,
    sessionId: options.sessionId,
    maxChars: integer(options.maxChars, "maxChars", 512, 1_000_000, 12_000),
    maxTokens: options.maxTokens === undefined ? undefined : integer(options.maxTokens, "maxTokens", 128, 1_000_000),
    limit: integer(options.limit, "limit", 1, 64, 20),
    write: options.write === true,
    generatedAt: generated.toISOString()
  };
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function receiptPathId(sessionId) {
  return sha256(sessionId).slice("sha256:".length, "sha256:".length + 32);
}

async function buildReceipt(workspace, sessionId, events, options) {
  const startedAt = performance.now();
  const receiptQuery = options.query ?? events.map((event) => event.title).join(" ").slice(0, 4_096);
  const pack = await compileContextFromVerifiedEvents(receiptQuery, {
    workspace,
    events,
    maxChars: Math.min(options.maxChars, workspace.config.contextMaxChars),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    limit: options.limit,
    minimumCoverage: "any",
    rankingProfile: "admission-first-v2",
    updateCheckpoint: false,
    clock: () => new Date(options.generatedAt)
  });
  const completedAt = performance.now();
  const sourceCharacters = events.reduce((total, event) => total + canonicalStringify(event).length + 1, 0);
  const sourceEstimatedTokens = Math.ceil(sourceCharacters / 4);
  const packCharacters = pack.budget.usedChars;
  const selectedEventIds = pack.items.map((item) => item.eventId);
  const selected = new Set(selectedEventIds);
  const toolRequests = events.filter((event) => event.kind === "tool.requested").length;
  const toolOutcomes = events.filter((event) => event.kind === "tool.completed").length;
  const base = {
    schemaVersion: SESSION_CONTEXT_RECEIPT_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    workspaceId: workspace.config.workspaceId,
    sessionId,
    sessionKey: `session_${receiptPathId(sessionId)}`,
    hostAdapters: [...new Set(events.map((event) => event.provenance.adapter))].sort(),
    interval: {
      startedAt: events[0]?.timestamp ?? null,
      completedAt: events.at(-1)?.timestamp ?? null
    },
    source: {
      eventCount: events.length,
      headHash: events.at(-1)?.hash ?? null,
      characters: sourceCharacters,
      estimatedTokens: sourceEstimatedTokens,
      estimator: `${PORTABLE_TOKEN_ESTIMATOR.id}@${PORTABLE_TOKEN_ESTIMATOR.version}`,
      toolRequests,
      toolOutcomes
    },
    delivered: {
      query: receiptQuery,
      itemCount: pack.items.length,
      citationCount: pack.items.filter((item) => typeof item.hash === "string").length,
      eventIds: selectedEventIds,
      sourceEventsSelected: events.filter((event) => selected.has(event.eventId)).length,
      characters: packCharacters,
      estimatedTokens: pack.budget.estimatedTokens,
      manifestHash: pack.manifestHash,
      evidenceCoverage: pack.evidenceCoverage?.status ?? pack.coverage?.status ?? "unknown"
    },
    comparison: {
      savedEstimatedTokens: Math.max(0, sourceEstimatedTokens - pack.budget.estimatedTokens),
      reductionPercent: sourceEstimatedTokens > 0
        ? round((Math.max(0, sourceEstimatedTokens - pack.budget.estimatedTokens) / sourceEstimatedTokens) * 100, 2)
        : null,
      baselineToPackRatio: pack.budget.estimatedTokens > 0
        ? round(sourceEstimatedTokens / pack.budget.estimatedTokens, 2)
        : null,
      selectionRatio: events.length > 0 ? round(selected.size / events.length, 4) : null
    },
    timing: {
      queryMilliseconds: round(completedAt - startedAt, 3)
    },
    unsupportedQueryCount: pack.items.length === 0 ? 1 : 0,
    boundaries: {
      providerUsage: "No provider-billed usage is inferred. Token values use the named portable estimator.",
      content: "The receipt contains identities, counts, timings, and hashes, not retained event bodies.",
      session: "Only events carrying this exact host-supplied sessionId are measured."
    }
  };
  return deepFreezeJson({ ...base, receiptHash: sha256(base) });
}

export async function buildSessionContextReceipts(options = {}) {
  const normalized = normalizeOptions(options);
  const workspace = await loadWorkspace(normalized.cwd);
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const grouped = new Map();
  for (const event of events) {
    if (event.sessionId === null) continue;
    if (normalized.sessionId !== undefined && event.sessionId !== normalized.sessionId) continue;
    const list = grouped.get(event.sessionId) ?? [];
    list.push(event);
    grouped.set(event.sessionId, list);
  }
  const receipts = [];
  for (const [sessionId, sessionEvents] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    receipts.push(await buildReceipt(workspace, sessionId, sessionEvents, normalized));
  }
  const indexBase = {
    schemaVersion: SESSION_CONTEXT_RECEIPT_INDEX_SCHEMA_VERSION,
    generatedAt: normalized.generatedAt,
    workspaceId: workspace.config.workspaceId,
    query: normalized.query ?? "session-derived-titles",
    receiptCount: receipts.length,
    receipts: receipts.map((receipt) => ({
      sessionId: receipt.sessionId,
      sessionKey: receipt.sessionKey,
      receiptHash: receipt.receiptHash,
      sourceEventCount: receipt.source.eventCount,
      deliveredTokens: receipt.delivered.estimatedTokens,
      reductionPercent: receipt.comparison.reductionPercent
    }))
  };
  const index = deepFreezeJson({ ...indexBase, manifestHash: sha256(indexBase) });
  if (normalized.write) {
    const directory = resolveWithin(workspace.qarinahDir, "receipts", "sessions");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    for (const receipt of receipts) {
      await atomicWriteFile(resolveWithin(directory, `${receipt.sessionKey}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
    }
    await atomicWriteFile(resolveWithin(workspace.qarinahDir, "receipts", "session-index.json"), `${JSON.stringify(index, null, 2)}\n`);
  }
  return deepFreezeJson({ ...index, receipts });
}
