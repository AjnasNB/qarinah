import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  compileContext,
  createContextHandoffCapsule,
  initializeWorkspace,
  rebuildDerivedState,
  renderContextPackMarkdown
} from "../src/index.js";
import { canonicalStringify } from "../src/canonical.js";
import { CONTEXT_PACK_SCHEMA_VERSION, createManifestHash } from "../src/contracts.js";
import {
  createTokenBudget,
  estimateTokens,
  reservationUsage,
  tokenBudgetMetadata
} from "../src/token-budget.js";
import {
  softwareTaskScenarios,
  unrelatedRecordCount
} from "../bench/fixtures/software-task-scenarios.mjs";
import { continuationImplementationManifest } from "./continuation-evidence-lib.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const resultPath = path.join(
  repositoryRoot,
  "bench",
  "results",
  `context-efficiency-comparison-${packageJson.version}-v1.json`
);
const writeResult = process.argv.includes("--write");
const portableMemoryBudgetTokens = 1_300;
const maximumRecords = 8;
const evaluationAsOf = "2026-08-01T00:00:00.000Z";
const estimator = Object.freeze({
  id: "portable-chars-div-4",
  version: "1",
  exact: false,
  formula: "ceil(UTF-16 JavaScript string length / 4)"
});
const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "in", "is", "it", "of",
  "on", "or", "that", "the", "this", "to", "was", "were", "will", "with"
]);

assert.equal(packageJson.version, "0.1.6", "This versioned comparison belongs to Qarinah 0.1.6.");

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function fileDigest(relativePath) {
  return sha256(await readFile(path.join(repositoryRoot, relativePath)));
}

function estimatedTokens(text) {
  return Math.ceil(text.length / 4);
}

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function reduction(smaller, larger) {
  return larger === 0 ? 0 : rounded(1 - smaller / larger);
}

