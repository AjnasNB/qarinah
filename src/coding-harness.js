import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { reviewMetadataEventInput } from "./capture-policy.js";
import { compileContextFromVerifiedEvents } from "./compiler.js";
import { listGitWorktrees } from "./git-worktrees.js";
import { markdownDataBlock, markdownInline, markdownSafeText } from "./markdown.js";
import { redactText } from "./redact.js";
import { rebuildDerivedState } from "./indexer.js";
import { appendEvent, readEvents } from "./store.js";
import { PORTABLE_TOKEN_ESTIMATOR, estimateTokens } from "./token-budget.js";
import { loadWorkspace } from "./workspace.js";
import { throwIfAborted, validateAbortSignal } from "./abort.js";

export const CODING_CONTEXT_HARNESS_SCHEMA_VERSION = "qarinah.coding-context-harness.v1";

const HARNESS_ADAPTER = "qarinah.coding-harness";
const DEFAULT_QUERY = "project decisions changes tool outcomes tests failures next steps";
const PUBLISHED_BENCHMARK = Object.freeze({
  scope: "published six-fixture repeated-input estimate",
  fixtureCount: 6,
  baselineTokens: 442_113,
  deliveredTokens: 5_682,
  reductionPercent: 98.71,
  exactReductionPercent: 98.7148,
  baselineToPackRatio: 77.81,
  estimator: "fixture token counts from the published comparison artifact",
  guarantee: false
});

function integer(value, label, minimum, maximum, fallback) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return selected;
}

function boolean(value, label, fallback) {
  const selected = value ?? fallback;
  if (typeof selected !== "boolean") throw new TypeError(`${label} must be a boolean.`);
  return selected;
}

function text(value, label, maximum, fallback) {
  const selected = value ?? fallback;
  if (typeof selected !== "string" || selected.length > maximum) {
    throw new TypeError(`${label} must be a string up to ${maximum} characters.`);
  }
  return selected;
}

function stringList(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 64
    || value.some((item) => typeof item !== "string" || item.trim() === "" || item.length > 256)) {
    throw new TypeError(`${label} must contain at most 64 non-empty strings up to 256 characters.`);
  }
  if (new Set(value).size !== value.length) throw new TypeError(`${label} cannot contain duplicates.`);
  return Object.freeze([...value].sort());
}

function normalizeSummarizer(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("summarizer must be a record.");
  }
  const unknown = Object.keys(value).filter((key) => !["id", "summarize"].includes(key));
  if (unknown.length > 0) throw new TypeError(`summarizer contains unknown field(s): ${unknown.join(", ")}.`);
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value.id)) {
    throw new TypeError("summarizer.id must be a lowercase identifier up to 64 characters.");
  }
  if (typeof value.summarize !== "function") throw new TypeError("summarizer.summarize must be a function.");
  return value;
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Coding harness options must be a record.");
  }
  const allowed = new Set([
    "cwd", "query", "scope", "maxChars", "maxTokens", "reserveTokens", "limit",
    "maxSummaryChars", "authorityScopes", "repositoryIds", "summarizer", "record",
    "rebuild", "updateCheckpoint", "signal", "clock"
  ]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`Coding harness options contain unknown field(s): ${unknown.join(", ")}.`);
  if (options.cwd !== undefined && (typeof options.cwd !== "string" || options.cwd.trim() === "")) {
    throw new TypeError("cwd must be a non-empty path string.");
  }
  const scope = options.scope ?? "current";
  if (!["current", "repository"].includes(scope)) throw new TypeError("scope must be current or repository.");
  const signal = validateAbortSignal(options.signal);
  if (options.clock !== undefined && typeof options.clock !== "function") throw new TypeError("clock must be a function.");
  const now = options.clock === undefined ? new Date() : options.clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("clock must return a valid Date.");
  const generatedAt = now.toISOString();
  if (generatedAt.length !== 24) throw new TypeError("clock must return a four-digit UTC calendar year.");
  const record = boolean(options.record, "record", false);
  if (scope === "repository" && record) {
    throw new TypeError("record cannot be combined with repository scope; record each worktree independently.");
  }
  return Object.freeze({
    cwd: options.cwd ?? process.cwd(),
    query: text(options.query, "query", 4_096, DEFAULT_QUERY),
    scope,
    maxChars: integer(options.maxChars, "maxChars", 512, 1_000_000, 12_000),
    maxTokens: options.maxTokens === undefined
      ? undefined
      : integer(options.maxTokens, "maxTokens", 128, 1_000_000),
    reserveTokens: options.reserveTokens === undefined
      ? undefined
      : integer(options.reserveTokens, "reserveTokens", 0, 999_936),
    limit: integer(options.limit, "limit", 1, 64, 20),
    maxSummaryChars: integer(options.maxSummaryChars, "maxSummaryChars", 256, 16_384, 2_000),
    authorityScopes: stringList(options.authorityScopes, "authorityScopes"),
    repositoryIds: stringList(options.repositoryIds, "repositoryIds"),
    summarizer: normalizeSummarizer(options.summarizer),
    record,
    rebuild: boolean(options.rebuild, "rebuild", true),
    updateCheckpoint: boolean(options.updateCheckpoint, "updateCheckpoint", false),
    signal,
    generatedAt
  });
}

