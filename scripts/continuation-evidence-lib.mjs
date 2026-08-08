import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const IMPLEMENTATION_ROOTS = [
  "bin/qarinah.js",
  "integrations/claude/qarinah",
  "integrations/codex/qarinah",
  "package-lock.json",
  "package.json",
  "schemas",
  "src",
  "types"
];
const run = promisify(execFile);

async function collectFiles(root, relativePath, files) {
  const absolutePath = path.join(root, relativePath);
  const stats = await lstat(absolutePath);
  if (stats.isSymbolicLink()) throw new Error(`Implementation input must not be linked: ${relativePath}`);
  if (stats.isFile()) {
    files.push(relativePath.replaceAll("\\", "/"));
    return;
  }
  if (!stats.isDirectory()) throw new Error(`Unsupported implementation input: ${relativePath}`);
  for (const entry of (await readdir(absolutePath)).sort()) {
    await collectFiles(root, path.join(relativePath, entry), files);
  }
}

async function digestFiles(files, readContent) {
  const hash = createHash("sha256");
  hash.update("qarinah-continuation-implementation-lf-v1\0", "utf8");
  for (const relativePath of files) {
    const normalized = (await readContent(relativePath)).replace(/\r\n?/gu, "\n");
    hash.update(`${Buffer.byteLength(relativePath)}:${relativePath}\0${Buffer.byteLength(normalized)}:`, "utf8");
    hash.update(normalized, "utf8");
    hash.update("\0", "utf8");
  }
  return {
    algorithm: "sha256-path-lf-content-v1",
    fileCount: files.length,
    digest: `sha256:${hash.digest("hex")}`
  };
}

export async function continuationImplementationManifest(root) {
  const files = [];
  for (const relativePath of IMPLEMENTATION_ROOTS) await collectFiles(root, relativePath, files);
  files.sort();
  return digestFiles(files, (relativePath) => readFile(path.join(root, relativePath), "utf8"));
}

export async function continuationImplementationManifestAtCommit(root, commit) {
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new TypeError("commit must be a full lowercase Git object id.");
  const listing = await run("git", ["ls-tree", "-r", "-z", commit, "--", ...IMPLEMENTATION_ROOTS], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024
  });
  const entries = listing.stdout.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) blob [0-9a-f]{40}\t(.+)$/u.exec(entry);
    if (!match) throw new Error(`Unsupported Git implementation entry: ${entry}`);
    if (match[1] === "120000") throw new Error(`Historical implementation input must not be linked: ${match[2]}`);
    return match[2];
  }).sort();
  if (entries.length === 0) throw new Error(`No implementation files found at ${commit}.`);
  return digestFiles(entries, async (relativePath) => {
    const result = await run("git", ["show", `${commit}:${relativePath}`], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024
    });
    return result.stdout.toString("utf8");
  });
}
