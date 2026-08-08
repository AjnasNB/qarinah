import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FAILURE_NAME_PATTERN = /^research-retrieval-development-v0\.5-[a-z0-9][a-z0-9._-]{0,63}-failure\.json$/u;

export const V05_RESULT_PATH = "bench/results/research-retrieval-development-v0.5.json";
export const V05_RESULT_SHA256 = "sha256:38a753e82e1f9e8e0337dca3f764c941a4cf78748c09a7b8341ae08cf7494a94";
export const V05_RESULT_GIT_BLOB = "954aea74120943a3a41e174b969b05a6120b6bf9";
export const V05_RESULT_COMMIT = "4dba5b667a8c3a135c4574fcfefe12502f792a32";
export const V05_RESULT_TAG = "research-retrieval-development-v0.5-result";
export const V05_EXPECTED_CANONICAL_BYTES = 3_110_007;
export const V05_EXPECTED_CANONICAL_SHA256 = "sha256:12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c";

const FROZEN = Object.freeze({
  protocol: Object.freeze({
    commit: "7c50a69bf587159b350da19954a2469a3a089ad5",
    parent: "15b66f65e75b7461dd62cf93b6b2e0bd232b969e",
    tag: "research-retrieval-development-v0.5-protocol",
    message: "research: freeze retrieval development v0.5 protocol",
    changes: Object.freeze([
      "A\tbench/research/research-retrieval-development-v0.5-amendment.json",
      "A\tdocs/RESEARCH-DEVELOPMENT-PROTOCOL-v0.5.md"
    ]),
    manifest: Object.freeze({
      path: "bench/research/research-retrieval-development-v0.5-amendment.json",
      sha256: "sha256:608a15bc48a80bd281ab593157bd9e0371ce867f77b79c32aa8ef0370e6f7a11"
    }),
    document: Object.freeze({
      path: "docs/RESEARCH-DEVELOPMENT-PROTOCOL-v0.5.md",
      sha256: "sha256:a761f92886dcc93d01bc84b0096b6594125037e0210ad912dff5af954651a3e7"
    })
  }),
  evaluator: Object.freeze({
    commit: "7203035684abd1af691fbef1e3ba7c1708dfd9f7",
    parent: "7c50a69bf587159b350da19954a2469a3a089ad5",
    tag: "research-retrieval-development-v0.5-evaluator",
    message: "research: implement retrieval development v0.5 evaluator",
    changes: Object.freeze([
      "M\tpackage.json",
      "A\tscripts/evaluate-research-retrieval-v0.5.mjs",
      "A\ttest/research-retrieval-v0.5.test.js"
    ]),
    evaluator: Object.freeze({
      path: "scripts/evaluate-research-retrieval-v0.5.mjs",
      sha256: "sha256:90d1de79e20f8afffeba0b5e765e438eea35e27d12de29229b50a22fac877d9a"
    }),
    package: Object.freeze({
      path: "package.json",
      sha256: "sha256:16f0607fc5e923e855d7e4ede07faa1456b556cd1a5824a1966a63f6055b064e"
    }),
    types: Object.freeze({
      path: "types/index.d.ts",
      sha256: "sha256:7ea52a360792b870baaae5b08d7da6c15a6a4cd5cf7587acedbd731e0dd0c811"
    })
  }),
  authorization: Object.freeze({
    commit: "4dd0f16c814dfbc528a5b361201c38a3a48f36f3",
    parent: "7203035684abd1af691fbef1e3ba7c1708dfd9f7",
    tag: "research-retrieval-development-v0.5-authorization",
    message: "research: authorize retrieval development v0.5 attempt 1",
    changes: Object.freeze([
      "A\tbench/research/research-retrieval-development-v0.5-authorization.json"
    ]),
    receipt: Object.freeze({
      path: "bench/research/research-retrieval-development-v0.5-authorization.json",
      sha256: "sha256:9f1d331efc0ac2dc3adb507ebe0ce3f00146987bc766f70f51de8981b20c428c"
    })
  }),
  result: Object.freeze({
    commit: V05_RESULT_COMMIT,
    parent: "4dd0f16c814dfbc528a5b361201c38a3a48f36f3",
    tag: V05_RESULT_TAG,
    message: "research: preserve retrieval development v0.5 result",
    changes: Object.freeze([`A\t${V05_RESULT_PATH}`])
  }),
  reference: Object.freeze({
    commit: "31a0c38be6e2f506e669e57dc30607a9f87dcc5b",
    tag: "research-retrieval-development-v0.4",
    artifactPath: "bench/results/research-retrieval-development-v0.4.json",
    artifactSha256: "sha256:607359a947e7a849512d3fcb588bc88c2b34e1289f15b735a2de0c3895a21a18",
    expectedAlgorithm: "sha256-utf8-json-stringify-preserved-insertion-order-v1",
    expectedBytes: V05_EXPECTED_CANONICAL_BYTES,
    expectedSha256: V05_EXPECTED_CANONICAL_SHA256
  })
});

