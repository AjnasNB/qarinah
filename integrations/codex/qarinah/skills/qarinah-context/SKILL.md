---
name: qarinah-context
description: Compile, inspect, verify, or record evidence-linked local context with Qarinah. Use when Codex needs prior project decisions, tool outcomes, sources, approvals, provenance, a compact context pack, context-ledger diagnostics, or an explicit durable decision record in a workspace that has opted in.
---

# Qarinah Context

Use the plugin's zero-write MCP tools only for status and integrity verification. They never initialize, trust, repair, disclose context, or write a workspace. Context retrieval requires a Maqam-scoped disclosure capability. If the user explicitly requests a direct local compatibility query, use the [bundled compatibility runtime](../../runtime/qarinah.mjs) as the stable interface. Resolve that link to an absolute path, then invoke it with `node "<absolute-runtime-path>" ...`. Never search `PATH`, run bare `qarinah`, or use `npx`; the plugin runtime is self-contained and reviewed with the plugin.

## Retrieve context

1. Call `context_status` to confirm the workspace is explicitly enabled and machine-trusted.
2. Call `context_doctor` before relying on the ledger for a high-impact action.
3. Prefer a Maqam-scoped `context.query` capability. Only when the user explicitly requests a direct local query, run `node "<absolute-runtime-path>" query "<task terms>" --format markdown --max-chars 12000`.
4. Use only items relevant to the current task.
5. Cite event IDs and hashes when a decision depends on retrieved context.
6. Distinguish `extracted`, `inferred`, `claimed`, and `verified` records.

If no workspace is initialized, explain that capture is opt-in. Do not initialize it unless the user asks.

## Record durable context

Record an explicit decision only when the user asks or when durable recording is part of the requested workflow:

```text
node "<absolute-runtime-path>" record --kind decision --title "<short title>" --body "<decision and reason>" --confidence claimed
```

Never record credentials, environment values, private browser state, hidden reasoning, or unrelated file contents. Prefer metadata and source references over raw tool output.

## Verify

Run `node "<absolute-runtime-path>" doctor` before relying on the ledger for a high-impact action. A valid hash chain and machine-local checkpoint establish record continuity relative to that checkpoint; they do not prove that a claim is true.

## Rebuild derived state

Run `node "<absolute-runtime-path>" build` after explicit records are added. Graph, index, and Markdown files are derived; the JSONL event chain remains authoritative.

Read [event contract](references/event-contract.md) only when interpreting record kinds, confidence classes, relations, or security boundaries.
