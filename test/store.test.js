import assert from "node:assert/strict";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  initializeWorkspace,
  loadWorkspace,
  readEvents,
  setWorkspaceEnabled,
  verifyStore
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test-support", "append-worker.mjs");

function runWorker(cwd, id, count) {
  return new Promise((resolve, reject) => {
    import("node:child_process").then(({ spawn }) => {
      const child = spawn(process.execPath, [workerPath, String(id), String(count)], {
        cwd,
        env: process.env,
        shell: false,
        stdio: ["ignore", "ignore", "pipe"]
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `Worker ${id} exited ${code}.`)));
    }, reject);
  });
}

test("workspace append, verification, disable, and re-enable are consistent", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const first = await appendEvent(eventInput(), { workspace });
  const second = await appendEvent(eventInput({ title: "Second decision" }), { workspace });
  const events = await readEvents(workspace);

  assert.equal(events.length, 2);
  assert.equal(first.previousHash, null);
  assert.equal(second.previousHash, first.hash);
  assert.deepEqual(await verifyStore(root), {
    ok: true,
    workspaceId: workspace.config.workspaceId,
    eventCount: 2,
    headHash: second.hash,
    capture: "metadata",
    root: workspace.root
  });

  await setWorkspaceEnabled(root, false);
  await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_DISABLED");
  assert.equal((await loadWorkspace(root, { allowDisabled: true })).config.enabled, false);
  await setWorkspaceEnabled(root, true);
  assert.equal((await loadWorkspace(root)).config.enabled, true);
});

test("concurrent appends serialize into one valid hash chain", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  await Promise.all(Array.from({ length: 24 }, (_, index) => appendEvent(eventInput({ title: `Decision ${index}` }), { cwd: root })));
  const events = await readEvents(root);

  assert.equal(events.length, 24);
  for (let index = 1; index < events.length; index += 1) {
    assert.equal(events[index].previousHash, events[index - 1].hash);
  }
});

test("independent processes serialize through the owner-token lock", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  await Promise.all(Array.from({ length: 4 }, (_, index) => runWorker(root, index, 8)));
  const events = await readEvents(root);
  assert.equal(events.length, 32);
  assert.equal(new Set(events.map((event) => event.eventId)).size, 32);
  for (let index = 1; index < events.length; index += 1) {
    assert.equal(events[index].previousHash, events[index - 1].hash);
  }
});

test("non-canonical log bytes and hash tampering are rejected", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput(), { workspace });
  const eventPath = path.join(workspace.qarinahDir, "events", "events.jsonl");
  const canonical = await readFile(eventPath, "utf8");

  await writeFile(eventPath, ` ${canonical}`, "utf8");
  await assert.rejects(() => readEvents(workspace), (error) => error.code === "EVENT_LOG_NON_CANONICAL");

  const parsed = JSON.parse(canonical.trimEnd());
  parsed.title = "Tampered";
  await writeFile(eventPath, `${JSON.stringify(parsed)}\n`, "utf8");
  await assert.rejects(() => readEvents(workspace), (error) => error.code === "EVENT_INVALID");
  await assert.rejects(() => appendEvent(eventInput({ title: "Must not extend tampered head" }), { workspace }), (error) => error.code === "EVENT_INVALID");
});

test("duplicate event ids are rejected and idempotent replays must match", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const eventId = "evt_11111111-1111-4111-8111-111111111111";
  const first = await appendEvent(eventInput({ eventId }), { workspace });
  await assert.rejects(() => appendEvent(eventInput({ eventId }), { workspace }), (error) => error.code === "EVENT_ID_DUPLICATE");
  assert.equal((await appendEvent(eventInput({ eventId }), { workspace, idempotent: true })).hash, first.hash);
  await assert.rejects(
    () => appendEvent(eventInput({ eventId, title: "Conflicting replay" }), { workspace, idempotent: true }),
    (error) => error.code === "EVENT_ID_CONFLICT"
  );
  assert.equal((await readEvents(root)).length, 1);
});

test("machine-local consent does not travel with a copied repository", async (t) => {
  const source = await temporaryDirectory(t);
  const clone = await temporaryDirectory(t);
  await initializeWorkspace(source, { capture: "content" });
  await cp(path.join(source, ".qarinah"), path.join(clone, ".qarinah"), { recursive: true });
  await assert.rejects(() => loadWorkspace(clone), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
});

test("trusted checkpoints detect tail truncation and missing logs", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({ title: "First" }), { workspace });
  await appendEvent(eventInput({ title: "Second" }), { workspace });
  const eventPath = path.join(workspace.qarinahDir, "events", "events.jsonl");
  const lines = (await readFile(eventPath, "utf8")).split("\n").filter(Boolean);
  await writeFile(eventPath, `${lines[0]}\n`, "utf8");
  await assert.rejects(() => readEvents(workspace), (error) => error.code === "CHECKPOINT_ROLLBACK");
  await rm(eventPath, { force: true });
  await assert.rejects(() => verifyStore(root), (error) => error.code === "EVENT_LOG_MISSING");
});
