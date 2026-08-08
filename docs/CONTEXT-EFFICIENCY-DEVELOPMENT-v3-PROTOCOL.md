# Qarinah context-efficiency development protocol v3

Machine-readable authority: [`bench/research/context-efficiency-development-v3-protocol.json`](../bench/research/context-efficiency-development-v3-protocol.json)

## Status

This is a **pre-outcome, development-only protocol**. It was authored against commit
`85834f51605d207e100c95a335b38bdd352aa5cc` after the immutable v2 result was
observed. It is not an external preregistration and it is not a final or held-out
evaluation.

At authorship time:

- no v3 method implementation, evaluator, authorization receipt, failure receipt, or
  result artifact existed;
- no v3 retrieval method had been executed;
- no final-manifest Qarinah ranking, provider-backed run, or final outcome had been
  opened or executed for this work;
- the proposed result destination was absent; and
- v2, retrieval-development v0.5, and all frozen final manifests remained immutable.

This protocol authorizes no retrieval execution, package publication, website update,
provider call, deployment, GitHub merge, DOI update, or marketing claim. A separately
reviewed evaluator and authorization receipt are required before one development run.

## Why v3 exists

The immutable v2 attempt-2 result produced no primary comparative context-efficiency
result. Both Qarinah admission-first v2 and admission-filtered BM25 were eligible on
five of six development cases, tied on their diagnostic five-case subtotal, and missed
TypeScript support record
`evt_00000000-0000-4000-8000-000000000012` by the frozen top-32 boundary.

The miss is an inspected development finding. The record has an inbound `references`
edge to the high-ranked target record, but the current lexical cascade places every
fuzzy match ahead of graph-only evidence. Weak fuzzy candidates can therefore occupy
the top 32 before a directly linked support record. V3 tests a bounded evidence-bundle
ordering that promotes admitted one-hop evidence beside its lexical anchor. It does
not change the v2 result or retroactively manufacture a v2 winner.

Immutable evidence bindings:

- v2 protocol tag `research-context-efficiency-protocol-v2`, commit
  `d7f2a09bed34507b3aec070f765d20b6a834d6d9`;
- v2 protocol manifest SHA-256
  `0dc108888faa583ccdce132b38e6543df00130ffc58c4dbdb07656cf88a4cfbd`;
- v2 result tag `research-context-efficiency-result-v2-attempt-002`, commit
  `e5b74ef270e01564076e3434c884658cfba16870`;
- v2 result document commit
  `18e4a179888ee35122af9a57ace1e3cf2195f4f2`;
- v2 result SHA-256
  `a1dab5b0768c0f242262e5bbce9a7d613a3bfc5ebdf1cad0bfd65687366f9701`;
- current-product retrieval-development v0.5 result tag
  `research-retrieval-development-v0.5-result`, commit
  `4dba5b667a8c3a135c4574fcfefe12502f792a32`; and
- v0.5 result SHA-256
  `38a753e82e1f9e8e0337dca3f764c941a4cf78748c09a7b8341ae08cf7494a94`.

## Development research question

On already-inspected development data, can an admission-bounded lexical-anchor and
one-hop evidence-bundle method recover linked evidence that admission-first v2 and
admitted BM25 miss, without weakening temporal, repository, retention, disclosure,
authority, supersession, conflict, citation, or mutation controls?

This protocol may answer only that development question. It cannot establish that
Qarinah uses the least context on new repositories, improves task success, lowers
provider tokens or cost, or is the best context system.

## Data classification

### Inspected development data

Two inspected populations may be used:

1. the six constructed cases in `bench/fixtures/software-task-scenarios.mjs`, SHA-256
   `46d460d22be26b06023eb261ef32466402485a806d5d279251520a6f773365db`;
2. the pinned SWE-bench Lite development corpus already used by retrieval development
   v0.2-v0.5: 240 evaluation tasks after a 60-task chronological warm-up, 12 exact
   repository identifiers, logical corpus digest
   `01b35115ac639c1fcd3779561f83d5bb21988eb74ee5e93798c5d7579d757863`.

These data have influenced the architecture. Leave-one-repository-out analysis does
not make them held out; every resulting metric remains development evidence.

### Prohibited data

The development method and evaluator must not read, import, enumerate, hash, or infer
content from:

- `bench/final/final-task-manifest-v1.json`;
- `bench/final/final-abstention-controls-v1.json`;
- any final result, provider transcript, provider receipt, patch-resolution output,
  human final label, or final experiment cache;
- any gold patch, test patch, post-resolution discussion, or target-task future record;
  or
- the deterministic 40-task agent sample as an evaluation population.

Final manifest identifiers and hashes appear later only as future confirmation
bindings copied from the already-frozen receipts. They are never development inputs.

## Shared admission and method inputs

Every primary method receives the same:

- task query;
- admitted event set;
- event title and body projection;
- event relations;
- `asOf`, repository selector, and authority scopes;
- strict-before temporal boundary;
- retention, temporal-validity, disclosure, and repository decisions;
- prefer-current supersession result; and
- complete-record renderer and portable estimator.

Admission is resolved before document-frequency, average-length, lexical scoring,
entity coverage, fuzzy scoring, graph expansion, or ordering. Current-state
supersession filtering is applied before graph expansion. A relation may never
reintroduce an event excluded by admission or current-state resolution.

### Shared title-and-body projection

All v3 primary methods rank this exact document text:

```text
event.title + "\n" + event.body
```

The projection is NFKC-normalized and lowercased with JavaScript
`String.prototype.toLowerCase`. Lexemes use
`/[\p{L}\p{N}][\p{L}\p{N}_-]{1,63}/gu`, remove the frozen v2 stop-word set, retain
duplicate occurrences for document length and term frequency, and use unique terms
for document frequency.

No primitive `event.data` value or key participates in v3 primary ranking. This makes
benchmark-only fields such as `data.scenario` and `data.role` structurally unreadable
instead of relying on a promise not to exploit them. Production v2, whose historical
projection differs, is retained only as a labeled diagnostic and is not the
input-identical primary BM25 comparator.

### Query entities

The v3 method derives at most 64 query entities without a model or external service:

1. collect the shared query lexemes;
2. scan ASCII backtick pairs left-to-right without nesting; ignore unmatched or
   greater-than-256-code-unit spans and scan accepted span contents;
3. scan the query and accepted spans with
   `/[\p{L}\p{N}_./-]{2,256}/gu`;
4. insert a boundary between a Unicode lowercase letter or number and a following
   uppercase letter, then replace every run of `/`, `.`, `_`, or `-` with one space;
5. apply the shared lexeme regex and stop words to every component, NFKC-normalize,
   lowercase, and deduplicate;
6. discard ranking entities that occur in zero admitted title/body documents while
   retaining them only as an unmatched diagnostic; and
7. retain the 64 remaining entities with highest shared BM25 IDF, breaking ties by
   JavaScript default string order.

Current source contents are not ranking inputs in this development protocol. They may
appear only in the common model-facing frame after ordering. Any future use of current
source entities requires an amendment that gives the identical frozen extraction to
every comparator.

