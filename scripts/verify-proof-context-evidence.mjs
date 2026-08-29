import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const result = JSON.parse(await readFile(
  path.join(root, "bench", "results", `proof-context-${packageJson.version}.json`),
  "utf8"
));

if (result.schemaVersion !== "qarinah.proof-context-evaluation.v1" || result.implementation !== packageJson.version) {
  throw new Error("Proof-context evidence has the wrong public identity.");
}
if (result.method?.source !== "scripts/evaluate-proof-context.mjs" || result.method?.scenarioCount !== 12
  || result.method?.maxTokens !== 4_096 || result.scenarios?.length !== 12) {
  throw new Error("Proof-context evidence method or scenario count changed.");
}
for (const metric of ["expectedFileHitAt5", "expectedSymbolHitAt5Files", "currentEvidenceRecall", "staleEvidenceRejection", "citationValidity", "budgetConformance", "deterministicManifestReproduction"]) {
  if (result.metrics?.[metric] !== 1) throw new Error(`Proof-context evidence ${metric} must equal 1.`);
}
if (result.metrics.acceptedTaskPackets !== 12 || result.metrics.manifestTamperRejection !== true) {
  throw new Error("Proof-context task acceptance or tamper rejection evidence failed.");
}
for (const scenario of result.scenarios) {
  if (scenario.accepted !== true || scenario.observed?.usedTokens > 4_096) {
    throw new Error(`Proof-context scenario ${scenario.id ?? "unknown"} failed its acceptance contract.`);
  }
}
if (!result.boundaries?.scope?.includes("not a claim of universal production accuracy")
  || !result.boundaries?.comparison?.includes("No external product")) {
  throw new Error("Proof-context evidence boundaries are missing.");
}
process.stdout.write("Proof-context 12-scenario evidence verified.\n");
