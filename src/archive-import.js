import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify, sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { retainHookContent, summarizeHookContent } from "./hooks/capture-content.js";
import { rebuildDerivedState } from "./indexer.js";
import { appendEvent, readEvents } from "./store.js";
import { loadWorkspace } from "./workspace.js";

export const AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION = "qarinah.agent-archive-import.v1";

const ALLOWED_FORMATS = new Set(["auto", "codex", "claude", "kimi", "portable"]);
const ALLOWED_MODES = new Set(["compact", "full"]);
const ARCHIVE_EXTENSIONS = new Set([".jsonl", ".ndjson"]);
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILES = 100_000;
const DEFAULT_MAX_RECORDS = 10_000_000;
const DEFAULT_MAX_LINE_BYTES = 4 * 1024 * 1024;
const MAX_SESSIONS_PER_FILE = 50_000;
const MAX_ARCHIVE_DEPTH = 64;
const MAX_SUMMARY_EXCERPTS = 3;
const MAX_TERM_KEYS = 20_000;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "before", "but", "can", "could",
  "for", "from", "has", "have", "into", "its", "not", "our", "should", "that", "the", "their",
  "then", "there", "these", "they", "this", "through", "tool", "using", "was", "were", "what",
  "when", "where", "which", "will", "with", "would", "you", "your"
]);
const PRIVATE_CONTENT_TYPES = new Set([
  "analysis", "encrypted_content", "reasoning", "redacted_thinking", "thinking"
]);

function boundedInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function timestamp(value, ordinal = 0) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
    if (Number.isFinite(new Date(milliseconds).valueOf())) return new Date(milliseconds).toISOString();
  }
  return new Date(Math.max(0, ordinal)).toISOString();
}

function textParts(value, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => textParts(entry, depth + 1));
  if (typeof value !== "object") return [];
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  if (PRIVATE_CONTENT_TYPES.has(type)) return [];
  for (const key of ["text", "content", "message", "output_text", "input_text"]) {
    if (Object.hasOwn(value, key)) return textParts(value[key], depth + 1);
  }
  return [];
}

function textContent(value) {
  return textParts(value).filter(Boolean).join("\n").trim();
}

function sessionId(value, fallback) {
  for (const candidate of [value?.sessionId, value?.session_id, value?.conversationId, value?.conversation_id]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate.slice(0, 256);
  }
  return fallback;
}

function turnId(value) {
  for (const candidate of [value?.turnId, value?.turn_id, value?.promptId, value?.prompt_id, value?.uuid]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate.slice(0, 256);
  }
  return null;
}

function normalizeCodex(record, fallbackSession, ordinal) {
  const payload = record?.payload && typeof record.payload === "object" ? record.payload : record;
  const session = sessionId(payload, fallbackSession);
  if (record?.type === "session_meta") {
    return [{ kind: "session", sessionId: payload.id ?? session, content: "", timestamp: payload.timestamp, rawType: "session_meta" }];
  }
  if (record?.type === "turn_context" || PRIVATE_CONTENT_TYPES.has(String(payload?.type).toLowerCase())) return [];
  if (record?.type === "response_item") {
    if (payload?.type === "message") {
      const role = String(payload.role ?? "").toLowerCase();
      if (!['user', 'assistant'].includes(role)) return [];
      const content = textContent(payload.content);
      return content ? [{ kind: role === "user" ? "prompt" : "assistant", sessionId: session, turnId: turnId(payload), content, timestamp: payload.timestamp, rawType: payload.type }] : [];
    }
    if (payload?.type === "function_call") {
      return [{ kind: "tool.request", sessionId: session, turnId: turnId(payload), toolName: String(payload.name ?? "tool").slice(0, 256), content: textContent(payload.arguments), toolCallId: payload.call_id ?? payload.id ?? null, timestamp: payload.timestamp, rawType: payload.type }];
    }
    if (payload?.type === "function_call_output") {
      return [{ kind: "tool.result", sessionId: session, turnId: turnId(payload), toolName: "tool", content: textContent(payload.output), toolCallId: payload.call_id ?? null, timestamp: payload.timestamp, rawType: payload.type }];
    }
    return [];
  }
  if (record?.type === "event_msg") {
    const type = String(payload?.type ?? "").toLowerCase();
    if (["agent_message", "assistant_message"].includes(type)) {
      const content = textContent(payload.message ?? payload.text);
      return content ? [{ kind: "assistant", sessionId: session, turnId: turnId(payload), content, timestamp: payload.timestamp, rawType: type }] : [];
    }
    if (type === "user_message") {
      const content = textContent(payload.message ?? payload.text);
      return content ? [{ kind: "prompt", sessionId: session, turnId: turnId(payload), content, timestamp: payload.timestamp, rawType: type }] : [];
    }
  }
  return normalizePortable(record, fallbackSession, ordinal);
}

