# Troubleshooting

This guide starts with non-mutating checks and preserves Qarinah's authority boundaries. Do not delete `.qarinah`, machine-local trust data, locks, checkpoints, or derived files merely to make an error disappear.

## Safe diagnostic sequence

Run these commands from the exact project root:

```sh
node --version
npx qarinah status
npx qarinah doctor
npx qarinah policy .
```

Interpret them separately:

- `status` verifies the store and reports enabled state and configured log limit.
- `doctor` verifies the store and checks whether graph/index/Markdown views are current.
- `policy` displays the requested policy and digest without granting trust.

If `doctor` says the authoritative chain is valid but `derived` is missing or stale:

```sh
npx qarinah build
npx qarinah doctor
```

Do not run `build` as a response to checkpoint rollback, checkpoint mismatch, malformed canonical events, or an unreviewed policy change.

## Node version is rejected

Symptom:

```text
Qarinah requires Node.js 22, 24, or 26
```

Qarinah 0.1.0 intentionally accepts those maintained major lines only.

```sh
node --version
```

On Windows, verify the actual executable:

```powershell
(Get-Command node -CommandType Application).Source
```

Host plugins run in copied caches. Confirm the host resolves a trusted system Node installation rather than a project-controlled `node.exe`, `node.cmd`, or wrapper.

## `WORKSPACE_NOT_INITIALIZED`

No Qarinah configuration was found for the selected root.

```sh
cd /absolute/intended/project
npx qarinah init . --capture metadata
```

For MCP, pass the exact initialized root. An explicit MCP selector does not walk from a child directory into a parent workspace.

Initialization does not silently opt in unrelated folders.

## `WORKSPACE_DISABLED`

The portable workspace configuration is disabled.

Inspect first:

```sh
npx qarinah policy .
npx qarinah status
```

If enablement is intended:

```sh
npx qarinah enable
```

Enabling does not change metadata/content policy. If the policy changed, explicit trust review may still be required.

## `WORKSPACE_NOT_TRUSTED`

The project may contain portable configuration, but this machine has not approved it.

```sh
npx qarinah policy .
```

Review:

- exact real root;
- workspace ID;
- enabled state;
- `metadata` or `content`;
- event, log, and context limits;
- retention class;
- policy hash.

Then approve the exact values:

```sh
npx qarinah trust . \
  --capture metadata \
  --policy-hash sha256:<reviewed-policy-digest>
```

Do not copy another machine's trust state into place. Trust is machine-local.

## `TRUST_REVIEW_REQUIRED` or `CAPTURE_NOT_APPROVED`

The portable policy no longer matches the machine permit, or the requested capture mode has not been approved.

This is a fail-closed policy-upgrade path:

```sh
npx qarinah policy .
```

Review the new policy and run `trust` with its exact capture mode and digest. Confirming only the word `metadata` or `content` is insufficient.

## `TRUST_INVALID`

The machine-local trust or revocation record failed shape, path, size, canonicalization, workspace, or checkpoint validation.

Do not hand-edit the record. Preserve:

- the repository's `.qarinah` directory;
- the exact error;
- the machine and Qarinah versions;
- a listing of relevant paths without secret contents.

If the authoritative project record still verifies on a trusted machine, revoke and re-establish trust through the CLI on the affected machine. Never replace a trust file with one copied from another path or machine.

## `CHECKPOINT_ROLLBACK` or `CHECKPOINT_MISMATCH`

Stop write operations.

These errors mean the current log is shorter, older, or different at a position the current machine previously trusted. Common causes include:

- restoring an old repository copy;
- truncating or editing `events.jsonl`;
- changing branches between incompatible ledger histories;
- replacing a workspace without reviewing its machine-local checkpoint.

Do not:

- run a blind rebuild;
- delete the checkpoint;
- append another event;
- rewrite hashes.

Recover the reviewed authoritative event log or intentionally use a separate workspace identity. Preserve the mismatch as evidence.

## Event log errors

| Code | Meaning |
| --- | --- |
| `EVENT_LOG_MISSING` | The authoritative JSONL file is absent. |
| `EVENT_LOG_NON_CANONICAL` | Newline framing, blank lines, or canonical serialization changed. |
| `EVENT_JSON_INVALID` | A line is not valid JSON. |
| `EVENT_INVALID` | An event violates its schema, bound, hash, or chain contract. |
| `EVENT_LIMIT_EXCEEDED` | The record-count ceiling was crossed. |
| `LOG_LIMIT_EXCEEDED` | Configured aggregate log bytes were crossed. |
| `EVENT_ID_DUPLICATE` | An event identity already exists with incompatible content. |
| `EVENT_ID_INDEX_INVALID` / `EVENT_ID_INDEX_MISMATCH` | The derived ID projection is corrupt or differs from the trusted checkpoint. |
| `STORAGE_RACE_DETECTED` | A file changed while it was being validated. |

