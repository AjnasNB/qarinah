import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants as zlibConstants } from "node:zlib";
import ignore from "ignore";
import { throwIfAborted, validateAbortSignal } from "./abort.js";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { QarinahError } from "./errors.js";
import { rebuildDerivedState } from "./indexer.js";
import { appendEvent } from "./store.js";
import { atomicWriteFile, loadWorkspace, resolveWithin, secureStoragePath } from "./workspace.js";

export const CONTENT_ARCHIVE_SCHEMA_VERSION = "qarinah.content-archive.v1";
export const CONTENT_ARCHIVE_KEY_SCHEMA_VERSION = "qarinah.content-archive-key.v1";
const OBJECT_MAGIC = Buffer.from("QAR1", "ascii");
const OBJECT_HEADER_BYTES = 4 + 1 + 12 + 16;
const CODEC_IDENTITY = 0;
const CODEC_BROTLI = 1;
const compressBrotli = promisify(brotliCompress);
const decompressBrotli = promisify(brotliDecompress);
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_KEY_BYTES = 16 * 1024;
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 10_000,
  maxFileBytes: 128 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  minChunkBytes: 16 * 1024,
  averageChunkBytes: 64 * 1024,
  maxChunkBytes: 256 * 1024
});
const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".qarinah", ".next", ".nuxt", ".svelte-kit", ".turbo", ".wrangler",
  "build", "coverage", "dist", "node_modules", "out", "target", "temp", "tmp", "vendor"
]);
const SECRET_FILE_PATTERNS = Object.freeze([
  /^\.env(?:\.|$)/iu,
  /^\.npmrc$/iu,
  /^\.pypirc$/iu,
  /^credentials?(?:\.|$)/iu,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/iu,
  /\.(?:key|pem|p12|pfx|jks)$/iu,
  /(?:^|[-_.])secrets?(?:[-_.]|$)/iu
]);

const GEAR = (() => {
  let state = 0x9e3779b9;
  return Uint32Array.from({ length: 256 }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  });
})();

function boundedInteger(value, fallback, minimum, maximum, label) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return candidate;
}

function normalizeLimits(options = {}) {
  const limits = {
    maxFiles: boundedInteger(options.maxFiles, DEFAULT_LIMITS.maxFiles, 1, 100_000, "maxFiles"),
    maxFileBytes: boundedInteger(options.maxFileBytes, DEFAULT_LIMITS.maxFileBytes, 1_024, 1024 * 1024 * 1024, "maxFileBytes"),
    maxTotalBytes: boundedInteger(options.maxTotalBytes, DEFAULT_LIMITS.maxTotalBytes, 1_024, 8 * 1024 * 1024 * 1024, "maxTotalBytes"),
    minChunkBytes: boundedInteger(options.minChunkBytes, DEFAULT_LIMITS.minChunkBytes, 4 * 1024, 1024 * 1024, "minChunkBytes"),
    averageChunkBytes: boundedInteger(options.averageChunkBytes, DEFAULT_LIMITS.averageChunkBytes, 8 * 1024, 4 * 1024 * 1024, "averageChunkBytes"),
    maxChunkBytes: boundedInteger(options.maxChunkBytes, DEFAULT_LIMITS.maxChunkBytes, 16 * 1024, 16 * 1024 * 1024, "maxChunkBytes")
  };
  if (limits.minChunkBytes > limits.averageChunkBytes || limits.averageChunkBytes > limits.maxChunkBytes) {
    throw new TypeError("Chunk limits must satisfy minChunkBytes <= averageChunkBytes <= maxChunkBytes.");
  }
  if ((limits.averageChunkBytes & (limits.averageChunkBytes - 1)) !== 0) {
    throw new TypeError("averageChunkBytes must be a power of two.");
  }
  return Object.freeze(limits);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function portablePath(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new QarinahError("ARCHIVE_PATH_INVALID", "Archive files must have a non-empty path inside the selected source.");
  }
  const portable = relative.split(path.sep).join("/");
  if (portable.length > 1_024 || portable.includes("\0") || path.posix.normalize(portable) !== portable) {
    throw new QarinahError("ARCHIVE_PATH_INVALID", "Archive path is not a bounded portable path.");
  }
  return portable;
}

