# Migrations

## Project structure v1 to v2 and Git worktrees

Qarinah now emits `qarinah.project-structure.v2`. Version 2 adds a nullable `worktree` field containing a non-secret repository group ID, worktree ID, branch, commit, and primary/linked status. The snapshot hash covers this metadata, so a task pack can prove which checkout produced the file graph. Qarinah continues to validate and read historical v1 snapshots; the authoritative event schema and existing ledgers do not change.

Every Git worktree keeps its own `.qarinah` directory, event chain, consent record, and derived files. Qarinah never replaces those directories with links or shares a writable ledger across concurrent checkouts. `qarinah worktrees` discovers the repository group, and `qarinah dashboard --serve --worktrees` opens every initialized sibling worktree in one local view.

Linked-memory consumers must accept the additive `worktree` node type. Run `qarinah scan` and `qarinah build` in an initialized worktree to write a v2 snapshot and regenerate both graph projections.

## Cockroach Browser metadata-outcome boundary

The `cockroach.browser-memory.v1` receiving API is additive and does not change `qarinah.event.v1` or existing workspaces. No ledger migration or rebuild is required. New consumers may pass a passive `createCockroachBrowserMemorySink()` to the public Cockroach Browser Qarinah recorder.

The boundary intentionally retains only cited metadata projections. The sink ignores uncited lifecycle notifications; `appendCockroachBrowserOutcome()` rejects them. Content-enabled Qarinah workspaces still receive browser outcomes in metadata mode. Callers that previously wrote browser objects through generic event APIs should migrate to the versioned sink if they need the strict evidence-citation, secret-omission, replay, and conflict behavior. The sink receives outcomes only and grants no browser authority.

## Team-memory platform additions in 0.1.2

The following additions do not change the authoritative event-ledger schema:

- consent-gated MCP `context.query`;
- `qarinah setup` for Codex, Claude Code, and Cursor;
- local dashboards and freshness inspection;
- task-specific memory packs;
- separate-authority multi-repository context;
- optional semantic reranking;
- encrypted team bundles, role manifests, and signed checkpoints;
- context-quality evaluation; and
- causal receipt chains.

Existing workspaces need no ledger migration. Run `qarinah setup . --codex --claude --cursor` to install project-local integrations. Add `--allow-query` only after reviewing the workspace's current consent policy. See [Shared and verifiable team memory](TEAM-MEMORY.md).

## Context pack v1 to v2

Qarinah `0.1.0-alpha.2` emits `qarinah.context-pack.v2`. Every pack now includes `retrieval.coverage` with a deterministic query-term-overlap status, counts, ratio, direct candidate count, and an optional warning. Callers that validate exact schemas must accept v2 before upgrading. Use `minimumCoverage: "partial"` or `"direct"` to fail closed when evidence is missing or incomplete. The event ledger, graph, and index formats are unchanged by this context-pack migration.

## Graph v1 to v2

Qarinah graph schema `qarinah.graph.v2` keeps every v1 event node and relation edge and adds an optional `projectStructure` projection plus `project.directory`, `project.file`, `project.external`, and `project.unresolved` nodes. It also adds `contains`, `imports`, `links`, and scan-to-root `produced` edges. Consumers that reject unknown fields or node types must add v2 support before reading a graph produced after this change.

The event chain is unchanged. Run `qarinah build` to regenerate `graph/graph.json`, `index/index.json`, and `records/CONTEXT.md` from the verified log. A project structure does not appear until a trusted user explicitly runs `qarinah scan`.

`qarinah scan` does not claim compiler or language-server equivalence. Version 1 records a bounded filesystem snapshot and conservative ECMAScript/TypeScript module and Markdown-link observations with exact source spans. Deeper AST symbol extraction remains separately versioned work.

## Linked project memory v1

Qarinah now derives `.qarinah/graph/linked-memory.json` alongside the existing graph, index, SQLite, and Markdown views. This is an additive, disposable `qarinah.linked-project-memory.v1` projection; the authoritative JSONL event contract is unchanged. Run `qarinah build` to create or repair it. Consumers can use `qarinah map` or the exported JavaScript APIs without migrating the ledger.

Large valid ledgers remain supported. The linked view selects a deterministic bounded event and relation window and reports omitted coverage rather than rejecting a ledger that is valid under the existing store limits. Query consumers should inspect coverage, especially `authorityComplete`, before treating a scoped result set as complete.
