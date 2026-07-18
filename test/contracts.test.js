import assert from "node:assert/strict";
import test from "node:test";
import { createEventEnvelope, validateStoredEvent } from "../src/contracts.js";
import { eventInput } from "../test-support/helpers.js";

const WORKSPACE_ID = `ws_${"a".repeat(32)}`;
const UUID = "00000000-0000-4000-8000-000000000001";

test("event envelopes are deterministic, redacted, and self-validating", () => {
  const input = eventInput({
    body: "Use Bearer abcdefghijklmnopqrstuvwxyz123456 safely.",
    data: {
      api_key: "sk-abcdefghijklmnopqrstuvwxyz",
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

test("event contracts reject unknown fields and unsafe structured values", () => {
  assert.throws(
    () => createEventEnvelope({ ...eventInput(), unknown: true }, { workspaceId: WORKSPACE_ID }),
    /unknown field/
  );
  assert.throws(
    () => createEventEnvelope(eventInput({ data: { invalid: () => true } }), { workspaceId: WORKSPACE_ID }),
    /unsupported value/
  );
  assert.throws(
    () => createEventEnvelope(eventInput({ data: Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`key${index}`, index])) }), { workspaceId: WORKSPACE_ID }),
    /exceeds 128 fields/
  );
  assert.throws(
    () => createEventEnvelope({ ...eventInput(), eventId: "evt_not-a-uuid" }, { workspaceId: WORKSPACE_ID }),
    /eventId is invalid/
  );
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
