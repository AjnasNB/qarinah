# JavaScript and TypeScript API reference

Qarinah is an ESM package. The public implementation is exported from `qarinah`; host adapters and MCP also have narrow subpath exports.

```js
import {
  appendEvent,
  compileContext,
  initializeWorkspace,
  renderContextPackMarkdown
} from "qarinah";
```

```ts
import { captureCodexHook } from "qarinah/codex";
import { captureClaudeHook } from "qarinah/claude";
import { createMcpServer, runMcpServer } from "qarinah/mcp";
```

The declarations shipped in `types/index.d.ts`, `types/codex.d.ts`, `types/claude.d.ts`, and `types/mcp.d.ts` are the exact compile-time contract for version 0.1.1. JSON Schemas are available through package exports such as `qarinah/schemas/event.json`.

## Runtime boundary

- Node.js 22, 24, or 26.
- ESM imports.
- Local filesystem storage.
- No hosted Qarinah account, embedding service, vector database, or Qarinah API key.
- Workspace initialization and machine-local trust are separate.
- Retrieved text is returned as `contentRole: "untrusted-data"` and must never be executed as instructions.

## Errors

```ts
class QarinahError extends Error {
  code: string;
  details?: unknown;
}
```

Catch stable Qarinah failures by `code`:

```js
import { QarinahError, compileContext } from "qarinah";

try {
  await compileContext("release approval", {
    cwd: process.cwd(),
    minimumCoverage: "direct"
  });
} catch (error) {
  if (error instanceof QarinahError && error.code === "CONTEXT_COVERAGE_TOO_LOW") {
    // No retained event directly covers every normalized query term.
  } else {
    throw error;
  }
}
```

Invalid JavaScript argument shapes generally throw `TypeError`. Storage, trust, integrity, coverage, and bounded-operation failures generally throw `QarinahError`.

## Version and contract constants

| Export | Value in 0.1.1 |
| --- | --- |
| `QARINAH_VERSION` | `"0.1.1"` |
| `EVENT_SCHEMA_VERSION` | `"qarinah.event.v1"` |
| `CONTEXT_PACK_SCHEMA_VERSION` | `"qarinah.context-pack.v2"` |
| `CONFIG_SCHEMA_VERSION` | `"qarinah.config.v1"` |
| `INDEX_SCHEMA_VERSION` | `"qarinah.index.v2"` |
| `GRAPH_SCHEMA_VERSION` | `"qarinah.graph.v2"` |
| `PROJECT_STRUCTURE_SCHEMA_VERSION` | `"qarinah.project-structure.v1"` |
| `OKF_EXPORT_SCHEMA_VERSION` | `"qarinah.okf-export.v1"` |
| `OKF_VERSION` | `"0.1"` |
| `EVENT_KINDS` | Frozen list of supported event kinds. |
| `RELATION_TYPES` | Frozen list of supported relation types. |

## Core event types

`QarinahEventInput` is the append input:

```ts
interface QarinahEventInput {
  eventId?: string;
  timestamp?: string;
  sessionId?: string | null;
  turnId?: string | null;
  kind: QarinahEventKind;
  actor?: { type: "human" | "agent" | "tool" | "system" | "source"; id: string };
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  confidence?: "extracted" | "inferred" | "claimed" | "verified";
  authority?: QarinahAuthority;
  relations?: QarinahRelation[];
  provenance?: { adapter?: string; sourceId?: string | null; contentHash?: string };
  retention?: { class?: "session" | "project" | "durable"; expiresAt?: string | null };
}
```

`QarinahEvent` adds the canonical schema version, workspace ID, normalized defaults, provenance hash, previous hash, and event hash. The stored JSON contract is also exported as:

```js
import eventSchema from "qarinah/schemas/event.json" with { type: "json" };
```

Supported event kinds:

```text
session.started, prompt.submitted, tool.requested, tool.completed,
turn.completed, compaction.started, compaction.completed, artifact,
source, claim, decision, approval, summary
```

Supported relation types:

```text
derived_from, produced, changed, supports, contradicts, supersedes,
authorized_by, governed_by, affects, references
```

## Workspace and trust

### `initializeWorkspace(target?, options?)`

```ts
function initializeWorkspace(
  target?: string,
  options?: { capture?: "metadata" | "content" }
): Promise<QarinahWorkspace>;
```

Creates a new portable workspace configuration at the exact target and grants machine-local consent for that new configuration. Capture defaults to `metadata`. If the target is already initialized, the call fails with `WORKSPACE_EXISTS`; use `loadWorkspace` to open an existing workspace.

