import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { sanitizeJsonValue } from "./canonical.js";
import {
  grantWorkspaceConsent,
  readWorkspaceConsent,
  revokeWorkspaceConsent,
  updateWorkspaceEnabledConsent
} from "./consent.js";
import { QarinahError } from "./errors.js";
import { inspectGitWorktree } from "./git-worktrees.js";

export const CONFIG_SCHEMA_VERSION = "qarinah.config.v1";
const CONFIG_KEYS = new Set([
  "schemaVersion", "workspaceId", "enabled", "capture", "maxEventBytes", "maxLogBytes",
  "contextMaxChars", "retentionClass", "createdAt"
]);
const STORAGE_DIRECTORIES = Object.freeze(["events", "objects", "records", "graph", "index", "snapshots", "locks", "dashboard", "receipts"]);
const MAX_CONFIG_BYTES = 64 * 1024;

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveWithin(root, ...segments) {
  const candidate = path.resolve(root, ...segments);
  if (!isWithin(path.resolve(root), candidate)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "Resolved path escapes the Context Ledger workspace.", { candidate });
  }
  return candidate;
}

async function exists(candidate) {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function safeLstat(candidate, label, { allowMissing = false } = {}) {
  let metadata;
  try {
    metadata = await lstat(candidate);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw error;
  }
  if (metadata.isSymbolicLink()) throw new QarinahError("STORAGE_LINK_REJECTED", `${label} cannot be a symbolic link or junction.`);
  return metadata;
}

async function ensureSafeDirectory(candidate, root, label) {
  const existing = await safeLstat(candidate, label, { allowMissing: true });
  if (!existing) {
    try {
      await mkdir(candidate, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  const current = await safeLstat(candidate, label);
  if (!current.isDirectory()) throw new QarinahError("WORKSPACE_INVALID", `${label} must be a directory.`);
  const actual = await realpath(candidate);
  if (!isWithin(root, actual)) throw new QarinahError("PATH_OUTSIDE_WORKSPACE", `${label} resolves outside the workspace root.`);
  return actual;
}

async function acquireInitializationLock(qarinahDir, signal) {
  const locksDirectory = resolveWithin(qarinahDir, "locks");
  await ensureSafeDirectory(locksDirectory, qarinahDir, ".qarinah/locks");
  const lockPath = resolveWithin(locksDirectory, "initialize");
  const startedAt = Date.now();
  for (;;) {
    if (signal?.aborted) throw signal.reason ?? new QarinahError("OPERATION_ABORTED", "Workspace initialization was aborted.");
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return async () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const metadata = await safeLstat(lockPath, ".qarinah/locks/initialize", { allowMissing: true });
      if (metadata && !metadata.isDirectory()) {
        throw new QarinahError("WORKSPACE_INVALID", ".qarinah/locks/initialize must be a directory.");
      }
      if (Date.now() - startedAt >= 15_000) {
        throw new QarinahError("WORKSPACE_INITIALIZE_BUSY", "Another process is still initializing this Qarinah workspace.");
      }
      await new Promise((resolve, reject) => {
        const finish = () => {
          if (signal) signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason ?? new QarinahError("OPERATION_ABORTED", "Workspace initialization was aborted."));
        };
        const timer = setTimeout(finish, 10);
        if (signal) signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
}

export async function atomicWriteFile(destination, contents, options = {}) {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(contents, "utf8");
      if (options.sync !== false) await handle.sync();
    } finally {
      await handle.close();
    }
    if (typeof options.afterWrite === "function") await options.afterWrite();
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, destination);
        break;
      } catch (error) {
        if (attempt >= 19 || !["EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5 + attempt * 5));
      }
    }
    if (typeof options.afterRename === "function") await options.afterRename();
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function secureStoragePath(workspace, segments, options = {}) {
  if (!Array.isArray(segments) || segments.length === 0 || segments.some((segment) => typeof segment !== "string" || segment === "")) {
    throw new TypeError("segments must be a non-empty array of path components.");
  }
  const candidate = resolveWithin(workspace.qarinahDir, ...segments);
  let current = workspace.qarinahDir;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const final = index === segments.length - 1;
    const metadata = await safeLstat(current, `.qarinah/${segments.slice(0, index + 1).join("/")}`, {
      allowMissing: final && options.allowMissing === true
    });
    if (!metadata) return candidate;
    if (!final && !metadata.isDirectory()) {
      throw new QarinahError("WORKSPACE_INVALID", `.qarinah/${segments.slice(0, index + 1).join("/")} must be a directory.`);
    }
    if (final && options.type === "directory" && !metadata.isDirectory()) {
      throw new QarinahError("WORKSPACE_INVALID", `.qarinah/${segments.join("/")} must be a directory.`);
    }
    if (final && options.type === "file" && !metadata.isFile()) {
      throw new QarinahError("WORKSPACE_INVALID", `.qarinah/${segments.join("/")} must be a regular file.`);
    }
    if (final && options.type === "file" && metadata.nlink !== 1) {
      throw new QarinahError("STORAGE_LINK_REJECTED", `.qarinah/${segments.join("/")} cannot have multiple filesystem links.`);
    }
    const actual = await realpath(current);
    if (!isWithin(workspace.qarinahDir, actual)) {
      throw new QarinahError("PATH_OUTSIDE_WORKSPACE", `.qarinah/${segments.slice(0, index + 1).join("/")} resolves outside the workspace.`);
    }
  }
  return candidate;
}

async function verifyOpenedStorageFile(workspace, segments, candidate, handle) {
  const label = `.qarinah/${segments.join("/")}`;
  const opened = await handle.stat({ bigint: true });
  if (!opened.isFile() || opened.nlink !== 1n) {
    throw new QarinahError("STORAGE_LINK_REJECTED", `${label} is not a singly linked regular file.`);
  }
  const named = await lstat(candidate, { bigint: true });
  if (named.isSymbolicLink() || !named.isFile() || named.nlink !== 1n) {
    throw new QarinahError("STORAGE_LINK_REJECTED", `${label} changed to a linked or non-regular file.`);
  }
  if (opened.dev !== named.dev || opened.ino !== named.ino) {
    throw new QarinahError("STORAGE_RACE_DETECTED", `${label} changed while it was being opened.`);
  }
  const actual = await realpath(candidate);
  if (!isWithin(workspace.qarinahDir, actual)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", `${label} resolves outside the workspace.`);
  }
  if (opened.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new QarinahError("STORAGE_LIMIT_EXCEEDED", `${label} is too large to read safely.`);
  }
  return Object.freeze({ size: Number(opened.size), dev: opened.dev, ino: opened.ino });
}

export async function openSecureReadFile(workspace, segments) {
  const candidate = await secureStoragePath(workspace, segments, { type: "file" });
  const flags = constants.O_RDONLY | (Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0);
  const handle = await open(candidate, flags);
  try {
    const metadata = await verifyOpenedStorageFile(workspace, segments, candidate, handle);
    return Object.freeze({ handle, metadata });
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function openSecureAppendFile(workspace, segments) {
  const candidate = await secureStoragePath(workspace, segments, { type: "file" });
  const flags = constants.O_RDWR | constants.O_APPEND
    | (Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0);
  const handle = await open(candidate, flags, 0o600);
  try {
    const metadata = await verifyOpenedStorageFile(workspace, segments, candidate, handle);
    return Object.freeze({ handle, metadata });
  } catch (error) {
    await handle.close();
    throw error;
  }
}

function validateConfig(raw) {
  const config = sanitizeJsonValue(raw, { label: "Context Ledger config", maximumDepth: 4, maximumNodes: 100 });
  const unknown = Object.keys(config).filter((key) => !CONFIG_KEYS.has(key));
  if (unknown.length) throw new QarinahError("CONFIG_INVALID", `Unknown config field(s): ${unknown.join(", ")}.`);
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) throw new QarinahError("CONFIG_INVALID", "Unsupported config schemaVersion.");
  if (!/^ws_[0-9a-f]{32}$/.test(config.workspaceId)) throw new QarinahError("CONFIG_INVALID", "Invalid workspaceId.");
  if (typeof config.enabled !== "boolean") throw new QarinahError("CONFIG_INVALID", "enabled must be a boolean.");
  if (!["metadata", "content"].includes(config.capture)) throw new QarinahError("CONFIG_INVALID", "capture must be metadata or content.");
  for (const [key, minimum, maximum] of [
    ["maxEventBytes", 4_096, 1_048_576],
    ["maxLogBytes", 1_048_576, 1_073_741_824],
    ["contextMaxChars", 512, 1_000_000]
  ]) {
    if (!Number.isSafeInteger(config[key]) || config[key] < minimum || config[key] > maximum) {
      throw new QarinahError("CONFIG_INVALID", `${key} must be an integer from ${minimum} to ${maximum}.`);
    }
  }
  if (!["session", "project", "durable"].includes(config.retentionClass)) {
    throw new QarinahError("CONFIG_INVALID", "retentionClass is invalid.");
  }
  if (typeof config.createdAt !== "string" || !Number.isFinite(Date.parse(config.createdAt))) {
    throw new QarinahError("CONFIG_INVALID", "createdAt must be a timestamp.");
  }
  return Object.freeze({ ...config });
}

export async function initializeWorkspace(target = process.cwd(), options = {}) {
  const requestedRoot = path.resolve(target);
  await mkdir(requestedRoot, { recursive: true });
  const root = await realpath(requestedRoot);
  const requestedQarinahDir = resolveWithin(root, ".qarinah");
  const qarinahDir = await ensureSafeDirectory(requestedQarinahDir, root, ".qarinah");
  const release = await acquireInitializationLock(qarinahDir, options.signal);
  try {
    const configPath = resolveWithin(qarinahDir, "config.json");
    const existingConfig = await safeLstat(configPath, ".qarinah/config.json", { allowMissing: true });
    if (existingConfig) {
      if (options.ifNeeded !== true) {
        throw new QarinahError("WORKSPACE_EXISTS", `Context Ledger is already initialized at ${root}.`);
      }
      const workspace = await loadWorkspace(root);
      if (options.capture !== undefined && workspace.config.capture !== options.capture) {
        throw new QarinahError("CAPTURE_MODE_MISMATCH", `The existing workspace uses '${workspace.config.capture}' capture, not '${options.capture}'.`);
      }
      return workspace;
    }
    const capture = options.capture ?? "metadata";
    if (!["metadata", "content"].includes(capture)) throw new QarinahError("CONFIG_INVALID", "capture must be metadata or content.");
    for (const directory of STORAGE_DIRECTORIES) {
      await ensureSafeDirectory(resolveWithin(qarinahDir, directory), qarinahDir, `.qarinah/${directory}`);
    }
    const eventPath = resolveWithin(qarinahDir, "events", "events.jsonl");
    const existingEvent = await safeLstat(eventPath, ".qarinah/events/events.jsonl", { allowMissing: true });
    if (existingEvent && (!existingEvent.isFile() || existingEvent.nlink !== 1 || existingEvent.size !== 0)) {
      throw new QarinahError("WORKSPACE_PARTIAL", "Refusing to overwrite a non-empty or linked event log without a workspace config.");
    }
    await safeLstat(resolveWithin(qarinahDir, ".gitignore"), ".qarinah/.gitignore", { allowMissing: true });
    const config = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      workspaceId: `ws_${randomBytes(16).toString("hex")}`,
      enabled: true,
      capture,
      maxEventBytes: 1024 * 1024,
      maxLogBytes: 32 * 1024 * 1024,
      contextMaxChars: 12_000,
      retentionClass: "project",
      createdAt: new Date().toISOString()
    };
    await atomicWriteFile(resolveWithin(qarinahDir, ".gitignore"), [
      "events/", "objects/", "records/", "graph/", "index/", "snapshots/", "locks/", "dashboard/", "receipts/", "",
      "!.gitignore", "!config.json", ""
    ].join("\n"));
    if (!existingEvent) await atomicWriteFile(eventPath, "");
    await grantWorkspaceConsent(root, config, { eventCount: 0, headHash: null, logBytes: 0 });
    await atomicWriteFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const workspace = await loadWorkspace(root);
    const { rebuildDerivedState } = await import("./indexer.js");
    await rebuildDerivedState(root);
    return workspace;
  } finally {
    await release();
  }
}

export async function findWorkspaceRoot(start = process.cwd()) {
  let current;
  try {
    current = await realpath(path.resolve(start));
  } catch {
    return null;
  }
  for (let depth = 0; depth < 64; depth += 1) {
    const configPath = path.join(current, ".qarinah", "config.json");
    if (await exists(configPath)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

export async function loadWorkspace(start = process.cwd(), options = {}) {
  const root = await findWorkspaceRoot(start);
  if (!root) throw new QarinahError("WORKSPACE_NOT_INITIALIZED", "No enabled Context Ledger workspace was found. Run `qarinah init` first.");
  const actualRoot = await realpath(root);
  const requestedQarinahDir = resolveWithin(actualRoot, ".qarinah");
  const qarinahLinkStat = await safeLstat(requestedQarinahDir, ".qarinah");
  if (!qarinahLinkStat.isDirectory()) throw new QarinahError("WORKSPACE_INVALID", ".qarinah must be a directory.");
  const qarinahDir = await realpath(requestedQarinahDir);
  if (!isWithin(actualRoot, qarinahDir)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", ".qarinah resolves outside the workspace root.", { qarinahDir });
  }
  const configPath = resolveWithin(qarinahDir, "config.json");
  const configRead = await openSecureReadFile({ qarinahDir }, ["config.json"]);
  if (configRead.metadata.size > MAX_CONFIG_BYTES) {
    await configRead.handle.close();
    throw new QarinahError("CONFIG_INVALID", "Context Ledger config exceeds the size limit.");
  }
  let configRaw;
  try {
    const contents = await configRead.handle.readFile();
    if (contents.length !== configRead.metadata.size) {
      throw new QarinahError("CONFIG_INVALID", "Context Ledger config changed while it was being read.");
    }
    configRaw = JSON.parse(contents.toString("utf8"));
  } catch (error) {
    throw new QarinahError("CONFIG_INVALID", "Context Ledger config is not valid JSON.", { cause: error.message });
  } finally {
    await configRead.handle.close();
  }
  const config = validateConfig(configRaw);
  if (!config.enabled && options.allowDisabled !== true) {
    throw new QarinahError("WORKSPACE_DISABLED", "Context Ledger capture is disabled for this workspace.");
  }
  const provisional = { root: actualRoot, qarinahDir, config, configPath };
  for (const directory of STORAGE_DIRECTORIES) {
    // Dashboard and receipt storage were introduced after the original
    // workspace layout. They are derived, optional for reads, and created on
    // first use. If present, they still pass the normal link/path checks.
    await secureStoragePath(provisional, [directory], {
      type: "directory",
      allowMissing: directory === "dashboard" || directory === "receipts"
    });
  }
  try {
    await secureStoragePath(provisional, ["events", "events.jsonl"], { type: "file" });
  } catch (error) {
    if (error?.code === "ENOENT") throw new QarinahError("EVENT_LOG_MISSING", "The authoritative event log is missing.");
    throw error;
  }
  for (const [directory, filename] of [["index", "index.json"], ["graph", "graph.json"], ["records", "CONTEXT.md"]]) {
    await secureStoragePath(provisional, [directory, filename], { type: "file", allowMissing: true });
  }
  const consent = options.skipConsent === true ? null : await readWorkspaceConsent(actualRoot, config);
  const worktree = await inspectGitWorktree(actualRoot);
  return Object.freeze({ ...provisional, consent, worktree });
}

export async function setWorkspaceEnabled(start, enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean.");
  let workspace = await loadWorkspace(start, { allowDisabled: true, skipConsent: true });
  // Policy transitions share the append lock. An append that loaded the old
  // policy before this operation must re-check the permit after it acquires the
  // lock, while disable/revoke cannot race a checkpoint write that recreates an
  // obsolete authorization record.
  const { acquireWorkspaceWriteLock } = await import("./store.js");
  const release = await acquireWorkspaceWriteLock(workspace);
  try {
    workspace = await loadWorkspace(workspace.root, { allowDisabled: true, skipConsent: true });
    const next = Object.freeze({ ...workspace.config, enabled });
    await secureStoragePath(workspace, ["config.json"], { type: "file" });
    if (enabled) {
      // Portable enablement is written first. Until the machine permit is
      // updated, the mismatch fails closed; rerunning `enable` recovers it.
      await atomicWriteFile(workspace.configPath, `${JSON.stringify(next, null, 2)}\n`);
      await updateWorkspaceEnabledConsent(workspace.root, next, true);
    } else {
      // Machine-local revocation is written first. A crash can leave portable
      // config enabled, but it cannot leave capture authorized.
      await updateWorkspaceEnabledConsent(workspace.root, workspace.config, false);
      await atomicWriteFile(workspace.configPath, `${JSON.stringify(next, null, 2)}\n`);
    }
    return next;
  } finally {
    await release();
  }
}

export async function revokeWorkspaceTrust(start = process.cwd()) {
  const located = await findWorkspaceRoot(start);
  const root = await realpath(path.resolve(located ?? start));
  const revocation = await revokeWorkspaceConsent(root);
  return Object.freeze({
    root,
    workspaceId: revocation.workspaceId,
    trusted: false
  });
}
