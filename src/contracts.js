import { randomUUID } from "node:crypto";
import { canonicalStringify, deepFreezeJson, sanitizeJsonValue, sha256 } from "./canonical.js";
import { canonicalIsoTimestamp } from "./interoperability/boundary.js";
import { redactText, redactValue } from "./redact.js";

export const EVENT_SCHEMA_VERSION = "qarinah.event.v1";
export const CONTEXT_PACK_SCHEMA_VERSION = "qarinah.context-pack.v2";

export const EVENT_KINDS = Object.freeze([
  "session.started",
  "prompt.submitted",
  "tool.requested",
  "tool.completed",
  "turn.completed",
  "compaction.started",
  "compaction.completed",
  "artifact",
  "source",
  "claim",
  "decision",
  "approval",
  "summary",
  "memory.scope.attached",
  "memory.scope.revoked",
  "context.pack.compiled"
]);

export const RELATION_TYPES = Object.freeze([
  "derived_from",
  "produced",
  "changed",
  "supports",
  "contradicts",
  "supersedes",
  "authorized_by",
  "governed_by",
  "affects",
  "references"
]);

const CONFIDENCE_CLASSES = new Set(["extracted", "inferred", "claimed", "verified"]);
const ACTOR_TYPES = new Set(["human", "agent", "tool", "system", "source"]);
const RETENTION_CLASSES = new Set(["session", "project", "durable"]);
const INPUT_KEYS = new Set([
  "eventId", "timestamp", "sessionId", "turnId", "kind", "actor", "title", "body", "data",
  "confidence", "authority", "temporal", "repository", "freshness", "disclosure",
  "relations", "provenance", "retention"
]);
const STORED_KEYS = new Set([
  "schemaVersion", "eventId", "timestamp", "workspaceId", "sessionId", "turnId", "kind", "actor",
  "title", "body", "data", "confidence", "authority", "temporal", "repository", "freshness", "disclosure",
  "relations", "provenance", "retention", "previousHash", "hash"
]);
const EVENT_ID_PATTERN = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WORKSPACE_ID_PATTERN = /^ws_[0-9a-f]{32}$/;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_EVENT_BYTES = 256 * 1024;

