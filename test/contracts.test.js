import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEventEnvelope, validateStoredEvent } from "../src/contracts.js";
import { CANONICAL_ISO_TIMESTAMP_PATTERN } from "../src/interoperability/boundary.js";
import { eventInput } from "../test-support/helpers.js";

const WORKSPACE_ID = `ws_${"a".repeat(32)}`;
const UUID = "00000000-0000-4000-8000-000000000001";
const EVENT_SCHEMA = JSON.parse(readFileSync(new URL("../schemas/event.schema.json", import.meta.url), "utf8"));
const CONTEXT_PACK_SCHEMA = JSON.parse(readFileSync(new URL("../schemas/context-pack.schema.json", import.meta.url), "utf8"));

test("event envelopes are deterministic, redacted, and self-validating", () => {
  const input = eventInput({
    body: "Use Bearer abcdefghijklmnopqrstuvwxyz123456 safely.",
    data: {
      api_key: "sk-abcdefghijklmnopqrstuvwxyz",
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      sessionToken: "session-token-value",
      idToken: "identity-token-value",
      nested: { authorization: "Bearer super-secret-value" },
      safe: "kept"
    }
  });
  const options = {
    workspaceId: WORKSPACE_ID,
    previousHash: null,
    clock: () => new Date("2026-07-18T00:00:00.000Z"),
    randomUUID: () => UUID
  };
  const first = createEventEnvelope(input, options);
  const second = createEventEnvelope(input, options);

  assert.deepEqual(first, second);
  assert.equal(first.body, "Use [REDACTED] safely.");
  assert.equal(first.data.api_key, "[REDACTED]");
  assert.equal(first.data.accessToken, "[REDACTED]");
  assert.equal(first.data.refreshToken, "[REDACTED]");
  assert.equal(first.data.sessionToken, "[REDACTED]");
  assert.equal(first.data.idToken, "[REDACTED]");
  assert.equal(first.data.nested.authorization, "[REDACTED]");
  assert.equal(first.data.safe, "kept");
  assert.match(first.hash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(validateStoredEvent(first, { expectedPreviousHash: null, workspaceId: WORKSPACE_ID }), first);
});

test("stored event validation detects changed canonical content", () => {
  const event = createEventEnvelope(eventInput(), {
    workspaceId: WORKSPACE_ID,
    previousHash: null,
    clock: () => new Date("2026-07-18T00:00:00.000Z"),
    randomUUID: () => UUID
  });
  assert.throws(
    () => validateStoredEvent({ ...event, actor: { ...event.actor, id: "changed-actor" } }, { expectedPreviousHash: null, workspaceId: WORKSPACE_ID }),
    /hash does not match/
  );
  assert.throws(
    () => validateStoredEvent({ ...event, title: "Changed" }, { expectedPreviousHash: null, workspaceId: WORKSPACE_ID }),
    /contentHash does not match/
  );
});

test("stored event validation rejects bytes that normalize to a different envelope", () => {
  const secret = "sk-abcdefghijklmnop";
  const event = createEventEnvelope(eventInput({
    title: secret,
    body: secret,
    data: { accessToken: "raw-token-value" }
  }), {
    workspaceId: WORKSPACE_ID,
    previousHash: null,
    clock: () => new Date("2026-07-19T00:00:00.000Z"),
    randomUUID: () => UUID
  });
  for (const changed of [
    { ...event, title: secret },
    { ...event, body: secret },
    { ...event, data: { ...event.data, accessToken: "raw-token-value" } },
    { ...event, timestamp: "2026-07-19T00:00:00.000+00:00" }
  ]) {
    assert.throws(
      () => validateStoredEvent(changed, {
        expectedPreviousHash: null,
        workspaceId: WORKSPACE_ID
      }),
      /stored representation is not canonical|hash does not match|canonical ISO timestamp/
    );
  }
});

test("event contracts reject unknown fields and unsafe structured values", () => {
  assert.throws(
    () => createEventEnvelope({ ...eventInput(), unknown: true }, { workspaceId: WORKSPACE_ID }),
    /unknown field/
  );
  assert.throws(
    () => createEventEnvelope(eventInput({ data: { invalid: () => true } }), { workspaceId: WORKSPACE_ID }),
    /unsupported value/
  );
  for (const data of [[], "not-a-record", 42, true]) {
    assert.throws(
      () => createEventEnvelope(eventInput({ data }), { workspaceId: WORKSPACE_ID }),
      /data must be a record/
    );
  }
  assert.throws(
    () => createEventEnvelope(eventInput({ data: Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`key${index}`, index])) }), { workspaceId: WORKSPACE_ID }),
    /exceeds 128 fields/
  );
  assert.throws(
    () => createEventEnvelope({ ...eventInput(), eventId: "evt_not-a-uuid" }, { workspaceId: WORKSPACE_ID }),
    /eventId is invalid/
  );
});

test("event and context timestamps share one canonical calendar-valid contract", () => {
  const valid = createEventEnvelope(eventInput({
    timestamp: "2024-02-29T23:59:59.999Z",
    retention: { class: "project", expiresAt: "2024-02-29T23:59:59.999Z" }
  }), { workspaceId: WORKSPACE_ID, randomUUID: () => UUID });
  assert.equal(valid.timestamp, "2024-02-29T23:59:59.999Z");
  assert.equal(valid.retention.expiresAt, "2024-02-29T23:59:59.999Z");

  for (const invalid of [
    "+010000-01-01T00:00:00.000Z",
    "2026-02-29T00:00:00.000Z",
    "2026-07-18T24:00:00.000Z",
    "2026-07-18T00:00:00.000+00:00"
  ]) {
    assert.throws(
      () => createEventEnvelope(eventInput({ timestamp: invalid }), { workspaceId: WORKSPACE_ID, randomUUID: () => UUID }),
      /canonical ISO timestamp/
    );
    assert.throws(
      () => createEventEnvelope(eventInput({ retention: { class: "project", expiresAt: invalid } }), {
        workspaceId: WORKSPACE_ID,
        randomUUID: () => UUID
      }),
      /canonical ISO timestamp/
    );
  }

  assert.equal(EVENT_SCHEMA.properties.timestamp.pattern, CANONICAL_ISO_TIMESTAMP_PATTERN);
  assert.equal(EVENT_SCHEMA.properties.retention.properties.expiresAt.pattern, CANONICAL_ISO_TIMESTAMP_PATTERN);
  assert.equal(CONTEXT_PACK_SCHEMA.properties.items.items.properties.timestamp.pattern, CANONICAL_ISO_TIMESTAMP_PATTERN);
});

test("returned envelopes are deeply immutable", () => {
  const event = createEventEnvelope(eventInput({ data: { nested: { value: "original" } } }), {
    workspaceId: WORKSPACE_ID,
    previousHash: null,
    clock: () => new Date("2026-07-18T00:00:00.000Z"),
    randomUUID: () => UUID
  });
  assert.equal(Object.isFrozen(event.data.nested), true);
  assert.throws(() => { event.data.nested.value = "changed"; }, TypeError);
  assert.equal(event.data.nested.value, "original");
});
