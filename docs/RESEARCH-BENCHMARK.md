# Qarinah: Evidence-Linked Temporal Memory for Cross-Agent Software Engineering

## Research protocol and preliminary real-repository benchmark

**Author:** Ajnas NB  
**Protocol version:** 1.0  
**Implementation:** Qarinah 0.1.2  
**Date:** August 2026  
**Status:** Research draft; not peer-reviewed and not preregistered  
**Artifact license:** Apache License 2.0; upstream repositories and benchmark data retain their own terms

## Abstract

This research track studies whether evidence-linked, time-explicit project memory can reduce the history supplied to coding agents without reducing engineering-task success. The first reproducible phase uses the official public SWE-bench Lite test split: 300 tasks from 12 real repositories. Each repository is ordered by task creation time, its earliest 20% is used as memory-building history, and its remaining tasks are held out from that history. This produces 60 warm-up and 240 held-out tasks.

The completed phase evaluates retrieval and governance, not patch generation. Only 79 of the 240 held-out tasks have a prior task that overlaps a gold production-file path, so retrieval effectiveness is reported on those 79 tasks and coverage behavior is reported on all 240. Plain BM25 outperforms the current Qarinah hybrid ranking on this oracle: Recall@10 is 0.687 versus 0.518, and mean reciprocal rank is 0.430 versus 0.320. The current lexical coverage gate accepts all 161 tasks for which the file-overlap oracle identifies no prior supporting task. Removing time controls produces 971 future citations, or 42.44% of citations in that ablation. Separately, 72 constructed boundary records across all 12 repositories verify rejection of future, expired, stale, restricted, wrong-repository, and superseded evidence with zero forbidden records returned.

These preliminary results reject any present claim that Qarinah retrieval is superior to a lexical baseline. They identify temporal filtering as necessary and semantic evidence coverage as the main retrieval research problem. Provider-reported tokens, SWE-bench resolve rate, patch quality, model portability, cost, and human review remain unmeasured.

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

## 6. Preliminary results

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

- 79 held-out tasks have at least one relevant prior task under the file-overlap oracle; 161 do not.
- The current lexical coverage gate accepts all 240 queries, including all 161 oracle-unsupported tasks. Removing the gate adds no acceptances. Lexical overlap is therefore not an adequate semantic evidence-coverage test for this corpus.
- The no-temporal ablation returns 971 future citations out of 2,288 citations, a 42.44% future-citation rate. Its higher Recall@10 is contaminated and must not be interpreted as a better valid system.
- Graph-only retrieval can link a path entity in 45 of 240 queries. Its high abstention rate makes it a narrow diagnostic baseline, not a general retriever.
- Every returned citation ID resolves to a stored event. File-overlap citation precision is 4.30% for Qarinah and 4.35% for BM25 when all returned citations are counted.

### Governance boundary suite

For each of the 12 repositories, the evaluator constructs six forbidden records: future, expired, stale, restricted, wrong-repository, and superseded. All 72 are rejected, zero forbidden records are returned, and current permitted evidence remains retrievable. This is a deterministic component test, not an adversarial security audit of a model or host application.

### Local latency observation

On Node 24.15.0, Windows x64, the committed run observed Qarinah retrieval at 13.23 ms median and 49.69 ms p95, excluding index construction and network fetch. BM25 was 0.19 ms median and 0.63 ms p95. These values describe one machine and are not cross-platform performance claims.

## 7. What the pilot changes

The research backlog is now evidence-driven:

1. Replace query-term coverage with calibrated evidence sufficiency and unsupported-task abstention.
2. Test rank-fusion and diversity ablations because they currently reduce file-overlap recall relative to BM25.
3. Expand the relevance oracle with blinded human judgments instead of treating path overlap as complete semantic truth.
4. Add a real embedding baseline and a fixed-model running-summary baseline.
5. Add a human-labeled multi-category corpus for migrations, reviews, incidents, releases, features, and security work.
6. Run the official Docker evaluator with identical model, tools, and sampling settings across context conditions.
7. Replicate across at least two coding agents and two model providers.

## 8. Confirmatory execution gate

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

## 9. Reproducibility artifacts

- Corpus builder: [`scripts/prepare-research-benchmark.mjs`](../scripts/prepare-research-benchmark.mjs)
- Dataset and split contract: [`bench/research/swe-bench-lite.mjs`](../bench/research/swe-bench-lite.mjs)
- Metadata-only corpus: [`bench/research/swe-bench-lite-v1.json`](../bench/research/swe-bench-lite-v1.json)
- Retrieval evaluator: [`scripts/evaluate-research-retrieval.mjs`](../scripts/evaluate-research-retrieval.mjs)
- Machine-readable result: [`bench/results/research-retrieval-0.1.2.json`](../bench/results/research-retrieval-0.1.2.json)

The evaluator fails if the pinned corpus, deterministic metrics, temporal leakage count, or governance results drift from the committed evidence. Runtime latency is retained as an observation and excluded from deterministic equality checks.

## 10. Publication path

The current artifact is suitable as a transparent research draft and replication package, not as a peer-reviewed result. A software-engineering framing fits ICSE, FSE, ASE, MSR, SANER, TOSEM, or TSE after the confirmatory task-success phase. A long-context-memory framing may fit an ACL, EMNLP, or ICLR workshop after real summary/vector baselines and cross-model replication are complete.
