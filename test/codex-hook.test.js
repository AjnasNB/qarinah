import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { captureCodexHook, initializeWorkspace, readEvents } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "codex-hooks.json");
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));

function fixture(name, cwd, overrides = {}) {
  return { ...fixtures[name], cwd, ...overrides };
}

test("Codex capture is inert outside an opted-in workspace", async (t) => {
  const root = await temporaryDirectory(t);
  assert.deepEqual(await captureCodexHook(fixture("SessionStart", root)), {
    captured: false,
    reason: "WORKSPACE_NOT_INITIALIZED"
  });
});

test("all exact upstream Codex hook fixtures are accepted", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  for (const eventName of Object.keys(fixtures)) {
    const result = await captureCodexHook(fixture(eventName, root));
    assert.equal(result.captured, true, eventName);
  }
  const events = await readEvents(root);
  assert.equal(events.length, Object.keys(fixtures).length);
  assert.equal(events.find((event) => event.data.hookEvent === "PreCompact").data.trigger, "auto");
  assert.equal(events.find((event) => event.data.hookEvent === "PermissionRequest").data.toolName, "Bash");
  assert.equal(events.find((event) => event.data.hookEvent === "SubagentStart").data.agentId, "agent-test-001");
  assert.equal(events.find((event) => event.data.hookEvent === "SubagentStop").data.agentId, "agent-test-001");
});

test("replayed host hook events are idempotent", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const input = fixture("PostToolUse", root);
  const first = await captureCodexHook(input);
  const second = await captureCodexHook(input);
  assert.deepEqual(second, first);
  assert.equal((await readEvents(root)).length, 1);
});

test("Codex preserves repeated session starts that have no unique host event id", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const first = await captureCodexHook(fixture("SessionStart", root, {
    source: "resume",
    model: "model-before-resume"
  }));
  const second = await captureCodexHook(fixture("SessionStart", root, {
    source: "resume",
    model: "model-after-resume"
  }));
  assert.notEqual(second.eventId, first.eventId);
  assert.deepEqual((await readEvents(root)).map((event) => event.data.model), [
    "model-before-resume",
    "model-after-resume"
  ]);
});

test("metadata capture stores only coarse content presence and size", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const result = await captureCodexHook(fixture("PreToolUse", root, {
    tool_input: { authorization: "Bearer top-secret-token", command: "npm test" }
  }));
  assert.equal(result.captured, true);
  const [event] = await readEvents(root);
  assert.equal(event.body, "");
  assert.equal(Object.hasOwn(event.data, "content"), false);
  assert.equal(event.data.toolInput.present, true);
  assert.equal(typeof event.data.toolInput.sizeClass, "string");
  assert.equal(Object.hasOwn(event.data.toolInput, "hash"), false);
  assert.equal(Object.hasOwn(event.data.toolInput, "chars"), false);
  assert.equal(JSON.stringify(event).includes("top-secret-token"), false);
});

test("content capture stores exposed completion data and recursively redacts", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await captureCodexHook(fixture("Stop", root, {
    last_assistant_message: "Deployed with sk-abcdefghijklmnopqrstuvwxyz"
  }));
  const [event] = await readEvents(root);
  assert.equal(event.body, "Deployed with [REDACTED]");
  assert.equal(Object.hasOwn(event.data.content, "assistantMessage"), false);
  assert.equal(event.data.bodyRetention.truncated, false);
  assert.equal(event.data.bodyRetention.retainedChars, event.body.length);
  assert.equal(event.data.assistantMessage.present, true);
  assert.ok(event.relations.some((relation) => relation.type === "references" && relation.target === `session:${fixtures.Stop.session_id}`));
  assert.ok(event.relations.some((relation) => relation.type === "affects" && relation.target === `turn:${fixtures.Stop.turn_id}`));
  assert.ok(event.relations.some((relation) => relation.type === "derived_from" && relation.target.startsWith("evt_")));
});

test("content capture bounds oversized prompts without losing the event", async (t) => {
  for (const length of [65_536, 65_537, 70_000, 512 * 1024]) {
    const root = await temporaryDirectory(t);
    await initializeWorkspace(root, { capture: "content" });
    const secret = "sk-abcdefghijklmnopqrstuvwxyz";
    const prompt = `${secret}\n${"x".repeat(length - secret.length - 1)}`;
    const result = await captureCodexHook(fixture("UserPromptSubmit", root, {
      prompt,
      turn_id: `turn-${length}`
    }));
    assert.equal(result.captured, true);
    const [event] = await readEvents(root);
    assert.ok(event.body.length <= 48_000);
    assert.equal(event.data.bodyRetention.sourceChars > event.data.bodyRetention.retainedChars, length > 48_000);
    assert.equal(JSON.stringify(event).includes(secret), false);
  }
});

test("known hook schemas reject missing and additional fields", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const missing = fixture("PostToolUse", root);
  delete missing.tool_response;
  await assert.rejects(() => captureCodexHook(missing), (error) => error.code === "HOOK_INPUT_INVALID");
  await assert.rejects(
    () => captureCodexHook({ ...fixture("SessionStart", root), invented: true }),
    (error) => error.code === "HOOK_INPUT_INVALID"
  );
});

test("unknown host lifecycle events are ignored", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  assert.deepEqual(await captureCodexHook({ hook_event_name: "FutureEvent", cwd: root }), {
    captured: false,
    reason: "UNSUPPORTED_EVENT"
  });
  assert.equal((await readEvents(root)).length, 0);
});
