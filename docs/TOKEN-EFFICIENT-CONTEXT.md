# Token-efficient context for coding agents

Qarinah is the evidence-linked cross-agent context engine for software projects. It keeps permitted project events and explicit decisions in an evidence-linked record, then retrieves a small, cited context pack for the current task. The goal is to let Codex, Claude Code, Cursor, a CLI workflow, or another reviewed host continue the same project without replaying its complete retained history.

Qarinah does not remove the current code, schema, logs, tests, or other task inputs a model still needs. It reduces repeated retained history in a reproducible benchmark, not every token in every model request.

## The shortest useful workflow

Install Qarinah in a project:

```sh
npm install --save-dev qarinah
npx qarinah init .
```

Initialization is an explicit opt-in for the exact workspace. Metadata-only capture is the default. If reviewed event bodies may be retained, opt in to content capture deliberately:

```sh
npx qarinah init . --capture content
```

Record a decision worth carrying into later tasks:

```sh
npx qarinah record \
  --kind decision \
  --title "Keep release artifacts provenance-bound" \
  --body "Publish only the tested artifact produced from the reviewed commit."
```

Record project structure and build the derived graph, index, and readable views:

```sh
npx qarinah scan
npx qarinah build
```

Compile a cited context pack with a fixed token budget:

```sh
npx qarinah query "release artifact provenance" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --reserve-tokens 200 \
  --format markdown
```

The command prints a Markdown context pack containing complete selected records, evidence citations, and a retrieval manifest. Event IDs and content hashes let a reviewer trace selected memory back to the local record. `--reserve-tokens 200` keeps 200 tokens of the 1,500-token limit unused for a host-owned wrapper or instruction.

Verify the record and derived state before relying on it:

```sh
npx qarinah doctor
```

Successful output is JSON with `ok: true` and `derived: "current"`. If derived state is missing or stale, run `npx qarinah build` and repeat the check.

## Use Qarinah before a model request

Qarinah is most useful when a host queries project memory before constructing the next model request:

1. The host owns the current task and current source files.
2. Qarinah receives a focused memory query.
3. Qarinah verifies the local record and searches its derived index.
4. The context compiler selects complete cited records within the requested budget.
5. The host sends the current task, required current sources, and the Qarinah pack to the chosen model.

This pattern separates current working material from accumulated project history. It also keeps the authoritative JSONL record separate from disposable graph, index, Markdown, JSON, and OKF projections.

## Write queries that retrieve evidence

Use terms that identify the decision, component, failure, or constraint you need:

```sh
npx qarinah query "checkout dialog focus trap" \
  --minimum-coverage direct \
  --max-tokens 1200 \
  --format markdown
```

Prefer this over a broad query such as `frontend`. A focused query gives the lexical and graph-aware retriever a clear target and makes the coverage result easier to interpret.

The local retriever combines:

- BM25 lexical relevance;
- character-trigram typo tolerance;
- one-hop graph evidence;
- reciprocal-rank fusion;
- deterministic diversity;
- time, authority, and retention signals;
- explicit conflict and supersession handling.

This is a deterministic local retrieval pipeline. It does not call an embedding API or claim semantic equivalence between arbitrary phrases.

## Choose an evidence-coverage gate

`--minimum-coverage` controls when a pack should be rejected:

| Value | Behavior |
| --- | --- |
| `any` | Return the best bounded pack even when query-term coverage is weak. |
| `partial` | Reject a pack with no query-term evidence. |
| `direct` | Require at least one selected record containing every normalized query term. |

For a release, approval, migration, or security decision, start with `direct`:

```sh
npx qarinah query "production database rollback approval" \
  --minimum-coverage direct \
  --format json
```

Direct coverage is a retrieval diagnostic. It does not prove that a later model answer is correct, complete, or free of hallucinations.

## Control the context budget

Use either characters or estimated tokens:

```sh
npx qarinah query "API pagination decision" \
  --max-chars 7000 \
  --format markdown
```

```sh
npx qarinah query "API pagination decision" \
  --max-tokens 1800 \
  --reserve-tokens 300 \
  --format markdown
```

Qarinah selects complete records rather than truncating a selected record mid-sentence. Very small budgets may therefore produce fewer records than the result limit permits.

The portable token budget uses a character-based estimate. It is useful for deterministic local planning but is not a provider tokenizer or billing receipt.

## Safe automation with JSON stdin

