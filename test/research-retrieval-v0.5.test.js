import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCommittedArtifactState,
  assertBytesBinding,
  assertOneShotDestinations,
  assertSingleIntroduction,
  atomicPublishJsonNoReplace,
  dispatchModeWithHooks,
  fetchBoundRawArtifact,
  parseCliMode,
  publishFailureOnlyIfResultAbsent,
  validateAuthorizationReceiptShape,
  validateFailureReceipt,
  validateResultEnvelopeShape
} from "../scripts/evaluate-research-retrieval-v0.5.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const COMMIT_C = "c".repeat(40);
const PROTOCOL_COMMIT = "7c50a69bf587159b350da19954a2469a3a089ad5";
const REFERENCE_COMMIT = "31a0c38be6e2f506e669e57dc30607a9f87dcc5b";

function protocolCoreFixture() {
  return {
    commit: PROTOCOL_COMMIT,
    tag: "research-retrieval-development-v0.5-protocol",
    manifestSha256: "sha256:608a15bc48a80bd281ab593157bd9e0371ce867f77b79c32aa8ef0370e6f7a11",
    documentSha256: "sha256:a761f92886dcc93d01bc84b0096b6594125037e0210ad912dff5af954651a3e7"
  };
}

function evaluatorBindingFixture() {
  return {
    path: "scripts/evaluate-research-retrieval-v0.5.mjs",
    commit: COMMIT_B,
    tag: "research-retrieval-development-v0.5-evaluator",
    sha256: HASH_C
  };
}

function resultProtocolBindingFixture(attemptId = "attempt-001") {
  return {
    protocol: protocolCoreFixture(),
    immutableV04Reference: {
      commit: REFERENCE_COMMIT,
      tag: "research-retrieval-development-v0.4",
      artifactPath: "bench/results/research-retrieval-development-v0.4.json",
      artifactSha256: "sha256:607359a947e7a849512d3fcb588bc88c2b34e1289f15b735a2de0c3895a21a18",
      expectedCanonicalAlgorithm: "sha256-utf8-json-stringify-preserved-insertion-order-v1",
      expectedCanonicalByteLength: 3_110_007,
      expectedCanonicalSha256: "sha256:12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c"
    },
    evaluator: evaluatorBindingFixture(),
    package: { path: "package.json", commit: COMMIT_B, sha256: HASH_A },
    types: { path: "types/index.d.ts", commit: COMMIT_B, sha256: HASH_B },
    authorizationReceipt: {
      path: "bench/research/research-retrieval-development-v0.5-authorization.json",
      commit: COMMIT_C,
      sha256: HASH_C,
      attemptId
    }
  };
}

function sourceBindingFixture() {
  return {
    productImplementationOriginCommit: "6c22d8f293e1e99bbbee239abb36e219af2c96a9",
    algorithm: "sha256-utf8-after-crlf-to-lf-normalization-v1",
    files: [
      { path: "src/index.js", sha256: "sha256:66a69c1b2143fb559ff5c67dfd3e41031a48a5c46ca49631ac1f996ea6cf7fa7" },
      { path: "src/retrieval.js", sha256: "sha256:729991b59ea5a0b073c6cdd93fef15c622c819c7f46947b1167f44d598b3a68a" },
      { path: "src/canonical.js", sha256: "sha256:c24859c69ff8571128107c7de6718fc02aad9cb64f807f174d23bf8b12293225" },
      { path: "src/contracts.js", sha256: "sha256:d74d0487fad186901c7aa1a8c8530c0920fe3908c611ce85ec17c6336d575650" },
      { path: "src/indexer.js", sha256: "sha256:868c6e433dc858cd665c3c844bb72449e102bf1bc288f1c9daf41ecf4986ff4b" },
      { path: "src/interoperability/boundary.js", sha256: "sha256:80798113257019fa38573acf262ed69b8f1b2b887ceb8ce37f53951c2f1d3118" },
      { path: "src/redact.js", sha256: "sha256:6198154b1d4a37adfea308f8b2723c89788ab8046ca587210e278952ca4454b4" }
    ]
  };
}