## Sanitized immutable ranker input

Admission and current-state resolution occur in an evaluator-owned preprocessor. A
ranker never receives a production event object, the protocol object, an oracle object,
or an evaluator case object. The preprocessor produces a deep-frozen JSON value with
schema `qarinah.context-efficiency-development-ranker-input.v3` and these exact fields:

```json
{
  "schemaVersion": "qarinah.context-efficiency-development-ranker-input.v3",
  "query": "bounded task query",
  "events": [
    {
      "eventId": "opaque immutable ID",
      "eventHash": "sha256:...",
      "tieKey": "sha256:...",
      "timestamp": "canonical ISO timestamp",
      "title": "bounded title",
      "body": "bounded complete body",
      "provenanceSourceId": "bounded string or null",
      "relations": [
        {"type": "allowed relation type", "target": "admitted current event ID"}
      ]
    }
  ]
}
```

Events are sorted by `tieKey`, where `tieKey` is
`sha256(UTF8("qarinah-v3-tie-v1\0" + eventId))`. Relations whose targets are not in the
admitted current set are omitted before freezing. Relations are sorted by relation
type and then target tie key. `provenanceSourceId` is the only provenance field
exposed. No event-ID lexical or numeric order is used, even in preprocessing.

The query is 0-4,096 UTF-16 code units. The event array contains at most 1,000 unique
IDs and hashes; an admitted-current corpus above that bound is retained as
`INPUT_LIMIT_FAILURE` without a ranker call. Event ID and provenance source ID are
non-empty strings of at most 512 UTF-16 code units; provenance may instead be null.
Hashes and tie keys match lowercase `sha256:` plus 64 hexadecimal digits. Timestamp is
canonical `YYYY-MM-DDTHH:mm:ss.sssZ`; title is at most 512 and complete body at most
65,536 UTF-16 code units. Each event has at most 128 unique relations. Duplicate IDs,
hashes, tie keys, or identical relation `(type,target)` pairs fail sanitization.

The input has no `data`, repository selector, authority object, retention object,
disclosure object, temporal object, oracle grade, required ID, role, case ID,
difficulty, sample flag, gold field, source file, expected result, or mutable accessor.
`eventId` may be copied to output and compared for exact equality only; it may not be
parsed, sliced, converted to a number, or used as a ranking feature. Every final tie is
resolved with `tieKey`, not the event-ID sequence.

Algorithm constants are delivered in a separate deep-frozen value with schema
`qarinah.context-efficiency-development-algorithm-config.v3`. It contains only the
tokenizer, BM25, fuzzy, graph, fanout, ordering, budget, and timeout constants frozen
below. It contains no event, query, corpus statistic, oracle value, expected outcome,
or file path. Research method modules may import only reviewed pure utility modules;
they may not import this protocol, an evaluator, fixture, result, oracle, production
store, filesystem, network, process environment, or provider module.

## Proposed research-only entrypoint

The first implementation must remain research-only at:

```text
bench/research/methods/evidence-bundle-v3.mjs
```

It exports one pure entrypoint:

```js
rankEvidenceBundlesV3(sanitizedInput, algorithmConfig)
```

It returns a JSON value with exact top-level fields `schemaVersion`, `ordered`, and
`pathDiagnostics`. `schemaVersion` is
`qarinah.context-efficiency-development-ranker-output.v3`. `ordered` must be a full
permutation of the sanitized events and each item contains exactly `eventId` and
`eventHash`, copied byte-for-byte from the input. `pathDiagnostics` is an array whose
items contain exactly `anchorId`, `anchorRank`, `neighborId`, `relationType`,
`direction`, `relationWeight`, `pathOrder`, `assignment`, `bundleLocalRank`, and
`overflowLocalRank`, and `outputRank`. `assignment` is one of `promoted`, `overflow`, `alternate`,
`suppressed-duplicate`, or `self-loop`; nullable ranks are `null`, never a sentinel.
Diagnostics cannot change ordering or metrics. Plain BM25 and no-graph methods return
an empty `pathDiagnostics` array; every graph-bearing method returns all canonical,
alternate, suppressed, and self-loop paths under this schema.

A non-object result, unknown field, missing or extra event, duplicate ID, unknown ID,
hash mismatch, invalid diagnostic path, or output above the admitted-event count is
an invalid output and therefore `METHOD_FAILURE`. The evaluator records the raw
citation-validity numerator and denominator before discarding an invalid partial
ordering, but every positive retrieval metric is then zero and comparative eligibility
is blocked.

The exact algorithm configuration is:

```json
{
  "lexicalSeedLimit": 16,
  "graphHops": 1,
  "promotedNeighborLimitPerAnchor": 8,
  "outputLimit": 1000,
  "includeFuzzy": true,
  "methodCaseTimeoutMs": 30000
}
```

`outputLimit` is further bounded by the number of admitted current events. If more
than 1,000 such events exist, the case is retained and reported as an output-limit
failure; the limit is not widened after observing results.

The research method must not be exported from the package or wired into
`compileContext` during this protocol phase. Product integration requires a separate,
post-result review and cannot alter this development result.

## Exact evidence-bundle ordering

### Lexical anchors

Let `C` be the sanitized admitted-current event array, `N = |C|`, and `Q` the sorted
unique query lexemes. For event `d`, let `len(d)` be its retained title/body lexeme
count including duplicates, and let `avgLen = sum(len(d))/N` (`1` when `N = 0`). For
term `t`, `tf(t,d)` is its count in `d`, and `df(t)` is the number of events in `C`
containing it. Define:

```text
idf(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
denom(t,d) = tf(t,d) + 1.2 * (1 - 0.75 + 0.75 * len(d) / max(1, avgLen))
term(t,d) = idf(t) * (tf(t,d) * 2.2 / denom(t,d)) * titleBoost(t,d)
titleBoost(t,d) = 1.8 if t occurs in the tokenized title, otherwise 1
score(d) = round(sum(term(t,d) for t in Q) * 1,000,000) / 1,000,000
```

Terms with zero `tf` contribute zero. `ln` is JavaScript `Math.log`; all arithmetic is
IEEE-754 binary64. BM25 statistics use `C`, never the unadmitted index. Sort by:

1. rounded score descending;
2. timestamp descending; and
3. `tieKey` ascending.

The first 16 positive-scoring records are anchors. Fuzzy-only records cannot become
anchors.

### Exact fuzzy channel

The fuzzy channel uses the same title/body projection. Normalize query and document
with NFKC, JavaScript lowercase, whitespace replacement `/\s+/gu` to one ASCII space,
trim, then retain at most 4,096 UTF-16 code units. If the normalized query has fewer
than three UTF-16 code units, the fuzzy set is empty. Otherwise construct the set of
every consecutive three-code-unit JavaScript `slice` from the normalized value. Let
`J` be set Jaccard similarity, with zero when either set is empty. Define:

```text
phraseBonus(d) = 0.5 if normalizedDocument includes normalizedQuery, otherwise 0
fuzzyScore(d) = round((J(queryTrigrams, documentTrigrams) + phraseBonus(d))
                      * 1,000,000) / 1,000,000
```

