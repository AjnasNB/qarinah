import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDerivedState,
  createEventEnvelope,
  rankContextEvents,
  tokenize
} from "../src/index.js";
import {
  buildCorpus,
  loadPinnedDataset,
  sha256,
  splitRows
} from "../bench/research/swe-bench-lite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const corpusPath = path.join(root, "bench", "research", "swe-bench-lite-v1.json");
const resultPath = path.join(root, "bench", "results", "research-retrieval-0.1.2.json");
const TOP_K = 10;
const BOOTSTRAP_SAMPLES = 10_000;

function deterministicEventId(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const compact = hex.join("");
  return `evt_${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function workspaceId(repository) {
  return `ws_${createHash("sha256").update(repository).digest("hex").slice(0, 32)}`;
}

function firstLine(value) {
  return value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean)?.slice(0, 512) || "SWE-bench task";
}

function eventText(event) {
  return `${event.title}\n${event.body}`;
}

function estimatedTokens(characters) {
  return Math.ceil(characters / 4);
}

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mean(values) {
  return values.length === 0 ? null : rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(probability * sorted.length) - 1));
  return rounded(sorted[index]);
}

function intersection(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function rankingMetrics(rankedIds, relevantIds) {
  if (relevantIds.size === 0) return null;
  const top = rankedIds.slice(0, TOP_K);
  const relevance = top.map((eventId) => relevantIds.has(eventId) ? 1 : 0);
  const hits = relevance.reduce((sum, value) => sum + value, 0);
  const first = relevance.indexOf(1);
  let dcg = 0;
  for (let index = 0; index < relevance.length; index += 1) {
    if (relevance[index]) dcg += 1 / Math.log2(index + 2);
  }
  let ideal = 0;
  for (let index = 0; index < Math.min(TOP_K, relevantIds.size); index += 1) ideal += 1 / Math.log2(index + 2);
  return {
    hitsAt10: hits,
    precisionAt10: rounded(hits / TOP_K),
    recallAt10: rounded(hits / relevantIds.size),
    reciprocalRank: first === -1 ? 0 : rounded(1 / (first + 1)),
    ndcgAt10: ideal === 0 ? 0 : rounded(dcg / ideal)
  };
}

function bm25Only(index, query, limit = TOP_K) {
  const queryTerms = tokenize(query);
  const documentCount = Math.max(1, index.events.length);
  const averageLength = index.averageDocumentLength > 0 ? index.averageDocumentLength : 1;
  const scores = [];
  for (const event of index.events) {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = event.termFrequencies?.[term] || 0;
      if (frequency === 0) continue;
      const documentsWithTerm = index.documentFrequency?.[term] || 0;
      const inverseFrequency = Math.log(1 + ((documentCount - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5)));
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * ((event.documentLength || 0) / averageLength));
      const titleBoost = event.titleTerms?.includes(term) ? 1.8 : 1;
      score += inverseFrequency * ((frequency * 2.2) / denominator) * titleBoost;
    }
    if (score > 0) scores.push({ eventId: event.eventId, score });
  }
  return scores
    .sort((left, right) => right.score - left.score || left.eventId.localeCompare(right.eventId))
    .slice(0, limit)
    .map((entry) => entry.eventId);
}

function pathGraphOnly(query, priorRecords, limit = TOP_K) {
  const normalizedQuery = query.toLowerCase();
  const knownPaths = new Set(priorRecords.flatMap((record) => record.patchFiles));
  const mentioned = [...knownPaths].filter((file) => {
    const normalized = file.toLowerCase();
    const base = normalized.split("/").at(-1);
    return normalizedQuery.includes(normalized) || (base.length >= 5 && normalizedQuery.includes(base));
  });
  if (mentioned.length === 0) return { ids: [], entityMentions: 0 };

  const adjacency = new Map();
  for (const record of priorRecords) {
    for (const left of record.patchFiles) {
      if (!adjacency.has(left)) adjacency.set(left, new Set());
      for (const right of record.patchFiles) if (left !== right) adjacency.get(left).add(right);
    }
  }
  const oneHop = new Set(mentioned.flatMap((file) => [...(adjacency.get(file) || [])]));
  const scores = priorRecords.map((record) => {
    const direct = intersection(record.patchFiles, new Set(mentioned)).length;
    const neighbor = intersection(record.patchFiles, oneHop).length;
    return { eventId: record.eventId, score: direct + neighbor * 0.5, sequence: record.repositorySequence };
  }).filter((entry) => entry.score > 0);
  return {
    ids: scores
      .sort((left, right) => right.score - left.score || right.sequence - left.sequence || left.eventId.localeCompare(right.eventId))
      .slice(0, limit)
      .map((entry) => entry.eventId),
    entityMentions: mentioned.length
  };
}

function contextVolume(ids, eventsById) {
  const characters = ids.reduce((sum, eventId) => sum + eventText(eventsById.get(eventId)).length, 0);
  return { characters, estimatedTokens: estimatedTokens(characters) };
}

function elapsedMilliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function materializeRepository(repository, repositoryRows, taskById) {
  let previousHash = null;
  const latestByFile = new Map();
  const records = [];
  for (const row of repositoryRows) {
    const task = taskById.get(row.instance_id);
    const eventId = deterministicEventId(row.instance_id);
    const related = new Set();
    for (const file of task.patchFiles) {
      const prior = latestByFile.get(file);
      if (prior) related.add(prior);
    }
    const event = createEventEnvelope({
      eventId,
      timestamp: task.createdAt,
      kind: "artifact",
      actor: { type: "source", id: "swe-bench-lite" },
      title: firstLine(row.problem_statement),
      body: `${row.problem_statement.trim()}\n\nResolved files from the completed historical task:\n${task.patchFiles.join("\n")}`,
      data: {
        instanceId: task.instanceId,
        benchmarkVersion: task.version,
        resolvedFiles: task.patchFiles.join(", ")
      },
      confidence: "verified",
      repository: { id: repository, branch: null, commit: task.baseCommit },
      disclosure: { classification: "public", scopes: [] },
      relations: [...related].slice(0, 128).sort().map((target) => ({ type: "references", target })),
      provenance: {
        adapter: "swe-bench-lite-research",
        sourceId: `https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite#${task.instanceId}`
      },
      retention: { class: "durable", expiresAt: null }
    }, {
      workspaceId: workspaceId(repository),
      previousHash
    });
    previousHash = event.hash;
    const record = { ...task, row, event, eventId };
    records.push(record);
    for (const file of task.patchFiles) latestByFile.set(file, eventId);
  }
  return records;
}

