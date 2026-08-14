import path from "node:path";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { validateProjectStructureSnapshot } from "./project-structure.js";
import { readEvents } from "./store.js";
import {
  atomicWriteFile,
  loadWorkspace,
  openSecureReadFile,
  secureStoragePath
} from "./workspace.js";

export const LINKED_PROJECT_MEMORY_SCHEMA_VERSION = "qarinah.linked-project-memory.v1";
export const LINKED_PROJECT_QUERY_SCHEMA_VERSION = "qarinah.linked-project-query.v1";

const WORKSPACE_ID = /^ws_[0-9a-f]{32}$/u;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_QUERY_CHARS = 4_096;
const MAX_CONCEPTS = 64;
const MAX_TERMS_PER_NODE = 64;
const MAX_LEXICAL_TERMS_PER_NODE = 128;
const MAX_ABOUT_EDGES_PER_NODE = 6;
const MAX_CONCEPT_SOURCE_PROFILES = 512;
const MAX_GRAPH_EVENTS = 10_000;
const MAX_GRAPH_RELATIONS = 20_000;
const MAX_GRAPH_FILE_REFERENCES = 20_000;
const MAX_GRAPH_REFERENCES_PER_FILE = 64;
const MAX_GRAPH_NODES = 75_000;
const MAX_GRAPH_EDGES = 450_000;
const MAX_PROJECTION_BYTES = 128 * 1024 * 1024;
const PAGE_RANK_ITERATIONS = 24;
const PAGE_RANK_DAMPING = 0.85;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "before", "been", "being",
  "between", "both", "but", "can", "could", "does", "each", "for", "from", "have", "into",
  "its", "more", "not", "only", "other", "our", "over", "same", "should", "than", "that",
  "the", "their", "then", "there", "these", "they", "this", "through", "under", "use", "used",
  "using", "was", "were", "what", "when", "where", "which", "while", "will", "with", "would"
]);

function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return candidate;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string" || value.length > 64) throw new TypeError(`${label} must be an ISO timestamp.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
}

function splitIdentifier(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
    .replace(/[._/\\:#@-]+/gu, " ")
    .toLowerCase();
}

function lexemes(value) {
  return (splitIdentifier(value).match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,63}/gu) ?? [])
    .filter((term) => !STOP_WORDS.has(term));
}

function dataText(value, output = [], depth = 0) {
  if (depth > 3 || output.length >= 256 || value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    output.push(String(value).slice(0, 4_096));
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 64)) dataText(entry, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value).slice(0, 64)) {
      if (key === "projectStructure") continue;
      output.push(key);
      dataText(entry, output, depth + 1);
    }
  }
  return output;
}

function termCounts(value) {
  const counts = new Map();
  for (const term of lexemes(value)) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

function nodeId(type, value) {
  return `memory:${type}:${sha256(value).slice(7, 39)}`;
}

function latestProjectStructure(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const structure = events[index]?.data?.projectStructure;
    if (validateProjectStructureSnapshot(structure)) {
      return { event: events[index], structure };
    }
  }
  return null;
}

function edgeKey(edge) {
  return `${edge.source}\0${edge.type}\0${edge.target}`;
}

function addEdge(edges, seen, edge) {
  if (edge.source === edge.target) return;
  const key = edgeKey(edge);
  const existing = seen.get(key);
  if (existing !== undefined) {
    const current = edges[existing];
    edges[existing] = { ...current, occurrenceCount: (current.occurrenceCount ?? 1) + 1 };
    return;
  }
  seen.set(key, edges.length);
  edges.push({ ...edge, occurrenceCount: 1 });
}

function confidenceWeight(confidence) {
  return { extracted: 0.72, inferred: 0.58, claimed: 0.48, verified: 1 }[confidence] ?? 0.4;
}

function repositoryRanks(fileNodes, edges) {
  const ids = fileNodes.map((node) => node.id).sort();
  if (ids.length === 0) return new Map();
  const idSet = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    if (!new Set(["imports", "links", "references"]).has(edge.type)) continue;
    outgoing.get(edge.source).push(edge.target);
  }
  for (const targets of outgoing.values()) targets.sort();
  let ranks = new Map(ids.map((id) => [id, 1 / ids.length]));
  for (let iteration = 0; iteration < PAGE_RANK_ITERATIONS; iteration += 1) {
    const next = new Map(ids.map((id) => [id, (1 - PAGE_RANK_DAMPING) / ids.length]));
    let dangling = 0;
    for (const id of ids) {
      const targets = outgoing.get(id);
      const rank = ranks.get(id);
      if (targets.length === 0) {
        dangling += rank;
        continue;
      }
      const share = PAGE_RANK_DAMPING * rank / targets.length;
      for (const target of targets) next.set(target, next.get(target) + share);
    }
    const danglingShare = PAGE_RANK_DAMPING * dangling / ids.length;
    for (const id of ids) next.set(id, next.get(id) + danglingShare);
    ranks = next;
  }
  const maximum = Math.max(...ranks.values(), 1);
  return new Map([...ranks].map(([id, rank]) => [id, round(rank / maximum)]));
}

function sparseSignatures(nodes) {
  const documentFrequency = new Map();
  const countsById = new Map();
  const termsById = new Map();
  for (const node of nodes) {
    const counts = new Map([...termCounts(node.searchText)]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, MAX_LEXICAL_TERMS_PER_NODE));
    countsById.set(node.id, counts);
    termsById.set(node.id, [...counts].map(([term, count]) => ({ term, count })));
    for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const documentCount = Math.max(nodes.length, 1);
  const signatures = new Map();
  for (const node of nodes) {
    const weighted = [...countsById.get(node.id)].map(([term, count]) => {
      const inverseDocumentFrequency = Math.log(1 + (documentCount + 1) / ((documentFrequency.get(term) ?? 0) + 1));
      return { term, value: (1 + Math.log(count)) * inverseDocumentFrequency };
    }).sort((left, right) => right.value - left.value || left.term.localeCompare(right.term)).slice(0, MAX_TERMS_PER_NODE);
    const magnitude = Math.sqrt(weighted.reduce((sum, entry) => sum + entry.value ** 2, 0)) || 1;
    signatures.set(node.id, weighted.map((entry) => ({ term: entry.term, weight: round(entry.value / magnitude, 6) })));
  }
  return { signatures, termsById, documentFrequency, documentCount };
}

