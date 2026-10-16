import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appendEvent, initializeWorkspace, inspectRuntimeHealth, QARINAH_VERSION } from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";
test("runtime health reports observed state without inventing capture, injection, or billing", async (t) => {
  const cwd = await temporaryDirectory(t), workspace = await initializeWorkspace(cwd, { capture: "content" });
  const empty = await inspectRuntimeHealth({ cwd });
  assert.equal(empty.lastObservedHostCaptureAt, null); assert.equal(empty.providerDelivery, "unobserved");
  await appendEvent(eventInput({ body: "Private body must not appear in health", data: { hookEvent: "Stop" } }), { workspace, capture: "content" });
  const ledger = path.join(cwd, ".qarinah/events/events.jsonl"), before = await readFile(ledger);
  const health = await inspectRuntimeHealth({ cwd });
  assert.equal(health.retainedEvents, 1); assert.ok(health.lastObservedHostCaptureAt);
  assert.equal(health.publicRelease.status, "not-queried"); assert.equal(JSON.stringify(health).includes("Private body"), false);
  assert.deepEqual(await readFile(ledger), before);
});
test("online health accepts only a clean identified public release and never transmits project data", async (t) => {
  const cwd = await temporaryDirectory(t); await initializeWorkspace(cwd);
  const release = { schemaVersion: "qarinah.public-release.v1", sourceState: "clean", sourceCommit: "a".repeat(40), version: QARINAH_VERSION };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://qarinah.io/release.json"); assert.equal(options.body, undefined);
    assert.equal(options.redirect, "error"); return Response.json(release);
  });
  assert.equal((await inspectRuntimeHealth({ cwd, online: true })).publicRelease.status, "aligned");
  release.sourceState = "uncommitted";
  assert.equal((await inspectRuntimeHealth({ cwd, online: true })).publicRelease.status, "unavailable");
});
