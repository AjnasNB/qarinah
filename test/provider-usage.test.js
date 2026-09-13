import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { initializeWorkspace, readEvents, recordProviderUsage, readProviderUsage, summarizeProviderUsage, validateProviderUsage } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const usage = (changes = {}) => ({ schemaVersion: "qarinah.provider-usage.v1", provider: "azure", model: "model-a", sessionId: "session-1", callId: "call-1", attempt: 1, purpose: "production", outcome: "completed", inputTokens: 100, outputTokens: 20, cachedInputTokens: 60, reasoningTokens: 10, ...changes });

test("usage preserves metadata counts, deduplicates replays and includes failed retries", async t => {
  const cwd = await temporaryDirectory(t); await initializeWorkspace(cwd);
  const first = await recordProviderUsage(usage(), { cwd });
  assert.equal((await recordProviderUsage(usage(), { cwd })).eventId, first.eventId);
  await assert.rejects(recordProviderUsage(usage({ inputTokens: 101 }), { cwd }), /different content/);
  await recordProviderUsage(usage({ attempt: 2, outcome: "failed" }), { cwd });
  await recordProviderUsage(usage({ purpose: "test" }), { cwd });
  const report = await readProviderUsage({ cwd });
  assert.equal(report.production.attempts, 2); assert.equal(report.production.totalTokens, 240);
  assert.equal(report.production.failed, 1); assert.equal(report.test.totalTokens, 120);
  assert.equal(report.production.cachedInputTokens, 120); assert.equal(report.production.reasoningTokens, 20);
  assert.equal(report.savingsPercent, null); assert.equal(report.costUsd, null);
  const events = await readEvents(cwd); assert.equal(events[0].body, ""); assert.equal(events[0].confidence, "claimed");
  const ledger = path.join(cwd, ".qarinah/events/events.jsonl"); const before = await readFile(ledger);
  await readProviderUsage({ cwd }); assert.deepEqual(await readFile(ledger), before);
});

test("missing counts and absent history are unknown, never zero or free", async t => {
  const cwd = await temporaryDirectory(t); await initializeWorkspace(cwd);
  assert.equal((await readProviderUsage({ cwd })).production.totalTokens, null);
  await recordProviderUsage(usage(), { cwd });
  await recordProviderUsage(usage({ attempt: 2, outcome: "cancelled", inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }), { cwd });
  const result = await readProviderUsage({ cwd });
  assert.equal(result.production.inputTokens, null); assert.equal(result.production.knownInputTokens, 100);
  assert.equal(result.production.totalTokens, null); assert.equal(result.production.missingUsageAttempts, 1);
});

test("usage boundary rejects payload content, invalid counts, getters and subset violations", () => {
  for (const value of [usage({ prompt: "secret" }), usage({ inputTokens: -1 }), usage({ outputTokens: 1.2 }), usage({ cachedInputTokens: 101 }), usage({ reasoningTokens: 21 }), usage({ inputTokens: Number.MAX_SAFE_INTEGER }), usage({ purpose: "unknown" }), usage({ inputTokens: null }), usage({ sessionId: " " })]) assert.throws(() => validateProviderUsage(value));
  const value = usage(); Object.defineProperty(value, "inputTokens", { get() { throw Error("Getter executed"); }, enumerable: true });
  assert.throws(() => validateProviderUsage(value), error => !error.message.includes("Getter executed"));
  const invalid = summarizeProviderUsage([{ eventId: "bad", data: { providerUsage: usage({ outputTokens: -4 }) } }]);
  assert.deepEqual(invalid.invalidEventIds, ["bad"]);
});

test("usage recording does not initialize an unapproved workspace", async t => {
  const cwd = await temporaryDirectory(t); await assert.rejects(recordProviderUsage(usage(), { cwd }), /qarinah init/);
});
