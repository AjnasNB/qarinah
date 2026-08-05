import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(await readFile(path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json"), "utf8"));
const result = JSON.parse(await readFile(path.join(root, "bench", "results", "research-retrieval-development-v0.2.json"), "utf8"));
const reviewPath = path.join(root, "bench", "research", "relevance-audit-review-v0.3.json");
const adminPath = path.join(root, "bench", "research", "relevance-audit-admin-v0.3.json");

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function blindId(instanceId) {
  return `audit_${createHash("sha256").update(`qarinah-v0.3:${instanceId}`).digest("hex").slice(0, 20)}`;
}

const tasksById = new Map(corpus.tasks.map((task) => [task.instanceId, task]));
const negatives = result.expected.taskResults.static
  .filter((task) => !task.positiveUnderStructuralOracle)
  .sort((left, right) => right.evidenceSufficiency.score - left.evidenceSufficiency.score
    || left.instanceId.localeCompare(right.instanceId));

assert.equal(negatives.length, 49, "The static graded structural oracle currently has 49 no-positive tasks.");
const strata = new Map(negatives.map((task, index) => [task.instanceId,
  index < 20 ? "high-score" : (index < 39 ? "medium-score" : "low-score")
]));

const cases = negatives.map((taskResult) => {
  const task = tasksById.get(taskResult.instanceId);
  const candidates = corpus.tasks.filter((candidate) => (
    candidate.repository === task.repository
    && candidate.phase === "warmup"
    && candidate.createdAt < task.createdAt
  )).map((candidate) => ({
    instanceId: candidate.instanceId,
    createdAt: candidate.createdAt,
    issueUrl: candidate.sources.issue,
    baseCommitUrl: candidate.sources.baseCommit,
    completedHistoricalFiles: candidate.patchFiles,
    completedHistoricalSymbols: candidate.changedSymbols,
    completedHistoricalModuleScopes: candidate.moduleScopes
  }));
  return {
    auditId: blindId(task.instanceId),
    target: {
      repository: task.repository,
      instanceId: task.instanceId,
      createdAt: task.createdAt,
      issueUrl: task.sources.issue,
      baseCommitUrl: task.sources.baseCommit
    },
    preTaskCandidates: candidates,
    labels: {
      allowedValues: ["DIRECT_EVIDENCE_EXISTS", "SUPPORTING_EVIDENCE_EXISTS", "NO_RELEVANT_EVIDENCE", "UNCERTAIN"],
      reviewerA: null,
      reviewerB: null,
      adjudicated: null
    }
  };
});

const reviewArtifact = {
  schemaVersion: "qarinah.relevance-audit-review.v0.3",
  status: "awaiting-two-independent-human-reviewers",
  population: "Complete census of the 49 static-development tasks with no positive under the graded structural oracle.",
  reviewerBlinding: {
    qarinahScoreHidden: true,
    qarinahDecisionHidden: true,
    scoreStratumHidden: true,
    targetGoldPatchHidden: true,
    targetGoldFilesAndSymbolsHidden: true
  },
  instructions: [
    "Each reviewer labels every case independently before viewing the other reviewer's labels.",
    "Use only the target issue at its pre-fix state and the listed pre-task historical candidates.",
    "Do not inspect Qarinah scores, decisions, or the target gold patch while labeling.",
    "After both passes, calculate agreement and Cohen's kappa, then adjudicate disagreements."
  ],
  cases
};

const adminArtifact = {
  schemaVersion: "qarinah.relevance-audit-admin.v0.3",
  status: "sampling-and-blinding-manifest",
  reviewArtifactSha256: digest(JSON.stringify(reviewArtifact)),
  requestedSampleAdjustment: "The requested 50-case sample is impossible under this oracle because only 49 static no-positive tasks exist; all 49 are included instead.",
  strata: {
    highScore: 20,
    mediumScore: 19,
    lowScore: 10
  },
  cases: negatives.map((task) => ({
    auditId: blindId(task.instanceId),
    instanceId: task.instanceId,
    stratum: strata.get(task.instanceId),
    developmentScore: task.evidenceSufficiency.score
  }))
};

if (process.argv.includes("--write")) {
  await writeFile(reviewPath, `${JSON.stringify(reviewArtifact, null, 2)}\n`, "utf8");
  await writeFile(adminPath, `${JSON.stringify(adminArtifact, null, 2)}\n`, "utf8");
  process.stdout.write("Wrote blinded 49-case relevance audit census and separate admin manifest.\n");
} else {
  assert.deepEqual(reviewArtifact, JSON.parse(await readFile(reviewPath, "utf8")));
  assert.deepEqual(adminArtifact, JSON.parse(await readFile(adminPath, "utf8")));
  process.stdout.write("Verified blinded relevance audit artifacts.\n");
}
