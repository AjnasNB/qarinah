# Qarinah benchmarks and honest numbers

Qarinah reports context-volume and retrieval-regression measurements. It does not convert character estimates into claims about provider billing, model reasoning, answer correctness, latency on every machine, or total application cost.

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

The six-task benchmark sends 436,431 fewer estimated input-context tokens. At a flat $1 per million uncached input tokens, the compared context slice moves from $0.442113 to $0.005682. That is 98.71% less input-context cost under the same unit price.

This translation is useful because the percentage is independent of the chosen flat unit price. It is not a provider invoice: output tokens, tool calls, cached-input discounts, indexing, retrieval, and fixed provider charges remain separate.

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

## Claims Qarinah does not make

- exact token or cost savings without a provider-specific tokenizer and usage receipt;
- perfect memory or complete decision inference;
- semantic correctness from lexical coverage;
- superiority across every repository, language, model, or task;
- capture of host activity that the host does not expose;
- secret-free retention in arbitrary content-mode tool output.

## Real-repository research benchmark

The research track now pins the official public SWE-bench Lite test split at 300 tasks from 12 repositories and applies a chronological 60-task warm-up / 240-task held-out split. The completed zero-model phase evaluates retrieval, temporal leakage, repository isolation, disclosure filtering, retention, and supersession.

The frozen exploratory-v0.1 result is deliberately not a marketing headline. On the 79 held-out tasks with a prior production-file-overlap target, BM25 outperforms the original balanced-v1 Qarinah ranker: Recall@10 is 0.687 versus 0.518, and MRR is 0.430 versus 0.320. The no-temporal ablation returns 971 future citations, and the lexical coverage gate accepts all 161 tasks with no positive record under the file-overlap oracle. A separate 72-record governance suite returns zero forbidden records.

Development v0.2 is explicitly tuned after inspecting v0.1 and is not confirmatory. It resolves the official-page 11-repository statement against the 12-project revision artifact, adds a raw Parquet SHA-256, graded structural labels, static and online/prequential settings, fixed 512-8,000-token budgets, item/query leakage, calibration metrics, and repository-clustered bootstrap intervals. Admission-first Qarinah v2 exactly matches admitted BM25 ranking and improves online MRR over balanced-v1 from 0.601 to 0.696. Graph adds no measured ranking value. The original v0.2 interpretation counted partial evidence as accepted and produced a 90.32% false-acceptance rate among online tasks with no positive record under the structural oracle.

The conservative development-v0.3 gate accepts only direct evidence at the calibrated 0.65 threshold and treats partial evidence as abstention. At the frozen operating point it observed 0/49 direct false accepts in static evaluation and 0/31 online, including the leave-one-repository-out aggregation. Static direct precision is 8/8 with a 63.06%-100% exact 95% interval; online it is 12/12 with a 73.54%-100% interval. The false-acceptance intervals are 0%-7.25% and 0%-11.22%, respectively. Acceptance coverage is intentionally low at 3.33% static and 5.00% online. These are development structural-oracle results, not a universal semantic guarantee; a blinded 49-case relevance census is awaiting two independent human reviewers.

See the complete [research protocol, limitations, repository citations, and results](RESEARCH-BENCHMARK.md). The committed artifacts preserve [`exploratory v0.1`](../bench/results/research-retrieval-0.1.2.json), [`development retrieval v0.2`](../bench/results/research-retrieval-development-v0.2.json), and [`conservative sufficiency v0.3`](../bench/results/research-sufficiency-development-v0.3.json).

## Next benchmark gate

Protocol v1 and a Verified-minus-Lite task manifest are frozen before final results. The positive population contains 387 retrieval tasks and a deterministic 40-task coding-agent sample. Amendment A001 separately freezes 20 no-prior-memory tasks for abstention-only evaluation. A 407-task contamination audit found no exact ID, issue, patch, test-patch, normalized-statement, or near-duplicate overlap with Lite development data; five same-base-commit pairs are disclosed. A pre-outcome exact McNemar power analysis shows that 40 pairs can reliably detect only large resolution effects under the explored assumptions. Execution still requires independently completed labels, verified model/runtime identifiers, credentials, frozen baselines, provider usage receipts, and a successful pilot. None of those final outcomes are claimed by the present retrieval study.
