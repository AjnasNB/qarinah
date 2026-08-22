import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  buildDeveloperMemoryView,
  buildMemoryDashboard,
  buildSessionContextReceipts,
  initializeWorkspace,
  renderMemoryDashboard
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

const FIXED_CLOCK = () => new Date("2099-08-19T08:00:00.000Z");

test("parallel idempotent initialization converges on one trusted workspace", async (t) => {
  const root = await temporaryDirectory(t);
  const workspaces = await Promise.all(Array.from({ length: 12 }, () => initializeWorkspace(root, {
    capture: "content",
    ifNeeded: true
  })));
  assert.equal(new Set(workspaces.map((workspace) => workspace.config.workspaceId)).size, 1);
  assert.equal(workspaces.every((workspace) => workspace.config.capture === "content"), true);
  assert.equal(JSON.parse(await readFile(path.join(root, ".qarinah", "config.json"), "utf8")).workspaceId, workspaces[0].config.workspaceId);
  assert.equal(await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8"), "");
});

test("session receipts bind exact session evidence without retaining event bodies", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    kind: "session.started",
    sessionId: "session-alpha",
    turnId: "turn-1",
    title: "Choose the migration boundary",
    body: "PRIVATE_SESSION_BODY_ALPHA",
    data: { reason: "Keep the database change reversible." }
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "tool.completed",
    sessionId: "session-alpha",
    turnId: "turn-1",
    title: "Migration test completed",
    body: "PRIVATE_TOOL_RESULT_ALPHA",
    data: { toolName: "npm-test" }
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "turn.completed",
    sessionId: "session-alpha",
    turnId: "turn-1",
    title: "Migration turn completed",
    body: "PRIVATE_TURN_OUTCOME_ALPHA"
  }), { cwd: root });
  await appendEvent(eventInput({
    sessionId: "session-beta",
    turnId: "turn-2",
    title: "Keep the prior API stable",
    body: "PRIVATE_SESSION_BODY_BETA"
  }), { cwd: root });

  const result = await buildSessionContextReceipts({ cwd: root, write: true, clock: FIXED_CLOCK });
  assert.equal(result.schemaVersion, "qarinah.session-context-receipt-index.v2");
  assert.equal(result.receiptCount, 2);
  const alpha = result.receipts.find((receipt) => receipt.sessionId === "session-alpha");
  assert.equal(alpha.source.eventCount, 3);
  assert.equal(alpha.source.toolOutcomes, 1);
  assert.match(alpha.source.eventManifestHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(alpha.lifecycle.observedState, "turn-completed");
  assert.equal(alpha.lifecycle.sessionStartEvents, 1);
  assert.equal(alpha.lifecycle.completedTurns, 1);
  assert.deepEqual(alpha.lifecycle.turnIds, ["turn-1"]);
  assert.equal(alpha.outcomes.eventCount, 2);
  assert.match(alpha.outcomes.manifestHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(alpha.delivered.eventIds.length > 0, true);
  assert.match(alpha.receiptHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(alpha.comparison.reductionPercent >= 0, true);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /PRIVATE_SESSION_BODY_ALPHA|PRIVATE_TOOL_RESULT_ALPHA|PRIVATE_TURN_OUTCOME_ALPHA|PRIVATE_SESSION_BODY_BETA/u);
  const stored = await readFile(path.join(root, ".qarinah", "receipts", "sessions", `${alpha.sessionKey}.json`), "utf8");
  assert.doesNotMatch(stored, /PRIVATE_SESSION_BODY_ALPHA|PRIVATE_TOOL_RESULT_ALPHA|PRIVATE_TURN_OUTCOME_ALPHA/u);
});

test("developer view joins graph, timeline, decisions, tools, receipts, and worktree comparison", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    sessionId: "session-panel",
    turnId: "turn-panel",
    title: "Expose visible developer memory",
    body: "Show cited graph and timeline views."
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "tool.completed",
    sessionId: "session-panel",
    turnId: "turn-panel",
    title: "Panel smoke passed",
    body: "Responsive panel rendered.",
    data: { toolName: "browser-smoke" }
  }), { cwd: root });

  const view = await buildDeveloperMemoryView({ cwd: root, includeWorktrees: false, clock: FIXED_CLOCK });
  assert.equal(view.schemaVersion, "qarinah.developer-memory-view.v1");
  assert.equal(view.boundaries.readOnly, true);
  assert.equal(view.worktreeComparison.worktreeCount, 1);
  assert.equal(view.sessions.receiptCount, 1);
  assert.equal(view.symbols.available, false);
  assert.match(view.symbols.reason, /qarinah scan/u);
  assert.equal(view.timeline.some((entry) => entry.category === "decision"), true);
  assert.equal(view.timeline.some((entry) => entry.category === "tool"), true);
  assert.match(view.manifestHash, /^sha256:[0-9a-f]{64}$/u);

  const dashboard = await buildMemoryDashboard({ cwd: root, clock: FIXED_CLOCK });
  const html = renderMemoryDashboard(dashboard);
  assert.match(html, /Exact per-session context receipts/u);
  assert.match(html, /session-panel/u);
  assert.match(html, /Interactive circular project-memory graph/u);
  assert.match(html, /Real local ledger data/u);
});

test("session receipt schema is closed and exposes only bounded measurement fields", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/session-context-receipt.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.session-context-receipt.v2");
  assert.equal(schema.properties.lifecycle.additionalProperties, false);
  assert.equal(schema.properties.outcomes.additionalProperties, false);
  assert.equal(schema.properties.comparison.properties.reductionPercent.minimum, 0);
  assert.equal(schema.properties.boundaries.additionalProperties.maxLength, 512);
});
