import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "qarinah-consumer-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required for the clean-consumer test.");
const COCKROACH_BROWSER_INTEGRITY = "sha512-jo8kbcaXtF+zVgnZl9m0Fslzjx7iVFhALD109HOKjTHrtzP9pndVDeIOySJUaYwGzF1kTHzXhn/PM8d6fOqGSw==";
const COCKROACH_BROWSER_TARBALL = "https://registry.npmjs.org/cockroach-browser/-/cockroach-browser-0.1.0.tgz";

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
  const packOutput = JSON.parse(packed.stdout);
  const packRecords = Array.isArray(packOutput)
    ? packOutput
    : typeof packOutput?.filename === "string"
      ? [packOutput]
      : Object.values(packOutput ?? {}).filter((entry) => typeof entry?.filename === "string");
  assert.equal(packRecords.length, 1, "npm pack --json did not return exactly one package record.");
  const [packRecord] = packRecords;
  const { filename } = packRecord;
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
    "  appendCockroachBrowserOutcome,",
    "  appendEvent,",
    "  createCockroachBrowserMemorySink,",
    "  cockroachSourceRecordToAcquisitionEventInput,",
    "  createProductLoopProvenanceSink,",
    "  ingestCockroachSourceRecord,",
    "  importAgentArchive,",
    "  buildProjectOverview,",
    "  runCodingContextHarness,",
    "  renderCodingContextHarnessMarkdown,",
    "  buildLinkedProjectMemory,",
    "  loadLinkedProjectMemory,",
    "  queryLinkedProjectMemory,",
    "  rankLinkedProjectMemory,",
    "  readEvents,",
    "  rebuildDerivedState,",
    "  renderProjectOverviewMarkdown,",
    "  initializeWorkspace,",
    "  inspectGitWorktree,",
    "  listGitWorktrees,",
    "  inspectWorkspacePolicy,",
    "  installHostIntegration,",
    "  previewHostInstall,",
    "  approveWorkspaceTrust,",
    "  exportOkf,",
    "  registerMaqamContextAdapters,",
    "  uninstallHostIntegration,",
    "  createMcpServer,",
    "  validateCockroachBrowserMemoryOutcome,",
    "  validateCockroachSourceRecordBoundary,",
    "  type CockroachBrowserMemoryOutcomeBoundary,",
    "  type CockroachBrowserMemorySink,",
    "  type CockroachIngestionResult,",
    "  type MaqamContextAppendInput,",
    "  type MaqamGuardedToolGateway,",
    "  type ProductLoopProvenanceSink,",
    "  type ProductLoopRuntimeEventBoundary,",
    "  type QarinahContextPack,",
    "  type QarinahCapturePolicy,",
    "  type QarinahOkfExportResult,",
    "  type QarinahAgentArchiveImportResult,",
    "  type QarinahProjectOverview,",
    "  type QarinahCodingContextHarnessResult,",
    "  type QarinahCodingContextSummarizer,",
    "  type QarinahLinkedProjectMemory,",
    "  type QarinahLinkedProjectQuery,",
    "  type QarinahGitWorktree,",
    "  type QarinahHostIntegration",
    "} from \"qarinah\";",
    "import type { QarinahBrowserSink as PublicCockroachBrowserSink } from \"cockroach-browser/qarinah\";",
    "import { captureCodexHook } from \"qarinah/codex\";",
    "import { captureClaudeHook } from \"qarinah/claude\";",
    "import { createMcpServer as createSubpathMcpServer } from \"qarinah/mcp\";",
    "// @ts-expect-error The Codex subpath exposes only the hook adapter.",
    "import { initializeWorkspace as invalidCodexExport } from \"qarinah/codex\";",
    "void initializeWorkspace;",
    "const host: QarinahHostIntegration = 'antigravity';",
    "void previewHostInstall({ host, scope: 'project' });",
    "void installHostIntegration({ host: 'freebuff', scope: 'project', autoCompact: true });",
    "void uninstallHostIntegration({ host: 'freebuff', scope: 'project' });",
    "const currentWorktree: Promise<QarinahGitWorktree | null> = inspectGitWorktree();",
    "void currentWorktree;",
    "const siblingWorktrees: Promise<readonly QarinahGitWorktree[]> = listGitWorktrees();",
    "void siblingWorktrees;",
    "const archiveImport: Promise<QarinahAgentArchiveImportResult> = importAgentArchive('./history.jsonl', { mode: 'compact' });",
    "void archiveImport;",
    "const projectOverview: Promise<QarinahProjectOverview> = buildProjectOverview();",
    "void projectOverview;",
    "void renderProjectOverviewMarkdown;",
    "const contextSummarizer: QarinahCodingContextSummarizer = { id: 'consumer-summary', summarize: () => ({ text: 'bounded summary' }) };",
    "const codingHarness: Promise<Readonly<QarinahCodingContextHarnessResult>> = runCodingContextHarness({ query: 'release readiness', summarizer: contextSummarizer, record: false });",
    "void codingHarness.then(renderCodingContextHarnessMarkdown);",
    "void buildLinkedProjectMemory;",
    "void loadLinkedProjectMemory;",
    "void rankLinkedProjectMemory;",
    "const linkedQuery: Promise<QarinahLinkedProjectQuery> = queryLinkedProjectMemory('release policy', { persist: false, updateCheckpoint: false });",
    "const linkedCoverage: Promise<boolean> = linkedQuery.then((result) => result.coverage.projectionComplete && result.coverage.authorityComplete);",
    "void linkedCoverage;",
    "const linkedMemory: QarinahLinkedProjectMemory | null = null;",
    "void linkedMemory;",
    "const cancellation = new AbortController();",
    "void appendEvent({ kind: 'decision', title: 'cancel-safe append' }, { signal: cancellation.signal });",
    "void readEvents('.', { signal: cancellation.signal });",
    "void rebuildDerivedState('.', { signal: cancellation.signal });",
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
    "const browserOutcome: CockroachBrowserMemoryOutcomeBoundary = validateCockroachBrowserMemoryOutcome({",
    "  schemaVersion: 'cockroach.browser-memory.v1',",
    "  type: 'browser.action.completed',",
    "  sessionId: 'session_consumer',",
    "  purpose: 'Capture cited evidence',",
    "  timestamp: '2026-07-29T16:00:00.000Z',",
    "  evidenceIds: ['evidence_consumer'],",
    "  metadata: { action: 'snapshot', effect: 'read' }",
    "});",
    "void browserOutcome;",
    "const browserSink: CockroachBrowserMemorySink = createCockroachBrowserMemorySink();",
    "const upstreamCompatibleBrowserSink: { appendBrowserOutcome(value: unknown): Promise<void> } = browserSink;",
    "const publicCockroachBrowserSink: PublicCockroachBrowserSink = browserSink;",
    "void upstreamCompatibleBrowserSink;",
    "void publicCockroachBrowserSink;",
    "const browserAppend = appendCockroachBrowserOutcome(browserOutcome);",
    "void browserAppend;",
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

  const installed = await runNode([
    npmCli,
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarball
  ], temporaryDirectory);
  assert.equal(installed.code, 0, installed.stderr);
  const installedPackage = JSON.parse(await readFile(path.join(temporaryDirectory, "node_modules", "qarinah", "package.json"), "utf8"));
  assert.equal(installedPackage.version, packageJson.version);
  assert.equal(installedPackage.dependencies["cockroach-browser"], undefined);
  assert.equal(installedPackage.optionalDependencies?.["cockroach-browser"], undefined);
  assert.equal(installedPackage.peerDependencies?.["cockroach-browser"], undefined);
  assert.equal(installedPackage.devDependencies["cockroach-browser"], "0.1.0");
  const qarinahOnlyModules = await readdir(path.join(temporaryDirectory, "node_modules"));
  assert.equal(qarinahOnlyModules.includes("cockroach-browser"), false);
  const audited = await runNode([npmCli, "audit", "--omit=dev", "--json"], temporaryDirectory);
  assert.equal(audited.code, 0, audited.stderr);
  const audit = JSON.parse(audited.stdout);
  assert.equal(audit.metadata.vulnerabilities.total, 0);
  process.stdout.write("Clean consumer runtime audit passed; cockroach-browser was not installed transitively.\n");

  const fixtureInstalled = await runNode([
    npmCli,
    "install",
    "--save-dev",
    "--save-exact",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "cockroach-browser@0.1.0"
  ], temporaryDirectory);
  assert.equal(fixtureInstalled.code, 0, fixtureInstalled.stderr);
  const consumerLock = JSON.parse(await readFile(path.join(temporaryDirectory, "package-lock.json"), "utf8"));
  const browserLock = consumerLock.packages["node_modules/cockroach-browser"];
  assert.equal(browserLock.version, "0.1.0");
  assert.equal(browserLock.resolved, COCKROACH_BROWSER_TARBALL);
  assert.equal(browserLock.integrity, COCKROACH_BROWSER_INTEGRITY);
  assert.equal(browserLock.dev, true);
  const installedBrowserPackage = JSON.parse(
    await readFile(path.join(temporaryDirectory, "node_modules", "cockroach-browser", "package.json"), "utf8")
  );
  assert.equal(installedBrowserPackage.version, "0.1.0");
  assert.equal(installedBrowserPackage.license, "AGPL-3.0-or-later");

  const typeScriptCli = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
  const checked = await runNode([typeScriptCli, "--project", path.join(temporaryDirectory, "tsconfig.json")], temporaryDirectory);
  assert.equal(checked.code, 0, `${checked.stdout}\n${checked.stderr}`);
  assert.equal(
    installedPackage.exports["./schemas/cockroach-browser-memory.json"],
    "./schemas/cockroach-browser-memory.schema.json"
  );
  assert.equal(
    installedPackage.exports["./schemas/host-install-manifest.json"],
    "./schemas/host-install-manifest.schema.json"
  );
  await readFile(
    path.join(temporaryDirectory, "node_modules", "qarinah", "schemas", "host-install-manifest.schema.json"),
    "utf8"
  );
  await readFile(
    path.join(temporaryDirectory, "node_modules", "qarinah", "schemas", "cockroach-browser-memory.schema.json"),
    "utf8"
  );
  assert.equal(
    installedPackage.exports["./schemas/linked-project-memory.json"],
    "./schemas/linked-project-memory.schema.json"
  );
  assert.equal(
    installedPackage.exports["./schemas/linked-project-query.json"],
    "./schemas/linked-project-query.schema.json"
  );
  await readFile(path.join(temporaryDirectory, "node_modules", "qarinah", "schemas", "linked-project-memory.schema.json"), "utf8");
  await readFile(path.join(temporaryDirectory, "node_modules", "qarinah", "schemas", "linked-project-query.schema.json"), "utf8");
  assert.equal(
    installedPackage.exports["./schemas/coding-context-harness.json"],
    "./schemas/coding-context-harness.schema.json"
  );
  await readFile(path.join(temporaryDirectory, "node_modules", "qarinah", "schemas", "coding-context-harness.schema.json"), "utf8");
  await readFile(path.join(temporaryDirectory, "node_modules", "qarinah", "docs", "CODING-CONTEXT-HARNESS.md"), "utf8");
  process.stdout.write("Exact cockroach-browser@0.1.0 TypeScript and registry-integrity contract passed.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
