import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  appendCockroachBrowserOutcome,
  cockroachBrowserMemoryOutcomeToEventInput,
  createCockroachBrowserMemorySink,
  initializeWorkspace,
  readEvents,
  revokeWorkspaceTrust,
  validateCockroachBrowserMemoryOutcome
} from "../src/index.js";
import { createQarinahContextRecorder } from "cockroach-browser/qarinah";
import { temporaryDirectory } from "../test-support/helpers.js";

const require = createRequire(import.meta.url);
const digest = (character) => `sha256:${character.repeat(64)}`;

function browserOutcome(overrides = {}) {
  const timestamp = "2026-07-29T16:00:00.000Z";
  const evidenceIds = ["evidence_snapshot_1"];
  return {
    schemaVersion: "cockroach.browser-memory.v1",
    type: "browser.action.completed",
    sessionId: "session_browser_1",
    actor: "agent_fixture",
    purpose: "Capture cited page evidence",
    timestamp,
    inputDigest: digest("a"),
    outputDigest: digest("b"),
    receiptHash: digest("c"),
    evidenceIds,
    metadata: {
      action: "snapshot",
      status: "succeeded",
      inputDigest: digest("a"),
      outputDigest: digest("b"),
      receiptHash: digest("c"),
      receiptId: "receipt_snapshot_1",
      evidenceIds: [...evidenceIds],
      policyDigest: digest("d"),
      effect: "read",
      risk: "low",
      completedAt: timestamp
    },
    ...overrides
  };
}