const SOURCE_BINDING = Object.freeze({
  productImplementationOriginCommit: "6c22d8f293e1e99bbbee239abb36e219af2c96a9",
  algorithm: "sha256-utf8-after-crlf-to-lf-normalization-v1",
  files: Object.freeze([
    Object.freeze({ path: "src/index.js", sha256: "sha256:66a69c1b2143fb559ff5c67dfd3e41031a48a5c46ca49631ac1f996ea6cf7fa7" }),
    Object.freeze({ path: "src/retrieval.js", sha256: "sha256:729991b59ea5a0b073c6cdd93fef15c622c819c7f46947b1167f44d598b3a68a" }),
    Object.freeze({ path: "src/canonical.js", sha256: "sha256:c24859c69ff8571128107c7de6718fc02aad9cb64f807f174d23bf8b12293225" }),
    Object.freeze({ path: "src/contracts.js", sha256: "sha256:d74d0487fad186901c7aa1a8c8530c0920fe3908c611ce85ec17c6336d575650" }),
    Object.freeze({ path: "src/indexer.js", sha256: "sha256:868c6e433dc858cd665c3c844bb72449e102bf1bc288f1c9daf41ecf4986ff4b" }),
    Object.freeze({ path: "src/interoperability/boundary.js", sha256: "sha256:80798113257019fa38573acf262ed69b8f1b2b887ceb8ce37f53951c2f1d3118" }),
    Object.freeze({ path: "src/redact.js", sha256: "sha256:6198154b1d4a37adfea308f8b2723c89788ab8046ca587210e278952ca4454b4" })
  ])
});

const RAW_SOURCE = Object.freeze({
  path: "data/test-00000-of-00001.parquet",
  url: "https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet",
  bytes: 1_119_540,
  sha256: "sha256:7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4"
});

const CORPUS_BINDING = Object.freeze({
  classification: "inspected-development-corpus",
  dataset: "princeton-nlp/SWE-bench_Lite",
  corpus: Object.freeze({
    path: "bench/research/swe-bench-lite-development-v0.2.json",
    fileSha256: "sha256:d30f94bba88f72db737340f05a9d3ad3c739c46f84307abc8802a78ca4de0482",
    logicalContentDigest: "sha256:01b35115ac639c1fcd3779561f83d5bb21988eb74ee5e93798c5d7579d757863"
  }),
  loader: Object.freeze({
    path: "bench/research/swe-bench-lite.mjs",
    sha256: "sha256:3b92352951a07854786b1a74ee5d2e6e5cbe1247b7c39d2f1135593cfed431dc"
  }),
  rawSourceArtifact: RAW_SOURCE,
  rawSourceVerification: Object.freeze({
    requestedUrl: RAW_SOURCE.url,
    redirected: true,
    bytes: RAW_SOURCE.bytes,
    sha256: RAW_SOURCE.sha256,
    retainedOnDisk: false
  })
});

const GLOBAL_API_DIFFERENCE_BOUNDARY = Object.freeze({
  currentAdditions: Object.freeze([
    "rankContextEvents returns additive admission and currentState audit fields",
    "src/index.js exports resolveContextAdmission and resolveCurrentContextState"
  ]),
  projectionRule: "Additive audit fields and helpers are excluded from the v0.4-compatible expected projection.",
  repositoryDifference: "Absent or undefined repository metadata now fails closed under a non-empty repository filter; this bound corpus has validated repository metadata.",
  invalidInputDifference: "Invalid-input error precedence can differ; benchmark inputs are valid.",
  claimLimit: "Exact projected equality on this inspected development corpus does not establish universal or global behavior equivalence."
});

