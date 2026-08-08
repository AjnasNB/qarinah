# Qarinah research retrieval development protocol v0.5

Status: **frozen pre-outcome amendment; execution is not authorized**

Machine-readable authority: [`bench/research/research-retrieval-development-v0.5-amendment.json`](../bench/research/research-retrieval-development-v0.5-amendment.json)

## Purpose

v0.5 is a source-bound differential reproduction check. It asks one narrow question:

> When the inspected SWE-bench Lite development corpus is evaluated through the bound current production retrieval API and projected into the fields recorded by v0.4, is the complete generated `expected` object exactly equal to the immutable v0.4 `expected` object?

This is not a new held-out benchmark, a retrieval improvement experiment, or a task-resolution study. The corpus and earlier results have already been inspected. A passing run can establish exact projected reproduction on this development corpus only.

At authorship time no v0.5 evaluator existed, no v0.5 retrieval ran, no v0.5 outcome was observed, and `bench/results/research-retrieval-development-v0.5.json` did not exist.

## Immutable v0.4 reference

The reference is frozen at:

- commit `31a0c38be6e2f506e669e57dc30607a9f87dcc5b`;
- annotated tag `research-retrieval-development-v0.4`;
- artifact `bench/results/research-retrieval-development-v0.4.json`;
- artifact SHA-256 `sha256:607359a947e7a849512d3fcb588bc88c2b34e1289f15b735a2de0c3895a21a18`.

The evaluator must read that artifact from the exact tagged commit and verify the artifact hash before parsing it. It may not rewrite, normalize, migrate, or replace the reference.

The complete reference object is the artifact's top-level `expected` value. Its canonical binding is:

- algorithm: `sha256-utf8-json-stringify-preserved-insertion-order-v1`;
- construction: UTF-8 bytes of `JSON.stringify(expected)`, using the parsed committed insertion order, with no whitespace and no trailing newline;
- length: `3,110,007` bytes (`3110007` as the machine value);
- SHA-256: `sha256:12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c`.

Recursive key sorting and pretty JSON are different representations and are forbidden for this equality gate.

## Bound production source

The production helper origin is commit `6c22d8f293e1e99bbbee239abb36e219af2c96a9`. Source hashes below use SHA-256 over UTF-8 content after CRLF-to-LF normalization.

| Path | SHA-256 |
|---|---|
| `src/index.js` | `sha256:66a69c1b2143fb559ff5c67dfd3e41031a48a5c46ca49631ac1f996ea6cf7fa7` |
| `src/retrieval.js` | `sha256:729991b59ea5a0b073c6cdd93fef15c622c819c7f46947b1167f44d598b3a68a` |
| `src/canonical.js` | `sha256:c24859c69ff8571128107c7de6718fc02aad9cb64f807f174d23bf8b12293225` |
| `src/contracts.js` | `sha256:d74d0487fad186901c7aa1a8c8530c0920fe3908c611ce85ec17c6336d575650` |
| `src/indexer.js` | `sha256:868c6e433dc858cd665c3c844bb72449e102bf1bc288f1c9daf41ecf4986ff4b` |
| `src/interoperability/boundary.js` | `sha256:80798113257019fa38573acf262ed69b8f1b2b887ceb8ce37f53951c2f1d3118` |
| `src/redact.js` | `sha256:6198154b1d4a37adfea308f8b2723c89788ab8046ca587210e278952ca4454b4` |

A later evaluator commit may add evaluator, test, package, and authorization files. It may not change these bound production bytes. The evaluator must fail before retrieval if any normalized source hash differs.

## Bound inspected corpus

This remains development evidence. Structural labels are not blinded human relevance judgments.

| Input | Binding |
|---|---|
| Corpus | `bench/research/swe-bench-lite-development-v0.2.json` — file SHA-256 `sha256:d30f94bba88f72db737340f05a9d3ad3c739c46f84307abc8802a78ca4de0482` |
| Logical corpus content | `sha256:01b35115ac639c1fcd3779561f83d5bb21988eb74ee5e93798c5d7579d757863` |
| Loader | `bench/research/swe-bench-lite.mjs` — SHA-256 `sha256:3b92352951a07854786b1a74ee5d2e6e5cbe1247b7c39d2f1135593cfed431dc` |
| Raw source artifact | logical path `data/test-00000-of-00001.parquet`; exact URL `https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet`; `1,119,540` bytes; SHA-256 `sha256:7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4` |

The raw Parquet is not committed at that logical path. Before retrieval, every execution-capable preflight must request only the exact bound HTTPS URL into memory, require the exact byte length and SHA-256, then discard the bytes. A server-controlled redirect reached from that exact request is acceptable only when the final bytes pass both bindings. No alternate URL, revision, local file, cache object, substituted loader, or regenerated corpus is permitted. Network or binding failure aborts before retrieval. These fetched bytes are provenance evidence only and may never regenerate, replace, or modify the committed development corpus or its structural labels. Binding-only preflight performs the same in-memory verification without filesystem writes or retrieval.

## Exact projection gate

