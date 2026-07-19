import { appendEvent } from "../store.js";
import { compileContext } from "../compiler.js";
import { QarinahError } from "../errors.js";
import { rebuildDerivedState } from "../indexer.js";
import {
  dataFunction,
  deepFreeze,
  snapshotRecordBoundary
} from "./boundary.js";
import {
  contentSummary,
  loadTrustedInteropWorkspace,
  requestedCapture
} from "./capture-policy.js";

export const MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION = "qarinah.maqam-context-adapter.v1";

export const MAQAM_CONTEXT_QUERY_TOOL = deepFreeze({
  schemaVersion: MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION,
  name: "context.query",
  transport: "function",
  description: "Compile a bounded, evidence-linked context-ledger pack.",
  effects: ["read"],
  networkOrigins: [],
  risk: "low",
  approvalRequired: false
});

export const MAQAM_CONTEXT_APPEND_TOOL = deepFreeze({
  schemaVersion: MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION,
  name: "context.append",
  transport: "function",
  description: "Append one approved event to the context ledger.",
  effects: ["write"],
  networkOrigins: [],
  risk: "high",
  approvalRequired: true
});

const REGISTRATION_KEYS = Object.freeze(["gateway", "cwd", "maxChars", "maxItems"]);

const APPEND_APPROVAL_ACTIONS = Object.freeze([
  `tool:${MAQAM_CONTEXT_APPEND_TOOL.name}`,
  "effect:write"
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
  if (!context.evidence || typeof context.evidence !== "object") {
    throw new QarinahError("MAQAM_EVIDENCE_REQUIRED", `Tool '${toolName}' requires a Maqam scoped evidence capability.`);
  }
  return dataFunction(context.evidence, "addBatch", "Maqam scoped evidence capability");
}

function assertGuardedReceipt(receipt, toolName) {
  if (!receipt
    || receipt.schemaVersion !== "maqam.tool-execution.v1"
    || receipt.toolName !== toolName
    || typeof receipt.runId !== "string"
    || receipt.runId.length === 0
    || typeof receipt.inputHash !== "string"
    || !/^[a-f0-9]{64}$/.test(receipt.inputHash)
    || !receipt.decision
    || typeof receipt.decision !== "object"
    || !Array.isArray(receipt.approvalIds)
    || !Array.isArray(receipt.approvalActions)) {
    throw new QarinahError(
      "MAQAM_EXECUTION_GUARD_INVALID",
      `Maqam returned an invalid guarded execution receipt for '${toolName}'.`
    );
  }
  return receipt;
}

function assertExactApproval(receipt) {
  assertGuardedReceipt(receipt, MAQAM_CONTEXT_APPEND_TOOL.name);
  if (receipt.approvalIds.length === 0
    || !receipt.approvalActions.some((action) => APPEND_APPROVAL_ACTIONS.includes(action))) {
    throw new QarinahError(
      "MAQAM_APPROVAL_REQUIRED",
      "context.append requires an exact consumed Maqam tool or write-effect approval for this dispatch."
    );
  }
}

const EVENT_INPUT_KEYS = Object.freeze([
  "eventId", "timestamp", "sessionId", "turnId", "kind", "actor", "title", "body", "data",
  "confidence", "relations", "provenance", "retention"
]);

function metadataEventInput(value, workspace) {
  const event = snapshotRecordBoundary(value, {
    label: "context.append input.event",
    keys: EVENT_INPUT_KEYS,
    maximumDepth: 32,
    maximumNodes: 20_000,
    maximumArrayLength: 10_000,
    maximumObjectKeys: 1_000,
    maximumStringLength: 65_536,
    maximumBytes: 256 * 1024
  });
  if (!Object.hasOwn(event, "kind")) throw new TypeError("context.append input.event.kind is required.");
  const summary = contentSummary(event);
  return {
    ...(event.eventId === undefined ? {} : { eventId: event.eventId }),
    ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }),
    kind: event.kind,
    actor: { type: "system", id: "maqam.context-append" },
    title: `Maqam approved ${event.kind}`,
    body: "",
    data: {
      capture: "metadata",
      contentOmitted: true,
      requestedKind: event.kind,
      sourceEvent: summary
    },
    confidence: "extracted",
    relations: [],
    provenance: {
      adapter: "maqam.context-append.metadata",
      sourceId: event.eventId ?? "maqam-input:unidentified"
    },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  };
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

