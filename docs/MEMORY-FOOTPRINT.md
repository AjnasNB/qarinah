# Measure project memory without confusing it with archive compression

Qarinah keeps project history and delivers a small, relevant context pack for the current task. Those are different quantities:

1. **Imported source bytes** are the visible JSONL or NDJSON bytes Qarinah was explicitly allowed to import.
2. **Retained project memory** is the local JSONL ledger plus rebuildable SQLite, graph, Markdown, and dashboard files.
3. **Delivered context** is the bounded cited pack selected for one query.

Run:

```sh
npx qarinah footprint "release decisions and failed checks"
```

The JSON report includes byte counts for every retained view, the selected pack's character and estimated-token counts, its manifest hash, and the source of any comparison.

## Compare a real baseline

If the same task has a measured full-history baseline, provide that number explicitly:

```sh
npx qarinah footprint "release decisions and failed checks" \
  --baseline-tokens 442113 \
  --rate-per-million 3
```

`--rate-per-million` applies simple flat uncached input-token arithmetic. It does not include output, reasoning, tools, retrieval, caching, hosting, subscriptions, or fixed fees.

The portable fallback estimator is `ceil(characters / 4)`. It is useful for reproducible local comparisons, but it is not a provider usage receipt.

## What happens to a very large Codex archive?

Qarinah does not turn a 70 GB source archive into a lossless few-kilobyte replacement.

- An external backup preserves the selected original JSONL/NDJSON bytes and their SHA-256 identities.
- Compact import retains bounded, cited visible outcomes per session rather than every source byte.
- The local ledger, SQLite read model, graph, and Markdown records keep the searchable project memory that was actually captured or imported.
- A query sends only the small task-relevant cited pack to the coding agent.

If the original agent archive is deleted, Qarinah can retrieve only material that was captured or imported. Use `qarinah backup` when the source export itself must remain recoverable.

## Dashboard

The dashboard's **Memory footprint** panel always shows current on-disk project memory and delivered-pack size. The separate **Context saved** metric appears only when the caller supplies a comparable baseline and delivered value.

```sh
npx qarinah dashboard
```

This separation makes the result inspectable: storage retention, task retrieval, and cost estimation are never presented as one universal compression claim.

