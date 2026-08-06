import { createHash } from "node:crypto";

export const DATASET_ID = "princeton-nlp/SWE-bench_Lite";
export const DATASET_REVISION = "6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2";
export const DATASET_CONFIG = "default";
export const DATASET_SPLIT = "test";
export const CORPUS_SCHEMA_VERSION = "qarinah.research-corpus.swe-bench-lite.v1";
export const PROTOCOL_VERSION = "qarinah.cross-agent-memory-study.v1";
export const DEVELOPMENT_CORPUS_SCHEMA_VERSION = "qarinah.research-corpus.swe-bench-lite-development.v2";
export const DATASET_TEST_ARTIFACT = "data/test-00000-of-00001.parquet";
export const DATASET_HISTORY_REVISIONS = Object.freeze([
  "113d798e3a89754d543d96a4e85276f4ec106c6f",
  "f1b73e051bba17cdf77ee227693d28ea867a54dc",
  "81ad348adcaf3368691f4db2907f8fc97a8f7526",
  "f49195c4d34e588bdfb74a7e0d3afc356f620bbc",
  "6324ee9342a02ac3f9fd8d04cbf25009fab384b8",
  DATASET_REVISION
]);

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

async function getBytes(url, label) {
  const response = await fetch(url, {
    headers: { "user-agent": "qarinah-research-benchmark/2" },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchDatasetMetadata() {
  const url = `https://huggingface.co/api/datasets/${DATASET_ID}/revision/${DATASET_REVISION}`;
  const metadata = await getJson(url, "Pinned Hugging Face dataset metadata request");
  if (metadata.sha !== DATASET_REVISION) {
    throw new Error(`Dataset revision mismatch: expected ${DATASET_REVISION}, received ${metadata.sha}.`);
  }
  return metadata;
}

export async function fetchDatasetRowsAtRevision(revision = DATASET_REVISION) {
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new TypeError("Dataset revision must be a 40-character Git commit hash.");
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
      revision
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

export async function fetchDatasetRows() {
  return fetchDatasetRowsAtRevision(DATASET_REVISION);
}

export async function fetchDatasetArtifactMetadata() {
  const url = `https://huggingface.co/datasets/${DATASET_ID}/resolve/${DATASET_REVISION}/${DATASET_TEST_ARTIFACT}`;
  const bytes = await getBytes(url, "Pinned SWE-bench Lite test artifact request");
  return {
    path: DATASET_TEST_ARTIFACT,
    url,
    bytes: bytes.byteLength,
    sha256: sha256(bytes)
  };
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

const SYMBOL_STOP_WORDS = new Set([
  "and", "async", "await", "class", "const", "def", "else", "except", "false", "finally", "for",
  "from", "function", "if", "import", "lambda", "none", "null", "return", "self", "static", "super",
  "this", "true", "try", "while", "with", "yield"
]);

export function changedSymbols(diff) {
  const symbols = new Set();
  const candidates = [];
  for (const match of String(diff).matchAll(/^@@[^@]*@@\s*(.*)$/gmu)) candidates.push(match[1]);
  for (const match of String(diff).matchAll(/^[+-](?![+-])\s*(?:async\s+)?(?:def|class|function)\s+([A-Za-z_][A-Za-z0-9_]*)/gmu)) {
    symbols.add(match[1].toLowerCase());
  }
  for (const candidate of candidates) {
    for (const match of candidate.matchAll(/(?:def|class|function)\s+([A-Za-z_][A-Za-z0-9_]*)|\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu)) {
      const symbol = (match[1] ?? match[2]).toLowerCase();
      if (symbol.length >= 3 && !SYMBOL_STOP_WORDS.has(symbol)) symbols.add(symbol);
    }
  }
  return [...symbols].sort().slice(0, 128);
}

export function moduleScopes(files) {
  return [...new Set(files.map((file) => {
    const segments = file.split("/").filter(Boolean);
    if (segments.length <= 1) return ".";
    return segments.slice(0, Math.min(2, segments.length - 1)).join("/");
  }))].sort();
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

export function buildDevelopmentCorpus(rows, metadata, sourceArtifact) {
  const exploratory = buildCorpus(rows, metadata);
  const tasks = exploratory.tasks.map((task) => {
    const row = rows.find((candidate) => candidate.instance_id === task.instanceId);
    const symbols = changedSymbols(row.patch);
    return {
      ...task,
      changedSymbols: symbols,
      moduleScopes: moduleScopes(task.patchFiles)
    };
  });
  const observedRepositories = [...new Set(tasks.map((task) => task.repository))].sort();
  const contentDigest = sha256(JSON.stringify({ repositories: exploratory.repositories, tasks }));
  return {
    ...exploratory,
    schemaVersion: DEVELOPMENT_CORPUS_SCHEMA_VERSION,
    protocolVersion: "qarinah.cross-agent-memory-study.development-v2",
    generatedFrom: {
      ...exploratory.generatedFrom,
      sourceArtifact,
      officialLitePage: "https://www.swebench.com/lite.html"
    },
    splitPolicy: {
      ...exploratory.splitPolicy,
      evaluationSetting: "online-prequential",
      exploratoryReuse: true,
      exploratoryReuseWarning: "The 240 held-out tasks were inspected in v0.1 and are development data for v0.2. They are not an untouched confirmatory test set."
    },
    repositoryCountAudit: {
      canonicalization: "exact lowercase owner/repository values from the pinned test rows",
      officialPageDeclaredCount: 11,
      pinnedRevisionObservedCount: observedRepositories.length,
      discrepancy: observedRepositories.length !== 11,
      observedRepositories,
      conclusion: "Preserve the revision-level observation and report the official-page discrepancy; do not coerce or alias repository identities."
    },
    relevanceOracle: {
      type: "deterministic graded structural oracle",
      grade2Direct: "shared production patch file or extracted changed symbol",
      grade1Supporting: "shared two-level production module scope without a direct match",
      grade0Irrelevant: "no structural match under this oracle",
      evaluatorOnlyTargetGold: true,
      humanValidated: false,
      limitation: "Structural labels are development proxies and do not replace blinded human relevance judgments."
    },
    contentDigest,
    tasks
  };
}

function normalizedProjectIdentifier(identifier) {
  return identifier.trim().toLowerCase().replace(/\.git$/u, "").replace(/\/+$/u, "");
}

export function buildRepositoryManifest(rows, metadata, sourceArtifact, historicalRows = new Map()) {
  if (rows.length !== 300) throw new Error(`Pinned SWE-bench Lite test split must contain 300 rows; received ${rows.length}.`);
  const duplicateInstanceIds = [...new Set(rows
    .map((row) => row.instance_id)
    .filter((instanceId, index, all) => all.indexOf(instanceId) !== index))].sort();
  const exactRepositories = [...new Set(rows.map((row) => row.repo))].sort();
  const identifierToProject = Object.fromEntries(exactRepositories.map((repository) => [
    repository,
    normalizedProjectIdentifier(repository)
  ]));
  const normalizedProjects = [...new Set(Object.values(identifierToProject))].sort();
  const repositories = exactRepositories.map((repository) => {
    const repositoryRows = rows.filter((row) => row.repo === repository);
    const dates = repositoryRows.map((row) => new Date(row.created_at).toISOString()).sort();
    return {
      exact_dataset_identifier: repository,
      normalized_project: identifierToProject[repository],
      task_count: repositoryRows.length,
      first_date: dates[0],
      last_date: dates.at(-1)
    };
  });
  const historicalRevisionAudit = [...historicalRows].map(([revision, revisionRows]) => ({
    revision,
    row_count: revisionRows.length,
    repository_count: new Set(revisionRows.map((row) => row.repo)).size,
    exact_repo_identifiers: [...new Set(revisionRows.map((row) => row.repo))].sort()
  }));
  const manifest = {
    schema_version: "qarinah.swe-bench-lite-repository-manifest.v0.2",
    dataset_name: DATASET_ID,
    dataset_revision: DATASET_REVISION,
    dataset_last_modified: metadata.lastModified,
    dataset_url: `https://huggingface.co/datasets/${DATASET_ID}`,
    official_lite_page: "https://www.swebench.com/lite.html",
    declared_splits_at_revision: Object.fromEntries(
      (metadata.cardData?.dataset_info?.splits ?? []).map((split) => [split.name, split.num_examples])
    ),
    splits_loaded: [DATASET_SPLIT],
    development_split_combined: false,
    filtering: "none",
    row_count_before_filtering: rows.length,
    row_count_after_filtering: rows.length,
    exact_repo_identifiers: exactRepositories,
    normalized_projects: normalizedProjects,
    identifier_to_project_mapping: identifierToProject,
    duplicate_instance_ids: duplicateInstanceIds,
    source_file_hashes: { [sourceArtifact.path]: sourceArtifact.sha256 },
    source_file_sizes: { [sourceArtifact.path]: sourceArtifact.bytes },
    repositories,
    historical_revision_audit: historicalRevisionAudit,
    official_count_resolution: {
      official_page_declared_test_repositories: 11,
      pinned_test_artifact_exact_identifiers: exactRepositories.length,
      pinned_test_artifact_normalized_projects: normalizedProjects.length,
      aliases_or_case_variants_found: exactRepositories.length !== normalizedProjects.length,
      duplicate_instance_ids_found: duplicateInstanceIds.length,
      conclusion: "The test split alone contains 300 unique instances from 12 distinct normalized projects. No development rows, aliases, case variants, or duplicate instance IDs explain the difference. The official prose count of 11 is inconsistent with the official revision-level test artifact, so this study uses and reports the artifact count of 12."
    }
  };
  return { ...manifest, content_sha256: sha256(JSON.stringify(manifest)) };
}

export async function loadPinnedDevelopmentDataset() {
  const [metadata, rows, sourceArtifact] = await Promise.all([
    fetchDatasetMetadata(),
    fetchDatasetRows(),
    fetchDatasetArtifactMetadata()
  ]);
  return {
    metadata,
    rows,
    sourceArtifact,
    corpus: buildDevelopmentCorpus(rows, metadata, sourceArtifact)
  };
}

export async function loadRepositoryManifestAudit() {
  const [metadata, rows, sourceArtifact, historicalEntries] = await Promise.all([
    fetchDatasetMetadata(),
    fetchDatasetRows(),
    fetchDatasetArtifactMetadata(),
    Promise.all(DATASET_HISTORY_REVISIONS.map(async (revision) => [revision, await fetchDatasetRowsAtRevision(revision)]))
  ]);
  return {
    metadata,
    rows,
    sourceArtifact,
    manifest: buildRepositoryManifest(rows, metadata, sourceArtifact, new Map(historicalEntries))
  };
}
