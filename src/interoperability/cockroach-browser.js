import { canonicalStringify, deepFreezeJson, sha256 } from "../canonical.js";
import { reviewMetadataEventInput } from "../capture-policy.js";
import { redactText } from "../redact.js";
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

export const COCKROACH_BROWSER_MEMORY_SCHEMA_VERSION = "cockroach.browser-memory.v1";

const OUTCOME_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "sessionId",
  "actor",
  "purpose",
  "timestamp",
  "inputDigest",
  "outputDigest",
  "evidenceIds",
  "receiptHash",
  "metadata"
]);
const REQUIRED_OUTCOME_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "sessionId",
  "purpose",
  "timestamp",
  "evidenceIds",
  "metadata"
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OUTCOME_TYPE_PATTERN = /^browser\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const ACTIONS = new Set([
  "navigate", "back", "forward", "reload", "click", "doubleClick", "fill", "type", "press",
  "hover", "focus", "check", "uncheck", "select", "scroll", "drag", "upload", "download",
  "evaluate", "wait", "screenshot", "pdf", "snapshot", "extract", "cookies.read", "cookies.write",
  "storage.read", "storage.write", "tab.open", "tab.close", "tab.switch", "trace.start", "trace.stop"
]);
const STATUSES = new Set(["succeeded", "denied", "failed", "challenge"]);
const EFFECTS = new Set(["read", "write", "execute", "upload", "download", "credential"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const MODES = new Set(["headless", "headed"]);
const WRITE_ACTIONS = new Set([
  "click", "doubleClick", "fill", "type", "press", "check", "uncheck", "select", "drag",
  "upload", "cookies.write", "storage.write"
]);
const HIGH_RISK_ACTIONS = new Set([
  "click", "doubleClick", "press", "upload", "download", "evaluate",
  "cookies.read", "cookies.write", "storage.read", "storage.write"
]);
const SENSITIVE_METADATA_KEY = /(?:^|_)(?:api_?keys?|authorization|auth_?token|cookies?|credential(?:s|ed)?|password|passwd|passphrases?|profiles?|profile_?data|secrets?|tokens?|storage(?:_?values?)?|form_?values?|private_?key|client_?secret|value_?ref)(?:_|$)/;

function normalizedKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase();
}

function hasSensitiveMetadataKey(value) {
  return SENSITIVE_METADATA_KEY.test(normalizedKey(value));
}

function omitSecrets(value) {
  function visit(candidate) {
    if (typeof candidate === "string") return redactText(candidate);
    if (Array.isArray(candidate)) return candidate.map((entry) => visit(entry));
    if (candidate && typeof candidate === "object") {
      const result = Object.create(null);
      for (const [key, nested] of Object.entries(candidate)) {
        if (hasSensitiveMetadataKey(key)) continue;
        result[key] = visit(nested);
      }
      return result;
    }
    return candidate;
  }
  return deepFreezeJson(visit(value));
}

function hashField(value, label, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase sha256 digest.`);
  }
  return value;
}

function opaqueId(value, label) {
  stringField(value, label, { maximumLength: 256 });
  if (!OPAQUE_ID_PATTERN.test(value) || redactText(value) !== value) {
    throw new TypeError(`${label} must be a bounded, non-secret opaque identifier.`);
  }
  return value;
}

function evidenceIds(value, label) {
  if (!Array.isArray(value) || value.length > 128) {
    throw new TypeError(`${label} must be an array with at most 128 entries.`);
  }
  const normalized = value.map((entry, index) => opaqueId(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} cannot contain duplicate citations.`);
  }
  return normalized;
}

function optionalMetadataString(metadata, key, maximumLength) {
  if (!Object.hasOwn(metadata, key)) return undefined;
  return stringField(metadata[key], `Cockroach Browser outcome.metadata.${key}`, { maximumLength });
}

