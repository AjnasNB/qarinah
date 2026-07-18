import { sanitizeJsonValue } from "./canonical.js";

const SENSITIVE_KEY = /(?:^|[_-])(api[_-]?key|authorization|auth[_-]?token|password|passwd|secret|token|cookie|private[_-]?key|client[_-]?secret)(?:$|[_-])/i;
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{16,}\b/g,
  /\bnpm_[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

export function redactText(value) {
  let output = value;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED]");
  return output;
}

export function redactValue(value, options = {}) {
  const safe = sanitizeJsonValue(value, options);

  function visit(candidate, key = "") {
    if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
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
