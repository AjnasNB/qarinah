import { randomUUID } from "node:crypto";
import { deepFreezeJson } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { appendEvent, readEvents } from "./store.js";
import { loadWorkspace } from "./workspace.js";

export const MEMORY_ATTACHMENT_SCHEMA_VERSION = "qarinah.memory-attachment.v1";

function timestamp(value, label) {
  const date = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
}

function strings(value, label, maximum = 64) {
  if (!Array.isArray(value) || value.length > maximum
    || value.some((entry) => typeof entry !== "string" || entry.trim() === "" || entry.length > 256)) {
    throw new TypeError(`${label} must contain at most ${maximum} non-empty strings up to 256 characters.`);
  }
  return [...new Set(value.map((entry) => entry.trim()))].sort();
}

function attachment(value, { allowRevoked = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("memory attachment must be a record.");
  const allowed = new Set([
    "schemaVersion", "attachmentId", "agentId", "runId", "scopes", "repositories",
    "attachedAt", "expiresAt", "revokedAt", "assignedBy"
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`memory attachment contains unknown field(s): ${unknown.join(", ")}.`);
  if (value.schemaVersion !== undefined && value.schemaVersion !== MEMORY_ATTACHMENT_SCHEMA_VERSION) {
    throw new TypeError("memory attachment schemaVersion is unsupported.");
  }
  const nonEmpty = (candidate, label, maximum = 256) => {
    if (typeof candidate !== "string" || candidate.trim() === "" || candidate.length > maximum) {
      throw new TypeError(`${label} must be a non-empty string up to ${maximum} characters.`);
    }
    return candidate.trim();
  };
  const attachedAt = timestamp(value.attachedAt, "memory attachment attachedAt");
  const expiresAt = value.expiresAt === undefined || value.expiresAt === null
    ? null
    : timestamp(value.expiresAt, "memory attachment expiresAt");
  const revokedAt = value.revokedAt === undefined || value.revokedAt === null
    ? null
    : timestamp(value.revokedAt, "memory attachment revokedAt");
  if (expiresAt !== null && expiresAt <= attachedAt) throw new TypeError("memory attachment expiresAt must follow attachedAt.");
  if (revokedAt !== null && revokedAt < attachedAt) throw new TypeError("memory attachment revokedAt cannot precede attachedAt.");
  if (!allowRevoked && revokedAt !== null) throw new TypeError("new memory attachments cannot already be revoked.");
  return deepFreezeJson({
    schemaVersion: MEMORY_ATTACHMENT_SCHEMA_VERSION,
    attachmentId: nonEmpty(value.attachmentId ?? `mem_${randomUUID()}`, "memory attachment attachmentId", 64),
    agentId: nonEmpty(value.agentId, "memory attachment agentId"),
    runId: value.runId === undefined || value.runId === null ? null : nonEmpty(value.runId, "memory attachment runId"),
    scopes: strings(value.scopes ?? [], "memory attachment scopes"),
    repositories: strings(value.repositories ?? [], "memory attachment repositories"),
    attachedAt,
    expiresAt,
    revokedAt,
    assignedBy: nonEmpty(value.assignedBy, "memory attachment assignedBy")
  });
}

export function createMemoryScopeAttachmentEvent(input) {
  const memoryAttachment = attachment(input);
  return deepFreezeJson({
    timestamp: memoryAttachment.attachedAt,
    kind: "memory.scope.attached",
    actor: { type: "system", id: memoryAttachment.assignedBy },
    title: `Attach memory scope to ${memoryAttachment.agentId}`,
    body: "Host-authorized memory scopes attached for a bounded agent run.",
    data: { memoryAttachment },
    confidence: "verified",
    disclosure: { scopes: [], classification: "workspace" },
    provenance: { adapter: "qarinah.memory-attachment", sourceId: memoryAttachment.attachmentId },
    retention: { class: "project", expiresAt: null }
  });
}

export function createMemoryScopeRevocationEvent(input) {
  const memoryAttachment = attachment({ ...input, revokedAt: input.revokedAt ?? new Date().toISOString() }, { allowRevoked: true });
  if (memoryAttachment.revokedAt === null) throw new TypeError("memory attachment revokedAt is required.");
  return deepFreezeJson({
    timestamp: memoryAttachment.revokedAt,
    kind: "memory.scope.revoked",
    actor: { type: "system", id: memoryAttachment.assignedBy },
    title: `Revoke memory scope from ${memoryAttachment.agentId}`,
    body: "Host-authorized memory scopes revoked.",
    data: { memoryAttachment },
    confidence: "verified",
    disclosure: { scopes: [], classification: "workspace" },
    provenance: { adapter: "qarinah.memory-attachment", sourceId: memoryAttachment.attachmentId },
    retention: { class: "project", expiresAt: null }
  });
}

export async function recordMemoryScopeAttachment(input, options = {}) {
  return appendEvent(createMemoryScopeAttachmentEvent(input), options);
}

export async function revokeMemoryScopeAttachment(input, options = {}) {
  return appendEvent(createMemoryScopeRevocationEvent(input), options);
}

export async function resolveActiveMemoryScopes(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const agentId = typeof options.agentId === "string" && options.agentId.trim() ? options.agentId.trim() : null;
  if (!agentId) throw new TypeError("agentId is required.");
  const runId = options.runId === undefined || options.runId === null ? null : String(options.runId);
  const asOf = timestamp(options.asOf ?? new Date().toISOString(), "asOf");
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const active = new Map();
  for (const event of events) {
    if (event.timestamp > asOf || !["memory.scope.attached", "memory.scope.revoked"].includes(event.kind)) continue;
    const candidate = event.data?.memoryAttachment;
    if (!candidate || typeof candidate !== "object") continue;
    const normalized = attachment(candidate, { allowRevoked: true });
    if (normalized.agentId !== agentId || (normalized.runId !== null && normalized.runId !== runId)) continue;
    if (event.kind === "memory.scope.revoked") active.delete(normalized.attachmentId);
    else active.set(normalized.attachmentId, normalized);
  }
  const attachments = [...active.values()].filter((entry) => (
    entry.attachedAt <= asOf && (entry.expiresAt === null || entry.expiresAt > asOf)
    && (entry.revokedAt === null || entry.revokedAt > asOf)
  ));
  const scopes = [...new Set(attachments.flatMap((entry) => entry.scopes))].sort();
  const repositories = [...new Set(attachments.flatMap((entry) => entry.repositories))].sort();
  if (options.required === true && attachments.length === 0) {
    throw new QarinahError("MEMORY_ATTACHMENT_REQUIRED", "No active host-authorized memory attachment exists for this agent run.");
  }
  return deepFreezeJson({
    schemaVersion: MEMORY_ATTACHMENT_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    agentId,
    runId,
    asOf,
    attachmentIds: attachments.map((entry) => entry.attachmentId).sort(),
    scopes,
    repositories
  });
}
