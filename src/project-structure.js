import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import ignore from "ignore";
import { reviewMetadataEventInput } from "./capture-policy.js";
import { canonicalStringify, sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { appendEvent, readEvents } from "./store.js";
import { loadWorkspace } from "./workspace.js";

export const PROJECT_STRUCTURE_SCHEMA_VERSION = "qarinah.project-structure.v1";

const DEFAULT_MAX_FILES = 750;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 24;
const MAX_PATH_CHARS = 512;
const SOURCE_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".java", ".js", ".json", ".jsonc", ".jsx", ".kt", ".md",
  ".mjs", ".py", ".rb", ".rs", ".sh", ".sql", ".svelte", ".toml", ".ts", ".tsx",
  ".vue", ".xml", ".yaml", ".yml"
]);
const SOURCE_FILENAMES = new Set([
  "Dockerfile", "LICENSE", "Makefile", "Procfile", "README", "SECURITY"
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".next", ".nuxt", ".qarinah", ".svelte-kit", ".turbo", ".wrangler",
  "build", "coverage", "dist", "node_modules", "out", "target", "temp", "tmp", "vendor"
]);
const HIDDEN_DIRECTORY_ALLOWLIST = new Set([".github"]);
const RESOLUTION_EXTENSIONS = Object.freeze([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json"]);
const MAX_IGNORE_BYTES = 1024 * 1024;

function boundedInteger(value, fallback, minimum, maximum, label) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return candidate;
}

function scanOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Project structure scan options must be a record.");
  }
  const allowed = new Set(["cwd", "maxFiles", "maxFileBytes", "maxTotalBytes", "maxDepth"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Project structure scan options contain unknown field(s): ${unknown.join(", ")}.`);
  return Object.freeze({
    cwd: options.cwd,
    maxFiles: boundedInteger(options.maxFiles, DEFAULT_MAX_FILES, 1, 5_000, "maxFiles"),
    maxFileBytes: boundedInteger(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES, 1_024, 4 * 1024 * 1024, "maxFileBytes"),
    maxTotalBytes: boundedInteger(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, 1_024, 128 * 1024 * 1024, "maxTotalBytes"),
    maxDepth: boundedInteger(options.maxDepth, DEFAULT_MAX_DEPTH, 1, 64, "maxDepth")
  });
}

function portablePath(root, absolute) {
  const relative = path.relative(root, absolute);
  if (relative === "") return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "Project structure path escaped the trusted workspace root.");
  }
  const portable = relative.split(path.sep).join("/");
  if (portable.length > MAX_PATH_CHARS) {
    throw new QarinahError("PROJECT_PATH_TOO_LONG", `Project path exceeds ${MAX_PATH_CHARS} characters.`);
  }
  return portable;
}

function isCandidateFile(name) {
  return SOURCE_FILENAMES.has(name) || SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function languageFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const languages = {
    ".cjs": "javascript", ".js": "javascript", ".jsx": "javascript",
    ".mjs": "javascript", ".ts": "typescript", ".tsx": "typescript",
    ".md": "markdown", ".json": "json", ".jsonc": "jsonc", ".py": "python",
    ".rs": "rust", ".java": "java", ".kt": "kotlin", ".rb": "ruby",
    ".css": "css", ".html": "html", ".svelte": "svelte", ".vue": "vue",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml", ".sql": "sql",
    ".xml": "xml", ".sh": "shell"
  };
  return languages[extension] ?? "text";
}

function nodeId(type, value) {
  return `project:${type}:${sha256(value).slice("sha256:".length, "sha256:".length + 32)}`;
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function spanAt(text, start, length) {
  const before = text.slice(0, start);
  const lines = before.split("\n");
  return Object.freeze({
    start,
    end: start + length,
    line: lines.length,
    column: lines.at(-1).length + 1
  });
}

function extractedReference(type, specifier, start, text, extractor) {
  return Object.freeze({
    type,
    specifier,
    span: spanAt(text, start, specifier.length),
    confidence: "extracted",
    extractor
  });
}

function sourceReferences(text, language) {
  const references = [];
  const seen = new Set();
  const addMatches = (pattern, type, extractor) => {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      const offset = match.index + match[0].indexOf(specifier);
      const key = `${type}\0${offset}\0${specifier}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push(extractedReference(type, specifier, offset, text, extractor));
      }
    }
  };
  if (["javascript", "typescript"].includes(language)) {
    addMatches(/\b(?:import|export)\s+(?:[^"'\n]*?\s+from\s*)?["']([^"'\n]+)["']/g, "imports", "qarinah.ecmascript-module-lexical.v1");
    addMatches(/\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g, "imports", "qarinah.ecmascript-module-lexical.v1");
    addMatches(/\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g, "imports", "qarinah.ecmascript-module-lexical.v1");
  }
  if (language === "markdown") {
    addMatches(/\[[^\]\n]*\]\((?!https?:|mailto:|#)([^)\s#?]+)(?:[?#][^)]*)?\)/g, "links", "qarinah.markdown-link.v1");
  }
  return references.sort((left, right) => left.span.start - right.span.start || left.specifier.localeCompare(right.specifier));
}

function looksBinary(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_192));
  if (sample.includes(0)) return true;
  let controls = 0;
  for (const value of sample) {
    if (value < 9 || (value > 13 && value < 32)) controls += 1;
  }
  return sample.length > 0 && controls / sample.length > 0.03;
}

function resolveReference(fromPath, specifier, filesByPath) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  if (base === ".." || base.startsWith("../") || path.posix.isAbsolute(base)) return null;
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${base}/index${extension}`);
  }
  return candidates.find((candidate) => filesByPath.has(candidate)) ?? null;
}

async function assertReadableWorkspaceEntry(workspace, absolute) {
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) return null;
  const resolved = await realpath(absolute);
  portablePath(workspace.root, resolved);
  return metadata;
}

async function loadIgnoreMatcher(workspace) {
  const matcher = ignore();
  for (const name of [".gitignore", ".qarinahignore"]) {
    const absolute = path.join(workspace.root, name);
    try {
      const metadata = await assertReadableWorkspaceEntry(workspace, absolute);
      if (!metadata?.isFile() || metadata.size > MAX_IGNORE_BYTES) continue;
      matcher.add(await readFile(absolute, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return matcher;
}

async function collectStructure(workspace, options) {
  const ignoreMatcher = await loadIgnoreMatcher(workspace);
  const directories = [];
  const files = [];
  let totalBytes = 0;

  async function walk(absoluteDirectory, depth) {
    if (depth > options.maxDepth) {
      throw new QarinahError("PROJECT_SCAN_LIMIT", `Project structure exceeds maxDepth ${options.maxDepth}.`);
    }
    const directoryPath = portablePath(workspace.root, absoluteDirectory);
    directories.push(Object.freeze({ id: nodeId("directory", directoryPath), path: directoryPath }));
    const entries = (await readdir(absoluteDirectory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.includes("\0")) continue;
      const absolute = path.join(absoluteDirectory, entry.name);
      const metadata = await assertReadableWorkspaceEntry(workspace, absolute);
      if (!metadata) continue;
      const entryPath = portablePath(workspace.root, absolute);
      if (metadata.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        if (entry.name.startsWith(".") && !HIDDEN_DIRECTORY_ALLOWLIST.has(entry.name)) continue;
        if (ignoreMatcher.ignores(`${entryPath}/`)) continue;
        await walk(absolute, depth + 1);
        continue;
      }
      if (!metadata.isFile() || entry.name.startsWith(".") || ignoreMatcher.ignores(entryPath) || !isCandidateFile(entry.name)) continue;
      if (files.length >= options.maxFiles) {
        throw new QarinahError("PROJECT_SCAN_LIMIT", `Project structure exceeds maxFiles ${options.maxFiles}.`);
      }
      const filePath = entryPath;
      if (metadata.size > options.maxFileBytes) {
        files.push(Object.freeze({
          id: nodeId("file", filePath), path: filePath, language: languageFor(filePath), size: metadata.size,
          contentHash: null, skipped: "oversized", references: []
        }));
        continue;
      }
      if (totalBytes + metadata.size > options.maxTotalBytes) {
        throw new QarinahError("PROJECT_SCAN_LIMIT", `Project structure exceeds maxTotalBytes ${options.maxTotalBytes}.`);
      }
      const bytes = await readFile(absolute);
      totalBytes += bytes.length;
      const contentHash = hashBytes(bytes);
      const language = languageFor(filePath);
      if (looksBinary(bytes)) {
        files.push(Object.freeze({
          id: nodeId("file", filePath), path: filePath, language, size: bytes.length,
          contentHash, skipped: "binary", references: []
        }));
        continue;
      }
      const text = bytes.toString("utf8");
      files.push(Object.freeze({
        id: nodeId("file", filePath), path: filePath, language, size: bytes.length,
        contentHash, skipped: null, references: sourceReferences(text, language)
      }));
    }
  }

  await walk(workspace.root, 0);
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const resolvedFiles = files.map((file) => Object.freeze({
    ...file,
    references: file.references.map((reference) => Object.freeze({
      ...reference,
      target: resolveReference(file.path, reference.specifier, filesByPath)
    }))
  }));
  directories.sort((left, right) => left.path.localeCompare(right.path));
  resolvedFiles.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({ directories, files: resolvedFiles, totalBytes });
}

function structureChanges(previous, current) {
  if (!previous) {
    return Object.freeze({ added: current.files.map((file) => file.path), changed: [], deleted: [], renamed: [] });
  }
  const oldByPath = new Map(previous.files.map((file) => [file.path, file]));
  const newByPath = new Map(current.files.map((file) => [file.path, file]));
  const changed = current.files
    .filter((file) => oldByPath.has(file.path) && oldByPath.get(file.path).contentHash !== file.contentHash)
    .map((file) => file.path);
  const addedCandidates = current.files.filter((file) => !oldByPath.has(file.path));
  const deletedCandidates = previous.files.filter((file) => !newByPath.has(file.path));
  const deletedByHash = new Map();
  for (const file of deletedCandidates) {
    if (!file.contentHash) continue;
    const values = deletedByHash.get(file.contentHash) ?? [];
    values.push(file);
    deletedByHash.set(file.contentHash, values);
  }
  const renamed = [];
  const renamedFrom = new Set();
  const renamedTo = new Set();
  for (const file of addedCandidates) {
    const matches = file.contentHash ? deletedByHash.get(file.contentHash) ?? [] : [];
    if (matches.length !== 1) continue;
    const source = matches[0];
    if (renamedFrom.has(source.path)) continue;
    renamedFrom.add(source.path);
    renamedTo.add(file.path);
    renamed.push(Object.freeze({ from: source.path, to: file.path, contentHash: file.contentHash }));
  }
  return Object.freeze({
    added: addedCandidates.map((file) => file.path).filter((value) => !renamedTo.has(value)).sort(),
    changed: changed.sort(),
    deleted: deletedCandidates.map((file) => file.path).filter((value) => !renamedFrom.has(value)).sort(),
    renamed: renamed.sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`))
  });
}

