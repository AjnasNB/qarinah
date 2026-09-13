import { deepFreezeJson, sha256 } from "./canonical.js";
import { reviewMetadataEventInput } from "./capture-policy.js";
import { snapshotRecordBoundary } from "./interoperability/boundary.js";
import { appendEvent, readEvents } from "./store.js";
import { loadWorkspace } from "./workspace.js";

export const PROVIDER_USAGE_SCHEMA_VERSION = "qarinah.provider-usage.v1";
const KEYS = ["schemaVersion", "provider", "model", "callId", "attempt", "sessionId", "purpose", "outcome", "inputTokens", "outputTokens", "cachedInputTokens", "reasoningTokens"];
const COUNTS = ["inputTokens", "outputTokens", "cachedInputTokens", "reasoningTokens"];

export function validateProviderUsage(value) {
  const input = snapshotRecordBoundary(value, { label: "Provider usage", keys: KEYS, maximumBytes: 4096, maximumStringLength: 256 });
  if (input.schemaVersion !== PROVIDER_USAGE_SCHEMA_VERSION) throw new TypeError("Unsupported provider usage schemaVersion.");
  for (const key of ["provider", "model", "callId", "sessionId"]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 256 || /[\x00-\x1f]/u.test(input[key])) throw new TypeError(`${key} must be a bounded identifier.`);
  }
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1 || input.attempt > 10000) throw new TypeError("attempt must be an integer from 1 to 10000.");
  if (!["production", "test"].includes(input.purpose)) throw new TypeError("purpose must be production or test.");
  if (!["completed", "failed", "cancelled"].includes(input.outcome)) throw new TypeError("Invalid usage outcome.");
  for (const key of COUNTS) {
    if (input[key] !== null && (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 1_000_000_000)) throw new TypeError(`${key} must be null or an integer from 0 to 1000000000.`);
  }
  if (input.cachedInputTokens !== null && (input.inputTokens === null || input.cachedInputTokens > input.inputTokens)) throw new TypeError("cachedInputTokens must be a subset of inputTokens.");
  if (input.reasoningTokens !== null && (input.outputTokens === null || input.reasoningTokens > input.outputTokens)) throw new TypeError("reasoningTokens must be a subset of outputTokens.");
  return deepFreezeJson(input);
}

export async function recordProviderUsage(value, options = {}) {
  const usage = validateProviderUsage(value);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  // Identity is stable across replay; differing data for one attempt is rejected by appendEvent.
  const identity = sha256([usage.provider, usage.model, usage.sessionId, usage.callId, usage.attempt, usage.purpose]).slice(7, 39).split("");
  identity[12] = "4"; identity[16] = "8";
  const id = identity.join("");
  const event = reviewMetadataEventInput({
    eventId: `evt_${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`,
    kind: "tool.completed", actor: { type: "tool", id: "provider-usage" },
    title: "Model call usage recorded", body: "", data: { providerUsage: usage },
    confidence: "claimed", sessionId: usage.sessionId,
    provenance: { adapter: "qarinah-provider-usage", sourceId: sha256([usage.callId, usage.attempt]) },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  });
  return appendEvent(event, { workspace, capture: workspace.config.capture, idempotent: true });
}

function totals(rows) {
  const result = { attempts: rows.length, completed: 0, failed: 0, cancelled: 0, missingUsageAttempts: 0 };
  for (const row of rows) { result[row.outcome]++; if (row.inputTokens === null || row.outputTokens === null) result.missingUsageAttempts++; }
  for (const key of COUNTS) {
    const known = rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
    if (!Number.isSafeInteger(known)) throw new RangeError("Aggregated token usage exceeds the safe integer range.");
    result[`known${key[0].toUpperCase()}${key.slice(1)}`] = known;
    result[key] = rows.length && rows.every(row => row[key] !== null) ? known : null;
  }
  result.totalTokens = result.inputTokens === null || result.outputTokens === null ? null : result.inputTokens + result.outputTokens;
  if (result.totalTokens !== null && !Number.isSafeInteger(result.totalTokens)) throw new RangeError("Total usage exceeds the safe integer range.");
  return result;
}

export function summarizeProviderUsage(events) {
  const records = [], invalidEventIds = [], identities = new Map();
  for (const event of events) {
    if (!event.data?.providerUsage) continue;
    try {
      const usage = validateProviderUsage(event.data.providerUsage);
      const key = sha256([usage.provider, usage.model, usage.sessionId, usage.callId, usage.attempt, usage.purpose]);
      if (identities.has(key)) { invalidEventIds.push(event.eventId); continue; }
      identities.set(key, true);
      records.push({ ...usage, eventId: event.eventId, eventHash: event.hash, timestamp: event.timestamp });
    } catch { invalidEventIds.push(event.eventId); }
  }
  const live = records.filter(row => row.purpose === "production");
  const groups = new Map();
  for (const row of live) { const key = JSON.stringify([row.provider, row.model]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  return deepFreezeJson({ schemaVersion: "qarinah.provider-usage-summary.v1", production: totals(live), test: totals(records.filter(row => row.purpose === "test")),
    models: [...groups.values()].map(rows => ({ provider: rows[0].provider, model: rows[0].model, ...totals(rows) })),
    invalidEventIds, records, savingsPercent: null, costUsd: null,
    note: "Host-supplied provider counts, not independently verified invoices. Cache is included in input; reasoning is included in output. Missing counts remain unknown. Savings require a matched baseline; token counts alone do not establish cost or quality." });
}

export async function readProviderUsage(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: false });
  return summarizeProviderUsage(events);
}
