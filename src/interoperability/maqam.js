import { appendEvent } from "../store.js";
import { compileContext } from "../compiler.js";
import { QarinahError } from "../errors.js";
import { rebuildDerivedState } from "../indexer.js";
import {
  dataFunction,
  deepFreeze,
  snapshotRecordBoundary
} from "./boundary.js";

export const MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION = "qarinah.maqam-context-adapter.v1";

export const MAQAM_CONTEXT_QUERY_TOOL = deepFreeze({
  schemaVersion: MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION,
  name: "context.query",
  transport: "function",
  description: "Compile a bounded, evidence-linked Qarinah context pack.",
  effects: ["read"],
  networkOrigins: [],
  risk: "low",
  approvalRequired: false
});

export const MAQAM_CONTEXT_APPEND_TOOL = deepFreeze({
  schemaVersion: MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION,
  name: "context.append",
  transport: "function",
  description: "Append one approved event to the Qarinah context ledger.",
  effects: ["write"],
  networkOrigins: [],
  risk: "high",
  approvalRequired: true
});

const REGISTRATION_KEYS = Object.freeze([
  "gateway", "defineToolAdapter", "registerToolAdapter", "cwd", "maxChars", "maxItems"
]);

function registrationOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Maqam registration options must be a record.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const unknown = Reflect.ownKeys(descriptors).filter((key) => typeof key !== "string" || !REGISTRATION_KEYS.includes(key));
  if (unknown.length > 0) throw new TypeError(`Maqam registration options contain unknown field(s): ${unknown.join(", ")}.`);
  const result = Object.create(null);
  for (const key of REGISTRATION_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor) continue;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`Maqam registration options.${key} must be an enumerable data property.`);
    }
    result[key] = descriptor.value;
  }
  if (!result.gateway || (typeof result.gateway !== "object" && typeof result.gateway !== "function")) {
    throw new TypeError("Maqam registration options.gateway is required.");
  }
  for (const key of ["defineToolAdapter", "registerToolAdapter"]) {
    if (typeof result[key] !== "function") throw new TypeError(`Maqam registration options.${key} must be a function.`);
  }
  if (result.cwd !== undefined && (typeof result.cwd !== "string" || result.cwd.length === 0)) {
    throw new TypeError("Maqam registration options.cwd must be a non-empty string.");
  }
  const maxChars = result.maxChars ?? 100_000;
  const maxItems = result.maxItems ?? 20;
  if (!Number.isSafeInteger(maxChars) || maxChars < 512 || maxChars > 1_000_000) {
    throw new TypeError("Maqam registration options.maxChars must be an integer from 512 to 1000000.");
  }
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 1_000) {
    throw new TypeError("Maqam registration options.maxItems must be an integer from 1 to 1000.");
  }
  return { ...result, maxChars, maxItems };
}

function contextLimit(context, key) {
  const candidates = [context?.limits?.[key], context?.goal?.budget?.[key]];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    if (!Number.isSafeInteger(candidate) || candidate < 0) throw new TypeError(`${key} policy limits must be non-negative integers.`);
  }
  return candidates.filter(Number.isSafeInteger);
}

function effectivePositiveLimit(requested, configured, context, key, minimum) {
  if (requested !== undefined && (!Number.isSafeInteger(requested) || requested < minimum)) {
    throw new TypeError(`${key} must be an integer of at least ${minimum}.`);
  }
  const value = Math.min(requested ?? configured, configured, ...contextLimit(context, key));
  if (value < minimum) throw new QarinahError("MAQAM_CONTEXT_BUDGET_TOO_SMALL", `${key} policy limit is below ${minimum}.`);
  return value;
}

function evidenceCapability(context, toolName) {
  if (!context || typeof context !== "object" || context.toolName !== toolName) {
    throw new QarinahError("MAQAM_GATEWAY_CONTEXT_REQUIRED", `Tool '${toolName}' must execute through its registered Maqam ToolGateway path.`);
  }
  if (!context.evidence || typeof context.evidence !== "object") {
    throw new QarinahError("MAQAM_EVIDENCE_REQUIRED", `Tool '${toolName}' requires a Maqam scoped evidence capability.`);
  }
  return dataFunction(context.evidence, "addBatch", "Maqam scoped evidence capability");
}

function assertExactApproval(context) {
  if (!Array.isArray(context.approvals) || context.approvals.length === 0) {
    throw new QarinahError("MAQAM_APPROVAL_REQUIRED", "context.append requires a consumed approval bound to this exact Maqam tool call.");
  }
  const approved = context.approvals.some((approval) => (
    approval?.status === "approved"
    && approval?.subject?.runId === context.runId
    && approval?.subject?.toolName === MAQAM_CONTEXT_APPEND_TOOL.name
    && Array.isArray(approval?.consumptions)
    && approval.consumptions.some((consumption) => (
      consumption?.runId === context.runId
      && consumption?.toolName === MAQAM_CONTEXT_APPEND_TOOL.name
    ))
  ));
  if (!approved) {
    throw new QarinahError("MAQAM_APPROVAL_SCOPE_MISMATCH", "context.append did not receive an exact consumed Maqam approval for this run and tool.");
  }
}

