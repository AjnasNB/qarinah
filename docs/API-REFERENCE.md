# JavaScript and TypeScript API reference

## Git worktree identity

```ts
import { inspectGitWorktree, listGitWorktrees } from "qarinah";
```

`inspectGitWorktree(start?)` returns the canonical current checkout identity or `null` outside Git. `listGitWorktrees(start?)` returns the bounded sibling set with branch, commit, primary/linked status, and exact-root Qarinah initialization status. Remote URLs and credentials are never collected. Loaded `QarinahWorkspace` values also expose nullable `worktree` metadata derived at read time; portable workspace config remains unchanged.

Qarinah is an ESM package. The public implementation is exported from `qarinah`; host adapters and MCP also have narrow subpath exports.

```js
import {
  appendEvent,
  compileContext,
  createContextHandoffCapsule,
  initializeWorkspace,
  renderContextPackMarkdown
} from "qarinah";
```

```ts
import { captureCodexHook } from "qarinah/codex";
import { captureClaudeHook } from "qarinah/claude";
import { createMcpServer, runMcpServer } from "qarinah/mcp";
```

The declarations shipped in `types/index.d.ts`, `types/codex.d.ts`, `types/claude.d.ts`, and `types/mcp.d.ts` are the exact compile-time contract for version 0.4.0. JSON Schemas are available through package exports such as `qarinah/schemas/event.json`.

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

| Export | Value in 0.4.0 |
| --- | --- |
| `QARINAH_VERSION` | `"0.4.0"` |
| `EVENT_SCHEMA_VERSION` | `"qarinah.event.v1"` |
| `CONTEXT_PACK_SCHEMA_VERSION` | `"qarinah.context-pack.v2"` |
| `CONFIG_SCHEMA_VERSION` | `"qarinah.config.v1"` |
| `INDEX_SCHEMA_VERSION` | `"qarinah.index.v2"` |
| `GRAPH_SCHEMA_VERSION` | `"qarinah.graph.v2"` |
| `PROJECT_STRUCTURE_SCHEMA_VERSION` | `"qarinah.project-structure.v2"` |
| `AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION` | `"qarinah.agent-archive-import.v1"` |
| `AGENT_ARCHIVE_BACKUP_SCHEMA_VERSION` | `"qarinah.agent-archive-backup.v1"` |
| `CONTENT_ARCHIVE_SCHEMA_VERSION` | `"qarinah.content-archive.v1"` |
| `CONTENT_ARCHIVE_KEY_SCHEMA_VERSION` | `"qarinah.content-archive-key.v1"` |
| `MEMORY_FOOTPRINT_SCHEMA_VERSION` | `"qarinah.memory-footprint.v1"` |
| `CODING_CONTEXT_HARNESS_SCHEMA_VERSION` | `"qarinah.coding-context-harness.v1"` |
| `PROJECT_OVERVIEW_SCHEMA_VERSION` | `"qarinah.project-overview.v1"` |
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
    signal?: AbortSignal;
  }
): Promise<QarinahEvent>;
```

Appends one event under the renewable writer lock after verifying workspace trust, the log tail, the machine checkpoint, limits, capture policy, and event identity. `signal` can cancel before or while waiting for the writer lock. Cancellation is checked again immediately before the irreversible log append; after that append begins, Qarinah completes its event-ID and trust-checkpoint metadata so the ledger remains recoverable.

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
    signal?: AbortSignal;
  }
): Promise<QarinahEvent[]>;
```

Reads and verifies the bounded canonical log. Normal application reads should not skip checkpoint verification. `signal` cancels a pending checkpoint-lock wait and is checked before any checkpoint reconciliation.

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

### `rebuildDerivedState(start?, options?)`

```ts
function rebuildDerivedState(
  start?: string,
  options?: { signal?: AbortSignal }
): Promise<{
  workspaceId: string;
  eventCount: number;
  headHash: string | null;
}>;
```

Verifies the canonical record and atomically replaces deterministic graph, index, Markdown, event-ID, and SQLite projections. `signal` can cancel lock waiting and derivation before replacement starts. Once the replacement set begins, Qarinah completes it rather than intentionally leaving a partially cancelled set.