function summarizeMethod(taskResults, method) {
  const scorable = taskResults.filter((task) => task.scorable && task.methods[method].metrics !== null);
  const all = taskResults.map((task) => task.methods[method]);
  const citations = all.reduce((sum, item) => sum + item.ids.length, 0);
  const semanticHits = taskResults.reduce((sum, task) => (
    sum + task.methods[method].ids.filter((eventId) => task.relevantEventIds.includes(eventId)).length
  ), 0);
  return {
    tasks: taskResults.length,
    scorableTasks: scorable.length,
    meanPrecisionAt10: mean(scorable.map((task) => task.methods[method].metrics.precisionAt10)),
    meanRecallAt10: mean(scorable.map((task) => task.methods[method].metrics.recallAt10)),
    meanReciprocalRank: mean(scorable.map((task) => task.methods[method].metrics.reciprocalRank)),
    meanNdcgAt10: mean(scorable.map((task) => task.methods[method].metrics.ndcgAt10)),
    queriesWithAnyResult: all.filter((item) => item.ids.length > 0).length,
    totalCitations: citations,
    citationIdValidity: citations === 0 ? null : 1,
    semanticCitationPrecision: citations === 0 ? null : rounded(semanticHits / citations),
    totalContextCharacters: all.reduce((sum, item) => sum + item.volume.characters, 0),
    totalEstimatedContextTokens: all.reduce((sum, item) => sum + item.volume.estimatedTokens, 0)
  };
}

