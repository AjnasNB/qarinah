import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

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

export async function continuationImplementationManifest(root) {
  const files = [];
  for (const relativePath of IMPLEMENTATION_ROOTS) await collectFiles(root, relativePath, files);
  files.sort();
  const hash = createHash("sha256");
  hash.update("qarinah-continuation-implementation-lf-v1\0", "utf8");
  for (const relativePath of files) {
    const normalized = (await readFile(path.join(root, relativePath), "utf8")).replace(/\r\n?/gu, "\n");
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
