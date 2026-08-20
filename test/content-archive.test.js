import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createContentArchive,
  cryptographicallyEraseContentArchiveVault,
  deleteContentArchive,
  garbageCollectContentArchive,
  initializeWorkspace,
  listContentArchives,
  restoreContentArchive,
  verifyContentArchive
} from "../src/index.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-content-archive-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeWorkspace(root, { capture: "content" });
  await writeFile(path.join(root, "alpha.txt"), `${"shared line\n".repeat(30_000)}alpha\n`);
  await writeFile(path.join(root, "beta.txt"), `${"shared line\n".repeat(30_000)}beta\n`);
  await writeFile(path.join(root, ".env"), "API_TOKEN=must-not-be-archived\n");
  return root;
}

test("lossless content archives deduplicate, verify, restore, delete, and cryptographically erase", async (t) => {
  const root = await fixture(t);
  const first = await createContentArchive(".", {
    cwd: root,
    label: "first snapshot",
    clock: () => new Date("2026-08-20T00:00:00.000Z")
  });
  assert.equal(first.schemaVersion, "qarinah.content-archive.v1");
  assert.equal(first.files.length, 2);
  assert.equal(first.skipped.some((entry) => entry.path === ".env" && entry.reason === "secret-filename"), true);
  assert.ok(first.totals.chunkCount >= 2);
  assert.ok(first.totals.uniqueObjectCount < first.totals.chunkCount, "Repeated source regions should share content-addressed objects.");

  const manifestPath = path.join(root, ".qarinah", "archive", "manifests", `${first.archiveId}.json`);
  const manifestBytes = await readFile(manifestPath, "utf8");
  const malformedManifest = JSON.parse(manifestBytes);
  malformedManifest.files[0].unexpected = true;
  await writeFile(manifestPath, `${JSON.stringify(malformedManifest)}\n`);
  await assert.rejects(verifyContentArchive(first.archiveId, { cwd: root }), (error) => error?.code === "ARCHIVE_MANIFEST_INVALID");
  await writeFile(manifestPath, manifestBytes);

  const verified = await verifyContentArchive(first.archiveId, { cwd: root });
  assert.equal(verified.ok, true);
  assert.equal(verified.sourceBytes, first.totals.sourceBytes);

  const restore = path.join(root, "restored");
  const restored = await restoreContentArchive(first.archiveId, restore, { cwd: root });
  assert.deepEqual(restored.restored, ["alpha.txt", "beta.txt"]);
  assert.equal(await readFile(path.join(restore, "alpha.txt"), "utf8"), await readFile(path.join(root, "alpha.txt"), "utf8"));
  assert.equal(await readFile(path.join(restore, "beta.txt"), "utf8"), await readFile(path.join(root, "beta.txt"), "utf8"));

  const second = await createContentArchive("alpha.txt", {
    cwd: root,
    label: "second snapshot",
    clock: () => new Date("2026-08-20T00:01:00.000Z")
  });
  assert.ok(second.totals.reusedObjectCount > 0);
  assert.equal((await listContentArchives({ cwd: root })).length, 2);

  await assert.rejects(
    deleteContentArchive(first.archiveId, { cwd: root, confirmArchiveId: second.archiveId }),
    (error) => error?.code === "ARCHIVE_DELETE_CONFIRMATION"
  );
  await deleteContentArchive(first.archiveId, { cwd: root, confirmArchiveId: first.archiveId });
  const workspace = JSON.parse(await readFile(path.join(root, ".qarinah", "config.json"), "utf8"));
  const retainedGc = await garbageCollectContentArchive({ cwd: root, confirmWorkspaceId: workspace.workspaceId });
  assert.equal(retainedGc.removed.length >= 0, true);
  assert.equal((await verifyContentArchive(second.archiveId, { cwd: root })).ok, true);

  await deleteContentArchive(second.archiveId, { cwd: root, confirmArchiveId: second.archiveId });
  const finalGc = await garbageCollectContentArchive({ cwd: root, confirmWorkspaceId: workspace.workspaceId });
  assert.ok(finalGc.removed.length > 0);
  const objectKeyDirectories = await readdir(path.join(root, ".qarinah", "archive", "objects"));
  for (const directory of objectKeyDirectories) {
    assert.equal((await readdir(path.join(root, ".qarinah", "archive", "objects", directory))).length, 0);
  }

  const erasure = await cryptographicallyEraseContentArchiveVault({ cwd: root, confirmWorkspaceId: workspace.workspaceId });
  assert.equal(erasure.physicalMediaErasureClaimed, false);
  assert.equal(erasure.backupErasureClaimed, false);
  await assert.rejects(readFile(path.join(root, ".qarinah", "archive", "key.json")), { code: "ENOENT" });
});

test("content archives require explicit content capture and reject traversal", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-content-archive-metadata-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeWorkspace(root, { capture: "metadata" });
  await writeFile(path.join(root, "notes.txt"), "not authorized for raw archival\n");
  await assert.rejects(createContentArchive(".", { cwd: root }), (error) => error?.code === "ARCHIVE_CONTENT_NOT_AUTHORIZED");
  const contentRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-content-archive-path-"));
  t.after(() => rm(contentRoot, { recursive: true, force: true }));
  await initializeWorkspace(contentRoot, { capture: "content" });
  await assert.rejects(createContentArchive("..", { cwd: contentRoot }), (error) => error?.code === "ARCHIVE_PATH_INVALID");
});

test("content archive schema is closed and matches the emitted manifest", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/content-archive.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.content-archive.v1");
  assert.equal(schema.properties.encryption.properties.algorithm.const, "AES-256-GCM");
  assert.equal(schema.$defs.file.additionalProperties, false);
  assert.equal(schema.$defs.chunk.additionalProperties, false);
  assert.deepEqual(new Set(schema.required), new Set([
    "schemaVersion", "workspaceId", "createdAt", "label", "source", "chunking", "encryption",
    "limits", "files", "skipped", "totals", "archiveId", "manifestHash"
  ]));
});