function seededRandom(seedText) {
  let state = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function pairedBootstrap(taskResults, left, right, metric, seed) {
  const pairs = taskResults
    .filter((task) => task.scorable)
    .map((task) => [task.methods[left].metrics[metric], task.methods[right].metrics[metric]]);
  const random = seededRandom(`${seed}:${left}:${right}:${metric}`);
  const differences = [];
  for (let sample = 0; sample < BOOTSTRAP_SAMPLES; sample += 1) {
    let difference = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      difference += pair[0] - pair[1];
    }
    differences.push(difference / pairs.length);
  }
  const observed = mean(pairs.map(([leftValue, rightValue]) => leftValue - rightValue));
  return {
    samples: BOOTSTRAP_SAMPLES,
    seed: sha256(`${seed}:${left}:${right}:${metric}`),
    pairedTasks: pairs.length,
    left,
    right,
    metric,
    observedMeanDifference: observed,
    confidenceInterval95: [percentile(differences, 0.025), percentile(differences, 0.975)],
    twoSidedBootstrapP: rounded(2 * Math.min(
      differences.filter((value) => value <= 0).length / differences.length,
      differences.filter((value) => value >= 0).length / differences.length
    ))
  };
}

function adversarialEvent(label, repository, timestamp, overrides = {}) {
  return {
    eventId: deterministicEventId(`adversarial:${repository}:${label}`),
    timestamp,
    kind: "decision",
    actor: { type: "source", id: "adversarial-suite" },
    title: `${repository} boundary-sentinel ${label}`,
    body: `boundary-sentinel ${repository} evidence ${label}`,
    data: { label },
    confidence: "verified",
    repository: { id: repository, branch: "main", commit: "a".repeat(40) },
    relations: [],
    provenance: { adapter: "qarinah-adversarial-eval", sourceId: label },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function runAdversarialSuite(repositories) {
  const cases = [];
  for (const repository of repositories) {
    const currentId = deterministicEventId(`adversarial:${repository}:current`);
    const raw = [
      adversarialEvent("active", repository, "2026-01-01T00:00:00.000Z"),
      adversarialEvent("superseded", repository, "2026-01-01T01:00:00.000Z"),
      adversarialEvent("current", repository, "2026-01-02T00:00:00.000Z", {
        eventId: currentId,
        relations: [{ type: "supersedes", target: deterministicEventId(`adversarial:${repository}:superseded`) }]
      }),
      adversarialEvent("expired", repository, "2026-01-03T00:00:00.000Z", {
        retention: { class: "project", expiresAt: "2026-01-05T00:00:00.000Z" }
      }),
      adversarialEvent("stale", repository, "2026-01-03T01:00:00.000Z", {
        temporal: { validFrom: "2026-01-03T01:00:00.000Z", validUntil: "2026-01-05T00:00:00.000Z" }
      }),
      adversarialEvent("restricted", repository, "2026-01-04T00:00:00.000Z", {
        disclosure: { classification: "restricted", scopes: ["research-private"] }
      }),
      adversarialEvent("other-repository", `${repository}-outside`, "2026-01-04T01:00:00.000Z"),
      adversarialEvent("future", repository, "2026-01-20T00:00:00.000Z")
    ].sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId));
    let previousHash = null;
    const events = raw.map((input) => {
      const event = createEventEnvelope(input, { workspaceId: workspaceId(`adversarial:${repository}`), previousHash });
      previousHash = event.hash;
      return event;
    });
    const index = buildDerivedState(events, workspaceId(`adversarial:${repository}`)).index;
    const result = rankContextEvents(index, `boundary-sentinel ${repository}`, {
      asOf: "2026-01-10T00:00:00.000Z",
      repositoryIds: [repository],
      authorityScopes: [],
      limit: 20
    });
    const returned = result.ranked.map((entry) => entry.event.eventId);
    const forbidden = raw.filter((event) => [
      "superseded", "expired", "stale", "restricted", "other-repository", "future"
    ].includes(event.data.label)).map((event) => event.eventId);
    cases.push({
      repository,
      forbiddenReturned: intersection(forbidden, new Set(returned)),
      activeReturned: returned.includes(deterministicEventId(`adversarial:${repository}:active`)),
      currentReturned: returned.includes(currentId),
      filters: result.filters,
      supersededExclusions: result.exclusions.filter((entry) => entry.reason === "superseded").length
    });
  }
  return {
    repositories: cases.length,
    adversarialRecords: cases.length * 6,
    forbiddenRecordsReturned: cases.reduce((sum, item) => sum + item.forbiddenReturned.length, 0),
    allActiveEvidenceReturned: cases.every((item) => item.activeReturned && item.currentReturned),
    allFutureRejected: cases.every((item) => item.filters.future === 1),
    allExpiredRejected: cases.every((item) => item.filters.expired === 1),
    allStaleRejected: cases.every((item) => item.filters.stale === 1),
    allUnauthorizedRejected: cases.every((item) => item.filters.unauthorized === 2),
    allSupersededRejected: cases.every((item) => item.supersededExclusions === 1),
    cases
  };
}

