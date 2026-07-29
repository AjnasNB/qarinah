import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { deepFreezeJson } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { PROJECT_STRUCTURE_SCHEMA_VERSION } from "./project-structure.js";
import { readEvents } from "./store.js";
import { loadWorkspace, resolveWithin } from "./workspace.js";

function latestSnapshot(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const snapshot = events[index].data?.projectStructure;
    if (snapshot?.schemaVersion === PROJECT_STRUCTURE_SCHEMA_VERSION && Array.isArray(snapshot.files)) {
      return { eventId: events[index].eventId, snapshot };
    }
  }
  return null;
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function inspectFile(workspace, file) {
  const absolute = resolveWithin(workspace.root, ...file.path.split("/"));
  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") return { path: file.path, status: "missing", expectedHash: file.contentHash };
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    return { path: file.path, status: "unsafe", expectedHash: file.contentHash };
  }
  const resolved = await realpath(absolute);
  const relative = path.relative(workspace.root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "A freshness target resolves outside the trusted workspace.");
  }
  if (metadata.size > file.bytes || metadata.size > 4 * 1024 * 1024) {
    return {
      path: file.path,
      status: "changed",
      expectedHash: file.contentHash,
      observedHash: null,
      reason: "size-changed"
    };
  }
  const observedHash = hashBytes(await readFile(resolved));
  return observedHash === file.contentHash
    ? { path: file.path, status: "current", expectedHash: file.contentHash, observedHash }
    : { path: file.path, status: "changed", expectedHash: file.contentHash, observedHash, reason: "content-changed" };
}

export async function inspectMemoryFreshness(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const latest = latestSnapshot(events);
  if (!latest) {
    return deepFreezeJson({
      schemaVersion: "qarinah.memory-freshness.v1",
      workspaceId: workspace.config.workspaceId,
      status: "unavailable",
      snapshotEventId: null,
      counts: { current: 0, changed: 0, missing: 0, unsafe: 0 },
      files: []
    });
  }
  if (latest.snapshot.files.length > 5_000) throw new QarinahError("PROJECT_SCAN_LIMIT", "Freshness inspection exceeds 5000 files.");
  const requested = options.paths === undefined
    ? null
    : new Set(options.paths);
  if (requested && (
    !Array.isArray(options.paths)
    || options.paths.length > 5_000
    || options.paths.some((value) => typeof value !== "string" || value.trim() === "")
  )) {
    throw new TypeError("paths must be an array of at most 5000 non-empty project-relative paths.");
  }
  const targets = latest.snapshot.files.filter((file) => requested === null || requested.has(file.path));
  const files = [];
  for (const file of targets) files.push(await inspectFile(workspace, file));
  const counts = { current: 0, changed: 0, missing: 0, unsafe: 0 };
  for (const file of files) counts[file.status] += 1;
  return deepFreezeJson({
    schemaVersion: "qarinah.memory-freshness.v1",
    workspaceId: workspace.config.workspaceId,
    status: counts.changed + counts.missing + counts.unsafe > 0 ? "stale" : "current",
    snapshotEventId: latest.eventId,
    snapshotHash: latest.snapshot.snapshotHash,
    counts,
    files
  });
}
