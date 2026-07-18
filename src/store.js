import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify } from "./canonical.js";
import { grantWorkspaceConsent, readWorkspaceConsent, updateWorkspaceCheckpoint } from "./consent.js";
import { createEventEnvelope, validateStoredEvent } from "./contracts.js";
import { QarinahError } from "./errors.js";
import { loadWorkspace, resolveWithin, secureStoragePath } from "./workspace.js";

const MAX_EVENTS = 100_000;
const LOCK_STALE_MS = 120_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireLock(workspace) {
  const locksDirectory = await secureStoragePath(workspace, ["locks"], { type: "directory" });
  const lockPath = resolveWithin(locksDirectory, "append.lock");
  const ownerToken = randomUUID();
  const ownerName = `owner-${ownerToken}.json`;
  const ownerPath = resolveWithin(lockPath, ownerName);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await mkdir(lockPath);
      try {
        const handle = await open(ownerPath, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({ ownerToken, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
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
      return async () => {
        try {
          await rm(ownerPath, { force: true });
          await rmdir(lockPath);
        } catch (error) {
          if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error;
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const metadata = await lstat(lockPath);
        if (metadata.isSymbolicLink()) throw new QarinahError("STORAGE_LINK_REJECTED", ".qarinah/locks/append.lock cannot be a symbolic link or junction.");
        if (!metadata.isDirectory()) throw new QarinahError("WORKSPACE_INVALID", ".qarinah/locks/append.lock must be a directory.");
        if (Date.now() - metadata.mtimeMs > LOCK_STALE_MS) {
          const stalePath = resolveWithin(locksDirectory, `append.lock.stale-${ownerToken}-${attempt}`);
          await rename(lockPath, stalePath);
          await rm(stalePath, { recursive: true, force: true });
          continue;
        }
      } catch (inspectionError) {
        if (!["ENOENT", "EEXIST"].includes(inspectionError?.code)) throw inspectionError;
      }
      await delay(25 + Math.min(attempt, 20) * 5);
    }
  }
  throw new QarinahError("STORE_BUSY", "Timed out waiting for the Qarinah append lock.");
}

async function readHeadEvent(workspace) {
  let eventPath;
  let metadata;
  try {
    eventPath = await secureStoragePath(workspace, ["events", "events.jsonl"], { type: "file" });
    metadata = await stat(eventPath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new QarinahError("EVENT_LOG_MISSING", "The authoritative event log is missing.");
    throw error;
  }
  if (metadata.size === 0) return Object.freeze({ event: null, size: 0 });
  if (metadata.size > workspace.config.maxLogBytes) {
    throw new QarinahError("LOG_LIMIT_EXCEEDED", "Event log exceeds the configured maximum size.");
  }
  const maximumTailBytes = workspace.config.maxEventBytes + 2;
  const length = Math.min(metadata.size, maximumTailBytes);
  const buffer = Buffer.allocUnsafe(length);
  const handle = await open(eventPath, "r");
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, metadata.size - length);
    if (bytesRead !== length) throw new QarinahError("EVENT_LOG_READ_INCOMPLETE", "Could not read the event log tail.");
  } finally {
    await handle.close();
  }
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
    return Object.freeze({ event, size: metadata.size });
  } catch (error) {
    throw new QarinahError("EVENT_INVALID", `The final event failed validation: ${error.message}`);
  }
}

async function reconcileCheckpoint(workspace, events, logBytes) {
  const consent = await readWorkspaceConsent(workspace.root, workspace.config);
  const checkpoint = consent.checkpoint;
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
    return consent;
  }
  return updateWorkspaceCheckpoint(workspace, { eventCount: events.length, headHash, logBytes });
}

