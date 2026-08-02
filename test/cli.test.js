import assert from "node:assert/strict";
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "../test-support/helpers.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repositoryRoot, "bin", "qarinah.js");

function run(args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    import("node:child_process").then(({ spawn }) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd, env: process.env, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.on("error", (error) => {
        if (error.code !== "EPIPE") reject(error);
      });
      child.stdin.end(options.input ?? "");
    }, reject);
  });
}

test("init --if-needed is idempotent in either argument order", async (t) => {
  const root = await temporaryDirectory(t);
  const first = await run(["init", root, "--capture", "content", "--if-needed"], repositoryRoot);
  assert.equal(first.code, 0, first.stderr);
  const second = await run(["init", "--if-needed", root, "--capture", "content"], repositoryRoot);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).workspaceId, JSON.parse(first.stdout).workspaceId);
  const mismatch = await run(["init", root, "--capture", "metadata", "--if-needed"], repositoryRoot);
  assert.equal(mismatch.code, 1);
  assert.equal(JSON.parse(mismatch.stderr).code, "CAPTURE_MODE_MISMATCH");
});

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

  const missingPolicyHash = await run(["trust", "--capture", "metadata"], root);
  assert.equal(missingPolicyHash.code, 1);
  assert.match(JSON.parse(missingPolicyHash.stderr).message, /--policy-hash/);

  const requestedPolicyResult = await run(["policy"], root);
  assert.equal(requestedPolicyResult.code, 0, requestedPolicyResult.stderr);
  const requestedPolicy = JSON.parse(requestedPolicyResult.stdout);
  assert.equal(requestedPolicy.schemaVersion, "qarinah.capture-policy.v1");
  assert.equal(requestedPolicy.capture, "metadata");
  assert.match(requestedPolicy.policyHash, /^sha256:[0-9a-f]{64}$/);

  const wrongPolicy = await run([
    "trust", "--capture", "metadata", "--policy-hash", `sha256:${"0".repeat(64)}`
  ], root);
  assert.equal(wrongPolicy.code, 1);
  assert.equal(JSON.parse(wrongPolicy.stderr).code, "POLICY_NOT_APPROVED");

  const trusted = await run([
    "trust", "--capture", "metadata", "--policy-hash", requestedPolicy.policyHash
  ], root);
  assert.equal(trusted.code, 0, trusted.stderr);
  assert.equal(JSON.parse(trusted.stdout).trusted, true);
  assert.equal(JSON.parse(trusted.stdout).policyHash, requestedPolicy.policyHash);
  assert.equal((await run(["status"], root)).code, 0);

  assert.equal((await run(["policy", "--unknown"], root)).code, 1);
  assert.equal((await run([
    "trust", "--capture", "metadata", "--policy-hash", requestedPolicy.policyHash, "--unknown", "value"
  ], root)).code, 1);
});

test("CLI exports deterministic OKF interchange to safe default and explicit paths", async (t) => {
  const root = await temporaryDirectory(t);
  assert.equal((await run(["init", root], repositoryRoot)).code, 0);
  const canonicalRoot = await realpath(root);
  const recorded = await run([
    "record", "--kind", "decision", "--title", "Export portable context", "--body", "Keep JSONL authoritative."
  ], root);
  assert.equal(recorded.code, 0, recorded.stderr);

  const exported = await run(["export", "okf"], root);
  assert.equal(exported.code, 0, exported.stderr);
  const result = JSON.parse(exported.stdout);
  assert.equal(result.okfVersion, "0.1");
  assert.equal(result.derived, true);
  assert.equal(result.outputDirectory, path.join(canonicalRoot, ".qarinah", "records", "okf"));
  assert.match(await readFile(path.join(result.outputDirectory, "index.md"), "utf8"), /JSONL/);

  const explicit = await run(["export", "okf", "--output", "docs/knowledge"], root);
  assert.equal(explicit.code, 0, explicit.stderr);
  assert.equal(JSON.parse(explicit.stdout).outputDirectory, path.join(canonicalRoot, "docs", "knowledge"));

  const missing = await run(["export", "okf", "--output"], root);
  assert.equal(missing.code, 1);
  assert.match(JSON.parse(missing.stderr).message, /optional --output/);
  assert.equal((await run(["export", "okf", "--output", "--unknown"], root)).code, 1);
  const unsupported = await run(["export", "json"], root);
  assert.equal(unsupported.code, 1);
});

