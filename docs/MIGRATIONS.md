# Migrations

## Graph v1 to v2

Qarinah graph schema `qarinah.graph.v2` keeps every v1 event node and relation edge and adds an optional `projectStructure` projection plus `project.directory`, `project.file`, `project.external`, and `project.unresolved` nodes. It also adds `contains`, `imports`, `links`, and scan-to-root `produced` edges. Consumers that reject unknown fields or node types must add v2 support before reading a graph produced after this change.

The event chain is unchanged. Run `qarinah build` to regenerate `graph/graph.json`, `index/index.json`, and `records/CONTEXT.md` from the verified log. A project structure does not appear until a trusted user explicitly runs `qarinah scan`.

`qarinah scan` does not claim compiler or language-server equivalence. Version 1 records a bounded filesystem snapshot and conservative ECMAScript/TypeScript module and Markdown-link observations with exact source spans. Deeper AST symbol extraction remains separately versioned work.
