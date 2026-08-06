# CLI reference

Qarinah ships one executable, `qarinah`, from the `qarinah` npm package. The CLI is a local interface to the same workspace, event, graph, retrieval, export, hook, and MCP implementations exposed by the JavaScript API.

## Requirements and invocation

- Node.js 22, 24, or 26.
- An explicitly initialized workspace for every command except `help`, `init`, `policy`, and `trust`.
- Machine-local trust for commands that read or change the ledger.

Install in a project and invoke through npm:

```sh
npm install --save-dev qarinah
npx qarinah --help
```

Or install globally:

```sh
npm install --global qarinah
qarinah --help
```

All commands that omit a path use the current working directory. Workspace lookup normally starts there and finds the initialized Qarinah root. Commands such as `scan`, `build`, `record`, and `query` operate on that trusted root; they do not accept an arbitrary output workspace.

## Output and exit behavior

- Successful commands write their result to standard output.
- Most successful results are pretty-printed JSON followed by a newline.
- `query --format markdown` writes a rendered cited pack.
- `hook ... --quiet` writes no success result.
- `mcp` reserves standard output for newline-delimited JSON-RPC.
- Failures write one JSON object to standard error:

```json
{
  "ok": false,
  "code": "WORKSPACE_NOT_TRUSTED",
  "message": "This machine has not approved capture for this workspace."
}
```

- Ordinary failures exit with status `1`.
- `doctor` exits with status `2` when the event store verifies but the derived graph/index/Markdown state is missing, stale, or invalid.
- Success exits with status `0`.
- Errors raised by Qarinah use their stable `QarinahError.code`. Argument and other unexpected errors use `QARINAH_ERROR`.

## Command summary

```text
qarinah init [path] [--capture metadata|content]
qarinah policy [path]
qarinah trust [path] --capture metadata|content --policy-hash sha256:<digest>
qarinah untrust
qarinah enable
qarinah disable
qarinah record [options]
qarinah record --stdin-json
qarinah hook codex|claude [--quiet]
qarinah scan [options]
qarinah build
qarinah query [text] [options]
qarinah query --stdin-json
qarinah context [text] [options]
qarinah export okf [--output <path>]
qarinah doctor
qarinah status
qarinah mcp
```

`query` and `context` are aliases.

## `help`

```sh
qarinah help
qarinah --help
qarinah -h
```

Prints the built-in usage summary. Any unknown command fails and includes the same summary in its error message.

## `init`

Initialize one exact project root.

```sh
qarinah init [path] [--capture metadata|content]
```

| Argument or option | Default | Meaning |
| --- | --- | --- |
| `path` | Current directory | Project root to initialize. |
| `--capture metadata` | Default | Retain metadata fields but not content bodies exposed by adapters. |
| `--capture content` | - | Permit bounded, redacted content capture from supported adapters. |

Example:

```sh
npx qarinah init . --capture metadata
```

Output:

```json
{
  "ok": true,
  "root": "/absolute/project/root",
  "workspaceId": "ws_...",
  "capture": "metadata"
}
```

Fresh initialization writes the portable workspace configuration and grants machine-local consent for that exact new policy. Trust remains machine-local rather than portable: after cloning the workspace onto another machine, or after changing its policy, review the requested policy with `policy` and approve its current digest with `trust`.

## `policy`

Inspect the exact requested policy without granting permission.

```sh
qarinah policy [path]
```

The command accepts at most one path and no options. Its JSON result includes:

- `schemaVersion`
- real workspace `root`
- `workspaceId`
- `enabled`
- `capture`
- event, log, and context limits
- retention class
- `policyHash`

Use the returned capture mode and hash as explicit input to `trust`.

```sh
npx qarinah policy .
```

`policy` is read-only and does not create or upgrade machine trust.

## `trust`

Approve the exact portable policy on the current machine.

```sh
qarinah trust [path] --capture metadata|content --policy-hash sha256:<digest>
```

Both options are required. The capture value and digest must match the policy currently stored in the workspace. The command rejects:

