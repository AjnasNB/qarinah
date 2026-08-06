import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "bench", "final", "paired-power-analysis-v1.json");
const N = 40;
const ALPHA = 0.05;
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const rounded = (value) => Math.round(value * 1_000_000) / 1_000_000;

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= Math.min(k, n - k); index += 1) result = (result * (n - index + 1)) / index;
  return result;
}

function binomialProbability(k, n, p) {
  return choose(n, k) * (p ** k) * ((1 - p) ** (n - k));
}

function exactMcNemarPValue(wins, losses) {
  const discordant = wins + losses;
  if (discordant === 0) return 1;
  const tail = Math.min(wins, losses);
  let probability = 0;
  for (let index = 0; index <= tail; index += 1) probability += binomialProbability(index, discordant, 0.5);
  return Math.min(1, 2 * probability);
}

function power(discordance, effect) {
  if (effect < 0 || effect > discordance) return null;
  const qarinahOnly = (discordance + effect) / 2;
  const baselineOnly = (discordance - effect) / 2;
  const conditionalWin = discordance === 0 ? 0.5 : qarinahOnly / discordance;
  let probability = 0;
  for (let discordant = 0; discordant <= N; discordant += 1) {
    const discordantProbability = binomialProbability(discordant, N, discordance);
    for (let wins = 0; wins <= discordant; wins += 1) {
      const losses = discordant - wins;
      if (exactMcNemarPValue(wins, losses) < ALPHA) {
        probability += discordantProbability * binomialProbability(wins, discordant, conditionalWin);
      }
    }
  }
  const approximateHalfWidth = 1.96 * Math.sqrt((discordance - (effect ** 2)) / N);
  return {
    discordanceRate: discordance,
    netResolutionDifference: effect,
    qarinahOnlyProbability: rounded(qarinahOnly),
    baselineOnlyProbability: rounded(baselineOnly),
    exactMcNemarPower: rounded(probability),
    approximatePairedDifferenceCi95HalfWidth: rounded(approximateHalfWidth)
  };
}

const discordanceRates = [0.1, 0.2, 0.3, 0.4];
const reportedEffects = [0.05, 0.1, 0.15, 0.2, 0.25];
const scenarios = discordanceRates.flatMap((discordance) => reportedEffects
  .filter((effect) => effect <= discordance)
  .map((effect) => power(discordance, effect)));
const minimumDetectableEffects = discordanceRates.map((discordance) => {
  let result = null;
  for (let step = 1; step <= Math.round(discordance * 200); step += 1) {
    const candidate = power(discordance, step / 200);
    if (candidate.exactMcNemarPower >= 0.8) {
      result = candidate;
      break;
    }
  }
  return {
    discordanceRate: discordance,
    targetPower: 0.8,
    smallestGridEffect: result?.netResolutionDifference ?? null,
    achievedPower: result?.exactMcNemarPower ?? null
  };
});

const content = {
  schemaVersion: "qarinah.paired-power-analysis.v1",
  status: "pre-outcome-design-analysis",
  pairedTasks: N,
  alphaTwoSided: ALPHA,
  primaryBinaryComparison: "paired SWE-bench resolved outcome",
  method: "Exact two-sided McNemar rejection probability, marginalized over the binomial number of discordant pairs. Effect is P(Qarinah-only resolution) minus P(baseline-only resolution).",
  assumptions: {
    independentTaskPairs: true,
    noFinalOutcomesInspected: true,
    discordanceRatesExplored: discordanceRates,
    effectGridIncrement: 0.005,
    confidenceIntervalWidthNote: "The reported 95% half-width is a normal approximation for the paired difference and is descriptive, not the exact McNemar interval."
  },
  scenarios,
  minimumDetectableEffects,
  conclusion: "Forty paired tasks have adequate power only for large net binary-resolution effects under the explored discordance rates. Treat SWE-bench resolution as a secondary outcome unless the true effect is large; the main study can instead center portable handoff, context use, repeated work, citations, and invalid-evidence exposure.",
  decisionRule: "Do not add tasks after final outcomes are observed. Any sample-size change requires a pre-unblinding protocol amendment.",
  generatedAt: "2026-08-05"
};
const artifact = { ...content, contentDigest: sha256(JSON.stringify(content)) };

assert.equal(scenarios.length, 16);
assert.ok(minimumDetectableEffects.every((row) => row.smallestGridEffect === null || row.smallestGridEffect >= 0.1));

if (process.argv.includes("--write")) {
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${artifact.contentDigest}).\n`);
} else {
  const committed = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(artifact, committed, "Power analysis drifted from the committed pre-outcome artifact.");
  process.stdout.write(`Verified paired power analysis (${artifact.contentDigest}).\n`);
}
