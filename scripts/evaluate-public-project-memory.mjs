import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  appendEvent,
  buildSessionContextReceipts,
  buildSymbolGraph,
  compileContext,
  initializeWorkspace,
  querySymbolGraph,
  scanProjectStructure,
  verifyStore
} from "../src/index.js";
import { canonicalStringify, sha256 } from "../src/canonical.js";

const execute = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const resultPath = path.join(repositoryRoot, "bench", "results", `public-project-memory-v${packageJson.version}.json`);
const write = process.argv.includes("--write");
const fixedClock = () => new Date("2099-08-20T12:00:00.000Z");

async function trackedPaths() {
  const { stdout } = await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  return stdout.toString("utf8").split("\0").filter(Boolean).filter((relative) =>
    !relative.startsWith("bench/results/public-project-memory-")
    && !relative.startsWith("website/dist/")
  ).sort();
}

async function copyPublicCheckout(destination, paths) {
  for (const relative of paths) {
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(repositoryRoot, relative), target, { dereference: false });
  }
}

async function git(args, cwd) {
  await execute("git", args, { cwd, env: {
    ...process.env,
    GIT_AUTHOR_DATE: "2099-08-20T12:00:00Z",
    GIT_COMMITTER_DATE: "2099-08-20T12:00:00Z"
  }, maxBuffer: 32 * 1024 * 1024 });
}

function event(kind, title, body, sessionId, turnId) {
  return {
    kind,
    actor: { type: "agent", id: "public-project-evaluator" },
    sessionId,
    turnId,
    title,
    body,
    data: {},
    confidence: "verified",
    relations: [],
    provenance: { adapter: "qarinah.public-project-evaluation", sourceId: `${sessionId}:${kind}` },
    retention: { class: "project", expiresAt: null }
  };
}

