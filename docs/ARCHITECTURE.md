# Architecture

## Thesis

Qarinah is a governance-native context compiler. It keeps an append-only record of permitted agent activity and source evidence, then deterministically compiles the smallest relevant context bundle for a later task. It does not make an opaque model summary the source of truth.

```text
Codex / Claude / generic events       Cockroach SourceRecords
              |                                  |
              +---------- ingest adapters -------+
                                 |
                       strict event envelope
                                 |
                 append-only hash-chained JSONL
                                 |
                +----------------+----------------+
                |                                 |
       rebuildable graph/index             human Markdown
                |                                 |
                +------ context compiler ---------+
                                 |
                   cited, token-budgeted pack
                                 |
                         Maqam policy gateway
```

## Authority and derivation

Each event identifies a workspace, session, actor, timestamp, kind, provenance, confidence class, typed relations, previous hash, and record hash. `extracted`, `inferred`, `claimed`, and `verified` are separate confidence classes rather than one misleading number.

The event chain is authoritative. A machine-local trust record binds consent and the last verified head to one real path, workspace ID, and capture mode. The lexical index, graph, Markdown view, and context packs are disposable projections. Qarinah recomputes the complete projection before using it; matching only a head hash and event count is insufficient. A context pack budgets its complete pretty-JSON and Markdown encodings, lists why each item was selected, and cites event IDs and hashes so another process can reproduce it.

## Storage layout

- `events/events.jsonl`: canonical append-only event envelopes.
- `objects/`: reserved for content-addressed source snapshots.
- `graph/graph.json`: event nodes and typed relations.
- `index/index.json`: term-to-event postings and adjacency.
- `records/CONTEXT.md`: bounded human-readable latest record.
- `snapshots/`: reserved for signed pack manifests.

## Integration boundaries

- Codex: an installable skill plus exact lifecycle-schema hooks backed by a generated standalone runtime. Hooks are observability, not the security boundary; hosted `WebSearch` is not hook-covered.
- Claude and other agents: adapters normalize only events the host explicitly exposes.
- Cockroach Crawler: `SourceRecord -> Qarinah ingest`; the crawler never depends on Qarinah.
- Maqam: separate governed query (`read`) and append (`write`) tools; writes may require exact approval.
- ProductLoop: implement existing `ProvenanceSink` and `RunStore` contracts rather than scraping traces.

## Governed Agent OS direction

The long-term product is a cross-platform user-space control plane above Windows, macOS, and Linux. A future privileged supervisor mediates processes, files, network, identity, secrets, and device capabilities. That supervisor must remain separate from this unprivileged indexing library and requires platform-specific threat models.
