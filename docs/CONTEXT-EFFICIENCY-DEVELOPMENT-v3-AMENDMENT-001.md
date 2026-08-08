# Qarinah context-efficiency development v3 - Amendment 001

Machine-readable authority: [`bench/research/context-efficiency-development-v3-amendment-001.json`](../bench/research/context-efficiency-development-v3-amendment-001.json)

## Status and precedence

This is a **pre-execution, development-only amendment** to the frozen v3 protocol at
tag `research-context-efficiency-development-v3-protocol`, commit
`be872f39f97c5528b845830f5ce815f77f12df3e`. It was written without running a v3
ranker, evaluator, scorer, oracle, provider experiment, final-manifest evaluation, or
outcome. It authorizes none of those actions.

The amendment resolves corpus-materialization, chronology, entity-diagnostic,
anti-leakage, and lifecycle ambiguities identified during static implementation
review. Its normative rules override conflicting or less-specific language in the
base protocol. Every other base-protocol rule remains in force. The existing
non-executable implementation scaffold is not an evaluator eligible for tagging or
authorization under this amendment.

Only this document and its JSON companion may be introduced by the amendment commit.
The intended annotated tag is
`research-context-efficiency-development-v3-amendment-001`. Any outcome-informed
change requires a new protocol version, new attempt ID, and new result destination.

## A materialization stage is mandatory

The pinned SWE-bench Lite Parquet file contains `patch`, `test_patch`,
`problem_statement`, `hints_text`, and other fields in the same rows. It is therefore
a provenance source, not a rank-time input. The committed v0.2 development corpus is
also not a rank-time input: it contains patch-derived paths and structural labels but
does not contain the query text. Neither file may be opened by the evaluator after
the materialization stage.

Before an evaluator commit may exist, one separate materialization commit must add
and bind all of the following exact artifacts and modules:

| Role | Exact path |
| --- | --- |
| query-only raw artifact | `bench/research/context-efficiency-development-v3-gold-free-rows.json` |
| per-case prior-only corpus | `bench/research/context-efficiency-development-v3-gold-free-corpus.json` |
| sealed structural oracle | `bench/research/context-efficiency-development-v3-oracle.json` |
| constructed gold-free input | `bench/research/context-efficiency-development-v3-constructed-input.json` |
| constructed sealed oracle | `bench/research/context-efficiency-development-v3-constructed-oracle.json` |
| deterministic generator | `scripts/materialize-context-efficiency-development-v3.mjs` |
| rank-time corpus loader | `scripts/context-efficiency-development-v3-corpus.mjs` |
| materialization receipt | `bench/research/context-efficiency-development-v3-materialization.json` |

The materialization receipt must recursively reject unknown fields and bind the
dataset ID, immutable revision, split, upstream URL, upstream byte count and SHA-256,
the existing v0.2 corpus path/file SHA-256/logical digest, every input and output file
path, byte count, SHA-256, Git blob ID, schema version and logical content digest,
the generator and loader paths/SHA-256/blob IDs, the Node runtime, and the complete
generator import closure. Empty, `latest`, mutable, wildcard, or placeholder bindings
are invalid.

The exact upstream provenance binding remains:

- dataset `princeton-nlp/SWE-bench_Lite`;
- revision `6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2`;
- split `test`;
- source path `data/test-00000-of-00001.parquet`;
- URL `https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2/data/test-00000-of-00001.parquet`;
- byte count `1119540`; and
- SHA-256
  `7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4`.

The existing v0.2 source bindings are file SHA-256
`d30f94bba88f72db737340f05a9d3ad3c739c46f84307abc8802a78ca4de0482`
and logical digest
`01b35115ac639c1fcd3779561f83d5bb21988eb74ee5e93798c5d7579d757863`
for `bench/research/swe-bench-lite-development-v0.2.json`, loader SHA-256
`3b92352951a07854786b1a74ee5d2e6e5cbe1247b7c39d2f1135593cfed431dc`
for `bench/research/swe-bench-lite.mjs`, and preparation-script SHA-256
`a4a9fde86e7febd8278ca313f281eb0bd3025823f6b41a7ee408c0819db7054a`
for `scripts/prepare-research-benchmark-v0.2.mjs`. These are provenance inputs to
the trusted materializer only; they are not the new generator or loader bindings.

The generator, loader, and five generated artifacts do not exist at amendment
authorship. Their hashes must therefore be obtained from their future materialization
commit, independently reviewed, recorded without placeholders in the receipt, and
bound by the evaluator and authorization receipts. This is a hard blocker, not an
invitation to choose their bytes later based on a result.