const EXECUTION_SCOPE = Object.freeze({
  providerModelCalls: 0,
  providerReportedTokens: false,
  sweBenchDockerTaskExecution: false,
  humanRelevanceReview: false,
  humanCodeReview: false,
  taskPatchGeneration: false,
  latencyStudy: false,
  costStudy: false
});

const PROTOCOL_BINDING = Object.freeze({
  protocol: Object.freeze({
    commit: FROZEN.protocol.commit,
    tag: FROZEN.protocol.tag,
    manifestSha256: FROZEN.protocol.manifest.sha256,
    documentSha256: FROZEN.protocol.document.sha256
  }),
  immutableV04Reference: Object.freeze({
    commit: FROZEN.reference.commit,
    tag: FROZEN.reference.tag,
    artifactPath: FROZEN.reference.artifactPath,
    artifactSha256: FROZEN.reference.artifactSha256,
    expectedCanonicalAlgorithm: FROZEN.reference.expectedAlgorithm,
    expectedCanonicalByteLength: FROZEN.reference.expectedBytes,
    expectedCanonicalSha256: FROZEN.reference.expectedSha256
  }),
  evaluator: Object.freeze({
    path: FROZEN.evaluator.evaluator.path,
    commit: FROZEN.evaluator.commit,
    tag: FROZEN.evaluator.tag,
    sha256: FROZEN.evaluator.evaluator.sha256
  }),
  package: Object.freeze({
    path: FROZEN.evaluator.package.path,
    commit: FROZEN.evaluator.commit,
    sha256: FROZEN.evaluator.package.sha256
  }),
  types: Object.freeze({
    path: FROZEN.evaluator.types.path,
    commit: FROZEN.evaluator.commit,
    sha256: FROZEN.evaluator.types.sha256
  }),
  authorizationReceipt: Object.freeze({
    path: FROZEN.authorization.receipt.path,
    commit: FROZEN.authorization.commit,
    sha256: FROZEN.authorization.receipt.sha256,
    attemptId: "v05-attempt-001"
  })
});

const EXPECTED_AUTHORIZATION = Object.freeze({
  schemaVersion: "qarinah.research-retrieval-development-authorization.v1",
  attemptId: "v05-attempt-001",
  authorizedCommand: "node scripts/evaluate-research-retrieval-v0.5.mjs --execute --write",
  explicitlyAuthorized: true,
  resultPath: V05_RESULT_PATH,
  resultPathAbsentAtAuthorization: true,
  protocolBinding: PROTOCOL_BINDING.protocol,
  evaluatorBinding: PROTOCOL_BINDING.evaluator,
  packageBinding: PROTOCOL_BINDING.package,
  typesBinding: PROTOCOL_BINDING.types,
  review: Object.freeze({
    decision: "approved",
    independent: true,
    reviewerId: "codex:/root/qarinah_v05_review",
    reviewedAt: "2026-08-08T07:55:58.139Z"
  })
});

export class V05PostResultVerificationError extends Error {
  constructor(code, message, stage = "post-result-verification") {
    super(`${code}: ${message}`);
    this.name = "V05PostResultVerificationError";
    this.code = code;
    this.stage = stage;
  }
}

function fail(code, message, stage) {
  throw new V05PostResultVerificationError(code, message, stage);
}

function exact(condition, code, message, stage) {
  if (!condition) fail(code, message, stage);
}

function same(actual, expected, code, message, stage) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch {
    fail(code, message, stage);
  }
}

function exactKeys(value, keys, code, stage = "semantic-schema") {
  exact(value !== null && typeof value === "object" && !Array.isArray(value), `${code}_TYPE`, `${code} must be an object.`, stage);
  same(Object.keys(value), keys, `${code}_KEYS`, `${code} keys or insertion order differ.`, stage);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function gitBlobSha1(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function parseJson(bytes, code, stage) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(code, "The bound artifact is not valid UTF-8 JSON.", stage);
  }
}

async function gitText(repositoryRoot, args) {
  try {
    const { stdout } = await run("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true
    });
    return stdout.trim();
  } catch (error) {
    fail("GIT_COMMAND", `git ${args.join(" ")} failed: ${String(error?.stderr || error?.message || "unknown error").trim()}`, "git-provenance");
  }
}

async function gitBlob(repositoryRoot, revision, relativePath) {
  try {
    const { stdout } = await run("git", ["show", `${revision}:${relativePath}`], {
      cwd: repositoryRoot,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true
    });
    return Buffer.from(stdout);
  } catch (error) {
    fail("GIT_BLOB", `Cannot read ${relativePath} at ${revision}: ${String(error?.stderr || error?.message || "unknown error").trim()}`, "git-provenance");
  }
}