function secretFilename(filePath) {
  const name = path.basename(filePath);
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

async function exists(candidate) {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureArchiveDirectory(workspace, segments) {
  let current = workspace.qarinahDir;
  for (const segment of segments) {
    current = resolveWithin(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current, { mode: 0o700 });
      metadata = await lstat(current);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new QarinahError("STORAGE_LINK_REJECTED", `.qarinah/${segments.join("/")} must contain only real directories.`);
    }
    const actual = await realpath(current);
    if (!isWithin(workspace.qarinahDir, actual)) {
      throw new QarinahError("PATH_OUTSIDE_WORKSPACE", "Archive storage escaped the Qarinah workspace.");
    }
  }
  return current;
}

async function loadIgnoreMatcher(workspace) {
  const matcher = ignore();
  for (const filename of [".gitignore", ".qarinahignore"]) {
    const candidate = path.join(workspace.root, filename);
    try {
      const metadata = await lstat(candidate);
      if (!metadata.isSymbolicLink() && metadata.isFile() && metadata.size <= 1024 * 1024) {
        matcher.add(await readFile(candidate, "utf8"));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return matcher;
}

async function collectSourceFiles(workspace, source, limits, signal) {
  const requested = path.resolve(workspace.root, source);
  const actual = await realpath(requested);
  if (!isWithin(workspace.root, actual) || isWithin(workspace.qarinahDir, actual)) {
    throw new QarinahError("ARCHIVE_PATH_INVALID", "Content archives accept only paths inside the workspace and outside .qarinah.");
  }
  const rootMetadata = await lstat(requested);
  if (rootMetadata.isSymbolicLink()) throw new QarinahError("ARCHIVE_LINK_REJECTED", "Archive source cannot be a symbolic link or junction.");
  const matcher = await loadIgnoreMatcher(workspace);
  const sourceRoot = rootMetadata.isDirectory() ? actual : path.dirname(actual);
  const files = [];
  const skipped = [];
  let totalBytes = 0;

  async function addFile(candidate) {
    throwIfAborted(signal);
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
      skipped.push(Object.freeze({ path: portablePath(sourceRoot, candidate), reason: "linked-or-non-regular" }));
      return;
    }
    const relativeToWorkspace = path.relative(workspace.root, candidate).split(path.sep).join("/");
    const relative = portablePath(sourceRoot, candidate);
    if (matcher.ignores(relativeToWorkspace) || secretFilename(relative)) {
      skipped.push(Object.freeze({ path: relative, reason: secretFilename(relative) ? "secret-filename" : "ignored" }));
      return;
    }
    if (metadata.size > limits.maxFileBytes) throw new QarinahError("ARCHIVE_LIMIT", `${relative} exceeds maxFileBytes.`);
    if (files.length >= limits.maxFiles) throw new QarinahError("ARCHIVE_LIMIT", `Archive exceeds maxFiles ${limits.maxFiles}.`);
    if (totalBytes + metadata.size > limits.maxTotalBytes) throw new QarinahError("ARCHIVE_LIMIT", `Archive exceeds maxTotalBytes ${limits.maxTotalBytes}.`);
    totalBytes += metadata.size;
    files.push(Object.freeze({ absolute: candidate, path: relative, size: metadata.size }));
  }

  async function walk(directory) {
    throwIfAborted(signal);
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      const entryMetadata = await lstat(candidate);
      if (entryMetadata.isSymbolicLink()) {
        skipped.push(Object.freeze({ path: portablePath(sourceRoot, candidate), reason: "linked-or-non-regular" }));
        continue;
      }
      if (entryMetadata.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        const relativeToWorkspace = path.relative(workspace.root, candidate).split(path.sep).join("/");
        if (!matcher.ignores(`${relativeToWorkspace}/`)) await walk(candidate);
      } else if (entryMetadata.isFile()) {
        await addFile(candidate);
      }
    }
  }

  if (rootMetadata.isDirectory()) await walk(actual);
  else await addFile(actual);
  files.sort((left, right) => left.path.localeCompare(right.path));
  skipped.sort((left, right) => `${left.path}\0${left.reason}`.localeCompare(`${right.path}\0${right.reason}`));
  return Object.freeze({ root: actual, files, skipped, totalBytes });
}

function contentDefinedChunks(bytes, limits) {
  if (bytes.length === 0) return [Buffer.alloc(0)];
  const chunks = [];
  const mask = limits.averageChunkBytes - 1;
  let start = 0;
  let fingerprint = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    fingerprint = ((fingerprint << 1) + GEAR[bytes[index]]) >>> 0;
    const length = index + 1 - start;
    if (length >= limits.minChunkBytes && ((fingerprint & mask) === 0 || length >= limits.maxChunkBytes)) {
      chunks.push(bytes.subarray(start, index + 1));
      start = index + 1;
      fingerprint = 0;
    }
  }
  if (start < bytes.length) chunks.push(bytes.subarray(start));
  return chunks;
}

async function compressChunk(bytes) {
  if (bytes.length === 0) return Object.freeze({ codec: "identity-v1", code: CODEC_IDENTITY, bytes });
  const compressed = await compressBrotli(bytes, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 7,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC
    }
  });
  return compressed.length + 16 < bytes.length
    ? Object.freeze({ codec: "brotli-v1", code: CODEC_BROTLI, bytes: compressed })
    : Object.freeze({ codec: "identity-v1", code: CODEC_IDENTITY, bytes });
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function rawDigest(value) {
  return Buffer.from(value.slice("sha256:".length), "hex");
}

