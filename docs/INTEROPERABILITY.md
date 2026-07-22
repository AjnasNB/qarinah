# Governed interoperability boundaries

Qarinah keeps Maqam, Cockroach Crawler, and ProductLoop optional. The adapters in this document use their public shapes without adding any of those packages as a runtime dependency. Every durable write still passes Qarinah's machine-local workspace trust check.

## Maqam: governed query and append

`registerMaqamContextAdapters()` requires Maqam's guarded `ToolGateway.registerGuardedTool()` contract. It creates exactly two registrations:

| Tool | Effect | Risk | Additional guard |
| --- | --- | --- | --- |
| `context.query` | `read` | `low` | Requires an active gateway-authenticated dispatch and a ToolGateway-scoped evidence capability |
| `context.append` | `write` | `high` | Requires the active execution guard, scoped evidence, and a consumed exact tool/write approval |

Caller input cannot select a workspace, tool name, origin, effect, risk, evidence scope, or approval. The query budget is the minimum of the registration ceiling, request ceiling, and any `maxContextChars` / `maxContextItems` limits present in Maqam's effective context. Both handlers fail closed without Maqam's scoped evidence facade. The guarded receipt authenticates the exact active input object, tool registration, run, canonical input hash, decision, and consumed approvals without exposing a reusable token. A missing `runId` is consistently treated as Maqam's `default` run. Every admitted query item and every appended event becomes a Maqam evidence record whose run and tool attribution is supplied by ToolGateway. A successful append also rebuilds Qarinah's disposable index, graph, and Markdown projection before returning, so the next governed query sees the approved event.

Append capture is explicit. Omitting `capture` writes only a synthetic title, hashes and size metadata, and no caller title, body, data, actor, relations, session ID, or turn ID. `{ capture: "content" }` retains the supplied event only when the machine-trusted context workspace itself is configured for content capture; otherwise the call fails with `CONTENT_CAPTURE_NOT_APPROVED`.

```js
import {
  ApprovalQueue,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway
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
  cwd: process.cwd(),
  maxChars: 20_000,
  maxItems: 20
});

const result = await gateway.call("context.query", { query: "release decision" }, {
  runId: "run_review",
  taskId: "retrieve_context"
});
```

