# Migrations

## Cockroach Browser metadata-outcome boundary

The `cockroach.browser-memory.v1` receiving API is additive and does not change `qarinah.event.v1` or existing workspaces. No ledger migration or rebuild is required. New consumers may pass a passive `createCockroachBrowserMemorySink()` to the public Cockroach Browser Qarinah recorder.

The boundary intentionally retains only cited metadata projections. The sink ignores uncited lifecycle notifications; `appendCockroachBrowserOutcome()` rejects them. Content-enabled Qarinah workspaces still receive browser outcomes in metadata mode. Callers that previously wrote browser objects through generic event APIs should migrate to the versioned sink if they need the strict evidence-citation, secret-omission, replay, and conflict behavior. The sink receives outcomes only and grants no browser authority.

## Context pack v1 to v2

Qarinah `0.1.0-alpha.2` emits `qarinah.context-pack.v2`. Every pack now includes `retrieval.coverage` with a deterministic query-term-overlap status, counts, ratio, direct candidate count, and an optional warning. Callers that validate exact schemas must accept v2 before upgrading. Use `minimumCoverage: "partial"` or `"direct"` to fail closed when evidence is missing or incomplete. The event ledger, graph, and index formats are unchanged by this context-pack migration.

## Graph v1 to v2

Qarinah graph schema `qarinah.graph.v2` keeps every v1 event node and relation edge and adds an optional `projectStructure` projection plus `project.directory`, `project.file`, `project.external`, and `project.unresolved` nodes. It also adds `contains`, `imports`, `links`, and scan-to-root `produced` edges. Consumers that reject unknown fields or node types must add v2 support before reading a graph produced after this change.

The event chain is unchanged. Run `qarinah build` to regenerate `graph/graph.json`, `index/index.json`, and `records/CONTEXT.md` from the verified log. A project structure does not appear until a trusted user explicitly runs `qarinah scan`.

`qarinah scan` does not claim compiler or language-server equivalence. Version 1 records a bounded filesystem snapshot and conservative ECMAScript/TypeScript module and Markdown-link observations with exact source spans. Deeper AST symbol extraction remains separately versioned work.
