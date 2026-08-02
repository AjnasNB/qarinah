import { sanitizeJsonValue } from "./canonical.js";

const SENSITIVE_KEY = /(?:^|[_-])(api[_-]?key|authorization|auth[_-]?token|password|passwd|secret|token|cookie|private[_-]?key|client[_-]?secret)(?:$|[_-])/i;
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{16,}\b/g,
  /\bnpm_[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g
];
const PEM_BEGIN_PREFIX = "-----BEGIN ";
const PEM_END_PREFIX = "-----END ";
const PEM_MARKER_SUFFIX = "-----";
const PRIVATE_KEY_LABEL_SUFFIX = "PRIVATE KEY";

function privateKeyLabel(value, start, end) {
  if (end - start < PRIVATE_KEY_LABEL_SUFFIX.length) return false;
  const suffixStart = end - PRIVATE_KEY_LABEL_SUFFIX.length;
  if (!value.startsWith(PRIVATE_KEY_LABEL_SUFFIX, suffixStart)) return false;
  for (let index = start; index < suffixStart; index += 1) {
    const code = value.charCodeAt(index);
    if (code !== 32 && (code < 65 || code > 90)) return false;
  }
  return true;
}

function privateKeyMarkerEnd(value, start, prefix) {
  if (!value.startsWith(prefix, start)) return -1;
  const labelStart = start + prefix.length;
  const suffixStart = value.indexOf(PEM_MARKER_SUFFIX, labelStart);
  if (suffixStart === -1 || !privateKeyLabel(value, labelStart, suffixStart)) return -1;
  return suffixStart + PEM_MARKER_SUFFIX.length;
}

function redactPrivateKeyBlocks(value) {
  let pieces;
  let copiedThrough = 0;
  let searchFrom = 0;

  while (searchFrom < value.length) {
    const beginStart = value.indexOf(PEM_BEGIN_PREFIX, searchFrom);
    if (beginStart === -1) break;
    const beginEnd = privateKeyMarkerEnd(value, beginStart, PEM_BEGIN_PREFIX);
    if (beginEnd === -1) {
      searchFrom = beginStart + PEM_BEGIN_PREFIX.length;
      continue;
    }

    let endEnd = -1;
    let endSearchFrom = beginEnd;
    while (endSearchFrom < value.length) {
      const endStart = value.indexOf(PEM_END_PREFIX, endSearchFrom);
      if (endStart === -1) break;
      endEnd = privateKeyMarkerEnd(value, endStart, PEM_END_PREFIX);
      if (endEnd !== -1) break;
      endSearchFrom = endStart + PEM_END_PREFIX.length;
    }

    pieces ??= [];
    pieces.push(value.slice(copiedThrough, beginStart), "[REDACTED]");
    if (endEnd === -1) {
      // Fail closed for a truncated PEM value. The remainder may be key bytes,
      // and stopping here keeps every scan range disjoint and linear.
      copiedThrough = value.length;
      searchFrom = value.length;
    } else {
      copiedThrough = endEnd;
      searchFrom = endEnd;
    }
  }

  if (pieces === undefined) return value;
  pieces.push(value.slice(copiedThrough));
  return pieces.join("");
}

function sensitiveKey(value) {
  const normalized = String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase();
  return SENSITIVE_KEY.test(normalized);
}

export function redactText(value) {
  let output = redactPrivateKeyBlocks(value);
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED]");
  return output;
}

export function redactValue(value, options = {}) {
  const safe = sanitizeJsonValue(value, options);

  function visit(candidate, key = "") {
    if (sensitiveKey(key)) return "[REDACTED]";
    if (typeof candidate === "string") return redactText(candidate);
    if (Array.isArray(candidate)) return candidate.map((item) => visit(item));
    if (candidate && typeof candidate === "object") {
      const result = Object.create(null);
      for (const [childKey, child] of Object.entries(candidate)) result[childKey] = visit(child, childKey);
      return result;
    }
    return candidate;
  }

  return visit(safe);
}
