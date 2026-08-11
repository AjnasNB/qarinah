# Bring old agent work into Qarinah

Qarinah can turn an exported coding-agent history into durable project memory. This is useful when a native chat is about to be deleted, when work moves from one coding agent to another, or when a project already has months of visible conversation and tool results.

The importer reads JSON Lines (`.jsonl` or `.ndjson`) exports from Codex, Claude, or a portable agent format. It streams the source one line at a time, so the complete archive is not loaded into memory. The default input ceiling is 100 GiB and every byte, file, record, and line limit can be lowered by the operator.

## The safe default: compact import

```sh
npx qarinah import /path/to/agent-exports --format auto --mode compact
npx qarinah overview
npx qarinah query "what happened to the billing migration?" --format markdown
```

Compact mode records one cited summary for each imported session. It keeps:

- what the user asked for;
- the latest visible outcomes;
- visible session summaries;
- tool names and activity counts;
- timestamps, source digests, and session identity; and
- searchable key terms.

It does not copy hidden reasoning, encrypted reasoning blocks, credentials, browser session state, or arbitrary private model internals. Qarinah cannot recover content that was never exported or recorded.

## Full visible-history import

```sh
npx qarinah import ./portable-history.ndjson --format portable --mode full
```

Full mode records each supported visible user message, assistant outcome, tool request, tool result, session marker, and summary as a separate Qarinah event. It requires a workspace initialized with `--capture content` and remains subject to the workspace's event and ledger limits.

Use compact mode for very large archives. Use full mode only when individual visible turns must remain independently retrievable.

## Portable JSONL format

Any coding host can produce one JSON object per line using fields such as:

```json
{"type":"session","sessionId":"project-42","timestamp":"2026-08-11T09:00:00Z"}
{"role":"user","sessionId":"project-42","content":"Upgrade the billing migration."}
{"role":"assistant","sessionId":"project-42","content":"Migration 18 passed and rollback was verified."}
{"type":"tool_result","sessionId":"project-42","toolName":"test","output":"All tests passed."}
```

This portable boundary lets another host—including a future or less common coding agent—feed visible history into Qarinah without claiming a native integration that has not been tested.

## What survives a deleted native chat

Once the import succeeds, the permitted record lives beside the project in `.qarinah/events/events.jsonl`. SQLite search, the graph, and readable Markdown are rebuildable from that ledger. A later Codex, Claude Code, Cursor, CLI, or authorized MCP client can request a small cited pack from the retained record.

This continuity applies only to content Qarinah actually captured or imported. Deleting both the native history and the project-owned `.qarinah` ledger removes the available record unless the operator has an authorized backup or encrypted team bundle.

## Large-archive limits

Defaults are deliberately explicit:

| Limit | Default |
| --- | ---: |
| Source bytes | 100 GiB |
| Files | 100,000 |
| JSONL records | 10,000,000 |
| One JSONL line | 4 MiB |
| Sessions in one file | 50,000 |

Example with tighter limits:

```sh
npx qarinah import ./exports \
  --mode compact \
  --max-bytes 10737418240 \
  --max-files 10000 \
  --max-records 2000000 \
  --max-line-bytes 1048576
```

The published 98.71% repeated-context result comes from Qarinah's committed six-fixture benchmark. Archive import has a different job: turn permitted historical exports into searchable session memory. Do not treat the fixture result as a guarantee that every imported archive will compress by the same percentage.

## Verify the result

```sh
npx qarinah doctor
npx qarinah overview --format markdown
npx qarinah query "latest release outcome" --minimum-coverage direct --format markdown
```

Re-importing the same unchanged export is idempotent: the verified event IDs are reused instead of duplicating memory.
