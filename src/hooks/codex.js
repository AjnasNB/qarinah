import path from "node:path";
import { sha256 } from "../canonical.js";
import { QarinahError } from "../errors.js";
import { snapshotJsonBoundary } from "../interoperability/boundary.js";
import { appendEvent } from "../store.js";
import { loadWorkspace } from "../workspace.js";
import {
  hookRetentionMetadata,
  retainHookContent,
  summarizeHookContent
} from "./capture-content.js";

const PERMISSION_MODES = new Set(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]);
const EVENT_MAP = Object.freeze({
  SessionStart: { kind: "session.started", title: "Codex session started", actor: { type: "system", id: "codex" } },
  UserPromptSubmit: { kind: "prompt.submitted", title: "User prompt submitted", actor: { type: "human", id: "local-user" } },
  PreToolUse: { kind: "tool.requested", title: "Codex tool requested", actor: { type: "agent", id: "codex" } },
  PermissionRequest: { kind: "approval", title: "Codex tool approval requested", actor: { type: "system", id: "codex" } },
  PostToolUse: { kind: "tool.completed", title: "Codex tool completed", actor: { type: "tool", id: "codex-tool" } },
  PreCompact: { kind: "compaction.started", title: "Codex context compaction started", actor: { type: "system", id: "codex" } },
  PostCompact: { kind: "compaction.completed", title: "Codex context compaction completed", actor: { type: "system", id: "codex" } },
  Stop: { kind: "turn.completed", title: "Codex turn completed", actor: { type: "agent", id: "codex" } },
  SubagentStart: { kind: "session.started", title: "Codex subagent started", actor: { type: "agent", id: "codex-subagent" } },
  SubagentStop: { kind: "turn.completed", title: "Codex subagent completed", actor: { type: "agent", id: "codex-subagent" } }
});

const SCHEMAS = Object.freeze({
  SessionStart: {
    required: ["cwd", "hook_event_name", "model", "permission_mode", "session_id", "source", "transcript_path"],
    optional: []
  },
  UserPromptSubmit: {
    required: ["cwd", "hook_event_name", "model", "permission_mode", "prompt", "session_id", "transcript_path", "turn_id"],
    optional: ["agent_id", "agent_type"]
  },
  PreToolUse: {
    required: ["cwd", "hook_event_name", "model", "permission_mode", "session_id", "tool_input", "tool_name", "tool_use_id", "transcript_path", "turn_id"],
    optional: ["agent_id", "agent_type"]
  },
  PermissionRequest: {
    required: ["cwd", "hook_event_name", "model", "permission_mode", "session_id", "tool_input", "tool_name", "transcript_path", "turn_id"],
    optional: ["agent_id", "agent_type"]
  },
  PostToolUse: {
    required: ["cwd", "hook_event_name", "model", "permission_mode", "session_id", "tool_input", "tool_name", "tool_response", "tool_use_id", "transcript_path", "turn_id"],
    optional: ["agent_id", "agent_type"]
  },
  PreCompact: {
    required: ["cwd", "hook_event_name", "model", "session_id", "transcript_path", "trigger", "turn_id"],
    optional: ["agent_id", "agent_type"]
  },
  PostCompact: {
    required: ["cwd", "hook_event_name", "model", "session_id", "transcript_path", "trigger", "turn_id"],
    optional: ["agent_id", "agent_type"]
  },
  Stop: {
    required: ["cwd", "hook_event_name", "last_assistant_message", "model", "permission_mode", "session_id", "stop_hook_active", "transcript_path", "turn_id"],
    optional: []
  },
  SubagentStart: {
    required: ["agent_id", "agent_type", "cwd", "hook_event_name", "model", "permission_mode", "session_id", "transcript_path", "turn_id"],
    optional: []
  },
  SubagentStop: {
    required: ["agent_id", "agent_transcript_path", "agent_type", "cwd", "hook_event_name", "last_assistant_message", "model", "permission_mode", "session_id", "stop_hook_active", "transcript_path", "turn_id"],
    optional: []
  }
});