function keyId(key) {
  return `key_${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function safeInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validHash(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function validCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validPortableManifestPath(value, allowDot = false) {
  if (allowDot && value === ".") return true;
  return typeof value === "string" && value.length > 0 && value.length <= 1_024
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && path.posix.normalize(value) === value && !value.split("/").includes("..");
}

function parseVaultKeyRecord(parsed) {
  const key = Buffer.from(parsed?.key ?? "", "base64");
  if (!exactKeys(parsed, ["schemaVersion", "algorithm", "keyId", "key", "createdAt", "storage"])
    || parsed.schemaVersion !== CONTENT_ARCHIVE_KEY_SCHEMA_VERSION || parsed.algorithm !== "AES-256-GCM"
    || parsed.storage !== "workspace-local" || !validCanonicalTimestamp(parsed.createdAt)
    || key.length !== 32 || parsed.keyId !== keyId(key)) {
    throw new QarinahError("ARCHIVE_KEY_INVALID", "Archive key record failed validation.");
  }
  return Object.freeze({ key, keyId: parsed.keyId, storage: parsed.storage });
}

async function loadOrCreateVaultKey(workspace) {
  await ensureArchiveDirectory(workspace, ["archive"]);
  const candidate = await secureStoragePath(workspace, ["archive", "key.json"], { type: "file", allowMissing: true });
  if (await exists(candidate)) {
    const metadata = await stat(candidate);
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_KEY_BYTES) {
      throw new QarinahError("ARCHIVE_KEY_INVALID", "Archive key record is not a bounded regular file.");
    }
    return parseVaultKeyRecord(JSON.parse(await readFile(candidate, "utf8")));
  }
  const key = randomBytes(32);
  const record = {
    schemaVersion: CONTENT_ARCHIVE_KEY_SCHEMA_VERSION,
    algorithm: "AES-256-GCM",
    keyId: keyId(key),
    key: key.toString("base64"),
    createdAt: new Date().toISOString(),
    storage: "workspace-local"
  };
  await atomicWriteFile(candidate, `${canonicalStringify(record)}\n`);
  return Object.freeze({ key, keyId: record.keyId, storage: "workspace-local" });
}

function encryptObject(compressed, plaintextHash, key) {
  const nonce = createHmac("sha256", key).update("qarinah.content-archive.v1\0").update(rawDigest(plaintextHash)).digest().subarray(0, 12);
  const aad = Buffer.concat([OBJECT_MAGIC, Buffer.from([compressed.code]), rawDigest(plaintextHash)]);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(compressed.bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([OBJECT_MAGIC, Buffer.from([compressed.code]), nonce, tag, ciphertext]);
}

async function decryptObject(payload, plaintextHash, key) {
  if (payload.length < OBJECT_HEADER_BYTES || !payload.subarray(0, 4).equals(OBJECT_MAGIC)) {
    throw new QarinahError("ARCHIVE_OBJECT_INVALID", "Archive object has an invalid header.");
  }
  const code = payload[4];
  if (![CODEC_IDENTITY, CODEC_BROTLI].includes(code)) throw new QarinahError("ARCHIVE_OBJECT_INVALID", "Archive object uses an unsupported codec.");
  const nonce = payload.subarray(5, 17);
  const expectedNonce = createHmac("sha256", key).update("qarinah.content-archive.v1\0").update(rawDigest(plaintextHash)).digest().subarray(0, 12);
  if (!nonce.equals(expectedNonce)) throw new QarinahError("ARCHIVE_OBJECT_INVALID", "Archive object nonce does not match its content identity.");
  const tag = payload.subarray(17, 33);
  const ciphertext = payload.subarray(33);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.concat([OBJECT_MAGIC, Buffer.from([code]), rawDigest(plaintextHash)]));
  decipher.setAuthTag(tag);
  let compressed;
  try {
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new QarinahError("ARCHIVE_OBJECT_INVALID", "Archive object authentication failed.", { cause: error.message });
  }
  return code === CODEC_BROTLI ? decompressBrotli(compressed) : compressed;
}

function objectId(plaintextHash) {
  return `obj_${plaintextHash.slice("sha256:".length)}`;
}

async function writeObject(workspace, object, payload, archiveKeyId) {
  if (!/^key_[0-9a-f]{32}$/u.test(archiveKeyId)) throw new TypeError("archiveKeyId is invalid.");
  const objectsDirectory = await ensureArchiveDirectory(workspace, ["archive", "objects", archiveKeyId]);
  const candidate = resolveWithin(objectsDirectory, `${object.objectId}.qar`);
  try {
    const handle = await open(candidate, "wx", 0o600);
    try {
      await handle.writeFile(payload);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
      throw new QarinahError("STORAGE_LINK_REJECTED", "Existing archive object is not a singly linked regular file.");
    }
    return false;
  }
}

async function readVaultKey(workspace) {
  const candidate = await secureStoragePath(workspace, ["archive", "key.json"], { type: "file" });
  const metadata = await stat(candidate);
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_KEY_BYTES) {
    throw new QarinahError("ARCHIVE_KEY_INVALID", "Archive key record is not a bounded regular file.");
  }
  const parsed = JSON.parse(await readFile(candidate, "utf8"));
  return parseVaultKeyRecord(parsed);
}

function validateManifest(manifest, workspaceId) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || !exactKeys(manifest, ["schemaVersion", "workspaceId", "createdAt", "label", "source", "chunking", "encryption", "limits", "files", "skipped", "totals", "archiveId", "manifestHash"])
    || manifest.schemaVersion !== CONTENT_ARCHIVE_SCHEMA_VERSION
    || manifest.workspaceId !== workspaceId
    || !/^archive_[0-9a-f]{64}$/u.test(manifest.archiveId)
    || !validHash(manifest.manifestHash)
    || !validCanonicalTimestamp(manifest.createdAt)
    || typeof manifest.label !== "string" || manifest.label.length < 1 || manifest.label.length > 160
    || !exactKeys(manifest.source, ["path"]) || !validPortableManifestPath(manifest.source.path, true)
    || !exactKeys(manifest.chunking, ["algorithm", "minBytes", "averageBytes", "maxBytes"])
    || manifest.chunking.algorithm !== "qarinah-gear-content-defined-v1"
    || manifest.encryption?.algorithm !== "AES-256-GCM"
    || !exactKeys(manifest.encryption, ["algorithm", "keyId", "keyStorage"])
    || !/^key_[0-9a-f]{32}$/u.test(manifest.encryption?.keyId)
    || manifest.encryption.keyStorage !== "workspace-local"
    || !exactKeys(manifest.limits, ["maxFiles", "maxFileBytes", "maxTotalBytes", "minChunkBytes", "averageChunkBytes", "maxChunkBytes"])
    || !exactKeys(manifest.totals, ["fileCount", "sourceBytes", "chunkCount", "uniqueObjectCount", "uniqueObjectBytes", "reusedObjectCount"])
    || !Array.isArray(manifest.files) || !Array.isArray(manifest.skipped)) {
    throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive manifest failed its identity or shape checks.");
  }
  try {
    normalizeLimits(manifest.limits);
  } catch (error) {
    throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive contains invalid resource or chunk limits.", { cause: error.message });
  }
  if (manifest.chunking.minBytes !== manifest.limits.minChunkBytes
    || manifest.chunking.averageBytes !== manifest.limits.averageChunkBytes
    || manifest.chunking.maxBytes !== manifest.limits.maxChunkBytes) {
    throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive chunking and limit records disagree.");
  }
  let sourceBytes = 0;
  let chunkCount = 0;
  const objectIds = new Set();
  const filePaths = new Set();
  for (const file of manifest.files) {
    if (!exactKeys(file, ["path", "size", "contentHash", "chunks"])
      || !validPortableManifestPath(file.path) || filePaths.has(file.path)
      || !safeInteger(file.size, 0, manifest.limits.maxFileBytes) || !validHash(file.contentHash)
      || !Array.isArray(file.chunks) || file.chunks.length < 1) {
      throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive contains an invalid file descriptor.");
    }
    filePaths.add(file.path);
    let expectedOffset = 0;
    for (const chunk of file.chunks) {
      if (!exactKeys(chunk, ["objectId", "plaintextHash", "offset", "length", "storedBytes", "codec"])
        || !/^obj_[0-9a-f]{64}$/u.test(chunk.objectId) || !validHash(chunk.plaintextHash)
        || chunk.objectId !== objectId(chunk.plaintextHash)
        || !safeInteger(chunk.offset) || chunk.offset !== expectedOffset
        || !safeInteger(chunk.length, 0, manifest.limits.maxChunkBytes)
        || !safeInteger(chunk.storedBytes, OBJECT_HEADER_BYTES)
        || !["identity-v1", "brotli-v1"].includes(chunk.codec)) {
        throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive contains an invalid chunk descriptor.");
      }
      expectedOffset += chunk.length;
      chunkCount += 1;
      objectIds.add(chunk.objectId);
    }
    if (expectedOffset !== file.size) throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Archive chunk offsets do not reconstruct the declared file size.");
    sourceBytes += file.size;
  }
  const skippedPaths = new Set();
  for (const skipped of manifest.skipped) {
    if (!exactKeys(skipped, ["path", "reason"]) || !validPortableManifestPath(skipped.path)
      || skippedPaths.has(skipped.path) || !["ignored", "secret-filename", "linked-or-non-regular"].includes(skipped.reason)) {
      throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive contains an invalid skipped-file descriptor.");
    }
    skippedPaths.add(skipped.path);
  }
  if (manifest.files.length < 1 || manifest.files.length > manifest.limits.maxFiles
    || manifest.totals.fileCount !== manifest.files.length
    || manifest.totals.sourceBytes !== sourceBytes || sourceBytes > manifest.limits.maxTotalBytes
    || manifest.totals.chunkCount !== chunkCount
    || manifest.totals.uniqueObjectCount !== objectIds.size
    || !safeInteger(manifest.totals.uniqueObjectBytes)
    || !safeInteger(manifest.totals.reusedObjectCount, Math.max(0, chunkCount - objectIds.size), chunkCount)) {
    throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive totals do not match its file and chunk descriptors.");
  }
  const { manifestHash, archiveId, ...core } = manifest;
  const expectedHash = sha256(canonicalStringify(core));
  if (manifestHash !== expectedHash || archiveId !== `archive_${expectedHash.slice("sha256:".length)}`) {
    throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive manifest hash does not match its contents.");
  }
  return deepFreezeJson(manifest);
}

async function readManifest(workspace, archiveId) {
  if (!/^archive_[0-9a-f]{64}$/u.test(archiveId)) throw new TypeError("archiveId is invalid.");
  const candidate = await secureStoragePath(workspace, ["archive", "manifests", `${archiveId}.json`], { type: "file" });
  const metadata = await stat(candidate);
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_MANIFEST_BYTES) {
    throw new QarinahError("ARCHIVE_MANIFEST_INVALID", "Content archive manifest is not a bounded regular file.");
  }
  return validateManifest(JSON.parse(await readFile(candidate, "utf8")), workspace.config.workspaceId);
}

async function readArchiveObject(workspace, chunk, key, archiveKeyId) {
  const candidate = await secureStoragePath(workspace, ["archive", "objects", archiveKeyId, `${chunk.objectId}.qar`], { type: "file" });
  const metadata = await stat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink?.() || metadata.nlink !== 1 || metadata.size !== chunk.storedBytes) {
    throw new QarinahError("ARCHIVE_OBJECT_INVALID", `Archive object ${chunk.objectId} has changed.`);
  }
  const plaintext = await decryptObject(await readFile(candidate), chunk.plaintextHash, key);
  if (plaintext.length !== chunk.length || digestBytes(plaintext) !== chunk.plaintextHash || objectId(chunk.plaintextHash) !== chunk.objectId) {
    throw new QarinahError("ARCHIVE_OBJECT_INVALID", `Archive object ${chunk.objectId} failed content verification.`);
  }
  return plaintext;
}

export async function createContentArchive(source = ".", options = {}) {
  const allowed = new Set([
    "cwd", "label", "maxFiles", "maxFileBytes", "maxTotalBytes", "minChunkBytes",
    "averageChunkBytes", "maxChunkBytes", "signal", "clock"
  ]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Content archive options contain unknown field(s): ${unknown.join(", ")}.`);
  const signal = validateAbortSignal(options.signal);
  throwIfAborted(signal);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  if (workspace.config.capture !== "content") {
    throw new QarinahError("ARCHIVE_CONTENT_NOT_AUTHORIZED", "Lossless content archives require a workspace initialized with --capture content.");
  }
  const limits = normalizeLimits(options);
  const collected = await collectSourceFiles(workspace, source, limits, signal);
  if (collected.files.length === 0) throw new QarinahError("ARCHIVE_EMPTY", "No permitted regular files were selected for the content archive.");
  const vault = await loadOrCreateVaultKey(workspace);
  const files = [];
  const seenObjects = new Set();
  let chunkCount = 0;
  let uniqueObjectBytes = 0;
  let reusedObjectCount = 0;
  for (const file of collected.files) {
    throwIfAborted(signal);
    const bytes = await readFile(file.absolute);
    if (bytes.length !== file.size) throw new QarinahError("ARCHIVE_SOURCE_CHANGED", `${file.path} changed during archival.`);
    const chunks = [];
    let offset = 0;
    for (const bytesPart of contentDefinedChunks(bytes, limits)) {
      throwIfAborted(signal);
      const plaintextHash = digestBytes(bytesPart);
      const compressed = await compressChunk(bytesPart);
      const payload = encryptObject(compressed, plaintextHash, vault.key);
      const descriptor = Object.freeze({
        objectId: objectId(plaintextHash),
        plaintextHash,
        offset,
        length: bytesPart.length,
        storedBytes: payload.length,
        codec: compressed.codec
      });
      const created = await writeObject(workspace, descriptor, payload, vault.keyId);
      if (created && !seenObjects.has(descriptor.objectId)) uniqueObjectBytes += payload.length;
      if (!created) reusedObjectCount += 1;
      seenObjects.add(descriptor.objectId);
      chunks.push(descriptor);
      offset += bytesPart.length;
      chunkCount += 1;
    }
    files.push(Object.freeze({
      path: file.path,
      size: bytes.length,
      contentHash: digestBytes(bytes),
      chunks
    }));
  }
  const createdAt = (options.clock?.() ?? new Date()).toISOString();
  const core = {
    schemaVersion: CONTENT_ARCHIVE_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    createdAt,
    label: typeof options.label === "string" && options.label.trim() ? options.label.trim().slice(0, 160) : path.basename(collected.root),
    source: { path: path.relative(workspace.root, collected.root).split(path.sep).join("/") || "." },
    chunking: {
      algorithm: "qarinah-gear-content-defined-v1",
      minBytes: limits.minChunkBytes,
      averageBytes: limits.averageChunkBytes,
      maxBytes: limits.maxChunkBytes
    },
    encryption: { algorithm: "AES-256-GCM", keyId: vault.keyId, keyStorage: vault.storage },
    limits,
    files,
    skipped: collected.skipped,
    totals: {
      fileCount: files.length,
      sourceBytes: files.reduce((total, file) => total + file.size, 0),
      chunkCount,
      uniqueObjectCount: seenObjects.size,
      uniqueObjectBytes,
      reusedObjectCount
    }
  };
  const manifestHash = sha256(canonicalStringify(core));
  const manifest = deepFreezeJson({
    ...core,
    archiveId: `archive_${manifestHash.slice("sha256:".length)}`,
    manifestHash
  });
  await ensureArchiveDirectory(workspace, ["archive", "manifests"]);
  const manifestPath = await secureStoragePath(workspace, ["archive", "manifests", `${manifest.archiveId}.json`], { type: "file", allowMissing: true });
  await atomicWriteFile(manifestPath, `${canonicalStringify(manifest)}\n`);
  try {
    await appendEvent({
      kind: "artifact",
      title: `Created lossless content archive ${manifest.label}`,
      body: "",
      data: {
        contentArchive: {
          schemaVersion: CONTENT_ARCHIVE_SCHEMA_VERSION,
          archiveId: manifest.archiveId,
          manifestHash,
          fileCount: manifest.totals.fileCount,
          sourceBytes: manifest.totals.sourceBytes,
          chunkCount: manifest.totals.chunkCount,
          uniqueObjectCount: manifest.totals.uniqueObjectCount,
          skippedCount: manifest.skipped.length
        }
      },
      actor: { type: "tool", id: "qarinah-content-archive" },
      confidence: "verified",
      provenance: { adapter: "qarinah-content-archive", sourceId: manifestHash },
      retention: { class: workspace.config.retentionClass, expiresAt: null }
    }, { workspace, capture: "content", signal });
    await rebuildDerivedState(workspace.root, { signal });
  } catch (error) {
    await rm(manifestPath, { force: true });
    throw error;
  }
  return manifest;
}

