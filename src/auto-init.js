import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalStringify, sha256 } from "./canonical.js";
import { machineStateRoot, workspaceConsentRevoked } from "./consent.js";
import { QarinahError } from "./errors.js";
import { inspectGitWorktree } from "./git-worktrees.js";
import { atomicWriteFile, initializeWorkspace, loadWorkspace } from "./workspace.js";

export const AUTO_INIT_SCHEMA_VERSION = "qarinah.auto-init.v1";
const POLICY_KEYS = [
  "schemaVersion", "enabled", "capture", "roots", "excludedRoots", "fullChat",
  "compactSummaries", "summaryMaxChars", "contextMaxChars", "createdAt", "updatedAt", "policyHash"
];
const EXCLUDED_COMPONENTS = new Set([
  ".git", ".qarinah", ".cache", "node_modules", "vendor", "windows", "program files", "program files (x86)"
]);

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function autoInitPolicyPath() {
  return path.join(machineStateRoot(), "auto-init.json");
}

async function optionalMetadata(candidate) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function safeRoot(candidate) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) || candidate.includes("\0")) {
    throw new QarinahError("AUTO_INIT_PATH_INVALID", "Auto-initialization requires an absolute local directory.");
  }
  const requested = path.resolve(candidate);
  let current = path.parse(requested).root;
  for (const component of path.relative(current, requested).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new QarinahError("AUTO_INIT_LINK_REJECTED", "Auto-initialization does not follow linked directories.");
    }
  }
  const actual = await realpath(requested);
  if (actual === path.parse(actual).root || actual === await realpath(os.homedir())) {
    throw new QarinahError("AUTO_INIT_PATH_INVALID", "Auto-initialization does not initialize a drive root or home directory.");
  }
  return actual;
}

function validatePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== POLICY_KEYS.length || Object.keys(value).some((key) => !POLICY_KEYS.includes(key))
    || value.schemaVersion !== AUTO_INIT_SCHEMA_VERSION) {
    throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Auto-initialization policy has an unsupported shape.");
  }
  for (const field of ["enabled", "fullChat", "compactSummaries"]) {
    if (typeof value[field] !== "boolean") throw new QarinahError("AUTO_INIT_POLICY_INVALID", `${field} must be boolean.`);
  }
  if (!["metadata", "content"].includes(value.capture) || (value.capture === "metadata" && value.fullChat)) {
    throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Full chat storage requires content capture.");
  }
  for (const field of ["roots", "excludedRoots"]) {
    if (!Array.isArray(value[field]) || value[field].length > 64
      || value[field].some((root) => typeof root !== "string" || !path.isAbsolute(root) || root !== path.resolve(root))) {
      throw new QarinahError("AUTO_INIT_POLICY_INVALID", `${field} must contain bounded absolute paths.`);
    }
  }
  for (const [field, minimum, maximum] of [["summaryMaxChars", 256, 4096], ["contextMaxChars", 512, 12000]]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < minimum || value[field] > maximum) {
      throw new QarinahError("AUTO_INIT_POLICY_INVALID", `${field} is outside its supported range.`);
    }
  }
  for (const field of ["createdAt", "updatedAt"]) {
    if (typeof value[field] !== "string" || !Number.isFinite(Date.parse(value[field]))) {
      throw new QarinahError("AUTO_INIT_POLICY_INVALID", `${field} must be a timestamp.`);
    }
  }
  const { policyHash, ...body } = value;
  if (policyHash !== sha256(body)) throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Auto-initialization policy digest does not match.");
  return Object.freeze({ ...value, roots: Object.freeze([...value.roots]), excludedRoots: Object.freeze([...value.excludedRoots]) });
}

export async function readAutoInitPolicy() {
  const candidate = autoInitPolicyPath();
  const metadata = await optionalMetadata(candidate);
  if (metadata === null) return null;
  const directory = await lstat(path.dirname(candidate));
  if (directory.isSymbolicLink() || !directory.isDirectory() || metadata.isSymbolicLink()
    || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 32768) {
    throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Machine-local auto-initialization policy must be a bounded unlinked file.");
  }
  const flags = constants.O_RDONLY | (Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0);
  const handle = await open(candidate, flags);
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(candidate, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== named.dev || opened.ino !== named.ino
      || opened.size > 32768n || named.isSymbolicLink()) {
      throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Auto-initialization policy changed while opening.");
    }
    const contents = await handle.readFile();
    if (contents.length !== Number(opened.size)) throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Auto-initialization policy changed while reading.");
    return validatePolicy(JSON.parse(contents.toString("utf8")));
  } catch (error) {
    if (error instanceof QarinahError) throw error;
    throw new QarinahError("AUTO_INIT_POLICY_INVALID", "Machine-local auto-initialization policy is invalid JSON.");
  } finally {
    await handle.close();
  }
}

