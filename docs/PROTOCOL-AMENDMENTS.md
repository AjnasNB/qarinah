# Qarinah final protocol amendments

Protocol: `FINAL-EXPERIMENT-PROTOCOL-v1.md`
Protocol tag: `research-protocol-v1`

| Date | Amendment | Reason | Results already observed? | Expected effect | Reviewers |
| --- | --- | --- | --- | --- | --- |
| 2026-08-05 | **A001 — retain the 20 no-prior-memory tasks as a separate abstention-only negative-control set.** These tasks remain excluded from positive-evidence retrieval recall and coding-handoff utility denominators. They may be used only for false acceptance, correct abstention, hallucinated-evidence rate, and unnecessary-context measurements. The frozen 387-task retrieval population and deterministic 40-task paired agent sample are unchanged. | Excluding every no-memory case would prevent a confirmatory test of whether Qarinah abstains when project memory is unavailable. | **No.** Added before any final Qarinah retrieval result or provider-backed final outcome was observed. | Adds a separately reported 20-task negative-control population; makes no change to positive retrieval or paired-agent denominators. | Independent review pending; this amendment does not use reviewer labels. |

## Amendment A001 controls

- Amendment status: frozen before final evaluation.
- Control manifest: `bench/final/final-abstention-controls-v1.json`.
- Contamination audit: `bench/final/contamination-audit-v1.json`.
- Power analysis: `bench/final/paired-power-analysis-v1.json`.
- Any later sample-size change must be made before unblinding through a new dated amendment.
