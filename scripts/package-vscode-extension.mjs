import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(repositoryRoot, "integrations", "vscode", "qarinah-memory");
const outputDirectory = path.join(repositoryRoot, "artifacts");
const outputPath = path.join(outputDirectory, "qarinah-developer-memory-0.5.0-rc.1.vsix");
const vscePath = path.join(repositoryRoot, "node_modules", "@vscode", "vsce", "vsce");

await mkdir(outputDirectory, { recursive: true });
const result = spawnSync(process.execPath, [
  vscePath,
  "package",
  "--no-dependencies",
  "--out",
  outputPath
], {
  cwd: extensionRoot,
  encoding: "utf8",
  shell: false,
  stdio: ["ignore", "pipe", "pipe"]
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "VS Code extension packaging failed.\n");
  process.exit(result.status ?? 1);
}

const artifact = await stat(outputPath);
assert.ok(artifact.isFile() && artifact.size > 0, "VSIX artifact is empty.");
process.stdout.write(`${outputPath} (${artifact.size} bytes)\n`);