function record(value, label, knownKeys, { rejectUnknown = true } = {}) {
  const safe = sanitizeJsonValue(value, { label, maximumStringLength: 65_536 });
  if (!safe || typeof safe !== "object" || Array.isArray(safe)) throw new TypeError(`${label} must be a record.`);
  if (rejectUnknown) {
    const unknown = Object.keys(safe).filter((key) => !knownKeys.has(key));
    if (unknown.length) throw new TypeError(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
  }
  return safe;
}

function boundedString(value, label, maximum, { nullable = false, empty = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || (!empty && value.trim() === "") || value.length > maximum) {
    throw new TypeError(`${label} must be ${nullable ? "null or " : ""}a${empty ? "" : " non-empty"} string up to ${maximum} characters.`);
  }
  return redactText(value);
}

function normalizeActor(value) {
  const actor = record(value, "actor", new Set(["type", "id"]));
  if (!ACTOR_TYPES.has(actor.type)) throw new TypeError("actor.type is invalid.");
  return Object.freeze({ type: actor.type, id: boundedString(actor.id, "actor.id", 256) });
}

function normalizeRelations(value = []) {
  if (!Array.isArray(value) || value.length > 128) throw new TypeError("relations must be an array with at most 128 entries.");
  const seen = new Set();
  return Object.freeze(value.map((candidate, index) => {
    const relation = record(candidate, `relations[${index}]`, new Set(["type", "target"]));
    if (!RELATION_TYPES.includes(relation.type)) throw new TypeError(`relations[${index}].type is invalid.`);
    const target = boundedString(relation.target, `relations[${index}].target`, 512);
    const key = `${relation.type}\0${target}`;
    if (seen.has(key)) throw new TypeError("relations cannot contain duplicates.");
    seen.add(key);
    return Object.freeze({ type: relation.type, target });
  }));
}

function normalizeAuthority(value) {
  if (value === undefined || value === null) return null;
  const authority = record(value, "authority", new Set([
    "scope", "rank", "assignedBy", "assignedAt", "expiresAt", "revokedAt", "basis"
  ]));
  const assignedAt = canonicalIsoTimestamp(authority.assignedAt, "authority.assignedAt");
  const expiresAt = authority.expiresAt === undefined || authority.expiresAt === null
    ? null
    : canonicalIsoTimestamp(authority.expiresAt, "authority.expiresAt");
  const revokedAt = authority.revokedAt === undefined || authority.revokedAt === null
    ? null
    : canonicalIsoTimestamp(authority.revokedAt, "authority.revokedAt");
  if (expiresAt !== null && expiresAt < assignedAt) throw new TypeError("authority.expiresAt cannot precede authority.assignedAt.");
  if (revokedAt !== null && revokedAt < assignedAt) throw new TypeError("authority.revokedAt cannot precede authority.assignedAt.");
  if (!Number.isSafeInteger(authority.rank) || authority.rank < 0 || authority.rank > 100) {
    throw new TypeError("authority.rank must be an integer from 0 to 100.");
  }
  return Object.freeze({
    scope: boundedString(authority.scope, "authority.scope", 256),
    rank: authority.rank,
    assignedBy: boundedString(authority.assignedBy, "authority.assignedBy", 256),
    assignedAt,
    expiresAt,
    revokedAt,
    basis: boundedString(authority.basis ?? "host-assigned", "authority.basis", 512)
  });
}

function normalizeTemporal(value, eventTimestamp) {
  if (value === undefined || value === null) return null;
  const temporal = record(value, "temporal", new Set(["validFrom", "validUntil"]));
  const validFrom = temporal.validFrom === undefined
    ? eventTimestamp
    : canonicalIsoTimestamp(temporal.validFrom, "temporal.validFrom");
  const validUntil = temporal.validUntil === undefined || temporal.validUntil === null
    ? null
    : canonicalIsoTimestamp(temporal.validUntil, "temporal.validUntil");
  if (validUntil !== null && validUntil <= validFrom) {
    throw new TypeError("temporal.validUntil must be later than temporal.validFrom.");
  }
  return Object.freeze({ validFrom, validUntil });
}

function normalizeRepository(value) {
  if (value === undefined || value === null) return null;
  const repository = record(value, "repository", new Set(["id", "branch", "commit"]));
  return Object.freeze({
    id: boundedString(repository.id, "repository.id", 256),
    branch: repository.branch === undefined || repository.branch === null
      ? null
      : boundedString(repository.branch, "repository.branch", 512),
    commit: repository.commit === undefined || repository.commit === null
      ? null
      : boundedString(repository.commit, "repository.commit", 128)
  });
}

function normalizeFreshness(value) {
  if (value === undefined || value === null) return null;
  const freshness = record(value, "freshness", new Set(["files", "dependencies"]));
  const files = freshness.files ?? [];
  const dependencies = freshness.dependencies ?? [];
  if (!Array.isArray(files) || files.length > 512) throw new TypeError("freshness.files must contain at most 512 entries.");
  if (!Array.isArray(dependencies) || dependencies.length > 512) {
    throw new TypeError("freshness.dependencies must contain at most 512 entries.");
  }
  const normalizedFiles = files.map((candidate, index) => {
    const file = record(candidate, `freshness.files[${index}]`, new Set(["path", "hash"]));
    const hash = boundedString(file.hash, `freshness.files[${index}].hash`, 71);
    if (!HASH_PATTERN.test(hash)) throw new TypeError(`freshness.files[${index}].hash is invalid.`);
    return Object.freeze({ path: boundedString(file.path, `freshness.files[${index}].path`, 1_024), hash });
  });
  const normalizedDependencies = dependencies.map((candidate, index) => {
    const dependency = record(candidate, `freshness.dependencies[${index}]`, new Set(["name", "version", "hash"]));
    const hash = boundedString(dependency.hash, `freshness.dependencies[${index}].hash`, 71);
    if (!HASH_PATTERN.test(hash)) throw new TypeError(`freshness.dependencies[${index}].hash is invalid.`);
    return Object.freeze({
      name: boundedString(dependency.name, `freshness.dependencies[${index}].name`, 512),
      version: dependency.version === undefined || dependency.version === null
        ? null
        : boundedString(dependency.version, `freshness.dependencies[${index}].version`, 256),
      hash
    });
  });
  return Object.freeze({ files: Object.freeze(normalizedFiles), dependencies: Object.freeze(normalizedDependencies) });
}

function normalizeDisclosure(value) {
  if (value === undefined || value === null) return null;
  const disclosure = record(value, "disclosure", new Set(["scopes", "classification"]));
  const scopes = disclosure.scopes ?? [];
  if (!Array.isArray(scopes) || scopes.length > 64) throw new TypeError("disclosure.scopes must contain at most 64 entries.");
  const normalized = scopes.map((scope, index) => boundedString(scope, `disclosure.scopes[${index}]`, 256));
  if (new Set(normalized).size !== normalized.length) throw new TypeError("disclosure.scopes cannot contain duplicates.");
  const classification = disclosure.classification ?? "workspace";
  if (!["public", "workspace", "restricted"].includes(classification)) {
    throw new TypeError("disclosure.classification is invalid.");
  }
  return Object.freeze({ scopes: Object.freeze([...normalized].sort()), classification });
}

function normalizeRetention(value = {}) {
  const retention = record(value, "retention", new Set(["class", "expiresAt"]));
  const retentionClass = retention.class ?? "project";
  if (!RETENTION_CLASSES.has(retentionClass)) throw new TypeError("retention.class is invalid.");
  const expiresAt = retention.expiresAt === undefined || retention.expiresAt === null
    ? null
    : canonicalIsoTimestamp(retention.expiresAt, "retention.expiresAt");
  return Object.freeze({ class: retentionClass, expiresAt });
}

function normalizeProvenance(value = {}, content) {
  const provenance = record(value, "provenance", new Set(["adapter", "sourceId", "contentHash"]));
  const contentHash = sha256(content);
  if (provenance.contentHash !== undefined && provenance.contentHash !== contentHash) {
    throw new TypeError("provenance.contentHash does not match the redacted event content.");
  }
  return Object.freeze({
    adapter: boundedString(provenance.adapter ?? "manual", "provenance.adapter", 128),
    sourceId: provenance.sourceId === undefined || provenance.sourceId === null
      ? null
      : boundedString(provenance.sourceId, "provenance.sourceId", 512),
    contentHash
  });
}

export function createEventEnvelope(input, options) {
  const candidate = record(input, "event input", INPUT_KEYS);
  const workspaceId = boundedString(options?.workspaceId, "workspaceId", 35);
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) throw new TypeError("workspaceId is invalid.");
  if (!EVENT_KINDS.includes(candidate.kind)) throw new TypeError("kind is invalid.");
  const eventId = candidate.eventId ?? `evt_${(options?.randomUUID || randomUUID)()}`;
  if (!EVENT_ID_PATTERN.test(eventId)) throw new TypeError("eventId is invalid.");
  const now = candidate.timestamp ?? (options?.clock ? options.clock() : new Date()).toISOString();
  const eventTimestamp = canonicalIsoTimestamp(typeof now === "string" ? now : now.toISOString(), "timestamp");
  const title = boundedString(candidate.title, "title", 512);
  const body = boundedString(candidate.body ?? "", "body", 65_536, { empty: true });
  const rawData = candidate.data ?? {};
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new TypeError("data must be a record.");
  }
  const data = redactValue(rawData, { label: "data", maximumStringLength: 65_536, maximumObjectKeys: 128 });
  const relations = normalizeRelations(candidate.relations);
  const authority = normalizeAuthority(candidate.authority);
  const temporal = normalizeTemporal(candidate.temporal, eventTimestamp);
  const repository = normalizeRepository(candidate.repository);
  const freshness = normalizeFreshness(candidate.freshness);
  const disclosure = normalizeDisclosure(candidate.disclosure);
  const content = {
    title, body, data,
    ...(authority === null ? {} : { authority }),
    ...(temporal === null ? {} : { temporal }),
    ...(repository === null ? {} : { repository }),
    ...(freshness === null ? {} : { freshness }),
    ...(disclosure === null ? {} : { disclosure }),
    relations
  };
  const previousHash = options?.previousHash ?? null;
  if (previousHash !== null && !HASH_PATTERN.test(previousHash)) throw new TypeError("previousHash is invalid.");
  const confidence = candidate.confidence ?? "extracted";
  if (!CONFIDENCE_CLASSES.has(confidence)) throw new TypeError("confidence is invalid.");
  const envelopeWithoutHash = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId,
    timestamp: eventTimestamp,
    workspaceId,
    sessionId: candidate.sessionId === undefined || candidate.sessionId === null
      ? null
      : boundedString(candidate.sessionId, "sessionId", 256),
    turnId: candidate.turnId === undefined || candidate.turnId === null
      ? null
      : boundedString(candidate.turnId, "turnId", 256),
    kind: candidate.kind,
    actor: normalizeActor(candidate.actor ?? { type: "human", id: "local-user" }),
    title,
    body,
    data,
    confidence,
    ...(authority === null ? {} : { authority }),
    ...(temporal === null ? {} : { temporal }),
    ...(repository === null ? {} : { repository }),
    ...(freshness === null ? {} : { freshness }),
    ...(disclosure === null ? {} : { disclosure }),
    relations,
    provenance: normalizeProvenance(candidate.provenance, content),
    retention: normalizeRetention(candidate.retention),
    previousHash
  };
  const envelope = deepFreezeJson({ ...envelopeWithoutHash, hash: sha256(envelopeWithoutHash) });
  const bytes = Buffer.byteLength(canonicalStringify(envelope));
  if (bytes > (options?.maximumEventBytes ?? MAX_EVENT_BYTES)) {
    throw new TypeError(`Event exceeds the ${options?.maximumEventBytes ?? MAX_EVENT_BYTES}-byte limit.`);
  }
  return envelope;
}