async function assertAnnotatedTag(repositoryRoot, tag, commit, code) {
  exact(await gitText(repositoryRoot, ["cat-file", "-t", `refs/tags/${tag}`]) === "tag", `${code}_ANNOTATED`, `${tag} is not an annotated tag.`, "git-provenance");
  exact(await gitText(repositoryRoot, ["rev-parse", `refs/tags/${tag}^{}`]) === commit, `${code}_TARGET`, `${tag} does not resolve to ${commit}.`, "git-provenance");
}

async function assertCommit(repositoryRoot, freeze, code) {
  const metadata = await gitText(repositoryRoot, ["show", "-s", "--format=%H%x00%P%x00%s", freeze.commit]);
  const [commit, parents, subject] = metadata.split("\0");
  exact(commit === freeze.commit, `${code}_COMMIT`, `${code} commit differs.`, "git-provenance");
  exact(parents === freeze.parent, `${code}_PARENT`, `${code} is not the frozen direct child.`, "git-provenance");
  exact(subject === freeze.message, `${code}_MESSAGE`, `${code} commit subject differs.`, "git-provenance");
  const changes = (await gitText(repositoryRoot, ["diff-tree", "--no-commit-id", "--name-status", "-r", freeze.commit]))
    .split(/\r?\n/u).filter(Boolean).sort();
  same(changes, [...freeze.changes].sort(), `${code}_SCOPE`, `${code} changed-file scope differs.`, "git-provenance");
  await assertAnnotatedTag(repositoryRoot, freeze.tag, freeze.commit, `${code}_TAG`);
}

async function assertAncestor(repositoryRoot, ancestor, descendant, code) {
  try {
    await run("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true
    });
  } catch {
    fail(code, `${ancestor} is not an ancestor of ${descendant}.`, "git-provenance");
  }
}

function assertHash(bytes, expected, code, stage = "byte-binding") {
  exact(SHA256_PATTERN.test(expected), `${code}_EXPECTED`, `${code} expected hash is malformed.`, stage);
  exact(sha256(bytes) === expected, code, `${code} differs from ${expected}.`, stage);
}

async function assertBlobAt(repositoryRoot, revision, binding, code, { normalizeLf = false } = {}) {
  const bytes = await gitBlob(repositoryRoot, revision, binding.path);
  const materialized = normalizeLf ? Buffer.from(bytes.toString("utf8").replace(/\r\n/gu, "\n"), "utf8") : bytes;
  assertHash(materialized, binding.sha256, code, "lineage-binding");
  return bytes;
}

function assertNoFabricatedSuperiority(metadata) {
  const forbidden = /\b(?:best|winner|peer[- ]reviewed)\b/iu;
  const visit = (value, trail) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${trail}[${index}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        exact(!forbidden.test(key), "RESULT_FORBIDDEN_CLAIM_KEY", `Forbidden superiority key at ${trail}.${key}.`, "claim-boundary");
        visit(entry, `${trail}.${key}`);
      }
      return;
    }
    if (typeof value === "string") {
      exact(!forbidden.test(value), "RESULT_FORBIDDEN_CLAIM_VALUE", `Forbidden superiority wording at ${trail}.`, "claim-boundary");
    }
  };
  visit(metadata, "result");
}