const { metadata, rows } = await loadPinnedDataset();
const corpus = buildCorpus(rows, metadata);
const committedCorpus = JSON.parse(await readFile(corpusPath, "utf8"));
assert.deepEqual(corpus, committedCorpus, "Run prepare-research-benchmark.mjs --write before evaluating.");
const phases = splitRows(rows);
const taskById = new Map(corpus.tasks.map((task) => [task.instanceId, task]));
const rowsByRepository = new Map();
for (const row of rows) {
  if (!rowsByRepository.has(row.repo)) rowsByRepository.set(row.repo, []);
  rowsByRepository.get(row.repo).push(row);
}
for (const repositoryRows of rowsByRepository.values()) {
  repositoryRows.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.instance_id.localeCompare(right.instance_id));
}

const taskResults = [];
const latency = { bm25: [], graph: [], qarinah: [], qarinahNoTemporal: [] };
for (const [repository, repositoryRows] of [...rowsByRepository].sort(([left], [right]) => left.localeCompare(right))) {
  const records = materializeRepository(repository, repositoryRows, taskById);
  const eventsById = new Map(records.map((record) => [record.eventId, record.event]));
  const fullIndex = buildDerivedState(records.map((record) => record.event), workspaceId(repository)).index;
  const afterAll = new Date(Date.parse(records.at(-1).createdAt) + 86_400_000).toISOString();
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index];
    if (phases.get(current.instanceId).phase !== "heldout") continue;
    const prior = records.slice(0, index);
    const priorEvents = prior.map((record) => record.event);
    const priorIndex = buildDerivedState(priorEvents, workspaceId(repository)).index;
    const asOf = new Date(Date.parse(current.createdAt) - 1).toISOString();
    const relevant = new Set(prior
      .filter((record) => intersection(record.patchFiles, new Set(current.patchFiles)).length > 0)
      .map((record) => record.eventId));
    const query = current.row.problem_statement;

    let started = process.hrtime.bigint();
    const bm25 = bm25Only(priorIndex, query);
    latency.bm25.push(elapsedMilliseconds(started));

    started = process.hrtime.bigint();
    const graph = pathGraphOnly(query, prior);
    latency.graph.push(elapsedMilliseconds(started));

    started = process.hrtime.bigint();
    const qarinahResult = rankContextEvents(priorIndex, query, {
      asOf,
      repositoryIds: [repository],
      authorityScopes: [],
      limit: TOP_K
    });
    latency.qarinah.push(elapsedMilliseconds(started));
    const qarinah = qarinahResult.ranked.map((entry) => entry.event.eventId);

    started = process.hrtime.bigint();
    const noTemporalResult = rankContextEvents(fullIndex, query, {
      asOf: afterAll,
      repositoryIds: [repository],
      authorityScopes: [],
      limit: TOP_K
    });
    latency.qarinahNoTemporal.push(elapsedMilliseconds(started));
    const noTemporal = noTemporalResult.ranked.map((entry) => entry.event.eventId);
    const lastN = [...prior].reverse().slice(0, TOP_K).map((record) => record.eventId);
    const fullHistory = prior.map((record) => record.eventId);
    const futureIds = new Set(records.slice(index).map((record) => record.eventId));
    const methodIds = { lastN, bm25, graph: graph.ids, qarinah, qarinahNoTemporal: noTemporal };
    const methods = Object.fromEntries(Object.entries(methodIds).map(([method, ids]) => [method, {
      ids,
      metrics: rankingMetrics(ids, relevant),
      volume: contextVolume(ids, eventsById)
    }]));
    taskResults.push({
      repository,
      instanceId: current.instanceId,
      repositorySequence: current.repositorySequence,
      scorable: relevant.size > 0,
      relevantEventIds: [...relevant].sort(),
      relevantPriorTasks: relevant.size,
      fullHistory: {
        priorTasks: fullHistory.length,
        recall: relevant.size === 0 ? null : 1,
        volume: contextVolume(fullHistory, eventsById)
      },
      graphEntityMentions: graph.entityMentions,
      coverage: qarinahResult.coverage.status,
      coverageGateAccepted: ["partial", "direct"].includes(qarinahResult.coverage.status),
      noCoverageGateAccepted: qarinah.length > 0,
      noTemporalFutureCitations: noTemporal.filter((eventId) => futureIds.has(eventId)).length,
      methods
    });
  }
}

