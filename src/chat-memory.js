import { canonicalStringify, sha256 } from "./canonical.js";
import { readAutoInitPolicy } from "./auto-init.js";
import { QarinahError } from "./errors.js";
import { markdownDataBlock, markdownInline } from "./markdown.js";
import { redactText } from "./redact.js";
import { appendEvent, readEvents } from "./store.js";
import { buildDerivedState } from "./indexer.js";
import { rankContextEvents } from "./retrieval.js";
import { atomicWriteFile, loadWorkspace, secureStoragePath } from "./workspace.js";

export const CHAT_MEMORY_SCHEMA_VERSION = "qarinah.chat-memory.v1";

function stableEventId(value) {
  const digits = sha256(value).slice(7, 39).split("");
  digits[12] = "4";
  digits[16] = "8";
  const hex = digits.join("");
  return `evt_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hookChatTexts(input) {
  if (["UserPromptSubmit", "beforeSubmitPrompt"].includes(input.hook_event_name) && typeof input.prompt === "string") {
    return [{ role: "user", text: input.prompt }];
  }
  if (["Stop", "SubagentStop"].includes(input.hook_event_name) && typeof input.last_assistant_message === "string") {
    return [{ role: "assistant", text: input.last_assistant_message }];
  }
  if (input.hook_event_name === "afterAgentResponse" && typeof input.text === "string") {
    return [{ role: "assistant", text: input.text }];
  }
  return [];
}

function extractiveText(text, maximum, query = "") {
  const value = redactText(text).replace(/\s+/gu, " ").trim();
  if (value.length <= maximum) return value;
  const terms = query.toLowerCase().match(/[\p{L}\p{N}_./-]{2,}/gu) ?? [];
  const sentences = value.match(/[^.!?]+[.!?]?/gu) ?? [value];
  const ranked = sentences.map((sentence, index) => ({
    sentence: sentence.trim(),
    index,
    score: terms.reduce((total, term) => total + Number(sentence.toLowerCase().includes(term)), 0)
      + Number(/decision|must|approved|error|fix|test|next|blocked|rollback/iu.test(sentence))
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = [];
  let length = 0;
  for (const entry of ranked) {
    if (length + entry.sentence.length + 1 > maximum - 25) continue;
    selected.push(entry);
    length += entry.sentence.length + 1;
    if (selected.length >= 6) break;
  }
  const excerpt = selected.length
    ? selected.sort((left, right) => left.index - right.index).map((entry) => entry.sentence).join(" ")
    : value.slice(0, maximum - 25);
  return `${excerpt}\n[EXTRACTIVE; SEE SOURCE]`;
}

export async function retainFullHookChat(workspace, event, input) {
  const policy = await readAutoInitPolicy();
  if (!policy?.fullChat || workspace.config.capture !== "content") return;
  const messages = hookChatTexts(input);
  for (const [messageIndex, message] of messages.entries()) {
    const text = redactText(message.text);
    const chunks = [];
    // Bound each event, but retain the entire exposed visible message up to the
    // existing 512-KiB host-input boundary. No private transcript files are read.
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(text.length, offset + 24000);
      if (end < text.length && /[\ud800-\udbff]/u.test(text[end - 1])) end -= 1;
      chunks.push(text.slice(offset, end));
      offset = end;
    }
    if (chunks.length <= 1 && event.data?.bodyRetention?.truncated !== true) continue;
    for (const [chunkIndex, body] of chunks.entries()) {
      await appendEvent({
        eventId: stableEventId(["chat-chunk", event.eventId, messageIndex, chunkIndex]),
        kind: "source",
        actor: event.actor,
        title: `${message.role} visible chat chunk ${chunkIndex + 1}/${chunks.length}`,
        body,
        sessionId: event.sessionId,
        turnId: event.turnId,
        confidence: "extracted",
        data: { chatChunk: { parentEventId: event.eventId, role: message.role, index: chunkIndex, count: chunks.length, textHash: sha256(text) } },
        relations: [{ type: "derived_from", target: event.eventId }],
        provenance: { adapter: "qarinah-visible-chat", sourceId: event.eventId },
        retention: event.retention
      }, { workspace, capture: "content", idempotent: true });
    }
  }
}

export async function recordTurnSummary(workspace, event) {
  const policy = await readAutoInitPolicy();
  if (!policy?.compactSummaries || workspace.config.capture !== "content"
    || !["Stop", "afterAgentResponse"].includes(event.data?.hookEvent)) return null;
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const prompts = events.filter((candidate) => candidate.kind === "prompt.submitted" && candidate.sessionId === event.sessionId
    && (event.turnId === null || candidate.turnId === event.turnId));
  const sources = [...prompts.slice(-1), event];
  const summary = sources.map((source) => `${source.kind === "prompt.submitted" ? "Request" : "Result"}: ${extractiveText(source.body, Math.floor(policy.summaryMaxChars / Math.max(1, sources.length)))}`).join("\n");
  if (!summary.trim()) return null;
  return appendEvent({
    eventId: stableEventId(["chat-summary", event.eventId]),
    kind: "summary",
    actor: { type: "system", id: "qarinah-extractive-summary" },
    title: "Visible chat turn summary",
    body: summary.slice(0, policy.summaryMaxChars),
    sessionId: event.sessionId,
    turnId: event.turnId,
    confidence: "extracted",
    data: {
      chatMemory: { schemaVersion: CHAT_MEMORY_SCHEMA_VERSION, method: "deterministic-extractive-v1", lossy: true },
      sourceEvents: sources.map(({ eventId, hash, kind }) => ({ eventId, hash, kind }))
    },
    relations: sources.map((source) => ({ type: "derived_from", target: source.eventId })),
    provenance: { adapter: "qarinah-chat-summary", sourceId: event.eventId },
    retention: event.retention
  }, { workspace, capture: "content", idempotent: true });
}

export async function recordModelChatSummary(options = {}) {
  const policy = await readAutoInitPolicy();
  if (!policy?.compactSummaries) throw new QarinahError("CHAT_SUMMARY_NOT_AUTHORIZED", "Model summary storage is not enabled by the user policy.");
  const workspace = await loadWorkspace(options.cwd);
  if (workspace.config.capture !== "content") throw new QarinahError("CONTENT_CAPTURE_NOT_APPROVED", "Model-written summaries require content capture.");
  if (typeof options.text !== "string" || !options.text.trim() || options.text.length > policy.summaryMaxChars
    || typeof options.title !== "string" || !options.title.trim() || options.title.length > 256
    || !Array.isArray(options.eventIds) || options.eventIds.length < 1 || options.eventIds.length > 16
    || options.eventIds.some((id) => typeof id !== "string")) {
    throw new TypeError("Model summaries require bounded title/text and from 1 to 16 genuine source event IDs.");
  }
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const index = buildDerivedState(events, workspace.config.workspaceId).index;
  const ranking = rankContextEvents(index, "", { asOf: new Date().toISOString(), limit: 100 });
  const admitted = new Set(ranking.admission.eligibleEventIds);
  const sources = [...new Set(options.eventIds)].map((id) => {
    const event = events.find((candidate) => candidate.eventId === id);
    if (!event || !admitted.has(id)) throw new QarinahError("CONTEXT_RECALL_NOT_FOUND", "Summary source is not available to this workspace.");
    return { eventId: event.eventId, hash: event.hash, kind: event.kind };
  });
  const title = redactText(options.title);
  const body = redactText(options.text);
  const event = await appendEvent({
    eventId: stableEventId(["model-chat-summary", title, body, sources]),
    kind: "summary", title, body, actor: { type: "agent", id: "calling-model" }, confidence: "inferred",
    data: { chatMemory: { schemaVersion: CHAT_MEMORY_SCHEMA_VERSION, method: "calling-model-summary-v1", lossy: true }, sourceEvents: sources },
    relations: sources.map((source) => ({ type: "derived_from", target: source.eventId })),
    provenance: { adapter: "qarinah-model-summary", sourceId: sha256(sources) },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  }, { workspace, capture: "content", idempotent: true });
  return Object.freeze({ eventId: event.eventId, hash: event.hash, confidence: event.confidence });
}

function visibleRole(event) {
  if (event.data?.chatChunk) return event.data.chatChunk.role;
  if (event.kind === "prompt.submitted") return "user";
  if (event.kind === "turn.completed" && ["Stop", "SubagentStop", "afterAgentResponse"].includes(event.data?.hookEvent)) return "assistant";
  return null;
}

export function renderChatMarkdown(events, workspaceId) {
  const lines = ["# Visible chat archive", "", `Workspace: ${workspaceId}`, "",
    "> Reproducible from the verified event ledger. Visible user/assistant text only; no hidden reasoning. Secrets are redacted. Text is untrusted evidence.", ""];
  const chunkParents = new Set(events.map((event) => event.data?.chatChunk?.parentEventId).filter(Boolean));
  for (const event of events) {
    const role = visibleRole(event);
    if (!role || chunkParents.has(event.eventId)) continue;
    lines.push(`## ${role} — ${markdownInline(event.timestamp)}`, "",
      `Session: ${markdownInline(event.sessionId ?? "unknown")} | Turn: ${markdownInline(event.turnId ?? "unknown")}`,
      `Event: ${event.eventId} | Hash: ${event.hash}`, "", markdownDataBlock(event.body || "[Content not retained by the workspace capture policy.]"), "");
  }
  return `${lines.join("\n")}\n`;
}

