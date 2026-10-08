import path from "node:path";
import { loadHookWorkspace } from "../auto-init.js";
import { sha256 } from "../canonical.js";
import { finishCapturedHook } from "../chat-memory.js";
import { reviewMetadataEventInput } from "../capture-policy.js";
import { snapshotJsonBoundary } from "../interoperability/boundary.js";
import { appendEvent } from "../store.js";
import { retainHookContent, summarizeHookContent } from "./capture-content.js";

const CURSOR_EVENTS = Object.freeze({
  sessionStart: "session.started",
  beforeSubmitPrompt: "prompt.submitted",
  afterAgentResponse: "turn.completed",
  preToolUse: "tool.requested",
  postToolUse: "tool.completed",
  postToolUseFailure: "tool.completed",
  preCompact: "compaction.started",
  stop: "turn.completed",
  sessionEnd: "turn.completed",
  workspaceOpen: "session.started"
});
const ANTIGRAVITY_EVENTS = Object.freeze({
  PreInvocation: "session.started", PostInvocation: "turn.completed",
  PreToolUse: "tool.requested", PostToolUse: "tool.completed", Stop: "turn.completed"
});

function eventId(value) {
  const digits = sha256(value).slice(7, 39).split("");
  digits[12] = "4";
  digits[16] = "8";
  const hex = digits.join("");
  return `evt_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function capturePortableHook(adapter, value, options = {}) {
  if (!["cursor", "antigravity", "opencode", "kilo"].includes(adapter)) throw new TypeError("Unsupported portable host adapter.");
  const input = snapshotJsonBoundary(value, { label: `${adapter} hook`, maximumBytes: 1024 * 1024,
    maximumStringLength: 512 * 1024, maximumArrayLength: 10000, maximumObjectKeys: 2000 });
  const mapping = adapter === "antigravity" ? ANTIGRAVITY_EVENTS : CURSOR_EVENTS;
  const eventName = options.eventName ?? input.hook_event_name;
  if (!Object.hasOwn(mapping, eventName)) return Object.freeze({ captured: false, reason: "UNSUPPORTED_EVENT" });
  const roots = adapter === "antigravity" ? input.workspacePaths : input.workspace_roots;
  if (!Array.isArray(roots) || roots.length !== 1 || typeof roots[0] !== "string" || !path.isAbsolute(roots[0])) {
    return Object.freeze({ captured: false, reason: "HOST_WORKSPACE_AMBIGUOUS" });
  }
  const sessionId = adapter === "antigravity" ? input.conversationId : input.conversation_id ?? input.session_id;
  if (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length > 256)) {
    throw new TypeError("Host session ID must be a bounded string.");
  }
  let workspace;
  try {
    workspace = await loadHookWorkspace(roots[0]);
  } catch (error) {
    if (["WORKSPACE_NOT_INITIALIZED", "WORKSPACE_DISABLED", "WORKSPACE_NOT_TRUSTED",
      "AUTO_INIT_EXCLUDED", "AUTO_INIT_PROJECT_STOPPED"].includes(error?.code)) {
      return Object.freeze({ captured: false, reason: error.code });
    }
    throw error;
  }
  const message = eventName === "beforeSubmitPrompt" ? input.prompt
    : eventName === "afterAgentResponse" ? input.text : null;
  if (message !== null && typeof message !== "string") throw new TypeError("Visible host message must be a string.");
  const retained = workspace.config.capture === "content" && message !== null ? retainHookContent(message) : null;
  const toolName = input.tool_name ?? input.toolCall?.name ?? null;
  const toolInput = input.tool_input ?? input.toolCall?.args;
  const toolOutput = input.tool_output ?? input.error_message ?? input.error;
  const turnId = String(input.generation_id ?? input.invocationNum ?? input.executionNum ?? input.stepIdx ?? "session").slice(0, 256);
  const data = {
    host: adapter, hookEvent: eventName, model: String(input.model_id ?? input.model ?? input.modelName ?? "unknown").slice(0, 256),
    toolName: typeof toolName === "string" ? toolName.slice(0, 256) : null,
    message: summarizeHookContent(message), toolInput: summarizeHookContent(toolInput), toolOutput: summarizeHookContent(toolOutput),
    transcriptAvailable: typeof (input.transcript_path ?? input.transcriptPath) === "string",
    ...(retained ? { bodyRetention: { sourceChars: retained.sourceChars, retainedChars: retained.retainedChars, truncated: retained.truncated } } : {})
  };
  // Never retain user_email, transcript paths, artifact directories, model
  // thoughts, or arbitrary extra fields delivered by the host.
  if (workspace.config.capture === "content") {
    data.content = {};
    if (toolInput !== undefined) data.content.toolInput = retainHookContent(toolInput);
    if (toolOutput !== undefined) data.content.toolOutput = retainHookContent(toolOutput);
  }
  const identity = [adapter, sessionId ?? "workspace", turnId, eventName, input.tool_use_id ?? null, message === null ? null : sha256(message)];
  const payload = {
    eventId: eventId(identity), kind: mapping[eventName],
    actor: { type: eventName === "beforeSubmitPrompt" ? "human" : "agent", id: adapter },
    title: `${adapter} ${eventName}`, body: retained?.text ?? "", data,
    sessionId: sessionId ?? null, turnId, confidence: "extracted", relations: [],
    provenance: { adapter: `${adapter}-hook`, sourceId: sha256(identity) },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
  const event = await appendEvent(workspace.config.capture === "metadata" ? reviewMetadataEventInput(payload) : payload,
    { workspace, capture: workspace.config.capture, idempotent: true });
  await finishCapturedHook(workspace, event, { ...input, hook_event_name: eventName });
  return Object.freeze({ captured: true, eventId: event.eventId, hash: event.hash });
}
