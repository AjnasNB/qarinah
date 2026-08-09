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
- A local read-only dashboard for current and superseded decisions, conflicts, citations, permitted activity, affected files, and caller-supplied context measurements.

## Coding-agent integrations

- Reviewed Codex and Claude Code integrations that use the same explicitly trusted project record.
- Cursor setup, terminal workflows, and project-level instructions.
- A native MCP stdio server with diagnostic-only defaults and explicitly authorized, zero-write context retrieval.
- Cross-agent handoff capsules for continuing a task without replaying the complete retained history.

## Team memory and portability

- Multi-repository context packs that preserve separate repository and authority boundaries.
- Freshness diagnostics, encrypted sync bundles, signed checkpoints, and explicit membership records.
- Deterministic Markdown, JSON, typed graph, and Google Open Knowledge Format exports.
- Schemas and adapters for Cockroach Crawler evidence, Cockroach Browser memory records, ProductLoop runtime events, and optional Maqam authority scopes.

## Verify the boundary

Qarinah is not an autonomous agent runtime, a hosted personalization service, or a guarantee that a model answer is correct. It supplies inspectable project memory to a caller that remains responsible for model choice, current source files, tools, and execution authority.

Continue with [installation and setup](GETTING-STARTED.md), [host integrations](HOST-INTEGRATIONS.md), the [CLI reference](CLI-REFERENCE.md), or the [JavaScript and TypeScript API](API-REFERENCE.md).