export function validateStoredEvent(value, options = {}) {
  const event = record(value, "stored event", STORED_KEYS);
  if (event.schemaVersion !== EVENT_SCHEMA_VERSION) throw new TypeError("Unsupported event schemaVersion.");
  const reconstructed = createEventEnvelope({
    eventId: event.eventId,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    turnId: event.turnId,
    kind: event.kind,
    actor: event.actor,
    title: event.title,
    body: event.body,
    data: event.data,
    confidence: event.confidence,
    ...(event.authority === undefined ? {} : { authority: event.authority }),
    ...(event.temporal === undefined ? {} : { temporal: event.temporal }),
    ...(event.repository === undefined ? {} : { repository: event.repository }),
    ...(event.freshness === undefined ? {} : { freshness: event.freshness }),
    ...(event.disclosure === undefined ? {} : { disclosure: event.disclosure }),
    relations: event.relations,
    provenance: event.provenance,
    retention: event.retention
  }, {
    workspaceId: event.workspaceId,
    previousHash: event.previousHash,
    maximumEventBytes: options.maximumEventBytes
  });
  if (event.hash !== reconstructed.hash || !HASH_PATTERN.test(event.hash)) {
    throw new TypeError(`Event '${event.eventId}' hash does not match its canonical contents.`);
  }
  if (canonicalStringify(event) !== canonicalStringify(reconstructed)) {
    throw new TypeError(`Event '${event.eventId}' stored representation is not canonical.`);
  }
  if (options.expectedPreviousHash !== undefined && event.previousHash !== options.expectedPreviousHash) {
    throw new TypeError(`Event '${event.eventId}' breaks hash-chain continuity.`);
  }
  if (options.workspaceId !== undefined && event.workspaceId !== options.workspaceId) {
    throw new TypeError(`Event '${event.eventId}' belongs to a different workspace.`);
  }
  return reconstructed;
}

export function createManifestHash(packWithoutHash) {
  return sha256(packWithoutHash);
}
