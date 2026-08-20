# Migrations

## 0.3.0 to 0.4.0: visible developer memory

Version 0.4.0 does not change the authoritative `qarinah.event.v1` ledger. It adds disposable session receipts, developer-memory views, host-install manifests, editor packaging, and a real-worktree acceptance artifact. Existing initialized workspaces remain readable.

Run these commands in each initialized checkout after upgrading:

```sh
npx qarinah build
npx qarinah receipts "current task" --write
npx qarinah dashboard --serve --worktrees
```

Each Git worktree keeps its own `.qarinah` directory. Qarinah never migrates multiple worktree ledgers into one writable store. The repository comparison view reads initialized siblings independently. Host setup is now available through the explicit `install` command; preview it with `--dry-run` before writing. Existing setup files are not claimed by the new ownership manifest until installed through that command.

The VS Code/Cursor extension is a read-only view over the local CLI contract. Install its generated VSIX only from the exact reviewed release. Antigravity and Freebuff support are project-local configuration surfaces; they do not add native hidden-transcript capture.

## Project structure v1 to v2 and Git worktrees

Qarinah now emits `qarinah.project-structure.v2`. Version 2 adds a nullable `worktree` field containing a non-secret repository group ID, worktree ID, branch, commit, and primary/linked status. The snapshot hash covers this metadata, so a task pack can prove which checkout produced the file graph. Qarinah continues to validate and read historical v1 snapshots; the authoritative event schema and existing ledgers do not change.

Every Git worktree keeps its own `.qarinah` directory, event chain, consent record, and derived files. Qarinah never replaces those directories with links or shares a writable ledger across concurrent checkouts. `qarinah worktrees` discovers the repository group, and `qarinah dashboard --serve --worktrees` opens every initialized sibling worktree in one local view.

Linked-memory consumers must accept the additive `worktree` node type. Run `qarinah scan` and `qarinah build` in an initialized worktree to write a v2 snapshot and regenerate both graph projections.

The additive `.qarinah/archive/` directory is ignored by Git and is created only when an explicitly content-authorized caller creates a lossless archive. Existing workspaces require no migration. Removing the directory removes local archive material but does not alter the authoritative event ledger; use the archive deletion and key-erasure commands when a durable receipt is required.

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

`qarinah scan` remains the bounded filesystem and conservative module/link observation layer. Qarinah 0.4.0 adds a separate additive `qarinah.symbol-graph.v1` projection for JavaScript, JSX, TypeScript, and TSX, built only after the latest scan hash is verified. Run `qarinah symbols build` or the explicit `qarinah watch` loop to create it. The `qarinah-lsp` process reads that projection for workspace definitions and references. Unsupported languages remain explicit coverage gaps; no ledger migration is required.

Qarinah 0.5.0 replaces that disposable projection with `qarinah.symbol-graph.v2`. Version 2 retains the TypeScript compiler lane and adds pinned Tree-sitter WASM grammars, parser identities, supported/indexed language coverage, and a parser identity on every indexed file. The event ledger and project-snapshot contracts are unchanged. Existing v1 graph files should be rebuilt with `qarinah symbols build`; consumers that validate the closed graph schema must add v2 support before upgrading.

## Linked project memory v1

Qarinah now derives `.qarinah/graph/linked-memory.json` alongside the existing graph, index, SQLite, and Markdown views. This is an additive, disposable `qarinah.linked-project-memory.v1` projection; the authoritative JSONL event contract is unchanged. Run `qarinah build` to create or repair it. Consumers can use `qarinah map` or the exported JavaScript APIs without migrating the ledger.

Large valid ledgers remain supported. The linked view selects a deterministic bounded event and relation window and reports omitted coverage rather than rejecting a ledger that is valid under the existing store limits. Query consumers should inspect coverage, especially `authorityComplete`, before treating a scoped result set as complete.