function validateExpectedSemanticSchema(expected) {
  exactKeys(expected, ["corpus", "settings", "inference", "taskResults"], "EXPECTED");
  exactKeys(expected.corpus, [
    "digest", "rawTestParquetSha256", "officialPageDeclaredRepositories",
    "pinnedRevisionObservedRepositories", "discrepancyRecorded", "exploratoryReuse", "tasks", "heldoutTasks"
  ], "EXPECTED_CORPUS");
  exact(expected.corpus.digest === CORPUS_BINDING.corpus.logicalContentDigest, "EXPECTED_CORPUS_DIGEST", "Expected corpus digest differs.");
  exact(expected.corpus.rawTestParquetSha256 === RAW_SOURCE.sha256, "EXPECTED_RAW_DIGEST", "Expected raw-source digest differs.");
  exact(expected.corpus.officialPageDeclaredRepositories === 11 && expected.corpus.pinnedRevisionObservedRepositories === 12, "EXPECTED_REPOSITORY_COUNTS", "Expected repository-count disclosure differs.");
  exact(expected.corpus.discrepancyRecorded === true && expected.corpus.exploratoryReuse === true, "EXPECTED_DEVELOPMENT_DISCLOSURE", "Expected development disclosures differ.");
  exact(expected.corpus.tasks === 300 && expected.corpus.heldoutTasks === 240, "EXPECTED_TASK_COUNTS", "Expected task counts differ.");

  exactKeys(expected.settings, ["static", "onlinePrequential"], "EXPECTED_SETTINGS");
  exact(Array.isArray(expected.inference) && expected.inference.length === 3, "EXPECTED_INFERENCE", "Expected inference entries differ.");
  exactKeys(expected.taskResults, ["static", "onlinePrequential"], "EXPECTED_TASK_RESULTS");
  const taskKeys = [
    "repository", "instanceId", "repositorySequence", "positiveUnderStructuralOracle",
    "directRecords", "supportingRecords", "metrics", "volumes", "budgets",
    "evidenceSufficiency", "noTemporalFutureItems", "noTemporalReturnedItems"
  ];
  for (const setting of ["static", "onlinePrequential"]) {
    const tasks = expected.taskResults[setting];
    exact(Array.isArray(tasks) && tasks.length === 240, "EXPECTED_TASK_RESULT_COUNT", `${setting} must contain all 240 task results.`);
    for (const task of tasks) exactKeys(task, taskKeys, "EXPECTED_TASK_RESULT");
  }
}

export function verifyV05ResultInvariants(result, { referenceExpected }) {
  exactKeys(result, [
    "schemaVersion", "packageVersion", "status", "confirmatoryClaimEligible", "protocolBinding",
    "sourceBinding", "corpusBinding", "globalApiDifferenceBoundary", "executionScope",
    "expectedCanonical", "expected", "runtimeObservation"
  ], "RESULT");
  const { expected: _expected, ...metadata } = result;
  assertNoFabricatedSuperiority(metadata);

  exact(result.schemaVersion === "qarinah.research-retrieval-development-result.v5", "RESULT_SCHEMA", "Result schema differs.");
  exact(result.packageVersion === "0.1.6", "RESULT_PACKAGE_VERSION", "Result package version differs.");
  exact(result.status === "exact-projected-reproduction-on-inspected-development-corpus", "RESULT_STATUS", "Result status differs.");
  exact(result.confirmatoryClaimEligible === false, "RESULT_CONFIRMATORY", "Development evidence must not be marked confirmatory.");
  same(result.protocolBinding, PROTOCOL_BINDING, "RESULT_PROTOCOL_BINDING", "Result protocol/evaluator/authorization lineage differs.");
  same(result.sourceBinding, SOURCE_BINDING, "RESULT_SOURCE_BINDING", "Result source binding differs.");
  same(result.corpusBinding, CORPUS_BINDING, "RESULT_CORPUS_BINDING", "Result corpus/raw-source binding differs.");
  same(result.globalApiDifferenceBoundary, GLOBAL_API_DIFFERENCE_BOUNDARY, "RESULT_API_BOUNDARY", "Result API-difference boundary differs.");
  same(result.executionScope, EXECUTION_SCOPE, "RESULT_EXECUTION_SCOPE", "Result execution scope differs.");
  same(result.expectedCanonical, {
    algorithm: FROZEN.reference.expectedAlgorithm,
    byteLength: FROZEN.reference.expectedBytes,
    sha256: FROZEN.reference.expectedSha256,
    deepStrictEqual: true,
    referenceBytesEqual: true
  }, "RESULT_EXPECTED_CANONICAL", "Result complete-projection binding differs.");

  exact(referenceExpected !== null && typeof referenceExpected === "object" && !Array.isArray(referenceExpected), "REFERENCE_EXPECTED", "Frozen v0.4 expected object is absent.");
  validateExpectedSemanticSchema(result.expected);
  const candidateCanonical = Buffer.from(JSON.stringify(result.expected), "utf8");
  const referenceCanonical = Buffer.from(JSON.stringify(referenceExpected), "utf8");
  exact(candidateCanonical.byteLength === V05_EXPECTED_CANONICAL_BYTES, "RESULT_EXPECTED_LENGTH", "Complete expected projection byte length differs.");
  assertHash(candidateCanonical, V05_EXPECTED_CANONICAL_SHA256, "RESULT_EXPECTED_HASH", "projection-equality");
  exact(referenceCanonical.byteLength === V05_EXPECTED_CANONICAL_BYTES, "REFERENCE_EXPECTED_LENGTH", "Frozen v0.4 expected byte length differs.");
  assertHash(referenceCanonical, V05_EXPECTED_CANONICAL_SHA256, "REFERENCE_EXPECTED_HASH", "projection-equality");
  exact(candidateCanonical.equals(referenceCanonical), "RESULT_EXPECTED_BYTES", "Complete expected projection bytes differ from frozen v0.4.", "projection-equality");
  same(result.expected, referenceExpected, "RESULT_EXPECTED_DEEP_EQUALITY", "Complete expected projection differs from frozen v0.4.", "projection-equality");

  exactKeys(result.runtimeObservation, ["attemptId", "node", "platform", "startedAt", "completedAt", "totalEvaluationMs"], "RESULT_RUNTIME");
  exact(result.runtimeObservation.attemptId === "v05-attempt-001", "RESULT_ATTEMPT", "Result attempt differs from authorization.");
  exact(/^v\d+\.\d+\.\d+$/u.test(result.runtimeObservation.node), "RESULT_NODE", "Result Node identity is invalid.");
  exact(/^[a-z0-9]+-[a-z0-9]+$/u.test(result.runtimeObservation.platform), "RESULT_PLATFORM", "Result platform identity is invalid.");
  const started = Date.parse(result.runtimeObservation.startedAt);
  const completed = Date.parse(result.runtimeObservation.completedAt);
  exact(Number.isFinite(started) && Number.isFinite(completed) && completed >= started, "RESULT_TIMESTAMPS", "Result timestamps are invalid or reversed.");
  exact(Number.isFinite(result.runtimeObservation.totalEvaluationMs) && result.runtimeObservation.totalEvaluationMs >= 0, "RESULT_DURATION", "Result duration is invalid.");
  return true;
}

