export type QarinahEventKind =
  | "session.started" | "prompt.submitted" | "tool.requested" | "tool.completed"
  | "turn.completed" | "compaction.started" | "compaction.completed" | "artifact"
  | "source" | "claim" | "decision" | "approval" | "summary"
  | "memory.scope.attached" | "memory.scope.revoked" | "context.pack.compiled";
export type QarinahConfidence = "extracted" | "inferred" | "claimed" | "verified";
export type QarinahRelationType =
  | "derived_from" | "produced" | "changed" | "supports" | "contradicts"
  | "supersedes" | "authorized_by" | "governed_by" | "affects" | "references";

export interface QarinahRelation { type: QarinahRelationType; target: string }
export interface QarinahActor { type: "human" | "agent" | "tool" | "system" | "source"; id: string }
export interface QarinahAuthority {
  scope: string;
  rank: number;
  assignedBy: string;
  assignedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  basis: string;
}
export interface QarinahTemporal { validFrom?: string; validUntil?: string | null }
export interface QarinahRepository { id: string; branch?: string; commit?: string }
export interface QarinahFreshness {
  files?: Array<{ path: string; hash: `sha256:${string}` }>;
  dependencies?: Array<{ name: string; version?: string; hash: `sha256:${string}` }>;
}
export interface QarinahDisclosure {
  scopes: string[];
  classification: "public" | "workspace" | "restricted";
}
export interface QarinahEventInput {
  eventId?: string;
  timestamp?: string;
  sessionId?: string | null;
  turnId?: string | null;
  kind: QarinahEventKind;
  actor?: QarinahActor;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  confidence?: QarinahConfidence;
  authority?: QarinahAuthority;
  temporal?: QarinahTemporal;
  repository?: QarinahRepository;
  freshness?: QarinahFreshness;
  disclosure?: QarinahDisclosure;
  relations?: QarinahRelation[];
  provenance?: { adapter?: string; sourceId?: string | null; contentHash?: string };
  retention?: { class?: "session" | "project" | "durable"; expiresAt?: string | null };
}
export interface QarinahEvent extends Required<Omit<QarinahEventInput, "provenance" | "retention" | "authority" | "temporal" | "repository" | "freshness" | "disclosure">> {
  schemaVersion: "qarinah.event.v1";
  workspaceId: string;
  authority?: QarinahAuthority;
  temporal?: QarinahTemporal;
  repository?: QarinahRepository;
  freshness?: QarinahFreshness;
  disclosure?: QarinahDisclosure;
  provenance: { adapter: string; sourceId: string | null; contentHash: string };
  retention: { class: "session" | "project" | "durable"; expiresAt: string | null };
  previousHash: string | null;
  hash: string;
}
export interface QarinahConfig {
  schemaVersion: "qarinah.config.v1";
  workspaceId: string;
  enabled: boolean;
  capture: "metadata" | "content";
  maxEventBytes: number;
  maxLogBytes: number;
  contextMaxChars: number;
  retentionClass: "session" | "project" | "durable";
  createdAt: string;
}
export interface QarinahCheckpoint { eventCount: number; headHash: string | null; logBytes: number; eventIdIndexHash: string | null; updatedAt: string }
export interface QarinahConsent {
  schemaVersion: "qarinah.trust.v2";
  root: string;
  workspaceId: string;
  enabled: boolean;
  capture: "metadata" | "content";
  maxEventBytes: number;
  maxLogBytes: number;
  contextMaxChars: number;
  retentionClass: "session" | "project" | "durable";
  policyHash: `sha256:${string}`;
  grantedAt: string;
  checkpoint: QarinahCheckpoint;
}
export interface QarinahCapturePolicy {
  schemaVersion: "qarinah.capture-policy.v1";
  root: string;
  workspaceId: string;
  enabled: boolean;
  capture: "metadata" | "content";
  maxEventBytes: number;
  maxLogBytes: number;
  contextMaxChars: number;
  retentionClass: "session" | "project" | "durable";
  policyHash: `sha256:${string}`;
}
export interface QarinahWorkspace { root: string; qarinahDir: string; config: QarinahConfig; configPath: string; consent: QarinahConsent | null }
export interface QarinahContextItem {
  eventId: string; kind: string; timestamp: string; title: string; excerpt: string;
  confidence: QarinahConfidence; authority?: QarinahAuthority; temporal?: QarinahTemporal;
  repository?: QarinahRepository; disclosure?: QarinahDisclosure; reason: string; hash: string;
}
export interface QarinahTokenEstimator {
  id: string;
  version: string;
  exact?: boolean;
  estimate(text: string): number;
}
export interface QarinahTokenReservation {
  name: "framing" | "citations" | "content";
  minimum: number;
  target: number;
  maximum: number;
  priority: number;
  overflow: "error" | "truncate";
}
export interface QarinahContextPack {
  schemaVersion: "qarinah.context-pack.v2";
  workspaceId: string;
  query: string;
  contentRole: "untrusted-data";
  budget: {
    maxChars: number;
    usedChars: number;
    estimatedTokens: number;
    maxTokens?: number;
    usedTokens?: number;
    reservedTokens?: number;
    availableTokens?: number;
    estimator?: { id: string; version: string; exact: boolean };
    allocations?: { framing: number; citations: number; content: number };
    reservationPolicyHash?: string;
  };
  retrieval: {
    strategy: "hybrid-local-v1" | "admission-first-hybrid-v2";
    rankingProfile?: "balanced-v1" | "admission-first-v2";
    temporalBoundary?: "inclusive" | "strict-before";
    supersessionPolicy: "prefer-current" | "include-history";
    asOf: string;
    authorityScope?: string;
    authorityScopes?: string[];
    repositoryIds?: string[];
    readModel?: "sqlite-fts5" | "verified-ledger-memory";
    queryExpansion?: { adapter: string; addedTermCount: number };
    coverage: {
      method: "query-term-overlap-v1";
      status: "no-query" | "none" | "partial" | "direct";
      queryTermCount: number;
      bestExactTermCount: number;
      bestExactTermRatio: number;
      directCandidateCount: number;
      warning?: string;
    };
    evidenceSufficiency?: {
      method: "evidence-sufficiency-v2";
      state: "DIRECTLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "INSUFFICIENT_EVIDENCE";
      decision: "ACCEPT_DIRECT" | "ABSTAIN";
      score: number;
      directThreshold: number;
      partialThreshold: number;
      bestExactTermRatio: number;
      topLexicalScore: number;
      lexicalScoreMargin: number;
      supportingCandidateCount: number;
      codeEntityCount: number;
      matchedCodeEntityCount: number;
      codeEntityCoverage: number;
      reasonCodes: string[];
    };
    filters?: { expired: number; future: number; notYetValid: number; stale: number; unauthorized: number };
    conflicts?: Array<{ eventIds: [string, string] }>;
    exclusions?: Array<{ eventId: string; reason: "superseded"; by: string[] }>;
  };
  items: QarinahContextItem[];
  truncated: boolean;
  manifestHash: string;
}
export interface QarinahHandoffCapsule {
  schemaVersion: "qarinah.handoff-capsule.v1";
  contentRole: "untrusted-data";
  eventId: string;
  eventHash: string;
  packManifestHash: string;
  confidence: QarinahConfidence;
  sourceEventCount: number;
  truncated: boolean;
  budget: {
    maxChars: number;
    usedChars: number;
    estimatedTokens: number;
    estimator: { id: "portable-chars-div-4"; version: "1"; exact: false };
  };
  text: string;
}
export interface QarinahOkfExportResult {
  readonly schemaVersion: "qarinah.okf-export.v1";
  readonly okfVersion: "0.1";
  readonly derived: true;
  readonly source: ".qarinah/events/events.jsonl";
  readonly workspaceId: string;
  readonly eventCount: number;
  readonly headHash: string | null;
  readonly bundleHash: string;
  readonly fileCount: number;
  readonly outputDirectory: string;
}

