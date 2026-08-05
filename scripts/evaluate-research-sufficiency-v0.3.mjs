import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "bench", "results", "research-retrieval-development-v0.2.json");
const resultPath = path.join(root, "bench", "results", "research-sufficiency-development-v0.3.json");
const DIRECT_THRESHOLD = 0.65;
const PARTIAL_THRESHOLD = 0.4;
const THRESHOLD_GRID = Object.freeze([0.65, 0.7, 0.75, 0.8]);

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mean(values) {
  return values.length === 0 ? null : rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function classification(score) {
  if (score >= DIRECT_THRESHOLD) return { state: "DIRECTLY_SUPPORTED", decision: "ACCEPT_DIRECT" };
  if (score >= PARTIAL_THRESHOLD) return { state: "PARTIALLY_SUPPORTED", decision: "ABSTAIN" };
  return { state: "INSUFFICIENT_EVIDENCE", decision: "ABSTAIN" };
}

function areaMetrics(rows) {
  const positives = rows.filter((row) => row.positive);
  const negatives = rows.filter((row) => !row.positive);
  let concordant = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      concordant += positive.score > negative.score ? 1 : (positive.score === negative.score ? 0.5 : 0);
    }
  }
  const sorted = [...rows].sort((left, right) => right.score - left.score || Number(right.positive) - Number(left.positive));
  let seenPositive = 0;
  let averagePrecision = 0;
  sorted.forEach((row, index) => {
    if (!row.positive) return;
    seenPositive += 1;
    averagePrecision += seenPositive / (index + 1);
  });
  let calibrationError = 0;
  for (let bin = 0; bin < 10; bin += 1) {
    const lower = bin / 10;
    const upper = (bin + 1) / 10;
    const members = rows.filter((row) => row.score >= lower && (bin === 9 ? row.score <= upper : row.score < upper));
    if (members.length === 0) continue;
    calibrationError += (members.length / rows.length) * Math.abs(
      members.reduce((sum, row) => sum + row.score, 0) / members.length
      - members.filter((row) => row.positive).length / members.length
    );
  }
  return {
    rocAuc: positives.length === 0 || negatives.length === 0 ? null : rounded(concordant / (positives.length * negatives.length)),
    prAucAveragePrecision: positives.length === 0 ? null : rounded(averagePrecision / positives.length),
    brierScore: mean(rows.map((row) => (row.score - Number(row.positive)) ** 2)),
    expectedCalibrationError10Bin: rounded(calibrationError)
  };
}

function decisionMetrics(rows, threshold = DIRECT_THRESHOLD) {
  const accepted = rows.filter((row) => row.score >= threshold);
  const positives = rows.filter((row) => row.positive);
  const negatives = rows.filter((row) => !row.positive);
  const truePositive = accepted.filter((row) => row.positive).length;
  const falsePositive = accepted.filter((row) => !row.positive).length;
  const trueNegative = negatives.length - falsePositive;
  const falseNegative = positives.length - truePositive;
  const precision = accepted.length === 0 ? null : truePositive / accepted.length;
  const recall = positives.length === 0 ? null : truePositive / positives.length;
  return {
    threshold,
    tasks: rows.length,
    positives: positives.length,
    noPositiveUnderStructuralOracle: negatives.length,
    acceptedDirect: accepted.length,
    abstained: rows.length - accepted.length,
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    acceptedPrecision: precision === null ? null : rounded(precision),
    acceptedRecall: recall === null ? null : rounded(recall),
    acceptedF1: precision === null || recall === null || precision + recall === 0
      ? null
      : rounded((2 * precision * recall) / (precision + recall)),
    falseAcceptanceRate: negatives.length === 0 ? null : rounded(falsePositive / negatives.length),
    correctAbstentionRate: negatives.length === 0 ? null : rounded(trueNegative / negatives.length),
    acceptanceCoverage: rounded(accepted.length / rows.length)
  };
}

