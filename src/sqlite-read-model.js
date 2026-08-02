import { randomBytes } from "node:crypto";
import { rm, rename } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { canonicalStringify, deepFreezeJson } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { secureStoragePath } from "./workspace.js";

export const SQLITE_READ_MODEL_SCHEMA_VERSION = 1;
export const SQLITE_READ_MODEL_FILENAME = "qarinah.db";

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA trusted_schema = OFF;
  CREATE TABLE read_model_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
  CREATE TABLE read_model_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT NOT NULL
  ) STRICT;
  CREATE TABLE events (
    event_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data_json TEXT NOT NULL,
    confidence TEXT NOT NULL,
    authority_scope TEXT,
    repository_id TEXT,
    valid_from TEXT NOT NULL,
    valid_until TEXT,
    event_hash TEXT NOT NULL UNIQUE
  ) STRICT;
  CREATE TABLE nodes (
    node_id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL,
    source_event_id TEXT,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE edges (
    source_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    source_event_id TEXT,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (source_id, edge_type, target_id, source_event_id)
  ) STRICT;
  CREATE TABLE citations (
    event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    source_id TEXT,
    adapter TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    PRIMARY KEY (event_id, content_hash)
  ) STRICT;
  CREATE TABLE documents (
    document_id TEXT PRIMARY KEY,
    repository_id TEXT,
    path TEXT NOT NULL,
    content_hash TEXT,
    source_event_id TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE sources (
    source_id TEXT PRIMARY KEY,
    adapter TEXT NOT NULL,
    latest_event_id TEXT NOT NULL,
    content_hash TEXT NOT NULL
  ) STRICT;
  CREATE TABLE decisions (
    event_id TEXT PRIMARY KEY REFERENCES events(event_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('current', 'superseded')),
    valid_from TEXT NOT NULL,
    valid_until TEXT
  ) STRICT;
  CREATE TABLE conflicts (
    left_event_id TEXT NOT NULL,
    right_event_id TEXT NOT NULL,
    detected_by_event_id TEXT NOT NULL,
    PRIMARY KEY (left_event_id, right_event_id, detected_by_event_id)
  ) STRICT;
  CREATE TABLE supersessions (
    superseding_event_id TEXT NOT NULL,
    superseded_event_id TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    PRIMARY KEY (superseding_event_id, superseded_event_id)
  ) STRICT;
  CREATE TABLE freshness (
    event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('file', 'dependency')),
    subject_id TEXT NOT NULL,
    expected_hash TEXT NOT NULL,
    branch TEXT,
    commit_id TEXT,
    PRIMARY KEY (event_id, subject_type, subject_id)
  ) STRICT;
  CREATE TABLE context_packs (
    manifest_hash TEXT PRIMARY KEY,
    event_id TEXT,
    query_text TEXT NOT NULL,
    compiled_at TEXT NOT NULL,
    as_of TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE context_pack_items (
    manifest_hash TEXT NOT NULL REFERENCES context_packs(manifest_hash) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY (manifest_hash, event_id)
  ) STRICT;
  CREATE TABLE agent_disclosures (
    attachment_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    run_id TEXT,
    scopes_json TEXT NOT NULL,
    repositories_json TEXT NOT NULL,
    attached_at TEXT NOT NULL,
    expires_at TEXT,
    revoked_at TEXT,
    assigned_by TEXT NOT NULL,
    source_event_id TEXT NOT NULL
  ) STRICT;
  CREATE TABLE sync_outbox (
    event_id TEXT PRIMARY KEY,
    queued_at TEXT NOT NULL,
    destination TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'failed')),
    payload_hash TEXT NOT NULL
  ) STRICT;
  CREATE VIRTUAL TABLE events_fts USING fts5(
    event_id UNINDEXED,
    title,
    body,
    data_text,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE INDEX events_temporal_idx ON events(valid_from, valid_until);
  CREATE INDEX events_repository_idx ON events(repository_id, timestamp);
  CREATE INDEX edges_target_idx ON edges(target_id, edge_type);
  CREATE INDEX freshness_subject_idx ON freshness(subject_type, subject_id);
`;

function primitiveDataText(value, output = [], depth = 0) {
  if (depth > 4 || output.length >= 512) return output;
  if (value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    output.push(String(value).slice(0, 4_096));
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 128)) primitiveDataText(entry, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value).slice(0, 128)) {
      output.push(key);
      primitiveDataText(entry, output, depth + 1);
    }
  }
  return output;
}

function canonical(value) {
  return canonicalStringify(value ?? null);
}

function normalizedPair(left, right) {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left];
}

function insertEvents(database, events) {
  const insertEvent = database.prepare(`INSERT INTO events (
    event_id, workspace_id, timestamp, kind, title, body, data_json, confidence,
    authority_scope, repository_id, valid_from, valid_until, event_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertFts = database.prepare("INSERT INTO events_fts(event_id, title, body, data_text) VALUES (?, ?, ?, ?)");
  const insertCitation = database.prepare("INSERT INTO citations(event_id, source_id, adapter, content_hash) VALUES (?, ?, ?, ?)");
  const insertSource = database.prepare(`INSERT INTO sources(source_id, adapter, latest_event_id, content_hash)
    VALUES (?, ?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET
      adapter = excluded.adapter, latest_event_id = excluded.latest_event_id, content_hash = excluded.content_hash`);
  const insertDecision = database.prepare("INSERT INTO decisions(event_id, status, valid_from, valid_until) VALUES (?, ?, ?, ?)");
  const insertFreshness = database.prepare(`INSERT INTO freshness(
    event_id, subject_type, subject_id, expected_hash, branch, commit_id
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertDisclosure = database.prepare(`INSERT INTO agent_disclosures(
    attachment_id, agent_id, run_id, scopes_json, repositories_json, attached_at, expires_at,
    revoked_at, assigned_by, source_event_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(attachment_id) DO UPDATE SET
    agent_id = excluded.agent_id, run_id = excluded.run_id, scopes_json = excluded.scopes_json,
    repositories_json = excluded.repositories_json, expires_at = excluded.expires_at,
    revoked_at = COALESCE(excluded.revoked_at, agent_disclosures.revoked_at),
    assigned_by = excluded.assigned_by, source_event_id = excluded.source_event_id`);
  const insertPack = database.prepare(`INSERT OR REPLACE INTO context_packs(
    manifest_hash, event_id, query_text, compiled_at, as_of, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertPackItem = database.prepare("INSERT OR REPLACE INTO context_pack_items(manifest_hash, event_id, rank) VALUES (?, ?, ?)");

  for (const event of events) {
    const validFrom = event.temporal?.validFrom ?? event.timestamp;
    const validUntil = event.temporal?.validUntil ?? null;
    insertEvent.run(
      event.eventId, event.workspaceId, event.timestamp, event.kind, event.title, event.body,
      canonical(event.data), event.confidence, event.authority?.scope ?? null,
      event.repository?.id ?? null, validFrom, validUntil, event.hash
    );
    insertFts.run(event.eventId, event.title, event.body, primitiveDataText(event.data).join("\n"));
    insertCitation.run(event.eventId, event.provenance.sourceId, event.provenance.adapter, event.provenance.contentHash);
    if (event.provenance.sourceId) {
      insertSource.run(event.provenance.sourceId, event.provenance.adapter, event.eventId, event.provenance.contentHash);
    }
    if (event.kind === "decision") insertDecision.run(event.eventId, "current", validFrom, validUntil);
    for (const file of event.freshness?.files ?? []) {
      insertFreshness.run(event.eventId, "file", file.path, file.hash, event.repository?.branch ?? null, event.repository?.commit ?? null);
    }
    for (const dependency of event.freshness?.dependencies ?? []) {
      insertFreshness.run(event.eventId, "dependency", dependency.name, dependency.hash, event.repository?.branch ?? null, event.repository?.commit ?? null);
    }
    const disclosure = event.data?.memoryAttachment;
    if (["memory.scope.attached", "memory.scope.revoked"].includes(event.kind)
      && disclosure && typeof disclosure === "object") {
      insertDisclosure.run(
        disclosure.attachmentId, disclosure.agentId, disclosure.runId ?? null, canonical(disclosure.scopes ?? []),
        canonical(disclosure.repositories ?? []), disclosure.attachedAt ?? event.timestamp,
        disclosure.expiresAt ?? null,
        event.kind === "memory.scope.revoked" ? (disclosure.revokedAt ?? event.timestamp) : null,
        disclosure.assignedBy ?? event.actor.id,
        event.eventId
      );
    }
    const pack = event.data?.contextPack;
    if (event.kind === "context.pack.compiled" && pack?.manifestHash) {
      insertPack.run(
        pack.manifestHash, event.eventId, pack.query ?? "", event.timestamp,
        pack.asOf ?? event.timestamp, canonical(pack)
      );
      for (const [rank, item] of (pack.items ?? []).entries()) {
        if (typeof item?.eventId === "string") insertPackItem.run(pack.manifestHash, item.eventId, rank + 1);
      }
    }
  }
}

function insertGraph(database, graph, eventsById) {
  const insertNode = database.prepare("INSERT INTO nodes(node_id, node_type, source_event_id, payload_json) VALUES (?, ?, ?, ?)");
  const insertEdge = database.prepare("INSERT INTO edges(source_id, edge_type, target_id, source_event_id, payload_json) VALUES (?, ?, ?, ?, ?)");
  const insertConflict = database.prepare("INSERT OR IGNORE INTO conflicts(left_event_id, right_event_id, detected_by_event_id) VALUES (?, ?, ?)");
  const insertSupersession = database.prepare("INSERT OR IGNORE INTO supersessions(superseding_event_id, superseded_event_id, effective_at) VALUES (?, ?, ?)");
  const markSuperseded = database.prepare("UPDATE decisions SET status = 'superseded', valid_until = COALESCE(valid_until, ?) WHERE event_id = ?");
  const insertDocument = database.prepare(`INSERT OR REPLACE INTO documents(
    document_id, repository_id, path, content_hash, source_event_id, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?)`);

  for (const node of graph.nodes) {
    insertNode.run(node.id, node.type, node.sourceEventId ?? null, canonical(node));
    if (node.type === "project.file" && node.sourceEventId) {
      const source = eventsById.get(node.sourceEventId);
      insertDocument.run(node.id, source?.repository?.id ?? null, node.path, node.contentHash ?? null, node.sourceEventId, canonical(node));
    }
  }
  for (const edge of graph.edges) {
    insertEdge.run(edge.source, edge.type, edge.target, edge.sourceEventId ?? edge.source ?? null, canonical(edge));
    if (edge.type === "contradicts" && eventsById.has(edge.source) && eventsById.has(edge.target)) {
      const [left, right] = normalizedPair(edge.source, edge.target);
      insertConflict.run(left, right, edge.source);
    }
    if (edge.type === "supersedes" && eventsById.has(edge.source) && eventsById.has(edge.target)) {
      const effectiveAt = eventsById.get(edge.source).temporal?.validFrom ?? eventsById.get(edge.source).timestamp;
      insertSupersession.run(edge.source, edge.target, effectiveAt);
      markSuperseded.run(effectiveAt, edge.target);
    }
  }
}

async function replaceDatabase(temporary, destination) {
  const backup = `${destination}.${process.pid}.${randomBytes(6).toString("hex")}.previous`;
  let movedExisting = false;
  let installedReplacement = false;
  try {
    try {
      await rename(destination, backup);
      movedExisting = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(temporary, destination);
    installedReplacement = true;
    if (movedExisting) {
      await rm(backup, { force: true });
      movedExisting = false;
    }
  } catch (error) {
    if (movedExisting && !installedReplacement) {
      try {
        await rename(backup, destination);
        movedExisting = false;
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          `SQLite read-model replacement failed and the original database remains at ${backup}.`
        );
      }
    }
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function rebuildSqliteReadModel(workspace, events, derived) {
  const destination = await secureStoragePath(workspace, ["index", SQLITE_READ_MODEL_FILENAME], {
    type: "file",
    allowMissing: true
  });
  const temporary = path.join(path.dirname(destination), `.${SQLITE_READ_MODEL_FILENAME}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let database;
  try {
    database = new DatabaseSync(temporary, { enableForeignKeyConstraints: true, allowExtension: false, timeout: 5_000 });
    database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    database.exec(SCHEMA);
    database.exec(`PRAGMA user_version = ${SQLITE_READ_MODEL_SCHEMA_VERSION}; BEGIN IMMEDIATE;`);
    try {
      const insertMeta = database.prepare("INSERT INTO read_model_meta(key, value) VALUES (?, ?)");
      database.prepare("INSERT INTO read_model_migrations(version, applied_at, description) VALUES (?, ?, ?)")
        .run(
          SQLITE_READ_MODEL_SCHEMA_VERSION,
          events.at(-1)?.timestamp ?? workspace.config.createdAt,
          "Initial ledger-derived SQLite read model"
        );
      for (const [key, value] of [
        ["schemaVersion", String(SQLITE_READ_MODEL_SCHEMA_VERSION)],
        ["workspaceId", workspace.config.workspaceId],
        ["eventCount", String(events.length)],
        ["headHash", derived.index.headHash ?? ""],
        ["journalMode", "wal"]
      ]) insertMeta.run(key, value);
      insertEvents(database, events);
      insertGraph(database, derived.graph, new Map(events.map((event) => [event.eventId, event])));
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
    database.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;");
    database.close();
    database = null;
    await replaceDatabase(temporary, destination);
    return deepFreezeJson({
      schemaVersion: SQLITE_READ_MODEL_SCHEMA_VERSION,
      path: destination,
      workspaceId: workspace.config.workspaceId,
      eventCount: events.length,
      headHash: derived.index.headHash
    });
  } finally {
    if (database) database.close();
    await rm(temporary, { force: true });
    await rm(`${temporary}-wal`, { force: true });
    await rm(`${temporary}-shm`, { force: true });
  }
}

function ftsQuery(value) {
  const tokens = String(value).normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,63}/gu) ?? [];
  return [...new Set(tokens)].slice(0, 64).map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function immutableDatabaseUrl(databasePath) {
  const url = pathToFileURL(databasePath);
  url.searchParams.set("immutable", "1");
  return url;
}

export async function querySqliteReadModel(workspace, query, options = {}) {
  const source = ftsQuery(query);
  if (!source) return deepFreezeJson({ schemaVersion: SQLITE_READ_MODEL_SCHEMA_VERSION, candidates: [] });
  const databasePath = await secureStoragePath(workspace, ["index", SQLITE_READ_MODEL_FILENAME], { type: "file" });
  const database = new DatabaseSync(immutableDatabaseUrl(databasePath), {
    readOnly: true,
    allowExtension: false,
    timeout: 5_000
  });
  try {
    database.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
    const meta = Object.fromEntries(database.prepare("SELECT key, value FROM read_model_meta").all().map((row) => [row.key, row.value]));
    if (Number(meta.schemaVersion) !== SQLITE_READ_MODEL_SCHEMA_VERSION
      || meta.workspaceId !== workspace.config.workspaceId
      || meta.headHash !== (options.headHash ?? "")) {
      throw new QarinahError("SQLITE_READ_MODEL_STALE", "SQLite read model does not match the verified ledger head.");
    }
    const rows = database.prepare(`SELECT e.event_id AS eventId, bm25(events_fts, 0.0, 4.0, 2.0, 1.0) AS score
      FROM events_fts JOIN events e ON e.event_id = events_fts.event_id
      WHERE events_fts MATCH ?
      ORDER BY score ASC, e.timestamp DESC, e.event_id ASC
      LIMIT ?`).all(source, options.limit ?? 256);
    return deepFreezeJson({
      schemaVersion: SQLITE_READ_MODEL_SCHEMA_VERSION,
      candidates: rows.map((row, index) => ({ eventId: row.eventId, rank: index + 1 }))
    });
  } finally {
    database.close();
  }
}

export async function inspectSqliteReadModel(workspace) {
  const databasePath = await secureStoragePath(workspace, ["index", SQLITE_READ_MODEL_FILENAME], { type: "file" });
  const database = new DatabaseSync(immutableDatabaseUrl(databasePath), {
    readOnly: true,
    allowExtension: false,
    timeout: 5_000
  });
  try {
    database.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
    const meta = Object.fromEntries(database.prepare("SELECT key, value FROM read_model_meta").all().map((row) => [row.key, row.value]));
    const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') ORDER BY name").all().map((row) => row.name);
    return deepFreezeJson({
      schemaVersion: Number(meta.schemaVersion),
      workspaceId: meta.workspaceId,
      eventCount: Number(meta.eventCount),
      headHash: meta.headHash || null,
      journalMode: meta.journalMode,
      tables
    });
  } finally {
    database.close();
  }
}