### SQLite read-model APIs

```ts
function rebuildSqliteReadModel(
  workspace: QarinahWorkspace,
  events: QarinahEvent[],
  derived: { index: unknown; graph: unknown }
): Promise<Readonly<Record<string, unknown>>>;

function inspectSqliteReadModel(
  workspace: QarinahWorkspace
): Promise<Readonly<Record<string, unknown>>>;

function querySqliteReadModel(
  workspace: QarinahWorkspace,
  query: string,
  options?: { headHash?: string | null; limit?: number }
): Promise<Readonly<{
  schemaVersion: number;
  candidates: Array<{ eventId: string; rank: number }>;
}>>;
```

The database at `.qarinah/index/qarinah.db` is a disposable read model. Rebuild verifies the hash-chained JSONL authority, derives typed tables and FTS5 rows, commits a temporary SQLite database, checkpoints WAL, and atomically replaces the previous projection. Inspect and query reject a schema, workspace, or ledger-head mismatch.

## Agent archive import, backup, and project overview

### `importAgentArchive(source, options?)`

```ts
function importAgentArchive(
  source: string,
  options?: {
    cwd?: string;
    format?: "auto" | "codex" | "claude" | "kimi" | "portable";
    mode?: "compact" | "full";
    maxBytes?: number;
    maxFiles?: number;
    maxRecords?: number;
    maxLineBytes?: number;
    rebuild?: boolean;
  }
): Promise<QarinahAgentArchiveImportResult>;
```

Streams explicit JSONL or NDJSON archive sources into the trusted workspace. Compact mode emits one cited session summary. Full mode emits separately retrievable visible messages and tool events and requires content authorization. Both modes exclude private reasoning record types, enforce resource ceilings, and use deterministic event IDs for idempotent replay.

### `backupAgentArchives(sources, destination, options?)`

```ts
function backupAgentArchives(
  sources: readonly string[],
  destination: string,
  options?: {
    cwd?: string;
    maxBytes?: number;
    maxFiles?: number;
    clock?: () => Date;
  }
): Promise<Readonly<QarinahAgentArchiveBackupResult>>;
```

Streams from 1 to 32 explicit absolute JSONL/NDJSON files or directories into a new directory beneath an existing absolute destination. It rejects linked paths and source/destination overlap, meters files and bytes before and during copying, verifies per-file SHA-256 digests, writes `manifest.json`, and optionally records a compact receipt when `cwd` identifies a trusted workspace. See [External agent-archive backup](AGENT-ARCHIVE-BACKUP.md).

## Lossless content archive

```ts
function createContentArchive(source?: string, options?: QarinahContentArchiveOptions): Promise<QarinahContentArchiveManifest>;
function listContentArchives(options?: { cwd?: string }): Promise<readonly QarinahContentArchiveManifest[]>;
function verifyContentArchive(archiveId: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<QarinahContentArchiveVerification>;
function restoreContentArchive(archiveId: string, destination: string, options?: { cwd?: string; overwrite?: boolean; signal?: AbortSignal }): Promise<QarinahContentArchiveRestoreResult>;
function deleteContentArchive(archiveId: string, options: { cwd?: string; confirmArchiveId: string }): Promise<QarinahContentArchiveDeletionResult>;
function garbageCollectContentArchive(options: { cwd?: string; confirmWorkspaceId: string }): Promise<QarinahContentArchiveGarbageCollectionResult>;
function cryptographicallyEraseContentArchiveVault(options: { cwd?: string; confirmWorkspaceId: string }): Promise<QarinahContentArchiveErasureResult>;
```

The archive is an opt-in, bounded, local content store for workspaces whose capture mode is `content`. It uses content-defined chunks, cross-manifest deduplication, conditional Brotli compression, AES-256-GCM authentication, SHA-256 identities, exact restore verification, and explicit destructive confirmations. The adjacent local key is not an OS keystore or KMS. The strict manifest contract is exported as `qarinah/schemas/content-archive.json`. See [Lossless content archive](CONTENT-ARCHIVE.md).

### `buildProjectOverview(options?)`