export async function configureAutoInit(options = {}) {
  if (typeof options.enabled !== "boolean") throw new TypeError("configureAutoInit requires an explicit enabled boolean.");
  const previous = await readAutoInitPolicy();
  const now = new Date().toISOString();
  const body = {
    schemaVersion: AUTO_INIT_SCHEMA_VERSION,
    enabled: options.enabled,
    capture: options.capture ?? previous?.capture ?? "metadata",
    roots: options.roots ?? previous?.roots ?? [],
    excludedRoots: options.excludedRoots ?? previous?.excludedRoots ?? [],
    fullChat: options.fullChat ?? previous?.fullChat ?? false,
    compactSummaries: options.compactSummaries ?? previous?.compactSummaries ?? true,
    summaryMaxChars: options.summaryMaxChars ?? previous?.summaryMaxChars ?? 1200,
    contextMaxChars: options.contextMaxChars ?? previous?.contextMaxChars ?? 6000,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  };
  const policy = validatePolicy({ ...body, policyHash: sha256(body) });
  const directory = path.dirname(autoInitPolicyPath());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new QarinahError("AUTO_INIT_LINK_REJECTED", "Machine-local policy directory cannot be linked.");
  await atomicWriteFile(autoInitPolicyPath(), `${canonicalStringify(policy)}\n`);
  return policy;
}

export async function ensureAutoWorkspace(start = process.cwd(), options = {}) {
  const policy = await readAutoInitPolicy();
  if (!policy?.enabled) return Object.freeze({ initialized: false, reason: "AUTO_INIT_DISABLED" });
  const actual = await safeRoot(start);
  const components = actual.split(path.sep).map((component) => component.toLowerCase());
  const clientStorage = components.some((component, index) =>
    [".codex", ".claude", ".cursor", ".gemini", ".config"].includes(component)
    && ["plugins", "skills", "sessions", "archived_sessions", "memories", "cache"].includes(components[index + 1]));
  if (clientStorage || within(machineStateRoot(), actual)
    || components.some((component) => EXCLUDED_COMPONENTS.has(component))
    || policy.excludedRoots.some((root) => within(root, actual))
    || (policy.roots.length > 0 && !policy.roots.some((root) => within(root, actual)))) {
    return Object.freeze({ initialized: false, reason: "AUTO_INIT_EXCLUDED" });
  }
  const git = options.exact === true ? null : await inspectGitWorktree(actual);
  const target = await safeRoot(git?.root ?? actual);
  if (policy.excludedRoots.some((root) => within(root, target))
    || (policy.roots.length > 0 && !policy.roots.some((root) => within(root, target)))) {
    return Object.freeze({ initialized: false, reason: "AUTO_INIT_EXCLUDED" });
  }
  let current = actual;
  for (;;) {
    if (await optionalMetadata(path.join(current, ".qarinah-stop"))) {
      return Object.freeze({ initialized: false, reason: "AUTO_INIT_PROJECT_STOPPED" });
    }
    if (await optionalMetadata(path.join(current, ".qarinah", "config.json"))) {
      // Never re-trust, re-enable, or change the capture mode of an existing ledger.
      const existing = await loadWorkspace(current);
      if (current === target || within(target, current)) {
        return Object.freeze({ initialized: false, reason: "ALREADY_INITIALIZED", workspace: existing });
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (target !== actual && await optionalMetadata(path.join(target, ".qarinah-stop"))) {
    return Object.freeze({ initialized: false, reason: "AUTO_INIT_PROJECT_STOPPED" });
  }
  if (await workspaceConsentRevoked(target)) {
    return Object.freeze({ initialized: false, reason: "WORKSPACE_NOT_TRUSTED" });
  }
  const workspace = await initializeWorkspace(target, { capture: policy.capture, ifNeeded: true, preserveRevocation: true });
  return Object.freeze({ initialized: true, reason: "INITIALIZED", workspace });
}

export async function loadHookWorkspace(start) {
  const policy = await readAutoInitPolicy();
  if (policy?.enabled) {
    const result = await ensureAutoWorkspace(start);
    if (result.workspace) return result.workspace;
    if (result.reason !== "AUTO_INIT_DISABLED") throw new QarinahError(result.reason, "Automatic project memory is stopped or excluded here.");
  }
  return loadWorkspace(start);
}
