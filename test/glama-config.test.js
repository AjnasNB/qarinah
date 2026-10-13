import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Glama metadata identifies the repository maintainer", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "glama.json"), "utf8"));
  assert.deepEqual(manifest, {
    $schema: "https://glama.ai/mcp/schemas/server.json",
    maintainers: ["AjnasNB"]
  });
});

test("the Glama container starts the diagnostic-only stdio MCP server", async () => {
  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /^FROM node:24-bookworm-slim$/m);
  assert.match(dockerfile, /^RUN npm ci --omit=dev --ignore-scripts$/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^CMD \["node", "bin\/qarinah\.js", "mcp"\]$/m);
  assert.doesNotMatch(dockerfile, /--allow-query/);
});
