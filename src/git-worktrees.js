import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const MAX_WORKTREES = 64;
const COMMIT = /^[0-9a-f]{40}$/u;

function stableId(prefix, value) {
  const digest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
  return `${prefix}_${digest}`;
}

async function git(cwd, args, options = {}) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: MAX_GIT_OUTPUT_BYTES
    });
    return options.trim === false ? result.stdout : result.stdout.trim();
  } catch (error) {
    if (options.optional === true) return null;
    throw error;
  }
}

async function canonicalGitPath(cwd, value) {
  const absolute = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  return realpath(absolute);
}

async function exactWorkspaceInitialized(root) {
  const config = path.join(root, ".qarinah", "config.json");
  try {
    const metadata = await lstat(config);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return false;
    await access(config);
    return true;
  } catch {
    return false;
  }
}

async function repositoryIdentity(cwd, commonDir) {
  const rootsText = await git(cwd, ["rev-list", "--max-parents=0", "HEAD"], { optional: true });
  const roots = (rootsText ?? "").split(/\r?\n/u).filter((value) => COMMIT.test(value)).sort();
  const basis = roots.length > 0 ? `root-commits\0${roots.join("\0")}` : `common-dir\0${commonDir}`;
  return stableId("repo", basis);
}

function parseWorktreeRecords(output) {
  const records = output.split("\0\0").filter(Boolean);
  if (records.length > MAX_WORKTREES) {
    throw new RangeError(`Git reports more than the supported ${MAX_WORKTREES} worktrees.`);
  }
  return records.map((record) => {
    const fields = record.split("\0").filter(Boolean);
    const parsed = { worktree: null, head: null, branch: null, detached: false, bare: false, prunable: false };
    for (const field of fields) {
      const separator = field.indexOf(" ");
      const key = separator === -1 ? field : field.slice(0, separator);
      const value = separator === -1 ? "" : field.slice(separator + 1);
      if (key === "worktree") parsed.worktree = value;
      else if (key === "HEAD") parsed.head = value;
      else if (key === "branch") parsed.branch = value.startsWith("refs/heads/") ? value.slice("refs/heads/".length) : value;
      else if (key === "detached") parsed.detached = true;
      else if (key === "bare") parsed.bare = true;
      else if (key === "prunable") parsed.prunable = true;
    }
    return parsed;
  });
}

export async function inspectGitWorktree(start = process.cwd()) {
  const cwd = await realpath(path.resolve(start));
  const rootText = await git(cwd, ["rev-parse", "--show-toplevel"], { optional: true });
  if (!rootText) return null;
  const root = await canonicalGitPath(cwd, rootText);
  const commonText = await git(root, ["rev-parse", "--git-common-dir"]);
  const gitDirText = await git(root, ["rev-parse", "--git-dir"]);
  const commonDir = await canonicalGitPath(root, commonText);
  const gitDir = await canonicalGitPath(root, gitDirText);
  const commitText = await git(root, ["rev-parse", "--verify", "HEAD"], { optional: true });
  const commit = commitText && COMMIT.test(commitText) ? commitText : null;
  const branch = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { optional: true });
  const repositoryId = await repositoryIdentity(root, commonDir);
  return Object.freeze({
    schemaVersion: "qarinah.git-worktree.v1",
    repositoryId,
    worktreeId: stableId("wt", root),
    root,
    branch: branch || null,
    commit,
    detached: branch === null,
    linked: gitDir !== commonDir
  });
}

export async function listGitWorktrees(start = process.cwd()) {
  const current = await inspectGitWorktree(start);
  if (!current) return Object.freeze([]);
  const output = await git(current.root, ["worktree", "list", "--porcelain", "-z"], { trim: false });
  const parsed = parseWorktreeRecords(output);
  const commonDirectoryText = await git(current.root, ["rev-parse", "--git-common-dir"]);
  const commonDirectory = await canonicalGitPath(current.root, commonDirectoryText);
  const results = [];
  for (const record of parsed) {
    if (!record.worktree || record.bare || record.prunable) continue;
    let root;
    try {
      root = await realpath(path.resolve(record.worktree));
    } catch {
      continue;
    }
    const gitDirectoryText = await git(root, ["rev-parse", "--git-dir"]);
    const gitDirectory = await canonicalGitPath(root, gitDirectoryText);
    results.push(Object.freeze({
      schemaVersion: "qarinah.git-worktree.v1",
      repositoryId: current.repositoryId,
      worktreeId: stableId("wt", root),
      root,
      branch: record.branch,
      commit: record.head && COMMIT.test(record.head) ? record.head : null,
      detached: record.detached,
      linked: gitDirectory !== commonDirectory,
      current: root === current.root,
      initialized: await exactWorkspaceInitialized(root)
    }));
  }
  return Object.freeze(results.sort((left, right) => left.root.localeCompare(right.root)));
}
