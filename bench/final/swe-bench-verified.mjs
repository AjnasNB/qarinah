import { createHash } from "node:crypto";

export const VERIFIED_DATASET_ID = "princeton-nlp/SWE-bench_Verified";
export const VERIFIED_DATASET_REVISION = "c104f840cc67f8b6eec6f759ebc8b2693d585d4a";
export const VERIFIED_DATASET_CONFIG = "default";
export const VERIFIED_DATASET_SPLIT = "test";
export const VERIFIED_TEST_ARTIFACT = "data/test-00000-of-00001.parquet";
export const FINAL_SAMPLE_SEED = "sha256:qarinah-final-agent-sample-v1";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function getJson(url, label) {
  const response = await fetch(url, {
    headers: { "user-agent": "qarinah-final-manifest/1" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

async function getBytes(url, label) {
  const response = await fetch(url, {
    headers: { "user-agent": "qarinah-final-manifest/1" },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchVerifiedMetadata() {
  const metadata = await getJson(
    `https://huggingface.co/api/datasets/${VERIFIED_DATASET_ID}/revision/${VERIFIED_DATASET_REVISION}`,
    "Pinned SWE-bench Verified metadata request"
  );
  if (metadata.sha !== VERIFIED_DATASET_REVISION) throw new Error("SWE-bench Verified revision mismatch.");
  return metadata;
}

export async function fetchVerifiedRows() {
  const rows = [];
  let total = null;
  for (let offset = 0; total === null || offset < total; offset += 100) {
    const url = new URL("https://datasets-server.huggingface.co/rows");
    for (const [key, value] of Object.entries({
      dataset: VERIFIED_DATASET_ID,
      config: VERIFIED_DATASET_CONFIG,
      split: VERIFIED_DATASET_SPLIT,
      offset,
      length: 100,
      revision: VERIFIED_DATASET_REVISION
    })) url.searchParams.set(key, String(value));
    const page = await getJson(url, `Verified dataset row request at offset ${offset}`);
    total = page.num_rows_total;
    rows.push(...page.rows.map((entry) => entry.row));
    if (page.rows.length === 0 && rows.length < total) throw new Error("Verified dataset server ended early.");
  }
  if (rows.length !== total) throw new Error(`Expected ${total} Verified rows, received ${rows.length}.`);
  return rows;
}

export async function fetchVerifiedArtifactMetadata() {
  const url = `https://huggingface.co/datasets/${VERIFIED_DATASET_ID}/resolve/${VERIFIED_DATASET_REVISION}/${VERIFIED_TEST_ARTIFACT}`;
  const bytes = await getBytes(url, "Pinned SWE-bench Verified test artifact request");
  return { path: VERIFIED_TEST_ARTIFACT, url, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function parseList(value, label) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${label} must encode a string array.`);
  }
  return parsed;
}

function issueUrl(row) {
  const issue = row.instance_id.match(/-(\d+)$/u)?.[1];
  return issue ? `https://github.com/${row.repo}/issues/${issue}` : null;
}

function validateRows(rows) {
  if (rows.length !== 500) throw new Error(`SWE-bench Verified must contain 500 rows; received ${rows.length}.`);
  const ids = new Set();
  for (const row of rows) {
    for (const field of ["repo", "instance_id", "base_commit", "problem_statement", "patch", "test_patch", "created_at", "FAIL_TO_PASS", "PASS_TO_PASS", "difficulty"]) {
      if (typeof row[field] !== "string") throw new TypeError(`${row.instance_id ?? "row"}.${field} must be a string.`);
    }
    if (ids.has(row.instance_id)) throw new Error(`Duplicate Verified instance ${row.instance_id}.`);
    ids.add(row.instance_id);
    if (!/^[a-f0-9]{40}$/u.test(row.base_commit)) throw new Error(`Invalid base commit for ${row.instance_id}.`);
    if (Number.isNaN(Date.parse(row.created_at))) throw new Error(`Invalid timestamp for ${row.instance_id}.`);
  }
}

function historyBand(count) {
  if (count <= 3) return "small-1-3";
  if (count <= 10) return "medium-4-10";
  return "large-11-plus";
}

function withDateQuartiles(tasks) {
  const ordered = [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.instanceId.localeCompare(right.instanceId));
  const quartile = new Map(ordered.map((task, index) => [task.instanceId, Math.min(4, Math.floor((index * 4) / ordered.length) + 1)]));
  return tasks.map((task) => ({ ...task, dateQuartile: quartile.get(task.instanceId) }));
}

function selectAgentSample(tasks, count) {
  const selected = [];
  const remaining = [...tasks];
  const counts = { repository: new Map(), difficulty: new Map(), dateQuartile: new Map(), historyBand: new Map() };
  const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  while (selected.length < Math.min(count, tasks.length)) {
    remaining.sort((left, right) => {
      const balance = (task) => (
        8 / ((counts.repository.get(task.repository) ?? 0) + 1)
        + 3 / ((counts.difficulty.get(task.difficulty) ?? 0) + 1)
        + 2 / ((counts.dateQuartile.get(task.dateQuartile) ?? 0) + 1)
        + 1 / ((counts.historyBand.get(task.historySizeBand) ?? 0) + 1)
      );
      return balance(right) - balance(left)
        || sha256(`${FINAL_SAMPLE_SEED}:${left.instanceId}`).localeCompare(sha256(`${FINAL_SAMPLE_SEED}:${right.instanceId}`));
    });
    const chosen = remaining.shift();
    selected.push(chosen.instanceId);
    increment(counts.repository, chosen.repository);
    increment(counts.difficulty, chosen.difficulty);
    increment(counts.dateQuartile, chosen.dateQuartile);
    increment(counts.historyBand, chosen.historySizeBand);
  }
  return selected;
}

export function buildFinalTaskManifest(verifiedRows, liteCorpus, metadata, sourceArtifact) {
  validateRows(verifiedRows);
  const developmentIds = new Set(liteCorpus.tasks.map((task) => task.instanceId));
  const developmentByRepository = new Map();
  for (const task of liteCorpus.tasks) {
    if (!developmentByRepository.has(task.repository)) developmentByRepository.set(task.repository, []);
    developmentByRepository.get(task.repository).push(task);
  }
  const eligible = [];
  const excluded = [];
  for (const row of verifiedRows) {
    if (developmentIds.has(row.instance_id)) {
      excluded.push({ instanceId: row.instance_id, repository: row.repo, reason: "USED_IN_LITE_DEVELOPMENT" });
      continue;
    }
    const createdAt = new Date(row.created_at).toISOString();
    const priorDevelopment = (developmentByRepository.get(row.repo) ?? []).filter((task) => task.createdAt < createdAt);
    if (priorDevelopment.length === 0) {
      excluded.push({ instanceId: row.instance_id, repository: row.repo, reason: "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY" });
      continue;
    }
    const failToPass = parseList(row.FAIL_TO_PASS, `${row.instance_id}.FAIL_TO_PASS`);
    const passToPass = parseList(row.PASS_TO_PASS, `${row.instance_id}.PASS_TO_PASS`);
    eligible.push({
      repository: row.repo,
      instanceId: row.instance_id,
      baseCommit: row.base_commit,
      createdAt,
      version: row.version,
      difficulty: row.difficulty.trim().toLowerCase() || "unknown",
      priorDevelopmentMemoryCount: priorDevelopment.length,
      historySizeBand: historyBand(priorDevelopment.length),
      failToPassCount: failToPass.length,
      passToPassCount: passToPass.length,
      evaluatorOnlyHashes: {
        problemStatement: sha256(row.problem_statement),
        goldPatch: sha256(row.patch),
        goldTestPatch: sha256(row.test_patch)
      },
      sources: {
        dataset: `https://huggingface.co/datasets/${VERIFIED_DATASET_ID}`,
        repository: `https://github.com/${row.repo}`,
        issue: issueUrl(row),
        baseCommit: `https://github.com/${row.repo}/commit/${row.base_commit}`
      }
    });
  }
  const tasks = withDateQuartiles(eligible).sort((left, right) => left.repository.localeCompare(right.repository)
    || left.createdAt.localeCompare(right.createdAt) || left.instanceId.localeCompare(right.instanceId));
  const agentSampleIds = selectAgentSample(tasks, 40);
  const sampleSet = new Set(agentSampleIds);
  const repositoryCounts = Object.fromEntries([...new Set(tasks.map((task) => task.repository))].sort().map((repository) => [
    repository,
    tasks.filter((task) => task.repository === repository).length
  ]));
  const manifest = {
    schemaVersion: "qarinah.final-task-manifest.v1",
    status: "frozen-before-qarinah-or-model-evaluation",
    protocol: {
      tag: "research-protocol-v1",
      commit: "3e05fa30f3007fd67a6b5aba2613f14dcb896fd7",
      receipt: "bench/final/protocol-v1.json"
    },
    generatedFrom: {
      datasetId: VERIFIED_DATASET_ID,
      datasetRevision: VERIFIED_DATASET_REVISION,
      config: VERIFIED_DATASET_CONFIG,
      split: VERIFIED_DATASET_SPLIT,
      lastModified: metadata.lastModified,
      sourceArtifact,
      officialMethodology: "https://github.com/SWE-bench/SWE-bench/blob/main/docs/guides/quickstart.md"
    },
    exclusions: {
      developmentDataset: "princeton-nlp/SWE-bench_Lite",
      developmentRevision: liteCorpus.generatedFrom.datasetRevision,
      developmentCorpusDigest: liteCorpus.contentDigest,
      rules: ["USED_IN_LITE_DEVELOPMENT", "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY"],
      counts: Object.fromEntries(["USED_IN_LITE_DEVELOPMENT", "NO_PRIOR_SAME_REPOSITORY_DEVELOPMENT_MEMORY"].map((reason) => [
        reason,
        excluded.filter((entry) => entry.reason === reason).length
      ])),
      tasks: excluded.sort((left, right) => left.repository.localeCompare(right.repository) || left.instanceId.localeCompare(right.instanceId))
    },
    counts: {
      sourceTasks: verifiedRows.length,
      eligibleFinalRetrievalTasks: tasks.length,
      excludedTasks: excluded.length,
      eligibleRepositories: Object.keys(repositoryCounts).length,
      agentSampleTasks: agentSampleIds.length
    },
    repositoryCounts,
    agentSample: {
      count: agentSampleIds.length,
      seed: FINAL_SAMPLE_SEED,
      selection: "Deterministic greedy balance over repository, official difficulty, global date quartile, and prior-development-history band; SHA-256 tie-break. No Qarinah or model outcome was available.",
      relevantEvidenceCount: "Not used because target relevance is evaluator-only and must not influence pre-run task selection.",
      instanceIds: agentSampleIds
    },
    artifactPolicy: {
      upstreamProblemTextRedistributed: false,
      upstreamPatchesRedistributed: false,
      targetGoldAvailableToRetrieverOrAgent: false,
      publicBenchmarkPretrainingCaveat: "Untouched means unused for Qarinah tuning; the public tasks may have appeared in model training."
    },
    resultsObserved: false,
    tasks: tasks.map((task) => ({ ...task, selectedForAgentExperiment: sampleSet.has(task.instanceId) }))
  };
  return { ...manifest, contentDigest: sha256(JSON.stringify(manifest)) };
}

export async function loadFinalTaskManifestInputs(liteCorpus) {
  const [metadata, rows, sourceArtifact] = await Promise.all([
    fetchVerifiedMetadata(),
    fetchVerifiedRows(),
    fetchVerifiedArtifactMetadata()
  ]);
  return { metadata, rows, sourceArtifact, manifest: buildFinalTaskManifest(rows, liteCorpus, metadata, sourceArtifact) };
}
