import { Buffer } from "node:buffer";

const DEFAULT_LIMITS = Object.freeze({
  maximumDepth: 32,
  maximumNodes: 20_000,
  maximumArrayLength: 10_000,
  maximumObjectKeys: 1_000,
  maximumStringLength: 1_000_000,
  maximumBytes: 256 * 1024
});

export function snapshotJsonBoundary(value, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const seen = new WeakSet();
  let nodes = 0;

  function visit(candidate, path, depth) {
    nodes += 1;
    if (nodes > limits.maximumNodes) throw new TypeError(`${limits.label} exceeds ${limits.maximumNodes} JSON nodes.`);
    if (depth > limits.maximumDepth) throw new TypeError(`${limits.label} exceeds depth ${limits.maximumDepth} at ${path}.`);
    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      if (candidate.length > limits.maximumStringLength) {
        throw new TypeError(`${path} exceeds ${limits.maximumStringLength} characters.`);
      }
      return candidate;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) {
        throw new TypeError(`${path} must be a finite JSON number other than negative zero.`);
      }
      return candidate;
    }
    if (!candidate || typeof candidate !== "object") throw new TypeError(`${path} contains a non-JSON value.`);
    if (seen.has(candidate)) throw new TypeError(`${path} contains a cyclic or repeated object reference.`);
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      if (candidate.length > limits.maximumArrayLength) {
        throw new TypeError(`${path} exceeds ${limits.maximumArrayLength} array entries.`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const expected = new Set(["length", ...Array.from({ length: candidate.length }, (_, index) => String(index))]);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string" || !expected.has(key)) throw new TypeError(`${path} contains an unsupported array property.`);
      }
      return Array.from({ length: candidate.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
          throw new TypeError(`${path}[${index}] must be an enumerable data property.`);
        }
        return visit(descriptor.value, `${path}[${index}]`, depth + 1);
      });
    }

    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain record.`);
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

  const snapshot = visit(value, limits.label || "value", 0);
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));
  if (bytes > limits.maximumBytes) throw new TypeError(`${limits.label || "value"} exceeds ${limits.maximumBytes} JSON bytes.`);
  return deepFreeze(snapshot);
}

export function snapshotRecordBoundary(value, options) {
  const snapshot = snapshotJsonBoundary(value, options);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError(`${options.label} must be a record.`);
  }
  const knownKeys = new Set(options.keys);
  const unknown = Object.keys(snapshot).filter((key) => !knownKeys.has(key));
  if (unknown.length > 0) throw new TypeError(`${options.label} contains unknown field(s): ${unknown.join(", ")}.`);
  return snapshot;
}

export function stringField(value, label, options = {}) {
  if (options.nullable && value === null) return null;
  if (typeof value !== "string" || (!options.allowEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be ${options.nullable ? "null or " : ""}a${options.allowEmpty ? "" : " non-empty"} string.`);
  }
  if (value.length > (options.maximumLength ?? 65_536)) {
    throw new TypeError(`${label} exceeds ${options.maximumLength ?? 65_536} characters.`);
  }
  return value;
}

export function isoTimestamp(value, label) {
  const input = stringField(value, label, { maximumLength: 64 });
  if (!Number.isFinite(Date.parse(input))) throw new TypeError(`${label} must be a valid timestamp.`);
  return new Date(input).toISOString();
}

export function canonicalIsoTimestamp(value, label) {
  const input = stringField(value, label, { maximumLength: 64 });
  if (!Number.isFinite(Date.parse(input)) || new Date(input).toISOString() !== input) {
    throw new TypeError(`${label} must be a canonical ISO timestamp with millisecond precision and a Z suffix.`);
  }
  return input;
}

export function dataFunction(value, key, label) {
  let current = value;
  while (current && (typeof current === "object" || typeof current === "function")) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (!Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
        throw new TypeError(`${label}.${key} must be a data function.`);
      }
      return descriptor.value.bind(value);
    }
    current = Object.getPrototypeOf(current);
  }
  throw new TypeError(`${label}.${key} must be a function.`);
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
