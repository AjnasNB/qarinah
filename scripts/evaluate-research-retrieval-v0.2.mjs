import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDerivedState, createEventEnvelope, rankContextEvents, tokenize } from "../src/index.js";
import { loadPinnedDevelopmentDataset } from "../bench/research/swe-bench-lite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const corpusPath = path.join(root, "bench", "research", "swe-bench-lite-development-v0.2.json");
const productionV04 = process.argv.includes("--production-v0.4");
const resultPath = path.join(root, "bench", "results", "research-retrieval-development-v0.4.json");
const TOP_K = 10;
const BUDGETS = Object.freeze([512, 1_000, 2_000, 4_000, 8_000]);
const BOOTSTRAP_SAMPLES = 10_000;
const HISTORICAL_V02 = Object.freeze({
  tag: "research-retrieval-development-v0.2",
  commit: "bd566ac5ba7b302653b994fd0622d516fa74bbb8",
  artifact: "bench/results/research-retrieval-development-v0.2.json",
  artifactSha256: "sha256:bfe8015811ffbecd5e3c00eb9f4a1e104478605cd605442a1ec96d67582e4b3f"
});
const IMPLEMENTATION_FILES = Object.freeze([
  "bench/research/swe-bench-lite.mjs",
  "scripts/evaluate-research-retrieval-v0.2.mjs",
  "scripts/evaluate-research-retrieval-v0.4.mjs",
  "src/canonical.js",
  "src/contracts.js",
  "src/index.js",
  "src/indexer.js",
  "src/interoperability/boundary.js",
  "src/redact.js",
  "src/retrieval.js"
]);

if (!productionV04) {
  throw new Error([
    "Development retrieval v0.2 is a frozen historical run and must not be recomputed with the current production runtime.",
    `Evaluate it from exact tag ${HISTORICAL_V02.tag} (commit ${HISTORICAL_V02.commit}) in a separate clean worktree:`,
    `  git worktree add ../qarinah-research-v0.2 ${HISTORICAL_V02.tag}`,
    "  cd ../qarinah-research-v0.2",
    "  npm ci",
    "  npm run evaluate:research-retrieval:v0.2",
    `The preserved artifact is ${HISTORICAL_V02.artifact} (${HISTORICAL_V02.artifactSha256}).`,
    "Run `npm run evaluate:research-retrieval:v0.4` on current source instead."
  ].join("\n"));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function implementationManifest() {
  const files = await Promise.all(IMPLEMENTATION_FILES.map(async (relativePath) => {
    const normalizedContent = (await readFile(path.join(root, relativePath), "utf8")).replace(/\r\n/gu, "\n");
    return { path: relativePath, sha256: sha256(normalizedContent) };
  }));
  return Object.freeze({
    algorithm: "sha256-path-lf-content-v1",
    productVersion: packageJson.version,
    rankingProfile: "admission-first-v2",
    evidenceSufficiencyMethod: "evidence-sufficiency-v2",
    files,
    digest: sha256(files.map((file) => `${file.path}\n${file.sha256}`).join("\n"))
  });
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
  return rounded(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * probability) - 1))]);
}