function normalizeClaude(record, fallbackSession, ordinal) {
  const message = record?.message && typeof record.message === "object" ? record.message : record;
  const session = sessionId(record, sessionId(message, fallbackSession));
  const role = String(message?.role ?? record?.type ?? record?.role ?? "").toLowerCase();
  const blocks = Array.isArray(message?.content) ? message.content : [message?.content ?? record?.content];
  const output = [];
  for (const block of blocks) {
    if (block && typeof block === "object") {
      const type = String(block.type ?? "").toLowerCase();
      if (PRIVATE_CONTENT_TYPES.has(type)) continue;
      if (type === "tool_use") {
        output.push({ kind: "tool.request", sessionId: session, turnId: turnId(record), toolName: String(block.name ?? "tool").slice(0, 256), content: textContent(block.input), toolCallId: block.id ?? null, timestamp: record.timestamp, rawType: type });
        continue;
      }
      if (type === "tool_result") {
        output.push({ kind: "tool.result", sessionId: session, turnId: turnId(record), toolName: "tool", content: textContent(block.content), toolCallId: block.tool_use_id ?? null, timestamp: record.timestamp, rawType: type });
        continue;
      }
    }
    const content = textContent(block);
    if (content && ["user", "assistant"].includes(role)) {
      output.push({ kind: role === "user" ? "prompt" : "assistant", sessionId: session, turnId: turnId(record), content, timestamp: record.timestamp, rawType: role });
    }
  }
  return output.length > 0 ? output : normalizePortable(record, fallbackSession, ordinal);
}

function normalizePortable(record, fallbackSession, ordinal) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  const session = sessionId(record, fallbackSession);
  const explicitType = String(record.type ?? record.kind ?? "").toLowerCase();
  const role = String(record.role ?? "").toLowerCase();
  if (PRIVATE_CONTENT_TYPES.has(explicitType) || PRIVATE_CONTENT_TYPES.has(role)) return [];
  const common = { sessionId: session, turnId: turnId(record), timestamp: record.timestamp ?? record.createdAt ?? record.created_at, rawType: explicitType || role || "record" };
  if (["session", "session.started", "session_start"].includes(explicitType)) return [{ ...common, kind: "session", content: "" }];
  if (["summary", "compaction", "compact_summary"].includes(explicitType)) return [{ ...common, kind: "summary", content: textContent(record.content ?? record.summary ?? record.text) }];
  if (["tool.request", "tool_request", "tool_use", "function_call"].includes(explicitType)) {
    return [{ ...common, kind: "tool.request", toolName: String(record.toolName ?? record.name ?? "tool").slice(0, 256), toolCallId: record.toolCallId ?? record.call_id ?? record.id ?? null, content: textContent(record.input ?? record.arguments ?? record.content) }];
  }
  if (["tool.result", "tool_result", "tool.completed", "function_call_output"].includes(explicitType)) {
    return [{ ...common, kind: "tool.result", toolName: String(record.toolName ?? record.name ?? "tool").slice(0, 256), toolCallId: record.toolCallId ?? record.call_id ?? null, content: textContent(record.output ?? record.result ?? record.content) }];
  }
  if (["user", "human"].includes(role) || ["prompt", "prompt.submitted", "user_message"].includes(explicitType)) {
    return [{ ...common, kind: "prompt", content: textContent(record.content ?? record.message ?? record.text) }];
  }
  if (["assistant", "agent"].includes(role) || ["assistant", "turn.completed", "agent_message"].includes(explicitType)) {
    return [{ ...common, kind: "assistant", content: textContent(record.content ?? record.message ?? record.text) }];
  }
  return [];
}