async function sourceManifest(paths) {
  const included = paths.filter((relative) => /^(?:bin|schemas|src|types)\//u.test(relative) || relative === "package.json");
  const files = [];
  for (const relative of included) {
    const bytes = await readFile(path.join(repositoryRoot, relative));
    files.push({ path: relative.replaceAll("\\", "/"), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  }
  return { fileCount: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), manifestHash: sha256(files) };
}

async function evaluate() {
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  const paths = await trackedPaths();
  const publicSource = await sourceManifest(paths);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qarinah-public-project-memory-"));
  const project = path.join(temporaryRoot, "qarinah-public-checkout");
  try {
    await mkdir(project);
    await copyPublicCheckout(project, paths);
    await git(["init", "--quiet", "--initial-branch=main"], project);
    await git(["config", "user.name", "Qarinah Evaluation"], project);
    await git(["config", "user.email", "evaluation@qarinah.invalid"], project);
    await git(["remote", "add", "origin", "https://github.com/AjnasNB/qarinah.git"], project);
    await git(["add", "--all"], project);
    await git(["commit", "--quiet", "-m", "Public evaluation snapshot"], project);

    await initializeWorkspace(project, { capture: "content" });
    const scan = await scanProjectStructure({ cwd: project, maxFiles: 5_000, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
    const graph = await buildSymbolGraph({ cwd: project, persist: false });
    const definitions = [
      ["appendEvent", "src/store.js"],
      ["buildMemoryDashboard", "src/dashboard.js"],
      ["createMcpServer", "src/mcp/server.js"],
      ["inspectGitWorktree", "src/git-worktrees.js"]
    ].map(([query, expectedPath]) => {
      const result = querySymbolGraph(graph, query, { limit: 20 });
      const match = result.results.find((entry) => entry.symbol.name === query && entry.symbol.path === expectedPath);
      return { query, expectedPath, found: Boolean(match), returnedPath: match?.symbol.path ?? null };
    });

    const sessionId = "public-project-continuity";
    const turnId = "release-memory-turn";
    await appendEvent(event("session.started", "Start public release continuity review", "Visible test session begins.", sessionId, turnId), { cwd: project, clock: fixedClock });
    const decision = await appendEvent(event("decision", "Keep project memory evidence linked", "Every delivered memory item must retain a source event and content hash.", sessionId, turnId), { cwd: project, clock: fixedClock });
    await appendEvent(event("tool.completed", "Public source verification completed", "The checked public source tree matched its recorded file manifest.", sessionId, turnId), { cwd: project, clock: fixedClock });
    await appendEvent(event("turn.completed", "Release memory turn completed", "The next session can retrieve the cited decision.", sessionId, turnId), { cwd: project, clock: fixedClock });

    const receipts = await buildSessionContextReceipts({ cwd: project, sessionId, query: "project memory evidence linked", clock: fixedClock, write: false });
    const receipt = receipts.receipts[0];
    const pack = await compileContext("project memory evidence linked", { cwd: project, minimumCoverage: "direct", clock: fixedClock });
    const verified = await verifyStore(project, { updateCheckpoint: false });
    const serializedReceipt = canonicalStringify(receipt);
    const scenarios = [
      { id: "project-scan", passed: scan.fileCount > 250 && scan.directoryCount > 20 },
      { id: "eligible-symbol-files", passed: graph.coverage.eligibleFiles > 0 && graph.coverage.indexedFiles === graph.coverage.eligibleFiles && graph.coverage.complete },
      ...definitions.map((item) => ({ id: `definition:${item.query}`, passed: item.found })),
      { id: "session-lifecycle", passed: receipt?.lifecycle.observedState === "turn-completed" && receipt.lifecycle.completedTurns === 1 && receipt.outcomes.eventCount === 3 },
      { id: "receipt-minimization", passed: !serializedReceipt.includes("Every delivered memory item") && !serializedReceipt.includes("checked public source tree") },
      { id: "cited-continuation", passed: pack.items.some((item) => item.eventId === decision.eventId && /^sha256:[a-f0-9]{64}$/u.test(item.hash)) },
      { id: "ledger-integrity", passed: verified.eventCount === 5 && /^sha256:[a-f0-9]{64}$/u.test(verified.headHash) }
    ];
    const core = {
      schemaVersion: "qarinah.public-project-memory-evaluation.v1",
      evaluationId: `public-qarinah-checkout-${packageJson.version}`,
      scope: {
        repository: "https://github.com/AjnasNB/qarinah",
        source: "current public checkout copied into an isolated temporary Git repository",
        independence: "maintainer-run self-evaluation; not an independent benchmark",
        privateDataUsed: false,
        providerCalls: 0,
        timingClaimed: false,
        sourceManifest: publicSource,
        evaluatorSha256: `sha256:${createHash("sha256").update(scriptBytes).digest("hex")}`
      },
      implementation: {
        package: "qarinah",
        version: packageJson.version,
        symbolGraph: graph.schemaVersion,
        sessionReceipt: receipt.schemaVersion
      },
      observed: {
        projectFiles: scan.fileCount,
        projectDirectories: scan.directoryCount,
        supportedSymbolLanguages: graph.coverage.supportedLanguages,
        indexedSymbolLanguages: graph.coverage.indexedLanguages,
        eligibleSymbolFiles: graph.coverage.eligibleFiles,
        indexedSymbolFiles: graph.coverage.indexedFiles,
        declarations: graph.coverage.declarations,
        references: graph.coverage.references,
        definitions,
        session: {
          sourceEvents: receipt.source.eventCount,
          completedTurns: receipt.lifecycle.completedTurns,
          outcomeEvents: receipt.outcomes.eventCount,
          deliveredItems: receipt.delivered.itemCount,
          deliveredCitations: receipt.delivered.citationCount
        }
      },
      scenarios: {
        total: scenarios.length,
        passed: scenarios.filter((scenario) => scenario.passed).length,
        items: scenarios
      },
      boundaries: [
        "This evaluates Qarinah on its own public source checkout; it is not independent reproduction.",
        "No provider model, learned embedding service, wall-clock performance, billing, or private agent history is measured.",
        "A passing result proves these exact structural scenarios, not universal task success or semantic correctness."
      ]
    };
    assert.equal(core.scenarios.passed, core.scenarios.total, canonicalStringify(scenarios));
    return { ...core, manifestHash: sha256(core) };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const result = await evaluate();
if (write) {
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${path.relative(repositoryRoot, resultPath)} (${result.scenarios.passed}/${result.scenarios.total}).\n`);
} else {
  const committed = JSON.parse(await readFile(resultPath, "utf8"));
  assert.deepEqual(result, committed, "Public-project memory evaluation no longer matches the committed result.");
  process.stdout.write(`Verified public-project memory evaluation ${result.scenarios.passed}/${result.scenarios.total}.\n`);
}