Materialization may request only the three fully parameterized, revision-pinned
dataset-row URLs listed in the JSON companion. The receipt must commit each exact
response's requested/final URL, status, byte count, SHA-256, and redirect flag before
an evaluator is implemented. An unparameterized rows endpoint, redirect, absent hash,
or later response substitution blocks the materialization tag.

## Query-only raw artifact

The query-only artifact has exact top-level keys `schemaVersion`, `dataset`,
`revision`, `split`, `rows`, and `contentDigest`. Each row has exactly:

`repositoryId`, `opaqueTaskId`, `problemStatement`, `createdAt`, `version`, `phase`,
and `repositorySequence`.

It must contain all 300 pinned rows exactly once. It must contain no instance ID,
issue URL, base commit, environment commit, hint, patch, test patch, patch hash, test
hash, changed file, changed symbol, module scope, test name, oracle grade, required ID,
or expected result. A recursive prohibited-key and prohibited-value-origin audit is
mandatory. The artifact is source-derived, gold-free, immutable, and never supplied
to a ranker.

The sole query source is the pinned row's `problem_statement`. A noncanonical alias,
multiple normalized aliases, or conflicting duplicate source rows is
`QUERY_AMBIGUOUS`; the JSON companion freezes error precedence. The materializer
normalizes it in this exact order:

1. require a primitive string;
2. reject an unpaired UTF-16 surrogate;
3. reject NUL and C0/C1 controls except horizontal tab, line feed, and carriage
   return;
4. replace every CRLF and remaining CR with one LF;
5. apply Unicode NFKC;
6. apply JavaScript `String.prototype.trim()`; and
7. require 1 through 65,536 UTF-16 code units for history, then classify anything
   above 4,096 as a target-query refusal.

There is no query truncation, summarization, hint concatenation, solution text, source
file content, or fallback query. Ambiguous, missing, non-string, unpaired,
invalid-control, empty, or oversized queries produce the exact codes and precedence
in the JSON companion. Structural failures abort materialization because they cannot
form trustworthy later history. A normalized statement of 4,097 through 65,536
UTF-16 code units is retained as future history evidence, but its own target query is
`QUERY_TOO_LONG`. That target remains in every frozen denominator and causes zero
ranker calls. It is represented by seven sealed refusal tuples, a canonical sentinel
input hash, empty canonical entity diagnostics, and an exact zero-call order seal
rather than being omitted. A statement above 65,536 aborts materialization as
`HISTORY_STATEMENT_TOO_LONG`.

## Opaque identities and event hashes

Source instance IDs are usable only inside the trusted materializer. They may never
cross into the query-only artifact, prior-only corpus, sanitized ranker input, entity
diagnostics, order seal, or method output.

All hashes use lowercase SHA-256 over UTF-8. `NUL` below is one zero byte. The exact
derivations are:

- `opaqueTaskId = "tsk_" + hex(sha256("qarinah-v3-task-id-v1" + NUL + revision + NUL + repository + NUL + sourceInstanceId))`;
- deterministic UUID payload `h = hex(sha256("qarinah-v3-event-id-v1" + NUL + revision + NUL + repository + NUL + sourceInstanceId))`, with UUID version nibble 4 and RFC 4122 variant nibble derived exactly as in the JSON companion, then `eventId = "evt_" + uuid(h)`;
- `provenanceSourceId = "src_" + hex(sha256("qarinah-v3-provenance-v1" + NUL + revision + NUL + repository + NUL + sourceInstanceId))`; and
- `workspaceId = "ws_" + first32hex(sha256("qarinah-v3-workspace-v1" + NUL + repository))`.

For SWE cases, `opaqueCaseId` and result `caseId` equal the target `opaqueTaskId`.
Constructed case IDs use the separate `cfx_` domain and constructed event IDs are
re-derived from the fixture blob, opaque case ID, and source event ID; every relation
and oracle reference is remapped before envelopes are rehashed. The exact formulas
are in the JSON companion. Collisions are rejected across both populations.

Event envelopes are created only with the production `createEventEnvelope` contract
bound at amendment authorship to `src/contracts.js` SHA-256
`d74d0487fad186901c7aa1a8c8530c0920fe3908c611ce85ec17c6336d575650`.
The exact input fields, defaults, previous-hash chain, body construction, relation
construction, and canonical hashing are frozen in the JSON companion. The stored
`event.hash` becomes sanitized `eventHash` with the `sha256:` prefix retained.

Any duplicate source tuple, duplicate opaque task/event/provenance ID, duplicate event
hash for non-byte-identical events, hash mismatch, invalid canonical envelope, or ID
collision aborts materialization. There is no suffixing, rehashing, row deletion, or
collision retry.

