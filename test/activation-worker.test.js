import assert from "node:assert/strict";
import test from "node:test";
import worker from "../website/worker.mjs";

function payload(overrides = {}) {
  return {
    schemaVersion: "qarinah.activation.v1",
    consentVersion: "2026-08-22",
    installationId: "b21c8f80-c23a-4ea1-b997-7b4928261a9f",
    event: "first_retrieval",
    version: "0.6.0",
    platform: "win32",
    occurredAt: "2026-08-22T10:00:00.000Z",
    ...overrides
  };
}

function environment(points) {
  return {
    ACTIVATION: { writeDataPoint(point) { points.push(point); } },
    ASSETS: { fetch() { return new Response("asset"); } }
  };
}

test("activation worker accepts one bounded content-free event", async () => {
  const points = [];
  const response = await worker.fetch(new Request("https://qarinah.io/api/activation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload())
  }), environment(points));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(points.length, 1);
  assert.deepEqual(points[0], {
    indexes: ["b21c8f80-c23a-4ea1-b997-7b4928261a9f"],
    blobs: ["first_retrieval", "0.6.0", "win32", "2026-08-22"],
    doubles: [1]
  });
});

test("activation worker rejects unknown fields, invalid events, and oversized bodies", async () => {
  const points = [];
  const unknown = await worker.fetch(new Request("https://qarinah.io/api/activation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ projectPath: "private/project" }))
  }), environment(points));
  assert.equal(unknown.status, 400);
  const invalid = await worker.fetch(new Request("https://qarinah.io/api/activation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ event: "project_content" }))
  }), environment(points));
  assert.equal(invalid.status, 400);
  const oversized = await worker.fetch(new Request("https://qarinah.io/api/activation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(2_049)
  }), environment(points));
  assert.equal(oversized.status, 413);
  assert.equal(points.length, 0);
});

test("activation route fails closed without its dataset and preserves canonical redirects", async () => {
  const missing = await worker.fetch(new Request("https://qarinah.io/api/activation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload())
  }), { ASSETS: { fetch() { return new Response("asset"); } } });
  assert.equal(missing.status, 503);
  const redirect = await worker.fetch(new Request("https://www.qarinah.io/docs", { redirect: "manual" }), environment([]));
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://qarinah.io/docs/");
  const local = await worker.fetch(new Request("http://127.0.0.1:8791/"), environment([]));
  assert.equal(local.status, 200);
  assert.equal(await local.text(), "asset");
});
