import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify, sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { markdownDataBlock, markdownInline, markdownSafeText } from "./markdown.js";
import { readEvents } from "./store.js";
import { atomicWriteFile, loadWorkspace, resolveWithin } from "./workspace.js";

export const OKF_VERSION = "0.1";
export const OKF_EXPORT_SCHEMA_VERSION = "qarinah.okf-export.v1";

const DEFAULT_OUTPUT_SEGMENTS = Object.freeze([".qarinah", "records", "okf"]);
const EVENT_FILE_PATTERN = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/;
const EXPORT_MARKER = ".qarinah-okf-export.json";
const EVENT_SOURCE = ".qarinah/events/events.jsonl";
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_EVENTS = 100_000;
const ROOT_FILES = Object.freeze([EXPORT_MARKER, "events", "index.md", "log.md"]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function optionalLstat(candidate) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function validateOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("OKF export options must be a record.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set(["cwd", "output"]);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new TypeError("OKF export options contain unknown fields.");
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`OKF export options.${key} must be an enumerable data property.`);
    }
    if (descriptor.value !== undefined && (typeof descriptor.value !== "string" || descriptor.value.trim() === "")) {
      throw new TypeError(`OKF export options.${key} must be a non-empty string.`);
    }
  }
  return Object.freeze({ cwd: descriptors.cwd?.value, output: descriptors.output?.value });
}

function resolveOutputDirectory(workspace, output) {
  const outputDirectory = output === undefined
    ? resolveWithin(workspace.root, ...DEFAULT_OUTPUT_SEGMENTS)
    : resolveWithin(workspace.root, output);
  const relative = path.relative(workspace.root, outputDirectory);
  if (relative === "") {
    throw new QarinahError("OKF_OUTPUT_PROTECTED", "The workspace root cannot be replaced by an OKF export.");
  }
  const segments = relative.split(path.sep).filter(Boolean);
  const normalized = segments.map((segment) => process.platform === "win32" ? segment.toLowerCase() : segment);
  if (normalized[0] === ".git") {
    throw new QarinahError("OKF_OUTPUT_PROTECTED", "An OKF export cannot be written inside .git.");
  }
  if (normalized[0] === ".qarinah") {
    const allowedDerivedRoot = normalized[1] === "records" || normalized[1] === "snapshots";
    if (!allowedDerivedRoot || normalized.length < 3) {
      throw new QarinahError(
        "OKF_OUTPUT_PROTECTED",
        "An OKF export inside .qarinah must be a child of the derived records or snapshots directory."
      );
    }
  }
  return outputDirectory;
}

async function ensureSafeDirectoryChain(root, directory) {
  const relative = path.relative(root, directory);
  if (!isWithin(root, directory)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "OKF output parent escapes the workspace root.");
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let metadata = await optionalLstat(current);
    if (!metadata) {
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      metadata = await lstat(current);
    }
    if (metadata.isSymbolicLink()) {
      throw new QarinahError("STORAGE_LINK_REJECTED", "OKF output paths cannot traverse a symbolic link or junction.");
    }
    if (!metadata.isDirectory()) {
      throw new QarinahError("OKF_OUTPUT_INVALID", "Every existing OKF output parent must be a directory.");
    }
    const actual = await realpath(current);
    if (!isWithin(root, actual)) {
      throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "OKF output parent resolves outside the workspace root.");
    }
  }
}

