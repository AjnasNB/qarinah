import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";

export const TRUST_SCHEMA_VERSION = "qarinah.trust.v2";
export const CAPTURE_POLICY_SCHEMA_VERSION = "qarinah.capture-policy.v1";
const LEGACY_TRUST_SCHEMA_VERSION = "qarinah.trust.v1";
const REVOCATION_SCHEMA_VERSION = "qarinah.revocation.v1";
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const WORKSPACE_ID_PATTERN = /^ws_[0-9a-f]{32}$/;
const MAX_TRUST_BYTES = 32 * 1024;
const MACHINE_JSON_READ_ATTEMPTS = 20;
const POLICY_FIELDS = Object.freeze([
  "enabled",
  "capture",
  "maxEventBytes",
  "maxLogBytes",
  "contextMaxChars",
  "retentionClass"
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizedRoot(root) {
  const resolved = path.resolve(root);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function stateRoot() {
  if (process.env.QARINAH_STATE_DIR) return path.resolve(process.env.QARINAH_STATE_DIR);
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Qarinah");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Qarinah");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "qarinah");
}

function workspaceDigest(root) {
  return createHash("sha256").update(normalizedRoot(root)).digest("hex");
}

function trustPath(root) {
  const digest = workspaceDigest(root);
  return path.join(stateRoot(), "trusted-workspaces", `${digest}.json`);
}

function revocationPath(root) {
  return path.join(stateRoot(), "revoked-workspaces", `${workspaceDigest(root)}.json`);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function atomicWrite(destination, contents) {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryMetadata = await lstat(directory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new QarinahError("TRUST_INVALID", "The machine-local trust directory must be a real directory.");
  }
  const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, destination);
        break;
      } catch (error) {
        if (attempt >= 19 || !["EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
        await delay(5 + attempt * 5);
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function validateCheckpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QarinahError("TRUST_INVALID", "Trust checkpoint is invalid.");
  const keys = Object.keys(value);
  if (keys.some((key) => !["eventCount", "headHash", "logBytes", "eventIdIndexHash", "updatedAt"].includes(key))) {
    throw new QarinahError("TRUST_INVALID", "Trust checkpoint contains unknown fields.");
  }
  if (!Number.isSafeInteger(value.eventCount) || value.eventCount < 0) throw new QarinahError("TRUST_INVALID", "Trust eventCount is invalid.");
  if (!Number.isSafeInteger(value.logBytes) || value.logBytes < 0) throw new QarinahError("TRUST_INVALID", "Trust logBytes is invalid.");
  if (value.headHash !== null && !HASH_PATTERN.test(value.headHash)) throw new QarinahError("TRUST_INVALID", "Trust headHash is invalid.");
  const eventIdIndexHash = value.eventIdIndexHash ?? null;
  if (eventIdIndexHash !== null && !HASH_PATTERN.test(eventIdIndexHash)) {
    throw new QarinahError("TRUST_INVALID", "Trust eventIdIndexHash is invalid.");
  }
  if ((value.eventCount === 0) !== (value.headHash === null)) throw new QarinahError("TRUST_INVALID", "Trust checkpoint head/count disagree.");
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new QarinahError("TRUST_INVALID", "Trust checkpoint timestamp is invalid.");
  }
  return Object.freeze({
    eventCount: value.eventCount,
    headHash: value.headHash,
    logBytes: value.logBytes,
    eventIdIndexHash,
    updatedAt: new Date(value.updatedAt).toISOString()
  });
}

function validatePolicyValues(value) {
  if (typeof value.enabled !== "boolean") throw new QarinahError("TRUST_INVALID", "Trust enabled policy is invalid.");
  if (!["metadata", "content"].includes(value.capture)) throw new QarinahError("TRUST_INVALID", "Trust capture policy is invalid.");
  for (const [key, minimum, maximum] of [
    ["maxEventBytes", 4_096, 1_048_576],
    ["maxLogBytes", 1_048_576, 1_073_741_824],
    ["contextMaxChars", 512, 1_000_000]
  ]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) {
      throw new QarinahError("TRUST_INVALID", `Trust ${key} policy is invalid.`);
    }
  }
  if (!["session", "project", "durable"].includes(value.retentionClass)) {
    throw new QarinahError("TRUST_INVALID", "Trust retention policy is invalid.");
  }
}

function capturePolicy(root, config) {
  return Object.freeze({
    schemaVersion: CAPTURE_POLICY_SCHEMA_VERSION,
    root,
    workspaceId: config.workspaceId,
    enabled: config.enabled,
    capture: config.capture,
    maxEventBytes: config.maxEventBytes,
    maxLogBytes: config.maxLogBytes,
    contextMaxChars: config.contextMaxChars,
    retentionClass: config.retentionClass
  });
}

export function describeCapturePolicy(root, config) {
  const policy = capturePolicy(root, config);
  return Object.freeze({ ...policy, policyHash: sha256(policy) });
}

function policyDigest(root, config) {
  return describeCapturePolicy(root, config).policyHash;
}

function policyMismatch(record, config, { ignoreEnabled = false } = {}) {
  return POLICY_FIELDS.some((field) => (!ignoreEnabled || field !== "enabled") && record[field] !== config[field]);
}

function validateTrustRecord(value, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QarinahError("TRUST_INVALID", "Workspace trust record is invalid.");
  if (value.schemaVersion === LEGACY_TRUST_SCHEMA_VERSION) {
    throw new QarinahError(
      "TRUST_REVIEW_REQUIRED",
      "This workspace uses a legacy trust record. Run `qarinah policy`, review the exact policy digest, then run `qarinah trust --capture <mode> --policy-hash <digest>`."
    );
  }
  const allowed = [
    "schemaVersion", "root", "workspaceId", ...POLICY_FIELDS, "policyHash", "grantedAt", "checkpoint"
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new QarinahError("TRUST_INVALID", "Workspace trust record contains unknown fields.");
  if (value.schemaVersion !== TRUST_SCHEMA_VERSION) throw new QarinahError("TRUST_INVALID", "Workspace trust schema is unsupported.");
  if (typeof value.root !== "string" || value.root !== path.resolve(value.root) || value.root !== root) {
    throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Trust record belongs to a different real path.");
  }
  if (!WORKSPACE_ID_PATTERN.test(value.workspaceId)) throw new QarinahError("TRUST_INVALID", "Trust workspace id is invalid.");
  validatePolicyValues(value);
  if (!HASH_PATTERN.test(value.policyHash) || value.policyHash !== policyDigest(root, value)) {
    throw new QarinahError("TRUST_INVALID", "Workspace trust policy digest is invalid.");
  }
  if (typeof value.grantedAt !== "string" || !Number.isFinite(Date.parse(value.grantedAt))) {
    throw new QarinahError("TRUST_INVALID", "Workspace trust timestamp is invalid.");
  }
  return Object.freeze({
    schemaVersion: TRUST_SCHEMA_VERSION,
    root,
    workspaceId: value.workspaceId,
    enabled: value.enabled,
    capture: value.capture,
    maxEventBytes: value.maxEventBytes,
    maxLogBytes: value.maxLogBytes,
    contextMaxChars: value.contextMaxChars,
    retentionClass: value.retentionClass,
    policyHash: value.policyHash,
    grantedAt: new Date(value.grantedAt).toISOString(),
    checkpoint: validateCheckpoint(value.checkpoint)
  });
}

function validateLegacyTrustRecord(value, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QarinahError("TRUST_INVALID", "Legacy workspace trust record is invalid.");
  }
  const allowed = ["schemaVersion", "root", "workspaceId", "capture", "grantedAt", "checkpoint"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new QarinahError("TRUST_INVALID", "Legacy workspace trust record contains unknown fields.");
  }
  if (value.schemaVersion !== LEGACY_TRUST_SCHEMA_VERSION) {
    throw new QarinahError("TRUST_INVALID", "Legacy workspace trust schema is unsupported.");
  }
  if (typeof value.root !== "string" || normalizedRoot(value.root) !== normalizedRoot(root)) {
    throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Legacy trust record belongs to a different real path.");
  }
  if (!WORKSPACE_ID_PATTERN.test(value.workspaceId)) {
    throw new QarinahError("TRUST_INVALID", "Legacy trust workspace id is invalid.");
  }
  if (!["metadata", "content"].includes(value.capture)) {
    throw new QarinahError("TRUST_INVALID", "Legacy trust capture policy is invalid.");
  }
  if (typeof value.grantedAt !== "string" || !Number.isFinite(Date.parse(value.grantedAt))) {
    throw new QarinahError("TRUST_INVALID", "Legacy workspace trust timestamp is invalid.");
  }
  return Object.freeze({
    schemaVersion: LEGACY_TRUST_SCHEMA_VERSION,
    root,
    workspaceId: value.workspaceId,
    capture: value.capture,
    grantedAt: new Date(value.grantedAt).toISOString(),
    checkpoint: validateCheckpoint(value.checkpoint)
  });
}

function validateTrust(value, root, config) {
  const record = validateTrustRecord(value, root);
  if (record.workspaceId !== config.workspaceId) {
    throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Trust record belongs to a different workspace id.");
  }
  if (policyMismatch(record, config) || record.policyHash !== policyDigest(root, config)) {
    throw new QarinahError(
      "CAPTURE_NOT_APPROVED",
      "The portable workspace policy differs from this machine's approved capture permit. Run `qarinah policy`, review the exact policy digest, then re-trust that digest explicitly."
    );
  }
  return record;
}

async function canonicalRealRoot(root) {
  return realpath(path.resolve(root));
}

class MachineJsonReadRaceError extends Error {}

async function readBoundedMachineJsonOnce(candidate, maximumBytes, label) {
  const flags = constants.O_RDONLY | (Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0);
  const handle = await open(candidate, flags);
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(candidate, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n
      || named.isSymbolicLink() || !named.isFile() || named.nlink !== 1n) {
      throw new QarinahError("TRUST_INVALID", `${label} must be a singly linked regular file.`);
    }
    if (opened.dev !== named.dev || opened.ino !== named.ino) {
      throw new MachineJsonReadRaceError();
    }
    if (opened.size > BigInt(maximumBytes)) {
      throw new QarinahError("TRUST_INVALID", `${label} exceeds its size limit.`);
    }
    const actualDirectory = await realpath(path.dirname(candidate));
    const actual = await realpath(candidate);
    if (!isWithin(actualDirectory, actual)) {
      throw new QarinahError("TRUST_INVALID", `${label} resolves outside its machine-local state directory.`);
    }
    const contents = await handle.readFile();
    if (contents.length !== Number(opened.size)) {
      throw new QarinahError("TRUST_INVALID", `${label} changed while it was being read.`);
    }
    return JSON.parse(contents.toString("utf8"));
  } finally {
    await handle.close();
  }
}

