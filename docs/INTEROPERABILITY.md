# Governed interoperability boundaries

Qarinah keeps Maqam, Cockroach Crawler, and ProductLoop optional. The adapters in this document use their public shapes without adding any of those packages as a runtime dependency. Every durable write still passes Qarinah's machine-local workspace trust check.

## Maqam: governed query and append

`registerMaqamContextAdapters()` accepts Maqam's public `defineToolAdapter()` and `registerToolAdapter()` functions from the host. It creates exactly two registrations:

| Tool | Effect | Risk | Additional guard |
| --- | --- | --- | --- |
| `context.query` | `read` | `low` | Requires a ToolGateway-scoped evidence capability |
| `context.append` | `write` | `high` | Requires scoped evidence and an exact consumed approval for the current run and tool |

The handlers are created inside the registration function and are not returned. Caller input cannot select a workspace, tool name, origin, effect, risk, evidence scope, or approval. The query budget is the minimum of the registration ceiling, request ceiling, and any `maxContextChars` / `maxContextItems` limits present in Maqam's effective context. Both handlers fail closed without Maqam's scoped evidence facade. Every admitted query item and every appended event becomes a Maqam evidence record whose run and tool attribution is supplied by ToolGateway. A successful append also rebuilds the disposable Qarinah index/graph/Markdown projection before returning, so the next governed query sees the approved event.

```js
import {
  ApprovalQueue,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  defineToolAdapter,
  registerToolAdapter
} from "maqam";
import { registerMaqamContextAdapters } from "qarinah";

const approvalQueue = new ApprovalQueue();
const gateway = new ToolGateway({
  approvalQueue,
  evidenceLedger: new EvidenceLedger(),
  policyEngine: new PolicyEngine({
    allowedTools: ["context.query", "context.append"],
    approvalRequiredEffects: ["write"]
  })
});

registerMaqamContextAdapters({
  gateway,
  defineToolAdapter,
  registerToolAdapter,
  cwd: process.cwd(),
  maxChars: 20_000,
  maxItems: 20
});

const result = await gateway.call("context.query", { query: "release decision" }, {
  runId: "run_review",
  taskId: "retrieve_context"
});
```

Do not call an adapter's `invoke` function directly or use an ungoverned gateway. `context.append` is deliberately unusable without an exact approval consumed by ToolGateway.

## Cockroach Crawler: SourceRecord ingestion

Cockroach Crawler `0.3.0-alpha.1` exports a TypeScript `SourceRecord` and a JSON Schema. It does **not** expose a public runtime `normalizeSourceRecord()` or `validateSourceRecord()` function. Qarinah therefore labels its validator as a structural boundary, not as Cockroach certification. Upstream should add a public runtime validator before issue #7 can claim full contract conformance.

`validateCockroachSourceRecordBoundary()` rejects accessors, prototypes, unknown fields, non-JSON values, malformed hashes, and records above Qarinah's documented ingestion ceilings. `cockroachSourceRecordToEventInput()` then:

- marks source text as untrusted data;
- preserves the upstream content hash, canonical URL, author, timestamps, warnings, provider metadata, and acquisition flags;
- creates typed `derived_from`, `references`, and `governed_by` relations;
- derives the Qarinah event ID from source identity plus `contentHash`, so an exact revision is idempotent and a changed hash is a new revision;
- truncates only the event title/body projection, while retaining the upstream digest and a truncation marker.

The current SourceRecord has one canonical URL and one optional author; it has no typed citation array or multiple-author field. Qarinah treats that canonical URL as the citation relation and does not infer provider-specific citations from `metadata`. An upstream typed citation field is still required for lossless multi-citation ingestion. The public contract also does not specify how to recompute `contentHash`, so Qarinah validates its shape and uses it for identity but does not claim independent content verification.

```js
import { createSourceRegistry } from "cockroach-crawler/sources";
import { ingestCockroachSourceRecord } from "qarinah";

const sources = createSourceRegistry();
const records = await sources.read("web", "https://example.com/");
for (const record of records) {
  await ingestCockroachSourceRecord(record, { cwd: process.cwd() });
}
```

The dependency direction remains `Cockroach SourceRecord -> Qarinah`; Cockroach Crawler does not import Qarinah.

## ProductLoop: ProvenanceSink bridge

`createProductLoopProvenanceSink()` is structurally compatible with the public `ajnas-runtime` `ProvenanceSink` interface. ProductLoop calls its single `record(RuntimeEvent)` method as events happen. The bridge does not inspect a runtime's internal trace array, monkey-patch a runtime, or replace `RunStore`.

The bridge validates ProductLoop's canonical receipt and SHA-256 event hash, enforces per-run sequence/hash continuity, maps the official callback event to a deterministic Qarinah event, and appends only in a machine-trusted Qarinah workspace. Install the sink before a run begins: a new sink fails closed if its first event for a run is not sequence 1. Exact replay of the current event is idempotent. ProductLoop may continue using any independent `RunStore` alongside this sink.

```js
import { AgentRuntime, FileRunStore } from "ajnas-runtime";
import { createProductLoopProvenanceSink } from "qarinah";

const runtime = new AgentRuntime({
  provenance: createProductLoopProvenanceSink({ cwd: process.cwd() }),
  store: new FileRunStore({ directory: ".productloop-runs" })
});

await runtime.run({
  name: "document-release",
  steps: [{ id: "prepare", run: async () => ({ ready: true }) }]
});
```

ProductLoop `RuntimeEvent` has no schema-version field. Qarinah pins this structural boundary to the inspected `ajnas-runtime@0.2.1` contract and validates receipts instead of inventing a version supplied by upstream. A future upstream versioned schema would make compatibility negotiation stronger.

## Migration and package-count note

These exports are additive in Qarinah `0.1.0-alpha.0`; no existing event schema changes. Qarinah remains a separate optional package. It is not added to ProductLoop's fixed workspace/package namespace list, release manifest, or umbrella dependency set. If ProductLoop later exposes it as a namespace, its package-count assertions, clean-consumer matrix, release manifest, lockfile, documentation, and coordinated versioning must be changed together in ProductLoop itself.
