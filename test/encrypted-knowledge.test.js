import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import worker from "../services/knowledge-worker/index.mjs";
import { appendEvent, createEncryptedSyncBundle, createTeamManifest, decryptEncryptedSyncBundle, initializeWorkspace } from "../src/index.js";
import { getEncryptedKnowledge, knowledgeBundleId, listEncryptedKnowledge, putEncryptedKnowledge } from "../src/encrypted-knowledge.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";
function service(workspaceId) {
  const objects = new Map(), token = randomBytes(32).toString("base64url");
  const grant = { tokenHash: createHash("sha256").update(token).digest("hex"), teamId: "test-team", workspaceId, memberId: "test-owner", role: "owner" };
  const env = { QARINAH_SYNC_GRANTS: JSON.stringify([grant]), RATE_LIMITER: { limit: async () => ({ success: true }) },
    KNOWLEDGE: {
      async put(key, bytes, options) { if (objects.has(key)) return null;
        const value = { bytes, key, size: Buffer.byteLength(bytes), uploaded: new Date(), httpEtag: '"object"', customMetadata: options.customMetadata };
        objects.set(key, value); return value; },
      async head(key) { return objects.get(key) ?? null; },
      async get(key) { const value = objects.get(key); return value ? { ...value, body: new Blob([value.bytes]).stream() } : null; },
      async list({ prefix, limit }) { return { objects: [...objects.values()].filter(value => value.key.startsWith(prefix)).slice(0, limit), truncated: false }; }
    } };
  const fetcher = (url, init) => worker.fetch(new Request(url, init), env);
  return { env, grant, token, objects, fetcher, options: { endpoint: "https://knowledge.example", teamId: "test-team", workspaceId, token, fetcher } };
}
test("encrypted knowledge crosses a service boundary and reconstructs exact cited memory", async (t) => {
  const cwd = await temporaryDirectory(t), workspace = await initializeWorkspace(cwd, { capture: "content" });
  const event = await appendEvent(eventInput({ body: "Rollback requires an approved snapshot." }), { workspace, capture: "content" });
  const manifest = { workspaceId: workspace.config.workspaceId, teamId: "test-team", members: [{ id: "test-owner", role: "owner" }] };
  const key = randomBytes(32), bundle = await createEncryptedSyncBundle({ cwd, manifest, memberId: "test-owner", key });
  const { options, objects } = service(workspace.config.workspaceId);
  const receipt = await putEncryptedKnowledge(bundle, options);
  assert.equal(receipt.status, "stored"); assert.equal((await putEncryptedKnowledge(bundle, options)).status, "already-stored");
  assert.ok(!JSON.stringify([...objects.values()]).includes(event.body));
  const fetched = await getEncryptedKnowledge(receipt.bundleId, options);
  const payload = decryptEncryptedSyncBundle(fetched, { manifest, memberId: "test-owner", key, expectedHeadHash: event.hash });
  assert.equal(payload.events[0].hash, event.hash); assert.equal(payload.events[0].body, event.body);
  assert.equal((await listEncryptedKnowledge(options)).bundles.length, 1);
  assert.throws(() => decryptEncryptedSyncBundle(fetched, { manifest, memberId: "test-owner", key: randomBytes(32) }));
  assert.throws(() => decryptEncryptedSyncBundle(fetched, { manifest, memberId: "test-owner", key, expectedHeadHash: `sha256:${"a".repeat(64)}` }), /pinned ledger/u);
});
test("service denies anonymous access, wrong workspace, reader writes, browser origins, and rate overruns", async () => {
  const workspaceId = `ws_${"a".repeat(32)}`, { env, grant, token } = service(workspaceId);
  const url = `https://knowledge.example/v1/teams/test-team/workspaces/${workspaceId}/bundles`;
  const req = (target = url, headers = {}, method = "GET") => worker.fetch(new Request(target, { method, headers: { Authorization: `Bearer ${token}`, ...headers } }), env);
  assert.equal((await req("https://knowledge.example/health")).status, 200);
  assert.equal((await worker.fetch(new Request("https://knowledge.example/health"), {})).status, 503);
  assert.equal((await worker.fetch(new Request("https://knowledge.example/health"), { ...env, QARINAH_SYNC_GRANTS: "[]" })).status, 503);
  assert.equal((await req(url, { Authorization: "" })).status, 401);
  assert.equal((await req(url.replace(workspaceId, `ws_${"b".repeat(32)}`))).status, 403);
  assert.equal((await req(url, { Origin: "https://evil.example" })).status, 403);
  env.QARINAH_SYNC_GRANTS = JSON.stringify([{ ...grant, role: "reader" }]);
  assert.equal((await req(`${url}/bundle_${"a".repeat(32)}`, {}, "PUT")).status, 403);
  env.RATE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await req()).status, 429);
});
test("upload boundaries reject oversized data, invented plaintext fields and mismatched identities", async () => {
  const workspaceId = `ws_${"a".repeat(32)}`, { env, token } = service(workspaceId);
  const bundle = { schemaVersion: "qarinah.encrypted-sync-bundle.v1", algorithm: "AES-256-GCM", workspaceId,
    teamManifestHash: `sha256:${"a".repeat(64)}`, nonce: Buffer.alloc(12).toString("base64"), ciphertext: "", authenticationTag: Buffer.alloc(16).toString("base64") };
  const url = `https://knowledge.example/v1/teams/test-team/workspaces/${workspaceId}/bundles/${knowledgeBundleId(bundle)}`;
  const send = (body, extra = {}) => worker.fetch(new Request(url, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) }), env);
  assert.equal((await send(bundle, { "Content-Length": "9000000" })).status, 413);
  assert.equal((await send({ ...bundle, plaintext: "must not be retained" })).status, 400);
  assert.equal((await send({ ...bundle, nonce: "invalid" })).status, 400);
  assert.equal((await send({ ...bundle, ciphertext: "YQ==" })).status, 409);
});