async function readBoundedMachineJson(candidate, maximumBytes, label) {
  for (let attempt = 0; attempt < MACHINE_JSON_READ_ATTEMPTS; attempt += 1) {
    try {
      return await readBoundedMachineJsonOnce(candidate, maximumBytes, label);
    } catch (error) {
      if (!(error instanceof MachineJsonReadRaceError)) throw error;
      if (attempt === MACHINE_JSON_READ_ATTEMPTS - 1) {
        throw new QarinahError("TRUST_INVALID", `${label} kept changing while it was being opened.`);
      }
      // A checkpoint update atomically replaces the trust record. A reader may
      // therefore open the prior inode immediately before the rename. Retry the
      // complete no-follow, inode, link-count, realpath, size, and JSON checks;
      // no bytes from the raced file are accepted.
      await delay(2 + attempt);
    }
  }
  throw new QarinahError("TRUST_INVALID", `${label} could not be read safely.`);
}

async function readTrustFile(root) {
  const candidate = trustPath(root);
  try {
    return await readBoundedMachineJson(candidate, MAX_TRUST_BYTES, "Workspace trust record");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new QarinahError("WORKSPACE_NOT_TRUSTED", "This machine has not approved capture for this workspace. Run `qarinah policy`, review the exact policy digest, then trust that digest explicitly.");
    }
    if (error instanceof QarinahError) throw error;
    throw new QarinahError("TRUST_INVALID", "Workspace trust record is not valid JSON.", { cause: error.message });
  }
}

