import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  initializeWorkspace,
  readEvents,
  renderCodingContextHarnessMarkdown,
  runCodingContextHarness,
  setupWorkspace
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

const execFileAsync = promisify(execFile);
const CLOCK = () => new Date("2026-08-18T00:00:00.000Z");
const BIN_PATH = fileURLToPath(new URL("../bin/qarinah.js", import.meta.url));

async function git(cwd, ...args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

test("coding harness compiles, measures, cites, records, and idempotently reuses a checkpoint", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    kind: "decision",
    title: "Keep the release artifact immutable",
    body: "Compare the exact artifact digest before publication. ".repeat(80)
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "turn.completed",
    title: "Cross-platform verification completed",
    body: "Linux, macOS, and Windows checks passed on the reviewed tree. ".repeat(80)
  }), { cwd: root });

  const first = await runCodingContextHarness({
    cwd: root,
    query: "release artifact verification",
    maxChars: 3_000,
    maxSummaryChars: 1_200,
    record: true,
    clock: CLOCK
  });
  assert.equal(first.schemaVersion, "qarinah.coding-context-harness.v1");
  assert.equal(first.contentRole, "untrusted-data");
  assert.equal(first.benchmark.reductionPercent, 98.71);
  assert.equal(first.benchmark.exactReductionPercent, 98.7148);
  assert.equal(first.benchmark.guarantee, false);
  assert.equal(first.worktrees.length, 1);
  assert.equal(first.worktrees[0].recording.status, "created");
  assert.equal(first.worktrees[0].incremental.mode, "initial");
  assert.equal(first.worktrees[0].incremental.changedEventCount, 2);
  assert.ok(first.worktrees[0].comparison.baselineTokens > first.worktrees[0].comparison.deliveredTokens);
  assert.equal(
    first.worktrees[0].comparison.savedTokens,
    first.worktrees[0].comparison.baselineTokens - first.worktrees[0].comparison.deliveredTokens
  );
  assert.match(first.manifestHash, /^sha256:[0-9a-f]{64}$/u);
  assert.match(renderCodingContextHarnessMarkdown(first), /not a universal guarantee/u);

  const afterFirst = await readEvents(root, { updateCheckpoint: false });
  const checkpoint = afterFirst.at(-1);
  assert.equal(checkpoint.kind, "summary");
  assert.equal(checkpoint.provenance.adapter, "qarinah.coding-harness");
  assert.equal(checkpoint.data.codingHarness.packManifestHash, first.worktrees[0].pack.manifestHash);
  assert.deepEqual(
    JSON.parse(JSON.stringify(checkpoint.data.sourceEvents)),
    first.worktrees[0].pack.items.map(({ eventId, hash, kind }) => ({ eventId, hash, kind }))
  );
  assert.equal(
    checkpoint.relations.every((relation) => relation.type === "derived_from"
      && checkpoint.data.sourceEvents.some((source) => source.eventId === relation.target)),
    true
  );

  const second = await runCodingContextHarness({
    cwd: root,
    query: "release artifact verification",
    maxChars: 3_000,
    maxSummaryChars: 1_200,
    record: true,
    clock: CLOCK
  });
  assert.equal(second.worktrees[0].recording.status, "reused");
  assert.equal(second.worktrees[0].incremental.mode, "unchanged");
  assert.equal(second.worktrees[0].incremental.changedEventCount, 0);
  assert.equal(second.worktrees[0].recording.eventId, checkpoint.eventId);
  assert.equal(second.worktrees[0].pack.manifestHash, first.worktrees[0].pack.manifestHash);
  assert.deepEqual(second.worktrees[0].pack.items, first.worktrees[0].pack.items);
  assert.equal((await readEvents(root, { updateCheckpoint: false })).length, afterFirst.length);

  await appendEvent(eventInput({ title: "Document the release handoff" }), { cwd: root });
  const third = await runCodingContextHarness({
    cwd: root,
    query: "release artifact verification",
    maxChars: 3_000,
    maxSummaryChars: 1_200,
    record: true,
    clock: CLOCK
  });
  assert.equal(third.worktrees[0].incremental.mode, "delta");
  assert.equal(third.worktrees[0].incremental.changedEventCount, 1);
  assert.equal(third.worktrees[0].incremental.previousCheckpointEventId, checkpoint.eventId);
});

