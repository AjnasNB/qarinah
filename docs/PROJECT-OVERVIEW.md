# Understand a project in one page

Qarinah can give a new coding agent a simple project overview before it starts work. The overview combines the latest codebase map with the permitted history already recorded for the project.

```sh
npx qarinah setup . --codex --claude --cursor --capture content --allow-query
npx qarinah overview
```

The setup command now initializes the local memory database, scans the bounded project structure, builds the relationship graph, and installs the selected project integrations. The overview then shows:

- how many agent sessions, requests, completed turns, tool outcomes, decisions, summaries, and approvals are retained;
- how many files and directories were mapped;
- the languages and top-level areas in the codebase;
- observed import and documentation relationships;
- the latest recorded outcomes with event IDs and hashes; and
- the exact local files that hold the ledger, SQLite search, graph, and readable memory.

## The four durable views

| File | Purpose |
| --- | --- |
| `.qarinah/events/events.jsonl` | Authoritative, append-only project memory |
| `.qarinah/index/qarinah.db` | Fast local SQLite WAL and FTS5 search |
| `.qarinah/graph/graph.json` | Typed relationships among events, files, sources, and outcomes |
| `.qarinah/records/CONTEXT.md` | Human-readable project memory rebuilt from the ledger |

SQLite, the graph, and Markdown are derived views. If one is deleted or stale, `npx qarinah rebuild` recreates it from the verified JSONL ledger.

## A fresh-agent workflow

1. Open the repository in a supported coding agent.
2. Run `npx qarinah overview` to understand the retained project and codebase map.
3. Ask `npx qarinah query "your task" --format markdown` for the relevant cited memory.
4. Inspect the event IDs, hashes, conflicts, freshness, and superseded decisions.
5. Continue with the current source files and tools.

The overview is intentionally readable. The graph and SQLite database remain available when an agent or developer needs deeper inspection.

## Refresh after structural changes

```sh
npx qarinah scan
npx qarinah overview
```

The scanner records additions, changes, renames, deletions, module references, Markdown links, and unresolved references within explicit file, byte, depth, and path limits. It skips linked paths and common generated or dependency directories.