- more than one positional path;
- missing options;
- unknown or repeated options;
- a capture choice or hash that does not match the current policy.

Recommended review flow:

```sh
npx qarinah policy . > qarinah-policy.json
# Review qarinah-policy.json.
npx qarinah trust . \
  --capture metadata \
  --policy-hash sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

The result reports the approved root, workspace ID, capture mode, policy hash, trust state, event count, and head hash.

## `untrust`

Revoke the current machine's permission for the workspace selected from the current directory.

```sh
npx qarinah untrust
```

Output:

```json
{
  "root": "/absolute/project/root",
  "workspaceId": "ws_...",
  "trusted": false
}
```

Revocation does not delete the repository's `.qarinah` files.

## `enable` and `disable`

Change the portable enabled state and matching machine-local permission state for the current workspace.

```sh
npx qarinah disable
npx qarinah enable
```

Output:

```json
{
  "ok": true,
  "enabled": false
}
```

These commands do not change `metadata` versus `content`. Review policy changes with `policy` and `trust`.

## `record`

Append one validated event to the authoritative hash-chained JSONL record.

### Argument form

```sh
qarinah record \
  --kind <event-kind> \
  --title <title> \
  [--body <text>] \
  [--data-json <json-object>] \
  [--actor-type human|agent|tool|system|source] \
  [--actor-id <id>] \
  [--session <id>] \
  [--turn <id>] \
  [--confidence extracted|inferred|claimed|verified] \
  [--relation type:target]... \
  [--source-id <id>] \
  [--retention session|project|durable]
```

Defaults:

| Field | Default |
| --- | --- |
| `body` | Empty string |
| `data` | `{}` |
| `actor` | `{ "type": "human", "id": "local-user" }` |
| `sessionId`, `turnId`, `sourceId` | `null` |
| `confidence` | `claimed` |
| `relations` | Empty array |
| provenance adapter | `qarinah-cli` |
| retention | `{ "class": "project", "expiresAt": null }` |

Supported event kinds:

```text
session.started
prompt.submitted
tool.requested
tool.completed
turn.completed
compaction.started
compaction.completed
artifact
source
claim
decision
approval
summary
```

Supported relation types:

```text
derived_from
produced
changed
supports
contradicts
supersedes
authorized_by
governed_by
affects
references
```

Repeat `--relation` to attach several relations:

```sh
npx qarinah record \
  --kind decision \
  --title "Use idempotent checkout writes" \
  --body "Every checkout mutation carries the client operation id." \
  --confidence verified \
  --relation affects:src/checkout.ts \
  --relation derived_from:evt_00000000-0000-4000-8000-000000000000
```

`--data-json` must parse as JSON and the validated event contract requires an object. A relation must use `type:target`.

### Strict JSON stdin form

Use this form for agents and tools so model-controlled text is not interpolated into a shell command:

```sh
printf '%s' '{
  "kind": "decision",
  "title": "Keep migration idempotent",
  "body": "Use the existing operation id as the replay key.",
  "confidence": "verified",
  "relations": [
    { "type": "affects", "target": "src/migrations.ts" }
  ]
}' | npx qarinah record --stdin-json
```

Allowed top-level fields:

```text
kind
title
body
data
actor
sessionId
turnId
confidence
relations
sourceId
retention
```

Rules:

- Input is limited to 131,072 bytes.
- Input must be exactly one JSON object.
- `--stdin-json` cannot be combined with a positional or another option.
- Unknown fields fail.
- `kind` and `title` are required.
- Defaults match the argument form.

On success, both forms print the complete stored `qarinah.event.v1` envelope, including the event ID, workspace ID, timestamps, hashes, previous hash, provenance, and retention.

## `hook`

Normalize one supported host lifecycle event from standard input and pass it to the corresponding capture adapter.

```sh
qarinah hook codex [--quiet]
qarinah hook claude [--quiet]
```

The input must be one JSON value and is limited to 1,048,576 bytes.

```sh
printf '%s' '{"hook_event_name":"SessionStart","session_id":"session-1"}' \
  | npx qarinah hook claude