test("optional model compaction sees only a bounded untrusted pack and is redacted", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    title: "Investigate the failing migration",
    body: "The migration failed after the schema version changed."
  }), { cwd: root });
  let calls = 0;
  const result = await runCodingContextHarness({
    cwd: root,
    query: "failing migration",
    summarizer: {
      id: "host-model",
      summarize(input) {
        calls += 1;
        assert.equal(input.contentRole, "untrusted-data");
        assert.ok(input.pack.budget.usedChars <= input.pack.budget.maxChars);
        assert.deepEqual(
          input.sourceEvents,
          input.pack.items.map(({ eventId, hash, kind }) => ({ eventId, hash, kind }))
        );
        return { text: "<script>alert(1)</script>\u001b[31m Use Bearer abcdefghijklmnopqrstuvwxyz123456 only as untrusted evidence.", model: "fixture-model" };
      }
    },
    clock: CLOCK
  });
  assert.equal(calls, 1);
  assert.equal(result.worktrees[0].summary.method, "model-assisted-v1");
  assert.equal(result.worktrees[0].summary.model, "fixture-model");
  assert.equal(result.worktrees[0].summary.text.includes("Bearer"), false);
  assert.match(result.worktrees[0].summary.text, /\[REDACTED\]/u);
  assert.equal(result.worktrees[0].summary.text.includes("\u001b"), false);
  assert.match(result.worktrees[0].summary.text, /\\u001b/u);
  const markdown = renderCodingContextHarnessMarkdown(result);
  assert.match(markdown, /    <script>alert\(1\)<\/script>/u);
  assert.equal(markdown.includes("\n<script>"), false);
  assert.equal((await readEvents(root, { updateCheckpoint: false })).length, 1);
});

test("a rejected model summary cannot create a partial checkpoint", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({ title: "Bound the model output" }), { cwd: root });
  const before = await readEvents(root, { updateCheckpoint: false });
  await assert.rejects(
    () => runCodingContextHarness({
      cwd: root,
      record: true,
      maxSummaryChars: 256,
      summarizer: { id: "oversized", summarize: () => "x".repeat(257) },
      clock: CLOCK
    }),
    /no longer than 256/u
  );
  assert.deepEqual(await readEvents(root, { updateCheckpoint: false }), before);
});

test("model-assisted checkpoints reuse the versioned adapter result and abort before append", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({ title: "Preserve the exact release source" }), { cwd: root });
  let calls = 0;
  const summarizer = {
    id: "host-model-v1",
    summarize() {
      calls += 1;
      return { text: "Use the cited release source.", model: "fixture-v1" };
    }
  };
  await runCodingContextHarness({ cwd: root, record: true, summarizer, clock: CLOCK });
  await runCodingContextHarness({ cwd: root, record: true, summarizer, clock: CLOCK });
  assert.equal(calls, 1);

  await appendEvent(eventInput({ title: "A newer source event" }), { cwd: root });
  const before = await readEvents(root, { updateCheckpoint: false });
  const controller = new AbortController();
  await assert.rejects(
    () => runCodingContextHarness({
      cwd: root,
      record: true,
      signal: controller.signal,
      summarizer: {
        id: "host-model-v2",
        summarize() {
          controller.abort();
          return "This summary must never be appended.";
        }
      },
      clock: CLOCK
    }),
    (error) => error?.name === "AbortError"
  );
  assert.deepEqual(await readEvents(root, { updateCheckpoint: false }), before);
});

test("metadata-only workspaces retain a measured checkpoint receipt without summary content", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "metadata" });
  await appendEvent(eventInput({ title: "Sensitive implementation result", body: "private content" }), { cwd: root });
  const result = await runCodingContextHarness({ cwd: root, record: true, clock: CLOCK });
  assert.equal(result.worktrees[0].recording.status, "created");
  const events = await readEvents(root, { updateCheckpoint: false });
  const checkpoint = events.at(-1);
  assert.equal(checkpoint.provenance.adapter, "qarinah.coding-harness");
  assert.equal(checkpoint.body, "");
  assert.equal(checkpoint.data.codingHarness.schemaVersion, "qarinah.coding-context-harness.v1");
  assert.equal(checkpoint.data.codingHarness.baselineTokens, result.worktrees[0].comparison.baselineTokens);
});

