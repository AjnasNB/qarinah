import assert from "node:assert/strict";
import { access, link, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  compileContext,
  buildProjectOverview,
  importAgentArchive,
  initializeWorkspace,
  inspectSqliteReadModel,
  loadWorkspace,
  readEvents
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

test("initialization creates an empty rebuildable SQLite read model", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "metadata" });
  await access(path.join(root, ".qarinah", "index", "qarinah.db"));
  const report = await inspectSqliteReadModel(await loadWorkspace(root));
  assert.equal(report.eventCount, 0);
  assert.equal(report.headHash, null);
  assert.ok(report.tables.includes("events_fts"));
});

test("compact Codex archive import records a cited session outcome without reasoning", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const archive = path.join(root, "codex-export.jsonl");
  const records = [
    { type: "session_meta", payload: { id: "session-archive-1", timestamp: "2026-01-11T08:00:00.000Z" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Initialize SQLite and map the billing service graph." }], timestamp: "2026-01-11T08:01:00.000Z" } },
    { type: "response_item", payload: { type: "reasoning", summary: [{ type: "summary_text", text: "PRIVATE_REASONING_MARKER" }], encrypted_content: "SECRET_REASONING" } },
    { type: "response_item", payload: { type: "function_call", name: "shell_command", arguments: "npm test", call_id: "call-1", timestamp: "2026-01-11T08:02:00.000Z" } },
    { type: "response_item", payload: { type: "function_call_output", output: "All 42 tests passed.", call_id: "call-1", timestamp: "2026-01-11T08:03:00.000Z" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "SQLite is initialized, the graph is built, and all tests pass." }], timestamp: "2026-01-11T08:04:00.000Z" } }
  ];
  await writeFile(archive, `${records.map(JSON.stringify).join("\n")}\n`, "utf8");

  const result = await importAgentArchive(archive, { cwd: root, format: "codex", mode: "compact" });
  assert.equal(result.filesRead, 1);
  assert.equal(result.recordsSeen, 6);
  assert.equal(result.sessions, 1);
  assert.equal(result.importedEvents, 1);
  const events = await readEvents(root);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "summary");
  assert.match(events[0].body, /SQLite is initialized/);
  assert.match(events[0].body, /shell_command/);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_REASONING_MARKER|SECRET_REASONING/);
  const pack = await compileContext("SQLite graph", { cwd: root, minimumCoverage: "direct" });
  assert.equal(pack.items[0].eventId, events[0].eventId);
});

test("full portable archive import preserves visible messages and is idempotent", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const archive = path.join(root, "portable.ndjson");
  const records = [
    { type: "session", sessionId: "portable-1", timestamp: "2026-08-11T09:00:00.000Z" },
    { role: "user", sessionId: "portable-1", turnId: "turn-1", content: "Keep the migration outcome across agents.", timestamp: "2026-08-11T09:01:00.000Z" },
    { role: "assistant", sessionId: "portable-1", turnId: "turn-1", content: "Migration 18 passed and the rollback was verified.", timestamp: "2026-08-11T09:02:00.000Z" }
  ];
  await writeFile(archive, `${records.map(JSON.stringify).join("\n")}\n`, "utf8");
  const first = await importAgentArchive(archive, { cwd: root, format: "portable", mode: "full" });
  const replay = await importAgentArchive(archive, { cwd: root, format: "portable", mode: "full" });
  assert.equal(first.importedEvents, 3);
  assert.equal(replay.importedEvents, 0);
  const events = await readEvents(root);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.kind), ["session.started", "prompt.submitted", "turn.completed"]);
  assert.match(events[2].body, /rollback was verified/);
  const overview = await buildProjectOverview({ cwd: root });
  assert.equal(overview.memory.sessions, 1);
  assert.equal(overview.memory.prompts, 1);
  assert.equal(overview.memory.completedTurns, 1);
  assert.equal(overview.recentOutcomes[0].title, "Imported assistant outcome");
});

test("compact import streams a many-record archive into bounded per-session memory", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const archive = path.join(root, "large-portable.jsonl");
  const records = [];
  for (let index = 0; index < 1_000; index += 1) {
    const sessionId = `large-session-${index % 10}`;
    records.push(JSON.stringify({
      role: index % 2 === 0 ? "user" : "assistant",
      sessionId,
      timestamp: new Date(Date.UTC(2026, 7, 11, 10, 0, index)).toISOString(),
      content: `Visible migration record ${index} for durable archive retrieval with repeated project history.`
    }));
    if (index % 100 === 0) {
      records.push(JSON.stringify({ type: "thinking", sessionId, content: `PRIVATE_LARGE_REASONING_${index}` }));
    }
  }
  await writeFile(archive, `${records.join("\n")}\n`, "utf8");

  const result = await importAgentArchive(archive, {
    cwd: root,
    format: "portable",
    mode: "compact",
    maxBytes: 10 * 1024 * 1024,
    maxRecords: 2_000
  });
  assert.equal(result.recordsSeen, 1_010);
  assert.equal(result.ignoredRecords, 10);
  assert.equal(result.sessions, 10);
  assert.equal(result.importedEvents, 10);
  const events = await readEvents(root);
  assert.equal(events.length, 10);
  assert.ok(result.sourceBytes > events.reduce((sum, event) => sum + Buffer.byteLength(event.body), 0));
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_LARGE_REASONING/);
});

test("archive import rejects ambiguous linked sources and unknown options", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const source = path.join(root, "source.jsonl");
  const hardLink = path.join(root, "linked.jsonl");
  await writeFile(source, `${JSON.stringify({ role: "user", content: "visible" })}\n`, "utf8");
  await link(source, hardLink);
  await assert.rejects(
    () => importAgentArchive(hardLink, { cwd: root }),
    (error) => error.code === "ARCHIVE_LINK_REJECTED"
  );
  await assert.rejects(
    () => importAgentArchive(source, { cwd: root, unsafe: true }),
    /unknown field/u
  );
});
