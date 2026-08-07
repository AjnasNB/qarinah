# Qarinah research-development result v0.3

Status: development evidence package, not peer reviewed and not a final confirmatory result.

Historical-version note: v0.3 applies a conservative 0.65 decision threshold to the frozen `evidence-sufficiency-v1` scores produced by development v0.2. It is preserved unchanged for research history and must not be described as a recomputation of the current production `evidence-sufficiency-v2` implementation. The production-bound recomputation is [development v0.4](RESEARCH-DEVELOPMENT-RESULTS-v0.4.md).

## What changed

Qarinah now separates retrieval from evidence sufficiency:

```text
temporal + repository + authority admission
                     ↓
                  BM25 rank
                     ↓
 conflict + supersession + retention handling
                     ↓
       conservative evidence decision
                     ↓
           bounded cited context pack
```

The ranking stage deliberately matches admitted BM25. Qarinah's additional contribution is the evidence system around ranking: strict-before time admission, repository and authority boundaries, provenance, conflicts, supersession, retention, citations, and bounded output. Graph retrieval added no measurable ranking improvement on this structural SWE-bench workload and remains useful as a relationship/provenance layer.

## Current development results

| Evidence | Result | Boundary |
| --- | --- | --- |
| SWE-bench Lite development corpus | 300 tasks, 12 exact repository identifiers, 240 development queries | Public tasks; reused after inspection; not final held-out evidence |
| Online MRR | 0.601 balanced-v1 to 0.696 admission-first-v2 | Clustered 95% difference interval 0.0572 to 0.1115 |
| Online Recall@10 | +0.0649 over balanced-v1 | Clustered 95% interval -0.0150 to 0.1025; not conclusive |
| Static direct gate | 8/8 accepted positives; 0/49 observed false accepts | Precision exact 95% CI 63.06%-100%; false-accept rate 0%-7.25% |
| Online direct gate | 12/12 accepted positives; 0/31 observed false accepts | Precision exact 95% CI 73.54%-100%; false-accept rate 0%-11.22% |
| Direct-gate coverage | 3.33% static; 5.00% online | Deliberately low; human relevance labels pending |
| Software-task context fixture | 98.71% fewer portable estimated repeated-context tokens | Character estimate, not provider usage or task success |
| Retrieval regression | Recall@5, MRR, conflict recall, supersession precision all 1.0 | Deterministic local fixture, not real-repository patch resolution |

## Frozen confirmatory preparation

- 387 untouched memory-eligible SWE-bench Verified tasks for retrieval evaluation.
- 20 separate no-prior-memory tasks for abstention-only negative controls.
- A deterministic 40-task paired coding-agent sample.
- No exact ID, issue, patch, test-patch, normalized-statement, or >=0.85 shingle near-duplicate overlap with the 300-task development corpus.
- A pre-outcome power check showing 40 paired tasks are suited to large resolution differences, not modest ones.
- A blinded 49-case relevance census awaiting two independent original label sets.

## Product evidence versus research evidence

The package is release-gated software: its deterministic unit, type, documentation, site, MCP, package, context, software-task, and long-document checks run locally. That establishes reproducible engineering behavior on the tested platform. It does not establish universal production reliability, provider-native token savings, improved SWE-bench resolution, or cross-provider task-success gains.

The project owner reports that fresh Claude Code and Codex sessions successfully exchanged Qarinah context. That report is preserved separately as a demonstration result until run records, identical snapshot hashes, provider usage receipts, and task outcomes are available.

## Strongest defensible claim

Qarinah combines strong lexical retrieval with temporal and authority controls, conservatively abstains when direct evidence is insufficient, and emits portable cited handoffs. The final study will test whether that system reduces repeated work and context while preserving software-task success across coding agents.
