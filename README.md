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

Qarinah is not a vector database, a hidden chain-of-thought recorder, an operating-system kernel, or a claim that every agent host exposes the same events. Its no-key baseline is deterministic and file-based. Optional model adapters may later enrich summaries, but summaries never replace source records. See the [product strategy](docs/PRODUCT-STRATEGY.md) for the single-product boundary and the incremental path from agent control plane to cross-platform supervisor.

## Quick start

Requires a maintained Node.js 22, 24, or 26 release.

```powershell
npm install
node bin/qarinah.js init .
node bin/qarinah.js record --kind decision --title "Keep writes governed" --body "All context writes route through an approval-capable Maqam tool."
node bin/qarinah.js scan
node bin/qarinah.js build
node bin/qarinah.js export okf
node bin/qarinah.js query "governed writes" --format markdown
node bin/qarinah.js doctor
```

`init` creates both a portable workspace policy and a machine-local policy-bound permit. Hooks are inert unless both exist and agree on the exact real workspace path, workspace ID, enabled state, capture mode, event/log/context bounds, and retention class. A cloned repository or committed config edit cannot grant or silently widen capture permission. Capture defaults to metadata-only; content capture requires `--capture content` and should be reserved for inputs that have already been classified as safe to retain.

## Durable files

```text
.qarinah/
  config.json          portable workspace identity and requested capture policy
  events/events.jsonl  append-only hash-chained event envelopes
  objects/             content-addressed source objects (reserved)
  records/CONTEXT.md   human-readable materialized context
  records/okf/         deterministic derived Google OKF v0.1 Draft interchange bundle
  graph/graph.json     canonical nodes and typed edges
  index/index.json     disposable deterministic retrieval index
  index/event-ids/     checkpoint-authenticated idempotency projection
  snapshots/           reproducible context-pack manifests (reserved)
```

The event log is authoritative. Graphs, indexes, Markdown, and packs are derived and rebuildable. Consent and the last trusted log checkpoint live outside the repository in the current user's platform state directory; `qarinah untrust` revokes them.

## Commands

| Command | Purpose |
| --- | --- |
| `qarinah init [path]` | Explicitly opt a workspace into metadata or content capture |
| `qarinah record --stdin-json` | Append a validated event from one bounded, strict JSON request on stdin |
| `qarinah hook codex\|claude` | Normalize one Codex or Claude Code lifecycle event from stdin |
| `qarinah mcp` | Run the local zero-write MCP status and integrity-diagnostics server |
| `qarinah build` | Verify and rebuild the graph, index, and Markdown record |
| `qarinah scan` | Explicitly record a bounded filesystem, import, and Markdown-link snapshot |
| `qarinah export okf [--output <path>]` | Reproduce a portable Google OKF v0.1 Draft bundle from the verified event log |
| `qarinah query --stdin-json` | Compile a bounded JSON or Markdown context pack from one strict JSON request on stdin |
| `qarinah policy [path]` | Show the complete requested capture policy and exact digest without granting trust |
| `qarinah trust --capture <mode> --policy-hash <digest>` | Trust only the exact reviewed policy on this machine |
| `qarinah untrust` | Revoke this machine's capture permission without deleting project files |
| `qarinah enable` / `qarinah disable` | Change workspace consent without deleting its record |
| `qarinah doctor` | Verify consent, schema, hashes, chain continuity, and derived state |
| `qarinah status` | Show workspace policy and event counts |

Model and plugin callers must use the JSON stdin forms. Query text, titles, bodies, relation targets, and data values are untrusted process data and must never be interpolated into a shell command or argv. `record` accepts at most 128 KiB and `query` at most 16 KiB of stdin before parsing; both require one object, reject unknown request fields, and cannot combine `--stdin-json` with other arguments. The field-based and positional forms shown in the human quick start remain compatibility interfaces for manually authored commands.

If a portable policy changes or an older trust record needs migration, run `qarinah policy`, review every displayed field, and pass its exact `policyHash` together with the capture mode to `qarinah trust`. The command reloads the policy after acquiring the workspace lock and refuses a stale or mistyped digest.

## Security defaults

- no capture outside an explicitly initialized workspace;
- metadata-only capture by default;
- recursive best-effort secret redaction and hard size/depth ceilings;
- context is treated as untrusted data, never executable instructions;
- renewable owner-token append locking, linked-path rejection, hash chaining, a machine-local rollback checkpoint, a checkpoint-authenticated bucketed idempotency projection, and deterministic rebuilds;
- exact persisted index/graph/Markdown comparison for CLI/MCP diagnostics, plus a verified in-memory projection for zero-write governed reads;
- deterministic local hybrid retrieval: BM25, typo-tolerant character matching, one-hop graph evidence, reciprocal-rank fusion, diversity, explicit conflicts, and explicit supersession;
- whole-output character ceilings plus optional total-token budgets, versioned estimators, deterministic framing/citation/content reservations, and caller-selected output headroom;
- no API key, model provider, daemon, browser session, or database required;
- no hidden reasoning or chain-of-thought capture.

Content-mode redaction cannot prove that arbitrary tool output contains no secret. Metadata mode is the safe default; future governed disclosure policy belongs in Maqam.