A fuzzy candidate exists only when its unrounded `J + phraseBonus` is at least `0.025`.
Fuzzy candidates sort by rounded fuzzy score descending, timestamp descending, and
`tieKey` ascending. Fuzzy score never changes BM25 score and fuzzy-only candidates
remain behind promoted graph evidence and linked overflow.

This document and its machine-readable companion are the normative BM25/fuzzy source.
The evaluator may share reviewed pure arithmetic helpers, but it may not inherit a
production default, SQLite/FTS candidate, primitive-data projection, corpus statistic,
threshold, slice limit, or tie-break not written here. The authorization receipt later
binds the exact helper paths and SHA-256 values.

### Completion relations

For each anchor, inspect both outgoing and incoming one-hop relations. Only these
relations may promote completion evidence:

| Relation | Weight |
|---|---:|
| `supports` | 1.00 |
| `derived_from` | 0.90 |
| `authorized_by` | 0.85 |
| `governed_by` | 0.85 |
| `produced` | 0.75 |
| `changed` | 0.70 |
| `affects` | 0.65 |
| `references` | 0.60 |

`contradicts` and `supersedes` never promote positive evidence. Contradictions remain
an audit channel; supersession remains a current-state admission rule.

Represent a path as `(anchorId, anchorRank, neighborId, relationType, direction,
relationWeight)`, with direction order `outgoing` before `incoming`. Canonical path
identity is the UTF-8 JSON serialization of
`[anchorTieKey, neighborTieKey, relationType, direction]`. Deduplicate only identical
path identities. Sort retained paths by anchor rank ascending, relation weight
descending, direction order, relation type in JavaScript default string order, and
neighbor tie key ascending.

An outgoing path exists exactly when the anchor's frozen relation array contains
`{type, target: neighborId}`. An incoming path exists exactly when the neighbor's
frozen relation array contains `{type, target: anchorId}`. Enumerate every allowed
outgoing and incoming path for all 16 anchors before deduplication or assignment.
Self-loops are retained only as `self-loop` diagnostics and never consume fanout or
create another output occurrence.

A neighbor reachable from multiple anchors is assigned to exactly one bundle using
the first path in that canonical path order. Every other path is `alternate`. This
assignment is completed before any fanout selection.

Every anchor turn is processed in BM25 rank order, even when that anchor was already
emitted as an earlier anchor's neighbor. In that case only the anchor's second output
occurrence is skipped; its assigned neighbors are still processed. At the start of
each anchor turn, before greedy ordering or the eight-record fanout is counted, remove
from that bundle every self-loop and every assigned neighbor already present in the
global emitted-ID set. Mark the first as `self-loop` and the second as
`suppressed-duplicate`. Neither consumes fanout, changes entity/provenance coverage,
or receives a bundle/overflow local rank. The anchor itself always supplies the
bundle's initial entity and provenance coverage, whether its output occurrence was
new or previously emitted.

### Query-entity coverage and diversity

Within one assigned anchor bundle, choose one remaining neighbor at a time by this
exact tuple, recomputed after every emission:

1. count of query entities newly covered relative to records already emitted in the
   current bundle, descending;
2. whether `provenance.sourceId` differs from every already emitted non-null source in
   the current bundle, distinct first;
3. relation weight descending;
4. direct admitted-BM25 rank ascending, with no rank last;
5. direction order, `outgoing` before `incoming`;
6. relation type in JavaScript default string order;
7. timestamp descending; and
8. `tieKey` ascending.

“Newly covered” means set difference between the candidate's query-entity set and the
union covered by the anchor plus already selected neighbors in that bundle.
Provenance diversity equals one only when the candidate has a non-null
`provenanceSourceId` absent from the bundle; null never earns diversity. The candidate's
assigned canonical path supplies relation weight, direction, and type.

Only exact event IDs are deduplicated. Duplicate suppression occurs before fanout at
every anchor turn and again at each later channel append. Suppression prevents only a
second output occurrence: the path, assignment, and suppression remain auditable. No
record, relation, body, adverse result, or unique overflow candidate is deleted.

### Bundle and overflow order

Process every anchor in admitted-BM25 order. For each anchor:

1. emit the anchor unless its ID is already global-emitted; never skip its turn;
2. suppress already-emitted assigned neighbors before ordering, without consuming
   capacity;
3. emit the first eight remaining ordered one-hop completion neighbors; and
4. place every additional ordered unique completion neighbor in a preserved overflow
   list.

The first eight greedy selections are promoted. Continue the same greedy selection to
order every remaining assigned neighbor into that anchor's overflow. Global overflow
sort is anchor rank ascending, local overflow rank ascending, then `tieKey` ascending.

After all anchor bundles, append in order:

1. remaining positive admitted-BM25 records;
2. linked overflow records;
3. remaining positive fuzzy records; and
4. remaining zero-score records by timestamp descending and `tieKey` ascending.

Remaining positive BM25 records retain exact BM25 order. Remaining fuzzy records
retain exact fuzzy order. Zero-score records sort by timestamp descending and
`tieKey` ascending. Global event-ID deduplication is first occurrence wins; every
later occurrence remains recorded as a suppressed duplicate path, not a deleted event.

`pathDiagnostics` is finalized only after the full output permutation is known.
`pathOrder` is the one-based position in canonical path order. For a canonical path,
`assignment` is `promoted` for the first eight eligible unique neighbors, `overflow`
for later eligible unique neighbors, `suppressed-duplicate` when the neighbor was
already emitted before its bundle fanout, or `self-loop`; non-canonical paths are
`alternate`. `bundleLocalRank` is 1-8 only for `promoted`. `overflowLocalRank` is
one-based only for `overflow`. Both are null for `alternate`,
`suppressed-duplicate`, and `self-loop`. `outputRank` is the neighbor's final one-based
rank in the full permutation, including when it was emitted through another channel;
it is null only when the method output is invalid. A positive-BM25 record assigned to
overflow may be emitted earlier by the remaining-positive-BM25 channel; its assignment
stays `overflow`, its `outputRank` records that earlier occurrence, and the later
overflow append is duplicate-suppressed without changing either local rank.

No fuzzy record may precede an un-emitted promoted completion neighbor. Every returned
record must remain admitted and current.

### Exact one-hop comparator order

`admitted-title-body-bm25-one-hop-v3` uses the same sanitized input, BM25 order,
16-anchor assignment, relation allowlist/weights, canonical paths, eight-neighbor
fanout, overflow retention, global deduplication, and channel append order. Its local
neighbor selection omits only the dynamic entity-coverage and provenance-diversity
tuple fields, so it selects by relation weight descending, direct BM25 rank
ascending/null-last, direction order, relation type, timestamp descending, then
`tieKey` ascending. This exact order is the strong graph comparator; no RRF,
outcome-informed threshold, or hidden graph score is permitted.

### Coverage stopping

The method returns the full frozen ordering to the evaluator. Oracle identities never
control admission, ranking, graph expansion, bundle construction, stopping, or
rendering.

