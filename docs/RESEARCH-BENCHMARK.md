# Qarinah: Evidence-Linked Temporal Memory for Cross-Agent Software Engineering

## Research protocol and preliminary real-repository benchmark

**Author:** Ajnas NB  
**Protocol version:** 1.0  
**Implementation:** Qarinah 0.1.2  
**Date:** August 2026  
**Status:** Research draft; exploratory v0.1 frozen, development v0.2 preserved, conservative gate v0.3 completed, not peer-reviewed and not preregistered
**Artifact license:** Apache License 2.0; upstream repositories and benchmark data retain their own terms

## Abstract

This research track studies whether evidence-linked, time-explicit project memory can reduce the history supplied to coding agents without reducing engineering-task success. The first reproducible phase uses the official public SWE-bench Lite test split: 300 tasks from 12 real repositories. Each repository is ordered by task creation time, its earliest 20% is used as memory-building history, and its remaining tasks are held out from that history. This produces 60 warm-up and 240 held-out tasks.

Exploratory v0.1 evaluates retrieval and governance, not patch generation. Only 79 of the 240 held-out tasks have a prior task that overlaps a gold production-file path, so retrieval effectiveness is reported on those 79 tasks and coverage behavior is reported on all 240. Plain BM25 outperforms the original Qarinah balanced hybrid ranking on this oracle: Recall@10 is 0.687 versus 0.518, and mean reciprocal rank is 0.430 versus 0.320. The lexical coverage gate accepts all 161 tasks for which the file-overlap oracle identifies no positive prior record; those tasks are not proven semantically unsupported. Removing time controls produces 971 future citations, or 42.44% of citations in that ablation. Separately, 72 constructed boundary records across all 12 repositories verify rejection of future, expired, stale, restricted, wrong-repository, and superseded evidence with zero forbidden records returned.

Exploratory v0.1 is frozen at Git tag `research-benchmark-exploratory-v0.1`. Development v0.2 changes Qarinah to admission-first lexical ranking and evaluates a deterministic graded structural oracle in both static and online/prequential settings. Qarinah v2 now matches admitted BM25 exactly on ranking while retaining governance controls and improves over the original balanced-v1 profile. Its graph stage adds no measured ranking value in this corpus. Development v0.3 changes the evidence decision to a conservative direct-only acceptance rule: partial evidence is exposed as an abstention, not accepted as sufficient. This removes direct false acceptances under the development structural oracle at the cost of accepting only 3.33% of static queries and 5.00% of online queries. The underlying score remains poorly calibrated and human relevance review is still pending. Provider-reported tokens, SWE-bench resolve rate, patch quality, model portability, cost, and human review remain unmeasured.

## 1. Research questions

- **RQ1:** How much project history can be removed while preserving successful software-engineering task completion?
- **RQ2:** Does temporal, evidence-linked memory outperform full history, recency, running summaries, lexical retrieval, vector retrieval, and graph retrieval?
- **RQ3:** Can the system reject future, stale, expired, superseded, conflicting, wrong-repository, and unauthorized context?
- **RQ4:** How portable is project memory across coding agents and model providers?

The preliminary retrieval phase addresses only part of RQ2 and RQ3. RQ1 and RQ4 require controlled model runs.

## 2. Corpus and held-out split

