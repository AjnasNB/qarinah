import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm, rmdir, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalStringify, sha256 } from "./canonical.js";
import { isReviewedMetadataEventInput } from "./capture-policy.js";
import {
  describeCapturePolicy,
  grantWorkspaceConsent,
  readWorkspaceConsent,
  readWorkspaceTrustForReview,
  updateWorkspaceCheckpoint
} from "./consent.js";
import { createEventEnvelope, validateStoredEvent } from "./contracts.js";
import { QarinahError } from "./errors.js";
import {
  atomicWriteFile,
  loadWorkspace,
  openSecureAppendFile,
  openSecureReadFile,
  resolveWithin,
  secureStoragePath
} from "./workspace.js";

const MAX_EVENTS = 100_000;
const LOCK_STALE_MS = 120_000;
const LOCK_HEARTBEAT_MS = 10_000;
const LOCK_RELEASE_RETRIES = 20;
const LOCK_OWNER_MAX_BYTES = 4_096;
const HOSTNAME = os.hostname();
const OWNER_NAME_PATTERN = /^owner-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/;
const EVENT_ID_INDEX_SCHEMA_VERSION = "qarinah.event-id-index.v2";
const EVENT_ID_BUCKET_SCHEMA_VERSION = "qarinah.event-id-bucket.v2";
const EVENT_ID_BUCKET_PATTERN = /^[0-9a-f]{2}$/;
const EVENT_ID_PATTERN = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const EVENT_ID_MANIFEST_MAX_BYTES = 64 * 1024;
const EVENT_ID_BUCKET_MAX_BYTES = 32 * 1024 * 1024;

async function injectStoreFault(options, point, details = {}) {
  const injector = options?.__testFaultInjector;
  if (injector === undefined) return;
  if (typeof injector !== "function") throw new TypeError("__testFaultInjector must be a function.");
  await injector(point, Object.freeze({ point, ...details }));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTransientWindowsLockError(error) {
  return process.platform === "win32" && ["EBUSY", "EPERM"].includes(error?.code);
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function inspectLockOwner(lockPath) {
  const names = (await readdir(lockPath)).filter((name) => OWNER_NAME_PATTERN.test(name));
  if (names.length !== 1) return null;
  const ownerPath = resolveWithin(lockPath, names[0]);
  const flags = constants.O_RDONLY | (Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0);
  const handle = await open(ownerPath, flags);
  let metadata;
  let value;
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(ownerPath, { bigint: true });
    if (named.isSymbolicLink() || !named.isFile() || named.nlink !== 1n
      || !opened.isFile() || opened.nlink !== 1n
      || opened.dev !== named.dev || opened.ino !== named.ino) {
      throw new QarinahError("STORAGE_LINK_REJECTED", ".qarinah/locks/append.lock owner must be one singly linked regular file.");
    }
    if (opened.size > BigInt(LOCK_OWNER_MAX_BYTES)) return null;
    const contents = await handle.readFile();
    if (contents.length !== Number(opened.size)) return null;
    metadata = Object.freeze({ mtimeMs: Number(opened.mtimeMs) });
    value = JSON.parse(contents.toString("utf8"));
  } catch (error) {
    if (error instanceof QarinahError) throw error;
    return Object.freeze({ ownerPath, metadata, value: null });
  } finally {
    await handle.close();
  }
  const match = OWNER_NAME_PATTERN.exec(names[0]);
  if (!value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).some((key) => !["ownerToken", "pid", "hostname", "acquiredAt"].includes(key))
    || value.ownerToken !== match[1]
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 0
    || typeof value.hostname !== "string"
    || value.hostname.length === 0
    || value.hostname.length > 255
    || typeof value.acquiredAt !== "string"
    || !Number.isFinite(Date.parse(value.acquiredAt))) {
    return Object.freeze({ ownerPath, metadata, value: null });
  }
  return Object.freeze({ ownerPath, metadata, value: Object.freeze(value) });
}

function eventIdBucket(eventId) {
  if (!EVENT_ID_PATTERN.test(eventId)) throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection contains an invalid event id.");
  return sha256(eventId).slice(7, 9);
}