test("JSON stdin keeps model-controlled record and query text out of shell syntax", async (t) => {
  const root = await temporaryDirectory(t);
  const marker = path.join(root, "command-injection-marker.txt");
  const attack = [
    `quotes \"double\" and 'single'`,
    `pipe | redirect > ${marker} < input`,
    "subshell $(echo injected)",
    "backticks `echo injected`",
    "windows & ^ %COMSPEC% ! ||",
    "line one\nline two"
  ].join(" ; ");
  assert.equal((await run(["init", root, "--capture", "content"], repositoryRoot)).code, 0);

  const recordRequest = {
    kind: "decision",
    title: attack,
    body: attack,
    data: { untrusted: attack },
    actor: { type: "agent", id: "model-host" },
    confidence: "claimed",
    relations: [{ type: "references", target: attack }],
    sourceId: attack,
    retention: { class: "project", expiresAt: null }
  };
  const recorded = await run(["record", "--stdin-json"], root, {
    input: JSON.stringify(recordRequest)
  });
  assert.equal(recorded.code, 0, recorded.stderr);
  const event = JSON.parse(recorded.stdout);
  assert.equal(event.title, attack);
  assert.equal(event.body, attack);
  assert.equal(event.data.untrusted, attack);
  assert.equal(event.relations[0].target, attack);

  assert.equal((await run(["build"], root)).code, 0);
  const queried = await run(["query", "--stdin-json"], root, {
    input: JSON.stringify({ query: attack, format: "json", limit: 5, maxChars: 12_000 })
  });
  assert.equal(queried.code, 0, queried.stderr);
  assert.equal(JSON.parse(queried.stdout).query, attack);
  await assert.rejects(() => access(marker), (error) => error.code === "ENOENT");
});

test("JSON stdin request contracts are exclusive, strict, and byte bounded", async (t) => {
  const root = await temporaryDirectory(t);
  assert.equal((await run(["init", root], repositoryRoot)).code, 0);

  const mixed = await run(["record", "--stdin-json", "--title", "unsafe"], root, {
    input: JSON.stringify({ kind: "decision", title: "ignored" })
  });
  assert.equal(mixed.code, 1);
  assert.match(JSON.parse(mixed.stderr).message, /cannot be combined/);

  const unknown = await run(["record", "--stdin-json"], root, {
    input: JSON.stringify({ kind: "decision", title: "strict", command: "echo injected" })
  });
  assert.equal(unknown.code, 1);
  assert.match(JSON.parse(unknown.stderr).message, /unknown field/);

  const nonObject = await run(["query", "--stdin-json"], root, { input: "[]" });
  assert.equal(nonObject.code, 1);
  assert.match(JSON.parse(nonObject.stderr).message, /JSON object/);

  const oversized = await run(["query", "--stdin-json"], root, {
    input: " ".repeat((16 * 1024) + 1)
  });
  assert.equal(oversized.code, 1);
  assert.match(JSON.parse(oversized.stderr).message, /stdin exceeds 16384 bytes/);

  const oversizedRecord = await run(["record", "--stdin-json"], root, {
    input: " ".repeat((128 * 1024) + 1)
  });
  assert.equal(oversizedRecord.code, 1);
  assert.match(JSON.parse(oversizedRecord.stderr).message, /stdin exceeds 131072 bytes/);
});

test("CLI record cannot bypass metadata-only capture", async (t) => {
  const root = await temporaryDirectory(t);
  assert.equal((await run(["init", root], repositoryRoot)).code, 0);
  const recorded = await run([
    "record",
    "--kind", "decision",
    "--title", "CLI_PRIVATE_TITLE_MARKER",
    "--body", "CLI_PRIVATE_BODY_MARKER",
    "--data-json", JSON.stringify({ note: "CLI_PRIVATE_DATA_MARKER" })
  ], root);
  assert.equal(recorded.code, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).title, "Captured decision metadata");
  const persisted = await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8");
  for (const marker of ["CLI_PRIVATE_TITLE_MARKER", "CLI_PRIVATE_BODY_MARKER", "CLI_PRIVATE_DATA_MARKER"]) {
    assert.equal(persisted.includes(marker), false, marker);
  }
});
