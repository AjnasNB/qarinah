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

const PERMISSION_MODES = new Set(["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]);
const EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
const COMMON_FIELDS = Object.freeze([
  "session_id",
  "prompt_id",
  "transcript_path",
  "cwd",
  "permission_mode",
  "effort",
  "hook_event_name",
  "agent_id",
  "agent_type"
]);

const EVENT_MAP = Object.freeze({
  SessionStart: {
    kind: "session.started",
    title: "Claude Code session started",
    actor: { type: "system", id: "claude-code" },
    required: ["source"],
    optional: ["model", "session_title"]
  },
  UserPromptSubmit: {
    kind: "prompt.submitted",
    title: "User prompt submitted",
    actor: { type: "human", id: "local-user" },
    required: ["prompt"],
    optional: []
  },
  PreToolUse: {
    kind: "tool.requested",
    title: "Claude Code tool requested",
    actor: { type: "agent", id: "claude-code" },
    required: ["tool_name", "tool_input", "tool_use_id"],
    optional: []
  },
  PostToolUse: {
    kind: "tool.completed",
    title: "Claude Code tool completed",
    actor: { type: "tool", id: "claude-code-tool" },
    required: ["tool_name", "tool_input", "tool_response", "tool_use_id"],
    optional: ["duration_ms"]
  },
  PostToolUseFailure: {
    kind: "tool.completed",
    title: "Claude Code tool failed",
    actor: { type: "tool", id: "claude-code-tool" },
    required: ["tool_name", "tool_input", "tool_use_id", "error"],
    optional: ["is_interrupt", "duration_ms"]
  },
  PermissionDenied: {
    kind: "approval",
    title: "Claude Code tool permission denied",
    actor: { type: "system", id: "claude-code" },
    required: ["tool_name", "tool_input", "tool_use_id", "reason"],
    optional: []
  },
  PreCompact: {
    kind: "compaction.started",
    title: "Claude Code context compaction started",
    actor: { type: "system", id: "claude-code" },
    required: ["trigger", "custom_instructions"],
    optional: []
  },
  PostCompact: {
    kind: "compaction.completed",
    title: "Claude Code context compaction completed",
    actor: { type: "system", id: "claude-code" },
    required: ["trigger", "compact_summary"],
    optional: []
  },
  Stop: {
    kind: "turn.completed",
    title: "Claude Code turn completed",
    actor: { type: "agent", id: "claude-code" },
    required: ["stop_hook_active", "last_assistant_message"],
    optional: ["background_tasks", "session_crons"]
  },
  StopFailure: {
    kind: "turn.completed",
    title: "Claude Code turn failed",
    actor: { type: "system", id: "claude-code" },
    required: ["error"],
    optional: ["error_details", "last_assistant_message"]
  },
  SubagentStart: {
    kind: "session.started",
    title: "Claude Code subagent started",
    actor: { type: "agent", id: "claude-code-subagent" },
    required: ["agent_id", "agent_type"],
    optional: []
  },
  SubagentStop: {
    kind: "turn.completed",
    title: "Claude Code subagent completed",
    actor: { type: "agent", id: "claude-code-subagent" },
    required: ["stop_hook_active", "agent_id", "agent_type", "agent_transcript_path", "last_assistant_message"],
    optional: ["background_tasks", "session_crons"]
  },
  SessionEnd: {
    kind: "turn.completed",
    title: "Claude Code session ended",
    actor: { type: "system", id: "claude-code" },
    required: ["reason"],
    optional: []
  }
});

function hookError(message) {
  throw new QarinahError("HOOK_INPUT_INVALID", message);
}

function requireString(input, field, { nullable = false, optional = false } = {}) {
  if (!Object.hasOwn(input, field)) {
    if (optional) return;
    hookError(`${field} is required.`);
  }
  const value = input[field];
  if (nullable && value === null) return;
  if (typeof value !== "string") hookError(`${field} must be ${nullable ? "a string or null" : "a string"}.`);
}

function validateClaudeHookInput(value, eventName) {
  const input = snapshotJsonBoundary(value, {
    label: `Claude Code ${eventName} hook input`,
    maximumBytes: 1024 * 1024,
    maximumStringLength: 512 * 1024,
    maximumArrayLength: 10_000,
    maximumObjectKeys: 2_000
  });
  const schema = EVENT_MAP[eventName];
  for (const field of ["session_id", "cwd", "hook_event_name"]) requireString(input, field);
  requireString(input, "transcript_path", { nullable: true });
  for (const field of schema.required) {
    if (!Object.hasOwn(input, field)) hookError(`${field} is required.`);
  }
  for (const field of [
    "prompt_id", "permission_mode", "agent_id", "agent_type", "source", "model", "session_title",
    "prompt", "tool_name", "tool_use_id", "trigger", "custom_instructions", "compact_summary",
    "last_assistant_message", "reason", "error", "error_details"
  ]) {
    if (Object.hasOwn(input, field)) requireString(input, field, { nullable: field === "last_assistant_message" });
  }
  if (Object.hasOwn(input, "agent_transcript_path")) requireString(input, "agent_transcript_path", { nullable: true });
  if (input.hook_event_name !== eventName) hookError("hook_event_name does not match the selected event schema.");
  if (Object.hasOwn(input, "permission_mode") && !PERMISSION_MODES.has(input.permission_mode)) {
    hookError("permission_mode is invalid.");
  }
  if (Object.hasOwn(input, "effort")) {
    if (!input.effort || typeof input.effort !== "object" || Array.isArray(input.effort)
      || !EFFORT_LEVELS.has(input.effort.level)) hookError("effort.level is invalid.");
  }
  if (Object.hasOwn(input, "source") && !["startup", "resume", "clear", "compact"].includes(input.source)) {
    hookError("source is invalid.");
  }
  if (Object.hasOwn(input, "trigger") && !["manual", "auto"].includes(input.trigger)) hookError("trigger is invalid.");
  if (Object.hasOwn(input, "stop_hook_active") && typeof input.stop_hook_active !== "boolean") {
    hookError("stop_hook_active must be a boolean.");
  }
  if (Object.hasOwn(input, "is_interrupt") && typeof input.is_interrupt !== "boolean") {
    hookError("is_interrupt must be a boolean.");
  }
  if (Object.hasOwn(input, "duration_ms")
    && (!Number.isSafeInteger(input.duration_ms) || input.duration_ms < 0)) hookError("duration_ms must be a non-negative integer.");
  for (const field of ["background_tasks", "session_crons"]) {
    if (Object.hasOwn(input, field) && !Array.isArray(input[field])) hookError(`${field} must be an array.`);
  }
  const allowed = new Set([...COMMON_FIELDS, ...schema.required, ...schema.optional]);
  const ignoredFields = Object.keys(input).filter((field) => !allowed.has(field)).sort();
  return { input, ignoredFields };
}

function selected(input, names) {
  const output = Object.create(null);
  for (const name of names) {
    if (Object.hasOwn(input, name) && input[name] !== undefined && input[name] !== null) output[name] = input[name];
  }
  return output;
}

function deterministicClaudeEventId(input) {
  const stableIdentity = input.tool_use_id
    ? { toolUseId: input.tool_use_id }
    : (input.agent_id && input.hook_event_name.startsWith("Subagent")
      ? { agentId: input.agent_id }
      : (input.prompt_id && ["UserPromptSubmit", "Stop"].includes(input.hook_event_name)
        ? { promptId: input.prompt_id }
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
    case "PostCompact": return ["compactSummary", input.compact_summary];
    case "PostToolUseFailure": return ["error", input.error];
    case "PermissionDenied": return ["denialReason", input.reason];
    case "StopFailure": return ["error", input.error_details ?? input.last_assistant_message ?? input.error];
    default: return null;
  }
}

function hookPayload(input, ignoredFields, workspace) {
  const eventName = input.hook_event_name;
  const mapping = EVENT_MAP[eventName];
  const requestedCwd = path.resolve(input.cwd);
  const relativeCwd = path.relative(workspace.root, requestedCwd);
  const workspaceRelativeCwd = relativeCwd === "" || (!relativeCwd.startsWith("..") && !path.isAbsolute(relativeCwd))
    ? (relativeCwd || ".")
    : "[outside-workspace]";
  const metadata = {
    host: "claude-code",
    hookEvent: eventName,
    model: input.model ?? null,
    permissionMode: input.permission_mode ?? null,
    effortLevel: input.effort?.level ?? null,
    workspaceRelativeCwd,
    promptId: input.prompt_id ?? null,
    source: input.source ?? null,
    trigger: input.trigger ?? null,
    reason: eventName === "SessionEnd" ? input.reason ?? null : null,
    agentId: input.agent_id ?? null,
    agentType: input.agent_type ?? null,
    toolName: input.tool_name ?? null,
    toolUseId: input.tool_use_id ?? null,
    durationMs: input.duration_ms ?? null,
    isInterrupt: input.is_interrupt ?? null,
    failureType: eventName === "StopFailure" ? input.error : null,
    stopHookActive: input.stop_hook_active ?? null,
    ignoredFields,
    prompt: summarizeHookContent(input.prompt),
    toolInput: summarizeHookContent(input.tool_input),
    toolOutput: summarizeHookContent(input.tool_response),
    error: summarizeHookContent(eventName === "StopFailure" ? input.error_details : input.error),
    denialReason: summarizeHookContent(eventName === "PermissionDenied" ? input.reason : null),
    assistantMessage: summarizeHookContent(input.last_assistant_message),
    compactSummary: summarizeHookContent(input.compact_summary),
    customInstructions: summarizeHookContent(input.custom_instructions),
    backgroundTasks: summarizeHookContent(input.background_tasks),
    sessionCrons: summarizeHookContent(input.session_crons),
    transcriptAvailable: typeof input.transcript_path === "string" && input.transcript_path.length > 0,
    agentTranscriptAvailable: typeof input.agent_transcript_path === "string" && input.agent_transcript_path.length > 0
  };
  const contentValues = selected({
    prompt: input.prompt,
    toolInput: input.tool_input,
    toolOutput: input.tool_response,
    error: eventName === "StopFailure" ? input.error_details : input.error,
    denialReason: eventName === "PermissionDenied" ? input.reason : undefined,
    assistantMessage: input.last_assistant_message,
    compactSummary: input.compact_summary,
    customInstructions: input.custom_instructions
  }, ["prompt", "toolInput", "toolOutput", "error", "denialReason", "assistantMessage", "compactSummary", "customInstructions"]);
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
    ? [{
      type: ["PostToolUse", "PostToolUseFailure"].includes(eventName) ? "derived_from" : "references",
      target: `toolcall:${input.tool_use_id}`
    }]
    : [];
  const actor = eventName.startsWith("Subagent")
    ? { type: "agent", id: input.agent_id }
    : (input.agent_id && mapping.actor.type === "agent" ? { type: "agent", id: input.agent_id } : mapping.actor);
  const eventId = deterministicClaudeEventId(input);
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
    turnId: input.prompt_id ?? null,
    provenance: {
      adapter: "claude-code-hook",
      sourceId: [input.session_id, input.prompt_id, eventName, input.tool_use_id, input.agent_id].filter(Boolean).join(":")
    },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
}

export async function captureClaudeHook(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Claude Code hook input must be a JSON object.");
  const eventName = typeof value.hook_event_name === "string" ? value.hook_event_name : null;
  if (!Object.hasOwn(EVENT_MAP, eventName)) return Object.freeze({ captured: false, reason: "UNSUPPORTED_EVENT" });
  const { input, ignoredFields } = validateClaudeHookInput(value, eventName);
  let workspace;
  try {
    workspace = await loadWorkspace(options.cwd || input.cwd || process.cwd());
  } catch (error) {
    if (error instanceof QarinahError && ["WORKSPACE_NOT_INITIALIZED", "WORKSPACE_DISABLED", "WORKSPACE_NOT_TRUSTED"].includes(error.code)) {
      return Object.freeze({ captured: false, reason: error.code });
    }
    throw error;
  }
  const payload = hookPayload(input, ignoredFields, workspace);
  const event = await appendEvent(payload, { workspace, idempotent: Object.hasOwn(payload, "eventId") });
  return Object.freeze({ captured: true, eventId: event.eventId, hash: event.hash });
}
