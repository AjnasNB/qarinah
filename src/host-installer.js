import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QarinahError } from "./errors.js";
import { setupWorkspace } from "./setup.js";
import { QARINAH_VERSION } from "./version.js";
import { atomicWriteFile, loadWorkspace, resolveWithin } from "./workspace.js";

export const HOST_INSTALL_MANIFEST_SCHEMA_VERSION = "qarinah.host-install-manifest.v1";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN_PATH = path.join(PACKAGE_ROOT, "bin", "qarinah.js");
const MAX_CONFIG_BYTES = 512 * 1024;
const MANAGED_TOML_START = "# qarinah:managed:start";
const MANAGED_TOML_END = "# qarinah:managed:end";
const HOSTS = Object.freeze(["codex", "claude", "cursor", "kimi", "antigravity", "freebuff"]);

const INVENTORY = Object.freeze({
  codex: Object.freeze([
    [".codex/config.toml", "managed-toml"],
    [".codex/hooks.json", "managed-hooks"],
    [".codex/skills/qarinah/SKILL.md", "exact"],
    [".codex/skills/qarinah-context/SKILL.md", "exact"],
    [".codex/skills/qarinah-context/references/event-contract.md", "exact"]
  ]),
  claude: Object.freeze([
    [".mcp.json", "managed-mcp"],
    [".claude/settings.json", "managed-hooks"],
    [".claude/skills/qarinah/SKILL.md", "exact"],
    [".claude/skills/qarinah-context/SKILL.md", "exact"],
    [".claude/skills/qarinah-context/references/event-contract.md", "exact"]
  ]),
  cursor: Object.freeze([
    [".cursor/mcp.json", "managed-mcp"],
    [".cursor/rules/qarinah.mdc", "exact"]
  ]),
  kimi: Object.freeze([
    [".kimi-code/mcp.json", "managed-mcp"],
    [".kimi/qarinah-mcp.json", "managed-mcp"],
    [".kimi/README-QARINAH.md", "exact"]
  ]),
  antigravity: Object.freeze([
    [".agents/plugins/qarinah/plugin.json", "exact"],
    [".agents/plugins/qarinah/mcp_config.json", "managed-mcp"],
    [".agents/plugins/qarinah/rules/qarinah.md", "exact"]
  ]),
  freebuff: Object.freeze([
    [".agents/qarinah-memory.ts", "exact"]
  ])
});

function assertHost(host) {
  if (!HOSTS.includes(host)) throw new TypeError(`host must be one of: ${HOSTS.join(", ")}.`);
  return host;
}

function assertScope(scope) {
  if (scope !== "project") throw new TypeError(`Only the explicit project scope is supported in Qarinah ${QARINAH_VERSION}.`);
  return scope;
}

function digest(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

async function inspectFile(root, relativePath) {
  const candidate = resolveWithin(root, relativePath);
  let metadata;
  try {
    metadata = await lstat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ exists: false, digest: null, bytes: 0 });
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
    throw new QarinahError("INSTALL_LINK_REJECTED", `${relativePath} must be a singly linked regular file.`);
  }
  if (metadata.size > MAX_CONFIG_BYTES) {
    throw new QarinahError("INSTALL_FILE_TOO_LARGE", `${relativePath} exceeds ${MAX_CONFIG_BYTES} bytes.`);
  }
  const contents = await readFile(candidate);
  return Object.freeze({ exists: true, digest: digest(contents), bytes: contents.byteLength });
}

async function canonicalTarget(cwd) {
  return realpath(path.resolve(cwd ?? process.cwd()));
}

function manifestRelativePath(host) {
  return `.qarinah/integrations/${host}.json`;
}

export async function previewHostInstall(options = {}) {
  const host = assertHost(options.host);
  const scope = assertScope(options.scope ?? "project");
  const root = await canonicalTarget(options.cwd);
  const binary = await readFile(BIN_PATH);
  const files = [];
  for (const [relativePath, ownership] of INVENTORY[host]) {
    const current = await inspectFile(root, relativePath);
    files.push(Object.freeze({
      path: relativePath,
      ownership,
      action: current.exists ? (ownership === "exact" ? "verify-or-refuse" : "merge") : "create",
      current
    }));
  }
  return Object.freeze({
    schemaVersion: HOST_INSTALL_MANIFEST_SCHEMA_VERSION,
    dryRun: true,
    root,
    host,
    scope,
    packageVersion: QARINAH_VERSION,
    interpreter: Object.freeze({ path: process.execPath, version: process.versions.node }),
    binary: Object.freeze({ path: BIN_PATH, digest: digest(binary), bytes: binary.byteLength }),
    manifestPath: manifestRelativePath(host),
    files: Object.freeze(files)
  });
}

export async function installHostIntegration(options = {}) {
  const preview = await previewHostInstall(options);
  const result = await setupWorkspace({
    cwd: preview.root,
    capture: options.capture,
    [preview.host]: true,
    allowQuery: options.allowQuery === true,
    autoCompact: options.autoCompact === true,
    maxChars: options.maxChars,
    maxItems: options.maxItems
  });
  const files = [];
  for (const [relativePath, ownership] of INVENTORY[preview.host]) {
    const installed = await inspectFile(preview.root, relativePath);
    if (!installed.exists) throw new QarinahError("INSTALL_INCOMPLETE", `${relativePath} was not installed.`);
    files.push(Object.freeze({ path: relativePath, ownership, installed }));
  }
  const manifest = Object.freeze({
    schemaVersion: HOST_INSTALL_MANIFEST_SCHEMA_VERSION,
    packageVersion: QARINAH_VERSION,
    installedAt: new Date().toISOString(),
    workspaceId: result.workspaceId,
    root: preview.root,
    host: preview.host,
    scope: preview.scope,
    interpreter: preview.interpreter,
    binary: preview.binary,
    options: Object.freeze({
      allowQuery: options.allowQuery === true,
      autoCompact: options.autoCompact === true
    }),
    files: Object.freeze(files)
  });
  const output = resolveWithin(preview.root, manifestRelativePath(preview.host));
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await atomicWriteFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze({ ...result, installManifest: manifestRelativePath(preview.host), host: preview.host, scope: preview.scope });
}

