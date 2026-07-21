# Qarinah: The Memory Layer Your Agents Can Verify

## A local-first architecture for evidence-linked project context

Version: `0.1.0-alpha.2` technical preview

Status: implementation paper for a prerelease system

## Abstract

Software agents need continuity across tasks, tools, models, and host applications. Replaying an entire transcript is expensive and noisy. Replacing that history with a single model-written summary is compact, but it removes the evidence needed to inspect why a fact or decision was selected.

Qarinah separates durable evidence from compiled context. It records only permitted lifecycle events and explicitly committed decisions in an append-only, hash-chained JSONL ledger. It derives a typed graph, a lexical index, human-readable Markdown, project-structure observations, and portable Google Open Knowledge Format (OKF) Markdown from that ledger. For a later task, it compiles a bounded context pack whose items cite the event IDs and hashes that support them.

The design is local-first, model-agnostic, and explicit about capture. Metadata-only capture is the default. Content capture requires workspace consent and machine-local trust. Derived files can be discarded and rebuilt. This architecture gives an agent useful continuity without making a hidden transcript or opaque summary the source of truth.

## 1. The problem

An agent working on a real software project needs more than source files. It needs to recover decisions, approvals, tool outcomes, evidence, conflicts, superseded choices, and the project structure those choices affected. Three common approaches leave important gaps:

1. Full-history replay sends too much irrelevant material and makes context cost grow with project age.
2. Uncited summaries are difficult to verify and can silently preserve obsolete or conflicting decisions.
3. A vector search result can be semantically nearby without proving that the requested evidence exists or remains authoritative.

Qarinah treats memory as a compilation problem. The durable record stays complete within its explicit capture boundary. Each task receives a smaller, deterministic projection selected for that query and token budget.

## 2. Design principles

### Evidence before narrative

The append-only event chain is authoritative. Summaries, indexes, graphs, Markdown, and context packs are derived views. A compact explanation can always point back to retained events and their content hashes.

### Explicit capture

A workspace must be initialized and trusted on the current machine before capture. Metadata mode retains bounded operational facts without raw prompt, tool-output, or source content. Content mode is a separate opt-in. Credentials, environment values, ignored file contents, browser session state, private transcripts, and hidden reasoning are outside the product boundary.

### Deterministic derivation

The same verified event head and build inputs produce the same graph, index, Markdown record, and OKF bundle. A stale or missing derived view can be rebuilt from the event chain.

### Bounded context

Every query has explicit character and item limits. The compiler budgets complete serialized output rather than an unmeasured internal fragment.

### Visible uncertainty

Confidence classes distinguish extracted, inferred, claimed, and verified records. Time, retention, scoped authority, conflicts, and supersession remain visible to retrieval instead of being flattened into one score.

### Composable governance

Qarinah provides context storage and compilation. Maqam can separately govern context reads and approved writes. Cockroach Crawler can supply bounded public source records. ProductLoop can stream workflow provenance. Each boundary uses an explicit adapter rather than a shared hidden runtime.

## 3. Authoritative event model

Each event has a strict, versioned envelope containing its workspace, session and turn references, actor, timestamp, event kind, provenance, confidence class, typed relations, retention metadata, previous hash, content hash, and record hash.

The event kinds cover prompts, tool requests, tool completions, approvals, artifacts, sources, claims, decisions, summaries, compactions, subagents, completed turns, and failed turns when a supported adapter exposes them. Qarinah records permitted events delivered to it. It does not infer every private cognitive step made by a model.

The record hash binds canonical event content to the previous event hash. A machine-local checkpoint binds the trusted workspace policy and the last verified head to the workspace's real path. This establishes continuity relative to the trusted checkpoint and detects alteration or rollback. It does not prove that every retained claim is factually true, which is why provenance and confidence remain separate fields.

## 4. Derived project graph

Qarinah compiles events and project observations into a typed graph. Event relations represent sessions, turns, tool calls, approvals, sources, derived evidence, conflicts, supersession, and produced artifacts. A bounded project scan adds directories, files, content identities, conservative JavaScript and TypeScript module references, Markdown links, exact observed source spans, and file additions, changes, renames, or deletions.

The scanner honors the project ignore policy, rejects linked paths, excludes generated Qarinah state, and records structure rather than source-file contents. It is deliberately not presented as a compiler or universal symbol graph. Deeper language-aware adapters can be added behind versioned contracts without changing the authority of the event chain.

## 5. Retrieval and context compilation

The local retriever combines:

- BM25 lexical relevance;
- character-trigram typo tolerance;
- one-hop graph evidence;
- reciprocal-rank fusion;
- deterministic diversity;
- explicit conflict and supersession handling;
- retention and `asOf` time filters;
- scoped authority; and
- a complete-output character budget.

The result is a cited context pack. Every item includes the reason it was selected and the event identity needed to reproduce it. Context-pack v2 also reports deterministic evidence coverage:

- `direct`: one retained record contains every normalized query term;
- `partial`: retained evidence overlaps the query but is incomplete; or
- `none`: the durable record contains no matching evidence.

Callers can set `minimumCoverage` to reject partial or no-evidence results. Coverage describes lexical evidence in the retained record. It does not claim that a model's eventual answer is correct.

## 6. Markdown, JSON, and OKF interoperability

