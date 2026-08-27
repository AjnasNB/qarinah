# Qarinah recipes

These recipes start with a task a developer needs to complete. Run them from the exact root of an initialized and trusted workspace unless a command says otherwise.

## Start local project memory with the safest default

```sh
npm install --save-dev qarinah
npx qarinah init .
npx qarinah status
```

Expected result:

- initialization prints JSON containing `ok: true`, the selected root, a workspace ID, and `capture: "metadata"`;
- `status` reports the workspace as enabled and verifies the event store.

Metadata mode retains event presence and bounded metadata exposed by supported hooks, not event bodies. Choose content mode only when the project is permitted to retain reviewed event content:

```sh
npx qarinah init . --capture content
```

## Save an architectural decision for the next coding agent

```sh
npx qarinah record \
  --kind decision \
  --title "Use cursor pagination" \
  --body "Public list endpoints use opaque cursors so inserts do not reorder an active traversal." \
  --confidence claimed
npx qarinah build
```

Expected result:

- `record` returns the validated event, including its stable event ID and content hash;
- `build` verifies the chain and rebuilds the graph, retrieval index, Markdown record, and idempotency projection.

Use `confidence: "claimed"` for an explicit human or product decision. Do not label a claim `verified` merely because it was recorded.

## Resume a feature after a long break

Ask for the component, behavior, and constraint together:

```sh
npx qarinah query "checkout dialog keyboard focus" \
  --minimum-coverage direct \
  --max-tokens 1200 \
  --reserve-tokens 150 \
  --format markdown
```

Expected result:

- a bounded Markdown pack;
- complete selected records rather than partial record fragments;
- event IDs and hashes for selected evidence;
- a retrieval and coverage manifest.

If direct coverage fails, inspect the error instead of silently relaxing the gate. Try a known project term or record the missing decision explicitly.

## Hand a project from Codex to Claude Code

Install the reviewed host integrations:

```sh
codex plugin marketplace add AjnasNB/qarinah --ref v0.6.0
codex plugin add qarinah@qarinah
```

```sh
claude plugin marketplace add AjnasNB/qarinah@v0.6.0 --scope user
claude plugin install qarinah@qarinah --scope user
```

Initialize the shared project once, using its reviewed capture policy:

```sh
npx -y qarinah@latest init . --capture metadata
npx -y qarinah@latest scan
npx -y qarinah@latest doctor
```

At the start of a later task in either host, explicitly request evidence for that task or run:

```sh
npx -y qarinah@latest query "payment retry idempotency" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --format markdown
```

The project record is cross-host. Private conversations are not. Qarinah retains only permitted events that supported adapters actually receive.

## Record untrusted agent text without shell interpolation

Create one JSON object in the calling process and send it through stdin:

```sh
printf '%s' '{"kind":"source","title":"Gateway timeout report","body":"Observed three upstream 504 responses.","confidence":"extracted","sourceId":"incident-184"}' \
  | npx qarinah record --stdin-json
```

Expected result is one validated JSON event. Unknown fields, oversized input, malformed JSON, and unsupported values fail closed.

For Windows PowerShell, keep the JSON as process input rather than constructing a command from model text:

```powershell
$request = @{
  kind = "decision"
  title = "Retry only idempotent operations"
  body = "Mutation retries require an explicit idempotency key."
  confidence = "claimed"
} | ConvertTo-Json -Compress

$request | npx qarinah record --stdin-json
```

## Give an agent a fixed context budget

```sh
printf '%s' '{"query":"release approval artifact identity","format":"markdown","minimumCoverage":"direct","maxTokens":1800,"reserveTokens":300}' \
  | npx qarinah query --stdin-json
```

The compiler has at most 1,500 estimated tokens available for selected records after the 300-token reserve. It favors complete records and may return fewer results when the budget is tight.

This controls the Qarinah pack, not the model's total request or bill.

## Fail closed when evidence is missing

