import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  buildDeveloperMemoryView,
  buildSessionContextReceipts,
  initializeWorkspace,
  runCodingContextHarness
} from "../src/index.js";
import { sha256 } from "../src/canonical.js";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "bench", "results", "worktree-continuity-v0.4.0.json");
const CLOCK = () => new Date("2026-08-19T12:00:00.000Z");
const WRITE = process.argv.includes("--write");

async function git(cwd, ...args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

function event(index, overrides = {}) {
  const suffix = String(index).padStart(12, "0");
  return {
    eventId: `evt_00000000-0000-4000-8000-${suffix}`,
    timestamp: `2026-08-19T10:${String(index).padStart(2, "0")}:00.000Z`,
    kind: "decision",
    actor: { type: "human", id: "continuity-evaluator" },
    sessionId: `session-${index}`,
    turnId: `turn-${index}`,
    title: `Continuity event ${index}`,
    body: "Bounded fixture evidence for one real Git worktree execution.",
    data: {},
    confidence: "extracted",
    relations: [],
    provenance: { adapter: "worktree-continuity-v1", sourceId: `fixture-${index}` },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function scenario(id, passed, observation) {
  return Object.freeze({ id, passed: Boolean(passed), observation });
}

async function evaluate() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qarinah-worktree-eval-"));
  const repository = path.join(temporary, "repository");
  const feature = path.join(temporary, "feature-worktree");
  const uninitialized = path.join(temporary, "uninitialized-worktree");
  try {
    await mkdir(repository);
    await git(repository, "init", "--initial-branch=main");
    await git(repository, "config", "user.name", "Qarinah Evaluation");
    await git(repository, "config", "user.email", "evaluation@qarinah.invalid");
    await writeFile(path.join(repository, "README.md"), "# Worktree continuity fixture\n", "utf8");
    await git(repository, "add", "README.md");
    await git(repository, "commit", "-m", "initial fixture");
    await git(repository, "worktree", "add", "-b", "feature/visible-memory", feature);
    await git(repository, "worktree", "add", "-b", "feature/uninitialized", uninitialized);
    const mainWorkspace = await initializeWorkspace(repository, { capture: "content" });
    const featureWorkspace = await initializeWorkspace(feature, { capture: "content" });

    const mainDecision = await appendEvent(event(1, {
      sessionId: "session-main",
      title: "Keep the stable API backward compatible",
      body: "Main requires the existing package exports to remain available."
    }), { cwd: repository });
    const featureDecision = await appendEvent(event(2, {
      sessionId: "session-feature",
      title: "Add the visible developer memory panel",
      body: "The feature branch adds graph, timeline, receipts, and worktree comparison."
    }), { cwd: feature });
    await appendEvent(event(3, {
      kind: "tool.completed",
      sessionId: "session-feature",
      title: "Editor panel smoke completed",
      body: "The local panel rendered without external network access.",
      data: { toolName: "editor-panel-smoke", outcome: "passed" }
    }), { cwd: feature });
    await appendEvent(event(4, {
      kind: "claim",
      sessionId: "session-feature",
      title: "Panel release is blocked",
      body: "A conflicting fixture claim exercises the visible conflict path.",
      relations: [{ type: "contradicts", target: featureDecision.eventId }]
    }), { cwd: feature });

    const repositoryView = await runCodingContextHarness({
      cwd: feature,
      scope: "repository",
      query: "",
      clock: CLOCK
    });
    const ready = repositoryView.worktrees.filter((entry) => entry.status === "ready");
    const mainPack = ready.find((entry) => entry.root === mainWorkspace.root)?.pack;
    const featurePack = ready.find((entry) => entry.root === featureWorkspace.root)?.pack;
    const receiptIndex = await buildSessionContextReceipts({
      cwd: feature,
      sessionId: "session-feature",
      query: "visible developer memory",
      write: true,
      clock: CLOCK
    });
    const receiptPath = path.join(feature, ".qarinah", "receipts", "sessions", `${receiptIndex.receipts[0].sessionKey}.json`);
    const receiptBytes = await readFile(receiptPath, "utf8");
    const initial = await runCodingContextHarness({ cwd: feature, query: "visible developer memory", record: true, clock: CLOCK });
    const unchanged = await runCodingContextHarness({ cwd: feature, query: "visible developer memory", record: true, clock: CLOCK });
    await appendEvent(event(5, {
      kind: "turn.completed",
      sessionId: "session-feature",
      title: "Document the panel handoff",
      body: "The next session can resume from cited worktree-local evidence."
    }), { cwd: feature });
    const delta = await runCodingContextHarness({ cwd: feature, query: "visible developer memory", record: true, clock: CLOCK });
    const developerView = await buildDeveloperMemoryView({ cwd: feature, query: "visible developer memory", clock: CLOCK });

    const featureReceipt = receiptIndex.receipts[0];
    const scenarios = [
      scenario("repository-discovers-three-real-worktrees", repositoryView.aggregate.discoveredWorktrees === 3, `${repositoryView.aggregate.discoveredWorktrees} discovered`),
      scenario("initialized-worktrees-are-explicit", repositoryView.aggregate.readyWorktrees === 2, `${repositoryView.aggregate.readyWorktrees} ready`),
      scenario("uninitialized-worktree-is-not-silently-skipped", repositoryView.aggregate.uninitializedWorktrees === 1 && repositoryView.aggregate.complete === false, "one explicit uninitialized worktree"),
      scenario("main-pack-retrieves-main-decision", mainPack?.items.some((item) => item.eventId === mainDecision.eventId), "main decision cited"),
      scenario("feature-pack-retrieves-feature-decision", featurePack?.items.some((item) => item.eventId === featureDecision.eventId), "feature decision cited"),
      scenario("main-pack-excludes-feature-memory", !mainPack?.items.some((item) => item.eventId === featureDecision.eventId), "feature evidence absent from main"),
      scenario("feature-pack-excludes-main-memory", !featurePack?.items.some((item) => item.eventId === mainDecision.eventId), "main evidence absent from feature"),
      scenario("workspace-identities-remain-distinct", mainWorkspace.config.workspaceId !== featureWorkspace.config.workspaceId, "two workspace identities"),
      scenario("current-worktree-is-identified", ready.filter((entry) => entry.current).length === 1 && ready.find((entry) => entry.current)?.root === featureWorkspace.root, "feature worktree current"),
      scenario("session-receipt-is-created", receiptIndex.receiptCount === 1 && /^sha256:/u.test(featureReceipt.receiptHash), "one hash-bound receipt"),
      scenario("session-receipt-binds-source-hashes", featureReceipt.delivered.eventIds.length > 0 && featureReceipt.delivered.manifestHash.startsWith("sha256:"), `${featureReceipt.delivered.eventIds.length} cited events`),
      scenario("session-receipt-excludes-event-bodies", !receiptBytes.includes("The feature branch adds") && !receiptBytes.includes("local panel rendered"), "no retained event bodies"),
      scenario("initial-compaction-is-recorded", initial.worktrees[0].incremental.mode === "initial" && initial.worktrees[0].recording.status === "created", "initial checkpoint created"),
      scenario("unchanged-compaction-is-idempotent", unchanged.worktrees[0].incremental.mode === "unchanged" && unchanged.worktrees[0].recording.status === "reused", "checkpoint reused"),
      scenario("delta-compaction-captures-one-change", delta.worktrees[0].incremental.mode === "delta" && delta.worktrees[0].incremental.changedEventCount === 1, `${delta.worktrees[0].incremental.changedEventCount} changed event`),
      scenario("developer-view-exposes-decision-tool-conflict", developerView.timeline.some((item) => item.category === "decision") && developerView.timeline.some((item) => item.category === "tool") && developerView.conflicts.length === 1, "decision, tool, and conflict visible")
    ];
    assert.equal(scenarios.every((entry) => entry.passed), true);
    const base = {
      schemaVersion: "qarinah.worktree-continuity-evaluation.v1",
      protocol: {
        id: "real-git-worktree-continuity-v1",
        generatedAt: CLOCK().toISOString(),
        environment: "temporary local Git repository with three actual git worktree checkouts",
        scope: "Product acceptance evidence for Qarinah worktree isolation, handoff receipts, and incremental compaction. It is not an external comparative benchmark."
      },
      aggregate: {
        scenarioCount: scenarios.length,
        passed: scenarios.filter((entry) => entry.passed).length,
        failed: scenarios.filter((entry) => !entry.passed).length,
        passRate: scenarios.filter((entry) => entry.passed).length / scenarios.length,
        discoveredWorktrees: repositoryView.aggregate.discoveredWorktrees,
        initializedWorktrees: repositoryView.aggregate.readyWorktrees,
        sessionReceipts: receiptIndex.receiptCount
      },
      scenarios
    };
    return Object.freeze({ ...base, artifactHash: sha256(base) });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const result = await evaluate();
if (WRITE) {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
} else {
  const stored = JSON.parse(await readFile(OUTPUT, "utf8"));
  assert.deepEqual(result, stored, "The checked-in worktree-continuity result does not match a fresh execution.");
}
process.stdout.write(`${JSON.stringify({ ok: true, result: path.relative(ROOT, OUTPUT), aggregate: result.aggregate, artifactHash: result.artifactHash }, null, 2)}\n`);
