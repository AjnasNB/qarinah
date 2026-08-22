import { mkdtemp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendEvent } from "./store.js";
import { compileContext } from "./compiler.js";
import { writeMemoryDashboard } from "./dashboard.js";
import { rebuildDerivedState } from "./indexer.js";
import { scanProjectStructure } from "./project-structure.js";
import { initializeWorkspace } from "./workspace.js";

async function createRoot(output) {
  if (!output) return mkdtemp(path.join(os.tmpdir(), "qarinah-demo-"));
  const root = path.resolve(output);
  await mkdir(root, { recursive: false });
  return root;
}

function event(kind, title, body, relations = [], data = {}) {
  return {
    kind,
    title,
    body,
    data,
    actor: { type: kind === "decision" ? "human" : "agent", id: "qarinah-demo" },
    confidence: kind === "decision" ? "claimed" : "verified",
    relations,
    provenance: { adapter: "qarinah-demo", sourceId: "public-demo-fixture" },
    retention: { class: "project", expiresAt: null }
  };
}

export async function createDemoWorkspace(options = {}) {
  const root = await createRoot(options.output);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "qarinah-handoff-demo", type: "module" }, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "src", "retry-policy.js"), [
    "export const retryPolicy = {",
    "  maximumAttempts: 3,",
    "  backoff: 'exponential',",
    "  retryStatusCodes: [429, 503]",
    "};",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(root, "README.md"), "# Checkout service\n\nThe retry decision is preserved by Qarinah for the next coding-agent session.\n", "utf8");
  const transientTranscript = path.join(root, "session-a-transcript.txt");
  await writeFile(transientTranscript, [
    "Session A temporary transcript",
    "Decision: retry checkout requests three times with exponential backoff.",
    "Retry only HTTP 429 and 503; do not retry other 4xx responses.",
    ""
  ].join("\n"), "utf8");
  await initializeWorkspace(root, { capture: "content" });
  const started = await appendEvent(event(
    "session.started",
    "Codex session started",
    "Implement checkout retry handling in a bounded session.",
    [],
    { sessionLabel: "session-a" }
  ), { cwd: root });
  const decision = await appendEvent(event(
    "decision",
    "Retry checkout requests three times",
    "Use exponential backoff. Retry only HTTP 429 and 503. Do not retry other 4xx responses.",
    [{ type: "derived_from", target: started.eventId }, { type: "affects", target: "src/retry-policy.js" }],
    { expectedOutcome: "Bound retries without duplicating permanent client failures." }
  ), { cwd: root });
  const tool = await appendEvent(event(
    "tool.completed",
    "Retry policy tests passed",
    "The fixture verified three attempts, exponential backoff, and the 429/503 boundary.",
    [{ type: "supports", target: decision.eventId }, { type: "changed", target: "src/retry-policy.js" }],
    { tool: "node:test", exitCode: 0 }
  ), { cwd: root });
  await appendEvent(event(
    "summary",
    "Fresh-session handoff is ready",
    "Continue from the verified retry boundary without replaying the previous chat.",
    [{ type: "derived_from", target: decision.eventId }, { type: "derived_from", target: tool.eventId }],
    { sourceEvents: [decision.eventId, tool.eventId], sessionLabel: "session-b" }
  ), { cwd: root });
  await unlink(transientTranscript);
  const structure = await scanProjectStructure({ cwd: root });
  await rebuildDerivedState(root);
  const pack = await compileContext("Why are checkout retries limited to HTTP 429 and 503?", {
    cwd: root,
    maxChars: 8_000,
    minimumCoverage: "partial"
  });
  const dashboard = await writeMemoryDashboard({ cwd: root });
  const expected = pack.items.find((item) => item.eventId === decision.eventId) ?? pack.items[0];
  return Object.freeze({
    ok: true,
    root,
    isolated: true,
    telemetryEnabled: false,
    transientSessionRemoved: true,
    filesMapped: structure.fileCount,
    dashboard: dashboard.output,
    query: pack.query,
    expectedResult: expected ? {
      title: expected.title,
      eventId: expected.eventId,
      hash: expected.hash,
      evidenceCoverage: pack.retrieval?.evidenceCoverage ?? null
    } : null,
    nextCommands: [
      `cd ${JSON.stringify(root)}`,
      "npx qarinah query \"Why are checkout retries limited to HTTP 429 and 503?\" --format markdown --minimum-coverage partial",
      "npx qarinah dashboard --serve"
    ],
    readme: await readFile(path.join(root, "README.md"), "utf8")
  });
}
