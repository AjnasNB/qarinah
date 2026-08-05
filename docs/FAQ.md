# Qarinah FAQ

## What is Qarinah?

Qarinah is the evidence-linked cross-agent context engine for software projects. It lets Codex, Claude Code, Cursor, and other supported coding agents continue the same project using a shared, cited record of decisions, outcomes, code relationships, and current evidence.

It is also a universal context engine for software projects: it selects bounded, complete records from retained project memory before a host constructs the next model request.

Qarinah works as an independent local tool for one developer and one repository. Team memory, encrypted exchange, and optional Maqam-governed disclosure build on that same project-owned record; they are not required for the personal workflow.

## How do I switch coding agents without starting over?

Initialize Qarinah once in the project, record permitted outcomes through a supported adapter or explicit command, then ask the next agent for a verified handoff. Qarinah returns a compact cited context pack with stale, conflicting, and superseded decisions marked. The complete workflow is documented in the [cross-agent handoff guide](CROSS-AGENT-HANDOFFS.md).

## Can I inspect Qarinah memory on a phone or tablet?

Yes, as a read-only portable view. Qarinah can generate a self-contained static dashboard and deterministic Markdown, JSON, graph, and OKF exports that can be opened on a mobile browser after you transfer or host the artifact through a channel you control.

Qarinah does not currently claim a native mobile capture runtime or silently sync project memory to a hosted service. Project writes, trust, and agent integrations remain tied to an explicitly initialized workspace.

## What problem does Qarinah solve?

Long-running coding projects accumulate decisions, tool outcomes, approvals, sources, failures, and superseded approaches. A later agent can either receive the whole retained history, which consumes context, or receive a short summary that may be difficult to verify.

Qarinah keeps the durable source record separate from the compact pack. Selected memory includes event IDs and hashes so a developer can inspect its provenance.

## Does Qarinah reduce coding-agent context tokens?

It can reduce repeated retained-history context when the current task needs only a relevant subset.

In Qarinah's committed software-task benchmark, full-history replay plus the required current sources measured 442,113 estimated input-context tokens. The same current sources plus Qarinah packs measured 5,682, or 98.71% less estimated repeated context. Every required target for those committed tasks was directly covered in the top five.

The estimate is `ceil(characters / 4)`, not provider-reported usage. Results will vary with the project, retained history, query, budget, and task. See [benchmarks](BENCHMARKS.md).

## Does Qarinah reduce the total Codex, Claude, OpenAI, or Anthropic bill by 98.71%?

No universal provider-billing claim is made.

At the same flat input-token rate, a context slice that is 98.71% smaller costs 98.71% less to send. A total application bill can also include current source files, output, reasoning, tools, cached-input pricing, retrieval work, and fixed charges. The published estimate is therefore a comparison of repeated input-context volume, not an invoice or total-cost guarantee.

## Does Qarinah eliminate hallucinations or guarantee correct answers?

No. Qarinah can return cited records and reject a pack when configured evidence coverage is insufficient. That improves inspectability, but it does not prove a model answer is correct or eliminate hallucinations.

`minimumCoverage: "direct"` means at least one selected record contains every normalized query term. It is a deterministic retrieval diagnostic, not semantic validation of a generated answer.

## Is Qarinah a RAG framework?

Qarinah shares a retrieval goal with RAG systems, but its design is narrower and project-focused:

- the append-only local event chain remains authoritative;
- graph, index, Markdown, JSON, and OKF are deterministic derived views;
- selected items cite stable local event IDs and hashes;
- conflict, supersession, authority, retention, and time are explicit;
- fixed character and estimated-token budgets are part of context compilation;
- no vector database or embedding service is required.

Qarinah does not attempt to replace every document-ingestion, vector-search, or model-orchestration framework.

## How does Qarinah search project memory?

The local retriever combines BM25, character-trigram typo tolerance, one-hop graph evidence, reciprocal-rank fusion, deterministic diversity, and explicit time, authority, retention, conflict, and supersession signals.

Use a focused query that names the component, decision, behavior, or constraint:

```sh
npx qarinah query "checkout dialog focus trap" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --format markdown
```

Qarinah does not call an embedding API and does not claim arbitrary semantic equivalence.

## What does Qarinah record?

Supported event classes include prompts, tool requests, tool completions, approvals, artifacts, sources, claims, decisions, summaries, compactions, subagents, completed turns, and failed turns when a supported host adapter delivers them.

Users and governed workflows can also append explicit records. Qarinah does not infer every cognitive decision automatically.

## Does Qarinah capture hidden reasoning or private transcripts?

No. It does not capture hidden chain-of-thought or parse private transcript stores.

Qarinah only receives bounded fields exposed by supported hooks and explicit CLI or JavaScript calls. Metadata-only capture is the default.

## What is the difference between metadata and content capture?

Metadata capture retains bounded event presence and metadata without retaining event bodies. It is the default:

```sh
npx qarinah init .
```

Content capture retains bounded, redacted content fields exposed by supported integrations and requires explicit opt-in:

```sh
npx qarinah init . --capture content
```

Redaction cannot prove arbitrary tool output contains no secret. Use metadata mode unless content retention has been reviewed.

## Does Qarinah run continuously?

No. Qarinah is project memory, not an always-running agent supervisor.

Supported host hooks can append permitted lifecycle events when the host invokes them. Queries, scans, builds, exports, and verification are explicit operations. No hosted Qarinah daemon is required.

## Does Qarinah stop Codex or Claude Code from compacting a conversation?

No. Provider-side conversation compaction is controlled by the host.

