# Qarinah

**Evidence-linked context for every agent.**

Qarinah is a local-first context compiler for agent work. It records explicitly permitted prompts, tool activity, artifacts, decisions, approvals, and source references as a tamper-evident event chain; materializes a human-readable Markdown/JSON graph; and compiles a small, cited context pack for the next agent instead of sending an entire database or transcript.

> Private foundation status: this repository is intentionally `UNLICENSED` and non-publishable while the founder chooses the public licensing and trademark model. It is not yet a public release.

## Product boundary

- **Maqam governs** which context may be captured, disclosed, or changed.
- **Cockroach Crawler gathers** bounded public source records.
- **Qarinah remembers why** by linking events, sources, decisions, authority, and outcomes.
- **ProductLoop orchestrates** workflows across those explicit boundaries.

Qarinah is not a vector database, a hidden chain-of-thought recorder, an operating-system kernel, or a claim that every agent host exposes the same events. Its no-key baseline is deterministic and file-based. Optional model adapters may later enrich summaries, but summaries never replace source records.

## Quick start

Requires Node.js 20.18.1 or newer.

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
  snapshots/           reproducible context-pack manifests (reserved)
```

The event log is authoritative. Graphs, indexes, Markdown, and packs are derived and rebuildable. Consent and the last trusted log checkpoint live outside the repository in the current user's platform state directory; `qarinah untrust` revokes them.

## Commands

| Command | Purpose |
| --- | --- |
| `qarinah init [path]` | Explicitly opt a workspace into metadata or content capture |
| `qarinah record ...` | Append a validated event |
| `qarinah hook codex` | Normalize one Codex lifecycle event from stdin |
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
- owner-token append locking, linked-path rejection, hash chaining, a machine-local rollback checkpoint, and deterministic rebuilds;
- exact derived-index comparison before any context is returned;
- whole-output character budgets for both pretty JSON and Markdown packs;
- no API key, model provider, daemon, browser session, or database required;
- no hidden reasoning or chain-of-thought capture.

Content-mode redaction cannot prove that arbitrary tool output contains no secret. Metadata mode is the safe default; future governed disclosure policy belongs in Maqam.

## Codex plugin coverage

The committed plugin contains a generated, dependency-free Node runtime and never resolves Qarinah from `PATH`. Successful hooks emit no model-visible output. Full coverage targets the current eight Codex lifecycle schemas. Older Codex versions may expose only a subset; this machine's `0.128.0` build lacks `PreCompact`, `PostCompact`, and `SubagentStop`, so upgrade before testing those events.

Codex hooks are observability, not total mediation. Hosted tools such as `WebSearch` do not emit local `PreToolUse` or `PostToolUse` hooks, and transcript files are deliberately not parsed because their format is unstable.

See [architecture](docs/ARCHITECTURE.md), [security model](docs/SECURITY.md), [licensing decision](docs/LICENSE-STRATEGY.md), and [roadmap](docs/ROADMAP.md).

## Optional interoperability

Qarinah exposes dependency-free structural bridges for Maqam `ToolGateway` adapters, Cockroach Crawler revision/acquisition ingestion, and the ProductLoop `ProvenanceSink` callback. Writes reload machine-local trust, metadata mode omits caller/source payloads, content retention requires explicit workspace consent, and no bridge scrapes private trace arrays. See the [interoperability guide](docs/INTEROPERABILITY.md) for exact guarantees and the upstream contract gaps that remain visible.
