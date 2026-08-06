import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "bench", "final", "pilot-authorization-v1.json");
const [protocol, development, readiness, finalManifest] = await Promise.all([
  readJson("bench/final/protocol-v1.json"),
  readJson("bench/research/swe-bench-lite-development-v0.2.json"),
  readJson("bench/final/execution-readiness-v1.json"),
  readJson("bench/final/final-task-manifest-v1.json")
]);
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const pilotIds = [
  "astropy__astropy-7746",
  "django__django-12113",
  "matplotlib__matplotlib-23476",
  "mwaskom__seaborn-3010"
];
const developmentById = new Map(development.tasks.map((task) => [task.instanceId, task]));
const finalIds = new Set([
  ...finalManifest.tasks,
  ...finalManifest.exclusions.tasks.filter((task) => task.reason === "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY")
].map((task) => task.instanceId));
const tasks = pilotIds.map((instanceId) => {
  const task = developmentById.get(instanceId);
  assert.ok(task, `Pilot task ${instanceId} is not in the development corpus.`);
  return { instanceId, repository: task.repository, sourcePopulation: "SWE-bench Lite development-v0.2" };
});

const content = {
  schemaVersion: "qarinah.provider-pilot-authorization.v1",
  status: "prepared-not-authorized",
  reasonNotAuthorized: [
    "Two independent blinded relevance label sets are still pending.",
    "The requested provider model identifiers must be resolved in the actual Codex and Claude runtimes immediately before execution.",
    "No provider-backed pilot run or spend was performed while creating this file."
  ],
  protocolCommit: "3e05fa30f3007fd67a6b5aba2613f14dcb896fd7",
  protocolSha256: protocol.protocolSha256,
  finalManifestCommit: "b20bb87e6d0ab39aed7df00605d38d24deb9da36",
  systemCommit: "bf4eb0f",
  models: {
    codex: {
      requestedId: "gpt-5.3-codex",
      identifierStatus: "user-specified-unverified-in-provider-runtime",
      reasoningEffort: "high",
      cliVersion: readiness.environment.codexCli
    },
    claude: {
      requestedId: "claude-sonnet-5",
      identifierStatus: "user-specified-unverified-in-provider-runtime",
      effort: "high",
      cliVersion: readiness.environment.claudeCode
    }
  },
  conditions: ["no_handoff", "git_handoff", "summary_handoff", "qarinah_handoff"],
  pilotTasks: tasks,
  budgetUsd: {
    pilotHardCap: 100,
    perRunEmergencyStop: 5,
    finalPrimaryCapProposal: 600,
    contingencyReserveProposal: 150
  },
  requirements: {
    freshAgentBSession: true,
    identicalRepositorySnapshot: true,
    randomizedConditionOrder: true,
    providerUsageCapture: true,
    nativeSessionResumeDisabled: true,
    summaryAndQarinahMaximumTokenBudgetEqual: true,
    independentReviewerLabelsCompleteBeforePilot: true
  },
  pilotExecutionAuthorized: false,
  finalEvaluationAuthorized: false,
  resultsObserved: false,
  preparedAt: "2026-08-05"
};
const artifact = { ...content, contentDigest: sha256(JSON.stringify(content)) };

assert.equal(tasks.length, 4);
assert.ok(tasks.every((task) => !finalIds.has(task.instanceId)), "Pilot tasks must not enter the final population.");

if (process.argv.includes("--write")) {
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${artifact.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(artifact, committed, "Pilot authorization guardrail drifted.");
  process.stdout.write(`Verified prepared pilot guardrail (${artifact.contentDigest}).\n`);
}
