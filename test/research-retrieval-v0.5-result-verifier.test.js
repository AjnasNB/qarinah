import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  V05_EXPECTED_CANONICAL_BYTES,
  V05_EXPECTED_CANONICAL_SHA256,
  V05PostResultVerificationError,
  V05_RESULT_COMMIT,
  V05_RESULT_PATH,
  V05_RESULT_SHA256,
  V05_RESULT_TAG,
  verifyResearchRetrievalV05Result,
  verifyV05ResultInvariants
} from "../scripts/verify-research-retrieval-v0.5-result.mjs";

const run = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultPath = path.join(repositoryRoot, ...V05_RESULT_PATH.split("/"));
const verifierPath = path.join(repositoryRoot, "scripts", "verify-research-retrieval-v0.5-result.mjs");

const readResult = async () => JSON.parse(await readFile(resultPath, "utf8"));

test("v0.5 post-result verifier accepts the exact tagged artifact without rewriting evidence", async () => {
  const guardedPaths = [
    resultPath,
    path.join(repositoryRoot, "bench", "research", "research-retrieval-development-v0.5-amendment.json"),
    path.join(repositoryRoot, "bench", "research", "research-retrieval-development-v0.5-authorization.json"),
    path.join(repositoryRoot, "bench", "research", "swe-bench-lite-development-v0.2.json"),
    path.join(repositoryRoot, "bench", "results", "research-retrieval-development-v0.4.json")
  ];
  const before = await Promise.all(guardedPaths.map(async (file) => ({
    file,
    bytes: await readFile(file),
    stats: await stat(file)
  })));

  const report = await verifyResearchRetrievalV05Result({ repositoryRoot });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "read-only-post-result-v0.5");
  assert.equal(report.resultSha256, V05_RESULT_SHA256);
  assert.equal(report.resultCommit, V05_RESULT_COMMIT);
  assert.equal(report.resultTag, V05_RESULT_TAG);
  assert.equal(report.expectedCanonicalBytes, V05_EXPECTED_CANONICAL_BYTES);
  assert.equal(report.expectedCanonicalSha256, V05_EXPECTED_CANONICAL_SHA256);
  assert.equal(report.completeExpectedProjectionMatchesV04, true);
  assert.equal(report.confirmatoryClaimEligible, false);
  assert.equal(report.providerModelCalls, 0);
  assert.equal(report.providerReportedTokensMeasured, false);
  assert.equal(report.costMeasured, false);
  assert.equal(report.latencyMeasured, false);
  assert.equal(report.sweBenchPatchResolutionMeasured, false);
  assert.equal(report.humanQualityMeasured, false);
  assert.equal(report.superiorityClaimAllowed, false);
  assert.equal(report.evaluatorImported, false);
  assert.equal(report.retrievalModulesLoaded, false);
  assert.equal(report.corpusLoaderImported, false);
  assert.equal(report.networkRequests, 0);
  assert.equal(report.retrievalOrRankingCalls, 0);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.resultRewritten, false);

  for (const snapshot of before) {
    const afterBytes = await readFile(snapshot.file);
    const afterStats = await stat(snapshot.file);
    assert.deepEqual(afterBytes, snapshot.bytes);
    assert.equal(afterStats.mtimeMs, snapshot.stats.mtimeMs);
  }
});