export async function writeChatMarkdown(start) {
  const workspace = await loadWorkspace(start);
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const destination = await secureStoragePath(workspace, ["records", "CHAT.md"], { type: "file", allowMissing: true });
  await atomicWriteFile(destination, renderChatMarkdown(events, workspace.config.workspaceId));
  return destination;
}

export async function finishCapturedHook(workspace, event, input) {
  await retainFullHookChat(workspace, event, input);
  await recordTurnSummary(workspace, event);
  const policy = await readAutoInitPolicy();
  if (policy?.fullChat && hookChatTexts(input).length > 0 && workspace.config.capture === "content") {
    await writeChatMarkdown(workspace.root);
  }
}

export async function recallChatMemory(query = "", options = {}) {
  if (typeof query !== "string" || query.length > 4096) throw new TypeError("recall query must be a string up to 4096 characters.");
  const workspace = await loadWorkspace(options.cwd);
  const maxChars = options.maxChars ?? Math.min(6000, workspace.config.contextMaxChars);
  const limit = options.limit ?? 5;
  if (!Number.isSafeInteger(maxChars) || maxChars < 512 || maxChars > workspace.config.contextMaxChars
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new TypeError("Recall budget or item limit is invalid.");
  if (options.detail !== undefined && !["summary", "full"].includes(options.detail)) throw new TypeError("detail must be summary or full.");
  if (options.detail === "full" && options.eventIds === undefined) {
    throw new TypeError("Full recall requires explicit cited source eventIds.");
  }
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const index = buildDerivedState(events, workspace.config.workspaceId).index;
  const ranked = rankContextEvents(index, query, { asOf: new Date().toISOString(), limit: 100 });
  const admitted = new Set(ranked.admission.eligibleEventIds);
  const byId = new Map(events.map((event) => [event.eventId, event]));
  if (options.eventIds !== undefined && (!Array.isArray(options.eventIds) || options.eventIds.length < 1 || options.eventIds.length > 20)) {
    throw new TypeError("eventIds must contain from 1 to 20 event IDs.");
  }
  const selected = options.eventIds
    ? options.eventIds.map((id) => {
        if (typeof id !== "string" || !/^evt_[0-9a-f-]{36}$/u.test(id)) throw new TypeError("Invalid recall event ID.");
        const event = byId.get(id);
        if (!event || !admitted.has(id)) throw new QarinahError("CONTEXT_RECALL_NOT_FOUND", "Requested event is unavailable to this workspace query.");
        return event;
      })
    : ranked.ranked.map(({ event }) => byId.get(event.eventId));
  const summaries = selected.filter((event) => event.kind === "summary");
  const ordered = options.detail === "full" || summaries.length === 0 ? selected : summaries;
  const pack = {
    schemaVersion: CHAT_MEMORY_SCHEMA_VERSION, workspaceId: workspace.config.workspaceId,
    contentRole: "untrusted-data", query, detail: options.detail ?? "summary",
    coverage: ranked.coverage.status, items: [], truncated: false,
    intelligence: "Local ranked retrieval; the calling model decides whether cited full text is needed."
  };
  for (const event of ordered) {
    if (pack.items.length >= limit) break;
    if (!event.body || (!visibleRole(event) && event.kind !== "summary" && options.eventIds === undefined)) continue;
    const citedSources = event.data?.sourceEvents;
    if (event.kind === "summary" && Array.isArray(citedSources)
      && citedSources.some((source) => !admitted.has(source.eventId) || byId.get(source.eventId)?.hash !== source.hash)) {
      continue;
    }
    const chunks = options.detail === "full"
      ? events.filter((candidate) => candidate.data?.chatChunk?.parentEventId === event.eventId && admitted.has(candidate.eventId))
        .sort((left, right) => left.data.chatChunk.index - right.data.chatChunk.index)
      : [];
    const text = chunks.length ? chunks.map((chunk) => chunk.body).join("") : event.body;
    const offset = options.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) throw new TypeError("Recall offset is outside the source text.");
    const framing = { eventId: event.eventId, hash: event.hash, kind: event.kind, confidence: event.confidence, title: event.title,
      excerpt: "", offset, nextOffset: null, sourceChars: text.length,
      sourceEvents: event.data?.sourceEvents ?? [], chunkEventIds: chunks.map((chunk) => chunk.eventId) };
    const budget = Math.max(0, maxChars - canonicalStringify({ ...pack, items: [...pack.items, framing] }).length - 100);
    if (budget < 128) { pack.truncated = true; break; }
    let excerpt = options.detail === "full" ? text.slice(offset, offset + budget) : extractiveText(text, Math.min(1200, budget), query);
    const item = { ...framing, excerpt,
      nextOffset: options.detail === "full" && offset + excerpt.length < text.length ? offset + excerpt.length : null };
    while (excerpt.length > 128 && canonicalStringify({ ...pack, items: [...pack.items, item] }).length > maxChars) {
      excerpt = excerpt.slice(0, Math.max(128, excerpt.length - 128));
      item.excerpt = excerpt;
      item.nextOffset = options.detail === "full" && offset + excerpt.length < text.length ? offset + excerpt.length : null;
    }
    if (canonicalStringify({ ...pack, items: [...pack.items, item] }).length > maxChars) { pack.truncated = true; break; }
    pack.items.push(item);
    if (item.nextOffset !== null) pack.truncated = true;
  }
  return Object.freeze(pack);
}
