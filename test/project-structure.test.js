import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  compileContext,
  initializeWorkspace,
  inspectSqliteReadModel,
  loadWorkspace,
  readEvents,
  rebuildDerivedState,
  scanProjectStructure
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

async function fixtureWorkspace(t) {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
  await writeFile(path.join(root, "src", "a.js"), "import { b } from './b.js';\nexport const a = b;\n", "utf8");
  await writeFile(path.join(root, "src", "b.js"), "export const b = 1;\n", "utf8");
  await writeFile(path.join(root, "README.md"), "# Fixture\n\n[Module](./src/a.js)\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), "ignored.js\n", "utf8");
  await writeFile(path.join(root, "ignored.js"), "export const ignored = true;\n", "utf8");
  await writeFile(path.join(root, "node_modules", "ignored", "secret.js"), "export const secret = true;\n", "utf8");
  await writeFile(path.join(root, ".hidden.js"), "export const hidden = true;\n", "utf8");
  return root;
}

test("project structure scan records a bounded source observation and materializes file relations", async (t) => {
  const root = await fixtureWorkspace(t);
  const result = await scanProjectStructure({ cwd: root });
  assert.equal(result.captured, true);
  assert.equal(result.fileCount, 3);
  assert.deepEqual(result.changes.added, ["README.md", "src/a.js", "src/b.js"]);

  const [event] = await readEvents(root);
  const structure = event.data.projectStructure;
  assert.equal(structure.schemaVersion, "qarinah.project-structure.v1");
  assert.equal(structure.files.some((file) => file.path.includes("node_modules")), false);
  assert.equal(structure.files.some((file) => file.path === ".hidden.js"), false);
  assert.equal(structure.files.some((file) => file.path === "ignored.js"), false);
  const source = structure.files.find((file) => file.path === "src/a.js");
  assert.deepEqual(source.references.map(({ type, specifier, target }) => ({ type, specifier, target })), [{
    type: "imports",
    specifier: "./b.js",
    target: "src/b.js"
  }]);
  assert.deepEqual({ ...source.references[0].span }, { start: 19, end: 25, line: 1, column: 20 });

  await rebuildDerivedState(root);
  const graph = JSON.parse(await readFile(path.join(root, ".qarinah", "graph", "graph.json"), "utf8"));
  const sourceNode = graph.nodes.find((node) => node.path === "src/a.js");
  const targetNode = graph.nodes.find((node) => node.path === "src/b.js");
  assert.ok(graph.edges.some((edge) => edge.source === sourceNode.id && edge.type === "imports" && edge.target === targetNode.id));
  assert.equal(graph.projectStructure.sourceEventId, event.eventId);

  const markdown = await readFile(path.join(root, ".qarinah", "records", "CONTEXT.md"), "utf8");
  assert.match(markdown, /Current project structure/);
  assert.equal(markdown.includes("src/a\\.js"), true);
  const pack = await compileContext("src a module", { cwd: root, maxChars: 8_000 });
  assert.ok(pack.items.some((item) => item.eventId === event.eventId));

  const unchanged = await scanProjectStructure({ cwd: root });
  assert.equal(unchanged.captured, false);
  assert.equal(unchanged.unchanged, true);
  assert.equal((await readEvents(root)).length, 1);
});

test("project structure scan detects changes, renames, and deletions by path and content identity", async (t) => {
  const root = await fixtureWorkspace(t);
  const first = await scanProjectStructure({ cwd: root });
  await rename(path.join(root, "src", "b.js"), path.join(root, "src", "renamed.js"));
  await writeFile(path.join(root, "src", "a.js"), "import { b } from './renamed.js';\nexport const a = b;\n", "utf8");
  await rm(path.join(root, "README.md"));

  const second = await scanProjectStructure({ cwd: root });
  assert.equal(second.captured, true);
  assert.deepEqual(second.changes.changed, ["src/a.js"]);
  assert.deepEqual(second.changes.deleted, ["README.md"]);
  assert.deepEqual(second.changes.renamed.map(({ from, to }) => ({ from, to })), [{
    from: "src/b.js",
    to: "src/renamed.js"
  }]);
  const events = await readEvents(root);
  assert.deepEqual(events[1].relations, [{ type: "supersedes", target: first.eventId }]);
});

test("project graph coalesces repeated reference edges while preserving every observation", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "a.js"), "import './b.js';\nimport './b.js';\n", "utf8");
  await writeFile(path.join(root, "src", "b.js"), "export const b = 1;\n", "utf8");

  const result = await scanProjectStructure({ cwd: root });
  assert.equal(result.captured, true);
  await rebuildDerivedState(root);

  const graph = JSON.parse(await readFile(path.join(root, ".qarinah", "graph", "graph.json"), "utf8"));
  const sourceNode = graph.nodes.find((node) => node.path === "src/a.js");
  const targetNode = graph.nodes.find((node) => node.path === "src/b.js");
  const imports = graph.edges.filter((edge) => (
    edge.source === sourceNode.id && edge.type === "imports" && edge.target === targetNode.id
  ));
  assert.equal(imports.length, 1);
  assert.equal(imports[0].occurrenceCount, 2);
  assert.equal(imports[0].occurrences.length, 2);
  assert.deepEqual(imports[0].occurrences.map((occurrence) => occurrence.span.line), [1, 2]);

  const readModel = await inspectSqliteReadModel(await loadWorkspace(root));
  assert.equal(readModel.eventCount, 1);
  assert.equal(readModel.headHash, result.hash);
});

