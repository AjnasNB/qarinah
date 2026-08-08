# Qarinah context-efficiency comparison v2 — amendment 001

Status: pre-outcome binding amendment  
Authored: 2026-08-08  
Base protocol: `d7f2a09bed34507b3aec070f765d20b6a834d6d9` / `research-context-efficiency-protocol-v2`  
Approved source: `6c22d8f293e1e99bbbee239abb36e219af2c96a9`

## Timing and boundary

This amendment was written before either v2 retrieval method was executed. No v2 outcome had been observed and `bench/results/context-efficiency-comparison-0.1.6-v2.json` did not exist. This amendment does not itself authorize execution.

The base protocol and protocol document remain byte-for-byte unchanged:

- manifest: `sha256:0dc108888faa583ccdce132b38e6543df00130ffc58c4dbdb07656cf88a4cfbd`
- document: `sha256:834a5954cacea05e0721f3ad49a044093b6636252f985ba82b76386b18a59616`

Only the source binding, relevance-free neutral-ledger hashes, and exported shared-admission implementation are superseded. The research questions, tasks, renderer specification, BM25 algorithm, estimator, aggregation, safety fixtures, 24 mutations, and claim boundary do not change.

## Approved production source

The exact source commit is `6c22d8f293e1e99bbbee239abb36e219af2c96a9`, tree `22799851e89feb52fd0a0e85edcaac80b82cde5d`.

- reviewed implementation manifest: 77 files, `sha256:f1ba328d002bd99c047177ab8e947010e2ed48a2590a16fcc48337251036ae3e`
- complete production `src/` tree: 38 files, `sha256:73daa443755954b29c344350e2c08960d057664b99222b72a9c2200a86b14603`
- loaded entry points: `src/contracts.js`, `src/indexer.js`, and `src/retrieval.js`

The JSON amendment records every production-file SHA-256 and Git blob, the three loaded entry-point bindings, the reviewed four-file helper slice, and the frozen support-file bindings.

## Relevance-free neutral ledger

The ledger is reconstructed with `createEventEnvelope` from the approved source. Target and support records use `data: {}`; case IDs and roles exist only in the external evaluation map.

- workspace: `ws_20000000000000000000000000000001`
- events: 240
- head: `sha256:4b320461171cfbce374df509f9ef7b2e893a92c7661799d302dc333fcd2fbd1e`
- all-event binding digest: `sha256:e65fc43ca2b82d6539cd2fbe7fb7e3eb83b0e5c0023cbd5f240ecd0061015869`
- full-ledger digest: `sha256:efcdf6d2ff53ceaa27943b8d15fdb4d5951a18a666e18aa24cc86087d9b1c965`
- 24 required bindings: `sha256:3b78da956e48e9ff5b45bf7d2f5adc51aea2a9fd7a655fd3b3e9f3cffdece396`
- external relevance map: `sha256:6f7e66d2a23a588668241d578e311242c5991f267d0713a1b28b3b801b07dceb`

The JSON amendment contains all 240 event ID/hash pairs and all 24 case/role bindings. Relevance identities may be used only after ranking to measure fixed-k utility and the evidence-complete prefix.

## Shared admission and current state

Both primary methods must use the production exports at the approved source:

1. `resolveContextAdmission(index, options)`
2. `resolveCurrentContextState(index, orderedEventIds, options)`

`rankContextEvents` must use them internally. Admission-filtered BM25 must receive the exact production-eligible IDs before corpus statistics, then use the same current-state helper after ordering and before top-32. Per-case eligible and excluded IDs must be recorded in both directions.

Repository behavior remains exact: explicit `repository === null` and exact ID matches are eligible with selectors; absent/undefined and nonmatching repositories are excluded.

## Safety and mutations

The four base safety fixtures remain unchanged. Their base safety-stratum digest is `sha256:13ff416375145dd761d0fee3250f75553c77bec7a540b8497bc3cf09aa107ce9`; the compact case-binding digest is `sha256:4501a4b1386b7305bb37b4eae3eab97a428fef2daa6944cdc7b3f26fd72fc43e`.

All 24 named mutations remain mandatory, digest `sha256:169148a26a3b22112ab90a1ba11477ce7dd2153ae499e8511133252336bcfbc6`. Forbidden evidence must also fail on `bodySha256`. The conflict audit must verify eligibility, authorization, supersession, governing status, kind, confidence, contradiction pair, relation, and required-event distinctness.

## First-run gate

Before any first execution:

- these amendment files must be committed;
- the final evaluator implementing this amendment must be independently reviewed and committed;
- the result must bind its evaluator and direct-helper hashes;
- binding-only verification must materialize the exact source and execute no retrieval;
- all production files, neutral events, required bindings, relevance map, safety bindings, renderer controls, and mutations must match;
- the result path must remain absent until an explicitly authorized first write.

Any mismatch aborts before either retrieval method and produces no result. No post-outcome tuning is permitted.

