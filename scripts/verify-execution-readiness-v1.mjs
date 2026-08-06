import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readiness = JSON.parse(await readFile(path.join(root, "bench", "final", "execution-readiness-v1.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

assert.equal(readiness.sourceCommit, "b20bb87e6d0ab39aed7df00605d38d24deb9da36");
assert.equal(readiness.packagedRuntimes.codexSha256, readiness.packagedRuntimes.claudeSha256);
assert.equal(readiness.packagedRuntimes.byteIdentical, true);
assert.equal(readiness.packagedRuntimes.mcpSmokePassed, true);
assert.equal(readiness.localValidation.windowsNode24FullReleaseGatePassed, true);
assert.equal(readiness.localValidation.testsPassed, 136);
assert.deepEqual(readiness.declaredButNotExecutedLocally.ciMatrix.nodeMajors, [22, 24, 26]);
assert.equal(readiness.executionBlockers.length, 7);
assert.equal(readiness.finalEvaluationAuthorized, false);
assert.equal(readiness.finalResultsObserved, false);
assert.equal(readiness.remotePublished, false);
assert.equal(packageJson.scripts["check:research-readiness"], "node scripts/verify-execution-readiness-v1.mjs");

process.stdout.write("Local execution readiness is verified; confirmatory provider execution remains blocked and unobserved.\n");
