import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, opendir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { canonicalStringify, sha256 } from "./canonical.js";
import { reviewMetadataEventInput } from "./capture-policy.js";
import { QarinahError } from "./errors.js";
import { appendEvent } from "./store.js";
import { loadWorkspace } from "./workspace.js";
import { rebuildDerivedState } from "./indexer.js";

export const AGENT_ARCHIVE_BACKUP_SCHEMA_VERSION = "qarinah.agent-archive-backup.v1";

const EXTENSIONS = new Set([".jsonl", ".ndjson"]);
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILES = 100_000;
const MAX_DEPTH = 64;

function boundedInteger(value, fallback, label, maximum) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    throw new TypeError(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return selected;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeName(value) {
  const cleaned = value.normalize("NFKC").replaceAll(/[^a-zA-Z0-9._-]+/gu, "-").replaceAll(/^-+|-+$/gu, "");
  return cleaned.slice(0, 80) || "archive";
}

async function inspectSource(source, limits, sourceIndex) {
  if (typeof source !== "string" || source.trim() === "" || !path.isAbsolute(source)) {
    throw new TypeError("Every backup source must be an explicit absolute path.");
  }
  const requested = path.resolve(source);
  const requestedStat = await lstat(requested);
  if (requestedStat.isSymbolicLink()) throw new QarinahError("BACKUP_LINK_REJECTED", "Backup sources cannot be symbolic links or junctions.");
  const root = await realpath(requested);
  const rootStat = await lstat(root);
  const files = [];
  let totalBytes = 0;
  let directories = 0;

  async function addFile(candidate, relativePath) {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink()) throw new QarinahError("BACKUP_LINK_REJECTED", "Backup source trees cannot contain symbolic links or junctions.");
    if (!metadata.isFile() || metadata.nlink !== 1) throw new QarinahError("BACKUP_SOURCE_INVALID", "Backup sources must contain singly linked regular files.");
    if (!EXTENSIONS.has(path.extname(candidate).toLowerCase())) return;
    totalBytes += metadata.size;
    if (files.length + 1 > limits.maxFiles) throw new QarinahError("BACKUP_LIMIT_EXCEEDED", "Backup contains more files than allowed.");
    if (totalBytes > limits.maxBytes) throw new QarinahError("BACKUP_LIMIT_EXCEEDED", "Backup exceeds the configured byte limit.");
    files.push({ sourceIndex, source: candidate, relativePath, expectedBytes: metadata.size });
  }

  async function walk(directory, relativeDirectory = "", depth = 0) {
    if (depth > MAX_DEPTH) throw new QarinahError("BACKUP_LIMIT_EXCEEDED", `Backup directory depth exceeds ${MAX_DEPTH}.`);
    directories += 1;
    if (directories > limits.maxFiles) throw new QarinahError("BACKUP_LIMIT_EXCEEDED", "Backup contains more directories than allowed.");
    const entries = [];
    const handle = await opendir(directory);
    for await (const entry of handle) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) throw new QarinahError("BACKUP_LINK_REJECTED", "Backup source trees cannot contain symbolic links or junctions.");
      if (entry.isDirectory()) await walk(candidate, relative, depth + 1);
      else if (entry.isFile()) await addFile(candidate, relative);
    }
  }

  if (rootStat.isFile()) await addFile(root, path.basename(root));
  else if (rootStat.isDirectory()) await walk(root);
  else throw new QarinahError("BACKUP_SOURCE_INVALID", "Backup source must be a regular file or directory.");
  return {
    root,
    label: safeName(path.basename(root)),
    sourceId: sha256(root),
    files,
    totalBytes
  };
}

async function prepareDestination(destination, sources) {
  if (typeof destination !== "string" || destination.trim() === "" || !path.isAbsolute(destination)) {
    throw new TypeError("backup destination must be an explicit absolute path.");
  }
  const requested = path.resolve(destination);
  for (const source of sources) {
    if (isWithin(source.root, requested) || isWithin(requested, source.root)) {
      throw new QarinahError("BACKUP_PATH_OVERLAP", "Backup source and destination must not contain one another.");
    }
  }
  const parent = await realpath(path.dirname(requested));
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new QarinahError("BACKUP_DESTINATION_INVALID", "Backup destination parent must be a real directory.");
  }
  await mkdir(requested, { recursive: false, mode: 0o700 });
  const metadata = await lstat(requested);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new QarinahError("BACKUP_DESTINATION_INVALID", "Backup destination must be a real directory.");
  }
  return realpath(requested);
}

