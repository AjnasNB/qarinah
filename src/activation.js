import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { QARINAH_VERSION } from "./version.js";
import { atomicWriteFile, loadWorkspace, resolveWithin } from "./workspace.js";

export const ACTIVATION_SCHEMA_VERSION = "qarinah.activation.v1";
export const ACTIVATION_CONSENT_VERSION = "2026-08-22";
export const ACTIVATION_ENDPOINT = "https://qarinah.io/api/activation";

const MAX_STATE_BYTES = 32 * 1024;
const EVENTS = new Set([
  "setup_completed",
  "first_capture",
  "first_retrieval",
  "first_cross_session_handoff",
  "seven_day_return"
]);

function disabledStatus(reason = "not-enabled") {
  return Object.freeze({ enabled: false, sent: false, reason });
}

async function readState(workspace) {
  const statePath = resolveWithin(workspace.qarinahDir, "activation.json");
  let metadata;
  try {
    metadata = await lstat(statePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
    throw new TypeError(".qarinah/activation.json must be a singly linked regular file.");
  }
  if (metadata.size > MAX_STATE_BYTES) throw new TypeError(".qarinah/activation.json exceeds its size limit.");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  if (state?.schemaVersion !== ACTIVATION_SCHEMA_VERSION
    || typeof state.enabled !== "boolean"
    || !/^[0-9a-f-]{36}$/u.test(state.installationId ?? "")
    || !Number.isFinite(Date.parse(state.firstSeenAt ?? ""))
    || typeof state.sent !== "object"
    || state.sent === null
    || Array.isArray(state.sent)) {
    throw new TypeError(".qarinah/activation.json is invalid.");
  }
  return { state, statePath };
}

async function writeState(statePath, state) {
  await atomicWriteFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function configureActivationTracking(options = {}) {
  const workspace = await loadWorkspace(path.resolve(options.cwd ?? process.cwd()));
  const current = await readState(workspace);
  if (options.enabled !== true) {
    if (!current) return disabledStatus();
    const next = { ...current.state, enabled: false, updatedAt: new Date().toISOString() };
    await writeState(current.statePath, next);
    return Object.freeze({ enabled: false, sent: false, reason: "disabled-by-user" });
  }
  const now = new Date().toISOString();
  const state = current?.state ?? {
    schemaVersion: ACTIVATION_SCHEMA_VERSION,
    enabled: true,
    installationId: randomUUID(),
    consentVersion: ACTIVATION_CONSENT_VERSION,
    firstSeenAt: now,
    updatedAt: now,
    sent: {}
  };
  const next = {
    ...state,
    enabled: true,
    consentVersion: ACTIVATION_CONSENT_VERSION,
    updatedAt: now
  };
  const statePath = current?.statePath ?? resolveWithin(workspace.qarinahDir, "activation.json");
  await writeState(statePath, next);
  return Object.freeze({ enabled: true, consentVersion: next.consentVersion, firstSeenAt: next.firstSeenAt });
}

export async function activationTrackingStatus(options = {}) {
  let workspace;
  try {
    workspace = await loadWorkspace(path.resolve(options.cwd ?? process.cwd()));
  } catch (error) {
    if (["WORKSPACE_NOT_INITIALIZED", "WORKSPACE_NOT_TRUSTED"].includes(error?.code)) return disabledStatus("workspace-unavailable");
    throw error;
  }
  const current = await readState(workspace);
  if (!current || current.state.enabled !== true) return disabledStatus();
  return Object.freeze({
    enabled: true,
    consentVersion: current.state.consentVersion,
    firstSeenAt: current.state.firstSeenAt,
    sentEvents: Object.keys(current.state.sent).filter((event) => EVENTS.has(event)).sort()
  });
}

export async function recordActivationEvent(event, options = {}) {
  if (!EVENTS.has(event)) throw new TypeError(`Unsupported activation event '${event}'.`);
  let workspace;
  try {
    workspace = await loadWorkspace(path.resolve(options.cwd ?? process.cwd()));
  } catch (error) {
    if (["WORKSPACE_NOT_INITIALIZED", "WORKSPACE_NOT_TRUSTED"].includes(error?.code)) return disabledStatus("workspace-unavailable");
    throw error;
  }
  const current = await readState(workspace);
  if (!current || current.state.enabled !== true) return disabledStatus();
  if (current.state.sent[event]) return Object.freeze({ enabled: true, sent: false, reason: "already-sent", event });
  if (event === "seven_day_return"
    && Date.now() - Date.parse(current.state.firstSeenAt) < 7 * 24 * 60 * 60 * 1000) {
    return Object.freeze({ enabled: true, sent: false, reason: "not-due", event });
  }

  const payload = {
    schemaVersion: ACTIVATION_SCHEMA_VERSION,
    consentVersion: current.state.consentVersion,
    installationId: current.state.installationId,
    event,
    version: QARINAH_VERSION,
    platform: os.platform(),
    occurredAt: new Date().toISOString()
  };
  const endpoint = options.endpoint ?? ACTIVATION_ENDPOINT;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 2_000)
    });
  } catch {
    return Object.freeze({ enabled: true, sent: false, reason: "endpoint-unavailable", event });
  }
  if (!response.ok) return Object.freeze({ enabled: true, sent: false, reason: `endpoint-${response.status}`, event });
  const next = {
    ...current.state,
    updatedAt: payload.occurredAt,
    sent: { ...current.state.sent, [event]: payload.occurredAt }
  };
  await writeState(current.statePath, next);
  return Object.freeze({ enabled: true, sent: true, event });
}