function safeOneLine(value, fallback, maximum = 240) {
  const normalized = markdownSafeText(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}\u2026`;
}

function yamlValue(value) {
  return canonicalStringify(value);
}

function frontmatter(entries) {
  return ["---", ...entries.map(([key, value]) => `${key}: ${yamlValue(value)}`), "---", ""].join("\n");
}

function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length > 8_192) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function optionalCitationField(value, maximum) {
  if (typeof value !== "string") return undefined;
  const normalized = markdownSafeText(value).trim();
  if (normalized === "") return undefined;
  return normalized.slice(0, maximum);
}

function citationsFor(event) {
  const byUrl = new Map();
  const add = (candidate, fallback = {}) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const url = safeHttpUrl(candidate.url ?? fallback.url);
    if (!url) return;
    const next = {
      url,
      title: optionalCitationField(candidate.title ?? fallback.title, 512),
      author: optionalCitationField(candidate.author ?? fallback.author, 512),
      published_at: optionalCitationField(candidate.publishedAt ?? candidate.published_at ?? fallback.publishedAt, 128)
    };
    const prior = byUrl.get(url) || { url };
    byUrl.set(url, Object.fromEntries(Object.entries({ ...next, ...prior }).filter(([, value]) => value !== undefined)));
  };

  if (event.data?.citation) add(event.data.citation);
  if (Array.isArray(event.data?.citations)) {
    for (const citation of event.data.citations) add(citation);
  }
  add({
    url: event.data?.canonicalUrl,
    title: event.data?.title,
    author: event.data?.author,
    publishedAt: event.data?.publishedAt
  });
  for (const relation of event.relations) {
    if (relation.type === "references") add({ url: relation.target });
  }
  add({ url: event.provenance.sourceId });
  return [...byUrl.values()].sort((left, right) => compareText(canonicalStringify(left), canonicalStringify(right)));
}

function markdownUrl(value) {
  return value.replace(/\\/g, "%5C").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function sortedRelations(event) {
  return [...event.relations].sort((left, right) => (
    compareText(left.type, right.type) || compareText(left.target, right.target)
  ));
}

function prettyCanonicalJson(value) {
  return JSON.stringify(JSON.parse(canonicalStringify(value)), null, 2);
}

function renderEventConcept(event, eventById) {
  const citations = citationsFor(event);
  const relations = sortedRelations(event);
  const description = safeOneLine(event.body, `Recorded ${event.kind} event.`, 240);
  const metadata = [
    ["type", "Qarinah Event"],
    ["title", safeOneLine(event.title, event.eventId, 512)],
    ["description", description],
    ["resource", `qarinah:event:${event.eventId}`],
    ["tags", ["qarinah", "event", event.kind, event.actor.type, event.confidence]],
    ["timestamp", event.timestamp],
    ["qarinah_schema_version", "qarinah.okf-event.v1"],
    ["qarinah_derived", true],
    ["qarinah_workspace_id", event.workspaceId],
    ["qarinah_event_id", event.eventId],
    ["qarinah_event_schema_version", event.schemaVersion],
    ["qarinah_event_hash", event.hash],
    ["qarinah_previous_hash", event.previousHash],
    ["qarinah_kind", event.kind],
    ["qarinah_confidence", event.confidence],
    ["qarinah_authority", event.authority ?? null],
    ["qarinah_actor", event.actor],
    ["qarinah_session_id", event.sessionId],
    ["qarinah_turn_id", event.turnId],
    ["qarinah_relations", relations],
    ["qarinah_provenance", {
      adapter: event.provenance.adapter,
      content_hash: event.provenance.contentHash,
      source_id: event.provenance.sourceId
    }],
    ["qarinah_citations", citations],
    ["qarinah_retention", event.retention]
  ];
  const lines = [
    frontmatter(metadata),
    `# ${markdownInline(event.title)}`,
    "",
    "> Derived Google Open Knowledge Format 0.1 Draft interchange. The Qarinah JSONL event ledger is authoritative; this document is not a retrieval index or storage layer.",
    "",
    "## Event",
    "",
    `- Event ID: \`${event.eventId}\``,
    `- Kind: \`${event.kind}\``,
    `- Timestamp: \`${event.timestamp}\``,
    `- Actor: ${markdownInline(`${event.actor.type}:${event.actor.id}`)}`,
    `- Confidence: \`${event.confidence}\``,
    `- Event hash: \`${event.hash}\``,
    `- Previous hash: ${event.previousHash === null ? "none" : `\`${event.previousHash}\``}`,
    "",
    "## Recorded body (untrusted evidence)",
    "",
    markdownDataBlock(event.body || "(empty)"),
    "",
    "## Data (untrusted evidence)",
    "",
    markdownDataBlock(prettyCanonicalJson(event.data)),
    "",
    "## Relations",
    ""
  ];
  if (relations.length === 0) lines.push("_No explicit relations._");
  for (const relation of relations) {
    const known = eventById.get(relation.target);
    if (known) {
      lines.push(`- **${relation.type}**: [${markdownInline(known.title)}](./${known.eventId}.md) (\`${known.eventId}\`)`);
      continue;
    }
    const external = safeHttpUrl(relation.target);
    if (external) {
      lines.push(`- **${relation.type}**: [${markdownInline(relation.target)}](${markdownUrl(external)})`);
      continue;
    }
    lines.push(`- **${relation.type}**: ${markdownInline(relation.target)}`);
  }
  lines.push(
    "",
    "## Provenance",
    "",
    `- Adapter: ${markdownInline(event.provenance.adapter)}`,
    `- Source ID: ${event.provenance.sourceId === null ? "none" : markdownInline(event.provenance.sourceId)}`,
    `- Content hash: \`${event.provenance.contentHash}\``
  );
  if (citations.length > 0) {
    lines.push("", "# Citations", "");
    citations.forEach((citation, index) => {
      const label = citation.title || citation.url;
      const details = [citation.author, citation.published_at].filter(Boolean).map(markdownInline);
      lines.push(`[${index + 1}] [${markdownInline(label)}](${markdownUrl(citation.url)})${details.length ? ` — ${details.join(", ")}` : ""}`);
    });
  }
  return `${lines.join("\n")}\n`;
}