```ts
function buildProjectOverview(options?: {
  cwd?: string;
  maxOutcomes?: number;
}): Promise<QarinahProjectOverview>;

function renderProjectOverviewMarkdown(
  overview: QarinahProjectOverview
): string;
```

Combines verified memory counts, latest outcome identities, the latest project-structure snapshot, languages, directories, relationships, changes, and durable file locations. Rendering is deterministic and does not replace the cited source events.

### `measureMemoryFootprint(options?)`

```ts
function measureMemoryFootprint(options?: {
  cwd?: string;
  query?: string;
  maxChars?: number;
  maxTokens?: number;
  baselineTokens?: number;
  ratePerMillion?: number;
}): Promise<Readonly<QarinahMemoryFootprint>>;
```

Reports canonical authoritative-ledger characters, imported source bytes retained in compact-import receipts, current local storage bytes by view, and the manifest-bound pack delivered for one query. The automatic comparison prefers a compact-import receipt and otherwise uses the verified ledger, both with the portable `ceil(characters / 4)` estimator; a caller-supplied baseline overrides either. Cost fields are simple flat input-token arithmetic, not provider billing. See [Measure project memory](MEMORY-FOOTPRINT.md).

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
    rankingProfile?: "balanced-v1" | "admission-first-v2";
    includeFuzzy?: boolean;
    includeGraph?: boolean;
    temporalBoundary?: "inclusive" | "strict-before";
    supersessionPolicy?: "prefer-current" | "include-history";
    authorityScope?: string;
    authorityScopes?: string[];
    repositoryIds?: string[];
    asOf: string;
  }
): Readonly<Record<string, unknown>>;
```

Runs local hybrid ranking after repository, time, retention, disclosure, and supersession admission. The default `admission-first-v2` profile preserves BM25 order for admissible lexical candidates, then fills from typo-tolerant and graph evidence; authority may promote an otherwise matched record. `balanced-v1` preserves the original reciprocal-rank-fusion and diversity behavior for reproducibility. `includeFuzzy` and `includeGraph` support explicit ablations. `temporalBoundary: "strict-before"` excludes records whose timestamp equals the query checkpoint; the default inclusive mode preserves normal as-of semantics. Every v2 result includes deterministic `evidence-sufficiency-v2` diagnostics. Only `DIRECTLY_SUPPORTED` produces `decision: "ACCEPT_DIRECT"`; both partial and insufficient evidence produce `decision: "ABSTAIN"`. At the 0.65 operating point the production-bound development-v0.4 recomputation observed 10/10 static and 15/15 online direct accepts as structural-oracle positives, with zero observed direct false accepts among 49 and 31 oracle-negative cases. Exact 95% false-acceptance upper bounds remain 7.25% static and 11.22% online; this is not a universal semantic guarantee. Most callers should use `compileContext`, which also applies evidence gates and output budgets.

## Context compilation

### `runCodingContextHarness(options?)`

```ts
function runCodingContextHarness(options?: {
  cwd?: string;
  query?: string;
  scope?: "current" | "repository";
  maxChars?: number;
  maxTokens?: number;
  reserveTokens?: number;
  limit?: number;
  maxSummaryChars?: number;
  authorityScopes?: string[];
  repositoryIds?: string[];
  summarizer?: QarinahCodingContextSummarizer;
  record?: boolean;
  rebuild?: boolean;
  updateCheckpoint?: boolean;
  signal?: AbortSignal;
  clock?: () => Date;
}): Promise<QarinahCodingContextHarnessResult>;