export async function readEvents(workspaceOrStart = process.cwd(), options = {}) {
  const workspace = typeof workspaceOrStart === "string" ? await loadWorkspace(workspaceOrStart) : workspaceOrStart;
  let eventPath;
  let metadata;
  try {
    eventPath = await secureStoragePath(workspace, ["events", "events.jsonl"], { type: "file" });
    metadata = await stat(eventPath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new QarinahError("EVENT_LOG_MISSING", "The authoritative event log is missing.");
    throw error;
  }
  if (metadata.size > workspace.config.maxLogBytes) {
    throw new QarinahError("LOG_LIMIT_EXCEEDED", "Event log exceeds the configured maximum size.");
  }
  const contents = await readFile(eventPath, "utf8");
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
  if (options.skipCheckpoint !== true) await reconcileCheckpoint(workspace, events, metadata.size);
  return events;
}

export async function appendEvent(input, options = {}) {
  const workspace = options.workspace || await loadWorkspace(options.cwd || process.cwd());
  const release = await acquireLock(workspace);
  try {
    let head = await readHeadEvent(workspace);
    let consent = await readWorkspaceConsent(workspace.root, workspace.config);
    if (head.size !== consent.checkpoint.logBytes || (head.event?.hash ?? null) !== consent.checkpoint.headHash) {
      await readEvents(workspace);
      head = await readHeadEvent(workspace);
      consent = await readWorkspaceConsent(workspace.root, workspace.config);
    }
    let knownEvents = null;
    if (input?.eventId !== undefined || options.randomUUID) {
      knownEvents = await readEvents(workspace);
      const existing = input?.eventId === undefined ? null : knownEvents.find((event) => event.eventId === input.eventId);
      if (existing && options.idempotent === true) {
        const replay = createEventEnvelope({ ...input, timestamp: existing.timestamp }, {
          workspaceId: workspace.config.workspaceId,
          previousHash: existing.previousHash,
          maximumEventBytes: workspace.config.maxEventBytes
        });
        if (replay.hash === existing.hash) return existing;
        throw new QarinahError("EVENT_ID_CONFLICT", `Event id '${input.eventId}' was reused with different content.`);
      }
      if (existing) {
        throw new QarinahError("EVENT_ID_DUPLICATE", `Event id '${input.eventId}' already exists in this workspace.`);
      }
      consent = await readWorkspaceConsent(workspace.root, workspace.config);
    }
    const previousHash = head.event?.hash ?? null;
    const event = createEventEnvelope(input, {
      workspaceId: workspace.config.workspaceId,
      previousHash,
      maximumEventBytes: workspace.config.maxEventBytes,
      clock: options.clock,
      randomUUID: options.randomUUID
    });
    if (knownEvents?.some((candidate) => candidate.eventId === event.eventId)) {
      throw new QarinahError("EVENT_ID_DUPLICATE", `Event id '${event.eventId}' already exists in this workspace.`);
    }
    const line = `${canonicalStringify(event)}\n`;
    const eventPath = await secureStoragePath(workspace, ["events", "events.jsonl"], { type: "file" });
    if (head.size + Buffer.byteLength(line) > workspace.config.maxLogBytes) {
      throw new QarinahError("LOG_LIMIT_EXCEEDED", "Appending this event would exceed the configured log limit.");
    }
    const handle = await open(eventPath, "a", 0o600);
    try {
      await handle.writeFile(line, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await updateWorkspaceCheckpoint(workspace, {
      eventCount: consent.checkpoint.eventCount + 1,
      headHash: event.hash,
      logBytes: head.size + Buffer.byteLength(line)
    });
    return event;
  } finally {
    await release();
  }
}

export async function verifyStore(start = process.cwd()) {
  const workspace = await loadWorkspace(start);
  const events = await readEvents(workspace);
  return Object.freeze({
    ok: true,
    workspaceId: workspace.config.workspaceId,
    eventCount: events.length,
    headHash: events.at(-1)?.hash ?? null,
    capture: workspace.config.capture,
    root: workspace.root
  });
}

export async function approveWorkspaceTrust(start = process.cwd(), expectedCapture) {
  if (!['metadata', 'content'].includes(expectedCapture)) {
    throw new TypeError("expectedCapture must be explicitly set to metadata or content.");
  }
  const workspace = await loadWorkspace(start, { allowDisabled: true, skipConsent: true });
  if (workspace.config.capture !== expectedCapture) {
    throw new QarinahError(
      "CAPTURE_NOT_APPROVED",
      `Workspace requests '${workspace.config.capture}' capture, but '${expectedCapture}' was approved.`
    );
  }
  const events = await readEvents(workspace, { skipCheckpoint: true });
  const eventPath = await secureStoragePath(workspace, ["events", "events.jsonl"], { type: "file" });
  const metadata = await stat(eventPath);
  const consent = await grantWorkspaceConsent(workspace.root, workspace.config, {
    eventCount: events.length,
    headHash: events.at(-1)?.hash ?? null,
    logBytes: metadata.size
  });
  return Object.freeze({
    root: workspace.root,
    workspaceId: workspace.config.workspaceId,
    capture: consent.capture,
    trusted: true,
    eventCount: consent.checkpoint.eventCount,
    headHash: consent.checkpoint.headHash
  });
}
