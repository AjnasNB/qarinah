import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { throwIfAborted, validateAbortSignal } from "./abort.js";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { validateProjectStructureSnapshot } from "./project-structure.js";
import { readEvents } from "./store.js";
import { atomicWriteFile, loadWorkspace, resolveWithin, secureStoragePath } from "./workspace.js";

export const SYMBOL_GRAPH_SCHEMA_VERSION = "qarinah.symbol-graph.v2";
const MAX_GRAPH_BYTES = 128 * 1024 * 1024;
const MAX_SYMBOLS = 100_000;
const MAX_REFERENCES = 500_000;
const MAX_TREE_NODES_PER_FILE = 1_000_000;
const SCRIPT_LANGUAGES = new Set(["javascript", "typescript"]);
const TREE_SITTER_GRAMMARS = Object.freeze({
  c: "c",
  cpp: "cpp",
  csharp: "c_sharp",
  go: "go",
  java: "java",
  kotlin: "kotlin",
  python: "python",
  rust: "rust"
});
const SYMBOL_LANGUAGES = new Set([...SCRIPT_LANGUAGES, ...Object.keys(TREE_SITTER_GRAMMARS)]);
const TREE_SITTER_LANGUAGE_NAMES = Object.freeze([...new Set(Object.keys(TREE_SITTER_GRAMMARS))].sort());
const TYPESCRIPT_RUNTIME_SPECIFIER = "typescript-classic";
const TREE_SITTER_RUNTIME_SPECIFIER = "web-tree-sitter";
const runtimeRequire = createRequire(import.meta.url);
const TREE_SITTER_RUNTIME_VERSION = "0.20.8";
const TREE_SITTER_GRAMMAR_VERSION = "0.1.13";
let ts;
let Parser;
let treeSitterReady;
const treeSitterLanguages = new Map();

function optionalRuntime(specifier, vendoredPath) {
  try {
    return runtimeRequire(specifier);
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
    return runtimeRequire(fileURLToPath(new URL(vendoredPath, import.meta.url)));
  }
}

function typeScriptRuntime() {
  ts ??= optionalRuntime(TYPESCRIPT_RUNTIME_SPECIFIER, "./vendor/typescript-classic/lib/typescript.js");
  return ts;
}

function treeSitterRuntime() {
  Parser ??= optionalRuntime(TREE_SITTER_RUNTIME_SPECIFIER, "./vendor/web-tree-sitter/tree-sitter.js");
  return Parser;
}

async function treeSitterLanguage(language) {
  const grammar = TREE_SITTER_GRAMMARS[language];
  if (!grammar) throw new QarinahError("SYMBOL_LANGUAGE_UNSUPPORTED", `${language} is not a registered symbol language.`);
  const runtime = treeSitterRuntime();
  treeSitterReady ??= runtime.init();
  await treeSitterReady;
  if (!treeSitterLanguages.has(grammar)) {
    let wasmPath;
    try {
      wasmPath = runtimeRequire.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
      wasmPath = fileURLToPath(new URL(`./tree-sitter-wasms/tree-sitter-${grammar}.wasm`, import.meta.url));
    }
    treeSitterLanguages.set(grammar, runtime.Language.load(wasmPath));
  }
  return treeSitterLanguages.get(grammar);
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function symbolId(value) {
  return `symbol_${sha256(value).slice(7)}`;
}

function latestProjectStructure(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const structure = events[index]?.data?.projectStructure;
    if (validateProjectStructureSnapshot(structure)) return { event: events[index], structure };
  }
  return null;
}

function scriptKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".ts", ".mts", ".cts"].includes(extension)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function span(source, node) {
  const start = node.getStart(source, false);
  const end = node.getEnd();
  const startPoint = source.getLineAndCharacterOfPosition(start);
  const endPoint = source.getLineAndCharacterOfPosition(end);
  return Object.freeze({
    start,
    end,
    line: startPoint.line + 1,
    column: startPoint.character + 1,
    endLine: endPoint.line + 1,
    endColumn: endPoint.character + 1
  });
}