A separately reported product-pack diagnostic may stop only after a complete bundle
boundary when all of the following hold:

- at least one positive lexical anchor was emitted;
- every query entity that occurs in any admitted title/body is covered;
- every completion neighbor of every emitted anchor was either emitted or recorded in
  overflow; and
- overflow is empty.

Otherwise it continues to the next complete bundle or fails closed at the fixed
budget. The primary efficiency measurement ignores this diagnostic and determines the
evidence-complete prefix only after the full ordering is sealed.

## Methods and baselines

### Input-identical primary development methods

1. `admitted-title-body-bm25-v3` — the exact shared BM25 ordering, including
   zero-score records.
2. `admitted-title-body-bm25-one-hop-v3` — the same BM25 anchors and completion
   relation allowlist, but each assigned bundle's graph neighbors are ordered only by
   relation weight, direct BM25 rank with no rank last, outgoing-before-incoming
   direction, relation type, timestamp descending, and `tieKey`; it has no
   entity-coverage or provenance-diversity ordering.
3. `qarinah-evidence-bundle-v3-no-graph` — full v3 with no graph promotion; it keeps
   query-entity extraction only for diagnostics and cannot use it to reorder records.
4. `qarinah-evidence-bundle-v3-no-entity` — full v3 with only the newly-covered-entity
   tuple field removed; provenance diversity remains active.
5. `qarinah-evidence-bundle-v3-no-provenance` — full v3 with only the provenance
   diversity tuple field removed; newly covered entities remain active.
6. `qarinah-evidence-bundle-v3` — the full proposed method.

All six use the identical admitted candidate set, title/body projection, common
renderer, and estimator.

No-graph constructs no path, bundle, fanout, or overflow and emits positive BM25,
fuzzy-only, then zero-score channels in their frozen orders. No-entity removes only
tuple field 1 and its method may not read the entity set. No-provenance removes only
tuple field 2 and its method receives `provenanceSourceId` replaced with null. Full v3
uses both fields. These transformations occur in the evaluator-owned method adapter,
not through method-selected options.

An optional `qarinah-evidence-bundle-v3-no-entity-no-provenance` joint ablation may be
reported only as a diagnostic. It removes both fields and is expected to equal the
one-hop comparator; disagreement is an implementation failure, not an independent
research result.

Before any corpus run, two non-oracle constructions with one anchor and three
equal-weight incoming `references` neighbors with no direct BM25 rank must prove the
pathways are non-degenerate.

- Entity subcase: A newly covers an entity but repeats the anchor source at
  `00:00:02.000Z`; B adds no entity but has a distinct source at `00:00:03.000Z`; C
  adds neither and has null provenance at `00:00:01.000Z`. Full=A-B-C,
  no-entity=B-A-C, no-provenance=A-B-C, joint/one-hop=B-A-C.
- Provenance subcase: D, E, and F add no entity; D repeats the anchor source at
  `00:00:03.000Z`, E has a distinct source at `00:00:02.000Z`, and F is null at
  `00:00:01.000Z`. Full=E-D-F, no-entity=E-D-F, no-provenance=D-E-F, and
  joint/one-hop=D-E-F.

All timestamps use date `2026-01-01`. Method counters must prove the removed field is
never read in its corresponding ablation. Failure blocks execution.

### Diagnostics excluded from a v3 primary comparison

- `qarinah-admission-first-v2` preserves the immutable production method and its
  historical projection. It is reported only as a cross-version diagnostic.
- Raw unadmitted BM25 is a safety negative control only.
- Full retained history is an uncapped descriptive reference.
- Evaluator-only oracle order is an upper bound and never a competitor.
- Dense and BM25+dense retrieval are not authorized in development v3. They are
  mandatory future confirmation baselines after exact model and cache bindings exist.

No method may be removed because it ties, wins, loses, times out, or blocks a claim.

## Common renderer and token accounting

The primary ranking-efficiency track uses the v2 complete-record common frame:

- the query occurs exactly once;
- current source material is byte-identical across methods and occurs outside ranking;
- every selected event contains its complete title, body, event ID, event hash,
  timestamp, and relationship/citation metadata required by the renderer;
- records are never excerpted or truncated differently across methods; and
- tokens are estimated as `ceil(JavaScript UTF-16 string length / 4)` and labeled
  portable estimates, never provider-reported tokens.

For each method and case, the evaluator first seals and hashes the full ordering. Only
then may the oracle identify the lowest-ranked required record. The
evidence-complete prefix contains every record from rank one through that rank,
including intervening records. A missing required record has rank `0` as a not-found
sentinel and is never described as the next rank.

### Secondary compact cited rendering

Compact rendering is secondary and cannot decide a v3 winner. A future implementation
authorized by an amendment must be extractive and method-shared. Every span carries
event ID, event hash, complete-body SHA-256, UTF-16 start and end offsets, and span
SHA-256. Sentence selection uses only the shared query entities and selected record
text; it cannot inspect oracle labels. Full records remain retrievable by immutable ID
and hash.

This protocol does not authorize that implementation because sentence segmentation,
span scoring, and tie-breaks are not frozen here. A pre-execution amendment must bind
those exact rules before a compact track runs.

No compact result is evidence-preserving unless every required fact passes the same
exact automated gate and, for future confirmation, two blinded reviewers. Failure
produces no compact-efficiency conclusion; it does not permit a rerun with longer
spans.

## Development evaluation gates

### Six-case regression

The six known cases are a regression suite, not a confirmatory benchmark. Full v3 must:

- recover all 24 exact required records by rank 32;
- recover `evt_00000000-0000-4000-8000-000000000012` by rank 32 through a recorded
  graph path rather than an oracle feature;
- pass 4/4 frozen safety cases with zero forbidden inclusions;
- preserve conflict and supersession audit behavior;
- pass every existing v2 mutation group plus v3-specific mutations; and
- keep all method/case failures in the result.

Required v3 mutations remove or reverse the support edge, change its target, make the
neighbor future, expired, restricted, wrong-repository, or superseded, add more than
eight completion neighbors, add fuzzy query-stuffed noise, duplicate relation paths,
and mutate every ordering tie-break. Each must either produce the frozen deterministic
change or fail closed. Admission mutations must never be repaired by graph expansion.

### SWE-bench Lite development analysis

Run the frozen 240-task corpus without task removal. Report static and online/prequential
results, micro and repository-macro metrics, and per-repository raw results. Report:

- Recall@1, @5, @10, @32 and Hit@10/@32;
- MRR and nDCG@10;
- evidence-complete-prefix characters and portable estimated tokens;
- results at 512, 1,000, 2,000, 4,000, and 8,000 estimated-token budgets;
- valid-citation rate, forbidden exposure, future exposure, and supersession precision;
- redundant-record rate and graph-path diagnostics; and
- runtime excluding corpus download and index construction.

Repository leave-one-out calculations remain development diagnostics. No threshold,
weight, fanout, seed limit, relation allowlist, tie-break, or field projection may be
changed after any v3 outcome is observed. A change requires a new protocol version and
new result destination.

