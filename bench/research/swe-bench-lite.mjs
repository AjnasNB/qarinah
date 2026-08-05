import { createHash } from "node:crypto";

export const DATASET_ID = "princeton-nlp/SWE-bench_Lite";
export const DATASET_REVISION = "6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2";
export const DATASET_CONFIG = "default";
export const DATASET_SPLIT = "test";
export const CORPUS_SCHEMA_VERSION = "qarinah.research-corpus.swe-bench-lite.v1";
export const PROTOCOL_VERSION = "qarinah.cross-agent-memory-study.v1";

export const EXPECTED_REPOSITORY_COUNTS = Object.freeze({
  "astropy/astropy": 6,
  "django/django": 114,
  "matplotlib/matplotlib": 23,
  "mwaskom/seaborn": 4,
  "pallets/flask": 3,
  "psf/requests": 6,
  "pydata/xarray": 5,
  "pylint-dev/pylint": 6,
  "pytest-dev/pytest": 17,
  "scikit-learn/scikit-learn": 23,
  "sphinx-doc/sphinx": 16,
  "sympy/sympy": 77
});

// These are repository API observations, not legal conclusions. NOASSERTION and null
// are deliberately preserved instead of guessing a license from memory.
export const REPOSITORY_OBSERVATIONS = Object.freeze({
  "astropy/astropy": { defaultBranch: "main", observedSpdx: "BSD-3-Clause" },
  "django/django": { defaultBranch: "main", observedSpdx: "BSD-3-Clause" },
  "matplotlib/matplotlib": { defaultBranch: "main", observedSpdx: null },
  "mwaskom/seaborn": { defaultBranch: "master", observedSpdx: "BSD-3-Clause" },
  "pallets/flask": { defaultBranch: "main", observedSpdx: "BSD-3-Clause" },
  "psf/requests": { defaultBranch: "main", observedSpdx: "Apache-2.0" },
  "pydata/xarray": { defaultBranch: "main", observedSpdx: "Apache-2.0" },
  "pylint-dev/pylint": { defaultBranch: "main", observedSpdx: "GPL-2.0" },
  "pytest-dev/pytest": { defaultBranch: "main", observedSpdx: "MIT" },
  "scikit-learn/scikit-learn": { defaultBranch: "main", observedSpdx: "BSD-3-Clause" },
  "sphinx-doc/sphinx": { defaultBranch: "master", observedSpdx: "NOASSERTION" },
  "sympy/sympy": { defaultBranch: "master", observedSpdx: "NOASSERTION" }
});

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requestUrl(base, parameters) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return url;
}

