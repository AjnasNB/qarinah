import { deepFreezeJson, sanitizeJsonValue } from "./canonical.js";

// This capability is intentionally module-private: public append callers cannot
// claim that arbitrary data is already a reviewed metadata projection. Built-in
// adapters use it only after constructing an allowlisted, content-free payload.
const REVIEWED_METADATA_EVENTS = new WeakSet();

export function reviewMetadataEventInput(input) {
  const snapshot = deepFreezeJson(sanitizeJsonValue(input, {
    label: "reviewed metadata event",
    maximumDepth: 32,
    maximumNodes: 20_000,
    maximumArrayLength: 10_000,
    maximumObjectKeys: 2_000,
    maximumStringLength: 65_536
  }));
  REVIEWED_METADATA_EVENTS.add(snapshot);
  return snapshot;
}

export function isReviewedMetadataEventInput(input) {
  return Boolean(input && typeof input === "object" && REVIEWED_METADATA_EVENTS.has(input));
}
