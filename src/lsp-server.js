import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSymbolGraph, parseTypeScriptSymbols, querySymbolGraph } from "./symbol-graph.js";

export const QARINAH_LSP_PROTOCOL_VERSION = "qarinah-lsp.v1";
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const LSP_KIND = Object.freeze({
  file: 1, namespace: 3, class: 5, method: 6, property: 7, enum: 10, interface: 11,
  function: 12, variable: 13, parameter: 13, getter: 7, setter: 7, type: 26, import: 13
});

function lspRange(span) {
  return {
    start: { line: span.line - 1, character: span.column - 1 },
    end: { line: span.endLine - 1, character: span.endColumn - 1 }
  };
}

function symbolInformation(symbol, root) {
  return {
    name: symbol.name,
    kind: LSP_KIND[symbol.kind] ?? 13,
    location: { uri: pathToFileURL(path.join(root, ...symbol.path.split("/"))).href, range: lspRange(symbol.span) },
    ...(symbol.container ? { containerName: symbol.container } : {})
  };
}

function documentSymbol(symbol) {
  const range = lspRange(symbol.span);
  return {
    name: symbol.name,
    detail: `${symbol.exported ? "exported " : ""}${symbol.kind}`,
    kind: LSP_KIND[symbol.kind] ?? 13,
    range,
    selectionRange: range
  };
}

function offsetAt(text, position) {
  const lines = text.split(/\r?\n/u);
  let offset = 0;
  for (let line = 0; line < Math.min(position.line, lines.length); line += 1) offset += lines[line].length + 1;
  return Math.min(text.length, offset + Math.max(0, position.character));
}

function wordAt(text, position) {
  const offset = offsetAt(text, position);
  let start = offset;
  let end = offset;
  while (start > 0 && /[$\p{L}\p{N}_]/u.test(text[start - 1])) start -= 1;
  while (end < text.length && /[$\p{L}\p{N}_]/u.test(text[end])) end += 1;
  return text.slice(start, end);
}

function workspaceRoot(params, fallback) {
  const candidate = params?.rootUri ? fileURLToPath(params.rootUri) : params?.rootPath ?? fallback;
  return path.resolve(candidate ?? process.cwd());
}

function createWriter(output) {
  return (message) => {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    output.write(`Content-Length: ${payload.length}\r\n\r\n`);
    output.write(payload);
  };
}

