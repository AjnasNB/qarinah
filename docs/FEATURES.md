# Qarinah features

Qarinah is evidence-linked project memory for coding agents. It keeps an inspectable record beside a software project and compiles bounded, cited context packs for Codex, Claude Code, Cursor, CLI workflows, and compatible MCP clients.

## Project-owned memory

- A canonical, append-only JSONL event record stored with the project.
- Stable event identities, content hashes, and chain verification for detectable edits, deletions, truncation, duplicates, and broken continuity.
- Explicit workspace initialization, machine-local trust, and metadata-only capture by default.
- Configurable content capture, redaction, retention, size, repository, time, and disclosure boundaries.

## Cited context compilation

- Bounded lexical, typo-tolerant, graph, and optional semantic retrieval.
- Complete selected records with event IDs, hashes, retrieval manifests, and evidence-coverage diagnostics.
- Token and character budgets with reserved output space and explicit abstention controls.
- Temporal validity, freshness, supersession, conflict, repository, and authority filtering before context is admitted.
- Deterministic Markdown and JSON context packs that can be inspected before they reach a model.

## Project structure and derived views

- Bounded project scanning with typed file, directory, import, link, and unresolved-reference relationships.
- A rebuildable typed graph and retrieval index derived from the authoritative event record.
- An optional SQLite WAL and FTS5 read model that remains disposable derived state.
- A local read-only dashboard for decisions and their reasons, linked tools, bounded execution flow, major changes, conflicts, citations, affected files, and caller-supplied context measurements.
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

Continue with [installation and setup](GETTING-STARTED.md), [project overview](PROJECT-OVERVIEW.md), [agent archive import](AGENT-ARCHIVE-IMPORT.md), [memory-footprint measurement](MEMORY-FOOTPRINT.md), [host compatibility](HOST-COMPATIBILITY.md), the [CLI reference](CLI-REFERENCE.md), or the [JavaScript and TypeScript API](API-REFERENCE.md).