function declarationKind(node) {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isModuleDeclaration(node)) return "namespace";
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return "method";
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) return "property";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isParameter(node)) return "parameter";
  if (ts.isVariableDeclaration(node)) return "variable";
  return null;
}

function declarationName(node, source) {
  const name = node.name;
  if (!name || !ts.isIdentifier(name)) return null;
  const value = name.text.normalize("NFKC").trim();
  return value && value.length <= 256 ? value : null;
}

function exported(node) {
  const hasExportModifier = (candidate) => ts.canHaveModifiers(candidate) && (ts.getModifiers(candidate) ?? [])
    .some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword);
  if (hasExportModifier(node)) return true;
  if (ts.isVariableDeclaration(node)) {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isVariableStatement(current)) return hasExportModifier(current);
      current = current.parent;
    }
  }
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isClassDeclaration(current) || ts.isInterfaceDeclaration(current)) return hasExportModifier(current);
      current = current.parent;
    }
  }
  return false;
}

function declarationNameNode(identifier) {
  const parent = identifier.parent;
  return Boolean(parent && "name" in parent && parent.name === identifier && declarationKind(parent));
}

function nonReferenceIdentifier(identifier) {
  const parent = identifier.parent;
  return declarationNameNode(identifier)
    || (ts.isPropertyAccessExpression(parent) && parent.name === identifier)
    || (ts.isPropertyAssignment(parent) && parent.name === identifier)
    || (ts.isPropertySignature(parent) && parent.name === identifier)
    || (ts.isPropertyDeclaration(parent) && parent.name === identifier)
    || (ts.isImportSpecifier(parent) && parent.name === identifier)
    || (ts.isImportClause(parent) && parent.name === identifier)
    || (ts.isNamespaceImport(parent) && parent.name === identifier)
    || (ts.isImportSpecifier(parent) && parent.propertyName === identifier)
    || (ts.isExportSpecifier(parent));
}

function signatureHash(node, source) {
  let text = node.getText(source);
  const body = text.indexOf("{");
  if (body >= 0) text = text.slice(0, body);
  return sha256(text.trim().slice(0, 8_192));
}

export function parseTypeScriptSymbols(filePath, text, options = {}) {
  if (typeof filePath !== "string" || filePath.length < 1 || filePath.length > 1_024) throw new TypeError("filePath is invalid.");
  if (typeof text !== "string") throw new TypeError("text must be a string.");
  if (text.length > (options.maxCharacters ?? 4 * 1024 * 1024)) throw new QarinahError("SYMBOL_FILE_LIMIT", `${filePath} exceeds the symbol parser character limit.`);
  typeScriptRuntime();
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const symbols = [];
  const references = [];
  const containers = [];

  function visit(node) {
    const kind = declarationKind(node);
    const name = kind ? declarationName(node, source) : null;
    let pushed = false;
    if (name) {
      const location = span(source, node.name);
      const container = containers.join(".") || null;
      symbols.push({
        id: symbolId(`${filePath}\0${container ?? ""}\0${kind}\0${name}\0${location.start}`),
        name,
        kind,
        path: filePath,
        container,
        exported: exported(node),
        span: location,
        signatureHash: signatureHash(node, source),
        references: []
      });
      if (["class", "interface", "namespace", "function", "method"].includes(kind)) {
        containers.push(name);
        pushed = true;
      }
    }
    if (ts.isIdentifier(node) && !nonReferenceIdentifier(node)) {
      const nameValue = node.text.normalize("NFKC");
      if (nameValue.length >= 1 && nameValue.length <= 256) references.push({ name: nameValue, path: filePath, span: span(source, node) });
    }
    ts.forEachChild(node, visit);
    if (pushed) containers.pop();
  }
  visit(source);
  symbols.sort((left, right) => left.span.start - right.span.start || left.id.localeCompare(right.id));
  references.sort((left, right) => left.span.start - right.span.start || left.name.localeCompare(right.name));
  return deepFreezeJson({ symbols, references, diagnostics: source.parseDiagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    start: diagnostic.start ?? 0,
    length: diagnostic.length ?? 0,
    category: ts.DiagnosticCategory[diagnostic.category].toLowerCase()
  })).slice(0, 128) });
}

