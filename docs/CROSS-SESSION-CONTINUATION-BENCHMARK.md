# Evidence-linked cross-session continuation

Qarinah 0.1.5 ships a release-gated continuation benchmark and a provider-backed Codex product smoke test. Together they verify that a new coding-agent session can recover a compact handoff, inspect its source evidence, and continue work without native chat resume.

These are product-readiness checks. The deterministic fixture is reproducible locally; the provider run is one authenticated smoke test. Neither is a substitute for the frozen multi-repository confirmatory study.

## Deterministic context and summarization fixture

Run:

```sh
npm run evaluate:continuation
```

The evaluator creates 42 records across two logical sessions. Session A contributes an extracted task prompt, a verified failing-test outcome, and a completed-turn diagnosis. Qarinah then records one explicitly inferred handoff summary with `derived_from` relations and the event ID and SHA-256 hash of all three source records. Thirty-six unrelated records provide retrieval noise.

After the persisted read model is built, the fixture appends Session B lifecycle events so the derived files are deliberately stale. A zero-write in-memory query must still verify the authoritative ledger, retrieve the handoff, preserve all three source IDs and hashes, leave the persisted derived state byte-for-byte unchanged, and pass `doctor`.

| Measurement | Result |
| --- | ---: |
| Authoritative records | 42 |
| Logical sessions | 2 |
| Summary rank | 3 |
| Linked source records | 3 |
| Source IDs and hashes preserved | 3 / 3 |
| Raw source records selected in the compact pack | 1 / 3 |
| Full ledger estimate | 9,489 tokens |
| Complete cited audit-pack estimate | 1,039 tokens |
| Complete audit-pack reduction | 89.05% |
| Model-facing handoff capsule | 119 tokens |
| Handoff-capsule reduction | 98.75% |
| Persisted read model changed by query | No |
| Integrity check | Passed |

The selected summary is marked `inferred`; its sources retain their original confidence. Only one raw source record needs to occupy the complete pack because all three source citations remain in the summary for on-demand inspection. The capsule is an additional bounded projection for model injection: it retains the untrusted-data label, summary event ID/hash, and complete-pack manifest hash while leaving the three raw source IDs/hashes in the auditable pack. The result reports partial lexical coverage and `DIRECTLY_SUPPORTED` evidence sufficiency; these are different diagnostics and neither claims that a model's eventual patch is correct. Token values use `ceil(characters / 4)` and are not provider billing data.

The evaluator and committed expected result are [`scripts/evaluate-continuation-context.mjs`](../scripts/evaluate-continuation-context.mjs) and [`bench/results/continuation-context-0.1.5.json`](../bench/results/continuation-context-0.1.5.json).

## Fresh Codex-to-Codex product smoke

Run this separately from the deterministic release gate on a machine with an authenticated Codex CLI:

```sh
npm run smoke:codex-continuation -- --write
npm run check:continuation-evidence
```

The runner creates a disposable Git repository with one failing immutable-release-policy test. It then:

1. starts ephemeral Codex Session A, which diagnoses the failure but may not edit the fixture;
2. captures the allowed prompt, tool outcome, and completed turn in Qarinah;
3. records an inferred summary linked to those source event IDs and hashes;
4. starts a distinct ephemeral Codex Session B with native resume forbidden;
5. requires Session B to query Qarinah before reading source or running tests;
6. requires the final answer to cite a retrieved event ID and hash;
7. verifies the minimal fix, all acceptance tests, ledger integrity, distinct thread IDs, and zero transcript/path/credential leakage in the committed receipt.

The committed receipt is [`bench/results/codex-cross-session-continuation-0.1.5.json`](../bench/results/codex-cross-session-continuation-0.1.5.json). It stores hashes and normalized usage fields, not raw provider transcripts or local paths. The verifier rejects a wrong package version, changed implementation manifest, missing citations, reused session, failed test, failed doctor result, malformed receipt, or credential-like value. The implementation manifest hashes the normalized contents and paths of the shipped CLI, runtime, schemas, types, and Codex/Claude plugins, so it remains verifiable after a squash merge without relying on local Git history.

## Product fixes exercised by the benchmark

- Consent-gated `context.query` now reads a verified in-memory view of the authoritative ledger. Fresh lifecycle capture can advance the event head immediately before retrieval without forcing the read-only MCP call to repair or mutate derived state.
- `context.query` and the CLI can return a `handoff` format that injects a bounded summary pointer while retaining the complete manifest-addressed audit pack for inspection.
- Generated Codex setup uses `default_tools_approval_mode = "writes"`. Qarinah's allowlisted MCP tools are read-only, so a noninteractive run can call them; a future write-capable tool would still require approval.
- The Codex and Claude plugin runtimes are regenerated from the same reviewed source and remain byte-checked by the normal release gate.

## Interpretation limits

- The deterministic fixture measures context retrieval, summarization provenance, boundedness, and read freshness—not software-task success.
- The provider run is one synthetic product smoke, not a randomized baseline comparison or SWE-bench patch-resolution result.
- The 98.75% capsule result measures its compact model-facing text. It does not claim that every MCP client excludes structured metadata from provider token accounting.
- A successful Codex-to-Codex switch does not establish Claude-to-Codex or Codex-to-Claude performance. Those directions remain in the recorded cross-agent protocol.
- Provider usage is reported only when present in Codex CLI JSONL and must not be generalized to another model, repository, or workload.
