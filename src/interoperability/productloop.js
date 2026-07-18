import { canonicalStringify, deepFreezeJson, sha256 } from "../canonical.js";
import { QarinahError } from "../errors.js";
import { appendEvent } from "../store.js";
import {
  isoTimestamp,
  snapshotJsonBoundary,
  snapshotRecordBoundary,
  stringField
} from "./boundary.js";

export const PRODUCTLOOP_RUNTIME_EVENT_BOUNDARY_VERSION = "ajnas-runtime.runtime-event.structural.v0.2.1";

const EVENT_KEYS = Object.freeze(["runId", "sequence", "type", "timestamp", "data", "receipt"]);
const RECEIPT_KEYS = Object.freeze(["eventHash", "previousHash", "canonicalJson"]);
const HEX_HASH = /^[a-f0-9]{64}$/;

function uuidFromReceipt(value) {
  const hex = sha256(value).slice(7, 39).split("");
  hex[12] = "4";
  hex[16] = "8";
  const id = hex.join("");
  return `evt_${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function compactTarget(prefix, value) {
  const candidate = `${prefix}${value}`;
  return candidate.length <= 512 ? candidate : `${prefix}sha256:${sha256(value).slice(7)}`;
}

export function validateProductLoopRuntimeEvent(value) {
  const event = snapshotRecordBoundary(value, {
    label: "ProductLoop RuntimeEvent",
    keys: EVENT_KEYS,
    maximumDepth: 64,
    maximumNodes: 100_000,
    maximumArrayLength: 100_000,
    maximumObjectKeys: 100_000,
    maximumStringLength: 8 * 1024 * 1024,
    maximumBytes: 8 * 1024 * 1024
  });
  for (const key of EVENT_KEYS) {
    if (!Object.hasOwn(event, key)) throw new TypeError(`ProductLoop RuntimeEvent is missing '${key}'.`);
  }
  stringField(event.runId, "ProductLoop RuntimeEvent.runId", { maximumLength: 128 });
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(event.runId)) throw new TypeError("ProductLoop RuntimeEvent.runId is invalid.");
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) throw new TypeError("ProductLoop RuntimeEvent.sequence must be a positive integer.");
  stringField(event.type, "ProductLoop RuntimeEvent.type", { maximumLength: 256 });
  const timestamp = isoTimestamp(event.timestamp, "ProductLoop RuntimeEvent.timestamp");
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) {
    throw new TypeError("ProductLoop RuntimeEvent.data must be a JSON record.");
  }
  const data = snapshotJsonBoundary(event.data, {
    label: "ProductLoop RuntimeEvent.data",
    maximumDepth: 14,
    maximumNodes: 18_000,
    maximumArrayLength: 10_000,
    maximumObjectKeys: 128,
    maximumStringLength: 65_536,
    maximumBytes: 128 * 1024
  });
  const receipt = snapshotRecordBoundary(event.receipt, {
    label: "ProductLoop RuntimeEvent.receipt",
    keys: RECEIPT_KEYS,
    maximumStringLength: 8 * 1024 * 1024,
    maximumBytes: 8 * 1024 * 1024
  });
  for (const key of RECEIPT_KEYS) {
    if (!Object.hasOwn(receipt, key)) throw new TypeError(`ProductLoop RuntimeEvent.receipt is missing '${key}'.`);
  }
  if (typeof receipt.eventHash !== "string" || !HEX_HASH.test(receipt.eventHash)) {
    throw new TypeError("ProductLoop RuntimeEvent.receipt.eventHash must be a lowercase SHA-256 hex digest.");
  }
  if (receipt.previousHash !== null && (typeof receipt.previousHash !== "string" || !HEX_HASH.test(receipt.previousHash))) {
    throw new TypeError("ProductLoop RuntimeEvent.receipt.previousHash must be null or a lowercase SHA-256 hex digest.");
  }
  stringField(receipt.canonicalJson, "ProductLoop RuntimeEvent.receipt.canonicalJson", {
    allowEmpty: false,
    maximumLength: 8 * 1024 * 1024
  });
  const canonicalJson = canonicalStringify({
    runId: event.runId,
    sequence: event.sequence,
    type: event.type,
    timestamp,
    data,
    receipt: { previousHash: receipt.previousHash }
  });
  if (receipt.canonicalJson !== canonicalJson || sha256(canonicalJson).slice(7) !== receipt.eventHash) {
    throw new QarinahError("PRODUCTLOOP_RECEIPT_INVALID", "ProductLoop RuntimeEvent receipt does not match its canonical contents.");
  }
  return deepFreezeJson({ ...event, timestamp, data, receipt });
}

export function productLoopRuntimeEventToEventInput(value) {
  const event = validateProductLoopRuntimeEvent(value);
  const relations = [
    { type: "governed_by", target: compactTarget("productloop-run:", event.runId) },
    { type: "derived_from", target: `productloop-receipt:${event.receipt.eventHash}` }
  ];
  if (event.receipt.previousHash) {
    relations.push({ type: "references", target: `productloop-receipt:${event.receipt.previousHash}` });
  }
  if (typeof event.data.stepId === "string" && event.data.stepId) {
    relations.push({ type: "affects", target: compactTarget("productloop-step:", `${event.runId}:${event.data.stepId}`) });
  }
  const kind = event.type === "run.started"
    ? "session.started"
    : event.type.startsWith("tool.")
      ? (event.type === "tool.requested" ? "tool.requested" : "tool.completed")
      : event.type.startsWith("policy.")
        ? "decision"
        : event.type.startsWith("approval.")
          ? "approval"
          : event.type === "run.completed" || event.type === "run.failed"
            ? "turn.completed"
            : "artifact";
  return deepFreezeJson({
    eventId: uuidFromReceipt(`${event.runId}\0${event.sequence}\0${event.receipt.eventHash}`),
    timestamp: event.timestamp,
    sessionId: event.runId,
    turnId: typeof event.data.stepId === "string"
      ? (event.data.stepId.length <= 256 ? event.data.stepId : `sha256:${sha256(event.data.stepId).slice(7)}`)
      : null,
    kind,
    actor: { type: "system", id: "productloop.runtime" },
    title: `ProductLoop ${event.type}`,
    body: "",
    data: {
      boundaryVersion: PRODUCTLOOP_RUNTIME_EVENT_BOUNDARY_VERSION,
      runtimeEvent: {
        runId: event.runId,
        sequence: event.sequence,
        type: event.type,
        data: event.data,
        receipt: {
          eventHash: event.receipt.eventHash,
          previousHash: event.receipt.previousHash
        }
      }
    },
    confidence: "extracted",
    relations,
    provenance: {
      adapter: "productloop.provenance-sink",
      sourceId: compactTarget("productloop-event:", `${event.runId}:${event.sequence}`)
    },
    retention: { class: "project", expiresAt: null }
  });
}

export function createProductLoopProvenanceSink(options = {}) {
  const configured = snapshotRecordBoundary(options, {
    label: "ProductLoop provenance sink options",
    keys: ["cwd", "workspace"],
    maximumStringLength: 2_048,
    maximumBytes: 4_096
  });
  if (configured.cwd !== undefined && (typeof configured.cwd !== "string" || configured.cwd.length === 0)) {
    throw new TypeError("ProductLoop provenance sink options.cwd must be a non-empty string.");
  }
  const heads = new Map();
  let queue = Promise.resolve();

  async function write(event) {
    const head = heads.get(event.runId);
    if (!head) {
      if (event.sequence !== 1 || event.receipt.previousHash !== null) {
        throw new QarinahError("PRODUCTLOOP_CHAIN_START_INVALID", `ProductLoop run '${event.runId}' must enter a new sink at sequence 1.`);
      }
    } else if (event.sequence === head.sequence && event.receipt.eventHash === head.eventHash) {
      await appendEvent(productLoopRuntimeEventToEventInput(event), {
        ...(configured.cwd === undefined ? {} : { cwd: configured.cwd }),
        ...(configured.workspace === undefined ? {} : { workspace: configured.workspace }),
        idempotent: true
      });
      return;
    } else if (event.sequence !== head.sequence + 1 || event.receipt.previousHash !== head.eventHash) {
      throw new QarinahError("PRODUCTLOOP_CHAIN_INVALID", `ProductLoop run '${event.runId}' broke sequence or receipt continuity.`);
    }
    await appendEvent(productLoopRuntimeEventToEventInput(event), {
      ...(configured.cwd === undefined ? {} : { cwd: configured.cwd }),
      ...(configured.workspace === undefined ? {} : { workspace: configured.workspace }),
      idempotent: true
    });
    heads.set(event.runId, { sequence: event.sequence, eventHash: event.receipt.eventHash });
  }

  const sink = {
    record(rawEvent) {
      const event = validateProductLoopRuntimeEvent(rawEvent);
      const operation = queue.then(() => write(event));
      queue = operation.catch(() => undefined);
      return operation;
    }
  };
  return Object.freeze(sink);
}
