import { canonicalStringify, deepFreezeJson, sha256 } from "../canonical.js";
import { appendEvent } from "../store.js";
import {
  canonicalIsoTimestamp,
  snapshotJsonBoundary,
  snapshotRecordBoundary,
  stringField
} from "./boundary.js";
import {
  contentSummary,
  loadTrustedInteropWorkspace,
  workspaceLocator
} from "./capture-policy.js";

export const COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION = "cockroach-crawler.source-record.structural.v1";
export const COCKROACH_INGESTION_SCHEMA_VERSION = "qarinah.cockroach-ingestion.v1";

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

function privateTarget(prefix, value) {
  return `${prefix}sha256:${sha256(value).slice(7)}`;
}

function uuidFromDigest(value) {
  const hex = sha256(value).slice(7, 39).split("");
  hex[12] = "4";
  hex[16] = "8";
  const id = hex.join("");
  return `evt_${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function mapperOptions(options) {
  const normalized = snapshotRecordBoundary(options, {
    label: "Cockroach event mapping options",
    keys: ["capture", "retentionClass"],
    maximumBytes: 1_024,
    maximumStringLength: 16
  });
  const capture = normalized.capture ?? "metadata";
  if (!["metadata", "content"].includes(capture)) throw new TypeError("Cockroach event mapping capture is invalid.");
  const retentionClass = normalized.retentionClass ?? "project";
  if (!["session", "project", "durable"].includes(retentionClass)) {
    throw new TypeError("Cockroach event mapping retentionClass is invalid.");
  }
  return { capture, retentionClass };
}

function revisionIdentity(record) {
  return `${record.source}:${record.id}`;
}

function revisionEventId(record) {
  return uuidFromDigest(`cockroach-revision\0${revisionIdentity(record)}\0${record.contentHash}`);
}

function acquisitionIdentity(record) {
  return canonicalStringify({
    revisionEventId: revisionEventId(record),
    sourceMetadata: {
      type: record.type,
      title: record.title,
      url: record.url,
      author: record.author,
      publishedAt: record.publishedAt
    },
    adapterVersion: record.adapterVersion,
    warnings: record.warnings,
    metadata: record.metadata,
    provenance: record.provenance
  });
}

function uniqueRelations(relations) {
  return relations.filter((relation, index, entries) => (
    entries.findIndex((candidate) => candidate.type === relation.type && candidate.target === relation.target) === index
  ));
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
  if (record.publishedAt !== null) {
    canonicalIsoTimestamp(record.publishedAt, "Cockroach SourceRecord.publishedAt");
  }
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
  canonicalIsoTimestamp(provenance.retrievedAt, "Cockroach SourceRecord.provenance.retrievedAt");
  stringField(provenance.method, "Cockroach SourceRecord.provenance.method", { maximumLength: 128 });
  if (typeof provenance.authenticated !== "boolean" || typeof provenance.credentialed !== "boolean") {
    throw new TypeError("Cockroach SourceRecord provenance authentication flags must be booleans.");
  }
  return deepFreezeJson({ ...record, metadata, provenance });
}

export function cockroachSourceRecordToEventInput(value, options = {}) {
  const record = validateCockroachSourceRecordBoundary(value);
  const { capture, retentionClass } = mapperOptions(options);
  const sourceIdentity = revisionIdentity(record);
  const eventId = revisionEventId(record);
  const base = {
    eventId,
    kind: "source",
    actor: { type: "source", id: capture === "content" ? compactTarget("cockroach:", record.source).slice(0, 256) : "cockroach" },
    title: `Cockroach ${record.source} content revision`,
    body: "",
    confidence: "extracted",
    retention: { class: retentionClass, expiresAt: null }
  };
  if (capture === "metadata") {
    return deepFreezeJson({
      ...base,
      data: {
        boundaryVersion: COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION,
        capture: "metadata",
        trust: "untrusted",
        contentOmitted: true,
        source: record.source,
        upstreamContentHash: record.contentHash,
        sourceText: contentSummary(record.text)
      },
      relations: [{ type: "derived_from", target: privateTarget("cockroach-source:", sourceIdentity) }],
      provenance: {
        adapter: "cockroach.metadata",
        sourceId: privateTarget("cockroach-source:", sourceIdentity)
      }
    });
  }
  const body = compact(record.text, 16_000, "SOURCE_TEXT");
  const relations = [{ type: "derived_from", target: compactTarget("cockroach-source:", sourceIdentity) }];
  return deepFreezeJson({
    ...base,
    body: body.value,
    data: {
      boundaryVersion: COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION,
      capture: "content",
      trust: "untrusted",
      source: record.source,
      sourceRecordId: record.id,
      upstreamContentHash: record.contentHash,
      normalization: { textTruncated: body.truncated }
    },
    relations: uniqueRelations(relations),
    provenance: {
      adapter: "cockroach.revision",
      sourceId: compactTarget("cockroach-source:", sourceIdentity)
    }
  });
}

export function cockroachSourceRecordToAcquisitionEventInput(value, options = {}) {
  const record = validateCockroachSourceRecordBoundary(value);
  const { capture, retentionClass } = mapperOptions(options);
  const revisionId = revisionEventId(record);
  const eventId = uuidFromDigest(`cockroach-acquisition\0${acquisitionIdentity(record)}`);
  const base = {
    eventId,
    timestamp: record.provenance.retrievedAt,
    kind: "source",
    actor: { type: "source", id: "cockroach" },
    title: `Cockroach ${record.source} acquisition`,
    body: "",
    confidence: "extracted",
    relations: [
      { type: "derived_from", target: revisionId },
      { type: "governed_by", target: compactTarget("cockroach-adapter:", `${record.source}@${record.adapterVersion}`) },
      { type: "references", target: compactTarget("acquisition:", `${record.provenance.method}:${record.provenance.retrievedAt}`) }
    ],
    provenance: { adapter: "cockroach.acquisition", sourceId: eventId },
    retention: { class: retentionClass, expiresAt: null }
  };
  if (capture === "metadata") {
    return deepFreezeJson({
      ...base,
      data: {
        boundaryVersion: COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION,
        capture: "metadata",
        contentOmitted: true,
        source: record.source,
        sourceType: record.type,
        upstreamContentHash: record.contentHash,
        sourceMetadata: contentSummary({
          title: record.title,
          url: record.url,
          author: record.author,
          publishedAt: record.publishedAt
        }),
        adapterVersion: record.adapterVersion,
        warnings: contentSummary(record.warnings),
        providerMetadata: contentSummary(record.metadata),
        acquisition: record.provenance
      }
    });
  }
  const title = compact(record.title, 512, "ACQUISITION_TITLE");
  const relations = [...base.relations];
  if (record.url) relations.push({ type: "references", target: compactTarget("", record.url) });
  if (record.author) relations.push({ type: "references", target: compactTarget("author:", record.author) });
  return deepFreezeJson({
    ...base,
    relations: uniqueRelations(relations),
    data: {
      boundaryVersion: COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION,
      capture: "content",
      source: record.source,
      sourceRecordId: record.id,
      sourceType: record.type,
      title: title.value,
      canonicalUrl: record.url,
      citation: record.url ? {
        url: record.url,
        title: title.value,
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
      normalization: { titleTruncated: title.truncated }
    }
  });
}

export async function ingestCockroachSourceRecord(value, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Cockroach ingestion options must be a record.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const allowed = new Set(["cwd", "workspace", "retentionClass"]);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new TypeError("Cockroach ingestion options contain unknown fields.");
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`Cockroach ingestion options.${key} must be an enumerable data property.`);
    }
  }
  const retentionClass = descriptors.retentionClass?.value;
  if (retentionClass !== undefined && !["session", "project", "durable"].includes(retentionClass)) {
    throw new TypeError("Cockroach ingestion retentionClass is invalid.");
  }
  const locator = workspaceLocator({
    ...(descriptors.cwd ? { cwd: descriptors.cwd.value } : {}),
    ...(descriptors.workspace ? { workspace: descriptors.workspace.value } : {})
  }, "Cockroach ingestion options");
  const workspace = await loadTrustedInteropWorkspace(locator);
  const mapping = { capture: workspace.config.capture, retentionClass: retentionClass ?? workspace.config.retentionClass };
  const revisionInput = cockroachSourceRecordToEventInput(value, mapping);
  const acquisitionInput = cockroachSourceRecordToAcquisitionEventInput(value, mapping);
  const revision = await appendEvent(revisionInput, { workspace, idempotent: true });
  const acquisition = await appendEvent(acquisitionInput, { workspace, idempotent: true });
  return deepFreezeJson({
    schemaVersion: COCKROACH_INGESTION_SCHEMA_VERSION,
    capture: workspace.config.capture,
    revision,
    acquisition
  });
}
