<p align="center">
  <img src="assets/brand/qarinah-mark.svg" width="112" alt="Qarinah logo">
</p>

<h1 align="center">Qarinah</h1>

<p align="center"><strong>Less context. More proof.</strong></p>

<p align="center">
  <a href="docs/WHITEPAPER.md">Technical paper</a>&nbsp;&middot;&nbsp;
  <a href="docs/ARCHITECTURE.md">Architecture</a>&nbsp;&middot;&nbsp;
  <a href="docs/BENCHMARKS.md">Benchmarks</a>&nbsp;&middot;&nbsp;
  <a href="docs/SECURITY.md">Security</a>&nbsp;&middot;&nbsp;
  <a href="docs/ECOSYSTEM-LAUNCH.md">Launch plan</a>
</p>

<p align="center">
  <code>LOCAL-FIRST</code>&nbsp;&nbsp;
  <code>EVIDENCE-LINKED</code>&nbsp;&nbsp;
  <code>GRAPH-AWARE</code>&nbsp;&nbsp;
  <code>OKF-PORTABLE</code>&nbsp;&nbsp;
  <code>GOVERNANCE-READY</code>
</p>

<p align="center">
  <strong>94.96% smaller context payload in the committed 54-record evaluator.</strong><br>
  Local-first. Source-cited. Tamper-evident. No Qarinah API key.
</p>

> Benchmark scope: the committed evaluator measures characters, uses four fixed retrieval cases, and preserves all four tested targets. This is not a universal token, billing, cost, or answer-quality guarantee. See the [machine-readable result](bench/results/context-evaluation-0.1.0-alpha.2.json) and [methodology](docs/BENCHMARKS.md).

Qarinah turns permitted agent activity, project structure, and explicitly committed decisions into small, cited context packs. It preserves the evidence in a typed graph and deterministic Markdown and JSON views instead of making an opaque summary the source of truth.

## Why Qarinah

Agent memory usually fails in one of two ways: the next model receives too much history, or it receives a compressed story with no way to verify the source. Qarinah keeps the source record and the compact context separate.

<table>
  <tr>
    <td width="50%"><strong>Evidence-linked</strong><br>Every selected item cites its event ID and content hash. Conflicts, supersession, authority, retention, and time remain explicit.</td>
    <td width="50%"><strong>Budgeted</strong><br>Coverage-aware retrieval compiles a bounded pack instead of replaying the complete project history.</td>
  </tr>
  <tr>
    <td width="50%"><strong>Rebuildable</strong><br>The JSONL chain is authoritative. Graph, index, Markdown, project structure, and OKF are deterministic derived views.</td>
    <td width="50%"><strong>Governance-ready</strong><br>Explicit capture policy, fail-closed coverage, read-only diagnostics, and optional Maqam disclosure controls preserve boundaries.</td>
  </tr>
</table>

Metadata-only capture is the default. Content capture requires explicit workspace consent. Hidden reasoning, private transcripts, credentials, and browser session state remain outside the product boundary.

## What it records

Qarinah records every permitted lifecycle event delivered by a supported host adapter and every decision that a user or governed workflow explicitly commits. It does not claim to infer every cognitive decision automatically.

Supported event classes include prompts, tool requests, tool completions, approvals, artifacts, sources, claims, decisions, summaries, compactions, subagents, completed turns, and failed turns. Relations connect sessions, turns, tool calls, sources, approvals, conflicts, supersession, derived evidence, and produced project structure.

## Architecture

```mermaid
flowchart TD
  inputs["Codex · Claude Code · CLI<br/>Crawler · ProductLoop · project files"]
  boundary["Explicit capture boundary<br/>Consent · strict adapters · bounded scan"]
  ledger[("Hash-chained JSONL<br/>authoritative record")]
  views["Deterministic views<br/>typed graph · hybrid index · Markdown · OKF"]
  compiler["Coverage-aware compiler<br/>budget · optional Maqam gate"]
  pack["Small cited context pack"]

  inputs --> boundary --> ledger --> views --> compiler --> pack
  ledger -. event IDs + hashes .-> pack

  classDef input fill:#ecfdf3,stroke:#16803c,color:#12351f,stroke-width:1.5px;
  classDef boundaryNode fill:#fff7e6,stroke:#b76e00,color:#3d2a00,stroke-width:1.5px;
  classDef authorityNode fill:#f1edff,stroke:#6548c7,color:#241653,stroke-width:2px;
  classDef projectionNode fill:#eaf4ff,stroke:#2474b5,color:#102f4c,stroke-width:1.5px;
  classDef disclosureNode fill:#e8fbfb,stroke:#087f8c,color:#07373c,stroke-width:1.5px;

  class inputs input;
  class boundary boundaryNode;
  class ledger authorityNode;
  class views projectionNode;
  class compiler,pack disclosureNode;
```

