# Context-efficiency comparison v2: pre-execution protocol

Status: development protocol only. It was written after the exploratory v1 observation and before any v2 retrieval execution, evaluator, or result exists. It is not externally preregistered or confirmatory. The companion machine-readable protocol is [`bench/research/context-efficiency-comparison-v2-protocol.json`](../bench/research/context-efficiency-comparison-v2-protocol.json), which is normative when it specifies exact hashes, options, constants, and event bindings.

This protocol becomes frozen for v2 only when a protocol-only commit containing these exact two files is pushed before either retrieval method is executed and before any v2 evaluator or result commit exists. The future result must record that earlier commit and both protocol-file SHA-256 values. Later pre-outcome changes require a separately versioned, dated amendment; any change after a v2 outcome is observed requires a new protocol version. The original protocol files and corrected v1 evidence remain available.

## Research objective

V2 asks whether Qarinah and an admission-filtered BM25 control can recover the same exact evidence while minimizing the model-facing prefix needed to reach complete evidence. Both receive the same task input, deterministic ledger, pre-ranking eligible set, renderer, and token estimator.

The fixed-`k` track is a diagnostic utility gate only and does not determine primary eligibility. The primary efficiency metric is the complete rendered prefix through the lowest-ranked required item in a method's frozen top-32 ordering. Required identities are used only after retrieval to measure that prefix; they cannot influence admission, scoring, ordering, or stopping. A method that misses any required item by rank 32 receives no context-efficiency ranking.

Safety is evaluated separately. Raw BM25 remains a safety negative control, while the fair efficiency comparison uses BM25 after the exact same admission and current-state filter as Qarinah. This is a development comparison and cannot support a universal, industry-wide, provider-token, cost, task-success, quality, or latency claim.

## Frozen inputs

V2 uses only fixtures that existed before this protocol:

- neutral software cases: `bench/fixtures/software-task-scenarios.mjs`;
- strict temporal, restricted, stale, expired, future, cross-repository, and supersession cases: `test/retrieval-invariants.test.js`;
- conflicting and superseded policy records: `scripts/evaluate-multifile-context.mjs`.

The manifest binds each file by SHA-256 and Git blob at source commit `785b3b1734b92bf37f91c41bc6b48a71c0149a92`. The future evaluator must materialize that commit in an isolated tree and import Qarinah's production modules from that tree. Checking a historical manifest without proving that those exact bytes were loaded is insufficient. V2 must not add or remove cases in response to results. Any separately motivated future stratum must receive a new protocol version before it is run.

## Methods

The primary comparison has two methods, plus one safety-only negative control:

1. `qarinah-admission-first-v2` builds the production index with `buildDerivedState(events, workspaceId).index`, then calls `rankContextEvents(index, query, options)` from source commit `785b3b1`. The complete options are fixed: `limit=32`, `rankingProfile="admission-first-v2"`, `diversity=1`, fuzzy and graph retrieval enabled, `temporalBoundary="strict-before"`, `supersessionPolicy="prefer-current"`, no SQLite candidates, and the exact case `asOf`, repository IDs, and authority scopes. No default may be relied on.
2. `admission-filtered-bm25` mirrors production admission in the same order. Retention, strict-before timestamp, temporal-validity, disclosure, and repository constraints form the policy-eligible corpus before BM25 document-frequency and length statistics. After scoring and sorting, `prefer-current` removes superseded events and supersession-cycle members, except for the frozen exact-event-ID query exception, before the top 32 is taken. The evaluator records the policy-eligible IDs/hash, current-state exclusions, and equality with Qarinah's corresponding policy and supersession semantics for every case.
3. `raw-bm25-safety-negative-control` runs the same exact BM25 ranker over the unfiltered ledger. It is reported only in the safety stratum and cannot enter the efficiency comparison or a winner claim.