function hookError(message) {
  throw new QarinahError("HOOK_INPUT_INVALID", message);
}

function validateString(input, field, { nullable = false } = {}) {
  const value = input[field];
  if (nullable && value === null) return;
  if (typeof value !== "string") hookError(`${field} must be ${nullable ? "a string or null" : "a string"}.`);
}

function validateHookInput(input, eventName) {
  const schema = SCHEMAS[eventName];
  const allowed = new Set([...schema.required, ...schema.optional]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) hookError(`Unsupported ${eventName} field(s): ${unknown.join(", ")}.`);
  const missing = schema.required.filter((field) => !Object.hasOwn(input, field));
  if (missing.length) hookError(`Missing ${eventName} field(s): ${missing.join(", ")}.`);

  for (const field of ["cwd", "model", "session_id", "turn_id", "agent_id", "agent_type", "tool_name", "tool_use_id", "prompt"]) {
    if (Object.hasOwn(input, field)) validateString(input, field);
  }
  for (const field of ["transcript_path", "agent_transcript_path", "last_assistant_message"]) {
    if (Object.hasOwn(input, field)) validateString(input, field, { nullable: true });
  }
  if (input.hook_event_name !== eventName) hookError("hook_event_name does not match the selected event schema.");
  if (Object.hasOwn(input, "permission_mode") && !PERMISSION_MODES.has(input.permission_mode)) hookError("permission_mode is invalid.");
  if (Object.hasOwn(input, "source") && !["startup", "resume", "clear", "compact"].includes(input.source)) hookError("source is invalid.");
  if (Object.hasOwn(input, "trigger") && !["manual", "auto"].includes(input.trigger)) hookError("trigger is invalid.");
  if (Object.hasOwn(input, "stop_hook_active") && typeof input.stop_hook_active !== "boolean") hookError("stop_hook_active must be a boolean.");
  return input;
}

function selected(input, names) {
  const output = Object.create(null);
  for (const name of names) {
    if (Object.hasOwn(input, name) && input[name] !== undefined && input[name] !== null) output[name] = input[name];
  }
  return output;
}

