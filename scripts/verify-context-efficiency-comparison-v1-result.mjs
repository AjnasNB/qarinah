import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export const V1_RESULT_PATH = "bench/results/context-efficiency-comparison-0.1.6-v1.json";
export const V1_RESULT_SHA256 = "sha256:f24fa2a501b62153da61fa327fb818392e291cdfddb5d8d6d230dbd49346dd40";
export const V1_RESULT_GIT_BLOB = "3a5cb68da553b5e1e1564aab6b95843230f9d52f";
export const V1_RESULT_COMMIT = "72202e568fabbc7f55b4589199377024506af8d8";

const V1_RESULT_PARENT = "785b3b1734b92bf37f91c41bc6b48a71c0149a92";
const V1_RESULT_MESSAGE = "research: preserve exploratory context comparison";
const V1_EVALUATOR_PATH = "scripts/evaluate-context-efficiency-comparison-v1.mjs";
const V1_DOCUMENT_PATH = "docs/CONTEXT-EFFICIENCY-COMPARISON-v1.md";
const V1_FIXTURE_PATH = "bench/fixtures/software-task-scenarios.mjs";
const V1_COMMIT_FILES = [V1_RESULT_PATH, V1_DOCUMENT_PATH, "package.json", V1_EVALUATOR_PATH];
const METHOD_IDS = [
  "full-history-json-records",
  "last-n-complete-records",
  "standalone-bm25-complete-records",
  "standalone-bm25-compact-audit-pack",
  "qarinah-admission-first-v2-audit-pack"
];
const IMPLEMENTATION_ROOTS = [
  "bin/qarinah.js",
  "integrations/claude/qarinah",
  "integrations/codex/qarinah",
  "package-lock.json",
  "package.json",
  "schemas",
  "src",
  "types"
];

export class V1PostResultVerificationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "V1PostResultVerificationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new V1PostResultVerificationError(code, message);
}

function exact(condition, code, message) {
  if (!condition) fail(code, message);
}

function same(actual, expected, code, message) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch {
    fail(code, message);
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function git(repositoryRoot, args, encoding = "utf8") {
  try {
    return (await run("git", args, {
      cwd: repositoryRoot,
      encoding,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true
    })).stdout;
  } catch (error) {
    fail("V1_GIT_BINDING", `git ${args[0]} failed: ${String(error?.stderr || error?.message || error).trim()}`);
  }
}

async function gitText(repositoryRoot, args) {
  return String(await git(repositoryRoot, args)).trim();
}

async function gitBytes(repositoryRoot, object) {
  return git(repositoryRoot, ["show", object], "buffer");
}

function parseTreeListing(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) blob [0-9a-f]{40}\t(.+)$/u.exec(entry);
    exact(match !== null, "V1_SOURCE_TREE", `Unsupported historical source entry: ${entry}`);
    exact(match[1] !== "120000", "V1_SOURCE_LINK", `Historical source entry is linked: ${match[2]}`);
    return match[2].replaceAll("\\", "/");
  }).sort();
}

async function historicalImplementationManifest(repositoryRoot) {
  const listing = await git(repositoryRoot, [
    "ls-tree", "-r", "-z", V1_RESULT_COMMIT, "--", ...IMPLEMENTATION_ROOTS
  ], "buffer");
  const files = parseTreeListing(listing);
  exact(files.length > 0, "V1_IMPLEMENTATION_MANIFEST", "No historical implementation files were found.");
  const aggregate = createHash("sha256");
  aggregate.update("qarinah-continuation-implementation-lf-v1\0", "utf8");
  for (const relativePath of files) {
    const contents = (await gitBytes(repositoryRoot, `${V1_RESULT_COMMIT}:${relativePath}`))
      .toString("utf8").replace(/\r\n?/gu, "\n");
    aggregate.update(`${Buffer.byteLength(relativePath)}:${relativePath}\0${Buffer.byteLength(contents)}:`, "utf8");
    aggregate.update(contents, "utf8");
    aggregate.update("\0", "utf8");
  }
  return {
    algorithm: "sha256-path-lf-content-v1",
    fileCount: files.length,
    digest: `sha256:${aggregate.digest("hex")}`
  };
}

