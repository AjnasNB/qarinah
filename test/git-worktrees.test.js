import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  initializeWorkspace,
  inspectGitWorktree,
  listGitWorktrees,
  loadLinkedProjectMemory,
  loadWorkspace,
  rebuildDerivedState,
  scanProjectStructure,
  serveMemoryDashboard
} from "../src/index.js";

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

test("Git worktrees receive isolated ledgers and a shared repository identity", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qarinah-worktrees-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const repository = path.join(temporary, "repository");
  const sibling = path.join(temporary, "feature-worktree");
  await mkdir(repository);
  await git(repository, "init", "--initial-branch=main");
  await git(repository, "config", "user.name", "Qarinah Test");
  await git(repository, "config", "user.email", "qarinah-test@example.invalid");
  await writeFile(path.join(repository, "README.md"), "# linked repository\n", "utf8");
  await git(repository, "add", "README.md");
  await git(repository, "commit", "-m", "initial");
  await git(repository, "worktree", "add", "-b", "feature/context", sibling);

  const primary = await inspectGitWorktree(repository);
  const linked = await inspectGitWorktree(sibling);
  assert.equal(primary.repositoryId, linked.repositoryId);
  assert.notEqual(primary.worktreeId, linked.worktreeId);
  assert.equal(primary.linked, false);
  assert.equal(linked.linked, true);
  assert.equal(linked.branch, "feature/context");
  assert.match(linked.commit, /^[0-9a-f]{40}$/u);

  await initializeWorkspace(repository);
  let worktrees = await listGitWorktrees(sibling);
  const repositoryRoot = await realpath(repository);
  const siblingRoot = await realpath(sibling);
  assert.equal(worktrees.length, 2);
  assert.equal(worktrees.find((entry) => entry.root === repositoryRoot).initialized, true);
  assert.equal(worktrees.find((entry) => entry.root === siblingRoot).initialized, false);

  const siblingWorkspace = await initializeWorkspace(sibling, { capture: "content" });
  worktrees = await listGitWorktrees(repository);
  assert.equal(worktrees.every((entry) => entry.initialized), true);
  assert.equal(new Set(worktrees.map((entry) => entry.repositoryId)).size, 1);
  assert.equal(new Set(worktrees.map((entry) => entry.worktreeId)).size, 2);
  assert.equal((await loadWorkspace(repository)).worktree.repositoryId, siblingWorkspace.worktree.repositoryId);
  assert.notEqual((await loadWorkspace(repository)).config.workspaceId, siblingWorkspace.config.workspaceId);
  assert.equal(await readFile(path.join(repository, ".qarinah", "events", "events.jsonl"), "utf8"), "");
  assert.equal(await readFile(path.join(sibling, ".qarinah", "events", "events.jsonl"), "utf8"), "");

  const scan = await scanProjectStructure({ cwd: sibling });
  assert.equal(scan.worktree.repositoryId, primary.repositoryId);
  assert.equal(scan.worktree.worktreeId, linked.worktreeId);
  assert.equal(scan.worktree.branch, "feature/context");
  assert.equal(scan.worktree.linked, true);
  await rebuildDerivedState(sibling);
  const graph = JSON.parse(await readFile(path.join(sibling, ".qarinah", "graph", "graph.json"), "utf8"));
  const worktreeNode = graph.nodes.find((node) => node.type === "project.worktree");
  assert.equal(worktreeNode.id, linked.worktreeId);
  assert.equal(worktreeNode.repositoryId, primary.repositoryId);
  assert.ok(graph.edges.some((edge) => edge.source === linked.worktreeId && edge.type === "contains"));
  const linkedMemory = (await loadLinkedProjectMemory(sibling, { rebuild: false })).memory;
  assert.ok(linkedMemory.nodes.some((node) => node.type === "worktree" && node.id === linked.worktreeId));
  const dashboard = await serveMemoryDashboard({ cwd: sibling, includeWorktrees: true, port: 0 });
  t.after(() => dashboard.close());
  assert.equal(dashboard.projects.length, 2);
  assert.equal(new Set(dashboard.projects.map((project) => project.repositoryId)).size, 1);
  const index = await fetch(dashboard.url).then((response) => response.text());
  assert.match(index, /Your worktrees remember/u);
  assert.match(index, /feature\/context/u);
  assert.match(index, new RegExp(primary.repositoryId, "u"));
});

test("Git inspection is optional outside a repository", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "qarinah-not-git-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(await inspectGitWorktree(directory), null);
  assert.deepEqual(await listGitWorktrees(directory), []);
});
