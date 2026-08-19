# Qarinah 0.4.0

Qarinah 0.4.0 makes coding-agent project memory visible, searchable, and worktree-aware.

## What is new

- a local VS Code/Cursor memory panel;
- a searchable linked graph with explicit ranking components;
- one timeline for decisions, tools, outcomes, conflicts, and supersession;
- exact per-session context receipts with source and pack hashes but no retained bodies;
- repository-level comparison across independently initialized Git worktrees;
- incremental automatic compaction with initial, unchanged, delta, and rebuild receipts;
- reversible project-scoped installation for Codex, Claude Code, Cursor, Kimi, Antigravity, and Freebuff;
- a 16/16 real-Git-worktree acceptance evaluation; and
- technical white paper v1.5 plus a current market comparison and explicit gap ledger.

## Strongest release result

The committed evaluator creates three actual Git worktrees. Two are initialized independently and one remains deliberately uninitialized. All 16 isolation, discovery, retrieval, conflict, receipt, and compaction scenarios pass. The deterministic result is:

```text
sha256:0a610a0c2f6503d4b3c53c2e8bfc187c2159c70906e1bc7e828693cc34b6be9d
```

This is local product-acceptance evidence. It is not a coding-task success rate, an independent cross-product benchmark, or a claim that Qarinah is universally best.

## Install

```sh
npm install --save-dev qarinah@0.4.0
npx qarinah setup . --capture metadata --allow-query --auto-compact
npx qarinah dashboard --serve --worktrees
```

Preview a single host integration before writing it:

```sh
npx qarinah install . --host cursor --scope project --dry-run --allow-query
```

## Compatibility boundary

The release supports Node.js 22, 24, and 26. Codex and Claude Code have reviewed lifecycle adapters. Cursor, Kimi, Antigravity, and Freebuff use project-local configuration or MCP surfaces and do not imply identical native lifecycle coverage. The extension targets VS Code and Cursor-compatible extension hosts; no JetBrains package is included.

## Known gaps

Qarinah 0.4.0 does not ship a managed cross-device memory cloud, OS-wide passive activity capture, a default embedding service, a Tree-sitter/LSP-scale symbol graph, automatic LLM fact extraction, or a matched independent benchmark against another memory product. These are documented in the current market comparison rather than hidden behind a parity claim.

## Release discipline

Publish only the reviewed commit whose package, runtime, types, schemas, generated plugins, VSIX, website, white paper, evidence artifacts, and Git tree pass the complete release gate. The historical 98.7148% result remains a separately scoped benchmark and is not the 0.4.0 hero claim.
