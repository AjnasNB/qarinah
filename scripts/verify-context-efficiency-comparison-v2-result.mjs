import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export const RESULT_PATH = "bench/results/context-efficiency-comparison-0.1.6-v2.json";
export const RESULT_SHA256 = "sha256:a1dab5b0768c0f242262e5bbce9a7d613a3bfc5ebdf1cad0bfd65687366f9701";
export const RESULT_GIT_BLOB = "30a941d6d06145ceb5f9a6821a52ffc63c068252";
export const RESULT_COMMIT = "e5b74ef270e01564076e3434c884658cfba16870";
export const RESULT_TAG = "research-context-efficiency-result-v2-attempt-002";

const SOURCE_COMMIT = "6c22d8f293e1e99bbbee239abb36e219af2c96a9";
const CORRECTION_COMMIT = "f7fc5af1d44edb4539d52bde66eaa8b47977b616";
const FRAME_TEMPLATE_SHA256 = "sha256:9466fed249971e7c894e52faf80f3bd14bef335b0aa6a28ceafe5ca0d965a56a";
const PRIMARY_METHOD_IDS = ["qarinah-admission-first-v2", "admission-filtered-bm25"];
const RAW_BM25_ID = "raw-bm25-safety-negative-control";
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

const FREEZES = Object.freeze({
  protocol: Object.freeze({
    commit: "d7f2a09bed34507b3aec070f765d20b6a834d6d9",
    parent: "72202e568fabbc7f55b4589199377024506af8d8",
    tag: "research-context-efficiency-protocol-v2",
    message: "research: freeze context efficiency v2 protocol",
    files: [
      "bench/research/context-efficiency-comparison-v2-protocol.json",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-PROTOCOL.md"
    ],
    hashes: Object.freeze({
      "bench/research/context-efficiency-comparison-v2-protocol.json": "sha256:0dc108888faa583ccdce132b38e6543df00130ffc58c4dbdb07656cf88a4cfbd",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-PROTOCOL.md": "sha256:834a5954cacea05e0721f3ad49a044093b6636252f985ba82b76386b18a59616"
    })
  }),
  amendment001: Object.freeze({
    commit: "6fb29afd741480176cd5b7c582fb13437308d805",
    parent: SOURCE_COMMIT,
    tag: "research-context-efficiency-protocol-v2-amendment-001",
    message: "research: amend context efficiency v2 bindings",
    files: [
      "bench/research/context-efficiency-comparison-v2-amendment-001.json",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-AMENDMENT-001.md"
    ],
    hashes: Object.freeze({
      "bench/research/context-efficiency-comparison-v2-amendment-001.json": "sha256:33a8ae1755038c3d450507045bba8e2471482cb2ea61e77a6d6b5ae4848fa2aa",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-AMENDMENT-001.md": "sha256:b51e406f6b92aa19f8ef40dfd545b57eee7c6dbde374b659ed46930c6fa9f40d"
    })
  }),
  evaluator: Object.freeze({
    commit: "b160674d8bffa28c9169d262dcda65d32d238e80",
    parent: "6fb29afd741480176cd5b7c582fb13437308d805",
    tag: "research-context-efficiency-evaluator-v2",
    message: "research: implement frozen context efficiency v2 evaluator",
    files: [
      "package.json",
      "scripts/context-efficiency-v2-lib.mjs",
      "scripts/context-efficiency-v2-renderer.mjs",
      "scripts/evaluate-context-efficiency-comparison-v2.mjs",
      "test/context-efficiency-v2.test.js"
    ]
  }),
  armedAttempt001: Object.freeze({
    commit: "90d702d24b5fcedfa936ce6d38bd245aea3bddb8",
    parent: "b160674d8bffa28c9169d262dcda65d32d238e80",
    tag: "research-context-efficiency-evaluator-v2-armed",
    message: "research: arm context efficiency v2 evaluator",
    files: ["scripts/context-efficiency-v2-lib.mjs", "test/context-efficiency-v2.test.js"]
  }),
  amendment002: Object.freeze({
    commit: "b0e3ab2434cdbc9e8357e93a82b4da6cfeca7206",
    parent: "90d702d24b5fcedfa936ce6d38bd245aea3bddb8",
    tag: "research-context-efficiency-protocol-v2-amendment-002",
    message: "research: record v2 attempt 1 and amend preflight",
    files: [
      "bench/research/context-efficiency-comparison-v2-amendment-002.json",
      "bench/results/context-efficiency-comparison-0.1.6-v2-attempt-001-failure.json",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-AMENDMENT-002.md",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-ATTEMPT-001-FAILURE.md"
    ],
    hashes: Object.freeze({
      "bench/research/context-efficiency-comparison-v2-amendment-002.json": "sha256:bea45b82f934eb52f174ffb3c3a5f6c193fe0abaa5b61feb93d1313eb634f4b9",
      "bench/results/context-efficiency-comparison-0.1.6-v2-attempt-001-failure.json": "sha256:c55e99eb0f7c6fda2d81475ae3181a4c23232abbb7d79292a0210823d2e0048f",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-AMENDMENT-002.md": "sha256:72751dc76210bef2cc6bc42e278641c99a0aa450ec61eefe1217fbf20d0561ab",
      "docs/CONTEXT-EFFICIENCY-COMPARISON-v2-ATTEMPT-001-FAILURE.md": "sha256:5671cadd2e21e583a2a6901dd8d9b55f4551cb939b03bd7775d679db33973117"
    })
  }),
  correction: Object.freeze({
    commit: CORRECTION_COMMIT,
    parent: "b0e3ab2434cdbc9e8357e93a82b4da6cfeca7206",
    tag: "research-context-efficiency-evaluator-v2-correction-001",
    message: "research: correct context efficiency v2 preflight",
    files: [
      "scripts/context-efficiency-v2-lib.mjs",
      "scripts/context-efficiency-v2-renderer.mjs",
      "test/context-efficiency-v2.test.js"
    ]
  }),
  result: Object.freeze({
    commit: RESULT_COMMIT,
    parent: CORRECTION_COMMIT,
    tag: RESULT_TAG,
    message: "research: preserve context efficiency v2 attempt 2",
    files: [RESULT_PATH],
    hashes: Object.freeze({ [RESULT_PATH]: RESULT_SHA256 })
  })
});

