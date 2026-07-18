import { deepFreezeJson, sha256 } from "../canonical.js";
import { appendEvent } from "../store.js";
import {
  isoTimestamp,
  snapshotJsonBoundary,
  snapshotRecordBoundary,
  stringField
} from "./boundary.js";

export const COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION = "cockroach-crawler.source-record.structural.v1";

const SOURCE_KEYS = Object.freeze([
  "source", "id", "type", "title", "url", "text", "author", "publishedAt",
  "contentHash", "adapterVersion", "warnings", "metadata", "provenance"
]);
const PROVENANCE_KEYS = Object.freeze(["retrievedAt", "method", "authenticated", "credentialed"]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function compact(value, maximum, label) {
  if (value.length <= maximum) return { value, truncated: false };
  let omitted = value.length - maximum;
  let marker = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    marker = `\n[QARINAH_${label}_TRUNCATED:${omitted}]`;
    const retained = Math.max(0, maximum - marker.length);
    const next = value.length - retained;
    if (next === omitted) break;
    omitted = next;
  }
  marker = `\n[QARINAH_${label}_TRUNCATED:${omitted}]`;
  return { value: `${value.slice(0, Math.max(0, maximum - marker.length))}${marker}`, truncated: true };
}

function compactTarget(prefix, value) {
  const candidate = `${prefix}${value}`;
  return candidate.length <= 512 ? candidate : `${prefix}sha256:${sha256(value).slice(7)}`;
}

