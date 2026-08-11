import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  buildProjectRecordViews,
  initializeWorkspace,
  readEvents,
  rebuildDerivedState,
  scanProjectStructure
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

test("derived project records explain decisions, tools, execution flow, and changes", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "app.js"), "export const ready = true;\n", "utf8");
  await appendEvent(eventInput({
    kind: "prompt.submitted",
    actor: { type: "human", id: "operator" },
    sessionId: "session-1",
    turnId: "turn-1",
    title: "Make setup project-local",
    body: "Do not attach a child project to a parent ledger."
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "tool.requested",
    actor: { type: "agent", id: "codex" },
    sessionId: "session-1",
    turnId: "turn-1",
    title: "Run project tests",
    body: "",
    data: { toolName: "shell", commandClass: "test" }
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "tool.completed",
    actor: { type: "tool", id: "shell" },
    sessionId: "session-1",
    turnId: "turn-1",
    title: "Project tests completed",
    body: "All platform tests passed.",
    data: { toolName: "shell", status: "passed" }
  }), { cwd: root });
  const decision = await appendEvent(eventInput({
    sessionId: "session-1",
    turnId: "turn-1",
    title: "Initialize the exact requested project",
    body: "A child folder must own a distinct ledger.",
    data: {
      reason: "Attaching to a parent mixes independent project memory.",
      outcome: "Every requested folder receives its own SQLite database and graph.",
      alternatives: ["Reuse the nearest parent ledger"]
    },
    relations: [{ type: "affects", target: "file:src/setup.js" }]
  }), { cwd: root });
  await scanProjectStructure({ cwd: root });
  await rebuildDerivedState(root);

  const events = await readEvents(root);
  const view = buildProjectRecordViews(events, events[0].workspaceId);
  const selected = view.decisions.find((entry) => entry.eventId === decision.eventId);
  assert.equal(selected.reason, "Attaching to a parent mixes independent project memory.");
  assert.equal(selected.outcome, "Every requested folder receives its own SQLite database and graph.");
  assert.deepEqual(selected.tools.map((tool) => tool.name), ["shell", "shell"]);
  assert.ok(view.flow.some((step) => step.kind === "tool.completed" && step.toolName === "shell"));
  assert.ok(view.projectChanges.added.includes("src/app.js"));

  const decisions = await readFile(path.join(root, ".qarinah", "records", "DECISIONS.md"), "utf8");
  const flow = await readFile(path.join(root, ".qarinah", "records", "FLOW.md"), "utf8");
  const changes = await readFile(path.join(root, ".qarinah", "records", "CHANGES.md"), "utf8");
  assert.match(decisions, /Attaching to a parent mixes independent project memory/);
  assert.match(decisions, /Tools used in this execution/);
  assert.match(flow, /Project tests completed/);
  assert.match(changes, /Added `src\/app\.js`/);
  assert.match(decisions, new RegExp(decision.eventId));
  assert.match(decisions, new RegExp(decision.hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("empty workspaces initialize all readable project record views", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  for (const name of ["DECISIONS.md", "FLOW.md", "CHANGES.md"]) {
    const contents = await readFile(path.join(root, ".qarinah", "records", name), "utf8");
    assert.match(contents, /Workspace:/);
  }
});