export async function verifyContentArchive(archiveId, options = {}) {
  const signal = validateAbortSignal(options.signal);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const manifest = await readManifest(workspace, archiveId);
  const vault = await readVaultKey(workspace);
  if (vault.keyId !== manifest.encryption.keyId) throw new QarinahError("ARCHIVE_KEY_INVALID", "Archive manifest refers to another vault key.");
  let sourceBytes = 0;
  let chunkCount = 0;
  const verifiedObjects = new Set();
  for (const file of manifest.files) {
    throwIfAborted(signal);
    const hash = createHash("sha256");
    let fileBytes = 0;
    for (const chunk of file.chunks) {
      const plaintext = await readArchiveObject(workspace, chunk, vault.key, manifest.encryption.keyId);
      hash.update(plaintext);
      fileBytes += plaintext.length;
      chunkCount += 1;
      verifiedObjects.add(chunk.objectId);
    }
    if (fileBytes !== file.size || `sha256:${hash.digest("hex")}` !== file.contentHash) {
      throw new QarinahError("ARCHIVE_FILE_INVALID", `${file.path} failed archive reconstruction verification.`);
    }
    sourceBytes += fileBytes;
  }
  return deepFreezeJson({
    ok: true,
    schemaVersion: CONTENT_ARCHIVE_SCHEMA_VERSION,
    archiveId,
    manifestHash: manifest.manifestHash,
    fileCount: manifest.files.length,
    sourceBytes,
    chunkCount,
    verifiedObjectCount: verifiedObjects.size,
    keyId: vault.keyId
  });
}