### Exact denominators and formulas

The scorer owns a frozen relevance map `grade(q,eventId) ∈ {0,1,2}`, where `2` is
direct, `1` is supporting, and `0` is not positive. Let `Pq` be events with grade above
zero, `Dq` direct events, `Rq(k)` the first `k` unique returned IDs, and `rankq(e)` the
one-based rank or infinity when absent. In this protocol the required evidence set for
evidence-complete-prefix accounting is exactly `Pq`; it is not a method-specific
subset. For rank metrics, an unknown ID and every occurrence after an ID's first
occurrence have grade zero and still consume their output position. `Rq(k)` drops
duplicate occurrences but not their consumed positions.

- `Recall@k(q) = |Rq(k) ∩ Pq| / |Pq|` for positive queries.
- `DirectRecall@k(q) = |Rq(k) ∩ Dq| / |Dq|` when `Dq` is non-empty and is null
  otherwise.
- `Hit@k(q) = 1` when `Rq(k) ∩ Pq` is non-empty, otherwise `0`, for positive queries;
  it is null for no-positive queries.
- `MRR(q) = 1 / min(rankq(e): e ∈ Pq)`, or `0` when no positive is returned within the
  full 1,000-record output limit.
- `DCG@10(q) = sum((2^grade(q,e_i)-1)/log2(i+1), i=1..10)`, where `e_i` is output
  position `i`, an unknown ID has grade zero, and a repeated ID has grade zero after
  its first occurrence. `IDCG@10` sorts the complete sanitized event set by grade
  descending and event tie key ascending; `nDCG@10 = DCG/IDCG`.
- Citation validity numerator is returned items whose ID occurs exactly once in the
  sanitized input and whose returned hash equals the sanitized hash. Its denominator
  is every returned item, including duplicates or unknown IDs. Empty output is null,
  not 100%.
- Supersession precision numerator is returned events marked current by the
  evaluator-owned frozen supersession oracle; denominator is returned events that are
  members of any frozen supersession component. A zero denominator is null. Every
  returned superseded event is also a forbidden exposure.
- Redundancy uses `contentKey = sha256(UTF8(NFKC(title) + "\n" + NFKC(body)))` and is
  `1 - distinct(contentKey)/returnedItemCount`; empty output is `0`.

These item metrics are computed at exactly these scopes: the validated full ordering;
the first 1, 5, 10, and 32 output positions; and the packed event list at each 512,
1,000, 2,000, 4,000, and 8,000-token budget. Duplicate output occurrences consume
rank positions. Citation validity uses raw returned `(eventId,eventHash)` items so an
invalid output can be audited; supersession and redundancy use only a
schema-validated ordering and are null on `METHOD_FAILURE`.

The evaluator freezes two post-order sets that are unreadable by rankers:
`Fq`, every event excluded from sanitized input because it is future, expired,
restricted, wrong-repository, or superseded; and `Uq ⊆ Fq`, the future subset whose
timestamp is not strictly before `asOf`. At scope `S`, forbidden-exposure count is the
number of returned occurrences whose exact `(eventId,eventHash)` belongs to `Fq`, and
future-exposure count analogously uses `Uq`; duplicates count once per occurrence.
Both rates divide their count by the number of raw returned items in `S`. On empty
scope, each count is zero and each rate is null. Unknown IDs are invalid citations but
are not silently assigned to either exposure set. Every result reports both counts,
denominators, rates, and null reasons at every frozen scope. The zero-exposure claim
gate uses counts, never a rounded rate.

For Recall, Hit, MRR, and nDCG, query-macro is the arithmetic mean over positive
queries only. DirectRecall query-macro uses only queries with non-empty `Dq`. Micro
recall is `sum_q |Rq(k)∩Pq| / sum_q |Pq|`; micro direct recall uses the analogous
direct counts. Micro Hit is `sum_q Hit@k(q) / count(positive queries)`; micro MRR and
micro nDCG are named `query-macro MRR` and `query-macro nDCG` because neither has an
event-level micro denominator.

Within a repository, Recall and DirectRecall are the summed-count ratios above; Hit,
MRR, and nDCG are arithmetic means over their eligible queries. Citation validity and
supersession precision sum their item-level numerators and denominators. Redundancy is
the arithmetic mean of per-query redundancy over every query, including empty output.
Repository-macro is the unweighted arithmetic mean of those repository values over
repositories with a non-zero denominator; redundancy includes every repository with
at least one query. Overall citation/supersession micro values use the corresponding
item-count sums. The result must report every raw numerator and denominator plus the
included and excluded query and repository counts beside every metric.

No-positive queries (`|Pq|=0`) are excluded from positive Recall/Hit/MRR/nDCG
denominators and included in abstention, unnecessary-context, citation, safety, and
runtime denominators. At a frozen token budget, `abstained(q)=1` exactly when zero
events are packed and `0` otherwise. `unnecessaryContext(q)` is packed-frame portable
estimated tokens minus the zero-event frame tokens, lower-bounded at zero. Correct
abstention is the mean of `abstained(q)` over no-positive queries; unnecessary context
is reported as both the sum and arithmetic mean over every no-positive query. They are
never silently labeled correct retrievals.

### Exact budget packing and failures

For budget `B`, render the common framing, query, and current sources with zero events.
If that frame exceeds `B`, return `FRAME_OVER_BUDGET`, zero packed events, and retain
the query. Otherwise consider the frozen ordering sequentially. Render the complete
candidate frame after adding the next whole event. Include it only when
`ceil(frame.length/4) <= B`; on the first non-fitting event, stop and do not skip it to
fit later records. No excerpt, partial body, bundle-specific padding, or additive token
approximation is allowed.

Evidence-complete-prefix tokens are measured by rendering the full prefix through the
last member of `Pq`. If any positive is absent by output rank 1,000, status is
`INCOMPLETE`, prefix tokens are null, and the method is not fixed-utility eligible.
A comparative context claim requires every named method to be complete on every
frozen positive task; an incomplete required comparator blocks the claim instead of
removing the task or method.

A method exception, invalid output, worker crash, or 30,000 ms method-case timeout is
retained as `METHOD_FAILURE`. The timeout starts immediately before invoking the pure
ranker in a fresh evaluator worker and ends only after output-schema validation; worker
startup and sanitized-input construction are measured separately and cannot consume
or extend it. For a positive query, failure contributes zero Recall, Hit, MRR, DCG,
and nDCG at every rank/budget; DirectRecall is zero when `Dq` is non-empty and null
when `Dq` is empty. Prefix characters/tokens are null and
comparative eligibility is blocked. For a no-positive query it contributes
null Recall/Hit/MRR/nDCG, `abstained=0`, null unnecessary-context tokens, and remains a failure in citation,
safety, and runtime denominators; it is never counted as a correct abstention. A
timeout terminates the worker and discards the partial ordering but preserves the raw
failure observation. Missing oracle data is `ORACLE_MISSING`, blocks every affected
metric and claim, and cannot be treated as grade zero. Infrastructure failure before
method input permits no retry under this protocol; the one attempt produces the
bounded failure receipt.

