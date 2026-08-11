# Qarinah 0.5.0 release readiness

Qarinah is not ready to be called stable `0.5.0` merely because the project-memory dashboard branch exists. The feature set is a credible release candidate after independent review, but the version should be promoted only when every gate below is complete on the exact release commit.

## Required before `0.5.0`

- Merge the exact-project initialization fix and the project-memory/dashboard feature through protected review.
- Decide and document the migration contract from the current `0.1.x` schemas and CLI behavior.
- Run the full test matrix on Node.js 22, 24, and 26 on Linux, macOS, and Windows.
- Fresh-install the packed artifact and prove setup, SQLite integrity, graph creation, dashboard generation, querying, Kimi import, Antigravity/Kimi MCP files, and external backup.
- Add a long-archive soak test with realistic exported JSONL while enforcing bytes, files, records, line length, session count, and memory limits.
- Exercise backup restore and hash verification on an external destination; copying is not enough without a reviewed restore procedure.
- Run a privacy/security review covering capture consent, transcript exclusions, path/link handling, archive manifests, dashboard escaping, MCP disclosure, and generated host configurations.
- Publish a host support matrix distinguishing reviewed native hooks, project MCP configuration, and portable imports.
- Freeze evidence-safe product language: no universal 70 GB compression, cost, cross-provider, NDA, or continuity guarantee.
- Publish `0.5.0-rc.1` first, observe real installs and migrations, then promote the exact reviewed bytes to stable.

## Current feature candidate

The candidate initializes the authoritative ledger, SQLite read model, graph, overview, decision/flow/change Markdown, and dashboard. It supports reviewed Codex and Claude lifecycle capture, Cursor/Kimi/Antigravity project MCP configuration, explicit Kimi and portable history import, verified external JSONL backup, and a measured memory-footprint report.

That is sufficient for an independently reviewed prerelease. It is not evidence that every agent CLI or every private archive format works natively.

