import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const MAX_GIT_METADATA_BYTES = 64 * 1024;
const MAX_WORKTREES = 64;
const COMMIT = /^[0-9a-f]{40}$/u;

function stableId(prefix, value) {
  const digest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
  return `${prefix}_${digest}`;
}

async function optionalMetadata(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

async function readGitText(target, optional = false) {
  try {
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > MAX_GIT_METADATA_BYTES) {
      if (optional) return null;
      throw new TypeError(`Git metadata is not a bounded regular file: ${path.basename(target)}`);
    }
    return (await readFile(target, "utf8")).trim();
  } catch (error) {
    if (optional && (error?.code === "ENOENT" || error?.code === "ENOTDIR")) return null;
    throw error;
  }
}

async function findWorktreeRoot(start) {
  let current;
  try {
    current = await realpath(path.resolve(start));
  } catch {
    return null;
  }
  const startMetadata = await optionalMetadata(current);
  if (!startMetadata?.isDirectory()) return null;
  while (true) {
    const marker = await optionalMetadata(path.join(current, ".git"));
    if (marker?.isDirectory() || marker?.isFile()) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function resolveGitDirectories(root) {
  const marker = path.join(root, ".git");
  const metadata = await optionalMetadata(marker);
  if (metadata?.isDirectory()) {
    const gitDir = await realpath(marker);
    return { gitDir, commonDir: gitDir, linked: false };
  }
  if (!metadata?.isFile() || metadata.isSymbolicLink()) return null;
  const pointer = await readGitText(marker);
  const match = /^gitdir: (.+)$/u.exec(pointer);
  if (!match) return null;
  const gitDir = await realpath(path.resolve(root, match[1]));
  const commonPointer = await readGitText(path.join(gitDir, "commondir"), true);
  const commonDir = commonPointer
    ? await realpath(path.resolve(gitDir, commonPointer))
    : gitDir;
  return { gitDir, commonDir, linked: gitDir !== commonDir };
}

async function resolveLooseReference(gitDir, commonDir, reference) {
  for (const base of gitDir === commonDir ? [commonDir] : [gitDir, commonDir]) {
    const value = await readGitText(path.join(base, ...reference.split("/")), true);
    if (value && COMMIT.test(value)) return value;
  }
  const packed = await readGitText(path.join(commonDir, "packed-refs"), true);
  if (!packed) return null;
  for (const line of packed.split(/\r?\n/u)) {
    if (line.startsWith("#") || line.startsWith("^") || line.trim() === "") continue;
    const separator = line.indexOf(" ");
    if (separator === -1) continue;
    const commit = line.slice(0, separator);
    if (line.slice(separator + 1) === reference && COMMIT.test(commit)) return commit;
  }
  return null;
}

async function headState(gitDir, commonDir) {
  const head = await readGitText(path.join(gitDir, "HEAD"), true);
  if (!head) return { branch: null, commit: null, detached: true };
  if (COMMIT.test(head)) return { branch: null, commit: head, detached: true };
  const match = /^ref: (refs\/heads\/(.+))$/u.exec(head);
  if (!match) return { branch: null, commit: null, detached: true };
  return {
    branch: match[2],
    commit: await resolveLooseReference(gitDir, commonDir, match[1]),
    detached: false
  };
}

async function inspectResolvedWorktree(root) {
  const directories = await resolveGitDirectories(root);
  if (!directories) return null;
  const head = await headState(directories.gitDir, directories.commonDir);
  return {
    root,
    ...directories,
    ...head,
    repositoryId: stableId("repo", `common-dir\0${directories.commonDir}`),
    worktreeId: stableId("wt", root)
  };
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

function publicWorktree(worktree, extra = {}) {
  return Object.freeze({
    schemaVersion: "qarinah.git-worktree.v1",
    repositoryId: worktree.repositoryId,
    worktreeId: worktree.worktreeId,
    root: worktree.root,
    branch: worktree.branch,
    commit: worktree.commit,
    detached: worktree.detached,
    linked: worktree.linked,
    ...extra
  });
}

export async function inspectGitWorktree(start = process.cwd()) {
  const root = await findWorktreeRoot(start);
  if (!root) return null;
  const inspected = await inspectResolvedWorktree(root);
  return inspected ? publicWorktree(inspected) : null;
}

async function mainWorktreeRoot(commonDir) {
  if (path.basename(commonDir) !== ".git") return null;
  const candidate = path.dirname(commonDir);
  try {
    const resolved = await resolveGitDirectories(candidate);
    return resolved?.commonDir === commonDir ? candidate : null;
  } catch {
    return null;
  }
}

async function linkedWorktreeRoots(commonDir) {
  const directory = path.join(commonDir, "worktrees");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const worktreeDirectories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink());
  if (worktreeDirectories.length > MAX_WORKTREES) {
    throw new RangeError(`Git reports more than the supported ${MAX_WORKTREES} worktrees.`);
  }
  const roots = [];
  for (const entry of worktreeDirectories) {
    const pointer = await readGitText(path.join(directory, entry.name, "gitdir"), true);
    if (!pointer) continue;
    try {
      const marker = await realpath(path.resolve(directory, entry.name, pointer));
      roots.push(await realpath(path.dirname(marker)));
    } catch {
      // Missing worktrees are prunable Git metadata and are not active context roots.
    }
  }
  return roots;
}

export async function listGitWorktrees(start = process.cwd()) {
  const currentRoot = await findWorktreeRoot(start);
  if (!currentRoot) return Object.freeze([]);
  const current = await inspectResolvedWorktree(currentRoot);
  if (!current) return Object.freeze([]);
  const candidates = new Set([currentRoot]);
  const main = await mainWorktreeRoot(current.commonDir);
  if (main) candidates.add(main);
  for (const root of await linkedWorktreeRoots(current.commonDir)) candidates.add(root);
  if (candidates.size > MAX_WORKTREES) {
    throw new RangeError(`Git reports more than the supported ${MAX_WORKTREES} worktrees.`);
  }
  const results = [];
  for (const root of candidates) {
    let inspected;
    try {
      inspected = await inspectResolvedWorktree(root);
    } catch {
      continue;
    }
    if (!inspected || inspected.commonDir !== current.commonDir) continue;
    results.push(publicWorktree(inspected, {
      current: root === currentRoot,
      initialized: await exactWorkspaceInitialized(root)
    }));
  }
  return Object.freeze(results.sort((left, right) => left.root.localeCompare(right.root)));
}
