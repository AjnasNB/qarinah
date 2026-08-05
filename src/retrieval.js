import { tokenize } from "./indexer.js";
import { canonicalIsoTimestamp } from "./interoperability/boundary.js";

const RRF_K = 60;
const RANKING_PROFILES = new Set(["balanced-v1", "admission-first-v2"]);
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

function authorityScores(index, candidateIds, scopes, asOf) {
  const scores = new Map();
  if (scopes.length === 0) return scores;
  for (const event of index.events) {
    if (!candidateIds.has(event.eventId)) continue;
    const authority = event.authority;
    if (!authority || !scopes.includes(authority.scope) || authority.assignedAt > asOf) continue;
    if (authority.expiresAt !== null && authority.expiresAt <= asOf) continue;
    if (authority.revokedAt !== null && authority.revokedAt <= asOf) continue;
    scores.set(event.eventId, 1 + authority.rank / 100);
  }
  return scores;
}

function normalizedSelectors(value, label) {
  if (value === undefined) return [];
  const list = typeof value === "string" ? [value] : value;
  if (!Array.isArray(list) || list.length > 64
    || list.some((entry) => typeof entry !== "string" || entry.length < 1 || entry.length > 256)) {
    throw new TypeError(`${label} must contain at most 64 non-empty strings up to 256 characters.`);
  }
  if (new Set(list).size !== list.length) throw new TypeError(`${label} cannot contain duplicates.`);
  return [...list].sort();
}

function permittedByDisclosure(event, scopes) {
  const disclosure = event.disclosure;
  if (!disclosure || disclosure.classification !== "restricted") return true;
  return disclosure.scopes.some((scope) => scopes.includes(scope));
}

function permittedRepository(event, repositoryIds) {
  return repositoryIds.length === 0 || event.repository === null || repositoryIds.includes(event.repository.id);
}