test("Cockroach Browser v1 fixture interoperates through the strict cited-outcome boundary", async (t) => {
  const upstreamSchemaPath = require.resolve("cockroach-browser/schemas/browser-memory.schema.json");
  const [upstreamSchema, qarinahSchema] = await Promise.all([
    readFile(upstreamSchemaPath, "utf8").then(JSON.parse),
    readFile(new URL("../schemas/cockroach-browser-memory.schema.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  assert.equal(upstreamSchema.properties.schemaVersion.const, "cockroach.browser-memory.v1");
  assert.equal(qarinahSchema.properties.schemaVersion.const, upstreamSchema.properties.schemaVersion.const);
  assert.deepEqual(qarinahSchema.required, upstreamSchema.required);
  assert.equal(qarinahSchema.additionalProperties, false);
  assert.equal(qarinahSchema.anyOf[0].properties.evidenceIds.minItems, 1);
  const timestampPattern = new RegExp(qarinahSchema.properties.timestamp.pattern);
  assert.equal(timestampPattern.test("2026-07-29T16:00:00.000Z"), true);
  assert.equal(timestampPattern.test("2026-07-29T21:30:00.000+05:30"), false);
  assert.equal(timestampPattern.test("2026-02-30T16:00:00.000Z"), false);

  const captured = [];
  const recorder = createQarinahContextRecorder({
    async appendBrowserOutcome(value) {
      captured.push(value);
    }
  });
  const fixture = browserOutcome();
  await recorder.record({
    type: fixture.type,
    sessionId: fixture.sessionId,
    actor: fixture.actor,
    purpose: fixture.purpose,
    timestamp: fixture.timestamp,
    metadata: fixture.metadata
  });
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].evidenceIds, []);
  assert.deepEqual(captured[0].metadata.evidenceIds, fixture.evidenceIds);
  const normalized = validateCockroachBrowserMemoryOutcome(captured[0]);
  assert.deepEqual(normalized.evidenceIds, fixture.evidenceIds);
  assert.equal(Object.isFrozen(normalized.metadata), true);

  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  const sink = createCockroachBrowserMemorySink({ cwd: root });
  assert.deepEqual(Object.keys(sink), ["appendBrowserOutcome"]);
  await sink.appendBrowserOutcome(captured[0]);
  const [event] = await readEvents(root);
  assert.equal(event.data.boundaryVersion, "cockroach.browser-memory.v1");
  assert.equal(event.data.capture, "metadata");
  assert.equal(event.data.citationCount, 1);
  assert.deepEqual(event.relations, [{
    type: "references",
    target: "cockroach-browser-evidence:evidence_snapshot_1"
  }]);
  const connectedRecorder = createQarinahContextRecorder(sink);
  await connectedRecorder.record({
    type: "browser.session.created",
    sessionId: "session_browser_2",
    purpose: "Observe one approved page",
    timestamp: "2026-07-29T16:01:00.000Z",
    metadata: {
      policyDigest: digest("f"),
      mode: "headless",
      profile: "PROFILE_MUST_NOT_BE_RETAINED"
    }
  });
  assert.equal((await readEvents(root)).length, 1, "uncited lifecycle notifications must not be retained");

  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({ ...fixture, schemaVersion: "cockroach.browser-memory.v2" }),
    /schemaVersion is unsupported/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({ ...fixture, unexpected: true }),
    /unknown field/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({
      ...fixture,
      evidenceIds: [],
      metadata: { ...fixture.metadata, evidenceIds: [] }
    }),
    /cite at least one evidence ID/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({
      ...fixture,
      timestamp: "2026-07-29T21:30:00.000+05:30"
    }),
    /canonical ISO timestamp/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({
      ...fixture,
      inputDigest: digest("e"),
      metadata: { ...fixture.metadata, inputDigest: digest("a") }
    }),
    /inputDigest fields disagree/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({
      ...fixture,
      evidenceIds: ["evidence_snapshot_1", "evidence_snapshot_1"],
      metadata: { ...fixture.metadata, evidenceIds: [] }
    }),
    /duplicate citations/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({
      ...fixture,
      metadata: { ...fixture.metadata, action: "fill", effect: "read", risk: "low" }
    }),
    /effect does not match action/
  );
  assert.throws(
    () => validateCockroachBrowserMemoryOutcome({
      ...fixture,
      metadata: { ...fixture.metadata, action: "fill", effect: "write", risk: "low" }
    }),
    /risk does not match action/
  );
  const accessor = { ...fixture };
  Object.defineProperty(accessor, "purpose", {
    enumerable: true,
    get: () => "accessor executed"
  });
  assert.throws(() => validateCockroachBrowserMemoryOutcome(accessor), /enumerable data property/);
  const inherited = Object.assign(Object.create({ inherited: true }), fixture);
  assert.throws(() => validateCockroachBrowserMemoryOutcome(inherited), /plain record/);
});

test("Cockroach Browser outcomes recursively omit secrets and remain metadata-only under content consent", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const raw = browserOutcome({
    actor: "ACTOR_SECRET_MARKER",
    purpose: "PURPOSE_SECRET_MARKER Bearer browser-purpose-token",
    metadata: {
      ...browserOutcome().metadata,
      profile: "PROFILE_SECRET_MARKER",
      note: {
        authorization: "Bearer NESTED_AUTHORIZATION_SECRET_MARKER",
        cookieJar: { value: "COOKIE_SECRET_MARKER" },
        formvalue: "FORM_VALUE_SECRET_MARKER",
        nested: [{
          apiKey: "API_KEY_SECRET_MARKER",
          safeText: "sk-abcdefghijklmnop"
        }]
      }
    }
  });
  const validated = validateCockroachBrowserMemoryOutcome(raw);
  const validatedJson = JSON.stringify(validated);
  for (const marker of [
    "PROFILE_SECRET_MARKER",
    "NESTED_AUTHORIZATION_SECRET_MARKER",
    "COOKIE_SECRET_MARKER",
    "FORM_VALUE_SECRET_MARKER",
    "API_KEY_SECRET_MARKER",
    "sk-abcdefghijklmnop"
  ]) assert.equal(validatedJson.includes(marker), false, marker);
  assert.equal(Object.hasOwn(validated.metadata, "profile"), false);
  assert.equal(Object.hasOwn(validated.metadata.note, "authorization"), false);
  assert.equal(Object.hasOwn(validated.metadata.note, "cookieJar"), false);
  assert.equal(Object.hasOwn(validated.metadata.note, "formvalue"), false);
  assert.equal(Object.hasOwn(validated.metadata.note.nested[0], "apiKey"), false);
  assert.equal(validated.metadata.note.nested[0].safeText, "[REDACTED]");

  const mapped = cockroachBrowserMemoryOutcomeToEventInput(raw);
  assert.equal(mapped.data.capture, "metadata");
  assert.equal(mapped.data.contentOmitted, true);
  assert.equal(mapped.data.browserAuthorityGranted, false);
  assert.equal(mapped.body, "");
  assert.equal(mapped.sessionId, undefined);
  assert.equal(JSON.stringify(mapped).includes("ACTOR_SECRET_MARKER"), false);
  assert.equal(JSON.stringify(mapped).includes("PURPOSE_SECRET_MARKER"), false);

  const event = await appendCockroachBrowserOutcome(raw, { cwd: root });
  assert.equal(event.data.capture, "metadata");
  assert.equal(event.body, "");
  assert.equal(event.actor.id, "cockroach-browser");
  assert.equal(event.sessionId, null);
  const serialized = await readFile(path.join(root, ".qarinah", "events", "events.jsonl"), "utf8");
  for (const marker of [
    "ACTOR_SECRET_MARKER",
    "PURPOSE_SECRET_MARKER",
    "PROFILE_SECRET_MARKER",
    "NESTED_AUTHORIZATION_SECRET_MARKER",
    "COOKIE_SECRET_MARKER",
    "FORM_VALUE_SECRET_MARKER",
    "API_KEY_SECRET_MARKER",
    "sk-abcdefghijklmnop"
  ]) assert.equal(serialized.includes(marker), false, marker);
});