### Exact paired statistics

For a completed method `Q` and comparator `B`, task token difference is
`d_q = tokens_Q(q) - tokens_B(q)`; negative favors Qarinah. Let `R` be the
lexicographically sorted repositories in the frozen positive population. For replicate
`b=0..9999` and cluster draw `j=0..|R|-1`, compute
`sha256(UTF8("qarinah-v3-token-bootstrap-v1\0" + b + "\0" + j))`, interpret its first
eight bytes as an unsigned big-endian integer, and select repository index modulo
`|R|`. Both indices use unsigned base-10 ASCII with no leading zeros. Include all tasks
in every drawn repository, with multiplicity. The replicate statistic is
`sum multiplicity(repo(q))*d_q / sum multiplicity(repo(q))` over every positive task;
an empty or non-finite replicate blocks the result.

If any named method has a null/incomplete prefix or method failure on any frozen
positive task, token bootstrap and ratio gates are blocked; null is never imputed as
zero, a budget ceiling, or full-history tokens.

Sort 10,000 replicate statistics. The ordinary two-sided 95% interval uses zero-based
order statistics `249` and `9750`. A one-sided upper bound at level `1-alpha` uses
index `ceil((1-alpha)*(9999))`; cap at `9999`.

The development token-superiority Holm family is frozen to full v3 versus exactly:
`admitted-title-body-bm25-v3`, `admitted-title-body-bm25-one-hop-v3`,
`qarinah-evidence-bundle-v3-no-graph`,
`qarinah-evidence-bundle-v3-no-entity`, and
`qarinah-evidence-bundle-v3-no-provenance`. The optional joint ablation and every
diagnostic are outside this family. Family alpha is `0.05`. The one-sided bootstrap
p-value is
`(1 + count(replicateDifference >= 0)) / 10001`. Sort p-values ascending; at Holm rank
`i=1..m`, reject only while `p_i <= 0.05/(m-i+1)`. For the same rank, report the
step-down adjusted one-sided upper bound using `alpha_i=0.05/(m-i+1)`; every adjusted
upper bound must be below zero. Report ordinary intervals too. No comparator is removed
from this family based on eligibility or observed performance; a failed comparator
blocks the family.

Eight-thousand-token direct-recall non-inferiority is a separate eligibility gate, not
part of the token-superiority Holm family. Use the same repository resampling with
domain string `qarinah-v3-recall-bootstrap-v1` and statistic
`microDirectRecall_Q - microDirectRecall_B`, restricted to tasks with non-empty `Dq`
and repositories containing at least one such task. No direct labels blocks the gate.
For each replicate, compute both micro-direct-recall ratios from the same drawn
repository multiset, preserving repository multiplicity in both retrieved-direct and
direct-label counts, then subtract comparator from Qarinah. A zero replicate
denominator blocks the result.
Its ordinary one-sided 95% lower bound is
zero-based order statistic `floor(0.05*9999)=499`; non-inferiority requires that bound
to be at least `-0.02` for every comparator. No `p=0`, normal approximation, task-level
resampling, unpaired resampling, or direction reversal is allowed.

For each comparator, micro token reduction is exactly
`1 - sum_q tokens_Q(q)/sum_q tokens_B(q)` across every frozen positive task. Per-repo
reduction uses the same ratio within the repository; repository-macro reduction is the
unweighted mean of those ratios over every repository with positive tasks. Both ratios
must be at least `0.05`. Mean per-task percentages, median percentages, rounded
thresholds, or a shared-eligible subset cannot replace these gates.

## Anti-leakage and evaluator separation

The evaluator must enforce all of these controls before loading a retrieval module:

1. verify protocol, corpus, fixture, source, runtime, and renderer hashes;
2. verify the result and failure destinations are absent;
3. install an allowlist-based file-read guard and deny all `bench/final/**`, provider,
   credential, final-result, gold-patch, and test-patch paths;
4. verify the method import graph contains no oracle, final-manifest, provider, network,
   package-publication, or deployment module;
5. place throwing spies around every oracle accessor and prove zero calls before all
   method rankings are serialized and hashed;
6. prove no ranker can read required IDs, required roles, structural labels,
   `data.scenario`, `data.role`, instance ID, evaluator hashes, difficulty, final-sample
   membership, gold fields, event sequence patterns, or expected outcomes; and
7. prove failed preflight causes zero retrieval calls and zero result writes.

The scorer may load development oracle data only after rankings are sealed. It receives
ranked event IDs and immutable event hashes, not a mutable method object. Tests must
mutate every prohibited field and show unchanged ranking or a preflight refusal.

## Freeze, authorization, and publication lifecycle

The required order is:

1. commit only this document and its machine-readable manifest;
2. obtain independent review with no unresolved P1/P2 finding;
3. tag the protocol commit `research-context-efficiency-development-v3-protocol`;
4. implement the method and evaluator in a separate commit;
5. independently review and tag that commit
   `research-context-efficiency-development-v3-evaluator`;
6. freeze the complete authorization core, have an independent reviewer approve its
   digest in a separate review-artifact commit, and tag that commit
   `research-context-efficiency-development-v3-authorization-review`;
7. create the authorization receipt as the review commit's direct child, bind the
   pre-existing review artifact, and tag it
   `research-context-efficiency-development-v3-authorization`;
8. execute exactly one authorized development attempt from that authorization commit;
9. commit exactly the result XOR failure artifact as the authorization commit's direct
   child and create exactly the corresponding terminal tag; and
10. only then add the generic read-only terminal verifier in the terminal commit's
    direct child and tag it `research-context-efficiency-development-v3-verifier`.

The only authorized future evaluator commands are:

```text
node scripts/evaluate-context-efficiency-development-v3.mjs --bindings-only
node scripts/evaluate-context-efficiency-development-v3.mjs --execute --write --attempt attempt-001
node scripts/evaluate-context-efficiency-development-v3.mjs --verify-result
```

`--bindings-only` is the pre-run verifier. It requires both terminal artifacts and both
temporary paths to be absent, verifies protocol/evaluator/authorization/runtime/input
bindings, and makes zero ranker, scorer, oracle, or write calls. It may run before
authorization with execution disabled, in which case it verifies authorization-path
absence and reports `NOT_AUTHORIZED`, and after authorization before the sole attempt,
in which case it validates the exact receipt.

`--verify-result` is the built-in success-only post-result verifier. It refuses when
the result is absent or any failure receipt is present, verifies the already-published
bytes and bindings, and makes zero ranker, scorer, oracle, or write calls. It cannot
replace the generic terminal verifier.

After the terminal artifact is committed and tagged, a separately committed
source-independent verifier at
`scripts/verify-context-efficiency-development-v3-terminal.mjs` handles either side of
the XOR. It imports neither evaluator nor method, performs zero retrieval/provider
calls and zero writes, and refuses until exactly one terminal tag and artifact exist.
The terminal commit must be the authorization commit's direct child and introduce
exactly one path with Git status `A`: the matching result or failure artifact. The
verifier commit must be the terminal commit's direct child.