The source is the official public [`princeton-nlp/SWE-bench_Lite`](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite) test split at dataset revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`. The task schema and intended Docker evaluation flow follow the [official SWE-bench quick-start methodology](https://github.com/SWE-bench/SWE-bench/blob/main/docs/guides/quickstart.md).

Within each repository, tasks are sorted by `created_at`, then `instance_id`. The first `max(1, round(n * 0.2))` tasks form warm-up history and the remainder are held out. The split is chronological and repository-local:

| Repository | License API observation | Tasks | Warm-up | Held out |
| --- | --- | ---: | ---: | ---: |
| [astropy/astropy](https://github.com/astropy/astropy) | BSD-3-Clause | 6 | 1 | 5 |
| [django/django](https://github.com/django/django) | BSD-3-Clause | 114 | 23 | 91 |
| [matplotlib/matplotlib](https://github.com/matplotlib/matplotlib) | unclassified | 23 | 5 | 18 |
| [mwaskom/seaborn](https://github.com/mwaskom/seaborn) | BSD-3-Clause | 4 | 1 | 3 |
| [pallets/flask](https://github.com/pallets/flask) | BSD-3-Clause | 3 | 1 | 2 |
| [psf/requests](https://github.com/psf/requests) | Apache-2.0 | 6 | 1 | 5 |
| [pydata/xarray](https://github.com/pydata/xarray) | Apache-2.0 | 5 | 1 | 4 |
| [pylint-dev/pylint](https://github.com/pylint-dev/pylint) | GPL-2.0 | 6 | 1 | 5 |
| [pytest-dev/pytest](https://github.com/pytest-dev/pytest) | MIT | 17 | 3 | 14 |
| [scikit-learn/scikit-learn](https://github.com/scikit-learn/scikit-learn) | BSD-3-Clause | 23 | 5 | 18 |
| [sphinx-doc/sphinx](https://github.com/sphinx-doc/sphinx) | unclassified / NOASSERTION | 16 | 3 | 13 |
| [sympy/sympy](https://github.com/sympy/sympy) | unclassified / NOASSERTION | 77 | 15 | 62 |
| **Total** |  | **300** | **60** | **240** |

The license column records what the GitHub repository API returned on 2026-08-05; it is not legal advice. Missing and `NOASSERTION` values are not inferred. The committed corpus is metadata-only. It contains upstream identifiers, commit hashes, timestamps, changed paths, test counts, source links, and SHA-256 digests, but no issue text or patches.

### Repository-count audit

The [official SWE-bench Lite page](https://www.swebench.com/lite.html) says the 300 tasks cover 11 repositories. The generated [`repository-manifest-v0.2.json`](../bench/research/repository-manifest-v0.2.json) resolves the discrepancy at the artifact level: only the 300-row `test` split was loaded; the 23-row development split was not combined; all 300 instance IDs are unique; the 12 exact identifiers normalize to 12 distinct projects; and there are no aliases or case variants. All six available official dataset revisions, from the initial data upload through the pinned revision, contain the same 12 test repositories. The official count of 11 is therefore an upstream prose/data inconsistency, and this study uses the revision-level artifact count of 12. The pinned test Parquet is 1,119,540 bytes with SHA-256 `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`.

### Public-test contamination limitation

SWE-bench Lite tasks and gold patches are public. The chronological split prevents later tasks from entering earlier in-run memory, but it cannot show that a model did not encounter a task during pretraining. Results must be described as public-benchmark results, not performance on secret or previously unseen tasks.

### Task-type limitation

SWE-bench Lite is predominantly an issue-resolution and bug-fixing benchmark. It does not provide defensible coverage of code review, release preparation, security remediation, database migration, or incident response as distinct controlled strata. Those categories remain a planned second corpus with human-reviewed labels and executable acceptance criteria. They are not retroactively inferred from keywords in issue text.

## 3. Leakage controls

For a held-out task, retrieval input contains only the task statement. Its gold patch, test patch, hashes, and patch-derived paths are evaluator-only fields. Completed historical tasks may contribute their public task statement and resolved production-file paths as memory evidence.

Relevant prior evidence is defined before ranking as any earlier task in the same repository whose gold production patch changes at least one production file changed by the held-out task. This oracle is reproducible but narrow: two semantically related tasks may touch different files, and two unrelated tasks may touch the same broad file. Results therefore describe *file-overlap retrieval*, not general semantic relevance.

Index construction is also time-bounded. Each full-Qarinah query builds document frequencies from prior repository events only. The no-temporal ablation intentionally uses the full repository timeline so that future leakage can be measured.

## 4. Compared methods

| Method | Phase-one status | Definition |
| --- | --- | --- |
| Complete history | Executed | All prior task-memory records in repository order |
| Last-N | Executed | Ten most recent prior records |
| Lexical-only | Executed | BM25 over prior records |
| Graph-only | Executed | Query-linked historical file entities plus one-hop co-change paths; abstains if no path entity is present |
| Full Qarinah | Executed | Time-bounded hybrid lexical, fuzzy, graph, diversity, repository, disclosure, retention, and supersession logic |
| Qarinah without temporal logic | Executed | Same ranking over the complete past and future repository timeline |
| Qarinah without coverage gate | Executed as acceptance ablation | Same ranking, but any non-empty result is accepted |
| LLM running summary | Not executed | Requires a fixed model, prompt, seed policy, and provider usage receipts |
| Vector-only RAG | Not executed | Requires a declared embedding model, revision, dimensions, distance function, and provider/local runtime |
| Coding-agent task completion | Not executed | Requires provider credentials and the official Docker evaluator |

An LLM summary is not replaced with a heuristic, and vector retrieval is not relabeled TF-IDF. Those baselines will only be reported after their actual dependencies are fixed in the protocol.

## 5. Metrics and analysis

The retrieval phase reports Precision@10, Recall@10, reciprocal rank, nDCG@10, returned context characters, portable `ceil(characters / 4)` token estimates, event-ID validity, file-overlap citation precision, coverage acceptance, and future-citation rate. Local retrieval latency excludes data download and index construction.

Paired differences between Qarinah and BM25 use 10,000 deterministic bootstrap resamples over the 79 scorable tasks. The confirmatory model phase will additionally report official SWE-bench resolve rate, provider input/output/cache tokens, wall-clock latency, cost, incorrect-change rate, repeated mistakes, unauthorized disclosure, and blinded human code-quality ratings. Family-wise confirmatory tests will be declared before that phase and adjusted with Holm's method.

The memory categories are informed by [LongMemEval](https://github.com/xiaowu0162/LongMemEval) and its [ICLR paper](https://openreview.net/pdf?id=pZiyCaVuti): information extraction, multi-session reasoning, knowledge updates, temporal reasoning, and abstention. Qarinah's software-engineering study adds repository isolation, provenance, supersession, and disclosure authority.

## 6. Frozen exploratory-v0.1 results

Command:

```sh
npm run prepare:research
npm run evaluate:research-retrieval
```

The corpus digest is `sha256:dea0f53c303255a7ef70cd6a1b1929b8291cdd790d21e427cab3b7928ada6fd1`.

### Retrieval on the 79 scorable held-out tasks

| Method | Recall@10 | MRR | nDCG@10 | Estimated context tokens across all 240 queries |
| --- | ---: | ---: | ---: | ---: |
| Last-N | 0.415 | 0.221 | 0.259 | 863,371 |
| BM25 | **0.687** | **0.430** | **0.466** | 990,467 |
| Graph-only | 0.186 | 0.151 | 0.159 | 72,190 |
| Full Qarinah | 0.518 | 0.320 | 0.347 | 923,376 |
| Qarinah without temporal logic | 0.784 | 0.288 | 0.418 | 1,122,173 |

Full-history replay supplies 3,502,258 estimated context tokens across the 240 queries. Full Qarinah supplies 923,376, a 73.63% estimated reduction for the retained-history slice. This is not provider-reported usage and does not include source code, prompts, outputs, tools, caching, or index work.

Qarinah minus BM25 has a paired mean Recall@10 difference of -0.169 with a 95% bootstrap interval of [-0.275, -0.067]. The MRR difference is -0.110 with a 95% interval of [-0.192, -0.032]. The current hybrid ranker therefore does not beat the lexical baseline under this oracle.

### Coverage and temporal findings

- 79 held-out tasks have at least one positive prior task under the file-overlap oracle; 161 have no positive record under that oracle.
- The lexical coverage gate accepts all 240 queries, including all 161 no-positive-under-file-overlap tasks. Removing the gate adds no acceptances. Lexical overlap is therefore not an adequate semantic evidence-coverage test for this corpus; this does not prove the 161 tasks are semantically unsupported.
- The no-temporal ablation returns 971 future citations out of 2,288 citations, a 42.44% future-citation rate. Its higher Recall@10 is contaminated and must not be interpreted as a better valid system.
- Graph-only retrieval can link a path entity in 45 of 240 queries. Its high abstention rate makes it a narrow diagnostic baseline, not a general retriever.
- Every returned citation ID resolves to a stored event. File-overlap citation precision is 4.30% for Qarinah and 4.35% for BM25 when all returned citations are counted.

### Governance boundary suite

For each of the 12 repositories, the evaluator constructs six forbidden records: future, expired, stale, restricted, wrong-repository, and superseded. All 72 are rejected, zero forbidden records are returned, and current permitted evidence remains retrievable. This is a deterministic component test, not an adversarial security audit of a model or host application.

### Local latency observation

On Node 24.15.0, Windows x64, the committed run observed Qarinah retrieval at 13.23 ms median and 49.69 ms p95, excluding index construction and network fetch. BM25 was 0.19 ms median and 0.63 ms p95. These values describe one machine and are not cross-platform performance claims.

## 7. Development-v0.2 results after inspection

These tasks were inspected in v0.1, so v0.2 is development evidence and is not eligible for a confirmatory claim. Its corpus adds a deterministic graded structural oracle:

- grade 2, direct: shared production patch file or extracted changed symbol;
- grade 1, supporting: shared two-level production module scope without a direct match; and
- grade 0: no structural match under this oracle.

These grades are evaluator-only for the target task and have not received blinded human validation.

The study now reports both static memory, where every held-out task sees only the original warm-up prefix, and online/prequential memory, where earlier completed tasks become available to later tasks.

| Setting and method | Positive tasks | Recall@10 | MRR | nDCG@10 |
| --- | ---: | ---: | ---: | ---: |
| Static admitted BM25 | 191 | 0.763 | 0.703 | 0.643 |
| Static balanced-v1 | 191 | 0.724 | 0.644 | 0.604 |
| Static Qarinah admission-first-v2 | 191 | 0.763 | 0.703 | 0.643 |
| Online admitted BM25 | 209 | 0.538 | 0.696 | 0.558 |
| Online balanced-v1 | 209 | 0.473 | 0.601 | 0.508 |
| Online Qarinah admission-first-v2 | 209 | 0.538 | 0.696 | 0.558 |

Admission-first-v2 exactly matches admitted BM25 ranking under the shared legal candidate set. This is intentional: Qarinah uses the strong lexical baseline as its first stage, then contributes admission, provenance, time, authority, conflict, supersession, and budgeting. It does not claim to invent a better lexical algorithm.

Against balanced-v1 in the online setting, the mean Recall@10 difference is +0.0649 with a 12-repository clustered-bootstrap 95% interval of [-0.0150, 0.1025]. The mean reciprocal-rank difference is +0.0949 with interval [0.0572, 0.1115]. The recall interval crosses zero; the MRR interval does not. The graph ablation is identical to full v2 on this dataset, so graph ranking adds no measured benefit here.

At fixed pack budgets, online Qarinah-v2 Recall@10 rises from 0.182 at 512 tokens to 0.243 at 1,000, 0.359 at 2,000, 0.490 at 4,000, and 0.531 at 8,000. These are portable serialized-record estimates, not provider tokens or task-success results.

The experimental evidence-sufficiency score is not ready as a fail-closed semantic gate. In the online setting it has ROC-AUC 0.538, 10-bin calibration error 0.388, and a 90.32% false-acceptance rate among tasks with no positive record under the structural oracle. The API exposes the three states and reason codes for evaluation, but the default minimum evidence remains `any`.

The v2 no-temporal ablation returns 1,083 future items out of 2,288, a 47.33% item-level violation rate, and affects all 240 queries. This separates item-level from query-level leakage and reinforces that the higher-leakage ranking must not be treated as a valid system result.

### Conservative evidence decision v0.3

Development v0.3 preserves the v0.2 score as a diagnostic but changes the decision boundary. A score of at least 0.65 returns `DIRECTLY_SUPPORTED` with decision `ACCEPT_DIRECT`; `PARTIALLY_SUPPORTED` always returns `ABSTAIN`. This distinction fixes the earlier mistake of counting partial evidence as a successful sufficiency decision.

| Setting | No-positive tasks | Direct accepts | True accepts | False accepts | Direct precision | Direct recall | Acceptance coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Static | 49 | 8 | 8 | 0 | 100% | 4.19% | 3.33% |
| Online/prequential | 31 | 12 | 12 | 0 | 100% | 5.74% | 5.00% |

The same zero direct false acceptances occur under leave-one-repository-out threshold validation. This result means zero false acceptance under the deterministic structural development oracle only; it is not a universal semantic guarantee. The intentionally conservative threshold has 3.33% acceptance coverage in the static setting and 5.00% acceptance coverage online, while the raw score still has online ROC-AUC 0.538, Brier score 0.269, and calibration error 0.388.

The structural oracle itself remains unvalidated. A blinded audit artifact contains the complete census of all 49 static no-positive cases, with Qarinah scores, decisions, target gold patches, and target gold paths hidden. It is awaiting two independent human reviewers; reviewer agreement, Cohen's kappa, disagreements, and adjudicated labels must not be reported until real reviewers complete them.

## 8. What the pilot changes

The research backlog is now evidence-driven:

1. Complete the blinded two-reviewer relevance audit and recalibrate against adjudicated labels; do not treat zero structural-oracle false acceptance as semantic perfection.
2. Test rank-fusion and diversity ablations because they currently reduce file-overlap recall relative to BM25.
3. Expand the relevance oracle with blinded human judgments instead of treating path overlap as complete semantic truth.
4. Add a real embedding baseline and a fixed-model running-summary baseline.
5. Add a human-labeled multi-category corpus for migrations, reviews, incidents, releases, features, and security work.
6. Run the official Docker evaluator with identical model, tools, and sampling settings across context conditions.
7. Replicate across at least two coding agents and two model providers.

## 9. Confirmatory execution gate

The final protocol is frozen at tag `research-protocol-v1`. Its deterministic Verified-minus-Lite manifest contains 387 eligible retrieval tasks across 12 repositories and a frozen 40-task agent sample. It excludes 93 tasks already present in the Lite development corpus and 20 tasks without chronologically prior same-repository development memory. The source is the 500-row SWE-bench Verified test artifact at revision `c104f840cc67f8b6eec6f759ebc8b2693d585d4a`, SHA-256 `a45b1fe4e2f0c8390b2b2938ac83e92ed5979000856808f3679c07812e9e6dcd`. The manifest records `resultsObserved: false`; no final Qarinah retrieval or model result has been run.

The local readiness audit passes the complete release gate on Windows x64 with Node 24.15.0, Codex CLI 0.144.6, Claude Code 2.1.118, and Docker 29.3.1. The Codex and Claude packaged runtimes are byte-identical and pass MCP smoke. The repository declares a nine-cell Ubuntu/macOS/Windows by Node 22/24/26 CI matrix, but that remote matrix has not been triggered because this branch is private local work. Provider models, budget, dense and summary baselines, human review, and the official Docker gold smoke remain hard blockers.

The next phase must not begin until the following are fixed and recorded:

- model/provider identifiers and immutable model revisions where available;
- API credentials supplied through the execution environment, never committed;
- Docker availability for the official SWE-bench harness;
- a maximum call, token, and currency budget;
- prompt, tool, retry, timeout, and sampling policy;
- embedding and summary-baseline specifications;
- blinded human-review rubric and at least two reviewers;
- preregistration timestamp or immutable protocol commit; and
- exclusion, failure, and missing-data rules.

Until then, Qarinah must not claim improved SWE-bench resolve rate, provider-token reduction, total-cost reduction, model portability, or superior code quality from this study.

## 10. Reproducibility artifacts

- Corpus builder: [`scripts/prepare-research-benchmark.mjs`](../scripts/prepare-research-benchmark.mjs)
- Dataset and split contract: [`bench/research/swe-bench-lite.mjs`](../bench/research/swe-bench-lite.mjs)
- Metadata-only corpus: [`bench/research/swe-bench-lite-v1.json`](../bench/research/swe-bench-lite-v1.json)
- Retrieval evaluator: [`scripts/evaluate-research-retrieval.mjs`](../scripts/evaluate-research-retrieval.mjs)
- Machine-readable result: [`bench/results/research-retrieval-0.1.2.json`](../bench/results/research-retrieval-0.1.2.json)
- Frozen exploratory tag: `research-benchmark-exploratory-v0.1`
- Development-v0.2 corpus: [`bench/research/swe-bench-lite-development-v0.2.json`](../bench/research/swe-bench-lite-development-v0.2.json)
- Development-v0.2 evaluator: [`scripts/evaluate-research-retrieval-v0.2.mjs`](../scripts/evaluate-research-retrieval-v0.2.mjs)
- Development-v0.2 result: [`bench/results/research-retrieval-development-v0.2.json`](../bench/results/research-retrieval-development-v0.2.json)
- Repository-count resolution: [`bench/research/repository-manifest-v0.2.json`](../bench/research/repository-manifest-v0.2.json)
- Offline-backup receipt: [`bench/research/development-backup-v0.2.json`](../bench/research/development-backup-v0.2.json)
- Conservative sufficiency result: [`bench/results/research-sufficiency-development-v0.3.json`](../bench/results/research-sufficiency-development-v0.3.json)
- Blinded relevance-review artifact: [`bench/research/relevance-audit-review-v0.3.json`](../bench/research/relevance-audit-review-v0.3.json)
- Separate review-admin manifest: [`bench/research/relevance-audit-admin-v0.3.json`](../bench/research/relevance-audit-admin-v0.3.json)
- Frozen final protocol receipt: [`bench/final/protocol-v1.json`](../bench/final/protocol-v1.json)
- Frozen final task manifest: [`bench/final/final-task-manifest-v1.json`](../bench/final/final-task-manifest-v1.json)
- Local execution-readiness receipt: [`bench/final/execution-readiness-v1.json`](../bench/final/execution-readiness-v1.json)

The evaluator fails if the pinned corpus, deterministic metrics, temporal leakage count, or governance results drift from the committed evidence. Runtime latency is retained as an observation and excluded from deterministic equality checks.

## 11. Publication path

The current artifact is suitable as a transparent research draft and replication package, not as a peer-reviewed result. A software-engineering framing fits ICSE, FSE, ASE, MSR, SANER, TOSEM, or TSE after the confirmatory task-success phase. A long-context-memory framing may fit an ACL, EMNLP, or ICLR workshop after real summary/vector baselines and cross-model replication are complete.
