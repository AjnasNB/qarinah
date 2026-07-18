# Governed interoperability boundaries

Qarinah keeps Maqam, Cockroach Crawler, and ProductLoop optional. The adapters in this document use their public shapes without adding any of those packages as a runtime dependency. Every durable write still passes Qarinah's machine-local workspace trust check.

## Maqam: governed query and append

`registerMaqamContextAdapters()` accepts Maqam's public `defineToolAdapter()` and `registerToolAdapter()` functions from the host. It creates exactly two registrations:

| Tool | Effect | Risk | Additional guard |
| --- | --- | --- | --- |
| `context.query` | `read` | `low` | Requires a ToolGateway-scoped evidence capability |
| `context.append` | `write` | `high` | Requires scoped evidence and a consumed approval matching run, tool, and exact canonical input hash |

Caller input cannot select a workspace, tool name, origin, effect, risk, evidence scope, or approval. The query budget is the minimum of the registration ceiling, request ceiling, and any `maxContextChars` / `maxContextItems` limits present in Maqam's effective context. Both handlers fail closed without Maqam's scoped evidence facade. `context.append` independently reproduces the input digest used by the inspected Maqam `0.3.0` implementation and requires a matching approved subject and matching consumption. That digest function is currently internal to Maqam, not a stable public API, so this is a pinned compatibility check rather than a permanent algorithm contract. A missing `runId` is consistently treated as Maqam's `default` run. Every admitted query item and every appended event becomes a Maqam evidence record whose run and tool attribution is supplied by ToolGateway. A successful append also rebuilds the disposable Qarinah index/graph/Markdown projection before returning, so the next governed query sees the approved event.

Append capture is explicit. Omitting `capture` writes only a synthetic title, hashes and size metadata, and no caller title, body, data, actor, relations, session ID, or turn ID. `{ capture: "content" }` retains the supplied event only when the machine-trusted Qarinah workspace itself is configured for content capture; otherwise the call fails with `CONTENT_CAPTURE_NOT_APPROVED`.

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

Do not call an adapter's `invoke` function directly or use an ungoverned gateway. The inspected Maqam contract exposes approvals, evidence, tool name, and run ID as ordinary structural handler-context fields; it does not expose an unforgeable ToolGateway capability or gateway-authenticated input-hash field. Qarinah rejects missing or mismatched approval digests, but a caller that obtains the handler and fabricates every plain context field can imitate a matching structure. Closing that residual requires an upstream Maqam contract change, such as a private branded capability verified by the handler; [Maqam issue #24](https://github.com/AjnasNB/maqam/issues/24) tracks it. Governance therefore depends on registering and invoking these adapters only through a trusted Maqam `ToolGateway`.

## Cockroach Crawler: SourceRecord ingestion

Cockroach Crawler `0.3.0-alpha.1` exports a TypeScript `SourceRecord` and a JSON Schema. It does **not** expose a public runtime `normalizeSourceRecord()` or `validateSourceRecord()` function. Qarinah therefore labels its validator as a structural boundary, not as Cockroach certification. Upstream should add a public runtime validator before issue #7 can claim full contract conformance.

`validateCockroachSourceRecordBoundary()` rejects accessors, prototypes, unknown fields, non-JSON values, non-canonical timestamps, malformed hashes, and records above Qarinah's documented ingestion ceilings. Ingestion creates two records:

- a stable content revision, identified by source identity, upstream `contentHash`, and the capture/retention projection; and
- a distinct acquisition, identified by the revision, title/type/URL/author/published metadata, adapter version, warnings, provider metadata, and retrieval provenance.

The revision stores only fields invariant for that source/content/projection identity; mutable descriptive and citation metadata belongs to acquisitions. Binding capture and retention to both deterministic IDs prevents a later policy change from reusing an ID for a different retained projection. Within one projection, an unchanged body fetched at a new `retrievedAt`, or with corrected title/type/URL/author/published metadata, therefore reuses the revision and appends a new acquisition instead of conflicting or forking the content history. Exact refetch replay is idempotent. The pure mapping functions default to metadata mode. `ingestCockroachSourceRecord()` reloads the machine-trusted workspace and follows its capture setting: metadata mode retains operational source type, upstream digest, acquisition flags, and redacted hashes/lengths, but not raw title, URL, text, author, warnings, or provider metadata; content mode retains the bounded content revision and full acquisition fields. Both modes mark crawler material as untrusted evidence. Revision and acquisition are two serialized Qarinah appends, not one transaction; if the second append fails, the revision remains and an exact retry can safely complete the acquisition.

The current SourceRecord has one canonical URL and one optional author; it has no typed citation array or multiple-author field. Qarinah treats that canonical URL as the citation relation and does not infer provider-specific citations from `metadata`. An upstream typed citation field is still required for lossless multi-citation ingestion. The public contract also does not specify how to recompute `contentHash`, so Qarinah validates its shape and uses it for identity but does not claim independent content verification.

```js
import { createSourceRegistry } from "cockroach-crawler/sources";
import { ingestCockroachSourceRecord } from "qarinah";

const sources = createSourceRegistry();
const records = await sources.read("web", "https://example.com/");
for (const record of records) {
  const { revision, acquisition } = await ingestCockroachSourceRecord(record, { cwd: process.cwd() });
  console.log(revision.eventId, acquisition.eventId);
}
```

The dependency direction remains `Cockroach SourceRecord -> Qarinah`; Cockroach Crawler does not import Qarinah.

## ProductLoop: ProvenanceSink bridge

`createProductLoopProvenanceSink()` is structurally compatible with the public `ajnas-runtime` `ProvenanceSink` interface. ProductLoop calls its single `record(RuntimeEvent)` method as events happen. The bridge does not inspect a runtime's internal trace array, monkey-patch a runtime, or replace `RunStore`.

The bridge requires canonical millisecond-precision UTC timestamps, validates ProductLoop's canonical receipt and SHA-256 event hash, enforces per-run sequence/hash continuity, and appends only in a machine-trusted Qarinah workspace. Its event identity is stable for `runId + sequence`, independent of the receipt hash. Consequently, two sink instances that present divergent events at the same logical position collide with `EVENT_ID_CONFLICT` under Qarinah's append lock instead of creating two histories. Install the sink before a run begins: a new or restarted sink must replay from sequence 1, after which exact replay is idempotent. ProductLoop may continue using any independent `RunStore` alongside this sink.

The sink reloads current workspace trust and capture policy for every record. Metadata workspaces retain receipt/sequence/type metadata and a redacted hash/length summary of `RuntimeEvent.data`, never raw inputs or outputs. Content workspaces retain the bounded data object. ProductLoop receipts are hashes, not signatures: they prove consistency with the supplied canonical event but not author identity.

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

All interoperability entry points that accept a structural `workspace` object use only its root as a locator and reload configuration, consent, real paths, and checkpoint state themselves. A caller-supplied object is not treated as proof of trust. Qarinah and adjacent ledgers are still separate systems: their writes are not an atomic cross-ledger transaction.
