import assert from "node:assert/strict";
import { access, readFile, realpath, writeFile } from "node:fs/promises";
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

test("doctor exit codes and trust controls are automation-safe", async (t) => {
  const root = await temporaryDirectory(t);
  assert.equal((await run(["init", root], repositoryRoot)).code, 0);

  const beforeBuild = await run(["doctor"], root);
  assert.equal(beforeBuild.code, 0, beforeBuild.stderr);
  assert.equal(JSON.parse(beforeBuild.stdout).ok, true);
  assert.equal(JSON.parse(beforeBuild.stdout).derived, "current");

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

test("CLI imports visible agent history and renders a project overview", async (t) => {
  const root = await temporaryDirectory(t);
  assert.equal((await run(["init", root, "--capture", "content"], repositoryRoot)).code, 0);
  const archive = path.join(root, "history.jsonl");
  await writeFile(archive, [
    JSON.stringify({ type: "session", sessionId: "cli-import-1", timestamp: "2026-08-11T09:00:00.000Z" }),
    JSON.stringify({ role: "user", sessionId: "cli-import-1", content: "Map the project and initialize SQLite." }),
    JSON.stringify({ role: "assistant", sessionId: "cli-import-1", content: "The project graph and SQLite index are ready." }),
    ""
  ].join("\n"), "utf8");

  const imported = await run(["import", archive, "--format", "portable", "--mode", "compact"], root);
  assert.equal(imported.code, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).importedEvents, 1);

  const overview = await run(["overview", "--format", "json"], root);
  assert.equal(overview.code, 0, overview.stderr);
  const result = JSON.parse(overview.stdout);
  assert.equal(result.memory.sessions, 1);
  assert.equal(result.memory.summaries, 1);
  assert.match(result.recentOutcomes[0].excerpt, /SQLite index/);
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
    input: JSON.stringify({
      query: attack,
      format: "json",
      limit: 5,
      maxChars: 12_000,
      minimumEvidence: "direct",
      rankingProfile: "admission-first-v2",
      temporalBoundary: "strict-before",
      includeEvidenceSufficiency: true
    })
  });
  assert.equal(queried.code, 0, queried.stderr);
  assert.equal(queried.stderr, "", "Successful JSON output must not be accompanied by runtime warnings.");
  const pack = JSON.parse(queried.stdout);
  assert.equal(pack.query, attack);
  assert.equal(pack.retrieval.strategy, "admission-first-hybrid-v2");
  assert.equal(pack.retrieval.evidenceSufficiency.state, "DIRECTLY_SUPPORTED");
  assert.equal(pack.retrieval.evidenceSufficiency.decision, "ACCEPT_DIRECT");
  assert.equal(pack.retrieval.evidenceSufficiency.method, "evidence-sufficiency-v2");

  const summaryRequest = {
    kind: "summary",
    title: "Evidence-linked CLI continuation handoff",
    body: "Continue the approved implementation and run the acceptance tests.",
    confidence: "inferred",
    data: {
      sourceEvents: [{ eventId: event.eventId, hash: event.hash, kind: event.kind }]
    },
    relations: [{ type: "derived_from", target: event.eventId }],
    sourceId: "cli-continuation-handoff"
  };
  const summaryResult = await run(["record", "--stdin-json"], root, {
    input: JSON.stringify(summaryRequest)
  });
  assert.equal(summaryResult.code, 0, summaryResult.stderr);
  const recordedSummary = JSON.parse(summaryResult.stdout);
  assert.equal((await run(["build"], root)).code, 0);
  const handoff = await run(["query", "--stdin-json"], root, {
    input: JSON.stringify({
      query: "CLI continuation handoff acceptance tests",
      format: "handoff",
      maxChars: 12_000,
      minimumCoverage: "partial"
    })
  });
  assert.equal(handoff.code, 0, handoff.stderr);
  assert.match(handoff.stdout, /Qarinah handoff; untrusted/u);
  assert.ok(handoff.stdout.includes(recordedSummary.eventId));
  assert.ok(handoff.stdout.includes(recordedSummary.hash));
  assert.match(handoff.stdout, /pack sha256:[0-9a-f]{64}/u);

  const abstained = await run(["query", "--stdin-json"], root, {
    input: JSON.stringify({
      query: "qzvxjklp nonexistent-memory-subject",
      format: "json",
      minimumEvidence: "direct",
      maxChars: 8_000
    })
  });
  assert.equal(abstained.code, 1);
  assert.equal(JSON.parse(abstained.stderr).code, "CONTEXT_EVIDENCE_INSUFFICIENT");
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