async function verifyProtocolAndAuthorization(repositoryRoot) {
  await assertCommit(repositoryRoot, FROZEN.protocol, "PROTOCOL");
  await assertCommit(repositoryRoot, FROZEN.evaluator, "EVALUATOR");
  await assertCommit(repositoryRoot, FROZEN.authorization, "AUTHORIZATION");
  await assertCommit(repositoryRoot, FROZEN.result, "RESULT");
  await assertAnnotatedTag(repositoryRoot, FROZEN.reference.tag, FROZEN.reference.commit, "REFERENCE_TAG");

  const protocolBytes = await assertBlobAt(repositoryRoot, FROZEN.protocol.tag, FROZEN.protocol.manifest, "PROTOCOL_MANIFEST_HASH");
  await assertBlobAt(repositoryRoot, FROZEN.protocol.tag, FROZEN.protocol.document, "PROTOCOL_DOCUMENT_HASH");
  const protocol = parseJson(protocolBytes, "PROTOCOL_JSON", "protocol-binding");
  exact(protocol.schemaVersion === "qarinah.research-retrieval-development-protocol-amendment.v1", "PROTOCOL_SCHEMA", "Protocol schema differs.", "protocol-binding");
  exact(protocol.timing?.v05RetrievalExecutedWhenAuthored === false && protocol.timing?.v05OutcomeObservedWhenAuthored === false && protocol.timing?.v05ResultMaterializedWhenAuthored === false, "PROTOCOL_PRE_OUTCOME", "Protocol is not recorded as pre-outcome.", "protocol-binding");
  exact(protocol.measurementContract?.partialEqualityForbidden === true && protocol.measurementContract?.tolerance === 0 && protocol.measurementContract?.roundingOrMetricSubstitutionForbidden === true, "PROTOCOL_EXACTNESS", "Protocol exactness boundary differs.", "protocol-binding");
  exact(protocol.resultContract?.schemaVersion === "qarinah.research-retrieval-development-result.v5" && protocol.resultContract?.path === V05_RESULT_PATH && protocol.resultContract?.writeLimit === 1 && protocol.resultContract?.overwriteOrDeleteForbidden === true, "PROTOCOL_RESULT_CONTRACT", "Protocol result publication contract differs.", "protocol-binding");
  exact(protocol.claimBoundary?.noOutcomeClaimBeforePassing === true && protocol.claimBoundary?.disallowed?.some((entry) => entry.includes("best AI")), "PROTOCOL_CLAIM_BOUNDARY", "Protocol claim boundary differs.", "protocol-binding");

  await assertBlobAt(repositoryRoot, FROZEN.evaluator.tag, FROZEN.evaluator.evaluator, "EVALUATOR_HASH");
  const frozenPackageBytes = await assertBlobAt(repositoryRoot, FROZEN.evaluator.tag, FROZEN.evaluator.package, "EVALUATOR_PACKAGE_HASH");
  await assertBlobAt(repositoryRoot, FROZEN.evaluator.tag, FROZEN.evaluator.types, "EVALUATOR_TYPES_HASH");
  const frozenPackage = parseJson(frozenPackageBytes, "EVALUATOR_PACKAGE_JSON", "evaluator-binding");
  exact(frozenPackage.scripts?.["evaluate:research-retrieval:v0.5:write"] === EXPECTED_AUTHORIZATION.authorizedCommand, "EVALUATOR_COMMAND_BINDING", "Evaluator package command differs.", "evaluator-binding");

  const authorizationBytes = await assertBlobAt(repositoryRoot, FROZEN.authorization.tag, FROZEN.authorization.receipt, "AUTHORIZATION_RECEIPT_HASH");
  const authorization = parseJson(authorizationBytes, "AUTHORIZATION_JSON", "authorization-binding");
  same(authorization, EXPECTED_AUTHORIZATION, "AUTHORIZATION_RECEIPT", "Authorization receipt semantics differ.", "authorization-binding");
}

