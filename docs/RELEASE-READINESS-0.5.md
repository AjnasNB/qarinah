# Qarinah 0.5.0 release readiness

Qarinah is not ready to be called stable `0.5.0` merely because the P0-P2 implementation exists. The feature set is a credible release candidate after independent review, but the version should be promoted only when every gate below is complete on the exact release commit.

## Implemented candidate scope

- P0: multi-language source-hash-bound symbol graph, lifecycle-bound session receipts, and crash-recoverable incremental cycles.
- P1: detailed session replay in the VS Code/Cursor panel, multi-language LSP document navigation, and a packaged JetBrains LSP4IJ template.
- P2: a self-hosted opaque encrypted-bundle service and a committed 10/10 evaluation over an isolated copy of the public Qarinah checkout.

See [ROADMAP.md](ROADMAP.md) for the exact implementation and boundary table.

## Required before `0.5.0`

- Merge the exact P0-P2 candidate through protected review.
- Decide and document the migration contract from the current `0.1.x` schemas and CLI behavior.
- Run the full test matrix on Node.js 22, 24, and 26 on Linux, macOS, and Windows.
- Fresh-install the packed artifact and prove setup, SQLite integrity, graph creation, dashboard generation, querying, Kimi import, Antigravity/Kimi MCP files, and external backup.
- Preserve the long-archive soak tests that enforce bytes, files, records, line length, session count, and memory limits.
- Exercise backup restore and hash verification on an external destination; copying is not enough without a reviewed restore procedure.
- Run a privacy/security review covering capture consent, transcript exclusions, path/link handling, archive manifests, dashboard escaping, MCP disclosure, and generated host configurations.
- Publish a host support matrix distinguishing reviewed native hooks, project MCP configuration, and portable imports.
- Freeze evidence-safe product language: no universal 70 GB compression, cost, cross-provider, NDA, or continuity guarantee.
- Publish `0.5.0-rc.1` first, observe real installs and migrations, then promote the exact reviewed bytes to stable.

## Current feature candidate

The candidate initializes the authoritative ledger, SQLite read model, graphs, overview, decision/flow/change Markdown, session receipts, and dashboard. It supports reviewed Codex and Claude lifecycle capture, Cursor/Kimi/Antigravity project MCP configuration, explicit Kimi and portable history import, verified external JSONL backup, multi-language code memory, editor inspection, self-hosted opaque sync, and scoped public evaluations.

That is sufficient for an independently reviewed prerelease. It is not evidence that every agent CLI or every private archive format works natively.