The project graph covers directories, files, content hashes, JavaScript and TypeScript module references, Markdown links, exact source spans, additions, changes, renames, and deletions. See the [architecture guide](docs/ARCHITECTURE.md) or open the [raw Mermaid source](docs/architecture.mmd).

## Install

Qarinah requires a maintained Node.js 22, 24, or 26 release.

```sh
npm install --save-dev qarinah@next
npx qarinah init .
```

Until the first public npm prerelease is approved, clone the repository and use `node bin/qarinah.js` in place of `npx qarinah`.

## Five-minute proof

```sh
# Opt in. Metadata-only capture is the default.
npx qarinah init .

# Commit one durable decision.
npx qarinah record \
  --kind decision \
  --title "Keep releases provenance-bound" \
  --body "Publish only the reviewed artifact from the reviewed commit."

# Record the bounded project structure and rebuild derived views.
npx qarinah scan
npx qarinah build

# Retrieve only direct evidence and emit cited Markdown.
npx qarinah query "release provenance" \
  --minimum-coverage direct \
  --format markdown

# Verify policy, event hashes, checkpoint, and derived state.
npx qarinah doctor
```

For agent callers, use the strict JSON stdin interfaces so untrusted text is never interpolated into a shell command:

```sh
printf '%s' '{"query":"release provenance","format":"json","minimumCoverage":"direct","maxChars":8000}' \
  | npx qarinah query --stdin-json
```

## Durable files

```text
.qarinah/
  config.json          portable workspace identity and requested policy
  events/events.jsonl  authoritative append-only event chain
  graph/graph.json     event and project nodes with typed edges
  index/index.json     disposable deterministic retrieval index
  records/CONTEXT.md   human-readable current record
  records/okf/         reproducible Markdown interoperability bundle
  index/event-ids/     checkpoint-authenticated idempotency projection
```

Delete any derived graph, index, or Markdown view and run `qarinah build` to reproduce it from the verified event chain.

## Portable by design