The candidate must contain the complete generated `expected` object: corpus metadata, both evaluation settings, inference entries, and every task result. Summaries, sampled tasks, aggregate-only checks, tolerances, and metric substitution do not satisfy the protocol.

Before a result can be published, all four checks must pass:

1. Node deep strict equality between the complete reference and candidate `expected` objects.
2. Candidate canonical length equals `3,110,007` bytes (`3110007` as the machine value).
3. Candidate canonical SHA-256 equals `sha256:12f00c2e831e56b26c7eeff13d8b6aed0fee22760d40f5a46a1cb579870b3d0c`.
4. Candidate canonical bytes equal the reference canonical bytes.

The tolerance is zero. Any mismatch fails closed and produces no result artifact.

## Current global API differences

The current production API is not globally identical to the historical implementation:

- `rankContextEvents` now returns additive `admission` and `currentState` audit fields;
- `src/index.js` now exports `resolveContextAdmission` and `resolveCurrentContextState`;
- with a non-empty repository filter, an absent or undefined `event.repository` now fails closed instead of potentially throwing; explicit `null` and exact repository matches keep their bound semantics;
- invalid-input error precedence can differ because admission and current-state validation are explicit helpers.

The evaluator may validate or observe the additive audit fields and helpers for binding diagnostics, but it must ignore them when building the v0.4-compatible projection, exactly as v0.4 did. Every event in this bound corpus has validated repository metadata and benchmark inputs are valid, so the listed global differences are outside this measurement.

Even exact equality therefore supports only corpus-scoped projected reproduction. It does not prove universal or global behavior equivalence.

## Evaluator and authorization lifecycle

The evaluator is intentionally unbound at protocol-authorship time. Its future commit, tag, script hash, `package.json` hash, and `types/index.d.ts` hash are `null`. The protocol commit, tag, and two protocol-file hashes are also `null` here to avoid a self-referential commitment.

Before any retrieval executes:

1. Commit and independently review exactly this manifest and document as the pre-outcome protocol.
2. Implement the evaluator at `scripts/evaluate-research-retrieval-v0.5.mjs` in a separate commit.
3. Independently review that evaluator and create an immutable evaluator tag.
4. Create and commit a separate, reviewed authorization receipt. It must bind the protocol commit and tag, both protocol-file hashes, evaluator commit and tag, evaluator hash, `package.json` hash, `types/index.d.ts` hash, absence of the result path, reviewer decision, attempt ID, and exact authorized command.
5. Obtain explicit authorization for that one attempt.

The only permitted modes are:

| Mode | Exact package command | Retrieval | Writes |
|---|---|---:|---:|
| Binding-only preflight | `npm run check:research-retrieval:v0.5:bindings` | No | No |
| One authorized execution | `npm run evaluate:research-retrieval:v0.5:write` | Yes | One atomic result or one bounded failure receipt |
| Post-result verification | `npm run check:research-retrieval:v0.5:result` | No | No |

The bound argv values are, respectively:

```text
node scripts/evaluate-research-retrieval-v0.5.mjs --bindings-only
node scripts/evaluate-research-retrieval-v0.5.mjs --execute --write
node scripts/evaluate-research-retrieval-v0.5.mjs --verify-result
```

No other mode, direct invocation, silent fallback, automatic retry, or outcome printing before publication is allowed.

## Atomic result and failure receipts

A passing result uses schema `qarinah.research-retrieval-development-result.v5` at `bench/results/research-retrieval-development-v0.5.json`. The destination must be absent at authorization and execution start. The evaluator must serialize and verify the complete artifact in a same-directory exclusive temporary file, flush it, and publish it through an atomic no-replace operation. A pre-existing destination causes refusal. Overwrite, deletion, rename-overwrite, and rerunning after a successful publication are forbidden.

An authorized execution failure must publish one bounded receipt using schema `qarinah.research-retrieval-development-failure-receipt.v1` at:

```text
bench/results/research-retrieval-development-v0.5-{attemptId}-failure.json
```

The receipt records the attempt and command; exact protocol, evaluator, source, and corpus bindings; UTC start and failure times; failed stage and code; a sanitized message; whether retrieval started or completed; result publication state; and result-path absence at start and failure. It must say `resultPublished: false`. It may not contain a partial `expected` object or partial outcome metrics. It is also written atomically without replacement and never authorizes a retry.

## Scope and claims

The run makes zero provider-model calls and measures no provider-reported tokens. It performs no SWE-bench Docker task execution, patch generation, human relevance review, human code review, latency study, or cost study.

Only after every gate passes is this wording allowed:

> On the inspected SWE-bench Lite development corpus, the bound current production retrieval API projection reproduced the complete frozen v0.4 expected object exactly under protocol v0.5.

The protocol does not support claims of a new quality improvement, confirmatory or held-out evidence, universal equivalence, provider-token savings, cost reduction, latency, task success, patch quality, human-rated quality, “best AI,” “best context reduction,” “best in the industry,” or peer review.

Until the separately reviewed evaluator and authorization receipt exist and explicit execution authorization is given, **do not run v0.5 retrieval**.
