import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalStringify, sha256 } from "../../src/canonical.js";
import { knowledgeBundleId, MAX_ENCRYPTED_KNOWLEDGE_BYTES, validateEncryptedKnowledgeBundle } from "../../src/encrypted-knowledge.js";

const SCHEMA = "qarinah.knowledge-service.v1";
const ID = "[a-z0-9][a-z0-9_-]{0,63}", WS = "ws_[0-9a-f]{32}", OBJECT = "bundle_[0-9a-f]{32}";
const ROUTE = new RegExp(`^/v1/teams/(${ID})/workspaces/(${WS})/bundles(?:/(${OBJECT}))?$`, "u");
function response(value, status = 200, extra = {}) {
  return new Response(canonicalStringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
function parseGrants(raw) {
  if (typeof raw !== "string" || raw.length > 65536) throw new Error("Service grants unavailable.");
  const grants = JSON.parse(raw);
  if (!Array.isArray(grants) || grants.length < 1 || grants.length > 500) throw new Error("Service grants unavailable.");
  for (const grant of grants) {
    if (!grant || Object.keys(grant).sort().join(",") !== "memberId,role,teamId,tokenHash,workspaceId"
      || !/^[0-9a-f]{64}$/u.test(grant.tokenHash) || !new RegExp(`^${ID}$`, "u").test(grant.teamId)
      || !new RegExp(`^${ID}$`, "u").test(grant.memberId) || !new RegExp(`^${WS}$`, "u").test(grant.workspaceId)
      || !["owner", "maintainer", "reader"].includes(grant.role)) throw new Error("Invalid service grants.");
  }
  if (new Set(grants.map(grant => grant.tokenHash)).size !== grants.length) throw new Error("Duplicate service grants.");
  return grants;
}
function authenticate(request, raw) {
  const grants = parseGrants(raw);
  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/u)?.[1];
  if (!token) return null;
  const digest = createHash("sha256").update(token).digest(); let selected = null;
  for (const grant of grants) {
    if (timingSafeEqual(digest, Buffer.from(grant.tokenHash, "hex"))) {
      if (selected) throw new Error("Duplicate service grants.");
      selected = grant;
    }
  }
  return selected;
}
async function readBundle(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw Object.assign(new Error("json-required"), { status: 415 });
  if (Number(request.headers.get("Content-Length")) > MAX_ENCRYPTED_KNOWLEDGE_BYTES) throw Object.assign(new Error("payload-too-large"), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("body-required"), { status: 400 });
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_ENCRYPTED_KNOWLEDGE_BYTES) { await reader.cancel(); throw Object.assign(new Error("payload-too-large"), { status: 413 }); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return validateEncryptedKnowledgeBundle(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { throw Object.assign(new Error("invalid-encrypted-bundle"), { status: 400 }); }
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") {
        parseGrants(env.QARINAH_SYNC_GRANTS);
        if (!env.KNOWLEDGE || !env.RATE_LIMITER) return response({ error: "service-unavailable" }, 503);
        return response({ schemaVersion: SCHEMA, version: "0.8.0", status: "configured",
          purpose: "Private encrypted knowledge transport", encryption: "Client-side AES-256-GCM", plaintextStored: false });
      }
      if (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) return response({ error: "origin-denied" }, 403);
      const route = ROUTE.exec(url.pathname);
      if (!route || url.searchParams.size > 1 || [...url.searchParams.keys()].some(key => key !== "cursor")) return response({ error: "not-found" }, 404);
      if (!env.KNOWLEDGE || !env.RATE_LIMITER) return response({ error: "service-unavailable" }, 503);
      const grant = authenticate(request, env.QARINAH_SYNC_GRANTS);
      if (!grant) return response({ error: "unauthorized" }, 401);
      const [, teamId, workspaceId, bundleId] = route;
      if (grant.teamId !== teamId || grant.workspaceId !== workspaceId) return response({ error: "scope-denied" }, 403);
      if (!(await env.RATE_LIMITER.limit({ key: `qarinah-knowledge:${grant.teamId}:${grant.memberId}:${grant.workspaceId}` })).success) return response({ error: "rate-limited" }, 429, { "Retry-After": "60" });
      const prefix = `${teamId}/${workspaceId}/`, key = `${prefix}${bundleId ?? ""}`;
      if (request.method === "GET" && !bundleId) {
        const cursor = url.searchParams.get("cursor");
        if (cursor?.length > 2048) return response({ error: "invalid-cursor" }, 400);
        const listing = await env.KNOWLEDGE.list({ prefix, limit: 20, ...(cursor ? { cursor } : {}) });
        return response({ schemaVersion: SCHEMA, bundles: listing.objects.map(object => ({ bundleId: object.key.slice(prefix.length),
          bytes: object.size, uploadedAt: object.uploaded.toISOString() })), nextCursor: listing.truncated ? listing.cursor : null });
      }
      if (request.method === "GET" && bundleId) {
        const object = await env.KNOWLEDGE.get(key);
        if (!object) return response({ error: "not-found" }, 404);
        if (object.size > MAX_ENCRYPTED_KNOWLEDGE_BYTES) return response({ error: "stored-object-too-large" }, 500);
        return new Response(object.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff", ETag: object.httpEtag } });
      }
      if (request.method === "PUT" && bundleId) {
        if (grant.role === "reader") return response({ error: "write-denied" }, 403);
        const bundle = await readBundle(request);
        if (bundle.workspaceId !== workspaceId || knowledgeBundleId(bundle) !== bundleId) return response({ error: "identity-mismatch" }, 409);
        const bytes = canonicalStringify(bundle), bundleHash = sha256(bundle);
        const stored = await env.KNOWLEDGE.put(key, bytes, { onlyIf: new Headers({ "If-None-Match": "*" }),
          httpMetadata: { contentType: "application/json", cacheControl: "no-store" }, customMetadata: { bundleHash } });
        if (!stored && (await env.KNOWLEDGE.head(key))?.customMetadata?.bundleHash !== bundleHash) return response({ error: "immutable-object-conflict" }, 409);
        return response({ schemaVersion: SCHEMA, bundleId, bundleHash, status: stored ? "stored" : "already-stored" }, stored ? 201 : 200);
      }
      return response({ error: "method-not-allowed" }, 405, { Allow: "GET, PUT" });
    } catch (error) {
      return response({ error: error.status ? error.message : "service-unavailable" }, error.status ?? 503);
    }
  }
};
