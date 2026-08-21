# Qarinah: Proof-Carrying Project Memory

## Multi-language developer memory with inspectable context receipts

**Author:** Ajnas N B<br>
**Paper version:** 1.8<br>
**Implementation:** Qarinah `0.6.0-alpha.1`<br>
**Date:** 21 August 2026<br>
**License:** Apache License 2.0<br>
**Status:** Implementation-backed technical white paper for the Qarinah 0.6.0 alpha. This version is not peer-reviewed. All measured claims identify their benchmark, denominator, estimator, and limits. Version 1.8 has no version DOI until a separate Zenodo deposit is completed; the persistent paper series uses concept DOI [10.5281/zenodo.21547684](https://doi.org/10.5281/zenodo.21547684).

**Version note:** v1.8 adds proof-carrying task context: one bounded artifact that joins current project memory, temporal facts, ranked files and symbols, explicit selection and exclusion reasons, and reproducible manifests. Its committed acceptance evaluator passes 12 of 12 predefined scenarios across ten registered language families. Version 1.7 remains an immutable repository artifact; published v1.4, version DOI [10.5281/zenodo.21850747](https://doi.org/10.5281/zenodo.21850747), remains an immutable historical publication.

[Download the v1.8 PDF](https://github.com/AjnasNB/qarinah/blob/main/output/pdf/Qarinah-Technical-White-Paper-v1.8.pdf)

> Qarinah turns permitted agent activity, project structure, decisions, approvals, and source evidence into a local, verifiable record. When a later task needs context, Qarinah compiles a small cited pack instead of replaying the complete project history.

<p align="center">
  <img src="../assets/architecture/qarinah-flow.svg" width="520" alt="Qarinah flow from Codex, Claude Code, CLI tools, and project inputs through explicit capture and a hash-chained event ledger to deterministic views and a small cited context pack.">
</p>

## Abstract

Long-running software work creates a memory problem for coding agents. Source files show what the project contains now, but they often do not explain why a design was selected, which alternative was rejected, who approved a consequential action, what a tool returned, which source supported a claim, or whether a later decision superseded an earlier one. Replaying every prior interaction preserves more history, but context volume grows with project age and introduces increasing amounts of irrelevant material. Replacing that history with a single generated summary is smaller, but it weakens provenance and makes omissions, conflicts, and obsolete decisions difficult to inspect.

Qarinah treats project memory as a compilation problem rather than a transcript-storage problem. Its authoritative layer is an append-only, hash-chained JSONL ledger containing only explicitly permitted lifecycle events and committed decisions. From that ledger it deterministically derives a typed graph, a lexical and typo-tolerant index, human-readable Markdown, a bounded project-structure projection, and portable Google Open Knowledge Format (OKF) Markdown. At task time, a hybrid retriever compiles a budgeted context pack whose items cite the exact event identities and hashes that support them.

The implementation is local-first, model-agnostic, and explicit about capture. A repository configuration does not grant consent by itself. Capture also requires machine-local trust for the repository's real path, and metadata-only capture is the default. Content capture is a separate reviewed choice. Derived files are disposable and can be rebuilt from the verified event chain.

Qarinah 0.6.0-alpha.1 makes that memory directly usable as a task-scoped developer artifact. Each initialized Git checkout retains a separate writable ledger and consent state. A shared repository identity lets the local dashboard compare initialized sibling worktrees without merging their stores. The developer view combines a searchable linked graph, decisions, tool outcomes, conflicts, lifecycle-bound session receipts, branch/commit state, and a proof tab for the task packet. A sandboxed VS Code/Cursor panel reads the same local projection and can replay the exact observed session event sequence. Completed-turn hooks record idempotent incremental checkpoints in four explicit states: initial, unchanged, delta, and full rebuild.

The proof-context compiler joins the current memory pack, admitted temporal facts, and source-hash-verified symbols into one bounded JSON or Markdown artifact. Every included memory item, file, and fact exposes why it was selected. Superseded evidence remains explicitly listed as excluded rather than silently disappearing. The manifest binds the query, workspace, source head, nested context-pack manifest, selected identities, and byte representation so a later host can reject tampering before using the packet.

The release also separates three responsibilities that are often collapsed into one memory store. An explicit content archive preserves selected project files as authenticated content-defined chunks and restores them byte for byte. Source-hash-bound Tree-sitter parsers add declarations and unambiguous references for JavaScript, JSX, TypeScript, TSX, Python, Go, Rust, Java, Kotlin, C, C++, and C#, with a bounded Language Server Protocol surface. A cited consolidation layer turns admitted evidence into strict facts whose source event identities remain inspectable. An explicit foreground watcher joins these parts into a journaled incremental refresh cycle that can recover an interrupted projection rebuild without installing a hidden desktop-wide collector.

A separate public-checkout evaluator runs against Qarinah's own repository without private fixtures, provider calls, or model-written summaries. It passes 10 of 10 scenarios, indexes every eligible regular source file, resolves exact definitions and references across the supported language set, verifies receipt and cycle recovery invariants, exercises the editor replay contract, and proves that an encrypted sync bundle can be stored and retrieved without exposing event bodies or bearer tokens. This is a reproducible product acceptance result, not an independent benchmark or a universal accuracy claim.

A committed deep-memory acceptance evaluator exercises this complete local path in a temporary initialized project. It passes 12 of 12 scenarios, verifies and restores 390,226 source bytes exactly, reuses two of three chunks in the second snapshot, indexes four symbols and three resolved references, and retains two cited facts. This is deliberately small end-to-end product evidence, not a cross-product benchmark or a universal storage, language, or retrieval result.

The committed software-task evaluation compares full-history replay with Qarinah packs while keeping the same current-task source material on both sides. Across 240 retained records and six software scenarios, the measured context falls from 442,113 to 5,682 estimated input-context tokens: a 98.7148% reduction and a 77.81:1 compression ratio. Every required target ranks in the top five with direct evidence coverage, and no model-written summaries are used. A separate 42-record, two-session continuation fixture measures two outputs against the same 9,489-token history: a 119-token model-facing capsule (98.7459% reduction) and a 1,039-token complete cited audit pack (89.0505% reduction). The capsule retains the selected summary identity and audit-pack manifest pointer; the larger pack retains all summary-source identities and hashes.

A development-stage real-repository study uses the official public SWE-bench Lite task artifact and the software-issue framing introduced by Jimenez et al. [1]. It orders each repository chronologically, uses 60 early tasks to build memory, and evaluates 240 later queries. Admission-first Qarinah v2 matches admitted BM25 ranking, while its temporal and authority filters prevent the future and forbidden evidence admitted by ablations. Online mean reciprocal rank improves from 0.6007 for the earlier balanced profile to 0.6956 for v2; the repository-clustered 95% interval for the paired difference is [0.0572, 0.1115]. Graph expansion adds no ranking improvement in this corpus. The production-bound development-v0.4 recomputation observes zero direct false accepts under the structural oracle while accepting 4.17% of static and 6.25% of online queries, so it is not presented as a universal semantic guarantee.

A separately frozen and authorized v0.5 run binds the current production retrieval API to the same inspected development corpus. Its complete projected result is exactly equal to the immutable v0.4 reference: canonical `JSON.stringify` output is 3,110,007 bytes with SHA-256 `12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c`. This is a source-bound differential reproduction, not a new held-out experiment or a global API-equivalence claim.

The frozen context-efficiency comparison v2 produced no primary comparative result. Qarinah and admission-filtered BM25 were each eligible on five of six development cases and had identical portable token estimates on those five cases. Both passed four of four safety cases with zero forbidden inclusions; raw BM25, used only as a safety negative control, passed zero of four and produced 26 forbidden-inclusion detections. These observations do not establish a winning context-reduction method and are kept separate from the six-task 98.7148% full-history fixture.

A separate deterministic scale regression builds 40-, 50-, and 100-file repositories containing nested JavaScript and Markdown, resolved relationships, lexical distractors, graph-only evidence, supersession, contradiction, and deliberately stale projections. All 380 exact and typo-tolerant positive queries return the correct cited record at rank 1 and preserve its answer. All 190 exact queries use SQLite and are accepted as direct; all 190 typo queries retrieve the correct evidence but conservatively abstain; and all nine unsupported controls are rejected. The worst-case estimated context reductions at the three scales are 93.4803%, 94.6948%, and 97.1521%. This is synthetic local retrieval and projection-integrity evidence, not provider-billed usage or coding-task success.

These are reproducible context-volume, continuation, and retrieval results. They are not provider billing receipts or an official SWE-bench patch-resolution score. A frozen 40-task SWE-bench Verified paired protocol defines the next provider-backed experiment, but its outcomes remain unobserved in this release.

This paper describes the problem, system model, architecture, trust boundary, retrieval method, integrations, evaluation, limitations, and release criteria of the current implementation.

**Keywords:** coding agents, project memory, lossless source recovery, Git worktrees, symbol graph, language server, context engineering, provenance, knowledge graph, retrieval, session receipts, MCP

## 1. Executive summary

Qarinah is designed around one observation: useful agent memory needs both compression and proof.

A coding agent should not have to reread months of unrelated project history to recover one release decision. It should also not be asked to trust an uncited paragraph that may have omitted a constraint or preserved an obsolete choice. Qarinah keeps the durable evidence record separate from the compact context sent to a model:

1. **Capture is explicit.** A workspace is initialized, reviewed, and trusted on the current machine before Qarinah records anything.
2. **The ledger is authoritative.** Events are canonical, versioned, append-only, hash-chained, bounded, and linked to provenance.
3. **Every other view is derived.** The graph, index, Markdown record, project map, OKF bundle, and context pack can be deleted and rebuilt.
4. **Retrieval is evidence-aware.** Lexical relevance, typo tolerance, graph evidence, conflicts, supersession, time, retention, authority, and diversity influence selection.
5. **Output is budgeted as a complete artifact.** Qarinah measures the full serialized pack, including citations and coverage metadata.
6. **Selected memory remains inspectable.** Every returned item identifies the event and hash that support it.
7. **Approval remains an optional composition.** Maqam can add policy or human approval to selected reads and writes; Qarinah remains useful without it.
8. **Developer memory is visible.** The CLI, local dashboard, and VS Code/Cursor panel expose the same searchable graph, timeline, worktree comparison, and exact session receipts.
9. **Task context carries its own proof.** One deterministic packet joins current memory, temporal facts, files, symbols, exclusions, selection reasons, budgets, and a verifiable manifest.

The project does not claim to read hidden reasoning, monitor every host action, prove the truth of a stored claim, or turn a user-space package into an operating-system security boundary. It provides a narrower and more useful primitive: a verifiable local record and a deterministic way to compile the smallest evidence-backed context appropriate for a task.

## 2. The project-memory problem

### 2.1 Source code is necessary but incomplete

A repository contains the executable state of a software project, but engineering work also depends on information that may not live in the current code:

- the reason a migration was split into phases;
- an approval that authorized one release artifact and not another;
- a production failure and the tool output that identified its cause;
- a source used to justify an implementation choice;
- a rejected approach that must not be reintroduced;
- a security boundary agreed during review;
- a previous decision that a newer decision superseded; and
- the relationship between a workflow run, its artifacts, and its release receipt.

When this context is absent, a new agent can read the code correctly and still repeat an old mistake.

### 2.2 Full-history replay scales poorly

The direct solution is to resend all retained history. That has three weaknesses.

First, context volume grows with the lifetime of the project, not with the needs of the current task. Second, relevant evidence competes with unrelated history for model attention. Third, sending more history increases the disclosure surface: material unrelated to the task is exposed simply because it exists.

Full replay is valuable as an audit baseline, but it is a poor default context strategy.

### 2.3 A single summary is not an authority

A generated summary can be compact, readable, and useful. It is still a lossy interpretation. If it becomes the only retained artifact, a later reader may be unable to answer:

- Which source supported this sentence?
- Was the statement extracted, inferred, claimed, or verified?
- Was a conflicting decision removed or merely omitted?
- Is this decision still current?
- Did the summary cross a capture or retention boundary?
- Can the result be reproduced without calling the same model?

Qarinah may retain summaries as events, but it never makes a summary authoritative merely because it is concise.

### 2.4 Similarity is not evidence coverage

Semantic or lexical similarity can identify related material without showing that the requested evidence is present. A result about "database rollout" may be close to a query about "orders idempotency migration" while still omitting the exact decision the task requires.

For this reason, Qarinah reports coverage separately from ranking. A highly ranked result can still fail a caller's `minimumCoverage` requirement.

## 3. Goals, non-goals, and contribution

### 3.1 Goals

The current system is built to:

- preserve permitted project events in a durable local record;
- make alteration, deletion, truncation, duplication, and rollback detectable relative to a machine-local checkpoint;
- keep capture consent separate from portable repository configuration;
- distinguish metadata capture from reviewed content capture;
- reconstruct all search and presentation views deterministically;
- preserve typed relations, conflicts, supersession, provenance, confidence, time, authority, and retention;
- compile small context packs under explicit character, item, and token budgets;
- return citations to the exact retained evidence selected;
- integrate with Codex, Claude Code, local CLIs, MCP diagnostics, Maqam, Cockroach Crawler, ProductLoop, and OKF without silently merging their security boundaries; and
- remain useful without a hosted Qarinah account, Qarinah API key, remote database, or background service.

### 3.2 Non-goals

Qarinah does not:

- capture private model reasoning or chain of thought;
- scrape hidden transcript files, browser cookies, or authentication state;
- guarantee observation of every action available in every AI host;
- execute retrieved text as instructions;
- prove that a retained claim is true because its bytes are hash-chained;
- promise secret-free content capture for arbitrary tool output;
- provide universal semantic memory or automatic answer correctness;
- replace a model provider, agent orchestrator, database, source-control system, or privileged sandbox; or
- claim operating-system control over unregistered processes, direct side effects, devices, identities, or network traffic.

### 3.3 Technical contribution

The implementation combines several properties that are often separated:

1. a machine-consent boundary tied to the repository's real local path;
2. a versioned, canonical, append-only project event model;
3. a hash chain plus a machine-local rollback checkpoint;
4. disposable graph, index, Markdown, project-structure, and OKF projections;
5. deterministic hybrid retrieval with visible conflict and supersession behavior;
6. complete-output context budgeting and explicit evidence coverage;
7. thin host adapters that do not claim more observability than their hosts expose; and
8. optional governance and source-ingestion adapters that keep ownership and authority explicit.

The important distinction is not that Qarinah contains a graph or a search index. It is that those views remain subordinate to a verifiable event record and are compiled into bounded, cited task context.

## 4. System model

### 4.1 Actors

Qarinah events distinguish five actor classes:

- **human** for an explicit user decision, approval, or statement;
- **agent** for an exposed model or subagent lifecycle event;
- **tool** for a tool request, result, artifact, or failure;
- **system** for an adapter, runtime, or deterministic system transition; and
- **source** for externally acquired evidence.

An actor class describes provenance. It does not automatically grant authority.

### 4.2 Event classes

The current contract represents prompts, tool requests, tool completions, approvals, artifacts, sources, claims, decisions, summaries, compactions, subagents, completed turns, and failed turns when a supported adapter supplies them. Unknown lifecycle events are not guessed into a familiar shape.

Each retained event contains:

- a schema version;
- a workspace identity;
- an event identity;
- optional session and turn references;
- an actor;
- a canonical UTC timestamp;
- an event kind;
- bounded content or metadata;
- provenance;
- a confidence class;
- typed relations;
- retention metadata;
- a previous-record hash;
- a content hash; and
- a canonical record hash.

### 4.3 Confidence, authority, and truth

Qarinah separates four confidence classes:

- `extracted`: copied or mechanically derived from a named source;
- `inferred`: produced by a reasoned transformation;
- `claimed`: asserted but not independently verified; and
- `verified`: checked against an explicit verification process.

These labels communicate how a record entered the system. They do not turn Qarinah into a fact-checker. A verified hash proves consistency with retained bytes; it does not prove the world described by those bytes.

Scoped authority is also independent. A human approval can be authoritative for one run, tool, input, or release artifact without becoming a universal permission.

### 4.4 Relations

Typed relations connect events to sessions, turns, tools, approvals, sources, evidence, artifacts, conflicts, and superseded records. They allow retrieval to distinguish "this record supports that decision" from "this record conflicts with that decision."

This matters because project history is not merely a bag of text. Its topology carries meaning.

## 5. Trust and capture

### 5.1 Portable configuration is not consent

A file committed to a repository can travel to another machine. It must not silently authorize capture there. Qarinah therefore requires two independent elements:

1. portable workspace configuration in the repository; and
2. a machine-local permit bound to the canonical real path and the reviewed policy digest.

The permit records the workspace identity, enabled state, capture mode, event, log and context ceilings, retention class, verified head, and disposable event-ID projection digest. If the portable policy changes, capture fails closed until the new digest is explicitly reviewed and trusted.

### 5.2 Metadata-first retention

Metadata mode is the default. The central append boundary replaces unreviewed bodies and data with deterministic digest and size information. Built-in adapters may retain only code-reviewed coarse metadata fields.

Content mode can retain bounded prompt, tool, completion, source, and decision content after best-effort redaction. It is intentionally a separate choice because content useful to future agents can also be sensitive.

### 5.3 What Qarinah excludes

The product boundary excludes:

- credentials and environment values;
- browser cookies and private session state;
- hidden reasoning;
- ignored source-file contents;
- unrequested transcript scraping; and
- unrelated files outside the opted-in repository root.

Redaction handles secret-like keys and common token patterns, but no pattern-based filter can guarantee that arbitrary content is free of secrets. Metadata mode is the safer default for unclassified work.

### 5.4 Revocation

A machine-local revocation tombstone takes precedence over portable configuration and trust-record recreation. Re-enablement requires an explicit trust operation. Disabling, untrusting, re-trusting, appending, and updating checkpoints serialize through the workspace write lock.

## 6. Authoritative storage

### 6.1 Canonical JSONL

The durable source of truth is:

```text
.qarinah/events/events.jsonl
```

Each line is a canonical event envelope. Canonical serialization ensures that logically identical JSON values have one byte representation before hashing.

### 6.2 Hash chaining

For event \(E_i\), Qarinah binds the canonical event content and the previous event hash:

```text
recordHash(E_i) = SHA-256(canonical(E_i without recordHash) + previousHash)
```

The exact implementation uses the package's versioned canonicalization and event contract rather than accepting arbitrary JSON. The chain makes edits, deletions, truncation, duplicate identities, non-canonical bytes, and broken continuity detectable during full verification.

### 6.3 The rollback checkpoint

A hash chain alone cannot identify the correct head if an attacker replaces the complete log with an older valid prefix. Qarinah therefore stores the last trusted head in the machine-local permit. Verification compares the retained chain with that checkpoint.

This is tamper-evident rather than tamper-proof. An adversary able to replace both repository state and machine trust state remains outside the current foundation. Signed and independently anchored checkpoints are roadmap work.

### 6.4 Concurrent append behavior

Appends use a renewable owner-token lease. Under the lock, Qarinah:

1. reloads machine trust;
2. validates the canonical head;
3. validates the checkpoint-authenticated event-ID projection;
4. extends and flushes the event log;
5. updates the disposable idempotency projection;
6. checkpoints both identities; and
7. releases the lock only if ownership remains unchanged.

The initial coordination design is for one host and one workspace. Network filesystems require a different consensus and locking model.

### 6.5 Idempotency and collisions

Stable event identities let exact replays return the retained record rather than duplicate it. If the same event identity is reused for different canonical content, the append fails with a conflict instead of silently forking history.

This behavior is especially important for workflow ingestion and source acquisitions, where retries are normal.

## 7. Deterministic derived views

The event chain is authoritative; the following paths are rebuildable:

| Path | Purpose | Authority |
| --- | --- | --- |
| `.qarinah/graph/graph.json` | Typed event graph and current project-structure projection | Derived |
| `.qarinah/index/index.json` | Lexical postings, trigram terms, and graph adjacency | Derived |
| `.qarinah/records/CONTEXT.md` | Human-readable project record | Derived |
| `.qarinah/records/okf/` | Portable OKF Markdown bundle | Derived |
| `.qarinah/index/event-ids/` | Checkpoint-authenticated idempotency buckets | Disposable |
| `.qarinah/graph/symbol-graph.json` | Source-hash-bound symbols and resolved references | Derived |

A build starts by verifying the complete event chain and checkpoint. Derived state is then recomputed from canonical inputs. Retrieval rejects stale persisted views rather than quietly using them.

This design offers two practical benefits. A corrupt search index does not become durable memory, and a human can inspect the Markdown or OKF representation without changing the evidence record from which it came.

### 7.1 Lossless content retention is a separate artifact

Qarinah does not pretend that a task-specific context pack is lossless. When a content-authorized operator requests exact project recovery, the archive stores selected regular-file bytes under `.qarinah/archive/` using content-defined chunks. A keyed plaintext digest identifies duplicate chunks inside one vault. New objects are authenticated with AES-256-GCM, use a per-vault deterministic nonce derived from the keyed plaintext identity, and live under key-scoped paths. Brotli is retained only when it reduces stored bytes.

Each manifest binds the relative file path, byte size, file SHA-256, ordered chunks, object identities, codec, authenticated-encryption metadata, key identity, and snapshot totals. Verification checks the manifest, key, objects, authenticated plaintext, per-chunk identity, file reconstruction, and total source bytes before declaring success. Restore writes to a new operator-selected directory and verifies the reconstructed file digest. Symlinks, junctions, hard-linked files, ignored/generated paths, common secret filenames, binary candidates, and inputs outside the configured byte/count ceilings are rejected or explicitly excluded.

This archive has a different authority model from the JSONL event ledger. The ledger remains authoritative for project memory and decisions; the archive manifest plus authenticated objects is the recovery authority for the selected file snapshot. Deleting an archive manifest, garbage-collecting unreferenced objects, or destroying the local key are explicit operations. Key destruction makes locally retained objects under that key inaccessible to Qarinah but does not prove physical-media erasure or deletion from backups, copied keys, or other systems.

## 8. Project-structure observation

Qarinah can scan a repository to create a bounded structural snapshot. The scanner records:

- directories and files;
- portable paths;
- file sizes and content identities;
- conservative JavaScript and TypeScript module references;
- Markdown links;
- exact observed source spans for extracted references; and
- additions, changes, renames, and deletions relative to the prior snapshot.

The scanner follows the project's ignore policy, excludes generated Qarinah state, rejects linked paths, bounds file count, file size, total bytes, and traversal depth, and skips likely binary files.

The structural scanner remains language-conservative. Its purpose is to answer questions such as:

- Which files were affected by this decision?
- Where is a referenced module located?
- What changed between two recorded project snapshots?
- Which artifact did a tool completion produce?

### 8.1 Source-hash-bound symbol and reference graph

For JavaScript, JSX, TypeScript, TSX, Python, Go, Rust, Java, Kotlin, C, C++, and C#, Qarinah adds a separate Tree-sitter projection. Before parsing, it verifies each regular file still matches the latest scanned content hash. The graph records declaration identity, name, kind, container, exported status where applicable, exact source span, signature hash, file content hash, and unambiguous reference locations. Stale, linked, binary, oversized, or unsupported files remain explicit coverage entries rather than guessed results.

Symbol search combines a 0.62 lexical component, a 0.28 deterministic local character-subword vector, and a 0.10 resolved-reference component. The vector is derived locally from symbol text and is not a downloaded embedding model. Each result exposes these components, making the score reproducible. Ambiguous definitions abstain from producing a guessed cross-file target.

The `qarinah-lsp` process exposes initialization, shutdown, document symbols, workspace symbols, definition, and references through bounded stdio JSON-RPC. Workspace answers use the last verified symbol graph; open-buffer document symbols are parsed in memory for the exact supported language set. The source tree also ships a project-local LSP4IJ configuration template for JetBrains IDEs. This is useful project-memory code intelligence, but it is not a full semantic compiler, refactoring engine, debugger, or replacement for a mature language-specific IDE service. Definition and reference edges remain intentionally limited to unambiguous evidence.

## 9. Retrieval and context compilation

### 9.1 Candidate generation

Qarinah's local retriever combines:

- BM25 lexical relevance;
- character-trigram matching for bounded typo tolerance;
- one-hop graph evidence;
- reciprocal-rank fusion; and
- deterministic diversity.

These methods do not require a model call or an embedding API. Symbol search additionally uses the deterministic local subword vector described in Section 8.1. Qarinah still does not ship a learned dense-embedding model or managed vector service as its default event-memory retriever. Any learned dense or model-assisted adapter must remain versioned, explicit, and subordinate to the authoritative record.

### 9.2 Evidence policy

Candidate relevance is only the first stage. Before selection, Qarinah applies:

- `asOf` time filtering;
- retention eligibility;
- scoped authority;
- conflict visibility;
- supersession rules; and
- diversity across the retained evidence.

An older decision can remain visible for audit while a superseding decision is ranked as current. A conflicting record is not silently flattened into the same conclusion.

### 9.3 Evidence coverage

Context-pack v2 reports:

- `direct`: one retained record contains all normalized query terms;
- `partial`: retained evidence overlaps the query but is incomplete; or
- `none`: no matching retained evidence exists.

Callers can require `minimumCoverage: "direct"`. If the requirement is not met, compilation fails with `CONTEXT_COVERAGE_TOO_LOW`.

Coverage is deliberately conservative. It describes lexical evidence in the retained record, not semantic truth or the correctness of a model's eventual answer.

### 9.4 Complete-output budgeting

Qarinah budgets the entire serialized context pack, not only the selected excerpt. The limit includes:

- item content;
- event identities;
- content and record hashes;
- selection reasons;
- evidence coverage;
- manifest metadata; and
- JSON or Markdown framing.

Callers can supply character and item ceilings or a deterministic token plan with maximum, reserve, citation, framing, and content budgets. Without a provider tokenizer, Qarinah uses the portable `ceil(characters / 4)` estimate and marks it as inexact.

### 9.5 Cited output

Each context item carries the retained identity required to trace it to the event log. A context pack is therefore a compilation artifact with a manifest, not an anonymous search response.

This is the central user-facing behavior: the next agent receives a small working set and can still inspect why every selected item was included.

### 9.6 Proof-carrying task context

The `qarinah proof` command compiles the parts of developer memory that a coding task needs into one `qarinah.proof-context.v1` artifact. The compiler starts from the verified context pack, then joins temporal facts and source-hash-verified symbol search without granting either derived view independent authority. The result contains:

- the bounded memory pack and its nested manifest;
- ranked files and symbols with exact content or signature hashes;
- current temporal facts with their cited source event identities;
- lifecycle labels for current, superseded, and conflicting evidence;
- explicit selection reasons for every included item;
- an excluded-source list for evidence removed by supersession;
- portable character and estimated-token budgets; and
- an outer manifest that binds the query, workspace identity, source head, nested manifest, selected identities, and canonical packet bytes.

Validation recomputes both the outer packet hash and the nested context-pack hash. A packet whose query, selected evidence, file hashes, fact citations, or serialized content changes no longer validates. This makes the packet independently checkable by another host without claiming that hashes establish semantic truth.

The default build is read-only with respect to the persisted symbol projection. Callers may explicitly request symbol persistence when they want the verified source graph updated. This keeps a task-context read from being silently turned into a workspace mutation.

## 10. Human-readable and portable records

### 10.1 Markdown and JSON

Qarinah materializes both machine-readable JSON and a human-readable `CONTEXT.md`. These views make the project record inspectable with ordinary tools and version-control workflows.

The generated Markdown is not intended to be pasted wholesale into every model task. It is an audit and navigation view. Task-time retrieval should compile a focused pack.

### 10.2 Google Open Knowledge Format

The explicit command:

```sh
qarinah export okf
```

creates a deterministic bundle compatible with the Google Open Knowledge Format 0.1 Draft. The bundle contains:

- a root `index.md` declaring the OKF version;
- a newest-first `log.md` grouped by event date;
- one Markdown concept per event under `events/`;
- bundle-relative typed relation links;
- bounded citations and provenance; and
- Qarinah extension fields for event identity, actor, confidence, authority, hashes, retention, and relations.

The output contains no export-time clock or destination-path field, so the same verified head produces the same bytes and bundle digest at every permitted destination.

Safe replacement requires a canonical ownership marker and expected manifest. Existing unmarked directories, unexpected files, path escapes, linked components, `.git`, and authoritative `.qarinah` locations are rejected.

OKF is a portable projection. Qarinah does not claim OKF ingestion or a lossless round trip, and OKF does not replace the ledger, graph, index, or query runtime.

## 11. Host integrations

### 11.1 One core, thin adapters

Qarinah keeps capture, storage, verification, derivation, and retrieval in one local core. Host adapters normalize only the fields their host explicitly supplies.

This avoids a dangerous compatibility pattern: inferring a universal private transcript format and pretending that every host exposes the same lifecycle.

### 11.2 Codex

The Codex plugin contains:

- a standard `.codex-plugin/plugin.json` manifest;
- ten supported local lifecycle hooks;
- a Qarinah context skill;
- a generated dependency-free runtime; and
- a local read-only MCP diagnostics server.

Known event schemas reject missing or unrecognized fields. Unknown lifecycle event names are ignored rather than guessed. Local hooks do not claim coverage of hosted search or every specialized tool route.

Codex plugin installation is personal. The per-project Qarinah trust boundary controls which repositories may retain records.

### 11.3 Claude Code

The Claude Code plugin contains:

- a native Claude plugin manifest;
- hooks for sessions, prompts, tools, compaction, stop, subagent, and session-end events;
- the same context skill workflow;
- a generated dependency-free runtime; and
- a local read-only MCP diagnostics server.

Qarinah does not parse Claude transcript files. Unknown hook fields are counted but their names and values are not retained in metadata mode.

The plugin requires the user to review the Node executable used by lifecycle hooks. Installed plugin caches are immutable snapshots; changes require a reviewed rebuild, reinstall, and reload.

### 11.4 CLI

The CLI supports explicit initialization, policy review, trust, append, scan, build, query, verification, diagnostics, and OKF export. Model-facing payloads can travel through bounded JSON on standard input so model-controlled text does not need to be interpolated into a shell command.

### 11.5 MCP

The bundled stdio MCP server intentionally exposes only:

- `context_status`; and
- `context_doctor`.

Both tools are read-only, closed-world diagnostics. They can select an exact opted-in workspace by absolute local path or `file:` URI. They never walk upward into a trusted parent, initialize a workspace, grant trust, mutate the ledger, repair a checkpoint, or disclose the absolute path in their response.

Context disclosure is not an ambient MCP side effect. A direct local query must be explicitly requested, or a separately governed Maqam capability can mediate it.

### 11.6 Editor panel and project-scoped host lifecycle

Qarinah 0.6.0-alpha.1 includes a VS Code extension that also runs in Cursor. The panel is a local projection of the initialized workspace rather than a second memory store. It shows the current worktree, decisions, tool outcomes, conflicts, a searchable linked graph, a selected session's ordered observed lifecycle, and the current task-proof packet. Receipt inspection exposes event IDs, hashes, kinds, times, outcomes, and declared boundaries without retaining transcript bodies or hidden reasoning. The webview receives a bounded message contract and cannot read arbitrary files or execute workspace commands.

JetBrains users can attach the same `qarinah-lsp` process through the packaged LSP4IJ project template. This is a standard-LSP integration rather than a native JetBrains plugin, so it provides bounded symbols, definitions, and references while the full graph and session replay remain in Qarinah's local dashboard or VS Code-compatible panel.

The CLI also supports dry-run, install, and uninstall plans for Codex, Claude Code, Cursor, Kimi, Antigravity, and Freebuff. Installation is project-scoped. Qarinah writes an ownership manifest containing exact paths and digests; uninstall removes only bytes still matching that manifest and preserves unrelated host configuration. Host support means a reviewed configuration or adapter is generated and verified. It does not mean every host exposes identical lifecycle events.

### 11.7 Explicit automatic refresh and cited consolidation

`qarinah watch` is an operator-started foreground loop, not a hidden background service. Each serialized cycle runs the bounded project scan. A changed snapshot refreshes the symbol graph, records one idempotent cited coding-context checkpoint, and rebuilds SQLite, graph, index, Markdown, and overview projections. An unchanged snapshot creates no duplicate checkpoint and no derived write. A hash-linked cycle journal records each transition and lets the next run recover or safely rebuild after interruption. Abort signals stop polling and are checked by the underlying public append and rebuild paths before their first irreversible write.

### 11.8 Self-hosted opaque team synchronization

The optional sync service stores encrypted Qarinah bundles as opaque bytes. It requires explicit project membership, fixed roles, bounded bundle sizes, optimistic revision checks, rate limits, and token-free audit records. The server never receives the project-memory decryption key and cannot interpret event bodies. This is a self-hosted interoperability surface, not a managed Qarinah cloud: organization SSO, billing, multi-region operations, and enterprise administration are outside this release.

`qarinah facts` consolidates an admitted verified context pack into bounded decisions, constraints, tools, outcomes, evidence, conflicts, and summaries. The default extractor is deterministic and local. An optional host model receives only the bounded pack and source descriptors as untrusted data. Its response must match a strict closed schema, cite only event IDs present in that pack, stay within count and character limits, and avoid duplicate identities. Metadata capture retains a content-free consolidation receipt; content capture may retain the bounded cited statements. The cited event chain remains authoritative in both modes.

## 12. Composable ecosystem boundaries

### 12.1 Maqam

[Maqam](https://github.com/AjnasNB/maqam) ([documentation](https://maqamagent.com/docs/)) is a TypeScript governance boundary for registered AI-agent operations. It evaluates policy before dispatch, can bind human approval to the exact run, tool, and input, consumes that approval once by default, and produces reviewable trace and evidence records. Qarinah remains a separate memory layer; Maqam can optionally govern exactly which Qarinah context reads and writes a host may perform.

Maqam can register two separate Qarinah tools:

| Tool | Effect | Risk | Required authority |
| --- | --- | --- | --- |
| `context.query` | read | low | Active guarded dispatch and scoped evidence capability |
| `context.append` | write | high | Active guarded dispatch, scoped evidence, and consumed exact approval |

The gateway verifier binds the active input and context objects, tool registration, run, canonical input hash, policy decision, and consumed approvals. A retained handler or fabricated plain context cannot replay that capability.

This governs registered calls. It does not mediate unregistered code, raw drivers retained by a host, or direct operating-system effects.

### 12.2 Cockroach Crawler

[Cockroach Crawler](https://github.com/AjnasNB/cockroach-crawler) ([documentation](https://cockroachcrawler.com/docs/)) is a Node.js and TypeScript web-acquisition toolkit for AI agents. It crawls static and rendered pages, extracts normalized records, and routes supported public sources while keeping origins, credentials, browser capabilities, and resource ceilings under host control. Qarinah does not embed the crawler; it accepts reviewed `SourceRecord` values as source evidence through a strict interoperability boundary.

Qarinah validates a strict structural boundary around Cockroach Crawler `SourceRecord` values. Ingestion separates:

- a stable content revision; and
- a distinct acquisition containing retrieval and descriptive provenance.

An unchanged body fetched later can reuse its revision and append a new acquisition. Exact replay is idempotent. Metadata mode does not retain raw URL, title, text, author, warnings, or provider metadata. Content mode retains bounded reviewed values.

Crawler content remains untrusted evidence. Qarinah does not execute it and does not treat an upstream hash as independent proof of factual correctness.

### 12.3 ProductLoop

The ProductLoop provenance bridge validates canonical timestamps, receipt hashes, sequence order, and per-run continuity. Stable identities are derived from run and sequence position so divergent histories collide rather than silently fork.

ProductLoop receipts prove canonical hash continuity, not author identity. ProductLoop and Qarinah remain separate stores without a cross-ledger transaction.

### 12.4 Dependency direction

The integrations preserve clear ownership:

```text
Cockroach SourceRecord -> Qarinah evidence
ProductLoop RuntimeEvent -> Qarinah provenance
Maqam guarded call -> Qarinah query or approved append
Qarinah verified event chain -> OKF / graph / index / Markdown / context pack
```

No adjacent package becomes a hidden dependency of the Qarinah runtime.

## 13. Security model

### 13.1 Threats considered

The current implementation is designed to detect or reduce:

- silent capture enabled by a committed configuration;
- policy drift after trust was granted;
- event alteration, deletion, truncation, duplication, or reordering;
- rollback to an older valid log prefix;
- event-ID replay with different content;
- stale or malicious derived indexes;
- path escape through symbolic links or junctions;
- overwrite of unowned OKF output;
- oversized, deeply nested, accessor-bearing, prototype-bearing, or non-JSON input;
- prompt injection embedded in retrieved content;
- unbounded context disclosure;
- forged Maqam dispatch context;
- divergent ProductLoop sequence history; and
- accidental retention of unreviewed content in metadata mode.

### 13.2 Controls

The implementation uses:

- strict versioned contracts;
- canonical serialization;
- bounded strings, collections, nesting, events, logs, scans, and output packs;
- root-bound real paths;
- linked-path and multiple-link rejection;
- renewable append locks;
- flush-before-checkpoint append order;
- atomic derived replacements;
- hash-chain verification;
- machine-local rollback checkpoints;
- deterministic rebuilds;
- stale-view refusal;
- bounded best-effort redaction;
- explicit evidence coverage;
- separate read and write capabilities; and
- treatment of all retrieved content as untrusted data.

### 13.3 Residual risk

The current implementation has known limits:

- machine trust is local state and is not backed by a hardware key or external transparency log;
- the lock is not a distributed coordination protocol;
- pattern redaction cannot recognize every secret;
- lexical and graph retrieval do not prove semantic equivalence;
- retention expiry filters disclosure but does not rewrite append-only history;
- lifecycle hooks are observability surfaces, not complete host enforcement;
- adjacent evidence ledgers do not share an atomic transaction; and
- a privileged operating-system supervisor requires a separate implementation and threat model.

These limits are part of the release boundary, not hidden exceptions.

## 14. Evaluation methodology

Qarinah commits deterministic evaluators and machine-readable expected results to the repository. The public headline result comes from the software-task context benchmark, while the long-document and retrieval-regression fixtures test complementary behavior.

### 14.1 Portable token estimator

All reported estimated tokens in this paper use:

```text
estimatedTokens = ceil(characters / 4)
```

This estimator is portable and reproducible. It is not a provider tokenizer and does not represent an OpenAI, Anthropic, Codex, or Claude usage receipt.

### 14.2 Software-task context benchmark

The evaluator creates 240 retained project-history records and runs six scenarios:

1. React accessibility editing;
2. a database schema migration;
3. a repository-wide TypeScript refactor;
4. web research carried into implementation;
5. production regression debugging; and
6. governed release preparation.

Both compared paths receive the same current-task source snippets. The baseline additionally receives the complete retained project history. The Qarinah path receives a cited pack compiled for the query.

The evaluator asserts:

- every required decision ranks in the top five;
- every returned query has direct evidence coverage;
- no model-written summary item is selected;
- token arithmetic matches the committed character counts; and
- the machine-readable result remains unchanged unless the evidence is deliberately updated.

### 14.3 Cross-session continuation benchmark

The continuation evaluator creates 42 records across two logical sessions. Session A contributes an extracted task prompt, a verified failing-test outcome, and a completed-turn diagnosis. An explicitly inferred handoff summary links to all three source event IDs and hashes. Thirty-six unrelated records provide retrieval noise. After the persisted read model is deliberately made stale, Session B performs a zero-write query against the authoritative ledger.

The evaluator serializes two outputs against the same complete 9,489-token history:

- a complete cited audit pack containing the summary, all three source identities and hashes, and one selected raw source; and
- a model-facing capsule containing the summary identity and complete-pack manifest pointer.

This separation tests whether the model-facing handoff can stay small without deleting the independently inspectable evidence surface. The capsule is not counted as if it embedded the complete audit pack.

### 14.4 Real-repository retrieval study

The development study follows the real GitHub issue-resolution framing introduced by SWE-bench [1]. It pins the official `princeton-nlp/SWE-bench_Lite` test artifact at Git revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2` [2]. The pinned test Parquet has SHA-256 `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`, contains 300 unique tasks, and exposes 12 exact repository identifiers. The official product page describes Lite as 300 tasks from 11 repositories; the committed repository manifest preserves and explains that upstream prose/artifact discrepancy rather than silently normalizing it.

Within each repository, tasks are ordered by creation time. The earliest 20% (60 tasks total) build prior memory; the remaining 240 tasks are queried only against evidence available strictly before their timestamp. Static evaluation freezes the warm-up memory. Online/prequential evaluation admits an earlier held-out task only after its query has been scored. This prevents future-task evidence from entering an earlier query.

Compared retrieval conditions include admitted BM25, the earlier balanced Qarinah profile, Qarinah v2, Qarinah v2 without graph expansion, and a structural oracle. BM25 is treated as a strong lexical baseline following the Okapi family [3]. The temporal, update, and abstention categories are informed by LongMemEval [4], extended here with repository isolation, evidence identity, supersession, retention, and disclosure authority. Historical v0.2 and v0.3 artifacts retain their original score provenance; development v0.4 separately recomputes current `evidence-sufficiency-v2` decisions and records per-file implementation hashes.

Development v0.5 then performs a zero-tolerance differential reproduction against the complete immutable v0.4 `expected` object. The evaluator binds the current production source, committed corpus, raw artifact identity, authorization receipt, and result lifecycle before it permits retrieval. A separate frozen comparison v2 evaluates evidence-complete prefixes for Qarinah and admission-filtered BM25 on six development cases, with four safety cases and raw BM25 retained as a safety-only negative control.

This phase makes zero provider model calls and does not apply generated patches. Labels are a deterministic graded structural oracle based on pre-task file, symbol, API, test, and error overlap. They are not independent human relevance judgments. Results are development evidence because v2 and the conservative evidence gate were designed after v0.1 was inspected. The next protocol freezes 40 paired tasks from the 500-instance, human-validated SWE-bench Verified corpus [5], excluding Lite development instances before any final outcome is observed.

### 14.5 Long-document benchmark

The evaluator constructs a deterministic 384-section synthetic operations handbook with eight answer-bearing passages distributed across the beginning, middle, and end. It runs:

- eight exact queries;
- eight typo-tolerant queries; and
- four unsupported controls.

Every positive query receives the same fixed 600-token ceiling. The evaluator does not tune the budget per question.

### 14.6 Multi-file project and projection-integrity benchmark

The scale evaluator creates independent 40-, 50-, and 100-file workspaces, for 190 generated files in total. Nested JavaScript modules and Markdown runbooks each contain a resolved relationship and a unique answer-bearing memory record. Repeated distractor text makes exact path and symbol identity important. Every file is queried twice: once by its exact evidence label and once by a misspelled label, producing 380 positive cases.

The same run verifies SQLite FTS retrieval, persisted/in-memory rank parity, graph file nodes and resolved edges, generated `CONTEXT.md`, a bounded project-structure excerpt, graph-only linked evidence, supersession exclusion, contradiction visibility, stale graph and Markdown repair, and nine unsupported direct-coverage controls. Exact and fuzzy retrieval are measured separately from evidence sufficiency: a relevant typo match can rank first while the stricter gate abstains from declaring direct support. The fixture is deterministic and synthetic so every answer and relationship is auditable.

### 14.7 Retrieval-regression fixture

A separate 54-record fixture checks:

- exact retrieval;
- typo tolerance;
- one-hop graph evidence;
- explicit conflict recall;
- supersession precision;
- pack-size regression; and
- local query timing.

This smaller fixture is a regression suite, not the public context-volume headline.

### 14.8 Runtime benchmark

The repository also benchmarks deterministic local append, replay, build, and query operations over a fixed retained workspace. These measurements identify implementation regressions. They are not presented as end-to-end model speed or "coding faster" results because model latency, tool execution, user review, and task difficulty are outside that measurement.

### 14.9 Real Git-worktree continuity evaluation

The 0.4.0 evaluator creates a temporary Git repository with three actual linked worktrees. Two worktrees are initialized independently and the third is deliberately left uninitialized. It records bounded decision, tool, outcome, conflict, and session events; advances the repository through initial, unchanged, delta, and rebuilt compaction states; and verifies isolation, discovery, retrieval, receipt hashes, and source-body exclusion.

Sixteen assertions are defined before the result is accepted. The evaluator writes a deterministic JSON receipt and the release gate replays the experiment, compares the complete result, and verifies its SHA-256 digest. This is an implementation acceptance test over a real local Git topology. It is not a measure of generated-code correctness or a comparison against another product.

### 14.10 Deep-memory product acceptance

The deep-memory evaluator creates a temporary content-authorized Qarinah workspace with two TypeScript files. One large repeated source block makes content-defined chunk reuse observable without depending on a private repository. The evaluator records one decision and one completed outcome, runs an initial cycle and a no-change cycle, builds and queries the symbol graph, consolidates cited facts, creates an encrypted archive snapshot, changes one source file, creates a second snapshot, verifies it, restores it to a new directory, and runs the changed-source cycle.

Twelve assertions cover initial change capture, no-change suppression, changed-file detection, complete eligible-file indexing, function-symbol retrieval, cross-file reference resolution, cited-fact integrity, decision/outcome retrieval, cross-snapshot object reuse, archive verification, exact restored file membership, and byte-for-byte reconstruction. The result is deterministic and release-gated. It is a compact end-to-end acceptance fixture, not a storage-efficiency benchmark, a language-coverage benchmark, or independent validation.

### 14.11 Proof-carrying task-context acceptance

The 0.6.0-alpha.1 evaluator creates a deterministic 12-file repository with C, C++, C#, Go, Java, JavaScript, Kotlin, Python, Rust, and TypeScript sources. Each task has a named target file and symbol, a current decision, and a deliberately superseded decision. The evaluator compiles the same packet twice, checks the manifest is identical, mutates a packet copy, and confirms validation rejects it.

Each of the 12 scenarios is accepted only when its expected file appears in the top five, its expected symbol is attached to a selected top-five file, current evidence is retained, stale evidence is explicitly excluded, all citations resolve, the complete artifact stays within 4,096 portable estimated tokens, and the manifest reproduces exactly. This is generated multi-language acceptance evidence for the packet contract. It is not an independent benchmark, a provider-token receipt, a semantic code-understanding score, or a comparison with another product.

## 15. Results

### 15.1 Software-task context volume

| Scenario | Full-history baseline | Qarinah context | Reduction |
| --- | ---: | ---: | ---: |
| React accessibility edit | 73,765 estimated tokens | 1,025 estimated tokens | 98.61% |
| Database schema migration | 73,703 | 968 | 98.69% |
| Repository-wide TypeScript refactor | 73,628 | 895 | 98.78% |
| Web research to implementation | 73,693 | 963 | 98.69% |
| Production regression debugging | 73,697 | 954 | 98.71% |
| Governed release preparation | 73,627 | 877 | 98.81% |
| **Weighted total** | **442,113** | **5,682** | **98.71%** |

The weighted result is:

```text
1 - (5,682 / 442,113) = 0.987148...
```

Rounded to two decimal places, Qarinah uses **98.71% less estimated input context** than the named full-history baseline. The equivalent compression ratio is:

```text
442,113 / 5,682 = 77.81:1
```

The benchmark sends 436,431 fewer estimated input-context tokens. Under a flat price of $1 per million uncached input tokens, the compared input-context slice moves from $0.4421 to $0.0057, which is **98.71% lower input-context cost at the same token rate**.

This cost translation is arithmetic over the measured context slice. It excludes output tokens, cached-input discounts, tool calls, retrieval work, fixed provider fees, and any provider-specific billing rules. It is not a claim of 98.71% lower total application cost.

### 15.2 Cross-session continuation

| Measurement | Complete audit pack | Model-facing capsule |
| --- | ---: | ---: |
| Full-history baseline | 9,489 estimated tokens | 9,489 estimated tokens |
| Qarinah output | 1,039 estimated tokens | 119 estimated tokens |
| Exact estimated reduction | 89.0505% | 98.7459% |
| Rounded release figure | **89.05%** | **98.75%** |
| Evidence retained | All three source IDs/hashes plus selected raw source | Summary event ID/hash plus audit-pack manifest pointer |

The fresh session retrieves the inferred handoff summary at rank 3. All three summary-source identities and hashes remain present in the complete pack, the capsule points to that exact pack manifest, the zero-write query does not mutate persisted derived state, and the final integrity check passes. The two percentages answer different questions: the capsule measures minimal model-facing continuation text, whereas the audit pack measures the complete evidence-bearing artifact.

### 15.3 Real-repository retrieval development results

| Measurement | Static | Online/prequential |
| --- | ---: | ---: |
| Total held-out queries | 240 | 240 |
| Structurally scorable queries | 191 | 209 |
| Qarinah v2 Recall@10 | 0.7626 | 0.5383 |
| Qarinah v2 MRR | 0.7032 | 0.6956 |
| Earlier balanced-profile MRR | 0.6443 | 0.6007 |
| Qarinah v2 direct-evidence acceptance | 10 / 240 | 15 / 240 |
| Observed direct false accepts under structural oracle | 0 / 49 | 0 / 31 |
| Acceptance coverage | 4.17% | 6.25% |

Qarinah v2 exactly matches admitted BM25 ranking in both settings. Its contribution in this experiment is therefore not a new ranking algorithm; it is lexical ranking inside temporal, repository, retention, supersession, and authority admission boundaries. Removing graph expansion produces identical ranking metrics, so graph retrieval adds no measured ranking value in this corpus. The graph remains useful for provenance, conflict, supersession, and relationship representation.

For the online paired comparison with the earlier balanced profile, the MRR difference is 0.0949 with a repository-clustered 95% bootstrap interval of [0.0572, 0.1115]. The Recall@10 difference is 0.0649 with interval [-0.0150, 0.1025], so improved total relevant-record recall is not established. The production-bound v0.4 gate observes zero direct false accepts under the development structural oracle, but exact 95% upper bounds remain 7.25% static and 11.22% online, and the gate abstains on most queries. Direct-precision intervals are 69.15%-100% static and 78.20%-100% online. These results support a small high-confidence subset, not a claim of perfect evidence detection.

The current-product v0.5 differential reproduction exactly matches the complete v0.4 projected result on this inspected corpus: 3,110,007 canonical bytes with SHA-256 `12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c`. It adds no new outcome metrics and does not establish global API equivalence. The context-efficiency comparison v2 has no six-case primary statistic because both primary methods miss one required TypeScript support event by rank 32. On the five jointly eligible cases, the methods are token-identical at 630, 680, 574, 1,191, and 1,202 estimated tokens. That 4,277-token subtotal is diagnostic only and cannot select a winner.

### 15.4 Long-document retrieval

| Measurement | Result |
| --- | ---: |
| Source size | 139,001 characters |
| Portable token estimate | 34,751 |
| Positive queries | 16 |
| Answer-bearing passage ranked first | 16 / 16 |
| Answers preserved in cited excerpts | 16 / 16 |
| Average Qarinah pack | 534 estimated tokens |
| Largest Qarinah pack | 556 estimated tokens |
| Worst-case estimated context reduction | 98.4% |
| Unsupported controls rejected | 4 / 4 |
| Model-written summary items | 0 |

The worst supported case retains **98.4% estimated context reduction** under the fixture's portable `ceil(characters / 4)` estimator.

This result shows targeted retrieval from a large pre-segmented source under a fixed context ceiling. It does not demonstrate native PDF ingestion, whole-book summarization, or universal question answering.

### 15.5 Multi-file project context and projection integrity

| Workspace | Positive queries at rank 1 | Exact direct accepts | Typo matches with conservative abstention | Unsupported controls rejected | Largest pack | Worst-case estimated reduction |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 40 files | 80 / 80 | 40 / 40 | 40 / 40 | 3 / 3 | 1,420 estimated tokens | 93.4803% |
| 50 files | 100 / 100 | 50 / 50 | 50 / 50 | 3 / 3 | 1,421 estimated tokens | 94.6948% |
| 100 files | 200 / 200 | 100 / 100 | 100 / 100 | 3 / 3 | 1,478 estimated tokens | 97.1521% |
| **Total** | **380 / 380** | **190 / 190** | **190 / 190** | **9 / 9** | — | — |

Every positive query returns the expected cited record at rank 1 and preserves the answer. Every exact query uses the persisted SQLite candidate path. Every typo query uses fuzzy retrieval, finds the same correct evidence, and is labeled partial rather than direct. The gate therefore abstains without turning a conservative sufficiency decision into a retrieval failure. The unsupported controls return `CONTEXT_COVERAGE_TOO_LOW` as intended.

At all three scales, SQLite event count and head match the verified ledger; graph and Markdown projections contain the expected file relationships; graph-only evidence remains recoverable; superseded evidence is excluded; contradictions remain visible; and deliberately stale projections are detected and rebuilt. These percentages compare the complete generated ledger with the largest bounded pack using `ceil(characters / 4)`. They are not provider usage receipts or measurements of generated-patch success.

### 15.6 Retrieval regression

| Measurement | Result |
| --- | ---: |
| Recall@5 | 1.0 |
| Mean reciprocal rank | 1.0 |
| Conflict recall | 1.0 |
| Supersession precision | 1.0 |
| Average emitted pack | 2,237 characters |
| Raw event-log replay per query | 44,364 characters |
| Character reduction | 94.96% |

All four fixed targets remain retrievable. The selected pack is larger than the earlier context-pack format because v2 includes explicit evidence-coverage metadata.

### 15.7 Visible-memory and worktree continuity result

| Measurement | Result |
| --- | ---: |
| Actual Git worktrees | 3 |
| Independently initialized worktrees | 2 |
| Deliberately uninitialized worktrees | 1 |
| Acceptance scenarios passed | 16 / 16 |
| Incremental compaction states verified | 4 / 4 |
| Receipt bodies retained | 0 |
| Workspace identity collisions | 0 |
| Result artifact SHA-256 | `0a610a0c2f6503d4b3c53c2e8bfc187c2159c70906e1bc7e828693cc34b6be9d` |

The evaluation verifies that sibling worktrees remain distinct writable memories while the repository-level view can discover and compare initialized siblings. A session receipt binds the selected context, citations, workspace identity, repository state, source head, and output digest without embedding the original session body. Incremental capture distinguishes no-change checkpoints from deltas and full rebuilds, preventing an unchanged turn from being represented as new project evidence.

### 15.8 Deep-memory product acceptance result

| Measurement | Result |
| --- | ---: |
| Acceptance scenarios passed | 12 / 12 |
| Source files in the second snapshot | 2 |
| Second-snapshot source bytes verified and restored exactly | 390,226 |
| First-snapshot chunks | 3 |
| Second-snapshot chunks | 3 |
| Second-snapshot chunks reused | 2 |
| Symbols indexed | 4 |
| Cross-file references resolved | 3 |
| Cited facts retained | 2 |
| Files restored byte for byte | 2 / 2 |
| Result artifact SHA-256 | `a9c6a3e131678bdb2006f731d5e2750d29d5518d08f8b36182f27afdfd3cbc50` |

The observed chunk reuse shows that a bounded source edit can reuse unchanged encrypted content objects inside the same vault. It is not a universal deduplication or compression percentage. The exact-byte assertion establishes reconstruction for this fixture; it does not extend capture to ignored files, links, common secret filenames, unsupported binary content, or data that the operator did not authorize.

### 15.9 Task-context acceptance result

| Measurement | Result |
| --- | ---: |
| Task packets accepted | 12 / 12 |
| Registered language families exercised | 10 |
| Expected file hit@5 | 1.0 |
| Expected symbol hit within selected top-five files | 1.0 |
| Current-evidence recall | 1.0 |
| Stale-evidence rejection | 1.0 |
| Citation validity | 1.0 |
| Complete-packet budget conformance | 1.0 |
| Deterministic manifest reproduction | 1.0 |
| Mutated manifest rejected | true |
| Maximum portable estimated tokens | 4,096 |
| Result artifact SHA-256 | `001c10e3d01e056346b786d2eddfd43b88c4c2a6e1106984380d73f092a40f48` |

All 12 predefined packets satisfy the combined evidence, code-location, lifecycle, budget, and reproducibility contract. The result is more operationally meaningful than a compression percentage alone because it tests whether a bounded packet contains the expected code and current decision while refusing stale evidence. Its scope remains the generated repository and predefined expectations.

## 16. Interpretation

The results support nine conclusions about the tested implementation.

First, accumulated project history can be separated from current-task source material and replaced with a much smaller cited pack. Second, the selected evidence can retain the required decision targets without relying on model-written summaries. Third, a minimal model-facing continuation capsule can remain cryptographically linked to a larger inspectable audit pack. Fourth, unsupported questions can fail closed when the caller requires direct coverage, although the conservative gate's low coverage and wide confidence intervals matter. Fifth, strong lexical ranking remains competitive; Qarinah's measured contribution in the real-repository study comes from admission boundaries and evidence semantics rather than a novel ranker. Sixth, exact and typo-tolerant retrieval can preserve answer-bearing evidence across 40-, 50-, and 100-file workspaces while SQLite, graph, Markdown, conflict, supersession, and repair invariants remain intact. Seventh, citations, conflict handling, and coverage metadata can fit inside a strict output budget rather than being added after selection. Eighth, exact selected-source recovery, code-symbol retrieval, cited consolidation, and incremental refresh can coexist in one verified local workflow without treating the compact model pack as the lossless archive. Ninth, the memory pack, current facts, selected code locations, exclusions, and manifests can be joined into one bounded artifact that another host can verify before use.

The later audits add two narrower conclusions. The current product can reproduce the complete v0.4 development projection exactly under the bound v0.5 protocol. The stricter v2 comparison also demonstrates why missing evidence must cancel a superlative: five token-identical eligible cases do not repair one jointly ineligible case.

The results do **not** establish:

- 98.71% fewer tokens for every repository or task;
- 98.71% lower total provider cost;
- faster coding by a particular percentage;
- improved answer quality for every model;
- improved official SWE-bench patch-resolution rate;
- provider-token savings for the frozen 40-task sample;
- complete semantic recall; or
- superiority over every memory or retrieval system.

Those questions require provider-reported token usage, task-success evaluation, latency measurement, quality review, ablation studies, and a broader held-out corpus.

The appropriate public statement is therefore precise:

> Qarinah's committed deep-memory evaluator passes 12 of 12 exact recovery, incremental refresh, symbol/reference, and cited-fact scenarios, including byte-for-byte restoration of 390,226 selected source bytes. Separately, the committed six-task repeated-context fixture reduces 442,113 estimated tokens to a 5,682-token cited pack (98.7148%) under its stated portable estimator and fixture boundary.

For the 0.6 alpha task-context surface, the appropriate statement is:

> All 12 predefined proof-context scenarios produce a bounded, reproducible packet containing the expected file, symbol, current evidence, valid citations, and explicit stale-evidence exclusion. This is deterministic generated-repository acceptance evidence, not an independent or universal accuracy result.

## 17. Reproducibility

Use a maintained Node.js 22, 24, or 26 release and a reviewed source checkout:

```sh
npm ci
npm run check
```

Run the individual evaluations:

```sh
npm run evaluate:software-tasks
npm run evaluate:continuation
npm run evaluate:long-document
npm run evaluate:multifile-context
npm run evaluate:proof-context
npm run check:deep-memory
npm run evaluate:context
npm run evaluate:research-retrieval:v0.4
npm run evaluate:research-sufficiency:v0.3
npm run check:research-retrieval:v0.5:result
npm run check:context-efficiency-comparison:v2
npm run check:benchmark-release
npm run benchmark
```

The relevant evidence is committed at:

- [`bench/fixtures/software-task-scenarios.mjs`](../bench/fixtures/software-task-scenarios.mjs);
- [`bench/results/software-task-context-0.1.0.json`](../bench/results/software-task-context-0.1.0.json);
- [`bench/results/continuation-context-0.1.6.json`](../bench/results/continuation-context-0.1.6.json);
- [`bench/results/long-document-context-0.1.0.json`](../bench/results/long-document-context-0.1.0.json);
- [`bench/results/multifile-context-0.1.6.json`](../bench/results/multifile-context-0.1.6.json);
- [`bench/results/context-evaluation-0.1.0.json`](../bench/results/context-evaluation-0.1.0.json);
- [`bench/results/research-retrieval-development-v0.2.json`](../bench/results/research-retrieval-development-v0.2.json);
- [`bench/results/research-sufficiency-development-v0.3.json`](../bench/results/research-sufficiency-development-v0.3.json);
- [`bench/results/research-retrieval-development-v0.4.json`](../bench/results/research-retrieval-development-v0.4.json);
- [`bench/results/research-retrieval-development-v0.5.json`](../bench/results/research-retrieval-development-v0.5.json);
- [`bench/results/context-efficiency-comparison-0.1.6-v2.json`](../bench/results/context-efficiency-comparison-0.1.6-v2.json);
- [`bench/results/benchmark-release-0.1.6.json`](../bench/results/benchmark-release-0.1.6.json);
- [`bench/results/deep-memory-platform-v0.6.0-alpha.1.json`](../bench/results/deep-memory-platform-v0.6.0-alpha.1.json);
- [`bench/results/public-project-memory-v0.6.0-alpha.1.json`](../bench/results/public-project-memory-v0.6.0-alpha.1.json);
- [`bench/results/proof-context-0.6.0-alpha.1.json`](../bench/results/proof-context-0.6.0-alpha.1.json);
- [`scripts/evaluate-software-tasks.mjs`](../scripts/evaluate-software-tasks.mjs);
- [`scripts/evaluate-long-document.mjs`](../scripts/evaluate-long-document.mjs);
- [`scripts/evaluate-multifile-context.mjs`](../scripts/evaluate-multifile-context.mjs);
- [`scripts/evaluate-context.mjs`](../scripts/evaluate-context.mjs); and
- [`scripts/evaluate-deep-memory-platform.mjs`](../scripts/evaluate-deep-memory-platform.mjs);
- [`scripts/evaluate-public-project-memory.mjs`](../scripts/evaluate-public-project-memory.mjs);
- [`scripts/evaluate-proof-context.mjs`](../scripts/evaluate-proof-context.mjs);
- [`scripts/verify-proof-context-evidence.mjs`](../scripts/verify-proof-context-evidence.mjs);
- [`scripts/verify-benchmark-evidence.mjs`](../scripts/verify-benchmark-evidence.mjs);
- [`scripts/verify-research-retrieval-v0.5-result.mjs`](../scripts/verify-research-retrieval-v0.5-result.mjs);
- [`scripts/verify-context-efficiency-comparison-v2-result.mjs`](../scripts/verify-context-efficiency-comparison-v2-result.mjs); and
- [`scripts/verify-benchmark-release-0.1.6.mjs`](../scripts/verify-benchmark-release-0.1.6.mjs).

The evidence verifier recomputes public percentages and rejects unsupported headline claims. Documentation checks verify local links, architecture-source integrity, and encoding. The complete package check also rebuilds both host plugins, exercises MCP transport, runs the test and type matrices, executes every benchmark, and performs a dry-run package build.

To verify the storage model in a disposable initialized workspace:

1. record a bounded event;
2. run `qarinah doctor`;
3. build the derived views;
4. delete the graph, index, and Markdown projections;
5. rebuild them; and
6. compare the results against the same verified event head.

The projections should be reproducible while the JSONL ledger remains authoritative.

## 18. Release status and eligibility

No standards body, academic venue, or regulator grants general permission to publish a software white paper. A project is ready to publish one when the paper accurately identifies its category, makes traceable claims, provides enough implementation detail to be useful, and gives readers a way to reproduce or challenge the evidence.

Qarinah meets that threshold for an **implementation-backed technical white paper** because:

- the described system exists in working source;
- the architecture and contracts are versioned;
- the benchmark fixtures and expected outputs are committed;
- the headline arithmetic is machine-checked;
- security boundaries and residual risks are documented;
- reproduction commands are public;
- the project has an Apache-2.0 license; and
- the paper distinguishes measured results from open research questions.

The paper must be represented as an implementation-backed technical white paper, not as independent third-party validation, a provider invoice, an official SWE-bench patch-resolution result, or a universal performance guarantee. Distribution should identify the exact implementation and paper versions.

Recommended publication metadata:

- **Document type:** Technical white paper
- **Title:** *Qarinah: Proof-Carrying Project Memory*
- **Subtitle:** *Multi-language developer memory with inspectable context receipts*
- **Author:** Ajnas N B
- **Implementation version:** `0.6.0-alpha.1`
- **Paper version:** 1.8
- **Version DOI:** unassigned until v1.8 is separately deposited
- **Concept DOI:** `10.5281/zenodo.21547684`
- **License:** Apache-2.0
- **Canonical source:** this repository at one reviewed commit
- **Evidence:** the machine-readable files and commands listed in Section 17
- **Evidence status:** implementation-backed; independent validation is not claimed

The release tag, paper, package, generated plugins, benchmark results, and architecture image should all point to the same reviewed commit. If code or evidence changes, the paper version should advance rather than silently changing an archived release.

## 19. Open-source model and stewardship

Qarinah is licensed under Apache-2.0. That permits broad use, modification, redistribution, and commercial use under the license terms while preserving copyright and notice obligations. The open license makes the implementation auditable and allows host integrations to be inspected before they receive access to project events.

Open source does not by itself protect a product idea from commercial competition. Long-term differentiation must come from implementation quality, trust, interoperability, distribution, community, and the discipline of publishing evidence that users can reproduce.

Security vulnerabilities should be reported privately according to the repository security policy. Behavioral changes to capture, disclosure, trust, event contracts, or governance boundaries require explicit review and migration notes.

## 20. Roadmap and research agenda

The post-0.6-alpha research and hardening roadmap includes:

- at least 100 held-out positive and negative retrieval queries;
- paraphrase, typo, conflict, supersession, time, authority, and unsupported-query coverage;
- provider-reported Codex and Claude token measurements under matched models and tools;
- task-success, unsupported-answer, latency, and cost review;
- ablations for lexical, trigram, graph, diversity, conflict, and coverage components;
- signature policies and optional independent anchoring for the current deterministic proof-context manifest;
- signed or independently anchored ledger checkpoints;
- explicit deletion and retention workflows;
- stronger multi-host coordination;
- native JetBrains and additional editor packages beyond the current standard-LSP template;
- independently reproduced cross-tool worktree-continuity results;
- a managed multi-device team service with identity, administration, recovery, and an explicit separate threat model beyond the current self-hosted opaque sync;
- independent threat-model review; and
- a separately designed privileged supervisor if the wider product evolves toward cross-platform operating-system mediation.

Qarinah itself should remain the evidence-linked memory and context layer. A future operating-system control plane may use its record, but privileged process, filesystem, network, identity, secret, and device controls require separate platform-specific enforcement.

## 21. Conclusion

Coding agents need continuity, but continuity should not require replaying everything or trusting an opaque summary.

Qarinah keeps durable evidence and task-time context as two different artifacts. The append-only ledger preserves the permitted project record. Deterministic projections make that record searchable and inspectable. The context compiler selects a small cited working set under an explicit budget. Conflicts, supersession, authority, retention, and evidence coverage remain visible rather than being compressed away.

Qarinah 0.6.0-alpha.1 demonstrates this design end to end across local storage, encrypted exact-source snapshots, SQLite retrieval, evidence and multi-language symbol graphs, deterministic local vector ranking, a bounded language server, cited fact consolidation, crash-recoverable automatic cycles, Markdown projections, project structure, Codex and Claude Code adapters, MCP diagnostics, six project-scoped host setups, a VS Code/Cursor panel with session replay and task proof, a JetBrains LSP4IJ template, worktree discovery, incremental compaction, lifecycle-bound session receipts, proof-carrying task context, self-hosted opaque sync, optional Maqam composition, crawler evidence, workflow provenance, and portable OKF export. Its 12/12 proof-context result verifies the combined task packet contract; the 10/10 public-checkout result verifies the product on public source; the 12/12 deep-memory result establishes the combined recovery-and-retrieval path; and the 16/16 real-worktree result establishes the operational continuity contract. Historical retrieval experiments remain scoped evidence rather than product-ranking claims.

The central promise is intentionally simple:

> Your project remembers. Every agent gets the proof.

## 22. References

1. Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, and Karthik R. Narasimhan. ["SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"](https://openreview.net/forum?id=VTF8yNQM66) *The Twelfth International Conference on Learning Representations*, 2024.
2. Princeton NLP. [`princeton-nlp/SWE-bench_Lite`](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite), test artifact pinned at revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`; see also the [official SWE-bench Lite page](https://www.swebench.com/lite.html).
3. Stephen E. Robertson, Steve Walker, Susan Jones, Micheline Hancock-Beaulieu, and Mike Gatford. ["Okapi at TREC-3."](https://doi.org/10.6028/NIST.SP.500-225.routing-city) *Proceedings of the Third Text REtrieval Conference*, NIST Special Publication 500-225, pages 109-126, 1994.
4. Di Wu, Hongwei Wang, Wenhao Yu, Yuwei Zhang, Kai-Wei Chang, and Dong Yu. ["LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory."](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf) *International Conference on Learning Representations*, 2025.
5. SWE-bench team. ["SWE-bench Verified."](https://www.swebench.com/verified.html) Human-validated subset of 500 SWE-bench instances, accessed August 2026.

## Acknowledgements

The author gratefully acknowledges Shahin Ahammed, Qarinah's non-technical cofounder, for contributions to product direction, use-case definition, positioning, and review of the manuscript.

## Appendix A. Claim-to-evidence matrix

| Public claim | Evidence | Qualification |
| --- | --- | --- |
| 10 / 10 public-checkout memory scenarios | `bench/results/public-project-memory-v0.6.0-alpha.1.json` and deterministic evaluator | Current public repository, supported-source indexing, receipt/recovery/editor/sync acceptance; not independent validation or a universal accuracy benchmark |
| 12 / 12 deep-memory product scenarios | `bench/results/deep-memory-platform-v0.6.0-alpha.1.json` and deterministic evaluator | Local exact-recovery, incremental-refresh, symbol/reference, and cited-fact acceptance; not a cross-product benchmark |
| 12 / 12 proof-carrying task-context scenarios | `bench/results/proof-context-0.6.0-alpha.1.json` and deterministic evaluator | Generated ten-language repository; expected code and current evidence selected, stale evidence excluded, complete packet bounded, deterministic manifest reproduced; not independent validation |
| 390,226 selected source bytes restored exactly | Same deep-memory fixture | Byte equality for the two-file fixture; not universal archive compression or passive capture |
| 98.71% less estimated context | Software-task result: 442,113 to 5,682 estimated tokens | Compared with the named full-history baseline using `ceil(characters / 4)` |
| 98.75% continuation-capsule reduction | Continuation result: 9,489 to 119 estimated tokens | Model-facing pointer to the complete pack, not the complete evidence payload |
| 89.05% complete continuation-pack reduction | Continuation result: 9,489 to 1,039 estimated tokens | Complete cited audit surface; not a regression against the smaller capsule |
| 77.81:1 context compression | Same committed software-task result | Ratio of total estimated input-context tokens |
| 98.71% lower input-context cost at the same token rate | Arithmetic over the same measured context slice | Not total provider or application cost |
| Every required target ranked in the top five | Six committed software-task results | Applies to the committed scenarios |
| Direct evidence coverage for every software-task query | Context-pack v2 output assertions | Lexical retained-evidence coverage, not answer correctness |
| No model-written summary items | Software-task and long-document assertions | Does not prohibit retaining a summary as a separately labeled event |
| At least 98.4% estimated reduction on the long document | Largest fixed-budget pack compared with the complete synthetic source | Pre-segmented deterministic source; not native PDF ingestion |
| Unsupported controls failed closed | Four long-document controls with direct coverage required | Callers permitting partial coverage choose a weaker policy |
| 380 / 380 multi-file positive queries ranked first with answers preserved | Deterministic 40-, 50-, and 100-file workspaces | Synthetic local retrieval and projection-integrity regression; not provider task success |
| 9 / 9 multi-file unsupported controls rejected | Direct-coverage controls across all three workspaces | Correct abstention; does not mean supported long-document or project retrieval failed |
| 93.4803%-97.1521% multi-file worst-case estimated reduction | Largest bounded pack versus each generated ledger | Portable character estimator, not provider billing |
| Qarinah v2 matches admitted BM25 | SWE-bench Lite development retrieval result | Ranking equality; Qarinah retains temporal, repository, retention, supersession, and authority admission |
| Zero observed direct false accepts at the production-bound v0.4 gate | 0/49 static and 0/31 online under the structural development oracle | Low 4.17%-6.25% coverage, wide exact intervals, and no independent human relevance labels |
| Current-product v0.5 exact projected reproduction | Complete `expected` object equals v0.4 at 3,110,007 canonical bytes and SHA-256 `12f00c2e...b3d0c` | Same inspected development corpus; non-confirmatory; not global API equivalence |
| No primary result in context-efficiency comparison v2 | Both primary methods eligible on 5/6 cases and token-identical on those five | Missing TypeScript support event cancels the six-case statistic and every winner claim |
| Local-first and no Qarinah API key | Runtime architecture and package dependencies | AI hosts and external sources may still require their own access |
| Deterministic rebuildable graph, index, Markdown, and OKF | Source implementation and test suite | Reproducibility depends on the same verified event head and build inputs |
| 16 / 16 real-worktree acceptance scenarios | `bench/results/worktree-continuity-v0.4.0.json` and its deterministic evaluator | Local implementation acceptance; not generated-code quality or cross-product superiority |
| Exact per-session context receipts | Receipt schema, source/output hashes, and real-worktree fixture | Binds selected context and citations; does not retain hidden reasoning or full transcript bodies |
| Six project-scoped host setups | Installer plans and reversible manifest tests for Codex, Claude Code, Cursor, Kimi, Antigravity, and Freebuff | Configuration compatibility, not identical lifecycle coverage in every host |

## Appendix B. Artifact map

| Topic | Canonical project document |
| --- | --- |
| System architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Benchmark methodology and results | [BENCHMARKS.md](BENCHMARKS.md) |
| Security model | [SECURITY.md](SECURITY.md) |
| Host integrations | [HOST-INTEGRATIONS.md](HOST-INTEGRATIONS.md) |
| Real-worktree continuity result | [`worktree-continuity-v0.4.0.json`](../bench/results/worktree-continuity-v0.4.0.json) |
| Deep-memory product result | [`deep-memory-platform-v0.6.0-alpha.1.json`](../bench/results/deep-memory-platform-v0.6.0-alpha.1.json) |
| Public-checkout memory result | [`public-project-memory-v0.6.0-alpha.1.json`](../bench/results/public-project-memory-v0.6.0-alpha.1.json) |
| Proof-carrying task-context result | [`proof-context-0.6.0-alpha.1.json`](../bench/results/proof-context-0.6.0-alpha.1.json) |
| Proof-context contract | [PROOF-CARRYING-CONTEXT.md](PROOF-CARRYING-CONTEXT.md) |
| Lossless content archive | [CONTENT-ARCHIVE.md](CONTENT-ARCHIVE.md) |
| Symbol graph and language server | [SYMBOL-GRAPH.md](SYMBOL-GRAPH.md) |
| Automatic project memory | [AUTOMATIC-PROJECT-MEMORY.md](AUTOMATIC-PROJECT-MEMORY.md) |
| Cited fact consolidation | [CITED-FACT-CONSOLIDATION.md](CITED-FACT-CONSOLIDATION.md) |
| Linked project memory | [LINKED-PROJECT-MEMORY.md](LINKED-PROJECT-MEMORY.md) |
| Current release limits and roadmap | [ROADMAP.md](ROADMAP.md) |
| Maqam, crawler, ProductLoop, and OKF boundaries | [INTEROPERABILITY.md](INTEROPERABILITY.md) |
| Migration notes | [MIGRATIONS.md](MIGRATIONS.md) |
| Release gates | [LAUNCH.md](LAUNCH.md) |
| Public package entry point | [README.md](../README.md) |

## Suggested citation

```text
Ajnas N B. "Qarinah: Proof-Carrying Project Memory. Multi-language
developer memory with inspectable context receipts." Technical white
paper, version 1.8, August 2026. Qarinah 0.6.0-alpha.1. Paper series concept DOI:
https://doi.org/10.5281/zenodo.21547684. Version 1.8 has no version DOI
until this manuscript is separately deposited.
```
