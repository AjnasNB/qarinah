import { deepFreezeJson } from "./canonical.js";
import { measureMemoryFootprint } from "./memory-footprint.js";
import { buildProjectRecordViews } from "./project-views.js";
import { readEvents } from "./store.js";
import { atomicWriteFile, loadWorkspace, resolveWithin } from "./workspace.js";

function boundedUsage(value, label) {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new TypeError(`${label} must be an integer from 0 to 1000000000.`);
  }
  return value;
}

function eventSummary(event) {
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    kind: event.kind,
    title: event.title,
    confidence: event.confidence,
    actor: event.actor,
    sourceId: event.provenance.sourceId,
    hash: event.hash
  };
}

export async function buildMemoryDashboard(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const superseded = new Set();
  const conflicts = [];
  for (const event of events) {
    for (const relation of event.relations) {
      if (relation.type === "supersedes" && byId.has(relation.target)) superseded.add(relation.target);
      if (relation.type === "contradicts" && byId.has(relation.target)) {
        conflicts.push({ source: eventSummary(event), target: eventSummary(byId.get(relation.target)) });
      }
    }
  }
  const decisions = events.filter((event) => event.kind === "decision");
  const projectRecords = buildProjectRecordViews(events, workspace.config.workspaceId);
  const tools = events.filter((event) => event.kind === "tool.requested" || event.kind === "tool.completed");
  const latestStructure = [...events].reverse().find((event) => event.data?.projectStructure?.files);
  const baselineTokens = boundedUsage(options.baselineTokens, "baselineTokens");
  const deliveredTokens = boundedUsage(options.deliveredTokens, "deliveredTokens");
  if ((baselineTokens === null) !== (deliveredTokens === null)) {
    throw new TypeError("baselineTokens and deliveredTokens must be supplied together.");
  }
  const savedTokens = baselineTokens === null ? null : Math.max(0, baselineTokens - deliveredTokens);
  const savingsPercent = baselineTokens > 0
    ? Math.round((savedTokens / baselineTokens) * 10000) / 100
    : null;
  const memoryFootprint = await measureMemoryFootprint({ cwd: workspace.root });
  return deepFreezeJson({
    schemaVersion: "qarinah.memory-dashboard.v2",
    workspaceId: workspace.config.workspaceId,
    generatedAt: (options.clock?.() ?? new Date()).toISOString(),
    capture: workspace.config.capture,
    totals: {
      events: events.length,
      decisions: decisions.length,
      currentDecisions: decisions.filter((event) => !superseded.has(event.eventId)).length,
      supersededDecisions: decisions.filter((event) => superseded.has(event.eventId)).length,
      conflicts: conflicts.length,
      tools: tools.length,
      flowSteps: projectRecords.flow.length,
      majorChanges: projectRecords.majorChanges.length,
      citedSources: new Set(events.map((event) => event.provenance.sourceId).filter(Boolean)).size,
      affectedFiles: latestStructure?.data.projectStructure.files.length ?? 0
    },
    contextSavings: {
      status: baselineTokens === null ? "not-measured" : "measured",
      baselineTokens,
      deliveredTokens,
      savedTokens,
      savingsPercent
    },
    memoryFootprint,
    currentDecisions: projectRecords.decisions.filter((decision) => decision.status === "current"),
    supersededDecisions: projectRecords.decisions.filter((decision) => decision.status === "superseded"),
    tools: tools.slice(-100).reverse().map((event) => ({
      ...eventSummary(event),
      sessionId: event.sessionId,
      turnId: event.turnId,
      toolName: typeof event.data?.toolName === "string" ? event.data.toolName : event.title,
      result: event.kind === "tool.completed" ? event.body : ""
    })),
    executionFlow: projectRecords.flow,
    majorChanges: projectRecords.majorChanges,
    latestProjectChanges: projectRecords.projectChanges,
    durableRecords: {
      decisions: ".qarinah/records/DECISIONS.md",
      flow: ".qarinah/records/FLOW.md",
      changes: ".qarinah/records/CHANGES.md"
    },
    conflicts,
    citations: events.filter((event) => event.provenance.sourceId).map(eventSummary),
    activity: events.slice(-100).reverse().map(eventSummary),
    affectedFiles: (latestStructure?.data.projectStructure.files ?? []).map((file) => ({
      path: file.path,
      contentHash: file.contentHash,
      language: file.language
    }))
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function list(items, empty) {
  if (items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.timestamp)}</span><code>${escapeHtml(item.eventId)}</code></li>`).join("")}</ul>`;
}

function decisionList(items, empty) {
  if (items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<div class="records">${items.map((item) => `<article class="record"><div class="record-head"><h3>${escapeHtml(item.title)}</h3><time>${escapeHtml(item.timestamp)}</time></div><p><strong>Reason:</strong> ${escapeHtml(item.reason)}</p>${item.outcome ? `<p><strong>Outcome:</strong> ${escapeHtml(item.outcome)}</p>` : ""}${item.alternatives.length ? `<p><strong>Alternatives:</strong> ${escapeHtml(item.alternatives.join("; "))}</p>` : ""}${item.tools.length ? `<p><strong>Tools:</strong> ${item.tools.map((tool) => `<code>${escapeHtml(tool.name)}</code>`).join(" ")}</p>` : ""}<small>Evidence <code>${escapeHtml(item.eventId)}</code> · <code>${escapeHtml(item.hash)}</code></small></article>`).join("")}</div>`;
}

export function renderMemoryDashboard(data) {
  const savings = data.contextSavings.status === "measured"
    ? `${data.contextSavings.savingsPercent}% (${data.contextSavings.savedTokens.toLocaleString()} estimated tokens)`
    : "Not measured for this workspace";
  const footprint = data.memoryFootprint;
  const imported = footprint.retained.importedSourceBytesKnown
    ? `${footprint.retained.importedSourceBytes.toLocaleString()} bytes`
    : "No measured import receipt";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Qarinah memory dashboard</title>
<style>
:root{color-scheme:dark;--bg:#090d12;--panel:#101720;--line:#27313c;--text:#edf5f2;--muted:#9aa7b2;--mint:#35e0aa;--warn:#ffc857}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}
header,main{width:min(1180px,calc(100% - 32px));margin:auto}header{padding:56px 0 28px;border-bottom:1px solid var(--line)}
.eyebrow{color:var(--mint);font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
h1{font-size:clamp(36px,6vw,72px);line-height:.98;max-width:900px;margin:18px 0}p{color:var(--muted)}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:28px 0}
.metric{background:var(--panel);padding:22px}.metric strong{display:block;font-size:30px;color:var(--mint)}.metric span{color:var(--muted)}
main{padding:26px 0 80px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
section{background:var(--panel);border:1px solid var(--line);padding:24px;min-width:0}section.wide{grid-column:1/-1}
h2{font-size:21px;margin:0 0 16px}ul{list-style:none;padding:0;margin:0}li{display:grid;grid-template-columns:1fr auto;gap:6px 18px;padding:13px 0;border-top:1px solid var(--line)}
li:first-child{border-top:0}li span,li code{color:var(--muted);font-size:12px}li code{grid-column:1/-1;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:12px}
.records{display:grid;gap:12px}.record{border-top:1px solid var(--line);padding-top:15px}.record:first-child{border-top:0;padding-top:0}.record-head{display:flex;gap:18px;align-items:baseline;justify-content:space-between}.record h3{font-size:16px;margin:0}.record p{margin:8px 0}.record small,.record time{color:var(--muted);font-size:12px}.record small code{overflow-wrap:anywhere}
.empty{margin:0}.warning{color:var(--warn)}@media(max-width:760px){.grid{grid-template-columns:1fr}section.wide{grid-column:auto}li{grid-template-columns:1fr}.record-head{display:block}}
</style></head><body>
<header><div class="eyebrow">Qarinah · local dashboard</div><h1>Shared memory your team can inspect.</h1>
<p>Workspace <code>${escapeHtml(data.workspaceId)}</code> · generated ${escapeHtml(data.generatedAt)} · ${escapeHtml(data.capture)} capture</p>
<div class="metrics">
<div class="metric"><strong>${data.totals.currentDecisions}</strong><span>current decisions</span></div>
<div class="metric"><strong>${data.totals.supersededDecisions}</strong><span>superseded</span></div>
<div class="metric"><strong>${data.totals.conflicts}</strong><span>conflicts</span></div>
<div class="metric"><strong>${data.totals.citedSources}</strong><span>cited sources</span></div>
<div class="metric"><strong>${data.totals.tools}</strong><span>tool events</span></div>
<div class="metric"><strong>${escapeHtml(savings)}</strong><span>context saved</span></div>
</div></header>
<main><div class="grid">
<section><h2>Current decisions and reasons</h2>${decisionList(data.currentDecisions,"No current decisions recorded.")}</section>
<section><h2>Superseded decisions</h2>${decisionList(data.supersededDecisions,"No superseded decisions.")}</section>
<section class="wide"><h2>Conflicts requiring attention</h2>${data.conflicts.length === 0 ? '<p class="empty">No recorded conflicts.</p>' : `<table><thead><tr><th>Claim</th><th>Conflicts with</th></tr></thead><tbody>${data.conflicts.map((conflict) => `<tr><td>${escapeHtml(conflict.source.title)}</td><td>${escapeHtml(conflict.target.title)}</td></tr>`).join("")}</tbody></table>`}</section>
<section class="wide"><h2>Execution flow</h2>${data.executionFlow.length === 0 ? '<p class="empty">No execution steps recorded.</p>' : `<table><thead><tr><th>#</th><th>Kind</th><th>Action</th><th>Tool</th><th>Evidence</th></tr></thead><tbody>${data.executionFlow.map((step) => `<tr><td>${step.sequence}</td><td><code>${escapeHtml(step.kind)}</code></td><td>${escapeHtml(step.title)}</td><td>${step.toolName ? `<code>${escapeHtml(step.toolName)}</code>` : "—"}</td><td><code>${escapeHtml(step.eventId)}</code></td></tr>`).join("")}</tbody></table>`}</section>
<section><h2>Tools called</h2>${list(data.tools.map((tool) => ({ ...tool, title: `${tool.toolName} · ${tool.kind}` })),"No tool activity recorded.")}</section>
<section><h2>Major changes</h2>${list(data.majorChanges,"No major changes recorded.")}</section>
<section><h2>Memory footprint</h2><table><tbody>
<tr><th>Project memory on disk</th><td>${footprint.retained.storageBytes.total.toLocaleString()} bytes</td></tr>
<tr><th>Measured imported source</th><td>${escapeHtml(imported)}</td></tr>
<tr><th>Task pack delivered</th><td>${footprint.deliveredPack.estimatedTokens.toLocaleString()} estimated tokens</td></tr>
<tr><th>Pack identity</th><td><code>${escapeHtml(footprint.deliveredPack.manifestHash)}</code></td></tr>
</tbody></table><p>Retained project memory and the small task-specific pack are different quantities. The dashboard never presents this as lossless archive compression.</p></section>
<section><h2>Source citations</h2>${list(data.citations,"No external source citations recorded.")}</section>
<section><h2>Agent activity timeline</h2>${list(data.activity,"No activity recorded.")}</section>
<section class="wide"><h2>Files and systems affected</h2>${data.affectedFiles.length === 0 ? '<p class="empty">Run qarinah scan to populate the project map.</p>' : `<table><thead><tr><th>Path</th><th>Language</th><th>Content hash</th></tr></thead><tbody>${data.affectedFiles.map((file) => `<tr><td>${escapeHtml(file.path)}</td><td>${escapeHtml(file.language)}</td><td><code>${escapeHtml(file.contentHash)}</code></td></tr>`).join("")}</tbody></table>`}</section>
</div></main></body></html>`;
}

export async function writeMemoryDashboard(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const data = await buildMemoryDashboard({ ...options, cwd: workspace.root });
  const output = options.output ?? ".qarinah/dashboard/index.html";
  const destination = resolveWithin(workspace.root, output);
  await atomicWriteFile(destination, renderMemoryDashboard(data));
  return Object.freeze({ output: destination, data });
}