function eventIdFromDigest(value) {
  const digits = sha256(value).slice("sha256:".length, "sha256:".length + 32).split("");
  digits[12] = "4";
  digits[16] = "8";
  const hex = digits.join("");
  return `evt_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function comparison(baselineTokens, deliveredTokens) {
  const savedTokens = Math.max(0, baselineTokens - deliveredTokens);
  const reductionPercent = baselineTokens > 0
    ? Math.round((savedTokens / baselineTokens) * 10000) / 100
    : null;
  const ratio = deliveredTokens > 0
    ? Math.round((baselineTokens / deliveredTokens) * 100) / 100
    : null;
  return Object.freeze({
    baselineTokens,
    deliveredTokens,
    savedTokens,
    reductionPercent,
    baselineToPackRatio: ratio,
    publishedBenchmarkMatched: reductionPercent !== null && reductionPercent >= PUBLISHED_BENCHMARK.reductionPercent
  });
}

function sourceDescriptors(pack) {
  return Object.freeze(pack.items.map((item) => Object.freeze({
    eventId: item.eventId,
    hash: item.hash,
    kind: item.kind
  })));
}

function deterministicSummary(pack, maximum) {
  const lines = [
    "Evidence-linked coding context checkpoint.",
    `Query: ${pack.query || "latest project context"}`,
    `Pack: ${pack.manifestHash}`
  ];
  for (const item of pack.items) {
    const excerpt = item.excerpt.replace(/\s+/gu, " ").trim();
    lines.push(`- [${item.kind}] ${item.title} (${item.eventId} ${item.hash})${excerpt ? `: ${excerpt}` : ""}`);
  }
  const joined = markdownSafeText(redactText(lines.join("\n")));
  if (joined.length <= maximum) return joined;
  const marker = `\n[QARINAH_COMPACTED:${joined.length - maximum}]`;
  return `${joined.slice(0, Math.max(0, maximum - marker.length))}${marker}`;
}

function normalizeSummaryResult(value, maximum) {
  const candidate = typeof value === "string" ? { text: value } : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("summarizer.summarize must return a string or a record.");
  }
  const unknown = Object.keys(candidate).filter((key) => !["text", "model"].includes(key));
  if (unknown.length > 0) throw new TypeError(`summarizer result contains unknown field(s): ${unknown.join(", ")}.`);
  if (typeof candidate.text !== "string" || candidate.text.trim() === "" || candidate.text.length > maximum) {
    throw new TypeError(`summarizer result text must be non-empty and no longer than ${maximum} characters.`);
  }
  if (candidate.model !== undefined
    && (typeof candidate.model !== "string" || candidate.model.trim() === "" || candidate.model.length > 256)) {
    throw new TypeError("summarizer result model must be a non-empty string up to 256 characters.");
  }
  return Object.freeze({ text: markdownSafeText(redactText(candidate.text)), model: candidate.model ?? null });
}

function runKey(options, worktree, sourceHeadHash) {
  return sha256({
    query: options.query,
    maxChars: options.maxChars,
    maxTokens: options.maxTokens ?? null,
    reserveTokens: options.reserveTokens ?? null,
    limit: options.limit,
    maxSummaryChars: options.maxSummaryChars,
    summarizer: options.summarizer?.id ?? "deterministic-extractive-v1",
    repositoryId: worktree?.repositoryId ?? null,
    worktreeId: worktree?.worktreeId ?? null,
    sourceHeadHash
  });
}

function existingHarnessRecord(events, key) {
  return [...events].reverse().find((event) => (
    event.provenance?.adapter === HARNESS_ADAPTER
    && event.data?.codingHarness?.runKey === key
  )) ?? null;
}

function latestHarnessCheckpoint(events, options, worktree) {
  return [...events].reverse().find((event) => (
    event.provenance?.adapter === HARNESS_ADAPTER
    && event.data?.codingHarness?.query === options.query
    && (event.data?.codingHarness?.worktreeId ?? null) === (worktree?.worktreeId ?? null)
    && (event.data?.codingHarness?.repositoryId ?? null) === (worktree?.repositoryId ?? null)
  )) ?? null;
}

function incrementalState(sourceEvents, sourceHeadHash, previous) {
  const previousSourceHeadHash = previous?.data?.codingHarness?.sourceHeadHash ?? null;
  if (previous === null) {
    return Object.freeze({
      mode: "initial",
      previousCheckpointEventId: null,
      previousSourceHeadHash: null,
      currentSourceHeadHash: sourceHeadHash,
      sourceEventCount: sourceEvents.length,
      changedEventCount: sourceEvents.length
    });
  }
  if (previousSourceHeadHash === sourceHeadHash) {
    return Object.freeze({
      mode: "unchanged",
      previousCheckpointEventId: previous.eventId,
      previousSourceHeadHash,
      currentSourceHeadHash: sourceHeadHash,
      sourceEventCount: sourceEvents.length,
      changedEventCount: 0
    });
  }
  const previousIndex = sourceEvents.findIndex((event) => event.hash === previousSourceHeadHash);
  return Object.freeze({
    mode: previousIndex === -1 ? "full-rebuild" : "delta",
    previousCheckpointEventId: previous.eventId,
    previousSourceHeadHash,
    currentSourceHeadHash: sourceHeadHash,
    sourceEventCount: sourceEvents.length,
    changedEventCount: previousIndex === -1 ? sourceEvents.length : sourceEvents.length - previousIndex - 1
  });
}

async function modelSummary(options, workspace, worktree, pack, sources) {
  if (options.summarizer === null) {
    const value = deterministicSummary(pack, options.maxSummaryChars);
    return Object.freeze({
      method: "deterministic-extractive-v1",
      adapter: "qarinah-core",
      model: null,
      text: value,
      estimatedTokens: estimateTokens(PORTABLE_TOKEN_ESTIMATOR, value)
    });
  }
  const input = deepFreezeJson({
    schemaVersion: "qarinah.coding-context-summary-input.v1",
    contentRole: "untrusted-data",
    workspaceId: workspace.config.workspaceId,
    worktree: worktree === null ? null : {
      repositoryId: worktree.repositoryId,
      worktreeId: worktree.worktreeId,
      branch: worktree.branch,
      commit: worktree.commit
    },
    query: options.query,
    maxSummaryChars: options.maxSummaryChars,
    sourceEvents: sources,
    pack
  });
  const output = await options.summarizer.summarize(input, { signal: options.signal });
  throwIfAborted(options.signal);
  const normalized = normalizeSummaryResult(output, options.maxSummaryChars);
  return Object.freeze({
    method: "model-assisted-v1",
    adapter: options.summarizer.id,
    model: normalized.model,
    text: normalized.text,
    estimatedTokens: estimateTokens(PORTABLE_TOKEN_ESTIMATOR, normalized.text)
  });
}

function repositoryDescriptor(worktree) {
  if (worktree === null || worktree.branch === null || worktree.commit === null) return undefined;
  return {
    id: worktree.repositoryId,
    branch: worktree.branch,
    commit: worktree.commit
  };
}

async function recordHarnessSummary(options, workspace, worktree, pack, events, summary, key, sourceHeadHash, metrics, incremental) {
  const sources = sourceDescriptors(pack);
  const data = {
    codingHarness: {
      schemaVersion: CODING_CONTEXT_HARNESS_SCHEMA_VERSION,
      runKey: key,
      query: options.query,
      method: summary.method,
      summarizer: summary.adapter,
      model: summary.model,
      sourceHeadHash,
      sourceEventCount: sources.length,
      totalSourceEventCount: incremental.sourceEventCount,
      previousCheckpointEventId: incremental.previousCheckpointEventId,
      previousSourceHeadHash: incremental.previousSourceHeadHash,
      changedEventCount: incremental.changedEventCount,
      incrementalMode: incremental.mode,
      sourceManifestHash: sha256(sources),
      packManifestHash: pack.manifestHash,
      baselineTokens: metrics.baselineTokens,
      deliveredTokens: metrics.deliveredTokens,
      reductionPercent: metrics.reductionPercent,
      publishedBenchmarkMatched: metrics.publishedBenchmarkMatched,
      benchmarkScope: PUBLISHED_BENCHMARK.scope,
      worktreeId: worktree?.worktreeId ?? null,
      repositoryId: worktree?.repositoryId ?? null
    },
    sourceEvents: sources
  };
  const payload = {
    eventId: eventIdFromDigest({ workspaceId: workspace.config.workspaceId, runKey: key }),
    kind: "summary",
    actor: { type: "system", id: "qarinah-coding-harness" },
    title: "Coding context checkpoint",
    body: workspace.config.capture === "content" ? summary.text : "",
    data,
    confidence: summary.method === "model-assisted-v1" ? "inferred" : "extracted",
    relations: sources.slice(0, 64).map((source) => ({ type: "derived_from", target: source.eventId })),
    ...(repositoryDescriptor(worktree) === undefined ? {} : { repository: repositoryDescriptor(worktree) }),
    provenance: { adapter: HARNESS_ADAPTER, sourceId: `pack:${pack.manifestHash}` },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
  const input = workspace.config.capture === "metadata" ? reviewMetadataEventInput(payload) : payload;
  const event = await appendEvent(input, {
    workspace,
    capture: workspace.config.capture,
    idempotent: true,
    signal: options.signal
  });
  if (options.rebuild) await rebuildDerivedState(workspace.root, { signal: options.signal });
  return Object.freeze({ status: existingHarnessRecord(events, key) ? "reused" : "created", eventId: event.eventId, hash: event.hash });
}

async function compileWorktree(options, descriptor, isCurrent) {
  throwIfAborted(options.signal);
  const workspace = await loadWorkspace(descriptor.root);
  const events = await readEvents(workspace, {
    updateCheckpoint: options.updateCheckpoint,
    signal: options.signal
  });
  const sourceEvents = events.filter((event) => event.provenance?.adapter !== HARNESS_ADAPTER);
  const sourceHeadHash = sourceEvents.at(-1)?.hash ?? null;
  const worktree = workspace.worktree ?? (descriptor.schemaVersion === "qarinah.git-worktree.v1" ? descriptor : null);
  const key = runKey(options, worktree, sourceHeadHash);
  const previous = existingHarnessRecord(events, key);
  const incremental = incrementalState(sourceEvents, sourceHeadHash, latestHarnessCheckpoint(events, options, worktree));
  const pack = await compileContextFromVerifiedEvents(options.query, {
    workspace,
    events: sourceEvents,
    maxChars: Math.min(options.maxChars, workspace.config.contextMaxChars),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options.reserveTokens === undefined ? {} : { reserveTokens: options.reserveTokens }),
    limit: options.limit,
    minimumCoverage: "any",
    rankingProfile: "admission-first-v2",
    authorityScopes: options.authorityScopes,
    repositoryIds: options.repositoryIds,
    updateCheckpoint: options.updateCheckpoint,
    clock: () => new Date(options.generatedAt)
  });
  const ledgerCharacters = sourceEvents.reduce((total, event) => total + canonicalStringify(event).length + 1, 0);
  const baselineTokens = sourceEvents.length === 0 ? 0 : Math.ceil(ledgerCharacters / 4);
  const metrics = comparison(baselineTokens, pack.budget.estimatedTokens);
  const sources = sourceDescriptors(pack);
  let summary;
  let recording = Object.freeze({ status: "not-requested", eventId: null, hash: null });
  if (options.record && previous !== null) {
    const value = previous.body || "[Summary content was not retained by the metadata-only capture policy.]";
    summary = Object.freeze({
      method: previous.data?.codingHarness?.method ?? "deterministic-extractive-v1",
      adapter: previous.data?.codingHarness?.summarizer ?? "qarinah-core",
      model: previous.data?.codingHarness?.model ?? null,
      text: value,
      estimatedTokens: estimateTokens(PORTABLE_TOKEN_ESTIMATOR, value)
    });
    recording = Object.freeze({ status: "reused", eventId: previous.eventId, hash: previous.hash });
  } else {
    summary = await modelSummary(options, workspace, worktree, pack, sources);
    if (options.record) {
      recording = await recordHarnessSummary(
        options, workspace, worktree, pack, events, summary, key, sourceHeadHash, metrics, incremental
      );
    }
  }
  return deepFreezeJson({
    status: "ready",
    current: isCurrent,
    root: workspace.root,
    workspaceId: workspace.config.workspaceId,
    capture: workspace.config.capture,
    worktree,
    source: {
      eventCount: events.length,
      sourceEventCount: sourceEvents.length,
      headHash: events.at(-1)?.hash ?? null,
      sourceHeadHash,
      ledgerCharacters,
      ledgerEstimatedTokens: baselineTokens
    },
    pack,
    summary,
    comparison: metrics,
    incremental,
    recording
  });
}

function aggregate(worktrees) {
  const ready = worktrees.filter((entry) => entry.status === "ready");
  const baselineTokens = ready.reduce((total, entry) => total + entry.comparison.baselineTokens, 0);
  const deliveredTokens = ready.reduce((total, entry) => total + entry.comparison.deliveredTokens, 0);
  return Object.freeze({
    discoveredWorktrees: worktrees.length,
    readyWorktrees: ready.length,
    uninitializedWorktrees: worktrees.filter((entry) => entry.status === "uninitialized").length,
    complete: worktrees.every((entry) => entry.status === "ready"),
    comparison: comparison(baselineTokens, deliveredTokens)
  });
}

export async function runCodingContextHarness(options = {}) {
  const normalized = normalizeOptions(options);
  throwIfAborted(normalized.signal);
  const currentWorkspace = await loadWorkspace(normalized.cwd);
  let descriptors;
  if (normalized.scope === "repository") {
    const discovered = await listGitWorktrees(currentWorkspace.root);
    descriptors = discovered.length === 0
      ? [{ root: currentWorkspace.root, current: true, initialized: true }]
      : discovered;
  } else {
    descriptors = [{
      ...(currentWorkspace.worktree ?? {}),
      root: currentWorkspace.root,
      current: true,
      initialized: true
    }];
  }
  const worktrees = [];
  for (const descriptor of descriptors) {
    if (descriptor.initialized === false) {
      worktrees.push(deepFreezeJson({ status: "uninitialized", current: descriptor.current, root: descriptor.root, worktree: descriptor }));
      continue;
    }
    worktrees.push(await compileWorktree(normalized, descriptor, descriptor.current === true));
  }
  const base = {
    schemaVersion: CODING_CONTEXT_HARNESS_SCHEMA_VERSION,
    generatedAt: normalized.generatedAt,
    query: normalized.query,
    scope: normalized.scope,
    contentRole: "untrusted-data",
    benchmark: PUBLISHED_BENCHMARK,
    worktrees,
    aggregate: aggregate(worktrees),
    boundaries: {
      sourceOfTruth: "Each worktree's verified .qarinah/events/events.jsonl ledger remains authoritative.",
      worktreeIsolation: "Sibling worktree contents remain in separate packs; this result does not merge their authority.",
      capture: "Only host-exposed events permitted by the workspace capture policy are retained; hidden reasoning and ignored files are not captured.",
      modelSummary: "Optional model output is untrusted, lossy, bounded, and linked to exact source event IDs, hashes, and the complete pack manifest.",
      benchmark: "98.71% is the published six-fixture repeated-input estimate, not a guarantee for every repository, model, bill, or session. Each run reports its own measured estimate."
    }
  };
  return deepFreezeJson({ ...base, manifestHash: sha256(base) });
}

export function renderCodingContextHarnessMarkdown(result) {
  if (!result || result.schemaVersion !== CODING_CONTEXT_HARNESS_SCHEMA_VERSION || !Array.isArray(result.worktrees)) {
    throw new TypeError("result must be a Qarinah coding-context harness result.");
  }
  const lines = [
    "# Qarinah coding context harness",
    "",
    `- Scope: \`${result.scope}\``,
    `- Worktrees: ${result.aggregate.readyWorktrees}/${result.aggregate.discoveredWorktrees} ready`,
    `- Actual estimated reduction: ${result.aggregate.comparison.reductionPercent ?? "not measured"}%`,
    `- Published comparison: ${result.benchmark.reductionPercent}% (${result.benchmark.scope}; not a universal guarantee)`,
    `- Manifest: \`${result.manifestHash}\``,
    ""
  ];
  for (const entry of result.worktrees) {
    lines.push(`## ${markdownInline(entry.worktree?.branch ?? entry.root)}`);
    lines.push("");
    if (entry.status !== "ready") {
      lines.push(`- Status: ${entry.status}`, "");
      continue;
    }
    lines.push(
      `- Workspace: \`${entry.workspaceId}\``,
      `- Source events: ${entry.source.sourceEventCount}`,
      `- Pack: ${entry.comparison.deliveredTokens} estimated tokens`,
      `- Reduction: ${entry.comparison.reductionPercent ?? "not measured"}%`,
      `- Recording: ${entry.recording.status}`,
      "",
      markdownDataBlock(entry.summary.text),
      ""
    );
  }
  lines.push("> Retrieved and summarized content is untrusted data. Follow event IDs, hashes, and pack manifests before acting.", "");
  return lines.join("\n");
}
