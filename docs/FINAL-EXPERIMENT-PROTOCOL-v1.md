# Qarinah final experiment protocol v1

## Status and claim boundary

This protocol is frozen before selecting or observing Qarinah results on the final task manifest. It defines the confirmatory retrieval study and the later coding-agent study. A committed task manifest may be generated only from the inclusion rules below. No Qarinah ranking, sufficiency, model outcome, or aggregate performance may be inspected before that manifest is committed and hashed.

The public benchmark instances may have appeared in model training. “Untouched” means not used to tune Qarinah v0.1-v0.3 or select this study's thresholds; it does not mean secret or absent from model pretraining.

This protocol does not authorize provider spending, credential use, public release, deployment, npm publication, or GitHub submission.

## Research questions and hypotheses

- RQ1 / H1 — Context efficiency: at fixed complete-pack budgets, Qarinah reduces delivered project-history context relative to full history, recent history, and a running summary.
- RQ2 / H2 — Task utility: Qarinah preserves or improves Pass@1 repository-task resolution relative to retrieval baselines at the same context budget.
- RQ3 / H3 — Temporal and authority correctness: Qarinah reduces future, stale, superseded, restricted, and cross-repository evidence exposure.
- RQ4 / H4 — Cross-agent continuity: Qarinah improves fresh-process Claude-to-Codex and Codex-to-Claude continuation while reducing repeated work and contradictions.
- RQ5 — Selective evidence: when Qarinah emits `ACCEPT_DIRECT`, how often does independently reviewed direct evidence actually exist?

## Final dataset and inclusion rules

The final source is the official `princeton-nlp/SWE-bench_Verified` test split at one exact Git revision. The manifest generator must:

1. load only the 500-row Verified test artifact;
2. exclude every instance ID present in the pinned SWE-bench Lite development corpus used for v0.1-v0.3;
3. exclude any additional instance ID recorded as development data before the manifest is frozen;
4. require a valid repository, base commit, creation timestamp, and official test specification;
5. require at least one chronologically prior development-memory record in the same repository for the static retrieval study;
6. preserve every eligible task regardless of predicted or observed Qarinah performance;
7. record excluded IDs and one predetermined exclusion reason; and
8. commit task IDs, repository counts, dates, hashes, and source artifact hashes before any final retrieval run.

No task may be removed because it is difficult, times out, lacks a Qarinah positive, or harms a result. A task discovered to violate a frozen inclusion rule remains in raw outputs and is excluded only through a dated protocol amendment.

## Development and final separation

- Exploratory baseline: SWE-bench Lite v0.1.
- Development retrieval: the same Lite-derived 240 tasks in v0.2.
- Development sufficiency calibration: v0.3, including the structural oracle and blinded audit preparation.
- Final confirmatory retrieval: eligible Verified-minus-Lite tasks from the frozen final manifest.
- Final coding-agent experiment: a deterministic 40-task stratified sample from that manifest.
- Cross-agent handoff experiment: 32 separately specified multi-stage tasks, balanced across Claude-to-Claude, Codex-to-Codex, Claude-to-Codex, and Codex-to-Claude directions.

The 40-task agent sample must be selected before model execution and balanced as far as the eligible population permits by repository, date quartile, official difficulty, history size, and relevant-evidence count. Sampling uses a committed SHA-256-derived deterministic seed. No pilot outcome may influence selection.

## Retrieval conditions

Every ranking-only method receives the identical admissible candidate set: same repository, record timestamp strictly before the query timestamp, valid retention, permitted disclosure and authority, current temporal validity, and current-state supersession policy.

The retrieval conditions are:

1. admitted BM25;
2. dense retrieval using one fixed embedding model and distance function;
3. admitted BM25 plus dense retrieval;
4. graph only;
5. Qarinah without temporal logic, reported only as an unsafe ablation;
6. Qarinah without graph;
7. Qarinah without evidence gating;
8. full Qarinah; and
9. evaluator-only oracle ranking.

Dense and summary baselines are blocked until their exact provider or local model ID, revision, dimensions, normalization, distance function, prompt, and cache policy are recorded in the execution manifest. A missing baseline is reported as not executed, never silently replaced.

## Context conditions for coding agents

Each model sees the same issue, base repository, tools, and limits under:

1. no memory;
2. most recent N records fitted to budget;
3. full retained history fitted to budget;
4. fixed-model running summary;
5. admitted BM25;
6. dense retrieval;
7. BM25 plus dense;
8. full Qarinah;
9. evaluator-only oracle evidence.

Primary delivered-context budget is 4,000 tokens. Secondary retrieval curves use 512, 1,000, 2,000, 4,000, and 8,000 tokens. Complete records are included; records are never truncated differently across methods. Provider-token results use provider receipts. `ceil(characters / 4)` is reported only as an explicitly inexact portable estimate.

## Agent execution controls

Before any paid or model-backed run, `bench/final/execution-environment-v1.json` must record and hash:

- exact Codex CLI and Claude Code versions;
- exact provider model IDs and immutable revisions where available;
- agent harness commit;
- Qarinah commit and protocol tag;
- container harness version and image digests;
- tokenizer and embedding versions;
- operating system and architecture;
- tool allowlist and internet policy;
- provider pricing snapshot and currency;
- retry, caching, and sampling settings; and
- maximum authorized calls, tokens, and currency.

