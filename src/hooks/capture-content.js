import { canonicalStringify } from "../canonical.js";
import { redactText, redactValue } from "../redact.js";

const RETAINED_TEXT_LIMIT = 48_000;

function redactedSerialization(value) {
  if (typeof value === "string") return { format: "text", text: redactText(value) };
  try {
    return {
      format: "canonical-json",
      text: canonicalStringify(redactValue(value, {
        label: "hook content",
        maximumDepth: 32,
        maximumNodes: 20_000,
        maximumArrayLength: 10_000,
        maximumObjectKeys: 2_000,
        maximumStringLength: 512 * 1024
      }))
    };
  } catch {
    return { format: "unavailable", text: "[UNSERIALIZABLE_HOST_VALUE]" };
  }
}

function sizeClass(length) {
  if (length === 0) return "empty";
  if (length <= 64) return "tiny";
  if (length <= 1_024) return "small";
  if (length <= 16_384) return "medium";
  if (length <= 65_536) return "large";
  return "very_large";
}

export function summarizeHookContent(value) {
  if (value === undefined || value === null) return Object.freeze({ present: false, sizeClass: "none" });
  const serialized = redactedSerialization(value);
  return Object.freeze({ present: true, sizeClass: sizeClass(serialized.text.length) });
}

export function retainHookContent(value, limit = RETAINED_TEXT_LIMIT) {
  if (!Number.isSafeInteger(limit) || limit < 256 || limit > RETAINED_TEXT_LIMIT) {
    throw new TypeError(`Hook content limit must be an integer from 256 to ${RETAINED_TEXT_LIMIT}.`);
  }
  const serialized = redactedSerialization(value);
  const sourceChars = serialized.text.length;
  let text = serialized.text;
  let truncated = false;
  if (text.length > limit) {
    const marker = `\n[TRUNCATED:${text.length - limit}]`;
    text = `${text.slice(0, Math.max(0, limit - marker.length))}${marker}`;
    truncated = true;
  }
  return Object.freeze({
    format: serialized.format,
    text,
    sourceChars,
    retainedChars: text.length,
    truncated
  });
}

export function hookRetentionMetadata(retained) {
  if (!retained) return null;
  return Object.freeze({
    format: retained.format,
    sourceChars: retained.sourceChars,
    retainedChars: retained.retainedChars,
    truncated: retained.truncated
  });
}