const methods = ["lastN", "bm25", "graph", "qarinah", "qarinahNoTemporal"];
const summaries = Object.fromEntries(methods.map((method) => [method, summarizeMethod(taskResults, method)]));
const fullHistory = {
  tasks: taskResults.length,
  scorableTasks: taskResults.filter((task) => task.scorable).length,
  meanRecallAcrossScorableTasks: 1,
  totalContextCharacters: taskResults.reduce((sum, task) => sum + task.fullHistory.volume.characters, 0),
  totalEstimatedContextTokens: taskResults.reduce((sum, task) => sum + task.fullHistory.volume.estimatedTokens, 0)
};
const qarinahTokens = summaries.qarinah.totalEstimatedContextTokens;
fullHistory.qarinahEstimatedTokenReduction = rounded(1 - qarinahTokens / fullHistory.totalEstimatedContextTokens);
const unsupported = taskResults.filter((task) => !task.scorable);
const temporalCitations = summaries.qarinahNoTemporal.totalCitations;
const futureCitations = taskResults.reduce((sum, task) => sum + task.noTemporalFutureCitations, 0);
const adversarial = runAdversarialSuite(committedCorpus.repositories.map((entry) => entry.repository));

const expected = {
  corpus: {
    digest: corpus.contentDigest,
    repositories: corpus.counts.repositories,
    totalTasks: corpus.counts.totalTasks,
    warmupTasks: corpus.counts.warmupTasks,
    heldoutTasks: corpus.counts.heldoutTasks
  },
  evaluation: {
    topK: TOP_K,
    heldoutTasks: taskResults.length,
    scorableTasks: taskResults.filter((task) => task.scorable).length,
    unsupportedByFileOverlapOracle: unsupported.length,
    graphQueriesWithPathEntityMentions: taskResults.filter((task) => task.graphEntityMentions > 0).length,
    coverageGateAccepted: taskResults.filter((task) => task.coverageGateAccepted).length,
    noCoverageGateAccepted: taskResults.filter((task) => task.noCoverageGateAccepted).length,
    noCoverageGateAdditionalAcceptances: taskResults.filter((task) => task.noCoverageGateAccepted && !task.coverageGateAccepted).length,
    unsupportedCoverageGateAbstentions: unsupported.filter((task) => !task.coverageGateAccepted).length,
    noTemporalFutureCitations: futureCitations,
    noTemporalFutureCitationRate: temporalCitations === 0 ? null : rounded(futureCitations / temporalCitations)
  },
  baselines: {
    fullHistory,
    ...summaries
  },
  inference: [
    pairedBootstrap(taskResults, "qarinah", "bm25", "recallAt10", corpus.contentDigest),
    pairedBootstrap(taskResults, "qarinah", "bm25", "reciprocalRank", corpus.contentDigest)
  ],
  adversarial,
  taskResults: taskResults.map((task) => ({
    repository: task.repository,
    instanceId: task.instanceId,
    repositorySequence: task.repositorySequence,
    scorable: task.scorable,
    relevantPriorTasks: task.relevantPriorTasks,
    graphEntityMentions: task.graphEntityMentions,
    coverage: task.coverage,
    coverageGateAccepted: task.coverageGateAccepted,
    noTemporalFutureCitations: task.noTemporalFutureCitations,
    metrics: Object.fromEntries(methods.map((method) => [method, task.methods[method].metrics]))
  }))
};

