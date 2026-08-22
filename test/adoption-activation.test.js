import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  activationTrackingStatus,
  configureActivationTracking,
  recordActivationEvent
} from "../src/activation.js";
import { initializeWorkspace } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repositoryRoot, "bin", "qarinah.js");

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("demo creates an isolated populated workspace and an immediately inspectable graph", async (t) => {
  const parent = await temporaryDirectory(t);
  const output = path.join(parent, "demo");
  const result = await run(["demo", "--output", output], repositoryRoot);
  assert.equal(result.code, 0, result.stderr);
  const demo = JSON.parse(result.stdout);
  assert.equal(demo.ok, true);
  assert.equal(demo.isolated, true);
  assert.equal(demo.telemetryEnabled, false);
  assert.equal(demo.transientSessionRemoved, true);
  await assert.rejects(access(path.join(output, "session-a-transcript.txt")));
  assert.ok(demo.filesMapped >= 3);
  assert.equal(demo.expectedResult.title, "Retry checkout requests three times");
  assert.match(demo.expectedResult.eventId, /^evt_/u);
  assert.match(demo.expectedResult.hash, /^sha256:/u);
  assert.match(await readFile(demo.dashboard, "utf8"), /Interactive circular project-memory graph/u);
  assert.equal((await run(["doctor"], output)).code, 0);
});

test("activation tracking is explicit, content-free, once-only, and disableable", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  assert.equal((await activationTrackingStatus({ cwd: root })).enabled, false);

  const received = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      received.push(JSON.parse(body));
      response.writeHead(202).end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/activation`;

  await configureActivationTracking({ cwd: root, enabled: true });
  const first = await recordActivationEvent("setup_completed", { cwd: root, endpoint });
  assert.equal(first.sent, true);
  const repeated = await recordActivationEvent("setup_completed", { cwd: root, endpoint });
  assert.equal(repeated.reason, "already-sent");
  assert.equal(received.length, 1);
  assert.deepEqual(Object.keys(received[0]).sort(), [
    "consentVersion", "event", "installationId", "occurredAt", "platform", "schemaVersion", "version"
  ]);
  assert.equal(JSON.stringify(received[0]).includes(root), false);
  assert.equal((await activationTrackingStatus({ cwd: root })).sentEvents.includes("setup_completed"), true);
  await configureActivationTracking({ cwd: root, enabled: false });
  assert.equal((await recordActivationEvent("first_capture", { cwd: root, endpoint })).enabled, false);
});

test("activation endpoint failure never blocks local product behavior", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  await configureActivationTracking({ cwd: root, enabled: true });
  const result = await recordActivationEvent("first_retrieval", {
    cwd: root,
    endpoint: "http://127.0.0.1:1/unavailable",
    timeoutMs: 100
  });
  assert.equal(result.enabled, true);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "endpoint-unavailable");
});