Qarinah materializes human-readable Markdown and machine-readable JSON for local inspection. It also supports an explicit `qarinah export okf` command that creates a deterministic bundle following the [Google Open Knowledge Format 0.1 Draft](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

The OKF bundle contains:

- a root `index.md` declaring the OKF version;
- a newest-first `log.md` grouped by event date;
- one Markdown concept under `events/` for each event;
- typed event relations rendered as bundle-relative links;
- citations and bounded provenance metadata; and
- Qarinah extensions for event IDs, actors, confidence, authority, content hashes, chain hashes, retention, and typed relations.

The exporter includes no export-time clock or destination-path field, so the same verified head produces the same bytes and bundle digest at any permitted destination. Qarinah protects existing directories from unsafe replacement with root checks, linked-path rejection, a canonical ownership marker, an entry manifest, aggregate bounds, staging, and rollback.

OKF adds portable, reviewable Markdown interchange. It does not replace Qarinah's event ledger, graph compiler, retrieval index, schemas, or query runtime. The current integration is a one-way, rebuildable export pinned to the OKF 0.1 Draft. Qarinah does not claim OKF ingestion or lossless round-trip support.

## 7. Host and ecosystem integrations

### Codex and Claude Code

The repository generates dependency-free plugin runtimes for Codex and Claude Code. Supported lifecycle hooks normalize allowlisted host events. A local context skill explains the safe workflow. The MCP surface exposes zero-write status and integrity diagnostics. Context disclosure stays explicit or passes through a separately governed Maqam capability.

The adapters do not parse transcript files or claim visibility into hidden reasoning. Plugin upgrades require reinstalling the reviewed generated runtime and starting a new task so an immutable cache is not mistaken for current code.

### Maqam

Maqam can register separate governed tools for context query and append. Reads use a private one-dispatch verifier. Writes additionally require exact consumed approval and independently enforce the workspace's metadata or content policy. This governs registered calls; it does not claim control over unregistered code or direct operating-system side effects.

### Cockroach Crawler

The crawler adapter validates a bounded public `SourceRecord` and separates stable content revisions from individual acquisitions. Re-fetches can preserve one revision while retaining updated retrieval provenance. Crawler material remains untrusted evidence, and the dependency direction stays from the crawler record into Qarinah.

### ProductLoop

The provenance bridge implements the workflow runtime's public sink contract. It validates sequence and receipt continuity and maps stable run positions to stable event identities. Divergent histories collide instead of silently forking the record.

## 8. Security and privacy boundary

Qarinah reduces the amount of retained and disclosed context, but retained content is still security-sensitive. Its controls include:

- explicit workspace opt-in and machine-local trust;
- metadata-only capture by default;
- bounded recursive redaction;
- strict schema, path, event, log, context, and scan limits;
- root-bound real paths and linked-path rejection;
- renewable append locks and atomic derived replacements;
- hash-chain and rollback-checkpoint verification;
- deterministic rebuilds and stale-index refusal;
- fail-closed evidence coverage; and
- treatment of retrieved context as untrusted data, never executable instructions.

Content-mode redaction cannot prove that arbitrary tool output is secret-free. Users should keep metadata mode unless retained content has been reviewed. A valid chain proves consistency with retained bytes and a trusted checkpoint, not the truth of every claim or the identity of every actor.

Qarinah does not require a Qarinah API key, hosted database, model provider, analytics service, or background daemon. Model access and external source access remain separate capabilities with their own credentials and policies.

## 9. Evidence and measurement

The committed `0.1.0-alpha.2` evaluator creates a deterministic 54-record workspace and tests exact retrieval, typo tolerance, conflict recall, and supersession. On that fixture, the selected context pack averaged 2,237 characters per query compared with 44,364 characters for raw event-log replay, a 94.96% reduction, while all four tested targets remained retrievable.

This is a fixture-level character-volume result. It is not a universal token, billing, latency, cost, or answer-quality guarantee. The evaluator, expected machine-readable result, environment notes, and claim boundaries are published in [BENCHMARKS.md](BENCHMARKS.md).

## 10. What the alpha establishes

The technical preview establishes an end-to-end implementation of:

1. explicit workspace trust and capture policy;
2. strict append-only lifecycle records;
3. hash-chain and checkpoint verification;
4. deterministic graph, index, Markdown, and OKF derivation;
5. bounded project-structure observation;
6. cited, coverage-aware context compilation;
7. generated Codex and Claude Code plugin runtimes;
8. governed Maqam query and append boundaries;
9. crawler and workflow provenance adapters; and
10. reproducible regression and context-volume fixtures.

It does not establish universal semantic memory, automatic correctness, complete visibility into every host, or operating-system-level mediation.

## 11. Road to stable

The stable-release program expands held-out retrieval tests, negative and unsupported queries, language-aware project adapters, signed pack manifests, deletion and retention workflows, and independently reviewed threat-model evidence. Any privileged cross-platform process, filesystem, network, identity, secret, or device mediation belongs in a separate supervisor with platform-specific security review. Qarinah remains the evidence-linked memory and context layer.

## 12. Reproduce the current proof

From the reviewed source tree on a maintained Node.js 22, 24, or 26 release:

```sh
npm ci
npm run check
npm run evaluate:context
npm run benchmark
```

Inspect the machine-readable benchmark under `bench/results/`, run `qarinah doctor` in an initialized disposable workspace, and delete the graph, index, and Markdown projections before rebuilding them to verify that the event chain remains authoritative.

The complete security model, interoperability limits, release gates, and raw benchmark qualifications remain part of this paper through the linked repository documents. A launch should keep those artifacts on the same reviewed commit as the package and generated plugins.