function latestProjectStructure(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index].data?.projectStructure;
    if (candidate?.schemaVersion === PROJECT_STRUCTURE_SCHEMA_VERSION && Array.isArray(candidate.files)) {
      return { event: events[index], structure: candidate };
    }
  }
  return null;
}

function snapshotBody(structure) {
  const changed = structure.changes;
  const paths = structure.files.slice(0, 200).map((file) => `- ${file.path}`).join("\n");
  return [
    `Observed ${structure.fileCount} files and ${structure.directoryCount} directories.`,
    `Changes: ${changed.added.length} added, ${changed.changed.length} changed, ${changed.deleted.length} deleted, ${changed.renamed.length} renamed.`,
    "",
    "Indexed paths:",
    paths,
    structure.files.length > 200 ? `- [${structure.files.length - 200} additional paths omitted from this searchable summary]` : ""
  ].filter((line, index, values) => line !== "" || values[index - 1] !== "").join("\n");
}

export async function scanProjectStructure(rawOptions = {}) {
  const options = scanOptions(rawOptions);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace);
  const previous = latestProjectStructure(events);
  const collected = await collectStructure(workspace, options);
  const core = {
    schemaVersion: PROJECT_STRUCTURE_SCHEMA_VERSION,
    adapter: Object.freeze({ id: "qarinah.project-structure", version: "1" }),
    root: ".",
    limits: Object.freeze({
      maxFiles: options.maxFiles,
      maxFileBytes: options.maxFileBytes,
      maxTotalBytes: options.maxTotalBytes,
      maxDepth: options.maxDepth
    }),
    directoryCount: collected.directories.length,
    fileCount: collected.files.length,
    totalBytes: collected.totalBytes,
    directories: collected.directories,
    files: collected.files
  };
  const snapshotHash = sha256(canonicalStringify(core));
  if (previous?.structure.snapshotHash === snapshotHash) {
    return Object.freeze({
      captured: false,
      unchanged: true,
      eventId: previous.event.eventId,
      snapshotHash,
      fileCount: core.fileCount,
      directoryCount: core.directoryCount
    });
  }
  const projectStructure = Object.freeze({
    ...core,
    snapshotHash,
    changes: structureChanges(previous?.structure ?? null, core)
  });
  const payload = {
    kind: "artifact",
    actor: { type: "tool", id: "qarinah-project-structure" },
    title: "Project structure snapshot",
    body: workspace.config.capture === "content" ? snapshotBody(projectStructure) : "",
    data: { projectStructure },
    confidence: "extracted",
    relations: previous ? [{ type: "supersedes", target: previous.event.eventId }] : [],
    provenance: { adapter: "qarinah-project-structure", sourceId: snapshotHash },
    retention: { class: "project", expiresAt: null }
  };
  const eventInput = workspace.config.capture === "metadata" ? reviewMetadataEventInput(payload) : payload;
  const event = await appendEvent(eventInput, { workspace, capture: workspace.config.capture });
  return Object.freeze({
    captured: true,
    unchanged: false,
    eventId: event.eventId,
    hash: event.hash,
    snapshotHash,
    fileCount: core.fileCount,
    directoryCount: core.directoryCount,
    changes: projectStructure.changes
  });
}
