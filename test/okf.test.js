import assert from "node:assert/strict";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appendEvent, exportOkf, initializeWorkspace } from "../src/index.js";
import { eventInput, temporaryDirectory } from "../test-support/helpers.js";

async function directorySnapshot(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const snapshot = Object.create(null);
  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(snapshot, await directorySnapshot(root, entryRelative));
    else snapshot[entryRelative] = await readFile(path.join(root, ...entryRelative.split("/")), "utf8");
  }
  return snapshot;
}

test("OKF export is deterministic, cited, linked, and leaves JSONL authoritative", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  const sourceId = "evt_00000000-0000-4000-8000-000000000001";
  const decisionId = "evt_00000000-0000-4000-8000-000000000002";
  await appendEvent(eventInput({
    eventId: sourceId,
    timestamp: "2026-07-18T10:00:00.000Z",
    kind: "source",
    title: "Official source",
    body: "Source evidence for the launch decision.",
    data: {
      citation: {
        url: "https://example.com/evidence",
        title: "Primary evidence",
        author: "Example Author",
        publishedAt: "2026-07-17T00:00:00.000Z"
      }
    }
  }), { workspace });
  await appendEvent(eventInput({
    eventId: decisionId,
    timestamp: "2026-07-19T12:30:00.000Z",
    title: "Launch with governed evidence",
    body: "Use the cited source without treating exported Markdown as authority.",
    relations: [
      { type: "derived_from", target: sourceId },
      { type: "references", target: "https://example.com/evidence" }
    ]
  }), { workspace });

  const eventPath = path.join(workspace.qarinahDir, "events", "events.jsonl");
  const authoritativeBefore = await readFile(eventPath, "utf8");
  const first = await exportOkf({ cwd: root });
  const defaultOutput = path.join(workspace.qarinahDir, "records", "okf");
  assert.equal(first.outputDirectory, defaultOutput);
  assert.equal(first.schemaVersion, "qarinah.okf-export.v1");
  assert.equal(first.okfVersion, "0.1");
  assert.equal(first.derived, true);
  assert.equal(first.source, ".qarinah/events/events.jsonl");
  assert.equal(first.eventCount, 2);
  assert.equal(first.fileCount, 5);
  assert.match(first.bundleHash, /^sha256:[0-9a-f]{64}$/);

  const firstSnapshot = await directorySnapshot(defaultOutput);
  assert.deepEqual(Object.keys(firstSnapshot), [
    ".qarinah-okf-export.json",
    `events/${sourceId}.md`,
    `events/${decisionId}.md`,
    "index.md",
    "log.md"
  ]);
  assert.match(firstSnapshot["index.md"], /^---\nokf_version: "0\.1"/);
  assert.match(firstSnapshot["index.md"], /JSONL event ledger is authoritative/);
  assert.match(firstSnapshot["index.md"], /not Qarinah's retrieval index or storage layer/);
  assert.match(firstSnapshot[`events/${sourceId}.md`], /^---\ntype: "Qarinah Event"/);
  assert.match(firstSnapshot[`events/${sourceId}.md`], /qarinah_event_hash: "sha256:[0-9a-f]{64}"/);
  assert.match(firstSnapshot[`events/${sourceId}.md`], /qarinah_provenance: \{"adapter":"test","content_hash":"sha256:[0-9a-f]{64}","source_id":"fixture"\}/);
  assert.match(firstSnapshot[`events/${sourceId}.md`], /qarinah_citations: \[\{"author":"Example Author","published_at":"2026-07-17T00:00:00\.000Z","title":"Primary evidence","url":"https:\/\/example\.com\/evidence"\}\]/);
  assert.match(firstSnapshot[`events/${decisionId}.md`], new RegExp(`\\./${sourceId}\\.md`));
  assert.match(firstSnapshot["log.md"], new RegExp(`\\(events/${decisionId}\\.md\\)`));
  assert.match(firstSnapshot[`events/${decisionId}.md`], /# Citations/);
  assert.ok(firstSnapshot["log.md"].indexOf(decisionId) < firstSnapshot["log.md"].indexOf(sourceId));

  const repeated = await exportOkf({ cwd: root });
  assert.equal(repeated.bundleHash, first.bundleHash);
  assert.deepEqual(await directorySnapshot(defaultOutput), firstSnapshot);

  const portable = await exportOkf({ cwd: root, output: "docs/okf-knowledge" });
  assert.equal(portable.bundleHash, first.bundleHash);
  assert.deepEqual(await directorySnapshot(portable.outputDirectory), firstSnapshot);
  assert.equal(await readFile(eventPath, "utf8"), authoritativeBefore);

  const marker = JSON.parse(firstSnapshot[".qarinah-okf-export.json"]);
  assert.equal(marker.outputDirectory, undefined);
  assert.equal(marker.bundleHash, first.bundleHash);
  assert.equal(marker.fileCount, 5);
});

test("OKF export rejects escapes, protected roots, unowned output, and linked parents", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({
    eventId: "evt_00000000-0000-4000-8000-000000000003",
    timestamp: "2026-07-20T00:00:00.000Z"
  }), { workspace });

  await assert.rejects(
    () => exportOkf({ cwd: root, output: path.join("..", `escape-${path.basename(root)}`) }),
    (error) => error.code === "PATH_OUTSIDE_WORKSPACE"
  );
  await assert.rejects(
    () => exportOkf({ cwd: root, output: ".qarinah/events/okf" }),
    (error) => error.code === "OKF_OUTPUT_PROTECTED"
  );
  await assert.rejects(
    () => exportOkf({ cwd: root, output: ".git/okf" }),
    (error) => error.code === "OKF_OUTPUT_PROTECTED"
  );

  const unowned = path.join(root, "docs", "unowned");
  await mkdir(unowned, { recursive: true });
  const sentinel = path.join(unowned, "do-not-delete.txt");
  await writeFile(sentinel, "preserve me\n", "utf8");
  await assert.rejects(
    () => exportOkf({ cwd: root, output: "docs/unowned" }),
    (error) => error.code === "OKF_OUTPUT_NOT_OWNED"
  );
  assert.equal(await readFile(sentinel, "utf8"), "preserve me\n");

  const linkedTarget = path.join(root, "linked-target");
  const linkedParent = path.join(root, "linked-parent");
  await mkdir(linkedTarget);
  let linked = false;
  try {
    await symlink(linkedTarget, linkedParent, process.platform === "win32" ? "junction" : "dir");
    linked = true;
  } catch (error) {
    t.diagnostic(`Symlink test unavailable: ${error.code || error.message}`);
  }
  if (linked) {
    await assert.rejects(
      () => exportOkf({ cwd: root, output: "linked-parent/okf" }),
      (error) => error.code === "STORAGE_LINK_REJECTED"
    );
  }
});