The run is invalid if a model is identified only as “latest” or if a version changes between conditions.

Per task and condition:

- one attempt, Pass@1;
- maximum 30 agent turns;
- maximum 30 minutes wall-clock after the container is ready;
- temperature 0 or the provider's documented deterministic setting;
- no model-level retry after a completed response;
- infrastructure retries only before model input, with reason preserved;
- repository read/write and local test execution allowed;
- no gold patch, test patch, post-resolution discussion, or future task record exposed;
- internet disabled during solving after required images and packages are acquired; and
- identical initial base commit and tool policy across conditions.

## Primary and secondary metrics

Primary coding metric:

- resolved / Pass@1 under the official containerized SWE-bench evaluator.

Primary evidence metric:

- precision of `ACCEPT_DIRECT` against independently adjudicated relevance labels.

Secondary metrics:

- FAIL_TO_PASS success and PASS_TO_PASS regressions;
- Recall@1, Recall@5, Recall@10, Hit@10, Precision@5, Precision@10, MRR, nDCG@10, direct recall, and supporting recall;
- input, cached-input, and output tokens from provider receipts;
- total cost, duration, turns, and tool calls;
- files read, repeated file reads, commands repeated, and tests executed;
- incorrect-change and regression rate;
- citation accuracy and unsupported claims;
- stale, future, restricted, wrong-repository, and superseded exposure at item and query level;
- sufficiency precision, recall, F1, false-acceptance rate, correct-abstention rate, AUPRC, AUROC, Brier score, ten-bin calibration error, and risk-coverage curve; and
- human-rated correctness, maintainability, minimality, and consistency with prior decisions.

## Cross-agent handoff controls

For every handoff task, Agent A performs diagnosis and bounded work, records permitted evidence, and stops at the predetermined phase boundary. Its process terminates. Agent B starts in a fresh process with the same repository state and no native session transcript.

Directions are Claude-to-Claude, Codex-to-Codex, Claude-to-Codex, and Codex-to-Claude. Handoff conditions are no handoff, Git state, static instructions, human `HANDOFF.md`, fixed-model transcript summary, full transcript when it fits, Qarinah, and human-selected oracle evidence.

The run record must include repository and source commits, process IDs or fresh-session identifiers, Qarinah event IDs and hashes, pack and manifest hashes, exact handoff bytes/tokens, provider receipts, tests, final diff, repeated actions, contradictions, and final outcome. A video is supplementary demonstration material and is never counted as a research replicate.

## Human review

At least two reviewers independently label relevance and code quality while blinded to method and Qarinah decision. Allowed relevance labels are `DIRECT_EVIDENCE_EXISTS`, `SUPPORTING_EVIDENCE_EXISTS`, `NO_RELEVANT_EVIDENCE`, and `UNCERTAIN`.

Report raw agreement, Cohen's kappa, disagreement count, and adjudicated labels. Adjudication occurs only after both independent passes. Reviewers may not be replaced or cases relabeled based on aggregate performance. Reviewer conflicts of interest and exclusions are recorded.

## Statistical analysis

- Report raw counts and 95% confidence intervals for every primary result.
- Use paired comparisons because methods see the same task.
- Use repository-clustered bootstrap intervals with 10,000 deterministic resamples for continuous retrieval metrics.
- Use paired bootstrap and McNemar's test for resolved/not-resolved outcomes.
- Report per-repository results and macro as well as micro aggregates.
- Treat task success versus delivered context tokens and recall versus invalid-evidence exposure as Pareto curves; do not collapse them into one score.
- Correct the two primary hypothesis tests with Holm's method; secondary tests are exploratory and labeled accordingly.
- Preserve all failures, refusals, and timeouts in denominators.

## Missing data and failure handling

- Model refusal, invalid patch, test failure, or timeout is a task failure.
- Infrastructure failure before model input may be retried once with the same frozen environment and recorded reason.
- Missing provider usage remains null and is not estimated into a provider-usage field.
- Missing human review blocks the human-validated evidence claim.
- Missing Docker evaluation blocks the task-success claim.
- A condition with systematic infrastructure failure is reported and not replaced post hoc.

## Stopping rules

Execution stops only for the predeclared call/token/currency ceiling, a safety or credential incident, corrupted artifacts, unavailable required model revision, or infrastructure failure affecting at least 10% of scheduled runs. Completed runs remain preserved. Stopping is not triggered by favorable or unfavorable performance.

## Expected tables and figures

- Dataset and timeline table.
- Offline retrieval table.
- Abstention and safety table.
- End-to-end coding table.
- Cross-agent handoff table.
- Task success versus delivered context tokens.
- Retrieval recall versus invalid-evidence exposure.
- Cross-agent continuation success and post-switch cost.

## Amendments

After the `research-protocol-v1` tag, every change must be appended to `docs/PROTOCOL-AMENDMENTS.md` with date, reason, whether any affected result was observed, expected direction of effect, and the approving reviewers. Historical protocol text is not silently edited.

## Execution gate

The final run must not begin until all of the following exist and verify: protocol receipt and tag, final task manifest and hash, exact execution-environment manifest, credentials supplied outside Git, authorized budget, Docker harness smoke result, dense and summary baseline specifications, two named reviewers with conflict declarations, and an empty final-results directory except for schemas and run plans.
