import assert from "node:assert/strict";
import fsPromises, { readFile, realpath } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";
import { initializeWorkspace } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const actualMkdir = fsPromises.mkdir;
const actualLstat = fsPromises.lstat;
const windowsOnly = { skip: process.platform !== "win32" };

async function withFilesystemFaults(t, replacements, action) {
  for (const [name, replacement] of Object.entries(replacements)) {
    t.mock.method(fsPromises, name, replacement);
  }
  syncBuiltinESMExports();
  try {
    await action();
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
}

test("Windows initialization retries pending lock deletion without assuming ownership", windowsOnly, async (t) => {
  const root = await realpath(await temporaryDirectory(t));
  const lockPath = path.join(root, ".qarinah", "locks", "initialize");
  const configPath = path.join(root, ".qarinah", "config.json");
  const failures = ["EPERM", "EBUSY"];
  let attempts = 0;
  let inspectionFailures = 0;

  await withFilesystemFaults(t, {
    mkdir: async (candidate, ...options) => {
      if (candidate === lockPath) {
        attempts += 1;
        if (failures.length) {
          await assert.rejects(readFile(configPath), { code: "ENOENT" });
          throw Object.assign(new Error("Lock directory deletion is pending."), { code: failures.shift() });
        }
      }
      return actualMkdir(candidate, ...options);
    },
    lstat: async (candidate, ...options) => {
      if (candidate === lockPath && inspectionFailures === 0) {
        inspectionFailures += 1;
        throw Object.assign(new Error("Lock directory is still busy."), { code: "EBUSY" });
      }
      return actualLstat(candidate, ...options);
    }
  }, async () => {
    const workspace = await initializeWorkspace(root);
    assert.equal(attempts, 3);
    assert.equal(inspectionFailures, 1);
    assert.equal(JSON.parse(await readFile(configPath, "utf8")).workspaceId, workspace.config.workspaceId);
    assert.equal(await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8"), "");
  });
});

test("initialization preserves non-transient permission errors without writing a config", async (t) => {
  const root = await realpath(await temporaryDirectory(t));
  const lockPath = path.join(root, ".qarinah", "locks", "initialize");
  const denied = Object.assign(new Error("Access is denied."), { code: "EACCES" });
  let attempts = 0;

  await withFilesystemFaults(t, {
    mkdir: async (candidate, ...options) => {
      if (candidate === lockPath) {
        attempts += 1;
        throw denied;
      }
      return actualMkdir(candidate, ...options);
    }
  }, async () => {
    await assert.rejects(initializeWorkspace(root), (error) => error === denied);
    assert.equal(attempts, 1);
    await assert.rejects(readFile(path.join(root, ".qarinah", "config.json")), { code: "ENOENT" });
  });
});

test("Windows initialization stops retrying persistent lock errors at its deadline", windowsOnly, async (t) => {
  const root = await realpath(await temporaryDirectory(t));
  const lockPath = path.join(root, ".qarinah", "locks", "initialize");
  const denied = Object.assign(new Error("Lock remains unavailable."), { code: "EPERM" });
  const startedAt = Date.now();
  let clockReads = 0;
  let attempts = 0;

  await withFilesystemFaults(t, {
    mkdir: async (candidate, ...options) => {
      if (candidate === lockPath) {
        attempts += 1;
        throw denied;
      }
      return actualMkdir(candidate, ...options);
    }
  }, async () => {
    t.mock.method(Date, "now", () => startedAt + (clockReads++ === 0 ? 0 : 60_000));
    await assert.rejects(initializeWorkspace(root), (error) => error === denied);
    assert.equal(attempts, 1);
    await assert.rejects(readFile(path.join(root, ".qarinah", "config.json")), { code: "ENOENT" });
  });
});

test("Windows initialization rejects linked lock paths after transient creation errors", windowsOnly, async (t) => {
  const root = await realpath(await temporaryDirectory(t));
  const lockPath = path.join(root, ".qarinah", "locks", "initialize");
  let attempts = 0;

  await withFilesystemFaults(t, {
    mkdir: async (candidate, ...options) => {
      if (candidate === lockPath) {
        attempts += 1;
        throw Object.assign(new Error("Lock path is busy."), { code: "EPERM" });
      }
      return actualMkdir(candidate, ...options);
    },
    lstat: async (candidate, ...options) => candidate === lockPath
      ? { isSymbolicLink: () => true }
      : actualLstat(candidate, ...options)
  }, async () => {
    await assert.rejects(initializeWorkspace(root), (error) => error?.code === "STORAGE_LINK_REJECTED");
    assert.equal(attempts, 1);
    await assert.rejects(readFile(path.join(root, ".qarinah", "config.json")), { code: "ENOENT" });
  });
});