async function ensureRestoreParent(root, relative) {
  const segments = relative.split("/");
  segments.pop();
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new QarinahError("ARCHIVE_RESTORE_PATH", "Restore parent is not a real directory.");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current, { mode: 0o700 });
    }
    const actual = await realpath(current);
    if (!isWithin(root, actual)) throw new QarinahError("ARCHIVE_RESTORE_PATH", "Restore path escaped the destination.");
  }
}

export async function restoreContentArchive(archiveId, destination, options = {}) {
  if (typeof destination !== "string" || destination.trim() === "") throw new TypeError("destination is required.");
  const signal = validateAbortSignal(options.signal);
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const manifest = await readManifest(workspace, archiveId);
  const vault = await readVaultKey(workspace);
  if (vault.keyId !== manifest.encryption.keyId) throw new QarinahError("ARCHIVE_KEY_INVALID", "Archive manifest refers to another vault key.");
  const requestedRoot = path.resolve(destination);
  await mkdir(requestedRoot, { recursive: true, mode: 0o700 });
  const root = await realpath(requestedRoot);
  const restored = [];
  for (const file of manifest.files) {
    throwIfAborted(signal);
    await ensureRestoreParent(root, file.path);
    const output = path.resolve(root, ...file.path.split("/"));
    if (!isWithin(root, output)) throw new QarinahError("ARCHIVE_RESTORE_PATH", "Restore file escaped the destination.");
    const handle = await open(output, options.overwrite === true ? "w" : "wx", 0o600);
    try {
      const hash = createHash("sha256");
      let size = 0;
      for (const chunk of file.chunks) {
        const plaintext = await readArchiveObject(workspace, chunk, vault.key, manifest.encryption.keyId);
        await handle.write(plaintext);
        hash.update(plaintext);
        size += plaintext.length;
      }
      await handle.sync();
      if (size !== file.size || `sha256:${hash.digest("hex")}` !== file.contentHash) {
        throw new QarinahError("ARCHIVE_FILE_INVALID", `${file.path} failed restore verification.`);
      }
    } catch (error) {
      await handle.close();
      await rm(output, { force: true });
      throw error;
    }
    await handle.close();
    restored.push(file.path);
  }
  return deepFreezeJson({ ok: true, archiveId, destination: root, restored });
}