async function verifySourceAndCorpusLineage(repositoryRoot) {
  for (const binding of SOURCE_BINDING.files) {
    const origin = await assertBlobAt(repositoryRoot, SOURCE_BINDING.productImplementationOriginCommit, binding, "SOURCE_ORIGIN_HASH", { normalizeLf: true });
    const materialized = await assertBlobAt(repositoryRoot, V05_RESULT_COMMIT, binding, "SOURCE_RESULT_HASH", { normalizeLf: true });
    exact(origin.toString("utf8").replace(/\r\n/gu, "\n") === materialized.toString("utf8").replace(/\r\n/gu, "\n"), "SOURCE_MATERIALIZATION", `${binding.path} differs between production origin and result commit.`, "source-binding");
  }

  const corpusBytes = await assertBlobAt(repositoryRoot, V05_RESULT_COMMIT, { path: CORPUS_BINDING.corpus.path, sha256: CORPUS_BINDING.corpus.fileSha256 }, "CORPUS_HASH");
  await assertBlobAt(repositoryRoot, V05_RESULT_COMMIT, CORPUS_BINDING.loader, "CORPUS_LOADER_HASH");
  const corpus = parseJson(corpusBytes, "CORPUS_JSON", "corpus-binding");
  exact(corpus.contentDigest === CORPUS_BINDING.corpus.logicalContentDigest, "CORPUS_LOGICAL_DIGEST", "Corpus logical digest differs.", "corpus-binding");
  same(corpus.generatedFrom?.sourceArtifact, RAW_SOURCE, "CORPUS_RAW_LINEAGE", "Corpus raw-source lineage differs.", "corpus-binding");
}

async function loadFrozenReference(repositoryRoot) {
  const bytes = await gitBlob(repositoryRoot, FROZEN.reference.tag, FROZEN.reference.artifactPath);
  assertHash(bytes, FROZEN.reference.artifactSha256, "REFERENCE_ARTIFACT_HASH", "reference-binding");
  const artifact = parseJson(bytes, "REFERENCE_ARTIFACT_JSON", "reference-binding");
  exact(artifact.schemaVersion === "qarinah.research-retrieval-development-result.v4", "REFERENCE_SCHEMA", "Frozen reference schema differs.", "reference-binding");
  exact(artifact.expected !== null && typeof artifact.expected === "object" && !Array.isArray(artifact.expected), "REFERENCE_EXPECTED", "Frozen reference expected object is absent.", "reference-binding");
  const canonical = Buffer.from(JSON.stringify(artifact.expected), "utf8");
  exact(canonical.byteLength === FROZEN.reference.expectedBytes, "REFERENCE_EXPECTED_LENGTH", "Frozen reference expected length differs.", "reference-binding");
  assertHash(canonical, FROZEN.reference.expectedSha256, "REFERENCE_EXPECTED_HASH", "reference-binding");
  return artifact.expected;
}

