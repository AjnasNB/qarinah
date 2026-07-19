# Qarinah

**Evidence-linked context for AI agents.**

Qarinah is a local-first context compiler and evidence-linked context ledger for agent work. It records explicitly permitted prompts, tool activity, artifacts, decisions, approvals, and source references as a tamper-evident event chain; materializes a human-readable Markdown/JSON graph; and compiles a small, cited context pack for the next agent instead of sending an entire database or transcript.

> Naming status: **Qarinah** is the selected working product name and `qarinah` remains the compatibility identifier for the package, CLI, schemas, and `.qarinah/` storage. A professional trademark and naming clearance is still required before public launch; no trademark availability is claimed. “Context ledger” is the product descriptor, not a second brand.

> Private foundation status: this repository is intentionally `UNLICENSED` and non-publishable while the founder chooses the public licensing and trademark model. It is not yet a public release.

## Product boundary

- **Maqam governs** which context may be captured, disclosed, or changed.
- **Cockroach Crawler gathers** bounded public source records.
- **Qarinah remembers why** by linking events, sources, decisions, authority, and outcomes.
- **ProductLoop orchestrates** workflows across those explicit boundaries.

Qarinah is not a vector database, a hidden chain-of-thought recorder, an operating-system kernel, or a claim that every agent host exposes the same events. Its no-key baseline is deterministic and file-based. Optional model adapters may later enrich summaries, but summaries never replace source records.

## Quick start

Requires a maintained Node.js 22, 24, or 26 release.

```powershell
npm install
node bin/qarinah.js init .
node bin/qarinah.js record --kind decision --title "Keep writes governed" --body "All context writes route through an approval-capable Maqam tool."
node bin/qarinah.js build
node bin/qarinah.js query "governed writes" --format markdown
node bin/qarinah.js doctor
```

`init` creates both a portable workspace policy and a machine-local trust record. Hooks are inert unless both exist and agree on the real workspace path, workspace ID, and capture mode. A cloned repository cannot grant itself capture permission by committing `.qarinah/config.json`. Capture defaults to metadata-only; content capture requires `--capture content` and should be reserved for inputs that have already been classified as safe to retain.

## Durable files

```text
.qarinah/
  config.json          portable workspace identity and requested capture policy
  events/events.jsonl  append-only hash-chained event envelopes
  objects/             content-addressed source objects (reserved)
  records/CONTEXT.md   human-readable materialized context
  graph/graph.json     canonical nodes and typed edges
  index/index.json     disposable deterministic lexical index
  index/event-ids/     checkpoint-authenticated idempotency projection
  snapshots/           reproducible context-pack manifests (reserved)
```

The event log is authoritative. Graphs, indexes, Markdown, and packs are derived and rebuildable. Consent and the last trusted log checkpoint live outside the repository in the current user's platform state directory; `qarinah untrust` revokes them.

## Commands

| Command | Purpose |
| --- | --- |
| `qarinah init [path]` | Explicitly opt a workspace into metadata or content capture |
| `qarinah record ...` | Append a validated event |
| `qarinah hook codex\|claude` | Normalize one Codex or Claude Code lifecycle event from stdin |
| `qarinah mcp` | Run the local zero-write MCP status and integrity-diagnostics server |
| `qarinah build` | Verify and rebuild the graph, index, and Markdown record |
| `qarinah query <text>` | Compile a bounded JSON or Markdown context pack |
| `qarinah trust --capture <mode>` | Explicitly trust an existing workspace on this machine after review |
| `qarinah untrust` | Revoke this machine's capture permission without deleting project files |
| `qarinah enable` / `qarinah disable` | Change workspace consent without deleting its record |
| `qarinah doctor` | Verify consent, schema, hashes, chain continuity, and derived state |
| `qarinah status` | Show workspace policy and event counts |

## Security defaults

- no capture outside an explicitly initialized workspace;
- metadata-only capture by default;
- recursive best-effort secret redaction and hard size/depth ceilings;
- context is treated as untrusted data, never executable instructions;
- renewable owner-token append locking, linked-path rejection, hash chaining, a machine-local rollback checkpoint, a checkpoint-authenticated bucketed idempotency projection, and deterministic rebuilds;
- exact persisted index/graph/Markdown comparison for CLI/MCP diagnostics, plus a verified in-memory projection for zero-write governed reads;
- whole-output character budgets for both pretty JSON and Markdown packs;
- no API key, model provider, daemon, browser session, or database required;
- no hidden reasoning or chain-of-thought capture.

Content-mode redaction cannot prove that arbitrary tool output contains no secret. Metadata mode is the safe default; future governed disclosure policy belongs in Maqam.

## Codex and Claude Code coverage

The committed Codex and Claude Code plugins contain generated, dependency-free Node runtimes and never resolve the compatibility CLI from `PATH`. Successful hooks emit no model-visible output. Both plugins bundle accurately annotated, zero-write `context_status` and `context_doctor` MCP tools. Automatic MCP context disclosure is intentionally absent until a Maqam-scoped disclosure capability exists; explicit compatibility-CLI queries remain available for user-directed local workflows.

Codex coverage targets its current ten lifecycle schemas. Claude Code coverage includes session, prompt, tool, compaction, subagent, stop, and session-end events. Host adapters retain only allowlisted exposed fields, store the names—not values—of unknown future fields, and never parse transcript files. Model subscriptions or provider access remain a host concern; the ledger, hooks, MCP server, and deterministic retrieval require no separate API key.

Codex hooks are observability, not total mediation. Hosted tools such as `WebSearch` do not emit local `PreToolUse` or `PostToolUse` hooks, and transcript files are deliberately not parsed because their format is unstable.

See [architecture](docs/ARCHITECTURE.md), [host integrations](docs/HOST-INTEGRATIONS.md), [governed browser design](docs/GOVERNED-BROWSER.md), [security model](docs/SECURITY.md), [launch runbook](docs/LAUNCH.md), [licensing decision](docs/LICENSE-STRATEGY.md), and [roadmap](docs/ROADMAP.md).

The private-alpha repository includes local marketplace catalogs for real cached installs in Codex and Claude Code. Review the generated plugin directories first, then follow the exact install, validation, reload, and uninstall guidance in the [host integration guide](docs/HOST-INTEGRATIONS.md). These local catalogs are test fixtures, not public marketplace releases.

## Optional interoperability

Qarinah exposes dependency-free structural bridges for Maqam `ToolGateway` adapters, Cockroach Crawler revision/acquisition ingestion, and the ProductLoop `ProvenanceSink` callback. Writes reload machine-local trust, metadata mode omits caller/source payloads, content retention requires explicit workspace consent, and no bridge scrapes private trace arrays. See the [interoperability guide](docs/INTEROPERABILITY.md) for exact guarantees and the upstream contract gaps that remain visible.
