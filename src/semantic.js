import { deepFreezeJson } from "./canonical.js";

function scoreMap(value, eligible) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A semantic adapter must return a plain event-score record.");
  }
  const result = new Map();
  for (const [eventId, score] of Object.entries(value)) {
    if (!eligible.has(eventId)) continue;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new TypeError("Semantic scores must be finite numbers from 0 to 1.");
    }
    result.set(eventId, score);
  }
  return result;
}

export async function rerankContextPack(pack, options = {}) {
  const adapter = options.adapter;
  if (adapter === undefined || adapter === null) return pack;
  if (!adapter || typeof adapter !== "object" || typeof adapter.score !== "function") {
    throw new TypeError("adapter.score must be a function.");
  }
  const adapterId = typeof adapter.id === "string" && adapter.id.trim() ? adapter.id.trim() : "local-semantic-adapter";
  const candidates = pack.items.map((item) => ({
    eventId: item.eventId,
    title: item.title,
    excerpt: item.excerpt
  }));
  const semantic = scoreMap(
    await adapter.score({ query: pack.query, candidates: deepFreezeJson(candidates) }),
    new Set(candidates.map((candidate) => candidate.eventId))
  );
  const originalRank = new Map(pack.items.map((item, index) => [item.eventId, index]));
  const items = [...pack.items].sort((left, right) => (
    (semantic.get(right.eventId) ?? -1) - (semantic.get(left.eventId) ?? -1)
    || originalRank.get(left.eventId) - originalRank.get(right.eventId)
  ));
  return deepFreezeJson({
    ...pack,
    items,
    semanticRerank: {
      adapter: adapterId,
      candidateCount: candidates.length,
      scoredCount: semantic.size,
      authority: "rerank-only"
    }
  });
}