function newestFirst(left, right) {
  return compareText(right.timestamp, left.timestamp) || compareText(left.eventId, right.eventId);
}

function renderIndex(events, workspaceId, headHash) {
  const lines = [
    frontmatter([["okf_version", OKF_VERSION]]),
    "# Qarinah event knowledge bundle",
    "",
    "> This is a deterministic, derived Google Open Knowledge Format 0.1 Draft interchange bundle. The Qarinah JSONL event ledger is authoritative at `.qarinah/events/events.jsonl`. This bundle is not Qarinah's retrieval index or storage layer.",
    "",
    "# Bundle provenance",
    "",
    `- Workspace ID: \`${workspaceId}\``,
    `- Source: \`${EVENT_SOURCE}\``,
    `- Event count: ${events.length}`,
    `- Head hash: ${headHash === null ? "none" : `\`${headHash}\``}`,
    "",
    "# Events",
    ""
  ];
  if (events.length === 0) lines.push("_No events have been recorded._");
  for (const event of [...events].sort(newestFirst)) {
    const description = safeOneLine(event.body, `${event.kind} at ${event.timestamp}.`, 160);
    lines.push(`* [${markdownInline(event.title)}](events/${event.eventId}.md) - ${markdownInline(description)}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderLog(events) {
  const lines = [
    "# Qarinah Event Update Log",
    "",
    "> Event-time projection of the authoritative Qarinah JSONL ledger; newest entries appear first.",
    ""
  ];
  let date = null;
  for (const event of [...events].sort(newestFirst)) {
    const nextDate = event.timestamp.slice(0, 10);
    if (nextDate !== date) {
      if (date !== null) lines.push("");
      lines.push(`## ${nextDate}`, "");
      date = nextDate;
    }
    lines.push(`* **Recorded**: [${markdownInline(event.title)}](events/${event.eventId}.md) — \`${event.kind}\` at \`${event.timestamp}\`; hash \`${event.hash}\`.`);
  }
  if (events.length === 0) lines.push("_No events have been recorded._");
  return `${lines.join("\n")}\n`;
}

function bundleHash(files) {
  const entries = [...files.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([relativePath, contents]) => ({ path: relativePath, hash: sha256(contents) }));
  return sha256(entries);
}

function buildBundle(events, workspaceId) {
  if (!Array.isArray(events) || events.length > MAX_EVENTS) throw new TypeError("OKF events must be a bounded array.");
  const eventById = new Map(events.map((event) => [event.eventId, event]));
  const headHash = events.at(-1)?.hash ?? null;
  const files = new Map([
    ["index.md", renderIndex(events, workspaceId, headHash)],
    ["log.md", renderLog(events)]
  ]);
  for (const event of [...events].sort((left, right) => compareText(left.eventId, right.eventId))) {
    files.set(`events/${event.eventId}.md`, renderEventConcept(event, eventById));
  }
  const manifest = Object.freeze({
    schemaVersion: OKF_EXPORT_SCHEMA_VERSION,
    okfVersion: OKF_VERSION,
    derived: true,
    source: EVENT_SOURCE,
    workspaceId,
    eventCount: events.length,
    headHash,
    bundleHash: bundleHash(files),
    fileCount: files.size + 1
  });
  files.set(EXPORT_MARKER, `${canonicalStringify(manifest)}\n`);
  return Object.freeze({ files, manifest });
}

function validateMarker(value, workspaceId, eventFileCount) {
  const keys = [
    "bundleHash", "derived", "eventCount", "fileCount", "headHash", "okfVersion", "schemaVersion", "source", "workspaceId"
  ];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort(compareText).join("\0") !== keys.sort(compareText).join("\0")
    || value.schemaVersion !== OKF_EXPORT_SCHEMA_VERSION
    || value.okfVersion !== OKF_VERSION
    || value.derived !== true
    || value.source !== EVENT_SOURCE
    || value.workspaceId !== workspaceId
    || !Number.isSafeInteger(value.eventCount)
    || value.eventCount !== eventFileCount
    || value.eventCount < 0
    || value.eventCount > MAX_EVENTS
    || !Number.isSafeInteger(value.fileCount)
    || value.fileCount !== value.eventCount + 3
    || (value.headHash !== null && !HASH_PATTERN.test(value.headHash))
    || !HASH_PATTERN.test(value.bundleHash)) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing output is not a valid Qarinah-owned OKF export.");
  }
}