Agent callers should keep model-controlled text out of shell arguments. Send one bounded JSON object through stdin:

```sh
printf '%s' '{"query":"release provenance","format":"json","minimumCoverage":"direct","maxTokens":1500,"reserveTokens":200}' \
  | npx qarinah query --stdin-json
```

Supported query fields are `query`, `format`, `limit`, `maxChars`, `maxTokens`, `reserveTokens`, `asOf`, and `minimumCoverage`. Unknown fields are rejected.

Durable records can use the same strict transport:

```sh
printf '%s' '{"kind":"decision","title":"Use resumable migrations","body":"Every production migration requires a tested rollback path.","confidence":"claimed"}' \
  | npx qarinah record --stdin-json
```

## Share memory across Codex and Claude Code

Qarinah stores memory in the opted-in project, not in one editor's private conversation. A reviewed Codex integration and a reviewed Claude Code integration can append the lifecycle events their hosts expose to the same trusted workspace record. A later task can then request a cited pack from that project regardless of which supported host recorded the relevant event.

Install the reviewed plugins once per host:

```sh
codex plugin marketplace add AjnasNB/qarinah --ref v0.2.0
codex plugin add qarinah@qarinah
```

```sh
claude plugin marketplace add AjnasNB/qarinah@v0.2.0 --scope user
claude plugin install qarinah@qarinah --scope user
```

Then initialize each project separately:

```sh
npx -y qarinah@latest init . --capture metadata
npx -y qarinah@latest scan
npx -y qarinah@latest doctor
```

Plugin installation can be host-wide; capture permission remains project-specific. Restart the host after installing or upgrading a plugin.

Qarinah's MCP server exposes zero-write status and integrity diagnostics by default. Bounded `context.query` retrieval appears only after explicit workspace authorization bound to the current consent-policy hash. Context retrieval can also be an explicit CLI or JavaScript operation, or a separately reviewed Maqam capability.

## Inspect an earlier project state

Use an ISO timestamp to retrieve records as they were visible at a chosen time:

```sh
npx qarinah query "authentication provider decision" \
  --as-of 2026-07-01T12:00:00.000Z \
  --minimum-coverage direct \
  --format markdown
```

Historical retrieval helps audit when a decision changed, but the result still depends on events that were actually captured before that timestamp.

## Export portable project memory

Build a deterministic Open Knowledge Format Markdown bundle:

```sh
npx qarinah export okf
```

Or select an output directory:

```sh
npx qarinah export okf --output ./artifacts/qarinah-okf
```

The export is a reviewable interchange view. The append-only JSONL event chain remains authoritative.

## What the published result means

The committed software-task evaluator compares:

- the same current-task source snippets on both sides;
- complete retained project-history replay on the baseline side; and
- a cited Qarinah pack on the Qarinah side.

The weighted result is 442,113 estimated input-context tokens for full-history replay versus 5,682 for the Qarinah path: **98.71% less estimated repeated context**. Every required target was directly covered in the top five for those committed tasks.

The estimate is `ceil(characters / 4)`. It is not provider-native Codex or Claude usage, a provider invoice, total application cost, universal retrieval quality, or a guarantee for another project. At the same flat input-token rate, the compared input-context slice is 98.71% smaller; output tokens, tools, caching, retrieval work, and fixed provider charges remain separate.

Reproduce the evidence with:

```sh
npm run evaluate:software-tasks
npm run evaluate:long-document
npm run evaluate:context
npm run benchmark
```

See [benchmarks](BENCHMARKS.md), the [machine-readable software-task result](../bench/results/software-task-context-0.1.0.json), and the [long-document result](../bench/results/long-document-context-0.1.0.json).

## Boundaries that preserve trust

- Qarinah records only events delivered by a supported host adapter and records explicitly committed by a user or workflow.
- It does not capture hidden reasoning or parse private transcript stores.
- Metadata-only capture is the default.
- Content capture requires explicit workspace consent and cannot prove arbitrary retained tool output contains no secret.
- Qarinah does not prevent provider-side conversation compaction.
- A coverage result measures retrieval evidence, not model-answer correctness.
- Ambient MCP context disclosure is disabled; permitted `context.query` is explicit, bounded, and zero-write.
- No benchmark result is a universal token, cost, latency, or accuracy guarantee.

Continue with [recipes](RECIPES.md), [host integrations](HOST-INTEGRATIONS.md), [security](SECURITY.md), and the [FAQ](FAQ.md).