The BM25 algorithm is fully fixed. Text is NFKC-normalized, lowercased with JavaScript `toLowerCase`, and tokenized with Unicode regex `/[\p{L}\p{N}][\p{L}\p{N}_-]{1,63}/gu`. The exact frozen stop-word list, primitive-data projection, document construction, document-frequency definition, and formula are in the manifest. Parameters are `k1=1.2`, `b=0.75`, and exact-title-term boost `1.8`. The summed score is rounded to six decimal places before sorting. Ties use timestamp descending and event ID ascending. Zero-score candidates remain in the ordering. Changing any of these rules is a binding failure.

Each method returns only an ordered event-ID list. The evaluator resolves those IDs against the same verified ledger. Retrieval scores, reasons, method names, JSON-only fields, and internal reservation metadata are excluded from model-facing text.

## Common model-facing frame

Every method and case receives the same bytes in this order:

```text
TASK QUERY
<exact query>

CURRENT SOURCES
<exact path/content records in fixture order>

MEMORY EVIDENCE
<canonical method-neutral event items>
```

The query occurs exactly once. Current source rendering is `FILE <path>\n<content>`, separated by two line feeds. A memory item contains exactly these fields in this order:

```text
EVENT <event-id>
HASH <event-hash>
KIND <kind>
TIME <timestamp>
TITLE <title>
BODY
<exact complete body>
```

Items are separated by two line feeds and remain in retrieval-rank order. No excerpt truncation is permitted. Fixed-`k` utility and evidence-complete-prefix measurement are never governed by pretty-JSON size or non-model-facing metadata.

Portable token accounting is `ceil(UTF-16 JavaScript string length / 4)`. It remains an estimate. The two primary methods have a 10,000-estimated-token, per-case non-truncating sanity ceiling: render complete items first, then fail the method-case if it exceeds the ceiling. The evaluator cannot truncate, excerpt, omit, or partially render an item to pass. The full-history reference is uncapped. Pretty JSON may be retained as an audit artifact but cannot influence selection or token accounting.

## Neutral fixed-utility stratum

The neutral stratum contains the six committed software-task cases and a deterministic 240-event ledger.

Each primary method runs once with the frozen output limit of 32. The fixed-`k` utility gate inspects the first four IDs of that same ordering; it does not rerun retrieval with `limit=4`. It requires, for each method and case:

- `k` is exactly four;
- the four required items are the target and all three support records;
- every required item must be a distinct rendered item;
- the exact body, body SHA-256, event ID, and event hash must match the protocol manifest;
- no other item is permitted;
- the exact query and all current sources are identical for both methods;
- the rendered envelope is identical for both methods.

The ledger uses fixed workspace ID `ws_20000000000000000000000000000001`, fixed event IDs, timestamps, insertion order, event contents, and previous-hash chain. The protocol manifest records all 24 required event bindings and the final 240-event chain head.

Passing one target is insufficient. Fixed-`k` utility is 24/24 exact required records, six out of six cases with four distinct required records each. Because an eligible fixed-`k` output is the same four-event multiset under the same renderer, this gate is pass/fail only and is never used to rank token efficiency. Failure at rank four is reported as a precision-at-four diagnostic but does not cancel the primary comparison when the missing required evidence is recovered by rank 32.

## Primary evidence-complete-prefix metric

Each primary method independently produces its frozen top-32 ordering without access to the relevance oracle. After retrieval finishes, the evaluator locates the lowest-ranked of the four required events. The evidence-complete prefix contains every event from rank one through that rank, including every intervening non-required event.

A method-case is eligible only when all four distinct required events occur by rank 32 and each passes the exact evidence gate. The evaluator renders that complete prefix through the common frame with the shared query and current sources. Required identities may measure the prefix after ranking; they may never change candidate admission, corpus statistics, scores, ordering, stopping, or rendering.

The primary statistic is the sum of the six eligible per-case portable token estimates. Every per-case count and paired delta is retained. Missing evidence, a binding failure, a negative-test failure, or exceeding the non-truncating ceiling produces no primary comparative result. Equal summed estimates are a tie, and no fallback metric may replace the frozen result.

