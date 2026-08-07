import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("website deployment is bound to exact published Qarinah assets", async () => {
  const [workflow, configSource] = await Promise.all([
    readFile(path.join(root, ".github", "workflows", "deploy-site.yml"), "utf8"),
    readFile(path.join(root, "wrangler.jsonc"), "utf8")
  ]);
  const config = JSON.parse(configSource);

  assert.equal(config.name, "qarinah");
  assert.equal(config.assets.directory, "./site-dist");
  assert.equal(config.assets.html_handling, "auto-trailing-slash");
  assert.equal(config.compatibility_date, "2026-08-08");

  assert.doesNotMatch(workflow, /^\s+workflow_run:/m);
  assert.match(workflow, /^\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+push:/m);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
  assert.match(workflow, /contents: read\n  actions: read/);
  assert.doesNotMatch(workflow, /id-token: write|contents: write|deployments: write/);

  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(workflow, /cloudflare\/wrangler-action@[0-9a-f]{40}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /ref: \$\{\{ env\.DEPLOY_COMMIT \}\}/);
  assert.match(workflow, /No successful trusted publish exists for the exact deployment commit/);

  const waitIndex = workflow.indexOf("- name: Wait for the exact npm package version");
  const buildIndex = workflow.indexOf("- name: Build site-dist");
  const checkIndex = workflow.indexOf("- name: Verify site-dist");
  const deployIndex = workflow.indexOf("- name: Deploy checked assets");
  assert.ok(waitIndex >= 0 && waitIndex < buildIndex && buildIndex < checkIndex && checkIndex < deployIndex);
  assert.match(workflow, /for attempt in \{1\.\.30\}/);
  assert.match(workflow, /published_version.*==.*PACKAGE_VERSION/);
  assert.match(workflow, /refusing to build or deploy the site/);
  assert.match(workflow, /npm run build:site/);
  assert.match(workflow, /npm run check:site/);
  assert.match(workflow, /wranglerVersion: "4\.120\.0"/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(workflow, /gitHubToken:/);
});

test("trusted npm publishing retries eventual-consistency signature checks", async () => {
  const workflow = await readFile(
    path.join(root, ".github", "workflows", "publish-npm.yml"),
    "utf8"
  );

  assert.match(workflow, /for attempt in \{1\.\.10\}/);
  assert.match(workflow, /if npm audit signatures; then/);
  assert.match(workflow, /Registry signature verification was not ready/);
  assert.match(workflow, /Registry signature verification did not succeed/);
});