```js
const workspace = await initializeWorkspace(process.cwd(), {
  capture: "metadata"
});
```

The returned `QarinahWorkspace` contains:

```ts
interface QarinahWorkspace {
  root: string;
  qarinahDir: string;
  config: QarinahConfig;
  configPath: string;
  consent: QarinahConsent | null;
}
```

### `findWorkspaceRoot(start?)`

```ts
function findWorkspaceRoot(start?: string): Promise<string | null>;
```

Searches from `start` for an initialized workspace and returns its root or `null`. Security-sensitive callers should prefer an exact root and verify it instead of assuming that walking to a parent is appropriate.

### `loadWorkspace(start?, options?)`

```ts
function loadWorkspace(
  start?: string,
  options?: { allowDisabled?: boolean; skipConsent?: boolean }
): Promise<QarinahWorkspace>;
```

Loads and validates configuration and, by default, machine-local trust. `allowDisabled` permits administrative inspection of a disabled workspace. `skipConsent` bypasses consent loading for internal review flows; it does not grant permission to capture.

### `inspectWorkspacePolicy(start?)`

```ts
function inspectWorkspacePolicy(start?: string): Promise<QarinahCapturePolicy>;
```

Returns the exact requested capture policy and its `sha256:` policy hash without changing trust.

### `approveWorkspaceTrust(start, expectedCapture, expectedPolicyHash)`

```ts
function approveWorkspaceTrust(
  start: string | undefined,
  expectedCapture: "metadata" | "content",
  expectedPolicyHash: `sha256:${string}`
): Promise<{
  root: string;
  workspaceId: string;
  capture: "metadata" | "content";
  policyHash: `sha256:${string}`;
  trusted: true;
  eventCount: number;
  headHash: string | null;
}>;
```

Approves only the reviewed capture mode and exact current policy digest.

### `setWorkspaceEnabled(start, enabled)`

```ts
function setWorkspaceEnabled(
  start: string | undefined,
  enabled: boolean
): Promise<QarinahConfig>;
```

Changes the portable enabled state and corresponding machine-local state in fail-closed order.

### `revokeWorkspaceTrust(start?)`

```ts
function revokeWorkspaceTrust(start?: string): Promise<{
  root: string;
  workspaceId: string | null;
  trusted: false;
}>;
```

Revokes this machine's permission without deleting project files.

### `resolveWithin(root, ...segments)`

```ts
function resolveWithin(root: string, ...segments: string[]): string;
```

Resolves a path and rejects a lexical escape from `root`.

### `secureStoragePath(workspace, segments, options?)`

```ts
function secureStoragePath(
  workspace: QarinahWorkspace,
  segments: string[],
  options?: {
    allowMissing?: boolean;
    type?: "file" | "directory";
  }
): Promise<string>;
```

Resolves a Qarinah storage location under the trusted workspace while enforcing path, link, and expected-type boundaries.

## Event contracts and storage

### `createEventEnvelope(input, options)`

```ts
function createEventEnvelope(
  input: QarinahEventInput,
  options: {
    workspaceId: string;
    previousHash?: string | null;
    maximumEventBytes?: number;
    clock?: () => Date;
    randomUUID?: () => string;
  }
): QarinahEvent;
```

Normalizes and validates an event, computes its provenance content hash and chained event hash, and returns the immutable envelope. It does not append to disk.

### `validateStoredEvent(value, options?)`

```ts
function validateStoredEvent(
  value: unknown,
  options?: {
    expectedPreviousHash?: string | null;
    workspaceId?: string;
    maximumEventBytes?: number;
  }
): QarinahEvent;
```

Validates a stored envelope, including contract shape, canonical values, workspace, chain linkage, and hashes.

### `appendEvent(input, options?)`

```ts
function appendEvent(
  input: QarinahEventInput,
  options?: {
    cwd?: string;
    workspace?: QarinahWorkspace;
    capture?: "metadata" | "content";
    clock?: () => Date;
    randomUUID?: () => string;
    idempotent?: boolean;
  }
): Promise<QarinahEvent>;
```

Appends one event under the renewable writer lock after verifying workspace trust, the log tail, the machine checkpoint, limits, capture policy, and event identity.

```js
const event = await appendEvent({
  kind: "decision",
  title: "Use exact artifact identity",
  body: "Publish only the artifact built from the reviewed commit.",
  confidence: "verified",
  relations: [{ type: "affects", target: "release" }]
});
```

