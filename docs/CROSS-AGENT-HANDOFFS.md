# Switch coding agents without starting over

Qarinah is the evidence-linked cross-agent context engine for software projects. It lets Codex, Claude Code, Cursor, and other supported coding agents continue the same project using a shared, cited record of decisions, outcomes, code relationships, and current evidence.

The primary job is simple: **verified handoffs between coding agents**.

For a reproducible Claude-to-Codex or Codex-to-Claude recording, use the [cross-agent video protocol](CROSS-AGENT-VIDEO-PROTOCOL.md). It freezes versions, preserves a machine-readable run record, and separates a demonstration from research evidence.

The release also includes a deterministic two-session continuation benchmark and an authenticated Codex-to-Codex product smoke with native resume disabled. See [the method, receipts, and limitations](CROSS-SESSION-CONTINUATION-BENCHMARK.md).

## The complete handoff loop

1. Begin a real software task in one coding agent.
2. Record permitted decisions, changes, evidence, and tool outcomes in the project-owned Qarinah record.
3. Switch to another supported coding agent.
4. Ask Qarinah for the context relevant to the task being continued.
5. Receive a compact cited pack with stale, conflicting, and superseded decisions marked.
6. Finish the task without replaying the complete project history.

The durable record belongs to the project, not to a private chat or one editor. Each agent receives only the evidence selected for the current query and authorized workspace.

## Set up one project

Run this once from the repository you want the agents to share:

```sh
npx qarinah setup . --codex --claude --cursor --capture content --allow-query
```

The setup initializes the local workspace, installs the reviewed project integrations, configures consent-gated MCP retrieval, and runs the first health check.

Setup is idempotent and parallel-worker-safe. If several agents start setup together, one creates the workspace and the others reuse its workspace ID. Ledger appends are not lock-free: the short authoritative JSONL append is serialized so two workers cannot fork the hash chain. SQLite WAL, FTS5, graph, JSON, and Markdown are rebuildable read projections and do not replace the ledger.

Every process launched inside the initialized project tree discovers the same nearest `.qarinah/config.json`. Initialize the shared project root, not each nested package:

```sh
qarinah init . --capture content --if-needed
```

## Record the handoff evidence

Supported host adapters can record permitted lifecycle events and tool outcomes. A developer or governed workflow can explicitly record a durable decision:

```sh
npx qarinah record \
  --kind decision \
  --title "Keep releases provenance-bound" \
  --body "Publish only the reviewed artifact from the reviewed commit."
```

Qarinah stores the event in the authoritative hash-chained JSONL ledger. The SQLite WAL and FTS5 read model, typed relationship graph, Markdown views, dashboard, and portable exports are rebuildable derived state.

## Continue in another agent

Ask for only the context needed to continue the task:

```sh
npx qarinah query "continue the provenance-bound release" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --format markdown
```

Supported host shortcuts use the same project record:

```text
Codex:       $qarinah
Claude Code: /qarinah continue the provenance-bound release
Cursor:      use the project MCP configuration and Qarinah rule
Any CLI:     npx qarinah query "continue the provenance-bound release"
```

### Reproduce the Agent A to Agent B pipeline

From the project root, let Agent A record the reviewed handoff and rebuild the disposable read model:

```sh
printf '%s' '{"kind":"decision","title":"Release pipeline","body":"Run the verified package check before publishing.","actor":{"type":"agent","id":"agent-a"},"sourceId":"decision:release-pipeline"}' \
  | qarinah record --stdin-json
qarinah build
```

Then open a second terminal or agent anywhere beneath the same project root:

```sh
qarinah status
printf '%s' '{"query":"continue the release pipeline","format":"markdown","minimumCoverage":"direct","maxTokens":1500}' \
  | qarinah query --stdin-json
```

Both hosts must report the same `workspaceId`. The returned item must carry the Agent A event ID and hash. `qarinah doctor` verifies the chain and `qarinah build` can recreate `.qarinah/index/qarinah.db` after that database is deleted.

## What the next agent receives

A handoff pack can include:

- current decisions and their source event IDs;
- tool outcomes and observed results;
- files, symbols, documents, and typed code relationships;
- superseded decisions and unresolved conflicts;
- file, dependency, branch, and commit freshness signals;
- direct citations and content hashes for every selected memory item;
- explicit coverage diagnostics when the available evidence is incomplete.

The pack is not an opaque replacement summary. The authoritative event ledger remains available for verification, and every derived view can be rebuilt.

## How the context engine works

Qarinah uses local-first temporal project memory built from:

- an authoritative append-only event ledger;
- a disposable SQLite WAL read database;
- FTS5 and deterministic lexical retrieval;
- typed relationship traversal;
- temporal validity, freshness, conflict, and supersession checks;
- authority and repository-boundary scoring;
- compact cited context packs with hard output budgets;
- optional local embeddings and rerankers that never replace citations.

The default `admission-first-v2` ranking profile filters repository, time, retention, disclosure, and supersession boundaries before ranking, preserves admissible BM25 order as its first stage, and uses fuzzy and graph evidence only to fill or support that candidate set. `strict-before` queries can exclude evidence recorded at the exact checkpoint. Evidence-sufficiency diagnostics are experimental until calibrated on independently reviewed relevance labels.

This makes Qarinah a universal context engine for software projects while keeping each workspace, repository, and source authority explicit.

## Published proof

Qarinah's published evaluator measured 442,113 estimated input-context tokens for full-history replay and 5,682 for the same current sources plus Qarinah packs. That is **98.71% less estimated repeated project context**, with every required target directly covered in the top five for the evaluated tasks.

The result measures the compared repeated input-context slice. Read the [methodology and machine-readable evidence](BENCHMARKS.md) before applying it to a different workload or total provider bill.

The separate 42-record continuation fixture retrieves an evidence-linked handoff in 1,039 estimated tokens versus 9,489 for full-ledger replay (89.05% less), preserves all three source IDs and hashes, and verifies that a fresh-session read does not mutate stale derived files. An authenticated two-session Codex smoke additionally verifies actual continuation and test completion on a synthetic fixture; it remains product evidence rather than a controlled research result.

## Long-term direction

Qarinah is building one universal context layer for every agent working on your software: project-owned, cross-agent, inspectable, temporal, and portable.

Start with the [five-minute setup](GETTING-STARTED.md), review the [host integrations](HOST-INTEGRATIONS.md), or inspect the [architecture](ARCHITECTURE.md).