The generic verifier requires the terminal tag to resolve to that terminal commit;
the tagged artifact blob, terminal-commit blob, verifier-HEAD blob, and current
worktree bytes and SHA-256 must all match. It requires the opposite artifact and tag
to be absent at the terminal commit, verifier HEAD, and worktree; verifies canonical
digest and recursively exact schema; revalidates every bound tag/commit/hash and the
authorization/review chain; reconstructs metrics, statistics, safety, mutations, and
decision fields from raw result observations; and rejects a fabricated winner,
marketing claim, favorable-subset omission, unknown field, tamper, later artifact
mutation, or post-result failure receipt. For a failure it verifies that no partial
aggregate, winner, or claim exists. Neither verifier may repair, rewrite, create, or
delete evidence.

The execution mode remains blocked until the authorization receipt explicitly permits
attempt `attempt-001` and the exact command below. No environment flag, alternate
command, attempt ID, or second authorization is permitted by v3.0.0-development.

### Exact authorization receipt

The only authorization path is:

```text
bench/research/context-efficiency-development-v3-authorization.json
```

It uses schema `qarinah.context-efficiency-development-authorization.v3` and must
contain exactly these top-level fields: `schemaVersion`, `attemptId`,
`executionAuthorized`, `protocol`, `evaluator`, `method`, `inputBuilder`,
`algorithmConfig`, `inputs`, `runtime`, `command`, `destinations`, `review`, `createdAt`, and
`contentDigest`. Their exact nested fields are frozen in the machine-readable
manifest. They bind `attemptId: "attempt-001"`, `executionAuthorized: true`, protocol
and evaluator tags/commits/paths/hashes, the method path/hash/export, sanitized-input
builder and algorithm config, fixture/corpus/renderer/scorer/estimator, the absolute
trusted Node binary and runtime, exact command, all four destinations and absence
booleans, a pre-existing review-artifact path/hash/commit/tag/reviewer/timestamp and
reviewed authorization-core digest, and the final canonical digest. Unknown or missing
fields fail closed.

The authorization core is the final authorization object with only `review` and
`contentDigest` omitted, serialized by the frozen canonical JSON rule. Before the
authorization file exists, an independent reviewer commits
`bench/research/context-efficiency-development-v3-authorization-review.json`. That
artifact has exact fields `schemaVersion`, `authorizationCoreDigest`, `reviewer`,
`reviewedAt`, `approved`, `scope`, and `contentDigest`; `approved` must be true and
`scope` must state that every execution-affecting core field was reviewed. The
authorization `review` object binds that already-committed artifact and repeats the
same core digest, reviewer, and timestamp. This removes any self-referential
approval-commit field.

The exact command is:

```text
node scripts/evaluate-context-efficiency-development-v3.mjs --execute --write --attempt attempt-001
```

The review-artifact commit is tagged
`research-context-efficiency-development-v3-authorization-review`; its direct child is
the authorization commit tagged
`research-context-efficiency-development-v3-authorization`. The receipt may authorize
one invocation only. It contains no credential, secret, provider token, final-manifest
content, expected metric, threshold override, or mutable “latest” version.

The success destination is:

```text
bench/results/context-efficiency-development-v3.json
```

The failure destination is:

```text
bench/results/context-efficiency-development-v3-{attemptId}-failure.json
```

For this protocol the resolved failure path is
`bench/results/context-efficiency-development-v3-attempt-001-failure.json`. The fixed
temporary paths are
`bench/results/.context-efficiency-development-v3-attempt-001-result.tmp` and
`bench/results/.context-efficiency-development-v3-attempt-001-failure.tmp`.

### Exact result and failure schemas

A success uses schema `qarinah.context-efficiency-development-result.v3`. Required
top-level fields are exactly `schemaVersion`, `attemptId`, `classification`, `bindings`,
`preflight`, `methods`, `cases`, `mutations`, `safety`, `statistics`, `decision`,
`measurementBoundary`, `developmentWinnerClaimAllowed`, `createdAt`, and
`contentDigest`. Nested
content must preserve protocol/evaluator/method/authorization-review/authorization/
runtime/input/config/corpus/scorer/renderer/estimator bindings; every per-case raw
ordering, hash, and frozen `pathDiagnostics`; post-order grades; every numerator,
denominator, null reason, aggregate, timeout, failure, and no-positive observation.
Every object and array item uses the recursively exact schema in the manifest; unknown
keys at any depth fail. In particular, verifier `objectSchemaMap` binds every
`statistics.tokenComparisons[].ordinaryTwoSided95` object to `intervalItem`, whose
only keys are `lower` and `upper`; any third interval key fails. Aggregate-only output
is invalid.

The claim-bearing success values are literals, not evaluator choices:

- `classification` is exactly
  `inspected development-only result; no comparative winner claim authorized`;
- `decision.primaryComparison` is exactly
  `development-only recovery and fixed-utility diagnostics; no comparative winner authorized`;
- `decision.winner` is null and `decision.developmentWinnerClaimAllowed` is false;
- `decision.allowedWording` is exactly the single-line value shown below; and
- `measurementBoundary` has exactly the keys and values in the JSON object below.

```text
On the inspected v3 development fixtures, the frozen method did or did not recover the required linked evidence under the exact admission, ordering, rendering, safety, and mutation gates.
```

```json
{"developmentOnly":true,"providerCalls":0,"providerTokens":null,"taskResolution":null,"cost":null,"humanFinalLabels":null}
```

Every null measurement means unmeasured, not zero, unavailable evidence, or an implied
favorable result. The top-level `developmentWinnerClaimAllowed` is also exactly false.

A failure uses schema `qarinah.context-efficiency-development-failure.v3` and contains
exactly `schemaVersion`, `attemptId`, `bindings`, `stage`, `error`, `observations`,
`createdAt`, and `contentDigest`. `error` contains only `code` and bounded redacted
`message`; `observations` contains only ranker/scorer/oracle call flags, completed
method-case count, and the four path-existence flags frozen in the manifest. It
uses the same exact static protocol/evaluator/method/authorization-review/authorization/
runtime/input/config/fixture/corpus/scorer/renderer/estimator binding fields as a
success and contains no partial comparative aggregate, winner, favorable subset, or
claim decision. Unknown keys at any depth fail.

Failure `error.message` is an exact non-interpolated ASCII literal selected by stage:
`Preflight binding validation failed.`, `Sanitized input validation failed.`, `Method
execution failed.`, `Ordering seal failed.`, `Post-order scoring failed.`, `Result
validation failed.`, or `Terminal artifact publication failed.` It is therefore at
most 512 UTF-16 code units. Raw exception text, stack, path, query, event ID, secret,
credential, provider response, or user content is forbidden; no truncation of raw text
is an acceptable redaction.

The frozen failure stages are `PREFLIGHT_BINDING`, `INPUT_SANITIZATION`,
`METHOD_EXECUTION`, `ORDER_SEAL`, `SCORING`, `RESULT_VALIDATION`, and
`RESULT_PUBLICATION`. A failure after any retrieval but before result publication
produces the one bounded failure receipt and discards partial comparative metrics.

