import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  compileContext,
  initializeWorkspace
} from "../src/index.js";
import {
  softwareTaskScenarios,
  unrelatedRecordCount
} from "../bench/fixtures/software-task-scenarios.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-software-task-eval-"));
process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");
let inputSequence = 0;

function input(overrides = {}) {
  const timestamp = new Date(Date.UTC(2026, 4, 1, 0, inputSequence++)).toISOString();
  return {
    kind: "decision",
    actor: { type: "human", id: "software-task-eval-owner" },
    title: "Software task evaluation record",
    body: "A deterministic retained project-history record.",
    data: {},
    confidence: "verified",
    relations: [],
    provenance: { adapter: "qarinah-software-task-eval", sourceId: null },
    retention: { class: "project", expiresAt: null },
    timestamp,
    ...overrides
  };
}

function sourceText(scenario) {
  return scenario.currentSources
    .map((source) => `FILE ${source.path}\n${source.content}`)
    .join("\n\n");
}

function estimatedTokens(characters) {
  return Math.ceil(characters / 4);
}

function reduction(smaller, baseline) {
  return Math.round((1 - smaller / baseline) * 1_000_000) / 1_000_000;
}

function noiseBody(index) {
  const component = `component-${String(index % 17).padStart(2, "0")}`;
  const operation = `operation-${String(index).padStart(3, "0")}`;
  return [
    `${component} completed ${operation} in an unrelated project area.`,
    "The retained outcome includes its bounded tool result, review state, affected module, test observation, and follow-up status.",
    "This record represents ordinary accumulated agent history that a full-history replay would resend even though it is irrelevant to the current task.",
    "It contains no credentials, hidden reasoning, private transcript, or authority over another component."
  ].join(" ");
}

try {
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const targets = new Map();

  for (const scenario of softwareTaskScenarios) {
    const target = await appendEvent(input({
      title: scenario.target.title,
      body: scenario.target.body,
      data: { scenario: scenario.id, role: "target" }
    }), { workspace });
    targets.set(scenario.id, target.eventId);
    for (const [title, body] of scenario.support) {
      await appendEvent(input({
        title,
        body,
        data: { scenario: scenario.id, role: "support" },
        relations: [{ type: "references", target: target.eventId }]
      }), { workspace });
    }
  }

  for (let index = 0; index < unrelatedRecordCount; index += 1) {
    await appendEvent(input({
      title: `Unrelated accumulated history ${String(index).padStart(3, "0")}`,
      body: noiseBody(index),
      data: { component: `component-${index % 17}`, sequence: index }
    }), { workspace });
  }

  const logText = await readFile(path.join(workspace.qarinahDir, "events", "events.jsonl"), "utf8");
  const records = logText.trimEnd().split("\n").length;
  const scenarioResults = [];

  for (const scenario of softwareTaskScenarios) {
    const pack = await compileContext(scenario.query, {
      cwd: root,
      maxChars: 6_000,
      maxTokens: 1_500,
      reserveTokens: 200,
      limit: 8,
      minimumCoverage: "direct",
      inMemory: true,
      asOf: "2026-07-20T00:00:00.000Z"
    });
    const targetRank = pack.items.findIndex((item) => item.eventId === targets.get(scenario.id)) + 1;
    const currentSourceChars = sourceText(scenario).length;
    const fullHistoryChars = logText.length;
    const baselineChars = currentSourceChars + fullHistoryChars;
    const qarinahChars = currentSourceChars + pack.budget.usedChars;
    const baselineEstimatedTokens = estimatedTokens(baselineChars);
    const qarinahEstimatedTokens = estimatedTokens(qarinahChars);
    const summaryItems = pack.items.filter((item) => item.kind === "summary").length;
    scenarioResults.push({
      id: scenario.id,
      label: scenario.label,
      targetRank,
      coverage: pack.retrieval.coverage.status,
      summaryItems,
      currentSourceChars,
      fullHistoryChars,
      packChars: pack.budget.usedChars,
      baselineChars,
      qarinahChars,
      baselineEstimatedTokens,
      qarinahEstimatedTokens,
      estimatedTokenReduction: reduction(qarinahEstimatedTokens, baselineEstimatedTokens)
    });
  }

  const totalBaselineEstimatedTokens = scenarioResults.reduce((sum, item) => sum + item.baselineEstimatedTokens, 0);
  const totalQarinahEstimatedTokens = scenarioResults.reduce((sum, item) => sum + item.qarinahEstimatedTokens, 0);
  const result = {
    schemaVersion: "qarinah.software-task-context-eval.v1",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    records,
    cases: scenarioResults.length,
    allTargetsInTopFive: scenarioResults.every((item) => item.targetRank > 0 && item.targetRank <= 5),
    allCoverageDirect: scenarioResults.every((item) => item.coverage === "direct"),
    modelSummaryItems: scenarioResults.reduce((sum, item) => sum + item.summaryItems, 0),
    totalBaselineEstimatedTokens,
    totalQarinahEstimatedTokens,
    weightedEstimatedTokenReduction: reduction(totalQarinahEstimatedTokens, totalBaselineEstimatedTokens),
    minimumScenarioEstimatedTokenReduction: Math.min(...scenarioResults.map((item) => item.estimatedTokenReduction)),
    scenarios: scenarioResults
  };

  if (!process.argv.includes("--no-verify")) {
    const committed = JSON.parse(await readFile(
      path.join(repositoryRoot, "bench", "results", "software-task-context-0.1.0-alpha.3.json"),
      "utf8"
    ));
    assert.equal(committed.schemaVersion, "qarinah.software-task-context-eval-result.v1");
    assert.equal(committed.packageVersion, packageJson.version);
    assert.deepEqual(
      Object.fromEntries(Object.keys(committed.expected).map((key) => [key, result[key]])),
      committed.expected,
      "The software-task context evaluator no longer matches the committed evidence."
    );
  }

  assert.equal(result.records, 240);
  assert.equal(result.cases, 6);
  assert.equal(result.allTargetsInTopFive, true);
  assert.equal(result.allCoverageDirect, true);
  assert.equal(result.modelSummaryItems, 0);
  assert.ok(result.minimumScenarioEstimatedTokenReduction >= 0.9);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