When `idempotent` is enabled, a matching stable event identity can return the retained event. Reusing an identity for different content fails rather than silently forking history.

### `readEvents(workspaceOrStart?, options?)`

```ts
function readEvents(
  workspaceOrStart?: QarinahWorkspace | string,
  options?: {
    skipCheckpoint?: boolean;
    updateCheckpoint?: boolean;
  }
): Promise<QarinahEvent[]>;
```

Reads and verifies the bounded canonical log. Normal application reads should not skip checkpoint verification.

### `verifyStore(start?, options?)`

```ts
function verifyStore(
  start?: string,
  options?: {
    updateCheckpoint?: boolean;
    includeRoot?: boolean;
  }
): Promise<{
  ok: true;
  workspaceId: string;
  eventCount: number;
  headHash: string | null;
  capture: string;
  root?: string;
}>;
```

Verifies configuration, machine trust, canonical log framing, event contracts, hash continuity, IDs, and checkpoint state. `includeRoot` is opt-in so diagnostic surfaces can avoid disclosing absolute paths.

## Derived graph and index

### `buildDerivedState(events, workspaceId)`

```ts
function buildDerivedState(
  events: QarinahEvent[],
  workspaceId: string
): { index: unknown; graph: unknown };
```

Purely derives the versioned graph and local retrieval index from already validated events.

### `rebuildDerivedState(start?)`

```ts
function rebuildDerivedState(start?: string): Promise<{
  workspaceId: string;
  eventCount: number;
  headHash: string | null;
}>;
```

Verifies the canonical record and atomically replaces deterministic graph, index, Markdown, and event-ID projections.

### `loadIndex(start?, options?)`

```ts
function loadIndex(
  start?: string,
  options?: {
    rebuild?: boolean;
    updateCheckpoint?: boolean;
    inMemory?: boolean;
  }
): Promise<{ workspace: QarinahWorkspace; index: unknown }>;
```

Loads an index that exactly matches the verified event log. With `rebuild: false`, missing or stale state fails. `inMemory: true` derives without persisting the index.

### `tokenize(value)`

```ts
function tokenize(value: unknown): string[];
```

Returns the deterministic normalized terms used by the local retrieval implementation.

### `rankContextEvents(index, query, options)`

```ts
function rankContextEvents(
  index: unknown,
  query: string | undefined,
  options: {
    limit?: number;
    diversity?: number;
    supersessionPolicy?: "prefer-current" | "include-history";
    authorityScope?: string;
    asOf: string;
  }
): Readonly<Record<string, unknown>>;
```

Runs local hybrid ranking with exact terms, BM25, character-trigram tolerance, graph evidence, reciprocal-rank fusion, diversity, time, authority, conflict, retention, and supersession handling. Most callers should use `compileContext`, which also applies coverage and output budgets.

## Context compilation

### `compileContext(query?, options?)`

```ts
function compileContext(
  query?: string,
  options?: {
    cwd?: string;
    maxChars?: number;
    maxTokens?: number;
    reserveTokens?: number;
    tokenEstimator?: QarinahTokenEstimator;
    reservations?: QarinahTokenReservation[];
    limit?: number;
    diversity?: number;
    supersessionPolicy?: "prefer-current" | "include-history";
    authorityScope?: string;
    minimumCoverage?: "any" | "partial" | "direct";
    asOf?: string;
    clock?: () => Date;
    rebuild?: boolean;
    updateCheckpoint?: boolean;
    inMemory?: boolean;
  }
): Promise<QarinahContextPack>;
```

Important behavior:

- `query` is limited to 4,096 characters.
- `maxChars` is 512 to 1,000,000 and is capped by workspace policy.
- `limit` is 1 to 1,000 and defaults to 20.
- `minimumCoverage` defaults to `any`.
- `partial` rejects `none`; `direct` requires a selected candidate with every normalized query term.
- `asOf` defaults to the current UTC time.
- `prefer-current` is the normal supersession policy; request `include-history` only when older evidence is intentionally needed.
- An empty pack must still fit required framing.
- An included event is kept complete where possible; the final excerpt may be shortened to honor a hard budget.
- Character accounting uses the larger of JSON and Markdown renderings.
- The returned object is deeply frozen JSON data.

```js
const pack = await compileContext("checkout idempotency", {
  cwd: process.cwd(),
  minimumCoverage: "direct",
  maxTokens: 1500,
  reserveTokens: 200,
  limit: 12
});
```

`QarinahContextPack` contains:

- `schemaVersion: "qarinah.context-pack.v2"`
- workspace ID and query
- `contentRole: "untrusted-data"`
- exact size and optional token-plan accounting
- retrieval strategy, time, coverage, filters, conflicts, and exclusions
- cited items
- truncation flag
- deterministic manifest hash

The JSON Schema is exported as `qarinah/schemas/context-pack.json`.

### `renderContextPackMarkdown(pack)`

```ts
function renderContextPackMarkdown(pack: QarinahContextPack): string;
```

Renders the same pack as cited Markdown. The output labels retrieved content as untrusted data and includes event IDs and hashes.

## Token planning

### `PORTABLE_TOKEN_ESTIMATOR`

Frozen inexact estimator:

```js
{
  id: "portable-chars-div-4",
  version: "1",
  exact: false,
  estimate(text) {
    return Math.ceil(String(text).length / 4);
  }
}
```

It is portable arithmetic, not provider tokenization or billing.

### `normalizeTokenEstimator(candidate?)`

Validates a synchronous custom estimator with lowercase `id`, version, optional `exact`, and `estimate(text)`.

### `estimateTokens(estimator, text)`

Invokes the estimator and requires a synchronous safe integer from 0 through 100,000,000.

### `createTokenBudget(options, maxChars)`

```ts
function createTokenBudget(
  options: {
    maxTokens?: number;
    reserveTokens?: number;
    tokenEstimator?: QarinahTokenEstimator;
    reservations?: QarinahTokenReservation[];
  },
  maxChars: number
): Readonly<Record<string, unknown>>;
```

Token planning is enabled when any token option is supplied. Defaults:

- `maxTokens`: `ceil(maxChars / 4)`
- reserved headroom: 10%, capped at 2,048
- at least 64 tokens remain available
- default allocations prioritize framing, then citations, then content

Custom reservations must contain `framing`, `citations`, and `content` exactly once. Each defines minimum, target, maximum, priority, and `error` or `truncate` overflow behavior.

## Project structure

### `scanProjectStructure(options?)`

```ts
function scanProjectStructure(options?: {
  cwd?: string;
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxDepth?: number;
}): Promise<QarinahProjectStructureScanResult>;
```

Records a bounded structural snapshot under the trusted root. It respects ignore rules and rejects escapes and linked-path violations. The result reports counts, snapshot identity, capture/unchanged status, and added/changed/deleted/renamed paths when available.

The associated schema is exported as `qarinah/schemas/project-structure.json`.

## OKF export

### `exportOkf(options?)`

```ts
function exportOkf(options?: {
  cwd?: string;
  output?: string;
}): Promise<QarinahOkfExportResult>;
```

Writes a deterministic Google Open Knowledge Format 0.1 Draft Markdown bundle. It refuses workspace-root replacement, `.git`, authoritative Qarinah storage, paths outside the root, linked components, and arbitrary pre-existing output. A prior output must carry a matching Qarinah ownership marker and expected manifest before replacement.

The export contract is available as `qarinah/schemas/okf-export.json`.

## Host capture adapters

### `captureCodexHook(input, options?)`

```ts
function captureCodexHook(
  input: Record<string, unknown>,
  options?: { cwd?: string }
): Promise<{
  captured: boolean;
  reason?: string;
  eventId?: string;
  hash?: string;
}>;
```

### `captureClaudeHook(input, options?)`

The Claude signature and result are identical.

Both adapters:

- accept only host-supplied lifecycle payloads;
- normalize allowlisted fields;
- obey workspace capture mode;
- never parse hidden transcript or reasoning files;
- return a non-capture reason when an input is intentionally ignored;
- fail closed on malformed recognized inputs.

Import from the narrow subpaths when only one adapter is needed:

```js
import { captureCodexHook } from "qarinah/codex";
import { captureClaudeHook } from "qarinah/claude";
```

## MCP

### `createMcpServer(options?)`

```ts
function createMcpServer(options?: {
  cwd?: string;
  write?: (message: unknown) => void;
}): QarinahMcpServer;
```

Creates an in-process JSON-RPC handler with:

```ts
interface QarinahMcpServer {
  readonly tools: readonly Readonly<Record<string, unknown>>[];
  handle(message: unknown): Promise<void>;
  close(error?: Error): void;
}
```

### `runMcpServer(options?)`

```ts
function runMcpServer(options?: {
  cwd?: string;
  input?: AsyncIterable<Uint8Array | string>;
  maximumFrameBytes?: number;
  write?: (message: unknown) => void;
}): Promise<void>;
```

