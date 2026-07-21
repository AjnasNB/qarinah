<p align="center">
  <img src="assets/brand/qarinah-mark.svg" width="112" alt="Qarinah logo">
</p>

<h1 align="center">Qarinah</h1>

<p align="center"><strong>Evidence-linked project memory for AI agents.</strong></p>

<p align="center">
  <strong>70%+ smaller context payloads in the current fixed benchmark fixtures.</strong><br>
  Local-first. Source-cited. Tamper-evident. No Qarinah API key.
</p>

> Benchmark scope: the committed 54-record evaluator currently measures a greater than 70% character reduction while preserving its tested retrieval targets. This is a fixed-fixture context-volume result, not a universal token, billing, cost, or answer-quality guarantee. See [benchmarks and methodology](docs/BENCHMARKS.md).

Qarinah is pronounced **kuh-REE-nuh** and spelled **Q-A-R-I-N-A-H**. It records permitted agent lifecycle events and explicitly committed decisions, links them to evidence in a typed graph, materializes Markdown and JSON views, and retrieves a small cited pack instead of replaying an entire project history.

## Why Qarinah

Agent memory usually fails in one of two ways: the next model receives too much history, or it receives a compressed story with no way to verify the source. Qarinah keeps the source record and the compact context separate.

- The append-only JSONL event chain is authoritative.
- Graph, index, Markdown, and context packs are deterministic derived views.
- Every retrieved item cites an event ID and content hash.
- Conflicts, superseded decisions, scoped authority, retention, and time are explicit.
- Coverage metadata distinguishes a direct match, a partial match, and no durable evidence.
- `minimumCoverage` lets security-sensitive callers fail closed instead of accepting nearest-text retrieval.
- Codex and Claude Code adapters capture only supported, allowlisted lifecycle fields.
- Metadata-only capture is the default. Content capture requires explicit workspace consent.
- Hidden reasoning, private transcripts, credentials, and browser session state are outside the product boundary.

## What it records

Qarinah records every permitted lifecycle event delivered by a supported host adapter and every decision that a user or governed workflow explicitly commits. It does not claim to infer every cognitive decision automatically.

Supported event classes include prompts, tool requests, tool completions, approvals, artifacts, sources, claims, decisions, summaries, compactions, subagents, completed turns, and failed turns. Relations connect sessions, turns, tool calls, sources, approvals, conflicts, supersession, derived evidence, and produced project structure.

## Architecture

```text
Codex / Claude / CLI / connectors
                |
        strict host adapters
                |
  append-only hash-chained JSONL        bounded project scan
                |                              |
                +---------- typed graph -------+
                |              |               |
          JSON index      CONTEXT.md       OKF Markdown
                \              |              /
                 +--- coverage-aware query ---+
                              |
                  cited, budgeted context pack
                              |
                   optional Maqam governance
```

The project graph currently covers directories, files, content hashes, JavaScript and TypeScript module references, Markdown links, exact source spans, additions, changes, renames, and deletions. It is a bounded structural graph, not a compiler or a universal symbol graph. Deeper symbol adapters are on the roadmap.

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

## License and ownership

Qarinah source code is available under [Apache License 2.0](LICENSE). Apache-2.0 permits commercial use, modification, and redistribution under its terms. Copyright, a contributor sign-off policy, product execution, and a distinct brand can preserve project stewardship, but an open-source license cannot prohibit compliant commercialization.

See [contributing](CONTRIBUTING.md), [third-party notices](THIRD_PARTY_NOTICES.md), [brand use](TRADEMARKS.md), [support](SUPPORT.md), and [launch gates](docs/LAUNCH.md).