function signaturesFromTerms(nodes) {
  const documentFrequency = new Map();
  for (const node of nodes) {
    for (const entry of node.terms ?? []) {
      documentFrequency.set(entry.term, (documentFrequency.get(entry.term) ?? 0) + 1);
    }
  }
  const documentCount = Math.max(nodes.length, 1);
  const signatures = new Map();
  for (const node of nodes) {
    const weighted = (node.terms ?? []).map((entry) => {
      const inverseDocumentFrequency = Math.log(1 + (documentCount + 1) / ((documentFrequency.get(entry.term) ?? 0) + 1));
      return { term: entry.term, value: (1 + Math.log(entry.count)) * inverseDocumentFrequency };
    }).sort((left, right) => right.value - left.value || left.term.localeCompare(right.term)).slice(0, MAX_TERMS_PER_NODE);
    const magnitude = Math.sqrt(weighted.reduce((sum, entry) => sum + entry.value ** 2, 0)) || 1;
    signatures.set(node.id, weighted.map((entry) => ({ term: entry.term, weight: round(entry.value / magnitude, 6) })));
  }
  return signatures;
}

function normalizedDegrees(nodes, edges) {
  const degrees = new Map(nodes.map((node) => [node.id, { incoming: 0, outgoing: 0 }]));
  for (const edge of edges) {
    if (degrees.has(edge.source)) degrees.get(edge.source).outgoing += 1;
    if (degrees.has(edge.target)) degrees.get(edge.target).incoming += 1;
  }
  const maximum = Math.max(1, ...[...degrees.values()].map((entry) => entry.incoming + entry.outgoing));
  return new Map([...degrees].map(([id, entry]) => [id, {
    ...entry,
    normalized: round((entry.incoming + entry.outgoing) / maximum)
  }]));
}

function activeAt(node, asOf) {
  if (node.timestamp === null) return node.type === "concept";
  if (node.timestamp > asOf || node.validFrom > asOf) return false;
  if (node.validUntil !== null && node.validUntil <= asOf) return false;
  if (node.expiresAt !== null && node.expiresAt <= asOf) return false;
  return true;
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

function normalizedRankRequest(query, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object.");
  }
  if (typeof query !== "string" || query.length > MAX_QUERY_CHARS) {
    throw new TypeError(`query must be a string up to ${MAX_QUERY_CHARS} characters.`);
  }
  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, "limit");
  const asOf = canonicalTimestamp(options.asOf ?? new Date().toISOString(), "asOf");
  let allowedTypes = null;
  if (options.types !== undefined) {
    if (!Array.isArray(options.types) || options.types.length < 1 || options.types.length > 5) {
      throw new TypeError("types must contain one or more supported linked-memory node types.");
    }
    allowedTypes = new Set(options.types);
    if (allowedTypes.size !== options.types.length
      || [...allowedTypes].some((type) => !["memory", "file", "directory", "concept", "reference"].includes(type))) {
      throw new TypeError("types must contain one or more supported linked-memory node types.");
    }
  }
  const authorityScopes = normalizedSelectors(options.authorityScopes, "authorityScopes");
  const repositoryIds = normalizedSelectors(options.repositoryIds, "repositoryIds");
  return Object.freeze({ limit, asOf, allowedTypes, authorityScopes, repositoryIds });
}

function profileActiveAt(profile, asOf) {
  if (profile.validFrom !== null && profile.validFrom > asOf) return false;
  if (profile.validUntil !== null && profile.validUntil <= asOf) return false;
  if (profile.expiresAt !== null && profile.expiresAt <= asOf) return false;
  return true;
}

function admittedProfile(profile, selectors, asOf) {
  if (!profileActiveAt(profile, asOf)) return false;
  if (profile.classification === "restricted"
    && !profile.disclosureScopes.some((scope) => selectors.authorityScopes.includes(scope))) return false;
  return selectors.repositoryIds.length === 0
    || profile.repositoryId === null
    || selectors.repositoryIds.includes(profile.repositoryId);
}

function admittedNode(node, selectors, asOf) {
  if (node.sourceProfiles.length > 0) {
    return node.sourceProfiles.some((profile) => admittedProfile(profile, selectors, asOf));
  }
  if (node.classification === "restricted"
    && !node.disclosureScopes.some((scope) => selectors.authorityScopes.includes(scope))) return false;
  return selectors.repositoryIds.length === 0
    || node.repositoryId === null
    || selectors.repositoryIds.includes(node.repositoryId);
}

function eventActiveAt(event, asOf) {
  const validFrom = event.temporal?.validFrom ?? event.timestamp;
  if (event.timestamp > asOf || validFrom > asOf) return false;
  if (event.temporal?.validUntil !== null && event.temporal?.validUntil !== undefined
    && event.temporal.validUntil <= asOf) return false;
  if (event.retention?.expiresAt !== null && event.retention?.expiresAt !== undefined
    && event.retention.expiresAt <= asOf) return false;
  return true;
}

function selectProjectionEvents(events, options) {
  if (options.asOf === undefined && options.authorityScopes === undefined && options.repositoryIds === undefined) {
    return events;
  }
  const asOf = canonicalTimestamp(options.asOf ?? new Date().toISOString(), "asOf");
  const selectors = {
    authorityScopes: normalizedSelectors(options.authorityScopes, "authorityScopes"),
    repositoryIds: normalizedSelectors(options.repositoryIds, "repositoryIds")
  };
  return events.filter((event) => {
    if (!eventActiveAt(event, asOf)) return false;
    if (event.disclosure?.classification === "restricted"
      && !(event.disclosure.scopes ?? []).some((scope) => selectors.authorityScopes.includes(scope))) return false;
    return selectors.repositoryIds.length === 0
      || event.repository?.id === undefined
      || event.repository?.id === null
      || selectors.repositoryIds.includes(event.repository.id);
  });
}