```sh
npx qarinah query "quantum payroll authorization" \
  --minimum-coverage direct \
  --format json
```

Expected result:

- if no selected record directly covers every normalized query term, the command returns an error instead of presenting the best weak match as direct evidence.

This protects evidence-sensitive workflows, but it does not classify every unsupported natural-language question perfectly.

## Find an earlier decision

```sh
npx qarinah query "database migration rollback" \
  --as-of 2026-06-30T23:59:59.000Z \
  --minimum-coverage direct \
  --format markdown
```

Expected result is a pack compiled from eligible retained records at or before the specified time. Records that were never captured cannot appear in historical results.

## Scan a large repository with explicit ceilings

```sh
npx qarinah scan \
  --max-files 5000 \
  --max-file-bytes 1048576 \
  --max-total-bytes 104857600 \
  --max-depth 24
```

Expected result includes whether a project snapshot was captured and bounded scan statistics. When capture succeeds, `scan` rebuilds derived state automatically.

The scanner honors the root `.gitignore` and `.qarinahignore`, rejects linked paths, and stores bounded structure and content identities rather than source-file bodies.

## Repair missing or stale derived views

```sh
npx qarinah doctor
```

If the command reports `derived: "missing"` or another non-current state:

```sh
npx qarinah build
npx qarinah doctor
```

The JSONL event chain is authoritative. Graph, index, Markdown, and related views are reproducible derived state.

`doctor` verifies integrity relative to the machine-local checkpoint. It does not prove that the human meaning of every recorded claim is true.

## Review policy before granting trust

```sh
npx qarinah policy .
```

Review the exact capture mode and returned policy hash. A host that manages trust explicitly can then approve that exact combination:

```sh
npx qarinah trust . \
  --capture metadata \
  --policy-hash sha256:REPLACE_WITH_REVIEWED_DIGEST
```

Do not copy the placeholder digest. Use only the digest returned for the policy you reviewed.

## Pause capture without deleting memory

```sh
npx qarinah disable
npx qarinah status
```

Re-enable the initialized workspace later:

```sh
npx qarinah enable
```

To revoke machine-local trust:

```sh
npx qarinah untrust
```

`untrust` revokes permission; it does not silently delete project files.

## Export project memory for review or interchange

```sh
npx qarinah export okf --output ./artifacts/qarinah-okf
```

Expected output describes the generated Open Knowledge Format bundle. The bundle contains reviewable Markdown, relations, citations, content hashes, and chain hashes.

OKF is a deterministic interchange view, not a second authoritative store. Continue to preserve and verify `.qarinah/events/events.jsonl`.

## Verify a release claim locally

From the Qarinah source repository:

```sh
npm run evaluate:software-tasks
npm run evaluate:long-document
npm run evaluate:context
npm run benchmark
```

The committed software-task evaluator reports 442,113 estimated input-context tokens for retained-history replay and 5,682 for cited Qarinah packs, a 98.71% reduction in that compared repeated-context slice. The same current-task sources are retained on both sides.

These are reproducible character-based estimates, not provider-billed Codex or Claude usage. See [benchmarks](BENCHMARKS.md) and the [machine-readable result](../bench/results/software-task-context-0.1.0.json).

## Diagnose the MCP integration

Start the stdio server only from a reviewed package or plugin runtime:

```sh
npx qarinah mcp
```

The server provides zero-write workspace status, integrity diagnostics, and bounded `context.query` retrieval for the exact initialized, enabled, machine-trusted workspace. It still cannot initialize workspaces, grant trust, repair state, or record events.

For context retrieval, use an explicit `query` operation or a separately reviewed host capability.

## Next steps

- [Token-efficient context](TOKEN-EFFICIENT-CONTEXT.md)
- [Getting started](GETTING-STARTED.md)
- [Codex and Claude Code integrations](HOST-INTEGRATIONS.md)
- [Interoperability](INTEROPERABILITY.md)
- [Security](SECURITY.md)
- [FAQ](FAQ.md)