```

Normal output is a compact JSON result:

```json
{"captured":true,"eventId":"evt_...","hash":"sha256:..."}
```

An adapter may return `captured: false` with a reason when the event is recognized but should not be retained. `--quiet` suppresses this success output. Hook adapters never authorize an uninitialized, untrusted, disabled, or incompatible workspace.

## `scan`

Record a bounded project-structure snapshot for the trusted workspace root.

```sh
qarinah scan \
  [--max-files <integer>] \
  [--max-file-bytes <integer>] \
  [--max-total-bytes <integer>] \
  [--max-depth <integer>]
```

`scan` accepts options only. Every value must contain decimal digits. The implementation applies its own safe bounds and rejects escapes, excessive paths, linked-path violations, and configured limits.

```sh
npx qarinah scan \
  --max-files 5000 \
  --max-file-bytes 1048576 \
  --max-total-bytes 67108864 \
  --max-depth 32
```

The result includes:

- `captured`
- `unchanged`
- stable `eventId`
- optional stored event `hash`
- `snapshotHash`
- `fileCount`
- `directoryCount`
- optional `changes` containing added, changed, deleted, and renamed paths

If a new snapshot is captured, the CLI rebuilds derived state before returning.

## `build` and `rebuild`

Verify the authoritative event record and deterministically rebuild its graph, retrieval index, Markdown view, and event-ID projection.

```sh
npx qarinah build
npx qarinah rebuild
```

The commands are exact aliases. The result reports the workspace ID, event count, head hash, and rebuilt projections, including `.qarinah/index/qarinah.db`.

Use `build` after moving a valid ledger between machines, after deleting a disposable derived view, or when `doctor` reports derived state as missing or stale. It does not repair a corrupt authoritative event chain.

## `query` and `context`

Compile a bounded, cited `qarinah.context-pack.v2`.

```sh
qarinah query [text] \
  [--format json|markdown|handoff] \
  [--limit <integer>] \
  [--max-chars <integer>] \
  [--max-tokens <integer>] \
  [--reserve-tokens <integer>] \
  [--as-of <timestamp>] \
  [--minimum-coverage any|partial|direct] \
  [--minimum-evidence any|partial|direct] \
  [--ranking-profile balanced-v1|admission-first-v2] \
  [--temporal-boundary inclusive|strict-before]
```

`context` accepts the same inputs.

Defaults:

| Option | Default | Verified range or behavior |
| --- | --- | --- |
| `text` | Empty query | Positional words are joined with spaces; maximum 4,096 characters. |
| `--format` | `json` | `json`, `markdown`, or a compact evidence-linked `handoff` capsule. |
| `--limit` | `20` | 1 to 1,000 through JSON stdin; core API enforces the same range. |
| `--max-chars` | Workspace `contextMaxChars` | 512 to 1,000,000, capped by workspace policy. |
| `--max-tokens` | Token planning disabled unless a token option is supplied | 128 to 1,000,000. |
| `--reserve-tokens` | When token planning is enabled, 10% capped at 2,048 | 0 through `maxTokens - 64`. |
| `--as-of` | Current UTC time | Retrieval time boundary. |
| `--minimum-coverage` | `any` | `partial` rejects no-evidence packs; `direct` requires one event containing all normalized query terms. |
| `--minimum-evidence` | `any` | `partial` allows an informational partial pack; `direct` requires the conservative `ACCEPT_DIRECT` decision. Partial evidence remains an abstention for sufficiency claims. |
| `--ranking-profile` | `admission-first-v2` | Preserves admissible BM25 order before fuzzy and graph fill. `balanced-v1` reproduces the original RRF profile. |
| `--temporal-boundary` | `inclusive` | `strict-before` excludes evidence recorded at the exact query timestamp. |

Example:

```sh
npx qarinah query "checkout idempotency" \
  --format markdown \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --reserve-tokens 200