export function buildLinkedProjectMemory(events, workspaceId, options = {}) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array of verified Qarinah events.");
  if (!WORKSPACE_ID.test(workspaceId)) throw new TypeError("workspaceId is invalid.");
  const sourceEvents = selectProjectionEvents(events, options);
  const sourceEventIds = new Set(sourceEvents.map((event) => event.eventId));
  const currentStructure = latestProjectStructure(sourceEvents);
  const sourcePositions = new Map(sourceEvents.map((event, index) => [event.eventId, index]));
  let projectedEvents = sourceEvents.slice(-MAX_GRAPH_EVENTS);
  if (currentStructure && !projectedEvents.some((event) => event.eventId === currentStructure.event.eventId)) {
    projectedEvents = [currentStructure.event, ...projectedEvents.slice(1)]
      .sort((left, right) => sourcePositions.get(left.eventId) - sourcePositions.get(right.eventId));
  }
  const projectedEventIds = new Set(projectedEvents.map((event) => event.eventId));
  const sourceRelationCount = sourceEvents.reduce((sum, event) => sum + event.relations.length, 0);
  let remainingRelations = MAX_GRAPH_RELATIONS;
  const selectedRelations = new Map();
  for (let index = projectedEvents.length - 1; index >= 0; index -= 1) {
    const event = projectedEvents[index];
    const relations = [];
    for (const relation of event.relations) {
      if ((sourceEventIds.has(relation.target) && !projectedEventIds.has(relation.target)) || remainingRelations === 0) {
        continue;
      }
      relations.push(relation);
      remainingRelations -= 1;
    }
    selectedRelations.set(event.eventId, relations);
  }
  projectedEvents = projectedEvents.map((event) => {
    const relations = selectedRelations.get(event.eventId);
    return relations.length === event.relations.length ? event : { ...event, relations };
  });
  events = projectedEvents;
  let remainingFileReferences = MAX_GRAPH_FILE_REFERENCES;
  let projectedFileReferenceCount = 0;
  const projectedStructure = currentStructure ? {
    ...currentStructure.structure,
    files: currentStructure.structure.files.map((file) => {
      const references = file.references.slice(0, Math.min(MAX_GRAPH_REFERENCES_PER_FILE, remainingFileReferences));
      remainingFileReferences -= references.length;
      projectedFileReferenceCount += references.length;
      return references.length === file.references.length ? file : { ...file, references };
    })
  } : null;
  const sourceFileReferenceCount = currentStructure?.structure.files.reduce((sum, file) => sum + file.references.length, 0) ?? 0;
  const relationCount = events.reduce((sum, event) => sum + event.relations.length, 0);
  const structuralReferenceCount = projectedFileReferenceCount;
  const structuralNodeCount = (currentStructure?.structure.directories.length ?? 0) + (currentStructure?.structure.files.length ?? 0);
  const nodeUpperBound = events.length + relationCount + structuralReferenceCount + structuralNodeCount + MAX_CONCEPTS;
  const edgeUpperBound = relationCount + Math.max(0, events.length - 1) + structuralNodeCount + structuralReferenceCount
    + MAX_ABOUT_EDGES_PER_NODE * (events.length + relationCount + structuralReferenceCount + (currentStructure?.structure.files.length ?? 0));
  if (nodeUpperBound > MAX_GRAPH_NODES || edgeUpperBound > MAX_GRAPH_EDGES) {
    throw new QarinahError("LINKED_MEMORY_LIMIT", "Linked project memory exceeds its deterministic node or edge budget.", {
      nodeUpperBound,
      edgeUpperBound,
      maxNodes: MAX_GRAPH_NODES,
      maxEdges: MAX_GRAPH_EDGES
    });
  }
  const nodes = [];
  const edges = [];
  const edgesSeen = new Map();
  const nodesById = new Map();
  const superseded = new Set();
  const supersededBy = new Map();
  const conflicted = new Set();
  for (const event of events) {
    for (const relation of event.relations) {
      if (relation.type === "supersedes") {
        superseded.add(relation.target);
        const sources = supersededBy.get(relation.target) ?? [];
        sources.push(event.eventId);
        supersededBy.set(relation.target, sources);
      }
      if (relation.type === "contradicts") {
        conflicted.add(event.eventId);
        conflicted.add(relation.target);
      }
    }
  }
  for (const event of events) {
    const node = {
      id: event.eventId,
      type: "memory",
      kind: event.kind,
      label: event.title,
      path: null,
      language: null,
      timestamp: event.timestamp,
      validFrom: event.temporal?.validFrom ?? event.timestamp,
      validUntil: event.temporal?.validUntil ?? null,
      expiresAt: event.retention?.expiresAt ?? null,
      confidence: event.confidence ?? "extracted",
      status: superseded.has(event.eventId) ? "superseded" : "current",
      supersededBy: [...(supersededBy.get(event.eventId) ?? [])].sort(),
      conflicted: conflicted.has(event.eventId),
      repositoryId: event.repository?.id ?? null,
      disclosureScopes: event.disclosure?.scopes ?? [],
      classification: event.disclosure?.classification ?? "workspace",
      sourceProfiles: [],
      sourceEventId: event.eventId,
      evidenceHash: event.hash,
      contentHash: event.provenance?.contentHash ?? null,
      searchText: [event.title, event.body, ...dataText(event.data)].join("\n")
    };
    nodes.push(node);
    nodesById.set(node.id, node);
  }
  const pendingRelations = [];
  for (const event of events) {
    for (const relation of event.relations) {
      pendingRelations.push({ event, relation });
    }
  }
  const timeline = [...events].sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId));
  for (let index = 1; index < timeline.length; index += 1) {
    addEdge(edges, edgesSeen, {
      source: timeline[index - 1].eventId,
      type: "precedes",
      target: timeline[index].eventId,
      sourceEventId: timeline[index].eventId,
      evidenceHash: timeline[index].hash,
      confidence: "extracted",
      weight: 0.35
    });
  }

  if (currentStructure) {
    const { event } = currentStructure;
    const structure = projectedStructure;
    const directories = new Map(structure.directories.map((directory) => [directory.path, directory.id]));
    const files = new Map(structure.files.map((file) => [file.path, file.id]));
    for (const directory of structure.directories) {
      const node = {
        id: directory.id,
        type: "directory",
        kind: "project.directory",
        label: directory.path === "." ? "project root" : path.posix.basename(directory.path),
        path: directory.path,
        language: null,
        timestamp: event.timestamp,
        validFrom: event.timestamp,
        validUntil: null,
        expiresAt: null,
        confidence: "extracted",
        status: "current",
        supersededBy: [],
        conflicted: false,
        repositoryId: event.repository?.id ?? null,
        disclosureScopes: event.disclosure?.scopes ?? [],
        classification: event.disclosure?.classification ?? "workspace",
        sourceProfiles: [],
        sourceEventId: event.eventId,
        evidenceHash: event.hash,
        contentHash: null,
        searchText: `directory ${directory.path}`
      };
      nodes.push(node);
      nodesById.set(node.id, node);
      if (directory.path !== ".") {
        const parentPath = path.posix.dirname(directory.path) || ".";
        const parentId = directories.get(parentPath);
        if (parentId) addEdge(edges, edgesSeen, {
          source: parentId, type: "contains", target: directory.id, sourceEventId: event.eventId,
          evidenceHash: event.hash, confidence: "extracted", weight: 0.7
        });
      }
    }
    for (const file of structure.files) {
      const referenceText = file.references.map((reference) => `${reference.type} ${reference.specifier} ${reference.target ?? ""}`).join("\n");
      const node = {
        id: file.id,
        type: "file",
        kind: "project.file",
        label: path.posix.basename(file.path),
        path: file.path,
        language: file.language,
        timestamp: event.timestamp,
        validFrom: event.timestamp,
        validUntil: null,
        expiresAt: null,
        confidence: "extracted",
        status: "current",
        supersededBy: [],
        conflicted: false,
        repositoryId: event.repository?.id ?? null,
        disclosureScopes: event.disclosure?.scopes ?? [],
        classification: event.disclosure?.classification ?? "workspace",
        sourceProfiles: [],
        sourceEventId: event.eventId,
        evidenceHash: event.hash,
        contentHash: file.contentHash,
        searchText: `file ${file.path} ${file.language} ${referenceText}`
      };
      nodes.push(node);
      nodesById.set(node.id, node);
      const parentPath = path.posix.dirname(file.path) || ".";
      const parentId = directories.get(parentPath);
      if (parentId) addEdge(edges, edgesSeen, {
        source: parentId, type: "contains", target: file.id, sourceEventId: event.eventId,
        evidenceHash: event.hash, confidence: "extracted", weight: 0.7
      });
      for (const reference of file.references) {
        let targetId = reference.target ? files.get(reference.target) : null;
        if (!targetId) {
          targetId = nodeId(reference.target ? "unresolved" : "external", `${reference.type}:${reference.specifier}`);
          if (!nodesById.has(targetId)) {
            const referenceNode = {
              id: targetId,
              type: "reference",
              kind: reference.target ? "project.unresolved" : "project.external",
              label: reference.specifier,
              path: reference.target ?? null,
              language: null,
              timestamp: event.timestamp,
              validFrom: event.timestamp,
              validUntil: null,
              expiresAt: null,
              confidence: reference.confidence,
              status: "current",
              supersededBy: [],
              conflicted: false,
              repositoryId: event.repository?.id ?? null,
              disclosureScopes: event.disclosure?.scopes ?? [],
              classification: event.disclosure?.classification ?? "workspace",
              sourceProfiles: [],
              sourceEventId: event.eventId,
              evidenceHash: event.hash,
              contentHash: null,
              searchText: `${reference.type} ${reference.specifier} ${reference.target ?? ""}`
            };
            nodes.push(referenceNode);
            nodesById.set(targetId, referenceNode);
          }
        }
        addEdge(edges, edgesSeen, {
          source: file.id,
          type: reference.type,
          target: targetId,
          sourceEventId: event.eventId,
          evidenceHash: event.hash,
          confidence: reference.confidence,
          weight: 0.9
        });
      }
    }
    const rootId = directories.get(".");
    if (rootId) addEdge(edges, edgesSeen, {
      source: event.eventId, type: "produced", target: rootId, sourceEventId: event.eventId,
      evidenceHash: event.hash, confidence: "extracted", weight: 1
    });
  }

  const pendingByTarget = new Map();
  for (const pending of pendingRelations) {
    if (nodesById.has(pending.relation.target)) continue;
    const entries = pendingByTarget.get(pending.relation.target) ?? [];
    entries.push(pending);
    pendingByTarget.set(pending.relation.target, entries);
  }
  const relationTargetIds = new Map();
  for (const [target, entries] of pendingByTarget) {
    if (nodesById.has(target)) continue;
    const referenceId = nodeId("relation-reference", target);
    const profiles = entries.map(({ event }) => ({
      sourceNodeId: event.eventId,
      sourceEventId: event.eventId,
      evidenceHash: event.hash,
      contentHash: event.provenance?.contentHash ?? null,
      classification: event.disclosure?.classification ?? "workspace",
      disclosureScopes: [...(event.disclosure?.scopes ?? [])].sort(),
      repositoryId: event.repository?.id ?? null,
      validFrom: event.temporal?.validFrom ?? event.timestamp,
      validUntil: event.temporal?.validUntil ?? null,
      expiresAt: event.retention?.expiresAt ?? null
    })).sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
    const boundedProfiles = profiles.slice(0, MAX_CONCEPT_SOURCE_PROFILES);
    const repositories = new Set(profiles.map((profile) => profile.repositoryId));
    const scopes = [...new Set(profiles.flatMap((profile) => profile.disclosureScopes))].sort();
    const first = entries.slice().sort((left, right) => left.event.timestamp.localeCompare(right.event.timestamp))[0].event;
    const reference = {
      id: referenceId,
      type: "reference",
      kind: "external-reference",
      label: target,
      path: null,
      language: null,
      timestamp: first.timestamp,
      validFrom: first.temporal?.validFrom ?? first.timestamp,
      validUntil: null,
      expiresAt: null,
      confidence: "extracted",
      status: "current",
      supersededBy: [],
      conflicted: false,
      repositoryId: repositories.size === 1 ? [...repositories][0] : null,
      disclosureScopes: scopes,
      classification: effectiveConceptClassification(profiles),
      sourceProfiles: boundedProfiles,
      sourceProfileCount: profiles.length,
      sourceProfilesTruncated: profiles.length > boundedProfiles.length,
      sourceEventId: first.eventId,
      evidenceHash: first.hash,
      contentHash: null,
      searchText: target
    };
    nodes.push(reference);
    nodesById.set(reference.id, reference);
    relationTargetIds.set(target, reference.id);
  }
  for (const { event, relation } of pendingRelations) {
    const target = nodesById.has(relation.target) ? relation.target : relationTargetIds.get(relation.target);
    if (!target) continue;
    addEdge(edges, edgesSeen, {
      source: event.eventId,
      type: relation.type,
      target,
      sourceEventId: event.eventId,
      evidenceHash: event.hash,
      confidence: event.confidence ?? "extracted",
      weight: 1
    });
  }

  const semanticDocuments = nodes.filter((node) => node.type !== "directory");
  const { signatures, termsById, documentFrequency, documentCount } = sparseSignatures(semanticDocuments);
  const concepts = [...documentFrequency]
    .filter(([, count]) => count >= (documentCount >= 4 ? 2 : 1))
    .map(([term, count]) => ({
      term,
      count,
      score: count * (1 + Math.log(1 + documentCount / count))
    }))
    .sort((left, right) => right.score - left.score || right.count - left.count || left.term.localeCompare(right.term))
    .slice(0, MAX_CONCEPTS);
  const conceptIdByTerm = new Map();
  for (const concept of concepts) {
    const id = nodeId("concept", concept.term);
    if (nodesById.has(id)) {
      throw new QarinahError("LINKED_MEMORY_ID_COLLISION", "Linked project memory produced a duplicate internal node identity.");
    }
    conceptIdByTerm.set(concept.term, id);
    const sourceProfiles = [];
    for (const source of semanticDocuments) {
      if (!(termsById.get(source.id) ?? []).some((entry) => entry.term === concept.term)) continue;
      const profile = {
        sourceNodeId: source.id,
        sourceEventId: source.sourceEventId,
        evidenceHash: source.evidenceHash,
        contentHash: source.contentHash,
        classification: source.classification,
        disclosureScopes: [...source.disclosureScopes].sort(),
        repositoryId: source.repositoryId,
        validFrom: source.validFrom,
        validUntil: source.validUntil,
        expiresAt: source.expiresAt
      };
      sourceProfiles.push(profile);
    }
    sourceProfiles.sort((left, right) => (
      Number(left.classification === "restricted") - Number(right.classification === "restricted")
      || String(left.validFrom).localeCompare(String(right.validFrom))
      || String(left.repositoryId).localeCompare(String(right.repositoryId))
      || left.sourceNodeId.localeCompare(right.sourceNodeId)
    ));
    const boundedSourceProfiles = sourceProfiles.slice(0, MAX_CONCEPT_SOURCE_PROFILES);
    const node = {
      id,
      type: "concept",
      kind: "semantic.concept",
      label: concept.term,
      path: null,
      language: null,
      timestamp: null,
      validFrom: null,
      validUntil: null,
      expiresAt: null,
      confidence: "extracted",
      status: "current",
      supersededBy: [],
      conflicted: false,
      repositoryId: null,
      disclosureScopes: [],
      classification: "derived",
      sourceProfiles: boundedSourceProfiles,
      sourceProfileCount: sourceProfiles.length,
      sourceProfilesTruncated: sourceProfiles.length > boundedSourceProfiles.length,
      sourceEventId: null,
      evidenceHash: null,
      contentHash: null,
      searchText: concept.term,
      documentFrequency: concept.count
    };
    nodes.push(node);
    nodesById.set(id, node);
    signatures.set(id, [{ term: concept.term, weight: 1 }]);
    termsById.set(id, [{ term: concept.term, count: 1 }]);
  }
  for (const node of semanticDocuments) {
    for (const entry of (signatures.get(node.id) ?? []).filter((entry) => conceptIdByTerm.has(entry.term)).slice(0, MAX_ABOUT_EDGES_PER_NODE)) {
      addEdge(edges, edgesSeen, {
        source: node.id,
        type: "about",
        target: conceptIdByTerm.get(entry.term),
        sourceEventId: node.sourceEventId,
        evidenceHash: node.evidenceHash,
        confidence: "extracted",
        weight: entry.weight
      });
    }
  }

  const ranks = repositoryRanks(nodes.filter((node) => node.type === "file"), edges);
  const degrees = normalizedDegrees(nodes, edges);
  const eventTimes = events.map((event) => Date.parse(event.timestamp));
  const minimumTime = eventTimes.length ? Math.min(...eventTimes) : 0;
  const maximumTime = eventTimes.length ? Math.max(...eventTimes) : 0;
  const timeSpan = Math.max(1, maximumTime - minimumTime);
  const finalizedNodes = nodes.map((node) => {
    const degree = degrees.get(node.id) ?? { incoming: 0, outgoing: 0, normalized: 0 };
    const repositoryRank = ranks.get(node.id) ?? 0;
    const recency = node.timestamp === null ? 0 : (Date.parse(node.timestamp) - minimumTime) / timeSpan;
    const importance = node.type === "file"
      ? 0.75 * repositoryRank + 0.25 * degree.normalized
      : node.type === "concept"
        ? Math.min(1, (node.documentFrequency ?? 0) / Math.max(1, documentCount))
        : node.type === "memory"
          ? 0.45 * degree.normalized + 0.3 * recency + 0.25 * confidenceWeight(node.confidence)
          : 0.35 * degree.normalized;
    const { searchText: _searchText, ...publicNode } = node;
    return {
      ...publicNode,
      terms: termsById.get(node.id) ?? [],
      signature: signatures.get(node.id) ?? [],
      importance: round(Math.min(1, importance)),
      repositoryRank,
      incoming: degree.incoming,
      outgoing: degree.outgoing
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(finalizedNodes.map((node) => node.id)).size !== finalizedNodes.length) {
    throw new QarinahError("LINKED_MEMORY_ID_COLLISION", "Linked project memory produced duplicate node identities.");
  }
  const finalizedEdges = edges.map((edge) => ({ ...edge, weight: round(edge.weight) }))
    .sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
  const filesById = new Map(finalizedNodes.filter((node) => node.type === "file").map((node) => [node.id, node]));
  const dependenciesById = new Map([...filesById.keys()].map((id) => [id, []]));
  const dependentsById = new Map([...filesById.keys()].map((id) => [id, []]));
  for (const edge of finalizedEdges) {
    if (!filesById.has(edge.source) || !filesById.has(edge.target)) continue;
    if (!["imports", "links", "references"].includes(edge.type)) continue;
    dependenciesById.get(edge.source).push(filesById.get(edge.target).path);
    dependentsById.get(edge.target).push(filesById.get(edge.source).path);
  }
  const repositoryEntries = [...filesById.values()].map((node) => ({
    id: node.id,
    path: node.path,
    language: node.language,
    contentHash: node.contentHash,
    rank: node.repositoryRank,
    incoming: node.incoming,
    outgoing: node.outgoing,
    dependencies: [...new Set(dependenciesById.get(node.id))].sort(),
    dependents: [...new Set(dependentsById.get(node.id))].sort()
  })).sort((left, right) => right.rank - left.rank || right.incoming - left.incoming || left.path.localeCompare(right.path));
  const headHash = sourceEvents.at(-1)?.hash ?? null;
  const core = {
    schemaVersion: LINKED_PROJECT_MEMORY_SCHEMA_VERSION,
    workspaceId,
    eventCount: sourceEvents.length,
    headHash,
    source: {
      ledger: ".qarinah/events/events.jsonl",
      projectSnapshotHash: currentStructure?.structure.snapshotHash ?? null,
      projectSourceEventId: currentStructure?.event.eventId ?? null
    },
    coverage: {
      sourceEvents: sourceEvents.length,
      projectedEvents: events.length,
      omittedEvents: sourceEvents.length - events.length,
      sourceRelations: sourceRelationCount,
      projectedRelations: relationCount,
      omittedRelations: sourceRelationCount - relationCount,
      sourceFileReferences: sourceFileReferenceCount,
      projectedFileReferences: projectedFileReferenceCount,
      omittedFileReferences: sourceFileReferenceCount - projectedFileReferenceCount,
      complete: sourceEvents.length === events.length
        && sourceRelationCount === relationCount
        && sourceFileReferenceCount === projectedFileReferenceCount
    },
    statistics: {
      nodes: finalizedNodes.length,
      edges: finalizedEdges.length,
      memories: finalizedNodes.filter((node) => node.type === "memory").length,
      files: repositoryEntries.length,
      directories: finalizedNodes.filter((node) => node.type === "directory").length,
      concepts: finalizedNodes.filter((node) => node.type === "concept").length,
      conflicts: finalizedNodes.filter((node) => node.conflicted).length,
      superseded: finalizedNodes.filter((node) => node.status === "superseded").length
    },
    timeline: timeline.map((event) => event.eventId),
    repositoryMap: {
      method: "bounded-link-rank-v1",
      iterations: PAGE_RANK_ITERATIONS,
      damping: PAGE_RANK_DAMPING,
      entries: repositoryEntries,
      entrypoints: repositoryEntries.slice(0, 20).map((entry) => entry.id)
    },
    nodes: finalizedNodes,
    edges: finalizedEdges
  };
  const memory = { ...core, manifestHash: sha256(core) };
  if (Buffer.byteLength(canonicalStringify(memory), "utf8") > MAX_PROJECTION_BYTES) {
    throw new QarinahError("LINKED_MEMORY_LIMIT", "Linked project memory exceeds its serialized byte budget.");
  }
  return deepFreezeJson(memory);
}

function vectorScore(signature, queryTerms) {
  if (queryTerms.size === 0 || signature.length === 0) return 0;
  let sum = 0;
  for (const entry of signature) if (queryTerms.has(entry.term)) sum += entry.weight;
  return Math.min(1, sum / Math.sqrt(queryTerms.size));
}

function effectiveConceptClassification(profiles) {
  if (profiles.some((profile) => profile.classification === "restricted")) return "restricted";
  if (profiles.some((profile) => profile.classification === "workspace")) return "workspace";
  if (profiles.some((profile) => profile.classification === "public")) return "public";
  return "derived";
}

function profileBoundNode(node, selectors, asOf) {
  if (node.sourceProfiles.length === 0) return activeAt(node, asOf) && admittedNode(node, selectors, asOf) ? node : null;
  if (node.sourceProfilesTruncated === true) return null;
  const profiles = node.sourceProfiles.filter((profile) => admittedProfile(profile, selectors, asOf));
  if (profiles.length === 0) return null;
  const repositories = new Set(profiles.map((profile) => profile.repositoryId));
  const scopes = [...new Set(profiles.flatMap((profile) => profile.disclosureScopes))].sort();
  const first = profiles.slice().sort((left, right) => (
    String(left.validFrom).localeCompare(String(right.validFrom)) || left.sourceNodeId.localeCompare(right.sourceNodeId)
  ))[0];
  return {
    ...node,
    timestamp: first.validFrom,
    validFrom: first.validFrom,
    validUntil: profiles.some((profile) => profile.validUntil === null)
      ? null
      : profiles.map((profile) => profile.validUntil).sort().at(-1),
    expiresAt: profiles.some((profile) => profile.expiresAt === null)
      ? null
      : profiles.map((profile) => profile.expiresAt).sort().at(-1),
    repositoryId: repositories.size === 1 ? [...repositories][0] : null,
    disclosureScopes: scopes,
    classification: effectiveConceptClassification(profiles),
    sourceProfiles: profiles,
    sourceProfileCount: profiles.length,
    sourceProfilesTruncated: false,
    sourceEventId: first.sourceEventId,
    evidenceHash: first.evidenceHash,
    contentHash: first.contentHash
  };
}

function buildAdmittedConcepts(sourceNodes, sourceSignatures) {
  const sourcesByTerm = new Map();
  for (const source of sourceNodes) {
    for (const entry of source.terms ?? []) {
      const sources = sourcesByTerm.get(entry.term) ?? [];
      sources.push(source);
      sourcesByTerm.set(entry.term, sources);
    }
  }
  const documentCount = Math.max(sourceNodes.length, 1);
  const selected = [...sourcesByTerm].map(([term, sources]) => ({
    term,
    sources,
    score: sources.length * (1 + Math.log(1 + documentCount / sources.length))
  })).filter((entry) => entry.sources.length >= (sourceNodes.length >= 4 ? 2 : 1))
    .sort((left, right) => right.score - left.score || right.sources.length - left.sources.length || left.term.localeCompare(right.term))
    .slice(0, MAX_CONCEPTS);
  const conceptByTerm = new Map();
  const concepts = selected.map((entry) => {
    const allProfiles = entry.sources.map((source) => ({
      sourceNodeId: source.id,
      sourceEventId: source.sourceEventId,
      evidenceHash: source.evidenceHash,
      contentHash: source.contentHash,
      classification: source.classification,
      disclosureScopes: [...source.disclosureScopes].sort(),
      repositoryId: source.repositoryId,
      validFrom: source.validFrom,
      validUntil: source.validUntil,
      expiresAt: source.expiresAt
    })).sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
    const sourceProfiles = allProfiles.slice(0, MAX_CONCEPT_SOURCE_PROFILES);
    const scopes = [...new Set(allProfiles.flatMap((profile) => profile.disclosureScopes))].sort();
    const repositories = new Set(allProfiles.map((profile) => profile.repositoryId));
    const concept = {
      id: nodeId("concept", entry.term),
      type: "concept",
      kind: "semantic.concept",
      label: entry.term,
      path: null,
      language: null,
      timestamp: null,
      validFrom: null,
      validUntil: null,
      expiresAt: null,
      confidence: "extracted",
      status: "current",
      supersededBy: [],
      conflicted: false,
      repositoryId: repositories.size === 1 ? [...repositories][0] : null,
      disclosureScopes: scopes,
      classification: effectiveConceptClassification(allProfiles),
      sourceProfiles,
      sourceProfileCount: allProfiles.length,
      sourceProfilesTruncated: allProfiles.length > sourceProfiles.length,
      sourceEventId: null,
      evidenceHash: null,
      contentHash: null,
      documentFrequency: entry.sources.length,
      terms: [{ term: entry.term, count: 1 }],
      signature: [{ term: entry.term, weight: 1 }]
    };
    conceptByTerm.set(entry.term, concept);
    return concept;
  });
  const edges = [];
  for (const source of sourceNodes) {
    for (const entry of (sourceSignatures.get(source.id) ?? [])
      .filter((candidate) => conceptByTerm.has(candidate.term))
      .slice(0, MAX_ABOUT_EDGES_PER_NODE)) {
      edges.push({
        source: source.id,
        type: "about",
        target: conceptByTerm.get(entry.term).id,
        sourceEventId: source.sourceEventId,
        evidenceHash: source.evidenceHash,
        confidence: "extracted",
        weight: entry.weight,
        occurrenceCount: 1
      });
    }
  }
  return { concepts, edges };
}

function projectQueryNode(node, metadata) {
  const projected = {
    id: node.id,
    type: node.type,
    kind: node.kind,
    label: node.label,
    path: node.path,
    language: node.language,
    timestamp: node.timestamp,
    validFrom: node.validFrom,
    validUntil: node.validUntil,
    expiresAt: node.expiresAt,
    confidence: node.confidence,
    status: "current",
    supersededBy: [],
    conflicted: metadata.conflicted,
    repositoryId: node.repositoryId,
    disclosureScopes: [...node.disclosureScopes],
    classification: node.classification,
    sourceProfiles: node.sourceProfiles,
    sourceEventId: node.sourceEventId,
    evidenceHash: node.evidenceHash,
    contentHash: node.contentHash,
    terms: metadata.terms,
    signature: metadata.signature,
    importance: metadata.importance,
    repositoryRank: metadata.repositoryRank,
    incoming: metadata.incoming,
    outgoing: metadata.outgoing
  };
  if (node.sourceProfiles.length > 0) {
    projected.sourceProfileCount = node.sourceProfileCount;
    projected.sourceProfilesTruncated = node.sourceProfilesTruncated;
  }
  if (node.type === "concept") {
    projected.documentFrequency = node.documentFrequency;
  }
  return projected;
}

export function rankLinkedProjectMemory(memory, query = "", options = {}) {
  if (!memory || memory.schemaVersion !== LINKED_PROJECT_MEMORY_SCHEMA_VERSION) {
    throw new TypeError("memory must be a linked project memory v1 projection.");
  }
  if (!Array.isArray(memory.nodes) || memory.nodes.length > MAX_GRAPH_NODES
    || !Array.isArray(memory.edges) || memory.edges.length > MAX_GRAPH_EDGES) {
    throw new QarinahError("LINKED_MEMORY_LIMIT", "Linked project memory exceeds its deterministic query budget.");
  }
  const { limit, asOf, allowedTypes, authorityScopes, repositoryIds } = normalizedRankRequest(query, options);
  const selectors = { authorityScopes, repositoryIds };
  const queryTerms = new Set(lexemes(query));
  const admittedActiveBase = memory.nodes.filter((node) => node.type !== "concept")
    .map((node) => profileBoundNode(node, selectors, asOf))
    .filter((node) => node !== null);
  const authorityComplete = !memory.nodes.some((node) => node.type !== "concept" && node.sourceProfilesTruncated === true);
  const admittedActiveBaseIds = new Set(admittedActiveBase.map((node) => node.id));
  const supersededAt = (node) => node.supersededBy.some((sourceId) => admittedActiveBaseIds.has(sourceId));
  const currentBase = admittedActiveBase.filter((node) => !supersededAt(node));
  const currentBaseIds = new Set(currentBase.map((node) => node.id));
  const semanticSources = currentBase.filter((node) => node.type !== "directory");
  const sourceSignatures = signaturesFromTerms(semanticSources);
  const localConcepts = buildAdmittedConcepts(semanticSources, sourceSignatures);
  const localNodes = [...currentBase, ...localConcepts.concepts];
  const localNodeIds = new Set(localNodes.map((node) => node.id));
  const localEdges = memory.edges.filter((edge) => edge.type !== "about"
    && currentBaseIds.has(edge.source)
    && currentBaseIds.has(edge.target));
  localEdges.push(...localConcepts.edges);
  localEdges.sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
  const nodeById = new Map(localNodes.map((node) => [node.id, node]));
  const adjacencySets = new Map(localNodes.map((node) => [node.id, new Set()]));
  const conflicted = new Set();
  for (const edge of localEdges) {
    if (!localNodeIds.has(edge.source) || !localNodeIds.has(edge.target)) continue;
    adjacencySets.get(edge.source).add(edge.target);
    adjacencySets.get(edge.target).add(edge.source);
    if (edge.type === "contradicts") {
      conflicted.add(edge.source);
      conflicted.add(edge.target);
    }
  }
  const adjacency = new Map([...adjacencySets].map(([id, neighbors]) => [id, [...neighbors].sort()]));
  const degrees = normalizedDegrees(localNodes, localEdges);
  const localRepositoryRanks = repositoryRanks(currentBase.filter((node) => node.type === "file"), localEdges);
  const times = currentBase.map((node) => node.timestamp === null ? null : Date.parse(node.timestamp)).filter(Number.isFinite);
  const minimumTime = times.length ? Math.min(...times) : 0;
  const maximumTime = times.length ? Math.max(...times) : 0;
  const timeSpan = Math.max(1, maximumTime - minimumTime);
  const signatures = new Map(sourceSignatures);
  for (const concept of localConcepts.concepts) signatures.set(concept.id, concept.signature);
  const metadata = new Map(localNodes.map((node) => {
    const degree = degrees.get(node.id) ?? { incoming: 0, outgoing: 0, normalized: 0 };
    const repositoryRank = localRepositoryRanks.get(node.id) ?? 0;
    const recency = node.timestamp === null ? 0 : (Date.parse(node.timestamp) - minimumTime) / timeSpan;
    const importance = node.type === "file"
      ? 0.75 * repositoryRank + 0.25 * degree.normalized
      : node.type === "concept"
        ? Math.min(1, node.documentFrequency / Math.max(1, semanticSources.length))
        : node.type === "memory"
          ? 0.45 * degree.normalized + 0.3 * recency + 0.25 * confidenceWeight(node.confidence)
          : 0.35 * degree.normalized;
    return [node.id, {
      terms: node.terms ?? [],
      signature: signatures.get(node.id) ?? [],
      importance: round(Math.min(1, importance)),
      repositoryRank: round(repositoryRank),
      incoming: degree.incoming,
      outgoing: degree.outgoing,
      conflicted: conflicted.has(node.id)
    }];
  }));
  const scored = [];
  for (const node of localNodes) {
    if (allowedTypes && !allowedTypes.has(node.type)) continue;
    const nodeMetadata = metadata.get(node.id);
    const local = vectorScore(nodeMetadata.signature, queryTerms);
    let graph = 0;
    if (queryTerms.size > 0) {
      for (const neighborId of adjacency.get(node.id) ?? []) {
        graph = Math.max(graph, vectorScore(metadata.get(neighborId)?.signature ?? [], queryTerms));
      }
    }
    const importance = nodeMetadata.importance;
    const score = queryTerms.size === 0
      ? importance
      : 0.72 * local + 0.18 * graph + 0.1 * importance;
    if (queryTerms.size > 0 && local === 0 && graph === 0) continue;
    scored.push({ node, score: round(score), local: round(local), graph: round(graph), importance: round(importance) });
  }
  scored.sort((left, right) => right.score - left.score
    || right.local - left.local
    || right.importance - left.importance
    || left.node.id.localeCompare(right.node.id));
  const items = scored.slice(0, limit).map((entry, index) => {
    const statusAtAsOf = "current";
    const node = projectQueryNode(entry.node, metadata.get(entry.node.id));
    return {
      rank: index + 1,
      score: entry.score,
      basis: {
        localSemantic: entry.local,
        linkedEvidence: entry.graph,
        structuralImportance: entry.importance,
        formula: queryTerms.size === 0 ? "structural-importance" : "0.72*local + 0.18*linked + 0.10*importance"
      },
      node,
      statusAtAsOf,
      evidence: {
        sourceEventId: entry.node.sourceEventId,
        hash: entry.node.evidenceHash,
        contentHash: entry.node.contentHash
      },
      neighbors: (adjacency.get(entry.node.id) ?? []).slice(0, 20)
    };
  });
  const matchedTerms = new Set();
  for (const item of items) {
    for (const entry of item.node.signature) if (queryTerms.has(entry.term)) matchedTerms.add(entry.term);
  }
  const sourceView = {
    workspaceId: memory.workspaceId,
    asOf,
    nodes: localNodes.map((node) => ({ id: node.id, evidenceHash: node.evidenceHash, contentHash: node.contentHash }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: localEdges.map((edge) => ({ source: edge.source, type: edge.type, target: edge.target }))
  };
  const latestSource = admittedActiveBase.filter((node) => node.type === "memory")
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id))[0];
  const projectedEvents = admittedActiveBase.filter((node) => node.type === "memory").length;
  const omittedEvents = memory.coverage.omittedEvents;
  const core = {
    schemaVersion: LINKED_PROJECT_QUERY_SCHEMA_VERSION,
    workspaceId: memory.workspaceId,
    sourceManifestHash: sha256(sourceView),
    sourceHeadHash: latestSource?.evidenceHash ?? null,
    query,
    asOf,
    requestedTypes: allowedTypes ? [...allowedTypes].sort() : [],
    authorityScopes,
    repositoryIds,
    filters: {
      excluded: admittedActiveBase.length - currentBase.length
    },
    coverage: {
      queryTerms: [...queryTerms].sort(),
      matchedTerms: [...matchedTerms].sort(),
      ratio: queryTerms.size === 0 ? 1 : round(matchedTerms.size / queryTerms.size),
      status: queryTerms.size === 0 ? "browse" : matchedTerms.size === queryTerms.size ? "direct" : matchedTerms.size > 0 ? "partial" : "none",
      sourceEvents: projectedEvents + omittedEvents,
      projectedEvents,
      omittedEvents,
      projectionComplete: memory.coverage.complete,
      authorityComplete
    },
    items
  };
  return deepFreezeJson({ ...core, manifestHash: sha256(core) });
}

async function readProjection(workspace, maximumBytes) {
  const opened = await openSecureReadFile(workspace, ["graph", "linked-memory.json"]);
  if (opened.metadata.size > maximumBytes) {
    await opened.handle.close();
    throw new QarinahError("LINKED_MEMORY_INVALID", "Linked project memory exceeds its bounded size.");
  }
  try {
    const contents = await opened.handle.readFile();
    if (contents.length !== opened.metadata.size) {
      throw new QarinahError("LINKED_MEMORY_INVALID", "Linked project memory changed while it was being read.");
    }
    return JSON.parse(contents.toString("utf8"));
  } catch (error) {
    if (error instanceof QarinahError) throw error;
    throw new QarinahError("LINKED_MEMORY_INVALID", "Linked project memory is not valid JSON.", { cause: error.message });
  } finally {
    await opened.handle.close();
  }
}

export async function writeLinkedProjectMemoryProjection(workspace, memory) {
  const serialized = `${canonicalStringify(memory)}\n`;
  const maximumBytes = Math.min(MAX_PROJECTION_BYTES, workspace.config.maxLogBytes * 6);
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
    throw new QarinahError("LINKED_MEMORY_LIMIT", "Linked project memory exceeds the workspace projection byte budget.");
  }
  const output = await secureStoragePath(workspace, ["graph", "linked-memory.json"], { type: "file", allowMissing: true });
  await atomicWriteFile(output, serialized);
  return output;
}