async function verifyResultGitProvenance(repositoryRoot, currentBytes) {
  await assertAncestor(repositoryRoot, V05_RESULT_COMMIT, "HEAD", "RESULT_HEAD_ANCESTRY");
  exact(
    await gitText(repositoryRoot, ["diff-tree", "--no-commit-id", "--name-status", "-r", V05_RESULT_COMMIT, "--", V05_RESULT_PATH]) === `A\t${V05_RESULT_PATH}`,
    "RESULT_SINGLE_INTRODUCTION",
    "The tagged result commit must introduce the result on its canonical lineage.",
    "result-provenance"
  );
  const laterCanonicalChanges = (await gitText(repositoryRoot, [
    "log",
    "--format=%H",
    "--ancestry-path",
    `${V05_RESULT_COMMIT}..HEAD`,
    "--",
    V05_RESULT_PATH
  ])).split(/\r?\n/u).filter(Boolean);
  same(laterCanonicalChanges, [], "RESULT_MUTATED", "Result changed after its canonical introduction.", "result-provenance");
  const committed = await gitBlob(repositoryRoot, V05_RESULT_TAG, V05_RESULT_PATH);
  exact(currentBytes.equals(committed), "RESULT_WORKTREE_BYTES", "Working result bytes differ from the tagged result.", "result-provenance");
  exact(gitBlobSha1(currentBytes) === V05_RESULT_GIT_BLOB, "RESULT_GIT_BLOB", "Result Git blob identity differs.", "result-provenance");

  const resultNames = await readdir(path.join(repositoryRoot, "bench", "results"));
  exact(resultNames.filter((name) => FAILURE_NAME_PATTERN.test(name)).length === 0, "RESULT_FAILURE_COHABITATION", "A successful result cannot coexist with a v0.5 failure receipt.", "result-provenance");
}

export async function verifyResearchRetrievalV05Result({
  repositoryRoot,
  resultPath = path.join(repositoryRoot, ...V05_RESULT_PATH.split("/"))
}) {
  exact(typeof repositoryRoot === "string" && path.isAbsolute(repositoryRoot), "REPOSITORY_ROOT", "repositoryRoot must be absolute.");
  const resultBytes = await readFile(resultPath);
  assertHash(resultBytes, V05_RESULT_SHA256, "RESULT_ARTIFACT_HASH");
  exact(gitBlobSha1(resultBytes) === V05_RESULT_GIT_BLOB, "RESULT_ARTIFACT_BLOB", "Result Git blob identity differs.");
  const result = parseJson(resultBytes, "RESULT_ARTIFACT_JSON", "result-artifact");
  exact(resultBytes.equals(Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8")), "RESULT_ARTIFACT_CANONICAL", "Result is not canonical LF pretty JSON.", "result-artifact");

  await verifyProtocolAndAuthorization(repositoryRoot);
  await verifySourceAndCorpusLineage(repositoryRoot);
  const referenceExpected = await loadFrozenReference(repositoryRoot);
  verifyV05ResultInvariants(result, { referenceExpected });
  await verifyResultGitProvenance(repositoryRoot, resultBytes);

  return Object.freeze({
    ok: true,
    mode: "read-only-post-result-v0.5",
    resultPath: V05_RESULT_PATH,
    resultSha256: V05_RESULT_SHA256,
    resultGitBlob: V05_RESULT_GIT_BLOB,
    resultCommit: V05_RESULT_COMMIT,
    resultTag: V05_RESULT_TAG,
    expectedCanonicalBytes: V05_EXPECTED_CANONICAL_BYTES,
    expectedCanonicalSha256: V05_EXPECTED_CANONICAL_SHA256,
    completeExpectedProjectionMatchesV04: true,
    confirmatoryClaimEligible: false,
    providerModelCalls: 0,
    providerReportedTokensMeasured: false,
    costMeasured: false,
    latencyMeasured: false,
    sweBenchPatchResolutionMeasured: false,
    humanQualityMeasured: false,
    superiorityClaimAllowed: false,
    evaluatorImported: false,
    retrievalModulesLoaded: false,
    corpusLoaderImported: false,
    networkRequests: 0,
    retrievalOrRankingCalls: 0,
    writesPerformed: false,
    resultRewritten: false
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  exact(process.argv.length === 2, "CLI_ARGUMENT", "The v0.5 post-result verifier accepts no arguments.");
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = await verifyResearchRetrievalV05Result({ repositoryRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
