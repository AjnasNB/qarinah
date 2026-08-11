import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  backupAgentArchives,
  initializeWorkspace,
  readEvents,
  setupWorkspace
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const fixedClock = () => new Date("2026-08-11T12:00:00.000Z");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("archive backup streams explicit JSONL exports to an external manifest and records a compact receipt", async (t) => {
  const sandbox = await temporaryDirectory(t);
  const project = path.join(sandbox, "project");
  const source = path.join(sandbox, "exports");
  const external = path.join(sandbox, "external");
  await mkdir(path.join(source, "nested"), { recursive: true });
  await mkdir(external);
  const first = `${JSON.stringify({ type: "message", content: "Visible project outcome" })}\n`;
  const second = `${JSON.stringify({ type: "tool", name: "shell", result: "passed" })}\n`;
  await writeFile(path.join(source, "session.jsonl"), first, "utf8");
  await writeFile(path.join(source, "nested", "tools.ndjson"), second, "utf8");
  await writeFile(path.join(source, "ignored.txt"), "not an agent export", "utf8");
  await initializeWorkspace(project, { capture: "metadata" });

  const result = await backupAgentArchives([source], external, { cwd: project, clock: fixedClock });
  assert.equal(result.fileCount, 2);
  assert.equal(result.totalBytes, Buffer.byteLength(first) + Buffer.byteLength(second));
  assert.match(result.manifestHash, /^sha256:[a-f0-9]{64}$/u);
  const manifest = JSON.parse(await readFile(result.manifest, "utf8"));
  assert.equal(manifest.schemaVersion, "qarinah.agent-archive-backup.v1");
  assert.deepEqual(manifest.files.map((file) => file.relativePath), ["nested/tools.ndjson", "session.jsonl"]);
  assert.equal(manifest.files.find((file) => file.relativePath === "session.jsonl").sha256, digest(first));
  assert.equal(await readFile(path.join(result.destination, "source-1", "session.jsonl"), "utf8"), first);
  const events = await readEvents(project);
  const receipt = events.find((event) => event.eventId === result.eventId);
  assert.equal(receipt.data.agentArchiveBackup.fileCount, 2);
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(source.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(await readFile(path.join(project, ".qarinah", "records", "CHANGES.md"), "utf8"), /Backed up exported agent archives/u);
});

test("archive backup rejects linked files and hard byte ceilings", async (t) => {
  const sandbox = await temporaryDirectory(t);
  const project = path.join(sandbox, "project");
  const source = path.join(sandbox, "source.jsonl");
  const linked = path.join(sandbox, "linked.jsonl");
  const external = path.join(sandbox, "external");
  await mkdir(external);
  await writeFile(source, `${JSON.stringify({ content: "bounded" })}\n`, "utf8");
  await link(source, linked);
  await initializeWorkspace(project);
  await assert.rejects(
    () => backupAgentArchives([linked], external, { cwd: project }),
    (error) => error.code === "BACKUP_SOURCE_INVALID"
  );
  await rm(linked);
  await assert.rejects(
    () => backupAgentArchives([source], external, { cwd: project, maxBytes: 1 }),
    (error) => error.code === "BACKUP_LIMIT_EXCEEDED"
  );
});

test("setup can perform one explicit external archive backup while initializing all memory views", async (t) => {
  const sandbox = await temporaryDirectory(t);
  const project = path.join(sandbox, "project");
  const source = path.join(sandbox, "codex-export.jsonl");
  const external = path.join(sandbox, "external");
  await mkdir(external);
  await writeFile(source, `${JSON.stringify({ type: "summary", content: "Reviewed release outcome" })}\n`, "utf8");
  const result = await setupWorkspace({
    cwd: project,
    codex: true,
    backupSources: [source],
    backupDestination: external
  });
  assert.equal(result.backup.fileCount, 1);
  assert.match(await readFile(path.join(project, ".qarinah", "dashboard", "index.html"), "utf8"), /Backed up exported agent archives/u);
  assert.match(await readFile(path.join(project, ".qarinah", "records", "OVERVIEW.md"), "utf8"), /1 agent sessions|0 agent sessions/u);
});
