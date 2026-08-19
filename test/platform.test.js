import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  buildMemoryDashboard,
  compileFederatedContext,
  compileTaskMemoryPack,
  createCausalReceipt,
  createEncryptedSyncBundle,
  createSignedCheckpoint,
  createTeamManifest,
  decryptEncryptedSyncBundle,
  evaluateContextQuality,
  initializeWorkspace,
  inspectMemoryFreshness,
  rebuildDerivedState,
  renderMemoryDashboard,
  rerankContextPack,
  scanProjectStructure,
  setupWorkspace,
  verifySignedCheckpoint,
  writeMemoryDashboard
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

async function contentWorkspace(t) {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  return root;
}

test("one-command setup configures Codex, Claude, Cursor, Kimi, Antigravity, hooks, skills, and consent-gated MCP", async (t) => {
  const root = await temporaryDirectory(t);
  const result = await setupWorkspace({
    cwd: root,
    capture: "content",
    allowQuery: true
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets, ["codex", "claude", "cursor", "kimi", "antigravity"]);
  assert.equal(result.projectStructure.captured, true);
  const codexConfig = await readFile(path.join(root, ".codex", "config.toml"), "utf8");
  assert.match(codexConfig, /\[mcp_servers\.qarinah\]/);
  assert.match(codexConfig, /context\.query/);
  assert.match(codexConfig, /workspace-id/);
  assert.match(codexConfig, /policy-hash/);
  assert.match(codexConfig, /default_tools_approval_mode = "writes"/);
  const claudeMcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  assert.equal(claudeMcp.mcpServers.qarinah.type, "stdio");
  assert.ok(claudeMcp.mcpServers.qarinah.args.includes("--allow-query"));
  const cursorMcp = JSON.parse(await readFile(path.join(root, ".cursor", "mcp.json"), "utf8"));
  assert.ok(cursorMcp.mcpServers.qarinah.args.includes("--policy-hash"));
  assert.match(await readFile(path.join(root, ".codex", "skills", "qarinah", "SKILL.md"), "utf8"), /name: qarinah/);
  assert.match(await readFile(path.join(root, ".codex", "skills", "qarinah-context", "SKILL.md"), "utf8"), /Qarinah/);
  assert.match(await readFile(path.join(root, ".claude", "skills", "qarinah", "SKILL.md"), "utf8"), /\$ARGUMENTS/);
  assert.match(await readFile(path.join(root, ".claude", "settings.json"), "utf8"), /UserPromptSubmit/);
  assert.match(await readFile(path.join(root, ".cursor", "rules", "qarinah.mdc"), "utf8"), /bounded, cited memory pack/);
  const kimiMcp = JSON.parse(await readFile(path.join(root, ".kimi-code", "mcp.json"), "utf8"));
  assert.ok(kimiMcp.mcpServers.qarinah.args.includes("--workspace-id"));
  const classicKimiMcp = JSON.parse(await readFile(path.join(root, ".kimi", "qarinah-mcp.json"), "utf8"));
  assert.ok(classicKimiMcp.mcpServers.qarinah.args.includes("--allow-query"));
  assert.match(await readFile(path.join(root, ".kimi", "README-QARINAH.md"), "utf8"), /--mcp-config-file/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, ".agents", "plugins", "qarinah", "plugin.json"), "utf8")), { name: "qarinah" });
  const antigravityMcp = JSON.parse(await readFile(path.join(root, ".agents", "plugins", "qarinah", "mcp_config.json"), "utf8"));
  assert.ok(antigravityMcp.mcpServers.qarinah.args.includes("--policy-hash"));
  assert.match(await readFile(path.join(root, ".agents", "plugins", "qarinah", "rules", "qarinah.md"), "utf8"), /untrusted evidence/);
  assert.match(await readFile(path.join(root, ".qarinah", "records", "OVERVIEW.md"), "utf8"), /Qarinah project overview/);
  assert.match(await readFile(path.join(root, ".qarinah", "records", "DECISIONS.md"), "utf8"), /Project decisions/);
  assert.match(await readFile(path.join(root, ".qarinah", "records", "FLOW.md"), "utf8"), /Project execution flow/);
  assert.match(await readFile(path.join(root, ".qarinah", "records", "CHANGES.md"), "utf8"), /Major project changes/);
  assert.match(await readFile(path.join(root, ".qarinah", "dashboard", "index.html"), "utf8"), /Shared memory your team can inspect/);

  const repeated = await setupWorkspace({ cwd: root, codex: true, claude: true, cursor: true, allowQuery: true });
  assert.equal(repeated.ok, true);
  assert.equal((await readFile(path.join(root, ".codex", "config.toml"), "utf8")).match(/qarinah:managed:start/g).length, 1);
});

