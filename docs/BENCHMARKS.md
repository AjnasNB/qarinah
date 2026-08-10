# Qarinah benchmarks and honest numbers

Qarinah reports context-volume and retrieval-regression measurements. It does not convert character estimates into claims about provider billing, model reasoning, answer correctness, latency on every machine, or total application cost.

## Exact release headline

| Result | Baseline | Qarinah output | Exact reduction | What the output preserves |
| --- | ---: | ---: | ---: | --- |
| Six-task repeated project context | 442,113 estimated tokens | 5,682 estimated tokens | **98.7148%** | Every required target directly covered in the top five |
| Two-session continuation capsule | 9,489 estimated tokens | 119 estimated tokens | **98.7459%** (98.75% rounded) | Summary event ID/hash and complete-pack manifest pointer |
| Two-session complete audit pack | 9,489 estimated tokens | 1,039 estimated tokens | **89.0505%** (89.05% rounded) | All three summary-source event IDs/hashes plus a selected raw source |

The 98.75% and 89.05% values are intentionally different. They use the same 42-record continuation history but measure two output surfaces. The capsule is the minimal text intended for model injection. The larger audit pack is the independently inspectable evidence artifact to which that capsule points. Reporting the capsule as if it contained the complete evidence pack would be incorrect; describing the larger pack as a regression would also be incorrect.

All three results use the portable estimator `ceil(characters / 4)`. The exact committed fractions are `1 - 5,682 / 442,113`, `1 - 119 / 9,489`, and `1 - 1,039 / 9,489`. These are deterministic context-volume measurements, not provider usage receipts.

