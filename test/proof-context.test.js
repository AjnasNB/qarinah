import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  buildProofContext,
  initializeWorkspace,
  renderProofContextMarkdown,
  scanProjectStructure,
  validateProofContext
} from "../src/index.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-proof-context-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "receipts.ts"), [
    "export function verifyReceipt(hash: string) {",
    "  return hash.startsWith('sha256:');",
    "}",
    "export class ReceiptStore {",
    "  validate(hash: string) { return verifyReceipt(hash); }",
    "}",
    ""
  ].join("\n"));
  await writeFile(path.join(root, "worker.ts"), [
    "import { verifyReceipt } from './receipts.js';",
    "export function acceptTask(receipt: string) { return verifyReceipt(receipt); }",
    ""
  ].join("\n"));
  await initializeWorkspace(root, { capture: "content" });
  await scanProjectStructure({ cwd: root });
  const oldDecision = await appendEvent({
    kind: "decision",
    title: "Use unsigned session receipts",
    body: "The first prototype accepted unsigned session receipts.",
    confidence: "claimed",
    temporal: { validFrom: "2026-01-01T00:00:00.000Z" },
    provenance: { adapter: "proof-fixture", sourceId: "decision-old" }
  }, { cwd: root, capture: "content" });
  const currentDecision = await appendEvent({
    kind: "decision",
    title: "Verify signed session receipts",
    body: "Every task handoff must verify its signed receipt before use.",
    confidence: "verified",
    temporal: { validFrom: "2026-02-01T00:00:00.000Z" },
    relations: [{ type: "supersedes", target: oldDecision.eventId }],
    provenance: { adapter: "proof-fixture", sourceId: "decision-current" }
  }, { cwd: root, capture: "content" });
  await appendEvent({
    kind: "tool.completed",
    title: "Receipt verifier tests passed",
    body: "The signed session receipt verifier passed its deterministic fixture.",
    confidence: "verified",
    relations: [{ type: "supports", target: currentDecision.eventId }],
    provenance: { adapter: "proof-fixture", sourceId: "test-output" }
  }, { cwd: root, capture: "content" });
  return { root, oldDecision, currentDecision };
}

test("proof context joins cited memory, temporal facts, repository symbols, and an exact selection receipt", async (t) => {
  const { root, currentDecision } = await fixture(t);
  const proof = await buildProofContext("verify signed session receipt", {
    cwd: root,
    maxTokens: 8_192,
    clock: () => new Date("2027-03-01T00:00:00.000Z")
  });
  assert.equal(proof.schemaVersion, "qarinah.proof-context.v1");
  assert.equal(proof.contentRole, "untrusted-data");
  assert.equal(proof.repository.available, true);
  assert.equal(proof.repository.files.some((file) => file.path === "receipts.ts"), true);
  assert.equal(proof.repository.files.some((file) => file.symbols.some((symbol) => symbol.name === "verifyReceipt")), true);
  assert.equal(proof.context.items.some((item) => item.eventId === currentDecision.eventId), true);
  assert.equal(proof.selection.eventReasons.every((entry) => entry.reason.length > 0 && entry.hash.startsWith("sha256:")), true);
  assert.equal(proof.selection.fileReasons.every((entry) => entry.reasons.length > 0 && entry.contentHash?.startsWith("sha256:")), true);
  assert.equal(proof.facts.items.every((fact) => fact.sources.every((source) => source.eventHash?.startsWith("sha256:"))), true);
  assert.equal(proof.budget.usedTokens <= proof.budget.maxTokens, true);
  assert.equal(proof.budget.estimator.exact, false);
  assert.equal(validateProofContext(proof), proof);
  const markdown = renderProofContextMarkdown(proof);
  assert.match(markdown, /Why:/u);
  assert.match(markdown, /Repository evidence/u);
  assert.match(markdown, new RegExp(proof.manifestHash, "u"));
});

test("proof context marks superseded source facts and detects manifest tampering", async (t) => {
  const { root, oldDecision } = await fixture(t);
  const proof = await buildProofContext("unsigned session receipts", {
    cwd: root,
    maxTokens: 8_192,
    clock: () => new Date("2027-03-01T00:00:00.000Z")
  });
  const oldSource = proof.facts.excludedSources.find((source) => source.eventId === oldDecision.eventId);
  assert.ok(oldSource);
  assert.equal(oldSource.reason, "superseded");
  assert.equal(oldSource.supersededBy.length > 0, true);
  const changed = structuredClone(proof);
  changed.query = "tampered";
  assert.throws(() => validateProofContext(changed), (error) => error.code === "PROOF_CONTEXT_INVALID");
});

test("proof-context schema is a strict versioned public boundary", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/proof-context.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.proof-context.v1");
  assert.equal(schema.properties.repository.oneOf.every((branch) => branch.additionalProperties === false), true);
  assert.equal(schema.$defs.file.additionalProperties, false);
  assert.equal(schema.$defs.fact.additionalProperties, false);
});
