# Architecture

> One authoritative event chain. Explicit exact-source snapshots. Rebuildable code and memory graphs. Cited context at task time.

Qarinah is an evidence-linked project-memory, exact-source-recovery, and retrieval engine. It preserves permitted agent activity, explicit decisions, source evidence, and project structure in a verified local record; optionally archives selected source bytes exactly; then compiles bounded cited context for a later task.

## System map

<p align="center">
  <img src="../assets/architecture/qarinah-flow.svg" width="920" alt="Detailed Qarinah architecture showing hosts, capture controls, the authoritative hash-chained JSONL ledger, temporal memory, the rebuildable SQLite and graph projections, Maqam-assigned disclosure scopes, deterministic retrieval, cited packs, and evaluation.">
</p>

[Open the editable diagram source](architecture.mmd).

## Guarantees at a glance

| Layer | Guarantee | Boundary |
| --- | --- | --- |
| Capture | An initialized workspace and machine-local permit control whether metadata or reviewed content may be retained. | No silent global capture and no hidden-reasoning or transcript scraping. |
| Authority | Canonical JSONL events bind the previous hash, content hash, record hash, provenance, confidence, retention, and typed relations. | A valid chain proves continuity relative to the checkpoint, not the factual truth of every claim. |
| Exact archive | Explicitly selected regular files are chunked, encrypted, manifested, verified, and restored byte for byte. | The archive is opt-in and separate from model context; it does not capture excluded, ignored, linked, or unauthorized data. |
| Derivation | SQLite, evidence graph, symbol graph, index, Markdown, project structure, dashboard, and OKF are disposable projections. | Derived state never replaces the event chain or archive manifest and can be deleted and rebuilt. |
| Retrieval | FTS5/BM25, typo tolerance, graph traversal, time, freshness, authority, conflict, supersession, diversity, coverage, and output budgets are composed deterministically. | Optional caller-owned semantic adapters may rerank admitted evidence but cannot introduce authority. |
| Disclosure | Every selected item cites an event ID and hash. Maqam may temporarily attach exact scopes and repositories to one run. | Agent input cannot grant itself a scope or cross a repository boundary. |

## Write and rebuild lifecycle

1. A user or connected workflow submits a captured lifecycle event through a strict adapter.
2. The trusted capture policy validates the workspace, capture mode, and bounds.
3. The ledger appends the canonical event under a renewable write lock and binds the previous hash.
4. The caller receives the event ID and record hash.
5. A build or explicit query verifies the complete authoritative chain.
6. Deterministic evidence graph, symbol graph, JSON index, and SQLite FTS5 projections feed the context compiler.
7. Temporal validity, freshness, supersession, conflicts, repository identity, and host-assigned disclosure scopes filter the candidate set.
8. The caller receives a cited pack that fits the complete-output budget.

An append and every security-sensitive read reload the trusted workspace from its root. Caller-supplied workspace objects are locators, not proof of trust. Explicit builds can repair stale derived views only after the event chain and machine checkpoint verify successfully. Read-only MCP diagnostics never repair or advance the checkpoint.

## Authority and machine trust

Each event identifies its workspace, optional session and turn, actor, timestamp, kind, provenance, confidence class, typed relations, previous hash, and record hash. `extracted`, `inferred`, `claimed`, and `verified` remain separate confidence classes.

A machine-local permit binds the trusted real path, workspace ID, enabled state, capture mode, event, log and context limits, retention class, verified head, and the digest of the disposable event-ID projection. A separate revocation tombstone wins over portable configuration and trust-record recreation. Policy drift, legacy trust, ledger truncation, and checkpoint rollback fail closed until explicit verified re-trust.

## Deterministic projections

| Path | Role | Authority |
| --- | --- | --- |
| `events/events.jsonl` | Canonical append-only event envelopes | Authoritative |
| `graph/graph.json` | Event nodes, typed relations, and the latest project-structure projection | Rebuildable |
| `graph/symbol-graph.json` | Source-hash-bound multi-language declarations and unambiguous references | Rebuildable |
| `index/index.json` | Lexical postings, trigram terms, and graph adjacency | Rebuildable |
| `index/qarinah.db` | SQLite WAL read model with FTS5, typed tables, temporal state, citations, disclosures, and pack metadata | Disposable and rebuildable from the ledger |
| `records/CONTEXT.md` | Bounded human-readable current record | Rebuildable |
| `records/okf/` | Deterministic Google OKF 0.1 Draft Markdown interchange | Rebuildable |
| `index/event-ids/` | Checkpoint-authenticated idempotency buckets | Disposable and verified before use |
| `archive/manifests/` | Exact selected-source snapshot manifests | Recovery authority for the named archive |
| `archive/objects/key_*/` | Authenticated content-defined chunks scoped to one local vault key | Required for exact restore; never injected wholesale into model context |