Every authorization-review, authorization, result, and failure `contentDigest` is
`sha256(UTF8(canonicalJson(objectWithoutContentDigest)))`. `canonicalJson` recursively
sorts object keys by JavaScript default string order, preserves array order, emits only
JSON primitives/arrays/objects, uses JSON escaping, and adds no whitespace or trailing
newline. Non-finite numbers, negative zero, `undefined`, bigint, accessor properties,
and non-JSON prototypes are invalid.

Every `createdAt` and `reviewedAt` is a canonical 24-code-unit UTC timestamp
`YYYY-MM-DDTHH:mm:ss.sssZ`: it must match that fixed-width grammar, parse to a finite
JavaScript `Date`, and satisfy `new Date(value).toISOString() === value`. Leap seconds,
offsets, omitted or excess fractional digits, and verifier-time defaults are rejected.
The value is frozen once before digest serialization and verifiers compare it without
rewriting.

After the sole attempt, exactly one terminal artifact must exist: result XOR failure.
Neither existing, or both existing, is invalid. The success artifact is tagged
`research-context-efficiency-development-v3-result-attempt-001`; a failure artifact is
tagged `research-context-efficiency-development-v3-failure-attempt-001`. A result tag
and failure tag may never both exist. Before any independent verifier source is added,
the sole artifact must be committed in a terminal commit whose direct parent is the
authorization commit; that commit introduces only the terminal path and receives only
the matching terminal tag.

Publication serializes the complete canonical artifact, opens the fixed same-directory
temporary path with exclusive create, writes all bytes, flushes, closes, reopens, and
requires byte equality, parse equality, schema validity, and content-digest validity.
It then uses a no-replace hard-link creation from temp to terminal destination. If that
primitive is unsupported or the destination exists, publication fails closed; rename
or copy fallback is forbidden. Reopen the terminal path and require exact byte/hash
equality before unlinking only the temporary link. Directory metadata is flushed when
the platform supports it.

An error before result linking may publish the failure receipt through the same
procedure. Once a result destination exists, no failure receipt may be created—even if
terminal readback or later verification fails. Preserve the result and temporary file,
exit non-zero, and let the read-only post-result verifier report the defect. Existing
destinations cause refusal. Overwrite, result deletion, delete-and-retry,
rename-overwrite, copy fallback, silent retry, best-of-N selection, threshold rounding,
and post-result failure publication are forbidden.

## Development claim boundary

No v3 development outcome may support a winner statement. In particular, this protocol
sets all of the following to false:

- best or lowest-context claim;
- industry or universal claim;
- provider-token or cost claim;
- task-success or code-quality claim;
- latency superiority claim;
- cross-agent continuation claim; and
- production-readiness or release claim.

Allowed result language is limited to exact development facts, for example:

> On the inspected v3 development fixtures, the frozen method did or did not recover
> the required linked evidence under the exact admission, ordering, rendering, safety,
> and mutation gates.

## Untouched confirmation rule

Development v3 must not execute confirmation. After the v3 implementation and every
parameter are frozen, confirmation requires a dated amendment to the existing final
protocol. It must preserve without task changes:

- final task manifest tag `research-final-manifest-v1`, commit
  `b20bb87e6d0ab39aed7df00605d38d24deb9da36`, file SHA-256
  `eca1e32961cea6979a6c488cf5c7af19b2247923934059986f2e087d07016e54`,
  logical digest
  `26f1449acb454f2d6b46196f40c5604a6aa9acec21562af7ae1a6a1fdd86fdbb`,
  and all 387 retrieval tasks; and
- the 20-task abstention-only controls, file SHA-256
  `367730f076d5d41aa7ef516aba57c04ff677fc172d97e247ff9fb3b896585990`,
  logical digest
  `03d45e72959401d5efb771c5d1263008d2508d872ee25ddde8cd02bc71ca8ae1`,
  frozen by amendment tag `research-protocol-amendment-001` at commit
  `5b440c02c0720dba61ceecfdaa4a46f512f0d9db` (annotated tag object
  `de928d5ac503e990381e6cd61a112df7099d36b2`).

Before confirmation ranking, freeze and hash the pre-target memory corpus, graph,
relation extractor, candidate-set construction, structural oracle, human-review pool,
runtime, dense model, embedding dimensions, normalization, distance function, and
cache policy. Graph edges must be created solely from chronologically prior records;
no target gold field may create or weight an edge.

The dense binding is incomplete unless it records: model repository and immutable
revision; every weight/shard SHA-256; tokenizer implementation and version; tokenizer,
vocabulary, merges, and special-token file hashes; query and document prefixes;
pooling rule; maximum input length; truncation side and exact truncation policy; output
dimension; pre- and post-pooling normalization; similarity/distance formula and tie
order; dtype; execution device; batch size; runtime and every material library version;
deterministic-kernel flags; thread counts; random seeds; offline/network policy; cache
key formula; every cache artifact hash; and a repeated-run bit-equality check. “Latest,”
an unpinned hosted endpoint, or a cache without source-input/model/config bindings
blocks execution.

Confirmation must use all 387 retrieval tasks. The 20 controls are used only for
abstention and false-acceptance metrics. The deterministic 40-task agent sample and all
provider-backed work remain untouched by this retrieval lane.

Required confirmation competitors are admitted title/body BM25, admitted BM25 plus
one-hop graph, a frozen dense retriever, admitted BM25 plus dense, production v2, the
no-graph, no-entity, and no-provenance v3 ablations, and full v3. Missing dense
bindings or any required method blocks a comparative claim; it is never silently
omitted.

Structural labels are loaded by a separate scorer only after every ranking is sealed.
Human pools must be symmetric across methods, method-blinded, independently labeled by
two reviewers, and adjudicated only after both passes.

### Future bounded-claim gate

Even confirmation permits only the following bounded wording, and only if all gates
pass:

- every citation resolves to the frozen event ID and hash;
- Qarinah exposes zero forbidden future, invalid, restricted, wrong-repository, or
  superseded evidence;
- every required direct record occurs in the frozen full ordering;
- Qarinah 8,000-token direct recall is non-inferior to every eligible comparator with
  the separately defined two-percentage-point lower-bound rule;
- Qarinah evidence-complete-prefix tokens are at least 5% lower than every named
  eligible comparator under both exact ratio formulas above;
- every token comparison passes the exact repository-clustered 10,000-resample Holm
  family and adjusted one-sided upper-bound rule above; and
- no task, method, refusal, failure, timeout, or repository is removed from its frozen
  denominator.

If any gate fails, the outcome is tie, no result, or no claim as dictated by the frozen
rule. The only permissible future claim must name the exact Verified-minus-Lite
cohort, scorable count, structural or adjudicated oracle, compared methods, common
renderer, and portable estimator. “Best AI context reduction,” “best in the industry,”
provider-token, cost, task-success, and universal wording remain forbidden.
