import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { snapshotRecordBoundary } from "./interoperability/boundary.js";

export const MAX_ENCRYPTED_KNOWLEDGE_BYTES = 8_000_000;
const IDENTIFIER = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const WORKSPACE = /^ws_[0-9a-f]{32}$/u;
const BUNDLE = /^bundle_[0-9a-f]{32}$/u;
const KEYS = ["schemaVersion", "algorithm", "workspaceId", "teamManifestHash", "nonce", "ciphertext", "authenticationTag"];
function base64(value, maximum, exact) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4 + 4
    || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value) || value.length % 4 !== 0) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length <= maximum && (exact === undefined || bytes.length === exact) && bytes.toString("base64") === value;
}
export function validateEncryptedKnowledgeBundle(value) {
  const bundle = snapshotRecordBoundary(value, { label: "Encrypted knowledge", keys: KEYS,
    maximumBytes: MAX_ENCRYPTED_KNOWLEDGE_BYTES, maximumStringLength: MAX_ENCRYPTED_KNOWLEDGE_BYTES });
  if (bundle.schemaVersion !== "qarinah.encrypted-sync-bundle.v1" || bundle.algorithm !== "AES-256-GCM"
    || !WORKSPACE.test(bundle.workspaceId) || !/^sha256:[0-9a-f]{64}$/u.test(bundle.teamManifestHash)
    || !base64(bundle.nonce, 12, 12) || !base64(bundle.authenticationTag, 16, 16)
    || !base64(bundle.ciphertext, 6_000_000) || Buffer.byteLength(canonicalStringify(bundle)) > MAX_ENCRYPTED_KNOWLEDGE_BYTES) {
    throw new TypeError("Invalid encrypted knowledge bundle.");
  }
  return deepFreezeJson(bundle);
}
export function knowledgeBundleId(bundle) {
  return `bundle_${sha256(bundle).slice(7, 39)}`;
}
function requestUrl(options, bundleId) {
  const url = new URL(options.endpoint);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new TypeError("Use an HTTPS service origin; credentials and query parameters do not belong in the endpoint.");
  if (!IDENTIFIER.test(options.teamId) || !WORKSPACE.test(options.workspaceId) || bundleId !== undefined && !BUNDLE.test(bundleId)) throw new TypeError("Invalid team, workspace, or bundle identity.");
  url.pathname = `/v1/teams/${options.teamId}/workspaces/${options.workspaceId}/bundles${bundleId ? `/${bundleId}` : ""}`;
  if (typeof options.token !== "string" || options.token.length < 32 || options.token.length > 512 || /[\s\x00-\x1f]/u.test(options.token)) throw new TypeError("A bounded explicit service token is required.");
  return url;
}
async function fetchJson(url, options, init = {}) {
  const response = await (options.fetcher ?? fetch)(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  if (!response.ok) throw new Error(`Encrypted knowledge service returned HTTP ${response.status}.`);
  if (Number(response.headers.get("content-length")) > MAX_ENCRYPTED_KNOWLEDGE_BYTES) throw new Error("Service response exceeds its resource limit.");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_ENCRYPTED_KNOWLEDGE_BYTES) { await reader.cancel(); throw new Error("Service response exceeds its resource limit."); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function putEncryptedKnowledge(bundleInput, options) {
  const bundle = validateEncryptedKnowledgeBundle(bundleInput);
  if (bundle.workspaceId !== options.workspaceId) throw new TypeError("Bundle workspace does not match the selected service scope.");
  const bundleId = knowledgeBundleId(bundle), url = requestUrl(options, bundleId);
  const receipt = await fetchJson(url, options, { method: "PUT", body: canonicalStringify(bundle) });
  if (receipt.bundleId !== bundleId || receipt.bundleHash !== sha256(bundle)) throw new Error("Service receipt does not match the uploaded ciphertext.");
  return deepFreezeJson(receipt);
}
export async function getEncryptedKnowledge(bundleId, options) {
  const bundle = validateEncryptedKnowledgeBundle(await fetchJson(requestUrl(options, bundleId), options));
  if (bundle.workspaceId !== options.workspaceId || knowledgeBundleId(bundle) !== bundleId) throw new Error("Downloaded knowledge identity does not match the requested object.");
  return bundle;
}
export async function listEncryptedKnowledge(options) {
  const url = requestUrl(options);
  if (options.cursor !== undefined) {
    if (typeof options.cursor !== "string" || options.cursor.length > 2048) throw new TypeError("Invalid list cursor.");
    url.searchParams.set("cursor", options.cursor);
  }
  return deepFreezeJson(await fetchJson(url, options));
}