function uuidFromDigest(value) {
  const hex = sha256(value).slice(7, 39).split("");
  hex[12] = "4";
  hex[16] = "8";
  const id = hex.join("");
  return `evt_${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export function validateCockroachSourceRecordBoundary(value) {
  const record = snapshotRecordBoundary(value, {
    label: "Cockroach SourceRecord",
    keys: SOURCE_KEYS,
    maximumDepth: 24,
    maximumNodes: 10_000,
    maximumArrayLength: 128,
    maximumObjectKeys: 512,
    maximumStringLength: 1_000_000,
    maximumBytes: 1_500_000
  });
  for (const key of SOURCE_KEYS) {
    if (!Object.hasOwn(record, key)) throw new TypeError(`Cockroach SourceRecord is missing '${key}'.`);
  }
  stringField(record.source, "Cockroach SourceRecord.source", { maximumLength: 128 });
  stringField(record.id, "Cockroach SourceRecord.id", { maximumLength: 512 });
  stringField(record.type, "Cockroach SourceRecord.type", { maximumLength: 128 });
  stringField(record.title, "Cockroach SourceRecord.title", { allowEmpty: true, maximumLength: 65_536 });
  stringField(record.url, "Cockroach SourceRecord.url", { allowEmpty: true, maximumLength: 8_192 });
  stringField(record.text, "Cockroach SourceRecord.text", { allowEmpty: true, maximumLength: 1_000_000 });
  stringField(record.author, "Cockroach SourceRecord.author", { nullable: true, maximumLength: 512 });
  if (record.publishedAt !== null) isoTimestamp(record.publishedAt, "Cockroach SourceRecord.publishedAt");
  if (typeof record.contentHash !== "string" || !HASH_PATTERN.test(record.contentHash)) {
    throw new TypeError("Cockroach SourceRecord.contentHash must be a lowercase sha256 digest.");
  }
  stringField(record.adapterVersion, "Cockroach SourceRecord.adapterVersion", { maximumLength: 128 });
  if (!Array.isArray(record.warnings) || record.warnings.length > 32) {
    throw new TypeError("Cockroach SourceRecord.warnings must be an array with at most 32 entries.");
  }
  record.warnings.forEach((warning, index) => stringField(warning, `Cockroach SourceRecord.warnings[${index}]`, {
    allowEmpty: true,
    maximumLength: 512
  }));
  if (!record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata)) {
    throw new TypeError("Cockroach SourceRecord.metadata must be a JSON record.");
  }
  const metadata = snapshotJsonBoundary(record.metadata, {
    label: "Cockroach SourceRecord.metadata",
    maximumDepth: 10,
    maximumNodes: 10_000,
    maximumArrayLength: 10_000,
    maximumObjectKeys: 128,
    maximumStringLength: 65_536,
    maximumBytes: 32_768
  });
  const provenance = snapshotRecordBoundary(record.provenance, {
    label: "Cockroach SourceRecord.provenance",
    keys: PROVENANCE_KEYS,
    maximumBytes: 4_096,
    maximumStringLength: 128
  });
  for (const key of PROVENANCE_KEYS) {
    if (!Object.hasOwn(provenance, key)) throw new TypeError(`Cockroach SourceRecord.provenance is missing '${key}'.`);
  }
  const retrievedAt = isoTimestamp(provenance.retrievedAt, "Cockroach SourceRecord.provenance.retrievedAt");
  stringField(provenance.method, "Cockroach SourceRecord.provenance.method", { maximumLength: 128 });
  if (typeof provenance.authenticated !== "boolean" || typeof provenance.credentialed !== "boolean") {
    throw new TypeError("Cockroach SourceRecord provenance authentication flags must be booleans.");
  }
  return deepFreezeJson({ ...record, metadata, provenance: { ...provenance, retrievedAt } });
}

export function cockroachSourceRecordToEventInput(value, options = {}) {
  const record = validateCockroachSourceRecordBoundary(value);
  const optionRecord = snapshotRecordBoundary(options, {
    label: "Cockroach ingestion options",
    keys: ["retentionClass"],
    maximumBytes: 1_024,
    maximumStringLength: 16
  });
  const retentionClass = optionRecord.retentionClass ?? "project";
  if (!["session", "project", "durable"].includes(retentionClass)) {
    throw new TypeError("Cockroach ingestion retentionClass is invalid.");
  }
  const title = compact(record.title || `${record.source} ${record.type} ${record.id}`, 512, "TITLE");
  const body = compact(record.text, 16_000, "SOURCE_TEXT");
  const sourceIdentity = `${record.source}:${record.id}`;
  const relations = [
    { type: "derived_from", target: compactTarget("cockroach-source:", sourceIdentity) },
    { type: "governed_by", target: compactTarget("cockroach-adapter:", `${record.source}@${record.adapterVersion}`) },
    { type: "references", target: compactTarget("acquisition:", `${record.provenance.method}:${record.provenance.retrievedAt}`) }
  ];
  if (record.url) relations.push({ type: "references", target: compactTarget("", record.url) });
  if (record.author) relations.push({ type: "references", target: compactTarget("author:", record.author) });
  const uniqueRelations = relations.filter((relation, index, entries) => (
    entries.findIndex((candidate) => candidate.type === relation.type && candidate.target === relation.target) === index
  ));
  return deepFreezeJson({
    eventId: uuidFromDigest(`${sourceIdentity}\0${record.contentHash}`),
    timestamp: record.provenance.retrievedAt,
    kind: "source",
    actor: { type: "source", id: compactTarget("cockroach:", record.source).slice(0, 256) },
    title: title.value,
    body: body.value,
    data: {
      boundaryVersion: COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION,
      trust: "untrusted",
      source: record.source,
      sourceRecordId: record.id,
      sourceType: record.type,
      canonicalUrl: record.url,
      citation: record.url ? {
        url: record.url,
        title: compact(record.title, 512, "CITATION_TITLE").value,
        author: record.author,
        publishedAt: record.publishedAt
      } : null,
      author: record.author,
      publishedAt: record.publishedAt,
      upstreamContentHash: record.contentHash,
      adapterVersion: record.adapterVersion,
      warnings: record.warnings,
      metadata: record.metadata,
      acquisition: record.provenance,
      normalization: { titleTruncated: title.truncated, textTruncated: body.truncated }
    },
    confidence: "extracted",
    relations: uniqueRelations,
    provenance: {
      adapter: compactTarget("cockroach:", `${record.source}@${record.adapterVersion}`).slice(0, 128),
      sourceId: compactTarget("cockroach-source:", sourceIdentity)
    },
    retention: { class: retentionClass, expiresAt: null }
  });
}

export async function ingestCockroachSourceRecord(value, options = {}) {
  const boundaryOptions = snapshotRecordBoundary(options, {
    label: "Cockroach ingestion options",
    keys: ["cwd", "workspace", "retentionClass"],
    maximumBytes: 4_096,
    maximumStringLength: 2_048
  });
  if (boundaryOptions.cwd !== undefined && (typeof boundaryOptions.cwd !== "string" || boundaryOptions.cwd.length === 0)) {
    throw new TypeError("Cockroach ingestion options.cwd must be a non-empty string.");
  }
  const event = cockroachSourceRecordToEventInput(value, boundaryOptions.retentionClass === undefined
    ? {}
    : { retentionClass: boundaryOptions.retentionClass });
  return appendEvent(event, {
    ...(boundaryOptions.cwd === undefined ? {} : { cwd: boundaryOptions.cwd }),
    ...(boundaryOptions.workspace === undefined ? {} : { workspace: boundaryOptions.workspace }),
    idempotent: true
  });
}