export function createLanguageServer(options = {}) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const write = createWriter(output);
  const documents = new Map();
  let buffer = Buffer.alloc(0);
  let root = path.resolve(options.cwd ?? process.cwd());
  let graph = null;
  let shutdown = false;

  async function refreshGraph() {
    graph = await buildSymbolGraph({ cwd: root, persist: false });
    return graph;
  }

  async function documentText(uri) {
    if (documents.has(uri)) return documents.get(uri).text;
    const candidate = fileURLToPath(uri);
    const relative = path.relative(root, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Document is outside the initialized workspace.");
    const { readFile } = await import("node:fs/promises");
    return readFile(candidate, "utf8");
  }

  function candidateSymbols(name, uri) {
    if (!graph || !name) return [];
    const relative = uri ? path.relative(root, fileURLToPath(uri)).split(path.sep).join("/") : null;
    const values = graph.symbols.filter((symbol) => symbol.name === name);
    const local = relative ? values.filter((symbol) => symbol.path === relative) : [];
    return local.length === 1 ? local : local.length === 0 && values.length === 1 ? values : [];
  }

  async function dispatch(message) {
    const params = message.params ?? {};
    switch (message.method) {
      case "initialize":
        root = workspaceRoot(params, root);
        try { await refreshGraph(); } catch { graph = null; }
        return {
          capabilities: {
            textDocumentSync: 2,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            definitionProvider: true,
            referencesProvider: true
          },
          serverInfo: { name: "Qarinah language server", version: QARINAH_LSP_PROTOCOL_VERSION }
        };
      case "shutdown": shutdown = true; return null;
      case "workspace/symbol": {
        if (!graph) await refreshGraph();
        return querySymbolGraph(graph, params.query ?? "", { limit: 200 }).results.map((entry) => symbolInformation(entry.symbol, root));
      }
      case "textDocument/documentSymbol": {
        const text = await documentText(params.textDocument.uri);
        const relative = path.relative(root, fileURLToPath(params.textDocument.uri)).split(path.sep).join("/");
        return parseTypeScriptSymbols(relative, text).symbols.map(documentSymbol);
      }
      case "textDocument/definition": {
        const text = await documentText(params.textDocument.uri);
        const name = wordAt(text, params.position);
        return candidateSymbols(name, params.textDocument.uri).map((symbol) => symbolInformation(symbol, root).location);
      }
      case "textDocument/references": {
        const text = await documentText(params.textDocument.uri);
        const name = wordAt(text, params.position);
        const [symbol] = candidateSymbols(name, params.textDocument.uri);
        if (!symbol) return [];
        const values = symbol.references.map((reference) => ({
          uri: pathToFileURL(path.join(root, ...reference.path.split("/"))).href,
          range: lspRange(reference.span)
        }));
        if (params.context?.includeDeclaration !== false) values.unshift(symbolInformation(symbol, root).location);
        return values;
      }
      case "workspace/executeCommand":
        if (params.command === "qarinah.refreshSymbols") {
          const refreshed = await refreshGraph();
          return refreshed.coverage;
        }
        throw new Error("Unsupported Qarinah command.");
      default:
        return undefined;
    }
  }

  async function handle(message) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
    if (message.method === "exit") {
      options.onExit?.(shutdown ? 0 : 1);
      return;
    }
    if (message.method === "textDocument/didOpen") {
      const document = message.params?.textDocument;
      if (document?.uri && typeof document.text === "string") documents.set(document.uri, { version: document.version, text: document.text });
      return;
    }
    if (message.method === "textDocument/didChange") {
      const document = message.params?.textDocument;
      const change = message.params?.contentChanges?.at(-1);
      if (document?.uri && typeof change?.text === "string") documents.set(document.uri, { version: document.version, text: change.text });
      return;
    }
    if (message.method === "textDocument/didClose") {
      documents.delete(message.params?.textDocument?.uri);
      return;
    }
    try {
      const result = await dispatch(message);
      if (message.id !== undefined && result !== undefined) write({ jsonrpc: "2.0", id: message.id, result });
      else if (message.id !== undefined) write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
    } catch (error) {
      if (message.id !== undefined) write({ jsonrpc: "2.0", id: message.id, error: { code: -32001, message: error?.message ?? "Qarinah language server failed." } });
    }
  }

  function consume() {
    while (true) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const header = buffer.subarray(0, separator).toString("ascii");
      const match = /^Content-Length:\s*([0-9]+)$/imu.exec(header);
      if (!match) throw new Error("LSP message is missing Content-Length.");
      const length = Number(match[1]);
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MESSAGE_BYTES) throw new Error("LSP message exceeds the bounded size.");
      const end = separator + 4 + length;
      if (buffer.length < end) return;
      const payload = buffer.subarray(separator + 4, end);
      buffer = buffer.subarray(end);
      const message = JSON.parse(payload.toString("utf8"));
      void handle(message);
    }
  }

  function onData(chunk) {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (buffer.length > MAX_MESSAGE_BYTES + 64 * 1024) throw new Error("Buffered LSP input exceeds the bounded size.");
    consume();
  }
  input.on("data", onData);
  input.resume?.();
  return Object.freeze({ close: () => input.off("data", onData), refreshGraph });
}

export function runLanguageServer(options = {}) {
  return createLanguageServer({ ...options, onExit: options.onExit ?? ((code) => { process.exitCode = code; }) });
}
