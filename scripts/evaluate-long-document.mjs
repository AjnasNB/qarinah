import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  compileContext,
  initializeWorkspace
} from "../src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-long-document-eval-"));
process.env.QARINAH_STATE_DIR = path.join(root, ".machine-state");

const facts = Object.freeze([
  {
    section: 23,
    placement: "start",
    query: "amber observatory heliostat reboot code",
    robustQuery: "amber observatry heliostat rebot code",
    answer: "KQ7-MARBLE-219",
    sentence: "The Amber Observatory heliostat reboot code is KQ7-MARBLE-219."
  },
  {
    section: 67,
    placement: "middle",
    query: "delta archive glacier seal temperature",
    robustQuery: "delta archive glacier seal temprature",
    answer: "-18.75 degrees Celsius",
    sentence: "The Delta Archive glacier seal temperature must remain at -18.75 degrees Celsius."
  },
  {
    section: 111,
    placement: "end",
    query: "cedar ferry emergency beacon cadence",
    robustQuery: "cedar fery emergency becon cadense",
    answer: "17-5-17 seconds",
    sentence: "The Cedar Ferry emergency beacon cadence is 17-5-17 seconds."
  },
  {
    section: 155,
    placement: "start",
    query: "violet greenhouse nutrient reservoir ratio",
    robustQuery: "violet grenhouse nutrent reservor ratio",
    answer: "13:8:5",
    sentence: "The Violet Greenhouse nutrient reservoir ratio is 13:8:5."
  },
  {
    section: 199,
    placement: "middle",
    query: "atlas tunnel inspection marker",
    robustQuery: "atlas tunel inspecshun marker",
    answer: "NORTH-44-QUARTZ",
    sentence: "The Atlas Tunnel inspection marker is NORTH-44-QUARTZ."
  },
  {
    section: 243,
    placement: "end",
    query: "cobalt library restoration solvent",
    robustQuery: "cobalt libary restorashun solvent",
    answer: "isopropyl acetate at 6 percent",
    sentence: "The Cobalt Library restoration solvent is isopropyl acetate at 6 percent."
  },
  {
    section: 287,
    placement: "start",
    query: "meridian clinic backup generator test",
    robustQuery: "meridian clinc bakup generatr test",
    answer: "Tuesday at 04:20 UTC",
    sentence: "The Meridian Clinic backup generator test runs Tuesday at 04:20 UTC."
  },
  {
    section: 331,
    placement: "end",
    query: "saffron antenna azimuth lock",
    robustQuery: "safron antena azmuth lock",
    answer: "271.4 degrees",
    sentence: "The Saffron Antenna azimuth lock is 271.4 degrees."
  }
]);

const unsupportedQueries = Object.freeze([
  "crimson submarine ballast encryption seed",
  "opal foundry lunar kiln pressure",
  "silver orchard quantum irrigation password",
  "topaz harbor magnetic anchor checksum"
]);

const topicWords = Object.freeze([
  "maintenance", "inventory", "calibration", "handover", "inspection", "routing",
  "archive", "telemetry", "training", "weather", "scheduling", "supplies"
]);

function filler(section, paragraph) {
  const topic = topicWords[(section + paragraph) % topicWords.length];
  const adjacent = topicWords[(section + paragraph + 5) % topicWords.length];
  return `Section ${String(section).padStart(3, "0")} paragraph ${paragraph} logs routine ${topic}. Operators compare the signed ${adjacent} record, note ordinary variance, and retain the reviewed observation.`;
}

function sectionBody(section) {
  const fact = facts.find((candidate) => candidate.section === section);
  const paragraphs = Array.from({ length: 2 }, (_, index) => filler(section, index + 1));
  if (fact?.placement === "start") paragraphs.unshift(fact.sentence);
  if (fact?.placement === "middle") paragraphs.splice(1, 0, fact.sentence);
  if (fact?.placement === "end") paragraphs.push(fact.sentence);
  const followingFact = facts.find((candidate) => candidate.section === section + 1);
  if (followingFact) {
    const nearMatch = followingFact.query.split(" ").slice(0, -2).join(" ");
    paragraphs.push(
      `A nearby index mentions ${nearMatch}, but this background section contains no operative value.`
    );
  }
  return paragraphs.join("\n\n");
}

function estimatedTokens(text) {
  return Math.ceil(String(text).length / 4);
}