async function copyVerified(file, destination, state, limits) {
  const target = path.join(destination, `source-${file.sourceIndex + 1}`, file.relativePath);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.partial`;
  const digest = createHash("sha256");
  let copied = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      copied += chunk.length;
      state.copiedBytes += chunk.length;
      if (copied > file.expectedBytes || state.copiedBytes > limits.maxBytes) {
        callback(new QarinahError("BACKUP_LIMIT_EXCEEDED", "Backup source changed or exceeded its byte limit while copying."));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(createReadStream(file.source), meter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    if (copied !== file.expectedBytes) throw new QarinahError("BACKUP_SOURCE_CHANGED", "Backup source changed while it was being copied.");
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    sourceIndex: file.sourceIndex,
    relativePath: file.relativePath.replaceAll("\\", "/"),
    bytes: copied,
    sha256: digest.digest("hex")
  };
}

export async function backupAgentArchives(sources, destination, options = {}) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 32) {
    throw new TypeError("sources must contain from 1 to 32 explicit absolute paths.");
  }
  const limits = {
    maxBytes: boundedInteger(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes", 1024 * 1024 * 1024 * 1024),
    maxFiles: boundedInteger(options.maxFiles, DEFAULT_MAX_FILES, "maxFiles", 1_000_000)
  };
  const inspected = [];
  let totalFiles = 0;
  let totalBytes = 0;
  for (let index = 0; index < sources.length; index += 1) {
    const source = await inspectSource(sources[index], limits, index);
    totalFiles += source.files.length;
    totalBytes += source.totalBytes;
    if (totalFiles > limits.maxFiles || totalBytes > limits.maxBytes) {
      throw new QarinahError("BACKUP_LIMIT_EXCEEDED", "Combined backup sources exceed the configured limits.");
    }
    inspected.push(source);
  }
  if (totalFiles === 0) throw new QarinahError("BACKUP_EMPTY", "No JSONL or NDJSON files were found in the explicit sources.");

  const createdAt = (options.clock?.() ?? new Date()).toISOString();
  const suffix = sha256(inspected.map((source) => source.sourceId).join("\n")).slice(7, 19);
  const root = await prepareDestination(path.join(destination, `qarinah-agent-archive-${createdAt.replaceAll(/[:.]/gu, "-")}-${suffix}`), inspected);
  const state = { copiedBytes: 0 };
  try {
    const files = [];
    for (const source of inspected) {
      for (const file of source.files) files.push(await copyVerified(file, root, state, limits));
    }
    const core = {
      schemaVersion: AGENT_ARCHIVE_BACKUP_SCHEMA_VERSION,
      createdAt,
      sources: inspected.map((source, index) => ({ index, label: source.label, sourceId: source.sourceId })),
      files,
      totals: { files: files.length, bytes: state.copiedBytes }
    };
    const manifestHash = sha256(canonicalStringify(core));
    const manifest = { ...core, manifestHash };
    const manifestPath = path.join(root, "manifest.json");
    const temporary = `${manifestPath}.partial`;
    await pipeline(
      Readable.from([`${JSON.stringify(manifest, null, 2)}\n`]),
      createWriteStream(temporary, { flags: "wx", mode: 0o600 })
    );
    await rename(temporary, manifestPath);

    let event = null;
    if (options.cwd !== undefined) {
      const workspace = await loadWorkspace(options.cwd);
      event = await appendEvent(reviewMetadataEventInput({
        kind: "artifact",
        actor: { type: "human", id: "local-operator" },
        title: "Backed up exported agent archives",
        body: "",
        data: {
          agentArchiveBackup: {
            schemaVersion: AGENT_ARCHIVE_BACKUP_SCHEMA_VERSION,
            sourceCount: inspected.length,
            fileCount: files.length,
            totalBytes: state.copiedBytes,
            manifestHash,
            backupName: path.basename(root)
          }
        },
        confidence: "verified",
        relations: [],
        provenance: { adapter: "qarinah-archive-backup", sourceId: manifestHash },
        retention: { class: workspace.config.retentionClass, expiresAt: null }
      }), { cwd: workspace.root });
      await rebuildDerivedState(workspace.root);
    }
    return Object.freeze({
      schemaVersion: AGENT_ARCHIVE_BACKUP_SCHEMA_VERSION,
      destination: root,
      manifest: manifestPath,
      manifestHash,
      sourceCount: inspected.length,
      fileCount: files.length,
      totalBytes: state.copiedBytes,
      eventId: event?.eventId ?? null
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