async function assertRegularFile(candidate, label, maximumBytes = 256 * 1024 * 1024) {
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink()) {
    throw new QarinahError("STORAGE_LINK_REJECTED", `${label} cannot be a symbolic link or junction.`);
  }
  if (!metadata.isFile()) throw new QarinahError("OKF_OUTPUT_NOT_OWNED", `${label} must be a regular file.`);
  if (metadata.size > maximumBytes) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", `${label} exceeds its bounded size.`);
  }
  return metadata;
}

async function assertOwnedOutput(outputDirectory, workspace) {
  const metadata = await optionalLstat(outputDirectory);
  if (!metadata) return false;
  if (metadata.isSymbolicLink()) {
    throw new QarinahError("STORAGE_LINK_REJECTED", "OKF output cannot be a symbolic link or junction.");
  }
  if (!metadata.isDirectory()) {
    throw new QarinahError("OKF_OUTPUT_INVALID", "Existing OKF output must be a directory.");
  }
  const actual = await realpath(outputDirectory);
  if (!isWithin(workspace.root, actual)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "Existing OKF output resolves outside the workspace root.");
  }
  const entries = (await readdir(outputDirectory)).sort(compareText);
  if (entries.join("\0") !== [...ROOT_FILES].sort(compareText).join("\0")) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing OKF output contains unexpected or missing entries.");
  }
  const eventDirectory = path.join(outputDirectory, "events");
  const eventMetadata = await lstat(eventDirectory);
  if (eventMetadata.isSymbolicLink()) {
    throw new QarinahError("STORAGE_LINK_REJECTED", "OKF event directory cannot be a symbolic link or junction.");
  }
  if (!eventMetadata.isDirectory()) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "OKF events must be stored in a directory.");
  }
  const eventFiles = (await readdir(eventDirectory)).sort(compareText);
  if (eventFiles.length > MAX_EVENTS || eventFiles.some((name) => !EVENT_FILE_PATTERN.test(name))) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing OKF output contains invalid event concept paths.");
  }
  await assertRegularFile(path.join(outputDirectory, EXPORT_MARKER), "OKF ownership marker", 64 * 1024);
  await assertRegularFile(path.join(outputDirectory, "index.md"), "OKF root index", 64 * 1024 * 1024);
  await assertRegularFile(path.join(outputDirectory, "log.md"), "OKF root log", 64 * 1024 * 1024);
  for (const name of eventFiles) {
    await assertRegularFile(path.join(eventDirectory, name), `OKF event concept '${name}'`, 2 * 1024 * 1024);
  }
  const markerText = await readFile(path.join(outputDirectory, EXPORT_MARKER), "utf8");
  let marker;
  try {
    marker = JSON.parse(markerText);
  } catch {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing OKF ownership marker is not valid JSON.");
  }
  if (markerText !== `${canonicalStringify(marker)}\n`) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing OKF ownership marker is not canonical JSON.");
  }
  validateMarker(marker, workspace.config.workspaceId, eventFiles.length);
  const existingFiles = new Map([
    ["index.md", await readFile(path.join(outputDirectory, "index.md"), "utf8")],
    ["log.md", await readFile(path.join(outputDirectory, "log.md"), "utf8")]
  ]);
  let totalBytes = Buffer.byteLength(existingFiles.get("index.md")) + Buffer.byteLength(existingFiles.get("log.md"));
  for (const name of eventFiles) {
    const contents = await readFile(path.join(eventDirectory, name), "utf8");
    totalBytes += Buffer.byteLength(contents);
    if (totalBytes > 256 * 1024 * 1024) {
      throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing OKF output exceeds its bounded aggregate size.");
    }
    existingFiles.set(`events/${name}`, contents);
  }
  if (bundleHash(existingFiles) !== marker.bundleHash) {
    throw new QarinahError("OKF_OUTPUT_NOT_OWNED", "Existing OKF output does not match its ownership marker digest.");
  }
  return true;
}

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (attempt >= 19 || !["EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 + attempt * 5));
    }
  }
}