function confidenceNumber(value) {
  return ({ extracted: 0.7, inferred: 0.5, claimed: 0.4, verified: 1 })[value] ?? 0.5;
}

function addEvidence(addBatch, evidence) {
  const result = addBatch({ evidence, claims: [] });
  if (!result || !Array.isArray(result.evidence) || result.evidence.length !== evidence.length) {
    throw new QarinahError("MAQAM_EVIDENCE_INVALID", "Maqam scoped evidence capability returned an invalid batch result.");
  }
  return result.evidence;
}

function attachGovernance(handler, tool) {
  Object.defineProperty(handler, "governance", {
    value: deepFreeze({ effects: [...tool.effects], networkOrigins: [], risk: tool.risk }),
    enumerable: true,
    configurable: false,
    writable: false
  });
  return handler;
}

function adapterSpec(tool, invoke, bounds) {
  return {
    schemaVersion: "maqam.tool-adapter.v1",
    name: tool.name,
    transport: tool.transport,
    description: tool.description,
    effects: [...tool.effects],
    risk: tool.risk,
    metadata: {
      networkOrigins: [],
      qarinah: {
        schemaVersion: MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION,
        operation: tool.name,
        approvalRequired: tool.approvalRequired,
        localOnly: true,
        ...bounds
      }
    },
    invoke
  };
}

export function registerMaqamContextAdapters(input) {
  const options = registrationOptions(input);
  const query = attachGovernance(async (rawInput = {}, context = {}) => {
    const addBatch = evidenceCapability(context, MAQAM_CONTEXT_QUERY_TOOL.name);
    const request = snapshotRecordBoundary(rawInput, {
      label: "context.query input",
      keys: ["query", "maxChars", "maxItems"],
      maximumBytes: 16 * 1024,
      maximumStringLength: 4_096
    });
    if (request.query !== undefined && typeof request.query !== "string") throw new TypeError("context.query input.query must be a string.");
    const maxChars = effectivePositiveLimit(request.maxChars, options.maxChars, context, "maxContextChars", 512);
    const maxItems = effectivePositiveLimit(request.maxItems, options.maxItems, context, "maxContextItems", 1);
    const pack = await compileContext(request.query ?? "", { cwd: options.cwd, maxChars, limit: maxItems });
    const items = pack.items.length > 0
      ? pack.items.map((item) => ({
          sourceType: "qarinah.context-event",
          source: `qarinah://${pack.workspaceId}/events/${item.eventId}?eventHash=${item.hash}`,
          retrievedAt: item.timestamp,
          excerpt: item.excerpt,
          confidence: confidenceNumber(item.confidence)
        }))
      : [{
          sourceType: "qarinah.context-pack",
          source: `qarinah://${pack.workspaceId}/context-packs/${pack.manifestHash.slice(7)}?manifestHash=${pack.manifestHash}`,
          excerpt: "No context events matched the bounded query.",
          confidence: 1
        }];
    const evidence = addEvidence(addBatch, items);
    return deepFreeze({ schemaVersion: "qarinah.maqam-context-query-result.v1", pack, evidence });
  }, MAQAM_CONTEXT_QUERY_TOOL);

  const append = attachGovernance(async (rawInput = {}, context = {}) => {
    const addBatch = evidenceCapability(context, MAQAM_CONTEXT_APPEND_TOOL.name);
    assertExactApproval(context);
    const request = snapshotRecordBoundary(rawInput, {
      label: "context.append input",
      keys: ["event"],
      maximumBytes: 256 * 1024,
      maximumStringLength: 65_536
    });
    if (!Object.hasOwn(request, "event")) throw new TypeError("context.append input.event is required.");
    const event = await appendEvent(request.event, { cwd: options.cwd });
    await rebuildDerivedState(options.cwd);
    const evidence = addEvidence(addBatch, [{
      sourceType: "qarinah.context-event",
      source: `qarinah://${event.workspaceId}/events/${event.eventId}?eventHash=${event.hash}`,
      retrievedAt: event.timestamp,
      excerpt: event.body,
      confidence: confidenceNumber(event.confidence)
    }]);
    return deepFreeze({ schemaVersion: "qarinah.maqam-context-append-result.v1", event, evidence: evidence[0] });
  }, MAQAM_CONTEXT_APPEND_TOOL);

  const queryAdapter = options.defineToolAdapter(adapterSpec(MAQAM_CONTEXT_QUERY_TOOL, query, {
    maxChars: options.maxChars,
    maxItems: options.maxItems
  }));
  const appendAdapter = options.defineToolAdapter(adapterSpec(MAQAM_CONTEXT_APPEND_TOOL, append, {}));
  options.registerToolAdapter(options.gateway, queryAdapter);
  options.registerToolAdapter(options.gateway, appendAdapter);
  return deepFreeze({
    schemaVersion: "qarinah.maqam-context-registration.v1",
    queryToolName: MAQAM_CONTEXT_QUERY_TOOL.name,
    appendToolName: MAQAM_CONTEXT_APPEND_TOOL.name
  });
}
