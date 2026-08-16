import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  buildLinkedProjectMemory,
  compileContext,
  initializeWorkspace,
  loadLinkedProjectMemory,
  queryLinkedProjectMemory,
  rankLinkedProjectMemory,
  readEvents,
  rebuildDerivedState,
  scanProjectStructure,
  serveMemoryDashboard
} from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";
import { compactLinkedGraph } from "../src/dashboard.js";

function machineTrustPath(root) {
  const resolved = path.resolve(root);
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const digest = createHash("sha256").update(normalized).digest("hex");
  const stateRoot = process.env.QARINAH_STATE_DIR
    ? path.resolve(process.env.QARINAH_STATE_DIR)
    : process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Qarinah")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", "Qarinah")
        : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "qarinah");
  return path.join(stateRoot, "trusted-workspaces", `${digest}.json`);
}

function syntheticEvent(index, overrides = {}) {
  const digest = String(index + 1).padStart(64, "0").slice(-64);
  return {
    eventId: `evt_fixture_${String(index).padStart(8, "0")}`,
    timestamp: new Date(Date.UTC(2026, 0, 1) + index).toISOString(),
    kind: "decision",
    actor: { type: "human", id: "fixture" },
    title: "Retain durable project context",
    body: "The project memory keeps a bounded verified record.",
    data: {},
    confidence: "claimed",
    relations: [],
    provenance: { adapter: "fixture", sourceId: null, contentHash: `sha256:${digest}` },
    retention: { class: "project", expiresAt: null },
    previousHash: null,
    hash: `sha256:${digest}`,
    ...overrides
  };
}

test("linked memory is deterministic, temporal, scope-bound, and poison-resistant", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const restricted = {
    repository: { id: "team/app", branch: "main", commit: "a".repeat(40) },
    disclosure: { scopes: ["engineering.app"], classification: "restricted" }
  };
  const oldDecision = await appendEvent(eventInput({
    ...restricted,
    timestamp: "2026-01-01T00:00:00.000Z",
    title: "Release approval uses the first policy",
    body: "The application release requires the first reviewed approval boundary."
  }), { cwd: root });
  const currentDecision = await appendEvent(eventInput({
    ...restricted,
    timestamp: "2026-02-01T00:00:00.000Z",
    title: "Release approval uses exact artifact identity",
    body: "The current application release policy binds approval to an exact artifact.",
    relations: [{ type: "supersedes", target: oldDecision.eventId }]
  }), { cwd: root });
  await appendEvent(eventInput({
    timestamp: "2026-02-02T00:00:00.000Z",
    title: "Unrelated documentation note",
    body: "The documentation navigation changed."
  }), { cwd: root });

  const first = await rebuildDerivedState(root);
  const projectionPath = path.join(workspace.root, ".qarinah", "graph", "linked-memory.json");
  const firstBytes = await readFile(projectionPath, "utf8");
  const second = await rebuildDerivedState(root);
  assert.equal(await readFile(projectionPath, "utf8"), firstBytes);
  assert.deepEqual(first.linkedMemory, second.linkedMemory);

  const historical = await queryLinkedProjectMemory("release approval policy", {
    cwd: root,
    types: ["memory"],
    authorityScopes: ["engineering.app"],
    repositoryIds: ["team/app"],
    asOf: "2026-01-15T00:00:00.000Z"
  });
  assert.equal(historical.items[0].node.id, oldDecision.eventId);
  assert.equal(historical.items[0].statusAtAsOf, "current");
  assert.equal(historical.items[0].node.status, "current");
  assert.deepEqual(historical.items[0].node.supersededBy, []);

  const current = await queryLinkedProjectMemory("release approval policy", {
    cwd: root,
    types: ["memory"],
    authorityScopes: ["engineering.app"],
    repositoryIds: ["team/app"],
    asOf: "2026-03-01T00:00:00.000Z"
  });
  assert.equal(current.items[0].node.id, currentDecision.eventId);
  assert.equal(current.items.some((item) => item.node.id === oldDecision.eventId), false);
  assert.equal(current.items[0].basis.formula, "0.72*local + 0.18*linked + 0.10*importance");
  assert.match(current.items[0].evidence.hash, /^sha256:[0-9a-f]{64}$/u);

  const denied = await queryLinkedProjectMemory("release approval policy", {
    cwd: root,
    types: ["memory"],
    authorityScopes: ["engineering.other"],
    repositoryIds: ["team/app"],
    asOf: "2026-03-01T00:00:00.000Z"
  });
  assert.equal(denied.items.some((item) => [oldDecision.eventId, currentDecision.eventId].includes(item.node.id)), false);
  assert.equal(denied.filters.excluded, 0, "denied records must not be disclosed through filter counts");

  const poisoned = JSON.parse(firstBytes);
  poisoned.nodes[0].label = "changed derived label";
  await writeFile(projectionPath, `${JSON.stringify(poisoned)}\n`, "utf8");
  await assert.rejects(
    loadLinkedProjectMemory(root, { rebuild: false }),
    (error) => error.code === "LINKED_MEMORY_STALE"
  );
  const repaired = await loadLinkedProjectMemory(root);
  assert.equal(repaired.memory.manifestHash, JSON.parse(firstBytes).manifestHash);
  assert.equal((await readFile(projectionPath, "utf8")).includes("changed derived label"), false);
});