async function ensureEventIdIndexDirectories(workspace) {
  const indexDirectory = await secureStoragePath(workspace, ["index"], { type: "directory" });
  const root = resolveWithin(indexDirectory, "event-ids");
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  await secureStoragePath(workspace, ["index", "event-ids"], { type: "directory" });
  const buckets = resolveWithin(root, "buckets");
  try {
    await mkdir(buckets, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  await secureStoragePath(workspace, ["index", "event-ids", "buckets"], { type: "directory" });
  return Object.freeze({ root, buckets });
}

async function readCanonicalIndexJson(workspace, segments, maximumBytes) {
  const opened = await openSecureReadFile(workspace, segments);
  if (opened.metadata.size > maximumBytes) {
    await opened.handle.close();
    throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection exceeds its size limit.");
  }
  let parsed;
  let contents;
  try {
    const buffer = await opened.handle.readFile();
    if (buffer.length !== opened.metadata.size) {
      throw new QarinahError("STORAGE_RACE_DETECTED", "Event-ID projection changed while it was being read.");
    }
    contents = buffer.toString("utf8");
    parsed = JSON.parse(contents);
  } catch (error) {
    if (error instanceof QarinahError) throw error;
    throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection is not valid JSON.", { cause: error.message });
  } finally {
    await opened.handle.close();
  }
  if (contents !== `${canonicalStringify(parsed)}\n`) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection is not canonical JSON.");
  }
  return parsed;
}

function validateEventIdManifest(value, workspace, checkpoint) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["schemaVersion", "workspaceId", "eventCount", "headHash", "logBytes", "buckets"].includes(key))
    || value.schemaVersion !== EVENT_ID_INDEX_SCHEMA_VERSION
    || value.workspaceId !== workspace.config.workspaceId
    || !Number.isSafeInteger(value.eventCount)
    || value.eventCount < 0
    || (value.headHash !== null && !HASH_PATTERN.test(value.headHash))
    || !Number.isSafeInteger(value.logBytes)
    || value.logBytes < 0
    || !value.buckets
    || typeof value.buckets !== "object"
    || Array.isArray(value.buckets)) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection manifest is invalid.");
  }
  const bucketNames = Object.keys(value.buckets);
  let indexedEvents = 0;
  if (bucketNames.length > 256 || bucketNames.some((name) => {
    const descriptor = value.buckets[name];
    if (!EVENT_ID_BUCKET_PATTERN.test(name)
      || !descriptor
      || typeof descriptor !== "object"
      || Array.isArray(descriptor)
      || Object.keys(descriptor).some((key) => !["count", "hash"].includes(key))
      || !Number.isSafeInteger(descriptor.count)
      || descriptor.count <= 0
      || descriptor.count > MAX_EVENTS
      || !HASH_PATTERN.test(descriptor.hash)) return true;
    indexedEvents += descriptor.count;
    return false;
  }) || indexedEvents !== value.eventCount) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection manifest buckets are invalid.");
  }
  const manifestHash = sha256(value);
  if (checkpoint.eventIdIndexHash === null || manifestHash !== checkpoint.eventIdIndexHash) {
    throw new QarinahError("EVENT_ID_INDEX_MISMATCH", "Event-ID projection does not match the machine-local trusted checkpoint.");
  }
  if (value.eventCount !== checkpoint.eventCount || value.headHash !== checkpoint.headHash || value.logBytes !== checkpoint.logBytes) {
    throw new QarinahError("EVENT_ID_INDEX_MISMATCH", "Event-ID projection head does not match the machine-local trusted checkpoint.");
  }
  return Object.freeze({ manifest: value, manifestHash });
}

async function loadTrustedEventIdManifest(workspace, checkpoint) {
  const value = await readCanonicalIndexJson(
    workspace,
    ["index", "event-ids", "manifest.json"],
    EVENT_ID_MANIFEST_MAX_BYTES
  );
  return validateEventIdManifest(value, workspace, checkpoint);
}

