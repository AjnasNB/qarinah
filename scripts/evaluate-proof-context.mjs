import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  buildProofContext,
  initializeWorkspace,
  scanProjectStructure,
  validateProofContext
} from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedAt = "2027-01-15T12:00:00.000Z";
const MAX_TOKENS = 4_096;
const scenarios = Object.freeze([
  { id: "typescript-receipt", path: "src/session-receipt.ts", symbol: "SessionReceiptVerifier", source: "export class SessionReceiptVerifier { verify(value: string) { return value.startsWith('sha256:'); } }\n" },
  { id: "javascript-compaction", path: "src/compact-context.js", symbol: "compactTaskContext", source: "export function compactTaskContext(events) { return events.slice(-12); }\n" },
  { id: "python-temporal", path: "src/temporal_fact.py", symbol: "TemporalFactIndex", source: "class TemporalFactIndex:\n    def current(self, facts):\n        return [fact for fact in facts if fact.status == 'current']\n" },
  { id: "go-repository-map", path: "src/repository_map.go", symbol: "BuildRepositoryMap", source: "package memory\nfunc BuildRepositoryMap(root string) bool { return root != \"\" }\n" },
  { id: "rust-manifest", path: "src/manifest.rs", symbol: "validate_manifest", source: "pub fn validate_manifest(hash: &str) -> bool { hash.starts_with(\"sha256:\") }\n" },
  { id: "java-worktree", path: "src/WorktreeResolver.java", symbol: "WorktreeResolver", source: "public class WorktreeResolver { public boolean resolve(String branch) { return !branch.isEmpty(); } }\n" },
  { id: "kotlin-budget", path: "src/ContextBudget.kt", symbol: "ContextBudget", source: "class ContextBudget { fun accepts(used: Int, maximum: Int): Boolean = used <= maximum }\n" },
  { id: "c-hash", path: "src/verify_hash.c", symbol: "verify_hash", source: "int verify_hash(const char *value) { return value != 0; }\n" },
  { id: "cpp-graph", path: "src/EvidenceGraph.cpp", symbol: "EvidenceGraph", source: "class EvidenceGraph { public: bool connected() { return true; } };\n" },
  { id: "csharp-provenance", path: "src/ProvenanceReceipt.cs", symbol: "ProvenanceReceipt", source: "public class ProvenanceReceipt { public bool Verify(string hash) { return hash.StartsWith(\"sha256:\"); } }\n" },
  { id: "typescript-conflict", path: "src/conflict.ts", symbol: "detectContextConflict", source: "export function detectContextConflict(left: string, right: string) { return left !== right; }\n" },
  { id: "python-restore", path: "src/restore_context.py", symbol: "restore_context", source: "def restore_context(receipt):\n    return receipt.get('manifestHash')\n" }
]);

function eventId(index, current) {
  const suffix = String(index + 1).padStart(12, "0");
  return `evt_00000000-0000-4000-${current ? "8001" : "8000"}-${suffix}`;
}

async function buildFixture(directory) {
  await mkdir(path.join(directory, "src"), { recursive: true });
  for (const scenario of scenarios) await writeFile(path.join(directory, scenario.path), scenario.source);
  await initializeWorkspace(directory, { capture: "content" });
  await scanProjectStructure({ cwd: directory });
  for (const [index, scenario] of scenarios.entries()) {
    const priorId = eventId(index, false);
    await appendEvent({
      eventId: priorId,
      timestamp: `2026-01-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
      kind: "decision",
      title: `Use legacy ${scenario.symbol} behavior`,
      body: `The first implementation of ${scenario.symbol} did not require proof-carrying context.`,
      confidence: "claimed",
      provenance: { adapter: "qarinah-proof-evaluation", sourceId: `${scenario.id}:legacy` }
    }, { cwd: directory, capture: "content" });
    await appendEvent({
      eventId: eventId(index, true),
      timestamp: `2026-06-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
      kind: "decision",
      title: `Use ${scenario.symbol} with proof-carrying context`,
      body: `${scenario.symbol} must cite the selected event, repository content hash, and task receipt.`,
      confidence: "verified",
      relations: [{ type: "supersedes", target: priorId }],
      provenance: { adapter: "qarinah-proof-evaluation", sourceId: `${scenario.id}:current` }
    }, { cwd: directory, capture: "content" });
  }
}

