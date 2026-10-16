import assert from "node:assert/strict";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appendEvent, initializeWorkspace, recallChatMemory } from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

async function fixture(t) {
  const root = await realpath(await temporaryDirectory(t));
  const previous = process.env.QARINAH_STATE_DIR;
  process.env.QARINAH_STATE_DIR = path.join(root, "machine-state");
  t.after(() => {
    if (previous === undefined) delete process.env.QARINAH_STATE_DIR;
    else process.env.QARINAH_STATE_DIR = previous;
  });
  const project = path.join(root, "project");
  await mkdir(project);
  const workspace = await initializeWorkspace(project, { capture: "content" });
  const add = (overrides) => appendEvent(eventInput(overrides), { workspace, capture: "content" });
  return { project, add };
}

test("a weaker summary cannot hide the answer-bearing visible source", async (t) => {
  const { project, add } = await fixture(t);
  const answer = await add({ kind: "prompt.submitted", title: "Database migration rollback rule",
    body: "Database migration rollback requires a snapshot before ALTER TABLE." });
  const other = await add({ kind: "prompt.submitted", title: "Database migration dashboard",
    body: "The database migration dashboard uses a blue progress bar." });
  await add({ kind: "summary", title: "Database migration dashboard recap", body: other.body,
    data: { sourceEvents: [{ eventId: other.eventId, hash: other.hash, kind: other.kind }] } });
  const pack = await recallChatMemory("database migration rollback", { cwd: project, limit: 1 });
  assert.equal(pack.items[0].eventId, answer.eventId);
  assert.match(pack.items[0].excerpt, /snapshot before ALTER TABLE/u);
  assert.equal(pack.coverage, "direct");
});

test("an equally relevant cited summary remains the compact first choice", async (t) => {
  const { project, add } = await fixture(t);
  const answer = await add({ kind: "prompt.submitted", title: "Migration rollback", body: "Migration rollback requires a snapshot." });
  const summary = await add({ kind: "summary", title: "Migration rollback summary", body: answer.body,
    data: { sourceEvents: [{ eventId: answer.eventId, hash: answer.hash, kind: answer.kind }] } });
  const pack = await recallChatMemory("migration rollback", { cwd: project, limit: 1 });
  assert.equal(pack.items[0].eventId, summary.eventId);
  assert.equal(pack.coverage, "direct");
});

test("coverage describes delivered text rather than an unseen matching title or record", async (t) => {
  const { project, add } = await fixture(t);
  await add({ kind: "prompt.submitted", title: "Database migration rollback",
    body: "The dashboard uses a blue progress bar." });
  const pack = await recallChatMemory("database migration rollback", { cwd: project });
  assert.equal(pack.coverage, "none");
  const tiny = await recallChatMemory("database migration rollback", { cwd: project, maxChars: 512 });
  assert.equal(tiny.items.length, 0);
  assert.equal(tiny.coverage, "none");
  assert.ok(JSON.stringify(tiny).length <= 512);
});

test("a summary with an unavailable source cannot suppress a valid raw fallback", async (t) => {
  const { project, add } = await fixture(t);
  const answer = await add({ kind: "prompt.submitted", title: "Rollback", body: "Migration rollback requires a snapshot." });
  await add({ kind: "summary", title: "Migration rollback", body: answer.body,
    data: { sourceEvents: [{ eventId: "evt_00000000-0000-4000-8000-000000000001", hash: answer.hash, kind: answer.kind }] } });
  const pack = await recallChatMemory("migration rollback", { cwd: project, limit: 1 });
  assert.equal(pack.items[0].eventId, answer.eventId);
  assert.equal(pack.coverage, "direct");
});
