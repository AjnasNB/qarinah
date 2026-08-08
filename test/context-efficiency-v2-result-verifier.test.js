import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  RESULT_PATH,
  RESULT_SHA256,
  V2PostResultVerificationError,
  verifyContextEfficiencyV2Result,
  verifyResultInvariants
} from "../scripts/verify-context-efficiency-comparison-v2-result.mjs";
import {
  V1_RESULT_PATH,
  V1_RESULT_SHA256,
  V1PostResultVerificationError,
  verifyContextEfficiencyV1Result
} from "../scripts/verify-context-efficiency-comparison-v1-result.mjs";

const run = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultPath = path.join(repositoryRoot, ...RESULT_PATH.split("/"));
const v1ResultPath = path.join(repositoryRoot, ...V1_RESULT_PATH.split("/"));

test("historical V1 verifier preserves the frozen exploratory artifact and its limitations", async () => {
  const beforeBytes = await readFile(v1ResultPath);
  const beforeStats = await stat(v1ResultPath);
  const report = await verifyContextEfficiencyV1Result({ repositoryRoot });
  const afterBytes = await readFile(v1ResultPath);
  const afterStats = await stat(v1ResultPath);

  assert.equal(report.ok, true);
  assert.equal(report.mode, "read-only-historical-v1-result");
  assert.equal(report.resultSha256, V1_RESULT_SHA256);
  assert.equal(report.annotatedTag, null);
  assert.equal(report.retrievalModulesLoaded, false);
  assert.equal(report.retrievalOrRankingCalls, 0);
  assert.equal(report.resultRewritten, false);
  assert.equal(report.comparativeRankingClaimAllowed, false);
  assert.equal(report.provenanceLimitations.length, 3);
  assert.deepEqual(afterBytes, beforeBytes);
  assert.equal(afterStats.mtimeMs, beforeStats.mtimeMs);
});

test("historical V1 verifier rejects byte-level artifact tampering", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v1-result-tamper-"));
  try {
    const tamperedPath = path.join(temporaryRoot, "result.json");
    const original = await readFile(v1ResultPath, "utf8");
    await writeFile(tamperedPath, original.replace(
      '"comparativeRankingClaimAllowed": false',
      '"comparativeRankingClaimAllowed": true'
    ), "utf8");
    await assert.rejects(
      () => verifyContextEfficiencyV1Result({ repositoryRoot, resultPath: tamperedPath }),
      (error) => error instanceof V1PostResultVerificationError && error.code === "V1_RESULT_ARTIFACT_HASH"
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("post-result verifier is read-only and accepts the exact tagged artifact", async () => {
  const beforeBytes = await readFile(resultPath);
  const beforeStats = await stat(resultPath);
  const report = await verifyContextEfficiencyV2Result({ repositoryRoot });
  const afterBytes = await readFile(resultPath);
  const afterStats = await stat(resultPath);

  assert.equal(report.ok, true);
  assert.equal(report.mode, "read-only-post-result");
  assert.equal(report.resultSha256, RESULT_SHA256);
  assert.equal(report.retrievalModulesLoaded, false);
  assert.equal(report.retrievalOrRankingCalls, 0);
  assert.equal(report.resultRewritten, false);
  assert.equal(report.winner, null);
  assert.equal(report.qarinahWinnerClaimAllowed, false);
  assert.deepEqual(afterBytes, beforeBytes);
  assert.equal(afterStats.mtimeMs, beforeStats.mtimeMs);
});

test("post-result verifier rejects byte-level result tampering", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v2-result-tamper-"));
  try {
    const tamperedPath = path.join(temporaryRoot, "result.json");
    const original = await readFile(resultPath, "utf8");
    await writeFile(tamperedPath, original.replace(
      '"primaryComparison": "no primary comparative context-efficiency result"',
      '"primaryComparison": "tampered winner"'
    ), "utf8");
    await assert.rejects(
      () => verifyContextEfficiencyV2Result({ repositoryRoot, resultPath: tamperedPath }),
      (error) => error instanceof V2PostResultVerificationError && error.code === "RESULT_ARTIFACT_HASH"
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("semantic verifier independently rejects a fabricated winner", async () => {
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const protocol = JSON.parse(await readFile(path.join(repositoryRoot, "bench/research/context-efficiency-comparison-v2-protocol.json"), "utf8"));
  const amendment002 = JSON.parse(await readFile(path.join(repositoryRoot, "bench/research/context-efficiency-comparison-v2-amendment-002.json"), "utf8"));
  result.decision.winner = "qarinah-admission-first-v2";
  result.decision.qarinahWinnerClaimAllowed = true;
  assert.throws(
    () => verifyResultInvariants(result, { protocol, amendment002 }),
    (error) => error instanceof V2PostResultVerificationError && error.code === "RESULT_DECISION"
  );
});

test("CLI dependency trap proves the post-result path does not load retrieval or the evaluator", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v2-result-loader-"));
  try {
    const loaderPath = path.join(temporaryRoot, "deny-retrieval-loader.mjs");
    await writeFile(loaderPath, `
const denied = [
  "/src/retrieval.js",
  "/src/index.js",
  "/scripts/context-efficiency-v2-lib.mjs",
  "/scripts/evaluate-context-efficiency-comparison-v2.mjs"
];
export async function resolve(specifier, context, nextResolve) {
  const candidate = String(specifier).replaceAll("\\\\", "/");
  if (denied.some((suffix) => candidate.endsWith(suffix))) {
    throw new Error("RETRIEVAL_IMPORT_FORBIDDEN:" + candidate);
  }
  return nextResolve(specifier, context);
}
`, "utf8");
    const verifierPath = path.join(repositoryRoot, "scripts/verify-context-efficiency-comparison-v2-result.mjs");
    const { stdout, stderr } = await run(process.execPath, [
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
    assert.equal(report.retrievalModulesLoaded, false);
    assert.equal(report.retrievalOrRankingCalls, 0);
    assert.equal(stderr.includes("RETRIEVAL_IMPORT_FORBIDDEN"), false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI dependency trap proves historical V1 verification does not replay retrieval", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v1-result-loader-"));
  try {
    const loaderPath = path.join(temporaryRoot, "deny-v1-replay-loader.mjs");
    await writeFile(loaderPath, `
const denied = [
  "/src/index.js",
  "/src/retrieval.js",
  "/scripts/continuation-evidence-lib.mjs",
  "/scripts/evaluate-context-efficiency-comparison-v1.mjs"
];
export async function resolve(specifier, context, nextResolve) {
  const candidate = String(specifier).replaceAll("\\\\", "/");
  if (denied.some((suffix) => candidate.endsWith(suffix))) {
    throw new Error("V1_REPLAY_IMPORT_FORBIDDEN:" + candidate);
  }
  return nextResolve(specifier, context);
}
`, "utf8");
    const verifierPath = path.join(repositoryRoot, "scripts/verify-context-efficiency-comparison-v1-result.mjs");
    const { stdout, stderr } = await run(process.execPath, [
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
    assert.equal(report.retrievalModulesLoaded, false);
    assert.equal(report.retrievalOrRankingCalls, 0);
    assert.equal(stderr.includes("V1_REPLAY_IMPORT_FORBIDDEN"), false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
