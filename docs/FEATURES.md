# Qarinah features

Qarinah is evidence-linked project memory for coding agents. It keeps an inspectable record beside a software project and compiles bounded, cited context packs for Codex, Claude Code, Cursor, CLI workflows, and compatible MCP clients.

## Git worktrees as first-class context

- Every initialized worktree owns a separate `.qarinah` ledger, consent record, SQLite view, graph, and generated Markdown.
- `qarinah worktrees` identifies linked checkouts without collecting remote URLs or credentials.
- Project-structure v2 binds the repository group, worktree, branch, and commit into the snapshot hash.
- `qarinah dashboard --serve --worktrees` groups initialized sibling checkouts in one responsive local view while keeping their writable stores isolated.
- Worktree nodes participate in the same temporal, disclosure-aware graph and ranked search as files, decisions, concepts, and cited references.

## Coding context harness

- Opt-in Codex and Claude Stop hooks capture the completed turn, then append one idempotent compact checkpoint without paying for a full derived rebuild on every turn.
- Current-worktree runs retrieve a task-specific bounded pack; repository-wide inspection keeps every sibling pack and writable ledger separate.
- Each result reports the actual retained-source and delivered-pack token estimates, selected event IDs and hashes, pack manifest, and checkpoint identity.
- The core summarizer is deterministic. A host may supply a side-effect-free model summarizer that receives only the bounded untrusted pack, never hidden reasoning or an undisclosed transcript.
- Content mode can retain bounded redacted summary text. Metadata mode retains only the metric, citation, and manifest receipt.
- The published 98.71% reduction and 77.81:1 ratio remain explicitly scoped to the committed six-fixture comparison; every live run reports its own measured estimate instead of inheriting that number.

## Explicit automatic project memory

- `qarinah watch` runs in the foreground and serially refreshes project structure, symbols, one cited incremental checkpoint, and all derived read models after a real source change.
- Unchanged snapshots do not append duplicate events or rebuild projections.
- The watcher remains inside one initialized workspace and applies the same ignore, secret-name, link, capture-policy, and byte/count ceilings as the ordinary project scanner.
- A hash-bound atomic phase journal exposes initial, delta, unchanged, interrupted, and recovered cycles instead of silently losing the last refresh state after a process crash.
- Stop signals and API cancellation interrupt polling. Qarinah does not install a silent desktop-wide collector.

## Cited fact consolidation

- `qarinah facts` produces bounded decisions, constraints, tools, outcomes, evidence, conflicts, and summaries from the admitted verified pack.
- Every structured fact cites one to eight source event IDs present in that pack.
- The default extractor is deterministic. Optional model adapters receive bounded untrusted inputs and cannot introduce uncited event IDs or extra fields.
- Recording is idempotent. Metadata capture stores a content-free receipt; content capture may retain the bounded cited statements.

## Lossless source retention beside compact context

- Explicit content-capture workspaces can archive selected project files without placing those bytes in every context pack.
- Content-defined chunks deduplicate unchanged regions across snapshots; Brotli is used only when it reduces stored bytes.
- AES-256-GCM authentication, per-file SHA-256 verification, key-scoped object paths, and deterministic manifests detect changed or misplaced archive content.
- Restore, manifest deletion, orphan-object garbage collection, and local-key destruction require explicit identifiers and return bounded receipts.
- Ignore rules, secret-filename rejection, link rejection, and hard resource ceilings keep the archive opt-in and project-scoped.
- This is a local project archive, not a managed backup cloud, device-wide passive capture service, or physical-media erasure guarantee.

## Code-aware symbol memory

- The TypeScript compiler parser indexes JavaScript, JSX, TypeScript, and TSX; pinned and runtime-compatible Tree-sitter WASM grammars index Python, Go, Rust, Java, Kotlin, C, C++, and C# source.
- Both parser lanes emit the same bounded declaration, container, export-evidence, exact-span, signature-hash, and unambiguous-reference contract without storing source bodies in the graph.
- Every parsed file must still match the content hash in the latest explicit project scan; stale or linked files abstain.
- Default symbol search combines lexical matching, a deterministic local subword vector, and resolved-reference structure with a visible score basis.
- `qarinah-lsp` exposes document symbols, workspace symbols, definitions, and references through bounded stdio JSON-RPC.
- The strict `qarinah.symbol-graph.v2` schema publishes parser versions, supported languages, indexed languages, file-level parser identity, and explicit coverage gaps.

See [Coding context harness](CODING-CONTEXT-HARNESS.md), [Automatic project memory](AUTOMATIC-PROJECT-MEMORY.md), and [Cited fact consolidation](CITED-FACT-CONSOLIDATION.md).

## Project-owned memory

