import assert from "node:assert/strict";
import test from "node:test";
import {
  AMENDMENT_COMMIT,
  AMENDMENT_TAG,
  BM25_ALGORITHM_BINDING,
  OUTPUT_LIMIT,
  SOURCE_COMMIT,
  bm25Lexemes,
  buildNeutralLedger,
  evidenceCompletePrefix,
  eventId,
  executeV2Evaluation,
  qarinahOptions,
  rankAdmissionFilteredBm25,
  runMutationVerificationSuite,
  sha256
} from "../scripts/context-efficiency-v2-lib.mjs";
import {
  buildDerivedState,
  createEventEnvelope,
  resolveContextAdmission,
  resolveCurrentContextState
} from "../src/index.js";
import {
  COMMON_RENDERER_BINDING,
  assertCanonicalFrame,
  estimatedPortableTokens,
  renderCurrentSources,
  renderEventItem,
  renderModelFacingFrame
} from "../scripts/context-efficiency-v2-renderer.mjs";

const MUTATIONS = [
  "cross-pair-event-id-with-wrong-hash",
  "cross-pair-hash-with-wrong-event-id",
  "citation-strings-injected-into-current-source",
  "citation-strings-injected-into-unrelated-event-body",
  "citation-strings-injected-into-unrelated-event-title",
  "required-body-attached-to-wrong-event",
  "duplicate-required-item-with-another-required-item-missing",
  "support-citations-collapsed-into-summary-metadata",
  "forbidden-body-hidden-while-forbidden-id-or-hash-remains",
  "forbidden-id-and-hash-hidden-while-forbidden-body-remains",
  "json-only-metadata-changes-selection",
  "query-duplicated-omitted-or-method-specific",
  "current-source-order-or-bytes-method-specific",
  "runtime-fixture-helper-implementation-workspace-event-head-or-renderer-binding-mismatch",
  "qarinah-entrypoint-option-limit-or-output-order-mismatch",
  "bm25-tokenizer-stopword-document-field-formula-rounding-tie-or-zero-score-mismatch",
  "admission-filtered-bm25-candidate-set-differs-from-qarinah-pre-ranking-eligible-set",
  "evidence-complete-prefix-max-rank-or-lowest-required-rank-mismatch",
  "oracle-identity-changes-ranking-stopping-or-selection",
  "fixed-k-utility-output-used-as-a-token-ranking",
  "raw-bm25-negative-control-included-in-primary-efficiency-comparison",
  "non-truncating-ceiling-causes-excerpt-truncation-or-item-omission",
  "historical-manifest-checked-without-proving-actual-loaded-source-bytes",
  "conflicting-claim-treated-as-superseded-unauthorized-or-governing-current-evidence"
];

function fixtureEvent(index, overrides = {}) {
  return {
    eventId: eventId(index),
    hash: sha256(`event-${index}`),
    timestamp: `2026-01-0${index}T00:00:00.000Z`,
    kind: "decision",
    title: `Fixture event ${index}`,
    body: `Fixture body ${index}`,
    data: { index },
    relations: [],
    retention: { class: "project", expiresAt: null },
    repository: { id: "owner/repository-a" },
    disclosure: { classification: "public", scopes: [] },
    ...overrides
  };
}

test("canonical renderer is method-neutral, complete, and LF-only", () => {
  const query = "synthetic renderer query";
  const sources = [
    { path: "src/a.js", content: "export const a = 1;" },
    { path: "src/b.js", content: "export const b = 2;" }
  ];
  const events = [fixtureEvent(1), fixtureEvent(2)];
  const frame = renderModelFacingFrame({ query, currentSources: sources, events });
  assert.equal(frame.includes("\r"), false);
  assert.equal(frame.split(query).length - 1, 1);
  assert.equal(frame.includes(renderCurrentSources(sources)), true);
  assert.equal(frame.includes(renderEventItem(events[0])), true);
  assert.equal(frame.includes(events[1].body), true);
  assert.deepEqual(assertCanonicalFrame({ frame, query, currentSources: sources, events }), {
    characters: frame.length,
    estimatedTokens: Math.ceil(frame.length / 4),
    frameSha256: sha256(frame)
  });
  assert.equal(estimatedPortableTokens(frame), Math.ceil(frame.length / 4));
  assert.equal(COMMON_RENDERER_BINDING.frameTemplateSha256, "sha256:9466fed249971e7c894e52faf80f3bd14bef335b0aa6a28ceafe5ca0d965a56a");
  assert.equal(COMMON_RENDERER_BINDING.itemTemplateSha256, "sha256:477e47cbf1d3ff47335f6b1c9319afbb38f7fd13517f072a5100a2c44432211d");
});

test("BM25 controls retain zero scores and use frozen deterministic tie breaks", () => {
  const older = fixtureEvent(1, { title: "alpha decision", timestamp: "2026-01-01T00:00:00.000Z" });
  const newer = fixtureEvent(2, { title: "unrelated", timestamp: "2026-01-02T00:00:00.000Z" });
  const ranked = rankAdmissionFilteredBm25([older, newer], "alpha decision");
  assert.deepEqual(ranked.map((entry) => entry.event.eventId), [older.eventId, newer.eventId]);
  assert.equal(ranked[1].score, 0);
  assert.deepEqual(bm25Lexemes("The ALPHA alpha x _ y-z"), ["alpha", "alpha", "y-z"]);
  assert.equal(BM25_ALGORITHM_BINDING.outputLimit, OUTPUT_LIMIT);
  assert.deepEqual(BM25_ALGORITHM_BINDING.stopWords.slice(0, 4), ["a", "an", "and", "are"]);
});

