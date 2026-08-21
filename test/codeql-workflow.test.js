import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CodeQL scans authored sources without duplicate generated plugin runtimes", async () => {
  const [workflow, config] = await Promise.all([
    readFile(new URL("../.github/workflows/codeql.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/codeql/codeql-config.yml", import.meta.url), "utf8")
  ]);

  assert.match(workflow, /config-file: \.\/\.github\/codeql\/codeql-config\.yml/u);
  assert.match(config, /integrations\/codex\/qarinah\/runtime\/\*\*/u);
  assert.match(config, /integrations\/claude\/qarinah\/runtime\/\*\*/u);
  assert.doesNotMatch(config, /(?:^|\n)\s*-\s+(?:src|bin|scripts|test)\//u);
});
