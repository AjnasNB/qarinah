# Roadmap

## Qarinah 0.6: proof-carrying task context

The 0.5 release candidate established durable developer memory. The 0.6 line turns that memory into a bounded, query-specific task packet that explains what it selected, what it rejected, and which exact repository and ledger state produced the result.

### P0 - implemented in 0.6.0-alpha.2

- the versioned `qarinah.proof-context.v1` contract and public JavaScript/TypeScript API;
- the `qarinah proof <query>` CLI surface for portable agent and harness integration;
- query-ranked repository files and symbols joined with current project events and temporal facts;
- explicit selection and exclusion reasons, including stale and superseded evidence;
- a deterministic manifest hash over the delivered packet and its source state;
- a strict context budget with exact token accounting when a compatible tokenizer is supplied and a named deterministic estimator otherwise; and
- a searchable Task proof view in the VS Code and Cursor-compatible developer-memory panel.

### P1 - beta release gates

- verify the packed npm artifact, editor extension, CLI, MCP transport, schemas, migrations, and local dashboard from one reviewed commit;
- repeat clean-install and project-upgrade coverage on Linux, macOS, and Windows;
- expand task-packet fixtures across repository layouts, language mixes, worktrees, stale evidence, and budget boundaries; and
- publish exact benchmark receipts and a reproducible verifier with every beta build.

### P2 - stable release gates

- complete an independent security and privacy review and close release-blocking findings;
- obtain an independent reproduction of the task-packet evaluation;
- publish long-running real-project installation, recovery, migration, and retention reports;
- freeze the interoperability contract only after adapter authors have tested it; and
- promote only the exact reviewed package, editor artifact, paper, evidence, and website bytes.

The maintainer-run 0.6.0-alpha.2 evaluation accepts 12 / 12 multilingual task-packet scenarios. It checks expected file and symbol retrieval, current-evidence recall, stale-evidence rejection, citation validity, context-budget conformance, deterministic manifest reproduction, and manifest-tamper rejection. This is a bounded prerelease receipt, not a claim that every repository task is solved. Stable 0.6.0 remains blocked on the P2 gates above.

## Qarinah 0.5: proof-carrying developer memory

Qarinah is a project-memory system for coding agents. It keeps the durable record beside the repository, links evidence to code and Git worktrees, and compiles a small cited pack for the next task. Policy and approval are optional integrations, not the product's primary identity.

The 0.5 release candidate is organized as three implementation layers.

### P0 - durable and recoverable memory

- a deterministic v2 symbol graph for JavaScript, JSX, TypeScript, TSX, Python, Go, Rust, Java, Kotlin, C, C++, and C#;
- source-hash validation and pinned parser identities for every indexed file;
- v2 session receipts bound to the ordered retained-event manifest, observed lifecycle, turn outcomes, and exact delivered context;
- an atomic project-memory-cycle journal that detects an interrupted phase and replays only reviewed idempotent work; and
- strict public schemas, TypeScript contracts, migration notes, and adversarial regression tests for each surface.

### P1 - memory developers can inspect while coding

- a VS Code and Cursor-compatible panel with searchable graph, decision/tool/outcome/conflict timeline, worktree comparison, and per-session replay;
- multi-language document symbols, workspace symbols, definitions, and references through the bounded `qarinah-lsp` process;
- an importable JetBrains LSP4IJ template that runs the exact project-local Qarinah dependency; and
- an explicit foreground watcher that refreshes symbols, cited checkpoints, SQLite, graphs, Markdown, and dashboard views.

### P2 - portable collaboration and public proof

- a self-hosted loopback service for immutable, tenant-bound encrypted team bundles with exact roles, rate limits, and token-free audit evidence;
- a 10/10 maintainer-run evaluation over an isolated copy of Qarinah's own public checkout, including every eligible source file at the reviewed release commit, exact symbol-definition queries, one completed session receipt, cited retrieval, and store verification;
- package-contained integration templates, schemas, documentation, editor artifact, evaluation data, and technical-paper source; and
- a release process that publishes an RC first, verifies fresh installs and migrations on Linux, macOS, and Windows, then promotes only the reviewed bytes.

These layers shipped as the 0.5 release candidate after protected review and exact-commit release verification. They are the foundation consumed by the 0.6 task-packet contract.

## Current product foundation

- strict append-only event, relation, and context-pack contracts;
- consent, machine-local trust, redaction, retention, locking, and integrity verification;
- deterministic graph, index, SQLite, Markdown, dashboard, and OKF projections;
- bounded hybrid retrieval and cited task-context compilation;
- reviewed Codex and Claude lifecycle adapters, plus project-local MCP/setup surfaces for compatible hosts;
- exact encrypted source snapshots with hash-verified restore and cryptographic key-erasure receipts;
- cross-worktree discovery with isolated writable ledgers and a shared repository identity; and
- encrypted team bundles, signed checkpoints, and optional self-hosted opaque transport.

## Next evidence, not bigger slogans

- independent security and privacy assessment;
- independent reproduction of the public-project memory evaluation;
- long-running real-project installation and migration reports;
- more language fixtures and reference-resolution cases without weakening ambiguity handling;
- generic LSP setup recipes for additional editors;
- team-sync backup/restore drills and documented reverse-proxy deployment profiles; and
- the already-frozen provider-backed paired software-task study once its execution is separately authorized.

Qarinah will not add hidden desktop surveillance or claim lossless compression of arbitrary private histories. Managed identity, billing, cross-device hosting, and organization administration are separate service work, not claims of the Apache-2.0 local package.
