# Qarinah research-development result v0.4

Status: current-production recomputation on already inspected development data. This is not peer review, independent validation, or a final confirmatory result.

## Why v0.4 exists

The frozen v0.2 retrieval artifact was produced at tag `research-retrieval-development-v0.2`, commit `bd566ac5ba7b302653b994fd0622d516fa74bbb8`, with `evidence-sufficiency-v1`. Development v0.3 then applied the conservative 0.65 decision threshold to those frozen v0.2 scores. Both artifacts remain unchanged as historical development evidence.

The product later shipped `evidence-sufficiency-v2`, including bounded code-entity extraction, 0.65/0.4 thresholds, and explicit `ACCEPT_DIRECT` versus `ABSTAIN` decisions. Re-running the old v0.2 evaluator against mutable current source therefore mixed experimental versions. The main-branch v0.2 command now fails fast and tells the operator to use the exact historical tag. Development v0.4 is the separate recomputation of the same 240-query corpus against the current production implementation.

## Current production-bound result

| Setting | Structural-oracle positives | Direct accepts | False accepts on oracle-negative queries | Direct precision (exact 95% CI) | Direct recall | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Static | 191 / 240 | 10 / 240 | 0 / 49 | 100% (69.15%-100%) | 5.24% | 4.17% |
| Online/prequential | 209 / 240 | 15 / 240 | 0 / 31 | 100% (78.20%-100%) | 7.18% | 6.25% |

The exact 95% upper bounds for the false-acceptance rate remain 7.25% static and 11.22% online. Zero observed errors on these oracle-negative cases is not proof of a zero population error rate. The structural oracle is based on file, symbol, and module overlap and has not been replaced by independent human relevance judgments.

Partial evidence remains an abstention. If partial and direct states are combined only for score-diagnostic analysis, the structural-oracle negative rate is 55.10% static and 77.42% online. Those values are not production false accepts because only `DIRECTLY_SUPPORTED` maps to `ACCEPT_DIRECT`.

Ranking is unchanged from v0.2: admission-first Qarinah exactly matches admitted BM25 on the shared admissible candidate set. Online Recall@10 is 0.5383, MRR is 0.6956, and the paired MRR improvement over balanced-v1 remains 0.0949 with a 12-repository clustered-bootstrap 95% interval of [0.0572, 0.1115]. Graph expansion again adds no ranking improvement on this workload.

## Reproducibility

Run the current production-bound evaluator without writing:

```sh
npm run evaluate:research-retrieval:v0.4
```

The committed artifact is [`bench/results/research-retrieval-development-v0.4.json`](../bench/results/research-retrieval-development-v0.4.json), SHA-256 `607359a947e7a849512d3fcb588bc88c2b34e1289f15b735a2de0c3895a21a18`. It records per-file implementation hashes and the combined implementation digest `sha256:034498c05fdf847078e639b6a2ed1efe2c72a1d714ca7f9bee337b3312bcd2eb`. `npm run check` recomputes v0.4 and fails if either measured values or bound production source hashes drift.

To reproduce historical v0.2, use a separate clean worktree at the exact tag; do not run the old experiment through current source:

```sh
git worktree add ../qarinah-research-v0.2 research-retrieval-development-v0.2
cd ../qarinah-research-v0.2
npm ci
npm run evaluate:research-retrieval:v0.2
```

## Claim boundary

- The corpus contains public SWE-bench Lite issues from real repositories, but it is development data that influenced the system.
- The relevance labels are a deterministic structural oracle, not independent semantic judgments.
- The run makes zero provider model calls, generates no patches, and does not execute the official SWE-bench Docker evaluator.
- It does not establish provider-token savings, task-resolution improvement, total-cost reduction, or universal evidence-gate precision.
- The separate Codex-to-Codex receipt remains one provider-backed synthetic product smoke. It is reproducibly verified by `npm run check:continuation-evidence` and can be freshly recorded only by actually running `npm run smoke:codex-continuation:record` with an authenticated Codex CLI.
