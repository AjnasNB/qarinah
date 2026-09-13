import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildMemoryDashboard, renderMemoryDashboard } from "../src/dashboard.js";
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


test("CLI records bounded JSON and dashboard separates real usage from estimates", async t => {
  const cwd = await temporaryDirectory(t); await initializeWorkspace(cwd);
  const cli = fileURLToPath(new URL("../bin/qarinah.js", import.meta.url));
  const run = (args, input) => spawnSync(process.execPath, [cli, "usage", ...args], { cwd, input, encoding: "utf8", timeout: 30000 });
  const receipt = usage({ model: "<img src=x onerror=alert(1)>" });
  const recorded = run(["record", "--stdin-json"], JSON.stringify(receipt));
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(run(["record", "--stdin-json"], JSON.stringify(receipt)).status, 0);
  assert.equal(run(["record", "--stdin-json", "--extra"], JSON.stringify(receipt)).status, 1);
  assert.equal(run(["record", "--stdin-json"], JSON.stringify({ ...receipt, prompt: "secret" })).status, 1);
  const report = run([]); assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).production.totalTokens, 120);
  const ledger = path.join(cwd, ".qarinah/events/events.jsonl"); const before = await readFile(ledger);
  const data = await buildMemoryDashboard({ cwd });
  assert.equal(data.providerUsage.production.attempts, 1);
  const html = renderMemoryDashboard(data);
  assert.match(html, /Model token usage/); assert.match(html, /API cost and savings: <strong>Not measured/);
  assert.ok(!html.includes(receipt.model)); assert.match(html, /&lt;img src=x/);
  assert.deepEqual(await readFile(ledger), before);
  await recordProviderUsage(usage({ callId: "missing", inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }), { cwd });
  const incomplete = renderMemoryDashboard(await buildMemoryDashboard({ cwd }));
  assert.match(incomplete, /Input: <strong>Unknown/);
  assert.match(incomplete, /Attempts missing input or output: 1/);
});
