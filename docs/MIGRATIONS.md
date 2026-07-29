# Migrations

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