function deterministicEventId(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const compact = hex.join("");
  return `evt_${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function workspaceId(repository) {
  return `ws_${createHash("sha256").update(`v0.2:${repository}`).digest("hex").slice(0, 32)}`;
}

function firstLine(value) {
  return value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean)?.slice(0, 512) || "SWE-bench task";
}

function eventText(event) {
  return `${event.title}\n${event.body}`;
}

function estimatedTokens(textOrCharacters) {
  const characters = typeof textOrCharacters === "number" ? textOrCharacters : textOrCharacters.length;
  return Math.ceil(characters / 4);
}

function overlap(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function materializeRepository(repository, rows, taskById) {
  let previousHash = null;
  const latestByFile = new Map();
  const records = [];
  for (const row of rows) {
    const task = taskById.get(row.instance_id);
    const eventId = deterministicEventId(`v0.2:${task.instanceId}`);
    const relations = new Set();
    for (const file of task.patchFiles) {
      const previous = latestByFile.get(file);
      if (previous) relations.add(previous);
    }
    const event = createEventEnvelope({
      eventId,
      timestamp: task.createdAt,
      kind: "artifact",
      actor: { type: "source", id: "swe-bench-lite" },
      title: firstLine(row.problem_statement),
      body: [
        row.problem_statement.trim(),
        "",
        "Resolved production files from this completed historical task:",
        ...task.patchFiles,
        "",
        "Extracted changed symbols from this completed historical task:",
        ...task.changedSymbols
      ].join("\n"),
      data: {
        instanceId: task.instanceId,
        benchmarkVersion: task.version,
        resolvedFiles: task.patchFiles.join(", "),
        resolvedSymbols: task.changedSymbols.join(", "),
        moduleScopes: task.moduleScopes.join(", ")
      },
      confidence: "verified",
      repository: { id: repository, branch: null, commit: task.baseCommit },
      disclosure: { classification: "public", scopes: [] },
      relations: [...relations].sort().slice(0, 128).map((target) => ({ type: "references", target })),
      provenance: {
        adapter: "swe-bench-lite-development-v0.2",
        sourceId: `https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite#${task.instanceId}`
      },
      retention: { class: "durable", expiresAt: null }
    }, { workspaceId: workspaceId(repository), previousHash });
    previousHash = event.hash;
    records.push({ ...task, row, event, eventId });
    for (const file of task.patchFiles) latestByFile.set(file, eventId);
  }
  return records;
}

function relevanceGrades(prior, current) {
  const grades = new Map();
  const currentFiles = new Set(current.patchFiles);
  const currentSymbols = new Set(current.changedSymbols);
  const currentModules = new Set(current.moduleScopes);
  for (const record of prior) {
    const direct = overlap(record.patchFiles, currentFiles).length > 0
      || overlap(record.changedSymbols, currentSymbols).length > 0;
    const supporting = !direct && overlap(record.moduleScopes, currentModules).length > 0;
    if (direct) grades.set(record.eventId, 2);
    else if (supporting) grades.set(record.eventId, 1);
  }
  return grades;
}

function retrievalMetrics(ids, grades) {
  if (grades.size === 0) return null;
  const direct = new Set([...grades].filter(([, grade]) => grade === 2).map(([eventId]) => eventId));
  const relevant = new Set(grades.keys());
  const top10 = ids.slice(0, 10);
  const top5 = ids.slice(0, 5);
  const top1 = ids.slice(0, 1);
  const hits = (selected, targets) => selected.filter((eventId) => targets.has(eventId)).length;
  const first = ids.slice(0, 10).findIndex((eventId) => relevant.has(eventId));
  let dcg = 0;
  top10.forEach((eventId, index) => {
    const grade = grades.get(eventId) ?? 0;
    dcg += (2 ** grade - 1) / Math.log2(index + 2);
  });
  const idealGrades = [...grades.values()].sort((left, right) => right - left).slice(0, 10);
  const idcg = idealGrades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  return {
    recallAt1: rounded(hits(top1, relevant) / relevant.size),
    recallAt5: rounded(hits(top5, relevant) / relevant.size),
    recallAt10: rounded(hits(top10, relevant) / relevant.size),
    precisionAt5: rounded(hits(top5, relevant) / 5),
    precisionAt10: rounded(hits(top10, relevant) / 10),
    reciprocalRank: first === -1 ? 0 : rounded(1 / (first + 1)),
    ndcgAt10: idcg === 0 ? 0 : rounded(dcg / idcg),
    directRecallAt10: direct.size === 0 ? null : rounded(hits(top10, direct) / direct.size),
    supportingRecallAt10: rounded(hits(top10, relevant) / relevant.size)
  };
}

