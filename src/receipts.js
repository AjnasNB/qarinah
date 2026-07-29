import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";

const STAGES = Object.freeze(["evidence", "memory", "policy", "execution", "observation"]);
const HASH = /^sha256:[a-f0-9]{64}$/;

function normalizeStage(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !["id", "hash", "system", "timestamp"].includes(key));
  if (unknown.length > 0) throw new TypeError(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
  if (typeof value.id !== "string" || value.id.trim() === "" || value.id.length > 512) {
    throw new TypeError(`${label}.id must be a non-empty string up to 512 characters.`);
  }
  if (typeof value.hash !== "string" || !HASH.test(value.hash)) throw new TypeError(`${label}.hash must be a sha256 digest.`);
  if (typeof value.system !== "string" || value.system.trim() === "" || value.system.length > 128) {
    throw new TypeError(`${label}.system must be a non-empty string up to 128 characters.`);
  }
  if (typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp))) {
    throw new TypeError(`${label}.timestamp must be an ISO timestamp.`);
  }
  return { id: value.id, hash: value.hash, system: value.system, timestamp: new Date(value.timestamp).toISOString() };
}

export function createCausalReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("causal receipt input must be an object.");
  const unknown = Object.keys(input).filter((key) => !STAGES.includes(key));
  if (unknown.length > 0) throw new TypeError(`causal receipt contains unknown stage(s): ${unknown.join(", ")}.`);
  const chain = STAGES.map((stage, index) => {
    const record = normalizeStage(input[stage], stage);
    return {
      stage,
      ...record,
      previousStageHash: index === 0 ? null : input[STAGES[index - 1]].hash
    };
  });
  const base = {
    schemaVersion: "qarinah.causal-receipt.v1",
    sequence: "Cockroach evidence -> Qarinah memory -> Maqam policy -> tool execution -> observed result",
    chain
  };
  return deepFreezeJson({ ...base, receiptHash: sha256(canonicalStringify(base)) });
}