function eventId(index) {
  return `evt_00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function primitiveData(data) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
  );
}

function renderSources(sources) {
  return sources.map((source) => `FILE ${source.path}\n${source.content}`).join("\n\n");
}

function renderCompleteRecord(event) {
  return JSON.stringify(event);
}

function renderCompleteRecords(events) {
  return events.map(renderCompleteRecord).join("\n\n");
}

function lexemes(value) {
  return (String(value).normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,63}/gu) || [])
    .filter((term) => !stopWords.has(term));
}

function frequencies(terms) {
  const result = new Map();
  for (const term of terms) result.set(term, (result.get(term) || 0) + 1);
  return result;
}

function rankBm25(events, query) {
  const queryTerms = [...new Set(lexemes(query))].sort();
  const indexed = events.map((event) => {
    const terms = lexemes(`${event.title}\n${event.body}\n${JSON.stringify(primitiveData(event.data))}`);
    return {
      event,
      terms,
      frequencies: frequencies(terms),
      titleTerms: new Set(lexemes(event.title))
    };
  });
  const averageLength = indexed.reduce((sum, entry) => sum + entry.terms.length, 0) / Math.max(1, indexed.length);
  const documentFrequency = new Map();
  for (const entry of indexed) {
    for (const term of new Set(entry.terms)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
  }
  const k1 = 1.2;
  const b = 0.75;
  return indexed.map((entry) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = entry.frequencies.get(term) || 0;
      if (frequency === 0) continue;
      const documentsWithTerm = documentFrequency.get(term) || 0;
      const inverseFrequency = Math.log(1 + ((indexed.length - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5)));
      const denominator = frequency + k1 * (1 - b + b * (entry.terms.length / Math.max(1, averageLength)));
      const titleBoost = entry.titleTerms.has(term) ? 1.8 : 1;
      score += inverseFrequency * ((frequency * (k1 + 1)) / denominator) * titleBoost;
    }
    return { event: entry.event, score: rounded(score) };
  }).sort((left, right) => (
    right.score - left.score
    || right.event.timestamp.localeCompare(left.event.timestamp)
    || left.event.eventId.localeCompare(right.event.eventId)
  ));
}

function budgetedPrefix(rankedEvents, budgetTokens = portableMemoryBudgetTokens, limit = maximumRecords) {
  const selected = [];
  for (const event of rankedEvents) {
    if (selected.length >= limit) break;
    const candidate = [...selected, event];
    if (estimatedTokens(renderCompleteRecords(candidate)) > budgetTokens) break;
    selected.push(event);
  }
  return selected;
}

function compactData(data, maximum = 1_200) {
  const json = canonicalStringify(data);
  if (json === "{}") return "";
  return json.length <= maximum ? json : `${json.slice(0, maximum - 3)}...`;
}

function baselineExcerpt(event, maximum = 2_000) {
  const text = [event.body, compactData(event.data)].filter(Boolean).join("\n");
  return text.length <= maximum ? text : `${text.slice(0, maximum - 3)}...`;
}

function bm25Coverage(events, query) {
  const queryTerms = [...new Set(lexemes(query))];
  const bestExactTermCount = events.reduce((best, event) => {
    const terms = new Set(lexemes(`${event.title}\n${event.body}\n${canonicalStringify(event.data)}`));
    return Math.max(best, queryTerms.filter((term) => terms.has(term)).length);
  }, 0);
  return {
    status: bestExactTermCount === queryTerms.length ? "direct" : (bestExactTermCount > 0 ? "partial" : "none"),
    queryTermCount: queryTerms.length,
    bestExactTermCount
  };
}

function finalizeComparableAuditPack(base, maxChars, tokenPlan) {
  let usedChars = 0;
  let usedTokens = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const withoutHash = {
      ...base,
      budget: {
        maxChars,
        usedChars,
        estimatedTokens: usedTokens,
        ...tokenBudgetMetadata(tokenPlan, usedTokens)
      }
    };
    const pack = { ...withoutHash, manifestHash: createManifestHash(withoutHash) };
    const json = `${JSON.stringify(pack, null, 2)}\n`;
    const markdown = renderContextPackMarkdown(pack);
    const nextUsedChars = Math.max(json.length, markdown.length);
    const nextUsedTokens = Math.max(
      estimateTokens(tokenPlan.estimator, json),
      estimateTokens(tokenPlan.estimator, markdown)
    );
    if (nextUsedChars === usedChars && nextUsedTokens === usedTokens) return pack;
    usedChars = nextUsedChars;
    usedTokens = nextUsedTokens;
  }
  throw new Error("Comparable BM25 audit-pack budget did not stabilize.");
}

function comparableCandidateFits(base, items, maxChars, tokenPlan) {
  const usage = reservationUsage(items, tokenPlan.estimator);
  if (usage.citations > tokenPlan.allocations.citations || usage.content > tokenPlan.allocations.content) {
    return { fits: false, usage, pack: null };
  }
  const pack = finalizeComparableAuditPack({ ...base, items }, maxChars, tokenPlan);
  return {
    fits: pack.budget.usedChars <= maxChars && pack.budget.usedTokens <= tokenPlan.availableTokens,
    usage,
    pack
  };
}

function buildComparableBm25AuditPack({ events, query, workspaceId }) {
  const maxChars = portableMemoryBudgetTokens * 4;
  const tokenPlan = createTokenBudget({
    maxTokens: portableMemoryBudgetTokens,
    reserveTokens: 0
  }, maxChars);
  const ranked = rankBm25(events, query);
  const base = {
    schemaVersion: CONTEXT_PACK_SCHEMA_VERSION,
    workspaceId,
    query,
    contentRole: "untrusted-data",
    retrieval: {
      strategy: "standalone-bm25-v1",
      supersessionPolicy: "not-applied",
      coverage: bm25Coverage(events, query),
      rankingProfile: "standalone-bm25-v1",
      temporalBoundary: "not-applied",
      evidenceSufficiency: { state: "NOT_ASSESSED", score: 0 }
    },
    items: [],
    truncated: false
  };
  const items = [];
  let shortened = false;
  for (const [index, entry] of ranked.entries()) {
    if (items.length >= maximumRecords) break;
    const excerpt = baselineExcerpt(entry.event);
    const item = {
      eventId: entry.event.eventId,
      kind: entry.event.kind,
      timestamp: entry.event.timestamp,
      title: entry.event.title,
      excerpt,
      confidence: entry.event.confidence,
      reason: `Standalone BM25 rank ${index + 1}; score ${entry.score}.`,
      hash: entry.event.hash
    };
    const full = comparableCandidateFits(base, [...items, item], maxChars, tokenPlan);
    if (full.fits) {
      items.push(item);
      continue;
    }
    if (full.usage.citations > tokenPlan.allocations.citations) {
      shortened = true;
      break;
    }
    let low = 0;
    let high = excerpt.length;
    let accepted = null;
    while (low <= high) {
      const midpoint = Math.floor((low + high) / 2);
      const candidateExcerpt = midpoint === 0
        ? ""
        : (midpoint === excerpt.length
          ? excerpt
          : (midpoint <= 3 ? ".".repeat(midpoint) : `${excerpt.slice(0, midpoint - 3)}...`));
      const candidate = comparableCandidateFits(
        base,
        [...items, { ...item, excerpt: candidateExcerpt }],
        maxChars,
        tokenPlan
      );
      if (candidate.fits) {
        accepted = { ...item, excerpt: candidateExcerpt };
        low = midpoint + 1;
      } else {
        high = midpoint - 1;
      }
    }
    if (accepted) items.push(accepted);
    shortened = true;
    break;
  }
  return finalizeComparableAuditPack({
    ...base,
    items,
    truncated: shortened || items.length < ranked.length
  }, maxChars, tokenPlan);
}

function exactGate(modelFacingText, required) {
  const answerPresent = modelFacingText.includes(required.answer);
  const requiredCitations = required.citations.map((citation) => ({
    eventId: citation.eventId,
    eventIdPresent: modelFacingText.includes(citation.eventId),
    hashPresent: modelFacingText.includes(citation.hash)
  }));
  const citationsCorrect = requiredCitations.every((citation) => citation.eventIdPresent && citation.hashPresent);
  return { answerPresent, citationsCorrect, requiredCitations };
}

function methodObservation({
  id,
  label,
  memoryText,
  currentSourceText,
  selectedRecordCount,
  required,
  budgeted,
  fixedBudgetMethod = budgeted,
  metadata = {}
}) {
  const modelFacingText = [currentSourceText, memoryText].filter(Boolean).join("\n\n");
  const memoryEstimatedTokens = estimatedTokens(memoryText);
  const totalModelFacingEstimatedTokens = estimatedTokens(modelFacingText);
  const gate = exactGate(modelFacingText, required);
  const budgetAccountingTokens = Number.isSafeInteger(metadata.packEstimatedTokens)
    ? metadata.packEstimatedTokens
    : memoryEstimatedTokens;
  const budgetAccountingBasis = Number.isSafeInteger(metadata.packEstimatedTokens)
    ? "max-pretty-json-or-rendered-markdown"
    : "model-facing-rendering";
  const withinMemoryBudget = budgeted
    ? budgetAccountingTokens <= portableMemoryBudgetTokens
    : null;
  return {
    id,
    label,
    budgeted,
    fixedBudgetMethod,
    selectedRecordCount,
    memoryCharacters: memoryText.length,
    memoryEstimatedTokens,
    budgetAccountingTokens,
    budgetAccountingBasis,
    totalModelFacingCharacters: modelFacingText.length,
    totalModelFacingEstimatedTokens,
    withinMemoryBudget,
    answerBearingEvidencePresent: gate.answerPresent,
    requiredCitationPairsPresent: gate.citationsCorrect,
    eligible: withinMemoryBudget !== false && gate.answerPresent && gate.citationsCorrect,
    requiredCitations: gate.requiredCitations,
    ...metadata
  };
}

function softwareInput(index, overrides = {}) {
  return {
    eventId: eventId(index),
    timestamp: new Date(Date.UTC(2026, 4, 1, 0, 0, index)).toISOString(),
    kind: "decision",
    actor: { type: "human", id: "context-comparison-owner" },
    title: "Software-task comparison record",
    body: "A deterministic retained project-history record.",
    data: {},
    confidence: "verified",
    relations: [],
    provenance: { adapter: "qarinah-context-comparison-v1", sourceId: `software:${index}` },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function noiseBody(index) {
  const component = `component-${String(index % 17).padStart(2, "0")}`;
  const operation = `operation-${String(index).padStart(3, "0")}`;
  return [
    `${component} completed ${operation} in an unrelated project area.`,
    "The retained outcome includes its bounded tool result, review state, affected module, test observation, and follow-up status.",
    "This record represents ordinary accumulated agent history that a full-history replay would resend even though it is irrelevant to the current task.",
    "It contains no credentials, hidden reasoning, private transcript, or authority over another component."
  ].join(" ");
}

async function buildSoftwareTrack() {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-context-comparison-software-"));
  process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");
  let sequence = 0;
  try {
    const workspace = await initializeWorkspace(root, { capture: "content" });
    const events = [];
    const targets = new Map();
    for (const scenario of softwareTaskScenarios) {
      const target = await appendEvent(softwareInput(++sequence, {
        title: scenario.target.title,
        body: scenario.target.body,
        data: { scenario: scenario.id, role: "target" }
      }), { workspace });
      events.push(target);
      targets.set(scenario.id, target);
      for (const [title, body] of scenario.support) {
        const support = await appendEvent(softwareInput(++sequence, {
          title,
          body,
          data: { scenario: scenario.id, role: "support" },
          relations: [{ type: "references", target: target.eventId }]
        }), { workspace });
        events.push(support);
      }
    }
    for (let index = 0; index < unrelatedRecordCount; index += 1) {
      events.push(await appendEvent(softwareInput(++sequence, {
        title: `Unrelated accumulated history ${String(index).padStart(3, "0")}`,
        body: noiseBody(index),
        data: { component: `component-${index % 17}`, sequence: index }
      }), { workspace }));
    }
    await rebuildDerivedState(root);
    assert.equal(events.length, 240);

    const cases = [];
    for (const scenario of softwareTaskScenarios) {
      const target = targets.get(scenario.id);
      const currentSourceText = renderSources(scenario.currentSources);
      const required = {
        answer: scenario.target.body,
        citations: [{ eventId: target.eventId, hash: target.hash }]
      };
      const lastN = budgetedPrefix([...events].reverse());
      const bm25 = budgetedPrefix(rankBm25(events, scenario.query).map((entry) => entry.event));
      const bm25AuditPack = buildComparableBm25AuditPack({
        events,
        query: scenario.query,
        workspaceId: workspace.config.workspaceId
      });
      const pack = await compileContext(scenario.query, {
        cwd: root,
        maxChars: portableMemoryBudgetTokens * 4,
        maxTokens: portableMemoryBudgetTokens,
        reserveTokens: 0,
        limit: maximumRecords,
        minimumCoverage: "direct",
        minimumEvidence: "any",
        rankingProfile: "admission-first-v2",
        temporalBoundary: "strict-before",
        includeEvidenceSufficiency: true,
        inMemory: true,
        updateCheckpoint: false,
        asOf: evaluationAsOf
      });
      const qarinahText = renderContextPackMarkdown(pack);
      cases.push({
        id: scenario.id,
        label: scenario.label,
        currentSourceCharacters: currentSourceText.length,
        currentSourceEstimatedTokens: estimatedTokens(currentSourceText),
        requiredAnswerSha256: sha256(required.answer),
        requiredCitation: { eventId: required.citations[0].eventId, hashAlgorithm: "sha256" },
        methods: [
          methodObservation({
            id: "full-history-json-records",
            label: "Full history (uncapped stored-event JSON records)",
            memoryText: renderCompleteRecords(events),
            currentSourceText,
            selectedRecordCount: events.length,
            required,
            budgeted: false,
            fixedBudgetMethod: false
          }),
          methodObservation({
            id: "last-n-complete-records",
            label: "Last-N complete records",
            memoryText: renderCompleteRecords(lastN),
            currentSourceText,
            selectedRecordCount: lastN.length,
            required,
            budgeted: true
          }),
          methodObservation({
            id: "standalone-bm25-complete-records",
            label: "Standalone BM25 complete records",
            memoryText: renderCompleteRecords(bm25),
            currentSourceText,
            selectedRecordCount: bm25.length,
            required,
            budgeted: true,
            metadata: { parameters: { k1: 1.2, b: 0.75, titleBoost: 1.8 } }
          }),
          methodObservation({
            id: "standalone-bm25-compact-audit-pack",
            label: "Standalone BM25 compact audit pack",
            memoryText: renderContextPackMarkdown(bm25AuditPack),
            currentSourceText,
            selectedRecordCount: bm25AuditPack.items.length,
            required,
            budgeted: true,
            metadata: {
              packEstimatedTokens: bm25AuditPack.budget.usedTokens,
              rankingProfile: bm25AuditPack.retrieval.rankingProfile,
              coverage: bm25AuditPack.retrieval.coverage.status,
              evidenceState: bm25AuditPack.retrieval.evidenceSufficiency.state,
              truncated: bm25AuditPack.truncated,
              parameters: { k1: 1.2, b: 0.75, titleBoost: 1.8 }
            }
          }),
          methodObservation({
            id: "qarinah-admission-first-v2-audit-pack",
            label: "Qarinah admission-first-v2 audit pack",
            memoryText: qarinahText,
            currentSourceText,
            selectedRecordCount: pack.items.length,
            required,
            budgeted: true,
            metadata: {
              packEstimatedTokens: pack.budget.usedTokens,
              rankingProfile: pack.retrieval.rankingProfile,
              coverage: pack.retrieval.coverage.status,
              evidenceState: pack.retrieval.evidenceSufficiency.state,
              truncated: pack.truncated
            }
          })
        ]
      });
    }
    return { records: events.length, cases };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function continuationInput(index, overrides = {}) {
  return {
    eventId: eventId(1_000 + index),
    timestamp: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
    kind: "decision",
    actor: { type: "agent", id: "codex-session-a" },
    title: "Continuation comparison record",
    body: "A bounded cross-session fixture.",
    data: {},
    confidence: "extracted",
    relations: [],
    sessionId: "session-a",
    turnId: "turn-a",
    provenance: { adapter: "qarinah-context-comparison-v1", sourceId: `continuation:${index}` },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function continuationObservation({ id, label, text, selectedRecordCount, summary, sources, manifestHash = null }) {
  const strictRequired = {
    answer: summary.body,
    citations: [summary, ...sources].map((event) => ({ eventId: event.eventId, hash: event.hash }))
  };
  const pointerRequired = {
    answer: summary.body,
    citations: [{ eventId: summary.eventId, hash: summary.hash }]
  };
  const strict = exactGate(text, strictRequired);
  const pointer = exactGate(text, pointerRequired);
  const manifestPointerPresent = manifestHash !== null && text.includes(manifestHash);
  const allSourceIdHashStringsPresent = sources.every(
    (source) => text.includes(source.eventId) && text.includes(source.hash)
  );
  return {
    id,
    label,
    selectedRecordCount,
    modelFacingCharacters: text.length,
    modelFacingEstimatedTokens: estimatedTokens(text),
    answerBearingSummaryPresent: strict.answerPresent,
    summaryAndSourceCitationStringsGate: strict.answerPresent && strict.citationsCorrect,
    summaryAndEvidenceReferenceGate: pointer.answerPresent && pointer.citationsCorrect
      && (allSourceIdHashStringsPresent || manifestPointerPresent),
    summaryCitationPairPresent: pointer.citationsCorrect,
    allSourceIdHashStringsPresent,
    auditPackManifestPointerPresent: manifestPointerPresent
  };
}

async function buildContinuationTrack() {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-context-comparison-continuation-"));
  process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");
  let sequence = 0;
  try {
    const workspace = await initializeWorkspace(root, { capture: "content" });
    const events = [];
    const prompt = await appendEvent(continuationInput(++sequence, {
      kind: "prompt.submitted",
      title: "Diagnose immutable release policy",
      body: "Find why a mutable artifact is accepted when its digest currently matches."
    }), { workspace });
    events.push(prompt);
    const outcome = await appendEvent(continuationInput(++sequence, {
      kind: "tool.completed",
      actor: { type: "tool", id: "node-test" },
      title: "Release policy test failed",
      body: "Two tests passed and the mutable-artifact rejection test failed.",
      confidence: "verified",
      relations: [{ type: "derived_from", target: prompt.eventId }]
    }), { workspace });
    events.push(outcome);
    const completed = await appendEvent(continuationInput(++sequence, {
      kind: "turn.completed",
      title: "Codex diagnosis completed SWITCH-HANDOFF-7F3A",
      body: "Reject mutable artifacts before digest equality. Digest equality alone is a time-of-check/time-of-use risk. Run npm test. Implementation remains unfinished. SWITCH-HANDOFF-7F3A",
      relations: [
        { type: "derived_from", target: prompt.eventId },
        { type: "derived_from", target: outcome.eventId }
      ]
    }), { workspace });
    events.push(completed);
    for (let index = 0; index < 36; index += 1) {
      events.push(await appendEvent(continuationInput(++sequence, {
        title: `Unrelated project history ${String(index).padStart(2, "0")}`,
        body: `Routine component ${index % 6} operation completed without release-policy impact.`,
        data: { component: `component-${index % 6}`, sequence: index }
      }), { workspace }));
    }
    const sources = [prompt, outcome, completed];
    const summary = await appendEvent(continuationInput(++sequence, {
      kind: "summary",
      title: "Evidence-linked continuation handoff SWITCH-HANDOFF-7F3A",
      body: "Session A diagnosed the immutable release guard: reject mutable artifacts before comparing exact digests, then run npm test. Implementation remains unfinished.",
      confidence: "inferred",
      data: {
        summaryMethod: "bounded-agent-handoff",
        sourceEvents: sources.map((event) => ({ eventId: event.eventId, hash: event.hash, kind: event.kind }))
      },
      relations: sources.map((event) => ({ type: "derived_from", target: event.eventId }))
    }), { workspace });
    events.push(summary);
    events.push(await appendEvent(continuationInput(++sequence, {
      kind: "session.started",
      actor: { type: "system", id: "codex" },
      title: "Fresh Codex session B started",
      body: "",
      sessionId: "session-b",
      turnId: null,
      relations: [{ type: "references", target: "session:session-b" }]
    }), { workspace }));
    events.push(await appendEvent(continuationInput(++sequence, {
      kind: "prompt.submitted",
      actor: { type: "human", id: "local-user" },
      title: "Continue the immutable release fix",
      body: "Use Qarinah before reading source and continue SWITCH-HANDOFF-7F3A.",
      sessionId: "session-b",
      turnId: "turn-b",
      relations: [{ type: "references", target: "session:session-b" }]
    }), { workspace }));
    assert.equal(events.length, 42);
    await rebuildDerivedState(root);
    const query = "continue immutable release approval fix SWITCH-HANDOFF-7F3A";
    const pack = await compileContext(query, {
      cwd: root,
      inMemory: true,
      updateCheckpoint: false,
      maxTokens: 1_500,
      reserveTokens: 150,
      limit: maximumRecords,
      minimumCoverage: "partial",
      minimumEvidence: "any",
      rankingProfile: "admission-first-v2",
      temporalBoundary: "strict-before",
      includeEvidenceSufficiency: true,
      asOf: evaluationAsOf
    });
    const capsule = createContextHandoffCapsule(pack, events, { eventId: summary.eventId });
    const lastN = budgetedPrefix([...events].reverse());
    const bm25 = budgetedPrefix(rankBm25(events, query).map((entry) => entry.event));
    const summaryOnly = `SUMMARY\n${summary.title}\n${summary.body}\n`;
    const methods = [
      continuationObservation({
        id: "full-history-complete-records",
        label: "Full history complete records",
        text: renderCompleteRecords(events),
        selectedRecordCount: events.length,
        summary,
        sources
      }),
      continuationObservation({
        id: "last-n-complete-records",
        label: "Last-N complete records",
        text: renderCompleteRecords(lastN),
        selectedRecordCount: lastN.length,
        summary,
        sources
      }),
      continuationObservation({
        id: "standalone-bm25-complete-records",
        label: "Standalone BM25 complete records",
        text: renderCompleteRecords(bm25),
        selectedRecordCount: bm25.length,
        summary,
        sources
      }),
      continuationObservation({
        id: "summary-only-no-citation-control",
        label: "Summary-only text without citation metadata",
        text: summaryOnly,
        selectedRecordCount: 1,
        summary,
        sources
      }),
      continuationObservation({
        id: "qarinah-audit-pack",
        label: "Qarinah evidence-rich audit pack",
        text: renderContextPackMarkdown(pack),
        selectedRecordCount: pack.items.length,
        summary,
        sources,
        manifestHash: pack.manifestHash
      }),
      continuationObservation({
        id: "qarinah-handoff-capsule",
        label: "Qarinah compact handoff capsule",
        text: capsule.text,
        selectedRecordCount: 1,
        summary,
        sources,
        manifestHash: pack.manifestHash
      })
    ];
    return {
      records: events.length,
      requiredSourceEvents: sources.map((event) => ({ eventId: event.eventId, hashAlgorithm: "sha256" })),
      summary: { eventId: summary.eventId, hashAlgorithm: "sha256", bodySha256: sha256(summary.body) },
      packManifestHashAlgorithm: "sha256",
      methods
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function aggregatePrimary(softwareTrack) {
  const methodIds = softwareTrack.cases[0].methods.map((method) => method.id);
  const methods = methodIds.map((id) => {
    const observations = softwareTrack.cases.map((entry) => entry.methods.find((method) => method.id === id));
    assert.ok(observations.every(Boolean));
    const reference = softwareTrack.cases.map((entry) => (
      entry.methods.find((method) => method.id === "full-history-json-records")
    ));
    const totalModelFacingEstimatedTokens = observations.reduce((sum, item) => sum + item.totalModelFacingEstimatedTokens, 0);
    const referenceTokens = reference.reduce((sum, item) => sum + item.totalModelFacingEstimatedTokens, 0);
    return {
      id,
      label: observations[0].label,
      budgeted: observations[0].budgeted,
      fixedBudgetMethod: observations[0].fixedBudgetMethod,
      casesEligible: observations.filter((item) => item.eligible).length,
      allCasesEligible: observations.every((item) => item.eligible),
      answerGatePasses: observations.filter((item) => item.answerBearingEvidencePresent).length,
      citationGatePasses: observations.filter((item) => item.requiredCitationPairsPresent).length,
      memoryBudgetPasses: observations[0].budgeted
        ? observations.filter((item) => item.withinMemoryBudget === true).length
        : null,
      totalMemoryEstimatedTokens: observations.reduce((sum, item) => sum + item.memoryEstimatedTokens, 0),
      totalModelFacingEstimatedTokens,
      estimatedReductionVersusFullHistory: reduction(totalModelFacingEstimatedTokens, referenceTokens)
    };
  });
  return { methods };
}

const softwareTrack = await buildSoftwareTrack();
const continuationTrack = await buildContinuationTrack();
const primary = aggregatePrimary(softwareTrack);
const compactBm25Aggregate = primary.methods.find(
  (method) => method.id === "standalone-bm25-compact-audit-pack"
);
const qarinahAggregate = primary.methods.find(
  (method) => method.id === "qarinah-admission-first-v2-audit-pack"
);
assert.ok(compactBm25Aggregate && qarinahAggregate);
const scriptGateObservation = {
  status: "exploratory descriptive observation; no comparative ranking is designated",
  qarinahMethodId: qarinahAggregate.id,
  qarinahTotalModelFacingEstimatedTokens: qarinahAggregate.totalModelFacingEstimatedTokens,
  compactBm25MethodId: compactBm25Aggregate.id,
  compactBm25TotalModelFacingEstimatedTokens: compactBm25Aggregate.totalModelFacingEstimatedTokens,
  bothPassedCurrentScriptGateOnAllCases: qarinahAggregate.allCasesEligible
    && compactBm25Aggregate.allCasesEligible,
  interpretation: "The methods returned different item counts, so this observation does not establish a fixed-utility context-efficiency ranking."
};
const allowedObservation = `In the exploratory v1 script's six constructed cases, Qarinah produced ${qarinahAggregate.totalModelFacingEstimatedTokens.toLocaleString("en-US")} portable estimated model-facing tokens versus ${compactBm25Aggregate.totalModelFacingEstimatedTokens.toLocaleString("en-US")} for the compact BM25 control; both passed the script's target-body and citation-string presence gates on all six cases.`;
const sourceBinding = {
  evaluator: {
    path: "scripts/evaluate-context-efficiency-comparison-v1.mjs",
    sha256: await fileDigest("scripts/evaluate-context-efficiency-comparison-v1.mjs")
  },
  softwareFixture: {
    path: "bench/fixtures/software-task-scenarios.mjs",
    sha256: await fileDigest("bench/fixtures/software-task-scenarios.mjs")
  },
  implementation: await continuationImplementationManifest(repositoryRoot),
  limitations: [
    "The direct helper scripts/continuation-evidence-lib.mjs is not separately hashed in this v1 artifact.",
    "The Node runtime version and operating-system identity are not recorded in this v1 artifact.",
    "Temporary workspaces use random workspace IDs, so exact event, chain-head, and pack-manifest hashes vary between replays and are not retained here."
  ]
};
const artifact = {
  schemaVersion: "qarinah.context-efficiency-comparison-result.v1",
  packageVersion: packageJson.version,
  protocol: {
    status: "exploratory development benchmark; not externally preregistered and not a provider-backed final experiment",
    primaryFixture: "Committed six-task software-task fixture with 240 retained records",
    primaryCases: softwareTaskScenarios.length,
    portableMemoryBudgetTokens,
    maximumCompleteRecords: maximumRecords,
    tokenEstimator: estimator,
    providerReportedInputTokensMeasured: false,
    fixedBeforeOutcome: false,
    externallyPreregistered: false,
    protocolTiming: "The evaluator, protocol text, and v1 result were developed together. Parameters are fixed for deterministic replay of this artifact, but v1 was not frozen before its outcomes were observed.",
    eligibilityGate: "For every primary case: the exact fixture-defined answer-bearing target body plus its generated event ID and SHA-256 event hash must appear in model-facing context; fixed-budget methods must also remain within the common memory budget.",
    objective: "Descriptive token accounting under the v1 script gate. No fixed-utility ranking is designated because methods can return different item counts.",
    fullHistoryRole: "Uncapped stored-event JSON-record reference only; it is not assessed against the fixed memory budget.",
    stoppingRule: "Last-N and complete-record BM25 take a fixed top-eight prefix, stopping only when the next complete record would exceed the common budget. Compact BM25 uses the Qarinah audit-item envelope, excerpt truncation, reservation policy, and max(JSON, Markdown) accounting. No method stops after finding the oracle target.",
    compactLexicalControl: "Standalone BM25 ranking rendered through the same context-pack Markdown fields, citation/hash envelope, complete-excerpt policy, token reservations, 1,300-token limit, and maximum-eight-item rule as Qarinah, without Qarinah temporal/admission scoring.",
    packBudgetAccounting: "Qarinah and compact BM25 enforce their 1,300-token memory budget against max(pretty JSON tokens, rendered Markdown tokens). The primary size objective counts rendered Markdown because that is the model-facing representation used in this comparison; both values are retained per case.",
    taskQueryAccounting: "Current sources are identical within each case, but the explicit task query appears in Qarinah and compact-BM25 pack framing and is not added to the complete-record baselines. V1 therefore is not symmetric end-to-end prompt accounting.",
    answerCorrectnessOperationalization: "Exact fixture-defined answer-bearing evidence is present in input context; no model answer is generated or scored.",
    citationCorrectnessOperationalization: "Every required event ID and SHA-256 event hash is present in input context."
  },
  sourceBinding,
  primary: {
    fixtureRecords: softwareTrack.records,
    cases: softwareTrack.cases,
    aggregateMethods: primary.methods,
    scriptGateObservation
  },
  secondaryContinuation: {
    role: "One deterministic continuation fixture; descriptive only and excluded from the primary script-gate observation.",
    citationStringGate: "Exact summary answer plus summary event ID/hash and all three source event ID/hash strings anywhere in the rendered text. It does not require three distinct raw source records or their bodies.",
    evidenceReferenceGate: "Exact summary answer plus summary event ID/hash and either every source event ID/hash string or the exact audited context-pack manifest pointer.",
    ...continuationTrack
  },
  claimBoundary: {
    universalOrIndustryBestClaim: false,
    providerTokenClaim: false,
    taskSuccessClaim: false,
    comparativeRankingClaimAllowed: false,
    allowedObservation
  },
  limitations: [
    "This is a deterministic development fixture, not an untouched real-repository or provider-backed agent evaluation.",
    "Portable token counts use ceil(JavaScript string length / 4); they are estimates, not provider tokenizer output, usage receipts, or billing measurements.",
    "The primary answer gate checks whether predeclared answer-bearing evidence is present in the input. It does not ask a model to produce an answer or judge task success.",
    "Exact citation-pair presence tests transport integrity, not whether a model will cite or interpret the evidence correctly.",
    "The standalone BM25 baselines use a deterministic in-repository implementation with k1=1.2, b=0.75, and a 1.8 title boost; results do not generalize to every lexical implementation.",
    "The compact lexical control removes the complete-record formatter asymmetry, but retrieval and admission policies choose different item counts. V1 rewards smaller output after only one target passes its gate, so it does not hold evidence utility constant.",
    "Pack selection is constrained by max(pretty JSON, rendered Markdown) and reservation metadata, while the descriptive total counts rendered Markdown. JSON-only metadata can therefore change how many items are selected without appearing in the reported model-facing total.",
    "The explicit task query is embedded in the two audit-pack methods but omitted from complete-record baseline totals, so v1 is not symmetric end-to-end prompt accounting.",
    "V1 stores citation-presence booleans rather than the exact generated event hashes. Random workspace IDs make those hashes differ across replays.",
    "The continuation citation-string gate can pass when source ID/hash strings are embedded in summary metadata; it does not prove that every distinct raw source record and body is present.",
    "The runtime version and direct manifest-helper digest are not bound in v1.",
    "The secondary continuation comparison contains one constructed case and is not used for the primary claim.",
    "A compact capsule can pass the evidence-reference gate while failing the source-citation-string gate because it points to an audited pack instead of embedding every source citation string.",
    "No universal, industry-best, quality, latency, cost, or provider-token conclusion is supported."
  ]
};

assert.equal(softwareTrack.records, 240);
assert.equal(softwareTrack.cases.length, 6);
assert.equal(primary.methods.find((method) => method.id === "full-history-json-records")?.allCasesEligible, true);
assert.equal(primary.methods.find((method) => method.id === "last-n-complete-records")?.allCasesEligible, false);
assert.equal(continuationTrack.records, 42);
assert.equal(
  continuationTrack.methods.find((method) => method.id === "summary-only-no-citation-control")?.summaryAndSourceCitationStringsGate,
  false
);
assert.equal(
  continuationTrack.methods.find((method) => method.id === "qarinah-handoff-capsule")?.summaryAndSourceCitationStringsGate,
  false
);
assert.equal(
  continuationTrack.methods.find((method) => method.id === "qarinah-handoff-capsule")?.summaryAndEvidenceReferenceGate,
  true
);

if (writeResult) {
  await writeFile(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
} else {
  const committed = JSON.parse(await readFile(resultPath, "utf8"));
  assert.deepEqual(committed, artifact, "Context-efficiency comparison no longer matches its versioned artifact.");
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "qarinah.context-efficiency-comparison-run.v1",
  packageVersion: packageJson.version,
  resultPath: path.relative(repositoryRoot, resultPath).replaceAll("\\", "/"),
  primary: {
    scriptGateObservation: artifact.primary.scriptGateObservation,
    aggregateMethods: artifact.primary.aggregateMethods
  },
  secondaryContinuation: artifact.secondaryContinuation.methods,
  providerReportedInputTokensMeasured: false
}, null, 2)}\n`);
