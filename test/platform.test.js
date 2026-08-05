import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
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

test("one-command setup configures Codex, Claude, Cursor, hooks, skills, and consent-gated MCP", async (t) => {
  const root = await temporaryDirectory(t);
  const result = await setupWorkspace({
    cwd: root,
    capture: "content",
    codex: true,
    claude: true,
    cursor: true,
    allowQuery: true
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets, ["codex", "claude", "cursor"]);
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

  const repeated = await setupWorkspace({ cwd: root, codex: true, claude: true, cursor: true, allowQuery: true });
  assert.equal(repeated.ok, true);
  assert.equal((await readFile(path.join(root, ".codex", "config.toml"), "utf8")).match(/qarinah:managed:start/g).length, 1);
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
    provenance: { adapter: "test", sourceId: "adr-2" },
    relations: [{ type: "supersedes", target: oldDecision.eventId }]
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
  assert.equal(dashboard.totals.currentDecisions, 1);
  assert.equal(dashboard.totals.supersededDecisions, 1);
  assert.equal(dashboard.totals.conflicts, 1);
  assert.equal(dashboard.contextSavings.savingsPercent, 90);
  const written = await writeMemoryDashboard({ cwd: root, baselineTokens: 1000, deliveredTokens: 100 });
  assert.match(await readFile(written.output, "utf8"), /Shared memory your team can inspect/);
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