```

JSON output includes:

- workspace and query identity;
- exact character accounting and estimated token accounting;
- retrieval strategy and `asOf` time;
- evidence coverage;
- conflict and supersession diagnostics when relevant;
- complete cited items;
- truncation state;
- a deterministic manifest hash.

When evidence diagnostics are requested, `evidence-sufficiency-v2` returns a three-state assessment plus a separate decision. `DIRECTLY_SUPPORTED` maps to `ACCEPT_DIRECT`; `PARTIALLY_SUPPORTED` and `INSUFFICIENT_EVIDENCE` map to `ABSTAIN`. The direct threshold was selected on development data and does not prove semantic correctness on unseen queries.

The portable fallback token estimate is `ceil(characters / 4)` and is marked inexact. It is not a provider billing receipt.

`--format handoff` requires an evidence-linked summary among the selected pack items. It returns at most 512 characters containing the untrusted-data boundary, bounded summary title/body, selected summary event ID/hash, full-pack manifest hash, confidence, and source count. The complete pack retains the source event IDs and hashes for audit; the capsule does not duplicate them into model-facing text.

### Strict JSON stdin form

```sh
printf '%s' '{
  "query": "checkout idempotency",
  "format": "json",
  "limit": 10,
  "maxTokens": 1500,
  "reserveTokens": 200,
  "minimumCoverage": "direct",
  "minimumEvidence": "partial",
  "rankingProfile": "admission-first-v2",
  "temporalBoundary": "strict-before",
  "includeEvidenceSufficiency": true
}' | npx qarinah query --stdin-json
```

Allowed fields:

```text
query
format
limit
maxChars
maxTokens
reserveTokens
asOf
minimumCoverage
minimumEvidence
rankingProfile
temporalBoundary
includeEvidenceSufficiency
```

Rules:

- Input is limited to 16,384 bytes.
- Input must be exactly one JSON object.
- Unknown fields fail.
- `query` is at most 4,096 characters.
- `limit`: 1 to 1,000.
- `maxChars`: 512 to 1,000,000.
- `maxTokens`: 128 to 1,000,000.
- `reserveTokens`: 0 to 999,936; the core also requires at least 64 usable tokens.

## `export okf`

Create a deterministic Open Knowledge Format 0.1 Draft Markdown bundle.

```sh
qarinah export okf [--output <path>]
```

```sh
npx qarinah export okf
npx qarinah export okf --output .qarinah/records/okf
```

The result reports:

- `schemaVersion: "qarinah.okf-export.v1"`
- `okfVersion: "0.1"`
- `derived: true`
- authoritative source path
- workspace ID, event count, and head hash
- bundle hash and file count
- output directory

The destination must remain inside the workspace, outside protected `.git` and authoritative Qarinah locations, and either be absent or be a valid Qarinah-owned prior export. Qarinah refuses to overwrite an arbitrary directory.

## `doctor`

Verify the selected workspace without repairing it.

```sh
npx qarinah doctor
```

`doctor` verifies the machine-local trust checkpoint and authoritative event chain, then loads persisted derived state without rebuilding it.

Current state:

```json
{
  "ok": true,
  "workspaceId": "ws_...",
  "eventCount": 12,
  "headHash": "sha256:...",
  "capture": "metadata",
  "derived": "current"
}
```

If the store is valid but derived state is unavailable, the command prints `ok: false`, reports `derived` as `missing` or an error code such as `INDEX_STALE`, and exits with status `2`. Run `build` only after confirming that the authoritative record is valid.

## `status`

Verify and report the current store plus portable configuration state.

```sh
npx qarinah status
```

The result includes store verification fields plus `enabled` and `maxLogBytes`. Unlike `doctor`, this command does not separately report whether persisted derived state is current.

## `setup`

Initialize one project, install project-local Codex, Claude Code, and Cursor integrations, configure MCP, rebuild views, and run an integrity check:

```sh
npx qarinah setup . --codex --claude --cursor --capture content --allow-query
```

Omit host flags to configure all three. Omit `--allow-query` for diagnostic-only MCP. With `--allow-query`, setup binds the zero-write `context.query` tool to the exact workspace's current consent-policy hash and response ceilings.

## `mcp`

Start the native zero-write diagnostic MCP stdio server:

```sh
npx qarinah mcp
```

The process reads newline-delimited JSON-RPC from standard input and writes protocol messages only to standard output. It exposes two zero-write diagnostic tools:

- `context_status`
- `context_doctor`

Enable bounded context retrieval only with an exact reviewed permit:

```sh
npx qarinah mcp --allow-query --policy-hash sha256:<digest> --max-chars 12000 --max-items 20
```

This adds the zero-write `context.query` tool. Ledger writes remain unavailable. See [MCP guide](MCP-GUIDE.md).

## `dashboard`

Generate a self-contained, read-only HTML view from the verified workspace ledger:

```sh
npx qarinah dashboard \
  [--output <workspace-relative-html-path>] \
  [--baseline-tokens <non-negative-integer> \
   --delivered-tokens <non-negative-integer>]