const TREE_DECLARATION_KINDS = Object.freeze({
  class_declaration: "class",
  class_definition: "class",
  class_specifier: "class",
  const_item: "constant",
  constructor_declaration: "constructor",
  enum_declaration: "enum",
  enum_item: "enum",
  enum_specifier: "enum",
  function_declaration: "function",
  function_definition: "function",
  function_item: "function",
  interface_declaration: "interface",
  method_declaration: "method",
  method_definition: "method",
  method_item: "method",
  mod_item: "module",
  module_declaration: "module",
  namespace_declaration: "namespace",
  namespace_definition: "namespace",
  property_declaration: "property",
  record_declaration: "class",
  struct_declaration: "struct",
  struct_item: "struct",
  struct_specifier: "struct",
  trait_item: "trait",
  type_alias_declaration: "type",
  type_definition: "type",
  type_item: "type",
  type_spec: "type"
});
const TREE_IDENTIFIER_TYPES = new Set([
  "constant", "field_identifier", "identifier", "namespace_identifier", "property_identifier",
  "simple_identifier", "type_identifier"
]);
const TREE_CONTAINER_KINDS = new Set([
  "class", "constructor", "function", "interface", "method", "module", "namespace", "struct", "trait"
]);

function treeSpan(node) {
  return Object.freeze({
    start: node.startIndex,
    end: node.endIndex,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column + 1
  });
}

function boundedTreeIdentifier(node, text, depth = 0) {
  if (!node || depth > 5) return null;
  if (TREE_IDENTIFIER_TYPES.has(node.type)) {
    const value = text.slice(node.startIndex, node.endIndex).normalize("NFKC").trim();
    return value.length >= 1 && value.length <= 256 ? Object.freeze({ node, value }) : null;
  }
  for (const child of node.namedChildren ?? []) {
    const match = boundedTreeIdentifier(child, text, depth + 1);
    if (match) return match;
  }
  return null;
}

function treeDeclarationName(node, text) {
  const named = node.childForFieldName("name") ?? node.childForFieldName("declarator");
  return boundedTreeIdentifier(named, text) ?? boundedTreeIdentifier(node, text);
}

function treeExported(language, name, sourceSlice) {
  if (language === "python") return !name.startsWith("_");
  if (language === "go") return /^\p{Lu}/u.test(name);
  if (language === "rust") return /^\s*pub(?:\s*\([^)]*\))?\b/u.test(sourceSlice);
  if (["csharp", "java", "kotlin", "php", "scala", "swift"].includes(language)) return /\bpublic\b/u.test(sourceSlice);
  return false;
}