function validateEventIdBucket(value, workspace, manifest, bucketName, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["schemaVersion", "workspaceId", "bucket", "entries"].includes(key))
    || value.schemaVersion !== EVENT_ID_BUCKET_SCHEMA_VERSION
    || value.workspaceId !== workspace.config.workspaceId
    || value.bucket !== bucketName
    || !value.entries
    || typeof value.entries !== "object"
    || Array.isArray(value.entries)
    || sha256(value) !== expected.hash) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection bucket '${bucketName}' is invalid.`);
  }
  const eventIds = Object.keys(value.entries);
  if (eventIds.length !== expected.count || eventIds.length > MAX_EVENTS) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection bucket '${bucketName}' count is invalid.`);
  }
  const entries = Object.create(null);
  for (const eventId of eventIds) {
    const entry = value.entries[eventId];
    if (!EVENT_ID_PATTERN.test(eventId)
      || eventIdBucket(eventId) !== bucketName
      || !entry
      || typeof entry !== "object"
      || Array.isArray(entry)
      || Object.keys(entry).some((key) => !["hash", "length", "offset"].includes(key))
      || !HASH_PATTERN.test(entry.hash)
      || !Number.isSafeInteger(entry.offset)
      || entry.offset < 0
      || !Number.isSafeInteger(entry.length)
      || entry.length < 2
      || entry.length > workspace.config.maxEventBytes + 1
      || !Number.isSafeInteger(entry.offset + entry.length)
      || entry.offset + entry.length > manifest.logBytes) {
      throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection bucket '${bucketName}' contains an invalid entry.`);
    }
    entries[eventId] = Object.freeze({ hash: entry.hash, offset: entry.offset, length: entry.length });
  }
  return Object.freeze({ value, entries: Object.freeze(entries) });
}

async function loadEventIdBucket(workspace, manifest, bucketName) {
  const expected = manifest.buckets[bucketName];
  if (expected === undefined) {
    return Object.freeze({
      value: {
        schemaVersion: EVENT_ID_BUCKET_SCHEMA_VERSION,
        workspaceId: workspace.config.workspaceId,
        bucket: bucketName,
        entries: Object.create(null)
      },
      entries: Object.freeze(Object.create(null))
    });
  }
  const value = await readCanonicalIndexJson(
    workspace,
    ["index", "event-ids", "buckets", `${bucketName}.json`],
    EVENT_ID_BUCKET_MAX_BYTES
  );
  return validateEventIdBucket(value, workspace, manifest, bucketName, expected);
}

function indexedEventEntry(event, offset, length) {
  return Object.freeze({ hash: event.hash, offset, length });
}

function indexEventLocations(events, logBytes) {
  const locations = [];
  let offset = 0;
  for (const event of events) {
    const length = Buffer.byteLength(`${canonicalStringify(event)}\n`);
    locations.push(Object.freeze({ event, entry: indexedEventEntry(event, offset, length) }));
    offset += length;
  }
  if (offset !== logBytes) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", "Event-ID projection offsets do not match the authoritative log length.");
  }
  return locations;
}

async function writeEventIdProjection(workspace, events, logBytes) {
  const directories = await ensureEventIdIndexDirectories(workspace);
  const groups = new Map();
  for (const { event, entry } of indexEventLocations(events, logBytes)) {
    const bucketName = eventIdBucket(event.eventId);
    if (!groups.has(bucketName)) groups.set(bucketName, Object.create(null));
    groups.get(bucketName)[event.eventId] = entry;
  }
  const buckets = Object.create(null);
  for (const bucketName of [...groups.keys()].sort()) {
    const entries = groups.get(bucketName);
    const bucket = {
      schemaVersion: EVENT_ID_BUCKET_SCHEMA_VERSION,
      workspaceId: workspace.config.workspaceId,
      bucket: bucketName,
      entries
    };
    buckets[bucketName] = { count: Object.keys(entries).length, hash: sha256(bucket) };
    await atomicWriteFile(resolveWithin(directories.buckets, `${bucketName}.json`), `${canonicalStringify(bucket)}\n`, { sync: false });
  }
  const manifest = {
    schemaVersion: EVENT_ID_INDEX_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    eventCount: events.length,
    headHash: events.at(-1)?.hash ?? null,
    logBytes,
    buckets
  };
  await atomicWriteFile(resolveWithin(directories.root, "manifest.json"), `${canonicalStringify(manifest)}\n`, { sync: false });
  return Object.freeze({ manifest, manifestHash: sha256(manifest) });
}

async function appendEventIdProjection(workspace, trusted, event, location, options) {
  const directories = await ensureEventIdIndexDirectories(workspace);
  const bucketName = eventIdBucket(event.eventId);
  const current = await loadEventIdBucket(workspace, trusted.manifest, bucketName);
  if (Object.hasOwn(current.entries, event.eventId)) {
    throw new QarinahError("EVENT_ID_DUPLICATE", `Event id '${event.eventId}' already exists in this workspace.`);
  }
  const entries = { ...current.entries, [event.eventId]: indexedEventEntry(event, location.offset, location.length) };
  const bucket = {
    schemaVersion: EVENT_ID_BUCKET_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    bucket: bucketName,
    entries
  };
  const bucketHash = sha256(bucket);
  await atomicWriteFile(resolveWithin(directories.buckets, `${bucketName}.json`), `${canonicalStringify(bucket)}\n`, {
    sync: false,
    afterWrite: () => injectStoreFault(options, "after-event-id-bucket-write", { bucketName, eventId: event.eventId }),
    afterRename: () => injectStoreFault(options, "after-event-id-bucket-rename", { bucketName, eventId: event.eventId })
  });
  const manifest = {
    ...trusted.manifest,
    eventCount: trusted.manifest.eventCount + 1,
    headHash: event.hash,
    logBytes: location.offset + location.length,
    buckets: {
      ...trusted.manifest.buckets,
      [bucketName]: { count: Object.keys(entries).length, hash: bucketHash }
    }
  };
  await atomicWriteFile(resolveWithin(directories.root, "manifest.json"), `${canonicalStringify(manifest)}\n`, {
    sync: false,
    afterWrite: () => injectStoreFault(options, "after-event-id-manifest-write", { eventId: event.eventId }),
    afterRename: () => injectStoreFault(options, "after-event-id-manifest-rename", { eventId: event.eventId })
  });
  return Object.freeze({ manifest, manifestHash: sha256(manifest) });
}

async function readIndexedEvent(workspace, eventId, entry) {
  const opened = await openSecureReadFile(workspace, ["events", "events.jsonl"]);
  if (entry.offset + entry.length > opened.metadata.size) {
    await opened.handle.close();
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' exceeds the authoritative log.`);
  }
  const buffer = Buffer.allocUnsafe(entry.length);
  try {
    let consumed = 0;
    while (consumed < buffer.length) {
      const { bytesRead } = await opened.handle.read(buffer, consumed, buffer.length - consumed, entry.offset + consumed);
      if (bytesRead === 0) break;
      consumed += bytesRead;
    }
    if (consumed !== buffer.length) {
      throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' could not be read completely.`);
    }
  } finally {
    await opened.handle.close();
  }
  if (buffer.at(-1) !== 0x0a) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' does not end at a record boundary.`);
  }
  const recordBytes = buffer.subarray(0, -1);
  let parsed;
  try {
    parsed = JSON.parse(recordBytes.toString("utf8"));
  } catch (error) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' is not valid JSON.`, { cause: error.message });
  }
  if (!Buffer.from(canonicalStringify(parsed), "utf8").equals(recordBytes)) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' is not canonical JSON.`);
  }
  let event;
  try {
    event = validateStoredEvent(parsed, {
      workspaceId: workspace.config.workspaceId,
      maximumEventBytes: workspace.config.maxEventBytes
    });
  } catch (error) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' failed validation.`, { cause: error.message });
  }
  if (event.eventId !== eventId || event.hash !== entry.hash) {
    throw new QarinahError("EVENT_ID_INDEX_INVALID", `Event-ID projection entry '${eventId}' does not identify the indexed record.`);
  }
  return event;
}

