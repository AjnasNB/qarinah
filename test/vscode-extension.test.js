import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../integrations/vscode/qarinah-memory/", import.meta.url);
const repositoryRoot = new URL("../", import.meta.url);

test("VS Code and Cursor panel package is local, read-only, searchable, and exact-versioned", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const packageManifest = JSON.parse(await readFile(new URL("package.json", repositoryRoot), "utf8"));
  const source = await readFile(new URL("extension.cjs", root), "utf8");
  assert.equal(manifest.version, packageManifest.version);
  assert.equal(manifest.main, "./extension.cjs");
  assert.equal(manifest.contributes.views.qarinah[0].id, "qarinah.developerMemory");
  assert.match(source, /"panel", "--limit", "80"/u);
  assert.match(source, /data-search/u);
  assert.match(source, /data-graph/u);
  assert.match(source, /data-sessions/u);
  assert.match(source, /data-session-detail/u);
  assert.match(source, /data-proof/u);
  assert.match(source, /renderSessionDetail/u);
  assert.match(source, /eventManifestHash/u);
  assert.match(source, /data-worktrees/u);
  assert.match(source, /default-src 'none'/u);
  assert.deepEqual([...new Set(source.match(/https?:\/\/[^"']+/gu))], ["http://www.w3.org/2000/svg"]);
  assert.doesNotMatch(source, /shell:\s*true/u);
  assert.match(source, /randomBytes\(24\)/u);
  assert.match(source, /renderMessage/u);
});