async function getJson(url, label) {
  const response = await fetch(url, {
    headers: { "user-agent": "qarinah-research-benchmark/1" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function fetchDatasetMetadata() {
  const url = `https://huggingface.co/api/datasets/${DATASET_ID}/revision/${DATASET_REVISION}`;
  const metadata = await getJson(url, "Pinned Hugging Face dataset metadata request");
  if (metadata.sha !== DATASET_REVISION) {
    throw new Error(`Dataset revision mismatch: expected ${DATASET_REVISION}, received ${metadata.sha}.`);
  }
  return metadata;
}

export async function fetchDatasetRows() {
  const rows = [];
  const pageSize = 100;
  let total = null;
  for (let offset = 0; total === null || offset < total; offset += pageSize) {
    const url = requestUrl("https://datasets-server.huggingface.co/rows", {
      dataset: DATASET_ID,
      config: DATASET_CONFIG,
      split: DATASET_SPLIT,
      offset,
      length: pageSize,
      revision: DATASET_REVISION
    });
    const page = await getJson(url, `Dataset row request at offset ${offset}`);
    total = page.num_rows_total;
    if (!Number.isSafeInteger(total) || total < 1) throw new Error("Dataset server returned an invalid total row count.");
    rows.push(...page.rows.map((entry) => entry.row));
    if (page.rows.length === 0 && rows.length < total) throw new Error("Dataset server ended before the advertised row count.");
  }
  if (rows.length !== total) throw new Error(`Expected ${total} rows, received ${rows.length}.`);
  return rows;
}

function parseJsonList(value, label) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${label} must encode a string array.`);
  }
  return parsed;
}

export function changedFiles(diff) {
  const paths = new Set();
  const pattern = /^diff --git a\/(.+?) b\/(.+)\r?$/gmu;
  for (const match of String(diff).matchAll(pattern)) paths.add(match[2]);
  return [...paths].sort();
}

export function issueUrl(row) {
  const issue = row.instance_id.match(/-(\d+)$/u)?.[1];
  return issue ? `https://github.com/${row.repo}/issues/${issue}` : null;
}

function validateRawRow(row) {
  const requiredStrings = [
    "repo", "instance_id", "base_commit", "patch", "test_patch", "problem_statement",
    "hints_text", "created_at", "version", "FAIL_TO_PASS", "PASS_TO_PASS",
    "environment_setup_commit"
  ];
  for (const key of requiredStrings) {
    if (typeof row[key] !== "string") throw new TypeError(`Dataset row field ${key} must be a string.`);
  }
  if (!Object.hasOwn(EXPECTED_REPOSITORY_COUNTS, row.repo)) throw new Error(`Unexpected repository ${row.repo}.`);
  if (!/^[a-f0-9]{40}$/u.test(row.base_commit)) throw new Error(`Invalid base commit for ${row.instance_id}.`);
  if (Number.isNaN(Date.parse(row.created_at))) throw new Error(`Invalid timestamp for ${row.instance_id}.`);
}

export function splitRows(rows) {
  if (rows.length !== 300) throw new Error(`SWE-bench Lite test must contain 300 tasks; received ${rows.length}.`);
  const unique = new Set();
  const byRepository = new Map();
  for (const row of rows) {
    validateRawRow(row);
    if (unique.has(row.instance_id)) throw new Error(`Duplicate instance ${row.instance_id}.`);
    unique.add(row.instance_id);
    if (!byRepository.has(row.repo)) byRepository.set(row.repo, []);
    byRepository.get(row.repo).push(row);
  }

  for (const [repository, expected] of Object.entries(EXPECTED_REPOSITORY_COUNTS)) {
    const observed = byRepository.get(repository)?.length ?? 0;
    if (observed !== expected) throw new Error(`${repository}: expected ${expected} tasks, received ${observed}.`);
  }

  const phases = new Map();
  for (const [repository, repositoryRows] of byRepository) {
    repositoryRows.sort((left, right) => (
      left.created_at.localeCompare(right.created_at)
      || left.instance_id.localeCompare(right.instance_id)
    ));
    const warmupCount = Math.max(1, Math.round(repositoryRows.length * 0.2));
    repositoryRows.forEach((row, index) => phases.set(row.instance_id, {
      phase: index < warmupCount ? "warmup" : "heldout",
      repositorySequence: index + 1,
      repositoryTaskCount: repositoryRows.length,
      warmupCount
    }));
  }
  return phases;
}

export function taskMetadata(row, phase) {
  const patchFiles = changedFiles(row.patch);
  const testFiles = changedFiles(row.test_patch);
  const changed = [...new Set([...patchFiles, ...testFiles])].sort();
  const failToPass = parseJsonList(row.FAIL_TO_PASS, `${row.instance_id}.FAIL_TO_PASS`);
  const passToPass = parseJsonList(row.PASS_TO_PASS, `${row.instance_id}.PASS_TO_PASS`);
  return {
    repository: row.repo,
    instanceId: row.instance_id,
    baseCommit: row.base_commit,
    environmentSetupCommit: row.environment_setup_commit,
    createdAt: new Date(row.created_at).toISOString(),
    version: row.version,
    phase: phase.phase,
    repositorySequence: phase.repositorySequence,
    patchFiles,
    testFiles,
    changedFiles: changed,
    failToPassCount: failToPass.length,
    passToPassCount: passToPass.length,
    hashes: {
      problemStatement: sha256(row.problem_statement),
      hints: sha256(row.hints_text),
      patch: sha256(row.patch),
      testPatch: sha256(row.test_patch)
    },
    sources: {
      dataset: `https://huggingface.co/datasets/${DATASET_ID}`,
      repository: `https://github.com/${row.repo}`,
      baseCommit: `https://github.com/${row.repo}/commit/${row.base_commit}`,
      issue: issueUrl(row)
    }
  };
}

export function buildCorpus(rows, metadata) {
  const phases = splitRows(rows);
  const tasks = rows
    .map((row) => taskMetadata(row, phases.get(row.instance_id)))
    .sort((left, right) => left.repository.localeCompare(right.repository)
      || left.repositorySequence - right.repositorySequence
      || left.instanceId.localeCompare(right.instanceId));
  const repositories = Object.entries(EXPECTED_REPOSITORY_COUNTS).map(([repository, taskCount]) => {
    const warmupCount = tasks.filter((task) => task.repository === repository && task.phase === "warmup").length;
    const observation = REPOSITORY_OBSERVATIONS[repository];
    return {
      repository,
      taskCount,
      warmupCount,
      heldoutCount: taskCount - warmupCount,
      defaultBranch: observation.defaultBranch,
      observedSpdx: observation.observedSpdx,
      licenseClassification: observation.observedSpdx === null || observation.observedSpdx === "NOASSERTION"
        ? "unclassified-do-not-infer"
        : "github-api-observation",
      repositoryUrl: `https://github.com/${repository}`,
      apiUrl: `https://api.github.com/repos/${repository}`
    };
  });
  const counts = {
    repositories: repositories.length,
    totalTasks: tasks.length,
    warmupTasks: tasks.filter((task) => task.phase === "warmup").length,
    heldoutTasks: tasks.filter((task) => task.phase === "heldout").length
  };
  const contentDigest = sha256(JSON.stringify({ repositories, tasks }));
  return {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    generatedFrom: {
      datasetId: DATASET_ID,
      datasetRevision: DATASET_REVISION,
      config: DATASET_CONFIG,
      split: DATASET_SPLIT,
      lastModified: metadata.lastModified,
      datasetUrl: `https://huggingface.co/datasets/${DATASET_ID}`,
      officialMethodology: "https://github.com/SWE-bench/SWE-bench/blob/main/docs/guides/quickstart.md"
    },
    splitPolicy: {
      method: "per-repository chronological 20/80 split",
      order: ["created_at ascending", "instance_id ascending"],
      warmup: "max(1, round(repository_task_count * 0.2))",
      heldoutPublic: true,
      contaminationWarning: "The test cases and gold patches are public. This split prevents within-run future leakage but cannot establish absence from model pretraining."
    },
    artifactPolicy: {
      redistributedUpstreamText: false,
      redistributedPatches: false,
      evaluatorOnlyGoldFields: ["patchFiles", "testFiles", "changedFiles", "hashes.patch", "hashes.testPatch"],
      retrievalProhibition: "A target task's patch, test patch, hashes, and patch-derived paths must not enter retrieval or model input."
    },
    licenseObservation: {
      observedAt: "2026-08-05",
      source: "GitHub repository API",
      legalConclusion: false
    },
    counts,
    contentDigest,
    repositories,
    tasks
  };
}

export async function loadPinnedDataset() {
  const [metadata, rows] = await Promise.all([fetchDatasetMetadata(), fetchDatasetRows()]);
  return { metadata, rows, corpus: buildCorpus(rows, metadata) };
}