The event log is authoritative; graph, index, Markdown, OKF, and event-ID lookup files are derived. If only a derived projection is bad and the log verifies, rebuild. If the log itself fails, restore it from reviewed source rather than generating a replacement story.

## `INDEX_STALE`, `INDEX_INVALID`, or missing derived state

First:

```sh
npx qarinah doctor
```

If the output verifies the event store and reports only a derived-state problem:

```sh
npx qarinah build
npx qarinah doctor
```

`doctor` exits with status `2` for this recoverable split state. MCP `context_doctor` reports the condition but never repairs it.

## `STORE_BUSY`

Another writer owns the renewable append lock or a prior process has not completed lock recovery.

1. Wait for the active Qarinah process to finish.
2. Check running Node/Qarinah processes.
3. Preserve `.qarinah/locks/append.lock` for inspection.
4. Retry after the owner exits.

Do not manually delete the lock while a writer may still be active. Lock ownership is token-bound, and Qarinah rejects releasing another process's lock.

`STORE_LOCK_LOST` means ownership changed during an append. Treat it as a concurrent-write integrity failure and investigate both processes.

## Scan failures

### `PROJECT_SCAN_LIMIT`

The scan crossed `maxFiles`, `maxTotalBytes`, or `maxDepth`.

Use explicit reviewed limits:

```sh
npx qarinah scan \
  --max-files 5000 \
  --max-file-bytes 1048576 \
  --max-total-bytes 67108864 \
  --max-depth 32
```

Prefer narrowing the initialized project over setting an effectively unbounded ceiling.

### `PROJECT_PATH_TOO_LONG`

A relative project path exceeds the implementation's bounded length. Shorten or relocate the path; do not bypass the validation.

### `PATH_OUTSIDE_WORKSPACE` or `STORAGE_LINK_REJECTED`

A resolved path escaped the trusted root or traversed a symbolic link/junction where Qarinah requires an owned regular path.

Inspect the path components. Do not solve this by allowing unrestricted traversal.

## Query failures

### `CONTEXT_COVERAGE_TOO_LOW`

Retrieved evidence did not meet `minimumCoverage`.

```sh
npx qarinah query "specific decision terms" \
  --minimum-coverage direct \
  --format markdown
```

Options:

1. Use terms that appear in the retained evidence.
2. Record the missing reviewed decision or source.
3. Use `partial` only if partial term coverage is acceptable.
4. Use `any` only when no evidence gate is required.

Do not treat lowering the gate as creating evidence.

### `CONTEXT_BUDGET_TOO_SMALL`

The query and required pack framing cannot fit.

```sh
npx qarinah query "release provenance" \
  --max-tokens 1500 \
  --reserve-tokens 200
```

Increase the budget, reduce reserved headroom, simplify the query, or request fewer items. At least 64 tokens must remain available when token planning is enabled.

### `CONTEXT_RESERVATION_EXCEEDED`

Custom citation/framing/content reservations cannot contain required material under their overflow policy. Review the three reservation allocations. The CLI exposes normal max/reserve controls; custom reservation objects are a JavaScript API feature.

### `CONTEXT_BUDGET_UNSTABLE` or `CONTEXT_BUDGET_EXCEEDED`

Final JSON/Markdown accounting could not stabilize or exceeded the hard bound. Preserve the query, options, package version, and reproducible ledger fixture and report a bug.

### Unexpected token numbers

Without a host-supplied exact synchronous estimator, Qarinah uses:

```text
ceil(characters / 4)
```

This estimate is intentionally marked inexact. It is not an OpenAI, Anthropic, Codex, Claude, or billing tokenizer.

## Record failures

### `record --stdin-json` rejects input

The strict input:

- must be one JSON object;
- is limited to 131,072 bytes;
- cannot include unknown fields;
- requires `kind` and `title`;
- cannot be combined with other CLI arguments.

Use:

```sh
printf '%s' '{"kind":"decision","title":"Keep writes idempotent"}' \
  | npx qarinah record --stdin-json
```

### Metadata mode omitted the body

Metadata-only capture is the default. This is expected. To retain bounded content, the workspace must explicitly request and receive machine approval for `content` capture:

```sh
npx qarinah policy .
```

Do not silently change capture mode to make a test pass.

### A repeated event was rejected

Stable event identities are collision boundaries. Exact idempotent replay can return the retained event where the API enables it; reuse with different canonical content fails.

## OKF export failures

