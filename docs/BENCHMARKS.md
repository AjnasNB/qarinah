# Qarinah benchmarks and honest numbers

Qarinah reports context-volume and retrieval-regression measurements. It does not convert character estimates into claims about provider billing, model reasoning, answer correctness, latency on every machine, or total application cost.

## Committed retrieval fixture

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

This fixture is intentionally small. Four cases are enough for regression protection, not a general retrieval-quality conclusion.

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

## Safe claim

> 94.96% smaller context payload in the committed 54-record evaluator while preserving all four tested retrieval targets.

Required qualification:

> Measured as characters on named fixtures and baselines. This is not provider-billed token usage or a universal performance guarantee. Results vary by project and query.

## Claims Qarinah does not make

- exact token or cost savings without a provider-specific tokenizer and usage receipt;
- perfect memory or complete decision inference;
- semantic correctness from lexical coverage;
- superiority across every repository, language, model, or task;
- capture of host activity that the host does not expose;
- secret-free retention in arbitrary content-mode tool output.

## Next benchmark gate

Before a stable release, expand to at least 100 held-out positive and negative queries covering exact lookup, paraphrase, typos, conflicts, supersession, time, authority, unsupported questions, and project-file impact. Publish raw fixtures, ablations, command lines, environment, package version, commit, and machine-readable results.