- A canonical, append-only JSONL event record stored with the project.
- Stable event identities, content hashes, and chain verification for detectable edits, deletions, truncation, duplicates, and broken continuity.
- Explicit workspace initialization, machine-local trust, and metadata-only capture by default.
- Configurable content capture, redaction, retention, size, repository, time, and disclosure boundaries.
- Abortable public append, verified-read, and derived-rebuild waits, with cancellation honored before the first irreversible write and coherent recovery metadata completed after commit begins.

## Cited context compilation

- Bounded lexical, typo-tolerant, graph, and optional semantic retrieval.
- Complete selected records with event IDs, hashes, retrieval manifests, and evidence-coverage diagnostics.
- Token and character budgets with reserved output space and explicit abstention controls.
- Temporal validity, freshness, supersession, conflict, repository, and authority filtering before context is admitted.
- Deterministic Markdown and JSON context packs that can be inspected before they reach a model.

## Project structure and derived views

- Bounded project scanning with typed file, directory, import, link, and unresolved-reference relationships.
- A bounded linked-memory projection that joins admitted temporal memory with the latest verified project scan, ranks repository structure, and returns the local, linked, and structural basis for each result.
- A rebuildable typed graph and retrieval index derived from the authoritative event record.
- An optional SQLite WAL and FTS5 read model that remains disposable derived state.
- Responsive static snapshots and a loopback-only live dashboard for real retained events, project/workspace/repository identity, decisions and reasons, linked tools, bounded execution flow, major changes, conflicts, citations, affected files, an accessible relationship graph, read-only ranked search, and an automatic evidence-labeled ledger/import-to-pack context estimate.
- A reproducible memory-footprint report that separates imported source bytes, retained local storage, and the bounded pack delivered for one task.
- Automatically initialized `OVERVIEW.md`, `DECISIONS.md`, `FLOW.md`, and `CHANGES.md` views that can be deleted and regenerated from the verified ledger.
- Immediate SQLite, graph, index, and Markdown initialization, so a new workspace starts with a complete empty read model instead of a missing database.
- A beginner-readable project overview combining memory counts, latest outcomes, codebase areas, languages, relationships, and evidence identities.

## Existing-history recovery

- Streaming import for Codex, Claude, and portable JSONL or NDJSON agent exports.
- Compact mode that turns large visible histories into one cited summary per session without loading the complete archive into memory.
- Full mode for independently retaining supported visible messages and tool events when content capture is authorized.
- Idempotent re-import, byte/file/record/line/session ceilings, source digests, and explicit exclusion of hidden reasoning and encrypted reasoning blocks.
- Portable input for compatible or future agent hosts without falsely claiming an untested native integration.
- Opt-in external backup of explicitly selected JSONL/NDJSON exports during setup or later, with streaming limits, link rejection, per-file hashes, an external manifest, and a compact ledger receipt.

## Coding-agent integrations

- Reviewed Codex and Claude Code lifecycle integrations that use the same explicitly trusted project record.
- Project-local MCP setup for Cursor, Kimi Code, classic Kimi CLI, and Google Antigravity, with host-appropriate project rules/configuration.
- Reversible project-scoped installation manifests for Codex, Claude Code, Cursor, Kimi, Antigravity, and Freebuff.
- A sandboxed VS Code/Cursor developer-memory panel with graph search, timeline, receipts, and worktree comparison.
- Explicit Kimi stream-json import for visible user, assistant, tool-call, and tool-result messages.
- A native MCP stdio server with diagnostic-only defaults and explicitly authorized, zero-write context retrieval.
- Cross-agent handoff capsules for continuing a task without replaying the complete retained history.

## Team memory and portability

- Multi-repository context packs that preserve separate repository and authority boundaries.
- Freshness diagnostics, encrypted sync bundles, signed checkpoints, and explicit membership records.
- Deterministic Markdown, JSON, typed graph, and Google Open Knowledge Format exports.
- Schemas and adapters for Cockroach Crawler evidence, Cockroach Browser memory records, ProductLoop runtime events, and optional Maqam authority scopes.

## Verify the boundary

Qarinah is not an autonomous agent runtime, a hosted personalization service, or a guarantee that a model answer is correct. It supplies inspectable project memory to a caller that remains responsible for model choice, current source files, tools, and execution authority.

Qarinah can support private and NDA-conscious projects with local storage, explicit consent, metadata-only defaults, redaction, encrypted bundles, and signed checkpoints. It does not create or replace a legal NDA. See [private projects](PRIVATE-PROJECTS.md).

Continue with [installation and setup](GETTING-STARTED.md), [project overview](PROJECT-OVERVIEW.md), [agent archive import](AGENT-ARCHIVE-IMPORT.md), [lossless content archives](CONTENT-ARCHIVE.md), [memory-footprint measurement](MEMORY-FOOTPRINT.md), [host compatibility](HOST-COMPATIBILITY.md), the [CLI reference](CLI-REFERENCE.md), or the [JavaScript and TypeScript API](API-REFERENCE.md).