function sqliteScores(candidates, eligibleEventIds) {
  const scores = new Map();
  for (const candidate of candidates ?? []) {
    if (!eligibleEventIds.has(candidate.eventId) || !Number.isSafeInteger(candidate.rank) || candidate.rank < 1) continue;
    scores.set(candidate.eventId, 1 / candidate.rank);
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

function lexicalCascadeFusion(lists, eventsById) {
  const ranksByName = new Map(lists.map((entry) => [entry.name, rankMap(entry.entries)]));
  const candidates = new Set(lists.flatMap((entry) => entry.entries.map(([eventId]) => eventId)));
  const rankFor = (eventId, names) => {
    const ranks = names.map((name) => ranksByName.get(name)?.get(eventId)).filter(Number.isSafeInteger);
    return ranks.length === 0 ? null : Math.min(...ranks);
  };
  return [...candidates].map((eventId) => {
    const authorityRank = rankFor(eventId, ["authority"]);
    const primaryRank = rankFor(eventId, ["sqlite-fts5", "bm25"]);
    const fuzzyRank = rankFor(eventId, ["fuzzy"]);
    const graphRank = rankFor(eventId, ["graph"]);
    const tier = authorityRank !== null && primaryRank !== null
      ? 0
      : (primaryRank !== null ? 1 : (fuzzyRank !== null ? 2 : 3));
    const rank = tier === 0
      ? authorityRank
      : (primaryRank ?? fuzzyRank ?? graphRank ?? Number.MAX_SAFE_INTEGER);
    const components = lists.flatMap(({ name }) => {
      const componentRank = ranksByName.get(name)?.get(eventId);
      return componentRank === undefined ? [] : [{ name, rank: componentRank }];
    }).sort((left, right) => left.name.localeCompare(right.name));
    return {
      event: eventsById.get(eventId),
      score: rounded(1 / (1 + tier * 1_000 + rank)),
      components,
      cascade: { tier, rank, authorityRank, primaryRank, fuzzyRank, graphRank }
    };
  }).sort((left, right) => (
    left.cascade.tier - right.cascade.tier
    || left.cascade.rank - right.cascade.rank
    || (left.cascade.primaryRank ?? Number.MAX_SAFE_INTEGER) - (right.cascade.primaryRank ?? Number.MAX_SAFE_INTEGER)
    || right.event.timestamp.localeCompare(left.event.timestamp)
    || left.event.eventId.localeCompare(right.event.eventId)
  )).map(({ cascade: _cascade, ...entry }) => entry);
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
    const effectiveFrom = sourceEvent?.temporal?.validFrom ?? sourceEvent?.timestamp;
    if (!sourceEvent || effectiveFrom > asOf) continue;
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
  if (lambda === 1) {
    const maximumScore = entries[0]?.score || 1;
    return entries.slice(0, limit).map((entry) => ({
      ...entry,
      diversityScore: rounded(entry.score / maximumScore)
    }));
  }
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

function queryCodeEntities(query) {
  const values = [];
  for (const match of String(query).matchAll(/`([^`]{1,256})`|(?:[\p{L}\p{N}_.-]+\/)+[\p{L}\p{N}_.-]+|\b[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)+\b/gu)) {
    values.push(match[1] ?? match[0]);
  }
  return tokenize(values.join(" ")).slice(0, 64);
}

function evidenceSufficiency(index, query, queryTerms, eligibleEventIds, lexical, fuzzy) {
  if (queryTerms.length === 0) {
    return Object.freeze({
      method: "evidence-sufficiency-v2",
      state: "INSUFFICIENT_EVIDENCE",
      decision: "ABSTAIN",
      score: 0,
      directThreshold: 0.65,
      partialThreshold: 0.4,
      bestExactTermRatio: 0,
      topLexicalScore: 0,
      lexicalScoreMargin: 0,
      supportingCandidateCount: 0,
      codeEntityCount: 0,
      matchedCodeEntityCount: 0,
      codeEntityCoverage: 0,
      reasonCodes: Object.freeze(["NO_QUERY"])
    });
  }
  const codeEntities = queryCodeEntities(query);
  let bestExactTermRatio = 0;
  let bestMatchedCodeEntities = 0;
  let bestConfidence = 0;
  let supportingCandidateCount = 0;
  for (const event of index.events) {
    if (!eligibleEventIds.has(event.eventId)) continue;
    const matchedTerms = queryTerms.filter((term) => (event.termFrequencies?.[term] || 0) > 0).length;
    const termRatio = matchedTerms / queryTerms.length;
    const matchedEntities = codeEntities.filter((term) => (event.termFrequencies?.[term] || 0) > 0).length;
    if (termRatio >= 0.2 || matchedEntities > 0) supportingCandidateCount += 1;
    if (termRatio > bestExactTermRatio || (termRatio === bestExactTermRatio && matchedEntities > bestMatchedCodeEntities)) {
      bestExactTermRatio = termRatio;
      bestMatchedCodeEntities = matchedEntities;
      bestConfidence = { verified: 1, claimed: 0.8, extracted: 0.7, inferred: 0.5 }[event.confidence] ?? 0.5;
    }
  }
  const codeEntityCoverage = codeEntities.length === 0 ? 0 : bestMatchedCodeEntities / codeEntities.length;
  const independence = Math.min(1, supportingCandidateCount / 2);
  const score = codeEntities.length === 0
    ? 0.65 * bestExactTermRatio + 0.15 * independence + 0.2 * bestConfidence
    : 0.45 * bestExactTermRatio + 0.3 * codeEntityCoverage + 0.1 * independence + 0.15 * bestConfidence;
  const normalizedScore = rounded(score);
  const directCandidateCount = new Set([...lexical.keys(), ...fuzzy.keys()]).size;
  const lexicalScores = [...lexical.values()].sort((left, right) => right - left);
  const topLexicalScore = lexicalScores[0] ?? 0;
  const secondLexicalScore = lexicalScores[1] ?? 0;
  const lexicalScoreMargin = topLexicalScore === 0 ? 0 : (topLexicalScore - secondLexicalScore) / topLexicalScore;
  const state = normalizedScore >= 0.65
    ? "DIRECTLY_SUPPORTED"
    : (normalizedScore >= 0.4 && directCandidateCount > 0
      ? "PARTIALLY_SUPPORTED"
      : "INSUFFICIENT_EVIDENCE");
  const decision = state === "DIRECTLY_SUPPORTED" ? "ACCEPT_DIRECT" : "ABSTAIN";
  const reasonCodes = [
    ...(directCandidateCount === 0 ? ["NO_DIRECT_CANDIDATE"] : []),
    ...(bestExactTermRatio < 0.2 ? ["LOW_TERM_COVERAGE"] : []),
    ...(codeEntities.length > 0 && codeEntityCoverage === 0 ? ["NO_CODE_ENTITY_MATCH"] : []),
    ...(supportingCandidateCount < 2 ? ["SINGLE_OR_NO_SUPPORT"] : []),
    ...(state === "DIRECTLY_SUPPORTED" ? ["CONSERVATIVE_DIRECT_THRESHOLD_MET"] : []),
    ...(state === "PARTIALLY_SUPPORTED" ? ["PARTIAL_EVIDENCE_ONLY"] : []),
    ...(state === "INSUFFICIENT_EVIDENCE" ? ["INSUFFICIENT_THRESHOLD"] : []),
    ...(decision === "ABSTAIN" ? ["ABSTAIN"] : [])
  ];
  return Object.freeze({
    method: "evidence-sufficiency-v2",
    state,
    decision,
    score: normalizedScore,
    directThreshold: 0.65,
    partialThreshold: 0.4,
    bestExactTermRatio: rounded(bestExactTermRatio),
    topLexicalScore: rounded(topLexicalScore),
    lexicalScoreMargin: rounded(lexicalScoreMargin),
    supportingCandidateCount,
    codeEntityCount: codeEntities.length,
    matchedCodeEntityCount: bestMatchedCodeEntities,
    codeEntityCoverage: rounded(codeEntityCoverage),
    reasonCodes: Object.freeze(reasonCodes)
  });
}

function queryCoverage(index, queryTerms, eligibleEventIds, lexical, fuzzy) {
  if (queryTerms.length === 0) {
    return Object.freeze({
      method: "query-term-overlap-v1",
      status: "no-query",
      queryTermCount: 0,
      bestExactTermCount: 0,
      bestExactTermRatio: 1,
      directCandidateCount: 0
    });
  }
  let bestExactTermCount = 0;
  for (const event of index.events) {
    if (!eligibleEventIds.has(event.eventId)) continue;
    const matched = queryTerms.filter((term) => (event.termFrequencies?.[term] || 0) > 0).length;
    bestExactTermCount = Math.max(bestExactTermCount, matched);
  }
  const directCandidateCount = new Set([...lexical.keys(), ...fuzzy.keys()]).size;
  const bestExactTermRatio = rounded(bestExactTermCount / queryTerms.length);
  const status = directCandidateCount === 0
    ? "none"
    : (bestExactTermCount === queryTerms.length ? "direct" : "partial");
  return Object.freeze({
    method: "query-term-overlap-v1",
    status,
    queryTermCount: queryTerms.length,
    bestExactTermCount,
    bestExactTermRatio,
    directCandidateCount,
    ...(status === "none"
      ? { warning: "No durable event directly matched this query." }
      : (status === "partial"
        ? { warning: "Only partial lexical or typo-tolerant coverage was found. Verify the cited evidence before relying on this pack." }
        : {}))
  });
}

export function rankContextEvents(index, query = "", options = {}) {
  const allEventsById = new Map(index.events.map((event) => [event.eventId, event]));
  const queryTerms = tokenize(query);
  const limit = options.limit ?? 20;
  const rankingProfile = options.rankingProfile ?? "admission-first-v2";
  if (!RANKING_PROFILES.has(rankingProfile)) {
    throw new TypeError("rankingProfile must be balanced-v1 or admission-first-v2.");
  }
  const diversity = options.diversity ?? (rankingProfile === "admission-first-v2" ? 1 : 0.82);
  const includeFuzzy = options.includeFuzzy ?? true;
  const includeGraph = options.includeGraph ?? true;
  const temporalBoundary = options.temporalBoundary ?? "inclusive";
  if (typeof includeFuzzy !== "boolean") throw new TypeError("includeFuzzy must be a boolean.");
  if (typeof includeGraph !== "boolean") throw new TypeError("includeGraph must be a boolean.");
  if (!["inclusive", "strict-before"].includes(temporalBoundary)) {
    throw new TypeError("temporalBoundary must be inclusive or strict-before.");
  }
  const supersessionPolicy = options.supersessionPolicy ?? "prefer-current";
  if (options.asOf === undefined) {
    throw new TypeError("asOf is required so retrieval remains time-explicit and deterministic.");
  }
  const asOf = canonicalIsoTimestamp(
    options.asOf,
    "asOf"
  );
  const authorityScopes = normalizedSelectors(options.authorityScopes ?? options.authorityScope, "authorityScopes");
  const repositoryIds = normalizedSelectors(options.repositoryIds, "repositoryIds");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new TypeError("limit must be an integer from 1 to 1000.");
  if (typeof diversity !== "number" || !Number.isFinite(diversity) || diversity < 0 || diversity > 1) {
    throw new TypeError("diversity must be a number from 0 to 1.");
  }
  if (!["prefer-current", "include-history"].includes(supersessionPolicy)) {
    throw new TypeError("supersessionPolicy must be prefer-current or include-history.");
  }
  const expiredEventIds = new Set(index.events
    .filter((event) => event.retention?.expiresAt !== null && event.retention?.expiresAt <= asOf)
    .map((event) => event.eventId));
  const futureEventIds = new Set(index.events
    .filter((event) => temporalBoundary === "strict-before" ? event.timestamp >= asOf : event.timestamp > asOf)
    .map((event) => event.eventId));
  const notYetValidEventIds = new Set(index.events
    .filter((event) => event.temporal?.validFrom !== undefined && event.temporal.validFrom > asOf)
    .map((event) => event.eventId));
  const staleEventIds = new Set(index.events
    .filter((event) => event.temporal?.validUntil !== null && event.temporal?.validUntil !== undefined && event.temporal.validUntil <= asOf)
    .map((event) => event.eventId));
  const unauthorizedEventIds = new Set(index.events
    .filter((event) => !permittedByDisclosure(event, authorityScopes) || !permittedRepository(event, repositoryIds))
    .map((event) => event.eventId));
  const eventsById = new Map([...allEventsById].filter(([eventId]) => (
    !expiredEventIds.has(eventId)
      && !futureEventIds.has(eventId)
      && !notYetValidEventIds.has(eventId)
      && !staleEventIds.has(eventId)
      && !unauthorizedEventIds.has(eventId)
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
      strategy: rankingProfile === "admission-first-v2" ? "admission-first-hybrid-v2" : "hybrid-local-v1",
      rankingProfile,
      temporalBoundary,
      ranked: diversify(eligible, limit, diversity).map((entry) => ({ ...entry, reason: reasonFor(entry) })),
      conflicts: conflictPairs(index, eventsById),
      exclusions,
      supersessionPolicy,
      authorityScopes,
      repositoryIds,
      asOf,
      filters: {
        expired: expiredEventIds.size,
        future: futureEventIds.size,
        notYetValid: notYetValidEventIds.size,
        stale: staleEventIds.size,
        unauthorized: unauthorizedEventIds.size
      },
      coverage: queryCoverage(index, queryTerms, eligibleEventIds, new Map(), new Map()),
      evidenceSufficiency: evidenceSufficiency(index, query, queryTerms, eligibleEventIds, new Map(), new Map())
    });
  }

  const lexical = bm25Scores(index, queryTerms, eligibleEventIds);
  const fuzzy = includeFuzzy ? fuzzyScores(index, query, eligibleEventIds) : new Map();
  const coverage = queryCoverage(index, queryTerms, eligibleEventIds, lexical, fuzzy);
  const sufficiency = evidenceSufficiency(index, query, queryTerms, eligibleEventIds, lexical, fuzzy);
  const sqlite = sqliteScores(options.sqliteCandidates, eligibleEventIds);
  const candidateIds = new Set([...lexical.keys(), ...fuzzy.keys(), ...sqlite.keys()]);
  const seedScores = new Map([...candidateIds].map((eventId) => [
    eventId,
    (lexical.get(eventId) || 0) + (fuzzy.get(eventId) || 0) + (sqlite.get(eventId) || 0)
  ]));
  const graph = includeGraph ? graphScores(index, seedScores, eventsById) : new Map();
  const authority = authorityScores(index, candidateIds, authorityScopes, asOf);
  const lists = [
    { name: "sqlite-fts5", weight: 1.05, entries: sortedScores(sqlite, eventsById) },
    { name: "bm25", weight: 1, entries: sortedScores(lexical, eventsById) },
    { name: "fuzzy", weight: 0.75, entries: sortedScores(fuzzy, eventsById) },
    { name: "graph", weight: 0.65, entries: sortedScores(graph, eventsById) },
    { name: "authority", weight: 1.25, entries: sortedScores(authority, eventsById) }
  ].filter((entry) => entry.entries.length > 0);
  const fused = rankingProfile === "admission-first-v2"
    ? lexicalCascadeFusion(lists, eventsById)
    : reciprocalRankFusion(lists, eventsById);
  const supersededBy = activeSupersessions(index, eventsById, asOf);
  const exclusions = [];
  const eligible = fused.filter((entry) => {
    if (supersessionPolicy === "include-history" || !supersededBy.has(entry.event.eventId) || query.includes(entry.event.eventId)) return true;
    exclusions.push({ eventId: entry.event.eventId, reason: "superseded", by: supersededBy.get(entry.event.eventId) });
    return false;
  });
  return Object.freeze({
    strategy: rankingProfile === "admission-first-v2" ? "admission-first-hybrid-v2" : "hybrid-local-v1",
    rankingProfile,
    temporalBoundary,
    ranked: diversify(eligible, limit, diversity).map((entry) => ({ ...entry, reason: reasonFor(entry) })),
    conflicts: conflictPairs(index, eventsById),
    exclusions,
    supersessionPolicy,
    authorityScopes,
    repositoryIds,
    asOf,
    filters: {
      expired: expiredEventIds.size,
      future: futureEventIds.size,
      notYetValid: notYetValidEventIds.size,
      stale: staleEventIds.size,
      unauthorized: unauthorizedEventIds.size
    },
    coverage,
    evidenceSufficiency: sufficiency
  });
}
