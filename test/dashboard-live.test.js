import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appendEvent, initializeWorkspace, serveMemoryDashboard } from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

function requestStatus(url, host) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const outgoing = request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "GET",
      headers: { Host: host }
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

test("live dashboard reads real events from separate explicitly selected projects", async (t) => {
  const parent = await temporaryDirectory(t);
  const frontend = path.join(parent, "frontend");
  const backend = path.join(parent, "backend");
  await mkdir(frontend);
  await mkdir(backend);
  const frontendWorkspace = await initializeWorkspace(frontend, { capture: "content" });
  const backendWorkspace = await initializeWorkspace(backend, { capture: "content" });
  await appendEvent(eventInput({
    title: "Ship responsive project view",
    repository: { id: "team/frontend", branch: "main", commit: "a".repeat(40) }
  }), { cwd: frontend });
  await appendEvent(eventInput({
    title: "Keep the API private",
    repository: { id: "team/backend", branch: "main", commit: "b".repeat(40) }
  }), { cwd: backend });

  const live = await serveMemoryDashboard({ cwd: frontend, workspaces: [backend], port: 0 });
  t.after(() => live.close());
  assert.equal(live.host, "127.0.0.1");
  assert.equal(live.projects.length, 2);

  const index = await fetch(live.url);
  assert.equal(index.status, 200);
  const indexHtml = await index.text();
  assert.match(indexHtml, /Live from authorized local ledgers/u);
  assert.match(indexHtml, />frontend</u);
  assert.match(indexHtml, />backend</u);

  const frontendId = frontendWorkspace.config.workspaceId;
  const initial = await fetch(`${live.url}api/status/${frontendId}`).then((response) => response.json());
  assert.equal(initial.eventCount, 1);
  await appendEvent(eventInput({
    kind: "tool.completed",
    title: "Responsive verification passed",
    body: "Phone and desktop checks passed.",
    data: { toolName: "browser-smoke" },
    repository: { id: "team/frontend", branch: "main", commit: "c".repeat(40) }
  }), { cwd: frontend });
  const updated = await fetch(`${live.url}api/status/${frontendId}`).then((response) => response.json());
  assert.equal(updated.eventCount, 2);
  assert.notEqual(updated.headHash, initial.headHash);

  const projectPage = await fetch(`${live.url}project/${frontendId}/`).then((response) => response.text());
  assert.match(projectPage, /frontend remembers/u);
  assert.match(projectPage, /team\/frontend/u);
  assert.match(projectPage, /Responsive verification passed/u);
  assert.match(projectPage, /Live local ledger/u);
  assert.match(projectPage, /Cross-worktree comparison/u);
  assert.match(projectPage, /data-worktree-events=/u);
  assert.match(projectPage, /authoritative ledger .* task pack/u);
  assert.doesNotMatch(projectPage, /Not measured for this workspace/u);
  assert.match(projectPage, new RegExp(backendWorkspace.config.workspaceId, "u"));
  assert.equal(await requestStatus(live.url, "attacker.example"), 421);
});
