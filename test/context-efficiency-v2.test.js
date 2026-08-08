import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AMENDMENT_002_COMMIT,
  AMENDMENT_002_DOCUMENT_SHA256,
  AMENDMENT_002_SHA256,
  AMENDMENT_002_TAG,
  AMENDMENT_COMMIT,
  AMENDMENT_TAG,
  ATTEMPT_001_ARMED_COMMIT,
  ATTEMPT_001_ARMED_TAG,
  ATTEMPT_001_FAILURE_PATH,
  ATTEMPT_001_FAILURE_REPORT_SHA256,
  ATTEMPT_001_FAILURE_SHA256,
  ARMING_COMMIT_FILES,
  ARMING_COMMIT_MESSAGE,
  BM25_ALGORITHM_BINDING,
  CORRECTION_ATTEMPT_LABEL,
  CORRECTION_ATTEMPT_NUMBER,
  CORRECTION_COMMIT_FILES,
  CORRECTION_COMMIT_MESSAGE,
  CORRECTION_TAG,
  EVALUATOR_COMMIT,
  EVALUATOR_TAG,
  OUTPUT_LIMIT,
  SOURCE_COMMIT,
  bm25Lexemes,
  buildNeutralLedger,
  buildSafetyLedgers,
  completePreflightBeforeRetrievalLoad,
  evidenceCompletePrefix,
  eventId,
  qarinahOptions,
  rankAdmissionFilteredBm25,
  runV2FramePreflight,
  runMutationVerificationSuite,
  sha256,
  withVerifiedFrozenSource
} from "../scripts/context-efficiency-v2-lib.mjs";
import {
  softwareTaskScenarios,
  unrelatedRecordCount
} from "../bench/fixtures/software-task-scenarios.mjs";
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

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

test("structural TASK QUERY validation permits identical query bytes in sources, titles, and bodies", () => {
  const query = "literal overlap query";
  const sources = [{ path: "src/overlap.js", content: `source contains ${query} exactly` }];
  const events = [
    fixtureEvent(1, { title: `title contains ${query} exactly` }),
    fixtureEvent(2, { body: `body contains ${query} exactly` })
  ];
  const frame = renderModelFacingFrame({ query, currentSources: sources, events });
  assert.equal(frame.split(query).length - 1, 4);
  assert.doesNotThrow(() => assertCanonicalFrame({ frame, query, currentSources: sources, events }));
});