function optionalMetadataEnum(metadata, key, values) {
  if (!Object.hasOwn(metadata, key)) return undefined;
  const value = stringField(metadata[key], `Cockroach Browser outcome.metadata.${key}`, { maximumLength: 64 });
  if (!values.has(value)) throw new TypeError(`Cockroach Browser outcome.metadata.${key} is invalid.`);
  return value;
}

function effectForAction(action) {
  if (action === "upload") return "upload";
  if (action === "download") return "download";
  if (action === "evaluate") return "execute";
  if (action.startsWith("cookies.") || action.startsWith("storage.")) return "credential";
  return WRITE_ACTIONS.has(action) ? "write" : "read";
}

function riskForAction(action) {
  if (action === "evaluate" || action === "cookies.write" || action === "storage.write") return "critical";
  if (HIGH_RISK_ACTIONS.has(action)) return "high";
  if (WRITE_ACTIONS.has(action) || action === "navigate") return "medium";
  return "low";
}

function consistentHash(outer, nested, label) {
  const topLevel = hashField(outer, `Cockroach Browser outcome.${label}`, { optional: true });
  const metadata = hashField(nested, `Cockroach Browser outcome.metadata.${label}`, { optional: true });
  if (topLevel !== undefined && metadata !== undefined && topLevel !== metadata) {
    throw new TypeError(`Cockroach Browser outcome ${label} fields disagree.`);
  }
  return topLevel ?? metadata;
}

function consistentEvidenceIds(outer, nested, { required = true } = {}) {
  const topLevel = evidenceIds(outer, "Cockroach Browser outcome.evidenceIds");
  const metadata = nested === undefined
    ? []
    : evidenceIds(nested, "Cockroach Browser outcome.metadata.evidenceIds");
  if (topLevel.length > 0 && metadata.length > 0
    && canonicalStringify(topLevel) !== canonicalStringify(metadata)) {
    throw new TypeError("Cockroach Browser outcome evidenceIds fields disagree.");
  }
  const citations = topLevel.length > 0 ? topLevel : metadata;
  if (required && citations.length === 0) {
    throw new TypeError("Cockroach Browser outcomes must cite at least one evidence ID.");
  }
  return citations;
}