test("repository rank promotes shared dependencies and linked retrieval is non-regressive on a temporal fixture", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "core.js"), "export const releasePolicy = true;\n", "utf8");
  await writeFile(path.join(root, "src", "feature-a.js"), "import { releasePolicy } from './core.js';\nexport const a = releasePolicy;\n", "utf8");
  await writeFile(path.join(root, "src", "feature-b.js"), "import { releasePolicy } from './core.js';\nexport const b = releasePolicy;\n", "utf8");
  await writeFile(path.join(root, "src", "isolated.js"), "export const isolated = true;\n", "utf8");
  const oldDecision = await appendEvent(eventInput({
    timestamp: "2026-01-01T00:00:00.000Z",
    title: "Use a manual release policy",
    body: "The release policy is checked manually."
  }), { cwd: root });
  const target = await appendEvent(eventInput({
    timestamp: "2026-02-01T00:00:00.000Z",
    title: "Use the shared release policy module",
    body: "The current release path uses the shared core module.",
    relations: [{ type: "supersedes", target: oldDecision.eventId }]
  }), { cwd: root });
  const scan = await scanProjectStructure({ cwd: root });
  const scanEvent = (await readEvents(root)).find((event) => event.eventId === scan.eventId);
  const scanAsOf = scanEvent.timestamp;
  await rebuildDerivedState(root);

  const { memory } = await loadLinkedProjectMemory(root, { rebuild: false });
  const core = memory.repositoryMap.entries.find((entry) => entry.path === "src/core.js");
  const isolated = memory.repositoryMap.entries.find((entry) => entry.path === "src/isolated.js");
  assert.ok(core.rank > isolated.rank);
  assert.deepEqual(core.dependents, ["src/feature-a.js", "src/feature-b.js"]);
  assert.ok(memory.repositoryMap.entrypoints.includes(core.id));

  const fileQuery = await queryLinkedProjectMemory("src core js", {
    cwd: root,
    types: ["file"],
    asOf: scanAsOf
  });
  assert.equal(fileQuery.items[0].node.path, "src/core.js");
  assert.ok(fileQuery.items[0].basis.structuralImportance > 0);

  const baseline = await compileContext("shared release policy module", {
    cwd: root,
    asOf: "2026-03-01T00:00:00.000Z",
    limit: 10,
    maxChars: 8_000
  });
  const linked = await queryLinkedProjectMemory("shared release policy module", {
    cwd: root,
    types: ["memory"],
    asOf: "2026-03-01T00:00:00.000Z",
    limit: 10
  });
  assert.equal(baseline.items[0].eventId, target.eventId);
  assert.equal(linked.items[0].node.id, target.eventId);
  assert.ok(linked.items.findIndex((item) => item.node.id === target.eventId)
    <= baseline.items.findIndex((item) => item.eventId === target.eventId));
});

