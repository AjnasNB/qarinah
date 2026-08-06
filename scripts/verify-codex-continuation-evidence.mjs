import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { continuationImplementationManifest } from "./continuation-evidence-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const artifactPath = path.join(root, "bench", "results", "codex-cross-session-continuation-0.1.3.json");
const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const sha256 = /^sha256:[0-9a-f]{64}$/u;
const eventId = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const commit = /^[0-9a-f]{40}$/u;

assert.equal(artifact.schemaVersion, "qarinah.codex-cross-session-continuation.v1");
assert.equal(artifact.packageVersion, packageJson.version);
assert.equal(artifact.classification, "provider-backed-product-smoke-not-controlled-research");
assert.match(artifact.recordedAt, /^\d{4}-\d{2}-\d{2}T/u);
assert.ok(Number.isFinite(Date.parse(artifact.recordedAt)));
assert.match(artifact.qarinahCommit, commit);
assert.deepEqual(artifact.implementation, await continuationImplementationManifest(root));

assert.match(artifact.environment.node, /^v(?:22|24|26)\./u);
assert.match(artifact.environment.platform, /^(?:win32|linux|darwin)-(?:x64|arm64)$/u);
assert.match(artifact.environment.codexCli, /^codex-cli \d+\.\d+\.\d+/u);

assert.deepEqual({
  ephemeralSessions: artifact.isolation.ephemeralSessions,
  nativeResumeUsed: artifact.isolation.nativeResumeUsed,
  distinctThreadIds: artifact.isolation.distinctThreadIds
}, {
  ephemeralSessions: true,
  nativeResumeUsed: false,
  distinctThreadIds: true
});
assert.match(artifact.isolation.agentAThreadIdHash, sha256);
assert.match(artifact.isolation.agentBThreadIdHash, sha256);
assert.notEqual(artifact.isolation.agentAThreadIdHash, artifact.isolation.agentBThreadIdHash);

assert.equal(artifact.handoff.marker, "SWITCH-HANDOFF-7F3A");
assert.match(artifact.handoff.summaryEventId, eventId);
assert.match(artifact.handoff.summaryEventHash, sha256);
assert.ok(Array.isArray(artifact.handoff.sourceEvents) && artifact.handoff.sourceEvents.length >= 2);
for (const source of artifact.handoff.sourceEvents) {
  assert.match(source.eventId, eventId);
  assert.match(source.hash, sha256);
  assert.equal(typeof source.kind, "string");
}
assert.equal(artifact.handoff.summaryRelationsVerified, true);
assert.match(artifact.handoff.packManifestHash, sha256);
assert.ok(Number.isSafeInteger(artifact.handoff.packItemCount) && artifact.handoff.packItemCount > 0);
assert.ok(Number.isSafeInteger(artifact.handoff.packUsedTokens) && artifact.handoff.packUsedTokens > 0);
assert.ok(artifact.handoff.packUsedTokens <= artifact.handoff.packMaxTokens);
assert.ok(["direct", "partial"].includes(artifact.handoff.packCoverage));
assert.equal(artifact.handoff.rankingProfile, "admission-first-v2");
assert.equal(artifact.handoff.temporalBoundary, "strict-before");
assert.equal(artifact.handoff.contextQueryObservedInAgentB, true);
assert.equal(artifact.handoff.agentBCitedEventId, true);
assert.equal(artifact.handoff.agentBCitedEventHash, true);

for (const agent of [artifact.usage.agentA, artifact.usage.agentB]) {
  for (const field of ["inputTokens", "cachedInputTokens", "outputTokens"]) {
    assert.ok(agent[field] === null || (Number.isSafeInteger(agent[field]) && agent[field] >= 0));
  }
}
assert.equal(artifact.usage.source, "codex-cli-jsonl");
assert.deepEqual({
  baselineTestsFailed: artifact.outcome.baselineTestsFailed,
  agentASourceUnchanged: artifact.outcome.agentASourceUnchanged,
  acceptanceTestsPassed: artifact.outcome.acceptanceTestsPassed,
  immutableGuardPresent: artifact.outcome.immutableGuardPresent,
  doctorOk: artifact.outcome.doctorOk
}, {
  baselineTestsFailed: true,
  agentASourceUnchanged: true,
  acceptanceTestsPassed: true,
  immutableGuardPresent: true,
  doctorOk: true
});
assert.ok(Number.isSafeInteger(artifact.outcome.finalEventCount) && artifact.outcome.finalEventCount > 0);
for (const receipt of Object.values(artifact.receipts)) assert.match(receipt, sha256);
assert.ok(Array.isArray(artifact.limitations) && artifact.limitations.length >= 4);

const serialized = JSON.stringify(artifact);
assert.doesNotMatch(serialized, /[A-Za-z]:\\/u, "Evidence must not expose an absolute Windows path.");
assert.doesNotMatch(serialized, /\/(?:tmp|home|Users)\//u, "Evidence must not expose a local absolute path.");
assert.doesNotMatch(serialized, /(?:sk-|ghp_|github_pat_|npm_)[A-Za-z0-9_-]{12,}/u, "Evidence must not contain a credential-like value.");

process.stdout.write(`${JSON.stringify({
  schemaVersion: "qarinah.codex-cross-session-continuation-verification.v1",
  artifact: path.relative(root, artifactPath).replaceAll("\\", "/"),
  packageVersion: artifact.packageVersion,
  qarinahCommit: artifact.qarinahCommit,
  implementationDigest: artifact.implementation.digest,
  evidenceLinked: true,
  distinctFreshSessions: true,
  outcomeVerified: true,
  privacyChecksPassed: true
}, null, 2)}\n`);