test("shared admission is strict-before and filters before BM25 statistics", () => {
  const asOf = "2026-01-10T00:00:00.000Z";
  const permitted = fixtureEvent(1, { timestamp: "2026-01-09T23:59:59.999Z" });
  const equal = fixtureEvent(2, { timestamp: asOf });
  const restricted = fixtureEvent(3, {
    timestamp: "2026-01-03T00:00:00.000Z",
    disclosure: { classification: "restricted", scopes: ["review"] }
  });
  const otherRepository = fixtureEvent(4, {
    timestamp: "2026-01-04T00:00:00.000Z",
    repository: { id: "owner/repository-b" }
  });
  const index = buildDerivedState(
    [permitted, equal, restricted, otherRepository],
    "ws_99999999999999999999999999999999"
  ).index;
  const admitted = resolveContextAdmission(index, {
    asOf,
    temporalBoundary: "strict-before",
    repositoryIds: ["owner/repository-a"],
    authorityScopes: []
  });
  assert.deepEqual(admitted.eligibleEventIds, [permitted.eventId]);
  assert.deepEqual(admitted.filters, { expired: 0, future: 1, notYetValid: 0, stale: 0, unauthorized: 2 });
  assert.deepEqual(admitted.excludedEventIds, [equal.eventId, restricted.eventId, otherRepository.eventId]);
});

test("prefer-current removes chains and cycles after ranking", () => {
  const asOf = "2026-01-10T00:00:00.000Z";
  const old = fixtureEvent(1);
  const current = fixtureEvent(2, { relations: [{ type: "supersedes", target: old.eventId }] });
  const cycleA = fixtureEvent(3, { relations: [{ type: "supersedes", target: eventId(4) }] });
  const cycleB = fixtureEvent(4, { relations: [{ type: "supersedes", target: cycleA.eventId }] });
  const events = [old, current, cycleA, cycleB];
  const index = buildDerivedState(events, "ws_99999999999999999999999999999999").index;
  const filtered = resolveCurrentContextState(index, events.map((event) => event.eventId), {
    asOf,
    query: "release chain",
    supersessionPolicy: "prefer-current",
    policyEligibleEventIds: events.map((event) => event.eventId)
  });
  assert.deepEqual(filtered.eligibleEventIds, [current.eventId]);
  assert.deepEqual([...filtered.excludedEventIds].sort(), [old.eventId, cycleA.eventId, cycleB.eventId].sort());
});

test("evidence-complete prefix includes every intervening item and never uses the oracle to stop ranking", () => {
  const events = [1, 2, 3, 4, 5, 6].map((index) => fixtureEvent(index));
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const required = [events[0], events[2], events[3], events[5]].map((event) => ({ eventId: event.eventId }));
  const prefix = evidenceCompletePrefix(events.map((event) => event.eventId), required, byId, OUTPUT_LIMIT);
  assert.equal(prefix.eligible, true);
  assert.equal(prefix.lowestRequiredRank, 6);
  assert.deepEqual(prefix.eventIds, events.map((event) => event.eventId));
});

test("Qarinah options are complete and omit SQLite candidates", () => {
  const options = qarinahOptions({
    asOf: "2026-08-01T00:00:00.000Z",
    repositoryIds: ["owner/repository-a"],
    authorityScopes: []
  });
  assert.deepEqual(Object.keys(options), [
    "limit", "rankingProfile", "diversity", "includeFuzzy", "includeGraph", "temporalBoundary",
    "supersessionPolicy", "asOf", "repositoryIds", "authorityScopes"
  ]);
  assert.equal(Object.hasOwn(options, "sqliteCandidates"), false);
  assert.equal(options.limit, 32);
  assert.equal(options.temporalBoundary, "strict-before");
});

test("neutral relevance labels remain external to every retrievable event field", () => {
  const workspaceId = "ws_22222222222222222222222222222222";
  const scenario = {
    id: "external-oracle-case",
    target: { title: "Target evidence", body: "Target evidence body." },
    support: [
      ["Support one", "Support body one."],
      ["Support two", "Support body two."],
      ["Support three", "Support body three."]
    ]
  };
  const ledger = buildNeutralLedger(
    [scenario],
    1,
    createEventEnvelope,
    { neutralStratum: { ledger: { workspaceId } } }
  );
  assert.equal(ledger.events.length, 5);
  assert.deepEqual(ledger.relevanceByCase.get(scenario.id), [eventId(1), eventId(2), eventId(3), eventId(4)]);
  for (const event of ledger.events) {
    assert.equal(Object.hasOwn(event.data, "scenario"), false);
    assert.equal(Object.hasOwn(event.data, "role"), false);
    assert.equal(JSON.stringify(event).includes(scenario.id), false);
  }
});

test("all 24 protocol mutations fail closed without executing either retrieval method", () => {
  const outcomes = runMutationVerificationSuite();
  assert.equal(outcomes.length, 24);
  assert.deepEqual(outcomes.map((entry) => entry.id), MUTATIONS);
  assert.equal(outcomes.every((entry) => entry.pass && entry.probes >= 1), true);
});

test("Amendment 001 bindings are exact and execution remains hard-disabled", async () => {
  assert.equal(AMENDMENT_COMMIT, "6fb29afd741480176cd5b7c582fb13437308d805");
  assert.equal(AMENDMENT_TAG, "research-context-efficiency-protocol-v2-amendment-001");
  assert.equal(SOURCE_COMMIT, "6c22d8f293e1e99bbbee239abb36e219af2c96a9");
  await assert.rejects(
    executeV2Evaluation("unused-because-execution-is-disabled"),
    (error) => error?.code === "EVALUATOR_REVIEW_REQUIRED"
  );
});