test("v0.5 post-result verifier rejects byte-level artifact tampering", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v05-result-tamper-"));
  try {
    const tamperedPath = path.join(temporaryRoot, "result.json");
    const original = await readFile(resultPath, "utf8");
    await writeFile(tamperedPath, original.replace(
      '"confirmatoryClaimEligible": false',
      '"confirmatoryClaimEligible": true'
    ), "utf8");
    await assert.rejects(
      () => verifyResearchRetrievalV05Result({ repositoryRoot, resultPath: tamperedPath }),
      (error) => error instanceof V05PostResultVerificationError && error.code === "RESULT_ARTIFACT_HASH"
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("semantic verifier independently rejects fabricated best and winner claims", async () => {
  const result = await readResult();

  const fabricatedWinner = structuredClone(result);
  fabricatedWinner.winner = "qarinah";
  assert.throws(
    () => verifyV05ResultInvariants(fabricatedWinner, { referenceExpected: result.expected }),
    (error) => error instanceof V05PostResultVerificationError && error.code === "RESULT_KEYS"
  );

  const fabricatedBest = structuredClone(result);
  fabricatedBest.status = "best context reduction AI";
  assert.throws(
    () => verifyV05ResultInvariants(fabricatedBest, { referenceExpected: result.expected }),
    (error) => error instanceof V05PostResultVerificationError && error.code === "RESULT_FORBIDDEN_CLAIM_VALUE"
  );
});

test("semantic verifier rejects confirmatory, provider, cost, and incomplete-projection fabrication", async () => {
  const result = await readResult();

  const confirmatory = structuredClone(result);
  confirmatory.confirmatoryClaimEligible = true;
  assert.throws(
    () => verifyV05ResultInvariants(confirmatory, { referenceExpected: result.expected }),
    (error) => error instanceof V05PostResultVerificationError && error.code === "RESULT_CONFIRMATORY"
  );

  const providerBacked = structuredClone(result);
  providerBacked.executionScope.providerModelCalls = 1;
  providerBacked.executionScope.providerReportedTokens = true;
  providerBacked.executionScope.costStudy = true;
  assert.throws(
    () => verifyV05ResultInvariants(providerBacked, { referenceExpected: result.expected }),
    (error) => error instanceof V05PostResultVerificationError && error.code === "RESULT_EXECUTION_SCOPE"
  );

  const incomplete = structuredClone(result);
  incomplete.expected.taskResults.static.pop();
  assert.throws(
    () => verifyV05ResultInvariants(incomplete, { referenceExpected: result.expected }),
    (error) => error instanceof V05PostResultVerificationError && error.code === "EXPECTED_TASK_RESULT_COUNT"
  );
});

test("CLI dependency and network traps prove verification does not replay retrieval", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v05-result-loader-"));
  try {
    const loaderPath = path.join(temporaryRoot, "deny-replay-loader.mjs");
    const preloadPath = path.join(temporaryRoot, "deny-network-preload.mjs");
    await writeFile(loaderPath, `
const denied = [
  "/src/index.js",
  "/src/retrieval.js",
  "/scripts/evaluate-research-retrieval-v0.5.mjs",
  "/bench/research/swe-bench-lite.mjs"
];
export async function resolve(specifier, context, nextResolve) {
  const candidate = String(specifier).replaceAll("\\\\", "/");
  if (denied.some((suffix) => candidate.endsWith(suffix))) {
    throw new Error("V05_REPLAY_IMPORT_FORBIDDEN:" + candidate);
  }
  return nextResolve(specifier, context);
}
`, "utf8");
    await writeFile(preloadPath, `
globalThis.fetch = async () => { throw new Error("V05_NETWORK_FORBIDDEN"); };
`, "utf8");

    const { stdout, stderr } = await run(process.execPath, [
      "--import",
      pathToFileURL(preloadPath).href,
      "--experimental-loader",
      pathToFileURL(loaderPath).href,
      verifierPath
    ], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });
    const report = JSON.parse(stdout);
    assert.equal(report.ok, true);
    assert.equal(report.evaluatorImported, false);
    assert.equal(report.retrievalModulesLoaded, false);
    assert.equal(report.corpusLoaderImported, false);
    assert.equal(report.networkRequests, 0);
    assert.equal(stderr.includes("V05_REPLAY_IMPORT_FORBIDDEN"), false);
    assert.equal(stderr.includes("V05_NETWORK_FORBIDDEN"), false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("verifier source exposes no filesystem mutation primitive", async () => {
  const source = await readFile(verifierPath, "utf8");
  assert.match(source, /import \{ readFile, readdir \} from "node:fs\/promises";/u);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|truncate|unlink|rename|rm|mkdir|rmdir|open)\b/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
});

test("package routes normal research evidence checks through the post-result verifier", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["check:research-production-evidence"], "node scripts/verify-research-retrieval-v0.5-result.mjs");
  assert.equal(packageJson.scripts["check:research-retrieval:v0.5:result"], "node scripts/verify-research-retrieval-v0.5-result.mjs");
  assert.equal(packageJson.scripts["evaluate:research-retrieval:v0.4"], "node scripts/evaluate-research-retrieval-v0.4.mjs");
  assert.equal(packageJson.scripts["evaluate:research-retrieval:v0.4:write"], "node scripts/evaluate-research-retrieval-v0.4.mjs --write");
  assert.equal(packageJson.files.includes("scripts/verify-research-retrieval-v0.5-result.mjs"), true);
  assert.equal(packageJson.files.includes(V05_RESULT_PATH), true);
});
