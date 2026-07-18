import assert from "node:assert/strict";
import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { initializeWorkspace, loadWorkspace, readEvents } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

async function createDirectoryLink(target, link) {
  try {
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) return false;
    throw error;
  }
}

test("initialization rejects a pre-existing linked .qarinah directory", async (t) => {
  const root = await temporaryDirectory(t);
  const target = path.join(root, "link-target");
  await mkdir(target);
  if (!(await createDirectoryLink(target, path.join(root, ".qarinah")))) {
    t.skip("Directory links are unavailable on this host.");
    return;
  }
  await assert.rejects(() => initializeWorkspace(root), (error) => error.code === "STORAGE_LINK_REJECTED");
});

test("loaded workspaces reject nested storage links and junctions", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  const target = path.join(root, "replacement-events");
  await mkdir(target);
  await rm(path.join(workspace.qarinahDir, "events"), { recursive: true, force: true });
  if (!(await createDirectoryLink(target, path.join(workspace.qarinahDir, "events")))) {
    t.skip("Directory links are unavailable on this host.");
    return;
  }
  await assert.rejects(() => loadWorkspace(root), (error) => error.code === "STORAGE_LINK_REJECTED");
  await assert.rejects(() => readEvents(workspace), (error) => error.code === "STORAGE_LINK_REJECTED");
});