function registrationMetadata(tool, bounds) {
  return {
    effects: [...tool.effects],
    networkOrigins: [],
    risk: tool.risk,
    qarinah: {
      schemaVersion: MAQAM_CONTEXT_ADAPTER_SCHEMA_VERSION,
      operation: tool.name,
      approvalRequired: tool.approvalRequired,
      localOnly: true,
      ...bounds
    }
  };
}

export function registerMaqamContextAdapters(input) {
  const options = registrationOptions(input);
  const locator = Object.freeze({ start: options.cwd ?? process.cwd() });
  let registerGuardedTool;
  try {
    registerGuardedTool = dataFunction(options.gateway, "registerGuardedTool", "Maqam ToolGateway");
  } catch {
    throw new QarinahError(
      "MAQAM_EXECUTION_GUARD_REQUIRED",
      "Context adapters require Maqam's guarded ToolGateway registration contract."
    );
  }
  const queryFactory = (verifier) => attachGovernance(async (rawInput = {}, context = {}) => {
    assertGuardedReceipt(verifier.requireExecution(rawInput, context), MAQAM_CONTEXT_QUERY_TOOL.name);
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
    const pack = await compileContext(request.query ?? "", {
      cwd: locator.start,
      maxChars,
      limit: maxItems,
      rebuild: false,
      updateCheckpoint: false,
      inMemory: true
    });
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

  const appendFactory = (verifier) => attachGovernance(async (rawInput = {}, context = {}) => {
    const receipt = verifier.requireExecution(rawInput, context);
    const addBatch = evidenceCapability(context, MAQAM_CONTEXT_APPEND_TOOL.name);
    const request = snapshotRecordBoundary(rawInput, {
      label: "context.append input",
      keys: ["event", "capture"],
      maximumBytes: 256 * 1024,
      maximumStringLength: 65_536
    });
    if (!Object.hasOwn(request, "event")) throw new TypeError("context.append input.event is required.");
    assertExactApproval(receipt);
    const workspace = await loadTrustedInteropWorkspace(locator);
    const capture = requestedCapture(request.capture, workspace);
    const eventInput = capture === "content" ? request.event : metadataEventInput(request.event, workspace);
    const event = await appendEvent(eventInput, { workspace });
    await rebuildDerivedState(workspace.root);
    const evidence = addEvidence(addBatch, [{
      sourceType: "qarinah.context-event",
      source: `qarinah://${event.workspaceId}/events/${event.eventId}?eventHash=${event.hash}`,
      retrievedAt: event.timestamp,
      excerpt: event.body,
      confidence: confidenceNumber(event.confidence)
    }]);
    return deepFreeze({
      schemaVersion: "qarinah.maqam-context-append-result.v1",
      capture,
      event,
      evidence: evidence[0]
    });
  }, MAQAM_CONTEXT_APPEND_TOOL);

  registerGuardedTool(MAQAM_CONTEXT_QUERY_TOOL.name, queryFactory, registrationMetadata(MAQAM_CONTEXT_QUERY_TOOL, {
    maxChars: options.maxChars,
    maxItems: options.maxItems
  }));
  registerGuardedTool(
    MAQAM_CONTEXT_APPEND_TOOL.name,
    appendFactory,
    registrationMetadata(MAQAM_CONTEXT_APPEND_TOOL, {})
  );
  return deepFreeze({
    schemaVersion: "qarinah.maqam-context-registration.v1",
    queryToolName: MAQAM_CONTEXT_QUERY_TOOL.name,
    appendToolName: MAQAM_CONTEXT_APPEND_TOOL.name
  });
}