async function readRevocation(root) {
  let value;
  try {
    value = await readBoundedMachineJson(revocationPath(root), MAX_TRUST_BYTES, "Workspace revocation record");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof QarinahError) throw error;
    throw new QarinahError("TRUST_INVALID", "Workspace revocation record is not valid JSON.", { cause: error.message });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["schemaVersion", "root", "workspaceId", "checkpoint", "revokedAt"].includes(key))
    || value.schemaVersion !== REVOCATION_SCHEMA_VERSION
    || value.root !== root
    || (value.workspaceId !== null && !WORKSPACE_ID_PATTERN.test(value.workspaceId))
    || (value.checkpoint !== undefined && value.checkpoint !== null
      && (typeof value.checkpoint !== "object" || Array.isArray(value.checkpoint)))
    || typeof value.revokedAt !== "string"
    || !Number.isFinite(Date.parse(value.revokedAt))) {
    throw new QarinahError("TRUST_INVALID", "Workspace revocation record is invalid.");
  }
  return Object.freeze({
    schemaVersion: REVOCATION_SCHEMA_VERSION,
    root,
    workspaceId: value.workspaceId,
    checkpoint: value.checkpoint == null ? null : validateCheckpoint(value.checkpoint),
    revokedAt: new Date(value.revokedAt).toISOString()
  });
}