function normalizeKimi(record, fallbackSession, ordinal) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  const session = sessionId(record, fallbackSession);
  const role = String(record.role ?? "").toLowerCase();
  const common = {
    sessionId: session,
    turnId: turnId(record),
    timestamp: record.timestamp ?? record.createdAt ?? record.created_at,
    rawType: role || "record"
  };
  if (role === "user") return [{ ...common, kind: "prompt", content: textContent(record.content) }];
  if (role === "tool") {
    return [{
      ...common,
      kind: "tool.result",
      toolName: String(record.name ?? "tool").slice(0, 256),
      toolCallId: record.tool_call_id ?? null,
      content: textContent(record.content)
    }];
  }
  if (role !== "assistant") return [];
  const output = [];
  const content = textContent(record.content);
  if (content) output.push({ ...common, kind: "assistant", content });
  if (Array.isArray(record.tool_calls)) {
    for (const call of record.tool_calls.slice(0, 1_000)) {
      if (!call || typeof call !== "object") continue;
      const fn = call.function && typeof call.function === "object" ? call.function : call;
      output.push({
        ...common,
        kind: "tool.request",
        toolName: String(fn.name ?? "tool").slice(0, 256),
        toolCallId: call.id ?? null,
        content: textContent(fn.arguments)
      });
    }
  }
  return output;
}

function detectedFormat(record) {
  if (["session_meta", "response_item", "event_msg", "turn_context"].includes(record?.type)) return "codex";
  if (record?.message && typeof record.message === "object" && (record.sessionId || record.session_id || ["user", "assistant"].includes(record.type))) return "claude";
  return "portable";
}

function normalizeRecord(record, format, fallbackSession, ordinal) {
  const selected = format === "auto" ? detectedFormat(record) : format;
  const rawItems = selected === "codex"
    ? normalizeCodex(record, fallbackSession, ordinal)
    : selected === "claude"
      ? normalizeClaude(record, fallbackSession, ordinal)
      : selected === "kimi"
        ? normalizeKimi(record, fallbackSession, ordinal)
      : normalizePortable(record, fallbackSession, ordinal);
  return {
    format: ["codex", "claude", "kimi"].includes(selected) ? selected : "portable",
    items: rawItems.map((item) => ({
      kind: item.kind,
      sessionId: String(item.sessionId ?? fallbackSession).slice(0, 256),
      turnId: item.turnId ?? null,
      content: item.content ?? "",
      timestamp: item.timestamp ?? null,
      rawType: item.rawType ?? null,
      toolName: item.toolName ?? null,
      toolCallId: item.toolCallId ?? null
    }))
  };
}

