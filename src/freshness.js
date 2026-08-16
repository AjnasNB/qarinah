import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { deepFreezeJson } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { validateProjectStructureSnapshot } from "./project-structure.js";
import { readEvents } from "./store.js";
import { loadWorkspace, resolveWithin } from "./workspace.js";

function latestSnapshot(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const snapshot = events[index].data?.projectStructure;
    if (validateProjectStructureSnapshot(snapshot)) {
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
    if (error?.code === "ENOENT") return { path: file.path, status: "missing", expectedHash: file.contentHash ?? file.hash };
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    return { path: file.path, status: "unsafe", expectedHash: file.contentHash ?? file.hash };
  }
  const resolved = await realpath(absolute);
  const relative = path.relative(workspace.root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "A freshness target resolves outside the trusted workspace.");
  }
  if ((file.bytes !== undefined && metadata.size > file.bytes) || metadata.size > 4 * 1024 * 1024) {
    return {
      path: file.path,
      status: "changed",
      expectedHash: file.contentHash ?? file.hash,
      observedHash: null,
      reason: "size-changed"
    };
  }
  const observedHash = hashBytes(await readFile(resolved));
  const expectedHash = file.contentHash ?? file.hash;
  return observedHash === expectedHash
    ? { path: file.path, status: "current", expectedHash, observedHash }
    : { path: file.path, status: "changed", expectedHash, observedHash, reason: "content-changed" };
}

function latestCitedFiles(events) {
  const files = new Map();
  for (const event of events) {
    for (const file of event.freshness?.files ?? []) {
      files.set(file.path, {
        path: file.path,
        hash: file.hash,
        eventId: event.eventId,
        repository: event.repository ?? null
      });
    }
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function dependencyFreshness(events, resolver) {
  const latest = new Map();
  for (const event of events) {
    for (const dependency of event.freshness?.dependencies ?? []) {
      latest.set(dependency.name, { ...dependency, eventId: event.eventId, repository: event.repository ?? null });
    }
  }
  const results = [];
  for (const dependency of latest.values()) {
    if (resolver === undefined) {
      results.push({ ...dependency, expectedHash: dependency.hash, observedHash: null, status: "unverified" });
      continue;
    }
    const observedHash = await resolver({ name: dependency.name, version: dependency.version, repository: dependency.repository });
    if (observedHash !== null && (typeof observedHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(observedHash))) {
      throw new TypeError("dependencyResolver must return null or a sha256 hash.");
    }
    results.push({
      ...dependency,
      expectedHash: dependency.hash,
      observedHash,
      status: observedHash === null ? "missing" : (observedHash === dependency.hash ? "current" : "changed")
    });
  }
  return results.sort((left, right) => left.name.localeCompare(right.name));
}

export async function inspectMemoryFreshness(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const latest = latestSnapshot(events);
  const citedFiles = latestCitedFiles(events);
  if (!latest && citedFiles.length === 0) {
    return deepFreezeJson({
      schemaVersion: "qarinah.memory-freshness.v1",
      workspaceId: workspace.config.workspaceId,
      status: "unavailable",
      snapshotEventId: null,
      counts: { current: 0, changed: 0, missing: 0, unsafe: 0, unverified: 0 },
      files: [],
      dependencies: [],
      staleEventIds: []
    });
  }
  if ((latest?.snapshot.files.length ?? 0) + citedFiles.length > 5_000) {
    throw new QarinahError("PROJECT_SCAN_LIMIT", "Freshness inspection exceeds 5000 files.");
  }
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
  const latestByPath = new Map((latest?.snapshot.files ?? []).map((file) => [file.path, file]));
  for (const file of citedFiles) latestByPath.set(file.path, file);
  const targets = [...latestByPath.values()].filter((file) => requested === null || requested.has(file.path));
  const files = [];
  for (const file of targets) files.push(await inspectFile(workspace, file));
  const dependencies = await dependencyFreshness(events, options.dependencyResolver);
  const counts = { current: 0, changed: 0, missing: 0, unsafe: 0, unverified: 0 };
  for (const file of files) counts[file.status] += 1;
  for (const dependency of dependencies) counts[dependency.status] += 1;
  const stalePaths = new Set(files.filter((file) => file.status !== "current").map((file) => file.path));
  const staleDependencies = new Set(dependencies.filter((entry) => !["current", "unverified"].includes(entry.status)).map((entry) => entry.name));
  const staleEventIds = events.filter((event) => (
    (event.freshness?.files ?? []).some((file) => stalePaths.has(file.path))
    || (event.freshness?.dependencies ?? []).some((entry) => staleDependencies.has(entry.name))
  )).map((event) => event.eventId).sort();
  return deepFreezeJson({
    schemaVersion: "qarinah.memory-freshness.v1",
    workspaceId: workspace.config.workspaceId,
    status: counts.changed + counts.missing + counts.unsafe > 0 ? "stale" : "current",
    snapshotEventId: latest?.eventId ?? null,
    snapshotHash: latest?.snapshot.snapshotHash ?? null,
    counts,
    files,
    dependencies,
    staleEventIds
  });
}
