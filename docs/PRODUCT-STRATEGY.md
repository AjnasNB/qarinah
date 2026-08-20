# Product strategy

Qarinah is the durable project memory that coding agents can inspect and cite.

Its first customer promise is simple:

> Initialize a repository once, preserve the project evidence you permit, and let each supported coding agent recover the relevant decisions, outcomes, code relationships, session receipts, and Git-worktree context without replaying the complete retained history.

## Product center

1. **The project owns the memory.** The authoritative ledger lives beside the repository and is independent of one model vendor or chat window.
2. **Every compact answer keeps its proof.** Selected memory carries event identities, hashes, coverage, conflicts, and supersession state.
3. **Current code and historical intent stay connected.** Source-hash-bound symbol graphs connect files and definitions to the decisions and outcomes around them.
4. **Parallel worktrees remain precise.** Every initialized checkout owns a separate writable ledger and consent record while repository identity enables read-only comparison.
5. **Memory is visible.** The CLI, local dashboard, VS Code/Cursor panel, standard LSP, and JetBrains LSP4IJ template expose the same rebuildable project view.
6. **Capture remains explicit.** Qarinah does not silently collect unrelated desktop activity or pretend unsupported private host formats are available.

## Optional composition

Qarinah works as a standalone local package. It can additionally receive cited web records, browser outcomes, or workflow provenance through strict passive adapters. Maqam can add policy or human approval to selected operations when a team needs that layer; normal Qarinah memory and retrieval do not require it.

The integration rule is consistent: external systems may submit versioned evidence records, but they do not inherit Qarinah's workspace authority, source archive keys, or disclosure permissions. Qarinah does not inherit their execution authority either.

## Retrieval and model choices

The built-in default remains deterministic and local: lexical matching, typo tolerance, graph evidence, term-derived vectors, source freshness, temporal state, authority admission, and coverage checks. Provider tokenizers, learned embeddings, or model-assisted fact extraction may be explicit adapters. They must identify their model/version, preserve cited source identities, respect the same disclosure boundary, and keep a deterministic fallback.

## Distribution

- Apache-2.0 npm package and source repository;
- project-local Codex, Claude, Cursor, Kimi, Antigravity, and Freebuff setup surfaces with explicitly documented differences;
- VS Code/Cursor extension and a standard LSP process;
- JetBrains LSP4IJ custom template;
- reproducible schemas, evaluations, machine-readable results, and technical paper; and
- optional self-hosted opaque encrypted-bundle transport.

## Evidence standard

Marketing language follows the checked artifact, not the roadmap. A measured fixture claim names its denominator and limitations. A supported host claim identifies whether the surface is a reviewed lifecycle adapter, MCP configuration, portable import, editor extension, or standard LSP. A feature becomes stable only when its exact packed bytes pass the protected release workflow.
