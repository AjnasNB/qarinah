import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendEvent,
  consolidateProjectFacts,
  initializeWorkspace,
  readEvents
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

test("deterministic consolidation produces cited facts and reuses an exact recorded projection", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const decision = await appendEvent(eventInput({
    kind: "decision",
    title: "Keep the release artifact immutable",
    body: "Publish only after the exact digest passes verification."
  }), { cwd: root });
  const outcome = await appendEvent(eventInput({
    kind: "turn.completed",
    title: "Cross-platform checks completed",
    body: "Linux, macOS, and Windows passed."
  }), { cwd: root });

  const first = await consolidateProjectFacts({
    cwd: root,
    query: "release artifact checks",
    record: true,
    clock: () => new Date("2026-08-20T12:00:00.000Z")
  });
  assert.equal(first.schemaVersion, "qarinah.fact-consolidation.v1");
  assert.equal(first.method, "deterministic-cited-v1");
  assert.equal(first.facts.some((fact) => fact.category === "decision"), true);
  assert.equal(first.facts.every((fact) => fact.sourceEventIds.every((id) => [decision.eventId, outcome.eventId].includes(id))), true);
  assert.equal(first.recording.status, "recorded");

  const replay = await consolidateProjectFacts({
    cwd: root,
    query: "release artifact checks",
    record: true,
    clock: () => new Date("2026-08-21T12:00:00.000Z")
  });
  assert.equal(replay.recording.status, "reused");
  assert.equal(replay.recording.eventId, first.recording.eventId);
  const events = await readEvents(root, { updateCheckpoint: false });
  assert.equal(events.filter((event) => event.provenance.adapter === "qarinah-fact-consolidation").length, 1);
});

test("model-assisted consolidation receives bounded untrusted sources and rejects uncited output", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const source = await appendEvent(eventInput({ title: "Use SQLite for the local read model" }), { cwd: root });
  let observed;
  const accepted = await consolidateProjectFacts({
    cwd: root,
    extractor: {
      id: "fixture-extractor-v1",
      extract(input) {
        observed = input;
        return {
          model: "fixture-local-model",
          facts: [{
            category: "decision",
            statement: "The local read model uses SQLite.",
            confidence: "inferred",
            sourceEventIds: [source.eventId]
          }]
        };
      }
    }
  });
  assert.equal(observed.contentRole, "untrusted-data");
  assert.equal(observed.sources.length, 1);
  assert.equal(accepted.facts[0].sourceEventIds[0], source.eventId);

  await assert.rejects(consolidateProjectFacts({
    cwd: root,
    record: true,
    extractor: {
      id: "invalid-extractor-v1",
      extract() {
        return { facts: [{ category: "decision", statement: "Unsupported claim", confidence: "inferred", sourceEventIds: ["evt_not_admitted"] }] };
      }
    }
  }), /admitted source event IDs/u);
  assert.equal((await readEvents(root, { updateCheckpoint: false })).length, 1);
});

test("metadata capture stores a content-free consolidation receipt", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "metadata" });
  await appendEvent(eventInput({ title: "Sensitive implementation decision", body: "secret body" }), { cwd: root });
  const result = await consolidateProjectFacts({ cwd: root, record: true });
  const event = (await readEvents(root, { updateCheckpoint: false })).find((candidate) => candidate.eventId === result.recording.eventId);
  assert.equal(event.body, "");
  assert.equal(Object.hasOwn(event.data, "facts"), false);
  assert.equal(event.data.factConsolidation.factCount, result.facts.length);

  const schema = JSON.parse(await readFile(new URL("../schemas/fact-consolidation.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.fact.additionalProperties, false);
});