function renderCodingContextHarnessMarkdown(
  result: QarinahCodingContextHarnessResult
): string;
```

Compiles a bounded, cited pack for the current worktree or read-only sibling inspection, measures the verified non-harness source events against the delivered pack with the portable estimator, and optionally records one idempotent checkpoint. Repository scope never combines worktree stores and rejects `record: true`; record each worktree independently.

The deterministic extractive summary requires no model. An optional host summarizer receives only the already bounded pack plus source descriptors, must be side-effect-free, and should honor the supplied abort signal. Its output is redacted, bounded, marked as lossy untrusted data, and cannot replace the cited ledger events. The result contains the scoped six-fixture 98.71% reference and the actual local estimate separately. Its strict JSON Schema is exported as `qarinah/schemas/coding-context-harness.json`. See [Coding context harness](CODING-CONTEXT-HARNESS.md).

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
    rankingProfile?: "balanced-v1" | "admission-first-v2";
    includeFuzzy?: boolean;
    includeGraph?: boolean;
    temporalBoundary?: "inclusive" | "strict-before";
    includeEvidenceSufficiency?: boolean;
    supersessionPolicy?: "prefer-current" | "include-history";
    authorityScope?: string;
    authorityScopes?: string[];
    repositoryIds?: string[];
    queryExpansion?: {
      id?: string;
      expand(input: { query: string }): string[] | Promise<string[]>;
    };
    minimumCoverage?: "any" | "partial" | "direct";
    minimumEvidence?: "any" | "partial" | "direct";
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

### `createContextHandoffCapsule(pack, events, options?)`

```ts
function createContextHandoffCapsule(
  pack: QarinahContextPack,
  events: readonly QarinahEvent[],
  options?: { eventId?: string; maxChars?: number }
): QarinahHandoffCapsule;
```

Creates a 320-4,096-character model-facing projection of a selected evidence-linked summary; the default ceiling is 512 characters. The function verifies the pack manifest, stored summary hash, workspace identity, `derived_from` source relations, and that every source ID/hash remains present in the complete pack before producing the capsule. The capsule cites the selected summary event and complete-pack manifest rather than duplicating all raw source citations. Its schema is exported as `qarinah/schemas/handoff-capsule.json`.

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

## Linked project memory

```ts
const LINKED_PROJECT_MEMORY_SCHEMA_VERSION: "qarinah.linked-project-memory.v1";
const LINKED_PROJECT_QUERY_SCHEMA_VERSION: "qarinah.linked-project-query.v1";

function buildLinkedProjectMemory(
  events: QarinahEvent[],
  workspaceId: string,
  options?: {
    asOf?: string;
    authorityScopes?: string[];
    repositoryIds?: string[];
  }
): QarinahLinkedProjectMemory;

function rankLinkedProjectMemory(
  memory: QarinahLinkedProjectMemory,
  query?: string,
  options?: {
    limit?: number;
    asOf?: string;
    types?: QarinahLinkedProjectNodeType[];
    authorityScopes?: string[];
    repositoryIds?: string[];
  }
): QarinahLinkedProjectQuery;

function loadLinkedProjectMemory(start?: string, options?: {
  rebuild?: boolean;
  persist?: boolean;
  updateCheckpoint?: boolean;
}): Promise<Readonly<{
  workspace: QarinahWorkspace;
  memory: QarinahLinkedProjectMemory;
}>>;

function queryLinkedProjectMemory(query?: string, options?: {
  cwd?: string;
  rebuild?: boolean;
  persist?: boolean;
  updateCheckpoint?: boolean;
  limit?: number;
  asOf?: string;
  types?: QarinahLinkedProjectNodeType[];
  authorityScopes?: string[];
  repositoryIds?: string[];
}): Promise<QarinahLinkedProjectQuery>;
```

The projection is derived from verified events and the latest strictly validated project-structure snapshot. Supplying `asOf`, `authorityScopes`, or `repositoryIds` to `buildLinkedProjectMemory` applies those admission boundaries before the bounded event window. `queryLinkedProjectMemory` always uses that query-local selection, so future, restricted, or other-repository events cannot consume slots that would otherwise hold admitted evidence. Ranking is deterministic and exposes its local, one-hop linked, and structural score components. Admission, temporal status, supersession, conflict, degree, concept counts, and structural importance are projected from the admitted as-of subgraph; excluded evidence cannot contribute to returned metadata or scores.

The projection carries explicit coverage for bounded event, relation, file-reference, and source-profile processing. In every query, `projectedEvents` counts admitted as-of event nodes, `omittedEvents` counts events outside the bounded source window, and `sourceEvents` is their conservative sum. `projectionComplete` is false when any event, relation, or file-reference projection was truncated. The query reports `authorityComplete: false` when a selector cannot be evaluated completely from a bounded source-profile set. A missing result is exhaustive only when both flags are `true`. `persist: false` derives and verifies the view in memory without writing its projection; `updateCheckpoint: false` also leaves the machine-local verification checkpoint unchanged. The loopback dashboard uses both options for read-only HTTP requests.

The strict contracts are exported as `qarinah/schemas/linked-project-memory.json` and `qarinah/schemas/linked-project-query.json`. See [Linked project memory](LINKED-PROJECT-MEMORY.md) for CLI examples, formula details, limits, and privacy guidance.

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
  queryPermit?: { policyHash: `sha256:${string}`; maxChars?: number; maxItems?: number };
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
  queryPermit?: { policyHash: `sha256:${string}`; maxChars?: number; maxItems?: number };
}): Promise<void>;
```

