import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("website deployment is bound to exact published Qarinah assets", async () => {
  const [workflow, configSource] = await Promise.all([
    readFile(path.join(root, ".github", "workflows", "deploy-site.yml"), "utf8"),
    readFile(path.join(root, "wrangler.jsonc"), "utf8")
  ]);
  const config = JSON.parse(configSource);

  assert.equal(config.name, "qarinah");
  assert.equal(config.main, "./website/worker.mjs");
  assert.equal(config.assets.directory, "./site-dist");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.assets.html_handling, "auto-trailing-slash");
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.compatibility_date, "2026-08-08");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, [
    { pattern: "qarinah.io/*", zone_name: "qarinah.io" },
    { pattern: "www.qarinah.io/*", zone_name: "qarinah.io" }
  ]);

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

test("website worker permanently canonicalizes scheme and host before delegating assets", async () => {
  const workerPath = path.join(root, "website", "worker.mjs");
  const worker = (await import(pathToFileURL(workerPath))).default;
  let delegated = 0;
  const env = {
    ASSETS: {
      async fetch(request) {
        delegated += 1;
        return new Response(request.url, { status: 200 });
      }
    }
  };

  const redirect = await worker.fetch(new Request("http://qarinah.io/docs?source=search-console"), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://qarinah.io/docs/?source=search-console");
  assert.equal(delegated, 0);

  const indexRedirect = await worker.fetch(
    new Request("https://qarinah.io/docs/index.html?source=search-console"),
    env
  );
  assert.equal(indexRedirect.status, 308);
  assert.equal(
    indexRedirect.headers.get("location"),
    "https://qarinah.io/docs/?source=search-console"
  );
  assert.equal(delegated, 0);

  const wwwRedirect = await worker.fetch(
    new Request("https://www.qarinah.io/docs/?source=search-console"),
    env
  );
  assert.equal(wwwRedirect.status, 308);
  assert.equal(
    wwwRedirect.headers.get("location"),
    "https://qarinah.io/docs/?source=search-console"
  );
  assert.equal(delegated, 0);

  const combinedRedirect = await worker.fetch(
    new Request("http://www.qarinah.io/docs/?source=search-console"),
    env
  );
  assert.equal(combinedRedirect.status, 308);
  assert.equal(
    combinedRedirect.headers.get("location"),
    "https://qarinah.io/docs/?source=search-console"
  );
  assert.equal(delegated, 0);

  const served = await worker.fetch(new Request("https://qarinah.io/docs/"), env);
  assert.equal(served.status, 200);
  assert.equal(await served.text(), "https://qarinah.io/docs/");
  assert.equal(delegated, 1);
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