## Chronology and per-case prior-only corpus

The target `asOf` is the canonical ISO timestamp derived from its normalized
`created_at`. Only the exact offset-bearing grammar and Gregorian integer conversion
in the JSON companion are accepted; local/zoneless or aliased timestamps are
ambiguous, and any timestamp failure aborts materialization without deleting a row.
Admission is always `strict-before`: candidate timestamp must be
strictly less than `asOf`. Equal-time records are excluded even if their source order,
opaque ID, or repository sequence is lower. There is no date rounding.

Repository rows are materialized in ascending canonical timestamp order, with
`opaqueTaskId` in JavaScript default string order as the deterministic equal-time
tie-break. This tie-break stabilizes bytes only; it never relaxes strict-before.

For each of the 240 held-out targets, the corpus contains both settings:

- `static`: only warm-up rows from the same repository with timestamp strictly before
  the target; and
- `online/prequential`: every row from the same repository with timestamp strictly
  before the target.

No target, equal-time record, later record, other-repository record, target patch,
target test patch, target changed path/symbol/module, post-resolution discussion, or
target oracle label appears in a case's candidate records or relations. Candidate
counts, exact IDs, hashes, and timestamps are independently reconstructed during
materialization review.

Historical SWE event text is limited to information proven available at its source
`created_at`: the normalized prior problem statement. Its title is the first
non-empty trimmed line, bounded without splitting a surrogate as specified in the
JSON companion; its body is the normalized problem statement exactly. Event `data`
is `{}` and its relations array is empty. The source timestamp is issue creation, not
a trustworthy resolution-availability timestamp, so patch-derived paths, changed
symbols, module scopes, resolution headings, and graph edges are deliberately absent
from rank-time SWE records. They may be used only by the sealed structural oracle
after every ordering is globally sealed. A future resolution-aware graph requires a
new pre-outcome amendment with an immutable resolution-availability timestamp.

The six constructed regression cases are split during materialization into a
gold-free input artifact and a separate oracle artifact. Only input relations whose
source and target are both gold-free case events are retained, and the target event
must have a strictly earlier timestamp. Equal-time, future, oracle-created, and
admission-excluded relations are rejected. Relations cannot reintroduce anything
outside the case's admitted-current candidate set.

The evaluator must call the bound production helpers in this order:

1. `resolveContextAdmission(index, { asOf, temporalBoundary: "strict-before",
   repositoryIds: [targetRepository], authorityScopes: [] })`;
2. `resolveCurrentContextState(index, admission.eligibleEventIds, { asOf,
   query: "", supersessionPolicy: "prefer-current",
   policyEligibleEventIds: admission.eligibleEventIds })`.

The current-state query is the **literal empty string**. The real problem statement is
never passed to current-state resolution. Therefore the production helper's
substring/exact-ID query exception cannot re-admit a superseded event. The real query
is added only after current-state resolution when the sanitized ranker input is
constructed. All term statistics, entity document frequencies, fuzzy candidates,
graph relations, and renderable events are recomputed from the resulting candidate
IDs only.

The bound production admission helper permits a null repository under a non-empty
repository selector. V3 hardens that ambiguity explicitly: whenever `repositoryIds`
is non-empty, its eligible IDs are intersected with events having a non-null exact
repository-ID match. Generated SWE events must always carry that exact repository.
The generated SWE corpus contains no authority object and has public disclosure with
empty scopes. Restricted disclosure in constructed controls follows the bound
production scope-intersection rule. Authority assignment expiry/revocation is not
silently promoted into a new admission policy; changing that production semantic
requires another pre-outcome amendment.

## Structural oracle isolation

The SWE structural oracle and constructed-fixture oracle are separate generated
artifacts. The SWE oracle may use target patch fields only to construct
evaluator-owned grades and forbidden/current sets; the constructed oracle carries
the remapped target/support grades and required evidence. Neither has query text or a
renderable body. The ranker, worker, input builder, admission helper, current-state
helper, renderer, and order-sealing code may not import, open, hash, receive, or infer
either artifact.

Every method for every non-refused case must finish or record a frozen failure. Then
the evaluator serializes each full returned order, returned hashes, path diagnostics,
raw citation observation, and failure using strict canonical JSON and stores its
SHA-256. A global seal containing every expected case-setting-method tuple, count,
and order digest is canonicalized and hashed. Only after this global seal is complete
and immutable may the scorer module and oracle loader be dynamically imported.