function deterministicEventId(identity) {
  const digest = sha256(identity).slice("sha256:".length, "sha256:".length + 32).split("");
  digest[12] = "4";
  digest[16] = "8";
  const value = digest.join("");
  return `evt_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function addTerms(aggregate, text) {
  if (!text || aggregate.terms.size >= MAX_TERM_KEYS) return;
  const words = text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,63}/gu) ?? [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    aggregate.terms.set(word, (aggregate.terms.get(word) ?? 0) + 1);
    if (aggregate.terms.size >= MAX_TERM_KEYS) break;
  }
}

function excerpt(value) {
  if (!value) return "";
  return retainHookContent(value, 1_200).text.replaceAll(/\s+/gu, " ").trim();
}

function createAggregate(session) {
  return {
    sessionId: session,
    recordCount: 0,
    visibleCount: 0,
    promptCount: 0,
    assistantCount: 0,
    toolRequestCount: 0,
    toolResultCount: 0,
    summaryCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    prompts: [],
    outcomes: [],
    summaries: [],
    tools: new Set(),
    terms: new Map(),
    digest: createHash("sha256")
  };
}

function updateAggregate(aggregate, item, ordinal) {
  aggregate.recordCount += 1;
  const observedAt = timestamp(item.timestamp, ordinal);
  aggregate.firstTimestamp ??= observedAt;
  aggregate.lastTimestamp = observedAt;
  if (item.content) {
    aggregate.visibleCount += 1;
    aggregate.digest.update(canonicalStringify({ kind: item.kind, content: item.content, toolName: item.toolName ?? null }));
    addTerms(aggregate, item.content);
  }
  if (item.kind === "prompt") {
    aggregate.promptCount += 1;
    if (aggregate.prompts.length < MAX_SUMMARY_EXCERPTS) aggregate.prompts.push(excerpt(item.content));
  } else if (item.kind === "assistant") {
    aggregate.assistantCount += 1;
    aggregate.outcomes.push(excerpt(item.content));
    if (aggregate.outcomes.length > MAX_SUMMARY_EXCERPTS) aggregate.outcomes.shift();
  } else if (item.kind === "summary") {
    aggregate.summaryCount += 1;
    aggregate.summaries.push(excerpt(item.content));
    if (aggregate.summaries.length > MAX_SUMMARY_EXCERPTS) aggregate.summaries.shift();
  } else if (item.kind === "tool.request") aggregate.toolRequestCount += 1;
  else if (item.kind === "tool.result") aggregate.toolResultCount += 1;
  if (item.toolName) aggregate.tools.add(item.toolName);
}

function summaryBody(aggregate) {
  const lines = [
    `Imported session with ${aggregate.promptCount} user messages, ${aggregate.assistantCount} assistant messages, ${aggregate.toolRequestCount} tool requests, and ${aggregate.toolResultCount} tool results.`
  ];
  if (aggregate.prompts.length) lines.push("", "What was requested:", ...aggregate.prompts.map((value) => `- ${value}`));
  if (aggregate.summaries.length) lines.push("", "Recorded session summaries:", ...aggregate.summaries.map((value) => `- ${value}`));
  if (aggregate.outcomes.length) lines.push("", "Latest visible outcomes:", ...aggregate.outcomes.map((value) => `- ${value}`));
  if (aggregate.tools.size) lines.push("", `Tools observed: ${[...aggregate.tools].sort().join(", ")}.`);
  const terms = [...aggregate.terms].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 24).map(([term]) => term);
  if (terms.length) lines.push(`Key terms: ${terms.join(", ")}.`);
  return lines.join("\n");
}

function fullEventInput(item, identity, workspace, ordinal, format) {
  const kind = item.kind === "session" ? "session.started"
    : item.kind === "prompt" ? "prompt.submitted"
      : item.kind === "assistant" ? "turn.completed"
        : item.kind === "summary" ? "summary"
          : item.kind === "tool.request" ? "tool.requested" : "tool.completed";
  const actor = item.kind === "prompt" ? { type: "human", id: "archive-user" }
    : item.kind.startsWith("tool.") ? { type: "tool", id: "archive-tool" }
      : item.kind === "session" ? { type: "system", id: `${format}-archive` }
        : { type: "agent", id: `${format}-archive` };
  const retained = workspace.config.capture === "content" && item.content ? retainHookContent(item.content) : null;
  const title = item.kind === "session" ? `Imported ${format} session`
    : item.kind === "prompt" ? "Imported user request"
      : item.kind === "assistant" ? "Imported assistant outcome"
        : item.kind === "summary" ? "Imported session summary"
          : item.kind === "tool.request" ? `Imported tool request: ${item.toolName}` : `Imported tool result: ${item.toolName}`;
  return {
    eventId: deterministicEventId(identity),
    timestamp: timestamp(item.timestamp, ordinal),
    kind,
    actor,
    title,
    body: retained?.text ?? "",
    data: {
      archiveImport: {
        schemaVersion: AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION,
        format,
        mode: "full",
        sourceOrdinal: ordinal,
        content: summarizeHookContent(item.content),
        retained: retained ? { sourceChars: retained.sourceChars, retainedChars: retained.retainedChars, truncated: retained.truncated } : null,
        toolName: item.toolName ?? null
      }
    },
    confidence: "extracted",
    relations: [
      { type: "references", target: `session:${item.sessionId}` },
      ...(item.toolCallId ? [{ type: item.kind === "tool.result" ? "derived_from" : "references", target: `toolcall:${item.toolCallId}` }] : [])
    ],
    sessionId: item.sessionId,
    turnId: item.turnId,
    provenance: { adapter: `${format}-archive-import`, sourceId: sha256(identity) },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
}

async function archiveFiles(source, limits) {
  const requested = path.resolve(source);
  const requestedStat = await lstat(requested);
  if (requestedStat.isSymbolicLink()) throw new QarinahError("ARCHIVE_LINK_REJECTED", "Archive source cannot be a symbolic link.");
  const resolved = await realpath(requested);
  const rootStat = await lstat(resolved);
  const files = [];
  let totalBytes = 0;
  let directoriesSeen = 0;
  async function addFile(candidate) {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return;
    if (metadata.nlink !== 1) throw new QarinahError("ARCHIVE_LINK_REJECTED", "Archive files must be singly linked regular files.");
    if (!ARCHIVE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return;
    totalBytes += metadata.size;
    if (files.length + 1 > limits.maxFiles) throw new QarinahError("ARCHIVE_LIMIT_EXCEEDED", "Archive contains more files than allowed.");
    if (totalBytes > limits.maxBytes) throw new QarinahError("ARCHIVE_LIMIT_EXCEEDED", "Archive exceeds the configured byte limit.");
    files.push({ path: candidate, size: metadata.size });
  }
  async function walk(directory, depth = 0) {
    if (depth > MAX_ARCHIVE_DEPTH) throw new QarinahError("ARCHIVE_LIMIT_EXCEEDED", `Archive directory depth exceeds ${MAX_ARCHIVE_DEPTH}.`);
    directoriesSeen += 1;
    if (directoriesSeen > limits.maxFiles) throw new QarinahError("ARCHIVE_LIMIT_EXCEEDED", "Archive contains more directories than allowed.");
    const entries = [];
    const handle = await opendir(directory);
    for await (const entry of handle) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(candidate, depth + 1);
      else if (entry.isFile()) await addFile(candidate);
    }
  }
  if (rootStat.isFile()) await addFile(resolved);
  else if (rootStat.isDirectory()) await walk(resolved);
  else throw new QarinahError("ARCHIVE_SOURCE_INVALID", "Archive source must be a regular file or directory.");
  return { files, totalBytes };
}

async function streamLines(candidate, maximumLineBytes, callback) {
  const stream = createReadStream(candidate);
  let pending = Buffer.alloc(0);
  let lineNumber = 0;
  try {
    for await (const chunk of stream) {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      if (pending.length > maximumLineBytes && pending.indexOf(0x0a) === -1) {
        throw new QarinahError("ARCHIVE_LINE_TOO_LARGE", `Archive line exceeds ${maximumLineBytes} bytes.`);
      }
      let newline;
      while ((newline = pending.indexOf(0x0a)) !== -1) {
        const line = pending.subarray(0, newline);
        pending = pending.subarray(newline + 1);
        lineNumber += 1;
        if (line.length > maximumLineBytes) throw new QarinahError("ARCHIVE_LINE_TOO_LARGE", `Archive line ${lineNumber} exceeds ${maximumLineBytes} bytes.`);
        await callback(line.toString("utf8").replace(/\r$/u, ""), lineNumber);
      }
    }
    if (pending.length > 0) {
      lineNumber += 1;
      if (pending.length > maximumLineBytes) throw new QarinahError("ARCHIVE_LINE_TOO_LARGE", `Archive line ${lineNumber} exceeds ${maximumLineBytes} bytes.`);
      await callback(pending.toString("utf8").replace(/\r$/u, ""), lineNumber);
    }
  } finally {
    stream.destroy();
  }
}

export async function importAgentArchive(source, options = {}) {
  if (typeof source !== "string" || source.trim() === "") throw new TypeError("Archive source is required.");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Archive import options must be a record.");
  const allowedOptions = new Set(["cwd", "format", "mode", "maxBytes", "maxFiles", "maxRecords", "maxLineBytes", "rebuild"]);
  const unknownOptions = Object.keys(options).filter((key) => !allowedOptions.has(key));
  if (unknownOptions.length > 0) throw new TypeError(`Archive import options contain unknown field(s): ${unknownOptions.join(", ")}.`);
  if (options.rebuild !== undefined && typeof options.rebuild !== "boolean") throw new TypeError("rebuild must be a boolean.");
  const format = options.format ?? "auto";
  const mode = options.mode ?? "compact";
  if (!ALLOWED_FORMATS.has(format)) throw new TypeError("format must be auto, codex, claude, kimi, or portable.");
  if (!ALLOWED_MODES.has(mode)) throw new TypeError("mode must be compact or full.");
  const limits = {
    maxBytes: boundedInteger(options.maxBytes, DEFAULT_MAX_BYTES, 1, 1024 * 1024 * 1024 * 1024, "maxBytes"),
    maxFiles: boundedInteger(options.maxFiles, DEFAULT_MAX_FILES, 1, 1_000_000, "maxFiles"),
    maxRecords: boundedInteger(options.maxRecords, DEFAULT_MAX_RECORDS, 1, 100_000_000, "maxRecords"),
    maxLineBytes: boundedInteger(options.maxLineBytes, DEFAULT_MAX_LINE_BYTES, 1_024, 64 * 1024 * 1024, "maxLineBytes")
  };
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  if (mode === "full" && workspace.config.capture !== "content") {
    throw new QarinahError("ARCHIVE_CONTENT_NOT_AUTHORIZED", "Full archive import requires a workspace initialized with --capture content.");
  }
  const discovered = await archiveFiles(source, limits);
  if (discovered.files.length === 0) throw new QarinahError("ARCHIVE_EMPTY", "No .jsonl or .ndjson archive files were found.");
  const existingEventIds = new Set((await readEvents(workspace)).map((event) => event.eventId));
  let recordsSeen = 0;
  let visibleItems = 0;
  let ignoredRecords = 0;
  let importedEvents = 0;
  const formats = new Set();
  const sessions = new Set();

  for (let fileIndex = 0; fileIndex < discovered.files.length; fileIndex += 1) {
    const file = discovered.files[fileIndex];
    let activeSession = `archive-${fileIndex + 1}`;
    const aggregates = new Map();
    const normalizedDigest = createHash("sha256");
    await streamLines(file.path, limits.maxLineBytes, async (line, lineNumber) => {
      if (line.trim() === "") return;
      recordsSeen += 1;
      if (recordsSeen > limits.maxRecords) throw new QarinahError("ARCHIVE_LIMIT_EXCEEDED", "Archive contains more records than allowed.");
      let record;
      try {
        record = JSON.parse(lineNumber === 1 ? line.replace(/^\uFEFF/u, "") : line);
      } catch {
        throw new QarinahError("ARCHIVE_RECORD_INVALID", `Archive file ${fileIndex + 1}, line ${lineNumber} is not valid JSON.`);
      }
      const normalized = normalizeRecord(record, format, activeSession, recordsSeen);
      formats.add(normalized.format);
      if (normalized.items.length === 0) {
        ignoredRecords += 1;
        return;
      }
      for (const item of normalized.items) {
        if (item.kind === "session") activeSession = item.sessionId;
        visibleItems += 1;
        sessions.add(item.sessionId);
        const identity = {
          schemaVersion: AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION,
          format: normalized.format,
          fileIndex,
          lineNumber,
          item
        };
        normalizedDigest.update(canonicalStringify(identity));
        if (mode === "full") {
          const input = fullEventInput(item, identity, workspace, recordsSeen, normalized.format);
          await appendEvent(input, {
            workspace,
            capture: workspace.config.capture,
            idempotent: true
          });
          if (!existingEventIds.has(input.eventId)) {
            existingEventIds.add(input.eventId);
            importedEvents += 1;
          }
          continue;
        }
        let aggregate = aggregates.get(item.sessionId);
        if (!aggregate) {
          if (aggregates.size >= MAX_SESSIONS_PER_FILE) throw new QarinahError("ARCHIVE_LIMIT_EXCEEDED", `Archive file contains more than ${MAX_SESSIONS_PER_FILE} sessions.`);
          aggregate = createAggregate(item.sessionId);
          aggregates.set(item.sessionId, aggregate);
        }
        updateAggregate(aggregate, item, recordsSeen);
      }
    });
    if (mode === "compact") {
      const fileDigest = `sha256:${normalizedDigest.digest("hex")}`;
      for (const aggregate of aggregates.values()) {
        const contentDigest = `sha256:${aggregate.digest.digest("hex")}`;
        const body = workspace.config.capture === "content" ? summaryBody(aggregate) : "";
        const data = {
          archiveImport: {
            schemaVersion: AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION,
            format: [...formats].sort(),
            mode: "compact",
            sessionId: aggregate.sessionId,
            recordCount: aggregate.recordCount,
            visibleCount: aggregate.visibleCount,
            promptCount: aggregate.promptCount,
            assistantCount: aggregate.assistantCount,
            toolRequestCount: aggregate.toolRequestCount,
            toolResultCount: aggregate.toolResultCount,
            summaryCount: aggregate.summaryCount,
            firstTimestamp: aggregate.firstTimestamp,
            lastTimestamp: aggregate.lastTimestamp,
            tools: [...aggregate.tools].sort(),
            contentDigest,
            normalizedFileDigest: fileDigest,
            sourceBytes: file.size,
            body: summarizeHookContent(body)
          }
        };
        const identity = { schemaVersion: AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION, fileDigest, sessionId: aggregate.sessionId, contentDigest, data };
        const eventId = deterministicEventId(identity);
        await appendEvent({
          eventId,
          timestamp: aggregate.lastTimestamp ?? timestamp(null, fileIndex),
          kind: "summary",
          actor: { type: "tool", id: "qarinah-archive-import" },
          title: "Imported agent session summary",
          body,
          data,
          confidence: "extracted",
          relations: [{ type: "references", target: `session:${aggregate.sessionId}` }],
          sessionId: aggregate.sessionId,
          turnId: null,
          provenance: { adapter: "qarinah-agent-archive-import", sourceId: contentDigest },
          retention: { class: workspace.config.retentionClass, expiresAt: null }
        }, { workspace, capture: workspace.config.capture, idempotent: true });
        if (!existingEventIds.has(eventId)) {
          existingEventIds.add(eventId);
          importedEvents += 1;
        }
      }
    }
  }
  const derived = options.rebuild === false ? null : await rebuildDerivedState(workspace.root);
  return Object.freeze({
    schemaVersion: AGENT_ARCHIVE_IMPORT_SCHEMA_VERSION,
    mode,
    formats: [...formats].sort(),
    filesRead: discovered.files.length,
    sourceBytes: discovered.totalBytes,
    recordsSeen,
    visibleItems,
    ignoredRecords,
    sessions: sessions.size,
    importedEvents,
    derived
  });
}
