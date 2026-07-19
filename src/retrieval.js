import { tokenize } from "./indexer.js";
import { canonicalIsoTimestamp } from "./interoperability/boundary.js";

const RRF_K = 60;
const RELATION_WEIGHTS = Object.freeze({
  contradicts: 1,
  supersedes: 0.95,
  supports: 0.9,
  derived_from: 0.8,
  authorized_by: 0.8,
  governed_by: 0.8,
  produced: 0.65,
  changed: 0.65,
  affects: 0.55,
  references: 0.5
});

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function primitiveDataText(data) {
  return Object.entries(data || {})
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key} ${value}`)
    .join("\n");
}

function normalizedText(value, maximum = 8_192) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function eventSearchText(event) {
  return normalizedText(`${event.title}\n${event.body}\n${primitiveDataText(event.data)}`);
}

function ngrams(value, size = 3) {
  const text = normalizedText(value, 4_096);
  if (text.length === 0) return new Set();
  if (text.length <= size) return new Set([text]);
  const result = new Set();
  for (let index = 0; index <= text.length - size; index += 1) result.add(text.slice(index, index + size));
  return result;
}

function jaccard(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function sortedScores(scores, eventsById) {
  return [...scores.entries()]
    .filter(([eventId, score]) => eventsById.has(eventId) && Number.isFinite(score) && score > 0)
    .sort((left, right) => (
      right[1] - left[1]
      || eventsById.get(right[0]).timestamp.localeCompare(eventsById.get(left[0]).timestamp)
      || left[0].localeCompare(right[0])
    ));
}

function bm25Scores(index, queryTerms, eligibleEventIds) {
  const scores = new Map();
  if (queryTerms.length === 0) return scores;
  const documentCount = Math.max(1, index.events.length);
  const averageLength = index.averageDocumentLength > 0 ? index.averageDocumentLength : 1;
  const k1 = 1.2;
  const b = 0.75;
  for (const event of index.events) {
    if (!eligibleEventIds.has(event.eventId)) continue;
    let score = 0;
    for (const term of queryTerms) {
      const frequency = event.termFrequencies?.[term] || 0;
      if (frequency === 0) continue;
      const documentsWithTerm = index.documentFrequency?.[term] || index.postings?.[term]?.length || 0;
      const inverseFrequency = Math.log(1 + ((documentCount - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5)));
      const denominator = frequency + k1 * (1 - b + b * ((event.documentLength || 0) / averageLength));
      const titleBoost = event.titleTerms?.includes(term) ? 1.8 : 1;
      score += inverseFrequency * ((frequency * (k1 + 1)) / denominator) * titleBoost;
    }
    if (score > 0) scores.set(event.eventId, rounded(score));
  }
  return scores;
}

function fuzzyScores(index, query, eligibleEventIds) {
  const scores = new Map();
  const normalizedQuery = normalizedText(query);
  if (normalizedQuery.length < 3) return scores;
  const queryGrams = ngrams(normalizedQuery);
  for (const event of index.events) {
    if (!eligibleEventIds.has(event.eventId)) continue;
    const similarity = jaccard(queryGrams, ngrams(eventSearchText(event)));
    const phraseBonus = eventSearchText(event).includes(normalizedQuery) ? 0.5 : 0;
    const score = similarity + phraseBonus;
    if (score >= 0.025) scores.set(event.eventId, rounded(score));
  }
  return scores;
}

function buildReverseAdjacency(index) {
  const reverse = new Map();
  for (const [source, relations] of Object.entries(index.adjacency || {})) {
    for (const relation of relations) {
      if (!reverse.has(relation.target)) reverse.set(relation.target, []);
      reverse.get(relation.target).push({ type: relation.type, target: source });
    }
  }
  for (const relations of reverse.values()) {
    relations.sort((left, right) => `${left.type}\0${left.target}`.localeCompare(`${right.type}\0${right.target}`));
  }
  return reverse;
}

function graphScores(index, seedScores, eventsById) {
  const scores = new Map();
  const reverse = buildReverseAdjacency(index);
  const seeds = sortedScores(seedScores, eventsById).slice(0, 32);
  const maximumSeed = seeds[0]?.[1] || 1;
  for (const [eventId, rawScore] of seeds) {
    const normalizedSeed = rawScore / maximumSeed;
    const relations = [
      ...(index.adjacency?.[eventId] || []),
      ...(reverse.get(eventId) || [])
    ];
    for (const relation of relations) {
      if (!eventsById.has(relation.target)) continue;
      const relationWeight = RELATION_WEIGHTS[relation.type] || 0.4;
      const score = normalizedSeed * relationWeight;
      scores.set(relation.target, Math.max(scores.get(relation.target) || 0, rounded(score)));
    }
  }
  return scores;
}

function authorityScores(index, candidateIds, scope, asOf) {
  const scores = new Map();
  if (scope === undefined) return scores;
  for (const event of index.events) {
    if (!candidateIds.has(event.eventId)) continue;
    const authority = event.authority;
    if (!authority || authority.scope !== scope || authority.assignedAt > asOf) continue;
    if (authority.expiresAt !== null && authority.expiresAt <= asOf) continue;
    if (authority.revokedAt !== null && authority.revokedAt <= asOf) continue;
    scores.set(event.eventId, 1 + authority.rank / 100);
  }
  return scores;
}

function rankMap(entries) {
  return new Map(entries.map(([eventId], index) => [eventId, index + 1]));
}

function reciprocalRankFusion(lists, eventsById) {
  const scores = new Map();
  const components = new Map();
  for (const { name, weight, entries } of lists) {
    const ranks = rankMap(entries);
    for (const [eventId, rank] of ranks) {
      const increment = weight / (RRF_K + rank);
      scores.set(eventId, (scores.get(eventId) || 0) + increment);
      const current = components.get(eventId) || [];
      current.push({ name, rank });
      components.set(eventId, current);
    }
  }
  return sortedScores(scores, eventsById).map(([eventId, score]) => ({
    event: eventsById.get(eventId),
    score: rounded(score),
    components: (components.get(eventId) || []).sort((left, right) => left.name.localeCompare(right.name))
  }));
}

function conflictPairs(index, eventsById) {
  const pairs = new Map();
  for (const [source, relations] of Object.entries(index.adjacency || {})) {
    if (!eventsById.has(source)) continue;
    for (const relation of relations) {
      if (relation.type !== "contradicts" || !eventsById.has(relation.target) || source === relation.target) continue;
      const eventIds = [source, relation.target].sort();
      pairs.set(eventIds.join("\0"), Object.freeze({ eventIds }));
    }
  }
  return [...pairs.values()].sort((left, right) => left.eventIds.join("\0").localeCompare(right.eventIds.join("\0")));
}

function activeSupersessions(index, eventsById, asOf) {
  const supersededBy = new Map();
  for (const [source, relations] of Object.entries(index.adjacency || {})) {
    const sourceEvent = eventsById.get(source);
    if (!sourceEvent || sourceEvent.timestamp > asOf) continue;
    for (const relation of relations) {
      if (relation.type !== "supersedes" || !eventsById.has(relation.target)) continue;
      if (!supersededBy.has(relation.target)) supersededBy.set(relation.target, []);
      supersededBy.get(relation.target).push(source);
    }
  }
  for (const values of supersededBy.values()) values.sort();
  return supersededBy;
}

function diversitySimilarity(left, right) {
  return jaccard(new Set(left.event.terms || []), new Set(right.event.terms || []));
}

function diversify(entries, limit, lambda) {
  const available = [...entries];
  const selected = [];
  const maximumScore = available[0]?.score || 1;
  while (available.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < available.length; index += 1) {
      const candidate = available[index];
      const relevance = candidate.score / maximumScore;
      const redundancy = selected.length === 0
        ? 0
        : Math.max(...selected.map((entry) => diversitySimilarity(candidate, entry)));
      const value = lambda * relevance - (1 - lambda) * redundancy;
      if (value > bestValue
        || (value === bestValue && candidate.event.timestamp > available[bestIndex].event.timestamp)
        || (value === bestValue && candidate.event.timestamp === available[bestIndex].event.timestamp
          && candidate.event.eventId < available[bestIndex].event.eventId)) {
        bestValue = value;
        bestIndex = index;
      }
    }
    selected.push({ ...available.splice(bestIndex, 1)[0], diversityScore: rounded(bestValue) });
  }
  return selected;
}

function reasonFor(entry) {
  const components = entry.components.map(({ name, rank }) => `${name}#${rank}`).join(", ");
  return `hybrid rank ${components}; diversified=${entry.diversityScore}`;
}

