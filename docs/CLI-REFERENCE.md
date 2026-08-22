# CLI reference

## Git worktrees

```bash
npx qarinah worktrees
```

Lists up to 64 live Git worktrees for the current repository. Each entry includes the repository group ID, worktree ID, canonical root, branch, commit, linked/detached state, and whether that exact checkout has its own initialized Qarinah ledger. Remote URLs and credentials are never included.

To open every initialized sibling worktree in one local dashboard:

```bash
npx qarinah dashboard --serve --worktrees
```

Each card still reads a separate project-owned ledger. Use repeated `--project <path>` when you want to add initialized workspaces from unrelated repositories explicitly.

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
qarinah setup [path] [--codex] [--claude] [--cursor] [--kimi] [--antigravity] [--freebuff] [--auto-compact] [--share-activation]
qarinah demo [--output <empty-directory>]
qarinah activation status | enable | disable
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
qarinah import <archive-file-or-directory> [options]
qarinah overview [--format json|markdown]
qarinah map [query] [--limit n] [--type memory,file,concept,directory,reference] [--repository id,...] [--scope id,...] [--as-of timestamp]
qarinah archive create <workspace-relative-source> [--label text]
qarinah archive list
qarinah archive verify <archive-id>
qarinah archive restore <archive-id> --destination <directory>
qarinah archive delete <archive-id> --confirm <archive-id>
qarinah archive gc --confirm-workspace <workspace-id>
qarinah archive erase-key --confirm-workspace <workspace-id>
qarinah symbols build
qarinah symbols query [text] [--limit n] [--kind function,class,...]
qarinah proof <query> [--format json|markdown] [--max-tokens n] [--max-chars n] [--limit n] [--symbol-limit n] [--file-limit n] [--fact-limit n] [--persist-symbols]
qarinah harness [query] [--worktrees] [--record] [--no-rebuild] [--format json|markdown] [options]
qarinah query [text] [options]
qarinah query --stdin-json
qarinah context [text] [options]
qarinah export okf [--output <path>]
qarinah doctor
qarinah status
qarinah mcp
```

`query` and `context` are aliases.

## `proof`

Compile one tamper-evident task packet from admitted project memory, temporal cited facts, and query-ranked repository symbols:

```sh
npx qarinah scan
npx qarinah proof "verify signed release receipts" --format markdown --max-tokens 4096
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--format` | `json` | Emit strict JSON or inspectable Markdown. |
| `--max-tokens` | `4096` | Bound the complete packet from 1,024 to 1,000,000 declared estimator tokens. |
| `--max-chars` | `64000` | Bound memory compilation before the complete packet budget is enforced. |
| `--limit` | `24` | Maximum admitted memory events before packet trimming. |
| `--symbol-limit` | `80` | Maximum symbol-query candidates before file grouping. |
| `--file-limit` | `16` | Maximum ranked repository files before complete-budget trimming. |
| `--fact-limit` | `24` | Maximum cited facts before complete-budget trimming. |
| `--persist-symbols` | Off | Persist the rebuilt symbol graph. Without it, proof compilation is read-only. |

The result uses schema `qarinah.proof-context.v1`. When no verified project scan exists, the memory and fact sections remain available and the repository section explicitly explains why symbols are absent. Run `qarinah scan` to include code identities. Read [PROOF-CARRYING-CONTEXT.md](PROOF-CARRYING-CONTEXT.md).

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

## `map`

Search the bounded linked-memory and repository-map projection.

```sh
qarinah map [query] \
  [--limit <1-100>] \
  [--type <memory,file,concept,directory,reference>] \
  [--repository <id,...>] \
  [--scope <id,...>] \
  [--as-of <timestamp>]
