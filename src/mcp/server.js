import { fileURLToPath } from "node:url";
import { QarinahError } from "../errors.js";
import { loadIndex } from "../indexer.js";
import { verifyStore } from "../store.js";
import { QARINAH_VERSION } from "../version.js";
import { loadWorkspace } from "../workspace.js";

const SERVER_NAME = "qarinah-context";
const LATEST_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", LATEST_PROTOCOL_VERSION]);
const DEFAULT_MAXIMUM_FRAME_BYTES = 1024 * 1024;
const TOOL_ANNOTATIONS = Object.freeze({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });

const TOOLS = Object.freeze([
  {
    name: "context_status",
    title: "Context ledger status",
    description: "Read the opt-in local context ledger status for the active workspace. This never initializes, trusts, or changes a workspace.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "context_doctor",
    title: "Verify context ledger",
    description: "Verify the local event chain, machine-local trust checkpoint, and derived index without repairing or changing them.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: TOOL_ANNOTATIONS
  }
]);

function jsonRpcError(id, code, message, data = undefined) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function safeError(error) {
  const code = error instanceof QarinahError ? error.code : "QARINAH_ERROR";
  const messages = {
    WORKSPACE_NOT_INITIALIZED: "No opted-in Context Ledger workspace is available to this session.",
    WORKSPACE_DISABLED: "Context Ledger capture is disabled for this workspace.",
    WORKSPACE_NOT_TRUSTED: "This workspace is not trusted for Context Ledger on this machine.",
    TRUST_REVIEW_REQUIRED: "This workspace needs explicit review before its machine-local capture permit can be upgraded.",
    CAPTURE_NOT_APPROVED: "This workspace's portable policy is not approved on this machine.",
    INDEX_STALE: "Derived Context Ledger state is stale.",
    INDEX_INVALID: "Derived Context Ledger state is invalid.",
    EVENT_LOG_MISSING: "The Context Ledger event log is missing.",
    MCP_TOOL_NOT_FOUND: "The requested Context Ledger MCP tool is not available."
  };
  return {
    code,
    message: messages[code] || "Context Ledger could not complete the request."
  };
}