function deterministicHookEventId(input) {
  const stableIdentity = input.tool_use_id
    ? { toolUseId: input.tool_use_id }
    : (input.agent_id && input.hook_event_name.startsWith("Subagent")
      ? { agentId: input.agent_id }
      : (input.turn_id && ["UserPromptSubmit", "Stop"].includes(input.hook_event_name)
        ? { turnId: input.turn_id }
        : null));
  if (!stableIdentity) return null;
  const digest = sha256({
    sessionId: input.session_id,
    event: input.hook_event_name,
    ...stableIdentity
  }).slice("sha256:".length, "sha256:".length + 32).split("");
  digest[12] = "4";
  digest[16] = "8";
  const value = digest.join("");
  return `evt_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function bodyContentEntry(input) {
  switch (input.hook_event_name) {
    case "UserPromptSubmit": return ["prompt", input.prompt];
    case "Stop":
    case "SubagentStop": return ["assistantMessage", input.last_assistant_message];
    default: return null;
  }
}

function hookPayload(input, workspace) {
  const eventName = input.hook_event_name;
  const mapping = EVENT_MAP[eventName];
  const requestedCwd = path.resolve(input.cwd);
  const relativeCwd = path.relative(workspace.root, requestedCwd);
  const workspaceRelativeCwd = relativeCwd === "" || (!relativeCwd.startsWith("..") && !path.isAbsolute(relativeCwd))
    ? (relativeCwd || ".")
    : "[outside-workspace]";
  const metadata = {
    hookEvent: eventName,
    model: input.model,
    permissionMode: input.permission_mode ?? null,
    workspaceRelativeCwd,
    source: input.source ?? null,
    trigger: input.trigger ?? null,
    agentId: input.agent_id ?? null,
    agentType: input.agent_type ?? null,
    toolName: input.tool_name ?? null,
    toolUseId: input.tool_use_id ?? null,
    stopHookActive: input.stop_hook_active ?? null,
    prompt: summarizeHookContent(input.prompt),
    toolInput: summarizeHookContent(input.tool_input),
    toolOutput: summarizeHookContent(input.tool_response),
    assistantMessage: summarizeHookContent(input.last_assistant_message),
    transcriptAvailable: typeof input.transcript_path === "string" && input.transcript_path.length > 0,
    agentTranscriptAvailable: typeof input.agent_transcript_path === "string" && input.agent_transcript_path.length > 0
  };
  const contentValues = selected({
    prompt: input.prompt,
    toolInput: input.tool_input,
    toolOutput: input.tool_response,
    assistantMessage: input.last_assistant_message
  }, ["prompt", "toolInput", "toolOutput", "assistantMessage"]);
  const bodyEntry = bodyContentEntry(input);
  let bodyRetention = null;
  if (workspace.config.capture === "content" && bodyEntry && typeof bodyEntry[1] === "string") {
    bodyRetention = retainHookContent(bodyEntry[1]);
    delete contentValues[bodyEntry[0]];
  }
  const content = Object.fromEntries(
    Object.entries(contentValues).map(([key, value]) => [key, retainHookContent(value)])
  );
  const data = workspace.config.capture === "content"
    ? { ...metadata, content, bodyRetention: hookRetentionMetadata(bodyRetention) }
    : metadata;
  const relations = input.tool_use_id
    ? [{ type: eventName === "PostToolUse" ? "derived_from" : "references", target: `toolcall:${input.tool_use_id}` }]
    : [];
  const actor = eventName.startsWith("Subagent")
    ? { type: "agent", id: input.agent_id }
    : (input.agent_id && mapping.actor.type === "agent" ? { type: "agent", id: input.agent_id } : mapping.actor);
  const eventId = deterministicHookEventId(input);
  return {
    ...(eventId ? { eventId } : {}),
    kind: mapping.kind,
    actor,
    title: input.tool_name ? `${mapping.title}: ${input.tool_name}` : mapping.title,
    body: bodyRetention?.text ?? "",
    data,
    confidence: "extracted",
    relations,
    sessionId: input.session_id,
    turnId: input.turn_id ?? null,
    provenance: {
      adapter: "codex-hook",
      sourceId: [input.session_id, input.turn_id, eventName, input.tool_use_id, input.agent_id].filter(Boolean).join(":")
    },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
}

export async function captureCodexHook(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Codex hook input must be a JSON object.");
  const eventName = typeof input.hook_event_name === "string" ? input.hook_event_name : null;
  if (!Object.hasOwn(EVENT_MAP, eventName)) return Object.freeze({ captured: false, reason: "UNSUPPORTED_EVENT" });
  input = snapshotJsonBoundary(input, {
    label: `Codex ${eventName} hook input`,
    maximumBytes: 1024 * 1024,
    maximumStringLength: 512 * 1024,
    maximumArrayLength: 10_000,
    maximumObjectKeys: 2_000
  });
  validateHookInput(input, eventName);
  let workspace;
  try {
    workspace = await loadWorkspace(options.cwd || input.cwd || process.cwd());
  } catch (error) {
    if (error instanceof QarinahError && ["WORKSPACE_NOT_INITIALIZED", "WORKSPACE_DISABLED", "WORKSPACE_NOT_TRUSTED"].includes(error.code)) {
      return Object.freeze({ captured: false, reason: error.code });
    }
    throw error;
  }
  const payload = hookPayload(input, workspace);
  const event = await appendEvent(payload, { workspace, idempotent: Object.hasOwn(payload, "eventId") });
  return Object.freeze({ captured: true, eventId: event.eventId, hash: event.hash });
}