Runs newline-delimited stdio transport. Default maximum frame size is 1 MiB; the accepted configured range is 1,024 through 16,777,216 bytes.

The server exposes read-only `context_status` and `context_doctor`, not context disclosure or writes. See [MCP guide](MCP-GUIDE.md).

## Maqam interoperability

Exports:

```text
MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION
MAQAM_CONTEXT_QUERY_TOOL
MAQAM_CONTEXT_APPEND_TOOL
registerMaqamContextAdapters
```

`MAQAM_CONTEXT_QUERY_TOOL` is a low-risk `read` capability named `context.query`. `MAQAM_CONTEXT_APPEND_TOOL` is a high-risk `write` capability named `context.append` and requires approval.

```ts
function registerMaqamContextAdapters<TGateway extends MaqamGuardedToolGateway>(
  options: {
    gateway: TGateway;
    cwd?: string;
    maxChars?: number;
    maxItems?: number;
  }
): {
  schemaVersion: "qarinah.maqam-context-registration.v1";
  queryToolName: "context.query";
  appendToolName: "context.append";
};
```

The gateway must provide guarded registration and exact execution verification. The active Maqam context must provide scoped evidence. A retained handler or fabricated plain context is not sufficient authority.

The structural adapter schema is exported as `qarinah/schemas/maqam-context-adapter.json`.

## Cockroach Crawler interoperability

Exports:

```text
COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION
COCKROACH_INGESTION_SCHEMA_VERSION
validateCockroachSourceRecordBoundary
cockroachSourceRecordToEventInput
cockroachSourceRecordToAcquisitionEventInput
ingestCockroachSourceRecord
```

### `validateCockroachSourceRecordBoundary(value)`

Validates the structural source-record boundary, including identity, URL, content hash, warnings, metadata, and acquisition provenance.

### Mapping functions

```ts
function cockroachSourceRecordToEventInput(
  value: unknown,
  options?: {
    capture?: "metadata" | "content";
    retentionClass?: "session" | "project" | "durable";
  }
): QarinahEventInput;

function cockroachSourceRecordToAcquisitionEventInput(
  value: unknown,
  options?: {
    capture?: "metadata" | "content";
    retentionClass?: "session" | "project" | "durable";
  }
): QarinahEventInput;
```

The first maps source revision evidence; the second maps acquisition provenance. Mapping does not append.

### `ingestCockroachSourceRecord(value, options?)`

```ts
function ingestCockroachSourceRecord(
  value: unknown,
  options?: {
    cwd?: string;
    workspace?: QarinahWorkspace;
    retentionClass?: "session" | "project" | "durable";
  }
): Promise<{
  schemaVersion: "qarinah.cockroach-ingestion.v1";
  capture: "metadata" | "content";
  revision: QarinahEvent;
  acquisition: QarinahEvent;
}>;
```

Validates and appends the paired revision and acquisition events under the active workspace capture policy.

The accepted structural record schema is exported as `qarinah/schemas/cockroach-source-record.json`.

## ProductLoop interoperability

Exports:

```text
PRODUCTLOOP_RUNTIME_EVENT_BOUNDARY_VERSION
validateProductLoopRuntimeEvent
productLoopRuntimeEventToEventInput
createProductLoopProvenanceSink
```

### `validateProductLoopRuntimeEvent(value)`

Validates run ID, sequence, timestamp, structural data, canonical JSON, receipt hash, and previous-hash continuity fields.

### `productLoopRuntimeEventToEventInput(value, options?)`

Maps one validated runtime event to a Qarinah event input without appending.

### `createProductLoopProvenanceSink(options?)`

```ts
function createProductLoopProvenanceSink(options?: {
  cwd?: string;
  workspace?: QarinahWorkspace;
}): {
  record(event: ProductLoopRuntimeEventBoundary): Promise<void>;
};
```

The sink validates per-run sequence and receipt continuity and appends mapped provenance. A new sink expects a run to begin at sequence 1.

The runtime boundary schema is exported as `qarinah/schemas/productloop-runtime-event.json`.

## Complete package export map

```text
qarinah
qarinah/codex
qarinah/claude
qarinah/mcp
qarinah/schemas/event.json
qarinah/schemas/context-pack.json
qarinah/schemas/project-structure.json
qarinah/schemas/okf-export.json
qarinah/schemas/maqam-context-adapter.json
qarinah/schemas/cockroach-source-record.json
qarinah/schemas/productloop-runtime-event.json
```

Anything outside this export map is internal and may change without becoming a public API.
