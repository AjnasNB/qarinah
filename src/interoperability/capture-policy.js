import { canonicalStringify } from "../canonical.js";
import { QarinahError } from "../errors.js";
import { redactText, redactValue } from "../redact.js";
import { loadWorkspace } from "../workspace.js";

export function contentSummary(value) {
  if (value === undefined || value === null) return Object.freeze({ present: false, sizeClass: "none" });
  let serialized;
  try {
    serialized = typeof value === "string" ? redactText(value) : canonicalStringify(redactValue(value));
  } catch {
    serialized = "[UNSERIALIZABLE_INTEROP_VALUE]";
  }
  const sizeClass = serialized.length === 0 ? "empty"
    : serialized.length <= 64 ? "tiny"
      : serialized.length <= 1_024 ? "small"
        : serialized.length <= 16_384 ? "medium"
          : serialized.length <= 65_536 ? "large" : "very_large";
  return Object.freeze({ present: true, sizeClass });
}

export function workspaceLocator(options = {}, label = "Interoperability options") {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(`${label} must be a record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const allowed = new Set(["cwd", "workspace"]);
  const unknown = Reflect.ownKeys(descriptors).filter((key) => typeof key !== "string" || !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`${label} contains unknown field(s).`);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property.`);
    }
  }
  const cwd = descriptors.cwd?.value;
  if (cwd !== undefined && (typeof cwd !== "string" || cwd.length === 0)) {
    throw new TypeError(`${label}.cwd must be a non-empty string.`);
  }
  const suppliedWorkspace = descriptors.workspace?.value;
  let workspaceRoot;
  if (suppliedWorkspace !== undefined) {
    if (!suppliedWorkspace || typeof suppliedWorkspace !== "object" || Array.isArray(suppliedWorkspace)) {
      throw new TypeError(`${label}.workspace must be a Context Ledger workspace object.`);
    }
    const root = Object.getOwnPropertyDescriptor(suppliedWorkspace, "root");
    if (!root?.enumerable || !Object.hasOwn(root, "value") || typeof root.value !== "string" || root.value.length === 0) {
      throw new TypeError(`${label}.workspace.root must be an enumerable non-empty string data property.`);
    }
    workspaceRoot = root.value;
  }
  return Object.freeze({ start: workspaceRoot ?? cwd ?? process.cwd() });
}

export async function loadTrustedInteropWorkspace(locator) {
  return loadWorkspace(locator.start);
}

export function requestedCapture(value, workspace, { fallback = "metadata" } = {}) {
  const capture = value ?? fallback;
  if (!["metadata", "content"].includes(capture)) throw new TypeError("capture must be metadata or content.");
  if (capture === "content" && workspace.config.capture !== "content") {
    throw new QarinahError(
      "CONTENT_CAPTURE_NOT_APPROVED",
      "This operation requested content retention, but the trusted workspace permits metadata-only capture."
    );
  }
  return capture;
}