function bm25Only(index, query, limit = 100) {
  const queryTerms = tokenize(query);
  const documentCount = Math.max(1, index.events.length);
  const averageLength = index.averageDocumentLength > 0 ? index.averageDocumentLength : 1;
  return index.events.map((event) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = event.termFrequencies?.[term] || 0;
      if (frequency === 0) continue;
      const documentsWithTerm = index.documentFrequency?.[term] || 0;
      const inverseFrequency = Math.log(1 + ((documentCount - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5)));
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * ((event.documentLength || 0) / averageLength));
      score += inverseFrequency * ((frequency * 2.2) / denominator) * (event.titleTerms?.includes(term) ? 1.8 : 1);
    }
    return { eventId: event.eventId, score };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.eventId.localeCompare(right.eventId))
    .slice(0, limit).map((entry) => entry.eventId);
}

function oracleRanking(grades) {
  return [...grades].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([eventId]) => eventId);
}

function selectWithinBudget(ids, eventsById, budget) {
  const selected = [];
  let used = 0;
  for (const eventId of ids) {
    const tokens = estimatedTokens(eventText(eventsById.get(eventId)));
    if (used + tokens > budget) continue;
    selected.push(eventId);
    used += tokens;
  }
  return { ids: selected, tokens: used };
}

function summarize(taskResults, method) {
  const scorable = taskResults.filter((task) => task.metrics[method] !== null);
  const keys = ["recallAt1", "recallAt5", "recallAt10", "precisionAt5", "precisionAt10", "reciprocalRank", "ndcgAt10"];
  return {
    tasks: taskResults.length,
    scorableTasks: scorable.length,
    ...Object.fromEntries(keys.map((key) => [`mean${key[0].toUpperCase()}${key.slice(1)}`, mean(scorable.map((task) => task.metrics[method][key]))])),
    meanDirectRecallAt10: mean(scorable.map((task) => task.metrics[method].directRecallAt10).filter((value) => value !== null)),
    totalEstimatedContextTokens: taskResults.reduce((sum, task) => sum + task.volumes[method], 0)
  };
}

function classificationMetrics(observations) {
  const supported = observations.filter((entry) => entry.supported);
  const positives = observations.filter((entry) => entry.positive);
  const negatives = observations.filter((entry) => !entry.positive);
  const truePositive = supported.filter((entry) => entry.positive).length;
  const falsePositive = supported.filter((entry) => !entry.positive).length;
  const trueNegative = observations.filter((entry) => !entry.supported && !entry.positive).length;
  let concordant = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      concordant += positive.score > negative.score ? 1 : (positive.score === negative.score ? 0.5 : 0);
    }
  }
  const sorted = [...observations].sort((left, right) => right.score - left.score || Number(right.positive) - Number(left.positive));
  let seenPositive = 0;
  let averagePrecision = 0;
  sorted.forEach((entry, index) => {
    if (!entry.positive) return;
    seenPositive += 1;
    averagePrecision += seenPositive / (index + 1);
  });
  let calibrationError = 0;
  for (let bin = 0; bin < 10; bin += 1) {
    const lower = bin / 10;
    const upper = (bin + 1) / 10;
    const members = observations.filter((entry) => entry.score >= lower && (bin === 9 ? entry.score <= upper : entry.score < upper));
    if (members.length === 0) continue;
    calibrationError += (members.length / observations.length) * Math.abs(
      members.reduce((sum, entry) => sum + entry.score, 0) / members.length
      - members.filter((entry) => entry.positive).length / members.length
    );
  }
  const riskCoverage = [0.1, 0.25, 0.5, 0.75, 1].map((coverage) => {
    const count = Math.max(1, Math.ceil(sorted.length * coverage));
    const selected = sorted.slice(0, count);
    return {
      coverage,
      threshold: selected.at(-1).score,
      risk: rounded(1 - selected.filter((entry) => entry.positive).length / selected.length)
    };
  });
  return {
    positives: positives.length,
    noPositiveUnderStructuralOracle: negatives.length,
    supported: supported.length,
    supportedPrecision: supported.length === 0 ? null : rounded(truePositive / supported.length),
    supportedRecall: positives.length === 0 ? null : rounded(truePositive / positives.length),
    noPositiveFalseAcceptanceRate: negatives.length === 0 ? null : rounded(falsePositive / negatives.length),
    noPositiveCorrectAbstentionRate: negatives.length === 0 ? null : rounded(trueNegative / negatives.length),
    rocAuc: positives.length === 0 || negatives.length === 0 ? null : rounded(concordant / (positives.length * negatives.length)),
    prAucAveragePrecision: positives.length === 0 ? null : rounded(averagePrecision / positives.length),
    brierScore: mean(observations.map((entry) => (entry.score - Number(entry.positive)) ** 2)),
    expectedCalibrationError10Bin: rounded(calibrationError),
    riskCoverage
  };
}

