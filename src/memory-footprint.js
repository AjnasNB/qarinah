import { lstat } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify, deepFreezeJson } from "./canonical.js";
import { compileContext, renderContextPackMarkdown } from "./compiler.js";
import { QarinahError } from "./errors.js";
import { readEvents } from "./store.js";
import { loadWorkspace } from "./workspace.js";

export const MEMORY_FOOTPRINT_SCHEMA_VERSION = "qarinah.memory-footprint.v1";

const STORAGE_FILES = Object.freeze({
  ledger: ["events", "events.jsonl"],
  sqlite: ["index", "qarinah.db"],
  graph: ["graph", "graph.json"],
  index: ["index", "index.json"],
  context: ["records", "CONTEXT.md"],
  overview: ["records", "OVERVIEW.md"],
  decisions: ["records", "DECISIONS.md"],
  flow: ["records", "FLOW.md"],
  changes: ["records", "CHANGES.md"],
  dashboard: ["dashboard", "index.html"]
});

function optionalInteger(value, label, minimum, maximum) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function optionalRate(value) {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw new TypeError("ratePerMillion must be a finite number greater than 0 and no greater than 1000000.");
  }
  return value;
}

function money(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function fileBytes(workspace, segments) {
  const candidate = path.join(workspace.qarinahDir, ...segments);
  try {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
      throw new QarinahError("STORAGE_LINK_REJECTED", `.qarinah/${segments.join("/")} must be a singly linked regular file.`);
    }
    return metadata.size;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

function importedSourceBytes(events) {
  const files = new Map();
  for (const event of events) {
    const receipt = event.data?.archiveImport;
    if (receipt?.mode !== "compact" || typeof receipt.normalizedFileDigest !== "string"
      || !Number.isSafeInteger(receipt.sourceBytes) || receipt.sourceBytes < 0) continue;
    files.set(receipt.normalizedFileDigest, receipt.sourceBytes);
  }
  return [...files.values()].reduce((sum, value) => sum + value, 0);
}

export async function measureMemoryFootprint(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Memory footprint options must be a record.");
  const allowed = new Set(["cwd", "query", "maxChars", "maxTokens", "baselineTokens", "ratePerMillion", "inMemory", "updateCheckpoint"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Memory footprint options contain unknown field(s): ${unknown.join(", ")}.`);
  if (options.inMemory !== undefined && typeof options.inMemory !== "boolean") throw new TypeError("inMemory must be a boolean.");
  if (options.updateCheckpoint !== undefined && typeof options.updateCheckpoint !== "boolean") throw new TypeError("updateCheckpoint must be a boolean.");
  const query = options.query ?? "project decisions outcomes tools changes";
  if (typeof query !== "string" || query.length > 4_096) throw new TypeError("query must be a string up to 4096 characters.");
  const maxChars = optionalInteger(options.maxChars, "maxChars", 512, 1_000_000);
  const maxTokens = optionalInteger(options.maxTokens, "maxTokens", 128, 1_000_000);
  const baselineTokens = optionalInteger(options.baselineTokens, "baselineTokens", 0, 1_000_000_000);
  const ratePerMillion = optionalRate(options.ratePerMillion);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: options.updateCheckpoint !== false });
  const ledgerCharacters = events.reduce((total, event) => total + canonicalStringify(event).length + 1, 0);
  const ledgerEstimatedTokens = events.length > 0 ? Math.ceil(ledgerCharacters / 4) : null;
  const storage = {};
  for (const [name, segments] of Object.entries(STORAGE_FILES)) storage[name] = await fileBytes(workspace, segments);
  storage.total = Object.values(storage).reduce((sum, value) => sum + value, 0);
  const importedBytes = importedSourceBytes(events);
  const pack = await compileContext(query, {
    cwd: workspace.root,
    minimumCoverage: "any",
    inMemory: options.inMemory === true,
    updateCheckpoint: options.updateCheckpoint,
    ...(maxChars === undefined ? {} : { maxChars }),
    ...(maxTokens === undefined ? {} : { maxTokens })
  });
  const rendered = renderContextPackMarkdown(pack);
  const renderedBytes = Buffer.byteLength(rendered);
  const deliveredTokens = pack.budget.estimatedTokens;
  const inferredBaseline = importedBytes > 0 ? Math.ceil(importedBytes / 4) : ledgerEstimatedTokens;
  const selectedBaseline = baselineTokens ?? inferredBaseline;
  const source = baselineTokens !== undefined ? "caller-supplied"
    : importedBytes > 0 ? "portable-chars-div-4-from-compact-import-receipts"
      : ledgerEstimatedTokens !== null ? "portable-chars-div-4-from-authoritative-ledger" : "not-measured";
  const savedTokens = selectedBaseline === null ? null : Math.max(0, selectedBaseline - deliveredTokens);
  const reductionPercent = selectedBaseline > 0 ? Math.round((savedTokens / selectedBaseline) * 10000) / 100 : null;
  const ratio = deliveredTokens > 0 && selectedBaseline !== null ? Math.round((selectedBaseline / deliveredTokens) * 100) / 100 : null;
  const costs = ratePerMillion === null || selectedBaseline === null ? null : {
    ratePerMillion,
    baseline: money((selectedBaseline / 1_000_000) * ratePerMillion),
    delivered: money((deliveredTokens / 1_000_000) * ratePerMillion),
    estimatedSaving: money((savedTokens / 1_000_000) * ratePerMillion)
  };
  return deepFreezeJson({
    schemaVersion: MEMORY_FOOTPRINT_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    query,
    retained: {
      eventCount: events.length,
      ledgerCharacters,
      ledgerEstimatedTokens,
      importedSourceBytes: importedBytes,
      importedSourceBytesKnown: importedBytes > 0,
      storageBytes: storage
    },
    deliveredPack: {
      itemCount: pack.items.length,
      usedChars: pack.budget.usedChars,
      estimatedTokens: deliveredTokens,
      renderedBytes,
      manifestHash: pack.manifestHash
    },
    comparison: {
      status: selectedBaseline === null ? "not-measured" : "measured",
      source,
      baselineTokens: selectedBaseline,
      deliveredTokens,
      savedTokens,
      reductionPercent,
      baselineToPackRatio: ratio,
      costs
    },
    boundaries: {
      tokenEstimator: "portable ceil(characters / 4)",
      importedBytes: "Available only from retained compact-import receipts; not a claim that all source bytes fit in the pack.",
      automaticBaseline: "Uses compact-import source bytes when retained; otherwise uses canonical characters in the verified authoritative JSONL ledger. It compares that local text estimate with one generated task pack, not a provider bill or total model session.",
      cost: "Flat uncached input-token arithmetic only; excludes output, reasoning, tools, caching, retrieval, hosting, and fixed fees."
    }
  });
}