async function loadIndexedEvent(workspace, manifest, eventId) {
  const bucket = await loadEventIdBucket(workspace, manifest, eventIdBucket(eventId));
  const entry = bucket.entries[eventId];
  return entry === undefined ? null : readIndexedEvent(workspace, eventId, entry);
}

async function rebuildTrustedEventIdProjection(workspace) {
  const snapshot = await readEventsFromWorkspace(workspace, { updateCheckpoint: false, includeLogMetadata: true });
  const { events, logBytes } = snapshot;
  const projection = await writeEventIdProjection(workspace, events, logBytes);
  const consent = await updateWorkspaceCheckpoint(workspace, {
    eventCount: events.length,
    headHash: events.at(-1)?.hash ?? null,
    logBytes,
    eventIdIndexHash: projection.manifestHash
  });
  return Object.freeze({
    head: Object.freeze({
      event: events.at(-1) ?? null,
      size: logBytes,
      dev: snapshot.dev,
      ino: snapshot.ino
    }),
    consent,
    trustedProjection: projection
  });
}

export async function acquireWorkspaceWriteLock(workspace) {
  const locksDirectory = await secureStoragePath(workspace, ["locks"], { type: "directory" });
  const lockPath = resolveWithin(locksDirectory, "append.lock");
  const ownerToken = randomUUID();
  const ownerName = `owner-${ownerToken}.json`;
  const ownerPath = resolveWithin(lockPath, ownerName);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(lockPath);
      try {
        const handle = await open(ownerPath, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({ ownerToken, pid: process.pid, hostname: HOSTNAME, acquiredAt: new Date().toISOString() })}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (error) {
        try {
          await rmdir(lockPath);
        } catch {
          // The original error is more useful; a later stale-lock takeover can recover this directory.
        }
        throw error;
      }
      let ownershipLost = null;
      let refreshPromise = Promise.resolve();
      const refresh = async () => {
        const owner = await inspectLockOwner(lockPath);
        if (!owner?.value || owner.ownerPath !== ownerPath || owner.value.ownerToken !== ownerToken) {
          throw new QarinahError("STORE_LOCK_LOST", "The Context Ledger append lock owner changed while an append was active.");
        }
        const now = new Date();
        await utimes(ownerPath, now, now);
      };
      const heartbeat = setInterval(() => {
        refreshPromise = refreshPromise.then(refresh).catch((error) => {
          ownershipLost = error;
        });
      }, LOCK_HEARTBEAT_MS);
      heartbeat.unref?.();
      const assertOwned = async () => {
        await refreshPromise;
        if (ownershipLost) throw ownershipLost;
        await refresh();
      };
      const release = async () => {
        clearInterval(heartbeat);
        await refreshPromise;
        if (ownershipLost) throw ownershipLost;
        const owner = await inspectLockOwner(lockPath).catch((error) => {
          if (error?.code === "ENOENT") return null;
          throw error;
        });
        if (!owner?.value || owner.ownerPath !== ownerPath || owner.value.ownerToken !== ownerToken) {
          throw new QarinahError("STORE_LOCK_LOST", "Refusing to release an append lock owned by another process.");
        }

        const releasedPath = resolveWithin(locksDirectory, `append.lock.released-${ownerToken}`);
        let moved = false;
        let moveError;
        for (let attempt = 0; attempt < LOCK_RELEASE_RETRIES; attempt += 1) {
          try {
            await rename(lockPath, releasedPath);
            moved = true;
            break;
          } catch (error) {
            if (!isTransientWindowsLockError(error)) throw error;
            moveError = error;
            await delay(10 + Math.min(attempt, 10) * 5);
          }
        }
        if (!moved) throw moveError;

        const releasedNames = await readdir(releasedPath);
        const releasedOwner = await inspectLockOwner(releasedPath);
        if (releasedNames.length !== 1
          || releasedNames[0] !== ownerName
          || !releasedOwner?.value
          || releasedOwner.value.ownerToken !== ownerToken) {
          throw new QarinahError("STORE_LOCK_LOST", "Refusing to remove a released append lock with unexpected contents.");
        }
        await rm(releasedPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
      };
      Object.defineProperty(release, "assertOwned", { value: assertOwned });
      Object.defineProperty(release, "__testLock", {
        value: Object.freeze({ lockPath, ownerPath })
      });
      return release;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const metadata = await lstat(lockPath);
        if (metadata.isSymbolicLink()) throw new QarinahError("STORAGE_LINK_REJECTED", ".qarinah/locks/append.lock cannot be a symbolic link or junction.");
        if (!metadata.isDirectory()) throw new QarinahError("WORKSPACE_INVALID", ".qarinah/locks/append.lock must be a directory.");
        const owner = await inspectLockOwner(lockPath);
        const heartbeatMtime = owner?.metadata?.mtimeMs ?? metadata.mtimeMs;
        const locallyAlive = owner?.value?.hostname === HOSTNAME && processIsAlive(owner.value.pid);
        if (Date.now() - heartbeatMtime > LOCK_STALE_MS && !locallyAlive) {
          const latest = owner ? await lstat(owner.ownerPath) : await lstat(lockPath);
          if (latest.mtimeMs !== heartbeatMtime) continue;
          const stalePath = resolveWithin(locksDirectory, `append.lock.stale-${ownerToken}-${attempt}`);
          await rename(lockPath, stalePath);
          await rm(stalePath, { recursive: true, force: true });
          continue;
        }
      } catch (inspectionError) {
        if (!["ENOENT", "EEXIST"].includes(inspectionError?.code)
          && !isTransientWindowsLockError(inspectionError)) throw inspectionError;
      }
      await delay(25 + Math.min(attempt, 20) * 5);
    }
  }
  throw new QarinahError("STORE_BUSY", "Timed out waiting for the Context Ledger append lock.");
}