async function evaluateScenario(directory, scenario, index) {
  const query = `${scenario.symbol} proof-carrying context`;
  const options = { cwd: directory, maxTokens: MAX_TOKENS, fileLimit: 5, symbolLimit: 40, factLimit: 16, clock: () => new Date(generatedAt) };
  const first = await buildProofContext(query, options);
  const repeated = await buildProofContext(query, options);
  validateProofContext(first);
  const file = first.repository.files.find((candidate) => candidate.path === scenario.path);
  const expectedFileSelected = Boolean(file);
  const expectedSymbolSelected = Boolean(file?.symbols.some((symbol) => symbol.name === scenario.symbol));
  const currentEventId = eventId(index, true);
  const staleEventId = eventId(index, false);
  const currentEvidenceSelected = first.context.items.some((item) => item.eventId === currentEventId);
  const staleEvidenceExcluded = !first.context.items.some((item) => item.eventId === staleEventId)
    && first.facts.excludedSources.some((item) => item.eventId === staleEventId && item.supersededBy.includes(currentEventId));
  const citationsValid = first.context.items.every((item) => /^sha256:[0-9a-f]{64}$/u.test(item.hash))
    && first.facts.items.every((fact) => fact.sources.every((source) => /^sha256:[0-9a-f]{64}$/u.test(source.eventHash ?? "")))
    && first.repository.files.every((entry) => /^sha256:[0-9a-f]{64}$/u.test(entry.contentHash ?? ""));
  const budgetConformant = first.budget.usedTokens <= first.budget.maxTokens;
  const deterministicManifest = first.manifestHash === repeated.manifestHash;
  const accepted = expectedFileSelected && expectedSymbolSelected && currentEvidenceSelected
    && staleEvidenceExcluded && citationsValid && budgetConformant && deterministicManifest;
  return {
    id: scenario.id,
    query,
    expected: { path: scenario.path, symbol: scenario.symbol, currentEventId, staleEventId },
    observed: {
      expectedFileSelected,
      expectedSymbolSelected,
      currentEvidenceSelected,
      staleEvidenceExcluded,
      citationsValid,
      budgetConformant,
      deterministicManifest,
      usedTokens: first.budget.usedTokens,
      selectedEvents: first.selection.eventCount,
      selectedFiles: first.selection.fileCount,
      selectedSymbols: first.selection.symbolCount,
      selectedFacts: first.selection.factCount
    },
    accepted
  };
}

const directory = await mkdtemp(path.join(os.tmpdir(), "qarinah-proof-evaluation-"));
try {
  await buildFixture(directory);
  const results = [];
  for (const [index, scenario] of scenarios.entries()) results.push(await evaluateScenario(directory, scenario, index));
  const example = await buildProofContext(`${scenarios[0].symbol} proof-carrying context`, {
    cwd: directory, maxTokens: MAX_TOKENS, clock: () => new Date(generatedAt)
  });
  const changed = structuredClone(example);
  changed.query = "tampered query";
  let tamperRejected = false;
  try {
    validateProofContext(changed);
  } catch (error) {
    tamperRejected = error?.code === "PROOF_CONTEXT_INVALID";
  }
  const count = (field) => results.filter((result) => result.observed[field]).length;
  const artifact = {
    schemaVersion: "qarinah.proof-context-evaluation.v1",
    implementation: "0.6.0",
    generatedAt,
    method: {
      fixture: "generated 12-file multi-language repository with paired current and superseded decisions",
      languages: ["c", "cpp", "csharp", "go", "java", "javascript", "kotlin", "python", "rust", "typescript"],
      scenarioCount: results.length,
      maxTokens: MAX_TOKENS,
      tokenEstimator: "portable-chars-div-4@1",
      selectionContract: "expected file + expected symbol + current evidence + stale exclusion + cited hashes + bounded budget + deterministic manifest",
      source: "scripts/evaluate-proof-context.mjs"
    },
    metrics: {
      acceptedTaskPackets: results.filter((result) => result.accepted).length,
      expectedFileHitAt5: count("expectedFileSelected") / results.length,
      expectedSymbolHitAt5Files: count("expectedSymbolSelected") / results.length,
      currentEvidenceRecall: count("currentEvidenceSelected") / results.length,
      staleEvidenceRejection: count("staleEvidenceExcluded") / results.length,
      citationValidity: count("citationsValid") / results.length,
      budgetConformance: count("budgetConformant") / results.length,
      deterministicManifestReproduction: count("deterministicManifest") / results.length,
      manifestTamperRejection: tamperRejected
    },
    scenarios: results,
    boundaries: {
      scope: "This is a deterministic acceptance evaluation over a generated repository, not a claim of universal production accuracy.",
      tokens: "The portable estimator is deterministic but is not a provider tokenizer or billing receipt.",
      comparison: "No external product is evaluated and no cross-product superiority is claimed.",
      independence: "The script, fixture construction, expected identities, and committed result are public so another party can rerun the method."
    }
  };
  const output = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const destination = path.join(root, "bench", "results", "proof-context-0.6.0.json");
    await writeFile(destination, output);
    process.stdout.write(`${destination}\n`);
  } else {
    process.stdout.write(output);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
