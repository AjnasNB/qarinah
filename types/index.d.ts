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
export const OKF_EXPORT_SCHEMA_VERSION: "qarinah.okf-export.v1";
export const OKF_VERSION: "0.1";
export const CONFIG_SCHEMA_VERSION: "qarinah.config.v1";
export const INDEX_SCHEMA_VERSION: "qarinah.index.v2";
export const GRAPH_SCHEMA_VERSION: "qarinah.graph.v2";
export const PROJECT_STRUCTURE_SCHEMA_VERSION: "qarinah.project-structure.v1";
export const SQLITE_READ_MODEL_SCHEMA_VERSION: 1;
export const SQLITE_READ_MODEL_FILENAME: "qarinah.db";
export const MEMORY_ATTACHMENT_SCHEMA_VERSION: "qarinah.memory-attachment.v1";
export const QARINAH_VERSION: "0.1.2";
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
export function appendEvent(input: QarinahEventInput, options?: { cwd?: string; workspace?: QarinahWorkspace; capture?: "metadata" | "content"; clock?: () => Date; randomUUID?: () => string; idempotent?: boolean }): Promise<QarinahEvent>;
export function inspectWorkspacePolicy(start?: string): Promise<QarinahCapturePolicy>;
export function approveWorkspaceTrust(start: string | undefined, expectedCapture: "metadata" | "content", expectedPolicyHash: `sha256:${string}`): Promise<{ root: string; workspaceId: string; capture: "metadata" | "content"; policyHash: `sha256:${string}`; trusted: true; eventCount: number; headHash: string | null }>;
export function readEvents(workspaceOrStart?: QarinahWorkspace | string, options?: { skipCheckpoint?: boolean; updateCheckpoint?: boolean }): Promise<QarinahEvent[]>;
export function verifyStore(start?: string, options?: { updateCheckpoint?: boolean; includeRoot?: boolean }): Promise<{ ok: true; workspaceId: string; eventCount: number; headHash: string | null; capture: string; root?: string }>;
export function rebuildDerivedState(start?: string): Promise<{ workspaceId: string; eventCount: number; headHash: string | null; readModel: Readonly<Record<string, unknown>> }>;
export function rebuildSqliteReadModel(workspace: QarinahWorkspace, events: QarinahEvent[], derived: { index: unknown; graph: unknown }): Promise<Readonly<Record<string, unknown>>>;
export function inspectSqliteReadModel(workspace: QarinahWorkspace): Promise<Readonly<Record<string, unknown>>>;
export function querySqliteReadModel(workspace: QarinahWorkspace, query: string, options?: { headHash?: string | null; limit?: number }): Promise<Readonly<{ schemaVersion: number; candidates: Array<{ eventId: string; rank: number }> }>>;
export function loadIndex(start?: string, options?: { rebuild?: boolean; updateCheckpoint?: boolean; inMemory?: boolean }): Promise<{ workspace: QarinahWorkspace; index: unknown }>;
export function buildDerivedState(events: QarinahEvent[], workspaceId: string): { index: unknown; graph: unknown };
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
  schemaVersion: "qarinah.memory-dashboard.v1";
  workspaceId: string;
  generatedAt: string;
  capture: "metadata" | "content";
  totals: Record<string, number>;
  contextSavings: {
    status: "not-measured" | "measured";
    baselineTokens: number | null;
    deliveredTokens: number | null;
    savedTokens: number | null;
    savingsPercent: number | null;
  };
  currentDecisions: Record<string, unknown>[];
  supersededDecisions: Record<string, unknown>[];
  conflicts: Record<string, unknown>[];
  citations: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  affectedFiles: Record<string, unknown>[];
}
export function buildMemoryDashboard(options?: {
  cwd?: string;
  baselineTokens?: number;
  deliveredTokens?: number;
  clock?: () => Date;
}): Promise<Readonly<QarinahMemoryDashboard>>;
export function renderMemoryDashboard(data: QarinahMemoryDashboard): string;
export function writeMemoryDashboard(options?: {
  cwd?: string;
  output?: string;
  baselineTokens?: number;
  deliveredTokens?: number;
  clock?: () => Date;
}): Promise<Readonly<{ output: string; data: QarinahMemoryDashboard }>>;
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
  allowQuery?: boolean;
  maxChars?: number;
  maxItems?: number;
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
