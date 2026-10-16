# Compare completed tasks, including overhead

`qarinah compare --stdin-json` reads `qarinah.matched-task-evaluation.v1` input from standard input and returns a hashed, read-only report. JavaScript callers use `evaluateMatchedTasks(input)`. The input contract is exported as `qarinah/schemas/matched-task-input.json`.

Each pair identifies the exact repository revision, task digest, and common configuration digest. Hash the model versions, tools, budgets, prompts apart from the explicitly compared memory treatment, test command, and execution settings into `configurationHash`. Use separate fresh sessions for each side and randomize execution order. Include every provider attempt, including retries and failed calls, as a `qarinah.provider-usage.v1` receipt with `purpose: "test"`.

Choose the baseline explicitly: `project-notes-and-search`, `native-host`, `competitor`, or `full-history`. Use concise project notes and selective code search as the practical baseline. Full-history replay remains a separate diagnostic.

`elapsedMs` includes capture, indexing, retrieval, model calls, tools, and checks. `retrievalMs` is a component of that total. `costMicrosUsd` is the observed full-run cost in millionths of a US dollar, or `null` when unavailable. Include indexing/model-extraction charges on the side that incurred them. Cached input is already within input tokens; reasoning is already within output tokens.

The report shows task passes, total attempts, known or unknown provider-token totals, measured cost, elapsed time, and p50/p95 latency. Each paired regression and improvement is listed, so equal aggregate pass counts cannot hide a regression. A provider attempt cannot be counted in more than one run. Missing usage or billing stays unknown. Hashes bind the supplied evidence; they do not independently authenticate a provider bill or test outcome.

This evaluation utility does not establish competitive superiority. Real runs, independent reproduction, and sustained external use are required before publishing an outcome claim. The existing frozen research protocols and historical results remain separate.

## Source and package distribution

Research corpora, historical result archives, and research runners remain available in the versioned GitHub source and release evidence bundle. They are excluded from the default runtime package. Clone the matching release tag before running source-reproduction commands; an npm installation is the runtime distribution.

## Recall contract correction

Summary-first recall now keeps answer-bearing visible-source fallbacks. A weaker or unavailable summary cannot suppress a more relevant source. The `coverage` diagnostic describes the actual delivered excerpt after its budget is applied. It remains lexical coverage, not proof of truth or semantic sufficiency.
