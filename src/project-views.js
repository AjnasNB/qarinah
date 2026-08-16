import { deepFreezeJson } from "./canonical.js";
import { markdownDataBlock, markdownInline, markdownSafeText } from "./markdown.js";
import { validateProjectStructureSnapshot } from "./project-structure.js";

export const PROJECT_RECORD_VIEWS_SCHEMA_VERSION = "qarinah.project-record-views.v1";

const MAX_DECISIONS = 500;
const MAX_FLOW_STEPS = 500;
const MAX_MAJOR_CHANGES = 250;
const MAX_TEXT = 2_000;

function boundedText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  return normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT - 3)}...` : normalized;
}

function toolName(event) {
  return boundedText(event.data?.toolName, boundedText(event.title, "tool"));
}

function eventEvidence(event) {
  return {
    eventId: event.eventId,
    hash: event.hash,
    timestamp: event.timestamp,
    sourceId: event.provenance.sourceId
  };
}

function sameExecution(left, right) {
  if (left.turnId && right.turnId) return left.turnId === right.turnId && left.sessionId === right.sessionId;
  return Boolean(left.sessionId && right.sessionId && left.sessionId === right.sessionId);
}

function relatedTools(decision, tools, explicitlyRelated) {
  return tools.filter((tool) => explicitlyRelated.has(tool.eventId) || sameExecution(decision, tool)).map((tool) => ({
    ...eventEvidence(tool),
    kind: tool.kind,
    name: toolName(tool),
    result: tool.kind === "tool.completed" ? boundedText(tool.body) : ""
  }));
}

function decisionRecord(event, tools, superseded) {
  const explicitlyRelated = new Set(event.relations.map((relation) => relation.target));
  return {
    ...eventEvidence(event),
    title: event.title,
    status: superseded.has(event.eventId) ? "superseded" : "current",
    reason: boundedText(event.data?.reason, boundedText(event.body, "No reason was recorded.")),
    outcome: boundedText(event.data?.outcome),
    alternatives: Array.isArray(event.data?.alternatives)
      ? event.data.alternatives.filter((value) => typeof value === "string").slice(0, 20).map((value) => boundedText(value))
      : [],
    affected: event.relations.filter((relation) => relation.type === "affects" || relation.type === "changed")
      .map((relation) => relation.target),
    tools: relatedTools(event, tools, explicitlyRelated)
  };
}

function flowStep(event, sequence) {
  return {
    sequence,
    ...eventEvidence(event),
    sessionId: event.sessionId,
    turnId: event.turnId,
    kind: event.kind,
    actor: event.actor,
    title: event.title,
    detail: boundedText(event.body),
    toolName: event.kind === "tool.requested" || event.kind === "tool.completed" ? toolName(event) : null
  };
}

function latestStructure(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const structure = events[index].data?.projectStructure;
    if (validateProjectStructureSnapshot(structure)) return { event: events[index], structure };
  }
  return null;
}

function majorChange(event) {
  const affected = event.relations.filter((relation) => ["affects", "changed", "produced"].includes(relation.type))
    .map((relation) => relation.target);
  return {
    ...eventEvidence(event),
    kind: event.kind,
    title: event.title,
    summary: boundedText(event.data?.outcome, boundedText(event.body)),
    affected
  };
}

export function buildProjectRecordViews(events, workspaceId) {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const superseded = new Set();
  for (const event of events) {
    for (const relation of event.relations) {
      if (relation.type === "supersedes" && byId.has(relation.target)) superseded.add(relation.target);
    }
  }
  const tools = events.filter((event) => event.kind === "tool.requested" || event.kind === "tool.completed");
  const decisions = events.filter((event) => event.kind === "decision").slice(-MAX_DECISIONS)
    .map((event) => decisionRecord(event, tools, superseded));
  const flowEvents = events.filter((event) => [
    "session.started", "prompt.submitted", "tool.requested", "tool.completed", "approval", "decision",
    "artifact", "summary", "turn.completed", "compaction.started", "compaction.completed"
  ].includes(event.kind)).slice(-MAX_FLOW_STEPS);
  const structure = latestStructure(events);
  return deepFreezeJson({
    schemaVersion: PROJECT_RECORD_VIEWS_SCHEMA_VERSION,
    workspaceId,
    generatedFrom: {
      eventCount: events.length,
      headHash: events.at(-1)?.hash ?? null
    },
    decisions,
    flow: flowEvents.map(flowStep),
    majorChanges: events.filter((event) => event.kind === "decision" || event.kind === "artifact" || event.kind === "turn.completed")
      .slice(-MAX_MAJOR_CHANGES).map(majorChange),
    projectChanges: structure ? {
      eventId: structure.event.eventId,
      hash: structure.event.hash,
      snapshotHash: structure.structure.snapshotHash,
      added: structure.structure.changes.added,
      changed: structure.structure.changes.changed,
      deleted: structure.structure.changes.deleted,
      renamed: structure.structure.changes.renamed
    } : null,
    limits: {
      decisions: MAX_DECISIONS,
      flowSteps: MAX_FLOW_STEPS,
      majorChanges: MAX_MAJOR_CHANGES
    }
  });
}

function evidenceLine(item) {
  return `Evidence: \`${item.eventId}\` · \`${item.hash}\``;
}

function markdownCode(value) {
  return markdownSafeText(value).replace(/\n+/gu, " ").replaceAll("`", "\\`");
}

