import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  TEAM_SYNC_SERVICE_SCHEMA_VERSION,
  createTeamSyncServer,
  encryptedSyncBundleId
} from "../src/index.js";

const TOKENS = Object.freeze({
  owner: "owner-token-00000000000000000000000000000000",
  reader: "reader-token-0000000000000000000000000000000",
  other: "other-token-00000000000000000000000000000000"
});
const WORKSPACE_ID = "ws_0123456789abcdef0123456789abcdef";

function bundle(overrides = {}) {
  return {
    schemaVersion: "qarinah.encrypted-sync-bundle.v1",
    algorithm: "AES-256-GCM",
    workspaceId: WORKSPACE_ID,
    teamManifestHash: `sha256:${"a".repeat(64)}`,
    nonce: randomBytes(12).toString("base64"),
    ciphertext: Buffer.from("opaque encrypted event bytes", "utf8").toString("base64"),
    authenticationTag: randomBytes(16).toString("base64"),
    ...overrides
  };
}

function authorization(token) {
  return { authorization: `Bearer ${token}` };
}

async function service(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-team-sync-service-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createTeamSyncServer({
    root,
    tokens: [
      { token: TOKENS.owner, teamId: "core", memberId: "owner", role: "owner" },
      { token: TOKENS.reader, teamId: "core", memberId: "reader", role: "reader" },
      { token: TOKENS.other, teamId: "other", memberId: "owner", role: "owner" }
    ],
    ...overrides
  });
  const started = await server.start();
  t.after(() => server.close());
  return { root, server, started, base: `http://${started.host}:${started.port}` };
}

test("team sync service stores only immutable tenant-bound encrypted bundles", async (t) => {
  const { root, started, base } = await service(t);
  assert.equal(started.schemaVersion, TEAM_SYNC_SERVICE_SCHEMA_VERSION);
  const payload = bundle();
  const bundleId = encryptedSyncBundleId(payload);
  const route = `${base}/v1/teams/core/workspaces/${WORKSPACE_ID}/bundles/${bundleId}`;
  const write = await fetch(route, {
    method: "PUT",
    headers: { ...authorization(TOKENS.owner), "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(write.status, 201);
  const firstReceipt = await write.json();
  assert.equal(firstReceipt.created, true);
  assert.match(firstReceipt.bundleHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(firstReceipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);

  const replay = await fetch(route, {
    method: "PUT",
    headers: { ...authorization(TOKENS.owner), "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).created, false);

  const read = await fetch(route, { headers: authorization(TOKENS.reader) });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), payload);
  const persisted = await readFile(path.join(root, "teams", "core", "workspaces", WORKSPACE_ID, "bundles", `${bundleId}.json`), "utf8");
  assert.deepEqual(JSON.parse(persisted), payload);

  const readerWrite = await fetch(route, {
    method: "PUT",
    headers: { ...authorization(TOKENS.reader), "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(readerWrite.status, 403);
  const crossTenant = await fetch(route, { headers: authorization(TOKENS.other) });
  assert.equal(crossTenant.status, 403);
  assert.equal((await fetch(route)).status, 401);
});

test("team sync service rejects malformed identities, bundles, media types, and origins", async (t) => {
  const { base } = await service(t);
  const payload = bundle();
  const bundleId = encryptedSyncBundleId(payload);
  const route = `${base}/v1/teams/core/workspaces/${WORKSPACE_ID}/bundles/${bundleId}`;
  assert.equal((await fetch(route, {
    method: "PUT",
    headers: authorization(TOKENS.owner),
    body: JSON.stringify(payload)
  })).status, 415);
  assert.equal((await fetch(route, {
    method: "PUT",
    headers: { ...authorization(TOKENS.owner), "content-type": "application/json" },
    body: JSON.stringify({ ...payload, workspaceId: "not-a-workspace" })
  })).status, 400);
  assert.equal((await fetch(route, {
    method: "PUT",
    headers: { ...authorization(TOKENS.owner), origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify(payload)
  })).status, 403);
  assert.equal((await fetch(`${base}/v1/teams/core/workspaces/${WORKSPACE_ID}/bundles/bundle_${"0".repeat(32)}`, {
    method: "PUT",
    headers: { ...authorization(TOKENS.owner), "content-type": "application/json" },
    body: JSON.stringify(payload)
  })).status, 409);
  assert.equal((await fetch(`${base}/v1/teams/core/workspaces/..%2Fsecret/bundles/${bundleId}`, {
    headers: authorization(TOKENS.owner)
  })).status, 400);
});

test("team sync service exposes bounded status and token-free audit evidence", async (t) => {
  const { base } = await service(t);
  const payload = bundle();
  const bundleId = encryptedSyncBundleId(payload);
  const route = `${base}/v1/teams/core/workspaces/${WORKSPACE_ID}/bundles/${bundleId}`;
  await fetch(route, {
    method: "PUT",
    headers: { ...authorization(TOKENS.owner), "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  await fetch(route, { headers: authorization(TOKENS.reader) });
  const status = await fetch(`${base}/v1/admin/status`, { headers: authorization(TOKENS.owner) });
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.schemaVersion, "qarinah.team-sync-status.v1");
  assert.equal(statusBody.teamId, "core");
  assert.equal(statusBody.workspaceCount, 1);
  assert.equal(statusBody.storage, "opaque-encrypted-bundles");
  assert.match(statusBody.requestId, /^[a-f0-9-]{36}$/u);
  const auditResponse = await fetch(`${base}/v1/admin/audit?limit=10`, { headers: authorization(TOKENS.owner) });
  assert.equal(auditResponse.status, 200);
  const audit = await auditResponse.json();
  assert.ok(audit.recordCount >= 3);
  assert.ok(audit.records.every((record) => /^sha256:/u.test(record.auditHash)));
  const serialized = JSON.stringify(audit);
  assert.doesNotMatch(serialized, /owner-token|reader-token|ciphertext|authenticationTag/u);
  assert.equal((await fetch(`${base}/v1/admin/audit`, { headers: authorization(TOKENS.reader) })).status, 403);
});

test("team sync service enforces deterministic per-token rate limits", async (t) => {
  const { base } = await service(t, { requestsPerMinute: 1, clock: () => new Date("2099-01-01T00:00:00.000Z") });
  assert.equal((await fetch(`${base}/v1/admin/status`, { headers: authorization(TOKENS.owner) })).status, 200);
  const limited = await fetch(`${base}/v1/admin/status`, { headers: authorization(TOKENS.owner) });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
});

test("team sync service contract schema is closed and versioned", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/team-sync-service.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$defs.encryptedBundle.additionalProperties, false);
  assert.equal(schema.$defs.encryptedBundle.properties.schemaVersion.const, "qarinah.encrypted-sync-bundle.v1");
  assert.equal(schema.$defs.writeReceipt.additionalProperties, false);
  assert.equal(schema.$defs.auditRecord.additionalProperties, false);
  assert.equal(schema.$defs.auditPage.additionalProperties, false);
});
