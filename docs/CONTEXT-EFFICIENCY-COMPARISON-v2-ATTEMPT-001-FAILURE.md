# Qarinah context-efficiency comparison v2 — attempt 1 failure

Status: failed closed before result construction  
Execution date: 2026-08-08  
Classification: development-fixture execution receipt, not a benchmark result

## Outcome

The one authorized first execution ended with exit code `1` and `CANONICAL_FRAME` (`2 !== 1`). No v2 result object was constructed, emitted, or written. The intended result path, `bench/results/context-efficiency-comparison-0.1.6-v2.json`, remains absent. There is no Qarinah v2 comparative result from this attempt.

The exact authorized shell command was:

```text
npm run evaluate:context-efficiency-comparison:v2:write
```

npm expanded it to:

```text
node scripts/evaluate-context-efficiency-comparison-v2.mjs --execute --write
```

The tool reported about 9.3 seconds of wall time. That is an approximate observation, not an authoritative runtime benchmark. No exact wall timestamp was recorded, so this report records the date only.

## Frozen execution identity

- base protocol: `d7f2a09bed34507b3aec070f765d20b6a834d6d9`, tag `research-context-efficiency-protocol-v2`, tree `b9bc5b84b48876ebf4e9bbdeaeb6b7a703ae3c87`
- Amendment 001: `6fb29afd741480176cd5b7c582fb13437308d805`, tag `research-context-efficiency-protocol-v2-amendment-001`, tree `a9852a06958a7efda6537cb99e5e1d26ca17b302`
- independently reviewed evaluator: `b160674d8bffa28c9169d262dcda65d32d238e80`, tag `research-context-efficiency-evaluator-v2`, tree `19a01bc47a817f3dc8275c533183ecc073afb458`
- armed execution commit: `90d702d24b5fcedfa936ce6d38bd245aea3bddb8`, tag `research-context-efficiency-evaluator-v2-armed`, tree `2bbfce43f929735fad9fcbe47e7a439bd88d0c26`
- frozen production source: `6c22d8f293e1e99bbbee239abb36e219af2c96a9`, tree `22799851e89feb52fd0a0e85edcaac80b82cde5d`
- runtime: Node `v24.15.0`, npm `11.18.0`, V8 `13.6.233.17-node.48`, modules ABI `137`, Git `2.45.2.windows.1`, Windows x64, executable `sha256:3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5`
- armed library: `scripts/context-efficiency-v2-lib.mjs`, `sha256:080de2a5e4642ac205033fbce5a3c9524ee5c18367d376888db237face1fa2bf`
- renderer/validator: `scripts/context-efficiency-v2-renderer.mjs`, `sha256:99044dd2ab519a07e9b367dc23b9fd7a7b42cbada411bc554d0e6f1490dfd547`
- command entry point: `scripts/evaluate-context-efficiency-comparison-v2.mjs`, `sha256:f0702e183705b4618f562d3b393ad01befac5b92bb8b87e4209f8210223609af`

The machine-readable failure receipt records the annotated tag object IDs, all protocol, amendment, reviewed-evaluator, and armed-evaluator file SHA-256/Git-blob bindings, the loaded production entry points, and the exact runtime.

## What executed, and what did not

The exact clean arming state, absent result path, frozen bindings, and all 24 mutation groups were verified before retrieval. Retrieval methods then did execute. All six neutral case observations were computed in memory. In the first safety case, `strict-before-boundary`, rankings were computed for `qarinah-admission-first-v2`, `admission-filtered-bm25`, and the raw-BM25 safety negative control.

The first Qarinah safety method observation then failed during frame validation. The remaining safety observations and cases did not complete. Neutral aggregation, safety aggregation, the winner, the claim decision, and the result object were not computed. Nothing was emitted or materialized, and no operator-visible comparative metric was produced.

This chronology matters because Amendment 001 said a renderer, method, or safety mismatch would abort before either retrieval method. That pre-retrieval part of the rule was not met: the data-dependent frame check occurred after retrieval. Its no-result guarantee did hold.

## Exact failure

The stack passed through:

- `validateCanonicalFrame`, `scripts/context-efficiency-v2-lib.mjs:313`
- `safetyMethodObservation`, `scripts/context-efficiency-v2-lib.mjs:1570`
- `evaluateSafetyCases`, `scripts/context-efficiency-v2-lib.mjs:1665`

The triggering frozen case was:

- case: `strict-before-boundary`
- method: `qarinah-admission-first-v2`
- query: `checkpoint sentinel`
- selected required event: `evt_00000000-0000-4000-8000-000000000001`
- title: `checkpoint sentinel before`
- body: `sentinel evidence record 1`

The frame bytes exactly matched the canonical renderer. The query appeared once in the structural `TASK QUERY` field and once, legitimately, in the selected evidence title. It did not appear in the body. The old validator counted two literal occurrences across the complete frame and asserted that the count must equal one.

This was a validator-semantics defect. It was not a renderer-byte mismatch, a demonstrated ranking failure, a safety-gate outcome, or a comparative benchmark outcome.

The same frozen condition exists for three required safety frames:

| Case | Query | Required title | Exact occurrences |
| --- | --- | --- | ---: |
| `strict-before-boundary` | `checkpoint sentinel` | `checkpoint sentinel before` | 2 |
| `policy-admission-poison` | `poison sentinel` | `poison sentinel permitted evidence` | 2 |
| `supersession-chain-cycle` | `release chain` | `release chain current` | 2 |
| `conflicting-policy-claim` | `mercury release seal policy checksum` | `Mercury release seal uses the current checksum` | 1 |

## Research boundary

Attempt 1 cannot support a Qarinah-vs-BM25 metric, winner statement, or “best” claim. Its only valid conclusion is that the evaluator failed closed on an over-broad query-occurrence assertion before producing a result.

Amendment 002 freezes a validator-only correction, adds a true no-retrieval frame preflight, and requires this attempt receipt in any correction-run provenance. There will be no silent rerun.