function leaveOneRepositoryOut(rows) {
  const repositories = [...new Set(rows.map((row) => row.repository))].sort();
  const folds = repositories.map((repository) => {
    const training = rows.filter((row) => row.repository !== repository);
    const testing = rows.filter((row) => row.repository === repository);
    const candidates = THRESHOLD_GRID.map((threshold) => ({ threshold, metrics: decisionMetrics(training, threshold) }))
      .filter((candidate) => candidate.metrics.falsePositive === 0)
      .sort((left, right) => right.metrics.truePositive - left.metrics.truePositive || left.threshold - right.threshold);
    const selectedThreshold = candidates[0]?.threshold ?? 1;
    return {
      heldOutRepository: repository,
      selectedThreshold,
      selectionRule: "maximize training true positives subject to zero training false positives; tie-break to lower threshold",
      training: decisionMetrics(training, selectedThreshold),
      heldOut: decisionMetrics(testing, selectedThreshold)
    };
  });
  const heldOutTotals = folds.reduce((totals, fold) => {
    for (const key of ["tasks", "positives", "noPositiveUnderStructuralOracle", "acceptedDirect", "abstained", "truePositive", "falsePositive", "trueNegative", "falseNegative"]) {
      totals[key] += fold.heldOut[key];
    }
    return totals;
  }, {
    tasks: 0,
    positives: 0,
    noPositiveUnderStructuralOracle: 0,
    acceptedDirect: 0,
    abstained: 0,
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0
  });
  const precision = heldOutTotals.acceptedDirect === 0 ? null : heldOutTotals.truePositive / heldOutTotals.acceptedDirect;
  const recall = heldOutTotals.positives === 0 ? null : heldOutTotals.truePositive / heldOutTotals.positives;
  return {
    method: "leave-one-repository-out threshold validation",
    thresholdGrid: THRESHOLD_GRID,
    folds,
    aggregate: {
      ...heldOutTotals,
      acceptedPrecision: precision === null ? null : rounded(precision),
      acceptedRecall: recall === null ? null : rounded(recall),
      falseAcceptanceRate: heldOutTotals.noPositiveUnderStructuralOracle === 0
        ? null
        : rounded(heldOutTotals.falsePositive / heldOutTotals.noPositiveUnderStructuralOracle),
      correctAbstentionRate: heldOutTotals.noPositiveUnderStructuralOracle === 0
        ? null
        : rounded(heldOutTotals.trueNegative / heldOutTotals.noPositiveUnderStructuralOracle)
    }
  };
}

const sourceBytes = await readFile(sourcePath);
const source = JSON.parse(sourceBytes);
const settings = Object.fromEntries(Object.entries(source.expected.taskResults).map(([setting, taskRows]) => {
  const rows = taskRows.map((task) => ({
    repository: task.repository,
    instanceId: task.instanceId,
    positive: task.positiveUnderStructuralOracle,
    score: task.evidenceSufficiency.score,
    ...classification(task.evidenceSufficiency.score)
  }));
  const decisions = decisionMetrics(rows);
  assert.equal(decisions.falsePositive, 0, `${setting} must have zero direct false acceptances on the structural development oracle.`);
  return [setting, {
    thresholds: { direct: DIRECT_THRESHOLD, partial: PARTIAL_THRESHOLD },
    stateCounts: Object.fromEntries(["DIRECTLY_SUPPORTED", "PARTIALLY_SUPPORTED", "INSUFFICIENT_EVIDENCE"]
      .map((state) => [state, rows.filter((row) => row.state === state).length])),
    directDecision: decisions,
    scoreQuality: areaMetrics(rows),
    leaveOneRepositoryOut: leaveOneRepositoryOut(rows),
    taskDecisions: rows
  }];
}));

for (const setting of Object.values(settings)) {
  assert.equal(setting.directDecision.falseAcceptanceRate, 0);
  assert.equal(setting.directDecision.acceptedPrecision, 1);
  assert.equal(setting.leaveOneRepositoryOut.aggregate.falseAcceptanceRate, 0);
  assert.equal(setting.leaveOneRepositoryOut.aggregate.acceptedPrecision, 1);
}

const artifact = {
  schemaVersion: "qarinah.research-sufficiency-development-result.v0.3",
  status: "development-threshold-calibration-not-confirmatory",
  sourceArtifact: {
    path: "bench/results/research-retrieval-development-v0.2.json",
    sha256: sha256(sourceBytes)
  },
  productionRule: {
    method: "evidence-sufficiency-v2",
    directThreshold: DIRECT_THRESHOLD,
    partialThreshold: PARTIAL_THRESHOLD,
    directDecision: "Only DIRECTLY_SUPPORTED produces ACCEPT_DIRECT; partial evidence always abstains.",
    thresholdSelection: "Interpretable fixed rule selected on already-inspected development data."
  },
  claimBoundary: {
    confirmatory: false,
    humanValidatedRelevance: false,
    zeroFalseAcceptanceMeaning: "Zero direct false acceptances on the deterministic structural development oracle only; this is not a universal semantic guarantee.",
    tradeoff: "The conservative rule intentionally sacrifices acceptance coverage and recall to maximize precision."
  },
  settings
};

if (process.argv.includes("--write")) {
  await writeFile(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, resultPath)}.\n`);
} else {
  const committed = JSON.parse(await readFile(resultPath, "utf8"));
  assert.deepEqual(artifact, committed, "Development sufficiency calibration drifted from the committed artifact.");
  process.stdout.write("Development sufficiency calibration matches the committed artifact.\n");
}

process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(settings).map(([name, setting]) => [name, {
  directDecision: setting.directDecision,
  scoreQuality: setting.scoreQuality,
  leaveOneRepositoryOut: setting.leaveOneRepositoryOut.aggregate
}])), null, 2)}\n`);