export class V2PostResultVerificationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "V2PostResultVerificationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new V2PostResultVerificationError(code, message);
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

function exactKeys(value, expected, code) {
  exact(value !== null && typeof value === "object" && !Array.isArray(value), code, "Expected an object.");
  same(Object.keys(value), expected, code, "Object keys differ from the frozen result schema.");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function jsonSha256(value) {
  return sha256(JSON.stringify(value));
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/");
}

async function git(repositoryRoot, args, encoding = "utf8") {
  try {
    const result = await run("git", args, {
      cwd: repositoryRoot,
      encoding,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true
    });
    return result.stdout;
  } catch (error) {
    fail("GIT_BINDING", `git ${args[0]} failed: ${String(error?.stderr || error?.message || error).trim()}`);
  }
}

async function gitText(repositoryRoot, args) {
  return String(await git(repositoryRoot, args)).trim();
}

async function gitBytes(repositoryRoot, object) {
  return git(repositoryRoot, ["show", object], "buffer");
}

async function fileDigest(absolutePath) {
  return sha256(await readFile(absolutePath));
}

async function verifyFreeze(repositoryRoot, freeze) {
  exact(await gitText(repositoryRoot, ["cat-file", "-t", freeze.tag]) === "tag", "LINEAGE_TAG_TYPE", `${freeze.tag} is not annotated.`);
  exact(await gitText(repositoryRoot, ["rev-parse", `${freeze.tag}^{}`]) === freeze.commit, "LINEAGE_TAG_TARGET", `${freeze.tag} resolves to another commit.`);
  exact(await gitText(repositoryRoot, ["rev-parse", `${freeze.commit}^`]) === freeze.parent, "LINEAGE_PARENT", `${freeze.commit} has another parent.`);
  exact(await gitText(repositoryRoot, ["show", "-s", "--format=%s", freeze.commit]) === freeze.message, "LINEAGE_MESSAGE", `${freeze.commit} has another subject.`);
  const files = String(await git(repositoryRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", freeze.commit]))
    .split(/\r?\n/u).filter(Boolean).sort();
  same(files, [...freeze.files].sort(), "LINEAGE_SCOPE", `${freeze.commit} changed files outside the frozen scope.`);
  for (const [relativePath, digest] of Object.entries(freeze.hashes || {})) {
    const bytes = await gitBytes(repositoryRoot, `${freeze.commit}:${relativePath}`);
    exact(sha256(bytes) === digest, "LINEAGE_FILE_HASH", `${relativePath} differs at ${freeze.commit}.`);
    exact(await fileDigest(path.join(repositoryRoot, ...relativePath.split("/"))) === digest, "WORKING_FROZEN_FILE_HASH", `${relativePath} differs in the working tree.`);
  }
}

function parseTreeListing(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/u.exec(entry);
    exact(match !== null, "SOURCE_TREE_ENTRY", `Unsupported historical source entry: ${entry}`);
    exact(match[1] !== "120000", "SOURCE_TREE_LINK", `Historical source entry is linked: ${match[3]}`);
    return { mode: match[1], gitBlob: match[2], path: normalizedPath(match[3]) };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function listTree(repositoryRoot, commit, roots) {
  return parseTreeListing(await git(repositoryRoot, ["ls-tree", "-r", "-z", commit, "--", ...roots], "buffer"));
}

async function implementationManifestAtCommit(repositoryRoot, commit) {
  const entries = await listTree(repositoryRoot, commit, IMPLEMENTATION_ROOTS);
  const aggregate = createHash("sha256");
  aggregate.update("qarinah-continuation-implementation-lf-v1\0", "utf8");
  for (const entry of entries) {
    const contents = (await gitBytes(repositoryRoot, `${commit}:${entry.path}`)).toString("utf8").replace(/\r\n?/gu, "\n");
    aggregate.update(`${Buffer.byteLength(entry.path)}:${entry.path}\0${Buffer.byteLength(contents)}:`, "utf8");
    aggregate.update(contents, "utf8");
    aggregate.update("\0", "utf8");
  }
  return {
    algorithm: "sha256-path-lf-content-v1",
    fileCount: entries.length,
    digest: `sha256:${aggregate.digest("hex")}`
  };
}

async function productionManifestAtCommit(repositoryRoot, commit) {
  const entries = await listTree(repositoryRoot, commit, ["src"]);
  const files = [];
  const aggregate = createHash("sha256");
  aggregate.update("qarinah-v2-production-module-manifest\0", "utf8");
  for (const entry of entries) {
    const digest = sha256(await gitBytes(repositoryRoot, `${commit}:${entry.path}`));
    files.push({ path: entry.path, sha256: digest });
    aggregate.update(`${Buffer.byteLength(entry.path)}:${entry.path}\0${digest}\0`, "utf8");
  }
  return {
    algorithm: "sha256-path-and-file-sha256-v1",
    fileCount: files.length,
    digest: `sha256:${aggregate.digest("hex")}`,
    files,
    entries
  };
}

async function readFrozenJson(repositoryRoot, freeze, relativePath) {
  const bytes = await gitBytes(repositoryRoot, `${freeze.commit}:${relativePath}`);
  const expected = freeze.hashes?.[relativePath];
  if (expected) exact(sha256(bytes) === expected, "LINEAGE_JSON_HASH", `${relativePath} hash differs.`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("LINEAGE_JSON_PARSE", `${relativePath} is not valid JSON.`);
  }
}

async function verifyLineageAndSources(repositoryRoot, result) {
  for (const freeze of Object.values(FREEZES)) await verifyFreeze(repositoryRoot, freeze);
  try {
    await run("git", ["merge-base", "--is-ancestor", RESULT_COMMIT, "HEAD"], { cwd: repositoryRoot, windowsHide: true });
  } catch {
    fail("LINEAGE_HEAD", "HEAD is not descended from the committed attempt-2 result.");
  }

  exact(await gitText(repositoryRoot, ["rev-parse", `${RESULT_COMMIT}:${RESULT_PATH}`]) === RESULT_GIT_BLOB, "RESULT_GIT_BLOB", "Committed result Git blob differs.");
  const committedResult = await gitBytes(repositoryRoot, `${RESULT_COMMIT}:${RESULT_PATH}`);
  exact(sha256(committedResult) === RESULT_SHA256, "RESULT_COMMITTED_HASH", "Committed result bytes differ.");

  const protocolPath = FREEZES.protocol.files[0];
  const amendment001Path = FREEZES.amendment001.files[0];
  const amendment002Path = FREEZES.amendment002.files[0];
  const protocol = await readFrozenJson(repositoryRoot, FREEZES.protocol, protocolPath);
  const amendment001 = await readFrozenJson(repositoryRoot, FREEZES.amendment001, amendment001Path);
  const amendment002 = await readFrozenJson(repositoryRoot, FREEZES.amendment002, amendment002Path);

  exact(protocol.schemaVersion === "qarinah.context-efficiency-comparison-protocol.v2" && protocol.protocolVersion === "2.0.0", "PROTOCOL_BINDING", "Frozen base protocol identity differs.");
  exact(amendment001.amendmentId === "context-efficiency-comparison-v2-amendment-001", "AMENDMENT_001_BINDING", "Amendment 001 identity differs.");
  exact(amendment002.amendmentId === "context-efficiency-comparison-v2-amendment-002", "AMENDMENT_002_BINDING", "Amendment 002 identity differs.");
  exact(amendment001.sourceBinding.sourceCommit === SOURCE_COMMIT, "SOURCE_COMMIT", "Amendment 001 binds another source commit.");
  exact(await gitText(repositoryRoot, ["rev-parse", `${SOURCE_COMMIT}^{tree}`]) === amendment001.sourceBinding.sourceTree, "SOURCE_TREE", "Source tree differs from Amendment 001.");

  const sourceChangedFiles = String(await git(repositoryRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", SOURCE_COMMIT]))
    .split(/\r?\n/u).filter(Boolean).sort();
  same(sourceChangedFiles, [...amendment001.sourceBinding.changedFilesFromBaseProtocolCommit].sort(), "SOURCE_COMMIT_SCOPE", "Source helper commit scope differs.");

  const implementation = await implementationManifestAtCommit(repositoryRoot, SOURCE_COMMIT);
  same(implementation, amendment001.sourceBinding.productionImplementationManifest, "SOURCE_IMPLEMENTATION_MANIFEST", "Reconstructed implementation manifest differs from Amendment 001.");
  same(implementation, result.sourceBinding.implementation, "RESULT_IMPLEMENTATION_MANIFEST", "Result implementation manifest differs from the historical source.");

  const production = await productionManifestAtCommit(repositoryRoot, SOURCE_COMMIT);
  const productionResult = {
    algorithm: production.algorithm,
    fileCount: production.fileCount,
    digest: production.digest,
    files: production.files
  };
  same(productionResult, result.sourceBinding.productionModules, "RESULT_PRODUCTION_MODULES", "Result production-module manifest differs from the historical source.");
  same(
    productionResult,
    {
      algorithm: amendment001.sourceBinding.productionSourceTree.algorithm,
      fileCount: amendment001.sourceBinding.productionSourceTree.fileCount,
      digest: amendment001.sourceBinding.productionSourceTree.digest,
      files: amendment001.sourceBinding.productionSourceTree.files.map(({ path: relativePath, sha256: digest }) => ({ path: relativePath, sha256: digest }))
    },
    "AMENDMENT_PRODUCTION_MODULES",
    "Reconstructed production-module manifest differs from Amendment 001."
  );

  const sourceEntries = new Map(production.entries.map((entry) => [entry.path, entry]));
  const exactSourceBindings = [
    ...amendment001.sourceBinding.productionSourceTree.files,
    ...amendment001.sourceBinding.loadedProductionEntryPoints,
    ...amendment001.sourceBinding.reviewedHelperSlice,
    ...amendment001.sourceBinding.frozenSourceSupportFiles
  ];
  const seen = new Map();
  for (const binding of exactSourceBindings) {
    const prior = seen.get(binding.path);
    if (prior) same(binding, prior, "SOURCE_BINDING_DUPLICATE", `Conflicting source bindings exist for ${binding.path}.`);
    seen.set(binding.path, binding);
    const bytes = await gitBytes(repositoryRoot, `${SOURCE_COMMIT}:${binding.path}`);
    exact(sha256(bytes) === binding.sha256, "SOURCE_FILE_HASH", `Source hash differs for ${binding.path}.`);
    const blob = sourceEntries.get(binding.path)?.gitBlob || await gitText(repositoryRoot, ["rev-parse", `${SOURCE_COMMIT}:${binding.path}`]);
    exact(blob === binding.gitBlob, "SOURCE_FILE_BLOB", `Source Git blob differs for ${binding.path}.`);
  }
  same(amendment001.sourceBinding.loadedProductionEntryPoints.map((entry) => entry.path), ["src/contracts.js", "src/indexer.js", "src/retrieval.js"], "SOURCE_ENTRYPOINTS", "Frozen entrypoint list differs.");

  const expectedHelperPaths = [
    "scripts/evaluate-context-efficiency-comparison-v2.mjs",
    "scripts/context-efficiency-v2-lib.mjs",
    "scripts/context-efficiency-v2-renderer.mjs"
  ];
  same(result.sourceBinding.helpers.map((entry) => entry.path), expectedHelperPaths, "RESULT_HELPER_PATHS", "Result helper path list differs.");
  for (const helper of result.sourceBinding.helpers) {
    exact(sha256(await gitBytes(repositoryRoot, `${CORRECTION_COMMIT}:${helper.path}`)) === helper.sha256, "RESULT_HELPER_HASH", `Historical helper hash differs for ${helper.path}.`);
  }

  const expectedRuntime = {
    node: protocol.referenceRuntime.node,
    v8: protocol.referenceRuntime.v8,
    modulesAbi: protocol.referenceRuntime.modulesAbi,
    platform: protocol.referenceRuntime.platform,
    arch: protocol.referenceRuntime.arch,
    executablePathForAudit: normalizedPath(protocol.referenceRuntime.executablePathForAudit),
    executableSha256: protocol.referenceRuntime.executableSha256
  };
  same(result.sourceBinding.runtime, expectedRuntime, "RESULT_RUNTIME_BINDING", "Recorded result runtime differs from the frozen reference runtime.");
  same(result.sourceBinding.renderer.specification, protocol.commonRenderer, "RESULT_RENDERER_SPECIFICATION", "Recorded renderer specification differs from the frozen protocol.");
  exact(result.sourceBinding.renderer.implementation.path === "scripts/context-efficiency-v2-renderer.mjs", "RESULT_RENDERER_PATH", "Recorded renderer path differs.");
  exact(result.sourceBinding.renderer.implementation.sha256 === result.sourceBinding.helpers[2].sha256, "RESULT_RENDERER_HASH", "Recorded renderer hash differs from the historical helper.");

  return { protocol, amendment001, amendment002, committedResult };
}

function verifyPreflight(result, protocol, amendment002) {
  const preflight = result.preflight;
  exactKeys(preflight, [
    "schemaVersion", "completed", "neutralFrames", "safetyFrames", "totalFrames", "cases",
    "frameOrderSha256", "firstFrame", "lastFrame", "retrievalModulesLoadedDuringPreflight",
    "retrievalOrRankingCallsDuringPreflight", "resultConstructedDuringPreflight", "resultMaterializedDuringPreflight"
  ], "PREFLIGHT_SCHEMA");
  const matrix = amendment002.noRetrievalFramePreflight.matrix;
  exact(preflight.schemaVersion === "qarinah.context-efficiency-comparison-frame-preflight.v1", "PREFLIGHT_SCHEMA", "Preflight schema differs.");
  exact(preflight.completed === true, "PREFLIGHT_INCOMPLETE", "Preflight is not complete.");
  exact(preflight.neutralFrames === matrix.neutralFrameCount && preflight.safetyFrames === matrix.safetyFrameCount && preflight.totalFrames === matrix.totalRequiredPreflightFrames, "PREFLIGHT_COUNTS", "Preflight counts differ from Amendment 002.");
  exact(preflight.neutralFrames === 1452 && preflight.safetyFrames === 24 && preflight.totalFrames === 1476, "PREFLIGHT_COUNTS", "Preflight does not preserve the frozen 1,476-frame matrix.");
  exact(preflight.retrievalModulesLoadedDuringPreflight === false && preflight.retrievalOrRankingCallsDuringPreflight === 0, "PREFLIGHT_RETRIEVAL", "Preflight records retrieval loading or calls.");
  exact(preflight.resultConstructedDuringPreflight === false && preflight.resultMaterializedDuringPreflight === false, "PREFLIGHT_RESULT", "Preflight records a result construction or write.");

  const neutralIds = protocol.neutralStratum.cases.map((entry) => entry.id);
  const safetyIds = protocol.safetyStratum.cases.map((entry) => entry.id);
  same(preflight.cases.map((entry) => entry.caseId), [...neutralIds, ...safetyIds], "PREFLIGHT_CASE_ORDER", "Preflight case order differs from the frozen protocol.");
  let ordinal = 1;
  for (const [index, entry] of preflight.cases.entries()) {
    const neutral = index < neutralIds.length;
    const expectedEvents = neutral ? matrix.neutralEvents : matrix.safetyEventsByCase[index - neutralIds.length];
    exact(entry.stratum === (neutral ? "neutral" : "safety"), "PREFLIGHT_STRATUM", `Preflight stratum differs for ${entry.caseId}.`);
    exact(entry.eventCount === expectedEvents && entry.frameCount === expectedEvents + 2, "PREFLIGHT_CASE_COUNT", `Preflight frame count differs for ${entry.caseId}.`);
    exact(entry.firstOrdinal === ordinal && entry.lastOrdinal === ordinal + entry.frameCount - 1, "PREFLIGHT_ORDINAL", `Preflight ordinals differ for ${entry.caseId}.`);
    ordinal = entry.lastOrdinal + 1;
  }
  exact(ordinal === 1477, "PREFLIGHT_ORDINAL", "Preflight ordinals do not cover exactly 1,476 frames.");
  exact(preflight.frameOrderSha256 === "sha256:a607d9e71552573097fc8ca64c011394c1606b22ae2f73b245bffa1b2b4e9064", "PREFLIGHT_ORDER_HASH", "Preflight order digest differs.");
  exact(preflight.firstFrame.ordinal === 1 && preflight.firstFrame.caseId === neutralIds[0] && preflight.firstFrame.variant === "empty", "PREFLIGHT_BOUNDARY", "First preflight frame differs.");
  exact(preflight.lastFrame.ordinal === 1476 && preflight.lastFrame.caseId === safetyIds.at(-1) && preflight.lastFrame.variant === "full-ledger", "PREFLIGHT_BOUNDARY", "Last preflight frame differs.");
}

function verifyNeutral(result, protocol) {
  const neutral = result.neutral;
  exact(neutral.fixtureCases === 6 && neutral.ledgerEvents === 240, "NEUTRAL_FIXTURE", "Neutral fixture counts differ.");
  exact(neutral.fixedK === 4 && neutral.maximumRank === 32 && neutral.nonTruncatingTokenCeiling === 10_000, "NEUTRAL_LIMITS", "Neutral limits differ.");
  const caseIds = protocol.neutralStratum.cases.map((entry) => entry.id);
  same(neutral.cases.map((entry) => entry.id), caseIds, "NEUTRAL_CASE_ORDER", "Neutral case order differs from the frozen protocol.");

  let fullHistoryTokens = 0;
  const reconstructed = new Map(PRIMARY_METHOD_IDS.map((id) => [id, { fixedExact: 0, eligible: 0 }]));
  for (const caseResult of neutral.cases) {
    exact(caseResult.fullHistoryReference.eventCount === 240 && caseResult.fullHistoryReference.capped === false && caseResult.fullHistoryReference.rankedMethod === false, "FULL_HISTORY_REFERENCE", `Full-history role differs for ${caseResult.id}.`);
    exact(caseResult.fullHistoryReference.modelFacingEstimatedTokens === Math.ceil(caseResult.fullHistoryReference.modelFacingCharacters / 4), "TOKEN_ESTIMATOR", `Full-history token estimate differs for ${caseResult.id}.`);
    fullHistoryTokens += caseResult.fullHistoryReference.modelFacingEstimatedTokens;

    const admission = caseResult.policyAdmission;
    exact(admission.qarinahAndBm25SetsEqual === true, "ADMISSION_SET_EQUALITY", `Admission set equality failed for ${caseResult.id}.`);
    exact(new Set(admission.eligibleEventIds).size === admission.eligibleEventIds.length, "ADMISSION_DUPLICATE", `Eligible set contains duplicates for ${caseResult.id}.`);
    exact(new Set(admission.excludedEventIds).size === admission.excludedEventIds.length, "ADMISSION_DUPLICATE", `Excluded set contains duplicates for ${caseResult.id}.`);
    same([...admission.eligibleEventIds].sort(), [...admission.qarinahReportedEligibleEventIds].sort(), "ADMISSION_QARINAH_SET", `Qarinah eligible set differs for ${caseResult.id}.`);
    same([...admission.eligibleEventIds].sort(), [...admission.bm25ReportedEligibleEventIds].sort(), "ADMISSION_BM25_SET", `BM25 eligible set differs for ${caseResult.id}.`);
    same([...admission.excludedEventIds].sort(), [...admission.qarinahReportedExcludedEventIds].sort(), "ADMISSION_QARINAH_SET", `Qarinah excluded set differs for ${caseResult.id}.`);
    same([...admission.excludedEventIds].sort(), [...admission.bm25ReportedExcludedEventIds].sort(), "ADMISSION_BM25_SET", `BM25 excluded set differs for ${caseResult.id}.`);
    exact(admission.setSha256 === jsonSha256(admission.eligibleEventIds), "ADMISSION_SET_HASH", `Admission-set digest differs for ${caseResult.id}.`);

    same(caseResult.methods.map((entry) => entry.id), PRIMARY_METHOD_IDS, "NEUTRAL_METHOD_ORDER", `Primary method order differs for ${caseResult.id}.`);
    for (const method of caseResult.methods) {
      exact(method.orderedEventIds.length <= 32, "METHOD_OUTPUT_LIMIT", `${method.id} exceeds rank 32 for ${caseResult.id}.`);
      exact(method.fixedK.k === 4 && method.fixedK.tokenRankingAllowed === false, "FIXED_K_ROLE", `Fixed-k role differs for ${caseResult.id}/${method.id}.`);
      same(method.fixedK.eventIds, method.orderedEventIds.slice(0, 4), "FIXED_K_PREFIX", `Fixed-k IDs are not the rank prefix for ${caseResult.id}/${method.id}.`);
      if (method.fixedK.exactRequiredSet) reconstructed.get(method.id).fixedExact += 1;

      const prefix = method.primaryPrefix;
      exact(prefix.methodId === method.id && prefix.maximumRank === 32, "PRIMARY_PREFIX_BINDING", `Prefix binding differs for ${caseResult.id}/${method.id}.`);
      exact(prefix.inputBinding.querySha256 === caseResult.querySha256 && prefix.inputBinding.currentSourceTextSha256 === caseResult.currentSourceTextSha256 && prefix.inputBinding.rendererFrameTemplateSha256 === FRAME_TEMPLATE_SHA256, "PRIMARY_PREFIX_INPUT", `Prefix input binding differs for ${caseResult.id}/${method.id}.`);
      exact(prefix.oracleUsedForAdmissionRankingStoppingOrSelection === false && prefix.completeItemsPreserved === true, "PRIMARY_PREFIX_BOUNDARY", `Prefix selection boundary differs for ${caseResult.id}/${method.id}.`);
      if (prefix.eligible) {
        reconstructed.get(method.id).eligible += 1;
        exact(prefix.reason === null && prefix.exactEvidenceGate === true && prefix.nonTruncatingCeilingPass === true, "PRIMARY_PREFIX_ELIGIBLE", `Eligible prefix gate differs for ${caseResult.id}/${method.id}.`);
        exact(prefix.requiredRanks.every((rank) => rank > 0 && rank <= 32), "PRIMARY_PREFIX_RANKS", `Eligible prefix rank differs for ${caseResult.id}/${method.id}.`);
        exact(prefix.lowestRequiredRank === Math.max(...prefix.requiredRanks), "PRIMARY_PREFIX_RANKS", `Lowest required rank differs for ${caseResult.id}/${method.id}.`);
        same(prefix.eventIds, method.orderedEventIds.slice(0, prefix.lowestRequiredRank), "PRIMARY_PREFIX_EVENTS", `Evidence-complete prefix differs for ${caseResult.id}/${method.id}.`);
        exact(prefix.modelFacingEstimatedTokens === Math.ceil(prefix.modelFacingCharacters / 4) && prefix.modelFacingEstimatedTokens <= 10_000, "TOKEN_ESTIMATOR", `Prefix token estimate differs for ${caseResult.id}/${method.id}.`);
      } else {
        exact(prefix.reason === "required evidence missing by rank 32" && prefix.requiredRanks.includes(0), "PRIMARY_PREFIX_INELIGIBLE", `Ineligible prefix reason differs for ${caseResult.id}/${method.id}.`);
        same([prefix.lowestRequiredRank, prefix.modelFacingCharacters, prefix.modelFacingEstimatedTokens, prefix.frameSha256, prefix.nonTruncatingCeilingPass], [null, null, null, null, null], "PRIMARY_PREFIX_INELIGIBLE", `Ineligible prefix contains a token result for ${caseResult.id}/${method.id}.`);
        same(prefix.eventIds, [], "PRIMARY_PREFIX_INELIGIBLE", `Ineligible prefix contains events for ${caseResult.id}/${method.id}.`);
      }
    }
  }

  const primary = neutral.primary;
  same(primary.methods.map((entry) => entry.id), PRIMARY_METHOD_IDS, "PRIMARY_AGGREGATE_METHODS", "Primary aggregate method order differs.");
  for (const method of primary.methods) {
    const counts = reconstructed.get(method.id);
    exact(method.fixedKExactCases === counts.fixedExact && method.primaryEligibleCases === counts.eligible, "PRIMARY_AGGREGATE_COUNTS", `Primary counts differ for ${method.id}.`);
    exact(method.fixedKTokenRankingAllowed === false && method.allPrimaryCasesEligible === false, "PRIMARY_AGGREGATE_ELIGIBILITY", `Primary eligibility differs for ${method.id}.`);
    exact(method.fullHistoryReferenceEstimatedTokens === fullHistoryTokens, "PRIMARY_FULL_HISTORY_TOTAL", `Full-history total differs for ${method.id}.`);
    same([method.totalEvidenceCompletePrefixEstimatedTokens, method.estimatedReductionVersusFullHistory], [null, null], "PRIMARY_NO_RESULT", `A primary token result was emitted for ${method.id}.`);
  }
  exact(primary.bothMethodsPrimaryEligible === false && primary.decision === "no primary comparative context-efficiency result" && primary.winner === null && primary.tie === false && primary.fallbackRankingUsed === false, "PRIMARY_DECISION", "Primary no-result decision differs.");
  same(primary.pairedPerCase.map((entry) => entry.caseId), caseIds, "PRIMARY_PAIRED_ORDER", "Paired case order differs.");
  for (const [index, pair] of primary.pairedPerCase.entries()) {
    const methods = neutral.cases[index].methods;
    const left = methods[0].primaryPrefix.modelFacingEstimatedTokens;
    const right = methods[1].primaryPrefix.modelFacingEstimatedTokens;
    exact(pair.qarinahEstimatedTokens === left && pair.admissionFilteredBm25EstimatedTokens === right, "PRIMARY_PAIRED_VALUE", `Paired tokens differ for ${pair.caseId}.`);
    exact(pair.qarinahMinusBm25EstimatedTokens === (left === null || right === null ? null : left - right), "PRIMARY_PAIRED_VALUE", `Paired difference differs for ${pair.caseId}.`);
  }
}

function verifySafetyAndMutations(result, protocol) {
  const safetyIds = protocol.safetyStratum.cases.map((entry) => entry.id);
  exact(result.safety.fixtureCases === 4 && result.safety.fixedK === 1, "SAFETY_FIXTURE", "Safety fixture counts differ.");
  same(result.safety.cases.map((entry) => entry.id), safetyIds, "SAFETY_CASE_ORDER", "Safety case order differs.");
  let rawForbidden = 0;
  let conflictAudits = 0;
  for (const safetyCase of result.safety.cases) {
    exact(safetyCase.qarinahAndBm25SetsEqual === true, "SAFETY_ADMISSION_SET", `Safety admission sets differ for ${safetyCase.id}.`);
    exact(safetyCase.policyEligibleSetSha256 === jsonSha256(safetyCase.policyEligibleEventIds), "SAFETY_ADMISSION_HASH", `Safety admission digest differs for ${safetyCase.id}.`);
    same(safetyCase.methods.map((entry) => entry.id), [...PRIMARY_METHOD_IDS, RAW_BM25_ID], "SAFETY_METHOD_ORDER", `Safety method order differs for ${safetyCase.id}.`);
    for (const method of safetyCase.methods.slice(0, 2)) {
      exact(method.requiredGatePass === true && method.forbiddenInclusions.length === 0 && method.exactEvidenceErrors.length === 0, "SAFETY_PRIMARY_GATE", `${method.id} failed a frozen safety gate for ${safetyCase.id}.`);
    }
    const raw = safetyCase.methods[2];
    exact(raw.requiredGatePass === false, "SAFETY_NEGATIVE_CONTROL", `Raw BM25 unexpectedly passed ${safetyCase.id}.`);
    rawForbidden += raw.forbiddenInclusions.length;
    if (safetyCase.conflictAudit !== null) {
      conflictAudits += 1;
      exact(safetyCase.conflictAudit.pass === true && safetyCase.conflictAudit.claimGoverningCurrentEvidence === false && safetyCase.conflictAudit.excludedFromModelFacingTokenAccounting === true, "SAFETY_CONFLICT_AUDIT", "Conflict audit differs from the frozen safety boundary.");
    }
  }
  exact(conflictAudits === 1 && rawForbidden === 26, "SAFETY_AGGREGATE", "Safety conflict or negative-control count differs.");
  const aggregates = new Map(result.safety.aggregate.methods.map((entry) => [entry.id, entry]));
  exact(aggregates.get(PRIMARY_METHOD_IDS[0])?.requiredGatesPassed === 4 && aggregates.get(PRIMARY_METHOD_IDS[0])?.forbiddenInclusions === 0, "SAFETY_AGGREGATE", "Qarinah safety aggregate differs.");
  exact(aggregates.get(PRIMARY_METHOD_IDS[1])?.requiredGatesPassed === 4 && aggregates.get(PRIMARY_METHOD_IDS[1])?.forbiddenInclusions === 0, "SAFETY_AGGREGATE", "Admission-filtered BM25 safety aggregate differs.");
  exact(aggregates.get(RAW_BM25_ID)?.requiredGatesPassed === 0 && aggregates.get(RAW_BM25_ID)?.forbiddenInclusions === 26, "SAFETY_AGGREGATE", "Raw BM25 safety aggregate differs.");
  exact(result.safety.aggregate.qarinahRequiredItemsPass === true && result.safety.aggregate.qarinahZeroForbiddenInclusions === true && result.safety.aggregate.qarinahConflictAuditPass === true && result.safety.aggregate.qarinahClaimSafetyGatePass === true && result.safety.aggregate.rawBm25ExcludedFromPrimaryEfficiencyComparison === true, "SAFETY_AGGREGATE", "Safety claim gate differs.");

  const negative = result.negativeTests;
  exact(negative.required === 24 && negative.passed === 24 && negative.outcomes.length === 24, "MUTATION_COUNT", "Mutation count differs.");
  same(negative.outcomes.map((entry) => entry.id), protocol.negativeTests, "MUTATION_ORDER", "Mutation order differs from the frozen protocol.");
  exact(negative.outcomes.every((entry) => entry.pass === true && Number.isInteger(entry.probes) && entry.probes > 0), "MUTATION_OUTCOME", "A frozen mutation did not pass.");
}

export function verifyResultInvariants(result, { protocol, amendment002 }) {
  exactKeys(result, [
    "schemaVersion", "packageVersion", "classification", "executionAuthorization", "protocol",
    "attemptProvenance", "sourceBinding", "preflight", "estimator", "neutral", "safety",
    "negativeTests", "decision", "measurementBoundary"
  ], "RESULT_SCHEMA");
  exact(result.schemaVersion === "qarinah.context-efficiency-comparison-result.v2" && result.packageVersion === "0.1.6", "RESULT_IDENTITY", "Result identity differs.");
  exact(result.classification === "development fixture comparison; not externally preregistered or provider-backed", "RESULT_CLASSIFICATION", "Result classification differs.");

  const expectedProtocol = {
    version: "2.0.0",
    commit: FREEZES.protocol.commit,
    tag: FREEZES.protocol.tag,
    manifestSha256: FREEZES.protocol.hashes[FREEZES.protocol.files[0]],
    documentSha256: FREEZES.protocol.hashes[FREEZES.protocol.files[1]],
    amendment001Commit: FREEZES.amendment001.commit,
    amendment001Tag: FREEZES.amendment001.tag,
    amendment001ManifestSha256: FREEZES.amendment001.hashes[FREEZES.amendment001.files[0]],
    amendment001DocumentSha256: FREEZES.amendment001.hashes[FREEZES.amendment001.files[1]],
    amendment002Commit: FREEZES.amendment002.commit,
    amendment002Tag: FREEZES.amendment002.tag,
    amendment002ManifestSha256: FREEZES.amendment002.hashes[FREEZES.amendment002.files[0]],
    amendment002DocumentSha256: FREEZES.amendment002.hashes[FREEZES.amendment002.files[2]],
    fixedBeforeV2Outcome: true,
    externallyPreregistered: false
  };
  same(result.protocol, expectedProtocol, "RESULT_PROTOCOL", "Result protocol lineage differs.");

  const authorization = result.executionAuthorization;
  exact(authorization.currentHead === CORRECTION_COMMIT && authorization.parentCommit === FREEZES.amendment002.commit && authorization.directChildOfAmendment002 === true, "RESULT_EXECUTION_LINEAGE", "Execution authorization lineage differs.");
  same([...authorization.changedFiles].sort(), [...FREEZES.correction.files].sort(), "RESULT_EXECUTION_SCOPE", "Execution authorization scope differs.");
  same([...authorization.requiredChangedFiles].sort(), [...FREEZES.correction.files].sort(), "RESULT_EXECUTION_SCOPE", "Required execution scope differs.");
  exact(authorization.worktreeClean === true && authorization.exactArmingScope === true && authorization.exactArmingMessage === true && authorization.correctionTagAnnotated === true && authorization.correctionTagMatchesHead === true && authorization.executionReady === true, "RESULT_EXECUTION_AUTHORIZATION", "Attempt-2 execution was not recorded as fully authorized.");
  exact(authorization.correctionAttemptNumber === 2 && authorization.correctionAttemptLabel === "correction-run-attempt-2", "RESULT_ATTEMPT", "Correction attempt identity differs.");

  const attempts = result.attemptProvenance;
  exact(attempts.correctionAttempt.number === 2 && attempts.correctionAttempt.label === "correction-run-attempt-2" && attempts.correctionAttempt.correctionCommit === CORRECTION_COMMIT && attempts.correctionAttempt.correctionTag === FREEZES.correction.tag && attempts.correctionAttempt.exactCommand === "npm run evaluate:context-efficiency-comparison:v2:write", "RESULT_ATTEMPT", "Correction attempt provenance differs.");
  const attempt001 = attempts.attempt001;
  exact(attempt001.number === 1 && attempt001.status === "failed-closed-before-result" && attempt001.armedCommit === FREEZES.armedAttempt001.commit && attempt001.armedTag === FREEZES.armedAttempt001.tag, "RESULT_ATTEMPT_001", "Attempt-1 identity differs.");
  exact(attempt001.retrievalMethodsExecuted === true && attempt001.neutralCaseObservationsComputedInMemory === true && attempt001.aggregateComputed === false && attempt001.winnerComputed === false && attempt001.resultObjectConstructed === false && attempt001.resultEmitted === false && attempt001.resultMaterialized === false && attempt001.operatorVisibleComparativeMetricProduced === false && attempt001.internalObservationsReusedInAttempt2Metrics === false, "RESULT_ATTEMPT_001", "Attempt-1 failure boundary differs.");
  exact(attempt001.receiptSha256 === FREEZES.amendment002.hashes[FREEZES.amendment002.files[1]] && attempt001.reportSha256 === FREEZES.amendment002.hashes[FREEZES.amendment002.files[3]], "RESULT_ATTEMPT_001", "Attempt-1 evidence hash differs.");

  exact(result.sourceBinding.sourceCommit === SOURCE_COMMIT && result.sourceBinding.actualMaterializedCommit === SOURCE_COMMIT, "RESULT_SOURCE_COMMIT", "Result source materialization differs.");
  same(result.estimator, protocol.tokenAccounting.estimator, "RESULT_ESTIMATOR", "Result estimator differs from the frozen protocol.");
  verifyPreflight(result, protocol, amendment002);
  verifyNeutral(result, protocol);
  verifySafetyAndMutations(result, protocol);

  same(result.decision, {
    primaryComparison: "no primary comparative context-efficiency result",
    winner: null,
    qarinahWinnerClaimAllowed: false,
    allowedWinnerWording: null,
    rawBm25Role: "safety negative control only",
    fixedKRole: "utility diagnostic only; never a token ranking"
  }, "RESULT_DECISION", "Result claim decision differs.");
  same(result.measurementBoundary, {
    providerReportedInputTokensMeasured: false,
    providerTokenizerMeasured: false,
    costMeasured: false,
    taskSuccessMeasured: false,
    qualityMeasured: false,
    latencyMeasured: false,
    universalOrIndustryClaimAllowed: false,
    estimator: "ceil(UTF-16 JavaScript string length / 4)"
  }, "RESULT_MEASUREMENT_BOUNDARY", "Result measurement boundary differs.");
  return true;
}

export async function verifyContextEfficiencyV2Result({ repositoryRoot, resultPath = path.join(repositoryRoot, ...RESULT_PATH.split("/")) }) {
  const raw = await readFile(resultPath);
  exact(sha256(raw) === RESULT_SHA256, "RESULT_ARTIFACT_HASH", "Context-efficiency v2 result bytes differ from the committed attempt-2 artifact.");
  let result;
  try {
    result = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("RESULT_ARTIFACT_JSON", "Context-efficiency v2 result is not valid JSON.");
  }
  exact(raw.equals(Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8")), "RESULT_ARTIFACT_CANONICAL", "Context-efficiency v2 result is not canonical LF JSON.");

  const context = await verifyLineageAndSources(repositoryRoot, result);
  exact(raw.equals(context.committedResult), "RESULT_ARTIFACT_COMMIT", "Checked result bytes differ from the tagged result commit.");
  verifyResultInvariants(result, context);
  return Object.freeze({
    ok: true,
    mode: "read-only-post-result",
    resultPath: RESULT_PATH,
    resultSha256: RESULT_SHA256,
    resultGitBlob: RESULT_GIT_BLOB,
    resultCommit: RESULT_COMMIT,
    resultTag: RESULT_TAG,
    retrievalModulesLoaded: false,
    retrievalOrRankingCalls: 0,
    resultRewritten: false,
    decision: result.decision.primaryComparison,
    winner: result.decision.winner,
    qarinahWinnerClaimAllowed: result.decision.qarinahWinnerClaimAllowed
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  exact(process.argv.length === 2, "CLI_ARGUMENT", "The post-result verifier accepts no arguments.");
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = await verifyContextEfficiencyV2Result({ repositoryRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
