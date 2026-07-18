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
export interface QarinahCheckpoint { eventCount: number; headHash: string | null; logBytes: number; updatedAt: string }
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
export function readEvents(workspaceOrStart?: QarinahWorkspace | string): Promise<QarinahEvent[]>;
export function verifyStore(start?: string): Promise<{ ok: true; workspaceId: string; eventCount: number; headHash: string | null; capture: string; root: string }>;
export function rebuildDerivedState(start?: string): Promise<{ workspaceId: string; eventCount: number; headHash: string | null }>;
export function loadIndex(start?: string, options?: { rebuild?: boolean }): Promise<{ workspace: QarinahWorkspace; index: unknown }>;
export function buildDerivedState(events: QarinahEvent[], workspaceId: string): { index: unknown; graph: unknown };
export function tokenize(value: unknown): string[];
export function compileContext(query?: string, options?: { cwd?: string; maxChars?: number; limit?: number }): Promise<QarinahContextPack>;
export function renderContextPackMarkdown(pack: QarinahContextPack): string;
export function captureCodexHook(input: Record<string, unknown>, options?: { cwd?: string }): Promise<{ captured: boolean; reason?: string; eventId?: string; hash?: string }>;
