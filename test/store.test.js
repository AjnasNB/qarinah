import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  approveWorkspaceTrust,
  initializeWorkspace,
  inspectWorkspacePolicy,
  loadWorkspace,
  readEvents,
  revokeWorkspaceTrust,
  setWorkspaceEnabled,
  verifyStore
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test-support", "append-worker.mjs");

function machineStateRoot() {
  if (process.env.QARINAH_STATE_DIR) return path.resolve(process.env.QARINAH_STATE_DIR);
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Qarinah");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Qarinah");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "qarinah");
}

function machineTrustPath(root) {
  const resolved = path.resolve(root);
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const digest = createHash("sha256").update(normalized).digest("hex");
  return path.join(machineStateRoot(), "trusted-workspaces", `${digest}.json`);
}

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

test("machine trust rejects a stable hard link while permitting atomic replacement retries", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const trustPath = machineTrustPath(workspace.root);
  const linkedTrustPath = `${trustPath}.hardlink-test`;
  t.after(() => rm(linkedTrustPath, { force: true }));
  await link(trustPath, linkedTrustPath);

  await assert.rejects(
    () => loadWorkspace(root),
    (error) => error.code === "TRUST_INVALID" && /singly linked regular file/u.test(error.message)
  );

  await rm(linkedTrustPath, { force: true });
  assert.equal((await loadWorkspace(root)).root, workspace.root);
});

test("machine-local permit binds the complete capture policy and prevents portable reactivation", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const originalPolicy = await inspectWorkspacePolicy(root);
  const trustPath = machineTrustPath(workspace.root);
  let trust = JSON.parse(await readFile(trustPath, "utf8"));
  assert.equal(trust.schemaVersion, "qarinah.trust.v2");
  assert.equal(trust.root, workspace.root);
  assert.equal(trust.workspaceId, workspace.config.workspaceId);
  assert.equal(trust.enabled, true);
  assert.equal(trust.capture, "metadata");
  assert.equal(trust.maxEventBytes, workspace.config.maxEventBytes);
  assert.equal(trust.maxLogBytes, workspace.config.maxLogBytes);
  assert.equal(trust.contextMaxChars, workspace.config.contextMaxChars);
  assert.equal(trust.retentionClass, workspace.config.retentionClass);
  assert.match(trust.policyHash, /^sha256:[0-9a-f]{64}$/);

  await setWorkspaceEnabled(root, false);
  trust = JSON.parse(await readFile(trustPath, "utf8"));
  assert.equal(trust.enabled, false);
  const disabled = JSON.parse(await readFile(workspace.configPath, "utf8"));
  await writeFile(workspace.configPath, `${JSON.stringify({ ...disabled, enabled: true }, null, 2)}\n`, "utf8");
  await assert.rejects(() => loadWorkspace(root), (error) => error.code === "CAPTURE_NOT_APPROVED");
  await assert.rejects(() => appendEvent(eventInput(), { cwd: root }), (error) => error.code === "CAPTURE_NOT_APPROVED");

  // The explicit local enable action repairs a safely interrupted/tampered
  // enabled transition, but it cannot approve any other portable policy edit.
  await setWorkspaceEnabled(root, true);
  assert.equal((await loadWorkspace(root)).consent.enabled, true);
  const changed = JSON.parse(await readFile(workspace.configPath, "utf8"));
  await writeFile(workspace.configPath, `${JSON.stringify({ ...changed, maxLogBytes: changed.maxLogBytes + 1 }, null, 2)}\n`, "utf8");
  await assert.rejects(() => loadWorkspace(root), (error) => error.code === "CAPTURE_NOT_APPROVED");
  await assert.rejects(() => setWorkspaceEnabled(root, false), (error) => error.code === "CAPTURE_NOT_APPROVED");

  await assert.rejects(
    () => approveWorkspaceTrust(root, "metadata", originalPolicy.policyHash),
    (error) => error.code === "POLICY_NOT_APPROVED"
  );
  await assert.rejects(
    () => approveWorkspaceTrust(root, "metadata"),
    /expectedPolicyHash/
  );
  const requestedPolicy = await inspectWorkspacePolicy(root);
  assert.equal(requestedPolicy.maxLogBytes, changed.maxLogBytes + 1);
  assert.notEqual(requestedPolicy.policyHash, originalPolicy.policyHash);
  const reviewed = await approveWorkspaceTrust(root, "metadata", requestedPolicy.policyHash);
  assert.equal(reviewed.trusted, true);
  assert.equal(reviewed.policyHash, requestedPolicy.policyHash);
  assert.equal((await loadWorkspace(root)).config.maxLogBytes, changed.maxLogBytes + 1);
});

