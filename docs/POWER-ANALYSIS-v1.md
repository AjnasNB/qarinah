# Paired 40-task power analysis

Status: frozen pre-outcome design analysis.

The 40-task coding-agent study uses paired binary SWE-bench resolution outcomes. We calculate exact two-sided McNemar rejection probabilities while varying the total discordant-pair rate and the net probability that Qarinah resolves a task that the baseline does not.

| Total discordance | Smallest explored net effect reaching 80% power |
| ---: | ---: |
| 10% | Not reached; even a 10-point one-sided net effect has 20.63% power |
| 20% | 20.0 percentage points |
| 30% | 24.5 percentage points |
| 40% | 28.5 percentage points |

At a modest 10-point net improvement, power ranges from 11.54% to 20.63% across the explored discordance rates. At 20 points it ranges from 43.97% to 83.87%. Exact values and approximate paired-difference confidence-interval half-widths are in `bench/final/paired-power-analysis-v1.json`.

Therefore the paper should not use a 40-task study to promise detection of a modest SWE-bench resolution improvement. Resolution remains important but secondary unless the observed effect is large. Portable handoff, supplied input context, repeated work, citations, invalid-evidence exposure, cost, time, and turns are the better primary study family.

The sample must not be expanded after viewing final outcomes. Any change requires a dated pre-unblinding protocol amendment.
