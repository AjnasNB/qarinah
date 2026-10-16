import { lstat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deepFreezeJson } from "./canonical.js";
import { readAutoInitPolicy } from "./auto-init.js";
import { loadWorkspace } from "./workspace.js";
import { readEvents } from "./store.js";
import { QARINAH_VERSION } from "./version.js";

async function setupMetadata() {
  const directory = path.join(os.homedir(), ".qarinah"), file = path.join(directory, "setup-report.json");
  for (const target of [directory, file]) {
    const stat = await lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!stat) return null;
    if (stat.isSymbolicLink() || target === file && (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536)) return null;
  }
  const value = JSON.parse(await readFile(file, "utf8"));
  return { version: typeof value.version === "string" ? value.version.slice(0, 32) : null,
    configuredHosts: Array.isArray(value.targets) ? value.targets.map(target => typeof target === "string" ? target : target?.host).filter(value => typeof value === "string").slice(0, 16) : [] };
}
async function publicRelease() {
  try {
    const response = await fetch("https://qarinah.io/release.json", { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok || Number(response.headers.get("content-length")) > 16384) return { status: "unavailable", version: null };
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 16384) { await reader.cancel(); throw new Error("Large release metadata"); } chunks.push(Buffer.from(value)); }
    } finally { reader.releaseLock(); }
    const info = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (info.schemaVersion !== "qarinah.public-release.v1" || info.sourceState !== "clean"
      || !/^[0-9a-f]{40}$/u.test(info.sourceCommit)
      || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(info.version)) return { status: "unavailable", version: null };
    return { status: info.version === QARINAH_VERSION ? "aligned" : "version-mismatch", version: info.version,
      sourceCommit: /^[0-9a-f]{40}$/u.test(info.sourceCommit) ? info.sourceCommit : null };
  } catch { return { status: "unavailable", version: null }; }
}
export async function inspectRuntimeHealth(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const policy = await readAutoInitPolicy(), setup = await setupMetadata().catch(() => null);
  const latestHook = [...events].reverse().find(event => typeof event.data?.hookEvent === "string");
  return deepFreezeJson({ schemaVersion: "qarinah.runtime-health.v1", version: QARINAH_VERSION,
    workspaceId: workspace.config.workspaceId, integrity: "verified-local-chain", capture: workspace.config.capture,
    retainedEvents: events.length, lastRetainedAt: events.at(-1)?.timestamp ?? null,
    lastObservedHostCaptureAt: latestHook?.timestamp ?? null,
    machineAutoInitEnabled: policy?.enabled === true, userRuntime: setup,
    hostLifecycle: "Configuration and observed events do not establish that every host is running or has reviewed its hooks.",
    providerDelivery: "unobserved", publicRelease: options.online === true ? await publicRelease() : { status: "not-queried", version: null },
    knowledgeBoundary: "Hashes verify retained bytes. Confidence, source freshness, conflicts, and semantic correctness remain separate." });
}