function validateMetadataFields(metadata) {
  const action = optionalMetadataEnum(metadata, "action", ACTIONS);
  const status = optionalMetadataEnum(metadata, "status", STATUSES);
  const receiptId = optionalMetadataString(metadata, "receiptId", 256);
  if (receiptId !== undefined) opaqueId(receiptId, "Cockroach Browser outcome.metadata.receiptId");
  const effect = optionalMetadataEnum(metadata, "effect", EFFECTS);
  const risk = optionalMetadataEnum(metadata, "risk", RISKS);
  if (action !== undefined && effect !== undefined && effect !== effectForAction(action)) {
    throw new TypeError("Cockroach Browser outcome.metadata.effect does not match action.");
  }
  if (action !== undefined && risk !== undefined && risk !== riskForAction(action)) {
    throw new TypeError("Cockroach Browser outcome.metadata.risk does not match action.");
  }
  const mode = optionalMetadataEnum(metadata, "mode", MODES);
  const completedAt = Object.hasOwn(metadata, "completedAt")
    ? canonicalIsoTimestamp(metadata.completedAt, "Cockroach Browser outcome.metadata.completedAt")
    : undefined;
  const policyDigest = hashField(
    metadata.policyDigest,
    "Cockroach Browser outcome.metadata.policyDigest",
    { optional: true }
  );
  return Object.freeze({
    ...(action === undefined ? {} : { action }),
    ...(status === undefined ? {} : { status }),
    ...(receiptId === undefined ? {} : { receiptId }),
    ...(effect === undefined ? {} : { effect }),
    ...(risk === undefined ? {} : { risk }),
    ...(mode === undefined ? {} : { mode }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(policyDigest === undefined ? {} : { policyDigest })
  });
}

function validateOutcome(value, { requireCitations }) {
  const outcome = snapshotRecordBoundary(value, {
    label: "Cockroach Browser outcome",
    keys: OUTCOME_KEYS,
    maximumDepth: 16,
    maximumNodes: 5_000,
    maximumArrayLength: 256,
    maximumObjectKeys: 128,
    maximumStringLength: 65_536,
    maximumBytes: 64 * 1024
  });
  for (const key of REQUIRED_OUTCOME_KEYS) {
    if (!Object.hasOwn(outcome, key)) throw new TypeError(`Cockroach Browser outcome is missing '${key}'.`);
  }
  if (outcome.schemaVersion !== COCKROACH_BROWSER_MEMORY_SCHEMA_VERSION) {
    throw new TypeError("Cockroach Browser outcome schemaVersion is unsupported.");
  }
  const type = stringField(outcome.type, "Cockroach Browser outcome.type", { maximumLength: 128 });
  if (!OUTCOME_TYPE_PATTERN.test(type)) {
    throw new TypeError("Cockroach Browser outcome.type is invalid.");
  }
  const sessionId = opaqueId(outcome.sessionId, "Cockroach Browser outcome.sessionId");
  const actor = outcome.actor === undefined
    ? undefined
    : stringField(outcome.actor, "Cockroach Browser outcome.actor", { maximumLength: 256 });
  const purpose = stringField(outcome.purpose, "Cockroach Browser outcome.purpose", { maximumLength: 4_096 });
  if (purpose.trim().length < 3) throw new TypeError("Cockroach Browser outcome.purpose must contain at least three non-whitespace characters.");
  const timestamp = canonicalIsoTimestamp(outcome.timestamp, "Cockroach Browser outcome.timestamp");
  if (!outcome.metadata || typeof outcome.metadata !== "object" || Array.isArray(outcome.metadata)) {
    throw new TypeError("Cockroach Browser outcome.metadata must be a JSON record.");
  }
  const metadataSnapshot = snapshotJsonBoundary(outcome.metadata, {
    label: "Cockroach Browser outcome.metadata",
    maximumDepth: 10,
    maximumNodes: 5_000,
    maximumArrayLength: 256,
    maximumObjectKeys: 128,
    maximumStringLength: 4_096,
    maximumBytes: 32 * 1024
  });
  const metadata = omitSecrets(metadataSnapshot);
  const normalizedMetadata = validateMetadataFields(metadata);
  const inputDigest = consistentHash(outcome.inputDigest, metadata.inputDigest, "inputDigest");
  const outputDigest = consistentHash(outcome.outputDigest, metadata.outputDigest, "outputDigest");
  const receiptHash = consistentHash(outcome.receiptHash, metadata.receiptHash, "receiptHash");
  const citations = consistentEvidenceIds(outcome.evidenceIds, metadata.evidenceIds, {
    required: requireCitations
  });
  return deepFreezeJson({
    schemaVersion: COCKROACH_BROWSER_MEMORY_SCHEMA_VERSION,
    type,
    sessionId,
    ...(actor === undefined ? {} : { actor: redactText(actor) }),
    purpose: redactText(purpose),
    timestamp,
    ...(inputDigest === undefined ? {} : { inputDigest }),
    ...(outputDigest === undefined ? {} : { outputDigest }),
    evidenceIds: [...citations],
    ...(receiptHash === undefined ? {} : { receiptHash }),
    metadata: {
      ...metadata,
      ...normalizedMetadata,
      ...(inputDigest === undefined ? {} : { inputDigest }),
      ...(outputDigest === undefined ? {} : { outputDigest }),
      evidenceIds: [...citations],
      ...(receiptHash === undefined ? {} : { receiptHash })
    }
  });
}

export function validateCockroachBrowserMemoryOutcome(value) {
  return validateOutcome(value, { requireCitations: true });
}

function uuidFromDigest(value) {
  const hex = sha256(value).slice(7, 39).split("");
  hex[12] = "4";
  hex[16] = "8";
  const id = hex.join("");
  return `evt_${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function privateTarget(prefix, value) {
  return `${prefix}sha256:${sha256(value).slice(7)}`;
}

function mappingOptions(options) {
  const normalized = snapshotRecordBoundary(options, {
    label: "Cockroach Browser outcome mapping options",
    keys: ["retentionClass"],
    maximumBytes: 256,
    maximumStringLength: 16
  });
  const retentionClass = normalized.retentionClass ?? "project";
  if (!["session", "project", "durable"].includes(retentionClass)) {
    throw new TypeError("Cockroach Browser outcome mapping retentionClass is invalid.");
  }
  return Object.freeze({ retentionClass });
}

function operationalMetadata(metadata) {
  const safe = Object.create(null);
  for (const key of ["action", "status", "receiptId", "effect", "risk", "mode", "completedAt", "policyDigest"]) {
    if (Object.hasOwn(metadata, key)) safe[key] = metadata[key];
  }
  return deepFreezeJson(safe);
}

export function cockroachBrowserMemoryOutcomeToEventInput(value, options = {}) {
  const outcome = validateCockroachBrowserMemoryOutcome(value);
  const { retentionClass } = mappingOptions(options);
  const logicalIdentity = canonicalStringify({
    schemaVersion: outcome.schemaVersion,
    type: outcome.type,
    sessionId: outcome.sessionId,
    position: outcome.receiptHash ?? outcome.timestamp
  });
  const eventId = uuidFromDigest(`cockroach-browser-outcome\0${logicalIdentity}`);
  const metadata = operationalMetadata(outcome.metadata);
  return deepFreezeJson({
    eventId,
    timestamp: outcome.timestamp,
    kind: "source",
    actor: { type: "source", id: "cockroach-browser" },
    title: `Cockroach Browser ${outcome.type} outcome`,
    body: "",
    data: {
      boundaryVersion: COCKROACH_BROWSER_MEMORY_SCHEMA_VERSION,
      capture: "metadata",
      contentOmitted: true,
      trust: "untrusted",
      browserAuthorityGranted: false,
      outcomeType: outcome.type,
      sessionDigest: sha256(outcome.sessionId),
      actor: contentSummary(outcome.actor),
      purpose: contentSummary(outcome.purpose),
      citationCount: outcome.evidenceIds.length,
      ...(outcome.inputDigest === undefined ? {} : { inputDigest: outcome.inputDigest }),
      ...(outcome.outputDigest === undefined ? {} : { outputDigest: outcome.outputDigest }),
      ...(outcome.receiptHash === undefined ? {} : { receiptHash: outcome.receiptHash }),
      metadata,
      unretainedMetadata: contentSummary(outcome.metadata)
    },
    confidence: "extracted",
    relations: outcome.evidenceIds.map((evidenceId) => ({
      type: "references",
      target: `cockroach-browser-evidence:${evidenceId}`
    })),
    provenance: {
      adapter: "cockroach-browser.metadata",
      sourceId: privateTarget("cockroach-browser-outcome:", logicalIdentity)
    },
    retention: { class: retentionClass, expiresAt: null }
  });
}

export async function appendCockroachBrowserOutcome(value, options = {}) {
  const locator = workspaceLocator(options, "Cockroach Browser outcome append options");
  const workspace = await loadTrustedInteropWorkspace(locator);
  const input = cockroachBrowserMemoryOutcomeToEventInput(value, {
    retentionClass: workspace.config.retentionClass
  });
  return appendEvent(reviewMetadataEventInput(input), {
    workspace,
    capture: "metadata",
    idempotent: true
  });
}

export function createCockroachBrowserMemorySink(options = {}) {
  const locator = workspaceLocator(options, "Cockroach Browser memory sink options");
  return Object.freeze({
    async appendBrowserOutcome(value) {
      const outcome = validateOutcome(value, { requireCitations: false });
      if (outcome.evidenceIds.length === 0) return;
      await appendCockroachBrowserOutcome(outcome, { cwd: locator.start });
    }
  });
}