The scorer receives only the immutable global seal, frozen sanitized-input ID/hash
maps, and the oracle. It never receives a ranker object, mutable output, raw row,
materializer object, or protocol object. A missing tuple, duplicate tuple, unsealed
ordering, hash mismatch, changed bytes, or early scorer/oracle access blocks the
attempt; it is never scored as grade zero.

## Entity-diagnostic sidecar

Entity diagnostics are evaluator-owned and are never method input. The evaluator
independently repeats the frozen entity extraction against the admitted-current
title/body corpus before method invocation.

Matched entities are candidates with positive admitted document frequency, ordered
by admitted-corpus IDF descending and then JavaScript default string order, limited to
64. Unmatched entities have zero admitted document frequency, are ordered by
JavaScript default string order, and are limited to 64. The sidecar records the total
pre-limit counts, retained arrays, and truncated counts. Entity strings are bounded to
256 UTF-16 code units and satisfy the frozen normalization. Unknown keys, duplicate
entities, an entity in both arrays, incorrect counts/order/DF/IDF, or more than 64 in
either array is a preflight failure.

The sidecar exists only in parent evaluator memory until terminal publication. Its
sole result location is `cases[].entityDiagnostics`; there is no sidecar file. The
amendment adds `entityDiagnostics` to the exact `caseItem` result schema and adds exact
`entityDiagnostics`, `matchedEntityItem`, and `unmatchedEntityItem` schemas. It is not
included in sanitized ranker input and must not affect rankings.

## Phase read allowlists

Every repository read is denied unless its exact logical path and reviewed SHA-256 or
Git blob is present in the phase's authorization closure. Wildcards, directory reads,
symlink/reparse traversal, alternate data streams, case-fold aliases, network reads,
and mutable `latest` references are forbidden. Node built-ins and the absolute bound
Node binary are runtime, not repository-file exceptions.

The exact phases are:

1. `materialize`: amendment/base protocol, pinned provenance source, v0.2 corpus and
   loader, generator and its reviewed import closure; it may write only the five
   generated artifacts and receipt. It is the only phase allowed to see upstream
   rows containing gold fields.
2. `bindings-only`: base protocol, amendment, materialization receipt and generated
   artifacts as opaque bytes for hash verification, authorization/review when they
   exist, package metadata, and exact execution-closure source bindings. It may not
   load a ranker, scorer, oracle parser, or write.
3. `rank-input`: query-only rows, prior-only corpus, bound production admission and
   current-state helpers, input builder, ranker worker, method, exact config, and
   renderer. The oracle and every upstream/gold/final/provider path are denied.
4. `order-seal`: validated in-memory ranker outputs and canonical seal code only; no
   new repository read is allowed.
5. `post-seal-score`: only after a verified global seal, the exact scorer and sealed
   oracle become readable. Rankers are terminated and cannot be called again.
6. `terminal-write`: canonical result/failure publisher and the four fixed destination
   paths only. It cannot read upstream data, rerun a method, or change a seal.
7. `verify-result` and independent `terminal-verify`: terminal artifacts,
   authorization/review/materialization/base/amendment bindings, Git metadata through
   the bound Git executable, and verifier source only. They import neither evaluator
   execution modules nor method/scorer/oracle code and write nothing.

The machine-readable companion freezes the exact repository-path sets for each phase.
Future authorization binds every member's SHA-256 and Git blob and the canonical
digest of each complete set. Adding, omitting, or substituting a path requires a new
pre-outcome amendment.

## Anti-leakage assertions and mutations

Before any ranker call, the evaluator must:

- verify the base protocol, this amendment, materialization receipt, raw/corpus/oracle
  opaque hashes, fixture, runtime, renderer, config, method, loader, generator,
  production helpers, and complete execution closure;
- install fail-closed file/network/module guards;
- install throwing spies for oracle parsing, grade lookup, required-ID lookup, scorer
  import/call, final-manifest access, provider access, and result publication;
- prove every spy count is zero before the global order seal;
- prove the method has no import edge or runtime access to protocol, oracle, scorer,
  raw event data, file system, network, environment, credentials, final manifests, or
  publication code; and
- prove failed preflight produces zero method/scorer/oracle calls and zero writes.

The reviewed test suite must at minimum mutate each prohibited raw field, target gold
field, oracle grade/required ID, event `data`, future/equal-time record, expired,
restricted, wrong-repository and superseded record, relation target, raw row order,
object key order, ID/hash/collision, query type/control/length, sidecar count/order,
and ordering-seal byte. A mutation must either be rejected before a ranker call or
leave every sanitized input and full ordering byte-identical when the mutated field is
declared non-ranking. Reversing an edge is not assumed to remove recovery because
both graph directions are traversed; tests must assert the exact diagnostic/order
change frozen by the graph protocol. No mutation may consult an outcome to choose its
expected behavior.