function treeSignatureHash(node, text) {
  let value = text.slice(node.startIndex, Math.min(node.endIndex, node.startIndex + 8_192));
  const body = value.search(/[{:]/u);
  const newline = value.search(/[\r\n]/u);
  const boundary = [body, newline].filter((index) => index >= 0).sort((left, right) => left - right)[0];
  if (boundary !== undefined) value = value.slice(0, boundary + 1);
  return sha256(value.normalize("NFKC").trim());
}

export async function parseTreeSitterSymbols(filePath, language, text, options = {}) {
  if (typeof filePath !== "string" || filePath.length < 1 || filePath.length > 1_024) throw new TypeError("filePath is invalid.");
  if (typeof language !== "string" || !Object.hasOwn(TREE_SITTER_GRAMMARS, language)) throw new TypeError("language is not supported by the Tree-sitter symbol parser.");
  if (typeof text !== "string") throw new TypeError("text must be a string.");
  if (text.length > (options.maxCharacters ?? 4 * 1024 * 1024)) throw new QarinahError("SYMBOL_FILE_LIMIT", `${filePath} exceeds the symbol parser character limit.`);
  const loadedLanguage = await treeSitterLanguage(language);
  const ParserRuntime = treeSitterRuntime();
  const parser = new ParserRuntime();
  parser.setLanguage(loadedLanguage);
  const tree = parser.parse(text);
  const symbols = [];
  const references = [];
  const containers = [];
  const declarationNameSpans = new Set();
  let errorNodes = 0;

  try {
    const pending = [{ node: tree.rootNode, exit: false }];
    let visited = 0;
    while (pending.length > 0) {
      const current = pending.pop();
      if (current.exit) {
        containers.pop();
        continue;
      }
      visited += 1;
      if (visited > MAX_TREE_NODES_PER_FILE) throw new QarinahError("SYMBOL_GRAPH_LIMIT", `${filePath} exceeds the Tree-sitter node limit.`);
      const node = current.node;
      if (node.type === "ERROR" || (typeof node.isMissing === "function" ? node.isMissing() : node.isMissing === true)) errorNodes += 1;
      const kind = TREE_DECLARATION_KINDS[node.type] ?? null;
      const named = kind ? treeDeclarationName(node, text) : null;
      let pushed = false;
      if (named) {
        const location = treeSpan(named.node);
        declarationNameSpans.add(`${location.start}:${location.end}`);
        const container = containers.join(".") || null;
        const sourceSlice = text.slice(node.startIndex, Math.min(node.endIndex, node.startIndex + 512));
        symbols.push({
          id: symbolId(`${filePath}\0${container ?? ""}\0${kind}\0${named.value}\0${location.start}`),
          name: named.value,
          kind,
          path: filePath,
          container,
          exported: treeExported(language, named.value, sourceSlice),
          span: location,
          signatureHash: treeSignatureHash(node, text),
          references: []
        });
        if (symbols.length > MAX_SYMBOLS) throw new QarinahError("SYMBOL_GRAPH_LIMIT", `${filePath} exceeds the declaration limit.`);
        if (TREE_CONTAINER_KINDS.has(kind)) {
          containers.push(named.value);
          pushed = true;
        }
      }
      if (TREE_IDENTIFIER_TYPES.has(node.type)) {
        const location = treeSpan(node);
        const name = text.slice(node.startIndex, node.endIndex).normalize("NFKC").trim();
        if (name.length >= 1 && name.length <= 256 && !declarationNameSpans.has(`${location.start}:${location.end}`)) {
          references.push({ name, path: filePath, span: location });
          if (references.length > MAX_REFERENCES) throw new QarinahError("SYMBOL_GRAPH_LIMIT", `${filePath} exceeds the reference limit.`);
        }
      }
      if (pushed) pending.push({ node: null, exit: true });
      const children = node.namedChildren ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push({ node: children[index], exit: false });
    }
    symbols.sort((left, right) => left.span.start - right.span.start || left.id.localeCompare(right.id));
    references.sort((left, right) => left.span.start - right.span.start || left.name.localeCompare(right.name));
    return deepFreezeJson({
      symbols,
      references,
      diagnostics: errorNodes === 0 ? [] : [{ code: 1, start: 0, length: 0, category: "error" }]
    });
  } finally {
    tree.delete();
    parser.delete();
  }
}

function resolveReferences(symbols, rawReferences) {
  const byName = new Map();
  for (const symbol of symbols) {
    const values = byName.get(symbol.name) ?? [];
    values.push(symbol);
    byName.set(symbol.name, values);
  }
  for (const values of byName.values()) values.sort((left, right) => left.path.localeCompare(right.path) || left.span.start - right.span.start);
  const referencesBySymbol = new Map(symbols.map((symbol) => [symbol.id, []]));
  let unresolved = 0;
  let ambiguous = 0;
  for (const reference of rawReferences) {
    const candidates = byName.get(reference.name) ?? [];
    const local = candidates.filter((candidate) => candidate.path === reference.path);
    const selected = local.length === 1 ? local : local.length === 0 && candidates.length === 1 ? candidates : [];
    if (selected.length !== 1) {
      if (candidates.length > 0) ambiguous += 1;
      else unresolved += 1;
      continue;
    }
    referencesBySymbol.get(selected[0].id).push(Object.freeze({ path: reference.path, span: reference.span }));
  }
  const resolvedSymbols = symbols.map((symbol) => Object.freeze({
    ...symbol,
    references: referencesBySymbol.get(symbol.id)
      .sort((left, right) => left.path.localeCompare(right.path) || left.span.start - right.span.start)
  }));
  return Object.freeze({ symbols: resolvedSymbols, unresolved, ambiguous });
}

function trigrams(value) {
  const normalized = `  ${String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}_./-]+/gu, " ")}  `;
  const values = [];
  for (let index = 0; index + 3 <= normalized.length; index += 1) values.push(normalized.slice(index, index + 3));
  return values;
}

function featureVector(value) {
  const vector = new Float64Array(128);
  for (const feature of trigrams(value)) {
    const digest = createHash("sha256").update(feature).digest();
    const bucket = digest.readUInt16BE(0) % vector.length;
    vector[bucket] += (digest[2] & 1) === 0 ? 1 : -1;
  }
  let norm = 0;
  for (const entry of vector) norm += entry * entry;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return vector;
}

function cosine(left, right) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return Math.max(0, Math.min(1, (score + 1) / 2));
}