export function renderDecisionsMarkdown(view) {
  const lines = [
    "# Project decisions",
    "",
    "> Generated from Qarinah's verified ledger. Edit the ledger through a supported record or hook, then rebuild this view.",
    "",
    `- Workspace: \`${view.workspaceId}\``,
    `- Decisions shown: ${view.decisions.length} (latest ${view.limits.decisions} maximum)`,
    `- Ledger head: ${view.generatedFrom.headHash ? `\`${view.generatedFrom.headHash}\`` : "none"}`,
    ""
  ];
  if (view.decisions.length === 0) lines.push("No decisions have been recorded.", "");
  for (const decision of [...view.decisions].reverse()) {
    lines.push(`## ${markdownInline(decision.title)}`, "");
    lines.push(`- Status: **${decision.status}**`);
    lines.push(`- Recorded: ${decision.timestamp}`);
    lines.push(`- ${evidenceLine(decision)}`);
    lines.push("", "### Reason", "", markdownDataBlock(decision.reason), "");
    if (decision.outcome) lines.push("### Outcome", "", markdownDataBlock(decision.outcome), "");
    if (decision.alternatives.length) {
      lines.push("### Alternatives considered", "", ...decision.alternatives.map((value) => `- ${markdownInline(value)}`), "");
    }
    if (decision.tools.length) {
      lines.push("### Tools used in this execution", "");
      for (const tool of decision.tools) lines.push(`- \`${markdownCode(tool.name)}\` — ${tool.kind} — \`${tool.eventId}\``);
      lines.push("");
    }
    if (decision.affected.length) lines.push("### Affected targets", "", ...decision.affected.map((value) => `- \`${markdownCode(value)}\``), "");
  }
  return `${lines.join("\n")}\n`;
}

export function renderFlowMarkdown(view) {
  const lines = [
    "# Project execution flow",
    "",
    "> A bounded chronological view of permitted agent and tool events. Hidden reasoning is never included.",
    "",
    `- Workspace: \`${view.workspaceId}\``,
    `- Steps shown: ${view.flow.length} (latest ${view.limits.flowSteps} maximum)`,
    ""
  ];
  if (view.flow.length === 0) lines.push("No execution steps have been recorded.", "");
  for (const step of view.flow) {
    const identity = [step.sessionId ? `session \`${markdownCode(step.sessionId)}\`` : null, step.turnId ? `turn \`${markdownCode(step.turnId)}\`` : null]
      .filter(Boolean).join(" · ");
    lines.push(`## ${step.sequence}. ${markdownInline(step.title)}`, "");
    lines.push(`- Kind: \`${step.kind}\``);
    lines.push(`- Actor: \`${step.actor.type}:${markdownInline(step.actor.id)}\``);
    lines.push(`- Time: ${step.timestamp}`);
    if (identity) lines.push(`- Execution: ${identity}`);
    if (step.toolName) lines.push(`- Tool: \`${markdownCode(step.toolName)}\``);
    lines.push(`- ${evidenceLine(step)}`);
    if (step.detail) lines.push("", markdownDataBlock(step.detail));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function renderChangesMarkdown(view) {
  const lines = [
    "# Major project changes",
    "",
    "> Generated from recorded decisions, artifacts, completed turns, and the latest bounded codebase scan.",
    "",
    `- Workspace: \`${view.workspaceId}\``,
    `- Recorded changes shown: ${view.majorChanges.length} (latest ${view.limits.majorChanges} maximum)`,
    ""
  ];
  if (view.projectChanges) {
    lines.push("## Latest codebase scan", "");
    lines.push(`- Snapshot: \`${view.projectChanges.snapshotHash}\``);
    lines.push(`- Added: ${view.projectChanges.added.length}`);
    lines.push(`- Changed: ${view.projectChanges.changed.length}`);
    lines.push(`- Deleted: ${view.projectChanges.deleted.length}`);
    lines.push(`- Renamed: ${view.projectChanges.renamed.length}`, "");
    for (const value of view.projectChanges.added) lines.push(`- Added \`${markdownCode(value)}\``);
    for (const value of view.projectChanges.changed) lines.push(`- Changed \`${markdownCode(value)}\``);
    for (const value of view.projectChanges.deleted) lines.push(`- Deleted \`${markdownCode(value)}\``);
    for (const value of view.projectChanges.renamed) lines.push(`- Renamed \`${markdownCode(value.from)}\` → \`${markdownCode(value.to)}\``);
    lines.push("");
  }
  if (view.majorChanges.length === 0) lines.push("No major changes have been recorded.", "");
  for (const change of [...view.majorChanges].reverse()) {
    lines.push(`## ${markdownInline(change.title)}`, "");
    lines.push(`- Kind: \`${change.kind}\``);
    lines.push(`- Time: ${change.timestamp}`);
    lines.push(`- ${evidenceLine(change)}`);
    if (change.affected.length) lines.push(`- Affected: ${change.affected.map((value) => `\`${markdownCode(value)}\``).join(", ")}`);
    if (change.summary) lines.push("", markdownDataBlock(change.summary));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function renderProjectRecordViews(view) {
  return Object.freeze({
    decisions: renderDecisionsMarkdown(view),
    flow: renderFlowMarkdown(view),
    changes: renderChangesMarkdown(view)
  });
}