```

`--type`, `--repository`, and `--scope` accept comma-separated values. `--as-of` applies temporal validity and supersession at the supplied canonical timestamp. Restricted records require a matching disclosure scope. Repository selectors exclude identified records from other repositories. Results include evidence identities and the exact `localSemantic`, `linkedEvidence`, and `structuralImportance` score components. In coverage, `projectedEvents` counts admitted as-of event nodes, `omittedEvents` counts events outside the bounded source window, and `sourceEvents` is their conservative sum. `projectionComplete` and `authorityComplete` are separate. Treat an absent match as exhaustive only when both flags are `true`.

Admission is applied before the event window is bounded. A future, restricted, or other-repository event therefore cannot consume a slot that would otherwise hold an admitted event.

Run `qarinah scan` before `map` when file and directory results are required. The linked view remains disposable derived state and `qarinah build` can regenerate it from the verified event record.

## `harness`

Compile one coding-agent context checkpoint from the verified ledger:

```sh
npx qarinah harness "release readiness" --format markdown
npx qarinah harness "release readiness" --record
npx qarinah harness "release readiness" --worktrees
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--worktrees` | Current worktree only | Inspect every initialized sibling worktree and keep each pack separate. This mode is read-only and cannot be combined with `--record`. |
| `--record` | Off | Append one idempotent, evidence-linked checkpoint for the current non-harness source head. |
| `--no-rebuild` | Off | Append without immediately rebuilding disposable SQLite, graph, Markdown, and dashboard projections. Automatic Stop hooks use this lighter mode. |
| `--format json\|markdown` | `json` | Select structured or readable output. |
| `--max-chars n` | `12000` | Bound the compiled pack. |
| `--max-tokens n` | Workspace character budget | Add a portable token ceiling. |
| `--reserve-tokens n` | `0` | Reserve model-output space within the token plan. |
| `--limit n` | `20` | Bound selected source events from 1 to 64. |
| `--max-summary-chars n` | `2000` | Bound deterministic or host-model summary text. |
| `--quiet` | Off | Suppress stdout for a host hook. |

Every ready result includes exact selected event IDs and hashes, the context-pack manifest, actual portable token estimates for that retained ledger and pack, and the scoped published comparison. The embedded 98.71% figure is the published six-fixture repeated-input estimate (442,113 versus 5,682 tokens), not a guarantee for this invocation. See [Coding context harness](CODING-CONTEXT-HARNESS.md).

## `build` and `rebuild`

Verify the authoritative event record and deterministically rebuild its graph, retrieval index, Markdown view, and event-ID projection.

```sh
npx qarinah build
npx qarinah rebuild
```

The commands are exact aliases. The result reports the workspace ID, event count, head hash, and rebuilt projections, including `.qarinah/index/qarinah.db`.

Use `build` after moving a valid ledger between machines, after deleting a disposable derived view, or when `doctor` reports derived state as missing or stale. It does not repair a corrupt authoritative event chain.

## `import`

Stream an exported coding-agent history into the trusted project memory.

```sh
qarinah import <archive-file-or-directory> \
  [--format auto|codex|claude|kimi|portable] \
  [--mode compact|full] \
  [--max-bytes <integer>] \
  [--max-files <integer>] \
  [--max-records <integer>] \
  [--max-line-bytes <integer>]
```

The source must be an explicit regular `.jsonl` or `.ndjson` file, or a directory containing those files. Linked files and directories are not followed. `auto` detects supported Codex and Claude records and otherwise applies the portable format. Use explicit `kimi` for Kimi's documented stream-json user, assistant, tool-call, and tool-result messages.

## Lossless project-content archive

```text
qarinah archive create <workspace-relative-source> [--label text]
qarinah archive list
qarinah archive verify <archive-id>
qarinah archive restore <archive-id> --destination <directory>
qarinah archive delete <archive-id> --confirm <archive-id>
qarinah archive gc --confirm-workspace <workspace-id>
qarinah archive erase-key --confirm-workspace <workspace-id>
```

Creation requires a workspace initialized with `--capture content`. Sources remain inside the workspace and outside `.qarinah`; links, generated/dependency trees, ignored paths, and common secret filenames are not archived. Verify reconstructs and hashes every file. Restore refuses existing output files. Delete removes only the manifest, while garbage collection removes objects no remaining manifest references. Key destruction is a local cryptographic-erasure operation with explicit backup and physical-media caveats. See [Lossless content archive](CONTENT-ARCHIVE.md).

## Symbols and language server

```text
qarinah symbols build
qarinah symbols query [text] [--limit n] [--kind function,class,...]
qarinah-lsp
```

Run `qarinah scan` before the first symbol build. The v2 graph uses the pinned TypeScript parser for JavaScript, JSX, TypeScript, and TSX, plus pinned Tree-sitter WASM grammars for Python, Go, Rust, Java, Kotlin, C, C++, and C#. Every file is verified against the latest snapshot hash. Query returns the lexical, local-subword-vector, and structural score components. `qarinah-lsp` starts the bounded stdio language server; the package also includes an importable JetBrains LSP4IJ template. See [Symbol graph and language server](SYMBOL-GRAPH.md).

`compact` is the default. It writes one cited summary per session and is appropriate for large exports. `full` writes each supported visible item separately and requires content-authorized capture. Hidden reasoning and encrypted reasoning blocks are ignored in either mode. The result reports source bytes, files, records, visible items, sessions, newly imported events, formats, and rebuilt-state identity.

## `backup`

Copy explicit exported agent JSONL/NDJSON sources to an existing external directory with a verified manifest.

```sh
qarinah backup <archive-file-or-directory>... \
  --destination <absolute-external-directory> \
  [--max-bytes <integer>] \
  [--max-files <integer>]