function lexicalScore(query, symbol) {
  const normalized = query.toLowerCase();
  const name = symbol.name.toLowerCase();
  const qualified = `${symbol.container ? `${symbol.container}.` : ""}${symbol.name}`.toLowerCase();
  if (name === normalized || qualified === normalized) return 1;
  if (name.startsWith(normalized) || qualified.startsWith(normalized)) return 0.86;
  if (name.includes(normalized) || qualified.includes(normalized)) return 0.7;
  const terms = normalized.split(/[^\p{L}\p{N}_]+/gu).filter(Boolean);
  if (terms.length === 0) return 0;
  const haystack = `${qualified} ${symbol.path.toLowerCase()} ${symbol.kind}`;
  return terms.filter((term) => haystack.includes(term)).length / terms.length * 0.6;
}

function validateGraph(graph, workspaceId) {
  if (!graph || typeof graph !== "object" || graph.schemaVersion !== SYMBOL_GRAPH_SCHEMA_VERSION
    || graph.workspaceId !== workspaceId || !Array.isArray(graph.files) || !Array.isArray(graph.symbols)
    || !Array.isArray(graph.edges) || !/^sha256:[0-9a-f]{64}$/u.test(graph.manifestHash)) {
    throw new QarinahError("SYMBOL_GRAPH_INVALID", "Symbol graph failed its public identity or shape checks.");
  }
  const { manifestHash, ...core } = graph;
  if (sha256(canonicalStringify(core)) !== manifestHash) throw new QarinahError("SYMBOL_GRAPH_INVALID", "Symbol graph manifest hash has changed.");
  if (new Set(graph.symbols.map((symbol) => symbol.id)).size !== graph.symbols.length) throw new QarinahError("SYMBOL_GRAPH_INVALID", "Symbol graph contains duplicate symbol identities.");
  return deepFreezeJson(graph);
}