function verifyV1SemanticBoundary(result) {
  same(Object.keys(result), [
    "schemaVersion", "packageVersion", "protocol", "sourceBinding", "primary",
    "secondaryContinuation", "claimBoundary", "limitations"
  ], "V1_RESULT_SCHEMA", "V1 top-level schema differs.");
  exact(result.schemaVersion === "qarinah.context-efficiency-comparison-result.v1" && result.packageVersion === "0.1.6", "V1_RESULT_IDENTITY", "V1 result identity differs.");
  exact(result.protocol.fixedBeforeOutcome === false && result.protocol.externallyPreregistered === false && result.protocol.providerReportedInputTokensMeasured === false, "V1_PROTOCOL_BOUNDARY", "V1 protocol timing or provider boundary differs.");
  exact(result.protocol.primaryCases === 6 && result.primary.fixtureRecords === 240 && result.primary.cases.length === 6, "V1_FIXTURE_COUNTS", "V1 fixture counts differ.");

  const aggregates = result.primary.aggregateMethods;
  same(aggregates.map((entry) => entry.id), METHOD_IDS, "V1_METHOD_ORDER", "V1 aggregate method order differs.");
  const fullHistory = aggregates[0];
  exact(fullHistory.allCasesEligible === true && fullHistory.totalModelFacingEstimatedTokens === 446_991, "V1_FULL_HISTORY", "V1 full-history reference differs.");
  exact(aggregates[1].allCasesEligible === false, "V1_LAST_N_CONTROL", "V1 last-N control eligibility differs.");
  for (const method of aggregates.slice(2)) {
    exact(method.allCasesEligible === true && method.answerGatePasses === 6 && method.citationGatePasses === 6, "V1_SCRIPT_GATE", `${method.id} no longer records six script-gate passes.`);
  }
  for (const method of aggregates) {
    const expectedReduction = Math.round((1 - method.totalModelFacingEstimatedTokens / fullHistory.totalModelFacingEstimatedTokens) * 1_000_000) / 1_000_000;
    exact(method.estimatedReductionVersusFullHistory === expectedReduction, "V1_REDUCTION_ARITHMETIC", `V1 reduction arithmetic differs for ${method.id}.`);
  }
  for (const caseResult of result.primary.cases) {
    same(caseResult.methods.map((entry) => entry.id), METHOD_IDS, "V1_CASE_METHOD_ORDER", `V1 method order differs for ${caseResult.id}.`);
  }

  const observation = result.primary.scriptGateObservation;
  exact(observation.status === "exploratory descriptive observation; no comparative ranking is designated", "V1_OBSERVATION_BOUNDARY", "V1 observation status differs.");
  exact(observation.qarinahTotalModelFacingEstimatedTokens === 4664 && observation.compactBm25TotalModelFacingEstimatedTokens === 5035 && observation.bothPassedCurrentScriptGateOnAllCases === true, "V1_OBSERVATION_VALUES", "V1 descriptive observation differs.");
  exact(result.claimBoundary.universalOrIndustryBestClaim === false && result.claimBoundary.providerTokenClaim === false && result.claimBoundary.taskSuccessClaim === false && result.claimBoundary.comparativeRankingClaimAllowed === false, "V1_CLAIM_BOUNDARY", "V1 claim boundary differs.");

  const continuation = new Map(result.secondaryContinuation.methods.map((entry) => [entry.id, entry]));
  exact(continuation.get("summary-only-no-citation-control")?.summaryAndSourceCitationStringsGate === false, "V1_CONTINUATION_CONTROL", "V1 summary-only control differs.");
  exact(continuation.get("qarinah-handoff-capsule")?.summaryAndSourceCitationStringsGate === false && continuation.get("qarinah-handoff-capsule")?.summaryAndEvidenceReferenceGate === true, "V1_CONTINUATION_CAPSULE", "V1 capsule evidence boundary differs.");
  exact(result.limitations.some((entry) => entry.includes("No universal, industry-best, quality, latency, cost, or provider-token conclusion is supported.")), "V1_LIMITATION", "V1 universal-claim limitation is missing.");
}