export function rankContextEvents(index, query = "", options = {}) {
  const allEventsById = new Map(index.events.map((event) => [event.eventId, event]));
  const queryTerms = tokenize(query);
  const limit = options.limit ?? 20;
  const diversity = options.diversity ?? 0.82;
  const supersessionPolicy = options.supersessionPolicy ?? "prefer-current";
  if (options.asOf === undefined) {
    throw new TypeError("asOf is required so retrieval remains time-explicit and deterministic.");
  }
  const asOf = canonicalIsoTimestamp(
    options.asOf,
    "asOf"
  );
  const authorityScope = options.authorityScope;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new TypeError("limit must be an integer from 1 to 1000.");
  if (typeof diversity !== "number" || !Number.isFinite(diversity) || diversity < 0 || diversity > 1) {
    throw new TypeError("diversity must be a number from 0 to 1.");
  }
  if (!["prefer-current", "include-history"].includes(supersessionPolicy)) {
    throw new TypeError("supersessionPolicy must be prefer-current or include-history.");
  }
  if (authorityScope !== undefined && (typeof authorityScope !== "string" || authorityScope.length < 1 || authorityScope.length > 256)) {
    throw new TypeError("authorityScope must be a non-empty string up to 256 characters.");
  }
  const expiredEventIds = new Set(index.events
    .filter((event) => event.retention?.expiresAt !== null && event.retention?.expiresAt <= asOf)
    .map((event) => event.eventId));
  const futureEventIds = new Set(index.events
    .filter((event) => event.timestamp > asOf)
    .map((event) => event.eventId));
  const eventsById = new Map([...allEventsById].filter(([eventId]) => (
    !expiredEventIds.has(eventId) && !futureEventIds.has(eventId)
  )));
  const eligibleEventIds = new Set(eventsById.keys());

  if (queryTerms.length === 0) {
    const newest = [...eventsById.values()]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp) || left.eventId.localeCompare(right.eventId))
      .map((event, index) => ({ event, score: 1 / (index + 1), components: [{ name: "recency", rank: index + 1 }] }));
    const supersededBy = activeSupersessions(index, eventsById, asOf);
    const exclusions = [];
    const eligible = newest.filter((entry) => {
      if (supersessionPolicy === "include-history" || !supersededBy.has(entry.event.eventId)) return true;
      exclusions.push({ eventId: entry.event.eventId, reason: "superseded", by: supersededBy.get(entry.event.eventId) });
      return false;
    });
    return Object.freeze({
      strategy: "hybrid-local-v1",
      ranked: diversify(eligible, limit, diversity).map((entry) => ({ ...entry, reason: reasonFor(entry) })),
      conflicts: conflictPairs(index, eventsById),
      exclusions,
      supersessionPolicy,
      authorityScope: authorityScope ?? null,
      asOf,
      filters: { expired: expiredEventIds.size, future: futureEventIds.size }
    });
  }

  const lexical = bm25Scores(index, queryTerms, eligibleEventIds);
  const fuzzy = fuzzyScores(index, query, eligibleEventIds);
  const seedScores = new Map([...lexical, ...fuzzy].map(([eventId]) => [eventId, (lexical.get(eventId) || 0) + (fuzzy.get(eventId) || 0)]));
  const graph = graphScores(index, seedScores, eventsById);
  const authority = authorityScores(index, new Set(seedScores.keys()), authorityScope, asOf);
  const lists = [
    { name: "bm25", weight: 1, entries: sortedScores(lexical, eventsById) },
    { name: "fuzzy", weight: 0.75, entries: sortedScores(fuzzy, eventsById) },
    { name: "graph", weight: 0.65, entries: sortedScores(graph, eventsById) },
    { name: "authority", weight: 1.25, entries: sortedScores(authority, eventsById) }
  ].filter((entry) => entry.entries.length > 0);
  const fused = reciprocalRankFusion(lists, eventsById);
  const supersededBy = activeSupersessions(index, eventsById, asOf);
  const exclusions = [];
  const eligible = fused.filter((entry) => {
    if (supersessionPolicy === "include-history" || !supersededBy.has(entry.event.eventId) || query.includes(entry.event.eventId)) return true;
    exclusions.push({ eventId: entry.event.eventId, reason: "superseded", by: supersededBy.get(entry.event.eventId) });
    return false;
  });
  return Object.freeze({
    strategy: "hybrid-local-v1",
    ranked: diversify(eligible, limit, diversity).map((entry) => ({ ...entry, reason: reasonFor(entry) })),
    conflicts: conflictPairs(index, eventsById),
    exclusions,
    supersessionPolicy,
    authorityScope: authorityScope ?? null,
    asOf,
    filters: { expired: expiredEventIds.size, future: futureEventIds.size }
  });
}
