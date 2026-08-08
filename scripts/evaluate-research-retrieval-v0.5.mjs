import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, link, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json");
const resultPath = path.join(root, "bench", "results", "research-retrieval-development-v0.5.json");
const authorizationPath = path.join(root, "bench", "research", "research-retrieval-development-v0.5-authorization.json");
const TOP_K = 10;
const BUDGETS = Object.freeze([512, 1_000, 2_000, 4_000, 8_000]);
const BOOTSTRAP_SAMPLES = 10_000;

const PROTOCOL = Object.freeze({
  commit: "7c50a69bf587159b350da19954a2469a3a089ad5",
  tag: "research-retrieval-development-v0.5-protocol",
  manifest: Object.freeze({
    path: "bench/research/research-retrieval-development-v0.5-amendment.json",
    sha256: "sha256:608a15bc48a80bd281ab593157bd9e0371ce867f77b79c32aa8ef0370e6f7a11"
  }),
  document: Object.freeze({
    path: "docs/RESEARCH-DEVELOPMENT-PROTOCOL-v0.5.md",
    sha256: "sha256:a761f92886dcc93d01bc84b0096b6594125037e0210ad912dff5af954651a3e7"
  })
});

const REFERENCE = Object.freeze({
  commit: "31a0c38be6e2f506e669e57dc30607a9f87dcc5b",
  tag: "research-retrieval-development-v0.4",
  artifactPath: "bench/results/research-retrieval-development-v0.4.json",
  artifactSha256: "sha256:607359a947e7a849512d3fcb588bc88c2b34e1289f15b735a2de0c3895a21a18",
  expectedCanonicalAlgorithm: "sha256-utf8-json-stringify-preserved-insertion-order-v1",
  expectedCanonicalBytes: 3_110_007,
  expectedCanonicalSha256: "sha256:12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c"
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

const CORPUS_BINDING = Object.freeze({
  corpus: Object.freeze({
    path: "bench/research/swe-bench-lite-development-v0.2.json",
    fileSha256: "sha256:d30f94bba88f72db737340f05a9d3ad3c739c46f84307abc8802a78ca4de0482",
    logicalContentDigest: "sha256:01b35115ac639c1fcd3779561f83d5bb21988eb74ee5e93798c5d7579d757863"
  }),
  loader: Object.freeze({
    path: "bench/research/swe-bench-lite.mjs",
    sha256: "sha256:3b92352951a07854786b1a74ee5d2e6e5cbe1247b7c39d2f1135593cfed431dc"
  }),
  raw: Object.freeze({
    path: "data/test-00000-of-00001.parquet",
    url: "https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet",
    bytes: 1_119_540,
    sha256: "sha256:7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4"
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

const MODE_CONTRACTS = Object.freeze({
  "binding-only": Object.freeze({
    argv: Object.freeze(["--bindings-only"]),
    lifecycleEvent: "check:research-retrieval:v0.5:bindings",
    lifecycleScript: "node scripts/evaluate-research-retrieval-v0.5.mjs --bindings-only"
  }),
  execute: Object.freeze({
    argv: Object.freeze(["--execute", "--write"]),
    lifecycleEvent: "evaluate:research-retrieval:v0.5:write",
    lifecycleScript: "node scripts/evaluate-research-retrieval-v0.5.mjs --execute --write"
  }),
  "verify-result": Object.freeze({
    argv: Object.freeze(["--verify-result"]),
    lifecycleEvent: "check:research-retrieval:v0.5:result",
    lifecycleScript: "node scripts/evaluate-research-retrieval-v0.5.mjs --verify-result"
  })
});

const AUTHORIZATION_SCHEMA = "qarinah.research-retrieval-development-authorization.v1";
const RESULT_SCHEMA = "qarinah.research-retrieval-development-result.v5";
const FAILURE_SCHEMA = "qarinah.research-retrieval-development-failure-receipt.v1";
const FAILURE_NAME_PATTERN = /^research-retrieval-development-v0\.5-[a-z0-9][a-z0-9._-]{0,63}-failure\.json$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ATTEMPT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const FORBIDDEN_CLAIM_KEY_PATTERN = /best|winner|metrics|outcome/iu;

let buildDerivedState;
let createEventEnvelope;
let rankContextEvents;
let tokenize;
let loadPinnedDevelopmentDataset;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

class V05Error extends Error {
  constructor(code, message, stage = "preflight") {
    super(message);
    this.name = "V05Error";
    this.code = code;
    this.stage = stage;
  }
}

function exact(condition, code, message, stage = "preflight") {
  if (!condition) throw new V05Error(code, message, stage);
}

function exactDeep(actual, expected, code, message, stage) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch {
    throw new V05Error(code, message, stage);
  }
  return true;
}

export function assertExactObjectKeys(value, keys, code = "OBJECT", stage = "schema") {
  exact(value !== null && typeof value === "object" && !Array.isArray(value), `${code}_TYPE`, `${code} must be a JSON object.`, stage);
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  exact(
    observed.length === expected.length && observed.every((key, index) => key === expected[index]),
    `${code}_KEYS`,
    `${code} keys must be exactly: ${expected.join(", ")}.`,
    stage
  );
  return true;
}

export function assertNoForbiddenClaimKeys(value, code = "CLAIM_KEY", stage = "schema", ignoredKeys = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoForbiddenClaimKeys(entry, code, stage, ignoredKeys));
    return true;
  }
  if (value === null || typeof value !== "object") return true;
  for (const [key, entry] of Object.entries(value)) {
    if (ignoredKeys.has(key)) continue;
    exact(!FORBIDDEN_CLAIM_KEY_PATTERN.test(key), code, `Forbidden claim or outcome key ${key} is not permitted.`, stage);
    assertNoForbiddenClaimKeys(entry, code, stage, ignoredKeys);
  }
  return true;
}

function assertSha256(value, code, stage) {
  exact(SHA256_PATTERN.test(value || ""), code, `${code} must be a lowercase sha256: binding.`, stage);
}

function assertCommit(value, code, stage) {
  exact(COMMIT_PATTERN.test(value || ""), code, `${code} must be a 40-character lowercase Git commit.`, stage);
}

function assertIsoTimestamp(value, code, stage) {
  exact(typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, code, `${code} must be a canonical ISO-8601 timestamp.`, stage);
}

export function parseCliMode(argv) {
  for (const [mode, contract] of Object.entries(MODE_CONTRACTS)) {
    if (argv.length === contract.argv.length && argv.every((value, index) => value === contract.argv[index])) return mode;
  }
  throw new V05Error(
    "MODE_FORBIDDEN",
    "Use exactly one frozen package command: --bindings-only, --execute --write, or --verify-result.",
    "mode"
  );
}

function assertLifecycle(mode, environment = process.env) {
  const contract = MODE_CONTRACTS[mode];
  exact(environment.npm_lifecycle_event === contract.lifecycleEvent, "COMMAND_NOT_PACKAGE_SCRIPT", `Mode ${mode} must run through ${contract.lifecycleEvent}.`, "mode");
  exact(environment.npm_lifecycle_script === contract.lifecycleScript, "COMMAND_SCRIPT_DRIFT", `The ${mode} package script differs from the frozen argv.`, "mode");
}

async function exists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function gitText(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function gitBlob(revision, relativePath) {
  const { stdout } = await execFileAsync("git", ["show", `${revision}:${relativePath}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024
  });
  return Buffer.from(stdout);
}

async function assertAnnotatedTag(tag, commit, code) {
  exact(await gitText(["cat-file", "-t", tag]) === "tag", `${code}_TYPE`, `${tag} is not an annotated tag.`);
  exact(await gitText(["rev-parse", `${tag}^{}`]) === commit, `${code}_COMMIT`, `${tag} does not resolve to ${commit}.`);
}

async function assertAncestor(ancestor, descendant, code) {
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, encoding: "utf8" });
  } catch {
    throw new V05Error(code, `${ancestor} is not an ancestor of ${descendant}.`);
  }
}

export function assertBytesBinding(value, binding, code = "BYTES_BINDING") {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (binding.bytes !== undefined) exact(bytes.byteLength === binding.bytes, `${code}_LENGTH`, `Expected ${binding.bytes} bytes; received ${bytes.byteLength}.`);
  exact(sha256(bytes) === binding.sha256, `${code}_SHA256`, `SHA-256 differs from ${binding.sha256}.`);
  return Object.freeze({ bytes: bytes.byteLength, sha256: sha256(bytes) });
}

async function assertFrozenFile(binding, tag) {
  const current = await readFile(path.join(root, binding.path));
  assertBytesBinding(current, binding, "FROZEN_FILE");
  const tagged = await gitBlob(tag, binding.path);
  assertBytesBinding(tagged, binding, "FROZEN_TAG_FILE");
  exact(current.equals(tagged), "FROZEN_FILE_BYTES", `${binding.path} differs from ${tag}.`);
}

async function verifySourceBindings() {
  const actualFiles = [];
  for (const binding of SOURCE_BINDING.files) {
    const currentText = (await readFile(path.join(root, binding.path), "utf8")).replace(/\r\n/gu, "\n");
    const currentHash = sha256(currentText);
    exact(currentHash === binding.sha256, "SOURCE_HASH", `${binding.path} differs from its frozen normalized hash.`, "source-binding");
    const originText = (await gitBlob(SOURCE_BINDING.productImplementationOriginCommit, binding.path)).toString("utf8").replace(/\r\n/gu, "\n");
    exact(sha256(originText) === binding.sha256, "SOURCE_ORIGIN_HASH", `${binding.path} is not bound by the declared production origin.`, "source-binding");
    exact(currentText === originText, "SOURCE_ORIGIN_BYTES", `${binding.path} differs from its bound production origin.`, "source-binding");
    actualFiles.push({ path: binding.path, sha256: currentHash });
  }
  return Object.freeze({
    productImplementationOriginCommit: SOURCE_BINDING.productImplementationOriginCommit,
    algorithm: SOURCE_BINDING.algorithm,
    files: actualFiles
  });
}

async function loadReference() {
  await assertAnnotatedTag(REFERENCE.tag, REFERENCE.commit, "REFERENCE_TAG");
  const artifactBytes = await gitBlob(REFERENCE.tag, REFERENCE.artifactPath);
  assertBytesBinding(artifactBytes, { sha256: REFERENCE.artifactSha256 }, "REFERENCE_ARTIFACT");
  let artifact;
  try {
    artifact = JSON.parse(artifactBytes.toString("utf8"));
  } catch {
    throw new V05Error("REFERENCE_JSON", "The immutable v0.4 artifact is not valid JSON.", "reference-binding");
  }
  exact(artifact?.schemaVersion === "qarinah.research-retrieval-development-result.v4", "REFERENCE_SCHEMA", "The immutable v0.4 schema differs.", "reference-binding");
  exact(artifact.expected && typeof artifact.expected === "object" && !Array.isArray(artifact.expected), "REFERENCE_EXPECTED", "The immutable v0.4 expected object is absent.", "reference-binding");
  const canonical = Buffer.from(JSON.stringify(artifact.expected), "utf8");
  assertBytesBinding(canonical, { bytes: REFERENCE.expectedCanonicalBytes, sha256: REFERENCE.expectedCanonicalSha256 }, "REFERENCE_EXPECTED");
  return Object.freeze({ artifact, expected: artifact.expected, canonical });
}

async function verifyCorpusBindings() {
  const corpusBytes = await readFile(path.join(root, CORPUS_BINDING.corpus.path));
  assertBytesBinding(corpusBytes, { sha256: CORPUS_BINDING.corpus.fileSha256 }, "CORPUS_FILE");
  let corpus;
  try {
    corpus = JSON.parse(corpusBytes.toString("utf8"));
  } catch {
    throw new V05Error("CORPUS_JSON", "The bound development corpus is not valid JSON.", "corpus-binding");
  }
  exact(corpus.contentDigest === CORPUS_BINDING.corpus.logicalContentDigest, "CORPUS_LOGICAL_DIGEST", "The bound corpus logical digest differs.", "corpus-binding");
  exact(corpus.generatedFrom?.sourceArtifact?.path === CORPUS_BINDING.raw.path, "CORPUS_RAW_PATH", "The corpus raw source path differs.", "corpus-binding");
  exact(corpus.generatedFrom?.sourceArtifact?.url === CORPUS_BINDING.raw.url, "CORPUS_RAW_URL", "The corpus raw source URL differs.", "corpus-binding");
  exact(corpus.generatedFrom?.sourceArtifact?.bytes === CORPUS_BINDING.raw.bytes, "CORPUS_RAW_LENGTH", "The corpus raw source byte binding differs.", "corpus-binding");
  exact(corpus.generatedFrom?.sourceArtifact?.sha256 === CORPUS_BINDING.raw.sha256, "CORPUS_RAW_SHA256", "The corpus raw source hash differs.", "corpus-binding");
  const loaderBytes = await readFile(path.join(root, CORPUS_BINDING.loader.path));
  assertBytesBinding(loaderBytes, { sha256: CORPUS_BINDING.loader.sha256 }, "CORPUS_LOADER");
  return Object.freeze({
    classification: "inspected-development-corpus",
    dataset: "princeton-nlp/SWE-bench_Lite",
    corpus: { ...CORPUS_BINDING.corpus },
    loader: { ...CORPUS_BINDING.loader },
    rawSourceArtifact: { ...CORPUS_BINDING.raw }
  });
}

export async function fetchBoundRawArtifact(fetchImpl = globalThis.fetch) {
  exact(typeof fetchImpl === "function", "RAW_FETCH_UNAVAILABLE", "A standards-compatible in-memory fetch implementation is required.", "raw-artifact-binding");
  let response;
  try {
    response = await fetchImpl(CORPUS_BINDING.raw.url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    throw new V05Error("RAW_FETCH_FAILED", `The exact raw source request failed: ${error?.message || "network error"}.`, "raw-artifact-binding");
  }
  exact(response?.ok === true, "RAW_FETCH_STATUS", `The exact raw source request returned HTTP ${response?.status ?? "unknown"}.`, "raw-artifact-binding");
  const bytes = Buffer.from(await response.arrayBuffer());
  assertBytesBinding(bytes, { bytes: CORPUS_BINDING.raw.bytes, sha256: CORPUS_BINDING.raw.sha256 }, "RAW_ARTIFACT");
  return Object.freeze({
    requestedUrl: CORPUS_BINDING.raw.url,
    redirected: Boolean(response.url && response.url !== CORPUS_BINDING.raw.url),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    retainedOnDisk: false
  });
}

async function listFailureReceipts() {
  const names = await readdir(path.join(root, "bench", "results"));
  return names.filter((name) => FAILURE_NAME_PATTERN.test(name)).sort();
}

export function assertOneShotDestinations({ resultPresent, failureReceipts, attemptId = null }) {
  exact(resultPresent === false, "RESULT_DESTINATION_PRESENT", "The v0.5 result destination already exists.", "destination-binding");
  exact(Array.isArray(failureReceipts), "FAILURE_DESTINATION_STATE", "Failure-receipt state must be an array.", "destination-binding");
  exact(
    failureReceipts.length === 0,
    "FAILURE_DESTINATION_PRESENT",
    `A v0.5 failure receipt already exists${attemptId ? ` for or before ${attemptId}` : ""}.`,
    "destination-binding"
  );
  return true;
}

export function assertSingleIntroduction(commits, code = "ARTIFACT_INTRODUCTION", stage = "provenance") {
  exact(Array.isArray(commits), `${code}_TYPE`, "Introducing commits must be an array.", stage);
  exact(commits.length === 1, `${code}_COUNT`, "The artifact must have exactly one introducing commit and must never be re-added.", stage);
  assertCommit(commits[0], `${code}_COMMIT`, stage);
  return commits[0];
}

async function assertDestinationsAbsent(attemptId = null) {
  return assertOneShotDestinations({
    resultPresent: await exists(resultPath),
    failureReceipts: await listFailureReceipts(),
    attemptId
  });
}

async function packageState() {
  const packageBytes = await readFile(path.join(root, "package.json"));
  const packageJson = JSON.parse(packageBytes.toString("utf8"));
  for (const contract of Object.values(MODE_CONTRACTS)) {
    exact(packageJson.scripts?.[contract.lifecycleEvent] === contract.lifecycleScript, "PACKAGE_SCRIPT_BINDING", `${contract.lifecycleEvent} differs from the frozen command.`, "package-binding");
  }
  exact(packageJson.scripts?.["check:research-production-evidence"] === "node scripts/evaluate-research-retrieval-v0.4.mjs", "PACKAGE_V04_CHECK_DRIFT", "The normal v0.4 production-evidence check changed.", "package-binding");
  exact(packageJson.files?.includes("scripts/evaluate-research-retrieval-v0.5.mjs"), "PACKAGE_FILE_MISSING", "The v0.5 evaluator is absent from the package file list.", "package-binding");
  const evaluatorBytes = await readFile(fileURLToPath(import.meta.url));
  const typesBytes = await readFile(path.join(root, "types", "index.d.ts"));
  return Object.freeze({
    packageJson,
    evaluator: { path: "scripts/evaluate-research-retrieval-v0.5.mjs", sha256: sha256(evaluatorBytes) },
    package: { path: "package.json", sha256: sha256(packageBytes) },
    types: { path: "types/index.d.ts", sha256: sha256(typesBytes) }
  });
}

async function inspectStaticBindings({ requireDestinationsAbsent = false, fetchRaw = false } = {}) {
  await assertAnnotatedTag(PROTOCOL.tag, PROTOCOL.commit, "PROTOCOL_TAG");
  await assertAncestor(PROTOCOL.commit, "HEAD", "PROTOCOL_ANCESTRY");
  await assertFrozenFile(PROTOCOL.manifest, PROTOCOL.tag);
  await assertFrozenFile(PROTOCOL.document, PROTOCOL.tag);
  const reference = await loadReference();
  const sourceBinding = await verifySourceBindings();
  const corpusBinding = await verifyCorpusBindings();
  const packageBinding = await packageState();
  if (requireDestinationsAbsent) await assertDestinationsAbsent();
  const rawObservation = fetchRaw ? await fetchBoundRawArtifact() : null;
  return Object.freeze({ reference, sourceBinding, corpusBinding, packageBinding, rawObservation });
}

function canonicalExpected(expected) {
  const bytes = Buffer.from(JSON.stringify(expected), "utf8");
  return Object.freeze({
    algorithm: REFERENCE.expectedCanonicalAlgorithm,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    bytes
  });
}

function verifyExpectedProjection(candidate, reference) {
  assert.deepStrictEqual(candidate, reference.expected, "The complete generated expected object differs from immutable v0.4.");
  const candidateCanonical = canonicalExpected(candidate);
  assertBytesBinding(candidateCanonical.bytes, {
    bytes: REFERENCE.expectedCanonicalBytes,
    sha256: REFERENCE.expectedCanonicalSha256
  }, "CANDIDATE_EXPECTED");
  exact(candidateCanonical.bytes.equals(reference.canonical), "CANDIDATE_EXPECTED_BYTES", "Candidate canonical bytes differ from immutable v0.4.", "projection-equality");
  return Object.freeze({
    algorithm: candidateCanonical.algorithm,
    byteLength: candidateCanonical.byteLength,
    sha256: candidateCanonical.sha256,
    deepStrictEqual: true,
    referenceBytesEqual: true
  });
}

function sanitizeFailureMessage(error) {
  return String(error?.message || "v0.5 execution failed")
    .replaceAll(root, "<repository>")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\s{2,}/gu, " ")
    .replace(/(authorization|bearer|token|password|secret)\s*[:=]\s*\S+/giu, "$1=[REDACTED]")
    .slice(0, 512);
}

export async function atomicPublishJsonNoReplace(destination, value, verify = null, hooks = {}) {
  const serialized = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(serialized);
    await handle.sync();
    await handle.close();
    handle = null;
    const persisted = await readFile(temporary);
    exact(persisted.equals(serialized), "ATOMIC_TEMP_BYTES", "Exclusive temporary-file bytes changed before publication.", "publication");
    const parsed = JSON.parse(persisted.toString("utf8"));
    if (verify) await verify(parsed, persisted);
    await link(temporary, destination);
    if (hooks.afterLink) await hooks.afterLink(destination);
    return Object.freeze({ bytes: serialized.byteLength, sha256: sha256(serialized) });
  } catch (error) {
    if (error?.code === "EEXIST") throw new V05Error("ATOMIC_DESTINATION_EXISTS", "Atomic no-replace publication refused an existing destination.", "publication");
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (await exists(temporary)) await unlink(temporary).catch(() => {});
  }
}

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mean(values) {
  return values.length === 0 ? null : rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return rounded(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * probability) - 1))]);
}

function deterministicEventId(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const compact = hex.join("");
  return `evt_${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function workspaceId(repository) {
  return `ws_${createHash("sha256").update(`v0.2:${repository}`).digest("hex").slice(0, 32)}`;
}

function firstLine(value) {
  return value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean)?.slice(0, 512) || "SWE-bench task";
}

function eventText(event) {
  return `${event.title}\n${event.body}`;
}

function estimatedTokens(textOrCharacters) {
  const characters = typeof textOrCharacters === "number" ? textOrCharacters : textOrCharacters.length;
  return Math.ceil(characters / 4);
}

function overlap(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function materializeRepository(repository, rows, taskById) {
  let previousHash = null;
  const latestByFile = new Map();
  const records = [];
  for (const row of rows) {
    const task = taskById.get(row.instance_id);
    const eventId = deterministicEventId(`v0.2:${task.instanceId}`);
    const relations = new Set();
    for (const file of task.patchFiles) {
      const previous = latestByFile.get(file);
      if (previous) relations.add(previous);
    }
    const event = createEventEnvelope({
      eventId,
      timestamp: task.createdAt,
      kind: "artifact",
      actor: { type: "source", id: "swe-bench-lite" },
      title: firstLine(row.problem_statement),
      body: [
        row.problem_statement.trim(),
        "",
        "Resolved production files from this completed historical task:",
        ...task.patchFiles,
        "",
        "Extracted changed symbols from this completed historical task:",
        ...task.changedSymbols
      ].join("\n"),
      data: {
        instanceId: task.instanceId,
        benchmarkVersion: task.version,
        resolvedFiles: task.patchFiles.join(", "),
        resolvedSymbols: task.changedSymbols.join(", "),
        moduleScopes: task.moduleScopes.join(", ")
      },
      confidence: "verified",
      repository: { id: repository, branch: null, commit: task.baseCommit },
      disclosure: { classification: "public", scopes: [] },
      relations: [...relations].sort().slice(0, 128).map((target) => ({ type: "references", target })),
      provenance: {
        adapter: "swe-bench-lite-development-v0.2",
        sourceId: `https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite#${task.instanceId}`
      },
      retention: { class: "durable", expiresAt: null }
    }, { workspaceId: workspaceId(repository), previousHash });
    previousHash = event.hash;
    records.push({ ...task, row, event, eventId });
    for (const file of task.patchFiles) latestByFile.set(file, eventId);
  }
  return records;
}

function relevanceGrades(prior, current) {
  const grades = new Map();
  const currentFiles = new Set(current.patchFiles);
  const currentSymbols = new Set(current.changedSymbols);
  const currentModules = new Set(current.moduleScopes);
  for (const record of prior) {
    const direct = overlap(record.patchFiles, currentFiles).length > 0
      || overlap(record.changedSymbols, currentSymbols).length > 0;
    const supporting = !direct && overlap(record.moduleScopes, currentModules).length > 0;
    if (direct) grades.set(record.eventId, 2);
    else if (supporting) grades.set(record.eventId, 1);
  }
  return grades;
}

function retrievalMetrics(ids, grades) {
  if (grades.size === 0) return null;
  const direct = new Set([...grades].filter(([, grade]) => grade === 2).map(([eventId]) => eventId));
  const relevant = new Set(grades.keys());
  const top10 = ids.slice(0, 10);
  const top5 = ids.slice(0, 5);
  const top1 = ids.slice(0, 1);
  const hits = (selected, targets) => selected.filter((eventId) => targets.has(eventId)).length;
  const first = ids.slice(0, 10).findIndex((eventId) => relevant.has(eventId));
  let dcg = 0;
  top10.forEach((eventId, index) => {
    const grade = grades.get(eventId) ?? 0;
    dcg += (2 ** grade - 1) / Math.log2(index + 2);
  });
  const idealGrades = [...grades.values()].sort((left, right) => right - left).slice(0, 10);
  const idcg = idealGrades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  return {
    recallAt1: rounded(hits(top1, relevant) / relevant.size),
    recallAt5: rounded(hits(top5, relevant) / relevant.size),
    recallAt10: rounded(hits(top10, relevant) / relevant.size),
    precisionAt5: rounded(hits(top5, relevant) / 5),
    precisionAt10: rounded(hits(top10, relevant) / 10),
    reciprocalRank: first === -1 ? 0 : rounded(1 / (first + 1)),
    ndcgAt10: idcg === 0 ? 0 : rounded(dcg / idcg),
    directRecallAt10: direct.size === 0 ? null : rounded(hits(top10, direct) / direct.size),
    supportingRecallAt10: rounded(hits(top10, relevant) / relevant.size)
  };
}

function bm25Only(index, query, limit = 100) {
  const queryTerms = tokenize(query);
  const documentCount = Math.max(1, index.events.length);
  const averageLength = index.averageDocumentLength > 0 ? index.averageDocumentLength : 1;
  return index.events.map((event) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = event.termFrequencies?.[term] || 0;
      if (frequency === 0) continue;
      const documentsWithTerm = index.documentFrequency?.[term] || 0;
      const inverseFrequency = Math.log(1 + ((documentCount - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5)));
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * ((event.documentLength || 0) / averageLength));
      score += inverseFrequency * ((frequency * 2.2) / denominator) * (event.titleTerms?.includes(term) ? 1.8 : 1);
    }
    return { eventId: event.eventId, score };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.eventId.localeCompare(right.eventId))
    .slice(0, limit).map((entry) => entry.eventId);
}

function oracleRanking(grades) {
  return [...grades].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([eventId]) => eventId);
}

function selectWithinBudget(ids, eventsById, budget) {
  const selected = [];
  let used = 0;
  for (const eventId of ids) {
    const tokens = estimatedTokens(eventText(eventsById.get(eventId)));
    if (used + tokens > budget) continue;
    selected.push(eventId);
    used += tokens;
  }
  return { ids: selected, tokens: used };
}

function summarize(taskResults, method) {
  const scorable = taskResults.filter((task) => task.metrics[method] !== null);
  const keys = ["recallAt1", "recallAt5", "recallAt10", "precisionAt5", "precisionAt10", "reciprocalRank", "ndcgAt10"];
  return {
    tasks: taskResults.length,
    scorableTasks: scorable.length,
    ...Object.fromEntries(keys.map((key) => [`mean${key[0].toUpperCase()}${key.slice(1)}`, mean(scorable.map((task) => task.metrics[method][key]))])),
    meanDirectRecallAt10: mean(scorable.map((task) => task.metrics[method].directRecallAt10).filter((value) => value !== null)),
    totalEstimatedContextTokens: taskResults.reduce((sum, task) => sum + task.volumes[method], 0)
  };
}

function classificationMetrics(observations) {
  const supported = observations.filter((entry) => entry.supported);
  const positives = observations.filter((entry) => entry.positive);
  const negatives = observations.filter((entry) => !entry.positive);
  const truePositive = supported.filter((entry) => entry.positive).length;
  const falsePositive = supported.filter((entry) => !entry.positive).length;
  const trueNegative = observations.filter((entry) => !entry.supported && !entry.positive).length;
  let concordant = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      concordant += positive.score > negative.score ? 1 : (positive.score === negative.score ? 0.5 : 0);
    }
  }
  const sorted = [...observations].sort((left, right) => right.score - left.score || Number(right.positive) - Number(left.positive));
  let seenPositive = 0;
  let averagePrecision = 0;
  sorted.forEach((entry, index) => {
    if (!entry.positive) return;
    seenPositive += 1;
    averagePrecision += seenPositive / (index + 1);
  });
  let calibrationError = 0;
  for (let bin = 0; bin < 10; bin += 1) {
    const lower = bin / 10;
    const upper = (bin + 1) / 10;
    const members = observations.filter((entry) => entry.score >= lower && (bin === 9 ? entry.score <= upper : entry.score < upper));
    if (members.length === 0) continue;
    calibrationError += (members.length / observations.length) * Math.abs(
      members.reduce((sum, entry) => sum + entry.score, 0) / members.length
      - members.filter((entry) => entry.positive).length / members.length
    );
  }
  const riskCoverage = [0.1, 0.25, 0.5, 0.75, 1].map((coverage) => {
    const count = Math.max(1, Math.ceil(sorted.length * coverage));
    const selected = sorted.slice(0, count);
    return {
      coverage,
      threshold: selected.at(-1).score,
      risk: rounded(1 - selected.filter((entry) => entry.positive).length / selected.length)
    };
  });
  return {
    positives: positives.length,
    noPositiveUnderStructuralOracle: negatives.length,
    supported: supported.length,
    supportedPrecision: supported.length === 0 ? null : rounded(truePositive / supported.length),
    supportedRecall: positives.length === 0 ? null : rounded(truePositive / positives.length),
    noPositiveFalseAcceptanceRate: negatives.length === 0 ? null : rounded(falsePositive / negatives.length),
    noPositiveCorrectAbstentionRate: negatives.length === 0 ? null : rounded(trueNegative / negatives.length),
    rocAuc: positives.length === 0 || negatives.length === 0 ? null : rounded(concordant / (positives.length * negatives.length)),
    prAucAveragePrecision: positives.length === 0 ? null : rounded(averagePrecision / positives.length),
    brierScore: mean(observations.map((entry) => (entry.score - Number(entry.positive)) ** 2)),
    expectedCalibrationError10Bin: rounded(calibrationError),
    riskCoverage
  };
}

function exactEdgeInterval95(successes, trials) {
  if (trials === 0) return null;
  const tail = 0.025;
  if (successes === 0) return {
    method: "Clopper-Pearson exact two-sided",
    successes,
    trials,
    lower: 0,
    upper: rounded(1 - (tail ** (1 / trials)))
  };
  if (successes === trials) return {
    method: "Clopper-Pearson exact two-sided",
    successes,
    trials,
    lower: rounded(tail ** (1 / trials)),
    upper: 1
  };
  throw new RangeError("This development artifact records exact edge intervals only for zero/all-success outcomes.");
}

function directDecisionMetrics(tasks) {
  const positives = tasks.filter((task) => task.positiveUnderStructuralOracle);
  const negatives = tasks.filter((task) => !task.positiveUnderStructuralOracle);
  const accepted = tasks.filter((task) => task.evidenceSufficiency.decision === "ACCEPT_DIRECT");
  const truePositive = accepted.filter((task) => task.positiveUnderStructuralOracle).length;
  const falsePositive = accepted.filter((task) => !task.positiveUnderStructuralOracle).length;
  const precision = accepted.length === 0 ? null : truePositive / accepted.length;
  const recall = positives.length === 0 ? null : truePositive / positives.length;
  assert.equal(falsePositive, 0, "Current production evidence-sufficiency-v2 produced a structural-oracle false accept.");
  assert.equal(truePositive, accepted.length, "Current production direct precision is not an all-success edge case.");
  return {
    method: "evidence-sufficiency-v2",
    directThreshold: 0.65,
    partialThreshold: 0.4,
    tasks: tasks.length,
    positives: positives.length,
    noPositiveUnderStructuralOracle: negatives.length,
    acceptedDirect: accepted.length,
    abstained: tasks.length - accepted.length,
    truePositive,
    falsePositive,
    trueNegative: negatives.length - falsePositive,
    falseNegative: positives.length - truePositive,
    acceptedPrecision: precision === null ? null : rounded(precision),
    acceptedRecall: recall === null ? null : rounded(recall),
    acceptedF1: precision === null || recall === null || precision + recall === 0
      ? null
      : rounded((2 * precision * recall) / (precision + recall)),
    falseAcceptanceRate: negatives.length === 0 ? null : rounded(falsePositive / negatives.length),
    correctAbstentionRate: negatives.length === 0 ? null : rounded((negatives.length - falsePositive) / negatives.length),
    acceptanceCoverage: rounded(accepted.length / tasks.length),
    stateCounts: Object.fromEntries(["DIRECTLY_SUPPORTED", "PARTIALLY_SUPPORTED", "INSUFFICIENT_EVIDENCE"]
      .map((state) => [state, tasks.filter((task) => task.evidenceSufficiency.state === state).length])),
    confidenceIntervals95: {
      acceptedPrecision: accepted.length === 0 ? null : exactEdgeInterval95(truePositive, accepted.length),
      falseAcceptanceRate: negatives.length === 0 ? null : exactEdgeInterval95(falsePositive, negatives.length)
    }
  };
}

function seededRandom(seedText) {
  let state = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function repositoryClusterBootstrap(taskResults, left, right, metric, seed) {
  const byRepository = new Map();
  for (const task of taskResults.filter((entry) => entry.metrics[left] !== null)) {
    if (!byRepository.has(task.repository)) byRepository.set(task.repository, []);
    byRepository.get(task.repository).push(task);
  }
  const repositories = [...byRepository.keys()].sort();
  const random = seededRandom(`${seed}:${left}:${right}:${metric}:repository-cluster`);
  const differences = [];
  for (let sample = 0; sample < BOOTSTRAP_SAMPLES; sample += 1) {
    const sampled = [];
    for (let index = 0; index < repositories.length; index += 1) {
      sampled.push(...byRepository.get(repositories[Math.floor(random() * repositories.length)]));
    }
    differences.push(sampled.reduce((sum, task) => sum + task.metrics[left][metric] - task.metrics[right][metric], 0) / sampled.length);
  }
  const observed = mean(taskResults.filter((task) => task.metrics[left] !== null)
    .map((task) => task.metrics[left][metric] - task.metrics[right][metric]));
  return {
    method: "repository-clustered-bootstrap",
    samples: BOOTSTRAP_SAMPLES,
    clusters: repositories.length,
    pairedTasks: taskResults.filter((task) => task.metrics[left] !== null).length,
    left,
    right,
    metric,
    observedMeanDifference: observed,
    confidenceInterval95: [percentile(differences, 0.025), percentile(differences, 0.975)]
  };
}

function evaluateSetting(records, setting, taskById) {
  const warmup = records.filter((record) => record.phase === "warmup");
  const heldout = records.filter((record) => record.phase === "heldout");
  const eventsById = new Map(records.map((record) => [record.eventId, record.event]));
  const fullIndex = buildDerivedState(records.map((record) => record.event), workspaceId(records[0].repository)).index;
  const afterAll = new Date(Date.parse(records.at(-1).createdAt) + 86_400_000).toISOString();
  const results = [];
  for (const current of heldout) {
    const currentIndex = records.findIndex((record) => record.instanceId === current.instanceId);
    const prior = setting === "static"
      ? warmup
      : records.slice(0, currentIndex);
    const priorIndex = buildDerivedState(prior.map((record) => record.event), workspaceId(current.repository)).index;
    const grades = relevanceGrades(prior, current);
    const query = current.row.problem_statement;
    const asOf = current.createdAt;
    const bm25 = bm25Only(priorIndex, query);
    const balancedResult = rankContextEvents(priorIndex, query, {
      asOf,
      temporalBoundary: "strict-before",
      repositoryIds: [current.repository],
      rankingProfile: "balanced-v1",
      limit: 100
    });
    const qarinahResult = rankContextEvents(priorIndex, query, {
      asOf,
      temporalBoundary: "strict-before",
      repositoryIds: [current.repository],
      rankingProfile: "admission-first-v2",
      limit: 100
    });
    const noGraphResult = rankContextEvents(priorIndex, query, {
      asOf,
      temporalBoundary: "strict-before",
      repositoryIds: [current.repository],
      rankingProfile: "admission-first-v2",
      includeGraph: false,
      limit: 100
    });
    const noTemporalResult = rankContextEvents(fullIndex, query, {
      asOf: afterAll,
      repositoryIds: [current.repository],
      rankingProfile: "admission-first-v2",
      limit: TOP_K
    });
    const rankings = {
      bm25Admitted: bm25,
      balancedV1: balancedResult.ranked.map((entry) => entry.event.eventId),
      qarinahV2: qarinahResult.ranked.map((entry) => entry.event.eventId),
      qarinahV2NoGraph: noGraphResult.ranked.map((entry) => entry.event.eventId),
      oracle: oracleRanking(grades)
    };
    const futureIds = new Set(records.slice(currentIndex).map((record) => record.eventId));
    const noTemporalIds = noTemporalResult.ranked.map((entry) => entry.event.eventId);
    const volumes = Object.fromEntries(Object.entries(rankings).map(([method, ids]) => [
      method,
      ids.slice(0, TOP_K).reduce((sum, eventId) => sum + estimatedTokens(eventText(eventsById.get(eventId))), 0)
    ]));
    const budgets = Object.fromEntries(BUDGETS.map((budget) => [budget, Object.fromEntries(
      Object.entries(rankings).map(([method, ids]) => {
        const selected = selectWithinBudget(ids, eventsById, budget);
        return [method, { deliveredTokens: selected.tokens, metrics: retrievalMetrics(selected.ids, grades) }];
      })
    )]));
    const sufficiency = qarinahResult.evidenceSufficiency;
    assert.equal(sufficiency.method, "evidence-sufficiency-v2");
    assert.equal(sufficiency.directThreshold, 0.65);
    assert.equal(sufficiency.partialThreshold, 0.4);
    assert.equal(
      sufficiency.decision,
      sufficiency.state === "DIRECTLY_SUPPORTED" ? "ACCEPT_DIRECT" : "ABSTAIN"
    );
    results.push({
      repository: current.repository,
      instanceId: current.instanceId,
      repositorySequence: taskById.get(current.instanceId).repositorySequence,
      positiveUnderStructuralOracle: grades.size > 0,
      directRecords: [...grades.values()].filter((grade) => grade === 2).length,
      supportingRecords: [...grades.values()].filter((grade) => grade === 1).length,
      metrics: Object.fromEntries(Object.entries(rankings).map(([method, ids]) => [method, retrievalMetrics(ids, grades)])),
      volumes,
      budgets,
      evidenceSufficiency: {
        method: sufficiency.method,
        state: sufficiency.state,
        decision: sufficiency.decision,
        score: sufficiency.score,
        directThreshold: sufficiency.directThreshold,
        partialThreshold: sufficiency.partialThreshold,
        reasonCodes: sufficiency.reasonCodes
      },
      noTemporalFutureItems: noTemporalIds.filter((eventId) => futureIds.has(eventId)).length,
      noTemporalReturnedItems: noTemporalIds.length
    });
  }
  return results;
}

const METHODS = Object.freeze(["bm25Admitted", "balancedV1", "qarinahV2", "qarinahV2NoGraph", "oracle"]);

function settingSummary(tasks) {
  const returnedItems = tasks.reduce((sum, task) => sum + task.noTemporalReturnedItems, 0);
  const futureItems = tasks.reduce((sum, task) => sum + task.noTemporalFutureItems, 0);
  const affectedQueries = tasks.filter((task) => task.noTemporalFutureItems > 0).length;
  const classification = classificationMetrics(tasks.map((task) => ({
    positive: task.positiveUnderStructuralOracle,
    supported: task.evidenceSufficiency.state !== "INSUFFICIENT_EVIDENCE",
    score: task.evidenceSufficiency.score
  })));
  return {
    tasks: tasks.length,
    positiveUnderStructuralOracle: tasks.filter((task) => task.positiveUnderStructuralOracle).length,
    noPositiveUnderStructuralOracle: tasks.filter((task) => !task.positiveUnderStructuralOracle).length,
    methods: Object.fromEntries(METHODS.map((method) => [method, summarize(tasks, method)])),
    evidenceSufficiency: classification,
    directDecision: directDecisionMetrics(tasks),
    noTemporalAblation: {
      returnedItems,
      futureItems,
      futureItemRate: returnedItems === 0 ? null : rounded(futureItems / returnedItems),
      affectedQueries,
      affectedQueryRate: rounded(affectedQueries / tasks.length)
    },
    budgetCurves: Object.fromEntries(BUDGETS.map((budget) => [budget, Object.fromEntries(METHODS.map((method) => {
      const scorable = tasks.filter((task) => task.budgets[budget][method].metrics !== null);
      return [method, {
        meanRecallAt10: mean(scorable.map((task) => task.budgets[budget][method].metrics.recallAt10)),
        meanNdcgAt10: mean(scorable.map((task) => task.budgets[budget][method].metrics.ndcgAt10)),
        totalDeliveredTokens: tasks.reduce((sum, task) => sum + task.budgets[budget][method].deliveredTokens, 0)
      }];
    }))]))
  };
}

async function generateCandidateProjection() {
  const production = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  const loader = await import(pathToFileURL(path.join(root, "bench", "research", "swe-bench-lite.mjs")).href);
  ({ buildDerivedState, createEventEnvelope, rankContextEvents, tokenize } = production);
  ({ loadPinnedDevelopmentDataset } = loader);
  exact(
    [buildDerivedState, createEventEnvelope, rankContextEvents, tokenize, loadPinnedDevelopmentDataset].every((value) => typeof value === "function"),
    "DYNAMIC_IMPORT_EXPORTS",
    "The bound production retrieval or corpus loader exports are incomplete.",
    "dynamic-import"
  );

  const committedCorpus = JSON.parse(await readFile(corpusPath, "utf8"));
  const { corpus, rows } = await loadPinnedDevelopmentDataset({
    sourceArtifact: committedCorpus.generatedFrom.sourceArtifact
  });
  assert.deepStrictEqual(corpus, committedCorpus, "The bound loader projection differs from the committed development corpus.");
  const taskById = new Map(corpus.tasks.map((task) => [task.instanceId, task]));
  const rowsByRepository = new Map();
  for (const row of rows) {
    if (!rowsByRepository.has(row.repo)) rowsByRepository.set(row.repo, []);
    rowsByRepository.get(row.repo).push(row);
  }
  for (const repositoryRows of rowsByRepository.values()) {
    repositoryRows.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.instance_id.localeCompare(right.instance_id));
  }

  const settings = { static: [], onlinePrequential: [] };
  const started = process.hrtime.bigint();
  for (const [repository, repositoryRows] of [...rowsByRepository].sort(([left], [right]) => left.localeCompare(right))) {
    const records = materializeRepository(repository, repositoryRows, taskById);
    settings.static.push(...evaluateSetting(records, "static", taskById));
    settings.onlinePrequential.push(...evaluateSetting(records, "online", taskById));
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const expected = {
    corpus: {
      digest: corpus.contentDigest,
      rawTestParquetSha256: corpus.generatedFrom.sourceArtifact.sha256,
      officialPageDeclaredRepositories: 11,
      pinnedRevisionObservedRepositories: 12,
      discrepancyRecorded: true,
      exploratoryReuse: true,
      tasks: 300,
      heldoutTasks: 240
    },
    settings: {
      static: settingSummary(settings.static),
      onlinePrequential: settingSummary(settings.onlinePrequential)
    },
    inference: [
      repositoryClusterBootstrap(settings.onlinePrequential, "qarinahV2", "bm25Admitted", "recallAt10", corpus.contentDigest),
      repositoryClusterBootstrap(settings.onlinePrequential, "qarinahV2", "balancedV1", "recallAt10", corpus.contentDigest),
      repositoryClusterBootstrap(settings.onlinePrequential, "qarinahV2", "balancedV1", "reciprocalRank", corpus.contentDigest)
    ],
    taskResults: {
      static: settings.static,
      onlinePrequential: settings.onlinePrequential
    }
  };

  assert.equal(expected.settings.static.tasks, 240);
  assert.equal(expected.settings.onlinePrequential.tasks, 240);
  assert.ok(expected.settings.onlinePrequential.methods.qarinahV2.meanRecallAt10
    >= expected.settings.onlinePrequential.methods.balancedV1.meanRecallAt10);
  assert.ok(expected.settings.onlinePrequential.noTemporalAblation.futureItems > 0);
  return Object.freeze({ expected, elapsedMs: rounded(elapsedMs) });
}

function protocolBindingFrom(authorization) {
  return {
    protocol: {
      commit: PROTOCOL.commit,
      tag: PROTOCOL.tag,
      manifestSha256: PROTOCOL.manifest.sha256,
      documentSha256: PROTOCOL.document.sha256
    },
    immutableV04Reference: {
      commit: REFERENCE.commit,
      tag: REFERENCE.tag,
      artifactPath: REFERENCE.artifactPath,
      artifactSha256: REFERENCE.artifactSha256,
      expectedCanonicalAlgorithm: REFERENCE.expectedCanonicalAlgorithm,
      expectedCanonicalByteLength: REFERENCE.expectedCanonicalBytes,
      expectedCanonicalSha256: REFERENCE.expectedCanonicalSha256
    },
    evaluator: { ...authorization.receipt.evaluatorBinding },
    package: { ...authorization.receipt.packageBinding },
    types: { ...authorization.receipt.typesBinding },
    authorizationReceipt: {
      path: path.relative(root, authorizationPath).replaceAll("\\", "/"),
      commit: authorization.commit,
      sha256: authorization.sha256,
      attemptId: authorization.receipt.attemptId
    }
  };
}

function validateProtocolCoreBinding(binding, code, stage) {
  assertExactObjectKeys(binding, ["commit", "tag", "manifestSha256", "documentSha256"], code, stage);
  assertCommit(binding.commit, `${code}_COMMIT`, stage);
  exact(typeof binding.tag === "string" && binding.tag.length > 0, `${code}_TAG`, `${code} tag is absent.`, stage);
  assertSha256(binding.manifestSha256, `${code}_MANIFEST_SHA256`, stage);
  assertSha256(binding.documentSha256, `${code}_DOCUMENT_SHA256`, stage);
}

function validateEvaluatorBinding(binding, code, stage) {
  assertExactObjectKeys(binding, ["path", "commit", "tag", "sha256"], code, stage);
  exact(binding.path === "scripts/evaluate-research-retrieval-v0.5.mjs", `${code}_PATH`, `${code} evaluator path differs.`, stage);
  assertCommit(binding.commit, `${code}_COMMIT`, stage);
  exact(typeof binding.tag === "string" && binding.tag.length > 0, `${code}_TAG`, `${code} evaluator tag is absent.`, stage);
  assertSha256(binding.sha256, `${code}_SHA256`, stage);
}

function validateCommittedFileBinding(binding, expectedPath, code, stage) {
  assertExactObjectKeys(binding, ["path", "commit", "sha256"], code, stage);
  exact(binding.path === expectedPath, `${code}_PATH`, `${code} path differs.`, stage);
  assertCommit(binding.commit, `${code}_COMMIT`, stage);
  assertSha256(binding.sha256, `${code}_SHA256`, stage);
}

function validateImmutableReferenceBinding(binding, code, stage) {
  assertExactObjectKeys(binding, [
    "commit", "tag", "artifactPath", "artifactSha256", "expectedCanonicalAlgorithm",
    "expectedCanonicalByteLength", "expectedCanonicalSha256"
  ], code, stage);
  assertCommit(binding.commit, `${code}_COMMIT`, stage);
  exact(typeof binding.tag === "string" && binding.tag.length > 0, `${code}_TAG`, `${code} tag is absent.`, stage);
  exact(typeof binding.artifactPath === "string" && binding.artifactPath.length > 0, `${code}_ARTIFACT_PATH`, `${code} artifact path is absent.`, stage);
  assertSha256(binding.artifactSha256, `${code}_ARTIFACT_SHA256`, stage);
  exact(binding.expectedCanonicalAlgorithm === REFERENCE.expectedCanonicalAlgorithm, `${code}_ALGORITHM`, `${code} canonical algorithm differs.`, stage);
  exact(Number.isSafeInteger(binding.expectedCanonicalByteLength) && binding.expectedCanonicalByteLength > 0, `${code}_BYTES`, `${code} canonical byte length is invalid.`, stage);
  assertSha256(binding.expectedCanonicalSha256, `${code}_EXPECTED_SHA256`, stage);
}

function validateSourceBindingShape(binding, code, stage) {
  assertExactObjectKeys(binding, ["productImplementationOriginCommit", "algorithm", "files"], code, stage);
  assertCommit(binding.productImplementationOriginCommit, `${code}_ORIGIN_COMMIT`, stage);
  exact(typeof binding.algorithm === "string" && binding.algorithm.length > 0, `${code}_ALGORITHM`, `${code} hash algorithm is absent.`, stage);
  exact(Array.isArray(binding.files) && binding.files.length > 0, `${code}_FILES`, `${code} files must be a non-empty array.`, stage);
  binding.files.forEach((file, index) => {
    assertExactObjectKeys(file, ["path", "sha256"], `${code}_FILE_${index}`, stage);
    exact(typeof file.path === "string" && file.path.length > 0, `${code}_FILE_PATH`, `${code} file path is absent.`, stage);
    assertSha256(file.sha256, `${code}_FILE_SHA256`, stage);
  });
}

function validateCorpusBindingShape(binding, { rawVerification }, code, stage) {
  const keys = ["classification", "dataset", "corpus", "loader", "rawSourceArtifact"];
  if (rawVerification) keys.push("rawSourceVerification");
  assertExactObjectKeys(binding, keys, code, stage);
  exact(binding.classification === "inspected-development-corpus", `${code}_CLASSIFICATION`, `${code} classification differs.`, stage);
  exact(binding.dataset === "princeton-nlp/SWE-bench_Lite", `${code}_DATASET`, `${code} dataset differs.`, stage);
  assertExactObjectKeys(binding.corpus, ["path", "fileSha256", "logicalContentDigest"], `${code}_CORPUS`, stage);
  exact(typeof binding.corpus.path === "string" && binding.corpus.path.length > 0, `${code}_CORPUS_PATH`, `${code} corpus path is absent.`, stage);
  assertSha256(binding.corpus.fileSha256, `${code}_CORPUS_FILE_SHA256`, stage);
  assertSha256(binding.corpus.logicalContentDigest, `${code}_CORPUS_LOGICAL_SHA256`, stage);
  assertExactObjectKeys(binding.loader, ["path", "sha256"], `${code}_LOADER`, stage);
  exact(typeof binding.loader.path === "string" && binding.loader.path.length > 0, `${code}_LOADER_PATH`, `${code} loader path is absent.`, stage);
  assertSha256(binding.loader.sha256, `${code}_LOADER_SHA256`, stage);
  assertExactObjectKeys(binding.rawSourceArtifact, ["path", "url", "bytes", "sha256"], `${code}_RAW`, stage);
  exact(typeof binding.rawSourceArtifact.path === "string" && binding.rawSourceArtifact.path.length > 0, `${code}_RAW_PATH`, `${code} raw path is absent.`, stage);
  exact(typeof binding.rawSourceArtifact.url === "string" && binding.rawSourceArtifact.url.startsWith("https://"), `${code}_RAW_URL`, `${code} raw URL is invalid.`, stage);
  exact(Number.isSafeInteger(binding.rawSourceArtifact.bytes) && binding.rawSourceArtifact.bytes > 0, `${code}_RAW_BYTES`, `${code} raw byte length is invalid.`, stage);
  assertSha256(binding.rawSourceArtifact.sha256, `${code}_RAW_SHA256`, stage);
  if (rawVerification) {
    assertExactObjectKeys(binding.rawSourceVerification, ["requestedUrl", "redirected", "bytes", "sha256", "retainedOnDisk"], `${code}_RAW_VERIFICATION`, stage);
    exact(typeof binding.rawSourceVerification.requestedUrl === "string" && binding.rawSourceVerification.requestedUrl.startsWith("https://"), `${code}_RAW_REQUEST_URL`, `${code} raw request URL is invalid.`, stage);
    exact(typeof binding.rawSourceVerification.redirected === "boolean", `${code}_RAW_REDIRECTED`, `${code} raw redirect flag is invalid.`, stage);
    exact(Number.isSafeInteger(binding.rawSourceVerification.bytes) && binding.rawSourceVerification.bytes > 0, `${code}_RAW_VERIFIED_BYTES`, `${code} verified byte length is invalid.`, stage);
    assertSha256(binding.rawSourceVerification.sha256, `${code}_RAW_VERIFIED_SHA256`, stage);
    exact(binding.rawSourceVerification.retainedOnDisk === false, `${code}_RAW_RETENTION`, `${code} raw bytes must not be retained on disk.`, stage);
  }
}

function validateResultProtocolBinding(binding, code, stage) {
  assertExactObjectKeys(binding, [
    "protocol", "immutableV04Reference", "evaluator", "package", "types", "authorizationReceipt"
  ], code, stage);
  validateProtocolCoreBinding(binding.protocol, `${code}_PROTOCOL`, stage);
  validateImmutableReferenceBinding(binding.immutableV04Reference, `${code}_REFERENCE`, stage);
  validateEvaluatorBinding(binding.evaluator, `${code}_EVALUATOR`, stage);
  validateCommittedFileBinding(binding.package, "package.json", `${code}_PACKAGE`, stage);
  validateCommittedFileBinding(binding.types, "types/index.d.ts", `${code}_TYPES`, stage);
  assertExactObjectKeys(binding.authorizationReceipt, ["path", "commit", "sha256", "attemptId"], `${code}_AUTHORIZATION`, stage);
  exact(binding.authorizationReceipt.path === "bench/research/research-retrieval-development-v0.5-authorization.json", `${code}_AUTHORIZATION_PATH`, `${code} authorization path differs.`, stage);
  assertCommit(binding.authorizationReceipt.commit, `${code}_AUTHORIZATION_COMMIT`, stage);
  assertSha256(binding.authorizationReceipt.sha256, `${code}_AUTHORIZATION_SHA256`, stage);
  exact(ATTEMPT_PATTERN.test(binding.authorizationReceipt.attemptId || ""), `${code}_AUTHORIZATION_ATTEMPT`, `${code} authorization attempt is invalid.`, stage);
}

export function validateAuthorizationReceiptShape(receipt) {
  const stage = "authorization";
  assertExactObjectKeys(receipt, [
    "schemaVersion", "attemptId", "authorizedCommand", "explicitlyAuthorized", "resultPath",
    "resultPathAbsentAtAuthorization", "protocolBinding", "evaluatorBinding", "packageBinding",
    "typesBinding", "review"
  ], "AUTHORIZATION", stage);
  assertNoForbiddenClaimKeys(receipt, "AUTHORIZATION_FORBIDDEN_KEY", stage);
  exact(receipt.schemaVersion === AUTHORIZATION_SCHEMA, "AUTHORIZATION_SCHEMA", "The v0.5 authorization schema differs.", stage);
  exact(ATTEMPT_PATTERN.test(receipt.attemptId || ""), "AUTHORIZATION_ATTEMPT", "The authorization attempt ID is invalid.", stage);
  exact(receipt.authorizedCommand === MODE_CONTRACTS.execute.lifecycleScript, "AUTHORIZATION_COMMAND", "The receipt does not authorize the exact frozen write command.", stage);
  exact(receipt.explicitlyAuthorized === true, "AUTHORIZATION_EXPLICIT", "The receipt does not record explicit one-attempt authorization.", stage);
  exact(receipt.resultPath === "bench/results/research-retrieval-development-v0.5.json", "AUTHORIZATION_RESULT_PATH", "The authorized result path differs.", stage);
  exact(receipt.resultPathAbsentAtAuthorization === true, "AUTHORIZATION_RESULT_ABSENCE", "The receipt does not bind result-path absence.", stage);
  validateProtocolCoreBinding(receipt.protocolBinding, "AUTHORIZATION_PROTOCOL", stage);
  validateEvaluatorBinding(receipt.evaluatorBinding, "AUTHORIZATION_EVALUATOR", stage);
  validateCommittedFileBinding(receipt.packageBinding, "package.json", "AUTHORIZATION_PACKAGE", stage);
  validateCommittedFileBinding(receipt.typesBinding, "types/index.d.ts", "AUTHORIZATION_TYPES", stage);
  exactDeep(receipt.protocolBinding, {
    commit: PROTOCOL.commit,
    tag: PROTOCOL.tag,
    manifestSha256: PROTOCOL.manifest.sha256,
    documentSha256: PROTOCOL.document.sha256
  }, "AUTHORIZATION_PROTOCOL_MISMATCH", "Authorization protocol binding differs from the frozen protocol.", stage);
  exact(receipt.packageBinding.commit === receipt.evaluatorBinding.commit, "AUTHORIZATION_PACKAGE_COMMIT", "Authorization package binding is not attached to the evaluator commit.", stage);
  exact(receipt.typesBinding.commit === receipt.evaluatorBinding.commit, "AUTHORIZATION_TYPES_COMMIT", "Authorization types binding is not attached to the evaluator commit.", stage);
  assertExactObjectKeys(receipt.review, ["decision", "independent", "reviewerId", "reviewedAt"], "AUTHORIZATION_REVIEW", stage);
  exact(receipt.review.decision === "approved" && receipt.review.independent === true, "AUTHORIZATION_REVIEW_DECISION", "An independent approved evaluator review is required.", stage);
  exact(typeof receipt.review.reviewerId === "string" && receipt.review.reviewerId.trim().length > 0 && receipt.review.reviewerId.length <= 128, "AUTHORIZATION_REVIEWER", "Authorization reviewerId is invalid.", stage);
  assertIsoTimestamp(receipt.review.reviewedAt, "AUTHORIZATION_REVIEWED_AT", stage);
  return true;
}

export function validateResultEnvelopeShape(artifact) {
  const stage = "result-verification";
  assertExactObjectKeys(artifact, [
    "schemaVersion", "packageVersion", "status", "confirmatoryClaimEligible", "protocolBinding",
    "sourceBinding", "corpusBinding", "globalApiDifferenceBoundary", "executionScope",
    "expectedCanonical", "expected", "runtimeObservation"
  ], "RESULT", stage);
  const { expected: _expected, ...metadata } = artifact;
  assertNoForbiddenClaimKeys(metadata, "RESULT_FORBIDDEN_KEY", stage);
  exact(artifact.expected !== null && typeof artifact.expected === "object" && !Array.isArray(artifact.expected), "RESULT_EXPECTED_TYPE", "Result expected must be the complete projected object.", stage);
  validateResultProtocolBinding(artifact.protocolBinding, "RESULT_PROTOCOL_BINDING", stage);
  validateSourceBindingShape(artifact.sourceBinding, "RESULT_SOURCE_BINDING", stage);
  validateCorpusBindingShape(artifact.corpusBinding, { rawVerification: true }, "RESULT_CORPUS_BINDING", stage);
  assertExactObjectKeys(artifact.globalApiDifferenceBoundary, [
    "currentAdditions", "projectionRule", "repositoryDifference", "invalidInputDifference", "claimLimit"
  ], "RESULT_API_BOUNDARY", stage);
  exact(Array.isArray(artifact.globalApiDifferenceBoundary.currentAdditions), "RESULT_API_ADDITIONS", "Result API additions must be an array.", stage);
  assertExactObjectKeys(artifact.executionScope, [
    "providerModelCalls", "providerReportedTokens", "sweBenchDockerTaskExecution", "humanRelevanceReview",
    "humanCodeReview", "taskPatchGeneration", "latencyStudy", "costStudy"
  ], "RESULT_EXECUTION_SCOPE", stage);
  assertExactObjectKeys(artifact.expectedCanonical, [
    "algorithm", "byteLength", "sha256", "deepStrictEqual", "referenceBytesEqual"
  ], "RESULT_EXPECTED_CANONICAL", stage);
  exact(artifact.expectedCanonical.algorithm === REFERENCE.expectedCanonicalAlgorithm, "RESULT_EXPECTED_ALGORITHM", "Result expected algorithm differs.", stage);
  exact(Number.isSafeInteger(artifact.expectedCanonical.byteLength) && artifact.expectedCanonical.byteLength > 0, "RESULT_EXPECTED_BYTES", "Result expected byte length is invalid.", stage);
  assertSha256(artifact.expectedCanonical.sha256, "RESULT_EXPECTED_SHA256", stage);
  exact(artifact.expectedCanonical.deepStrictEqual === true && artifact.expectedCanonical.referenceBytesEqual === true, "RESULT_EXPECTED_EQUALITY", "Result expected equality flags must both be true.", stage);
  assertExactObjectKeys(artifact.runtimeObservation, [
    "attemptId", "node", "platform", "startedAt", "completedAt", "totalEvaluationMs"
  ], "RESULT_RUNTIME", stage);
  exact(ATTEMPT_PATTERN.test(artifact.runtimeObservation.attemptId || ""), "RESULT_RUNTIME_ATTEMPT", "Result runtime attempt is invalid.", stage);
  exact(typeof artifact.runtimeObservation.node === "string" && artifact.runtimeObservation.node.length > 0, "RESULT_RUNTIME_NODE", "Result runtime Node identity is absent.", stage);
  exact(typeof artifact.runtimeObservation.platform === "string" && artifact.runtimeObservation.platform.length > 0, "RESULT_RUNTIME_PLATFORM", "Result runtime platform identity is absent.", stage);
  assertIsoTimestamp(artifact.runtimeObservation.startedAt, "RESULT_RUNTIME_STARTED", stage);
  assertIsoTimestamp(artifact.runtimeObservation.completedAt, "RESULT_RUNTIME_COMPLETED", stage);
  exact(Date.parse(artifact.runtimeObservation.completedAt) >= Date.parse(artifact.runtimeObservation.startedAt), "RESULT_RUNTIME_ORDER", "Result completion precedes start.", stage);
  exact(Number.isFinite(artifact.runtimeObservation.totalEvaluationMs) && artifact.runtimeObservation.totalEvaluationMs >= 0, "RESULT_RUNTIME_DURATION", "Result duration is invalid.", stage);
  return true;
}

async function inspectAuthorization({ forExecution }) {
  exact(await exists(authorizationPath), "AUTHORIZATION_ABSENT", "No separately committed v0.5 authorization receipt exists.", "authorization");
  const bytes = await readFile(authorizationPath);
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new V05Error("AUTHORIZATION_JSON", "The v0.5 authorization receipt is not valid JSON.", "authorization");
  }
  validateAuthorizationReceiptShape(receipt);
  assert.deepStrictEqual(receipt.protocolBinding, {
    commit: PROTOCOL.commit,
    tag: PROTOCOL.tag,
    manifestSha256: PROTOCOL.manifest.sha256,
    documentSha256: PROTOCOL.document.sha256
  }, "The authorization protocol binding differs.");
  const packageBinding = await packageState();
  const evaluator = receipt.evaluatorBinding;
  exact(evaluator?.path === packageBinding.evaluator.path, "AUTHORIZATION_EVALUATOR_PATH", "The authorized evaluator path differs.", "authorization");
  exact(COMMIT_PATTERN.test(evaluator?.commit || ""), "AUTHORIZATION_EVALUATOR_COMMIT", "The authorized evaluator commit is invalid.", "authorization");
  exact(typeof evaluator?.tag === "string" && evaluator.tag.length > 0, "AUTHORIZATION_EVALUATOR_TAG", "The authorized evaluator tag is absent.", "authorization");
  exact(evaluator?.sha256 === packageBinding.evaluator.sha256, "AUTHORIZATION_EVALUATOR_HASH", "The current evaluator does not match the reviewed receipt.", "authorization");
  exact(receipt.packageBinding?.path === packageBinding.package.path, "AUTHORIZATION_PACKAGE_PATH", "The authorized package path differs.", "authorization");
  exact(receipt.packageBinding?.commit === evaluator.commit, "AUTHORIZATION_PACKAGE_COMMIT", "The package binding is not attached to the evaluator commit.", "authorization");
  exact(receipt.packageBinding?.sha256 === packageBinding.package.sha256, "AUTHORIZATION_PACKAGE_HASH", "package.json differs from the reviewed evaluator state.", "authorization");
  exact(receipt.typesBinding?.path === packageBinding.types.path, "AUTHORIZATION_TYPES_PATH", "The authorized types path differs.", "authorization");
  exact(receipt.typesBinding?.commit === evaluator.commit, "AUTHORIZATION_TYPES_COMMIT", "The types binding is not attached to the evaluator commit.", "authorization");
  exact(receipt.typesBinding?.sha256 === packageBinding.types.sha256, "AUTHORIZATION_TYPES_HASH", "types/index.d.ts differs from the reviewed evaluator state.", "authorization");
  await assertAnnotatedTag(evaluator.tag, evaluator.commit, "EVALUATOR_TAG");
  await assertAncestor(PROTOCOL.commit, evaluator.commit, "EVALUATOR_PROTOCOL_ANCESTRY");
  await assertAncestor(evaluator.commit, "HEAD", "AUTHORIZATION_HEAD_ANCESTRY");
  assertBytesBinding(await gitBlob(evaluator.tag, evaluator.path), { sha256: evaluator.sha256 }, "EVALUATOR_TAG_BLOB");
  assertBytesBinding(await gitBlob(evaluator.tag, receipt.packageBinding.path), { sha256: receipt.packageBinding.sha256 }, "PACKAGE_TAG_BLOB");
  assertBytesBinding(await gitBlob(evaluator.tag, receipt.typesBinding.path), { sha256: receipt.typesBinding.sha256 }, "TYPES_TAG_BLOB");

  const relativeAuthorizationPath = path.relative(root, authorizationPath).replaceAll("\\", "/");
  const authorizationIntroductions = (await gitText(["log", "--reverse", "--format=%H", "--diff-filter=A", "--", relativeAuthorizationPath]))
    .split(/\r?\n/u).filter(Boolean);
  const authorizationCommit = assertSingleIntroduction(authorizationIntroductions, "AUTHORIZATION_INTRODUCTION", "authorization");
  exact(await gitText(["log", "-1", "--format=%H", "--", relativeAuthorizationPath]) === authorizationCommit, "AUTHORIZATION_MUTATED", "The authorization receipt changed after its introducing commit.", "authorization");
  const committedBytes = await gitBlob(authorizationCommit, relativeAuthorizationPath);
  exact(bytes.equals(committedBytes), "AUTHORIZATION_BYTES", "The working authorization receipt differs from its commit.", "authorization");
  const head = await gitText(["rev-parse", "HEAD"]);
  if (forExecution) {
    exact(head === authorizationCommit, "AUTHORIZATION_NOT_HEAD", "Execution requires the authorization receipt commit to be the current HEAD.", "authorization");
    const changed = (await gitText(["diff", "--name-only", evaluator.commit, authorizationCommit])).split(/\r?\n/u).filter(Boolean).sort();
    assert.deepStrictEqual(changed, [relativeAuthorizationPath], "Only the authorization receipt may differ from the reviewed evaluator tag.");
    exact((await gitText(["status", "--porcelain=v1", "--untracked-files=all"])) === "", "AUTHORIZATION_WORKTREE_DIRTY", "Execution requires a clean authorization worktree.", "authorization");
    await assertDestinationsAbsent(receipt.attemptId);
  }
  return Object.freeze({ receipt, bytes, sha256: sha256(bytes), commit: authorizationCommit, head, packageBinding });
}

function corpusResultBinding(staticBindings) {
  return {
    ...staticBindings.corpusBinding,
    rawSourceVerification: {
      requestedUrl: staticBindings.rawObservation.requestedUrl,
      redirected: staticBindings.rawObservation.redirected,
      bytes: staticBindings.rawObservation.bytes,
      sha256: staticBindings.rawObservation.sha256,
      retainedOnDisk: false
    }
  };
}

function validateResultArtifact(artifact, staticBindings, authorization) {
  validateResultEnvelopeShape(artifact);
  exact(artifact.schemaVersion === RESULT_SCHEMA, "RESULT_SCHEMA", "The v0.5 result schema differs.", "result-verification");
  exact(artifact.packageVersion === staticBindings.packageBinding.packageJson.version, "RESULT_PACKAGE_VERSION", "The result package version differs.", "result-verification");
  exact(artifact.status === "exact-projected-reproduction-on-inspected-development-corpus", "RESULT_STATUS", "The v0.5 result status differs.", "result-verification");
  exact(artifact.confirmatoryClaimEligible === false, "RESULT_CONFIRMATORY", "The v0.5 development result cannot be confirmatory.", "result-verification");
  assert.deepStrictEqual(artifact.protocolBinding, protocolBindingFrom(authorization), "The result protocol binding differs.");
  assert.deepStrictEqual(artifact.sourceBinding, staticBindings.sourceBinding, "The result source binding differs.");
  assert.deepStrictEqual(artifact.globalApiDifferenceBoundary, GLOBAL_API_DIFFERENCE_BOUNDARY, "The result global API boundary differs.");
  assert.deepStrictEqual(artifact.executionScope, EXECUTION_SCOPE, "The result execution scope differs.");
  exact(artifact.corpusBinding?.rawSourceVerification?.requestedUrl === CORPUS_BINDING.raw.url, "RESULT_RAW_URL", "The result raw request URL differs.", "result-verification");
  exact(typeof artifact.corpusBinding?.rawSourceVerification?.redirected === "boolean", "RESULT_RAW_REDIRECT", "The result raw redirect observation is invalid.", "result-verification");
  exact(artifact.corpusBinding?.rawSourceVerification?.bytes === CORPUS_BINDING.raw.bytes, "RESULT_RAW_LENGTH", "The result raw byte count differs.", "result-verification");
  exact(artifact.corpusBinding?.rawSourceVerification?.sha256 === CORPUS_BINDING.raw.sha256, "RESULT_RAW_SHA256", "The result raw hash differs.", "result-verification");
  exact(artifact.corpusBinding?.rawSourceVerification?.retainedOnDisk === false, "RESULT_RAW_RETENTION", "The raw source must not be retained on disk.", "result-verification");
  const { rawSourceVerification: _raw, ...fixedCorpusBinding } = artifact.corpusBinding;
  assert.deepStrictEqual(fixedCorpusBinding, staticBindings.corpusBinding, "The result corpus binding differs.");
  const expectedCanonical = verifyExpectedProjection(artifact.expected, staticBindings.reference);
  assert.deepStrictEqual(artifact.expectedCanonical, expectedCanonical, "The result expected canonical binding differs.");
  exact(artifact.runtimeObservation?.attemptId === authorization.receipt.attemptId, "RESULT_ATTEMPT", "The result attempt ID differs.", "result-verification");
  exact(typeof artifact.runtimeObservation?.node === "string" && typeof artifact.runtimeObservation?.platform === "string", "RESULT_RUNTIME", "The result runtime identity is incomplete.", "result-verification");
  exact(typeof artifact.runtimeObservation?.startedAt === "string" && typeof artifact.runtimeObservation?.completedAt === "string", "RESULT_TIMESTAMPS", "The result timestamps are incomplete.", "result-verification");
  exact(Number.isFinite(artifact.runtimeObservation?.totalEvaluationMs) && artifact.runtimeObservation.totalEvaluationMs >= 0, "RESULT_DURATION", "The result duration is invalid.", "result-verification");
  return true;
}

export function assertCommittedArtifactState({
  introducingCommit,
  latestCommit,
  currentBytes,
  committedBytes,
  ancestorVerified
}) {
  const stage = "result-provenance";
  exact(COMMIT_PATTERN.test(introducingCommit || ""), "RESULT_UNTRACKED", "The v0.5 result has no committed introducing revision.", stage);
  exact(COMMIT_PATTERN.test(latestCommit || ""), "RESULT_LATEST_COMMIT", "The v0.5 result has no committed latest revision.", stage);
  exact(latestCommit === introducingCommit, "RESULT_HISTORY_MUTATED", "The v0.5 result changed after its introducing commit.", stage);
  exact(ancestorVerified === true, "RESULT_HEAD_ANCESTRY", "The v0.5 result commit is not an ancestor of HEAD.", stage);
  exact(Buffer.isBuffer(currentBytes) && Buffer.isBuffer(committedBytes), "RESULT_BYTES_TYPE", "Result provenance requires byte buffers.", stage);
  exact(currentBytes.equals(committedBytes), "RESULT_WORKTREE_BYTES", "The working v0.5 result bytes differ from the committed artifact.", stage);
  return Object.freeze({
    introducingCommit,
    latestCommit,
    sha256: sha256(currentBytes),
    bytes: currentBytes.byteLength
  });
}

async function loadCommittedResult() {
  const relativeResultPath = path.relative(root, resultPath).replaceAll("\\", "/");
  const currentBytes = await readFile(resultPath);
  const introductions = (await gitText(["log", "--reverse", "--format=%H", "--diff-filter=A", "--", relativeResultPath]))
    .split(/\r?\n/u).filter(Boolean);
  const introducingCommit = assertSingleIntroduction(introductions, "RESULT_INTRODUCTION", "result-provenance");
  const latestCommit = await gitText(["log", "-1", "--format=%H", "--", relativeResultPath]);
  exact(COMMIT_PATTERN.test(latestCommit), "RESULT_LATEST_COMMIT", "The v0.5 result has no committed latest revision.", "result-provenance");
  await assertAncestor(introducingCommit, "HEAD", "RESULT_HEAD_ANCESTRY");
  const committedBytes = await gitBlob(introducingCommit, relativeResultPath);
  const provenance = assertCommittedArtifactState({
    introducingCommit,
    latestCommit,
    currentBytes,
    committedBytes,
    ancestorVerified: true
  });
  let artifact;
  try {
    artifact = JSON.parse(currentBytes.toString("utf8"));
  } catch {
    throw new V05Error("RESULT_JSON", "The committed v0.5 result is not valid JSON.", "result-provenance");
  }
  return Object.freeze({ artifact, provenance });
}

export function validateFailureReceipt(receipt) {
  const stage = "failure-publication";
  assertExactObjectKeys(receipt, [
    "schemaVersion", "attemptId", "command", "protocolBinding", "evaluatorBinding", "sourceBinding",
    "corpusBinding", "startedAt", "failedAt", "failedStage", "failureCode", "sanitizedMessage",
    "retrievalStarted", "retrievalCompleted", "resultPublished", "resultPathAbsentAtStart", "resultPathAbsentAtFailure"
  ], "FAILURE", stage);
  assertNoForbiddenClaimKeys(receipt, "FAILURE_FORBIDDEN_KEY", stage);
  exact(receipt.schemaVersion === FAILURE_SCHEMA, "FAILURE_SCHEMA", "The failure receipt schema differs.", stage);
  exact(ATTEMPT_PATTERN.test(receipt.attemptId || ""), "FAILURE_ATTEMPT", "Failure attempt ID is invalid.", stage);
  exact(receipt.command === MODE_CONTRACTS.execute.lifecycleScript, "FAILURE_COMMAND", "Failure command differs from the one authorized command.", stage);
  validateResultProtocolBinding(receipt.protocolBinding, "FAILURE_PROTOCOL_BINDING", stage);
  validateEvaluatorBinding(receipt.evaluatorBinding, "FAILURE_EVALUATOR_BINDING", stage);
  exactDeep(receipt.evaluatorBinding, receipt.protocolBinding.evaluator, "FAILURE_EVALUATOR_MISMATCH", "Failure evaluator binding differs from the protocol binding.", stage);
  exactDeep(receipt.protocolBinding.protocol, {
    commit: PROTOCOL.commit,
    tag: PROTOCOL.tag,
    manifestSha256: PROTOCOL.manifest.sha256,
    documentSha256: PROTOCOL.document.sha256
  }, "FAILURE_PROTOCOL_MISMATCH", "Failure protocol binding differs from the frozen protocol.", stage);
  exactDeep(receipt.protocolBinding.immutableV04Reference, {
    commit: REFERENCE.commit,
    tag: REFERENCE.tag,
    artifactPath: REFERENCE.artifactPath,
    artifactSha256: REFERENCE.artifactSha256,
    expectedCanonicalAlgorithm: REFERENCE.expectedCanonicalAlgorithm,
    expectedCanonicalByteLength: REFERENCE.expectedCanonicalBytes,
    expectedCanonicalSha256: REFERENCE.expectedCanonicalSha256
  }, "FAILURE_REFERENCE_MISMATCH", "Failure reference binding differs from immutable v0.4.", stage);
  exact(receipt.protocolBinding.package.commit === receipt.evaluatorBinding.commit, "FAILURE_PACKAGE_COMMIT", "Failure package binding is not attached to the evaluator commit.", stage);
  exact(receipt.protocolBinding.types.commit === receipt.evaluatorBinding.commit, "FAILURE_TYPES_COMMIT", "Failure types binding is not attached to the evaluator commit.", stage);
  exact(receipt.protocolBinding.authorizationReceipt.attemptId === receipt.attemptId, "FAILURE_AUTHORIZATION_ATTEMPT", "Failure authorization attempt differs.", stage);
  validateSourceBindingShape(receipt.sourceBinding, "FAILURE_SOURCE_BINDING", stage);
  validateCorpusBindingShape(receipt.corpusBinding, { rawVerification: false }, "FAILURE_CORPUS_BINDING", stage);
  exactDeep(receipt.sourceBinding, {
    productImplementationOriginCommit: SOURCE_BINDING.productImplementationOriginCommit,
    algorithm: SOURCE_BINDING.algorithm,
    files: SOURCE_BINDING.files.map((file) => ({ ...file }))
  }, "FAILURE_SOURCE_MISMATCH", "Failure source binding differs from the frozen production source.", stage);
  exactDeep(receipt.corpusBinding, {
    classification: "inspected-development-corpus",
    dataset: "princeton-nlp/SWE-bench_Lite",
    corpus: { ...CORPUS_BINDING.corpus },
    loader: { ...CORPUS_BINDING.loader },
    rawSourceArtifact: { ...CORPUS_BINDING.raw }
  }, "FAILURE_CORPUS_MISMATCH", "Failure corpus binding differs from the frozen inspected corpus.", stage);
  assertIsoTimestamp(receipt.startedAt, "FAILURE_STARTED_AT", stage);
  assertIsoTimestamp(receipt.failedAt, "FAILURE_FAILED_AT", stage);
  exact(Date.parse(receipt.failedAt) >= Date.parse(receipt.startedAt), "FAILURE_TIME_ORDER", "Failure timestamp precedes attempt start.", stage);
  exact(typeof receipt.failedStage === "string" && /^[a-z0-9-]{1,64}$/u.test(receipt.failedStage), "FAILURE_STAGE", "Failure stage is invalid.", stage);
  exact(typeof receipt.failureCode === "string" && /^[A-Z0-9_]{1,64}$/u.test(receipt.failureCode), "FAILURE_CODE", "Failure code is invalid.", stage);
  exact(typeof receipt.sanitizedMessage === "string" && receipt.sanitizedMessage.length > 0 && receipt.sanitizedMessage.length <= 512 && !/[\r\n\t]/u.test(receipt.sanitizedMessage), "FAILURE_MESSAGE", "Failure message is not bounded and sanitized.", stage);
  exact(typeof receipt.retrievalStarted === "boolean" && typeof receipt.retrievalCompleted === "boolean", "FAILURE_RETRIEVAL_FLAGS", "Failure retrieval flags are invalid.", stage);
  exact(!receipt.retrievalCompleted || receipt.retrievalStarted, "FAILURE_RETRIEVAL_ORDER", "Retrieval cannot complete before it starts.", stage);
  exact(receipt.resultPublished === false, "FAILURE_RESULT_STATE", "A failure receipt cannot report a published result.", stage);
  exact(receipt.resultPathAbsentAtStart === true, "FAILURE_RESULT_START_STATE", "A failure receipt requires an absent result at attempt start.", stage);
  exact(receipt.resultPathAbsentAtFailure === true, "FAILURE_RESULT_FAILURE_STATE", "A failure receipt is forbidden when the result path exists.", stage);
  return true;
}

export async function publishFailureOnlyIfResultAbsent({
  resultDestination = resultPath,
  resultPublished,
  publish
}) {
  const resultPathAbsentAtFailure = !(await exists(resultDestination));
  exact(
    resultPublished === false && resultPathAbsentAtFailure === true,
    "RESULT_PUBLICATION_TERMINAL",
    "A result destination exists or was published; a failure receipt is now forbidden.",
    "failure-publication"
  );
  exact(typeof publish === "function", "FAILURE_PUBLISHER", "A bounded failure publisher is required.", "failure-publication");
  return publish({ resultPathAbsentAtFailure: true });
}

async function publishFailureReceipt({
  authorization,
  error,
  startedAt,
  failedStage,
  retrievalStarted,
  retrievalCompleted,
  resultPathAbsentAtStart,
  resultPathAbsentAtFailure
}) {
  exact(resultPathAbsentAtFailure === true, "FAILURE_RESULT_FAILURE_STATE", "Failure publication requires an absent result path.", "failure-publication");
  exact(!(await exists(resultPath)), "RESULT_PUBLICATION_TERMINAL", "A result destination exists; a failure receipt is forbidden.", "failure-publication");
  const failurePath = path.join(root, "bench", "results", `research-retrieval-development-v0.5-${authorization.receipt.attemptId}-failure.json`);
  const failure = {
    schemaVersion: FAILURE_SCHEMA,
    attemptId: authorization.receipt.attemptId,
    command: MODE_CONTRACTS.execute.lifecycleScript,
    protocolBinding: protocolBindingFrom(authorization),
    evaluatorBinding: { ...authorization.receipt.evaluatorBinding },
    sourceBinding: {
      productImplementationOriginCommit: SOURCE_BINDING.productImplementationOriginCommit,
      algorithm: SOURCE_BINDING.algorithm,
      files: SOURCE_BINDING.files.map((file) => ({ ...file }))
    },
    corpusBinding: {
      classification: "inspected-development-corpus",
      dataset: "princeton-nlp/SWE-bench_Lite",
      corpus: { ...CORPUS_BINDING.corpus },
      loader: { ...CORPUS_BINDING.loader },
      rawSourceArtifact: { ...CORPUS_BINDING.raw }
    },
    startedAt,
    failedAt: new Date().toISOString(),
    failedStage: error?.stage || failedStage,
    failureCode: error?.code || "UNEXPECTED_FAILURE",
    sanitizedMessage: sanitizeFailureMessage(error),
    retrievalStarted,
    retrievalCompleted,
    resultPublished: false,
    resultPathAbsentAtStart,
    resultPathAbsentAtFailure: true
  };
  validateFailureReceipt(failure);
  await atomicPublishJsonNoReplace(failurePath, failure, async (parsed) => validateFailureReceipt(parsed));
  return failurePath;
}

async function runBindingOnly() {
  const bindings = await inspectStaticBindings({ requireDestinationsAbsent: true, fetchRaw: true });
  process.stdout.write(`${JSON.stringify({
    status: "v0.5-bindings-valid-no-retrieval",
    protocolCommit: PROTOCOL.commit,
    protocolTag: PROTOCOL.tag,
    immutableV04ArtifactSha256: REFERENCE.artifactSha256,
    immutableV04ExpectedCanonicalBytes: REFERENCE.expectedCanonicalBytes,
    immutableV04ExpectedCanonicalSha256: REFERENCE.expectedCanonicalSha256,
    sourceFiles: bindings.sourceBinding.files,
    corpusFileSha256: CORPUS_BINDING.corpus.fileSha256,
    loaderSha256: CORPUS_BINDING.loader.sha256,
    rawArtifact: bindings.rawObservation,
    resultPathAbsent: true,
    failureDestinationsAbsent: true,
    retrievalImported: false
  }, null, 2)}\n`);
}

async function runVerifyResult() {
  exact(await exists(resultPath), "RESULT_ABSENT", "No v0.5 result exists to verify.", "result-verification");
  exact((await listFailureReceipts()).length === 0, "RESULT_WITH_FAILURE_RECEIPT", "A v0.5 result cannot coexist with a v0.5 failure receipt.", "result-verification");
  const authorization = await inspectAuthorization({ forExecution: false });
  const staticBindings = await inspectStaticBindings({ requireDestinationsAbsent: false, fetchRaw: false });
  const { artifact, provenance } = await loadCommittedResult();
  validateResultArtifact(artifact, staticBindings, authorization);
  process.stdout.write(`The committed v0.5 result at ${provenance.introducingCommit} (${provenance.sha256}) passes read-only provenance, binding, and complete-projection verification.\n`);
}

async function runAuthorizedExecution() {
  const authorization = await inspectAuthorization({ forExecution: true });
  const startedAt = new Date().toISOString();
  const resultPathAbsentAtStart = !(await exists(resultPath));
  exact(resultPathAbsentAtStart === true, "RESULT_DESTINATION_PRESENT", "The v0.5 result destination exists at authorized attempt start.", "destination-binding");
  let stage = "binding-preflight";
  let retrievalStarted = false;
  let retrievalCompleted = false;
  let resultPublished = false;
  try {
    const staticBindings = await inspectStaticBindings({ requireDestinationsAbsent: true, fetchRaw: true });
    stage = "dynamic-import-and-retrieval";
    retrievalStarted = true;
    const generated = await generateCandidateProjection();
    retrievalCompleted = true;
    stage = "projection-equality";
    const expectedCanonical = verifyExpectedProjection(generated.expected, staticBindings.reference);
    const completedAt = new Date().toISOString();
    const artifact = {
      schemaVersion: RESULT_SCHEMA,
      packageVersion: staticBindings.packageBinding.packageJson.version,
      status: "exact-projected-reproduction-on-inspected-development-corpus",
      confirmatoryClaimEligible: false,
      protocolBinding: protocolBindingFrom(authorization),
      sourceBinding: staticBindings.sourceBinding,
      corpusBinding: corpusResultBinding(staticBindings),
      globalApiDifferenceBoundary: GLOBAL_API_DIFFERENCE_BOUNDARY,
      executionScope: EXECUTION_SCOPE,
      expectedCanonical,
      expected: generated.expected,
      runtimeObservation: {
        attemptId: authorization.receipt.attemptId,
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        startedAt,
        completedAt,
        totalEvaluationMs: generated.elapsedMs
      }
    };
    stage = "result-publication";
    await atomicPublishJsonNoReplace(resultPath, artifact, async (parsed) => validateResultArtifact(parsed, staticBindings, authorization));
    resultPublished = true;
  } catch (error) {
    await publishFailureOnlyIfResultAbsent({
      resultPublished,
      publish: ({ resultPathAbsentAtFailure }) => publishFailureReceipt({
        authorization,
        error,
        startedAt,
        failedStage: stage,
        retrievalStarted,
        retrievalCompleted,
        resultPathAbsentAtStart,
        resultPathAbsentAtFailure
      })
    });
    throw new V05Error("AUTHORIZED_ATTEMPT_FAILED", "The authorized attempt failed closed; a bounded failure receipt was published.", stage);
  }
  process.stdout.write("Published one terminal atomic v0.5 result after complete exact-projection verification.\n");
}

export async function dispatchModeWithHooks(mode, hooks) {
  if (mode === "binding-only") return hooks.bindingOnly();
  if (mode === "verify-result") return hooks.verifyResult();
  if (mode === "execute") {
    await hooks.authorize();
    return hooks.execute();
  }
  throw new V05Error("MODE_FORBIDDEN", `Unsupported mode ${mode}.`, "mode");
}

async function main() {
  const mode = parseCliMode(process.argv.slice(2));
  assertLifecycle(mode);
  if (mode === "execute") {
    // runAuthorizedExecution performs authorization itself so retrieval cannot be loaded by dispatch.
    await dispatchModeWithHooks(mode, {
      bindingOnly: runBindingOnly,
      verifyResult: runVerifyResult,
      authorize: async () => {},
      execute: runAuthorizedExecution
    });
    return;
  }
  await dispatchModeWithHooks(mode, {
    bindingOnly: runBindingOnly,
    verifyResult: runVerifyResult,
    authorize: async () => {},
    execute: runAuthorizedExecution
  });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error?.code || "V05_FAILURE"}: ${sanitizeFailureMessage(error)}\n`);
    process.exitCode = 1;
  }
}