const runtimeObservation = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  scope: "local retrieval only; excludes network fetch and index construction",
  milliseconds: Object.fromEntries(Object.entries(latency).map(([method, values]) => [method, {
    mean: mean(values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95)
  }]))
};

assert.equal(expected.evaluation.heldoutTasks, 240);
assert.equal(expected.adversarial.forbiddenRecordsReturned, 0);
assert.equal(expected.adversarial.allActiveEvidenceReturned, true);
assert.equal(expected.adversarial.allFutureRejected, true);
assert.equal(expected.adversarial.allExpiredRejected, true);
assert.equal(expected.adversarial.allStaleRejected, true);
assert.equal(expected.adversarial.allUnauthorizedRejected, true);
assert.equal(expected.adversarial.allSupersededRejected, true);
assert.ok(expected.evaluation.noTemporalFutureCitations > 0, "The no-temporal ablation must expose future leakage on this public corpus.");

const artifact = {
  schemaVersion: "qarinah.research-retrieval-eval-result.v1",
  packageVersion: packageJson.version,
  executionScope: {
    phase: "retrieval-and-governance",
    providerModelCalls: 0,
    providerReportedTokens: false,
    sweBenchDockerTaskExecution: false,
    humanCodeReview: false,
    estimatedTokenMethod: "ceil(chars/4)",
    claimBoundary: "This artifact does not measure patch correctness, SWE-bench resolve rate, provider usage, provider cost, or human-rated code quality."
  },
  expected,
  runtimeObservation
};

if (process.argv.includes("--write")) {
  await writeFile(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, resultPath)}.\n`);
} else {
  const committed = JSON.parse(await readFile(resultPath, "utf8"));
  assert.equal(committed.schemaVersion, artifact.schemaVersion);
  assert.equal(committed.packageVersion, artifact.packageVersion);
  assert.deepEqual(expected, committed.expected, "Research retrieval results no longer match the committed evidence.");
  process.stdout.write("Research retrieval and governance evidence matches the committed artifact.\n");
}

process.stdout.write(`${JSON.stringify({
  corpus: expected.corpus,
  evaluation: expected.evaluation,
  baselines: expected.baselines,
  inference: expected.inference,
  adversarial: {
    repositories: expected.adversarial.repositories,
    adversarialRecords: expected.adversarial.adversarialRecords,
    forbiddenRecordsReturned: expected.adversarial.forbiddenRecordsReturned
  },
  runtimeObservation
}, null, 2)}\n`);