export async function listContentArchives(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const directory = await secureStoragePath(workspace, ["archive", "manifests"], { type: "directory", allowMissing: true });
  if (!(await exists(directory))) return Object.freeze([]);
  const entries = await readdir(directory, { withFileTypes: true });
  const archives = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !/^archive_[0-9a-f]{64}\.json$/u.test(entry.name)) continue;
    archives.push(await readManifest(workspace, entry.name.slice(0, -5)));
  }
  return deepFreezeJson(archives);
}

export async function deleteContentArchive(archiveId, options = {}) {
  if (options.confirmArchiveId !== archiveId) throw new QarinahError("ARCHIVE_DELETE_CONFIRMATION", "confirmArchiveId must exactly match the archive being deleted.");
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const manifest = await readManifest(workspace, archiveId);
  const candidate = await secureStoragePath(workspace, ["archive", "manifests", `${archiveId}.json`], { type: "file" });
  await rm(candidate, { force: false });
  await appendEvent({
    kind: "artifact",
    title: `Deleted content archive manifest ${archiveId}`,
    body: "",
    data: { contentArchiveDeletion: { schemaVersion: "qarinah.content-archive-deletion.v1", archiveId, manifestHash: manifest.manifestHash } },
    actor: { type: "tool", id: "qarinah-content-archive" },
    confidence: "verified",
    provenance: { adapter: "qarinah-content-archive", sourceId: manifest.manifestHash },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  }, { workspace, capture: workspace.config.capture });
  await rebuildDerivedState(workspace.root);
  return Object.freeze({ ok: true, archiveId, manifestDeleted: true, objectsRetainedUntilGarbageCollection: true });
}