async function readHeadFromHandle(workspace, handle, metadata) {
  if (metadata.size === 0) {
    return Object.freeze({ event: null, size: 0, dev: metadata.dev, ino: metadata.ino });
  }
  if (metadata.size > workspace.config.maxLogBytes) {
    throw new QarinahError("LOG_LIMIT_EXCEEDED", "Event log exceeds the configured maximum size.");
  }
  const maximumTailBytes = workspace.config.maxEventBytes + 2;
  const length = Math.min(metadata.size, maximumTailBytes);
  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await handle.read(buffer, 0, length, metadata.size - length);
  if (bytesRead !== length) throw new QarinahError("EVENT_LOG_READ_INCOMPLETE", "Could not read the event log tail.");
  if (buffer[length - 1] !== 0x0a) {
    throw new QarinahError("EVENT_LOG_NON_CANONICAL", "Event log must end with a newline.");
  }
  const precedingNewline = buffer.lastIndexOf(0x0a, length - 2);
  if (precedingNewline === -1 && metadata.size > length) {
    throw new QarinahError("EVENT_INVALID", "The final event exceeds the configured event-size limit.");
  }
  const line = buffer.subarray(precedingNewline + 1, length - 1).toString("utf8");
  if (line === "") throw new QarinahError("EVENT_LOG_NON_CANONICAL", "Event log ends with an unexpected blank line.");
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new QarinahError("EVENT_JSON_INVALID", "The final event is not valid JSON.", { cause: error.message });
  }
  if (canonicalStringify(parsed) !== line) {
    throw new QarinahError("EVENT_LOG_NON_CANONICAL", "The final event is not canonical JSON.");
  }
  try {
    const event = validateStoredEvent(parsed, {
      workspaceId: workspace.config.workspaceId,
      maximumEventBytes: workspace.config.maxEventBytes
    });
    return Object.freeze({ event, size: metadata.size, dev: metadata.dev, ino: metadata.ino });
  } catch (error) {
    throw new QarinahError("EVENT_INVALID", `The final event failed validation: ${error.message}`);
  }
}

async function readHeadEvent(workspace) {
  let opened;
  try {
    opened = await openSecureReadFile(workspace, ["events", "events.jsonl"]);
  } catch (error) {
    if (error?.code === "ENOENT") throw new QarinahError("EVENT_LOG_MISSING", "The authoritative event log is missing.");
    throw error;
  }
  try {
    return await readHeadFromHandle(workspace, opened.handle, opened.metadata);
  } finally {
    await opened.handle.close();
  }
}

function validateCheckpointContinuity(events, logBytes, checkpoint) {
  if (events.length < checkpoint.eventCount || logBytes < checkpoint.logBytes) {
    throw new QarinahError("CHECKPOINT_ROLLBACK", "The event log is older or shorter than this machine's trusted checkpoint.");
  }
  if (checkpoint.eventCount > 0 && events[checkpoint.eventCount - 1]?.hash !== checkpoint.headHash) {
    throw new QarinahError("CHECKPOINT_MISMATCH", "The event log no longer contains the trusted checkpoint.");
  }
  const headHash = events.at(-1)?.hash ?? null;
  if (events.length === checkpoint.eventCount) {
    if (headHash !== checkpoint.headHash || logBytes !== checkpoint.logBytes) {
      throw new QarinahError("CHECKPOINT_MISMATCH", "The event log differs from this machine's trusted checkpoint.");
    }
  }
  return headHash;
}

async function reconcileCheckpoint(workspace, events, logBytes, options = {}) {
  const consent = await readWorkspaceConsent(workspace.root, workspace.config);
  const checkpoint = consent.checkpoint;
  const headHash = validateCheckpointContinuity(events, logBytes, checkpoint);
  if (events.length === checkpoint.eventCount) {
    if (options.updateCheckpoint === false) return consent;
    try {
      await loadTrustedEventIdManifest(workspace, checkpoint);
      return consent;
    } catch (error) {
      if (!["ENOENT", "EVENT_ID_INDEX_INVALID", "EVENT_ID_INDEX_MISMATCH"].includes(error?.code)) throw error;
      const projection = await writeEventIdProjection(workspace, events, logBytes);
      return updateWorkspaceCheckpoint(workspace, {
        eventCount: events.length,
        headHash,
        logBytes,
        eventIdIndexHash: projection.manifestHash
      });
    }
  }
  if (options.updateCheckpoint === false) return consent;
  const projection = await writeEventIdProjection(workspace, events, logBytes);
  return updateWorkspaceCheckpoint(workspace, {
    eventCount: events.length,
    headHash,
    logBytes,
    eventIdIndexHash: projection.manifestHash
  });
}