export async function verifyContextEfficiencyV1Result({ repositoryRoot, resultPath = path.join(repositoryRoot, ...V1_RESULT_PATH.split("/")) }) {
  const raw = await readFile(resultPath);
  exact(sha256(raw) === V1_RESULT_SHA256, "V1_RESULT_ARTIFACT_HASH", "V1 result bytes differ from the committed exploratory artifact.");
  let result;
  try {
    result = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("V1_RESULT_ARTIFACT_JSON", "V1 result is not valid JSON.");
  }
  exact(raw.equals(Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8")), "V1_RESULT_ARTIFACT_CANONICAL", "V1 result is not canonical LF JSON.");

  exact(await gitText(repositoryRoot, ["rev-parse", `${V1_RESULT_COMMIT}^`]) === V1_RESULT_PARENT, "V1_RESULT_PARENT", "V1 result commit parent differs.");
  exact(await gitText(repositoryRoot, ["show", "-s", "--format=%s", V1_RESULT_COMMIT]) === V1_RESULT_MESSAGE, "V1_RESULT_MESSAGE", "V1 result commit subject differs.");
  const changed = String(await git(repositoryRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", V1_RESULT_COMMIT]))
    .split(/\r?\n/u).filter(Boolean).sort();
  same(changed, [...V1_COMMIT_FILES].sort(), "V1_RESULT_SCOPE", "V1 result commit scope differs.");
  try {
    await run("git", ["merge-base", "--is-ancestor", V1_RESULT_COMMIT, "HEAD"], { cwd: repositoryRoot, windowsHide: true });
  } catch {
    fail("V1_RESULT_ANCESTRY", "HEAD is not descended from the V1 result commit.");
  }

  const committed = await gitBytes(repositoryRoot, `${V1_RESULT_COMMIT}:${V1_RESULT_PATH}`);
  exact(sha256(committed) === V1_RESULT_SHA256 && raw.equals(committed), "V1_RESULT_COMMITTED_HASH", "Working V1 artifact differs from the historical commit.");
  exact(await gitText(repositoryRoot, ["rev-parse", `${V1_RESULT_COMMIT}:${V1_RESULT_PATH}`]) === V1_RESULT_GIT_BLOB, "V1_RESULT_GIT_BLOB", "V1 result Git blob differs.");

  exact(sha256(await gitBytes(repositoryRoot, `${V1_RESULT_COMMIT}:${V1_EVALUATOR_PATH}`)) === result.sourceBinding.evaluator.sha256, "V1_EVALUATOR_HASH", "V1 evaluator hash differs from its source binding.");
  exact(sha256(await gitBytes(repositoryRoot, `${V1_RESULT_COMMIT}:${V1_FIXTURE_PATH}`)) === result.sourceBinding.softwareFixture.sha256, "V1_FIXTURE_HASH", "V1 fixture hash differs from its source binding.");
  same(await historicalImplementationManifest(repositoryRoot), result.sourceBinding.implementation, "V1_IMPLEMENTATION_MANIFEST", "V1 historical implementation manifest differs from its source binding.");
  verifyV1SemanticBoundary(result);

  return Object.freeze({
    ok: true,
    mode: "read-only-historical-v1-result",
    resultPath: V1_RESULT_PATH,
    resultSha256: V1_RESULT_SHA256,
    resultGitBlob: V1_RESULT_GIT_BLOB,
    resultCommit: V1_RESULT_COMMIT,
    annotatedTag: null,
    retrievalModulesLoaded: false,
    retrievalOrRankingCalls: 0,
    resultRewritten: false,
    comparativeRankingClaimAllowed: false,
    provenanceLimitations: [
      "The exploratory V1 result commit has no dedicated annotated result tag.",
      "V1 was not fixed before outcome or externally preregistered.",
      "V1 did not bind the runtime or direct continuation helper separately."
    ]
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  exact(process.argv.length === 2, "V1_CLI_ARGUMENT", "The historical V1 verifier accepts no arguments.");
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = await verifyContextEfficiencyV1Result({ repositoryRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