test("setup initializes the exact requested project instead of attaching an initialized parent", async (t) => {
  const parent = await temporaryDirectory(t);
  const parentWorkspace = await initializeWorkspace(parent, { capture: "content" });
  const child = path.join(parent, "child-project");
  await mkdir(child);
  await writeFile(path.join(child, "README.md"), "# Child project\n", "utf8");

  const result = await setupWorkspace({ cwd: child, codex: true, capture: "content" });
  const canonicalChild = await realpath(child);

  assert.equal(result.root, canonicalChild);
  assert.notEqual(result.workspaceId, parentWorkspace.config.workspaceId);
  assert.equal(result.projectStructure.captured, true);
  assert.equal(
    (await readFile(path.join(child, ".codex", "config.toml"), "utf8")).includes(canonicalChild.replaceAll("\\", "\\\\")),
    true
  );
  assert.equal((await readFile(path.join(child, ".qarinah", "config.json"), "utf8")).includes(result.workspaceId), true);
});

test("freshness detects changed and missing cited project files", async (t) => {
  const root = await contentWorkspace(t);
  await writeFile(path.join(root, "app.js"), "export const answer = 42;\n", "utf8");
  await writeFile(path.join(root, "gone.js"), "export const gone = true;\n", "utf8");
  await scanProjectStructure({ cwd: root });
  await writeFile(path.join(root, "app.js"), "export const answer = 43;\n", "utf8");
  await import("node:fs/promises").then(({ rm }) => rm(path.join(root, "gone.js")));
  const report = await inspectMemoryFreshness({ cwd: root });
  assert.equal(report.status, "stale");
  assert.equal(report.files.find((file) => file.path === "app.js").status, "changed");
  assert.equal(report.files.find((file) => file.path === "gone.js").status, "missing");
});

test("task packs, semantic reranking, and federated packs preserve explicit authority boundaries", async (t) => {
  const first = await contentWorkspace(t);
  const second = await contentWorkspace(t);
  await appendEvent(eventInput({ title: "Rollback failed migration", body: "Use migration 18 rollback.", provenance: { adapter: "test", sourceId: "db-runbook" } }), { cwd: first });
  await appendEvent(eventInput({ title: "Frontend release boundary", body: "Run visual checks before release.", provenance: { adapter: "test", sourceId: "web-runbook" } }), { cwd: second });
  await rebuildDerivedState(first);
  await rebuildDerivedState(second);
  const task = await compileTaskMemoryPack("database-migration", "rollback", { cwd: first });
  assert.equal(task.task, "database-migration");
  assert.ok(task.pack.items.length > 0);
  const reranked = await rerankContextPack(task.pack, {
    adapter: {
      id: "fixture",
      score: ({ candidates }) => Object.fromEntries(candidates.map((candidate, index) => [candidate.eventId, index === 0 ? 1 : 0]))
    }
  });
  assert.equal(reranked.semanticRerank.authority, "rerank-only");
  const federated = await compileFederatedContext("release rollback", {
    workspaces: [
      { cwd: first, authority: "database" },
      { cwd: second, authority: "frontend" }
    ]
  });
  assert.equal(federated.authorityBoundary, "separate-packs");
  assert.deepEqual(federated.workspaces.map(({ authority }) => authority), ["database", "frontend"]);
  assert.notEqual(federated.workspaces[0].workspaceId, federated.workspaces[1].workspaceId);
});