async function replaceOutput(stage, outputDirectory, workspace) {
  const existed = await assertOwnedOutput(outputDirectory, workspace);
  if (!existed) {
    await renameWithRetry(stage, outputDirectory);
    return;
  }
  const parent = path.dirname(outputDirectory);
  const backup = path.join(parent, `.${path.basename(outputDirectory)}.qarinah-okf-backup-${process.pid}-${randomBytes(8).toString("hex")}`);
  resolveWithin(workspace.root, path.relative(workspace.root, backup));
  await renameWithRetry(outputDirectory, backup);
  try {
    await renameWithRetry(stage, outputDirectory);
  } catch (error) {
    try {
      if (!await optionalLstat(outputDirectory)) await renameWithRetry(backup, outputDirectory);
    } catch (rollbackError) {
      throw new QarinahError("OKF_EXPORT_REPLACE_FAILED", "OKF export replacement and rollback both failed.", {
        cause: error.message,
        rollback: rollbackError.message
      });
    }
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

async function writeStage(stage, files) {
  await mkdir(stage, { mode: 0o700 });
  await mkdir(path.join(stage, "events"), { mode: 0o700 });
  for (const [relativePath, contents] of [...files.entries()].sort(([left], [right]) => compareText(left, right))) {
    const segments = relativePath.split("/");
    const destination = path.join(stage, ...segments);
    if (!isWithin(stage, destination)) throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "Generated OKF path escaped its staging directory.");
    await atomicWriteFile(destination, contents);
  }
}

export async function exportOkf(options = {}) {
  const normalized = validateOptions(options);
  const workspace = await loadWorkspace(normalized.cwd ?? process.cwd());
  const outputDirectory = resolveOutputDirectory(workspace, normalized.output);
  const parent = path.dirname(outputDirectory);
  await ensureSafeDirectoryChain(workspace.root, parent);
  await assertOwnedOutput(outputDirectory, workspace);

  const events = await readEvents(workspace.root);
  const { files, manifest } = buildBundle(events, workspace.config.workspaceId);
  const stage = path.join(parent, `.${path.basename(outputDirectory)}.qarinah-okf-stage-${process.pid}-${randomBytes(8).toString("hex")}`);
  resolveWithin(workspace.root, path.relative(workspace.root, stage));
  if (await optionalLstat(stage)) throw new QarinahError("OKF_OUTPUT_INVALID", "Generated OKF staging path already exists.");
  try {
    await writeStage(stage, files);
    await replaceOutput(stage, outputDirectory, workspace);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return Object.freeze({ ...manifest, outputDirectory });
}