Qarinah can export a verified workspace record as a deterministic [Google Open Knowledge Format 0.1 Draft](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle:

```sh
npx qarinah export okf
```

The export is reviewable Markdown with a root index, a chronological log, one concept file per event, typed relations, citations, content hashes, and chain hashes. It can be diffed in Git, inspected without Qarinah, or passed to another system that understands OKF Markdown. The append-only JSONL event chain remains authoritative; OKF is a deterministic, replaceable interchange view rather than a second database or retrieval engine. See [interoperability](docs/INTEROPERABILITY.md#google-open-knowledge-format-derived-interchange).

## Retrieval

Qarinah's dependency-free local retriever combines BM25, character-trigram typo tolerance, one-hop graph evidence, reciprocal-rank fusion, deterministic diversity, explicit supersession, conflict visibility, retention, time, and scoped authority.

Context-pack v2 adds evidence coverage:

```json
{
  "coverage": {
    "method": "query-term-overlap-v1",
    "status": "direct",
    "queryTermCount": 2,
    "bestExactTermCount": 2,
    "bestExactTermRatio": 1,
    "directCandidateCount": 3
  }
}
```

`minimumCoverage: "partial"` rejects no-evidence packs. `minimumCoverage: "direct"` accepts only a record containing every normalized query term. Coverage is a deterministic retrieval diagnostic, not a claim that a model answer is correct.

## Codex and Claude Code

The repository includes generated, dependency-free plugin runtimes for Codex and Claude Code. Both provide:

- allowlisted lifecycle hooks;
- a Qarinah context skill;
- zero-write `context_status` and `context_doctor` MCP tools;
- explicit CLI querying for user-directed local workflows.

Codex and Claude Code plugin caches are immutable copies. Reinstall the reviewed plugin and start a new task after an upgrade. Claude requires an explicitly selected absolute Node 22, 24, or 26 executable. Codex still inherits the host's reviewed Node `PATH` boundary because its current plugin schema does not expose an equivalent file setting. See [host integrations](docs/HOST-INTEGRATIONS.md).

Automatic MCP context disclosure remains disabled. A context pack must be explicitly requested or disclosed through a separately governed Maqam capability.

## Ecosystem boundary

- **Maqam governs** which registered reads and writes are allowed.
- **Cockroach Crawler gathers** bounded public source records.
- **Qarinah remembers** decisions, evidence, provenance, and outcomes.
- **ProductLoop orchestrates** workflows across those explicit boundaries.

These are composable packages, not one silently merged runtime. Qarinah also works without the other packages.

## Security model

- no capture outside an explicitly initialized and machine-trusted workspace;
- revocation state stored outside the repository;
- metadata-only capture by default;
- bounded recursive redaction and strict event, log, context, path, and scan limits;
- renewable append locks, linked-path rejection, hash chaining, rollback checkpoints, and deterministic rebuilds;
- context treated as untrusted data, never executable instructions;
- explicit no-evidence and fail-closed retrieval modes;
- no transcript parsing or hidden chain-of-thought capture;
- no model provider, database, daemon, analytics endpoint, or Qarinah API key required.

Content-mode redaction cannot prove that arbitrary tool output contains no secret. Keep metadata mode unless retained content has already been reviewed. See [security](docs/SECURITY.md), [privacy](PRIVACY.md), and [threat boundaries](docs/ARCHITECTURE.md).

## Commands

| Command | Purpose |
| --- | --- |
| `qarinah init [path]` | Opt a workspace into metadata or content capture |
| `qarinah policy` / `qarinah trust` | Review and approve the exact machine-local capture policy |
| `qarinah record` | Append a validated decision, source, claim, approval, or other event |
| `qarinah hook codex\|claude` | Normalize one supported host lifecycle event from stdin |
| `qarinah scan` | Record a bounded project structure snapshot |
| `qarinah build` | Verify and rebuild graph, index, and Markdown |
| `qarinah query` | Compile a coverage-aware, cited, budgeted context pack |
| `qarinah export okf` | Build a deterministic Markdown interoperability bundle |
| `qarinah doctor` / `qarinah status` | Verify integrity or inspect current state |
| `qarinah untrust` | Revoke local capture permission without deleting project files |

## Benchmarks

Run:

```sh
npm run evaluate:context
npm run benchmark
```

The evaluator covers exact retrieval, typo tolerance, conflict recall, and supersession on a deterministic 54-record fixture. Percentages on this page refer to fixture character volume, not provider-billed tokens. The portable token estimator is deliberately labeled inexact. See [BENCHMARKS.md](docs/BENCHMARKS.md) for raw fields, baselines, limits, and the claims we refuse to make.

### Reproducible release fixture

| Context method | Characters per query | Result |
| --- | ---: | ---: |
| Qarinah selected pack | 2,237 | Baseline |
| Raw 54-record event log | 44,364 | Qarinah used 94.96% less |

Run `npm run evaluate:context` to regenerate the fixture and fail if its deterministic fields differ from the committed result.

### Observed live workspace check

| Context method | Estimated tokens | Reduction |
| --- | ---: | ---: |
| Qarinah live pack | 1,743 | Baseline |
| Eight manually selected project documents | 18,370 | Qarinah used 90.51% less |
| Entire generated `CONTEXT.md` | 15,306 | Qarinah used 88.61% less |
| All 230 indexed files | 611,222 | Qarinah used 99.71% less |

This second table uses `ceil(characters / 4)`, not a provider tokenizer. It is retained as [hash-linked development evidence](bench/results/live-workspace-volume-2026-07-21.json), but is not headline or claim-eligible evidence because the original eight-file selection manifest and pack payload were not retained as a public fixture. The whole-corpus row is intentionally naive.

## License and ownership

Qarinah source code is available under [Apache License 2.0](LICENSE). Apache-2.0 permits commercial use, modification, and redistribution under its terms. Copyright, a contributor sign-off policy, product execution, and a distinct brand can preserve project stewardship, but an open-source license cannot prohibit compliant commercialization.

See [contributing](CONTRIBUTING.md), [third-party notices](THIRD_PARTY_NOTICES.md), [brand use](TRADEMARKS.md), [support](SUPPORT.md), and [launch gates](docs/LAUNCH.md).
