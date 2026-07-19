import assert from "node:assert/strict";
import test from "node:test";
import { captureClaudeHook, initializeWorkspace, readEvents } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

function common(root, eventName, overrides = {}) {
  return {
    session_id: "claude-session",
    prompt_id: "550e8400-e29b-41d4-a716-446655440000",
    transcript_path: "C:/ignored/claude-transcript.jsonl",
    cwd: root,
    permission_mode: "default",
    hook_event_name: eventName,
    ...overrides
  };
}

const inputs = {
  SessionStart: (root) => common(root, "SessionStart", { source: "startup", model: "claude-opus-4-1", session_title: "Release" }),
  UserPromptSubmit: (root) => common(root, "UserPromptSubmit", { prompt: "Prepare a governed release." }),
  PreToolUse: (root) => common(root, "PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_use_id: "tool-pre" }),
  PostToolUse: (root) => common(root, "PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: { stdout: "passed" }, tool_use_id: "tool-post", duration_ms: 12 }),
  PostToolUseFailure: (root) => common(root, "PostToolUseFailure", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_use_id: "tool-failed", error: "Command failed", is_interrupt: false, duration_ms: 14 }),
  PermissionDenied: (root) => common(root, "PermissionDenied", { permission_mode: "auto", tool_name: "Bash", tool_input: { command: "remove output" }, tool_use_id: "tool-denied", reason: "Outside the approved workspace." }),
  PreCompact: (root) => common(root, "PreCompact", { trigger: "auto", custom_instructions: "Keep release decisions." }),
  PostCompact: (root) => common(root, "PostCompact", { trigger: "auto", compact_summary: "The release remains approval-gated." }),
  Stop: (root) => common(root, "Stop", { stop_hook_active: false, last_assistant_message: "Checks passed.", background_tasks: [], session_crons: [] }),
  StopFailure: (root) => common(root, "StopFailure", { error: "rate_limit", error_details: "429 Too Many Requests", last_assistant_message: "API Error: Rate limit reached" }),
  SubagentStart: (root) => common(root, "SubagentStart", { agent_id: "agent-1", agent_type: "Explore" }),
  SubagentStop: (root) => common(root, "SubagentStop", { stop_hook_active: false, agent_id: "agent-1", agent_type: "Explore", agent_transcript_path: "C:/ignored/subagent.jsonl", last_assistant_message: "Audit complete." }),
  SessionEnd: (root) => common(root, "SessionEnd", { reason: "other" })
};

test("Claude capture is inert outside an opted-in workspace", async (t) => {
  const root = await temporaryDirectory(t);
  assert.deepEqual(await captureClaudeHook(inputs.SessionStart(root)), {
    captured: false,
    reason: "WORKSPACE_NOT_INITIALIZED"
  });
});

test("current Claude Code lifecycle shapes are captured without transcript reads", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  for (const [eventName, makeInput] of Object.entries(inputs)) {
    const result = await captureClaudeHook(makeInput(root));
    assert.equal(result.captured, true, eventName);
  }
  const events = await readEvents(root);
  assert.equal(events.length, Object.keys(inputs).length);
  assert.equal(events.find((event) => event.data.hookEvent === "PostCompact").data.compactSummary.present, true);
  assert.equal(events.find((event) => event.data.hookEvent === "PostToolUseFailure").data.toolName, "Bash");
  assert.equal(events.find((event) => event.data.hookEvent === "PermissionDenied").kind, "approval");
  assert.equal(events.find((event) => event.data.hookEvent === "StopFailure").data.failureType, "rate_limit");
  assert.equal(events.find((event) => event.data.hookEvent === "SubagentStop").data.agentId, "agent-1");
  assert.equal(JSON.stringify(events).includes("claude-transcript.jsonl"), false);
});

test("Claude hook capture is idempotent and ignores new host values without retaining them", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const input = { ...inputs.PostToolUse(root), future_private_value: "DO_NOT_RETAIN" };
  const first = await captureClaudeHook(input);
  const second = await captureClaudeHook(input);
  assert.deepEqual(second, first);
  const [event] = await readEvents(root);
  assert.deepEqual(event.data.ignoredFields, ["future_private_value"]);
  assert.equal(JSON.stringify(event).includes("DO_NOT_RETAIN"), false);
});