| Code | Meaning |
| --- | --- |
| `OKF_OUTPUT_PROTECTED` | Destination is the workspace root, `.git`, or authoritative Qarinah storage. |
| `PATH_OUTSIDE_WORKSPACE` | Destination or a parent escapes the workspace. |
| `STORAGE_LINK_REJECTED` | Destination traverses a symbolic link or junction. |
| `OKF_OUTPUT_NOT_OWNED` | Existing directory is not the exact prior Qarinah export expected from its ownership marker. |
| `OKF_OUTPUT_INVALID` | Existing or staging path has the wrong shape or type. |
| `OKF_EXPORT_REPLACE_FAILED` | Atomic replacement failed and rollback also failed. |

Choose a new empty path inside the project:

```sh
npx qarinah export okf --output .qarinah/records/okf-review
```

Qarinah will not overwrite arbitrary content.

## MCP transport is closed

The host owns the stdio pipe. Qarinah cannot reopen it from inside the terminated process.

Verify:

```sh
node --version
codex plugin list
codex mcp list

claude plugin list
claude mcp list
```

After reinstalling or upgrading:

- start a new Codex task;
- run `/reload-plugins` in Claude Code.

From a reviewed source checkout:

```sh
npm run build:plugins
npm run mcp:smoke
```

See [MCP guide](MCP-GUIDE.md).

## MCP workspace errors

### `MCP_WORKSPACE_INVALID`

The tool selector must be a non-empty absolute local path or valid local `file:` URI.

Valid:

```json
{ "workspace": "D:\\projects\\shop" }
```

```json
{ "workspace": "file:///D:/projects/shop" }
```

Invalid:

```json
{ "workspace": "./shop" }
```

### `MCP_WORKSPACE_AMBIGUOUS`

The client advertised several trusted roots. Pass one exact workspace in the tool argument or open a host session rooted in one project.

### `MCP_CLIENT_TIMEOUT`

The client advertised roots support but did not answer `roots/list` within three seconds. Pass an explicit workspace or fix the host's roots implementation.

## Hook capture does not appear

Check:

1. The exact project is initialized, enabled, and trusted.
2. Capture mode is what you intended.
3. The host plugin is installed from the reviewed version.
4. The host was restarted/reloaded after installation.
5. The event is one of the supported allowlisted lifecycle events.
6. `npx qarinah status` succeeds at the project root.

Host limitations matter:

- Qarinah cannot capture an event the host does not expose.
- It does not parse hidden transcript or reasoning files.
- Codex IDE skill/CLI use does not imply lifecycle-hook support.
- ChatGPT web and Claude.ai web do not gain local filesystem hooks from this package.

The hook result can return `captured: false` and a reason. Preserve that reason.

## Context compaction still occurs in Codex or Claude

Qarinah does not control a provider's conversation window or compaction policy. It preserves only permitted evidence delivered by supported adapters and lets a later task request a small cited pack.

Use Qarinah before a task needs prior decisions:

```sh
npx qarinah query "migration rollback decision" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --reserve-tokens 200 \
  --format markdown
```

Do not paste the complete event log or generated `CONTEXT.md` into every prompt; that defeats bounded retrieval.

## Cross-editor handoff

Qarinah's portable record lives with the project, but trust is machine-local.

On the destination machine:

1. Clone or copy the project through your normal reviewed process.
2. Install Qarinah.
3. Run `qarinah policy` at the exact root.
4. Review and approve trust locally.
5. Run `qarinah doctor`.
6. If the authoritative record verifies and only derived state is absent, run `qarinah build`.
7. Install/reload the relevant host integration.

Never copy the source machine's trust permit as a shortcut.

## Clean verification for maintainers

```sh
npm run check:plugins
npm run check:docs
npm run build:site
npm run check:site
npm run mcp:smoke
npm test
npm run typecheck
npm run check:benchmark-evidence
npm run benchmark
npm run evaluate:context
npm run evaluate:software-tasks
npm run evaluate:long-document
npm pack --dry-run --ignore-scripts
```

Public releases must come from the exact reviewed artifact built from the exact reviewed commit.

## Reporting a reproducible issue

Include:

- Qarinah version;
- Node version and operating system;
- command or API call;
- error code and message;
- whether capture is metadata or content;
- whether the failure is store, derived state, query, hook, MCP, scan, or export;
- the smallest synthetic reproduction;
- `doctor` output with private values removed.

Do not publish:

- credentials;
- environment values;
- private event bodies;
- absolute private paths;
- browser/session state;
- hidden reasoning;
- machine-local trust files.

Use the project's security process for a vulnerability and the issue tracker for non-sensitive reproducible defects.
