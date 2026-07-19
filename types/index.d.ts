export type QarinahEventKind =
  | "session.started" | "prompt.submitted" | "tool.requested" | "tool.completed"
  | "turn.completed" | "compaction.started" | "compaction.completed" | "artifact"
  | "source" | "claim" | "decision" | "approval" | "summary";
export type QarinahConfidence = "extracted" | "inferred" | "claimed" | "verified";
export type QarinahRelationType =
  | "derived_from" | "produced" | "changed" | "supports" | "contradicts"
  | "supersedes" | "authorized_by" | "governed_by" | "affects" | "references";

export interface QarinahRelation { type: QarinahRelationType; target: string }
export interface QarinahActor { type: "human" | "agent" | "tool" | "system" | "source"; id: string }
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
  relations?: QarinahRelation[];
  provenance?: { adapter?: string; sourceId?: string | null; contentHash?: string };
  retention?: { class?: "session" | "project" | "durable"; expiresAt?: string | null };
}
export interface QarinahEvent extends Required<Omit<QarinahEventInput, "provenance" | "retention">> {
  schemaVersion: "qarinah.event.v1";
  workspaceId: string;
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
  schemaVersion: "qarinah.trust.v1";
  root: string;
  workspaceId: string;
  capture: "metadata" | "content";
  grantedAt: string;
  checkpoint: QarinahCheckpoint;
}
export interface QarinahWorkspace { root: string; qarinahDir: string; config: QarinahConfig; configPath: string; consent: QarinahConsent | null }
export interface QarinahContextItem {
  eventId: string; kind: string; timestamp: string; title: string; excerpt: string;
  confidence: QarinahConfidence; reason: string; hash: string;
}
export interface QarinahContextPack {
  schemaVersion: "qarinah.context-pack.v1";
  workspaceId: string;
  query: string;
  budget: { maxChars: number; usedChars: number; estimatedTokens: number };
  items: QarinahContextItem[];
  truncated: boolean;
  manifestHash: string;
}

export class QarinahError extends Error { code: string; details?: unknown }
export const EVENT_SCHEMA_VERSION: "qarinah.event.v1";
export const CONTEXT_PACK_SCHEMA_VERSION: "qarinah.context-pack.v1";
export const CONFIG_SCHEMA_VERSION: "qarinah.config.v1";
export const INDEX_SCHEMA_VERSION: "qarinah.index.v1";
export const GRAPH_SCHEMA_VERSION: "qarinah.graph.v1";
export const QARINAH_VERSION: "0.1.0-alpha.0";
export const EVENT_KINDS: readonly QarinahEventKind[];
export const RELATION_TYPES: readonly QarinahRelationType[];
export function initializeWorkspace(target?: string, options?: { capture?: "metadata" | "content" }): Promise<QarinahWorkspace>;
export function findWorkspaceRoot(start?: string): Promise<string | null>;
export function loadWorkspace(start?: string, options?: { allowDisabled?: boolean; skipConsent?: boolean }): Promise<QarinahWorkspace>;
export function setWorkspaceEnabled(start: string | undefined, enabled: boolean): Promise<QarinahConfig>;
export function revokeWorkspaceTrust(start?: string): Promise<{ root: string; workspaceId: string; trusted: false }>;
export function resolveWithin(root: string, ...segments: string[]): string;
export function secureStoragePath(workspace: QarinahWorkspace, segments: string[], options?: { allowMissing?: boolean; type?: "file" | "directory" }): Promise<string>;
export function createEventEnvelope(input: QarinahEventInput, options: { workspaceId: string; previousHash?: string | null; maximumEventBytes?: number; clock?: () => Date; randomUUID?: () => string }): QarinahEvent;
export function validateStoredEvent(value: unknown, options?: { expectedPreviousHash?: string | null; workspaceId?: string; maximumEventBytes?: number }): QarinahEvent;
export function appendEvent(input: QarinahEventInput, options?: { cwd?: string; workspace?: QarinahWorkspace; clock?: () => Date; randomUUID?: () => string; idempotent?: boolean }): Promise<QarinahEvent>;
export function approveWorkspaceTrust(start: string | undefined, expectedCapture: "metadata" | "content"): Promise<{ root: string; workspaceId: string; capture: "metadata" | "content"; trusted: true; eventCount: number; headHash: string | null }>;
export function readEvents(workspaceOrStart?: QarinahWorkspace | string, options?: { skipCheckpoint?: boolean; updateCheckpoint?: boolean }): Promise<QarinahEvent[]>;
export function verifyStore(start?: string, options?: { updateCheckpoint?: boolean; includeRoot?: boolean }): Promise<{ ok: true; workspaceId: string; eventCount: number; headHash: string | null; capture: string; root?: string }>;
export function rebuildDerivedState(start?: string): Promise<{ workspaceId: string; eventCount: number; headHash: string | null }>;
export function loadIndex(start?: string, options?: { rebuild?: boolean; updateCheckpoint?: boolean; inMemory?: boolean }): Promise<{ workspace: QarinahWorkspace; index: unknown }>;
export function buildDerivedState(events: QarinahEvent[], workspaceId: string): { index: unknown; graph: unknown };
export function tokenize(value: unknown): string[];
export function compileContext(query?: string, options?: { cwd?: string; maxChars?: number; limit?: number; rebuild?: boolean; updateCheckpoint?: boolean; inMemory?: boolean }): Promise<QarinahContextPack>;
export function renderContextPackMarkdown(pack: QarinahContextPack): string;
export function captureCodexHook(input: Record<string, unknown>, options?: { cwd?: string }): Promise<{ captured: boolean; reason?: string; eventId?: string; hash?: string }>;
export function captureClaudeHook(input: Record<string, unknown>, options?: { cwd?: string }): Promise<{ captured: boolean; reason?: string; eventId?: string; hash?: string }>;
export interface QarinahMcpServer {
  readonly tools: readonly Readonly<Record<string, unknown>>[];
  handle(message: unknown): Promise<void>;
  close(error?: Error): void;
}
export function createMcpServer(options?: { cwd?: string; write?: (message: unknown) => void }): QarinahMcpServer;
export function runMcpServer(options?: {
  cwd?: string;
  input?: AsyncIterable<Uint8Array | string>;
  maximumFrameBytes?: number;
  write?: (message: unknown) => void;
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
