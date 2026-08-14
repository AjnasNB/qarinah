import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  initializeWorkspace,
  readEvents,
  rebuildDerivedState
} from "../src/index.js";
import { acquireWorkspaceWriteLock } from "../src/store.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

function machineTrustPath(root) {
  const resolved = path.resolve(root);
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const digest = createHash("sha256").update(normalized).digest("hex");
  const stateRoot = process.env.QARINAH_STATE_DIR
    ? path.resolve(process.env.QARINAH_STATE_DIR)
    : process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Qarinah")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", "Qarinah")
        : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "qarinah");
  return path.join(stateRoot, "trusted-workspaces", `${digest}.json`);
}

async function snapshotDurableFiles(root) {
  const files = new Map();
  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (nextRelative === "locks" || nextRelative.startsWith("locks/")) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate, nextRelative);
      else if (entry.isFile()) files.set(nextRelative, (await readFile(candidate)).toString("base64"));
    }
  }
  await visit(path.join(root, ".qarinah"));
  files.set("machine-trust", (await readFile(machineTrustPath(root))).toString("base64"));
  return [...files.entries()];
}

async function abortWaitingOperation(operation) {
  const controller = new AbortController();
  const pending = operation(controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 40));
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === "AbortError");
}

test("AbortSignal cancels held-lock appends, reads, and rebuilds without durable writes", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({ title: "Cancellation baseline" }), { cwd: root });
  await rebuildDerivedState(root);

  const release = await acquireWorkspaceWriteLock(workspace);
  try {
    const before = await snapshotDurableFiles(workspace.root);
    await abortWaitingOperation((signal) => appendEvent(
      eventInput({ title: "This append must not commit" }),
      { cwd: root, signal }
    ));
    assert.deepEqual(await snapshotDurableFiles(workspace.root), before);

    await abortWaitingOperation((signal) => readEvents(root, { signal }));
    assert.deepEqual(await snapshotDurableFiles(workspace.root), before);

    await abortWaitingOperation((signal) => rebuildDerivedState(root, { signal }));
    assert.deepEqual(await snapshotDurableFiles(workspace.root), before);
  } finally {
    await release();
  }
  assert.equal((await readEvents(root)).length, 1);
});