export async function buildSymbolGraph(options = {}) {
  const allowed = new Set(["cwd", "persist", "signal"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Symbol graph options contain unknown field(s): ${unknown.join(", ")}.`);
  const signal = validateAbortSignal(options.signal);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { signal, updateCheckpoint: false });
  const latest = latestProjectStructure(events);
  if (!latest) throw new QarinahError("SYMBOL_SCAN_REQUIRED", "No validated project snapshot exists. Run `qarinah scan` first.");
  const files = [];
  const declarations = [];
  const rawReferences = [];
  const skipped = [];
  for (const file of latest.structure.files) {
    throwIfAborted(signal);
    if (!SYMBOL_LANGUAGES.has(file.language) || file.skipped !== null || !file.contentHash) {
      skipped.push({ path: file.path, reason: SYMBOL_LANGUAGES.has(file.language) ? (file.skipped ?? "unhashed") : "unsupported-language" });
      continue;
    }
    const candidate = resolveWithin(workspace.root, ...file.path.split("/"));
    let metadata;
    try {
      metadata = await lstat(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      skipped.push({ path: file.path, reason: "stale-or-linked" });
      continue;
    }
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size !== file.size) {
      skipped.push({ path: file.path, reason: "stale-or-linked" });
      continue;
    }
    const bytes = await readFile(candidate);
    if (hashBytes(bytes) !== file.contentHash) {
      skipped.push({ path: file.path, reason: "stale-or-linked" });
      continue;
    }
    const parsed = SCRIPT_LANGUAGES.has(file.language)
      ? parseTypeScriptSymbols(file.path, bytes.toString("utf8"))
      : await parseTreeSitterSymbols(file.path, file.language, bytes.toString("utf8"));
    declarations.push(...parsed.symbols);
    rawReferences.push(...parsed.references);
    files.push({
      path: file.path,
      language: file.language,
      parser: SCRIPT_LANGUAGES.has(file.language) ? "typescript" : "tree-sitter-wasm",
      contentHash: file.contentHash,
      diagnosticCount: parsed.diagnostics.length
    });
    if (declarations.length > MAX_SYMBOLS || rawReferences.length > MAX_REFERENCES) throw new QarinahError("SYMBOL_GRAPH_LIMIT", "Symbol graph exceeds its declaration or reference limit.");
  }
  const resolved = resolveReferences(declarations, rawReferences);
  const filesByPath = new Map(files.map((file) => [file.path, { ...file, symbolIds: [] }]));
  for (const symbol of resolved.symbols) filesByPath.get(symbol.path)?.symbolIds.push(symbol.id);
  const finalFiles = [...filesByPath.values()].map((file) => ({ ...file, symbolIds: file.symbolIds.sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const edges = [];
  for (const symbol of resolved.symbols) {
    edges.push({ source: `project:file:${sha256(symbol.path).slice(7, 39)}`, type: "defines", target: symbol.id });
    for (const reference of symbol.references) edges.push({ source: `project:file:${sha256(reference.path).slice(7, 39)}`, type: "references", target: symbol.id, span: reference.span });
  }
  edges.sort((left, right) => `${left.source}\0${left.type}\0${left.target}\0${left.span?.start ?? -1}`.localeCompare(`${right.source}\0${right.type}\0${right.target}\0${right.span?.start ?? -1}`));
  const core = {
    schemaVersion: SYMBOL_GRAPH_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    generatedAt: latest.event.timestamp,
    source: { eventId: latest.event.eventId, eventHash: latest.event.hash, snapshotHash: latest.structure.snapshotHash },
    extractor: {
      id: "qarinah.multilanguage-symbols",
      version: "2",
      parsers: [
        { id: "typescript", version: typeScriptRuntime().version, languages: [...SCRIPT_LANGUAGES].sort() },
        {
          id: "tree-sitter-wasm",
          version: TREE_SITTER_RUNTIME_VERSION,
          grammarVersion: TREE_SITTER_GRAMMAR_VERSION,
          languages: TREE_SITTER_LANGUAGE_NAMES
        }
      ]
    },
    coverage: {
      sourceFiles: latest.structure.files.length,
      supportedLanguages: [...SYMBOL_LANGUAGES].sort(),
      indexedLanguages: [...new Set(finalFiles.map((file) => file.language))].sort(),
      eligibleFiles: latest.structure.files.filter((file) => SYMBOL_LANGUAGES.has(file.language)).length,
      indexedFiles: finalFiles.length,
      skippedFiles: skipped.length,
      declarations: resolved.symbols.length,
      references: rawReferences.length,
      resolvedReferences: resolved.symbols.reduce((total, symbol) => total + symbol.references.length, 0),
      unresolvedReferences: resolved.unresolved,
      ambiguousReferences: resolved.ambiguous,
      complete: skipped.every((entry) => entry.reason === "unsupported-language")
    },
    files: finalFiles,
    skipped: skipped.sort((left, right) => left.path.localeCompare(right.path)),
    symbols: resolved.symbols,
    edges
  };
  const graph = validateGraph({ ...core, manifestHash: sha256(canonicalStringify(core)) }, workspace.config.workspaceId);
  if (options.persist !== false) {
    const destination = await secureStoragePath(workspace, ["graph", "symbol-graph.json"], { type: "file", allowMissing: true });
    await atomicWriteFile(destination, `${canonicalStringify(graph)}\n`);
  }
  return graph;
}

export async function loadSymbolGraph(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const candidate = await secureStoragePath(workspace, ["graph", "symbol-graph.json"], { type: "file" });
  const metadata = await stat(candidate);
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_GRAPH_BYTES) throw new QarinahError("SYMBOL_GRAPH_INVALID", "Symbol graph is not a bounded regular file.");
  return validateGraph(JSON.parse(await readFile(candidate, "utf8")), workspace.config.workspaceId);
}

export function querySymbolGraph(graph, query = "", options = {}) {
  if (typeof query !== "string" || query.length > 1_024) throw new TypeError("Symbol query must be at most 1024 characters.");
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError("Symbol query limit must be from 1 to 500.");
  const kinds = options.kinds === undefined ? null : new Set(options.kinds);
  if (kinds && (![...kinds].every((kind) => typeof kind === "string" && kind.length > 0) || kinds.size > 32)) throw new TypeError("Symbol kinds are invalid.");
  const normalized = query.normalize("NFKC").trim();
  const queryVector = featureVector(normalized);
  const results = graph.symbols.filter((symbol) => !kinds || kinds.has(symbol.kind)).map((symbol) => {
    const lexical = normalized ? lexicalScore(normalized, symbol) : 0;
    const vector = normalized ? cosine(queryVector, featureVector(`${symbol.name} ${symbol.container ?? ""} ${symbol.path}`)) : 0;
    const structural = Math.min(1, Math.log2(symbol.references.length + 1) / 8);
    const score = normalized ? 0.62 * lexical + 0.28 * vector + 0.1 * structural : structural;
    return { symbol, score: Number(score.toFixed(6)), basis: { lexical: Number(lexical.toFixed(6)), localVector: Number(vector.toFixed(6)), structural: Number(structural.toFixed(6)) } };
  }).filter((entry) => !normalized || entry.basis.lexical > 0 || entry.basis.localVector >= 0.56)
    .sort((left, right) => right.score - left.score || left.symbol.name.localeCompare(right.symbol.name) || left.symbol.id.localeCompare(right.symbol.id))
    .slice(0, limit);
  return deepFreezeJson({
    schemaVersion: "qarinah.symbol-query.v1",
    query: normalized,
    formula: "0.62*lexical + 0.28*local-subword-vector + 0.10*reference-structure",
    resultCount: results.length,
    sourceManifestHash: graph.manifestHash,
    results
  });
}

export async function searchSymbols(query = "", options = {}) {
  const graph = options.rebuild === true
    ? await buildSymbolGraph({ cwd: options.cwd, persist: options.persist !== false, signal: options.signal })
    : await loadSymbolGraph({ cwd: options.cwd });
  return querySymbolGraph(graph, query, { limit: options.limit, kinds: options.kinds });
}
