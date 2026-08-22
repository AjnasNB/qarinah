const ACTIVATION_EVENTS = new Set([
  "setup_completed",
  "first_capture",
  "first_retrieval",
  "first_cross_session_handoff",
  "seven_day_return"
]);
const ACTIVATION_KEYS = new Set([
  "schemaVersion",
  "consentVersion",
  "installationId",
  "event",
  "version",
  "platform",
  "occurredAt"
]);
const MAX_ACTIVATION_BODY_BYTES = 2_048;

function json(payload, status, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

async function readBoundedJson(request) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_ACTIVATION_BODY_BYTES)) {
    throw new RangeError("Activation payload exceeds 2048 bytes.");
  }
  if (!request.body) throw new TypeError("Activation payload is required.");
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_ACTIVATION_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("Activation payload exceeds 2048 bytes.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
}

function validActivation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => !ACTIVATION_KEYS.has(key)) || Object.keys(value).length !== ACTIVATION_KEYS.size) return false;
  return value.schemaVersion === "qarinah.activation.v1"
    && value.consentVersion === "2026-08-22"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.installationId)
    && ACTIVATION_EVENTS.has(value.event)
    && typeof value.version === "string" && /^[0-9A-Za-z.+-]{1,48}$/u.test(value.version)
    && ["aix", "darwin", "freebsd", "linux", "openbsd", "sunos", "win32"].includes(value.platform)
    && typeof value.occurredAt === "string" && Number.isFinite(Date.parse(value.occurredAt));
}

async function activationResponse(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405, { allow: "POST" });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "content-type-must-be-json" }, 415);
  }
  let payload;
  try {
    payload = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof RangeError ? "payload-too-large" : "invalid-json" }, error instanceof RangeError ? 413 : 400);
  }
  if (!validActivation(payload)) return json({ ok: false, error: "invalid-activation-event" }, 400);
  if (!env.ACTIVATION?.writeDataPoint) return json({ ok: false, error: "activation-dataset-unavailable" }, 503);
  env.ACTIVATION.writeDataPoint({
    indexes: [payload.installationId],
    blobs: [payload.event, payload.version, payload.platform, payload.consentVersion],
    doubles: [1]
  });
  return json({ ok: true }, 202);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const indexPath = url.pathname === "/index.html" || url.pathname.endsWith("/index.html");
    const localPreview = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase());
    if (!localPreview && (url.protocol !== "https:" || url.hostname.toLowerCase() !== "qarinah.io" || indexPath)) {
      url.protocol = "https:";
      url.hostname = "qarinah.io";
      url.port = "";
      if (indexPath) {
        url.pathname = url.pathname.slice(0, -"index.html".length) || "/";
      }
      const finalSegment = url.pathname.split("/").at(-1) ?? "";
      if (url.pathname !== "/" && !url.pathname.endsWith("/") && !finalSegment.includes(".")) {
        url.pathname = `${url.pathname}/`;
      }
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === "/api/activation") return activationResponse(request, env);
    return env.ASSETS.fetch(request);
  }
};
