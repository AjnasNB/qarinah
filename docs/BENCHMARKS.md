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

The exact scenario sources, expected decisions, unrelated retained history, queries, arithmetic, and per-task results are committed in [`bench/fixtures/software-task-scenarios.mjs`](../bench/fixtures/software-task-scenarios.mjs), [`scripts/evaluate-software-tasks.mjs`](../scripts/evaluate-software-tasks.mjs), and [`bench/results/software-task-context-0.1.0-alpha.2.json`](../bench/results/software-task-context-0.1.0-alpha.2.json). The evaluator fails when any committed deterministic result changes.

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

The 2026-07-21 `0.1.0-alpha.2` release-candidate run on Node `24.15.0` for Windows x64 produced recall@5 `1.0`, mean reciprocal rank `1.0`, conflict recall `1.0`, supersession precision `1.0`, average pack size `2,237` characters, raw replay size `44,364` characters per query, and character reduction `94.96%`. Context-pack v2 is larger than v1 because it includes explicit evidence-coverage metadata.

This four-case fixture remains a focused regression check for exact retrieval, typo tolerance, graph evidence, conflict visibility, and supersession. The larger software-task benchmark above is the public context-volume example.

The deterministic values are committed in [`bench/results/context-evaluation-0.1.0-alpha.2.json`](../bench/results/context-evaluation-0.1.0-alpha.2.json). The evaluator reads that file and fails when a release changes any expected retrieval or context-volume field without updating the evidence.

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

## Next benchmark gate

Before a stable release, expand to at least 100 held-out positive and negative queries covering exact lookup, paraphrase, typos, conflicts, supersession, time, authority, unsupported questions, and project-file impact. Separately run at least 20 task-paired Codex and Claude evaluations using the providers' reported input-token fields, identical models and tools, task-success checks, unsupported-answer review, latency, and cost. Publish raw fixtures, ablations, command lines, environment, package version, commit, and machine-readable results.