test("invalid linked-memory queries cannot mutate projections or trust checkpoints", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    title: "Initial linked-memory projection",
    body: "This event establishes a persisted graph before it becomes stale."
  }), { cwd: root });
  await rebuildDerivedState(root);
  const projectionPath = path.join(workspace.root, ".qarinah", "graph", "linked-memory.json");
  await appendEvent(eventInput({
    title: "Unprojected event",
    body: "This event makes the persisted linked-memory projection stale."
  }), { cwd: root });
  const trustPath = machineTrustPath(workspace.root);
  const projectionBefore = await readFile(projectionPath, "utf8");
  const trustBefore = await readFile(trustPath, "utf8");
  const invalidRequests = [
    ["query", { limit: 0 }],
    ["query", { types: [] }],
    ["query", { authorityScopes: ["duplicate", "duplicate"] }],
    ["query", { repositoryIds: [""] }],
    ["query", { asOf: "not-a-timestamp" }],
    [42, {}]
  ];
  for (const [query, options] of invalidRequests) {
    await assert.rejects(queryLinkedProjectMemory(query, { cwd: root, ...options }), TypeError);
    assert.equal(await readFile(projectionPath, "utf8"), projectionBefore);
    assert.equal(await readFile(trustPath, "utf8"), trustBefore);
  }
});

test("the loopback dashboard exposes a bounded graph and an evidence-linked search API", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    title: "Keep deployment receipts linked",
    body: "Each deployment keeps its evidence identity."
  }), { cwd: root });
  const persistedGraphPath = path.join(root, ".qarinah", "graph", "linked-memory.json");
  const persistedBefore = await readFile(persistedGraphPath, "utf8");
  const live = await serveMemoryDashboard({ cwd: root, port: 0 });
  t.after(() => live.close());

  const graph = await fetch(`${live.url}api/graph/${workspace.config.workspaceId}`).then((response) => response.json());
  assert.equal(graph.schemaVersion, "qarinah.linked-project-memory.v1");
  assert.ok(graph.nodes.some((node) => node.label === "Keep deployment receipts linked"));
  const query = await fetch(`${live.url}api/search/${workspace.config.workspaceId}?q=deployment%20receipts&type=memory`).then((response) => response.json());
  assert.equal(query.schemaVersion, "qarinah.linked-project-query.v1");
  assert.equal(query.items[0].node.label, "Keep deployment receipts linked");
  const head = await fetch(`${live.url}api/search/${workspace.config.workspaceId}?q=deployment`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await readFile(persistedGraphPath, "utf8"), persistedBefore, "dashboard GET and HEAD must not persist derived state");
  const html = await fetch(`${live.url}project/${workspace.config.workspaceId}/`).then((response) => response.text());
  assert.match(html, /Linked project memory/u);
  assert.match(html, /data-linked-graph/u);
  assert.match(html, /data-graph-search/u);
  assert.match(html, /data-graph-reset/u);
  assert.match(html, /circular project map/u);
  assert.match(html, /pointerdown/u);
  assert.match(html, /qarinahPositionOverrides/u);
  assert.match(html, /data-search-path="\/api\/search\//u);
  assert.match(html, /Score basis/u);
  assert.match(html, /<ol class="graph-results"/u);
  assert.match(html, /admitted source-projection nodes/u);
  assert.doesNotMatch(html, /<script\s+src=/u);
  assert.doesNotMatch(html, /(?:Â|â€”|Ã)/u);
});

