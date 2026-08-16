import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  compileContext,
  initializeWorkspace,
  inspectSqliteReadModel,
  loadWorkspace,
  querySqliteReadModel,
  readEvents,
  rebuildDerivedState,
  scanProjectStructure,
  verifyStore
} from "../src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const evidencePackageVersion = packageJson.version;
const resultPath = path.join(repositoryRoot, "bench", "results", `multifile-context-${evidencePackageVersion}.json`);
const writeResult = process.argv.includes("--write");
const fileCounts = Object.freeze([40, 50, 100]);
const asOf = "2099-02-01T00:00:00.000Z";

function sha256(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function eventId(index) {
  return `evt_00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function timestamp(index) {
  return new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString();
}

function portableRelative(fromPath, toPath) {
  const relative = path.posix.relative(path.posix.dirname(fromPath), toPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function markdownInlineFixture(value) {
  return String(value).replace(/([\\`*_{}\[\]()<>#+.!|-])/gu, "\\$1");
}

function fixtureDescriptors(fileCount) {
  const paths = Array.from({ length: fileCount }, (_, index) => (
    index % 5 === 4
      ? `docs/domain-${index % 7}/runbook-${String(index).padStart(3, "0")}.md`
      : `src/domain-${index % 7}/module-${String(index).padStart(3, "0")}.js`
  ));
  const sourcePaths = paths.filter((filePath) => filePath.endsWith(".js"));
  return paths.map((filePath, index) => {
    const label = `signal${String(fileCount).padStart(3, "0")}${String(index).padStart(3, "0")}`;
    const typoLabel = label.replace("signal", "sgnal");
    const answer = `MF-${String(fileCount).padStart(3, "0")}-${String(index).padStart(3, "0")}-QUARTZ`;
    const nextSource = sourcePaths.find((candidate) => candidate > filePath) ?? sourcePaths[0];
    const reference = portableRelative(filePath, nextSource);
    const common = Array.from({ length: 5 }, (_, paragraph) => (
      `Routine project context paragraph ${paragraph + 1} covers validation, migration, incident response, release preparation, and code review without changing the evidence marker.`
    )).join("\n");
    const content = filePath.endsWith(".md")
      ? `# ${label} operational runbook\n\n[Reviewed implementation](${reference})\n\n${common}\n`
      : `import ${JSON.stringify(reference)};\n\nexport const ${label} = ${JSON.stringify(answer)};\n\n/*\n${common}\n*/\n`;
    return Object.freeze({ index, filePath, label, typoLabel, answer, reference, nextSource, content });
  });
}

async function createFixtureFiles(root, descriptors) {
  for (const descriptor of descriptors) {
    const absolute = path.join(root, ...descriptor.filePath.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, descriptor.content, "utf8");
  }
}

function sourceInput(fileCount, descriptor, index) {
  return {
    eventId: eventId(index),
    timestamp: timestamp(index),
    kind: "source",
    actor: { type: "source", id: "qarinah-multifile-eval" },
    title: `Evidence ${descriptor.label} continuity marker`,
    body: [
      `The ${descriptor.label} continuity marker is ${descriptor.answer}.`,
      `It is evidence-linked to ${descriptor.filePath}.`,
      "This record is retained independently from similarly worded project history."
    ].join(" "),
    data: {
      fixture: "multifile-context",
      fileCount,
      fileIndex: descriptor.index,
      path: descriptor.filePath,
      symbol: descriptor.label,
      expectedAnswer: descriptor.answer
    },
    confidence: "verified",
    repository: { id: `fixture/multifile-${fileCount}`, branch: "main", commit: "a".repeat(40) },
    freshness: { files: [{ path: descriptor.filePath, hash: sha256(descriptor.content) }] },
    relations: [{ type: "affects", target: `file:${descriptor.filePath}` }],
    provenance: { adapter: "qarinah-multifile-eval", sourceId: `multifile-${fileCount}:${descriptor.filePath}` },
    retention: { class: "project", expiresAt: null }
  };
}

function controlInput(fileCount, index, overrides = {}) {
  return {
    eventId: eventId(index),
    timestamp: timestamp(index),
    kind: "decision",
    actor: { type: "agent", id: "qarinah-multifile-eval" },
    title: "Multifile control decision",
    body: "A deterministic control for graph, conflict, and supersession behavior.",
    data: { fixture: "multifile-context", fileCount, control: true },
    confidence: "verified",
    repository: { id: `fixture/multifile-${fileCount}`, branch: "main", commit: "b".repeat(40) },
    relations: [],
    provenance: { adapter: "qarinah-multifile-eval", sourceId: `multifile-${fileCount}:control:${index}` },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}

function selectedIndices(fileCount) {
  return [...new Set([0, Math.floor(fileCount / 2), fileCount - 1])];
}

function itemRank(pack, targetEventId) {
  return pack.items.findIndex((item) => item.eventId === targetEventId) + 1;
}

async function queryPositive(root, descriptor, target, queryType) {
  const query = queryType === "exact"
    ? `${descriptor.label} continuity marker`
    : `${descriptor.typoLabel} continuty markr`;
  const pack = await compileContext(query, {
    cwd: root,
    maxChars: 12_000,
    maxTokens: 2_000,
    reserveTokens: 0,
    limit: 8,
    minimumCoverage: "partial",
    includeEvidenceSufficiency: true,
    asOf
  });
  const rank = itemRank(pack, target.eventId);
  const item = pack.items.find((candidate) => candidate.eventId === target.eventId);
  return {
    fileIndex: descriptor.index,
    path: descriptor.filePath,
    queryType,
    targetRank: rank,
    answerPreserved: item?.excerpt.includes(descriptor.answer) === true,
    citationHashPresent: /^sha256:[0-9a-f]{64}$/u.test(item?.hash ?? ""),
    manifestHashPresent: /^sha256:[0-9a-f]{64}$/u.test(pack.manifestHash),
    sqliteCandidateUsed: item?.reason.includes("sqlite-fts5") === true,
    fuzzyCandidateUsed: item?.reason.includes("fuzzy") === true,
    coverage: pack.retrieval.coverage.status,
    evidenceDecision: pack.retrieval.evidenceSufficiency.decision,
    usedTokens: pack.budget.usedTokens,
    usedChars: pack.budget.usedChars
  };
}

async function evaluateScale(fileCount) {
  const root = await mkdtemp(path.join(os.tmpdir(), `qarinah-multifile-${fileCount}-`));
  process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");
  try {
    const workspace = await initializeWorkspace(root, { capture: "content", contextMaxChars: 64_000 });
    const descriptors = fixtureDescriptors(fileCount);
    await createFixtureFiles(root, descriptors);
    const scan = await scanProjectStructure({ cwd: root });
    assert.equal(scan.fileCount, fileCount);

    const sourceEvents = [];
    let sequence = 1;
    for (const descriptor of descriptors) {
      sourceEvents.push(await appendEvent(sourceInput(fileCount, descriptor, sequence++), { workspace }));
    }

    const graphSourceIndex = Math.floor(fileCount / 2);
    const graphDecision = await appendEvent(controlInput(fileCount, sequence++, {
      title: "Keep the downstream validator enabled",
      body: "The reviewed relay outcome remains the governing implementation evidence.",
      relations: [{ type: "derived_from", target: sourceEvents[graphSourceIndex].eventId }]
    }), { workspace });
    const oldDecision = await appendEvent(controlInput(fileCount, sequence++, {
      title: "Mercury release seal uses the legacy checksum",
      body: "The mercury release seal policy uses LEGACY-17."
    }), { workspace });
    const currentDecision = await appendEvent(controlInput(fileCount, sequence++, {
      title: "Mercury release seal uses the current checksum",
      body: "The mercury release seal policy uses CURRENT-93.",
      relations: [{ type: "supersedes", target: oldDecision.eventId }]
    }), { workspace });
    const contradiction = await appendEvent(controlInput(fileCount, sequence++, {
      kind: "claim",
      title: "Mercury release seal exception claimed",
      body: "A conflicting source claims that LEGACY-17 still controls the mercury release seal.",
      confidence: "claimed",
      relations: [{ type: "contradicts", target: currentDecision.eventId }]
    }), { workspace });

    await rebuildDerivedState(root);
    const events = await readEvents(root);
    const graphPath = path.join(root, ".qarinah", "graph", "graph.json");
    const markdownPath = path.join(root, ".qarinah", "records", "CONTEXT.md");
    const ledgerPath = path.join(root, ".qarinah", "events", "events.jsonl");
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const markdown = await readFile(markdownPath, "utf8");
    const ledger = await readFile(ledgerPath, "utf8");
    const readModel = await inspectSqliteReadModel(await loadWorkspace(root));
    const requiredTables = ["conflicts", "documents", "edges", "events", "events_fts", "supersessions"];
    const projectFileNodes = graph.nodes.filter((node) => node.type === "project.file");
    const projectReferenceEdges = graph.edges.filter((edge) => ["imports", "links"].includes(edge.type));

    assert.equal(events.length, fileCount + 5);
    assert.equal(readModel.eventCount, events.length);
    assert.equal(readModel.headHash, events.at(-1).hash);
    assert.equal(requiredTables.every((table) => readModel.tables.includes(table)), true);
    assert.equal(graph.projectStructure.fileCount, fileCount);
    assert.equal(projectFileNodes.length, fileCount);
    assert.equal(projectReferenceEdges.length, fileCount);
    assert.equal(markdown.includes(`- Files: ${fileCount}`), true);
    for (const index of selectedIndices(fileCount)) {
      assert.equal(markdown.includes(`\`${markdownInlineFixture(descriptors[index].filePath)}\``), true);
    }

    const cases = [];
    for (const queryType of ["exact", "typo-tolerant"]) {
      for (const descriptor of descriptors) {
        cases.push(await queryPositive(
          root,
          descriptor,
          sourceEvents[descriptor.index],
          queryType === "exact" ? "exact" : "typo-tolerant"
        ));
      }
    }
    assert.equal(cases.every((item) => item.targetRank === 1), true);
    assert.equal(cases.every((item) => item.answerPreserved), true);
    assert.equal(cases.every((item) => item.citationHashPresent && item.manifestHashPresent), true);
    assert.equal(cases.filter((item) => item.queryType === "exact").every((item) => item.sqliteCandidateUsed), true);
    assert.equal(cases.filter((item) => item.queryType === "typo-tolerant").every((item) => item.fuzzyCandidateUsed), true);
    assert.equal(cases.filter((item) => item.queryType === "exact").every((item) => item.evidenceDecision === "ACCEPT_DIRECT"), true);
    assert.equal(cases.filter((item) => item.queryType === "typo-tolerant").every((item) => item.evidenceDecision === "ABSTAIN"), true);

    const parity = [];
    for (const index of selectedIndices(fileCount)) {
      const descriptor = descriptors[index];
      const query = `${descriptor.label} continuity marker`;
      const persisted = await compileContext(query, { cwd: root, maxChars: 12_000, limit: 8, asOf });
      const memory = await compileContext(query, { cwd: root, maxChars: 12_000, limit: 8, asOf, inMemory: true });
      const persistedRank = itemRank(persisted, sourceEvents[index].eventId);
      const inMemoryRank = itemRank(memory, sourceEvents[index].eventId);
      parity.push({ fileIndex: index, persistedRank, inMemoryRank, sameTargetRank: persistedRank === inMemoryRank });
    }
    assert.equal(parity.every((item) => item.sameTargetRank && item.persistedRank === 1), true);

    const structureTarget = descriptors.at(-1);
    const structurePack = await compileContext(
      `${structureTarget.filePath} ${structureTarget.reference} ${structureTarget.filePath.endsWith(".md") ? "links" : "imports"}`,
      { cwd: root, maxChars: 12_000, limit: 8, minimumCoverage: "partial", asOf }
    );
    const structureItem = structurePack.items.find((item) => item.eventId === scan.eventId);
    assert.ok(structureItem);
    assert.equal(structureItem.excerpt.includes(structureTarget.filePath), true);
    assert.equal(structureItem.excerpt.includes(structureTarget.reference), true);
    assert.equal(structureItem.reason.includes("sqlite-fts5"), true);

    const graphDescriptor = descriptors[graphSourceIndex];
    const graphPack = await compileContext(graphDescriptor.label, {
      cwd: root,
      maxChars: 12_000,
      limit: 8,
      includeFuzzy: false,
      includeGraph: true,
      minimumCoverage: "direct",
      asOf
    });
    const graphDecisionItem = graphPack.items.find((item) => item.eventId === graphDecision.eventId);
    assert.ok(graphDecisionItem);
    assert.equal(graphDecisionItem.reason.includes("graph"), true);

    const policyPack = await compileContext("mercury release seal policy checksum", {
      cwd: root,
      maxChars: 12_000,
      limit: 10,
      minimumCoverage: "partial",
      asOf
    });
    assert.ok(policyPack.items.some((item) => item.eventId === currentDecision.eventId));
    assert.equal(policyPack.items.some((item) => item.eventId === oldDecision.eventId), false);
    assert.ok(policyPack.retrieval.exclusions?.some((item) => item.eventId === oldDecision.eventId));
    assert.ok(policyPack.retrieval.conflicts?.some((conflict) => (
      conflict.eventIds.includes(currentDecision.eventId) && conflict.eventIds.includes(contradiction.eventId)
    )));

    const sqliteCandidates = await querySqliteReadModel(await loadWorkspace(root), descriptors.at(-1).label, {
      headHash: events.at(-1).hash,
      limit: 16
    });
    assert.equal(sqliteCandidates.candidates.some((candidate) => candidate.eventId === sourceEvents.at(-1).eventId), true);

    const unsupportedQueries = [
      `unsupported${fileCount} nebula authorization secret`,
      `missing${fileCount} lunar rollback credential`,
      `absent${fileCount} oceanic encryption answer`
    ];
    const abstention = [];
    for (const query of unsupportedQueries) {
      let errorCode = null;
      try {
        await compileContext(query, {
          cwd: root,
          maxChars: 12_000,
          limit: 8,
          minimumCoverage: "direct",
          includeEvidenceSufficiency: true,
          asOf
        });
      } catch (error) {
        errorCode = error?.code ?? error?.name ?? "unknown";
      }
      abstention.push({ query, correctAbstention: errorCode === "CONTEXT_COVERAGE_TOO_LOW", errorCode });
    }
    assert.equal(abstention.every((item) => item.correctAbstention), true);

    const tamperedGraph = { ...graph, headHash: `sha256:${"0".repeat(64)}` };
    await writeFile(graphPath, `${JSON.stringify(tamperedGraph)}\n`, "utf8");
    await writeFile(markdownPath, `${markdown}\nTAMPERED-DERIVED-MARKER\n`, "utf8");
    const repairDescriptor = descriptors[Math.floor(fileCount / 2)];
    const repairedPack = await compileContext(`${repairDescriptor.label} continuity marker`, {
      cwd: root,
      maxChars: 12_000,
      limit: 8,
      minimumCoverage: "partial",
      asOf
    });
    const repairedGraph = JSON.parse(await readFile(graphPath, "utf8"));
    const repairedMarkdown = await readFile(markdownPath, "utf8");
    assert.equal(itemRank(repairedPack, sourceEvents[repairDescriptor.index].eventId), 1);
    assert.equal(repairedGraph.headHash, events.at(-1).hash);
    assert.equal(repairedMarkdown.includes("TAMPERED-DERIVED-MARKER"), false);
    assert.equal(repairedMarkdown.includes(`- Files: ${fileCount}`), true);

    const store = await verifyStore(root, { updateCheckpoint: false, includeRoot: false });
    assert.equal(store.ok, true);
    const baselineEstimatedTokens = Math.ceil(ledger.length / 4);
    const maximumUsedTokens = Math.max(...cases.map((item) => item.usedTokens));
    const minimumEstimatedReduction = Math.round(
      (1 - maximumUsedTokens / baselineEstimatedTokens) * 1_000_000
    ) / 1_000_000;
    return {
      fileCount,
      eventCount: events.length,
      exactQueries: fileCount,
      typoTolerantQueries: fileCount,
      unsupportedQueries: abstention.length,
      allTargetsRankedFirst: cases.every((item) => item.targetRank === 1),
      allAnswersPreserved: cases.every((item) => item.answerPreserved),
      allExactQueriesUsedSqlite: cases.filter((item) => item.queryType === "exact").every((item) => item.sqliteCandidateUsed),
      allTypoQueriesUsedFuzzyRetrieval: cases.filter((item) => item.queryType === "typo-tolerant").every((item) => item.fuzzyCandidateUsed),
      allExactQueriesAcceptedDirect: cases.filter((item) => item.queryType === "exact")
        .every((item) => item.evidenceDecision === "ACCEPT_DIRECT"),
      allTypoQueriesConservativelyAbstained: cases.filter((item) => item.queryType === "typo-tolerant")
        .every((item) => item.evidenceDecision === "ABSTAIN"),
      persistedInMemoryParity: parity.every((item) => item.sameTargetRank),
      projectStructure: {
        filesScanned: scan.fileCount,
        graphFileNodes: projectFileNodes.length,
        graphReferenceEdges: projectReferenceEdges.length,
        latePathAndReferencePreserved: structureItem.excerpt.includes(structureTarget.filePath)
          && structureItem.excerpt.includes(structureTarget.reference),
        markdownFirstMiddleLastPathsPreserved: selectedIndices(fileCount)
          .every((index) => markdown.includes(`\`${markdownInlineFixture(descriptors[index].filePath)}\``))
      },
      graphLinkedDecisionRecovered: graphDecisionItem.reason.includes("graph"),
      supersededDecisionExcluded: policyPack.items.every((item) => item.eventId !== oldDecision.eventId),
      conflictVisible: policyPack.retrieval.conflicts?.some((conflict) => (
        conflict.eventIds.includes(currentDecision.eventId) && conflict.eventIds.includes(contradiction.eventId)
      )) === true,
      sqliteReadModel: {
        schemaVersion: readModel.schemaVersion,
        eventCountMatchesLedger: readModel.eventCount === events.length,
        headMatchesLedger: readModel.headHash === events.at(-1).hash,
        requiredTablesPresent: requiredTables.every((table) => readModel.tables.includes(table)),
        lateFileEvidenceFound: sqliteCandidates.candidates.some((candidate) => candidate.eventId === sourceEvents.at(-1).eventId)
      },
      derivedRepair: {
        staleGraphDetectedAndRebuilt: repairedGraph.headHash === events.at(-1).hash,
        staleMarkdownDetectedAndRebuilt: !repairedMarkdown.includes("TAMPERED-DERIVED-MARKER"),
        repairedRetrievalRank: itemRank(repairedPack, sourceEvents[repairDescriptor.index].eventId)
      },
      correctAbstention: abstention.every((item) => item.correctAbstention),
      abstention,
      baselineEstimatedTokens,
      maximumPackEstimatedTokens: maximumUsedTokens,
      minimumEstimatedReduction,
      tokenEstimator: "portable ceil(characters / 4)",
      providerBillingMeasurement: false,
      cases,
      parity,
      storeVerified: store.ok
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const scales = [];
for (const fileCount of fileCounts) scales.push(await evaluateScale(fileCount));

const totalFiles = scales.reduce((sum, scale) => sum + scale.fileCount, 0);
const totalPositiveQueries = scales.reduce((sum, scale) => sum + scale.exactQueries + scale.typoTolerantQueries, 0);
const totalUnsupportedQueries = scales.reduce((sum, scale) => sum + scale.unsupportedQueries, 0);
const artifact = {
  schemaVersion: "qarinah.multifile-context-eval-result.v1",
  packageVersion: evidencePackageVersion,
  fixture: {
    description: "Deterministic 40/50/100-file project workspaces with nested JavaScript and Markdown files, resolved imports/links, one unique answer-bearing memory record per file, lexical distractors, graph-only evidence, supersession, contradiction, stale derived projections, and unsupported controls.",
    fileCounts,
    totalFiles,
    totalPositiveQueries,
    totalUnsupportedQueries,
    tokenEstimator: "portable ceil(characters / 4)",
    providerBillingMeasurement: false
  },
  expected: {
    allScalesPassed: scales.every((scale) => (
      scale.allTargetsRankedFirst
      && scale.allAnswersPreserved
      && scale.allExactQueriesUsedSqlite
      && scale.allTypoQueriesUsedFuzzyRetrieval
      && scale.allExactQueriesAcceptedDirect
      && scale.allTypoQueriesConservativelyAbstained
      && scale.persistedInMemoryParity
      && scale.projectStructure.latePathAndReferencePreserved
      && scale.projectStructure.markdownFirstMiddleLastPathsPreserved
      && scale.graphLinkedDecisionRecovered
      && scale.supersededDecisionExcluded
      && scale.conflictVisible
      && scale.sqliteReadModel.requiredTablesPresent
      && scale.derivedRepair.staleGraphDetectedAndRebuilt
      && scale.derivedRepair.staleMarkdownDetectedAndRebuilt
      && scale.correctAbstention
      && scale.storeVerified
    )),
    scales
  },
  claim: "Across deterministic 40-, 50-, and 100-file workspaces, every file-specific exact and typo-tolerant query ranked its cited answer first; SQLite, graph, Markdown, supersession, conflict, repair, and unsupported-query controls also passed.",
  limitations: [
    "This is a deterministic local retrieval and projection-integrity benchmark, not a provider-backed task-completion experiment.",
    "The files and answer records are synthetic so every relevance judgment and expected answer is reproducible.",
    "Correct abstention means unsupported direct-coverage queries were rejected; it is successful fail-closed behavior, not a long-document failure.",
    "Portable ceil(characters / 4) estimates are not provider billing measurements."
  ]
};

assert.equal(artifact.expected.allScalesPassed, true);
assert.equal(totalFiles, 190);
assert.equal(totalPositiveQueries, 380);
assert.equal(totalUnsupportedQueries, 9);

if (writeResult) {
  await writeFile(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
} else {
  const committed = JSON.parse(await readFile(resultPath, "utf8"));
  assert.deepEqual(committed, artifact, "Multifile context evidence no longer matches the deterministic evaluator.");
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "qarinah.multifile-context-eval-run.v1",
  packageVersion: packageJson.version,
  evidencePackageVersion,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  ...artifact
}, null, 2)}\n`);
