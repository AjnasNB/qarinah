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

The event chain is authoritative. A machine-local trust record binds consent and the last verified head to one real path, workspace ID, capture mode, and the hash of a disposable bucketed event-ID projection. The projection makes deterministic hook replay checks bounded; if it is missing or altered, Qarinah fully verifies the JSONL ledger and rebuilds it before another append. The lexical index, graph, Markdown view, and context packs are also disposable projections. Explicit CLI build/query workflows may repair stale persisted views after full verification. Read-only MCP diagnostics never repair or advance a checkpoint. Governed `context.query` computes its current lexical projection in memory from the verified ledger, so it neither depends on nor mutates stale persisted views. Matching only a head hash and event count is insufficient. A context pack budgets its complete pretty-JSON and Markdown encodings, lists why each item was selected, and cites event IDs and hashes so another process can reproduce it.

## Storage layout

- `events/events.jsonl`: canonical append-only event envelopes.
- `objects/`: reserved for content-addressed source snapshots.
- `graph/graph.json`: event nodes and typed relations.
- `index/index.json`: term-to-event postings and adjacency.
- `records/CONTEXT.md`: bounded human-readable latest record.
- `snapshots/`: reserved for signed pack manifests.

## Integration boundaries

- Codex: an installable skill, exact lifecycle-schema hooks, and a read-only MCP server backed by a generated standalone runtime. Hooks are observability, not the security boundary; hosted `WebSearch` is not hook-covered.
- Claude Code: a native plugin with allowlisted lifecycle capture, subagent/compaction coverage, a skill, and the same read-only MCP surface. Transcript files are never parsed.
- Other model hosts: the local MCP surface is host-neutral where the host supports stdio MCP and filesystem roots. Unsupported hosts use explicit JSON/CLI adapters rather than claimed universal compatibility.
- Cockroach Crawler: a strict Qarinah-owned `SourceRecord -> stable revision + acquisition` boundary; the crawler never depends on Qarinah.
- Maqam: separate governed query (`read`) and append (`write`) tools. Both require Maqam's private, one-dispatch `registerGuardedTool` verifier; writes additionally require an exact consumed approval and independently enforce metadata/content consent.
- ProductLoop: implement the existing `ProvenanceSink` callback without scraping traces; stable run/sequence identities reject divergent histories and an independent `RunStore` remains composable.

## Governed Agent OS direction

The long-term product is a cross-platform user-space control plane above Windows, macOS, and Linux. A future privileged supervisor mediates processes, files, network, identity, secrets, and device capabilities. That supervisor must remain separate from this unprivileged indexing library and requires platform-specific threat models.
