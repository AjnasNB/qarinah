import assert from "node:assert/strict";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  captureCodexHook, capturePortableHook, configureAutoInit, createMcpServer, ensureAutoWorkspace,
  initializeWorkspace, loadWorkspace, readEvents, recallChatMemory, revokeWorkspaceTrust,
  recordModelChatSummary, setWorkspaceEnabled, verifyStore
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

test("auto-init creates isolated projects once, preserves stops, and retains cited visible chat", async (t) => {
  const sandbox = await realpath(await temporaryDirectory(t));
  // Isolate global policy and trust as well as project files.
  const previousState = process.env.QARINAH_STATE_DIR;
  process.env.QARINAH_STATE_DIR = path.join(sandbox, "machine-state");
  t.after(() => {
    if (previousState === undefined) delete process.env.QARINAH_STATE_DIR;
    else process.env.QARINAH_STATE_DIR = previousState;
  });
  const root = path.join(sandbox, "projects");
  await mkdir(root);
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  await mkdir(first);
  await mkdir(second);
  assert.equal((await ensureAutoWorkspace(first)).reason, "AUTO_INIT_DISABLED");
  await configureAutoInit({ enabled: true, capture: "content", roots: [root], fullChat: true });
  const result = await ensureAutoWorkspace(first, { exact: true });
  assert.equal(result.initialized, true);
  const initialId = result.workspace.config.workspaceId;
  assert.equal((await ensureAutoWorkspace(first, { exact: true })).workspace.config.workspaceId, initialId);
  const next = await ensureAutoWorkspace(second, { exact: true });
  assert.notEqual(next.workspace.config.workspaceId, initialId);

  const common = { cwd: first, model: "fixture-model", session_id: "chat-1", turn_id: "turn-1",
    permission_mode: "default", transcript_path: path.join(sandbox, "must-not-be-read.jsonl") };
  const secret = "sk-abcdefghijklmnopqrstuvwxyz";
  const prompt = "Remember the database migration uses an explicit tested rollback.";
  const response = `${"The migration must remain reversible. ".repeat(2200)}Exact final phrase: rollback complete. ${secret}`;
  const promptResult = await captureCodexHook({ ...common, hook_event_name: "UserPromptSubmit", prompt });
  const stopped = await captureCodexHook({ ...common, hook_event_name: "Stop", last_assistant_message: response, stop_hook_active: false });
  assert.equal(stopped.captured, true);
  const count = (await readEvents(first)).length;
  await captureCodexHook({ ...common, hook_event_name: "Stop", last_assistant_message: response, stop_hook_active: false });
  assert.equal((await readEvents(first)).length, count);
  const events = await readEvents(first);
  const chunks = events.filter((event) => event.data?.chatChunk?.parentEventId === stopped.eventId);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.map((event) => event.body).join("").includes("Exact final phrase: rollback complete."));
  assert.equal(JSON.stringify(events).includes(secret), false);
  const summary = events.find((event) => event.kind === "summary");
  assert.ok(summary);
  assert.ok(summary.data.sourceEvents.some((source) => source.eventId === promptResult.eventId));
  assert.ok(summary.data.sourceEvents.some((source) => source.eventId === stopped.eventId));
  const markdown = await readFile(path.join(first, ".qarinah", "records", "CHAT.md"), "utf8");
  assert.ok(markdown.includes("Exact final phrase: rollback complete."));
  assert.equal(markdown.includes(secret), false);

  const compact = await recallChatMemory("migration rollback", { cwd: first, detail: "summary", maxChars: 6000 });
  assert.equal(compact.items[0].kind, "summary");
  assert.ok(JSON.stringify(compact).length <= 6000);
  await assert.rejects(() => recallChatMemory("rollback", { cwd: first, detail: "full" }),
    /Full recall requires explicit cited source eventIds/u);
  const full = await recallChatMemory("rollback", { cwd: first, detail: "full", eventIds: [stopped.eventId],
    offset: response.length - 250, maxChars: 6000 });
  assert.ok(full.items[0].excerpt.includes("Exact final phrase: rollback complete."));
  assert.equal(JSON.stringify(full).includes(secret), false);
  const isolated = await recallChatMemory("rollback", { cwd: second });
  assert.equal(isolated.items.length, 0);
  await assert.rejects(() => recallChatMemory("rollback", { cwd: second, eventIds: [stopped.eventId] }),
    { code: "CONTEXT_RECALL_NOT_FOUND" });
  assert.equal((await verifyStore(first, { updateCheckpoint: false })).ok, true);

  await setWorkspaceEnabled(first, false);
  await assert.rejects(() => ensureAutoWorkspace(first), { code: "WORKSPACE_DISABLED" });
  await setWorkspaceEnabled(first, true);
  await revokeWorkspaceTrust(first);
  await assert.rejects(() => ensureAutoWorkspace(first), { code: "WORKSPACE_NOT_TRUSTED" });
  const stoppedProject = path.join(root, "stopped");
  await mkdir(stoppedProject);
  await writeFile(path.join(stoppedProject, ".qarinah-stop"), "");
  assert.equal((await ensureAutoWorkspace(stoppedProject)).reason, "AUTO_INIT_PROJECT_STOPPED");
  await assert.rejects(() => stat(path.join(stoppedProject, ".qarinah")));
  await configureAutoInit({ enabled: false });
  const third = path.join(root, "third");
  await mkdir(third);
  assert.equal((await ensureAutoWorkspace(third)).reason, "AUTO_INIT_DISABLED");
  await assert.rejects(() => stat(path.join(third, ".qarinah")));
});