export class QarinahError extends Error { code: string; details?: unknown }
export const EVENT_SCHEMA_VERSION: "qarinah.event.v1";
export const CONTEXT_PACK_SCHEMA_VERSION: "qarinah.context-pack.v2";
export const HANDOFF_CAPSULE_SCHEMA_VERSION: "qarinah.handoff-capsule.v1";
export const OKF_EXPORT_SCHEMA_VERSION: "qarinah.okf-export.v1";
export const OKF_VERSION: "0.1";
export const CONFIG_SCHEMA_VERSION: "qarinah.config.v1";
export const INDEX_SCHEMA_VERSION: "qarinah.index.v2";
export const GRAPH_SCHEMA_VERSION: "qarinah.graph.v2";
export const LINKED_PROJECT_MEMORY_SCHEMA_VERSION: "qarinah.linked-project-memory.v1";
export const LINKED_PROJECT_QUERY_SCHEMA_VERSION: "qarinah.linked-project-query.v1";
export const PROJECT_STRUCTURE_SCHEMA_VERSION: "qarinah.project-structure.v1";
export const SQLITE_READ_MODEL_SCHEMA_VERSION: 1;
export const SQLITE_READ_MODEL_FILENAME: "qarinah.db";
export const MEMORY_ATTACHMENT_SCHEMA_VERSION: "qarinah.memory-attachment.v1";
export const QARINAH_VERSION: "0.1.9";
export const EVENT_KINDS: readonly QarinahEventKind[];
export const RELATION_TYPES: readonly QarinahRelationType[];
export function initializeWorkspace(target?: string, options?: { capture?: "metadata" | "content" }): Promise<QarinahWorkspace>;
export function findWorkspaceRoot(start?: string): Promise<string | null>;
export function loadWorkspace(start?: string, options?: { allowDisabled?: boolean; skipConsent?: boolean }): Promise<QarinahWorkspace>;
export function setWorkspaceEnabled(start: string | undefined, enabled: boolean): Promise<QarinahConfig>;
export function revokeWorkspaceTrust(start?: string): Promise<{ root: string; workspaceId: string | null; trusted: false }>;
export function resolveWithin(root: string, ...segments: string[]): string;
export function secureStoragePath(workspace: QarinahWorkspace, segments: string[], options?: { allowMissing?: boolean; type?: "file" | "directory" }): Promise<string>;
export function createEventEnvelope(input: QarinahEventInput, options: { workspaceId: string; previousHash?: string | null; maximumEventBytes?: number; clock?: () => Date; randomUUID?: () => string }): QarinahEvent;
export function validateStoredEvent(value: unknown, options?: { expectedPreviousHash?: string | null; workspaceId?: string; maximumEventBytes?: number }): QarinahEvent;
export function appendEvent(input: QarinahEventInput, options?: { cwd?: string; workspace?: QarinahWorkspace; capture?: "metadata" | "content"; clock?: () => Date; randomUUID?: () => string; idempotent?: boolean; signal?: AbortSignal }): Promise<QarinahEvent>;
export function inspectWorkspacePolicy(start?: string): Promise<QarinahCapturePolicy>;
export function approveWorkspaceTrust(start: string | undefined, expectedCapture: "metadata" | "content", expectedPolicyHash: `sha256:${string}`): Promise<{ root: string; workspaceId: string; capture: "metadata" | "content"; policyHash: `sha256:${string}`; trusted: true; eventCount: number; headHash: string | null }>;
export function readEvents(workspaceOrStart?: QarinahWorkspace | string, options?: { skipCheckpoint?: boolean; updateCheckpoint?: boolean; signal?: AbortSignal }): Promise<QarinahEvent[]>;
export function verifyStore(start?: string, options?: { updateCheckpoint?: boolean; includeRoot?: boolean }): Promise<{ ok: true; workspaceId: string; eventCount: number; headHash: string | null; capture: string; root?: string }>;
export function rebuildDerivedState(start?: string, options?: { signal?: AbortSignal }): Promise<{ workspaceId: string; eventCount: number; headHash: string | null; linkedMemory: Readonly<Record<string, number>>; readModel: Readonly<Record<string, unknown>> }>;
export function rebuildSqliteReadModel(workspace: QarinahWorkspace, events: QarinahEvent[], derived: { index: unknown; graph: unknown }): Promise<Readonly<Record<string, unknown>>>;
export function inspectSqliteReadModel(workspace: QarinahWorkspace): Promise<Readonly<Record<string, unknown>>>;
export function querySqliteReadModel(workspace: QarinahWorkspace, query: string, options?: { headHash?: string | null; limit?: number }): Promise<Readonly<{ schemaVersion: number; candidates: Array<{ eventId: string; rank: number }> }>>;
export function loadIndex(start?: string, options?: { rebuild?: boolean; updateCheckpoint?: boolean; inMemory?: boolean }): Promise<{ workspace: QarinahWorkspace; index: unknown }>;
export function buildDerivedState(events: QarinahEvent[], workspaceId: string): { index: unknown; graph: unknown; linkedMemory: QarinahLinkedProjectMemory };
export function tokenize(value: unknown): string[];
export function compileContext(query?: string, options?: {
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
  queryExpansion?: { id?: string; expand(input: { query: string }): string[] | Promise<string[]> };
  minimumCoverage?: "any" | "partial" | "direct";
  minimumEvidence?: "any" | "partial" | "direct";
  asOf?: string;
  clock?: () => Date;
  rebuild?: boolean;
  updateCheckpoint?: boolean;
  inMemory?: boolean;
}): Promise<QarinahContextPack>;
export function renderContextPackMarkdown(pack: QarinahContextPack): string;
export function createContextHandoffCapsule(
  pack: QarinahContextPack,
  events: readonly QarinahEvent[],
  options?: { eventId?: string; maxChars?: number }
): Readonly<QarinahHandoffCapsule>;
export interface QarinahProjectStructureChanges {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
  readonly renamed: readonly { readonly from: string; readonly to: string; readonly contentHash: string }[];
}
export interface QarinahProjectStructureScanResult {
  readonly captured: boolean;
  readonly unchanged: boolean;
  readonly eventId: string;
  readonly hash?: string;
  readonly snapshotHash: string;
  readonly fileCount: number;
  readonly directoryCount: number;
  readonly changes?: QarinahProjectStructureChanges;
}
export function scanProjectStructure(options?: {
  cwd?: string;
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxDepth?: number;
}): Promise<QarinahProjectStructureScanResult>;
export interface QarinahAgentArchiveImportResult {
  readonly schemaVersion: "qarinah.agent-archive-import.v1";
  readonly mode: "compact" | "full";
  readonly formats: readonly ("codex" | "claude" | "kimi" | "portable")[];
  readonly filesRead: number;
  readonly sourceBytes: number;
  readonly recordsSeen: number;
  readonly visibleItems: number;
  readonly ignoredRecords: number;
  readonly sessions: number;
  readonly importedEvents: number;
  readonly derived: Readonly<Record<string, unknown>> | null;
}
export const AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION: "qarinah.agent-archive-import.v1";
export function importAgentArchive(source: string, options?: {
  cwd?: string;
  format?: "auto" | "codex" | "claude" | "kimi" | "portable";
  mode?: "compact" | "full";
  maxBytes?: number;
  maxFiles?: number;
  maxRecords?: number;
  maxLineBytes?: number;
  rebuild?: boolean;
}): Promise<QarinahAgentArchiveImportResult>;
export const AGENT_ARCHIVE_BACKUP_SCHEMA_VERSION: "qarinah.agent-archive-backup.v1";
export interface QarinahAgentArchiveBackupResult {
  readonly schemaVersion: "qarinah.agent-archive-backup.v1";
  readonly destination: string;
  readonly manifest: string;
  readonly manifestHash: string;
  readonly sourceCount: number;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly eventId: string | null;
}
export function backupAgentArchives(
  sources: readonly string[],
  destination: string,
  options?: {
    cwd?: string;
    maxBytes?: number;
    maxFiles?: number;
    clock?: () => Date;
  }
): Promise<Readonly<QarinahAgentArchiveBackupResult>>;
export const MEMORY_FOOTPRINT_SCHEMA_VERSION: "qarinah.memory-footprint.v1";
export interface QarinahMemoryFootprint {
  readonly schemaVersion: "qarinah.memory-footprint.v1";
  readonly workspaceId: string;
  readonly query: string;
  readonly retained: Readonly<{
    eventCount: number;
    ledgerCharacters: number;
    ledgerEstimatedTokens: number | null;
    importedSourceBytes: number;
    importedSourceBytesKnown: boolean;
    storageBytes: Readonly<Record<"ledger" | "sqlite" | "graph" | "index" | "context" | "overview" | "decisions" | "flow" | "changes" | "dashboard" | "total", number>>;
  }>;
  readonly deliveredPack: Readonly<{
    itemCount: number;
    usedChars: number;
    estimatedTokens: number;
    renderedBytes: number;
    manifestHash: string;
  }>;
  readonly comparison: Readonly<{
    status: "not-measured" | "measured";
    source: "caller-supplied" | "portable-chars-div-4-from-compact-import-receipts" | "portable-chars-div-4-from-authoritative-ledger" | "not-measured";
    baselineTokens: number | null;
    deliveredTokens: number;
    savedTokens: number | null;
    reductionPercent: number | null;
    baselineToPackRatio: number | null;
    costs: null | Readonly<{
      ratePerMillion: number;
      baseline: number;
      delivered: number;
      estimatedSaving: number;
    }>;
  }>;
  readonly boundaries: Readonly<Record<string, string>>;
}
export function measureMemoryFootprint(options?: {
  cwd?: string;
  query?: string;
  maxChars?: number;
  maxTokens?: number;
  baselineTokens?: number;
  ratePerMillion?: number;
  inMemory?: boolean;
  updateCheckpoint?: boolean;
}): Promise<Readonly<QarinahMemoryFootprint>>;
export interface QarinahProjectOverview {
  readonly schemaVersion: "qarinah.project-overview.v1";
  readonly workspaceId: string;
  readonly generatedFrom: Readonly<Record<string, unknown>>;
  readonly memory: Readonly<{
    sessions: number;
    prompts: number;
    toolRequests: number;
    toolOutcomes: number;
    completedTurns: number;
    decisions: number;
    summaries: number;
    approvals: number;
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
  }>;
  readonly codebase: Readonly<Record<string, unknown>>;
  readonly recentOutcomes: readonly Readonly<Record<string, unknown>>[];
  readonly durableFiles: Readonly<Record<string, string>>;
}
export const PROJECT_OVERVIEW_SCHEMA_VERSION: "qarinah.project-overview.v1";
export function buildProjectOverview(options?: { cwd?: string; maxOutcomes?: number }): Promise<QarinahProjectOverview>;
export function renderProjectOverviewMarkdown(overview: QarinahProjectOverview): string;
export function writeProjectOverview(options?: {
  cwd?: string;
  output?: string;
  maxOutcomes?: number;
}): Promise<Readonly<{ output: string; overview: QarinahProjectOverview }>>;
export interface QarinahProjectRecordViews {
  readonly schemaVersion: "qarinah.project-record-views.v1";
  readonly workspaceId: string;
  readonly generatedFrom: Readonly<{ eventCount: number; headHash: string | null }>;
  readonly decisions: readonly Readonly<{
    eventId: string;
    hash: string;
    timestamp: string;
    sourceId: string | null;
    title: string;
    status: "current" | "superseded";
    reason: string;
    outcome: string;
    alternatives: readonly string[];
    affected: readonly string[];
    tools: readonly Readonly<Record<string, unknown>>[];
  }>[];
  readonly flow: readonly Readonly<Record<string, unknown>>[];
  readonly majorChanges: readonly Readonly<Record<string, unknown>>[];
  readonly projectChanges: null | Readonly<{
    eventId: string;
    hash: string;
    snapshotHash: string;
    added: readonly string[];
    changed: readonly string[];
    deleted: readonly string[];
    renamed: readonly Readonly<{ from: string; to: string; contentHash: string | null }>[];
  }>;
  readonly limits: Readonly<{ decisions: number; flowSteps: number; majorChanges: number }>;
}
export const PROJECT_RECORD_VIEWS_SCHEMA_VERSION: "qarinah.project-record-views.v1";
export function buildProjectRecordViews(events: readonly QarinahEvent[], workspaceId: string): QarinahProjectRecordViews;
export function renderDecisionsMarkdown(view: QarinahProjectRecordViews): string;
export function renderFlowMarkdown(view: QarinahProjectRecordViews): string;
export function renderChangesMarkdown(view: QarinahProjectRecordViews): string;
export function renderProjectRecordViews(view: QarinahProjectRecordViews): Readonly<{
  decisions: string;
  flow: string;
  changes: string;
}>;
export function exportOkf(options?: { cwd?: string; output?: string }): Promise<QarinahOkfExportResult>;
export const PORTABLE_TOKEN_ESTIMATOR: Readonly<QarinahTokenEstimator & { exact: false }>;
export function normalizeTokenEstimator(candidate?: QarinahTokenEstimator): Readonly<QarinahTokenEstimator & { exact: boolean }>;
export function estimateTokens(estimator: QarinahTokenEstimator, text: string): number;
export function createTokenBudget(options: {
  maxTokens?: number;
  reserveTokens?: number;
  tokenEstimator?: QarinahTokenEstimator;
  reservations?: QarinahTokenReservation[];
}, maxChars: number): Readonly<Record<string, unknown>>;
export const TASK_MEMORY_PACKS: Readonly<Record<
  "debugging" | "code-review" | "feature-implementation" | "database-migration"
  | "incident-response" | "release-preparation" | "security-review",
  Readonly<{ label: string; focus: string; minimumCoverage: "partial" }>