Qarinah preserves the permitted project evidence it actually received. After host compaction, a later task can explicitly query that local record for a small cited pack.

## Can Codex and Claude Code share the same project memory?

Yes, when both reviewed integrations operate on the same initialized and trusted project. Qarinah's record belongs to the project rather than one editor's private chat.

Plugin installation may be host-wide, while capture permission remains project-specific. Qarinah only records events each host actually exposes.

See [Codex and Claude Code integrations](HOST-INTEGRATIONS.md).

## Does Qarinah work with every IDE and AI agent?

No universal compatibility claim is made.

The stable release provides a local CLI, typed JavaScript API, one-command Codex, Claude Code, and Cursor setup, strict JSON stdin interfaces, MCP diagnostics, and optional consent-gated MCP context retrieval. Other hosts need a reviewed adapter or an explicit CLI/API integration.

## Does the MCP server automatically give an agent project context?

No. The default MCP server exposes only zero-write status and integrity diagnostics.

The `context.query` tool appears only after explicit setup with `--allow-query`. Its permit is bound to the exact workspace, current consent-policy hash, and response ceilings. It cannot initialize a workspace, grant trust, repair state, append events, or disclose another workspace. Retrieve context explicitly with that tool, `qarinah query`, the JavaScript API, or a separately reviewed Maqam capability.

## Does Qarinah require an API key, cloud account, or hosted database?

No Qarinah API key, hosted memory account, embedding service, vector database, or analytics endpoint is required for local operation.

Installing models or using external AI providers remains outside Qarinah's responsibility and may require those providers' credentials.

## Which Node.js versions are supported?

Qarinah 0.1.3 supports maintained Node.js 22, 24, and 26 releases:

```sh
node --version
npm install --save-dev qarinah
```

The CLI rejects unsupported major versions.

## How do I initialize a project?

From the exact project root:

```sh
npx qarinah init .
npx qarinah scan
npx qarinah doctor
```

Initialization is explicit. A cloned repository cannot silently grant itself machine-local trust.

## Where is Qarinah memory stored?

The project contains a `.qarinah/` directory:

```text
.qarinah/
  config.json
  events/events.jsonl
  graph/graph.json
  index/index.json
  records/CONTEXT.md
  records/okf/
  index/event-ids/
```

`events/events.jsonl` is authoritative. The graph, index, Markdown, and OKF views are rebuildable.

## Can I inspect or version Qarinah data in Git?

The deterministic Markdown and OKF views are designed for review and diffing. Teams should decide which `.qarinah/` files belong in version control based on project privacy and retention policy.

Machine-local trust and revocation state stay outside the repository, so copying project files does not copy permission.

## How do I create a small context pack?

```sh
npx qarinah query "release provenance" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --reserve-tokens 200 \
  --format markdown
```

The result contains complete selected records, citations, and a retrieval manifest. The reserve reduces the part of the stated budget available for selected records.

## What happens when evidence is missing?

With the default `any` coverage mode, Qarinah returns the best bounded pack available. Use `partial` to reject a no-evidence pack or `direct` when one selected record must contain all normalized query terms:

```sh
npx qarinah query "production rollback approval" \
  --minimum-coverage direct \
  --format json
```

When the requirement is not met, the operation fails instead of labeling a weak result direct evidence.

## Can Qarinah retrieve historical context?

Yes. Use an ISO timestamp:

```sh
npx qarinah query "authentication provider decision" \
  --as-of 2026-07-01T12:00:00.000Z \
  --minimum-coverage direct \
  --format markdown
```

Only eligible records captured by that time can appear.

## Can I export Qarinah memory?

Yes. Export a deterministic Open Knowledge Format Markdown bundle:

```sh
npx qarinah export okf --output ./artifacts/qarinah-okf
```

The export includes concepts, relations, citations, content hashes, and chain hashes. It is an interchange view; the JSONL event chain remains authoritative.

## How do I verify integrity?

```sh
npx qarinah doctor
```

Expected successful output includes `ok: true` and `derived: "current"`. If derived views are stale or missing:

```sh
npx qarinah build
npx qarinah doctor
```

Hash-chain and checkpoint verification establish continuity relative to the local checkpoint. They do not prove the truth of every recorded statement.

## How do I pause or revoke Qarinah?

Pause capture while retaining project memory:

```sh
npx qarinah disable
```

Resume it:

```sh
npx qarinah enable
```

Revoke machine-local trust:

```sh
npx qarinah untrust
```

These commands do not silently delete the project's durable record.

## Is Qarinah open source?

Yes. Qarinah is licensed under Apache License 2.0. The license permits commercial use, modification, and redistribution under its terms.

The source, benchmark fixtures, machine-readable results, technical paper, security model, and integration files are public.

## How can I reproduce the benchmark?

From a source checkout:

```sh
npm run evaluate:software-tasks
npm run evaluate:long-document
npm run evaluate:context
npm run benchmark
```

See [BENCHMARKS.md](BENCHMARKS.md), [software-task results](../bench/results/software-task-context-0.1.1.json), and [long-document results](../bench/results/long-document-context-0.1.1.json).

## Where should I start?

1. Follow [Getting started](GETTING-STARTED.md).
2. Use a task-led example from [Recipes](RECIPES.md).
3. Read [Token-efficient context](TOKEN-EFFICIENT-CONTEXT.md).
4. Review [Security](SECURITY.md) before enabling content capture.
5. Configure [Codex and Claude Code](HOST-INTEGRATIONS.md) only from reviewed releases.