test("append reloads portable policy and permit after entering the write lock", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await assert.rejects(
    () => appendEvent(eventInput({ body: "STALE_POLICY_APPEND_MARKER" }), {
      workspace,
      async __testFaultInjector(point) {
        if (point !== "after-initial-workspace-load") return;
        await writeFile(workspace.configPath, `${JSON.stringify({
          ...workspace.config,
          maxLogBytes: workspace.config.maxLogBytes + 1
        }, null, 2)}\n`, "utf8");
      }
    }),
    (error) => error.code === "CAPTURE_NOT_APPROVED"
  );
  const log = await readFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "utf8");
  assert.equal(log, "");
  assert.equal(log.includes("STALE_POLICY_APPEND_MARKER"), false);
});

test("legacy v1 trust records fail closed until an explicit verified re-trust", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const trustPath = machineTrustPath(workspace.root);
  const current = JSON.parse(await readFile(trustPath, "utf8"));
  await writeFile(trustPath, `${JSON.stringify({
    schemaVersion: "qarinah.trust.v1",
    root: workspace.root,
    workspaceId: workspace.config.workspaceId,
    capture: workspace.config.capture,
    grantedAt: current.grantedAt,
    checkpoint: current.checkpoint
  }, null, 2)}\n`, "utf8");

  await assert.rejects(() => loadWorkspace(root), (error) => error.code === "TRUST_REVIEW_REQUIRED");
  const requestedPolicy = await inspectWorkspacePolicy(root);
  await approveWorkspaceTrust(root, "metadata", requestedPolicy.policyHash);
  const migrated = JSON.parse(await readFile(trustPath, "utf8"));
  assert.equal(migrated.schemaVersion, "qarinah.trust.v2");
  assert.match(migrated.policyHash, /^sha256:[0-9a-f]{64}$/);
});