test("query-local concepts and graph scores do not disclose restricted influence", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const publicEvent = await appendEvent(eventInput({
    timestamp: "2026-04-01T00:00:00.000Z",
    title: "Albatross release note",
    body: "Albatross is the public project marker."
  }), { cwd: root });
  const before = await queryLinkedProjectMemory("albatross", {
    cwd: root,
    types: ["concept"],
    asOf: "2026-04-03T00:00:00.000Z"
  });
  const publicConcept = before.items.find((item) => item.node.label === "albatross");
  assert.ok(publicConcept);

  await appendEvent(eventInput({
    timestamp: "2026-04-02T00:00:00.000Z",
    title: "Albatross restricted neighbor",
    body: "Albatross umbrellasecret is restricted evidence.",
    disclosure: { classification: "restricted", scopes: ["engineering.secret"] },
    relations: [{ type: "contradicts", target: publicEvent.eventId }]
  }), { cwd: root });
  const withoutScope = await queryLinkedProjectMemory("albatross", {
    cwd: root,
    types: ["concept"],
    asOf: "2026-04-03T00:00:00.000Z"
  });
  assert.deepEqual(withoutScope, before, "hidden evidence must not change the admitted result or score");
  const hiddenTerm = await queryLinkedProjectMemory("umbrellasecret", {
    cwd: root,
    asOf: "2026-04-03T00:00:00.000Z"
  });
  assert.equal(hiddenTerm.items.length, 0);

  const authorized = await queryLinkedProjectMemory("umbrellasecret", {
    cwd: root,
    types: ["concept"],
    authorityScopes: ["engineering.secret"],
    asOf: "2026-04-03T00:00:00.000Z"
  });
  const restrictedConcept = authorized.items.find((item) => item.node.label === "umbrellasecret");
  assert.ok(restrictedConcept);
  assert.equal(restrictedConcept.node.classification, "restricted");
  assert.deepEqual(restrictedConcept.node.disclosureScopes, ["engineering.secret"]);
  assert.equal(restrictedConcept.node.sourceProfiles.every((profile) => profile.classification === "restricted"), true);

  const publicAfterConflict = await queryLinkedProjectMemory("albatross release note", {
    cwd: root,
    types: ["memory"],
    asOf: "2026-04-03T00:00:00.000Z"
  });
  assert.equal(publicAfterConflict.items[0].node.id, publicEvent.eventId);
  assert.equal(publicAfterConflict.items[0].node.conflicted, false);
});

test("future and unauthorized superseders cannot alter returned status metadata", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  const retained = await appendEvent(eventInput({
    timestamp: "2026-05-01T00:00:00.000Z",
    title: "Keep the public release route",
    body: "The public route remains current."
  }), { cwd: root });
  const restricted = await appendEvent(eventInput({
    timestamp: "2026-06-01T00:00:00.000Z",
    title: "Restricted replacement route",
    body: "A protected replacement exists.",
    disclosure: { classification: "restricted", scopes: ["release.secret"] },
    relations: [{ type: "supersedes", target: retained.eventId }]
  }), { cwd: root });
  const historical = await queryLinkedProjectMemory("public release route", {
    cwd: root,
    types: ["memory"],
    asOf: "2026-05-15T00:00:00.000Z"
  });
  assert.equal(historical.items[0].node.status, "current");
  assert.deepEqual(historical.items[0].node.supersededBy, []);
  const unscoped = await queryLinkedProjectMemory("public release route", {
    cwd: root,
    types: ["memory"],
    asOf: "2026-07-01T00:00:00.000Z"
  });
  assert.equal(unscoped.items[0].node.id, retained.eventId);
  assert.equal(unscoped.items[0].node.status, "current");
  assert.deepEqual(unscoped.items[0].node.supersededBy, []);
  assert.equal(JSON.stringify(unscoped).includes(restricted.eventId), false);
  const scoped = await queryLinkedProjectMemory("replacement route", {
    cwd: root,
    types: ["memory"],
    authorityScopes: ["release.secret"],
    asOf: "2026-07-01T00:00:00.000Z"
  });
  assert.equal(scoped.items[0].node.id, restricted.eventId);
});

