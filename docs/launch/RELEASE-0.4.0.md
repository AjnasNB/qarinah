# Qarinah 0.4.0

Qarinah 0.4.0 makes coding-agent project memory visible, searchable, and worktree-aware.

## What is new

- a local VS Code/Cursor memory panel;
- a searchable linked graph with explicit ranking components;
- one timeline for decisions, tools, outcomes, conflicts, and supersession;
- exact per-session context receipts with source and pack hashes but no retained bodies;
- repository-level comparison across independently initialized Git worktrees;
- incremental automatic compaction with initial, unchanged, delta, and rebuild receipts;
- encrypted content-defined source snapshots with exact-byte verification and restore;
- a source-hash-bound JavaScript/TypeScript symbol and reference graph;
- deterministic local symbol-vector ranking and the `qarinah-lsp` language server;
- an explicit foreground project watcher with unchanged-cycle suppression;
- strict cited fact consolidation with deterministic local and optional host-model modes;
- reversible project-scoped installation for Codex, Claude Code, Cursor, Kimi, Antigravity, and Freebuff;
- a 12/12 deep-memory product acceptance evaluation;
- a 16/16 real-Git-worktree acceptance evaluation; and
- technical white paper v1.6 plus an explicit, evidence-scoped limitations ledger.

## Current product result

The committed deep-memory evaluator runs source refresh, symbol/reference retrieval, cited fact consolidation, two encrypted snapshots, verification, and clean-directory restoration. It passes 12/12 scenarios, restores 390,226 source bytes exactly, reuses two of three chunks in the second snapshot, indexes four symbols and three resolved references, and retains three cited facts. Its result identity is:

```text
sha256:bb801a59d5c1822b87bda5596237a126a064e62ac6f588e3351ebe949551ff46
```

This is local product-acceptance evidence from a small deterministic TypeScript fixture, not a universal storage or language result.

## Worktree continuity result

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

Qarinah 0.4.0 does not ship a managed cross-device memory cloud, OS-wide passive activity capture, a learned dense-embedding service, Tree-sitter-scale language coverage, a native JetBrains extension, physical-media erasure guarantees, or a matched independent benchmark against another memory product. The included LSP covers bounded navigation over the JavaScript/TypeScript symbol projection, and the optional model-assisted fact path remains constrained by cited source admission. The release notes state these limits directly rather than hiding them behind a parity claim.

## Release discipline

Publish only the reviewed commit whose package, runtime, types, schemas, generated plugins, VSIX, website, white paper, evidence artifacts, and Git tree pass the complete release gate. The historical 98.7148% result remains a separately scoped benchmark and is not the 0.4.0 hero claim.
