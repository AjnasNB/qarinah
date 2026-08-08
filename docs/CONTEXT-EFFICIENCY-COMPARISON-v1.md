# Context-efficiency comparison v1

Status: exploratory deterministic development benchmark for Qarinah 0.1.6. The evaluator, protocol text, and result were developed together. V1 was not externally preregistered or frozen before its outcomes were observed, and it is not the provider-backed final experiment.

## Descriptive result

In the exploratory v1 script's six constructed cases, Qarinah produced 4,664 portable estimated model-facing tokens versus 5,035 for the compact BM25 control. Both passed the script's target-body and citation-string presence gates on all six cases.

This is a script-gate observation, not a comparative ranking. The methods returned different item counts, and v1 requires only one target record per case. It therefore does not hold evidence utility constant.

| Method | Script-gate passes | Memory estimate | Total model-facing estimate | Estimated reduction vs full history | Fixed-budget method |
| --- | ---: | ---: | ---: | ---: | --- |
| Full history, uncapped stored-event JSON records | 6/6 | 445,920 | 446,991 | reference | no |
| Last-N complete records | 0/6 | 7,584 | 8,661 | 98.0624% | yes |
| Standalone BM25 complete records | 6/6 | 7,631 | 8,705 | 98.0525% | yes |
| Standalone BM25 compact audit pack | 6/6 | 3,961 | 5,035 | 98.8736% | yes |
| Qarinah `admission-first-v2` audit pack | 6/6 | 3,590 | 4,664 | 98.9566% | yes |

The compact comparison returned four BM25 items and three Qarinah items in four cases. In the two cases where both returned three items, compact BM25 used 17 fewer estimated tokens per case. V1 can reward a method for returning fewer records after the single required target passes, so these totals do not establish fixed-utility context efficiency.

## V1 protocol status and mechanics

The primary track reuses the committed six-task software-task fixture: six task types, 240 retained records, and the same current source files for every method within a case. The fixture-defined target body, event ID, and event hash form the current script gate.

The replay conditions are:

- memory ceiling: 1,300 portable estimated tokens per fixed-budget method and case;
- maximum: eight complete records or audit-pack items;
- target-body gate: the exact fixture-defined target body must occur in model-facing text;
- citation-string gate: the target event ID and generated SHA-256 event hash must both occur somewhere in model-facing text;
- aggregate script-gate status: all six cases must pass the target, citation-string, and applicable budget checks;
- descriptive total: sum the portable estimated model-facing tokens across the six cases.

Full history is an uncapped reference and has no fixed-budget pass/fail status. Last-N and complete-record BM25 take a fixed ranked prefix and stop when the next complete JSON record would exceed the ceiling. They do not inspect the target gate while selecting.

Both standalone lexical controls use BM25 with `k1=1.2`, `b=0.75`, and a `1.8` title-term boost. The compact control uses the production Markdown renderer, audit-item envelope, excerpt construction, token reservations, 1,300-token limit, and maximum-eight-item rule. Qarinah uses its production-bound `admission-first-v2` compiler with strict-before temporal admission.

V1 still has an important accounting asymmetry. Audit-pack selection is constrained by the larger of pretty-JSON and rendered-Markdown estimates, while the descriptive total counts rendered Markdown. Method-specific JSON-only metadata can therefore change the selected item count without appearing in the reported model-facing total.

The explicit task query is embedded in Qarinah and compact-BM25 pack framing but is not added to the complete-record baselines. Current source text is identical within a case, but v1 is not symmetric end-to-end prompt accounting.

## What the gates mean

“Target-body present” means the exact fixture-defined answer-bearing body occurs in the input text. No language model generates or scores an answer in this benchmark.

“Citation strings present” means the expected event ID and generated event hash both occur somewhere in the input text. The check does not parse an item boundary or prove that a model will cite or interpret the evidence correctly.

These checks prevent an empty output from passing. They do not measure task success, evidence quality, full relevant-evidence recall, or provider usage.

## Secondary continuation observation

The evaluator also recreates a deterministic 42-record continuation fixture. This one constructed case is descriptive and is not part of the primary script-gate observation.

| Method | Estimated tokens | Summary + source citation strings | Summary + citation strings or manifest pointer |
| --- | ---: | --- | --- |
| Full history | 9,593 | pass | pass |
| Last-N complete records | 1,089 | pass | pass |
| Standalone BM25 complete records | 1,142 | pass | pass |
| Summary text without citation metadata | 57 | fail | fail |
| Qarinah evidence-rich audit pack | 687 | pass | pass |
| Qarinah handoff capsule | 119 | fail | pass |

The first gate requires the exact summary body, summary event ID/hash, and all three source event ID/hash strings somewhere in the rendered text. It does not require three distinct source items or their bodies. Summary metadata itself can carry those strings, so this gate must not be described as proof that every raw source record is embedded.

The second gate accepts either all source ID/hash strings or the exact generated audit-pack manifest pointer while still requiring the summary ID/hash. The 119-token capsule passes only this reference gate. V1 does not test whether a fresh process resolves the pointer and obtains each distinct source body.

## Token-accounting boundary

Every number uses `ceil(JavaScript string length / 4)`. These are portable estimates, not provider tokenizer output, usage receipts, billing measurements, latency, cost, or agent task success.

For Qarinah and compact BM25, the enforced pack budget is the larger of the pretty-JSON and rendered-Markdown estimates. The result table reports rendered Markdown as the designated model-facing representation. Per-case artifact fields now distinguish `memoryEstimatedTokens` from `budgetAccountingTokens`; uncapped full history reports a null budget status rather than a pass.

## Reproduce and verify

Generate the versioned exploratory artifact intentionally:

```sh
npm run evaluate:context-efficiency-comparison:write
```

Verify it without modifying the artifact:

```sh
npm run check:context-efficiency-comparison
```

The verifier rebuilds both fixtures and requires deep equality with [`bench/results/context-efficiency-comparison-0.1.6-v1.json`](../bench/results/context-efficiency-comparison-0.1.6-v1.json). `npm run check` includes this replay.

The v1 artifact binds the current evaluator, committed software fixture, and a 77-file production implementation manifest. It does not separately bind `scripts/continuation-evidence-lib.mjs`, the Node runtime version, or the operating system.

Temporary workspaces receive random workspace IDs. Event hashes, chain-head hashes, and context-pack manifest hashes therefore vary across replays. V1 stores gate booleans and aggregate sizes rather than those exact generated identities. Deep equality demonstrates reproducible reported metrics under the current inputs; it is not an exact ledger-identity replay.

## Limitations and next protocol

- The six cases are constructed development fixtures, not an untouched real-repository sample.
- Query wording has high lexical overlap with fixture-defined evidence.
- The answer strings and citation targets are fixture-defined.
- Returned item counts and evidence utility are not normalized between Qarinah and compact BM25.
- The continuation citation-string gate does not require distinct raw source records.
- There is no human quality rating, patch resolution, provider token receipt, latency, or cost measurement.
- V1 was developed after earlier Qarinah results and is exploratory.

The separately versioned [v2 pre-execution protocol](CONTEXT-EFFICIENCY-COMPARISON-v2-PROTOCOL.md) corrects these issues before any v2 evaluator or result exists. It does not change or erase this v1 artifact.
