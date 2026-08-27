# Getting started

Qarinah is the evidence-linked cross-agent context engine for software projects. It lets Codex, Claude Code, Cursor, Kimi, Antigravity, and compatible MCP clients continue the same project using a shared, cited record of decisions, outcomes, code relationships, and current evidence. It works for one developer and one repository, across several supported coding agents, or as the memory layer in a larger team workflow. Maqam integration is optional.

Its primary job is verified handoffs between coding agents: start a task in one agent, record the permitted outcome, switch agents, and request a compact cited handoff instead of replaying the complete project history. See the [cross-agent handoff guide](CROSS-AGENT-HANDOFFS.md).

Qarinah gives an agent a small, cited slice of project memory instead of replaying the full retained history. The record stays in the project and the generated SQLite index, graph, Markdown, JSON, dashboard, and OKF views can be rebuilt from it.

## Try the isolated demo first

Run one command before giving Qarinah access to a real project:

```sh
npx qarinah demo
```

The command creates a populated workspace under the operating-system temporary directory. It does not edit the current repository, configure an agent host, enable telemetry, or send project data anywhere. The JSON result includes:

- the temporary workspace and dashboard paths;
- the number of mapped fixture files;
- a retained retry-policy decision with its event ID and SHA-256 hash;
- the exact query that reconstructs that decision;
- commands to open the real interactive circular graph.

The expected decision is **Retry checkout requests three times**. Its cited body explains that only HTTP 429 and 503 use exponential backoff. This is the smallest reproducible fresh-session handoff Qarinah provides.

Watch the exact flow in the [two-minute fresh-session handoff](https://qarinah.io/assets/qarinah-fresh-session-handoff.mp4). The recording uses the isolated fixture's real output and graph; it does not display a fictional product screen or claim that an external provider session was deleted.

If the repository uses Git worktrees, run setup inside each checkout that should remember its own activity. Qarinah keeps those ledgers isolated and can group the initialized siblings later:

```sh
npx qarinah setup . --capture content
npx qarinah worktrees
npx qarinah dashboard --serve --worktrees
```

The setup command never silently initializes sibling worktrees. This prevents parallel branches from writing to the same ledger while still giving the dashboard a shared repository view.

For a real project, the safe default setup is:

```sh
npx qarinah@latest setup .
```

This uses metadata capture, keeps context disclosure disabled, and does not share activation measurements. It maps the bounded project structure, creates the local ledger and reproducible read models, writes the dashboard, and prints the exact query and dashboard commands to try next.

## Requirements

- Node.js 22, 24, or 26
- a local project you are allowed to index
- explicit initialization in that project

## Install a pinned development dependency when needed

```sh
npm install --save-dev qarinah@latest
```

Qarinah has no hosted memory service, embedding bill, vector database, or Qarinah API key.

## Initialize one project

Run this from the exact project root:

```sh
npx qarinah init .
```

Metadata-only capture is the default. If the project may retain bounded content exposed by supported hooks, opt in explicitly:

```sh
npx qarinah init . --capture content
```

Initialization creates the portable project configuration, an empty SQLite/FTS5 read model, graph, retrieval index, and readable Markdown view. It also requests machine-local trust. Trust and revocation stay outside the repository so a cloned configuration cannot silently grant itself permission.

For a content-enabled setup connected to selected supported hosts, make every broader permission explicit:

```sh
npx qarinah setup . --codex --claude --cursor --capture content
npx qarinah overview
```

`setup` records a bounded project-structure snapshot before it reports success. `overview` explains the retained work, latest outcomes, codebase areas, languages, relationships, and durable files in one readable page.

To help the maintainer measure adoption without receiving project data, optionally add `--share-activation`. This is off by default and emits five once-only content-free milestones. Inspect or revoke the choice locally:

```sh
npx qarinah activation status
npx qarinah activation disable
```

Read the [privacy contract](../PRIVACY.md#optional-content-free-activation-measurement) before opting in.

## Record one durable decision

```sh
npx qarinah record \
  --kind decision \
  --title "Keep releases provenance-bound" \
  --body "Publish only the reviewed artifact from the reviewed commit."
```

The event is validated, redacted under the active policy, assigned a stable ID, content-hashed, and appended to the hash-chained JSONL record.

## Scan and build

```sh
npx qarinah scan
npx qarinah build
```

`scan` records a bounded project-structure snapshot. `build` verifies the canonical record and deterministically rebuilds the typed graph, hybrid retrieval index, Markdown view, and idempotency projection.

## Bring in an existing agent history

If Codex, Claude, or another host has already exported visible session history as JSONL or NDJSON, import it without loading the entire archive into memory:

```sh
npx qarinah import ./agent-exports --format auto --mode compact
npx qarinah overview
```

Compact mode retains cited session summaries, outcomes, tool names, timestamps, and source digests. Full mode is available for separately retaining each supported visible turn in a content-authorized workspace. Kimi's documented stream-json output is supported with `--format kimi`. Hidden reasoning and credentials are not imported. See [agent archive import](AGENT-ARCHIVE-IMPORT.md) and [host compatibility](HOST-COMPATIBILITY.md).

## Query a small cited pack

```sh
npx qarinah query "release provenance" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --reserve-tokens 200 \
  --format markdown
```

The pack includes complete selected records, event IDs, hashes, a retrieval manifest, and deterministic evidence-coverage diagnostics. `minimum-coverage direct` rejects a result unless one selected record contains every normalized query term.

The default `admission-first-v2` profile first removes records that are out of repository, time, retention, disclosure, or supersession scope, then preserves BM25 order for the remaining lexical candidates. Typo-tolerant and graph matches may fill gaps, but cannot reintroduce rejected records. Research checkpoints should use `--temporal-boundary strict-before` so a record created at the task timestamp cannot leak into that task's query.

An additional experimental evidence-sufficiency diagnostic can be requested with `--minimum-evidence partial` or `--minimum-evidence direct`. In v2, partial evidence is an abstention; only the conservative direct state is accepted. The production-bound development-v0.4 recomputation observed zero direct false accepts under the structural oracle among 49 static and 31 online negative cases, but exact 95% upper bounds remain 7.25% and 11.22% and direct coverage is only 4.17%-6.25%. Treat it as a workflow signal rather than proof that retrieved context is semantically sufficient.

For agent callers, use JSON stdin:

```sh
printf '%s' '{"query":"release provenance","format":"json","minimumCoverage":"direct","minimumEvidence":"partial","temporalBoundary":"strict-before","includeEvidenceSufficiency":true,"maxChars":8000}' \
  | npx qarinah query --stdin-json
```

## Verify the workspace

```sh
npx qarinah doctor
npx qarinah status
```

`doctor` verifies policy, event hashes, the chain, rollback checkpoint, and derived state. `status` reports the selected workspace and capture mode without mutating it.

## Connect Codex or Claude Code

Install the reviewed plugin for the host, restart the host, then initialize each project that should retain permitted context. Plugin installation can be host-wide while capture permission remains project-specific.

Continue with [Codex and Claude Code integrations](HOST-INTEGRATIONS.md).

## Durable files

```text
.qarinah/
  config.json
  events/events.jsonl
  graph/graph.json
  index/index.json
  index/qarinah.db
  records/CONTEXT.md
  records/okf/
  index/event-ids/
```

`events/events.jsonl` is authoritative. Delete any derived view and run `qarinah build` to reproduce it.