For a descriptive reduction reference, all 240 events are rendered in ledger insertion order through the same common frame. This full-history reference is uncapped and is not a ranked retrieval method.

## Safety stratum

The safety stratum is bound to pre-existing invariant and multifile fixtures. It contains four deterministic cases:

1. strict-before temporal boundary;
2. restricted, cross-repository, expired, stale, and future poison records;
3. supersession chain and cycle;
4. current policy versus superseded and conflicting policy claims.

Each case uses the exact query, deterministic ledger, empty current-source set, and common envelope. The safety `k=1` selection is the first ID of the method's single frozen ordering produced with output limit 32; retrieval is not rerun with `limit=1`. The one required current item must appear as a distinct exact item. Every genuinely forbidden event ID must be absent from the entire returned top-32 ordering, and its event hash, exact body, and body hash must be absent from rendered `k=1` memory. A forbidden item fails even when it ranks below the required first item. The safety fixed-`k` output is a pass/fail gate and is excluded from the primary neutral token total.

Forbidden-body checks are performed on parsed item identity/body fields before rendering and on final rendered memory. A relation target inside an otherwise permitted event is not treated as selection of the target event; this prevents the permitted poison-control record's reference from becoming a false forbidden inclusion. Relations remain outside the model-facing frame so an inaccessible target ID is not disclosed.

The old mercury policy is superseded and forbidden. The contradictory event is different: it is a `claim` with `claimed` confidence and is not automatically unauthorized or superseded. It cannot satisfy or replace the required governing decision. Qarinah must preserve its contradiction relationship to the current decision in the access-safe retrieval conflict audit. That audit metadata is checked separately and excluded from model-facing token accounting.

Qarinah must recover 4/4 required current records, include zero forbidden stale, expired, future, unauthorized, cross-repository, superseded, or cyclic records, and pass the conflict audit before any Qarinah efficiency claim is allowed. Admission-filtered BM25 safety is reported independently. Raw BM25 is a named negative control; its failure neither enters nor cancels the fair primary efficiency comparison.

## Exact evidence and citation gate

For every required item, the evaluator must establish all of the following:

- exactly one selected item has the required event ID;
- that same item has the required event hash;
- that same item has the exact complete body;
- that body's SHA-256 equals the protocol value;
- the event hash validates against the deterministic event envelope and previous-hash chain;
- no required field is satisfied by text inside another event body, title, metadata field, query, or current source.

Substring presence by itself is not sufficient.

## Continuation evidence rule

Any v2 continuation track must render the handoff summary and each cited source event as distinct items with their exact complete bodies, body hashes, event IDs, and event hashes. Three source ID/hash strings embedded inside summary metadata do not count as three source items. A manifest pointer or capsule can be measured separately as reference transport, but it cannot pass the direct-evidence gate or enter the composite token comparison without resolving and rendering every required source item.

No continuation case is executed by this protocol-only change. Before a future continuation run, a versioned amendment must bind its deterministic ledger, exact summary and source bodies, exact event and chain hashes, query, current sources, fixed item count, and runtime inputs.

## Required negative tests

Before a v2 result may be written, the evaluator must fail closed under each mutation:

- correct event ID paired with another event's hash;
- correct hash paired with another event's ID;
- event ID/hash strings injected into current source text;
- event ID/hash strings injected into an unrelated event body or title;
- exact required body attached to the wrong event;
- one required item duplicated while another is missing;
- support evidence collapsed into summary metadata rather than distinct items;
- forbidden body omitted but forbidden event ID/hash retained, and the inverse;
- JSON-only metadata changed so that selected item count would differ;
- query duplicated, omitted, or changed for only one method;
- current source ordering or bytes changed for only one method;
- runtime, fixture, helper, implementation, workspace, event, chain-head, or renderer binding mismatch;
- Qarinah entrypoint, explicit option, limit, or returned-order mismatch;
- BM25 tokenizer, stop words, indexed fields, formula, rounding, tie break, or zero-score mismatch;
- admission-filtered BM25 receives a different pre-ranking eligible set from Qarinah;
- evidence-complete-prefix, maximum-rank, or lowest-required-rank mismatch;
- oracle identities alter ranking, stopping, or selection;
- a fixed-`k` utility output is used as a token ranking;
- raw BM25 is included in the primary efficiency comparison;
- the non-truncating ceiling causes excerpting, truncation, or omission;
- a historical source manifest is checked without proving the bytes actually loaded;
- the conflicting claim is treated as superseded/unauthorized or as the governing current decision.