function corpusBindingFixture(rawVerification) {
  const value = {
    classification: "inspected-development-corpus",
    dataset: "princeton-nlp/SWE-bench_Lite",
    corpus: {
      path: "bench/research/swe-bench-lite-development-v0.2.json",
      fileSha256: "sha256:d30f94bba88f72db737340f05a9d3ad3c739c46f84307abc8802a78ca4de0482",
      logicalContentDigest: "sha256:01b35115ac639c1fcd3779561f83d5bb21988eb74ee5e93798c5d7579d757863"
    },
    loader: { path: "bench/research/swe-bench-lite.mjs", sha256: "sha256:3b92352951a07854786b1a74ee5d2e6e5cbe1247b7c39d2f1135593cfed431dc" },
    rawSourceArtifact: {
      path: "data/test-00000-of-00001.parquet",
      url: "https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet",
      bytes: 1_119_540,
      sha256: "sha256:7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4"
    }
  };
  if (rawVerification) value.rawSourceVerification = {
    requestedUrl: "https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet",
    redirected: false,
    bytes: 1_119_540,
    sha256: "sha256:7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4",
    retainedOnDisk: false
  };
  return value;
}

function authorizationFixture() {
  return {
    schemaVersion: "qarinah.research-retrieval-development-authorization.v1",
    attemptId: "attempt-001",
    authorizedCommand: "node scripts/evaluate-research-retrieval-v0.5.mjs --execute --write",
    explicitlyAuthorized: true,
    resultPath: "bench/results/research-retrieval-development-v0.5.json",
    resultPathAbsentAtAuthorization: true,
    protocolBinding: protocolCoreFixture(),
    evaluatorBinding: evaluatorBindingFixture(),
    packageBinding: { path: "package.json", commit: COMMIT_B, sha256: HASH_A },
    typesBinding: { path: "types/index.d.ts", commit: COMMIT_B, sha256: HASH_B },
    review: {
      decision: "approved",
      independent: true,
      reviewerId: "independent-reviewer",
      reviewedAt: "2026-08-08T00:00:00.000Z"
    }
  };
}

function resultEnvelopeFixture() {
  return {
    schemaVersion: "qarinah.research-retrieval-development-result.v5",
    packageVersion: "0.1.6",
    status: "exact-projected-reproduction-on-inspected-development-corpus",
    confirmatoryClaimEligible: false,
    protocolBinding: resultProtocolBindingFixture(),
    sourceBinding: sourceBindingFixture(),
    corpusBinding: corpusBindingFixture(true),
    globalApiDifferenceBoundary: {
      currentAdditions: [],
      projectionRule: "projection",
      repositoryDifference: "repository",
      invalidInputDifference: "input",
      claimLimit: "bounded"
    },
    executionScope: {
      providerModelCalls: 0,
      providerReportedTokens: false,
      sweBenchDockerTaskExecution: false,
      humanRelevanceReview: false,
      humanCodeReview: false,
      taskPatchGeneration: false,
      latencyStudy: false,
      costStudy: false
    },
    expectedCanonical: {
      algorithm: "sha256-utf8-json-stringify-preserved-insertion-order-v1",
      byteLength: 1,
      sha256: HASH_A,
      deepStrictEqual: true,
      referenceBytesEqual: true
    },
    expected: {},
    runtimeObservation: {
      attemptId: "attempt-001",
      node: "v24.0.0",
      platform: "win32-x64",
      startedAt: "2026-08-08T00:00:00.000Z",
      completedAt: "2026-08-08T00:00:01.000Z",
      totalEvaluationMs: 1
    }
  };
}

function failureReceiptFixture() {
  return {
    schemaVersion: "qarinah.research-retrieval-development-failure-receipt.v1",
    attemptId: "attempt-001",
    command: "node scripts/evaluate-research-retrieval-v0.5.mjs --execute --write",
    protocolBinding: resultProtocolBindingFixture(),
    evaluatorBinding: evaluatorBindingFixture(),
    sourceBinding: sourceBindingFixture(),
    corpusBinding: corpusBindingFixture(false),
    startedAt: "2026-08-08T00:00:00.000Z",
    failedAt: "2026-08-08T00:00:01.000Z",
    failedStage: "binding-preflight",
    failureCode: "TEST_FAILURE",
    sanitizedMessage: "bounded failure",
    retrievalStarted: false,
    retrievalCompleted: false,
    resultPublished: false,
    resultPathAbsentAtStart: true,
    resultPathAbsentAtFailure: true
  };
}

test("v0.5 accepts only the three exact frozen argv shapes", () => {
  assert.equal(parseCliMode(["--bindings-only"]), "binding-only");
  assert.equal(parseCliMode(["--execute", "--write"]), "execute");
  assert.equal(parseCliMode(["--verify-result"]), "verify-result");
  for (const argv of [
    [], ["--execute"], ["--write"], ["--write", "--execute"],
    ["--bindings-only", "--write"], ["--verify-result", "--write"], ["--help"]
  ]) assert.throws(() => parseCliMode(argv), (error) => error?.code === "MODE_FORBIDDEN");
});

