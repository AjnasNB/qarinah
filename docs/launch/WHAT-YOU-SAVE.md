# What you save when project context stops repeating

Qarinah compiles a compact, cited project-memory pack instead of asking every new coding-agent session to replay the entire available history.

![What you save with Qarinah: 98.71% less repeated context, a 77.81 to 1 baseline-to-pack ratio, 442,113 baseline tokens versus 5,682 Qarinah pack tokens, and exact illustrative savings at four flat uncached input-token rates.](../../assets/launch/qarinah-what-you-save.png)

## The published estimate

Across six committed software-task fixtures, the full-history baseline contained 442,113 portable estimated input-context tokens. The Qarinah path used 5,682. Every required target was still directly covered in the top five results.

That is:

- 436,431 fewer estimated input-context tokens;
- 98.71% less repeated context; and
- a 77.81:1 baseline-to-pack ratio.

The ratio is not a claim that every provider bill drops by 98.71%, or that an agent session lasts 77.81 times longer. It measures the compared input-context volume in the published six-fixture estimate.

## What the same token rate would cost

The table below applies four flat, uncached input-token rates to the same two token estimates. It is arithmetic, not a provider invoice.

| Flat uncached input rate | Full-history baseline | Qarinah pack | Estimated saving |
| --- | ---: | ---: | ---: |
| $1 / million tokens | $0.442113 | $0.005682 | $0.436431 |
| $3 / million tokens | $1.326339 | $0.017046 | $1.309293 |
| $5 / million tokens | $2.210565 | $0.028410 | $2.182155 |
| $15 / million tokens | $6.631695 | $0.085230 | $6.546465 |

The calculation is:

```text
estimated tokens / 1,000,000 × flat input rate
```

It deliberately excludes provider-native tokenization, caching, output tokens, reasoning tokens, tool calls, retrieval, hosting, and fixed fees. The exact cost for a real workload depends on the provider, model, cache behavior, context composition, and how often the same history would otherwise be resent.

## Why the pack remains useful

Compression only matters if the next task can still find its evidence. The benchmark therefore checks both volume and retrieval coverage: every required target had to be directly present in the top five. Qarinah preserves the source event ID and content hash for selected context, so a later agent receives a bounded handoff that can be inspected instead of an opaque story.

Qarinah also passed 380 of 380 deterministic file-specific exact and typo-tolerant queries across 40-, 50-, and 100-file projects. Those tests verify retrieval behavior; they do not establish universal task quality or a ranking against every memory system.

## Reproduce it

The methodology, fixture records, costs, and exclusions are public:

- [Public metrics](https://qarinah.io/docs/public-metrics/)
- [Machine-readable metrics](https://qarinah.io/metrics.json)
- [Qarinah on GitHub](https://github.com/AjnasNB/qarinah)

Qarinah is Apache-2.0 and local-first. It works with Codex, Claude Code, Cursor, CLI tools, and compatible MCP clients. Project capture is opt-in, metadata-only by default, and does not capture hidden reasoning.

Suggested publication tags: `open-source`, `ai`, `developer-tools`, `productivity`, `llm`.