The same verified event head and build inputs produce the same projections. `qarinah rebuild` recreates the database and every other derived view from the verified ledger. The SQLite schema has an explicit version and migration record; a future migration may rebuild rather than mutating authoritative history. An OKF export is portable interchange, not a second source of truth or retrieval engine.

## Retrieval lifecycle

The event-memory compiler normalizes bounded query terms, uses SQLite FTS5 and the portable BM25 index, adds typo-tolerant character n-grams and typed graph neighbors, combines candidates through reciprocal-rank fusion, and applies time, retention, freshness, repository, authority, conflict, supersession, and diversity rules. Optional customer-owned embeddings, models, query expansion, or rerankers can reorder only evidence already admitted by those rules. The symbol graph has a separate built-in deterministic local subword vector plus lexical and reference-structure components; it does not download an embedding model. Evidence coverage then either emits a complete cited JSON or Markdown pack within budget, or fails closed when the caller's minimum is not met.

## Automatic refresh and fact consolidation

The explicit foreground watcher serializes project cycles. A changed project snapshot refreshes the symbol graph, records one cited context checkpoint, and rebuilds derived views. An unchanged snapshot performs no duplicate append or rebuild. Each phase atomically replaces a hash-bound cycle-state file; a later run detects an interrupted or invalid prior state and safely replays the idempotent cycle. This is project-scoped automation initiated by the operator, not passive desktop-wide monitoring.

Fact consolidation operates only on an admitted verified pack. The deterministic extractor or optional host-model adapter must return bounded typed facts citing retained source event IDs. Model output is schema-validated untrusted data; it cannot add uncited sources or replace the ledger.

The compiler resolves one UTC `asOf` value when the caller omits it. Exact replay supplies that value explicitly. Budgets cover the complete pretty-JSON and Markdown encodings, and every selected item records why it was chosen.

## Integration boundaries

| Integration | What enters Qarinah | Preserved boundary |
| --- | --- | --- |
| Codex | Allowlisted lifecycle schemas, skill guidance, and zero-write MCP diagnostics | Hooks provide observability, not universal host mediation. Hosted search is not hook-covered. |
| Claude Code | Allowlisted lifecycle hooks, subagent and compaction events, skill guidance, and zero-write MCP diagnostics | Transcript files are never parsed. |
| Other hosts | Explicit CLI, JSON stdin, stdio MCP roots, or an exact MCP workspace selector | No universal-host compatibility claim. |
| Cockroach Crawler | Strict `SourceRecord` mapped to a stable revision and acquisition | Crawler material remains untrusted evidence and the crawler never imports Qarinah. |
| Maqam | Separately registered context query and append tools | Writes require exact approval and content consent; unregistered side effects remain outside the boundary. |
| ProductLoop | Validated, sequenced provenance events through the public sink contract | Independent run storage remains composable and divergent sequence histories are rejected. |

## Temporal memory and disclosure scopes

Events may bind `validFrom`, `validUntil`, repository branch and commit identity, file and dependency hashes, and disclosure scopes. Supersession and contradiction stay as typed relations rather than destructive updates. A point-in-time query excludes facts that were not yet valid, had expired, or were superseded at the selected instant. Freshness inspection separately reports changed, missing, unsafe, and unverified sources.

Maqam owns dynamic attachment. Its host callback resolves the scopes and repositories for an exact agent and run. The public `context.query` input intentionally has no `authorityScopes` or `repositoryIds` field, so an agent cannot enlarge its own memory authority. Revocation or expiry removes the attachment without rewriting prior events.

## Multi-repository graph

Each repository keeps its own ledger, trust state, project graph, and cited pack. Federation returns separate packs plus explicitly declared typed relationships such as `depends_on`, `documents`, `deploys`, and `shares_contract`. A cross-repository relationship aids navigation; it does not merge permissions, disclose secrets, or turn one repository into an authority for another.

## Cross-platform control-plane direction

The longer-term system can place a user-space control plane above Windows, macOS, and Linux. Privileged process, filesystem, network, identity, secret, and device mediation belongs in a separate platform supervisor with its own threat model. Qarinah remains the unprivileged evidence and context layer rather than claiming operating-system authority it does not possess.