test("references are temporal, repository-bound, collision-safe, and reuse real project nodes", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "entry.js"), "export const entry = true;\n", "utf8");
  const scan = await scanProjectStructure({ cwd: root });
  const scanEvent = (await readEvents(root)).find((event) => event.eventId === scan.eventId);
  const beforeScan = new Date(Date.parse(scanEvent.timestamp) - 1).toISOString();
  assert.equal((await queryLinkedProjectMemory("src entry js", { cwd: root, types: ["file"], asOf: beforeScan })).items.length, 0);
  const atScan = await queryLinkedProjectMemory("src entry js", { cwd: root, types: ["file"], asOf: scanEvent.timestamp });
  assert.equal(atScan.items[0].node.path, "src/entry.js");
  const fileId = atScan.items[0].node.id;

  await appendEvent(eventInput({
    title: "Entry file is affected",
    body: "The change affects the retained entry file.",
    relations: [{ type: "affects", target: fileId }]
  }), { cwd: root });
  await appendEvent(eventInput({
    timestamp: "2026-08-01T00:00:00.000Z",
    title: "Future receipt reference",
    body: "A receipt becomes visible with this event.",
    repository: { id: "team/other", branch: "main", commit: "b".repeat(40) },
    relations: [{ type: "references", target: "receipt:other-repo-secret" }]
  }), { cwd: root });
  let memory = (await loadLinkedProjectMemory(root)).memory;
  assert.equal(new Set(memory.nodes.map((node) => node.id)).size, memory.nodes.length);
  assert.equal(memory.nodes.filter((node) => node.id === fileId).length, 1);
  assert.equal((await queryLinkedProjectMemory("other repo secret", {
    cwd: root,
    types: ["reference"],
    repositoryIds: ["team/app"],
    asOf: "2026-09-01T00:00:00.000Z"
  })).items.length, 0);
  assert.equal((await queryLinkedProjectMemory("other repo secret", {
    cwd: root,
    types: ["reference"],
    repositoryIds: ["team/other"],
    asOf: "2026-07-01T00:00:00.000Z"
  })).items.length, 0);
  const visibleReference = await queryLinkedProjectMemory("other repo secret", {
    cwd: root,
    types: ["reference"],
    repositoryIds: ["team/other"],
    asOf: "2026-09-01T00:00:00.000Z"
  });
  assert.equal(visibleReference.items[0].node.label, "receipt:other-repo-secret");

  const conceptId = memory.nodes.find((node) => node.type === "concept")?.id;
  assert.ok(conceptId);
  await appendEvent(eventInput({
    title: "Opaque target collision test",
    body: "The opaque target must use a reserved internal identity.",
    relations: [{ type: "references", target: conceptId }]
  }), { cwd: root });
  memory = (await loadLinkedProjectMemory(root)).memory;
  assert.equal(new Set(memory.nodes.map((node) => node.id)).size, memory.nodes.length);
  const opaqueReference = memory.nodes.find((node) => node.type === "reference" && node.label === conceptId);
  assert.ok(opaqueReference);
  assert.notEqual(opaqueReference.id, conceptId);
});

test("malformed project-structure lookalikes are ignored and graph contracts stay strict", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    title: "Untrusted structure-shaped data",
    data: {
      projectStructure: {
        schemaVersion: "qarinah.project-structure.v1",
        snapshotHash: "forged",
        directories: [],
        files: [{ id: "duplicate", path: "../escape", references: [{}] }]
      }
    }
  }), { cwd: root });
  const { memory } = await loadLinkedProjectMemory(root);
  assert.equal(memory.source.projectSnapshotHash, null);
  assert.equal(memory.nodes.some((node) => node.type === "file"), false);
  const memorySchema = JSON.parse(await readFile(new URL("../schemas/linked-project-memory.schema.json", import.meta.url), "utf8"));
  const querySchema = JSON.parse(await readFile(new URL("../schemas/linked-project-query.schema.json", import.meta.url), "utf8"));
  const assertClosed = (value, schema, label) => {
    assert.equal(schema.additionalProperties, false, `${label} must reject unknown properties`);
    for (const key of schema.required) assert.ok(Object.hasOwn(value, key), `${label} is missing ${key}`);
    for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties, key), `${label} has undeclared ${key}`);
  };
  assertClosed(memory, memorySchema, "memory projection");
  for (const node of memory.nodes) {
    assertClosed(node, memorySchema.$defs.node, "memory node");
    for (const profile of node.sourceProfiles) assertClosed(profile, memorySchema.$defs.sourceProfile, "source profile");
  }
  const query = rankLinkedProjectMemory(memory, "untrusted structure", { types: ["memory"] });
  assert.equal(querySchema.properties.items.items.properties.node.$ref, "linked-project-memory.schema.json#/$defs/node");
  assertClosed(query, querySchema, "query result");
  assertClosed(query.coverage, querySchema.properties.coverage, "query coverage");
  assertClosed(query.items[0].node, memorySchema.$defs.node, "query node");
});

