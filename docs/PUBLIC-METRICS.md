# Qarinah public metrics and launch claims

Qarinah publishes outcome-first numbers only when the repository contains the fixture, evaluator, machine-readable result, and a verifier that fails on drift. This page is the canonical wording guide for the website, README, launch posts, directory listings, and AI-facing summaries.

## The current product headline

> **12 / 12 deep-memory product checks passed:** exact encrypted source recovery, content-chunk reuse, symbol and cross-file-reference retrieval, cited facts, and incremental project refresh.

The committed evaluator restores **390,226 source bytes exactly**, reuses **2 of 3** chunks in the second snapshot, indexes **4 symbols** and **3 resolved references**, and preserves **3 cited facts**. These are end-to-end acceptance observations from a small deterministic TypeScript fixture. They are not a benchmark against another product and do not establish universal repository, language, storage, or retrieval performance.

- [Deep-memory machine-readable result](../bench/results/deep-memory-platform-v0.4.0.json)
- [Deep-memory evaluator](../scripts/evaluate-deep-memory-platform.mjs)
- Artifact hash: `sha256:bb801a59d5c1822b87bda5596237a126a064e62ac6f588e3351ebe949551ff46`

## Separate repeated-context result

> **98.7148% less estimated repeated project context** across six committed software-task fixtures: 442,113 portable estimated input-context tokens became 5,682, with every required target directly covered in the top five.

The same result can be stated in three equivalent, fixture-bound ways:

- **436,431 fewer estimated input-context tokens** in the compared repeated-history slice.
- **77.81:1 baseline-to-pack ratio**: the evaluated full-history baseline contained 77.81 times as many estimated tokens as the Qarinah path (`442,113 / 5,682`).
- **98.71% lower input-context cost at the same flat uncached-input token rate**, for the compared slice only.

The estimator is `ceil(characters / 4)`. These are reproducible portable estimates, not a provider billing receipt.

## Can Qarinah claim more than 70x?

Yes, with the measured object in the sentence. Approved wording:

> **The evaluated full-history baseline contained 77.81x as many estimated input-context tokens as Qarinah's cited packs.**

Short alternatives are **77.81:1 baseline-to-pack ratio** or **more than 70x baseline-to-pack compression in the published six-fixture estimate**. Do not say agents run 70x longer, bills are 70x lower, or every repository compresses 70x. The benchmark did not measure session duration, provider invoices, or universal repositories.

## Transparent input-cost equivalents

The cost formula is:

```text
estimated input cost = estimated tokens / 1,000,000 x flat uncached input rate x repeats
```

Applied to the aggregate repeated-context slice across all six committed fixtures:

| Flat uncached input rate | Full-history baseline | Qarinah path | Estimated saving per repeat | Estimated saving across 10 repeats |
| ---: | ---: | ---: | ---: | ---: |
| $1 / million | $0.442113 | $0.005682 | $0.436431 | $4.364310 |
| $3 / million | $1.326339 | $0.017046 | $1.309293 | $13.092930 |
| $5 / million | $2.210565 | $0.028410 | $2.182155 | $21.821550 |
| $15 / million | $6.631695 | $0.085230 | $6.546465 | $65.464650 |

The $3 example can be stated as **about $1.33 to $0.02, saving about $1.31 each time the complete compared slice would otherwise be sent**. These are arithmetic equivalents at a reader-selected flat rate, not observed provider charges. They exclude provider-native tokenization, cache writes and reads, output, reasoning, tools, retrieval, hosting, and fixed fees. A provider with tiered long-context pricing will not follow one flat rate across both inputs.

## Verified retrieval-scale result

> Qarinah ranked the correct target first for **380 / 380 file-specific queries** across deterministic 40-, 50-, and 100-file projects.

The 380 positives include exact and typo-tolerant queries. The same run verified SQLite retrieval, graph relations, generated Markdown, conflicts, supersession, stale-projection repair, and **9 / 9** correct unsupported-query rejections. It made zero provider model calls.

## Short launch copy

### One-line headline

**Your project remembers. Every agent gets the proof.**

### Ratio-led headline

**The baseline carried 77.81x as many estimated tokens. Qarinah keeps the cited pack.**

### Product-directory tagline

Evidence-linked project memory that lets coding agents continue with compact, cited context instead of replaying complete project history.

### Short announcement

Qarinah keeps one verifiable project memory across Codex, Claude Code, Cursor, CLI, and compatible MCP workflows. Its current end-to-end evaluator passes 12/12 exact recovery, incremental refresh, symbol/reference, and cited-fact scenarios. A separate six-task fixture compiled 442,113 estimated repeated-context tokens into 5,682 cited tokens while directly covering every required target in the top five. Both evaluators, machine-readable results, formulas, and limitations are public.

### Evidence links

- [Machine-readable public metrics](https://qarinah.io/metrics.json)
- [Benchmark methodology and complete results](BENCHMARKS.md)
- [Deep-memory product-acceptance result](../bench/results/deep-memory-platform-v0.4.0.json)
- [Six-task result](../bench/results/software-task-context-0.1.0.json)
- [Release benchmark receipt](../bench/results/benchmark-release-0.1.6.json)
- [Current multi-file result](../bench/results/multifile-context-0.5.0-rc.1.json)
- [Historical 0.1.6 multi-file result](../bench/results/multifile-context-0.1.6.json)

## Do not publish these claims

The current evidence does **not** support any of the following statements:

- `Every coding-agent bill is 98.71% lower.`
- `Agents run 77.81x longer.`
- `Qarinah reduces output, reasoning, tool, or cached-input tokens by 98.71%.`
- `Qarinah improves task completion, patch quality, or latency by 98.71%.`
- `Qarinah is universally better than another memory or compression product.`
- `380 / 380 proves correctness on every repository.`

The six-task result compares repeated retained-history input under a portable estimator. The multi-file result is a deterministic synthetic retrieval and projection-integrity regression. Neither is a universal provider, model, repository, or task-quality guarantee.

## Why this wording differs from token-compression gateways

Some gateways report measured token traffic, modeled long-session savings, or projected context-window runway. Qarinah's current public evidence answers a different question: how much repeated project history can be replaced by a bounded cited pack while preserving required evidence in committed fixtures. Cross-product percentages should not be compared as if their baselines, workloads, tokenizers, or quality gates were identical.

When a future provider-backed paired study produces usage receipts, completion results, latency, and cost under a frozen protocol, publish those as a separate result. Do not retroactively relabel the present portable estimates as provider usage.
