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

## Fixed-workspace volume check

A separate 2026-07-21 development-workspace check compared a 6,971-character Qarinah pack with a 73,479-character manually curated eight-file context baseline. The observed reduction was `90.51%`. The generated `CONTEXT.md` baseline produced `88.61%`, and a naive whole-indexed-corpus comparison produced `99.71%`.

These values are development evidence, not the primary reproducible release benchmark. The extreme whole-corpus comparison is not used as headline copy.

## Safe claim

> 70%+ smaller context payloads in the current fixed benchmark fixtures.

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
