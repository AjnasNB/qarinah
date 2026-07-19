import { canonicalStringify, sha256 } from "./canonical.js";

const RESERVATION_NAMES = Object.freeze(["framing", "citations", "content"]);
const OVERFLOW_POLICIES = new Set(["error", "truncate"]);

export const PORTABLE_TOKEN_ESTIMATOR = Object.freeze({
  id: "portable-chars-div-4",
  version: "1",
  exact: false,
  estimate(text) {
    return Math.ceil(String(text).length / 4);
  }
});

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function normalizeTokenEstimator(candidate) {
  if (candidate === undefined) return PORTABLE_TOKEN_ESTIMATOR;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("tokenEstimator must be a record.");
  }
  const keys = Object.keys(candidate);
  const unknown = keys.filter((key) => !["id", "version", "exact", "estimate"].includes(key));
  if (unknown.length > 0) throw new TypeError(`tokenEstimator contains unknown field(s): ${unknown.join(", ")}.`);
  if (typeof candidate.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(candidate.id)) {
    throw new TypeError("tokenEstimator.id must be a lowercase identifier up to 64 characters.");
  }
  if (typeof candidate.version !== "string" || candidate.version.length < 1 || candidate.version.length > 64) {
    throw new TypeError("tokenEstimator.version must be a non-empty string up to 64 characters.");
  }
  if (candidate.exact !== undefined && typeof candidate.exact !== "boolean") {
    throw new TypeError("tokenEstimator.exact must be a boolean when provided.");
  }
  if (typeof candidate.estimate !== "function") throw new TypeError("tokenEstimator.estimate must be a function.");
  return Object.freeze({
    id: candidate.id,
    version: candidate.version,
    exact: candidate.exact === true,
    estimate: candidate.estimate
  });
}

export function estimateTokens(estimator, text) {
  const result = estimator.estimate(String(text));
  if (!Number.isSafeInteger(result) || result < 0 || result > 100_000_000) {
    throw new TypeError("tokenEstimator.estimate must synchronously return an integer from 0 to 100000000.");
  }
  return result;
}

function defaultReservations(total) {
  const framing = Math.max(64, Math.floor(total * 0.2));
  const citations = Math.max(64, Math.floor(total * 0.25));
  const content = Math.max(0, total - framing - citations);
  return [
    { name: "framing", minimum: 0, target: framing, maximum: total, priority: 100, overflow: "error" },
    { name: "citations", minimum: 0, target: citations, maximum: total, priority: 90, overflow: "truncate" },
    { name: "content", minimum: 0, target: content, maximum: total, priority: 50, overflow: "truncate" }
  ];
}

function normalizeReservations(value, total) {
  const source = value === undefined ? defaultReservations(total) : value;
  if (!Array.isArray(source) || source.length !== RESERVATION_NAMES.length) {
    throw new TypeError("reservations must contain framing, citations, and content entries.");
  }
  const seen = new Set();
  const normalized = source.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError(`reservations[${index}] must be a record.`);
    }
    const unknown = Object.keys(candidate).filter((key) => !["name", "minimum", "target", "maximum", "priority", "overflow"].includes(key));
    if (unknown.length > 0) throw new TypeError(`reservations[${index}] contains unknown field(s): ${unknown.join(", ")}.`);
    if (!RESERVATION_NAMES.includes(candidate.name) || seen.has(candidate.name)) {
      throw new TypeError("reservations must name framing, citations, and content exactly once.");
    }
    seen.add(candidate.name);
    const minimum = integer(candidate.minimum, `reservations[${index}].minimum`, 0, total);
    const target = integer(candidate.target, `reservations[${index}].target`, minimum, total);
    const maximum = integer(candidate.maximum, `reservations[${index}].maximum`, target, total);
    const priority = integer(candidate.priority, `reservations[${index}].priority`, 0, 1_000);
    if (!OVERFLOW_POLICIES.has(candidate.overflow)) {
      throw new TypeError(`reservations[${index}].overflow must be error or truncate.`);
    }
    return Object.freeze({ name: candidate.name, minimum, target, maximum, priority, overflow: candidate.overflow });
  });
  if (RESERVATION_NAMES.some((name) => !seen.has(name))) {
    throw new TypeError("reservations must name framing, citations, and content exactly once.");
  }
  return normalized;
}

function allocate(total, reservations) {
  const allocations = Object.fromEntries(reservations.map((entry) => [entry.name, entry.minimum]));
  let remaining = total - Object.values(allocations).reduce((sum, value) => sum + value, 0);
  if (remaining < 0) throw new TypeError("reservation minimums exceed the available context budget.");
  const ordered = [...reservations].sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
  for (const field of ["target", "maximum"]) {
    for (const reservation of ordered) {
      const requested = reservation[field] - allocations[reservation.name];
      if (requested <= 0 || remaining <= 0) continue;
      const granted = Math.min(requested, remaining);
      allocations[reservation.name] += granted;
      remaining -= granted;
    }
  }
  return Object.freeze(allocations);
}

export function createTokenBudget(options, maxChars) {
  const enabled = options.maxTokens !== undefined
    || options.reserveTokens !== undefined
    || options.tokenEstimator !== undefined
    || options.reservations !== undefined;
  if (!enabled) return Object.freeze({ enabled: false, estimator: PORTABLE_TOKEN_ESTIMATOR });
  const estimator = normalizeTokenEstimator(options.tokenEstimator);
  const maxTokens = integer(options.maxTokens ?? Math.ceil(maxChars / 4), "maxTokens", 128, 1_000_000);
  const defaultReserve = Math.min(2_048, Math.max(0, Math.floor(maxTokens * 0.1)));
  const reserveTokens = integer(options.reserveTokens ?? defaultReserve, "reserveTokens", 0, maxTokens - 64);
  const availableTokens = maxTokens - reserveTokens;
  const reservations = normalizeReservations(options.reservations, availableTokens);
  const allocations = allocate(availableTokens, reservations);
  return Object.freeze({
    enabled: true,
    estimator,
    maxTokens,
    reserveTokens,
    availableTokens,
    reservations,
    allocations,
    reservationPolicyHash: sha256({ reservations, allocations })
  });
}

export function tokenBudgetMetadata(plan, usedTokens) {
  if (!plan.enabled) return null;
  return Object.freeze({
    maxTokens: plan.maxTokens,
    usedTokens,
    reservedTokens: plan.reserveTokens,
    availableTokens: plan.availableTokens,
    estimator: Object.freeze({ id: plan.estimator.id, version: plan.estimator.version, exact: plan.estimator.exact }),
    allocations: plan.allocations,
    reservationPolicyHash: plan.reservationPolicyHash
  });
}

export function reservationUsage(items, estimator) {
  const citations = items.map(({ excerpt: _excerpt, ...citation }) => citation);
  const content = items.map((item) => item.excerpt).filter(Boolean);
  return Object.freeze({
    citations: estimateTokens(estimator, canonicalStringify(citations)),
    content: estimateTokens(estimator, content.join("\n"))
  });
}