test("structural TASK QUERY validation still rejects appended, duplicated, omitted, mutated, and method-specific input", () => {
  const query = "frozen structural query";
  const sources = [{ path: "src/a.js", content: "export const a = 1;" }];
  const events = [fixtureEvent(1)];
  const frame = renderModelFacingFrame({ query, currentSources: sources, events });
  const mutations = [
    `${frame}\n${query}`,
    frame.replace(`TASK QUERY\n${query}\n\nCURRENT SOURCES\n`, `TASK QUERY\n${query}\n${query}\n\nCURRENT SOURCES\n`),
    frame.replace(`TASK QUERY\n${query}\n\n`, ""),
    frame.replace(`TASK QUERY\n${query}`, `TASK QUERY\nX${query.slice(1)}`),
    renderModelFacingFrame({ query: `${query} method-specific`, currentSources: sources, events }),
    renderModelFacingFrame({
      query,
      currentSources: [{ ...sources[0], content: `${sources[0].content} method-specific` }],
      events
    })
  ];
  for (const mutated of mutations) {
    assert.throws(() => assertCanonicalFrame({ frame: mutated, query, currentSources: sources, events }));
  }
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

test("source-bound preflight enforces the exact frozen runtime before retrieval", async () => {
  const frozenProtocol = JSON.parse(await readFile(
    path.join(repositoryRoot, "bench/research/context-efficiency-comparison-v2-protocol.json"),
    "utf8"
  ));
  const reference = frozenProtocol.referenceRuntime;
  const executableSha256 = `sha256:${createHash("sha256")
    .update(await readFile(process.execPath))
    .digest("hex")}`;
  const executablePathForAudit = path.resolve(process.execPath).replaceAll("\\", "/");
  const exactFrozenRuntime = process.version === reference.node
    && process.versions.v8 === reference.v8
    && process.versions.modules === reference.modulesAbi
    && process.platform === reference.platform
    && process.arch === reference.arch
    && executablePathForAudit === reference.executablePathForAudit
    && executableSha256 === reference.executableSha256;
  let callbackCalls = 0;
  if (exactFrozenRuntime) {
    await withVerifiedFrozenSource(repositoryRoot, async (context) => {
      callbackCalls += 1;
      assert.equal(context.preflight.completed, true);
      assert.equal(context.preflight.totalFrames, 1476);
      assert.equal(context.preflight.retrievalModulesLoadedDuringPreflight, false);
      assert.equal(context.preflight.retrievalOrRankingCallsDuringPreflight, 0);
    }, { loadRetrieval: false });
    assert.equal(callbackCalls, 1);
  } else {
    await assert.rejects(
      () => withVerifiedFrozenSource(repositoryRoot, async () => {
        callbackCalls += 1;
      }, { loadRetrieval: true }),
      (error) => error?.code === "BINDING_RUNTIME"
    );
    assert.equal(callbackCalls, 0);
  }
});

test("runtime-independent Amendment-002 preflight validates all 1,476 frames before retrieval can load or run", async () => {
  const protocol = JSON.parse(await readFile(
    path.join(repositoryRoot, "bench/research/context-efficiency-comparison-v2-protocol.json"),
    "utf8"
  ));
  const frozen = {
    fixture: { softwareTaskScenarios },
    neutralLedger: buildNeutralLedger(softwareTaskScenarios, unrelatedRecordCount, createEventEnvelope, protocol),
    safetyLedgers: buildSafetyLedgers(createEventEnvelope)
  };
  const context = { protocol, frozen, preflight: runV2FramePreflight({ protocol, frozen }) };
    const report = context.preflight;
    assert.equal(report.completed, true);
    assert.equal(report.neutralFrames, 1452);
    assert.equal(report.safetyFrames, 24);
    assert.equal(report.totalFrames, 1476);
    assert.equal(report.retrievalModulesLoadedDuringPreflight, false);
    assert.equal(report.retrievalOrRankingCallsDuringPreflight, 0);
    assert.equal(report.resultConstructedDuringPreflight, false);
    assert.equal(report.resultMaterializedDuringPreflight, false);
    assert.deepEqual(report.cases.map(({ stratum, caseId, eventCount, frameCount, firstOrdinal, lastOrdinal }) => ({
      stratum, caseId, eventCount, frameCount, firstOrdinal, lastOrdinal
    })), [
      { stratum: "neutral", caseId: "react-accessibility-edit", eventCount: 240, frameCount: 242, firstOrdinal: 1, lastOrdinal: 242 },
      { stratum: "neutral", caseId: "database-schema-migration", eventCount: 240, frameCount: 242, firstOrdinal: 243, lastOrdinal: 484 },
      { stratum: "neutral", caseId: "typescript-codebase-refactor", eventCount: 240, frameCount: 242, firstOrdinal: 485, lastOrdinal: 726 },
      { stratum: "neutral", caseId: "web-research-to-code", eventCount: 240, frameCount: 242, firstOrdinal: 727, lastOrdinal: 968 },
      { stratum: "neutral", caseId: "production-debugging", eventCount: 240, frameCount: 242, firstOrdinal: 969, lastOrdinal: 1210 },
      { stratum: "neutral", caseId: "governed-release-edit", eventCount: 240, frameCount: 242, firstOrdinal: 1211, lastOrdinal: 1452 },
      { stratum: "safety", caseId: "strict-before-boundary", eventCount: 2, frameCount: 4, firstOrdinal: 1453, lastOrdinal: 1456 },
      { stratum: "safety", caseId: "policy-admission-poison", eventCount: 6, frameCount: 8, firstOrdinal: 1457, lastOrdinal: 1464 },
      { stratum: "safety", caseId: "supersession-chain-cycle", eventCount: 5, frameCount: 7, firstOrdinal: 1465, lastOrdinal: 1471 },
      { stratum: "safety", caseId: "conflicting-policy-claim", eventCount: 3, frameCount: 5, firstOrdinal: 1472, lastOrdinal: 1476 }
    ]);

    const expectedOccurrences = new Map([
      ["strict-before-boundary", 2],
      ["policy-admission-poison", 2],
      ["supersession-chain-cycle", 2],
      ["conflicting-policy-claim", 1]
    ]);
    for (const caseDefinition of context.protocol.safetyStratum.cases) {
      const ledger = context.frozen.safetyLedgers.get(caseDefinition.id);
      const required = ledger.events.find((event) => event.eventId === caseDefinition.required[0].eventId);
      const frame = renderModelFacingFrame({ query: caseDefinition.query, currentSources: [], events: [required] });
      assert.equal(frame.split(caseDefinition.query).length - 1, expectedOccurrences.get(caseDefinition.id));
      assert.doesNotThrow(() => assertCanonicalFrame({
        frame,
        query: caseDefinition.query,
        currentSources: [],
        events: [required]
      }));
    }

    const calls = {
      loader: 0,
      rankContextEvents: 0,
      resolveContextAdmission: 0,
      resolveCurrentContextState: 0,
      rankAdmissionFilteredBm25: 0
    };
    const spies = Object.freeze({
      rankContextEvents: () => { calls.rankContextEvents += 1; },
      resolveContextAdmission: () => { calls.resolveContextAdmission += 1; },
      resolveCurrentContextState: () => { calls.resolveCurrentContextState += 1; },
      rankAdmissionFilteredBm25: () => { calls.rankAdmissionFilteredBm25 += 1; }
    });
    const loaded = await completePreflightBeforeRetrievalLoad({
      protocol: context.protocol,
      frozen: context.frozen,
      onFrameValidated: () => {
        assert.equal(calls.loader, 0);
        assert.equal(Object.values(calls).reduce((sum, value) => sum + value, 0), 0);
      },
      loadRetrieval: (completedPreflight) => {
        assert.equal(completedPreflight.totalFrames, 1476);
        calls.loader += 1;
        return spies;
      }
    });
    assert.equal(calls.loader, 1);
    assert.deepEqual(loaded.execution, spies);
    assert.equal(calls.rankContextEvents, 0);
    assert.equal(calls.resolveContextAdmission, 0);
    assert.equal(calls.resolveCurrentContextState, 0);
    assert.equal(calls.rankAdmissionFilteredBm25, 0);

    const query = context.protocol.neutralStratum.cases[0].query;
    const firstFrameMutations = [
      (frame) => `${frame}\n${query}`,
      (frame) => frame.replace(`TASK QUERY\n${query}\n\nCURRENT SOURCES\n`, `TASK QUERY\n${query}\n${query}\n\nCURRENT SOURCES\n`),
      (frame) => frame.replace(`TASK QUERY\n${query}\n\n`, ""),
      (frame) => frame.replace(`TASK QUERY\n${query}`, `TASK QUERY\nX${query.slice(1)}`),
      (frame) => frame.replace("CURRENT SOURCES\n", "CURRENT SOURCES\nmethod-specific mutation\n")
    ];
    for (const mutate of firstFrameMutations) {
      let failureLoaderCalls = 0;
      const before = { ...calls };
      await assert.rejects(() => completePreflightBeforeRetrievalLoad({
        protocol: context.protocol,
        frozen: context.frozen,
        mutateFrame: ({ descriptor, frame }) => descriptor.ordinal === 1 ? mutate(frame) : frame,
        loadRetrieval: () => {
          failureLoaderCalls += 1;
          return spies;
        }
      }), /CANONICAL_FRAME/u);
      assert.equal(failureLoaderCalls, 0);
      assert.deepEqual(calls, before);
    }
});

test("all 24 protocol mutations fail closed without executing either retrieval method", () => {
  const outcomes = runMutationVerificationSuite();
  assert.equal(outcomes.length, 24);
  assert.deepEqual(outcomes.map((entry) => entry.id), MUTATIONS);
  assert.equal(outcomes.every((entry) => entry.pass && entry.probes >= 1), true);
});

test("Amendment 002 and attempt-2 correction provenance are exact and outcome-free", () => {
  assert.equal(AMENDMENT_COMMIT, "6fb29afd741480176cd5b7c582fb13437308d805");
  assert.equal(AMENDMENT_TAG, "research-context-efficiency-protocol-v2-amendment-001");
  assert.equal(AMENDMENT_002_COMMIT, "b0e3ab2434cdbc9e8357e93a82b4da6cfeca7206");
  assert.equal(AMENDMENT_002_TAG, "research-context-efficiency-protocol-v2-amendment-002");
  assert.equal(AMENDMENT_002_SHA256, "sha256:bea45b82f934eb52f174ffb3c3a5f6c193fe0abaa5b61feb93d1313eb634f4b9");
  assert.equal(AMENDMENT_002_DOCUMENT_SHA256, "sha256:72751dc76210bef2cc6bc42e278641c99a0aa450ec61eefe1217fbf20d0561ab");
  assert.equal(EVALUATOR_COMMIT, "b160674d8bffa28c9169d262dcda65d32d238e80");
  assert.equal(EVALUATOR_TAG, "research-context-efficiency-evaluator-v2");
  assert.equal(ATTEMPT_001_ARMED_COMMIT, "90d702d24b5fcedfa936ce6d38bd245aea3bddb8");
  assert.equal(ATTEMPT_001_ARMED_TAG, "research-context-efficiency-evaluator-v2-armed");
  assert.equal(ATTEMPT_001_FAILURE_PATH, "bench/results/context-efficiency-comparison-0.1.6-v2-attempt-001-failure.json");
  assert.equal(ATTEMPT_001_FAILURE_SHA256, "sha256:c55e99eb0f7c6fda2d81475ae3181a4c23232abbb7d79292a0210823d2e0048f");
  assert.equal(ATTEMPT_001_FAILURE_REPORT_SHA256, "sha256:5671cadd2e21e583a2a6901dd8d9b55f4551cb939b03bd7775d679db33973117");
  assert.equal(SOURCE_COMMIT, "6c22d8f293e1e99bbbee239abb36e219af2c96a9");
  assert.equal(CORRECTION_ATTEMPT_NUMBER, 2);
  assert.equal(CORRECTION_ATTEMPT_LABEL, "correction-run-attempt-2");
  assert.equal(CORRECTION_TAG, "research-context-efficiency-evaluator-v2-correction-001");
  assert.deepEqual(CORRECTION_COMMIT_FILES, [
    "scripts/context-efficiency-v2-lib.mjs",
    "scripts/context-efficiency-v2-renderer.mjs",
    "test/context-efficiency-v2.test.js"
  ]);
  assert.equal(CORRECTION_COMMIT_MESSAGE, "research: correct context efficiency v2 preflight");
  assert.deepEqual(ARMING_COMMIT_FILES, [
    "scripts/context-efficiency-v2-lib.mjs",
    "scripts/context-efficiency-v2-renderer.mjs",
    "test/context-efficiency-v2.test.js"
  ]);
  assert.equal(ARMING_COMMIT_MESSAGE, "research: correct context efficiency v2 preflight");
});