export async function garbageCollectContentArchive(options = {}) {
  if (options.confirmWorkspaceId === undefined) throw new QarinahError("ARCHIVE_GC_CONFIRMATION", "confirmWorkspaceId is required for archive garbage collection.");
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  if (options.confirmWorkspaceId !== workspace.config.workspaceId) throw new QarinahError("ARCHIVE_GC_CONFIRMATION", "confirmWorkspaceId does not match this workspace.");
  const manifests = await listContentArchives({ cwd: workspace.root });
  const retained = new Set(manifests.flatMap((manifest) => manifest.files.flatMap((file) => (
    file.chunks.map((chunk) => `${manifest.encryption.keyId}/${chunk.objectId}`)
  ))));
  const directory = await secureStoragePath(workspace, ["archive", "objects"], { type: "directory", allowMissing: true });
  if (!(await exists(directory))) return Object.freeze({ ok: true, removed: [], retained: retained.size });
  const removed = [];
  for (const keyEntry of await readdir(directory, { withFileTypes: true })) {
    if (!keyEntry.isDirectory() || !/^key_[0-9a-f]{32}$/u.test(keyEntry.name)) continue;
    const keyDirectory = resolveWithin(directory, keyEntry.name);
    const keyMetadata = await lstat(keyDirectory);
    if (keyMetadata.isSymbolicLink() || !keyMetadata.isDirectory()) throw new QarinahError("STORAGE_LINK_REJECTED", "Archive garbage collection encountered a linked key directory.");
    for (const entry of await readdir(keyDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^obj_[0-9a-f]{64}\.qar$/u.test(entry.name)) continue;
      const id = entry.name.slice(0, -4);
      const scopedId = `${keyEntry.name}/${id}`;
      if (retained.has(scopedId)) continue;
      const candidate = resolveWithin(keyDirectory, entry.name);
      const metadata = await lstat(candidate);
      if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new QarinahError("STORAGE_LINK_REJECTED", "Archive garbage collection encountered a linked object.");
      await rm(candidate);
      removed.push(scopedId);
    }
  }
  removed.sort();
  return deepFreezeJson({ ok: true, removed, retained: retained.size });
}