test("large ledgers and shared references remain bounded with explicit coverage", () => {
  const workspaceId = `ws_${"a".repeat(32)}`;
  const events = Array.from({ length: 10_001 }, (_, index) => syntheticEvent(index, index === 0 ? {
    title: "Omitted boundary sentinel",
    body: "Only this earliest retained event contains the term archaeopteryx."
  } : {}));
  const memory = buildLinkedProjectMemory(events, workspaceId);
  assert.equal(memory.eventCount, 10_001);
  assert.equal(memory.coverage.projectedEvents, 10_000);
  assert.equal(memory.coverage.omittedEvents, 1);
  assert.equal(memory.coverage.complete, false);
  const compactGraph = compactLinkedGraph(memory);
  assert.ok(compactGraph.statistics.nodes > 100);
  assert.equal(compactGraph.statistics.nodes, memory.statistics.nodes);
  assert.equal(compactGraph.statistics.rankedCandidates, 100);
  assert.equal(compactGraph.statistics.selectedNodes, compactGraph.nodes.length);
  const omittedTermQuery = rankLinkedProjectMemory(memory, "archaeopteryx", {
    types: ["memory"],
    asOf: "2027-01-01T00:00:00.000Z"
  });
  assert.equal(omittedTermQuery.items.length, 0);
  assert.equal(omittedTermQuery.coverage.status, "none");
  assert.equal(omittedTermQuery.coverage.sourceEvents, 10_001);
  assert.equal(omittedTermQuery.coverage.projectedEvents, 10_000);
  assert.equal(omittedTermQuery.coverage.omittedEvents, 1);
  assert.equal(omittedTermQuery.coverage.projectionComplete, false);

  const queryOptions = {
    types: ["memory"],
    asOf: "2027-01-01T00:00:00.000Z",
    authorityScopes: []
  };
  const admittedBaseline = buildLinkedProjectMemory(events.slice(0, 10_000), workspaceId, queryOptions);
  const baselineQuery = rankLinkedProjectMemory(admittedBaseline, "archaeopteryx", queryOptions);
  const hiddenNewest = syntheticEvent(10_000, {
    title: "Restricted newest event",
    body: "This event is outside the requested disclosure authority.",
    disclosure: { classification: "restricted", scopes: ["private.review"] }
  });
  const admittedWithHidden = buildLinkedProjectMemory(
    [...events.slice(0, 10_000), hiddenNewest],
    workspaceId,
    queryOptions
  );
  const hiddenQuery = rankLinkedProjectMemory(admittedWithHidden, "archaeopteryx", queryOptions);
  assert.deepEqual(hiddenQuery, baselineQuery, "an unauthorized newest event must not consume an admitted projection slot");
  assert.equal(hiddenQuery.coverage.projectionComplete, true);

  const referenceEvents = Array.from({ length: 513 }, (_, index) => syntheticEvent(index, {
    repository: { id: `team/repository-${index}`, branch: "main", commit: "c".repeat(40) },
    relations: [{ type: "references", target: "receipt:shared-profile-boundary" }]
  }));
  const referenceMemory = buildLinkedProjectMemory(referenceEvents, workspaceId);
  const reference = referenceMemory.nodes.find((node) => node.type === "reference" && node.label === "receipt:shared-profile-boundary");
  assert.equal(reference.sourceProfileCount, 513);
  assert.equal(reference.sourceProfilesTruncated, true);
  const query = rankLinkedProjectMemory(referenceMemory, "shared profile boundary", {
    types: ["reference"],
    repositoryIds: ["team/repository-512"],
    asOf: "2027-01-01T00:00:00.000Z"
  });
  assert.equal(query.items.length, 0, "an incomplete profile set must fail closed");
  assert.equal(query.coverage.authorityComplete, false);
});
