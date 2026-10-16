import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appendEvent, compileContext, initializeWorkspace, readEvents, revokeWorkspaceTrust } from "../src/index.js";
import { readCacheStatistics } from "../src/verified-read-cache.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

test("warm verified reads reuse work and appended history invalidates the derived index", async (t) => {
  const cwd = await temporaryDirectory(t); const workspace = await initializeWorkspace(cwd, { capture: "content" });
  await appendEvent(eventInput({ body: "Rollback uses a snapshot." }), { workspace, capture: "content" });
  const coldEvents = await readEvents(cwd), warmEvents = await readEvents(cwd);
  assert.deepEqual(warmEvents, coldEvents);
  assert.equal(Object.getPrototypeOf(warmEvents[0].data), null);
  assert.throws(() => { warmEvents[0].data.component = "changed"; }, TypeError);
  const query = () => compileContext("rollback snapshot", { cwd, inMemory: true, updateCheckpoint: false, asOf: "2099-01-01T00:00:00.000Z" });
  const first = await query(), before = readCacheStatistics();
  const next = await query(), after = readCacheStatistics();
  assert.equal(next.manifestHash, first.manifestHash);
  assert.ok(after.ledger.hits > before.ledger.hits); assert.ok(after.derived.hits > before.derived.hits);
  await appendEvent(eventInput({ title: "Rollback snapshot approved", body: "Rollback snapshot is now verified." }), { workspace, capture: "content" });
  const updated = await query();
  assert.notEqual(updated.manifestHash, first.manifestHash);
  assert.equal((await readEvents(cwd)).length, 2);
});

test("same-length interior tampering cannot reuse a warm ledger cache", async (t) => {
  const cwd = await temporaryDirectory(t); const workspace = await initializeWorkspace(cwd, { capture: "content" });
  await appendEvent(eventInput({ body: "Rollback needs snapshot." }), { workspace, capture: "content" });
  await readEvents(cwd, { updateCheckpoint: false });
  const ledger = path.join(cwd, ".qarinah/events/events.jsonl"), before = await readFile(ledger, "utf8");
  const changed = before.replace("Rollback needs snapshot.", "Rollback skips snapshot.");
  assert.equal(changed.length, before.length); await writeFile(ledger, changed);
  await assert.rejects(readEvents(cwd, { updateCheckpoint: false }), { code: "EVENT_INVALID" });
});

test("warm caches cannot bypass revocation or contaminate another workspace", async (t) => {
  const cwd = await temporaryDirectory(t), other = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(cwd, { capture: "content" }); await initializeWorkspace(other);
  await appendEvent(eventInput({ body: "Private rollback snapshot." }), { workspace, capture: "content" });
  await readEvents(cwd); assert.equal((await readEvents(other)).length, 0);
  await revokeWorkspaceTrust(cwd); await assert.rejects(readEvents(cwd), { code: "WORKSPACE_NOT_TRUSTED" });
});
