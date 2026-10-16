import { createHash } from "node:crypto";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";

// Process-local performance caches only. They never cache consent or admission.
// A ledger lookup hashes every freshly read byte; filesystem metadata is not proof.
const LIMIT = 32 * 1024 * 1024;
class BoundedCache {
  entries = new Map();
  bytes = 0;
  hits = 0;
  misses = 0;
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) { this.misses++; return null; }
    this.entries.delete(key); this.entries.set(key, entry); this.hits++;
    return entry.value;
  }
  set(key, value, bytes) {
    if (bytes > LIMIT) return;
    const previous = this.entries.get(key);
    if (previous) { this.bytes -= previous.bytes; this.entries.delete(key); }
    while (this.entries.size && (this.entries.size >= 8 || this.bytes + bytes > LIMIT)) {
      const first = this.entries.keys().next().value;
      this.bytes -= this.entries.get(first).bytes; this.entries.delete(first);
    }
    this.entries.set(key, { value, bytes }); this.bytes += bytes;
  }
}
const ledgers = new BoundedCache(), derived = new BoundedCache();
export function verifiedLedgerCacheKey(workspace, bytes) {
  return sha256([workspace.root, workspace.config.workspaceId, workspace.config.maxEventBytes,
    createHash("sha256").update(bytes).digest("hex")]);
}
export function cachedVerifiedEvents(key) {
  const events = ledgers.get(key);
  return events ? [...events] : null;
}
export function rememberVerifiedEvents(key, events, bytes) {
  // Stored-event validation already deeply freezes records, including null-prototype
  // data. structuredClone would change that public record shape on warm reads.
  if (bytes <= LIMIT) ledgers.set(key, deepFreezeJson([...events]), bytes);
}
export function verifiedDerivedState(events, workspaceId, builder) {
  // Only package-internal callers with freshly verified events may use this.
  const key = sha256(["state", workspaceId, events.map((event) => event.hash)]);
  const cached = derived.get(key);
  if (cached) return cached;
  const state = builder(events, workspaceId);
  const bytes = Buffer.byteLength(canonicalStringify(state));
  derived.set(key, state, bytes);
  return state;
}
export function verifiedRetrievalIndex(events, workspaceId, builder) {
  const key = sha256(["index", workspaceId, events.map((event) => event.hash)]);
  const cached = derived.get(key);
  if (cached) return cached;
  const index = builder(events, workspaceId);
  derived.set(key, index, Buffer.byteLength(canonicalStringify(index)));
  return index;
}
export function readCacheStatistics() {
  return { ledger: { hits: ledgers.hits, misses: ledgers.misses, bytes: ledgers.bytes },
    derived: { hits: derived.hits, misses: derived.misses, bytes: derived.bytes } };
}
