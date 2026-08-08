# Qarinah context-efficiency comparison v2 — amendment 002

Status: post-attempt-1 failure; pre-correction implementation; pre-correction-run  
Authored: 2026-08-08  
Next possible execution: correction-run attempt 2, only after the gates below

## Why this amendment exists

The single authorized attempt at armed commit `90d702d24b5fcedfa936ce6d38bd245aea3bddb8` failed with exit code `1`, `CANONICAL_FRAME`, and `2 !== 1`. The exact command was `npm run evaluate:context-efficiency-comparison:v2:write`.

The canonical renderer bytes were correct. The structural `TASK QUERY` field contained the exact frozen query, but the same query bytes also appeared legitimately in a selected evidence title. The validator counted literal occurrences across the complete frame and rejected the count of two.

Retrieval had already executed: all six neutral observations were computed in memory, and Qarinah, admission-filtered BM25, and raw-BM25 rankings were computed for the first safety case. The failure occurred at the first Qarinah safety method observation. No aggregate, winner, claim decision, result object, emitted result, written result, or operator-visible comparative metric was produced.

This exposes a second issue in Amendment 001's failure rule. It promised that a renderer, method, or safety mismatch would abort before either retrieval method. The data-dependent frame validator ran after retrieval, so that pre-retrieval promise was not met. The no-result part of the rule did hold.

The preserved evidence is:

- failure receipt: `bench/results/context-efficiency-comparison-0.1.6-v2-attempt-001-failure.json`, `sha256:c55e99eb0f7c6fda2d81475ae3181a4c23232abbb7d79292a0210823d2e0048f`
- failure report: `docs/CONTEXT-EFFICIENCY-COMPARISON-v2-ATTEMPT-001-FAILURE.md`, `sha256:5671cadd2e21e583a2a6901dd8d9b55f4551cb939b03bd7775d679db33973117`

## Frozen lineage

- base protocol: `d7f2a09bed34507b3aec070f765d20b6a834d6d9`, tag `research-context-efficiency-protocol-v2`, tree `b9bc5b84b48876ebf4e9bbdeaeb6b7a703ae3c87`
- Amendment 001: `6fb29afd741480176cd5b7c582fb13437308d805`, tag `research-context-efficiency-protocol-v2-amendment-001`, tree `a9852a06958a7efda6537cb99e5e1d26ca17b302`
- reviewed evaluator: `b160674d8bffa28c9169d262dcda65d32d238e80`, tag `research-context-efficiency-evaluator-v2`, tree `19a01bc47a817f3dc8275c533183ecc073afb458`
- attempt-1 armed evaluator: `90d702d24b5fcedfa936ce6d38bd245aea3bddb8`, tag `research-context-efficiency-evaluator-v2-armed`, tree `2bbfce43f929735fad9fcbe47e7a439bd88d0c26`

All existing commits and annotated tags remain preserved.

## Narrow correction

The validator must identify the structural query slot, not count the query everywhere.

The corrected rule is:

1. The frame must still equal the canonical renderer byte for byte.
2. `TASK QUERY\n` must begin at byte offset zero.
3. The bytes between that header and `\n\nCURRENT SOURCES\n` must equal the exact frozen query.
4. The current-source field must follow immediately.
5. The same query bytes may legitimately occur any number of times in current sources, event titles, or event bodies.
6. Query and current-source bytes remain identical across methods.

The renderer output does not change. Its frozen bindings remain:

- frame template: `sha256:9466fed249971e7c894e52faf80f3bd14bef335b0aa6a28ceafe5ca0d965a56a`
- item template: `sha256:477e47cbf1d3ff47335f6b1c9319afbb38f7fd13517f072a5100a2c44432211d`

The validator file hash will necessarily change, but the rendered bytes, template, line endings, separators, complete bodies, fields, and item order must remain identical.

Duplicating or omitting the structural query, changing one query byte, making query or current-source bytes method-specific, or changing any canonical frame byte must still fail closed. Regression tests must also prove that exact query repetitions in a title, body, or current source pass.

## True no-retrieval preflight

Before retrieval modules are loaded or any Qarinah/BM25 ranking call is made, the corrected evaluator must validate 1,476 deterministic frames using only frozen events, frozen current sources, the renderer, and the validator:

- neutral: six cases × (one empty-memory frame + 240 single-event frames + one full-ledger frame) = 1,452
- safety: for ledgers of 2, 6, 5, and 3 events, one empty-memory frame + every single-event frame + one full-ledger frame = 24

Post-ranking selected frames must still be validated as well.

Tests must place counters or throwing spies around `rankContextEvents`, `resolveContextAdmission`, `resolveCurrentContextState`, and admission-filtered BM25. They must prove zero calls before preflight completion and zero calls when any preflight mutation fails.

This preflight explicitly covers the three required safety frames whose title repeats their query:

- `strict-before-boundary`: `checkpoint sentinel` / `checkpoint sentinel before`
- `policy-admission-poison`: `poison sentinel` / `poison sentinel permitted evidence`
- `supersession-chain-cycle`: `release chain` / `release chain current`

The `conflicting-policy-claim` required frame has one literal occurrence and must also pass.

## What does not change

Only query-slot validation semantics, true pre-retrieval frame preflight, and attempt provenance change. The following remain frozen:

- ranking algorithms, exact options, scoring, ordering, candidate sets, output limits, and stopping rules;
- all neutral and safety fixtures, query/current-source bytes, ledgers, relevance bindings, and event identities;
- canonical renderer output bytes;
- token estimator, accounting, ceiling, aggregation, missing-evidence and tie rules;
- required/forbidden evidence gates, conflict audit, safety gates, claim gates, and allowed winner wording;
- all non-query mutations and the fail-closed structural-query mutations;
- result path `bench/results/context-efficiency-comparison-0.1.6-v2.json`;
- development-only claim boundary.

Attempt-1 in-memory observations cannot be reused as correction-run metrics. Attempt 2 must evaluate from the frozen inputs again after preflight.

## Correction implementation gate

This amendment does not authorize execution. Before correction-run attempt 2:

1. The failure receipt, failure report, and Amendment 002 must be committed, annotated-tagged, and pushed.
2. A separate validator-only correction commit must implement this amendment.
3. That correction must be annotated-tagged, pushed, and independently reviewed.
4. Review must verify no ranking, algorithm, candidate, fixture, renderer-output, token, safety, claim, or result-path change.
5. All new regressions, all 1,476 preflight frames, all existing tests, all binding checks, and all 24 mutation groups must pass.
6. The result path must still be absent, and the correction arming tree must be exact and clean.
7. A separate explicit authorization must name the one correction run.

Only then may the exact command `npm run evaluate:context-efficiency-comparison:v2:write` be run once as `correction-run-attempt-2`. No silent rerun is allowed.

Any result must include the attempt-1 failure receipt path and SHA-256, state that retrieval executed but no metric/result was produced, and bind the Amendment-002 commit/tag, correction commit/tag, command, runtime, and helper hashes. If attempt 2 fails, it must write no result; another dated amendment, implementation, review, and explicit authorization are required before any later attempt.

## Claim boundary

Attempt 1 and this amendment support no comparative metric, winner statement, or universal/industry “best” claim. Any later wording remains restricted to the original development-only protocol template and every unchanged safety gate.