test("OKF replacement publishes a complete new projection without stale staging paths", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root, { capture: "content" });
  await appendEvent(eventInput({
    eventId: "evt_00000000-0000-4000-8000-000000000004",
    timestamp: "2026-07-19T00:00:00.000Z",
    title: "First projection"
  }), { workspace });
  const first = await exportOkf({ cwd: root });
  await appendEvent(eventInput({
    eventId: "evt_00000000-0000-4000-8000-000000000005",
    timestamp: "2026-07-20T00:00:00.000Z",
    title: "Replacement projection"
  }), { workspace });
  const second = await exportOkf({ cwd: root });
  assert.notEqual(second.bundleHash, first.bundleHash);
  assert.equal(second.eventCount, 2);
  assert.match(await readFile(path.join(second.outputDirectory, "index.md"), "utf8"), /Replacement projection/);
  const parentEntries = await readdir(path.dirname(second.outputDirectory));
  assert.equal(parentEntries.some((name) => name.includes("qarinah-okf-stage") || name.includes("qarinah-okf-backup")), false);
});

test("OKF replacement refuses a modified bundle even when its ownership marker remains", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = await initializeWorkspace(root);
  await appendEvent(eventInput({
    eventId: "evt_00000000-0000-4000-8000-000000000006",
    timestamp: "2026-07-20T01:00:00.000Z"
  }), { workspace });
  const exported = await exportOkf({ cwd: root });
  const indexPath = path.join(exported.outputDirectory, "index.md");
  await writeFile(indexPath, "user-modified bundle\n", "utf8");

  await assert.rejects(
    () => exportOkf({ cwd: root }),
    (error) => error.code === "OKF_OUTPUT_NOT_OWNED"
  );
  assert.equal(await readFile(indexPath, "utf8"), "user-modified bundle\n");
});

test("OKF export schema describes the public deterministic manifest", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/okf-export.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "qarinah.okf-export.v1");
  assert.equal(schema.properties.okfVersion.const, "0.1");
  assert.equal(schema.properties.derived.const, true);
  assert.equal(schema.properties.source.const, ".qarinah/events/events.jsonl");
});
