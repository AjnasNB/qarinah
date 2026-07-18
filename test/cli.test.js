import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "../test-support/helpers.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repositoryRoot, "bin", "qarinah.js");

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    import("node:child_process").then(({ spawn }) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    }, reject);
  });
}

test("doctor exit codes and trust controls are automation-safe", async (t) => {
  const root = await temporaryDirectory(t);
  assert.equal((await run(["init", root], repositoryRoot)).code, 0);

  const beforeBuild = await run(["doctor"], root);
  assert.equal(beforeBuild.code, 2);
  assert.equal(JSON.parse(beforeBuild.stdout).ok, false);
  assert.equal(JSON.parse(beforeBuild.stdout).derived, "missing");

  assert.equal((await run(["build"], root)).code, 0);
  const healthy = await run(["doctor"], root);
  assert.equal(healthy.code, 0, healthy.stderr);
  assert.equal(JSON.parse(healthy.stdout).ok, true);

  assert.equal((await run(["untrust"], root)).code, 0);
  const untrusted = await run(["status"], root);
  assert.equal(untrusted.code, 1);
  assert.equal(JSON.parse(untrusted.stderr).code, "WORKSPACE_NOT_TRUSTED");

  const trusted = await run(["trust", "--capture", "metadata"], root);
  assert.equal(trusted.code, 0, trusted.stderr);
  assert.equal(JSON.parse(trusted.stdout).trusted, true);
  assert.equal((await run(["status"], root)).code, 0);
});
