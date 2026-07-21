import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "qarinah-consumer-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required for the clean-consumer test.");

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const packed = await runNode([npmCli, "pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory], repositoryRoot);
  assert.equal(packed.code, 0, packed.stderr);
  const [{ filename }] = JSON.parse(packed.stdout);
  const tarball = path.join(temporaryDirectory, filename);

  await writeFile(path.join(temporaryDirectory, "package.json"), `${JSON.stringify({ name: "qarinah-clean-consumer", private: true, type: "module" }, null, 2)}\n`);
  await writeFile(path.join(temporaryDirectory, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false
    },
    include: ["consumer.ts"]
  }, null, 2)}\n`);
  await writeFile(path.join(temporaryDirectory, "consumer.ts"), [
    "import {",
    "  cockroachSourceRecordToAcquisitionEventInput,",
    "  createProductLoopProvenanceSink,",
    "  ingestCockroachSourceRecord,",
    "  initializeWorkspace,",
    "  inspectWorkspacePolicy,",
    "  approveWorkspaceTrust,",
    "  exportOkf,",
    "  registerMaqamContextAdapters,",
    "  createMcpServer,",
    "  validateCockroachSourceRecordBoundary,",
    "  type CockroachIngestionResult,",
    "  type MaqamContextAppendInput,",
    "  type MaqamGuardedToolGateway,",
    "  type ProductLoopProvenanceSink,",
    "  type ProductLoopRuntimeEventBoundary,",
    "  type QarinahContextPack,",
    "  type QarinahCapturePolicy,",
    "  type QarinahOkfExportResult",
    "} from \"qarinah\";",
    "import { captureCodexHook } from \"qarinah/codex\";",
    "import { captureClaudeHook } from \"qarinah/claude\";",
    "import { createMcpServer as createSubpathMcpServer } from \"qarinah/mcp\";",
    "// @ts-expect-error The Codex subpath exposes only the hook adapter.",
    "import { initializeWorkspace as invalidCodexExport } from \"qarinah/codex\";",
    "void initializeWorkspace;",
    "const requestedPolicy: Promise<QarinahCapturePolicy> = inspectWorkspacePolicy();",
    "void requestedPolicy;",
    "void approveWorkspaceTrust;",
    "const okfExport: Promise<QarinahOkfExportResult> = exportOkf({ output: 'docs/knowledge' });",
    "void okfExport;",
    "void captureCodexHook;",
    "void captureClaudeHook;",
    "void createMcpServer;",
    "void createSubpathMcpServer;",
    "void invalidCodexExport;",
    "const pack: QarinahContextPack | null = null;",
    "void pack;",
    "const gateway: MaqamGuardedToolGateway = {",
    "  registerGuardedTool: (_name, _factory, _metadata) => gateway",
    "};",
    "registerMaqamContextAdapters({",
    "  gateway",
    "});",
    "const sink: ProductLoopProvenanceSink = createProductLoopProvenanceSink();",
    "const upstreamCompatible: { record(event: ProductLoopRuntimeEventBoundary): void | Promise<void> } = sink;",
    "void upstreamCompatible;",
    "const source = validateCockroachSourceRecordBoundary({",
    "  source: 'web', id: 'id', type: 'page', title: '', url: '', text: '', author: null, publishedAt: null,",
    "  contentHash: `sha256:${'a'.repeat(64)}`, adapterVersion: '0.3.0-alpha.1', warnings: [], metadata: {},",
    "  provenance: { retrievedAt: '2026-07-18T00:00:00.000Z', method: 'crawler', authenticated: false, credentialed: false }",
    "});",
    "void source;",
    "const acquisition = cockroachSourceRecordToAcquisitionEventInput(source, { capture: 'metadata' });",
    "void acquisition;",
    "const ingestion: Promise<CockroachIngestionResult> = ingestCockroachSourceRecord(source);",
    "void ingestion;",
    "const appendInput: MaqamContextAppendInput = { event: { kind: 'decision', title: 'ship' }, capture: 'content' };",
    "void appendInput;",
    ""
  ].join("\n"));

  const installed = await runNode([npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], temporaryDirectory);
  assert.equal(installed.code, 0, installed.stderr);
  const typeScriptCli = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
  const checked = await runNode([typeScriptCli, "--project", path.join(temporaryDirectory, "tsconfig.json")], temporaryDirectory);
  assert.equal(checked.code, 0, `${checked.stdout}\n${checked.stderr}`);
  const installedPackage = JSON.parse(await readFile(path.join(temporaryDirectory, "node_modules", "qarinah", "package.json"), "utf8"));
  assert.equal(installedPackage.version, "0.1.0-alpha.2");
  process.stdout.write("Clean consumer TypeScript contract passed.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