test("team sync encrypts events, enforces roles, and signs checkpoints", async (t) => {
  const root = await contentWorkspace(t);
  await appendEvent(eventInput(), { cwd: root });
  const workspaceConfig = JSON.parse(await readFile(path.join(root, ".qarinah", "config.json"), "utf8"));
  const manifestInput = {
    workspaceId: workspaceConfig.workspaceId,
    teamId: "platform",
    members: [
      { id: "ajnas", role: "owner" },
      { id: "reviewer", role: "reader" }
    ],
    github: { organization: "AjnasNB", repository: "qarinah" }
  };
  const manifest = createTeamManifest(manifestInput);
  assert.equal(manifest.github.organization, "AjnasNB");
  const key = randomBytes(32);
  const bundle = await createEncryptedSyncBundle({ cwd: root, manifest: manifestInput, memberId: "reviewer", key });
  assert.equal(bundle.algorithm, "AES-256-GCM");
  const decrypted = decryptEncryptedSyncBundle(bundle, { manifest: manifestInput, memberId: "reviewer", key });
  assert.equal(decrypted.events.length, 1);
  assert.throws(
    () => decryptEncryptedSyncBundle(bundle, { manifest: manifestInput, memberId: "outsider", key }),
    /not authorized/
  );
  const { privateKey } = generateKeyPairSync("ed25519");
  const checkpoint = await createSignedCheckpoint({ cwd: root, signer: "ajnas", privateKey });
  assert.equal(verifySignedCheckpoint(checkpoint), true);
  assert.equal(verifySignedCheckpoint({ ...checkpoint, eventCount: 99 }), false);
});

test("dashboard exposes decisions, conflicts, citations, activity, savings, and affected files", async (t) => {
  const root = await contentWorkspace(t);
  const oldDecision = await appendEvent(eventInput({ title: "Use REST", provenance: { adapter: "test", sourceId: "adr-1" } }), { cwd: root });
  await appendEvent(eventInput({
    title: "Use MCP",
    sessionId: "session-dashboard",
    turnId: "turn-dashboard",
    body: "Use a bounded protocol surface for agent retrieval.",
    data: {
      reason: "Agents need one interoperable, consent-gated retrieval boundary.",
      outcome: "Codex, Claude, and compatible hosts query the same project ledger.",
      alternatives: ["Maintain a custom transport for every agent"]
    },
    provenance: { adapter: "test", sourceId: "adr-2" },
    relations: [{ type: "supersedes", target: oldDecision.eventId }]
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "tool.requested",
    actor: { type: "agent", id: "codex" },
    sessionId: "session-dashboard",
    turnId: "turn-dashboard",
    title: "Inspect package scripts",
    body: "",
    data: { toolName: "shell" }
  }), { cwd: root });
  await appendEvent(eventInput({
    kind: "claim",
    title: "Conflicting rollout claim",
    provenance: { adapter: "test", sourceId: "incident-1" },
    relations: [{ type: "contradicts", target: oldDecision.eventId }]
  }), { cwd: root });
  await writeFile(path.join(root, "README.md"), "# demo\n", "utf8");
  await scanProjectStructure({ cwd: root });
  const dashboard = await buildMemoryDashboard({ cwd: root, baselineTokens: 1000, deliveredTokens: 100 });
  const canonicalRoot = await realpath(root);
  assert.equal(dashboard.totals.currentDecisions, 1);
  assert.equal(dashboard.totals.supersededDecisions, 1);
  assert.equal(dashboard.totals.conflicts, 1);
  assert.equal(dashboard.contextSavings.savingsPercent, 90);
  assert.equal(dashboard.schemaVersion, "qarinah.memory-dashboard.v2");
  assert.equal(dashboard.workspace.root, canonicalRoot);
  assert.equal(dashboard.workspace.name, path.basename(canonicalRoot));
  assert.equal(dashboard.workspace.eventCount, dashboard.totals.events);
  assert.equal(dashboard.workspace.ledgerPath, ".qarinah/events/events.jsonl");
  assert.match(dashboard.workspace.ledgerHeadHash, /^sha256:/u);
  assert.ok(dashboard.workspace.ledgerBytes > 0);
  assert.equal(dashboard.currentDecisions[0].reason, "Agents need one interoperable, consent-gated retrieval boundary.");
  assert.equal(dashboard.tools[0].toolName, "shell");
  assert.ok(dashboard.executionFlow.some((step) => step.kind === "tool.requested"));
  assert.ok(dashboard.majorChanges.some((change) => change.title === "Use MCP"));
  assert.equal(dashboard.durableRecords.decisions, ".qarinah/records/DECISIONS.md");
  assert.equal(dashboard.memoryFootprint.schemaVersion, "qarinah.memory-footprint.v1");
  assert.equal(dashboard.sessionReceipts.receiptCount, 1);
  assert.equal(dashboard.sessionReceipts.receipts[0].sessionId, "session-dashboard");
  assert.match(dashboard.memoryFootprint.deliveredPack.manifestHash, /^sha256:/u);
  const written = await writeMemoryDashboard({ cwd: root, baselineTokens: 1000, deliveredTokens: 100 });
  assert.match(await readFile(written.output, "utf8"), /Shared memory your team can inspect/);
  assert.match(await readFile(written.output, "utf8"), /Execution flow/);
  assert.match(await readFile(written.output, "utf8"), /Agents need one interoperable/);
  assert.match(await readFile(written.output, "utf8"), /Memory footprint/);
  assert.match(await readFile(written.output, "utf8"), /Exact per-session context receipts/);
  const rendered = renderMemoryDashboard({
    ...dashboard,
    affectedFiles: Array.from({ length: 11 }, (_, index) => ({
      path: `src/file-${index}.js`,
      language: "JavaScript",
      contentHash: `sha256:${String(index).padStart(64, "0")}`
    }))
  });
  assert.match(rendered, /data-page-set="affected-files" data-page-size="10"/u);
  assert.match(rendered, /data-pager="affected-files"/u);
  assert.match(rendered, /class="table-scroll" role="region"/u);
  assert.match(rendered, /aria-live="polite"/u);
  assert.doesNotMatch(rendered, /<script\s+src=/u);
});

