import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { QarinahError } from "./errors.js";

export const TRUST_SCHEMA_VERSION = "qarinah.trust.v1";
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_TRUST_BYTES = 32 * 1024;

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

function trustPath(root) {
  const digest = createHash("sha256").update(normalizedRoot(root)).digest("hex");
  return path.join(stateRoot(), "trusted-workspaces", `${digest}.json`);
}

async function exists(candidate) {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(destination, contents) {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
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
  if (keys.some((key) => !["eventCount", "headHash", "logBytes", "updatedAt"].includes(key))) {
    throw new QarinahError("TRUST_INVALID", "Trust checkpoint contains unknown fields.");
  }
  if (!Number.isSafeInteger(value.eventCount) || value.eventCount < 0) throw new QarinahError("TRUST_INVALID", "Trust eventCount is invalid.");
  if (!Number.isSafeInteger(value.logBytes) || value.logBytes < 0) throw new QarinahError("TRUST_INVALID", "Trust logBytes is invalid.");
  if (value.headHash !== null && !HASH_PATTERN.test(value.headHash)) throw new QarinahError("TRUST_INVALID", "Trust headHash is invalid.");
  if ((value.eventCount === 0) !== (value.headHash === null)) throw new QarinahError("TRUST_INVALID", "Trust checkpoint head/count disagree.");
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new QarinahError("TRUST_INVALID", "Trust checkpoint timestamp is invalid.");
  }
  return Object.freeze({
    eventCount: value.eventCount,
    headHash: value.headHash,
    logBytes: value.logBytes,
    updatedAt: new Date(value.updatedAt).toISOString()
  });
}

function validateTrust(value, root, config) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QarinahError("TRUST_INVALID", "Workspace trust record is invalid.");
  const allowed = ["schemaVersion", "root", "workspaceId", "capture", "grantedAt", "checkpoint"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new QarinahError("TRUST_INVALID", "Workspace trust record contains unknown fields.");
  if (value.schemaVersion !== TRUST_SCHEMA_VERSION) throw new QarinahError("TRUST_INVALID", "Workspace trust schema is unsupported.");
  if (normalizedRoot(value.root) !== normalizedRoot(root)) throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Trust record belongs to a different path.");
  if (value.workspaceId !== config.workspaceId) throw new QarinahError("WORKSPACE_NOT_TRUSTED", "Trust record belongs to a different workspace id.");
  if (value.capture !== config.capture) {
    throw new QarinahError("CAPTURE_NOT_APPROVED", `This machine approved '${value.capture}' capture, but the workspace requests '${config.capture}'.`);
  }
  if (typeof value.grantedAt !== "string" || !Number.isFinite(Date.parse(value.grantedAt))) {
    throw new QarinahError("TRUST_INVALID", "Workspace trust timestamp is invalid.");
  }
  return Object.freeze({
    schemaVersion: TRUST_SCHEMA_VERSION,
    root: path.resolve(root),
    workspaceId: value.workspaceId,
    capture: value.capture,
    grantedAt: new Date(value.grantedAt).toISOString(),
    checkpoint: validateCheckpoint(value.checkpoint)
  });
}

export async function grantWorkspaceConsent(root, config, checkpoint = {}) {
  const now = new Date().toISOString();
  const record = {
    schemaVersion: TRUST_SCHEMA_VERSION,
    root: path.resolve(root),
    workspaceId: config.workspaceId,
    capture: config.capture,
    grantedAt: now,
    checkpoint: {
      eventCount: checkpoint.eventCount ?? 0,
      headHash: checkpoint.headHash ?? null,
      logBytes: checkpoint.logBytes ?? 0,
      updatedAt: checkpoint.updatedAt ?? now
    }
  };
  const validated = validateTrust(record, root, config);
  await atomicWrite(trustPath(root), `${JSON.stringify(validated, null, 2)}\n`);
  return validated;
}

export async function readWorkspaceConsent(root, config) {
  const candidate = trustPath(root);
  if (!(await exists(candidate))) {
    throw new QarinahError("WORKSPACE_NOT_TRUSTED", "This machine has not approved Qarinah capture for this workspace. Run `qarinah trust --capture <mode>` after review.");
  }
  const metadata = await stat(candidate);
  if (!metadata.isFile() || metadata.size > MAX_TRUST_BYTES) throw new QarinahError("TRUST_INVALID", "Workspace trust record is not a bounded regular file.");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(candidate, "utf8"));
  } catch (error) {
    throw new QarinahError("TRUST_INVALID", "Workspace trust record is not valid JSON.", { cause: error.message });
  }
  return validateTrust(parsed, root, config);
}

export async function updateWorkspaceCheckpoint(workspace, checkpoint) {
  const consent = await readWorkspaceConsent(workspace.root, workspace.config);
  const next = validateTrust({ ...consent, checkpoint: { ...checkpoint, updatedAt: new Date().toISOString() } }, workspace.root, workspace.config);
  await atomicWrite(trustPath(workspace.root), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function revokeWorkspaceConsent(root) {
  await rm(trustPath(root), { force: true });
}