Direct invocation of a retained registered handler fails because the verifier accepts only the exact input and context objects active inside the matching `ToolGateway.call()`. The capability is revoked after dispatch and cannot be serialized, copied to another tool, or replayed. [Maqam issue #24](https://github.com/AjnasNB/maqam/issues/24) records the upstream contract and acceptance criteria. This proves gateway-authenticated handler invocation, not total mediation: unregistered code, a raw driver retained by the host, and direct operating-system or network side effects remain outside Maqam.

## Cockroach Crawler: SourceRecord ingestion

Cockroach Crawler `0.3.0` exports a TypeScript `SourceRecord` and a JSON Schema. It does **not** expose a public runtime `normalizeSourceRecord()` or `validateSourceRecord()` function. Qarinah therefore labels its validator as a structural boundary, not as Cockroach certification. Upstream should add a public runtime validator before issue #7 can claim full contract conformance.

`validateCockroachSourceRecordBoundary()` rejects accessors, prototypes, unknown fields, non-JSON values, non-canonical timestamps, malformed hashes, and records above the ledger's documented ingestion ceilings. Ingestion creates two records:

- a stable content revision, identified by source identity, upstream `contentHash`, and the capture/retention projection; and
- a distinct acquisition, identified by the revision, title/type/URL/author/published metadata, adapter version, warnings, provider metadata, and retrieval provenance.

The revision stores only fields invariant for that source/content/projection identity; mutable descriptive and citation metadata belongs to acquisitions. Binding capture and retention to both deterministic IDs prevents a later policy change from reusing an ID for a different retained projection. Within one projection, an unchanged body fetched at a new `retrievedAt`, or with corrected title/type/URL/author/published metadata, therefore reuses the revision and appends a new acquisition instead of conflicting or forking the content history. Exact refetch replay is idempotent. The pure mapping functions default to metadata mode. `ingestCockroachSourceRecord()` reloads the machine-trusted workspace and follows its capture setting: metadata mode retains operational source type, upstream digest, acquisition flags, and redacted hashes/lengths, but not raw title, URL, text, author, warnings, or provider metadata; content mode retains the bounded content revision and full acquisition fields. Both modes mark crawler material as untrusted evidence. Revision and acquisition are two serialized ledger appends, not one transaction; if the second append fails, the revision remains and an exact retry can safely complete the acquisition.

The current SourceRecord has one canonical URL and one optional author; it has no typed citation array or multiple-author field. Context Ledger treats that canonical URL as the citation relation and does not infer provider-specific citations from `metadata`. An upstream typed citation field is still required for lossless multi-citation ingestion. The public contract also does not specify how to recompute `contentHash`, so the ledger validates its shape and uses it for identity but does not claim independent content verification.

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

The dependency direction remains `Cockroach SourceRecord -> Qarinah`; Cockroach Crawler does not import the context package.

## ProductLoop: ProvenanceSink bridge

`createProductLoopProvenanceSink()` is structurally compatible with the public `ajnas-runtime` `ProvenanceSink` interface. ProductLoop calls its single `record(RuntimeEvent)` method as events happen. The bridge does not inspect a runtime's internal trace array, monkey-patch a runtime, or replace `RunStore`.

The bridge requires canonical millisecond-precision UTC timestamps, validates ProductLoop's canonical receipt and SHA-256 event hash, enforces per-run sequence/hash continuity, and appends only in a machine-trusted context workspace. Its event identity is stable for `runId + sequence`, independent of the receipt hash. Consequently, two sink instances that present divergent events at the same logical position collide with `EVENT_ID_CONFLICT` under the ledger's append lock instead of creating two histories. Install the sink before a run begins: a new or restarted sink must replay from sequence 1, after which exact replay is idempotent. ProductLoop may continue using any independent `RunStore` alongside this sink.

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

ProductLoop `RuntimeEvent` has no schema-version field. Context Ledger pins this structural boundary to the inspected `ajnas-runtime@0.2.1` contract and validates receipts instead of inventing a version supplied by upstream. A future upstream versioned schema would make compatibility negotiation stronger.

## Google Open Knowledge Format: derived interchange

`exportOkf()` and `qarinah export okf` materialize the verified event chain as a [Google Open Knowledge Format 0.1 Draft](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle. The root `index.md` declares `okf_version: "0.1"`; `log.md` is grouped by event date newest-first; and each event becomes one `events/<event-id>.md` concept with required `type` frontmatter. Qarinah-specific extension keys preserve the event ID, content and chain hashes, actor, confidence, optional authority, typed relations, provenance, retention, and bounded HTTP(S) citation metadata. Known event relation targets are also emitted as bundle-relative Markdown links.

Output has no export-time clock or output-path field, so the same workspace/event head produces the same bytes and bundle digest at any permitted destination. A hidden canonical marker identifies replaceable Qarinah output. Existing unmarked directories, unexpected entries, path escapes, linked components, `.git`, and authoritative `.qarinah` locations are rejected before replacement. The default is the ignored derived directory `.qarinah/records/okf`; an explicit relative output is resolved from the real workspace root.

OKF standardizes portable Markdown structure, not storage, serving, querying, schemas, or a retrieval runtime. Qarinah therefore keeps JSONL authoritative and its lexical/graph/context compiler separate. This is a one-way rebuildable export, not OKF ingestion or lossless round-trip support. The implementation is pinned to the current `0.1` Draft and does not claim compatibility with unpublished future revisions.

## Migration and package-count note

The `exportOkf()` API and `qarinah export okf` command are additive in Qarinah `0.1.0-alpha.2`; the exporter itself does not require an event-schema migration. Existing workspaces need no OKF migration: the directory is produced only when explicitly requested and can be deleted and reproduced. Qarinah remains a separate optional package. It is not added to ProductLoop's fixed workspace/package namespace list, release manifest, or umbrella dependency set. If ProductLoop later exposes it as a namespace, its package-count assertions, clean-consumer matrix, release manifest, lockfile, documentation, and coordinated versioning must be changed together in ProductLoop itself.

All interoperability entry points that accept a structural `workspace` object use only its root as a locator and reload configuration, consent, real paths, and checkpoint state themselves. A caller-supplied object is not treated as proof of trust. Qarinah and adjacent ledgers are still separate systems: their writes are not an atomic cross-ledger transaction.