test("binding-only dispatch never reaches authorization, retrieval, or result verification", async () => {
  const calls = [];
  await dispatchModeWithHooks("binding-only", {
    bindingOnly: async () => calls.push("bindings"),
    verifyResult: async () => { throw new Error("result verifier trap"); },
    authorize: async () => { throw new Error("authorization trap"); },
    execute: async () => { throw new Error("retrieval loader trap"); }
  });
  assert.deepEqual(calls, ["bindings"]);
});

test("execute dispatch fails authorization before reaching the retrieval loader", async () => {
  let retrievalLoaded = false;
  await assert.rejects(
    dispatchModeWithHooks("execute", {
      bindingOnly: async () => {},
      verifyResult: async () => {},
      authorize: async () => { throw Object.assign(new Error("no receipt"), { code: "AUTHORIZATION_ABSENT" }); },
      execute: async () => { retrievalLoaded = true; }
    }),
    (error) => error?.code === "AUTHORIZATION_ABSENT"
  );
  assert.equal(retrievalLoaded, false);
});

test("byte bindings fail closed on length and hash tampering", () => {
  const original = Buffer.from("frozen-v0.5-binding", "utf8");
  const binding = { bytes: original.byteLength, sha256: sha256(original) };
  assert.deepEqual(assertBytesBinding(original, binding), binding);
  assert.throws(
    () => assertBytesBinding(Buffer.from("short", "utf8"), binding, "TAMPER"),
    (error) => error?.code === "TAMPER_LENGTH"
  );
  const sameLengthTamper = Buffer.from(original);
  sameLengthTamper[0] ^= 1;
  assert.throws(
    () => assertBytesBinding(sameLengthTamper, binding, "TAMPER"),
    (error) => error?.code === "TAMPER_SHA256"
  );
});

test("authorization, result, and failure envelopes reject claim, outcome, and nested-key injection", () => {
  const authorization = authorizationFixture();
  assert.equal(validateAuthorizationReceiptShape(authorization), true);
  assert.throws(
    () => validateAuthorizationReceiptShape({ ...authorization, winner: "qarinah" }),
    (error) => error?.code === "AUTHORIZATION_KEYS"
  );
  assert.throws(
    () => validateAuthorizationReceiptShape({
      ...authorization,
      review: { ...authorization.review, bestClaim: true }
    }),
    (error) => error?.code === "AUTHORIZATION_FORBIDDEN_KEY"
  );
  assert.throws(
    () => validateAuthorizationReceiptShape({ ...authorization, explicitlyAuthorized: false }),
    (error) => error?.code === "AUTHORIZATION_EXPLICIT"
  );
  assert.throws(
    () => validateAuthorizationReceiptShape({
      ...authorization,
      protocolBinding: { ...authorization.protocolBinding, commit: COMMIT_A }
    }),
    (error) => error?.code === "AUTHORIZATION_PROTOCOL_MISMATCH"
  );

  const result = resultEnvelopeFixture();
  assert.equal(validateResultEnvelopeShape(result), true);
  assert.throws(
    () => validateResultEnvelopeShape({ ...result, metrics: { precision: 1 } }),
    (error) => error?.code === "RESULT_KEYS"
  );
  assert.throws(
    () => validateResultEnvelopeShape({
      ...result,
      runtimeObservation: { ...result.runtimeObservation, outcome: "pass" }
    }),
    (error) => error?.code === "RESULT_FORBIDDEN_KEY"
  );

  const failure = failureReceiptFixture();
  assert.equal(validateFailureReceipt(failure), true);
  assert.throws(
    () => validateFailureReceipt({ ...failure, outcome: { partial: true } }),
    (error) => error?.code === "FAILURE_KEYS"
  );
  assert.throws(
    () => validateFailureReceipt({ ...failure, resultPathAbsentAtFailure: false }),
    (error) => error?.code === "FAILURE_RESULT_FAILURE_STATE"
  );
  assert.throws(
    () => validateFailureReceipt({
      ...failure,
      sourceBinding: {
        ...failure.sourceBinding,
        files: failure.sourceBinding.files.map((file, index) => index === 0 ? { ...file, sha256: HASH_B } : file)
      }
    }),
    (error) => error?.code === "FAILURE_SOURCE_MISMATCH"
  );
});