test("dashboard upgrades an initialized pre-dashboard workspace without changing its ledger", async (t) => {
  const root = await contentWorkspace(t);
  const retained = await appendEvent(eventInput({ title: "Keep existing project memory" }), { cwd: root });
  await rm(path.join(root, ".qarinah", "dashboard"), { recursive: true, force: true });
  const data = await buildMemoryDashboard({ cwd: root });
  assert.equal(data.workspace.eventCount, 1);
  assert.equal(data.workspace.ledgerHeadHash, retained.hash);
  const written = await writeMemoryDashboard({ cwd: root });
  assert.match(await readFile(written.output, "utf8"), /Keep existing project memory/u);
});

test("causal receipts bind evidence, memory, policy, execution, and observation", () => {
  const hash = (character) => `sha256:${character.repeat(64)}`;
  const timestamp = "2026-07-29T00:00:00.000Z";
  const receipt = createCausalReceipt({
    evidence: { id: "source-1", hash: hash("1"), system: "Cockroach", timestamp },
    memory: { id: "pack-1", hash: hash("2"), system: "Qarinah", timestamp },
    policy: { id: "approval-1", hash: hash("3"), system: "Maqam", timestamp },
    execution: { id: "tool-1", hash: hash("4"), system: "ToolGateway", timestamp },
    observation: { id: "result-1", hash: hash("5"), system: "ReceiptStore", timestamp }
  });
  assert.equal(receipt.chain.length, 5);
  assert.equal(receipt.chain[1].previousStageHash, hash("1"));
  assert.match(receipt.receiptHash, /^sha256:[a-f0-9]{64}$/);
});

test("quality evaluation measures recall, citations, freshness, conflicts, task quality, latency, cost, and repeated mistakes", () => {
  const result = evaluateContextQuality([{
    id: "release-review",
    requiredDecisionIds: ["d1", "d2"],
    recalledDecisionIds: ["d1", "d2"],
    returnedCitationIds: ["c1", "c2"],
    validCitationIds: ["c1", "c2"],
    expectedStaleIds: ["s1"],
    rejectedStaleIds: ["s1"],
    expectedConflictIds: ["x1"],
    detectedConflictIds: ["x1"],
    taskCompleted: true,
    repeatedMistakeExpected: true,
    repeatedMistakeAvoided: true,
    latencyMs: 18,
    baselineCost: 1,
    actualCost: 0.1
  }]);
  assert.equal(result.metrics.decisionRecall, 1);
  assert.equal(result.metrics.citationAccuracy, 1);
  assert.equal(result.metrics.staleContextRejection, 1);
  assert.equal(result.metrics.conflictDetection, 1);
  assert.equal(result.metrics.taskCompletionQuality, 1);
  assert.equal(result.metrics.repeatedMistakePrevention, 1);
  assert.equal(result.metrics.meanLatencyMs, 18);
  assert.equal(result.metrics.costReduction, 0.9);
});