Runs newline-delimited stdio transport. Default maximum frame size is 1 MiB; the accepted configured range is 1,024 through 16,777,216 bytes.

The server always exposes zero-write `context_status` and `context_doctor`. A matching `queryPermit` adds bounded, zero-write `context.query`. It never exposes ledger writes. See [MCP guide](MCP-GUIDE.md).

## Team-memory platform APIs

### Local memory dashboard

```ts
function buildMemoryDashboard(options?: {
  cwd?: string;
  baselineTokens?: number;
  deliveredTokens?: number;
  clock?: () => Date;
}): Promise<Readonly<QarinahMemoryDashboard>>;

function renderMemoryDashboard(data: QarinahMemoryDashboard, options?: {
  live?: boolean;
  liveStatusPath?: string;
  projects?: readonly { name: string; root: string; workspaceId: string; href: string }[];
}): string;

function writeMemoryDashboard(options?: {
  cwd?: string;
  output?: string;
  baselineTokens?: number;
  deliveredTokens?: number;
  clock?: () => Date;
}): Promise<Readonly<{ output: string; data: QarinahMemoryDashboard }>>;

function serveMemoryDashboard(options?: {
  cwd?: string;
  workspaces?: readonly string[];
  port?: number;
}): Promise<Readonly<{
  url: string;
  host: "127.0.0.1";
  port: number;
  projects: readonly { name: string; root: string; workspaceId: string; href: string }[];
  close: () => Promise<void>;
}>>;
```

`buildMemoryDashboard` verifies the local ledger and returns a frozen `qarinah.memory-dashboard.v2` view without writing a file. Its workspace block identifies the real project root, workspace ID, retained repository IDs, event count, latest activity, and current ledger-head hash. `renderMemoryDashboard` turns a compatible view into self-contained HTML. `writeMemoryDashboard` writes that HTML atomically to `.qarinah/dashboard/index.html` by default. `serveMemoryDashboard` binds only to loopback and rereads one or more explicitly selected, separately authorized local projects; it does not discover or merge workspaces. Its `/api/graph/<workspace-id>` and `/api/search/<workspace-id>` routes are read-only and do not update the ledger, projection, or verification checkpoint.

The view contains workspace and capture metadata, totals, decisions with explicit reasons/outcomes/alternatives/linked tools, bounded execution flow, tool activity, major changes, explicit conflicts, source-linked events, the latest 100 permitted activity events, affected files from the latest project-structure scan, an accessible linked-memory graph, durable-record paths, and an evidence-labeled local context comparison. Live ranked search shows its exact score basis and can return admitted nodes omitted from the compact visual graph. By default, the comparison uses a retained compact-import receipt when present or canonical characters in the verified authoritative ledger, then compares that portable estimate with the generated task pack. Explicit snapshot token estimates override the automatic basis and must be supplied together. None of these functions infers provider billing or modifies the authoritative ledger; only `serveMemoryDashboard` starts a loopback HTTP server.

`writeProjectOverview(options?)` writes the deterministic beginner-readable overview to `.qarinah/records/OVERVIEW.md` by default and returns both the resolved path and typed overview. `setupWorkspace` now initializes this overview, `DECISIONS.md`, `FLOW.md`, `CHANGES.md`, SQLite, the graph, and the local dashboard in one run.

See the [local memory dashboard guide](DASHBOARD.md) for the complete interface, data lineage, examples, and sharing boundary.

The root package also exports:

```text
setupWorkspace
buildMemoryDashboard
renderMemoryDashboard
writeMemoryDashboard
serveMemoryDashboard
inspectMemoryFreshness
TASK_MEMORY_PACKS
compileTaskMemoryPack
compileFederatedContext
rerankContextPack
createTeamManifest
createEncryptedSyncBundle
decryptEncryptedSyncBundle
createSignedCheckpoint
verifySignedCheckpoint
evaluateContextQuality
createCausalReceipt
rebuildSqliteReadModel
inspectSqliteReadModel
querySqliteReadModel
createMemoryScopeAttachmentEvent
createMemoryScopeRevocationEvent
recordMemoryScopeAttachment
resolveActiveMemoryScopes
revokeMemoryScopeAttachment
```

See [Shared and verifiable team memory](TEAM-MEMORY.md) for runnable examples and authority boundaries.

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
    requireMemoryAttachment?: boolean;
    resolveMemoryAttachment?(input: {
      runId: string | null;
      agentId: string | null;
      toolName: "context.query";
    }): Promise<{
      attachmentIds: string[];
      authorityScopes: string[];
      repositoryIds: string[];
    } | null>;
  }
): {
  schemaVersion: "qarinah.maqam-context-registration.v1";
  queryToolName: "context.query";
  appendToolName: "context.append";
};
```

The gateway must provide guarded registration and exact execution verification. The active Maqam context must provide scoped evidence. With `requireMemoryAttachment`, the host resolves temporary scopes and repositories for the exact run and agent; query input has no field that can widen those permissions. A retained handler, fabricated plain context, expired attachment, revoked attachment, or missing required attachment is not sufficient authority.

The structural adapter schema is exported as `qarinah/schemas/maqam-context-adapter.json`.

## Cockroach Browser interoperability

Exports:

```text
COCKROACH_BROWSER_MEMORY_SCHEMA_VERSION
validateCockroachBrowserMemoryOutcome
cockroachBrowserMemoryOutcomeToEventInput
appendCockroachBrowserOutcome
createCockroachBrowserMemorySink
```

### `validateCockroachBrowserMemoryOutcome(value)`

Validates and snapshots one `cockroach.browser-memory.v1` value under Qarinah's bounded receiving contract. A valid durable outcome needs at least one evidence ID. Secret-bearing metadata keys are recursively omitted and recognized secret strings are redacted.

### `cockroachBrowserMemoryOutcomeToEventInput(value, options?)`

```ts
function cockroachBrowserMemoryOutcomeToEventInput(
  value: unknown,
  options?: {
    retentionClass?: "session" | "project" | "durable";
  }
): QarinahEventInput;
```

Maps one cited outcome to an untrusted metadata-only event input without appending. The result grants no browser authority and contains only opaque evidence references, hashes, coarse content summaries, and bounded operational metadata.

### `appendCockroachBrowserOutcome(value, options?)`

```ts
function appendCockroachBrowserOutcome(
  value: unknown,
  options?: {
    cwd?: string;
    workspace?: QarinahWorkspace;
  }
): Promise<QarinahEvent>;
```

Reloads current machine-local workspace trust, appends the reviewed metadata projection, and treats exact replay as idempotent. An uncited direct append is rejected; a divergent replay at the same receipt-backed identity fails with `EVENT_ID_CONFLICT`.

### `createCockroachBrowserMemorySink(options?)`

```ts
function createCockroachBrowserMemorySink(options?: {
  cwd?: string;
  workspace?: QarinahWorkspace;
}): {
  appendBrowserOutcome(value: unknown): Promise<void>;
};
```

Returns the passive sink shape accepted by the public Cockroach Browser Qarinah recorder. The sink ignores uncited lifecycle notifications and forwards cited outcomes to the trusted metadata-only append path. It cannot create a session, inspect browser state, execute an action, or grant approval.

The receiving schema is exported as `qarinah/schemas/cockroach-browser-memory.json`.

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
qarinah/schemas/cockroach-browser-memory.json
qarinah/schemas/cockroach-source-record.json
qarinah/schemas/productloop-runtime-event.json
```

Anything outside this export map is internal and may change without becoming a public API.