The 0.1.6 release evidence is bound in [`bench/results/benchmark-release-0.1.6.json`](../bench/results/benchmark-release-0.1.6.json) and checked by [`scripts/verify-benchmark-release-0.1.6.mjs`](../scripts/verify-benchmark-release-0.1.6.mjs). The manifest is a timestamped pre-publication verification receipt for the exact source later distributed as Qarinah 0.1.6, the website, and white-paper v1.3 with version DOI [`10.5281/zenodo.21843240`](https://doi.org/10.5281/zenodo.21843240). Its lifecycle fields intentionally preserve the state at local verification rather than acting as a live publication-status endpoint. It classifies the only provider-backed continuation receipt as historical 0.1.5 evidence.

## Release evidence map

Qarinah 0.1.6, the generated host integrations, the website, and white-paper v1.3 are released from one reviewed source commit. The evidence below is included with that release:

| Evidence | What it establishes | Release status |
| --- | --- | --- |
| Six-task software fixture | Estimated repeated-context volume and direct top-five coverage | Included in Qarinah 0.1.6 and paper v1.3 |
| Long-document fixture | Fixed-budget retrieval, supported-answer preservation, and unsupported-control rejection | Included in Qarinah 0.1.6 and paper v1.3 |
| Cross-session continuation fixture | Evidence-linked summary retrieval, a complete audit pack, and a compact model-facing capsule | Included in Qarinah 0.1.6 and paper v1.3 |
| SWE-bench Lite development study | Retrieval ranking, temporal leakage, repository isolation, and the production-bound v0.4 gate on real repositories | Included in Qarinah 0.1.6 and paper v1.3 |
| Current-product v0.5 differential reproduction | Complete projected equality to immutable v0.4 on the same inspected development corpus | Post-v1.3 development evidence; non-confirmatory |
| SWE-bench Verified confirmatory study | Provider usage, patch resolution, cost, and human-rated quality | Protocol only; the study has not run |

The SWE-bench work follows the official public dataset and evaluation framing, but the completed phase is a retrieval study rather than an official patch-resolution score. The frozen 40-task provider-backed study remains unexecuted, so Qarinah does not claim improved SWE-bench resolve rate or provider-native token savings.

## Software-task context benchmark

Command:

```sh
npm ci
npm run evaluate:software-tasks
```

The committed evaluator creates 240 retained project-history records and runs six reproducible software tasks. Both sides receive the same current task source snippets. The baseline additionally replays the complete retained history; the Qarinah path adds only the cited pack compiled for that task.

| Task | Full-history baseline | Qarinah context | Reduction |
| --- | ---: | ---: | ---: |
| React accessibility edit | 73,765 estimated tokens | 1,025 estimated tokens | 98.61% |
| Database schema migration | 73,703 | 968 | 98.69% |
| Repository-wide TypeScript refactor | 73,628 | 895 | 98.78% |
| Web research to implementation | 73,693 | 963 | 98.69% |
| Production regression debugging | 73,697 | 954 | 98.71% |
| Governed release preparation | 73,627 | 877 | 98.81% |
| **Weighted total** | **442,113** | **5,682** | **98.71%** |

Every required decision ranked in the top five, every query returned direct evidence coverage, and the packs contained zero model-written summary records. The weakest individual reduction was 98.61%.

Estimated tokens use `ceil(characters / 4)`. They are reproducible context-volume estimates, not usage receipts from Codex, Claude, OpenAI, or Anthropic. The required source files remain in both measurements; Qarinah replaces accumulated-history replay, not the code, schema, logs, tests, or research excerpts needed for the current task.

### Cost translation

The six-task benchmark sends 436,431 fewer estimated input-context tokens. Its baseline-to-pack ratio is `442,113 / 5,682 = 77.809398...`, reported as **77.81:1**. The precise public wording is: **the evaluated full-history baseline contained 77.81 times as many estimated input-context tokens as the Qarinah path.**

At a flat $3 per million uncached input tokens, the aggregate compared context slice moves from $1.326339 to $0.017046, saving $1.309293 each time the complete slice would otherwise be sent or $13.092930 across ten repeats. The general formula is `estimated tokens / 1,000,000 x flat uncached input rate x repeats`.

This translation is useful because the percentage is independent of the chosen flat unit price. It is not a provider invoice: provider-native tokenization, output, reasoning, tool calls, cache writes and reads, indexing, retrieval, hosting, and fixed provider charges remain separate. Tiered long-context pricing requires a provider-specific calculation.

The exact scenario sources, expected decisions, unrelated retained history, queries, arithmetic, and per-task results are committed in [`bench/fixtures/software-task-scenarios.mjs`](../bench/fixtures/software-task-scenarios.mjs), [`scripts/evaluate-software-tasks.mjs`](../scripts/evaluate-software-tasks.mjs), and [`bench/results/software-task-context-0.1.0.json`](../bench/results/software-task-context-0.1.0.json). The evaluator fails when any committed deterministic result changes.

## Long-document retrieval benchmark

Command:

```sh
npm ci
npm run evaluate:long-document
```

The evaluator constructs a deterministic 384-section synthetic operations handbook, segments it into retained source records, and distributes eight answer-bearing passages across the start, middle, and end. It then runs eight exact lookups, eight typo-tolerant lookups, and four unsupported controls. Every positive query uses the same fixed 600-token pack ceiling; the evaluator does not search for a favorable budget per query.

| Measurement | Result |
| --- | ---: |
| Source size | 139,001 characters |
| Portable token estimate | 34,751 |
| Positive queries | 16 |
| Answer-bearing passage at rank 1 | 16 / 16 |
| Answers preserved in cited excerpts | 16 / 16 |
| Average Qarinah pack | 534 estimated tokens |
| Largest Qarinah pack | 556 estimated tokens |
| Worst-case estimated reduction | 98.4% |
| Unsupported questions rejected with direct coverage required | 4 / 4 |
| Model-written summary items | 0 |

The result verifies targeted, evidence-linked retrieval from a large pre-segmented source under a fixed budget. The unsupported controls require `direct` evidence coverage; the benchmark does not claim that every unsupported query is rejected when callers permit partial lexical coverage. It also does not demonstrate whole-book summarization, native PDF ingestion, semantic answer quality, or a provider's exact token bill. The portable estimate is `ceil(characters / 4)`. The source generator, assertions, and machine-readable expected result are committed in [`scripts/evaluate-long-document.mjs`](../scripts/evaluate-long-document.mjs) and [`bench/results/long-document-context-0.1.0.json`](../bench/results/long-document-context-0.1.0.json).

## Multi-file project context and projection-integrity benchmark

Command:

```sh
npm ci
npm run evaluate:multifile-context
```

This higher-difficulty regression creates separate deterministic 40-, 50-, and 100-file repositories. The 190 generated files are split across nested JavaScript modules and Markdown runbooks, and every file contains a resolved import or link. Each workspace also receives one unique answer-bearing memory record per file, heavily repeated distractor language, a graph-only linked decision, a superseded decision, a contradiction, deliberately stale graph and Markdown projections, and three unsupported direct-coverage queries.

The evaluator queries every file twice rather than sampling only a few positions: once with its exact evidence label and once with a misspelled label. That produces **380 / 380 rank-1 positive results**, with every cited answer preserved.

| Workspace | Positive queries at rank 1 | Exact queries accepted as direct | Typo queries correctly retrieved but conservatively abstained | Unsupported direct queries rejected | Largest pack | Worst-case estimated reduction vs ledger |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 40 files | 80 / 80 | 40 / 40 | 40 / 40 | 3 / 3 | 1,420 estimated tokens | 93.4803% |
| 50 files | 100 / 100 | 50 / 50 | 50 / 50 | 3 / 3 | 1,421 estimated tokens | 94.6948% |
| 100 files | 200 / 200 | 100 / 100 | 100 / 100 | 3 / 3 | 1,478 estimated tokens | 97.1521% |

Every exact query used the persisted SQLite FTS candidate path. Every typo query used fuzzy retrieval and still ranked the correct cited record first, but the independent evidence-sufficiency gate returned `ABSTAIN` because the misspelled query had only partial exact coverage. This distinction is intentional: retrieval may offer relevant evidence for inspection without claiming that the evidence is directly sufficient.

All three scales additionally verify:

- SQLite event count and head identity against the verified ledger, required tables, and retrieval of the final file's evidence;
- exactly one graph file node and one resolved import/link edge per generated file;
- the first, middle, and final paths in generated `CONTEXT.md`;
- a query-matched late path and its reference in the bounded project-structure excerpt;
- recovery of a decision available only through an event-graph relationship;
- current-decision preference, explicit supersession exclusion, and contradiction visibility;
- identical target rank for selected persisted and in-memory reads;
- detection and rebuilding of stale-but-valid graph and Markdown projections; and
- nine unsupported direct-coverage controls rejected with `CONTEXT_COVERAGE_TOO_LOW`.

“Fail closed” therefore does not mean that long-document or multi-file retrieval failed. It means Qarinah refused to label unsupported evidence as direct. In this benchmark, **9 / 9 unsupported controls were successful fail-closed behavior**.

The fixture is synthetic so relevance and answers are completely auditable. It measures local retrieval, bounded evidence preservation, and projection integrity; it does not measure provider-reported tokens or coding-task completion. The context-volume values use portable `ceil(characters / 4)` estimates. See the [evaluator](../scripts/evaluate-multifile-context.mjs), [machine-readable result](../bench/results/multifile-context-0.1.6.json), and [artifact verifier](../scripts/verify-multifile-context.mjs).

## Retrieval-regression fixture

Command:

```sh
npm ci
npm run evaluate:context
```

The evaluator creates a deterministic 54-record local workspace, runs four fixed retrieval cases, and reports:

- recall at 5;
- mean reciprocal rank;
- explicit conflict recall;
- supersession precision;
- average emitted pack characters;
- raw event-log characters replayed per query;
- character reduction;
- local query time.

The preserved 2026-07-21 release-candidate run on Node `24.15.0` for Windows x64 produced recall@5 `1.0`, mean reciprocal rank `1.0`, conflict recall `1.0`, supersession precision `1.0`, average pack size `2,237` characters, raw replay size `44,364` characters per query, and character reduction `94.96%`. Context-pack v2 is larger than v1 because it includes explicit evidence-coverage metadata.

This four-case fixture remains a focused regression check for exact retrieval, typo tolerance, graph evidence, conflict visibility, and supersession. The larger software-task benchmark above is the public context-volume example.

The deterministic values are committed in [`bench/results/context-evaluation-0.1.0.json`](../bench/results/context-evaluation-0.1.0.json). The evaluator reads that file and fails when a release changes any expected retrieval or context-volume field without updating the evidence.

## Fixed-workspace volume observation

A separate 2026-07-21 development-workspace check produced the following arithmetic:

| Context method | Characters | Estimated tokens | Reduction |
| --- | ---: | ---: | ---: |
| Qarinah live pack | 6,971 | 1,743 | Baseline |
| Eight manually selected project documents | 73,479 | 18,370 | 90.5129% |
| Entire generated `CONTEXT.md` | 61,223 | 15,306 | 88.6138% |
| All 230 indexed files | 2,444,888 | 611,222 | 99.7149% |

Estimated tokens use `ceil(characters / 4)`. The reductions are calculated directly from character counts. The durable Qarinah summary is event `evt_d7ee88e9-8732-4db6-8869-91764d7825e4` at hash `sha256:9ed441ea3fbecf62cc66a645f226f192a12d4ed459b33df6179319abe8f0fd07`. The 230-file total is linked to project snapshot `sha256:42b34bf6d462a88fc62a50b2757e34b6c1edecdc786f6d22a7e980fdfb2ffb31`.

These values are development evidence, not the primary reproducible release benchmark. The durable summary did not retain the original eight-file selection manifest or the original pack payload, so an independent reader cannot reproduce every row from the public repository. The machine-readable observation therefore sets `claimEligible` to `false`, and the extreme whole-corpus comparison is not used as headline copy. See [`bench/results/live-workspace-volume-2026-07-21.json`](../bench/results/live-workspace-volume-2026-07-21.json).

## Published benchmark statement

> 98.71% fewer estimated context tokens than full-history replay across six committed software-task fixtures; every required target ranked in the top five with direct evidence coverage.

Keep these direct details beside the number:

> 240 retained records; identical current-task sources on both sides; full-history replay versus cited Qarinah packs; `ceil(characters / 4)` token estimate; no provider-billing measurement.

## Cross-session continuation and evidence-linked summarization

Qarinah 0.1.6 ships a deterministic 42-record, two-session continuation fixture. A fresh logical session retrieves an inferred handoff summary at rank 3 after lifecycle capture deliberately makes the persisted read model stale. All three source event IDs and hashes remain embedded in the selected full pack, one raw source is also selected, the query leaves derived state byte-for-byte unchanged, and `doctor` passes. The complete cited audit pack uses 1,039 portable estimated tokens versus 9,489 for the full ledger, an 89.0505% estimated reduction. A separate 119-token model-facing handoff capsule points to that exact pack manifest and the selected summary event ID/hash, yielding a 98.7459% estimated reduction against the same unchanged history. The capsule is a compact projection, not a replacement for the complete evidence pack.

A separate authenticated Codex CLI smoke uses two distinct ephemeral sessions with native resume disabled. Session A diagnoses a failing fixture without editing; Session B must query Qarinah first, cite a retrieved event ID and hash, implement the fix, and pass the acceptance tests. The checked receipt retains hashes and normalized usage fields, not raw transcripts or local paths.

This is continuation-product evidence, not a controlled model-quality claim. See [the complete method and limitations](CROSS-SESSION-CONTINUATION-BENCHMARK.md), the [0.1.6 deterministic result](../bench/results/continuation-context-0.1.6.json), and the explicitly historical [0.1.5 provider-backed smoke receipt](../bench/results/codex-cross-session-continuation-0.1.5.json). No provider-backed 0.1.6 continuation receipt is claimed.

## Frozen context-efficiency comparison v2

The audited attempt-2 development artifact produced **no primary comparative context-efficiency result**. Qarinah and admission-filtered BM25 were each primary-eligible on five of six frozen cases and had identical portable token estimates on those five cases: 630, 680, 574, 1,191, and 1,202. Their shared 4,277-token subtotal is diagnostic only because both methods missed required TypeScript support-3 event `evt_00000000-0000-4000-8000-000000000012` by the frozen top-32 boundary. The artifact's `0` rank value is a not-found sentinel, not rank 33.

Both filtered methods passed 4/4 safety cases with zero forbidden inclusions. Raw BM25 was a safety-only negative control; it passed 0/4 and produced 26 forbidden-inclusion detections. The fixed-`k` diagnostic was exact on 2/6 cases for each filtered method and is not a token ranking. The conflict audit and all 24 required mutation groups passed.

See the [complete attempt-2 result report](CONTEXT-EFFICIENCY-COMPARISON-v2-RESULT.md) and [machine-readable artifact](../bench/results/context-efficiency-comparison-0.1.6-v2.json). The separately verified 98.7148% six-task repeated-history estimator fixture remains unchanged; it is not a v2 comparison result or evidence that one v2 method outperformed the other.

## Claims Qarinah does not make

- exact token or cost savings without a provider-specific tokenizer and usage receipt;
- perfect memory or complete decision inference;
- semantic correctness from lexical coverage;
- superiority across every repository, language, model, or task;
- capture of host activity that the host does not expose;
- secret-free retention in arbitrary content-mode tool output.

## Real-repository research benchmark

The research track follows the task framing introduced by Jimenez et al. in [SWE-bench (ICLR 2024)](https://openreview.net/forum?id=VTF8yNQM66), pins the official public [`princeton-nlp/SWE-bench_Lite`](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite) test artifact at revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`, and applies a chronological 60-task warm-up / 240-task held-out split across the artifact's 300 tasks and 12 exact repository identifiers. The completed zero-model phase evaluates retrieval, temporal leakage, repository isolation, disclosure filtering, retention, and supersession. Its temporal, update, and abstention categories are informed by [LongMemEval (ICLR 2025)](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf), while BM25 is treated as the strong lexical baseline described by [Robertson et al.](https://doi.org/10.6028/NIST.SP.500-225.routing-city).

The frozen exploratory-v0.1 result is deliberately not a marketing headline. On the 79 held-out tasks with a prior production-file-overlap target, BM25 outperforms the original balanced-v1 Qarinah ranker: Recall@10 is 0.687 versus 0.518, and MRR is 0.430 versus 0.320. The no-temporal ablation returns 971 future citations, and the lexical coverage gate accepts all 161 tasks with no positive record under the file-overlap oracle. A separate 72-record governance suite returns zero forbidden records.

Development v0.2 is explicitly tuned after inspecting v0.1 and is not confirmatory. It resolves the official-page 11-repository statement against the 12-project revision artifact, adds a raw Parquet SHA-256, graded structural labels, static and online/prequential settings, fixed 512-8,000-token budgets, item/query leakage, calibration metrics, and repository-clustered bootstrap intervals. Admission-first Qarinah v2 exactly matches admitted BM25 ranking and improves online MRR over balanced-v1 from 0.601 to 0.696. Graph adds no measured ranking value. The frozen v0.2 artifact was produced by `evidence-sufficiency-v1`; its original interpretation counted partial evidence as accepted and produced a 90.32% false-acceptance rate among online tasks with no positive record under the structural oracle. Reproduction is bound to tag `research-retrieval-development-v0.2` at commit `bd566ac5ba7b302653b994fd0622d516fa74bbb8`, not mutable current source.

Historical development v0.3 applies a conservative 0.65 direct threshold to those frozen v0.2 scores and treats partial evidence as abstention. It observed 8/8 static and 12/12 online accepted positives with 0/49 and 0/31 structural-oracle false accepts. Because the score source is v0.2, v0.3 is preserved as historical threshold calibration rather than described as current-product recomputation.

Development v0.4 recomputes the same inspected corpus with the current production `evidence-sufficiency-v2` implementation and binds the artifact to per-file source hashes. It accepts 10/240 static and 15/240 online queries as direct, all structural-oracle positives, while observing 0/49 and 0/31 direct false accepts. Direct precision is 10/10 with a 69.15%-100% exact 95% interval and 15/15 with a 78.20%-100% interval. False-acceptance intervals remain 0%-7.25% and 0%-11.22%; coverage remains deliberately low at 4.17% and 6.25%. These are development structural-oracle results, not a universal semantic guarantee; a blinded 49-case relevance census is awaiting two independent human reviewers.

Development v0.5 is a separately frozen, authorized, current-product source-bound differential reproduction of that v0.4 result. On the same inspected development corpus, the complete generated v0.5 `expected` object is deeply and byte-for-byte equal to the immutable v0.4 `expected` object: canonical `JSON.stringify` output is 3,110,007 bytes with SHA-256 `12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c`. The result was introduced by commit `4dba5b667a8c3a135c4574fcfefe12502f792a32`, tagged `research-retrieval-development-v0.5-result`, and the committed artifact has SHA-256 `38a753e82e1f9e8e0337dca3f764c941a4cf78748c09a7b8341ae08cf7494a94`. This establishes exact projected reproduction for the bound current product source on this inspected corpus; it adds no new outcome metrics and does not establish global API equivalence.

The v0.5 run made zero provider calls and measured no provider-reported tokens, Docker patch resolution, generated patches, human relevance or code review, latency, or cost. It is development-only and explicitly non-confirmatory. Inspect the [pre-outcome protocol](RESEARCH-DEVELOPMENT-PROTOCOL-v0.5.md), [machine-readable result](../bench/results/research-retrieval-development-v0.5.json), and [read-only post-result verifier](../scripts/verify-research-retrieval-v0.5-result.mjs).

See the complete [research protocol, limitations, repository citations, and results](RESEARCH-BENCHMARK.md). The committed artifacts preserve [`exploratory v0.1`](../bench/results/research-retrieval-0.1.2.json), [`historical development retrieval v0.2`](../bench/results/research-retrieval-development-v0.2.json), [`historical threshold calibration v0.3`](../bench/results/research-sufficiency-development-v0.3.json), the [immutable production-bound development v0.4 recomputation](../bench/results/research-retrieval-development-v0.4.json), and the [current-product source-bound v0.5 differential reproduction](../bench/results/research-retrieval-development-v0.5.json).

## Next benchmark gate

Protocol v1 uses the official [500-instance SWE-bench Verified corpus](https://www.swebench.com/verified.html) and freezes a Verified-minus-Lite manifest before final results. The positive population contains 387 retrieval tasks and a deterministic 40-task coding-agent sample. Amendment A001 separately freezes 20 no-prior-memory tasks for abstention-only evaluation. A 407-task contamination audit found no exact ID, issue, patch, test-patch, normalized-statement, or near-duplicate overlap with Lite development data; five same-base-commit pairs are disclosed. A pre-outcome exact McNemar power analysis shows that 40 pairs can reliably detect only large resolution effects under the explored assumptions.

The 40-task experiment means 40 identical repository issues are attempted under paired context conditions, with order controlled and native session resume disabled. Generated patches are then scored through the official containerized SWE-bench evaluator; input, cached-input, and output tokens come from provider receipts rather than `ceil(characters / 4)`. The protocol also records time, cost, repeated work, citations, incorrect changes, and blinded human quality ratings. Execution still requires completed independent labels, frozen model/provider identifiers, credentials and spending authorization for those exact models, frozen summary/dense baselines, a successful provider pilot, and the official Docker gold smoke. None of those final outcomes are claimed by the present release.