async function assertNotRevoked(root) {
  const revocation = await readRevocation(root);
  if (revocation !== null) {
    throw new QarinahError(
      "WORKSPACE_NOT_TRUSTED",
      "Capture permission was revoked on this machine. Review `qarinah policy` and issue a new exact trust grant to resume."
    );
  }
}

function createTrustRecord(root, config, checkpoint = {}, grantedAt = new Date().toISOString()) {
  const now = new Date().toISOString();
  const policy = capturePolicy(root, config);
  return validateTrustRecord({
    schemaVersion: TRUST_SCHEMA_VERSION,
    root,
    workspaceId: config.workspaceId,
    enabled: policy.enabled,
    capture: policy.capture,
    maxEventBytes: policy.maxEventBytes,
    maxLogBytes: policy.maxLogBytes,
    contextMaxChars: policy.contextMaxChars,
    retentionClass: policy.retentionClass,
    policyHash: sha256(policy),
    grantedAt,
    checkpoint: {
      eventCount: checkpoint.eventCount ?? 0,
      headHash: checkpoint.headHash ?? null,
      logBytes: checkpoint.logBytes ?? 0,
      eventIdIndexHash: checkpoint.eventIdIndexHash ?? null,
      updatedAt: checkpoint.updatedAt ?? now
    }
  }, root);
}

async function writeTrustRecord(root, record) {
  await assertNotRevoked(root);
  await atomicWrite(trustPath(root), `${JSON.stringify(record, null, 2)}\n`);
  await assertNotRevoked(root);
  return record;
}

export async function grantWorkspaceConsent(root, config, checkpoint = {}) {
  const actualRoot = await canonicalRealRoot(root);
  // A new grant is the only operation allowed to clear a prior machine-local
  // revocation. Clearing first means a concurrent revoke always wins.
  await rm(revocationPath(actualRoot), { force: true });
  const record = createTrustRecord(actualRoot, config, checkpoint);
  return writeTrustRecord(actualRoot, record);
}