test("Claude metadata uses coarse summaries and content mode retains bounded redacted fields", async (t) => {
  const metadataRoot = await temporaryDirectory(t);
  await initializeWorkspace(metadataRoot);
  await captureClaudeHook(common(metadataRoot, "PreToolUse", {
    effort: { level: "max" },
    tool_name: "Bash",
    tool_input: { authorization: "Bearer top-secret-token", command: "npm test" },
    tool_use_id: "tool-secret"
  }));
  const [metadataEvent] = await readEvents(metadataRoot);
  assert.equal(metadataEvent.data.effortLevel, "max");
  assert.equal(Object.hasOwn(metadataEvent.data, "content"), false);
  assert.equal(Object.hasOwn(metadataEvent.data.toolInput, "hash"), false);
  assert.equal(Object.hasOwn(metadataEvent.data.toolInput, "chars"), false);
  assert.equal(JSON.stringify(metadataEvent).includes("top-secret-token"), false);

  const contentRoot = await temporaryDirectory(t);
  await initializeWorkspace(contentRoot, { capture: "content" });
  await captureClaudeHook(common(contentRoot, "PostCompact", {
    trigger: "manual",
    compact_summary: "Keep sk-abcdefghijklmnopqrstuvwxyz out of context."
  }));
  const [contentEvent] = await readEvents(contentRoot);
  assert.equal(contentEvent.body, "Keep [REDACTED] out of context.");
  assert.equal(Object.hasOwn(contentEvent.data.content, "compactSummary"), false);
  assert.equal(contentEvent.data.bodyRetention.truncated, false);
});

test("Claude preserves repeated host events that have no guaranteed unique id", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const compact = { ...inputs.PreCompact(root) };
  delete compact.prompt_id;
  await captureClaudeHook(compact);
  await captureClaudeHook(compact);
  const prompt = common(root, "UserPromptSubmit", { prompt: "same prompt" });
  delete prompt.prompt_id;
  await captureClaudeHook(prompt);
  await captureClaudeHook(prompt);
  const session = { ...inputs.SessionStart(root), source: "compact" };
  delete session.prompt_id;
  await captureClaudeHook(session);
  await captureClaudeHook(session);
  assert.equal((await readEvents(root)).length, 6);
});

test("Claude content mode records oversized and combined tool content within event limits", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const secret = "sk-abcdefghijklmnopqrstuvwxyz";
  await captureClaudeHook(common(root, "UserPromptSubmit", {
    prompt_id: "large-prompt",
    prompt: `${secret}\n${"p".repeat(512 * 1024 - secret.length - 1)}`
  }));
  await captureClaudeHook(common(root, "PostToolUse", {
    prompt_id: "large-tool",
    tool_name: "Fixture",
    tool_use_id: "large-tool-use",
    tool_input: { text: "i".repeat(100_000) },
    tool_response: { text: "o".repeat(100_000) }
  }));
  const events = await readEvents(root);
  assert.equal(events.length, 2);
  assert.ok(events[0].body.length <= 48_000);
  assert.equal(events[1].data.content.toolInput.truncated, true);
  assert.equal(events[1].data.content.toolOutput.truncated, true);
  assert.equal(JSON.stringify(events).includes(secret), false);
});

test("Claude known fields are validated and unknown events are ignored", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const missing = inputs.PostToolUse(root);
  delete missing.tool_response;
  await assert.rejects(() => captureClaudeHook(missing), (error) => error.code === "HOOK_INPUT_INVALID");
  await assert.rejects(
    () => captureClaudeHook({ ...inputs.PreToolUse(root), effort: { level: "ultra" } }),
    (error) => error.code === "HOOK_INPUT_INVALID"
  );
  assert.deepEqual(await captureClaudeHook({ hook_event_name: "FutureEvent", cwd: root }), {
    captured: false,
    reason: "UNSUPPORTED_EVENT"
  });
});