export async function cryptographicallyEraseContentArchiveVault(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  if (options.confirmWorkspaceId !== workspace.config.workspaceId) {
    throw new QarinahError("ARCHIVE_ERASE_CONFIRMATION", "confirmWorkspaceId must exactly match the workspace whose archive key will be destroyed.");
  }
  const keyPath = await secureStoragePath(workspace, ["archive", "key.json"], { type: "file" });
  const { keyId: destroyedKeyId } = await readVaultKey(workspace);
  await rm(keyPath);
  await appendEvent({
    kind: "artifact",
    title: "Destroyed the local content-archive vault key",
    body: "",
    data: {
      contentArchiveErasure: {
        schemaVersion: "qarinah.content-archive-erasure.v1",
        destroyedKeyId,
        scope: "qarinah-managed local archive objects",
        backupCaveat: "Copies of the key or plaintext outside this workspace are not erased."
      }
    },
    actor: { type: "tool", id: "qarinah-content-archive" },
    confidence: "verified",
    provenance: { adapter: "qarinah-content-archive", sourceId: destroyedKeyId },
    retention: { class: workspace.config.retentionClass, expiresAt: null }
  }, { workspace, capture: workspace.config.capture });
  await rebuildDerivedState(workspace.root);
  return Object.freeze({
    ok: true,
    workspaceId: workspace.config.workspaceId,
    destroyedKeyId,
    scope: "qarinah-managed local archive objects",
    physicalMediaErasureClaimed: false,
    backupErasureClaimed: false
  });
}