test("large project-structure retrieval preserves the query-matched late path", async (t) => {
  const root = await temporaryDirectory(t);
  await initializeWorkspace(root, { capture: "content" });
  await mkdir(path.join(root, "src"), { recursive: true });
  await Promise.all(Array.from({ length: 100 }, (_, index) => {
    const name = `module-${String(index).padStart(3, "0")}.js`;
    const next = `module-${String((index + 1) % 100).padStart(3, "0")}.js`;
    return writeFile(
      path.join(root, "src", name),
      `import './${next}';\nexport const module${index} = ${index};\n`,
      "utf8"
    );
  }));

  const scan = await scanProjectStructure({ cwd: root });
  assert.equal(scan.fileCount, 100);
  await rebuildDerivedState(root);
  const persisted = await compileContext("src/module-099.js imports", {
    cwd: root,
    maxChars: 8_000,
    limit: 3,
    minimumCoverage: "partial"
  });
  assert.equal(persisted.items[0].eventId, scan.eventId);
  assert.match(persisted.items[0].excerpt, /src\/module-099\.js/u);
  assert.match(persisted.items[0].excerpt, /imports \.\/module-000\.js -> src\/module-000\.js/u);
  assert.match(persisted.items[0].reason, /sqlite-fts5/u);

  const inMemory = await compileContext("src/module-099.js imports", {
    cwd: root,
    maxChars: 8_000,
    limit: 3,
    minimumCoverage: "partial",
    inMemory: true
  });
  assert.equal(inMemory.items[0].eventId, scan.eventId);
  assert.match(inMemory.items[0].excerpt, /src\/module-099\.js/u);
});

test("project structure scan skips linked paths and bounds oversized files", async (t) => {
  const root = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  await initializeWorkspace(root);
  await writeFile(path.join(root, "large.js"), "x".repeat(2_048), "utf8");
  await writeFile(path.join(outside, "outside.js"), "export const outside = true;\n", "utf8");
  try {
    await symlink(path.join(outside, "outside.js"), path.join(root, "linked.js"), "file");
  } catch (error) {
    if (!["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) throw error;
  }
  await scanProjectStructure({ cwd: root, maxFileBytes: 1_024 });
  const [event] = await readEvents(root);
  assert.deepEqual(event.data.projectStructure.files.map(({ path: filePath, skipped }) => ({ path: filePath, skipped })), [{
    path: "large.js",
    skipped: "oversized"
  }]);
});