## Superseded result schema details

All base metric definitions remain in force. For clarity, Recall@k, DirectRecall@k,
and Hit@k use unique known event IDs occurring within the first `k` raw output
positions; duplicate and unknown occurrences consume positions. Recall and Hit are
null for an empty positive set. DirectRecall is null for an empty direct set. A method
failure uses the base protocol's explicit failure values and never creates an empty
successful ordering.

At full, rank, and packed-budget scopes, forbidden and future exposure count raw
returned occurrences whose exact ID/hash pair is in the corresponding post-order
set; the denominator is the raw returned-item count at that scope, empty count is 0,
and empty rate is null. Citation validity uses raw returned items. Supersession and
redundancy use only a validated ordering and are null on method failure.

The result must add these exact case fields:

- `settingId` (`constructed`, `static`, or `online/prequential`);
- `entityDiagnostics` as defined above; and
- `orderSeal` with exact fields `expectedMethodCount`, `sealedMethodCount`,
  `tupleDigest`, and `sealedBeforeOracle`.

The top-level `preflight` must additionally report `phaseReadSetDigests`,
`oracleReadCountBeforeGlobalSeal`, `scorerImportCountBeforeGlobalSeal`,
`scorerCallCountBeforeGlobalSeal`, and `publicationCallCountBeforeGlobalSeal`.
Unknown fields remain rejected recursively. The exact amended schema map is frozen in
the JSON companion and must be incorporated into the future result verifier.

## Exact lifecycle replacement

No future execution may reuse a tag or commit from the abandoned scaffold. The only
valid chain is linear:

1. Base protocol commit `be872f39f97c5528b845830f5ce815f77f12df3e`, already tagged
   `research-context-efficiency-development-v3-protocol`.
2. Amendment commit: direct child of the base protocol; adds exactly this document and
   its JSON companion; annotated tag
   `research-context-efficiency-development-v3-amendment-001`.
3. Materialization commit: direct child of the amendment; adds exactly the generator,
   loader, five generated artifacts, and receipt; annotated tag
   `research-context-efficiency-development-v3-materialization` after independent
   review. No ranker/evaluator/result exists in this commit.
4. Evaluator commit: direct child of materialization; adds the reviewed method,
   evaluator, worker, libraries, tests, and package scripts; `--execute` and
   `--verify-result` are fully implemented but remain authorization-gated; annotated
   tag `research-context-efficiency-development-v3-evaluator`. The tagged evaluator
   may not be edited later.
5. Authorization-review commit: direct child of evaluator; adds exactly
   `bench/research/context-efficiency-development-v3-authorization-review.json`; tag
   `research-context-efficiency-development-v3-authorization-review`.
6. Authorization commit: direct child of review; adds exactly
   `bench/research/context-efficiency-development-v3-authorization.json`; tag
   `research-context-efficiency-development-v3-authorization`. Its reviewed core
   binds every base/amendment/materialization/evaluator tag, commit, path, SHA-256,
   Git blob, runtime, command, closure, read-set digest, destination, and absence
   observation.
7. One terminal commit: direct child of authorization; adds exactly result XOR failure
   and no other path; annotated matching result/failure tag. A published result cannot
   be followed by a failure receipt.
8. Verifier commit: direct child of terminal; adds exactly the generic independent
   terminal verifier and its test; tag
   `research-context-efficiency-development-v3-verifier`.

The terminal verifier imports no evaluator, ranker, scorer, oracle, corpus loader, or
materializer. It generically handles success XOR failure and verifies all direct
parents, tag targets, annotated tags, single-file introductions, exact blobs at the
tagged commit/current HEAD/worktree, canonical digest/schema, authorization-core
review equality, all bindings/read-set digests, opposite-artifact and opposite-tag
absence, no terminal mutation, no post-result failure, raw metric/statistic/safety/
mutation reconstruction, and no fabricated winner or claim.

The terminal must be committed and tagged before the independent verifier exists.
`--bindings-only`, `--verify-result`, and the independent verifier make zero ranker,
scorer, oracle, materializer, network, and write calls. Any chain, blob, tag, schema,
digest, read-set, absence, or reconstruction mismatch is terminal verification
failure; it cannot be repaired in place.

## Claim boundary

This amendment changes no claim gate. The run remains inspected development work.
It cannot establish a lowest-context, best, industry, provider-token, cost,
task-success, code-quality, production-readiness, release, publication, DOI, or
marketing claim. Untouched confirmation remains separately unauthorized and its
final manifests remain unreadable in this lane.
