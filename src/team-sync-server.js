import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";

export const TEAM_SYNC_SERVICE_SCHEMA_VERSION = "qarinah.team-sync-service.v1";
const IDENTIFIER = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const WORKSPACE_ID = /^ws_[0-9a-f]{32}$/u;
const BUNDLE_ID = /^bundle_[0-9a-f]{32}$/u;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;
const MAX_TOKEN_CHARS = 512;

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function normalizeTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 10_000) throw new TypeError("tokens must contain 1 to 10000 entries.");
  const seen = new Set();
  return tokens.map((entry, index) => {
    if (!exactKeys(entry, ["token", "teamId", "memberId", "role"])) throw new TypeError(`tokens[${index}] has an invalid shape.`);
    if (typeof entry.token !== "string" || entry.token.length < 32 || entry.token.length > MAX_TOKEN_CHARS) throw new TypeError(`tokens[${index}].token is invalid.`);
    if (!IDENTIFIER.test(entry.teamId) || !IDENTIFIER.test(entry.memberId)) throw new TypeError(`tokens[${index}] identity is invalid.`);
    if (!["owner", "maintainer", "reader"].includes(entry.role)) throw new TypeError(`tokens[${index}].role is invalid.`);
    const digest = createHash("sha256").update(entry.token).digest();
    const key = digest.toString("hex");
    if (seen.has(key)) throw new TypeError("tokens cannot contain duplicate token values.");
    seen.add(key);
    return Object.freeze({ digest, teamId: entry.teamId, memberId: entry.memberId, role: entry.role });
  });
}

function normalizeOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("team sync server options must be a record.");
  const allowed = new Set(["root", "tokens", "host", "port", "maxBundleBytes", "requestsPerMinute", "clock"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`team sync server options contain unknown field(s): ${unknown.join(", ")}.`);
  if (typeof options.root !== "string" || options.root.trim() === "") throw new TypeError("root must be an explicit storage path.");
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") throw new TypeError("The built-in server binds only to a loopback address; place an authenticated TLS proxy in front for remote access.");
  const integer = (value, fallback, minimum, maximum, label) => {
    const selected = value ?? fallback;
    if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) throw new TypeError(`${label} must be from ${minimum} to ${maximum}.`);
    return selected;
  };
  if (options.clock !== undefined && typeof options.clock !== "function") throw new TypeError("clock must be a function.");
  return Object.freeze({
    root: path.resolve(options.root),
    tokens: normalizeTokens(options.tokens),
    host,
    port: integer(options.port, 0, 0, 65_535, "port"),
    maxBundleBytes: integer(options.maxBundleBytes, 64 * 1024 * 1024, 1_024, 128 * 1024 * 1024, "maxBundleBytes"),
    requestsPerMinute: integer(options.requestsPerMinute, 120, 1, 100_000, "requestsPerMinute"),
    clock: options.clock ?? (() => new Date())
  });
}

function validBase64(value, maximumBytes) {
  if (typeof value !== "string" || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !BASE64.test(value) || value.length % 4 !== 0) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function validateBundle(bundle, maximumBytes) {
  const keys = ["schemaVersion", "algorithm", "workspaceId", "teamManifestHash", "nonce", "ciphertext", "authenticationTag"];
  if (!exactKeys(bundle, keys) || bundle.schemaVersion !== "qarinah.encrypted-sync-bundle.v1" || bundle.algorithm !== "AES-256-GCM"
    || !WORKSPACE_ID.test(bundle.workspaceId) || !/^sha256:[0-9a-f]{64}$/u.test(bundle.teamManifestHash)
    || !validBase64(bundle.nonce, 64) || Buffer.from(bundle.nonce, "base64").length !== 12
    || !validBase64(bundle.authenticationTag, 64) || Buffer.from(bundle.authenticationTag, "base64").length !== 16
    || !validBase64(bundle.ciphertext, maximumBytes) || Buffer.from(bundle.ciphertext, "base64").length > maximumBytes) {
    throw Object.assign(new TypeError("Encrypted sync bundle failed its strict public boundary."), { statusCode: 400 });
  }
  return bundle;
}

export function encryptedSyncBundleId(bundle) {
  return `bundle_${sha256(canonicalStringify(bundle)).slice("sha256:".length, "sha256:".length + 32)}`;
}

function authenticate(request, tokens) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const value = header.slice(7);
  if (value.length < 32 || value.length > MAX_TOKEN_CHARS) return null;
  const digest = createHash("sha256").update(value).digest();
  return tokens.find((candidate) => timingSafeEqual(candidate.digest, digest)) ?? null;
}