Every mutation must produce a named verification failure. The future result must record all negative-test outcomes.

## Runtime and source binding

The reference execution environment is Node `v24.15.0`, V8 `13.6.233.17-node.48`, ABI `137`, Windows x64, with the exact `node.exe` SHA-256 in the manifest. A run under another platform is a separate environment and must record its own binary/runtime hashes; it cannot silently replace the reference environment.

The future evaluator must bind:

- the earlier protocol commit and both protocol-file hashes;
- its own file hash;
- every direct helper file hash, including `scripts/continuation-evidence-lib.mjs` if imported;
- the fixed source-fixture hashes;
- the production implementation manifest at source commit `785b3b1`;
- the manifest and SHA-256 values of every production module actually loaded;
- `package-lock.json`;
- Node/V8/ABI/platform/architecture and executable hash;
- the canonical renderer specification and renderer implementation hash;
- fixed workspace IDs, event IDs, exact event hashes, chain heads, and body hashes.

Any mismatch aborts before method execution. The verifier must reconstruct each ledger and require exact equality with all protocol event and head hashes. It must import production code from an isolated materialization of `785b3b1`; recomputing a historical digest while actually executing descendant working-tree code is a failure.

## Composite decision rule

The fixed-`k` utility gate reports whether each primary method recovers all 24 neutral items as the exact four-item set for every case. It produces no token winner and does not determine eligibility for the primary evidence-complete-prefix comparison.

The primary efficiency comparison includes only Qarinah and admission-filtered BM25. Both must:

- recover all four exact required items by rank 32 in all six cases;
- share the exact pre-ranking admission set;
- use identical task-query, current-source, renderer, and token-estimator bindings;
- remain within the non-truncating per-case ceiling;
- pass all source/runtime and negative-test checks.

If either primary method is ineligible, v2 designates no primary comparative result. Otherwise, the lower six-case evidence-complete-prefix total wins; equal totals are a tie. Raw BM25 is excluded from this decision.

Any Qarinah winner wording additionally requires Qarinah to pass all four safety required-item gates, include zero forbidden events, and preserve the conflict audit. The only permitted form is fixture-bound: "On the frozen Qarinah context-efficiency v2 development fixtures, under the exact evidence-complete-prefix, safety, rendering, and portable-estimator gates, `<method>` used the fewest estimated model-facing tokens among `<named eligible methods>`." It must name the methods. "Best AI context reduction," "best in the industry," provider-token, cost, task-success, quality, and latency claims remain disallowed.

## Freeze and execution order

The corrected v1 exploratory evaluator, result, and explanation may be committed first because they explicitly record `fixedBeforeOutcome=false`. V2 must then receive a separate protocol-only commit and public tag containing only this document and its machine manifest relative to the preceding commit. No v2 method is run in either commit.

Only after that protocol commit is pushed may a descendant commit add the evaluator. Only after the evaluator and bindings are reviewed may the first v2 run occur. The result records the protocol commit, protocol hashes, evaluator hash, execution-source binding, and whether the protocol truly preceded the first observed v2 outcome. If an outcome was observed early, this v2 protocol cannot claim `fixedBeforeOutcome`; a new version is required.

## Provider and task-success boundary

V2 performs no provider call and records no provider input tokens, tokenizer output, bill, latency, generated answer, repository patch, test pass, or human review. The frozen provider-backed paired experiment remains a separate study.
