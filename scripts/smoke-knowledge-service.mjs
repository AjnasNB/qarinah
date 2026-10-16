import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeWorkspace, appendEvent, createEncryptedSyncBundle, putEncryptedKnowledge,
  getEncryptedKnowledge, listEncryptedKnowledge, decryptEncryptedSyncBundle } from "../src/index.js";

const args = process.argv.slice(2), mode = args.shift();
function argument(name) { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error(`${name} is required.`); return args[index + 1]; }
const clientPath = path.resolve(argument("--client-file"));
const privateRoot = path.join(os.homedir(), ".qarinah", "knowledge");
if (!clientPath.startsWith(privateRoot + path.sep) || path.dirname(clientPath) !== privateRoot) throw new Error("Keep smoke credentials directly in the user's private Qarinah knowledge directory.");
if (mode === "prepare") {
  const temporaryParent = await realpath(os.tmpdir());
  const root = await realpath(await mkdtemp(path.join(temporaryParent, "qarinah-knowledge-smoke-")));
  process.env.QARINAH_STATE_DIR = path.join(root, "state");
  try {
    const cwd = path.join(root, "fixture"); await mkdir(cwd);
    const workspace = await initializeWorkspace(cwd, { capture: "content" });
    const event = await appendEvent({ kind: "prompt.submitted", title: "Synthetic encrypted knowledge smoke",
      body: "Synthetic check: rollback requires a reviewed snapshot.", actor: { type: "human", id: "synthetic-fixture" },
      provenance: { adapter: "knowledge-smoke", sourceId: "synthetic-only" } }, { workspace, capture: "content" });
    const manifest = { workspaceId: workspace.config.workspaceId, teamId: "release-smoke",
      members: [{ id: "smoke-owner", role: "owner" }] };
    const key = randomBytes(32), token = randomBytes(32).toString("base64url");
    const bundle = await createEncryptedSyncBundle({ cwd, manifest, memberId: "smoke-owner", key });
    await mkdir(privateRoot, { recursive: true });
    await writeFile(clientPath, JSON.stringify({ manifest, token, keyBase64: key.toString("base64"), bundle, headHash: event.hash }), { flag: "wx", mode: 0o600 });
    const grants = [{ tokenHash: createHash("sha256").update(token).digest("hex"), teamId: manifest.teamId,
      workspaceId: manifest.workspaceId, memberId: "smoke-owner", role: "owner" }];
    await writeFile(clientPath + ".grants.json", JSON.stringify({ QARINAH_SYNC_GRANTS: JSON.stringify(grants) }), { flag: "wx", mode: 0o600 });
    process.stdout.write(JSON.stringify({ prepared: true, syntheticOnly: true, workspaceId: manifest.workspaceId }) + "\n");
  } finally {
    if (path.dirname(root) !== temporaryParent || !path.basename(root).startsWith("qarinah-knowledge-smoke-")) throw new Error("Invalid smoke cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
} else if (mode === "verify") {
  const client = JSON.parse(await readFile(clientPath, "utf8")), endpoint = argument("--endpoint");
  const options = { endpoint, teamId: client.manifest.teamId, workspaceId: client.manifest.workspaceId, token: client.token };
  const health = await fetch(new URL("/health", endpoint), { redirect: "error", signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200);
  const stored = await putEncryptedKnowledge(client.bundle, options);
  assert.equal((await putEncryptedKnowledge(client.bundle, options)).status, "already-stored");
  const fetched = await getEncryptedKnowledge(stored.bundleId, options);
  const payload = decryptEncryptedSyncBundle(fetched, { manifest: client.manifest, memberId: "smoke-owner",
    key: Buffer.from(client.keyBase64, "base64"), expectedHeadHash: client.headHash });
  assert.equal(payload.events.length, 1);
  assert.ok((await listEncryptedKnowledge(options)).bundles.some(row => row.bundleId === stored.bundleId));
  const privateUrl = new URL(`/v1/teams/${options.teamId}/workspaces/${options.workspaceId}/bundles`, endpoint);
  assert.equal((await fetch(privateUrl, { redirect: "error" })).status, 401);
  await assert.rejects(getEncryptedKnowledge(stored.bundleId, { ...options, workspaceId: `ws_${"f".repeat(32)}` }));
  process.stdout.write(JSON.stringify({ ok: true, syntheticOnly: true, endpoint, encryptedRoundTrip: true,
    duplicateUpload: "idempotent", anonymousAccess: "denied", wrongScope: "denied", bundleHash: stored.bundleHash,
    headHash: client.headHash }) + "\n");
} else throw new Error("Use prepare or verify.");
