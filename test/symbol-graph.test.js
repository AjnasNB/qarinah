import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  buildSymbolGraph,
  buildDeveloperMemoryView,
  createLanguageServer,
  initializeWorkspace,
  loadSymbolGraph,
  parseTypeScriptSymbols,
  querySymbolGraph,
  scanProjectStructure
} from "../src/index.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-symbol-graph-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "math.ts"), [
    "export function add(left: number, right: number) {",
    "  return left + right;",
    "}",
    "export class Calculator {",
    "  sum(value: number) { return add(value, 1); }",
    "}",
    ""
  ].join("\n"));
  await writeFile(path.join(root, "consumer.ts"), [
    "import { add } from './math.js';",
    "export const total = add(2, 3);",
    ""
  ].join("\n"));
  await writeFile(path.join(root, "notes.py"), "def ignored_for_v1():\n    return True\n");
  await initializeWorkspace(root, { capture: "metadata" });
  await scanProjectStructure({ cwd: root });
  return root;
}

test("symbol graph parses declarations, resolves references, and ranks with a transparent built-in vector basis", async (t) => {
  const root = await fixture(t);
  const graph = await buildSymbolGraph({ cwd: root });
  assert.equal(graph.schemaVersion, "qarinah.symbol-graph.v1");
  assert.equal(graph.coverage.indexedFiles, 2);
  assert.equal(graph.coverage.eligibleFiles, 2);
  assert.equal(graph.skipped.some((entry) => entry.path === "notes.py" && entry.reason === "unsupported-language"), true);
  const add = graph.symbols.find((symbol) => symbol.name === "add" && symbol.kind === "function");
  assert.ok(add);
  assert.equal(add.exported, true);
  assert.equal(add.references.some((reference) => reference.path === "consumer.ts"), true);
  const parameter = graph.symbols.find((symbol) => symbol.name === "left" && symbol.kind === "parameter");
  assert.equal(parameter.exported, false);
  assert.equal(graph.edges.some((edge) => edge.type === "defines" && edge.target === add.id), true);
  assert.equal(graph.edges.some((edge) => edge.type === "references" && edge.target === add.id), true);

  const query = querySymbolGraph(graph, "addition helper", { limit: 5 });
  assert.equal(query.formula, "0.62*lexical + 0.28*local-subword-vector + 0.10*reference-structure");
  assert.equal(query.results.some((entry) => entry.symbol.id === add.id), true);
  assert.equal((await loadSymbolGraph({ cwd: root })).manifestHash, graph.manifestHash);
  const developerView = await buildDeveloperMemoryView({ cwd: root, includeWorktrees: false, query: "add" });
  assert.equal(developerView.symbols.available, true);
  assert.equal(developerView.symbols.results.some((entry) => entry.symbol.name === "add"), true);

  await writeFile(path.join(root, "math.ts"), "export const changed = true;\n");
  const stale = await buildSymbolGraph({ cwd: root, persist: false });
  assert.equal(stale.skipped.some((entry) => entry.path === "math.ts" && entry.reason === "stale-or-linked"), true);
  assert.equal(stale.coverage.complete, false);
});

test("TypeScript parser returns bounded diagnostics without storing source bodies", () => {
  const parsed = parseTypeScriptSymbols("broken.ts", "export function broken( { return 1; }");
  assert.ok(parsed.diagnostics.length > 0);
  assert.equal(parsed.symbols.every((symbol) => !Object.hasOwn(symbol, "body")), true);
});

function frame(message) {
  const bytes = Buffer.from(JSON.stringify(message));
  return Buffer.concat([Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`), bytes]);
}

function responseReader(output) {
  let buffer = Buffer.alloc(0);
  const waiting = new Map();
  output.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const header = buffer.subarray(0, separator).toString("ascii");
      const length = Number(/Content-Length:\s*([0-9]+)/iu.exec(header)?.[1]);
      if (!Number.isSafeInteger(length) || buffer.length < separator + 4 + length) return;
      const message = JSON.parse(buffer.subarray(separator + 4, separator + 4 + length).toString("utf8"));
      buffer = buffer.subarray(separator + 4 + length);
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  return (id) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for LSP response ${id}.`)), 5_000);
    waiting.set(id, (message) => { clearTimeout(timeout); resolve(message); });
  });
}

test("language server exposes initialize, workspace symbols, and document symbols over bounded JSON-RPC", async (t) => {
  const root = await fixture(t);
  const input = new PassThrough();
  const output = new PassThrough();
  const waitFor = responseReader(output);
  const server = createLanguageServer({ input, output, cwd: root });
  t.after(() => server.close());

  let responsePromise = waitFor(1);
  input.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri: pathToFileURL(root).href } }));
  const initialized = await responsePromise;
  assert.equal(initialized.result.serverInfo.name, "Qarinah language server");
  assert.equal(initialized.result.capabilities.definitionProvider, true);

  responsePromise = waitFor(2);
  input.write(frame({ jsonrpc: "2.0", id: 2, method: "workspace/symbol", params: { query: "add" } }));
  const workspaceSymbols = await responsePromise;
  assert.equal(workspaceSymbols.result.some((symbol) => symbol.name === "add"), true);

  responsePromise = waitFor(3);
  input.write(frame({ jsonrpc: "2.0", id: 3, method: "textDocument/documentSymbol", params: { textDocument: { uri: pathToFileURL(path.join(root, "math.ts")).href } } }));
  const documentSymbols = await responsePromise;
  assert.equal(documentSymbols.result.some((symbol) => symbol.name === "Calculator"), true);
});

test("symbol graph schema is strict at the public boundary", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/symbol-graph.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.symbol-graph.v1");
  assert.equal(schema.$defs.symbol.additionalProperties, false);
  assert.equal(schema.$defs.edge.additionalProperties, false);
});
