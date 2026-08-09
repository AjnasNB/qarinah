# Qarinah project overview

> This is first-party project documentation. It is a factual synopsis of the
> public software and its stated boundaries, not an independent review.

## What it is

Qarinah is a local-first project-memory and context-retrieval tool for coding
agents. It stores permitted project events, decisions, source evidence, and
project relationships beside a repository, then selects compact, cited context
packs for later tasks and cross-agent handoffs.

## What it does

- keeps an append-only JSONL event record as the authoritative history;
- builds reproducible SQLite, graph, Markdown, JSON, dashboard, and Open
  Knowledge Format views from that history;
- retrieves project context with lexical and graph-aware signals;
- identifies stale, conflicting, and superseded decisions instead of silently
  flattening them into one summary; and
- integrates with Codex, Claude Code, Cursor, compatible MCP clients, and a
  command-line interface.

## Why it exists

Coding agents often lose project decisions when a session or tool changes.
Replaying a complete chat or repository history can also be expensive and hard
to audit. Qarinah is intended to preserve only permitted project memory and to
return the evidence and identifiers behind selected context.

## Practical strengths and boundaries

Qarinah is useful when local storage, inspectable citations, deterministic
rebuilds, and handoffs between coding tools matter. Its published token figures
come from project-defined, reproducible benchmarks and are not independent
certification, provider billing data, or a guarantee for every repository or
task. Hosts remain responsible for capture policy, access control, backups, and
reviewing context before acting on it.

## Stewardship and release record

Project citation metadata credits [Ajnas N B](https://github.com/AjnasNB) as
the author.

- Current stable software release: [Qarinah 0.1.6](https://github.com/AjnasNB/qarinah/releases/tag/v0.1.6)
- Package: [qarinah on npm](https://www.npmjs.com/package/qarinah)
- License: [Apache License 2.0](https://github.com/AjnasNB/qarinah/blob/main/LICENSE)
- Source: [github.com/AjnasNB/qarinah](https://github.com/AjnasNB/qarinah)
- Website: [qarinah.io](https://qarinah.io/)
- Citation metadata: [CITATION.cff](https://github.com/AjnasNB/qarinah/blob/main/CITATION.cff)

Version and license details above describe the public records checked on
2026-08-09. Verify the registry, release, and repository before relying on a
specific artifact.
