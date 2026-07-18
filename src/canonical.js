import { createHash } from "node:crypto";

const DEFAULT_LIMITS = Object.freeze({
  maximumDepth: 16,
  maximumNodes: 20_000,
  maximumArrayLength: 10_000,
  maximumObjectKeys: 1_000,
  maximumStringLength: 65_536
});

export function sha256(value) {
  const bytes = typeof value === "string" ? value : canonicalStringify(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

export function deepFreezeJson(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function sortJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON numbers must be finite.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") {
    throw new TypeError("Canonical JSON supports only null, booleans, finite numbers, strings, arrays, and records.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical JSON records must use the default or null prototype.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = Object.create(null);
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new TypeError(`Canonical JSON field '${key}' must be an enumerable data property with a defined value.`);
    }
    result[key] = sortJsonValue(descriptor.value);
  }
  return result;
}

export function sanitizeJsonValue(value, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  let nodes = 0;

  function visit(candidate, path, depth) {
    nodes += 1;
    if (nodes > limits.maximumNodes) throw new TypeError(`JSON value exceeds ${limits.maximumNodes} nodes.`);
    if (depth > limits.maximumDepth) throw new TypeError(`JSON value exceeds depth ${limits.maximumDepth} at ${path}.`);
    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      if (candidate.length > limits.maximumStringLength) {
        return `${candidate.slice(0, limits.maximumStringLength)}\n[QARINAH_TRUNCATED:${candidate.length - limits.maximumStringLength}]`;
      }
      return candidate;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new TypeError(`${path} must contain only finite numbers.`);
      return Object.is(candidate, -0) ? 0 : candidate;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > limits.maximumArrayLength) {
        throw new TypeError(`${path} exceeds ${limits.maximumArrayLength} array items.`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const allowed = new Set(["length", ...Array.from({ length: candidate.length }, (_, index) => String(index))]);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string" || !allowed.has(key)) throw new TypeError(`${path} contains an unsupported array property.`);
      }
      return Array.from({ length: candidate.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
          throw new TypeError(`${path}[${index}] must be an enumerable data property.`);
        }
        return visit(descriptor.value, `${path}[${index}]`, depth + 1);
      });
    }
    if (!candidate || typeof candidate !== "object") throw new TypeError(`${path} contains an unsupported value.`);
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain records.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > limits.maximumObjectKeys) throw new TypeError(`${path} exceeds ${limits.maximumObjectKeys} fields.`);
    const result = Object.create(null);
    for (const key of keys) {
      if (typeof key !== "string") throw new TypeError(`${path} cannot contain symbol keys.`);
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
        throw new TypeError(`${path}.${key} must be an enumerable data property with a defined value.`);
      }
      result[key] = visit(descriptor.value, `${path}.${key}`, depth + 1);
    }
    return result;
  }

  return visit(value, options.label || "value", 0);
}