function workspaceRootLocator(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a workspace object or path string.`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "root");
  if (!descriptor?.enumerable
    || !Object.hasOwn(descriptor, "value")
    || typeof descriptor.value !== "string"
    || descriptor.value.length === 0) {
    throw new TypeError(`${label}.root must be an enumerable non-empty string data property.`);
  }
  return descriptor.value;
}

async function readEventsFromWorkspace(workspace, options = {}) {
  let opened;
  try {
    opened = await openSecureReadFile(workspace, ["events", "events.jsonl"]);
  } catch (error) {
    if (error?.code === "ENOENT") throw new QarinahError("EVENT_LOG_MISSING", "The authoritative event log is missing.");
    throw error;
  }
  if (opened.metadata.size > workspace.config.maxLogBytes) {
    await opened.handle.close();
    throw new QarinahError("LOG_LIMIT_EXCEEDED", "Event log exceeds the configured maximum size.");
  }
  let contents;
  try {
    const buffer = await opened.handle.readFile();
    if (buffer.length !== opened.metadata.size) {
      throw new QarinahError("STORAGE_RACE_DETECTED", "The authoritative event log changed while it was being read.");
    }
    contents = buffer.toString("utf8");
  } finally {
    await opened.handle.close();
  }
  if (contents !== "" && !contents.endsWith("\n")) {
    throw new QarinahError("EVENT_LOG_NON_CANONICAL", "Event log must end with a newline.");
  }
  const lines = contents === "" ? [] : contents.slice(0, -1).split("\n");
  if (lines.some((line) => line === "")) {
    throw new QarinahError("EVENT_LOG_NON_CANONICAL", "Event log contains an unexpected blank line.");
  }
  if (lines.length > MAX_EVENTS) throw new QarinahError("EVENT_LIMIT_EXCEEDED", `Event log exceeds ${MAX_EVENTS} records.`);
  const events = [];
  const eventIds = new Set();
  let previousHash = null;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed;
    try {
      parsed = JSON.parse(lines[index]);
    } catch (error) {
      throw new QarinahError("EVENT_JSON_INVALID", `Event log line ${index + 1} is not valid JSON.`, { cause: error.message });
    }
    if (canonicalStringify(parsed) !== lines[index]) {
      throw new QarinahError("EVENT_LOG_NON_CANONICAL", `Event log line ${index + 1} is not canonical JSON.`);
    }
    try {
      const event = validateStoredEvent(parsed, {
        expectedPreviousHash: previousHash,
        workspaceId: workspace.config.workspaceId,
        maximumEventBytes: workspace.config.maxEventBytes
      });
      if (eventIds.has(event.eventId)) throw new TypeError(`Event id '${event.eventId}' is duplicated.`);
      eventIds.add(event.eventId);
      events.push(event);
      previousHash = event.hash;
    } catch (error) {
      throw new QarinahError("EVENT_INVALID", `Event log line ${index + 1} failed validation: ${error.message}`);
    }
  }
  if (options.skipCheckpoint !== true) {
    await reconcileCheckpoint(workspace, events, opened.metadata.size, { updateCheckpoint: options.updateCheckpoint !== false });
  }
  if (options.includeLogMetadata === true) {
    return Object.freeze({
      events: Object.freeze(events),
      logBytes: opened.metadata.size,
      dev: opened.metadata.dev,
      ino: opened.metadata.ino
    });
  }
  return events;
}

export async function readEvents(workspaceOrStart = process.cwd(), options = {}) {
  const start = typeof workspaceOrStart === "string"
    ? workspaceOrStart
    : workspaceRootLocator(workspaceOrStart, "workspace");
  let workspace = await loadWorkspace(start);
  if (options.updateCheckpoint === false || options.skipCheckpoint === true) {
    return readEventsFromWorkspace(workspace, options);
  }
  const release = await acquireWorkspaceWriteLock(workspace);
  try {
    workspace = await loadWorkspace(workspace.root);
    return await readEventsFromWorkspace(workspace, options);
  } finally {
    await release();
  }
}

function captureMode(requested, workspace) {
  const capture = requested ?? workspace.config.capture;
  if (!["metadata", "content"].includes(capture)) throw new TypeError("options.capture must be metadata or content.");
  if (capture === "content" && workspace.consent?.capture !== "content") {
    throw new QarinahError(
      "CONTENT_CAPTURE_NOT_APPROVED",
      "Content retention requires a current machine-local content capture permit."
    );
  }
  return capture;
}

function sizeClass(bytes) {
  if (bytes === 0) return "empty";
  if (bytes <= 64) return "tiny";
  if (bytes <= 1_024) return "small";
  if (bytes <= 16_384) return "medium";
  if (bytes <= 65_536) return "large";
  return "very_large";
}

function coarseValueSummary(value) {
  if (value === undefined || value === null) return Object.freeze({ present: false, sizeClass: "none" });
  const serialized = typeof value === "string" ? value : canonicalStringify(value);
  const bytes = Buffer.byteLength(serialized);
  return Object.freeze({ present: true, sizeClass: sizeClass(bytes), bytes });
}

function sourceEventDescriptor(event) {
  const { schemaVersion: _schemaVersion, workspaceId: _workspaceId, previousHash: _previousHash, hash: _hash, ...source } = event;
  return source;
}

function metadataProjection(source, workspace) {
  const descriptor = sourceEventDescriptor(source);
  const serialized = canonicalStringify(descriptor);
  return {
    eventId: source.eventId,
    timestamp: source.timestamp,
    kind: source.kind,
    actor: { type: "system", id: "qarinah.metadata-projection" },
    title: `Captured ${source.kind} metadata`,
    body: "",
    data: {
      capture: "metadata",
      contentOmitted: true,
      sourceEvent: {
        digest: sha256(serialized),
        bytes: Buffer.byteLength(serialized),
        title: coarseValueSummary(source.title),
        body: coarseValueSummary(source.body),
        data: coarseValueSummary(source.data),
        actorPresent: source.actor !== null,
        relationCount: source.relations.length,
        sessionIdPresent: source.sessionId !== null,
        turnIdPresent: source.turnId !== null
      }
    },
    confidence: "extracted",
    relations: [],
    provenance: { adapter: "qarinah.metadata-projection", sourceId: source.eventId },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
}

function createCapturedEvent(input, workspace, previousHash, options, capture, reviewedMetadata) {
  const source = createEventEnvelope(input, {
    workspaceId: workspace.config.workspaceId,
    previousHash,
    maximumEventBytes: workspace.config.maxEventBytes,
    clock: options.clock,
    randomUUID: options.randomUUID
  });
  if (source.retention.class !== workspace.config.retentionClass) {
    throw new QarinahError(
      "RETENTION_NOT_APPROVED",
      `The event requests '${source.retention.class}' retention, but this workspace permits '${workspace.config.retentionClass}'.`
    );
  }
  if (capture === "content") return source;
  if (reviewedMetadata) {
    if (source.body !== "") {
      throw new QarinahError("METADATA_PROJECTION_INVALID", "Reviewed metadata events cannot retain a body.");
    }
    return source;
  }
  return createEventEnvelope(metadataProjection(source, workspace), {
    workspaceId: workspace.config.workspaceId,
    previousHash,
    maximumEventBytes: workspace.config.maxEventBytes
  });
}

export async function appendEvent(input, options = {}) {
  const start = options.workspace
    ? workspaceRootLocator(options.workspace, "options.workspace")
    : (options.cwd || process.cwd());
  let workspace = await loadWorkspace(start);
  await injectStoreFault(options, "after-initial-workspace-load", { workspaceId: workspace.config.workspaceId });
  const release = await acquireWorkspaceWriteLock(workspace);
  try {
    // The portable policy may have changed while this append waited for the
    // lock. Reload both config and its machine-local permit before deciding
    // whether content or a reviewed metadata projection is authorized.
    workspace = await loadWorkspace(workspace.root);
    const capture = captureMode(options.capture, workspace);
    const reviewedMetadata = capture === "metadata" && isReviewedMetadataEventInput(input);
    let head = await readHeadEvent(workspace);
    let consent = await readWorkspaceConsent(workspace.root, workspace.config);
    if (head.size !== consent.checkpoint.logBytes || (head.event?.hash ?? null) !== consent.checkpoint.headHash) {
      await readEventsFromWorkspace(workspace);
      head = await readHeadEvent(workspace);
      consent = await readWorkspaceConsent(workspace.root, workspace.config);
    }
    let trustedProjection;
    try {
      trustedProjection = await loadTrustedEventIdManifest(workspace, consent.checkpoint);
    } catch (error) {
      if (!["ENOENT", "EVENT_ID_INDEX_INVALID", "EVENT_ID_INDEX_MISMATCH"].includes(error?.code)) throw error;
      ({ head, consent, trustedProjection } = await rebuildTrustedEventIdProjection(workspace));
    }
    const previousHash = head.event?.hash ?? null;
    let event = createCapturedEvent(input, workspace, previousHash, options, capture, reviewedMetadata);
    let existing;
    try {
      existing = await loadIndexedEvent(workspace, trustedProjection.manifest, event.eventId);
    } catch (error) {
      if (!["ENOENT", "EVENT_ID_INDEX_INVALID", "EVENT_ID_INDEX_MISMATCH"].includes(error?.code)) throw error;
      ({ head, consent, trustedProjection } = await rebuildTrustedEventIdProjection(workspace));
      event = createCapturedEvent(
        { ...input, eventId: event.eventId, timestamp: event.timestamp },
        workspace,
        head.event?.hash ?? null,
        {},
        capture,
        reviewedMetadata
      );
      existing = await loadIndexedEvent(workspace, trustedProjection.manifest, event.eventId);
    }
    if (existing && options.idempotent === true) {
      const replay = createCapturedEvent(
        { ...input, timestamp: existing.timestamp },
        workspace,
        existing.previousHash,
        {},
        capture,
        reviewedMetadata
      );
      if (replay.hash === existing.hash) return existing;
      throw new QarinahError("EVENT_ID_CONFLICT", `Event id '${event.eventId}' was reused with different content.`);
    }
    if (existing) {
      throw new QarinahError("EVENT_ID_DUPLICATE", `Event id '${event.eventId}' already exists in this workspace.`);
    }
    const line = `${canonicalStringify(event)}\n`;
    const lineLength = Buffer.byteLength(line);
    if (head.size + lineLength > workspace.config.maxLogBytes) {
      throw new QarinahError("LOG_LIMIT_EXCEEDED", "Appending this event would exceed the configured log limit.");
    }
    await release.assertOwned();
    const opened = await openSecureAppendFile(workspace, ["events", "events.jsonl"]);
    try {
      if (opened.metadata.size !== head.size || opened.metadata.dev !== head.dev || opened.metadata.ino !== head.ino) {
        throw new QarinahError("STORAGE_RACE_DETECTED", "The authoritative event log changed between verification and append.");
      }
      const confirmedHead = await readHeadFromHandle(workspace, opened.handle, opened.metadata);
      if (confirmedHead.size !== head.size || (confirmedHead.event?.hash ?? null) !== (head.event?.hash ?? null)) {
        throw new QarinahError("STORAGE_RACE_DETECTED", "The authoritative event log head changed between verification and append.");
      }
      await opened.handle.writeFile(line, "utf8");
      await opened.handle.sync();
      const finalStat = await opened.handle.stat({ bigint: true });
      const expectedSize = head.size + lineLength;
      if (finalStat.size > BigInt(Number.MAX_SAFE_INTEGER) || Number(finalStat.size) !== expectedSize) {
        throw new QarinahError("STORAGE_RACE_DETECTED", "The authoritative event log changed during append.");
      }
      const finalHead = await readHeadFromHandle(workspace, opened.handle, {
        size: Number(finalStat.size),
        dev: finalStat.dev,
        ino: finalStat.ino
      });
      if (finalHead.event?.hash !== event.hash) {
        throw new QarinahError("STORAGE_RACE_DETECTED", "The appended event is not the authoritative log head.");
      }
    } finally {
      await opened.handle.close();
    }
    await injectStoreFault(options, "after-event-log-fsync", {
      eventId: event.eventId,
      lockPath: release.__testLock.lockPath,
      ownerPath: release.__testLock.ownerPath
    });
    await release.assertOwned();
    const projection = await appendEventIdProjection(
      workspace,
      trustedProjection,
      event,
      { offset: head.size, length: lineLength },
      options
    );
    await release.assertOwned();
    await updateWorkspaceCheckpoint(workspace, {
      eventCount: consent.checkpoint.eventCount + 1,
      headHash: event.hash,
      logBytes: head.size + lineLength,
      eventIdIndexHash: projection.manifestHash
    });
    await injectStoreFault(options, "after-checkpoint-update", { eventId: event.eventId });
    return event;
  } finally {
    await release();
  }
}

export async function verifyStore(start = process.cwd(), options = {}) {
  const workspace = await loadWorkspace(start);
  const events = await readEvents(workspace, { updateCheckpoint: options.updateCheckpoint !== false });
  const result = {
    ok: true,
    workspaceId: workspace.config.workspaceId,
    eventCount: events.length,
    headHash: events.at(-1)?.hash ?? null,
    capture: workspace.config.capture
  };
  if (options.includeRoot !== false) result.root = workspace.root;
  return Object.freeze(result);
}

export async function inspectWorkspacePolicy(start = process.cwd()) {
  const workspace = await loadWorkspace(start, { allowDisabled: true, skipConsent: true });
  return describeCapturePolicy(workspace.root, workspace.config);
}

export async function approveWorkspaceTrust(start = process.cwd(), expectedCapture, expectedPolicyHash) {
  if (!['metadata', 'content'].includes(expectedCapture)) {
    throw new TypeError("expectedCapture must be explicitly set to metadata or content.");
  }
  if (typeof expectedPolicyHash !== "string" || !HASH_PATTERN.test(expectedPolicyHash)) {
    throw new TypeError("expectedPolicyHash must be the exact sha256 digest shown by inspectWorkspacePolicy or `qarinah policy`.");
  }
  let workspace = await loadWorkspace(start, { allowDisabled: true, skipConsent: true });
  const release = await acquireWorkspaceWriteLock(workspace);
  try {
    workspace = await loadWorkspace(workspace.root, { allowDisabled: true, skipConsent: true });
    const requestedPolicy = describeCapturePolicy(workspace.root, workspace.config);
    if (workspace.config.capture !== expectedCapture) {
      throw new QarinahError(
        "CAPTURE_NOT_APPROVED",
        `Workspace requests '${workspace.config.capture}' capture, but '${expectedCapture}' was approved.`
      );
    }
    if (requestedPolicy.policyHash !== expectedPolicyHash) {
      throw new QarinahError(
        "POLICY_NOT_APPROVED",
        "The workspace policy does not match the exact reviewed policy digest. Run `qarinah policy` and review it again."
      );
    }
    const priorTrust = await readWorkspaceTrustForReview(workspace.root, workspace.config.workspaceId);
    const snapshot = await readEventsFromWorkspace(workspace, { skipCheckpoint: true, includeLogMetadata: true });
    const { events, logBytes } = snapshot;
    if (priorTrust !== null) {
      validateCheckpointContinuity(events, logBytes, priorTrust.checkpoint);
    }
    const projection = await writeEventIdProjection(workspace, events, logBytes);
    const consent = await grantWorkspaceConsent(workspace.root, workspace.config, {
      eventCount: events.length,
      headHash: events.at(-1)?.hash ?? null,
      logBytes,
      eventIdIndexHash: projection.manifestHash
    });
    return Object.freeze({
      root: workspace.root,
      workspaceId: workspace.config.workspaceId,
      capture: consent.capture,
      policyHash: consent.policyHash,
      trusted: true,
      eventCount: consent.checkpoint.eventCount,
      headHash: consent.checkpoint.headHash
    });
  } finally {
    await release();
  }
}
