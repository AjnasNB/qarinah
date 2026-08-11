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

function paginationControls(id, label, total, pageSize) {
  if (total <= pageSize) return "";
  return `<nav class="pager" data-pager="${escapeHtml(id)}" aria-label="${escapeHtml(label)} pages" hidden><button type="button" data-page-action="previous">Previous</button><output data-page-status aria-live="polite"></output><button type="button" data-page-action="next">Next</button></nav>`;
}

function list(items, empty, { id, label, pageSize = 8 }) {
  if (items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<div class="page-set" data-page-set="${escapeHtml(id)}" data-page-size="${pageSize}"><ul>${items.map((item) => `<li data-page-item><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.timestamp)}</span><code>${escapeHtml(item.eventId)}</code></li>`).join("")}</ul>${paginationControls(id, label, items.length, pageSize)}</div>`;
}

function decisionList(items, empty, { id, label, pageSize = 6 }) {
  if (items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<div class="page-set" data-page-set="${escapeHtml(id)}" data-page-size="${pageSize}"><div class="records">${items.map((item) => `<article class="record" data-page-item><div class="record-head"><h3>${escapeHtml(item.title)}</h3><time>${escapeHtml(item.timestamp)}</time></div><p><strong>Reason:</strong> ${escapeHtml(item.reason)}</p>${item.outcome ? `<p><strong>Outcome:</strong> ${escapeHtml(item.outcome)}</p>` : ""}${item.alternatives.length ? `<p><strong>Alternatives:</strong> ${escapeHtml(item.alternatives.join("; "))}</p>` : ""}${item.tools.length ? `<p><strong>Tools:</strong> ${item.tools.map((tool) => `<code>${escapeHtml(tool.name)}</code>`).join(" ")}</p>` : ""}<small>Evidence <code>${escapeHtml(item.eventId)}</code> · <code>${escapeHtml(item.hash)}</code></small></article>`).join("")}</div>${paginationControls(id, label, items.length, pageSize)}</div>`;
}

function paginatedTable({ id, label, headings, rows, pageSize = 10 }) {
  if (rows.length === 0) return "";
  return `<div class="page-set" data-page-set="${escapeHtml(id)}" data-page-size="${pageSize}"><div class="table-scroll" role="region" aria-label="${escapeHtml(label)} table" tabindex="0"><table><thead><tr>${headings.map((heading) => `<th scope="col">${escapeHtml(heading)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr data-page-item>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${paginationControls(id, label, rows.length, pageSize)}</div>`;
}

function tableRegion(label, content) {
  return `<div class="table-scroll" role="region" aria-label="${escapeHtml(label)} table" tabindex="0">${content}</div>`;
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23090d12'/%3E%3Cpath d='M18 18h28v20H31l-9 9v-9h-4z' fill='%2335e0aa'/%3E%3C/svg%3E">
<style>
:root{color-scheme:dark;--bg:#090d12;--panel:#101720;--line:#27313c;--text:#edf5f2;--muted:#9aa7b2;--mint:#35e0aa;--warn:#ffc857}
*{box-sizing:border-box}html{scrollbar-gutter:stable}body{margin:0;overflow-x:hidden;background:var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}
header,main{width:min(1180px,calc(100% - 32px));margin:auto}header{padding:56px 0 28px;border-bottom:1px solid var(--line)}
.eyebrow{color:var(--mint);font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
h1{font-size:clamp(36px,6vw,72px);line-height:.98;max-width:900px;margin:18px 0}p{color:var(--muted)}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:28px 0}
.metric{background:var(--panel);padding:22px}.metric strong{display:block;font-size:30px;color:var(--mint)}.metric span{color:var(--muted)}
main{padding:26px 0 80px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
section{background:var(--panel);border:1px solid var(--line);padding:24px;min-width:0}section.wide{grid-column:1/-1}
h2{font-size:21px;margin:0 0 16px}ul{list-style:none;padding:0;margin:0}li{display:grid;grid-template-columns:1fr auto;gap:6px 18px;padding:13px 0;border-top:1px solid var(--line)}
li:first-child{border-top:0}li strong{min-width:0;overflow-wrap:anywhere}li span,li code{color:var(--muted);font-size:12px}li code{grid-column:1/-1;overflow-wrap:anywhere}
.table-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;border:1px solid var(--line);scrollbar-width:thin}.table-scroll:focus-visible{outline:2px solid var(--mint);outline-offset:3px}.table-scroll table{min-width:680px;border-collapse:collapse;width:100%}.table-scroll th,.table-scroll td{text-align:left;padding:12px;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}.table-scroll thead th{border-top:0}.table-scroll th{color:var(--muted);font-size:12px}
.records{display:grid;gap:12px}.record{border-top:1px solid var(--line);padding-top:15px}.record:first-child{border-top:0;padding-top:0}.record-head{display:flex;gap:18px;align-items:baseline;justify-content:space-between}.record h3{font-size:16px;margin:0}.record p{margin:8px 0}.record small,.record time{color:var(--muted);font-size:12px}.record small code{overflow-wrap:anywhere}
.pager{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px}.pager button{min-width:92px;min-height:42px;padding:8px 13px;border:1px solid var(--line);border-radius:8px;color:var(--text);background:#17212d;font:700 13px/1 system-ui,sans-serif;cursor:pointer}.pager button:hover:not(:disabled){border-color:var(--mint);color:var(--mint)}.pager button:focus-visible{outline:2px solid var(--mint);outline-offset:2px}.pager button:disabled{cursor:not-allowed;opacity:.45}.pager output{min-width:92px;color:var(--muted);font:700 12px/1.2 ui-monospace,monospace;text-align:center}
.empty{margin:0}.warning{color:var(--warn)}[hidden]{display:none!important}
@media(max-width:760px){header,main{width:min(100% - 20px,1180px)}header{padding:36px 0 22px}h1{font-size:clamp(34px,12vw,54px)}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{min-width:0;padding:17px}.metric strong{font-size:24px;overflow-wrap:anywhere}main{padding-top:18px}.grid{grid-template-columns:1fr;gap:12px}section,section.wide{grid-column:auto;padding:18px}li{grid-template-columns:1fr}.record-head{display:block}.record-head time{display:block;margin-top:4px}.table-scroll table{min-width:620px}.pager{justify-content:space-between}.pager button{min-width:84px}}
@media(max-width:420px){.metrics{grid-template-columns:1fr}.pager{display:grid;grid-template-columns:1fr 1fr}.pager output{grid-column:1/-1;grid-row:1;min-width:0}.pager button{width:100%}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
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
<section><h2>Current decisions and reasons</h2>${decisionList(data.currentDecisions,"No current decisions recorded.",{ id:"current-decisions",label:"Current decisions" })}</section>
<section><h2>Superseded decisions</h2>${decisionList(data.supersededDecisions,"No superseded decisions.",{ id:"superseded-decisions",label:"Superseded decisions" })}</section>
<section class="wide"><h2>Conflicts requiring attention</h2>${data.conflicts.length === 0 ? '<p class="empty">No recorded conflicts.</p>' : paginatedTable({ id:"conflicts",label:"Conflicts",headings:["Claim","Conflicts with"],rows:data.conflicts.map((conflict) => [escapeHtml(conflict.source.title),escapeHtml(conflict.target.title)]) })}</section>
<section class="wide"><h2>Execution flow</h2>${data.executionFlow.length === 0 ? '<p class="empty">No execution steps recorded.</p>' : paginatedTable({ id:"execution-flow",label:"Execution flow",headings:["#","Kind","Action","Tool","Evidence"],rows:data.executionFlow.map((step) => [escapeHtml(step.sequence),`<code>${escapeHtml(step.kind)}</code>`,escapeHtml(step.title),step.toolName ? `<code>${escapeHtml(step.toolName)}</code>` : "—",`<code>${escapeHtml(step.eventId)}</code>`]) })}</section>
<section><h2>Tools called</h2>${list(data.tools.map((tool) => ({ ...tool, title: `${tool.toolName} · ${tool.kind}` })),"No tool activity recorded.",{ id:"tools",label:"Tool activity" })}</section>
<section><h2>Major changes</h2>${list(data.majorChanges,"No major changes recorded.",{ id:"major-changes",label:"Major changes" })}</section>
<section><h2>Memory footprint</h2>${tableRegion("Memory footprint",`<table><tbody>
<tr><th>Project memory on disk</th><td>${footprint.retained.storageBytes.total.toLocaleString()} bytes</td></tr>
<tr><th>Measured imported source</th><td>${escapeHtml(imported)}</td></tr>
<tr><th>Task pack delivered</th><td>${footprint.deliveredPack.estimatedTokens.toLocaleString()} estimated tokens</td></tr>
<tr><th>Pack identity</th><td><code>${escapeHtml(footprint.deliveredPack.manifestHash)}</code></td></tr>
</tbody></table>`)}<p>Retained project memory and the small task-specific pack are different quantities. The dashboard never presents this as lossless archive compression.</p></section>
<section><h2>Source citations</h2>${list(data.citations,"No external source citations recorded.",{ id:"citations",label:"Source citations" })}</section>
<section><h2>Agent activity timeline</h2>${list(data.activity,"No activity recorded.",{ id:"activity",label:"Agent activity" })}</section>
<section class="wide"><h2>Files and systems affected</h2>${data.affectedFiles.length === 0 ? '<p class="empty">Run qarinah scan to populate the project map.</p>' : paginatedTable({ id:"affected-files",label:"Files and systems affected",headings:["Path","Language","Content hash"],rows:data.affectedFiles.map((file) => [escapeHtml(file.path),escapeHtml(file.language),`<code>${escapeHtml(file.contentHash)}</code>`]) })}</section>
</div></main><script>
for (const pageSet of document.querySelectorAll("[data-page-set]")) {
  const items = [...pageSet.querySelectorAll("[data-page-item]")];
  const pageSize = Number(pageSet.dataset.pageSize);
  const pager = pageSet.querySelector("[data-pager]");
  if (!pager || !Number.isSafeInteger(pageSize) || pageSize < 1) continue;
  const previous = pager.querySelector('[data-page-action="previous"]');
  const next = pager.querySelector('[data-page-action="next"]');
  const status = pager.querySelector("[data-page-status]");
  let page = 0;
  const pageCount = Math.ceil(items.length / pageSize);
  pager.hidden = false;
  const showPage = () => {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, items.length);
    items.forEach((item, index) => { item.hidden = index < start || index >= end; });
    previous.disabled = page === 0;
    next.disabled = page === pageCount - 1;
    status.textContent = (start + 1) + "–" + end + " of " + items.length;
  };
  previous.addEventListener("click", () => { if (page > 0) { page -= 1; showPage(); } });
  next.addEventListener("click", () => { if (page + 1 < pageCount) { page += 1; showPage(); } });
  showPage();
}
</script></body></html>`;
}

export async function writeMemoryDashboard(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const data = await buildMemoryDashboard({ ...options, cwd: workspace.root });
  const output = options.output ?? ".qarinah/dashboard/index.html";
  const destination = resolveWithin(workspace.root, output);
  await atomicWriteFile(destination, renderMemoryDashboard(data));
  return Object.freeze({ output: destination, data });
}