function exactEdgeInterval95(successes, trials) {
  if (trials === 0) return null;
  const tail = 0.025;
  if (successes === 0) return {
    method: "Clopper-Pearson exact two-sided",
    successes,
    trials,
    lower: 0,
    upper: rounded(1 - (tail ** (1 / trials)))
  };
  if (successes === trials) return {
    method: "Clopper-Pearson exact two-sided",
    successes,
    trials,
    lower: rounded(tail ** (1 / trials)),
    upper: 1
  };
  throw new RangeError("This development artifact records exact edge intervals only for zero/all-success outcomes.");
}

function directDecisionMetrics(tasks) {
  const positives = tasks.filter((task) => task.positiveUnderStructuralOracle);
  const negatives = tasks.filter((task) => !task.positiveUnderStructuralOracle);
  const accepted = tasks.filter((task) => task.evidenceSufficiency.decision === "ACCEPT_DIRECT");
  const truePositive = accepted.filter((task) => task.positiveUnderStructuralOracle).length;
  const falsePositive = accepted.filter((task) => !task.positiveUnderStructuralOracle).length;
  const precision = accepted.length === 0 ? null : truePositive / accepted.length;
  const recall = positives.length === 0 ? null : truePositive / positives.length;
  assert.equal(falsePositive, 0, "Current production evidence-sufficiency-v2 produced a structural-oracle false accept.");
  assert.equal(truePositive, accepted.length, "Current production direct precision is not an all-success edge case.");
  return {
    method: "evidence-sufficiency-v2",
    directThreshold: 0.65,
    partialThreshold: 0.4,
    tasks: tasks.length,
    positives: positives.length,
    noPositiveUnderStructuralOracle: negatives.length,
    acceptedDirect: accepted.length,
    abstained: tasks.length - accepted.length,
    truePositive,
    falsePositive,
    trueNegative: negatives.length - falsePositive,
    falseNegative: positives.length - truePositive,
    acceptedPrecision: precision === null ? null : rounded(precision),
    acceptedRecall: recall === null ? null : rounded(recall),
    acceptedF1: precision === null || recall === null || precision + recall === 0
      ? null
      : rounded((2 * precision * recall) / (precision + recall)),
    falseAcceptanceRate: negatives.length === 0 ? null : rounded(falsePositive / negatives.length),
    correctAbstentionRate: negatives.length === 0 ? null : rounded((negatives.length - falsePositive) / negatives.length),
    acceptanceCoverage: rounded(accepted.length / tasks.length),
    stateCounts: Object.fromEntries(["DIRECTLY_SUPPORTED", "PARTIALLY_SUPPORTED", "INSUFFICIENT_EVIDENCE"]
      .map((state) => [state, tasks.filter((task) => task.evidenceSufficiency.state === state).length])),
    confidenceIntervals95: {
      acceptedPrecision: accepted.length === 0 ? null : exactEdgeInterval95(truePositive, accepted.length),
      falseAcceptanceRate: negatives.length === 0 ? null : exactEdgeInterval95(falsePositive, negatives.length)
    }
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

function repositoryClusterBootstrap(taskResults, left, right, metric, seed) {
  const byRepository = new Map();
  for (const task of taskResults.filter((entry) => entry.metrics[left] !== null)) {
    if (!byRepository.has(task.repository)) byRepository.set(task.repository, []);
    byRepository.get(task.repository).push(task);
  }
  const repositories = [...byRepository.keys()].sort();
  const random = seededRandom(`${seed}:${left}:${right}:${metric}:repository-cluster`);
  const differences = [];
  for (let sample = 0; sample < BOOTSTRAP_SAMPLES; sample += 1) {
    const sampled = [];
    for (let index = 0; index < repositories.length; index += 1) {
      sampled.push(...byRepository.get(repositories[Math.floor(random() * repositories.length)]));
    }
    differences.push(sampled.reduce((sum, task) => sum + task.metrics[left][metric] - task.metrics[right][metric], 0) / sampled.length);
  }
  const observed = mean(taskResults.filter((task) => task.metrics[left] !== null)
    .map((task) => task.metrics[left][metric] - task.metrics[right][metric]));
  return {
    method: "repository-clustered-bootstrap",
    samples: BOOTSTRAP_SAMPLES,
    clusters: repositories.length,
    pairedTasks: taskResults.filter((task) => task.metrics[left] !== null).length,
    left,
    right,
    metric,
    observedMeanDifference: observed,
    confidenceInterval95: [percentile(differences, 0.025), percentile(differences, 0.975)]
  };
}

function evaluateSetting(records, setting, taskById) {
  const warmup = records.filter((record) => record.phase === "warmup");
  const heldout = records.filter((record) => record.phase === "heldout");
  const eventsById = new Map(records.map((record) => [record.eventId, record.event]));
  const fullIndex = buildDerivedState(records.map((record) => record.event), workspaceId(records[0].repository)).index;
  const afterAll = new Date(Date.parse(records.at(-1).createdAt) + 86_400_000).toISOString();
  const results = [];
  for (const current of heldout) {
    const currentIndex = records.findIndex((record) => record.instanceId === current.instanceId);
    const prior = setting === "static"
      ? warmup
      : records.slice(0, currentIndex);
    const priorIndex = buildDerivedState(prior.map((record) => record.event), workspaceId(current.repository)).index;
    const grades = relevanceGrades(prior, current);
    const query = current.row.problem_statement;
    const asOf = current.createdAt;
    const bm25 = bm25Only(priorIndex, query);
    const balancedResult = rankContextEvents(priorIndex, query, {
      asOf,
      temporalBoundary: "strict-before",
      repositoryIds: [current.repository],
      rankingProfile: "balanced-v1",
      limit: 100
    });
    const qarinahResult = rankContextEvents(priorIndex, query, {
      asOf,
      temporalBoundary: "strict-before",
      repositoryIds: [current.repository],
      rankingProfile: "admission-first-v2",
      limit: 100
    });
    const noGraphResult = rankContextEvents(priorIndex, query, {
      asOf,
      temporalBoundary: "strict-before",
      repositoryIds: [current.repository],
      rankingProfile: "admission-first-v2",
      includeGraph: false,
      limit: 100
    });
    const noTemporalResult = rankContextEvents(fullIndex, query, {
      asOf: afterAll,
      repositoryIds: [current.repository],
      rankingProfile: "admission-first-v2",
      limit: TOP_K
    });
    const rankings = {
      bm25Admitted: bm25,
      balancedV1: balancedResult.ranked.map((entry) => entry.event.eventId),
      qarinahV2: qarinahResult.ranked.map((entry) => entry.event.eventId),
      qarinahV2NoGraph: noGraphResult.ranked.map((entry) => entry.event.eventId),
      oracle: oracleRanking(grades)
    };
    const futureIds = new Set(records.slice(currentIndex).map((record) => record.eventId));
    const noTemporalIds = noTemporalResult.ranked.map((entry) => entry.event.eventId);
    const volumes = Object.fromEntries(Object.entries(rankings).map(([method, ids]) => [
      method,
      ids.slice(0, TOP_K).reduce((sum, eventId) => sum + estimatedTokens(eventText(eventsById.get(eventId))), 0)
    ]));
    const budgets = Object.fromEntries(BUDGETS.map((budget) => [budget, Object.fromEntries(
      Object.entries(rankings).map(([method, ids]) => {
        const selected = selectWithinBudget(ids, eventsById, budget);
        return [method, { deliveredTokens: selected.tokens, metrics: retrievalMetrics(selected.ids, grades) }];
      })
    )]));
    const sufficiency = qarinahResult.evidenceSufficiency;
    assert.equal(sufficiency.method, "evidence-sufficiency-v2");
    assert.equal(sufficiency.directThreshold, 0.65);
    assert.equal(sufficiency.partialThreshold, 0.4);
    assert.equal(
      sufficiency.decision,
      sufficiency.state === "DIRECTLY_SUPPORTED" ? "ACCEPT_DIRECT" : "ABSTAIN"
    );
    results.push({
      repository: current.repository,
      instanceId: current.instanceId,
      repositorySequence: taskById.get(current.instanceId).repositorySequence,
      positiveUnderStructuralOracle: grades.size > 0,
      directRecords: [...grades.values()].filter((grade) => grade === 2).length,
      supportingRecords: [...grades.values()].filter((grade) => grade === 1).length,
      metrics: Object.fromEntries(Object.entries(rankings).map(([method, ids]) => [method, retrievalMetrics(ids, grades)])),
      volumes,
      budgets,
      evidenceSufficiency: {
        method: sufficiency.method,
        state: sufficiency.state,
        decision: sufficiency.decision,
        score: sufficiency.score,
        directThreshold: sufficiency.directThreshold,
        partialThreshold: sufficiency.partialThreshold,
        reasonCodes: sufficiency.reasonCodes
      },
      noTemporalFutureItems: noTemporalIds.filter((eventId) => futureIds.has(eventId)).length,
      noTemporalReturnedItems: noTemporalIds.length
    });
  }
  return results;
}

const committedCorpus = JSON.parse(await readFile(corpusPath, "utf8"));
const { corpus, rows } = await loadPinnedDevelopmentDataset({
  sourceArtifact: committedCorpus.generatedFrom.sourceArtifact
});
assert.deepEqual(corpus, committedCorpus, "Prepare the v0.2 development corpus first.");
const taskById = new Map(corpus.tasks.map((task) => [task.instanceId, task]));
const rowsByRepository = new Map();
for (const row of rows) {
  if (!rowsByRepository.has(row.repo)) rowsByRepository.set(row.repo, []);
  rowsByRepository.get(row.repo).push(row);
}
for (const repositoryRows of rowsByRepository.values()) {
  repositoryRows.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.instance_id.localeCompare(right.instance_id));
}

const settings = { static: [], onlinePrequential: [] };
const started = process.hrtime.bigint();
for (const [repository, repositoryRows] of [...rowsByRepository].sort(([left], [right]) => left.localeCompare(right))) {
  const records = materializeRepository(repository, repositoryRows, taskById);
  settings.static.push(...evaluateSetting(records, "static", taskById));
  settings.onlinePrequential.push(...evaluateSetting(records, "online", taskById));
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
const methods = ["bm25Admitted", "balancedV1", "qarinahV2", "qarinahV2NoGraph", "oracle"];

function settingSummary(tasks) {
  const returnedItems = tasks.reduce((sum, task) => sum + task.noTemporalReturnedItems, 0);
  const futureItems = tasks.reduce((sum, task) => sum + task.noTemporalFutureItems, 0);
  const affectedQueries = tasks.filter((task) => task.noTemporalFutureItems > 0).length;
  const classification = classificationMetrics(tasks.map((task) => ({
    positive: task.positiveUnderStructuralOracle,
    supported: task.evidenceSufficiency.state !== "INSUFFICIENT_EVIDENCE",
    score: task.evidenceSufficiency.score
  })));
  return {
    tasks: tasks.length,
    positiveUnderStructuralOracle: tasks.filter((task) => task.positiveUnderStructuralOracle).length,
    noPositiveUnderStructuralOracle: tasks.filter((task) => !task.positiveUnderStructuralOracle).length,
    methods: Object.fromEntries(methods.map((method) => [method, summarize(tasks, method)])),
    evidenceSufficiency: classification,
    directDecision: directDecisionMetrics(tasks),
    noTemporalAblation: {
      returnedItems,
      futureItems,
      futureItemRate: returnedItems === 0 ? null : rounded(futureItems / returnedItems),
      affectedQueries,
      affectedQueryRate: rounded(affectedQueries / tasks.length)
    },
    budgetCurves: Object.fromEntries(BUDGETS.map((budget) => [budget, Object.fromEntries(methods.map((method) => {
      const scorable = tasks.filter((task) => task.budgets[budget][method].metrics !== null);
      return [method, {
        meanRecallAt10: mean(scorable.map((task) => task.budgets[budget][method].metrics.recallAt10)),
        meanNdcgAt10: mean(scorable.map((task) => task.budgets[budget][method].metrics.ndcgAt10)),
        totalDeliveredTokens: tasks.reduce((sum, task) => sum + task.budgets[budget][method].deliveredTokens, 0)
      }];
    }))]))
  };
}

const expected = {
  corpus: {
    digest: corpus.contentDigest,
    rawTestParquetSha256: corpus.generatedFrom.sourceArtifact.sha256,
    officialPageDeclaredRepositories: 11,
    pinnedRevisionObservedRepositories: 12,
    discrepancyRecorded: true,
    exploratoryReuse: true,
    tasks: 300,
    heldoutTasks: 240
  },
  settings: {
    static: settingSummary(settings.static),
    onlinePrequential: settingSummary(settings.onlinePrequential)
  },
  inference: [
    repositoryClusterBootstrap(settings.onlinePrequential, "qarinahV2", "bm25Admitted", "recallAt10", corpus.contentDigest),
    repositoryClusterBootstrap(settings.onlinePrequential, "qarinahV2", "balancedV1", "recallAt10", corpus.contentDigest),
    repositoryClusterBootstrap(settings.onlinePrequential, "qarinahV2", "balancedV1", "reciprocalRank", corpus.contentDigest)
  ],
  taskResults: {
    static: settings.static,
    onlinePrequential: settings.onlinePrequential
  }
};

assert.equal(expected.settings.static.tasks, 240);
assert.equal(expected.settings.onlinePrequential.tasks, 240);
assert.ok(expected.settings.onlinePrequential.methods.qarinahV2.meanRecallAt10
  >= expected.settings.onlinePrequential.methods.balancedV1.meanRecallAt10);
assert.ok(expected.settings.onlinePrequential.noTemporalAblation.futureItems > 0);

const stableArtifact = {
  schemaVersion: "qarinah.research-retrieval-development-result.v4",
  packageVersion: packageJson.version,
  status: "current-production-recomputation-on-inspected-development-corpus",
  confirmatoryClaimEligible: false,
  implementation: await implementationManifest(),
  historicalLineage: {
    v02: HISTORICAL_V02,
    v03: {
      artifact: "bench/results/research-sufficiency-development-v0.3.json",
      interpretation: "Historical post-hoc threshold calibration over the frozen evidence-sufficiency-v1 scores in v0.2; preserved unchanged."
    },
    current: "Production evidence-sufficiency-v2 scores and decisions recomputed as development v0.4."
  },
  executionScope: {
    providerModelCalls: 0,
    providerReportedTokens: false,
    sweBenchDockerTaskExecution: false,
    humanRelevanceReview: false,
    humanCodeReview: false,
    claimBoundary: "Development evidence only. The corpus was already inspected, the v0.4 run is bound to current production source hashes, and structural oracle labels are not human relevance judgments."
  },
  expected
};
const artifact = {
  ...stableArtifact,
  runtimeObservation: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    totalEvaluationMs: rounded(elapsedMs)
  }
};

if (process.argv.includes("--write")) {
  await writeFile(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(root, resultPath)}.\n`);
} else {
  const committed = JSON.parse(await readFile(resultPath, "utf8"));
  assert.equal(committed.schemaVersion, artifact.schemaVersion);
  const { runtimeObservation: _committedRuntime, ...committedStable } = committed;
  assert.deepEqual(stableArtifact, committedStable, "Production-bound development-v0.4 evidence drifted from the committed artifact.");
  process.stdout.write("Production-bound development-v0.4 evidence matches the committed artifact.\n");
}

process.stdout.write(`${JSON.stringify({
  corpus: expected.corpus,
  static: expected.settings.static,
  onlinePrequential: expected.settings.onlinePrequential,
  inference: expected.inference,
  runtimeObservation: artifact.runtimeObservation
}, null, 2)}\n`);