async function ensureLinkedProjectMemoryProjection(workspace, expected, rebuild) {
  const maximumBytes = Math.min(MAX_PROJECTION_BYTES, workspace.config.maxLogBytes * 6);
  let persisted;
  try {
    persisted = await readProjection(workspace, maximumBytes);
  } catch (error) {
    if (error?.code !== "ENOENT" || rebuild === false) throw error;
  }
  if (persisted !== undefined && canonicalStringify(persisted) !== canonicalStringify(expected)) {
    if (rebuild === false) {
      throw new QarinahError("LINKED_MEMORY_STALE", "Persisted linked project memory does not match the verified event log.");
    }
    persisted = undefined;
  }
  if (persisted === undefined) await writeLinkedProjectMemoryProjection(workspace, expected);
}

export async function loadLinkedProjectMemory(start = process.cwd(), options = {}) {
  const workspace = await loadWorkspace(start);
  const events = await readEvents(workspace, { updateCheckpoint: options.updateCheckpoint !== false });
  const expected = buildLinkedProjectMemory(events, workspace.config.workspaceId);
  if (options.persist === false) return Object.freeze({ workspace, memory: expected });
  await ensureLinkedProjectMemoryProjection(workspace, expected, options.rebuild);
  return Object.freeze({ workspace, memory: expected });
}

export async function queryLinkedProjectMemory(query = "", options = {}) {
  const request = normalizedRankRequest(query, options);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: options.updateCheckpoint !== false });
  const memory = buildLinkedProjectMemory(events, workspace.config.workspaceId, {
    asOf: request.asOf,
    authorityScopes: request.authorityScopes,
    repositoryIds: request.repositoryIds
  });
  const result = rankLinkedProjectMemory(memory, query, {
    ...options,
    asOf: request.asOf,
    authorityScopes: request.authorityScopes,
    repositoryIds: request.repositoryIds
  });
  if (options.persist !== false) {
    const globalMemory = buildLinkedProjectMemory(events, workspace.config.workspaceId);
    await ensureLinkedProjectMemoryProjection(workspace, globalMemory, options.rebuild);
  }
  return result;
}