test("re-trust cannot bless a ledger older than the existing machine checkpoint", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({ eventId: "evt_00000000-0000-4000-8000-000000000061" }), { cwd: root });
  await appendEvent(eventInput({ eventId: "evt_00000000-0000-4000-8000-000000000062" }), { cwd: root });
  const trustPath = machineTrustPath(workspace.root);
  const before = JSON.parse(await readFile(trustPath, "utf8"));
  assert.equal(before.checkpoint.eventCount, 2);

  const changed = JSON.parse(await readFile(workspace.configPath, "utf8"));
  await writeFile(workspace.configPath, `${JSON.stringify({
    ...changed,
    contextMaxChars: changed.contextMaxChars + 1
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "", "utf8");
  const requestedPolicy = await inspectWorkspacePolicy(root);

  await assert.rejects(
    () => approveWorkspaceTrust(root, "metadata", requestedPolicy.policyHash),
    (error) => error.code === "CHECKPOINT_ROLLBACK"
  );
  const after = JSON.parse(await readFile(trustPath, "utf8"));
  assert.equal(after.checkpoint.eventCount, 2);
  assert.equal(after.checkpoint.headHash, before.checkpoint.headHash);
  assert.equal(after.policyHash, before.policyHash);
});

test("revocation preserves rollback protection across a later trust grant", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({ eventId: "evt_00000000-0000-4000-8000-000000000071" }), { cwd: root });
  await appendEvent(eventInput({ eventId: "evt_00000000-0000-4000-8000-000000000072" }), { cwd: root });
  await revokeWorkspaceTrust(root);
  await writeFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "", "utf8");
  const requestedPolicy = await inspectWorkspacePolicy(root);

  await assert.rejects(
    () => approveWorkspaceTrust(root, "metadata", requestedPolicy.policyHash),
    (error) => error.code === "CHECKPOINT_ROLLBACK"
  );
  await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
});

test("central metadata capture removes arbitrary caller body and data", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const markers = [
    "PRIVATE_TITLE_MARKER",
    "PRIVATE_BODY_MARKER",
    "PRIVATE_DATA_MARKER",
    "PRIVATE_SESSION_MARKER",
    "PRIVATE_RELATION_MARKER"
  ];
  const event = await appendEvent(eventInput({
    title: markers[0],
    body: markers[1],
    data: { note: markers[2] },
    sessionId: markers[3],
    relations: [{ type: "references", target: markers[4] }]
  }), { workspace });

  assert.equal(event.title, "Captured decision metadata");
  assert.equal(event.body, "");
  assert.equal(event.actor.id, "qarinah.metadata-projection");
  assert.equal(event.sessionId, null);
  assert.deepEqual(event.relations, []);
  assert.equal(event.data.capture, "metadata");
  assert.equal(event.data.contentOmitted, true);
  assert.match(event.data.sourceEvent.digest, /^sha256:[0-9a-f]{64}$/);
  const persisted = await readFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "utf8");
  for (const marker of markers) assert.equal(persisted.includes(marker), false, marker);

  await assert.rejects(
    () => appendEvent(eventInput({ title: "CONTENT_DENIED_MARKER" }), { workspace, capture: "content" }),
    (error) => error.code === "CONTENT_CAPTURE_NOT_APPROVED"
  );
  assert.equal(persisted.includes("CONTENT_DENIED_MARKER"), false);
});

test("append cannot widen or relabel the machine-approved retention class", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await assert.rejects(
    () => appendEvent(eventInput({
      retention: { class: "durable", expiresAt: null }
    }), { cwd: root, capture: "content" }),
    (error) => error.code === "RETENTION_NOT_APPROVED"
  );
  assert.equal((await readEvents(root)).length, 0);
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
  assert.deepEqual(await readdir(path.join(root, ".qarinah", "locks")), []);
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
  assert.deepEqual(await readdir(path.join(root, ".qarinah", "locks")), []);
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

test("public store APIs reload caller-supplied workspaces from their trusted root", async (t) => {
  const root = await temporaryDirectory(t);
  const redirectedRoot = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const redirectedQarinah = path.join(redirectedRoot, ".qarinah");
  for (const directory of ["events", "objects", "records", "graph", "index", "snapshots", "locks"]) {
    await mkdir(path.join(redirectedQarinah, directory), { recursive: true });
  }
  const redirectedLog = path.join(redirectedQarinah, "events", "events.jsonl");
  await writeFile(redirectedLog, "", "utf8");
  const forgedWorkspace = Object.freeze({
    ...workspace,
    qarinahDir: redirectedQarinah,
    config: Object.freeze({ ...workspace.config, maxLogBytes: 1_073_741_824 })
  });

  const appended = await appendEvent(eventInput({ title: "Root-bound append" }), { workspace: forgedWorkspace });
  assert.equal(await readFile(redirectedLog, "utf8"), "");
  assert.deepEqual((await readEvents(forgedWorkspace)).map((event) => event.eventId), [appended.eventId]);
  assert.equal((await verifyStore(root)).eventCount, 1);
});

test("workspace trust can always be revoked after mismatch, corruption, or prior removal", async (t) => {
  await t.test("changed capture policy", async (subtest) => {
    const root = await temporaryDirectory(subtest);
    const workspace = await initializeWorkspace(root);
    await writeFile(workspace.configPath, `${JSON.stringify({ ...workspace.config, capture: "content" }, null, 2)}\n`, "utf8");
    assert.equal((await revokeWorkspaceTrust(root)).trusted, false);
    await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
  });

  await t.test("corrupt trust record", async (subtest) => {
    const root = await temporaryDirectory(subtest);
    const workspace = await initializeWorkspace(root);
    await writeFile(machineTrustPath(workspace.root), "not-json\n", "utf8");
    assert.equal((await revokeWorkspaceTrust(root)).trusted, false);
    await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
  });

  await t.test("already missing trust record", async (subtest) => {
    const root = await temporaryDirectory(subtest);
    const workspace = await initializeWorkspace(root);
    await rm(machineTrustPath(workspace.root), { force: true });
    assert.equal((await revokeWorkspaceTrust(root)).trusted, false);
    await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
  });

  await t.test("corrupt portable config", async (subtest) => {
    const root = await temporaryDirectory(subtest);
    const workspace = await initializeWorkspace(root);
    const originalConfig = await readFile(workspace.configPath, "utf8");
    await writeFile(workspace.configPath, "not-json\n", "utf8");
    assert.equal((await revokeWorkspaceTrust(root)).trusted, false);
    await writeFile(workspace.configPath, originalConfig, "utf8");
    await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
  });

  await t.test("a late checkpoint write cannot erase revocation", async (subtest) => {
    const root = await temporaryDirectory(subtest);
    const workspace = await initializeWorkspace(root);
    const trustPath = machineTrustPath(workspace.root);
    const lateCheckpoint = await readFile(trustPath, "utf8");
    await revokeWorkspaceTrust(root);
    await writeFile(trustPath, lateCheckpoint, "utf8");
    await assert.rejects(() => loadWorkspace(root), (error) => error.code === "WORKSPACE_NOT_TRUSTED");
  });
});

test("checkpoint-authenticated event-ID buckets recover from deletion and poisoning", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const eventId = "evt_22222222-2222-4222-8222-222222222222";
  const input = eventInput({ eventId, title: "Stable hook replay" });
  const first = await appendEvent(input, { workspace, idempotent: true });
  const projectionRoot = path.join(workspace.qarinahDir, "index", "event-ids");
  const manifestPath = path.join(projectionRoot, "manifest.json");

  await writeFile(manifestPath, "{}\n", "utf8");
  await appendEvent(eventInput({ title: "Recovery after poisoned manifest" }), { workspace });
  assert.equal((await readEvents(root)).length, 2);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let matchingBucket = null;
  for (const bucketName of Object.keys(manifest.buckets)) {
    const bucketPath = path.join(projectionRoot, "buckets", `${bucketName}.json`);
    const bucket = JSON.parse(await readFile(bucketPath, "utf8"));
    if (Object.hasOwn(bucket.entries, eventId)) {
      await writeFile(bucketPath, "{}\n", "utf8");
      matchingBucket = bucketName;
      break;
    }
  }
  assert.ok(matchingBucket);
  assert.equal((await appendEvent(input, { workspace, idempotent: true })).hash, first.hash);

  await rm(manifestPath);
  await assert.rejects(
    () => appendEvent(eventInput({ eventId, title: "Divergent late replay" }), { workspace, idempotent: true }),
    (error) => error.code === "EVENT_ID_CONFLICT"
  );
  const recoveredWorkspace = await loadWorkspace(root);
  assert.match(recoveredWorkspace.consent.checkpoint.eventIdIndexHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal((await readEvents(root)).length, 2);
});

test("event-ID buckets keep compact exact log locations instead of event copies", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const eventId = "evt_33333333-3333-4333-8333-333333333333";
  const event = await appendEvent(eventInput({ eventId, title: "Compact location marker" }), {
    workspace,
    idempotent: true
  });
  const projectionRoot = path.join(workspace.qarinahDir, "index", "event-ids");
  const manifest = JSON.parse(await readFile(path.join(projectionRoot, "manifest.json"), "utf8"));
  let entry = null;
  let bucketText = null;
  for (const bucketName of Object.keys(manifest.buckets)) {
    const text = await readFile(path.join(projectionRoot, "buckets", `${bucketName}.json`), "utf8");
    const bucket = JSON.parse(text);
    if (Object.hasOwn(bucket.entries, eventId)) {
      entry = bucket.entries[eventId];
      bucketText = text;
      assert.equal(manifest.buckets[bucketName].count, Object.keys(bucket.entries).length);
      break;
    }
  }
  assert.deepEqual(Object.keys(entry).sort(), ["hash", "length", "offset"]);
  assert.equal(entry.hash, event.hash);
  assert.equal(bucketText.includes("Compact location marker"), false);
  const log = await readFile(path.join(workspace.qarinahDir, "events", "events.jsonl"));
  const indexedLine = log.subarray(entry.offset, entry.offset + entry.length);
  assert.equal(indexedLine.at(-1), 0x0a);
  assert.equal(JSON.parse(indexedLine.subarray(0, -1).toString("utf8")).eventId, eventId);
});

const APPEND_FAULT_POINTS = [
  "after-event-log-fsync",
  "after-event-id-bucket-write",
  "after-event-id-bucket-rename",
  "after-event-id-manifest-write",
  "after-event-id-manifest-rename",
  "after-checkpoint-update"
];

test("append retries recover from every durable write boundary", async (t) => {
  for (const [index, faultPoint] of APPEND_FAULT_POINTS.entries()) {
    await t.test(faultPoint, async (subtest) => {
      const root = await temporaryDirectory(subtest);
      const workspace = await initializeWorkspace(root);
      const first = await appendEvent(eventInput({ title: "Fault baseline" }), { workspace });
      const suffix = (index + 1).toString(16).padStart(12, "0");
      const eventId = `evt_44444444-4444-4444-8444-${suffix}`;
      const input = eventInput({ eventId, title: `Recover ${faultPoint}` });
      await assert.rejects(
        () => appendEvent(input, {
          workspace,
          idempotent: true,
          __testFaultInjector(point) {
            if (point !== faultPoint) return;
            throw Object.assign(new Error(`Injected failure at ${point}`), { code: "INJECTED_STORE_FAILURE" });
          }
        }),
        (error) => error.code === "INJECTED_STORE_FAILURE"
      );

      const recovered = await appendEvent(input, { workspace, idempotent: true });
      assert.equal(recovered.eventId, eventId);
      assert.equal((await appendEvent(input, { workspace, idempotent: true })).hash, recovered.hash);
      await assert.rejects(
        () => appendEvent(eventInput({ eventId, title: "Divergent retry" }), { workspace, idempotent: true }),
        (error) => error.code === "EVENT_ID_CONFLICT"
      );
      const events = await readEvents(root);
      assert.equal(events.length, 2);
      assert.equal(events[1].previousHash, first.hash);
      assert.deepEqual(await verifyStore(root), {
        ok: true,
        workspaceId: workspace.config.workspaceId,
        eventCount: 2,
        headHash: recovered.hash,
        capture: "metadata",
        root: workspace.root
      });
    });
  }
});

test("lock ownership loss after log fsync fails closed and retry repairs the checkpoint", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const first = await appendEvent(eventInput({ title: "Lock baseline" }), { workspace });
  const eventId = "evt_55555555-5555-4555-8555-555555555555";
  const input = eventInput({ eventId, title: "Recover ownership loss" });
  await assert.rejects(
    () => appendEvent(input, {
      workspace,
      idempotent: true,
      async __testFaultInjector(point, details) {
        if (point === "after-event-log-fsync") await rm(details.ownerPath);
      }
    }),
    (error) => error.code === "STORE_LOCK_LOST"
  );
  await rm(path.join(workspace.qarinahDir, "locks", "append.lock"), { recursive: true, force: true });
  const recovered = await appendEvent(input, { workspace, idempotent: true });
  assert.equal((await appendEvent(input, { workspace, idempotent: true })).hash, recovered.hash);
  await assert.rejects(
    () => appendEvent(eventInput({ eventId, title: "Conflicting ownership retry" }), { workspace, idempotent: true }),
    (error) => error.code === "EVENT_ID_CONFLICT"
  );
  const events = await readEvents(root);
  assert.equal(events.length, 2);
  assert.equal(events[1].previousHash, first.hash);
  assert.equal((await verifyStore(root)).headHash, recovered.hash);
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

test("authoritative storage rejects hard-linked files before append", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const outside = path.join(await temporaryDirectory(t), "outside-ledger.jsonl");
  const eventPath = path.join(workspace.qarinahDir, "events", "events.jsonl");
  await writeFile(outside, "", "utf8");
  await rm(eventPath);
  await link(outside, eventPath);

  await assert.rejects(
    () => appendEvent(eventInput({ body: "HARD_LINK_ESCAPE_MARKER" }), { cwd: root }),
    (error) => error.code === "STORAGE_LINK_REJECTED"
  );
  assert.equal(await readFile(outside, "utf8"), "");
});