function textResult(value, structuredContent = value) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n` }],
    structuredContent
  };
}

function toolError(error) {
  const payload = safeError(error);
  return { ...textResult(payload), isError: true };
}

function validateToolInput(value, allowed) {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Tool arguments must be an object.");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const unknown = Reflect.ownKeys(descriptors).filter((key) => typeof key !== "string" || !allowed.includes(key));
  if (unknown.length > 0) throw new TypeError(`Tool arguments contain unknown field(s): ${unknown.join(", ")}.`);
  const result = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`Tool argument '${key}' must be a data property.`);
    result[key] = descriptor.value;
  }
  return result;
}

function pathFromRoot(root) {
  if (!root || typeof root !== "object" || Array.isArray(root) || typeof root.uri !== "string") return null;
  try {
    const url = new URL(root.uri);
    return url.protocol === "file:" ? fileURLToPath(url) : null;
  } catch {
    return null;
  }
}

export function createMcpServer(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("MCP server options must be an object.");
  const write = options.write ?? ((message) => process.stdout.write(`${JSON.stringify(message)}\n`));
  if (typeof write !== "function") throw new TypeError("MCP server options.write must be a function.");
  let initialized = false;
  let clientCapabilities = Object.create(null);
  let rootsCache = null;
  let requestSequence = 0;
  const pending = new Map();

  function send(message) {
    write(message);
  }

  function requestClient(method, params = undefined, timeoutMs = 3000) {
    const id = `qarinah-server-${++requestSequence}`;
    send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new QarinahError("MCP_CLIENT_TIMEOUT", `The MCP client did not answer ${method}.`));
      }, timeoutMs);
      timeout.unref?.();
      pending.set(id, { resolve, reject, timeout });
    });
  }

  async function advertisedRoots() {
    if (rootsCache) return rootsCache;
    if (!clientCapabilities.roots) return [];
    const response = await requestClient("roots/list");
    const roots = Array.isArray(response?.roots) ? response.roots.map(pathFromRoot).filter(Boolean) : [];
    rootsCache = Object.freeze([...new Set(roots)]);
    return rootsCache;
  }

  async function resolveWorkspace() {
    const candidates = [];
    if (typeof options.cwd === "string" && options.cwd.length > 0) candidates.push(options.cwd);
    if (typeof process.env.CLAUDE_PROJECT_DIR === "string" && process.env.CLAUDE_PROJECT_DIR.length > 0) {
      candidates.push(process.env.CLAUDE_PROJECT_DIR);
    }
    try {
      candidates.push(...await advertisedRoots());
    } catch (error) {
      if (candidates.length === 0) throw error;
    }
    candidates.push(process.cwd());
    const workspaces = new Map();
    let lastError = null;
    for (const candidate of [...new Set(candidates)]) {
      try {
        const workspace = await loadWorkspace(candidate);
        workspaces.set(workspace.root, workspace);
      } catch (error) {
        lastError = error;
      }
    }
    if (workspaces.size === 1) return [...workspaces.values()][0];
    if (workspaces.size > 1) {
      throw new QarinahError(
        "MCP_WORKSPACE_AMBIGUOUS",
        "The MCP client advertised more than one trusted Context Ledger workspace; open a session rooted in one workspace."
      );
    }
    if (lastError) throw lastError;
    throw new QarinahError("WORKSPACE_NOT_INITIALIZED", "No opted-in Context Ledger workspace is available to this MCP session.");
  }

  async function callTool(name, rawArguments) {
    try {
      if (name === "context_status") {
        validateToolInput(rawArguments, []);
        const workspace = await resolveWorkspace();
        const store = await verifyStore(workspace.root, { updateCheckpoint: false, includeRoot: false });
        return textResult({
          ...store,
          enabled: workspace.config.enabled,
          capture: workspace.config.capture,
          contextMaxChars: workspace.config.contextMaxChars
        });
      }
      if (name === "context_doctor") {
        validateToolInput(rawArguments, []);
        const workspace = await resolveWorkspace();
        const store = await verifyStore(workspace.root, { updateCheckpoint: false, includeRoot: false });
        let derived = "current";
        try {
          await loadIndex(workspace.root, { rebuild: false, updateCheckpoint: false });
        } catch (error) {
          derived = error?.code === "ENOENT" ? "missing" : (error?.code || "invalid");
        }
        return textResult({ ...store, ok: derived === "current", derived });
      }
      throw new QarinahError("MCP_TOOL_NOT_FOUND", `Unknown Context Ledger MCP tool '${name}'.`);
    } catch (error) {
      return toolError(error);
    }
  }

  async function handleRequest(message) {
    if (message.method === "initialize") {
      if (initialized) return jsonRpcError(message.id, -32600, "The MCP server is already initialized.");
      const requested = message.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : LATEST_PROTOCOL_VERSION;
      clientCapabilities = message.params?.capabilities && typeof message.params.capabilities === "object"
        ? message.params.capabilities
        : Object.create(null);
      initialized = true;
      return jsonRpcResult(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, title: "Qarinah Context", version: QARINAH_VERSION },
        instructions: "Context Ledger MCP tools provide zero-write status and integrity diagnostics only. Context disclosure requires a separately governed Maqam capability."
      });
    }
    if (!initialized) return jsonRpcError(message.id, -32002, "The MCP server has not been initialized.");
    if (message.method === "ping") return jsonRpcResult(message.id, {});
    if (message.method === "tools/list") return jsonRpcResult(message.id, { tools: TOOLS });
    if (message.method === "tools/call") {
      const name = message.params?.name;
      if (typeof name !== "string") return jsonRpcError(message.id, -32602, "tools/call requires a tool name.");
      return jsonRpcResult(message.id, await callTool(name, message.params?.arguments));
    }
    return jsonRpcError(message.id, -32601, `Method '${message.method}' is not supported.`);
  }

  async function handle(message) {
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
      send(jsonRpcError(null, -32600, "Invalid JSON-RPC request."));
      return;
    }
    if (!Object.hasOwn(message, "method") && Object.hasOwn(message, "id")) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timeout);
      if (Object.hasOwn(message, "error")) waiter.reject(new QarinahError("MCP_CLIENT_ERROR", message.error?.message || "MCP client request failed."));
      else waiter.resolve(message.result);
      return;
    }
    if (typeof message.method !== "string") {
      if (Object.hasOwn(message, "id")) send(jsonRpcError(message.id, -32600, "Invalid JSON-RPC request."));
      return;
    }
    if (!Object.hasOwn(message, "id")) {
      if (message.method === "notifications/roots/list_changed") rootsCache = null;
      return;
    }
    try {
      send(await handleRequest(message));
    } catch (error) {
      const safe = safeError(error);
      send(jsonRpcError(message.id, -32603, safe.message, { code: safe.code }));
    }
  }

  function close(error = new QarinahError("MCP_CONNECTION_CLOSED", "The MCP connection closed.")) {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    pending.clear();
  }

  return Object.freeze({ handle, close, tools: TOOLS });
}

export async function runMcpServer(options = {}) {
  const input = options.input ?? process.stdin;
  if (!input || typeof input[Symbol.asyncIterator] !== "function") {
    throw new TypeError("MCP server options.input must be an async iterable byte stream.");
  }
  const maximumFrameBytes = options.maximumFrameBytes ?? DEFAULT_MAXIMUM_FRAME_BYTES;
  if (!Number.isSafeInteger(maximumFrameBytes) || maximumFrameBytes < 1024 || maximumFrameBytes > 16 * 1024 * 1024) {
    throw new TypeError("MCP server options.maximumFrameBytes must be an integer from 1024 to 16777216.");
  }
  const write = options.write ?? ((message) => process.stdout.write(`${JSON.stringify(message)}\n`));
  if (typeof write !== "function") throw new TypeError("MCP server options.write must be a function.");
  const server = createMcpServer({ ...options, write });
  const parts = [];
  const inFlight = new Set();
  let bufferedBytes = 0;
  let discardingOversizedFrame = false;

  function dispatch(frame) {
    if (frame.length === 0) return;
    let message;
    try {
      message = JSON.parse(frame.toString("utf8"));
    } catch {
      write(jsonRpcError(null, -32700, "Invalid JSON."));
      return;
    }
    const request = server.handle(message);
    inFlight.add(request);
    void request.then(
      () => inFlight.delete(request),
      () => inFlight.delete(request)
    );
  }

  try {
    for await (const rawChunk of input) {
      const chunk = typeof rawChunk === "string" ? Buffer.from(rawChunk) : Buffer.from(rawChunk);
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(0x0a, offset);
        const end = newline === -1 ? chunk.length : newline;
        const length = end - offset;
        if (!discardingOversizedFrame) {
          if (bufferedBytes + length > maximumFrameBytes) {
            parts.length = 0;
            bufferedBytes = 0;
            write(jsonRpcError(null, -32700, `JSON-RPC frame exceeds the ${maximumFrameBytes}-byte limit.`));
            discardingOversizedFrame = newline === -1;
          } else if (length > 0) {
            parts.push(chunk.subarray(offset, end));
            bufferedBytes += length;
          }
        }
        if (newline !== -1) {
          if (discardingOversizedFrame) {
            discardingOversizedFrame = false;
          } else {
            dispatch(Buffer.concat(parts, bufferedBytes));
          }
          parts.length = 0;
          bufferedBytes = 0;
          offset = newline + 1;
        } else {
          offset = chunk.length;
        }
      }
    }
    if (!discardingOversizedFrame && bufferedBytes > 0) dispatch(Buffer.concat(parts, bufferedBytes));
    await Promise.allSettled([...inFlight]);
  } finally {
    server.close();
  }
}