test("repository scope keeps sibling worktree packs separate and reports uninitialized worktrees", async (t) => {
  const temporary = await temporaryDirectory(t);
  const repository = path.join(temporary, "repository");
  const sibling = path.join(temporary, "feature-worktree");
  const uninitialized = path.join(temporary, "uninitialized-worktree");
  await mkdir(repository);
  await git(repository, "init", "--initial-branch=main");
  await git(repository, "config", "user.name", "Qarinah Test");
  await git(repository, "config", "user.email", "qarinah-test@example.invalid");
  await writeFile(path.join(repository, "README.md"), "# harness repository\n", "utf8");
  await git(repository, "add", "README.md");
  await git(repository, "commit", "-m", "initial");
  await git(repository, "worktree", "add", "-b", "feature/harness", sibling);
  await git(repository, "worktree", "add", "-b", "feature/uninitialized", uninitialized);
  await initializeWorkspace(repository, { capture: "content" });
  await initializeWorkspace(sibling, { capture: "content" });
  await appendEvent(eventInput({ title: "Primary-only release note" }), { cwd: repository });
  await appendEvent(eventInput({ title: "Sibling-only parser change" }), { cwd: sibling });

  const result = await runCodingContextHarness({ cwd: sibling, scope: "repository", query: "", clock: CLOCK });
  assert.equal(result.aggregate.discoveredWorktrees, 3);
  assert.equal(result.aggregate.readyWorktrees, 2);
  assert.equal(result.aggregate.uninitializedWorktrees, 1);
  assert.equal(result.aggregate.complete, false);
  const ready = result.worktrees.filter((entry) => entry.status === "ready");
  const repositoryRoot = await realpath(repository);
  const siblingRoot = await realpath(sibling);
  assert.equal(new Set(ready.map((entry) => entry.workspaceId)).size, 2);
  assert.equal(ready.find((entry) => entry.current).root, siblingRoot);
  const primaryPack = ready.find((entry) => entry.root === repositoryRoot).pack;
  const siblingPack = ready.find((entry) => entry.root === siblingRoot).pack;
  assert.equal(primaryPack.items.some((item) => item.title === "Sibling-only parser change"), false);
  assert.equal(siblingPack.items.some((item) => item.title === "Primary-only release note"), false);
  await assert.rejects(
    () => runCodingContextHarness({ cwd: sibling, scope: "repository", record: true }),
    /record cannot be combined with repository scope/u
  );
});

test("setup can opt into ordered automatic Stop compaction for Codex and Claude", async (t) => {
  const root = await temporaryDirectory(t);
  const result = await setupWorkspace({
    cwd: root,
    capture: "content",
    codex: true,
    claude: true,
    autoCompact: true
  });
  assert.equal(result.autoCompact, true);
  for (const [relative, adapter] of [[path.join(".codex", "hooks.json"), "codex"], [path.join(".claude", "settings.json"), "claude"]]) {
    const settings = JSON.parse(await readFile(path.join(root, relative), "utf8"));
    const hooks = settings.hooks.Stop.flatMap((entry) => entry.hooks ?? []);
    const commands = hooks.map((hook) => hook.command);
    assert.ok(commands.findIndex((command) => command.includes(`hook ${adapter}`)) >= 0);
    const harnessIndex = commands.findIndex((command) => command.includes("harness --record --no-rebuild --quiet"));
    assert.ok(harnessIndex > commands.findIndex((command) => command.includes(`hook ${adapter}`)));
  }
  await setupWorkspace({ cwd: root, codex: true, claude: true, autoCompact: true });
  const codex = JSON.parse(await readFile(path.join(root, ".codex", "hooks.json"), "utf8"));
  assert.equal(JSON.stringify(codex.hooks.Stop).match(/harness --record/gu).length, 1);
});

test("CLI harness records a lightweight checkpoint and quiet replay emits no protocol noise", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({ title: "CLI release evidence", body: "The exact checks passed." }), { cwd: root });
  const first = await execFileAsync(process.execPath, [
    BIN_PATH,
    "harness",
    "release evidence",
    "--record",
    "--no-rebuild",
    "--format",
    "json"
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  const result = JSON.parse(first.stdout);
  assert.equal(result.worktrees[0].recording.status, "created");
  assert.equal(result.benchmark.reductionPercent, 98.71);
  const replay = await execFileAsync(process.execPath, [
    BIN_PATH,
    "harness",
    "release evidence",
    "--record",
    "--no-rebuild",
    "--quiet"
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(replay.stdout, "");
  assert.equal(replay.stderr, "");
});

test("coding harness schema pins the public benchmark and strict nested contracts", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/coding-context-harness.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.coding-context-harness.v1");
  assert.equal(schema.properties.benchmark.properties.baselineTokens.const, 442113);
  assert.equal(schema.properties.benchmark.properties.deliveredTokens.const, 5682);
  assert.equal(schema.properties.benchmark.properties.exactReductionPercent.const, 98.7148);
  assert.equal(schema.properties.benchmark.properties.guarantee.const, false);
  assert.equal(schema.$defs.readyWorktree.additionalProperties, false);
  assert.equal(schema.$defs.readyWorktree.properties.pack.$ref, "context-pack.schema.json");
  assert.equal(schema.$defs.uninitializedWorktree.additionalProperties, false);
  assert.equal(schema.$defs.recording.additionalProperties, false);
  assert.equal(schema.$defs.incremental.additionalProperties, false);
});