test("Cockroach Browser appends require current trust and are idempotent with conflicts fail-closed", async (t) => {
  const root = await temporaryDirectory(t);
  const fixture = browserOutcome();
  await assert.rejects(
    () => appendCockroachBrowserOutcome(fixture, { cwd: root }),
    (error) => error.code === "WORKSPACE_NOT_INITIALIZED"
  );

  const workspace = await initializeWorkspace(root);
  const forgedWorkspace = {
    ...workspace,
    config: { ...workspace.config, capture: "content" }
  };
  const first = await appendCockroachBrowserOutcome(fixture, { workspace: forgedWorkspace });
  assert.equal(first.data.capture, "metadata");
  const replay = await appendCockroachBrowserOutcome(structuredClone(fixture), { cwd: root });
  assert.equal(replay.hash, first.hash);
  assert.equal((await readEvents(root)).length, 1);

  const secretOnlyDifference = browserOutcome({
    metadata: {
      ...browserOutcome().metadata,
      authorization: "Bearer REPLAY_ONLY_SECRET_MARKER"
    }
  });
  const scrubbedReplay = await appendCockroachBrowserOutcome(secretOnlyDifference, { cwd: root });
  assert.equal(scrubbedReplay.hash, first.hash);
  assert.equal((await readEvents(root)).length, 1);

  const conflicting = browserOutcome({
    outputDigest: digest("e"),
    metadata: {
      ...browserOutcome().metadata,
      outputDigest: digest("e")
    }
  });
  await assert.rejects(
    () => appendCockroachBrowserOutcome(conflicting, { cwd: root }),
    (error) => error.code === "EVENT_ID_CONFLICT"
  );
  assert.equal((await readEvents(root)).length, 1);

  const logPath = path.join(root, ".qarinah", "events", "events.jsonl");
  const beforeRevocation = await readFile(logPath, "utf8");
  await revokeWorkspaceTrust(root);
  await assert.rejects(
    () => appendCockroachBrowserOutcome(browserOutcome({
      receiptHash: digest("f"),
      metadata: {
        ...browserOutcome().metadata,
        receiptHash: digest("f")
      }
    }), { cwd: root }),
    (error) => error.code === "WORKSPACE_NOT_TRUSTED"
  );
  assert.equal(await readFile(logPath, "utf8"), beforeRevocation);
});