```

The command requires an initialized project because it records a compact artifact receipt after the copy succeeds. Sources and destination are resolved to absolute paths. Source/destination overlap, links, junctions, hard-linked files, unsupported extensions, changed sources, and exceeded limits fail closed. The output reports the generated backup directory, manifest path/hash, source count, file count, copied bytes, and receipt event ID.

Setup can perform one backup in the same explicit initialization command:

```sh
qarinah setup . --codex \
  --backup-source <absolute-export-path> \
  --backup-destination <absolute-external-directory> \
  [--backup-max-bytes <integer>] \
  [--backup-max-files <integer>]
```

Qarinah never auto-discovers a private agent transcript store or external drive. See [External agent-archive backup](AGENT-ARCHIVE-BACKUP.md).

## `overview`

Explain the retained project memory and latest codebase map in readable Markdown or JSON.

```sh
npx qarinah overview
npx qarinah overview --format json
```

The overview reports memory counts, latest outcomes with event IDs and hashes, codebase files and directories, languages, observed relationships, changes, and the paths of the authoritative ledger and rebuildable views.

## `footprint`

Measure retained project memory and the bounded pack selected for one query:

```sh
qarinah footprint [query] \
  [--baseline-tokens <non-negative-integer>] \
  [--rate-per-million <positive-number>] \
  [--max-chars <integer>] \
  [--max-tokens <integer>]
```

The report separates imported source bytes, every known Qarinah storage file, and the current task pack. Compact-import receipts can provide a portable character-based source estimate. An explicit `--baseline-tokens` takes precedence. Cost fields appear only with `--rate-per-million` and use flat uncached input-token arithmetic.

```sh
npx qarinah footprint "release decisions and failed checks" \
  --baseline-tokens 12000 \
  --rate-per-million 3
