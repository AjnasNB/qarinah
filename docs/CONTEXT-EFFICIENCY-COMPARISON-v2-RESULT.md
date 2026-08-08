# Qarinah context-efficiency comparison v2: attempt 2 result

Status: audited development-fixture result; **no primary comparative context-efficiency result**

This document reports the committed attempt-2 artifact without changing the frozen protocol, either amendment, the attempt-1 failure record, or the result itself.

## Result identity

- artifact: [`bench/results/context-efficiency-comparison-0.1.6-v2.json`](../bench/results/context-efficiency-comparison-0.1.6-v2.json)
- artifact SHA-256: `a1dab5b0768c0f242262e5bbce9a7d613a3bfc5ebdf1cad0bfd65687366f9701`
- result commit: `e5b74ef270e01564076e3434c884658cfba16870`
- annotated result tag: `research-context-efficiency-result-v2-attempt-002`
- correction implementation: `f7fc5af1d44edb4539d52bde66eaa8b47977b616`, tag `research-context-efficiency-evaluator-v2-correction-001`
- exact command: `npm run evaluate:context-efficiency-comparison:v2:write`
- classification: development fixture comparison; not externally preregistered or provider-backed

The result is bound to the [base protocol](CONTEXT-EFFICIENCY-COMPARISON-v2-PROTOCOL.md), [Amendment 001](CONTEXT-EFFICIENCY-COMPARISON-v2-AMENDMENT-001.md), and the post-failure [Amendment 002](CONTEXT-EFFICIENCY-COMPARISON-v2-AMENDMENT-002.md).

## Primary decision

The protocol required both primary methods to recover all four exact required events by rank 32 in all six cases. Each method was eligible on five of six cases, so the six-case primary comparison was unavailable.

| Frozen case | Qarinah estimated tokens | Admission-filtered BM25 estimated tokens | Primary status |
| --- | ---: | ---: | --- |
| React accessibility edit | 630 | 630 | Both eligible |
| Database schema migration | 680 | 680 | Both eligible |
| TypeScript codebase refactor | - | - | Both ineligible |
| Web research to code | 574 | 574 | Both eligible |
| Production debugging | 1,191 | 1,191 | Both eligible |
| Governed release edit | 1,202 | 1,202 | Both eligible |
| **Five-case diagnostic subtotal** | **4,277** | **4,277** | **Not the primary statistic** |

The five eligible cases were token-identical between `qarinah-admission-first-v2` and `admission-filtered-bm25`. The 4,277-token subtotal is descriptive only. The frozen rule does not permit it to replace the missing six-case primary statistic, produce a percentage reduction, or select a winner.

In the TypeScript case, required support-3 event `evt_00000000-0000-4000-8000-000000000012` was absent from both methods' top-32 orderings. The artifact records `0` as the not-found sentinel in each required-rank array. It does **not** mean rank 33, and this report does not describe it as rank 33.

## Fixed-k diagnostic

The fixed-`k` check was exact on 2/6 cases for Qarinah and 2/6 for admission-filtered BM25. Under the frozen protocol, fixed-`k` is a utility diagnostic only. It is not a token-efficiency ranking and cannot substitute for the unavailable primary comparison.

## Safety and integrity gates

| Method | Required safety gates passed | Forbidden-inclusion detections | Role |
| --- | ---: | ---: | --- |
| Qarinah admission-first v2 | 4/4 | 0 | Reported safety method |
| Admission-filtered BM25 | 4/4 | 0 | Reported safety method |
| Raw BM25 | 0/4 | 26 | Safety-only negative control |

Qarinah's separate conflict audit passed. All 24 required mutation groups also passed. The correction run completed the 1,476-frame preflight before retrieval, with no retrieval module loaded and zero retrieval or ranking calls during that preflight.

These safety observations do not repair the missing neutral evidence item and do not create a primary comparative result.

## Attempt chronology

[Attempt 1](CONTEXT-EFFICIENCY-COMPARISON-v2-ATTEMPT-001-FAILURE.md) failed on the old `CANONICAL_FRAME` validator after retrieval had begun. It produced no aggregate, comparative metric, winner, result object, emitted result, or materialized result. Its in-memory observations were not reused for attempt 2.

Amendment 002 then froze a validator-only correction and a true no-retrieval preflight. The correction was implemented and independently reviewed at `f7fc5af1d44edb4539d52bde66eaa8b47977b616`. The separately authorized attempt 2 reran the frozen inputs and produced the committed artifact identified above.

## Measurement boundary

V2 uses the portable estimator `ceil(UTF-16 JavaScript string length / 4)`. It did not measure provider-reported input tokens, a provider tokenizer, bills, generated-patch task completion, human-rated quality, or runtime performance. It supports no universal or industry-wide claim.

The result therefore does not establish a winning method, a broad superlative, or a `98.x%` comparative reduction. It reports identical estimated-token counts on five jointly eligible development cases, one jointly ineligible case, and the safety outcomes above.

## Relationship to the separate 98.7148% fixture

The verified **98.7148%** figure remains the unchanged result of a different deterministic estimator fixture: the six-task repeated-project-context benchmark compares 442,113 estimated full-history tokens with 5,682 estimated Qarinah-pack tokens, with every required target directly covered in the top five. See the [benchmark methodology](BENCHMARKS.md#software-task-context-benchmark) and [machine-readable fixture result](../bench/results/software-task-context-0.1.0.json).

That fixture is not the v2 Qarinah-versus-admission-filtered-BM25 study. Its 98.7148% result must not be presented as v2 comparative superiority.

## Allowed concise wording

> Attempt 2 produced no primary comparative context-efficiency result. Qarinah and admission-filtered BM25 were each primary-eligible on five of six frozen development cases and had identical portable token estimates on those five cases. Both passed all four safety cases with zero forbidden inclusions; raw BM25, the safety-only negative control, passed zero of four and produced 26 forbidden-inclusion detections.

When the separate headline fixture is relevant, add:

> Separately, Qarinah's committed six-task repeated-history estimator fixture reports a verified 98.7148% reduction. That figure is not a v2 method-comparison result.