test("auto-init policy cannot bless an existing untrusted ledger and diagnostics stay zero-write", async (t) => {
  const sandbox = await realpath(await temporaryDirectory(t));
  const previousState = process.env.QARINAH_STATE_DIR;
  process.env.QARINAH_STATE_DIR = path.join(sandbox, "machine-state");
  t.after(() => {
    if (previousState === undefined) delete process.env.QARINAH_STATE_DIR;
    else process.env.QARINAH_STATE_DIR = previousState;
  });
  const root = path.join(sandbox, "project");
  await mkdir(root);
  await configureAutoInit({ enabled: true, capture: "content", roots: [root], fullChat: true });
  const messages = [];
  const server = createMcpServer({ autoInitialize: true, write: (message) => messages.push(message) });
  await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } });
  await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "context_status", arguments: { workspace: root } } });
  assert.equal(messages.at(-1).result.isError, true);
  await assert.rejects(() => stat(path.join(root, ".qarinah")));
  assert.equal(server.tools.find((tool) => tool.name === "context.ensure_workspace").annotations.readOnlyHint, false);
  await server.handle({ jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "context.ensure_workspace", arguments: { workspace: root } } });
  assert.equal(messages.at(-1).result.structuredContent.initialized, true);
  const workspace = await loadWorkspace(root);
  await capturePortableHook("cursor", {
    hook_event_name: "beforeSubmitPrompt", workspace_roots: [root],
    conversation_id: "cursor-chat", generation_id: "cursor-turn", prompt: "Use accessible focus management.",
    user_email: "must-not-be-retained@example.invalid"
  });
  await capturePortableHook("cursor", {
    hook_event_name: "afterAgentResponse", workspace_roots: [root],
    conversation_id: "cursor-chat", generation_id: "cursor-turn", text: "Focus management is implemented and tested."
  });
  const events = await readEvents(root, { updateCheckpoint: false });
  assert.equal(JSON.stringify(events).includes("must-not-be-retained"), false);
  const logPath = path.join(workspace.qarinahDir, "events", "events.jsonl");
  const before = await stat(logPath, { bigint: true });
  await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "context.recall", arguments: { workspace: root, query: "focus management", detail: "summary" } } });
  assert.equal(messages.at(-1).result.isError, undefined);
  const after = await stat(logPath, { bigint: true });
  assert.equal(after.mtimeNs, before.mtimeNs);
  assert.equal(after.size, before.size);
  const sourceId = events.find((event) => event.kind === "turn.completed").eventId;
  const modelSummary = await recordModelChatSummary({ cwd: root, title: "Accessible focus", text: "Restore focus after closing the dialog.", eventIds: [sourceId] });
  assert.equal(modelSummary.confidence, "inferred");
  await assert.rejects(() => recordModelChatSummary({ cwd: root, title: "Invalid source", text: "Do not fabricate evidence.",
    eventIds: ["evt_00000000-0000-4000-8000-000000000000"] }), { code: "CONTEXT_RECALL_NOT_FOUND" });
  assert.equal((await realpath(root)), workspace.root);
  server.close();
});