```

See [Measure project memory](MEMORY-FOOTPRINT.md) for interpretation and boundaries.

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

Initialize one project, install selected project-local coding-agent integrations, configure MCP, initialize SQLite/graph/readable views/dashboard, and run an integrity check:

```sh
npx qarinah setup . --codex --claude --cursor --kimi --antigravity --capture content --allow-query --auto-compact
```

Omit host flags to configure all five supported project integrations. Omit `--allow-query` for diagnostic-only MCP. With `--allow-query`, setup binds the zero-write `context.query` tool to the exact workspace's current consent-policy hash and response ceilings. Codex and Claude Code receive reviewed lifecycle hooks; Cursor, Kimi, and Antigravity receive their documented project-local MCP/configuration surfaces. See [Coding-agent host compatibility](HOST-COMPATIBILITY.md).

`--auto-compact` is opt-in and applies to Codex and Claude Code Stop hooks. It runs after ordinary lifecycle capture and invokes `harness --record --no-rebuild --quiet`, producing one idempotent cited checkpoint without forcing a full projection rebuild after every turn.

`--share-activation` is also opt-in. It reports only the once-per-installation milestone names documented in [PRIVACY.md](../PRIVACY.md#optional-content-free-activation-measurement). Omitting it performs no activation request. The setup result includes `firstRun.message`, `firstRun.tryNow`, and `firstRun.openGraph` so a clean installation has an immediate verifiable next step.

## `demo`

Create a populated isolated workspace under the operating-system temporary directory:

```sh
npx qarinah demo
```

Use `--output <empty-directory>` when a deterministic location is required. Qarinah refuses to overwrite an existing path. The result includes the generated dashboard, a reconstructable decision, its event ID and evidence hash, and the exact next commands. Demo creation never enables activation measurement or installs host configuration.

## `activation`

Inspect, enable, or disable optional content-free activation measurement:

```sh
npx qarinah activation status
npx qarinah activation enable
npx qarinah activation disable
```

This choice is local to the initialized workspace. Disabling it preserves the prior once-only receipt locally but prevents future milestone requests.

## `watch`

Run one explicit automatic-memory cycle or keep a foreground watcher active:

```sh
npx qarinah watch --once
npx qarinah watch --interval-ms 2000 --query "current implementation decisions"
```

Options are `--once`, `--interval-ms 250..3600000`, `--query`, `--no-compact`, `--no-symbols`, and `--no-rebuild`. The watcher never installs itself as an operating-system service. A changed scan refreshes the selected stages serially; an unchanged scan returns `changed:false` without duplicate writes. Each v2 JSON cycle contains the exact snapshot, initial/delta/unchanged mode, atomic phase state, interrupted-cycle recovery status, optional symbol/checkpoint/derived receipts, explicit boundaries, and a `cycleHash`.

## `facts`

Create a structured cited fact set from the admitted verified context pack:

```sh
npx qarinah facts "current implementation decisions"
npx qarinah facts "current implementation decisions" --record --max-facts 24
```

Options are `--record`, `--max-facts 1..64`, `--max-chars 512..1000000`, `--max-tokens 128..1000000`, and `--limit 1..64`. The CLI uses the deterministic local extractor. Library callers may provide an optional model extractor through the public API. All facts remain labeled untrusted data and cite admitted source event IDs.

## `install`

Preview or write one reversible, project-scoped host integration:

```sh
npx qarinah install . --host cursor --scope project --dry-run --allow-query --auto-compact
npx qarinah install . --host cursor --scope project --allow-query --auto-compact
```

`--host` is required and accepts `codex`, `claude`, `cursor`, `kimi`, `antigravity`, or `freebuff`. `--scope project` is also required. The result lists every planned file, whether it is created or structurally merged, and the exact ownership manifest path. Dry-run performs no writes.

## `uninstall`

Remove only files and shared-config entries still owned by a recorded Qarinah host installation:

```sh
npx qarinah uninstall . --host cursor --scope project
```

Qarinah verifies the manifest workspace identity, validates every relative path, compares current bytes with the installed digest, and refuses removal when an owned file has changed. Shared JSON is structurally edited so unrelated host configuration remains intact.

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
- without explicit estimates, Qarinah automatically compares a compact-import receipt when present—or otherwise canonical characters in the verified authoritative ledger—with the generated task pack;
- an empty ledger shows the current task-pack estimate without inventing a baseline; and
- the generated file is a static derived view, not a writer or hosted control plane.

```sh
npx qarinah build
npx qarinah scan
npx qarinah dashboard --baseline-tokens 12000 --delivered-tokens 1500
```

The dashboard contains current and superseded decisions, explicit conflicts, source-linked events, the latest 100 permitted activity events, affected files from the latest scan, workspace capture mode, and an evidence-labeled local context comparison. See the [local memory dashboard guide](DASHBOARD.md) for field semantics, population recipes, JavaScript usage, privacy guidance, and troubleshooting.

Serve current local activity and optionally add explicitly selected initialized projects:

```sh
npx qarinah dashboard --serve [--port 8777] [--worktrees] [--project <path>]...
```

The current project is always included. `--project` can be repeated for up to 31 additional projects. `--worktrees` asks Git for initialized sibling checkouts; it does not search unrelated directories. Each project remains a separate workspace and is identified by its directory, workspace ID, and retained repository IDs. The server binds only to `127.0.0.1`. `--output`, `--baseline-tokens`, and `--delivered-tokens` are snapshot-only and cannot be combined with `--serve`.

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