>>;
export function compileTaskMemoryPack(
  task: keyof typeof TASK_MEMORY_PACKS,
  query?: string,
  options?: Parameters<typeof compileContext>[1]
): Promise<Readonly<{
  schemaVersion: "qarinah.task-memory-pack.v1";
  task: keyof typeof TASK_MEMORY_PACKS;
  label: string;
  requestedQuery: string;
  pack: QarinahContextPack;
}>>;
export function rerankContextPack(
  pack: QarinahContextPack,
  options?: {
    adapter?: null | {
      id?: string;
      score(input: {
        query: string;
        candidates: readonly { eventId: string; title: string; excerpt: string }[];
      }): Promise<Record<string, number>> | Record<string, number>;
    };
  }
): Promise<QarinahContextPack & {
  semanticRerank?: { adapter: string; candidateCount: number; scoredCount: number; authority: "rerank-only" };
}>;
export type QarinahLinkedProjectNodeType = "memory" | "file" | "directory" | "concept" | "reference";
export interface QarinahLinkedProjectSourceProfile {
  readonly sourceNodeId: string;
  readonly sourceEventId: string | null;
  readonly evidenceHash: `sha256:${string}` | null;
  readonly contentHash: `sha256:${string}` | null;
  readonly classification: "public" | "workspace" | "restricted" | "derived";
  readonly disclosureScopes: readonly string[];
  readonly repositoryId: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly expiresAt: string | null;
}
export interface QarinahLinkedProjectNode {
  readonly id: string;
  readonly type: QarinahLinkedProjectNodeType;
  readonly kind: string;
  readonly label: string;
  readonly path: string | null;
  readonly language: string | null;
  readonly timestamp: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly expiresAt: string | null;
  readonly confidence: QarinahConfidence;
  readonly status: "current" | "superseded";
  readonly supersededBy: readonly string[];
  readonly conflicted: boolean;
  readonly repositoryId: string | null;
  readonly disclosureScopes: readonly string[];
  readonly classification: "public" | "workspace" | "restricted" | "derived";
  readonly sourceProfiles: readonly QarinahLinkedProjectSourceProfile[];
  readonly sourceProfileCount?: number;
  readonly sourceProfilesTruncated?: boolean;
  readonly sourceEventId: string | null;
  readonly evidenceHash: `sha256:${string}` | null;
  readonly contentHash: `sha256:${string}` | null;
  readonly documentFrequency?: number;
  readonly terms: readonly Readonly<{ term: string; count: number }>[];
  readonly signature: readonly Readonly<{ term: string; weight: number }>[];
  readonly importance: number;
  readonly repositoryRank: number;
  readonly incoming: number;
  readonly outgoing: number;
}
export interface QarinahLinkedProjectEdge {
  readonly source: string;
  readonly type: string;
  readonly target: string;
  readonly sourceEventId: string | null;
  readonly evidenceHash: `sha256:${string}` | null;
  readonly confidence: QarinahConfidence;
  readonly weight: number;
  readonly occurrenceCount: number;
}
export interface QarinahLinkedProjectMemory {
  readonly schemaVersion: "qarinah.linked-project-memory.v1";
  readonly workspaceId: string;
  readonly eventCount: number;
  readonly headHash: `sha256:${string}` | null;
  readonly source: Readonly<{
    ledger: ".qarinah/events/events.jsonl";
    projectSnapshotHash: `sha256:${string}` | null;
    projectSourceEventId: string | null;
  }>;
  readonly coverage: Readonly<{
    sourceEvents: number;
    projectedEvents: number;
    omittedEvents: number;
    sourceRelations: number;
    projectedRelations: number;
    omittedRelations: number;
    sourceFileReferences: number;
    projectedFileReferences: number;
    omittedFileReferences: number;
    complete: boolean;
  }>;
  readonly statistics: Readonly<Record<"nodes" | "edges" | "memories" | "files" | "directories" | "concepts" | "conflicts" | "superseded", number>>;
  readonly timeline: readonly string[];
  readonly repositoryMap: Readonly<{
    method: "bounded-link-rank-v1";
    iterations: 24;
    damping: 0.85;
    entries: readonly Readonly<{
      id: string;
      path: string;
      language: string;
      contentHash: `sha256:${string}` | null;
      rank: number;
      incoming: number;
      outgoing: number;
      dependencies: readonly string[];
      dependents: readonly string[];
    }>[];
    entrypoints: readonly string[];
  }>;
  readonly nodes: readonly QarinahLinkedProjectNode[];
  readonly edges: readonly QarinahLinkedProjectEdge[];
  readonly manifestHash: `sha256:${string}`;
}
export interface QarinahLinkedProjectQuery {
  readonly schemaVersion: "qarinah.linked-project-query.v1";
  readonly workspaceId: string;
  readonly sourceManifestHash: `sha256:${string}`;
  readonly sourceHeadHash: `sha256:${string}` | null;
  readonly query: string;
  readonly asOf: string;
  readonly requestedTypes: readonly QarinahLinkedProjectNodeType[];
  readonly authorityScopes: readonly string[];
  readonly repositoryIds: readonly string[];
  readonly filters: Readonly<{ excluded: number }>;
  readonly coverage: Readonly<{
    queryTerms: readonly string[];
    matchedTerms: readonly string[];
    ratio: number;
    status: "browse" | "direct" | "partial" | "none";
    sourceEvents: number;
    projectedEvents: number;
    omittedEvents: number;
    projectionComplete: boolean;
    authorityComplete: boolean;
  }>;
  readonly items: readonly Readonly<{
    rank: number;
    score: number;
    basis: Readonly<{
      localSemantic: number;
      linkedEvidence: number;
      structuralImportance: number;
      formula: string;
    }>;
    node: QarinahLinkedProjectNode;
    statusAtAsOf: "current" | "superseded";
    evidence: Readonly<{
      sourceEventId: string | null;
      hash: `sha256:${string}` | null;
      contentHash: `sha256:${string}` | null;
    }>;
    neighbors: readonly string[];
  }>[];
  readonly manifestHash: `sha256:${string}`;
}
export function buildLinkedProjectMemory(events: QarinahEvent[], workspaceId: string, options?: {
  asOf?: string;
  authorityScopes?: string[];
  repositoryIds?: string[];
}): QarinahLinkedProjectMemory;
export function loadLinkedProjectMemory(start?: string, options?: {
  rebuild?: boolean;
  persist?: boolean;
  updateCheckpoint?: boolean;
}): Promise<Readonly<{ workspace: QarinahWorkspace; memory: QarinahLinkedProjectMemory }>>;
export function rankLinkedProjectMemory(memory: QarinahLinkedProjectMemory, query?: string, options?: {
  limit?: number;
  asOf?: string;
  types?: QarinahLinkedProjectNodeType[];
  authorityScopes?: string[];
  repositoryIds?: string[];
}): QarinahLinkedProjectQuery;
export function queryLinkedProjectMemory(query?: string, options?: {
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
export function compileFederatedContext(query: string, options: {
  workspaces: Array<{
    cwd: string;
    authority: string;
    repositoryId?: string;
    authorityScopes?: string[];
    maxChars?: number;
    limit?: number;
  }>;
  relationships?: Array<{
    from: string;
    to: string;
    type: "depends_on" | "documents" | "deploys" | "shares_contract" | "owned_by" | "references";
  }>;
  maxChars?: number;
  limit?: number;
  minimumCoverage?: "any" | "partial" | "direct";
  rebuild?: boolean;
  updateCheckpoint?: boolean;
}): Promise<Readonly<{
  schemaVersion: "qarinah.federated-context.v1";
  query: string;
  authorityBoundary: "separate-packs";
  workspaces: Array<{ authority: string; repositoryId: string; workspaceId: string; pack: QarinahContextPack }>;
  repositoryGraph: Array<{ from: string; to: string; type: string }>;
  manifestHash: string;
}>>;
export interface QarinahFreshnessReport {
  schemaVersion: "qarinah.memory-freshness.v1";
  workspaceId: string;
  status: "unavailable" | "current" | "stale";
  snapshotEventId: string | null;
  snapshotHash?: string | null;
  counts: { current: number; changed: number; missing: number; unsafe: number; unverified: number };
  files: Array<{
    path: string;
    status: "current" | "changed" | "missing" | "unsafe";
    expectedHash: string;
    observedHash?: string | null;
    reason?: string;
  }>;
  dependencies: Array<{
    name: string;
    version?: string | null;
    status: "current" | "changed" | "missing" | "unverified";
    expectedHash: string;
    observedHash: string | null;
    eventId: string;
  }>;
  staleEventIds: string[];
}
export function inspectMemoryFreshness(options?: {
  cwd?: string;
  paths?: string[];
  dependencyResolver?: (input: { name: string; version?: string | null; repository?: QarinahRepository | null }) =>
    string | null | Promise<string | null>;
}): Promise<Readonly<QarinahFreshnessReport>>;

export interface QarinahMemoryAttachment {
  schemaVersion: "qarinah.memory-attachment.v1";
  attachmentId: string;
  agentId: string;
  runId: string | null;
  scopes: string[];
  repositories: string[];
  attachedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  assignedBy: string;
}
export function createMemoryScopeAttachmentEvent(input: Omit<QarinahMemoryAttachment, "schemaVersion" | "attachmentId" | "revokedAt"> & { attachmentId?: string; revokedAt?: null }): QarinahEventInput;
export function createMemoryScopeRevocationEvent(input: Omit<QarinahMemoryAttachment, "schemaVersion" | "revokedAt"> & { revokedAt?: string }): QarinahEventInput;
export function recordMemoryScopeAttachment(input: Parameters<typeof createMemoryScopeAttachmentEvent>[0], options?: { cwd?: string }): Promise<QarinahEvent>;
export function revokeMemoryScopeAttachment(input: Parameters<typeof createMemoryScopeRevocationEvent>[0], options?: { cwd?: string }): Promise<QarinahEvent>;
export function resolveActiveMemoryScopes(options: {
  cwd?: string;
  agentId: string;
  runId?: string | null;
  asOf?: string;
  required?: boolean;
}): Promise<Readonly<{
  schemaVersion: "qarinah.memory-attachment.v1";
  workspaceId: string;
  agentId: string;
  runId: string | null;
  asOf: string;
  attachmentIds: string[];
  scopes: string[];
  repositories: string[];
}>>;
export interface QarinahTeamManifest {
  schemaVersion: "qarinah.team-manifest.v1";
  workspaceId: string;
  teamId: string;
  members: Array<{ id: string; role: "owner" | "maintainer" | "reader"; publicKey: string | null }>;
  github: { organization: string; repository: string } | null;
  manifestHash: string;
}
export function createTeamManifest(input: {
  workspaceId: string;
  teamId: string;
  members: Array<{ id: string; role: "owner" | "maintainer" | "reader"; publicKey?: string }>;
  github?: { organization: string; repository: string } | null;
}): Readonly<QarinahTeamManifest>;
export function createEncryptedSyncBundle(options: {
  cwd?: string;
  manifest: Parameters<typeof createTeamManifest>[0];
  memberId: string;
  key: Uint8Array;
}): Promise<Readonly<Record<string, unknown>>>;
export function decryptEncryptedSyncBundle(
  bundle: Record<string, unknown>,
  options: {
    manifest: Parameters<typeof createTeamManifest>[0];
    memberId: string;
    key: Uint8Array;
  }
): Readonly<Record<string, unknown>>;
export function createSignedCheckpoint(options: {
  cwd?: string;
  signer: string;
  privateKey: string | object;
  clock?: () => Date;
}): Promise<Readonly<Record<string, unknown>>>;
export function verifySignedCheckpoint(checkpoint: Record<string, unknown>, publicKey?: string): boolean;
export function createCausalReceipt(input: Record<
  "evidence" | "memory" | "policy" | "execution" | "observation",
  { id: string; hash: `sha256:${string}`; system: string; timestamp: string }
>): Readonly<Record<string, unknown>>;
export interface QarinahMemoryDashboard {
  schemaVersion: "qarinah.memory-dashboard.v2";
  workspaceId: string;
  workspace: Readonly<{
    name: string;
    root: string;
    workspaceId: string;
    repositoryIds: readonly string[];
    ledgerPath: ".qarinah/events/events.jsonl";
    ledgerHeadHash: `sha256:${string}` | null;
    ledgerBytes: number;
    lastActivityAt: string | null;
    eventCount: number;
  }>;
  generatedAt: string;
  capture: "metadata" | "content";
  totals: Record<string, number>;
  contextSavings: {
    status: "not-measured" | "measured";
    source: "caller-supplied" | "portable-chars-div-4-from-compact-import-receipts" | "portable-chars-div-4-from-authoritative-ledger" | "not-measured";
    baselineTokens: number | null;
    deliveredTokens: number | null;
    savedTokens: number | null;
    savingsPercent: number | null;
    baselineToPackRatio: number | null;
  };
  memoryFootprint: QarinahMemoryFootprint;
  currentDecisions: Record<string, unknown>[];
  supersededDecisions: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  executionFlow: Record<string, unknown>[];
  majorChanges: Record<string, unknown>[];
  latestProjectChanges: Record<string, unknown> | null;
  durableRecords: Readonly<{
    decisions: ".qarinah/records/DECISIONS.md";
    flow: ".qarinah/records/FLOW.md";
    changes: ".qarinah/records/CHANGES.md";
  }>;
  conflicts: Record<string, unknown>[];
  citations: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  affectedFiles: Record<string, unknown>[];
  linkedGraph: Readonly<{
    schemaVersion: "qarinah.linked-project-memory.v1";
    manifestHash: `sha256:${string}`;
    statistics: Readonly<Record<string, number>>;
    nodes: readonly Readonly<{
      id: string;
      type: QarinahLinkedProjectNodeType;
      kind: string;
      label: string;
      path: string | null;
      timestamp: string | null;
      confidence: QarinahConfidence;
      status: "current" | "superseded";
      conflicted: boolean;
      importance: number;
      repositoryRank: number;
      incoming: number;
      outgoing: number;
      sourceEventId: string | null;
      evidenceHash: `sha256:${string}` | null;
      contentHash: `sha256:${string}` | null;
      terms: readonly string[];
    }>[];
    edges: readonly QarinahLinkedProjectEdge[];
  }>;
}
export function buildMemoryDashboard(options?: {
  cwd?: string;
  baselineTokens?: number;
  deliveredTokens?: number;
  clock?: () => Date;
}): Promise<Readonly<QarinahMemoryDashboard>>;
export function renderMemoryDashboard(data: QarinahMemoryDashboard, options?: {
  live?: boolean;
  liveStatusPath?: string;
  projects?: readonly Readonly<{ name: string; root: string; workspaceId: string; href: string }>[];
}): string;
export function writeMemoryDashboard(options?: {
  cwd?: string;
  output?: string;
  baselineTokens?: number;
  deliveredTokens?: number;
  clock?: () => Date;
}): Promise<Readonly<{ output: string; data: QarinahMemoryDashboard }>>;
export function serveMemoryDashboard(options?: {
  cwd?: string;
  workspaces?: readonly string[];
  port?: number;
}): Promise<Readonly<{
  url: string;
  host: "127.0.0.1";
  port: number;
  projects: readonly Readonly<{ name: string; root: string; workspaceId: string; href: string }>[];
  close: () => Promise<void>;
}>>;
export interface QarinahContextEvaluationCase {
  id?: string;
  requiredDecisionIds?: string[];
  recalledDecisionIds?: string[];
  returnedCitationIds?: string[];
  validCitationIds?: string[];
  expectedStaleIds?: string[];
  rejectedStaleIds?: string[];
  expectedConflictIds?: string[];
  detectedConflictIds?: string[];
  expectedSupersededIds?: string[];
  resolvedSupersededIds?: string[];
  crossRepositoryAttemptIds?: string[];
  rejectedCrossRepositoryIds?: string[];
  expectedUnauthorizedIds?: string[];
  rejectedUnauthorizedIds?: string[];
  baselineContextTokens?: number;
  contextTokensSupplied?: number;
  taskCompleted?: boolean;
  repeatedMistakeExpected?: boolean;
  repeatedMistakeAvoided?: boolean;
  latencyMs?: number;
  baselineCost?: number;
  actualCost?: number;
}
export function evaluateContextQuality(cases: QarinahContextEvaluationCase[]): Readonly<{
  schemaVersion: "qarinah.context-quality-evaluation.v1";
  caseCount: number;
  metrics: Readonly<{
    decisionRecall: number | null;
    citationAccuracy: number | null;
    staleContextRejection: number | null;
    conflictDetection: number | null;
    supersessionCorrectness: number | null;
    crossRepositoryIsolation: number | null;
    unauthorizedDisclosureRejection: number | null;
    contextTokensSupplied: number;
    contextTokenReduction: number | null;
    taskCompletionQuality: number;
    repeatedMistakePrevention: number | null;
    meanLatencyMs: number;
    costPerCompletedTask: number | null;
    netCostPerCompletedTask: number | null;
    costReduction: number | null;
  }>;
  totals: Readonly<Record<string, number>>;
  cases: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;
export function setupWorkspace(options?: {
  cwd?: string;
  capture?: "metadata" | "content";
  codex?: boolean;
  claude?: boolean;
  cursor?: boolean;
  kimi?: boolean;
  antigravity?: boolean;
  allowQuery?: boolean;
  maxChars?: number;
  maxItems?: number;
  backupSources?: string[];
  backupDestination?: string;
  backupMaxBytes?: number;
  backupMaxFiles?: number;
}): Promise<Readonly<Record<string, unknown>>>;
export function rankContextEvents(index: unknown, query: string | undefined, options: {
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
  sqliteCandidates?: Array<{ eventId: string; rank: number }>;
  asOf: string;
}): Readonly<Record<string, unknown>>;
export interface QarinahContextAdmission {
  readonly asOf: string;
  readonly temporalBoundary: "inclusive" | "strict-before";
  readonly authorityScopes: readonly string[];
  readonly repositoryIds: readonly string[];
  readonly eligibleEventIds: readonly string[];
  readonly excludedEventIds: readonly string[];
  readonly exclusions: readonly Readonly<{
    eventId: string;
    reasons: readonly ("expired" | "future" | "not-yet-valid" | "stale" | "disclosure" | "repository")[];
  }>[];
  readonly filters: Readonly<{
    expired: number;
    future: number;
    notYetValid: number;
    stale: number;
    unauthorized: number;
  }>;
}
export function resolveContextAdmission(index: unknown, options: {
  temporalBoundary?: "inclusive" | "strict-before";
  authorityScope?: string;
  authorityScopes?: readonly string[];
  repositoryIds?: readonly string[];
  asOf: string;
}): QarinahContextAdmission;
export interface QarinahCurrentContextState {
  readonly asOf: string;
  readonly supersessionPolicy: "prefer-current" | "include-history";
  readonly policyEligibleEventIds: readonly string[];
  readonly orderedEventIds: readonly string[];
  readonly eligibleEventIds: readonly string[];
  readonly excludedEventIds: readonly string[];
  readonly exclusions: readonly Readonly<{ eventId: string; reason: "superseded"; by: readonly string[] }>[];
}
export function resolveCurrentContextState(index: unknown, orderedEventIds: readonly string[], options: {
  asOf: string;
  query?: string;
  supersessionPolicy?: "prefer-current" | "include-history";
  policyEligibleEventIds: readonly string[];
}): QarinahCurrentContextState;
export function captureCodexHook(input: Record<string, unknown>, options?: { cwd?: string }): Promise<{ captured: boolean; reason?: string; eventId?: string; hash?: string }>;
export function captureClaudeHook(input: Record<string, unknown>, options?: { cwd?: string }): Promise<{ captured: boolean; reason?: string; eventId?: string; hash?: string }>;
export interface QarinahMcpServer {
  readonly tools: readonly Readonly<Record<string, unknown>>[];
  handle(message: unknown): Promise<void>;
  close(error?: Error): void;
}
export function createMcpServer(options?: {
  cwd?: string;
  write?: (message: unknown) => void;
  queryPermit?: { workspaceId: `ws_${string}`; policyHash: `sha256:${string}`; maxChars?: number; maxItems?: number };
}): QarinahMcpServer;
export function runMcpServer(options?: {
  cwd?: string;
  input?: AsyncIterable<Uint8Array | string>;
  maximumFrameBytes?: number;
  write?: (message: unknown) => void;
  queryPermit?: { workspaceId: `ws_${string}`; policyHash: `sha256:${string}`; maxChars?: number; maxItems?: number };
}): Promise<void>;

export interface MaqamContextToolDescriptor {
  readonly schemaVersion: "qarinah.maqam-context-adapter.v1";
  readonly name: "context.query" | "context.append";
  readonly transport: "function";
  readonly description: string;
  readonly effects: readonly ("read" | "write")[];
  readonly networkOrigins: readonly [];
  readonly risk: "low" | "high";
  readonly approvalRequired: boolean;
}
export interface MaqamAdapterExecutionContext {
  readonly runId?: string;
  readonly agentId?: string;
  readonly toolName?: string;
  readonly limits?: Readonly<Record<string, unknown>> | null;
  readonly goal?: Readonly<{ budget?: Readonly<Record<string, unknown>> | null }> | null;
  readonly evidence?: {
    addBatch(input?: {
      evidence?: Array<{
        sourceType?: string;
        source?: string;
        retrievedAt?: string;
        excerpt?: string;
        hash?: string;
        confidence?: number;
      }>;
      claims?: Array<Record<string, unknown>>;
    }): { readonly evidence: readonly unknown[] };
  } | null;
}
export type MaqamStructuralJson = string | number | boolean | null | MaqamStructuralJson[] | { [key: string]: MaqamStructuralJson };
export interface MaqamGuardedExecutionReceipt {
  readonly schemaVersion: "maqam.tool-execution.v1";
  readonly toolName: string;
  readonly runId: string;
  readonly inputHash: string;
  readonly decision: Readonly<Record<string, unknown>>;
  readonly approvalIds: readonly string[];
  readonly approvalActions: readonly string[];
}
export interface MaqamExecutionVerifier {
  requireExecution(input: unknown, context: MaqamAdapterExecutionContext): MaqamGuardedExecutionReceipt;
}
export interface MaqamGuardedToolGateway {
  registerGuardedTool<TInput = unknown, TOutput = unknown>(
    name: string,
    factory: (
      verifier: MaqamExecutionVerifier
    ) => (input: TInput, context: MaqamAdapterExecutionContext) => TOutput | Promise<TOutput>,
    metadata?: Readonly<Record<string, unknown>>
  ): unknown;
}
export interface MaqamContextQueryInput { query?: string; maxChars?: number; maxItems?: number }
export interface MaqamContextQueryResult {
  readonly schemaVersion: "qarinah.maqam-context-query-result.v1";
  readonly pack: QarinahContextPack;
  readonly evidence: readonly unknown[];
}
export interface MaqamContextAppendInput { event: QarinahEventInput; capture?: "metadata" | "content" }
export interface MaqamContextAppendResult {
  readonly schemaVersion: "qarinah.maqam-context-append-result.v1";
  readonly capture: "metadata" | "content";
  readonly event: QarinahEvent;
  readonly evidence: unknown;
}
export interface MaqamContextRegistrationOptions<TGateway extends MaqamGuardedToolGateway = MaqamGuardedToolGateway> {
  gateway: TGateway;
  cwd?: string;
  maxChars?: number;
  maxItems?: number;
  requireMemoryAttachment?: boolean;
  resolveMemoryAttachment?(input: { runId: string | null; agentId: string | null; toolName: "context.query" }):
    | { attachmentIds?: string[]; scopes?: string[]; repositories?: string[] }
    | null
    | Promise<{ attachmentIds?: string[]; scopes?: string[]; repositories?: string[] } | null>;
}
export interface MaqamContextRegistration {
  readonly schemaVersion: "qarinah.maqam-context-registration.v1";
  readonly queryToolName: "context.query";
  readonly appendToolName: "context.append";
}
export const MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION: "qarinah.maqam-context-adapter.v1";
export const MAQAM_CONTEXT_QUERY_TOOL: MaqamContextToolDescriptor & Readonly<{ name: "context.query"; effects: readonly ["read"]; risk: "low"; approvalRequired: false }>;
export const MAQAM_CONTEXT_APPEND_TOOL: MaqamContextToolDescriptor & Readonly<{ name: "context.append"; effects: readonly ["write"]; risk: "high"; approvalRequired: true }>;
export function registerMaqamContextAdapters<TGateway extends MaqamGuardedToolGateway>(options: MaqamContextRegistrationOptions<TGateway>): MaqamContextRegistration;

export type CockroachBrowserMemoryJsonValue =
  | string
  | number
  | boolean
  | null
  | CockroachBrowserMemoryJsonValue[]
  | { [key: string]: CockroachBrowserMemoryJsonValue };
export interface CockroachBrowserMemoryOutcomeBoundary {
  readonly schemaVersion: "cockroach.browser-memory.v1";
  readonly type: string;
  readonly sessionId: string;
  readonly actor?: string;
  readonly purpose: string;
  readonly timestamp: string;
  readonly inputDigest?: `sha256:${string}`;
  readonly outputDigest?: `sha256:${string}`;
  readonly evidenceIds: readonly string[];
  readonly receiptHash?: `sha256:${string}`;
  readonly metadata: Readonly<Record<string, CockroachBrowserMemoryJsonValue>>;
}
export interface CockroachBrowserMemorySink {
  appendBrowserOutcome(value: unknown): Promise<void>;
}
export interface CockroachBrowserMemoryOptions {
  cwd?: string;
  workspace?: QarinahWorkspace;
}
export const COCKROACH_BROWSER_MEMORY_SCHEMA_VERSION: "cockroach.browser-memory.v1";
export function validateCockroachBrowserMemoryOutcome(value: unknown): CockroachBrowserMemoryOutcomeBoundary;
export function cockroachBrowserMemoryOutcomeToEventInput(value: unknown, options?: {
  retentionClass?: "session" | "project" | "durable";
}): QarinahEventInput;
export function appendCockroachBrowserOutcome(
  value: unknown,
  options?: CockroachBrowserMemoryOptions
): Promise<QarinahEvent>;
export function createCockroachBrowserMemorySink(
  options?: CockroachBrowserMemoryOptions
): CockroachBrowserMemorySink;

export interface CockroachSourceProvenanceBoundary {
  readonly retrievedAt: string;
  readonly method: string;
  readonly authenticated: boolean;
  readonly credentialed: boolean;
}
export interface CockroachSourceRecordBoundary {
  readonly source: string;
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly url: string;
  readonly text: string;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly contentHash: `sha256:${string}`;
  readonly adapterVersion: string;
  readonly warnings: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly provenance: CockroachSourceProvenanceBoundary;
}
export interface CockroachIngestionOptions {
  cwd?: string;
  workspace?: QarinahWorkspace;
  retentionClass?: "session" | "project" | "durable";
}
export interface CockroachEventMappingOptions {
  capture?: "metadata" | "content";
  retentionClass?: "session" | "project" | "durable";
}
export interface CockroachIngestionResult {
  readonly schemaVersion: "qarinah.cockroach-ingestion.v1";
  readonly capture: "metadata" | "content";
  readonly revision: QarinahEvent;
  readonly acquisition: QarinahEvent;
}
export const COCKROACH_SOURCE_RECORD_BOUNDARY_VERSION: "cockroach-crawler.source-record.structural.v1";
export const COCKROACH_INGESTION_SCHEMA_VERSION: "qarinah.cockroach-ingestion.v1";
export function validateCockroachSourceRecordBoundary(value: unknown): CockroachSourceRecordBoundary;
export function cockroachSourceRecordToEventInput(value: unknown, options?: CockroachEventMappingOptions): QarinahEventInput;
export function cockroachSourceRecordToAcquisitionEventInput(value: unknown, options?: CockroachEventMappingOptions): QarinahEventInput;
export function ingestCockroachSourceRecord(value: unknown, options?: CockroachIngestionOptions): Promise<CockroachIngestionResult>;

export type ProductLoopJsonValue = string | number | boolean | null | ProductLoopJsonValue[] | { [key: string]: ProductLoopJsonValue };
export interface ProductLoopRuntimeEventBoundary {
  readonly runId: string;
  readonly sequence: number;
  readonly type: string;
  readonly timestamp: string;
  readonly data: Readonly<Record<string, ProductLoopJsonValue>>;
  readonly receipt: Readonly<{
    eventHash: string;
    previousHash: string | null;
    canonicalJson: string;
  }>;
}
export interface ProductLoopProvenanceSink {
  record(event: ProductLoopRuntimeEventBoundary): Promise<void>;
}
export const PRODUCTLOOP_RUNTIME_EVENT_BOUNDARY_VERSION: "ajnas-runtime.runtime-event.structural.v0.2.1";
export function validateProductLoopRuntimeEvent(value: unknown): ProductLoopRuntimeEventBoundary;
export function productLoopRuntimeEventToEventInput(value: unknown, options?: {
  capture?: "metadata" | "content";
  retentionClass?: "session" | "project" | "durable";
}): QarinahEventInput;
export function createProductLoopProvenanceSink(options?: { cwd?: string; workspace?: QarinahWorkspace }): ProductLoopProvenanceSink;