function removeManagedToml(contents) {
  const pattern = new RegExp(`(?:^|\\n)${MANAGED_TOML_START}[\\s\\S]*?${MANAGED_TOML_END}(?:\\n|$)`, "m");
  return contents.replace(pattern, "\n").replace(/^\s+|\s+$/gu, "").concat("\n");
}

function removeMcp(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QarinahError("UNINSTALL_CONFIG_INVALID", "Managed MCP config must contain an object.");
  const next = structuredClone(value);
  if (next.mcpServers && typeof next.mcpServers === "object" && !Array.isArray(next.mcpServers)) {
    delete next.mcpServers.qarinah;
    if (Object.keys(next.mcpServers).length === 0) delete next.mcpServers;
  }
  return next;
}

function ownedHook(command, binaryPath) {
  if (typeof command !== "string" || typeof binaryPath !== "string") return false;
  return [
    `node ${JSON.stringify(binaryPath)} hook codex --quiet`,
    `node ${JSON.stringify(binaryPath)} hook claude --quiet`,
    `node ${JSON.stringify(binaryPath)} harness --record --no-rebuild --quiet`
  ].includes(command);
}

function removeHooks(value, binaryPath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QarinahError("UNINSTALL_CONFIG_INVALID", "Managed hooks config must contain an object.");
  const next = structuredClone(value);
  if (!next.hooks || typeof next.hooks !== "object" || Array.isArray(next.hooks)) return next;
  for (const [event, entries] of Object.entries(next.hooks)) {
    if (!Array.isArray(entries)) continue;
    const retained = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) {
        retained.push(entry);
        continue;
      }
      const hooks = entry.hooks.filter((hook) => !ownedHook(hook?.command, binaryPath));
      if (hooks.length > 0) retained.push({ ...entry, hooks });
    }
    if (retained.length > 0) next.hooks[event] = retained;
    else delete next.hooks[event];
  }
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return next;
}

async function transformedContents(root, entry, manifest) {
  const candidate = resolveWithin(root, entry.path);
  const contents = await readFile(candidate, "utf8");
  if (entry.ownership === "managed-toml") return removeManagedToml(contents);
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new QarinahError("UNINSTALL_CONFIG_INVALID", `${entry.path} is not valid JSON.`);
  }
  const next = entry.ownership === "managed-mcp" ? removeMcp(parsed) : removeHooks(parsed, manifest.binary?.path);
  return `${JSON.stringify(next, null, 2)}\n`;
}

export async function uninstallHostIntegration(options = {}) {
  const host = assertHost(options.host);
  const scope = assertScope(options.scope ?? "project");
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const manifestPath = resolveWithin(workspace.root, manifestRelativePath(host));
  const manifestState = await inspectFile(workspace.root, manifestRelativePath(host));
  if (!manifestState.exists) throw new QarinahError("INSTALL_MANIFEST_MISSING", `No Qarinah-owned ${host} project installation is recorded.`);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new QarinahError("INSTALL_MANIFEST_INVALID", "The host installation manifest is invalid.");
  }
  if (manifest?.schemaVersion !== HOST_INSTALL_MANIFEST_SCHEMA_VERSION || manifest.host !== host
    || manifest.scope !== scope || manifest.workspaceId !== workspace.config.workspaceId || manifest.root !== workspace.root
    || !Array.isArray(manifest.files)) {
    throw new QarinahError("INSTALL_MANIFEST_INVALID", "The host installation manifest does not match this workspace.");
  }

  const plan = [];
  for (const entry of manifest.files) {
    if (!INVENTORY[host].some(([relativePath, ownership]) => relativePath === entry.path && ownership === entry.ownership)) {
      throw new QarinahError("INSTALL_MANIFEST_INVALID", "The host installation manifest contains an unknown file.");
    }
    const current = await inspectFile(workspace.root, entry.path);
    if (!current.exists) {
      plan.push(Object.freeze({ entry, action: "already-absent", contents: null }));
      continue;
    }
    if (entry.ownership === "exact") {
      if (current.digest !== entry.installed?.digest) {
        throw new QarinahError("UNINSTALL_FILE_CHANGED", `${entry.path} changed after installation and will not be removed.`);
      }
      plan.push(Object.freeze({ entry, action: "delete", contents: null }));
      continue;
    }
    plan.push(Object.freeze({ entry, action: "rewrite", contents: await transformedContents(workspace.root, entry, manifest) }));
  }

  for (const item of plan) {
    const candidate = resolveWithin(workspace.root, item.entry.path);
    if (item.action === "delete") await unlink(candidate);
    if (item.action === "rewrite") await atomicWriteFile(candidate, item.contents);
  }
  await unlink(manifestPath);
  return Object.freeze({
    ok: true,
    root: workspace.root,
    workspaceId: workspace.config.workspaceId,
    host,
    scope,
    removed: Object.freeze(plan.filter((item) => item.action !== "already-absent").map((item) => item.entry.path)),
    preserved: Object.freeze(plan.filter((item) => item.action === "already-absent").map((item) => item.entry.path))
  });
}