function reduction(smaller, baseline) {
  return Math.round((1 - smaller / baseline) * 1_000_000) / 1_000_000;
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

try {
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const targets = new Map();
  const sections = [];
  let sequence = 0;

  for (let section = 1; section <= 384; section += 1) {
    const body = sectionBody(section);
    const fact = facts.find((candidate) => candidate.section === section);
    const title = `Operations handbook section ${section}: ${topicWords[section % topicWords.length]}`;
    sections.push(`# ${title}\n\n${body}`);
    const event = await appendEvent({
      kind: "source",
      actor: { type: "source", id: "long-document-fixture" },
      title,
      body,
      data: {
        documentId: "regional-operations-handbook-v1",
        section,
        role: fact ? "answer-bearing-section" : "background-section"
      },
      confidence: "extracted",
      relations: [{ type: "references", target: "document:regional-operations-handbook-v1" }],
      provenance: {
        adapter: "qarinah-long-document-eval",
        sourceId: `regional-operations-handbook-v1#section-${section}`
      },
      retention: { class: "project", expiresAt: null },
      timestamp: new Date(Date.UTC(2026, 5, 1, 0, sequence++)).toISOString()
    }, { workspace });
    if (fact) targets.set(fact.query, event.eventId);
  }

  const documentText = sections.join("\n\n");
  const sourceChars = documentText.length;
  const sourceEstimatedTokens = estimatedTokens(documentText);
  const sourceSha256 = sha256(documentText);
  const cases = [];
  const fixedMaxTokens = 600;

  for (const [queryType, queryField, minimumCoverage] of [
    ["exact", "query", "partial"],
    ["typo-tolerant", "robustQuery", "partial"]
  ]) {
    for (const fact of facts) {
      const query = fact[queryField];
      const pack = await compileContext(query, {
        cwd: root,
        maxChars: fixedMaxTokens * 4,
        maxTokens: fixedMaxTokens,
        reserveTokens: 0,
        limit: 1,
        minimumCoverage,
        inMemory: true,
        asOf: "2026-07-20T00:00:00.000Z"
      });
      const item = pack.items[0];
      const targetRank = item?.eventId === targets.get(fact.query) ? 1 : 0;
      cases.push({
        queryType,
        query,
        answer: fact.answer,
        placement: fact.placement,
        targetRank,
        coverage: pack.retrieval.coverage.status,
        maxTokens: fixedMaxTokens,
        usedTokens: pack.budget.usedTokens,
        usedChars: pack.budget.usedChars,
        itemCount: pack.items.length,
        summaryItems: pack.items.filter((candidate) => candidate.kind === "summary").length,
        answerPreserved: item?.excerpt.includes(fact.answer) === true,
        sourceHashPresent: /^sha256:[a-f0-9]{64}$/u.test(item?.hash ?? ""),
        manifestHashPresent: /^sha256:[a-f0-9]{64}$/u.test(pack.manifestHash),
        estimatedTokenReduction: reduction(pack.budget.usedTokens, sourceEstimatedTokens)
      });
    }
  }

  const unsupported = [];
  for (const query of unsupportedQueries) {
    let failedClosed = false;
    let errorCode = null;
    try {
      await compileContext(query, {
        cwd: root,
        maxChars: fixedMaxTokens * 4,
        maxTokens: fixedMaxTokens,
        reserveTokens: 0,
        limit: 1,
        minimumCoverage: "direct",
        inMemory: true,
        asOf: "2026-07-20T00:00:00.000Z"
      });
    } catch (error) {
      failedClosed = error?.code === "CONTEXT_COVERAGE_TOO_LOW";
      errorCode = error?.code ?? error?.name ?? "unknown";
    }
    unsupported.push({ query, failedClosed, errorCode });
  }

  const averageUsedTokens = Math.round(
    cases.reduce((sum, item) => sum + item.usedTokens, 0) / cases.length
  );
  const maximumUsedTokens = Math.max(...cases.map((item) => item.usedTokens));
  const minimumReduction = Math.min(...cases.map((item) => item.estimatedTokenReduction));
  const expected = {
    fixture: {
      description: "Deterministic 384-section synthetic operations handbook segmented into retained source records, with eight answer-bearing sections, fixed-budget exact and typo-tolerant queries, near-match distractors, and unsupported controls.",
      sections: 384,
      positiveCases: cases.length,
      unsupportedCases: unsupported.length,
      sourceChars,
      sourceEstimatedTokens,
      sourceSha256,
      tokenEstimator: "portable ceil(characters / 4)",
      providerBillingMeasurement: false,
      fixedMaxTokens
    },
    result: {
      allAnswersPreserved: cases.every((item) => item.answerPreserved),
      allTargetsRankedFirst: cases.every((item) => item.targetRank === 1),
      exactCoverageAtLeastPartial: cases.filter((item) => item.queryType === "exact")
        .every((item) => ["partial", "direct"].includes(item.coverage)),
      typoCoverageAtLeastPartial: cases.filter((item) => item.queryType === "typo-tolerant")
        .every((item) => ["partial", "direct"].includes(item.coverage)),
      unsupportedQueriesFailedClosed: unsupported.every((item) => item.failedClosed),
      modelSummaryItems: cases.reduce((sum, item) => sum + item.summaryItems, 0),
      averageUsedTokens,
      maximumUsedTokens,
      minimumEstimatedTokenReduction: minimumReduction,
      cases,
      unsupported
    }
  };

  assert.ok(sourceEstimatedTokens >= 10_000);
  assert.equal(
    expected.result.allAnswersPreserved,
    true,
    `Missing answers: ${JSON.stringify(cases.filter((item) => !item.answerPreserved))}`
  );
  assert.equal(
    expected.result.allTargetsRankedFirst,
    true,
    `Misranked targets: ${JSON.stringify(cases.filter((item) => item.targetRank !== 1))}`
  );
  assert.equal(expected.result.exactCoverageAtLeastPartial, true);
  assert.equal(expected.result.typoCoverageAtLeastPartial, true);
  assert.equal(expected.result.unsupportedQueriesFailedClosed, true);
  assert.equal(expected.result.modelSummaryItems, 0);
  assert.ok(expected.result.maximumUsedTokens <= fixedMaxTokens);
  assert.ok(expected.result.minimumEstimatedTokenReduction >= 0.95);
  assert.equal(cases.every((item) => item.sourceHashPresent), true);
  assert.equal(cases.every((item) => item.manifestHashPresent), true);

  if (!process.argv.includes("--no-verify")) {
    const committed = JSON.parse(await readFile(
      path.join(repositoryRoot, "bench", "results", "long-document-context-0.1.0-alpha.3.json"),
      "utf8"
    ));
    assert.equal(committed.schemaVersion, "qarinah.long-document-context-eval-result.v1");
    assert.equal(committed.packageVersion, packageJson.version);
    assert.deepEqual(committed.expected, expected, "Long-document context evidence no longer matches.");
  }

  process.stdout.write(`${JSON.stringify({
    schemaVersion: "qarinah.long-document-context-eval-run.v1",
    packageVersion: packageJson.version,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    expected
  }, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
