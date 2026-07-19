import { randomUUID } from "node:crypto";
import { canonicalStringify, deepFreezeJson, sanitizeJsonValue, sha256 } from "./canonical.js";
import { canonicalIsoTimestamp } from "./interoperability/boundary.js";
import { redactText, redactValue } from "./redact.js";

export const EVENT_SCHEMA_VERSION = "qarinah.event.v1";
export const CONTEXT_PACK_SCHEMA_VERSION = "qarinah.context-pack.v1";

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
  "summary"
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
  "confidence", "relations", "provenance", "retention"
]);
const STORED_KEYS = new Set([
  "schemaVersion", "eventId", "timestamp", "workspaceId", "sessionId", "turnId", "kind", "actor",
  "title", "body", "data", "confidence", "relations", "provenance", "retention", "previousHash", "hash"
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
  const content = { title, body, data, relations };
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