Expired records and records later than the query checkpoint are excluded from retrieval, not erased from the authoritative event log. Normal queries resolve one current UTC checkpoint at the compiler boundary and include it as `retrieval.asOf`; reproducible replay supplies `--as-of`, stdin JSON `asOf`, or the API `asOf` explicitly. `npm run evaluate:context` exercises the retrieval and budgeting contract against a deterministic 54-record fixture. The current Node 24 verification produced recall@5 `1.0`, mean reciprocal rank `1.0`, conflict recall `1.0`, supersession precision `1.0`, and a 95.51% character reduction versus replaying the raw fixture log. These are regression-fixture measurements, not a claim of general semantic quality or superiority over another product.

## Open Knowledge Format export

`qarinah export okf` creates a dependency-free [Google Open Knowledge Format 0.1 Draft](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) projection at `.qarinah/records/okf/`. Pass `--output <path>` to place the bundle elsewhere inside the real workspace root; relative paths are resolved from that root. The exporter rejects linked path components, protected `.git` and authoritative `.qarinah` locations, and existing directories that are not recognizable Qarinah-owned exports.

The bundle contains root `index.md` and `log.md` files plus one `events/<event-id>.md` concept for every verified event. Concept frontmatter carries event, hash-chain, authority, provenance, relation, retention, and citation metadata. Relations whose targets are known event IDs become bundle-relative Markdown links. Files are staged and replaced as one complete projection, use stable ordering and no wall-clock export timestamp, and reproduce byte-for-byte from the same workspace/event head even at another output path.

OKF is interchange, not Qarinah's database, retrieval engine, or source of truth. `.qarinah/events/events.jsonl` remains authoritative; the OKF directory and its hidden ownership marker are disposable and rebuildable. The export targets the current `0.1` Draft and should be revalidated before claiming compatibility with a future OKF revision.

## Project structure graph

`qarinah scan` explicitly observes the trusted workspace root and appends one provenance-linked `artifact` event. The derived graph and Markdown record then contain directory/file nodes, content identities, containment edges, conservative JavaScript/TypeScript module references, Markdown links, exact source spans, and additions, changes, content-preserving renames, and deletions relative to the previous snapshot.

The scanner is bounded to 750 supported source files, 512 KiB per parsed file, 16 MiB total input, and 24 directory levels by default. It honors root `.gitignore` and `.qarinahignore`, and excludes `.git`, `.qarinah`, dependencies, common generated output, hidden paths other than `.github`, binaries, symbolic links, and junctions. Oversized supported files are represented without reading their content. Limits can be reduced or explicitly raised within hard ceilings.

This is a provenance-preserving project graph, not a claim of Graphify parity, compiler equivalence, or universal semantic understanding. The v1 reference extractor is conservative and lexical. Its observations are marked `extracted` with adapter identity and source span; deeper AST symbol adapters remain separately versioned work. See [graph migration notes](docs/MIGRATIONS.md).

## Codex and Claude Code coverage

The committed Codex and Claude Code plugins contain generated, dependency-free Node runtimes and never resolve the compatibility CLI from `PATH`. Claude requires an explicitly selected absolute Node 22, 24, or 26 executable. Codex changes to the installed-plugin root before resolving Node, which prevents workspace-local current-directory shadowing, but still inherits its host's reviewed `PATH` boundary because its plugin schema does not expose an equivalent user setting. Successful hooks emit no model-visible output. Both plugins bundle accurately annotated, zero-write `context_status` and `context_doctor` MCP tools. Automatic MCP context disclosure is intentionally absent until a Maqam-scoped disclosure capability exists; explicit compatibility-CLI queries remain available for user-directed local workflows.

Codex coverage targets its current ten lifecycle schemas. Known Codex event shapes reject missing or unrecognized fields, while unknown lifecycle event names are ignored without capture. Claude Code coverage includes session, prompt, tool, compaction, subagent, stop, and session-end events. Host adapters retain only allowlisted exposed fields and never parse transcript files. Model subscriptions or provider access remain a host concern; the ledger, hooks, MCP server, and deterministic retrieval require no separate API key.

Codex hooks are observability, not total mediation. Hosted tools such as `WebSearch` do not emit local `PreToolUse` or `PostToolUse` hooks, and transcript files are deliberately not parsed because their format is unstable.

See [architecture](docs/ARCHITECTURE.md), [host integrations](docs/HOST-INTEGRATIONS.md), [governed browser design](docs/GOVERNED-BROWSER.md), [security model](docs/SECURITY.md), [migration notes](docs/MIGRATIONS.md), [launch runbook](docs/LAUNCH.md), [licensing decision](docs/LICENSE-STRATEGY.md), and [roadmap](docs/ROADMAP.md).

The private-alpha repository includes local marketplace catalogs for real cached installs in Codex and Claude Code. Review the generated plugin directories first, then follow the exact install, validation, reload, and uninstall guidance in the [host integration guide](docs/HOST-INTEGRATIONS.md). These local catalogs are test fixtures, not public marketplace releases.

## Optional interoperability

Qarinah exposes dependency-free structural bridges for Maqam `ToolGateway` adapters, Cockroach Crawler revision/acquisition ingestion, and the ProductLoop `ProvenanceSink` callback. Writes reload machine-local trust, metadata mode omits caller/source payloads, content retention requires explicit workspace consent, and no bridge scrapes private trace arrays. See the [interoperability guide](docs/INTEROPERABILITY.md) for exact guarantees and the upstream contract gaps that remain visible.
