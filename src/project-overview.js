import { deepFreezeJson } from "./canonical.js";
import { readEvents } from "./store.js";
import { atomicWriteFile, loadWorkspace, resolveWithin } from "./workspace.js";

export const PROJECT_OVERVIEW_SCHEMA_VERSION = "qarinah.project-overview.v1";

function latestStructure(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const structure = events[index].data?.projectStructure;
    if (structure?.schemaVersion === "qarinah.project-structure.v1") return { event: events[index], structure };
  }
  return null;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ name, count }));
}

function topDirectory(filePath) {
  const separator = filePath.indexOf("/");
  return separator === -1 ? "(root)" : filePath.slice(0, separator);
}

function outcome(event) {
  const body = event.body.replaceAll(/\s+/gu, " ").trim();
  return {
    eventId: event.eventId,
    hash: event.hash,
    kind: event.kind,
    timestamp: event.timestamp,
    title: event.title,
    excerpt: body.length > 280 ? `${body.slice(0, 277)}...` : body
  };
}

export async function buildProjectOverview(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Project overview options must be a record.");
  const allowedOptions = new Set(["cwd", "maxOutcomes"]);
  const unknownOptions = Object.keys(options).filter((key) => !allowedOptions.has(key));
  if (unknownOptions.length > 0) throw new TypeError(`Project overview options contain unknown field(s): ${unknownOptions.join(", ")}.`);
  const maxOutcomes = options.maxOutcomes ?? 12;
  if (!Number.isSafeInteger(maxOutcomes) || maxOutcomes < 1 || maxOutcomes > 100) {
    throw new TypeError("maxOutcomes must be an integer from 1 to 100.");
  }
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace);
  const latest = latestStructure(events);
  const sessions = new Set(events.map((event) => event.sessionId).filter(Boolean));
  const files = latest?.structure.files ?? [];
  const references = files.flatMap((file) => file.references ?? []);
  const outcomes = events.filter((event) => ["turn.completed", "decision", "summary", "approval"].includes(event.kind))
    .slice(-maxOutcomes).reverse().map(outcome);
  return deepFreezeJson({
    schemaVersion: PROJECT_OVERVIEW_SCHEMA_VERSION,
    workspaceId: workspace.config.workspaceId,
    generatedFrom: {
      eventCount: events.length,
      headHash: events.at(-1)?.hash ?? null,
      projectSnapshotEventId: latest?.event.eventId ?? null,
      projectSnapshotHash: latest?.structure.snapshotHash ?? null
    },
    memory: {
      sessions: sessions.size,
      prompts: events.filter((event) => event.kind === "prompt.submitted").length,
      toolRequests: events.filter((event) => event.kind === "tool.requested").length,
      toolOutcomes: events.filter((event) => event.kind === "tool.completed").length,
      completedTurns: events.filter((event) => event.kind === "turn.completed").length,
      decisions: events.filter((event) => event.kind === "decision").length,
      summaries: events.filter((event) => event.kind === "summary").length,
      approvals: events.filter((event) => event.kind === "approval").length,
      firstRecordedAt: events[0]?.timestamp ?? null,
      lastRecordedAt: events.at(-1)?.timestamp ?? null
    },
    codebase: latest ? {
      available: true,
      fileCount: latest.structure.fileCount,
      directoryCount: latest.structure.directoryCount,
      totalBytes: latest.structure.totalBytes,
      indexedFiles: files.filter((file) => file.skipped === null).length,
      skippedFiles: files.filter((file) => file.skipped !== null).length,
      relationships: references.length,
      resolvedRelationships: references.filter((reference) => reference.target).length,
      languages: countBy(files.map((file) => file.language)),
      topDirectories: countBy(files.map((file) => topDirectory(file.path))).slice(0, 12),
      changes: latest.structure.changes
    } : {
      available: false,
      nextCommand: "qarinah scan"
    },
    recentOutcomes: outcomes,
    durableFiles: {
      authoritativeLedger: ".qarinah/events/events.jsonl",
      sqliteSearch: ".qarinah/index/qarinah.db",
      graph: ".qarinah/graph/graph.json",
      readableMemory: ".qarinah/records/CONTEXT.md",
      overview: ".qarinah/records/OVERVIEW.md",
      decisions: ".qarinah/records/DECISIONS.md",
      flow: ".qarinah/records/FLOW.md",
      changes: ".qarinah/records/CHANGES.md",
      dashboard: ".qarinah/dashboard/index.html"
    }
  });
}

export function renderProjectOverviewMarkdown(overview) {
  const codebase = overview.codebase.available
    ? [
        `- ${overview.codebase.fileCount} files across ${overview.codebase.directoryCount} directories`,
        `- ${overview.codebase.relationships} observed code and documentation relationships`,
        `- Languages: ${overview.codebase.languages.slice(0, 8).map(({ name, count }) => `${name} (${count})`).join(", ") || "none"}`
      ]
    : [`- No codebase map yet. Run \`${overview.codebase.nextCommand}\`.`];
  const outcomes = overview.recentOutcomes.length > 0
    ? overview.recentOutcomes.map((entry) => `- **${entry.title}** (${entry.kind})${entry.excerpt ? ` — ${entry.excerpt}` : ""}\n  Evidence: \`${entry.eventId}\`, \`${entry.hash}\``)
    : ["- No recorded outcomes yet."];
  return [
    "# Qarinah project overview",
    "",
    "## What Qarinah remembers",
    "",
    `- ${overview.memory.sessions} agent sessions`,
    `- ${overview.memory.prompts} user requests and ${overview.memory.completedTurns} completed turns`,
    `- ${overview.memory.toolRequests} tool requests and ${overview.memory.toolOutcomes} tool outcomes`,
    `- ${overview.memory.decisions} decisions, ${overview.memory.summaries} summaries, and ${overview.memory.approvals} approvals`,
    "",
    "## Codebase map",
    "",
    ...codebase,
    "",
    "## Latest outcomes",
    "",
    ...outcomes,
    "",
    "## Where it lives",
    "",
    `- Durable ledger: \`${overview.durableFiles.authoritativeLedger}\``,
    `- Fast SQLite search: \`${overview.durableFiles.sqliteSearch}\``,
    `- Relationship graph: \`${overview.durableFiles.graph}\``,
    `- Readable project memory: \`${overview.durableFiles.readableMemory}\``,
    `- Project overview: \`${overview.durableFiles.overview}\``,
    `- Decisions and reasons: \`${overview.durableFiles.decisions}\``,
    `- Execution flow: \`${overview.durableFiles.flow}\``,
    `- Major changes: \`${overview.durableFiles.changes}\``,
    `- Local dashboard: \`${overview.durableFiles.dashboard}\``,
    ""
  ].join("\n");
}

export async function writeProjectOverview(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const overview = await buildProjectOverview({ cwd: workspace.root, ...(options.maxOutcomes === undefined ? {} : { maxOutcomes: options.maxOutcomes }) });
  const output = options.output ?? ".qarinah/records/OVERVIEW.md";
  const destination = resolveWithin(workspace.root, output);
  await atomicWriteFile(destination, `${renderProjectOverviewMarkdown(overview)}\n`);
  return Object.freeze({ output: destination, overview });
}