```

The default output is `.qarinah/dashboard/index.html`. The command prints JSON containing the resolved output path, totals, and context-savings state.

Rules:

- the command accepts options only;
- `--output` must resolve inside the initialized workspace;
- baseline and delivered estimates must be supplied together;
- token estimates must be non-negative integers no greater than `1,000,000,000`;
- without estimates, context savings is reported as `not-measured`; and
- the generated file is a static derived view, not a writer or hosted control plane.

```sh
npx qarinah build
npx qarinah scan
npx qarinah dashboard --baseline-tokens 12000 --delivered-tokens 1500
```

The dashboard contains current and superseded decisions, explicit conflicts, source-linked events, the latest 100 permitted activity events, affected files from the latest scan, workspace capture mode, and the optional measured comparison. See the [local memory dashboard guide](DASHBOARD.md) for field semantics, population recipes, JavaScript usage, privacy guidance, and troubleshooting.

## Other team-memory commands

```sh
npx qarinah task-pack debugging "checkout timeout"
npx qarinah freshness
```

See [Shared and verifiable team memory](TEAM-MEMORY.md) for all seven task profiles, freshness states, multi-repository retrieval, semantic adapters, encrypted team bundles, evaluation, and causal receipts.

## Common errors

| Code or message | Meaning | Correct action |
| --- | --- | --- |
| `WORKSPACE_NOT_INITIALIZED` | No exact initialized root is available. | Run `qarinah init` at the intended root. |
| `WORKSPACE_NOT_TRUSTED` | This machine has no valid permit. | Run `policy`, review it, then run `trust` with the exact mode and hash. |
| `WORKSPACE_DISABLED` | Portable capture is disabled. | Review the workspace and run `enable` if appropriate. |
| `TRUST_REVIEW_REQUIRED` / `CAPTURE_NOT_APPROVED` | Portable policy and machine approval differ. | Review the new policy and approve its exact digest. |
| `INDEX_STALE` / `INDEX_INVALID` | Derived state does not match the verified log. | Run `doctor`; if the log is valid, run `build`. |
| `CONTEXT_COVERAGE_TOO_LOW` | The retrieved evidence did not meet the requested coverage. | Refine the query or intentionally lower `minimumCoverage`. |
| `CONTEXT_EVIDENCE_INSUFFICIENT` | The evidence-sufficiency assessment did not meet the requested gate. | Refine the query, inspect the reason codes, or intentionally lower `minimumEvidence`. |
| `CONTEXT_BUDGET_TOO_SMALL` | Required pack framing cannot fit. | Increase the character/token budget or reduce reserved headroom. |
| `PROJECT_SCAN_LIMIT` | The scan exceeded a configured bound. | Narrow the workspace or review and raise the relevant limit. |
| `STORE_BUSY` | Another writer holds the renewable append lock. | Wait for that operation; investigate only if it does not clear. |
| `CHECKPOINT_ROLLBACK` / `CHECKPOINT_MISMATCH` | The log is older than or differs from the trusted checkpoint. | Stop. Restore the reviewed authoritative record; do not rebuild over it. |

See [Troubleshooting](TROUBLESHOOTING.md) for recovery procedures and boundaries.