export async function readWorkspaceConsent(root, config) {
  const actualRoot = await canonicalRealRoot(root);
  await assertNotRevoked(actualRoot);
  const consent = validateTrust(await readTrustFile(actualRoot), actualRoot, config);
  await assertNotRevoked(actualRoot);
  return consent;
}

export async function readWorkspaceTrustForReview(root, workspaceId) {
  const actualRoot = await canonicalRealRoot(root);
  const revocation = await readRevocation(actualRoot);
  if (revocation !== null) {
    if (revocation.workspaceId !== null && revocation.workspaceId !== workspaceId) {
      throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Revocation record belongs to a different workspace id.");
    }
    return revocation.checkpoint === null
      ? null
      : Object.freeze({
          schemaVersion: REVOCATION_SCHEMA_VERSION,
          root: actualRoot,
          workspaceId,
          checkpoint: revocation.checkpoint
        });
  }
  let value;
  try {
    value = await readTrustFile(actualRoot);
  } catch (error) {
    if (error?.code === "WORKSPACE_NOT_TRUSTED") return null;
    throw error;
  }
  const record = value.schemaVersion === LEGACY_TRUST_SCHEMA_VERSION
    ? validateLegacyTrustRecord(value, actualRoot)
    : validateTrustRecord(value, actualRoot);
  if (record.workspaceId !== workspaceId) {
    throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Trust record belongs to a different workspace id.");
  }
  return record;
}

export async function updateWorkspaceCheckpoint(workspace, checkpoint) {
  const consent = await readWorkspaceConsent(workspace.root, workspace.config);
  const next = createTrustRecord(
    consent.root,
    workspace.config,
    { ...checkpoint, updatedAt: new Date().toISOString() },
    consent.grantedAt
  );
  await writeTrustRecord(consent.root, next);
  return next;
}

export async function updateWorkspaceEnabledConsent(root, config, enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean.");
  const actualRoot = await canonicalRealRoot(root);
  const consent = validateTrustRecord(await readTrustFile(actualRoot), actualRoot);
  if (consent.workspaceId !== config.workspaceId) {
    throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Trust record belongs to a different workspace id.");
  }
  if (policyMismatch(consent, config, { ignoreEnabled: true })) {
    throw new QarinahError(
      "CAPTURE_NOT_APPROVED",
      "Only enabled state may change without a full policy review. Run `qarinah policy`, review the exact policy digest, then re-trust that digest explicitly."
    );
  }
  const nextConfig = { ...config, enabled };
  const next = createTrustRecord(actualRoot, nextConfig, consent.checkpoint);
  await writeTrustRecord(actualRoot, next);
  return next;
}

export async function revokeWorkspaceConsent(root) {
  const actualRoot = await canonicalRealRoot(root);
  let previousRevocation = null;
  try {
    previousRevocation = await readRevocation(actualRoot);
  } catch {
    // A malformed prior tombstone still cannot prevent a fresh revocation.
  }
  let workspaceId = previousRevocation?.workspaceId ?? null;
  let checkpoint = previousRevocation?.checkpoint ?? null;
  try {
    const value = await readTrustFile(actualRoot);
    const consent = value.schemaVersion === LEGACY_TRUST_SCHEMA_VERSION
      ? validateLegacyTrustRecord(value, actualRoot)
      : validateTrustRecord(value, actualRoot);
    workspaceId = consent.workspaceId;
    checkpoint = consent.checkpoint;
  } catch {
    // Revocation is deliberately independent of trust-record validity.
  }
  const record = {
    schemaVersion: REVOCATION_SCHEMA_VERSION,
    root: actualRoot,
    workspaceId,
    checkpoint,
    revokedAt: new Date().toISOString()
  };
  await atomicWrite(revocationPath(actualRoot), `${JSON.stringify(record, null, 2)}\n`);
  await rm(trustPath(actualRoot), { force: true });
  return Object.freeze(record);
}