test("committed result provenance rejects untracked, later-mutated, and working-byte-mutated artifacts", () => {
  const original = Buffer.from("frozen-result", "utf8");
  assert.deepEqual(assertCommittedArtifactState({
    introducingCommit: COMMIT_A,
    latestCommit: COMMIT_A,
    currentBytes: original,
    committedBytes: Buffer.from(original),
    ancestorVerified: true
  }), {
    introducingCommit: COMMIT_A,
    latestCommit: COMMIT_A,
    sha256: sha256(original),
    bytes: original.byteLength
  });
  assert.throws(
    () => assertCommittedArtifactState({
      introducingCommit: "",
      latestCommit: "",
      currentBytes: original,
      committedBytes: original,
      ancestorVerified: false
    }),
    (error) => error?.code === "RESULT_UNTRACKED"
  );
  assert.throws(
    () => assertCommittedArtifactState({
      introducingCommit: COMMIT_A,
      latestCommit: COMMIT_B,
      currentBytes: original,
      committedBytes: original,
      ancestorVerified: true
    }),
    (error) => error?.code === "RESULT_HISTORY_MUTATED"
  );
  assert.throws(
    () => assertCommittedArtifactState({
      introducingCommit: COMMIT_A,
      latestCommit: COMMIT_A,
      currentBytes: Buffer.from("mutated-result", "utf8"),
      committedBytes: original,
      ancestorVerified: true
    }),
    (error) => error?.code === "RESULT_WORKTREE_BYTES"
  );
});

test("one-shot destination state rejects either a prior result or any prior failure receipt", () => {
  assert.equal(assertOneShotDestinations({ resultPresent: false, failureReceipts: [] }), true);
  assert.equal(assertSingleIntroduction([COMMIT_A], "TEST_INTRODUCTION"), COMMIT_A);
  assert.throws(
    () => assertOneShotDestinations({ resultPresent: true, failureReceipts: [] }),
    (error) => error?.code === "RESULT_DESTINATION_PRESENT"
  );
  assert.throws(
    () => assertOneShotDestinations({
      resultPresent: false,
      failureReceipts: ["research-retrieval-development-v0.5-attempt-001-failure.json"],
      attemptId: "attempt-001"
    }),
    (error) => error?.code === "FAILURE_DESTINATION_PRESENT"
  );
  assert.throws(
    () => assertSingleIntroduction([], "TEST_INTRODUCTION"),
    (error) => error?.code === "TEST_INTRODUCTION_COUNT"
  );
  assert.throws(
    () => assertSingleIntroduction([COMMIT_A, COMMIT_B], "TEST_INTRODUCTION"),
    (error) => error?.code === "TEST_INTRODUCTION_COUNT"
  );
});

test("raw-artifact preflight requests only the frozen URL and rejects tampered bytes in memory", async () => {
  let requestedUrl = null;
  const fakeFetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      url,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    };
  };
  await assert.rejects(fetchBoundRawArtifact(fakeFetch), (error) => error?.code === "RAW_ARTIFACT_LENGTH");
  assert.equal(
    requestedUrl,
    "https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet"
  );
});

test("atomic JSON publication is exclusive and never replaces an existing destination", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v05-atomic-"));
  const destination = path.join(temporaryRoot, "result.json");
  try {
    const first = { schemaVersion: "test.v1", value: 1 };
    await atomicPublishJsonNoReplace(destination, first, async (parsed) => assert.deepEqual(parsed, first));
    const originalBytes = await readFile(destination);
    await assert.rejects(
      atomicPublishJsonNoReplace(destination, { schemaVersion: "test.v1", value: 2 }),
      (error) => error?.code === "ATOMIC_DESTINATION_EXISTS"
    );
    assert.deepEqual(await readFile(destination), originalBytes);
    assert.deepEqual(JSON.parse(originalBytes.toString("utf8")), first);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("a post-link failure leaves the result terminal and cannot publish a failure receipt", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-v05-terminal-"));
  const destination = path.join(temporaryRoot, "result.json");
  let failurePublished = false;
  try {
    await assert.rejects(
      atomicPublishJsonNoReplace(
        destination,
        { schemaVersion: "test.v1", value: 1 },
        null,
        { afterLink: async () => { throw new Error("post-link trap"); } }
      ),
      /post-link trap/u
    );
    assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), { schemaVersion: "test.v1", value: 1 });
    await assert.rejects(
      publishFailureOnlyIfResultAbsent({
        resultDestination: destination,
        resultPublished: false,
        publish: async () => { failurePublished = true; }
      }),
      (error) => error?.code === "RESULT_PUBLICATION_TERMINAL"
    );
    assert.equal(failurePublished, false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