function jsonResponse(response, status, value, headers = {}) {
  const bytes = Buffer.from(`${canonicalStringify(value)}\n`, "utf8");
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": bytes.length,
    "x-content-type-options": "nosniff",
    ...headers
  });
  response.end(bytes);
}

async function requestBody(request, maximumBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maximumBytes) throw Object.assign(new TypeError("Request body exceeds the configured byte limit."), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new TypeError("Request body must be valid JSON."), { statusCode: 400 });
  }
}

function validRequestAuthority(request, host, port) {
  const expected = host === "::1" ? `[::1]:${port}` : `${host}:${port}`;
  if (request.headers.host !== expected) return false;
  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${expected}`;
}

async function exclusiveAtomicWrite(destination, bytes) {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, destination);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return false;
  } finally {
    await rm(temporary, { force: true });
  }
}

function auditCore(identity, operation, status, fields, timestamp, requestId) {
  return {
    schemaVersion: "qarinah.team-sync-audit.v1",
    timestamp,
    requestId,
    teamId: identity.teamId,
    memberId: identity.memberId,
    role: identity.role,
    operation,
    status,
    workspaceId: fields.workspaceId ?? null,
    bundleId: fields.bundleId ?? null,
    bundleHash: fields.bundleHash ?? null
  };
}

async function appendAudit(root, identity, operation, status, fields, timestamp, requestId) {
  const core = auditCore(identity, operation, status, fields, timestamp, requestId);
  const record = { ...core, auditHash: sha256(core) };
  const auditId = `${timestamp.replaceAll(/[^0-9]/gu, "")}_${requestId}`;
  const destination = path.join(root, "teams", identity.teamId, "audit", `${auditId}.json`);
  await exclusiveAtomicWrite(destination, Buffer.from(`${canonicalStringify(record)}\n`, "utf8"));
  return deepFreezeJson(record);
}

async function safeRoot(root) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new TypeError("team sync storage root must be a real directory.");
  return realpath(root);
}

export function createTeamSyncServer(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const rate = new Map();
  let storageRoot;
  let server;

  function rateAllowed(identity, now) {
    const key = identity.digest.toString("hex");
    const window = Math.floor(now.getTime() / 60_000);
    const current = rate.get(key);
    if (!current || current.window !== window) {
      rate.set(key, { window, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= options.requestsPerMinute;
  }

  async function route(request, response) {
    const now = options.clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("clock must return a valid Date.");
    const timestamp = now.toISOString();
    const requestId = randomUUID();
    const address = server.address();
    if (!address || typeof address === "string" || !validRequestAuthority(request, options.host, address.port)) {
      return jsonResponse(response, 403, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "request-authority", requestId });
    }
    const identity = authenticate(request, options.tokens);
    if (!identity) return jsonResponse(response, 401, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "unauthorized", requestId });
    if (!rateAllowed(identity, now)) return jsonResponse(response, 429, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "rate-limit", requestId }, { "retry-after": "60" });
    const url = new URL(request.url ?? "/", `http://${options.host}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "v1") return jsonResponse(response, 404, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "not-found", requestId });

    if (parts.length === 3 && parts[1] === "admin" && parts[2] === "status" && request.method === "GET") {
      const bundleRoot = path.join(storageRoot, "teams", identity.teamId, "workspaces");
      let workspaces = [];
      try { workspaces = await readdir(bundleRoot, { withFileTypes: true }); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      const workspaceCount = workspaces.filter((entry) => entry.isDirectory() && WORKSPACE_ID.test(entry.name)).length;
      const value = { schemaVersion: "qarinah.team-sync-status.v1", teamId: identity.teamId, workspaceCount, storage: "opaque-encrypted-bundles", requestId };
      await appendAudit(storageRoot, identity, "status.read", "ok", {}, timestamp, requestId);
      return jsonResponse(response, 200, value);
    }

    if (parts.length === 3 && parts[1] === "admin" && parts[2] === "audit" && request.method === "GET") {
      if (identity.role === "reader") return jsonResponse(response, 403, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "forbidden", requestId });
      const limit = Number(url.searchParams.get("limit") ?? 100);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) return jsonResponse(response, 400, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "invalid-limit", requestId });
      const directory = path.join(storageRoot, "teams", identity.teamId, "audit");
      let names = [];
      try { names = (await readdir(directory)).filter((name) => /^[0-9]+_[0-9a-f-]{36}\.json$/u.test(name)).sort().reverse().slice(0, limit); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      const records = [];
      for (const name of names) records.push(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      return jsonResponse(response, 200, { schemaVersion: "qarinah.team-sync-audit-page.v1", teamId: identity.teamId, recordCount: records.length, records, requestId });
    }

    if (parts.length === 7 && parts[1] === "teams" && parts[3] === "workspaces" && parts[5] === "bundles") {
      const [, , teamId, , workspaceId, , bundleId] = parts;
      if (!IDENTIFIER.test(teamId) || !WORKSPACE_ID.test(workspaceId) || !BUNDLE_ID.test(bundleId)) return jsonResponse(response, 400, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "invalid-identity", requestId });
      if (teamId !== identity.teamId) return jsonResponse(response, 403, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "tenant-boundary", requestId });
      const destination = path.join(storageRoot, "teams", teamId, "workspaces", workspaceId, "bundles", `${bundleId}.json`);
      if (request.method === "PUT") {
        if (identity.role === "reader") return jsonResponse(response, 403, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "read-only-role", requestId });
        if (request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
          return jsonResponse(response, 415, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "json-required", requestId });
        }
        const bundle = validateBundle(await requestBody(request, options.maxBundleBytes * 2), options.maxBundleBytes);
        if (bundle.workspaceId !== workspaceId || encryptedSyncBundleId(bundle) !== bundleId) return jsonResponse(response, 409, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "bundle-identity-mismatch", requestId });
        const bytes = Buffer.from(`${canonicalStringify(bundle)}\n`, "utf8");
        const created = await exclusiveAtomicWrite(destination, bytes);
        if (!created && !timingSafeEqual(createHash("sha256").update(await readFile(destination)).digest(), createHash("sha256").update(bytes).digest())) {
          return jsonResponse(response, 409, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "immutable-bundle-conflict", requestId });
        }
        const bundleHash = sha256Bytes(bytes);
        const receiptCore = { schemaVersion: "qarinah.team-sync-write-receipt.v1", teamId, workspaceId, bundleId, bundleHash, created, requestId };
        const receipt = { ...receiptCore, receiptHash: sha256(receiptCore) };
        await appendAudit(storageRoot, identity, "bundle.write", created ? "created" : "idempotent", { workspaceId, bundleId, bundleHash }, timestamp, requestId);
        return jsonResponse(response, created ? 201 : 200, receipt, { etag: `"${bundleHash}"` });
      }
      if (request.method === "GET") {
        let bytes;
        try { bytes = await readFile(destination); } catch (error) { if (error?.code === "ENOENT") return jsonResponse(response, 404, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "bundle-not-found", requestId }); throw error; }
        if (bytes.length > options.maxBundleBytes * 2) throw new TypeError("Stored bundle exceeds the configured byte limit.");
        const bundle = validateBundle(JSON.parse(bytes.toString("utf8")), options.maxBundleBytes);
        const bundleHash = sha256Bytes(bytes);
        await appendAudit(storageRoot, identity, "bundle.read", "ok", { workspaceId, bundleId, bundleHash }, timestamp, requestId);
        return jsonResponse(response, 200, bundle, { etag: `"${bundleHash}"` });
      }
    }
    return jsonResponse(response, 404, { schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, error: "not-found", requestId });
  }

  return Object.freeze({
    async start() {
      if (server) throw new TypeError("team sync server is already started.");
      storageRoot = await safeRoot(options.root);
      server = createServer((request, response) => {
        route(request, response).catch((error) => {
          if (response.headersSent) return response.destroy();
          jsonResponse(response, error?.statusCode ?? 500, {
            schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION,
            error: error?.statusCode ? error.message : "internal-error",
            requestId: randomUUID()
          });
        });
      });
      server.requestTimeout = 30_000;
      server.headersTimeout = 15_000;
      server.keepAliveTimeout = 5_000;
      server.maxHeadersCount = 64;
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, options.host, resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new TypeError("team sync server did not bind a TCP address.");
      return deepFreezeJson({ schemaVersion: TEAM_SYNC_SERVICE_SCHEMA_VERSION, host: options.host, port: address.port, root: storageRoot });
    },
    async close() {
      if (!server) return;
      const current = server;
      server = undefined;
      await new Promise((resolve, reject) => current.close((error) => error ? reject(error) : resolve()));
    }
  });
}
