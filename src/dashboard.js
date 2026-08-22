import path from "node:path";
import { deepFreezeJson } from "./canonical.js";
import { buildLinkedProjectMemory, rankLinkedProjectMemory } from "./linked-memory.js";
import { measureMemoryFootprint } from "./memory-footprint.js";
import { buildProjectRecordViews } from "./project-views.js";
import { buildSessionContextReceipts } from "./session-receipts.js";
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
    repositoryId: event.repository?.id ?? null,
    sourceId: event.provenance.sourceId,
    hash: event.hash
  };
}

export function compactLinkedGraph(memory) {
  const typeLimits = { worktree: 8, memory: 36, file: 48, concept: 40, directory: 20, reference: 12 };
  const admitted = rankLinkedProjectMemory(memory, "", { limit: 100 });
  const selected = [];
  for (const type of Object.keys(typeLimits)) {
    selected.push(...admitted.items.map((item) => item.node)
      .filter((node) => node.type === type)
      .sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))
      .slice(0, typeLimits[type]));
  }
  const selectedIds = new Set(selected.map((node) => node.id));
  const edges = memory.edges
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .sort((left, right) => right.weight - left.weight || `${left.source}\0${left.target}`.localeCompare(`${right.source}\0${right.target}`))
    .slice(0, 420);
  return {
    schemaVersion: memory.schemaVersion,
    manifestHash: admitted.sourceManifestHash,
    statistics: {
      ...memory.statistics,
      rankedCandidates: admitted.items.length,
      selectedNodes: selected.length,
      renderedEdges: edges.length
    },
    nodes: selected.map((node) => ({
      id: node.id,
      type: node.type,
      kind: node.kind,
      label: node.label,
      path: node.path,
      timestamp: node.timestamp,
      confidence: node.confidence,
      status: node.status,
      conflicted: node.conflicted,
      importance: node.importance,
      repositoryRank: node.repositoryRank,
      incoming: node.incoming,
      outgoing: node.outgoing,
      sourceEventId: node.sourceEventId,
      evidenceHash: node.evidenceHash,
      contentHash: node.contentHash,
      terms: node.signature.slice(0, 12).map((entry) => entry.term)
    })),
    edges
  };
}

export async function buildMemoryDashboard(options = {}) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const generatedAt = (options.clock?.() ?? new Date()).toISOString();
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
  const suppliedBaselineTokens = boundedUsage(options.baselineTokens, "baselineTokens");
  const suppliedDeliveredTokens = boundedUsage(options.deliveredTokens, "deliveredTokens");
  if ((suppliedBaselineTokens === null) !== (suppliedDeliveredTokens === null)) {
    throw new TypeError("baselineTokens and deliveredTokens must be supplied together.");
  }
  const memoryFootprint = await measureMemoryFootprint({ cwd: workspace.root, inMemory: true, updateCheckpoint: false });
  const baselineTokens = suppliedBaselineTokens ?? memoryFootprint.comparison.baselineTokens;
  const deliveredTokens = suppliedDeliveredTokens ?? memoryFootprint.comparison.deliveredTokens;
  const savedTokens = baselineTokens === null ? null : Math.max(0, baselineTokens - deliveredTokens);
  const savingsPercent = baselineTokens > 0
    ? Math.round((savedTokens / baselineTokens) * 10000) / 100
    : null;
  const baselineToPackRatio = deliveredTokens > 0 && baselineTokens !== null
    ? Math.round((baselineTokens / deliveredTokens) * 100) / 100
    : null;
  const repositoryIds = [...new Set(events.map((event) => event.repository?.id).filter(Boolean))].sort();
  const latestEvent = events.at(-1) ?? null;
  const linkedMemory = buildLinkedProjectMemory(events, workspace.config.workspaceId, { asOf: generatedAt });
  const sessionReceipts = await buildSessionContextReceipts({
    cwd: workspace.root,
    write: false,
    clock: () => new Date(generatedAt)
  });
  return deepFreezeJson({
    schemaVersion: "qarinah.memory-dashboard.v2",
    workspaceId: workspace.config.workspaceId,
    workspace: {
      name: path.basename(workspace.root),
      root: workspace.root,
      workspaceId: workspace.config.workspaceId,
      worktree: workspace.worktree,
      repositoryIds,
      ledgerPath: ".qarinah/events/events.jsonl",
      ledgerHeadHash: latestEvent?.hash ?? null,
      ledgerBytes: memoryFootprint.retained.storageBytes.ledger,
      lastActivityAt: latestEvent?.timestamp ?? null,
      eventCount: events.length
    },
    generatedAt,
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
      affectedFiles: latestStructure?.data.projectStructure.files.length ?? 0,
      graphNodes: linkedMemory.statistics.nodes,
      graphEdges: linkedMemory.statistics.edges,
      graphConcepts: linkedMemory.statistics.concepts
    },
    contextSavings: {
      status: baselineTokens === null ? "not-measured" : "measured",
      source: suppliedBaselineTokens === null ? memoryFootprint.comparison.source : "caller-supplied",
      baselineTokens,
      deliveredTokens,
      savedTokens,
      savingsPercent,
      baselineToPackRatio
    },
    sessionReceipts,
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
    })),
    linkedGraph: compactLinkedGraph(linkedMemory)
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

export function renderMemoryDashboard(data, options = {}) {
  const footprint = data.memoryFootprint;
  const savingsBasis = data.contextSavings.source === "caller-supplied"
    ? "supplied baseline → task pack"
    : data.contextSavings.source === "portable-chars-div-4-from-compact-import-receipts"
      ? "import receipt → task pack"
      : "authoritative ledger → task pack";
  const savingsValue = data.contextSavings.status === "measured" && data.contextSavings.savingsPercent !== null
    ? `${data.contextSavings.savingsPercent}%`
    : footprint.deliveredPack.estimatedTokens.toLocaleString();
  const savingsLabel = data.contextSavings.status === "measured" && data.contextSavings.savingsPercent !== null
    ? `${data.contextSavings.baselineTokens.toLocaleString()} → ${data.contextSavings.deliveredTokens.toLocaleString()} estimated tokens · ${data.contextSavings.baselineToPackRatio}:1 · ${savingsBasis}`
    : "estimated tokens in current task pack · no retained baseline yet";
  const imported = footprint.retained.importedSourceBytesKnown
    ? `${footprint.retained.importedSourceBytes.toLocaleString()} bytes`
    : "Not present; authoritative ledger is the automatic baseline";
  const workspace = data.workspace ?? {
    name: data.workspaceId,
    root: "",
    workspaceId: data.workspaceId,
    worktree: null,
    repositoryIds: [],
    ledgerPath: ".qarinah/events/events.jsonl",
    ledgerHeadHash: null,
    ledgerBytes: 0,
    lastActivityAt: null,
    eventCount: data.totals.events
  };
  const projects = Array.isArray(options.projects) ? options.projects : [];
  const projectNavigation = projects.length > 1
    ? `<nav class="project-nav" aria-label="Local Qarinah worktrees">${projects.map((project) => `<a href="${escapeHtml(project.href)}"${project.workspaceId === workspace.workspaceId ? ' aria-current="page"' : ""}>${escapeHtml(project.branch ?? project.name)}<small>${escapeHtml(project.commit?.slice(0, 10) ?? project.workspaceId)}</small></a>`).join("")}</nav>`
    : "";
  const worktreeComparison = projects.length > 1
    ? `<section class="wide"><h2>Cross-worktree comparison</h2><p>Each checkout keeps its own writable ledger. This view compares identities and live heads without merging branch memory.</p>${paginatedTable({
        id: "worktree-comparison",
        label: "Cross-worktree comparison",
        headings: ["Worktree", "Commit", "Workspace", "Events", "Last activity"],
        rows: projects.map((project) => [
          `<a href="${escapeHtml(project.href)}">${escapeHtml(project.branch ?? project.name)}</a><br><small>${escapeHtml(project.root)}</small>`,
          `<code>${escapeHtml(project.commit?.slice(0, 12) ?? "unborn")}</code>`,
          `<code>${escapeHtml(project.workspaceId)}</code>`,
          `<span data-worktree-events="${escapeHtml(project.workspaceId)}">${project.workspaceId === workspace.workspaceId ? workspace.eventCount.toLocaleString() : "Loading..."}</span>`,
          `<span data-worktree-activity="${escapeHtml(project.workspaceId)}">${project.workspaceId === workspace.workspaceId ? escapeHtml(workspace.lastActivityAt ?? "No retained activity") : "Loading..."}</span>`
        ]),
        pageSize: 8
      })}</section>`
    : "";
  const sessionReceipts = data.sessionReceipts.receipts.length === 0
    ? '<p class="empty">No host-supplied session identifiers have been retained yet.</p>'
    : paginatedTable({
        id: "session-context-receipts",
        label: "Exact per-session context receipts",
        headings: ["Session", "Source", "Delivered", "Selection", "Receipt"],
        rows: data.sessionReceipts.receipts.map((receipt) => [
          `<code>${escapeHtml(receipt.sessionId)}</code><br><small>${escapeHtml(receipt.interval.startedAt ?? "Unknown start")} to ${escapeHtml(receipt.interval.completedAt ?? "open")}</small>`,
          `${receipt.source.eventCount.toLocaleString()} events<br>${receipt.source.estimatedTokens.toLocaleString()} estimated tokens`,
          `${receipt.delivered.itemCount.toLocaleString()} items / ${receipt.delivered.citationCount.toLocaleString()} citations<br>${receipt.delivered.estimatedTokens.toLocaleString()} estimated tokens`,
          `${receipt.comparison.selectionRatio === null ? "n/a" : `${Math.round(receipt.comparison.selectionRatio * 10_000) / 100}%`} of events<br>${receipt.comparison.reductionPercent === null ? "n/a" : `${receipt.comparison.reductionPercent}% smaller estimated input`}`,
          `<code>${escapeHtml(receipt.receiptHash)}</code>`
        ]),
        pageSize: 8
      });
  const repositoryLabel = workspace.repositoryIds.length > 0
    ? workspace.repositoryIds.join(", ")
    : "No repository identity recorded yet";
  const liveStatus = options.live === true
    ? '<strong class="live-state"><span aria-hidden="true"></span>Live local ledger</strong>'
    : '<strong class="snapshot-state">Verified local snapshot</strong>';
  const liveScript = options.live === true && typeof options.liveStatusPath === "string"
    ? `\nconst qarinahLiveStatusPath=${JSON.stringify(options.liveStatusPath).replaceAll("<", "\\u003c")};\nconst qarinahInitialHead=${JSON.stringify(workspace.ledgerHeadHash)};\nconst qarinahInitialCount=${workspace.eventCount};\nconst qarinahInitialBytes=${workspace.ledgerBytes};\nsetInterval(async()=>{try{const response=await fetch(qarinahLiveStatusPath,{cache:"no-store"});if(!response.ok)return;const current=await response.json();if(current.headHash!==qarinahInitialHead||current.eventCount!==qarinahInitialCount||current.logBytes!==qarinahInitialBytes)location.reload();}catch{}},2000);`
    : "";
  const linkedGraphJson = JSON.stringify(data.linkedGraph)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const worktreeProjectsJson = JSON.stringify(projects.map((project) => ({ workspaceId: project.workspaceId })))
    .replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Qarinah memory dashboard</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23090d12'/%3E%3Cpath d='M18 18h28v20H31l-9 9v-9h-4z' fill='%2335e0aa'/%3E%3C/svg%3E">
<style>
:root{color-scheme:dark;--bg:#090d12;--panel:#101720;--line:#27313c;--text:#edf5f2;--muted:#9aa7b2;--mint:#35e0aa;--warn:#ffc857}
*{box-sizing:border-box}html{scrollbar-gutter:stable}body{margin:0;overflow-x:hidden;background:var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}
header,main{width:min(1180px,calc(100% - 32px));margin:auto}header{padding:56px 0 28px;border-bottom:1px solid var(--line)}
.eyebrow{color:var(--mint);font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
h1{font-size:clamp(36px,6vw,72px);line-height:.98;max-width:900px;margin:18px 0;overflow-wrap:anywhere}p{color:var(--muted)}code{overflow-wrap:anywhere;word-break:break-word}
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
.project-nav{display:flex;gap:8px;overflow-x:auto;padding:0 0 16px;scrollbar-width:thin}.project-nav a{flex:0 0 auto;min-width:180px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;color:var(--text);text-decoration:none;background:var(--panel)}.project-nav a[aria-current="page"]{border-color:var(--mint)}.project-nav small{display:block;color:var(--muted);font:11px/1.3 ui-monospace,monospace;margin-top:4px}.source-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 22px;margin-top:18px;padding:16px;border:1px solid var(--line);background:var(--panel)}.source-card p{margin:0;min-width:0}.source-card strong{display:block;color:var(--text);font-size:12px}.source-card code{overflow-wrap:anywhere}.live-state,.snapshot-state{display:inline-flex;align-items:center;gap:8px;color:var(--mint)}.live-state span{width:9px;height:9px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgb(53 224 170 / 14%)}
.graph-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 190px auto auto;gap:10px;align-items:end;margin-bottom:14px}.graph-toolbar label{display:grid;gap:6px;color:var(--muted);font-size:12px}.graph-toolbar input,.graph-toolbar select{width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;background:#0b1118;color:var(--text);padding:9px 12px;font:inherit}.graph-toolbar input:focus-visible,.graph-toolbar select:focus-visible{outline:2px solid var(--mint);outline-offset:2px}.graph-reset{min-height:44px;padding:9px 14px;border:1px solid var(--line);border-radius:8px;background:#17212d;color:var(--text);font:700 12px/1 ui-monospace,monospace;cursor:pointer}.graph-reset:hover,.graph-reset:focus-visible{border-color:var(--mint);color:var(--mint);outline:none}.graph-summary{color:var(--muted);font:12px/1.35 ui-monospace,monospace}.graph-shell{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(250px,.7fr);gap:14px}.graph-stage{position:relative;min-width:0}.graph-live-badge{position:absolute;z-index:1;top:14px;left:14px;display:inline-flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgb(53 224 170 / 35%);border-radius:6px;background:rgb(8 14 18 / 88%);color:var(--mint);font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;pointer-events:none}.graph-live-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 3px rgb(53 224 170 / 12%)}.graph-canvas{display:block;width:100%;height:auto;min-height:480px;border:1px solid var(--line);background:radial-gradient(circle at center,rgb(53 224 170 / 10%),transparent 34%),radial-gradient(circle at center,rgb(101 167 255 / 4%),transparent 62%),#080e14;touch-action:none}.graph-orbit{fill:none;stroke:rgb(154 167 178 / 13%);stroke-width:1;stroke-dasharray:3 8;vector-effect:non-scaling-stroke}.graph-orbit-core{fill:rgb(53 224 170 / 3%);stroke:rgb(53 224 170 / 22%);stroke-dasharray:none}.graph-edge{stroke:#31404d;stroke-width:1;vector-effect:non-scaling-stroke;transition:stroke 180ms ease,opacity 180ms ease,stroke-width 180ms ease}.graph-edge[data-active="true"]{stroke:var(--mint);stroke-width:1.8;opacity:.86!important}.graph-node{cursor:grab;outline:none}.graph-node[data-dragging="true"]{cursor:grabbing}.graph-node circle{stroke:#090d12;stroke-width:2;vector-effect:non-scaling-stroke}.graph-node .graph-dot{filter:drop-shadow(0 0 8px rgb(53 224 170 / 14%));transition:r 180ms ease,stroke 180ms ease}.graph-node .graph-halo{fill:none;stroke:var(--mint);stroke-width:2;opacity:0;pointer-events:none}.graph-node:focus-visible .graph-dot,.graph-node:hover .graph-dot,.graph-node[data-selected="true"] .graph-dot{stroke:var(--text);stroke-width:3}.graph-node:hover .graph-dot{r:12px}.graph-node[data-selected="true"] .graph-halo{opacity:.55;animation:qarinah-graph-pulse 1.8s ease-out infinite}.graph-node[data-conflict="true"] .graph-dot{stroke:var(--warn);stroke-width:3}.graph-node-label{opacity:0;pointer-events:none;transition:opacity 180ms ease}.graph-node-label rect{fill:rgb(8 14 20 / 94%);stroke:rgb(154 167 178 / 24%);stroke-width:1;rx:4}.graph-node-label text{fill:var(--text);font:700 11px/1 ui-monospace,monospace;letter-spacing:-.01em}.graph-node-label .graph-node-meta{fill:var(--muted);font-size:8px;letter-spacing:.08em;text-transform:uppercase}.graph-node[data-labeled="true"] .graph-node-label,.graph-node:hover .graph-node-label,.graph-node:focus-visible .graph-node-label,.graph-node[data-selected="true"] .graph-node-label{opacity:1}.graph-node[data-selected="true"] .graph-node-label rect{stroke:var(--mint)}.graph-details{border:1px solid var(--line);padding:18px;min-width:0;background:linear-gradient(180deg,rgb(53 224 170 / 4%),transparent 34%)}.graph-details-kicker{display:block;margin-bottom:10px;color:var(--mint);font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.graph-details h3{margin:0 0 8px;font-size:20px;line-height:1.1;overflow-wrap:anywhere}.graph-details dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px 11px;margin:16px 0}.graph-details dt{color:var(--muted)}.graph-details dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.graph-results{display:grid;gap:6px;max-height:235px;overflow:auto;list-style:none;margin:8px 0 0;padding:0 3px 0 0}.graph-results li{display:block;padding:0;border:0}.graph-results button{display:grid;gap:2px;width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:#0b1118;color:var(--text);text-align:left;cursor:pointer}.graph-results button:hover,.graph-results button:focus-visible,.graph-results button[data-selected="true"]{border-color:var(--mint);outline:none}.graph-results small{color:var(--muted)}.graph-legend{display:flex;flex-wrap:wrap;gap:10px 16px;margin:12px 0 0;color:var(--muted);font-size:12px}.graph-legend span{display:inline-flex;align-items:center;gap:6px}.graph-legend i{width:10px;height:10px;border-radius:50%;background:var(--legend);box-shadow:0 0 10px color-mix(in srgb,var(--legend),transparent 55%)}
@keyframes qarinah-graph-pulse{0%{r:10px;opacity:.55}100%{r:25px;opacity:0}}
@media(max-width:760px){header,main{width:min(100% - 20px,1180px)}header{padding:36px 0 22px}h1{font-size:clamp(34px,12vw,54px)}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{min-width:0;padding:17px}.metric strong{font-size:24px;overflow-wrap:anywhere}main{padding-top:18px}.grid{grid-template-columns:1fr;gap:12px}section,section.wide{grid-column:auto;padding:18px}li{grid-template-columns:1fr}.record-head{display:block}.record-head time{display:block;margin-top:4px}.table-scroll table{min-width:620px}.pager{justify-content:space-between}.pager button{min-width:84px}}
@media(max-width:900px){.graph-toolbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.graph-summary{grid-column:1/-1}.graph-shell{grid-template-columns:1fr}.graph-canvas{min-height:360px}.graph-details{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.graph-details h3,.graph-details>p{grid-column:1/-1}}
@media(max-width:600px){.source-card{grid-template-columns:1fr}.project-nav a{min-width:155px}.graph-toolbar{grid-template-columns:1fr}.graph-summary{grid-column:1}.graph-shell,.graph-details{display:block}.graph-canvas{min-height:270px}.graph-results{margin-top:14px}}
@media(max-width:420px){.metrics{grid-template-columns:1fr}.pager{display:grid;grid-template-columns:1fr 1fr}.pager output{grid-column:1/-1;grid-row:1;min-width:0}.pager button{width:100%}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.graph-node[data-selected="true"] .graph-halo{animation:none}}
</style></head><body>
<header>${projectNavigation}<div class="eyebrow">Qarinah · local dashboard</div><h1>${escapeHtml(workspace.name)} remembers.</h1>
<p>Shared memory your team can inspect. ${liveStatus} · generated ${escapeHtml(data.generatedAt)} · ${escapeHtml(data.capture)} capture</p>
<div class="source-card">
<p><strong>Project root</strong><code>${escapeHtml(workspace.root)}</code></p>
<p><strong>Workspace identity</strong><code>${escapeHtml(workspace.workspaceId)}</code></p>
<p><strong>Git worktree</strong>${workspace.worktree ? `${escapeHtml(workspace.worktree.branch ?? "detached HEAD")} · <code>${escapeHtml(workspace.worktree.commit?.slice(0, 12) ?? "unborn")}</code>` : "Not a Git worktree"}</p>
<p><strong>Worktree identity</strong><code>${escapeHtml(workspace.worktree?.worktreeId ?? "Not available")}</code></p>
<p><strong>Repository group</strong><code>${escapeHtml(workspace.worktree?.repositoryId ?? "Not available")}</code></p>
<p><strong>Repository identities</strong>${escapeHtml(repositoryLabel)}</p>
<p><strong>Authoritative source</strong><code>${escapeHtml(workspace.ledgerPath)}</code></p>
<p><strong>Ledger head</strong><code>${escapeHtml(workspace.ledgerHeadHash ?? "Empty ledger")}</code></p>
<p><strong>Ledger bytes</strong>${workspace.ledgerBytes.toLocaleString()}</p>
<p><strong>Last retained activity</strong>${escapeHtml(workspace.lastActivityAt ?? "No retained activity yet")}</p>
</div>
<div class="metrics">
<div class="metric"><strong>${data.totals.currentDecisions}</strong><span>current decisions</span></div>
<div class="metric"><strong>${data.totals.supersededDecisions}</strong><span>superseded</span></div>
<div class="metric"><strong>${data.totals.conflicts}</strong><span>conflicts</span></div>
<div class="metric"><strong>${data.totals.citedSources}</strong><span>cited sources</span></div>
<div class="metric"><strong>${data.totals.tools}</strong><span>tool events</span></div>
<div class="metric"><strong>${escapeHtml(savingsValue)}</strong><span>${escapeHtml(savingsLabel)}</span></div>
</div></header>
<main><div class="grid">
${worktreeComparison}
<section class="wide"><h2>Worktree context graph</h2><p>Explore the active Git worktree, current memories, concepts, files, and their evidence-backed relationships in a circular project map. Drag nodes to untangle a cluster, click any point for its source identity, or run ranked search to see the exact score basis.</p>
<div class="graph-toolbar"><label>Ranked project-memory search<input type="search" data-graph-search data-search-path="${escapeHtml(options.searchPath ?? "")}" maxlength="256" placeholder="Try a branch, decision, or src/index.js"></label><label>Node type<select data-graph-type><option value="all">All node types</option><option value="worktree">Git worktrees</option><option value="memory">Memories</option><option value="file">Files</option><option value="concept">Concepts</option><option value="directory">Directories</option><option value="reference">References</option></select></label><button class="graph-reset" type="button" data-graph-reset>Reset map</button><output class="graph-summary" data-graph-summary aria-live="polite"></output></div>
<div class="graph-shell"><div class="graph-stage"><span class="graph-live-badge">Real local ledger data</span><svg class="graph-canvas" data-linked-graph viewBox="0 0 1040 620" role="img" aria-label="Interactive circular project-memory graph"><g data-graph-orbits></g><g data-graph-edges></g><g data-graph-nodes></g></svg></div><aside class="graph-details" aria-live="polite"><div><span class="graph-details-kicker">Selected graph node</span><h3 data-graph-title>Choose a node</h3><p data-graph-description>Click a labeled node or a result to inspect its real retained data, rank, connections, and evidence identity.</p><dl><dt>Type</dt><dd data-graph-detail="type">-</dd><dt>Status</dt><dd data-graph-detail="status">-</dd><dt>Importance</dt><dd data-graph-detail="importance">-</dd><dt>Connections</dt><dd data-graph-detail="connections">-</dd><dt>Score basis</dt><dd data-graph-detail="basis">Browse rank</dd><dt>Evidence</dt><dd data-graph-detail="evidence">-</dd></dl></div><div><strong>Visible or ranked results</strong><ol class="graph-results" data-graph-results aria-label="Linked project-memory results"></ol></div></aside></div>
<div class="graph-legend"><span><i style="--legend:#ff7a90"></i>Git worktree</span><span><i style="--legend:#35e0aa"></i>Memory</span><span><i style="--legend:#65a7ff"></i>File</span><span><i style="--legend:#d197ff"></i>Concept</span><span><i style="--legend:#ffc857"></i>Directory</span><span><i style="--legend:#9aa7b2"></i>Reference</span></div>
<p><small>Showing ${data.linkedGraph.nodes.length.toLocaleString()} selected nodes and ${data.linkedGraph.edges.length.toLocaleString()} relationships from ${data.linkedGraph.statistics.nodes.toLocaleString()} admitted source-projection nodes; ${data.linkedGraph.statistics.rankedCandidates.toLocaleString()} top-ranked candidates were evaluated. Source manifest: <code>${escapeHtml(data.linkedGraph.manifestHash)}</code></small></p></section>
<section><h2>Current decisions and reasons</h2>${decisionList(data.currentDecisions,"No current decisions recorded.",{ id:"current-decisions",label:"Current decisions" })}</section>
<section><h2>Superseded decisions</h2>${decisionList(data.supersededDecisions,"No superseded decisions.",{ id:"superseded-decisions",label:"Superseded decisions" })}</section>
<section class="wide"><h2>Conflicts requiring attention</h2>${data.conflicts.length === 0 ? '<p class="empty">No recorded conflicts.</p>' : paginatedTable({ id:"conflicts",label:"Conflicts",headings:["Claim","Conflicts with"],rows:data.conflicts.map((conflict) => [escapeHtml(conflict.source.title),escapeHtml(conflict.target.title)]) })}</section>
<section class="wide"><h2>Execution flow</h2>${data.executionFlow.length === 0 ? '<p class="empty">No execution steps recorded.</p>' : paginatedTable({ id:"execution-flow",label:"Execution flow",headings:["#","Kind","Action","Tool","Evidence"],rows:data.executionFlow.map((step) => [escapeHtml(step.sequence),`<code>${escapeHtml(step.kind)}</code>`,escapeHtml(step.title),step.toolName ? `<code>${escapeHtml(step.toolName)}</code>` : "—",`<code>${escapeHtml(step.eventId)}</code>`]) })}</section>
<section><h2>Tools called</h2>${list(data.tools.map((tool) => ({ ...tool, title: `${tool.toolName} · ${tool.kind}` })),"No tool activity recorded.",{ id:"tools",label:"Tool activity" })}</section>
<section><h2>Major changes</h2>${list(data.majorChanges,"No major changes recorded.",{ id:"major-changes",label:"Major changes" })}</section>
<section class="wide"><h2>Exact per-session context receipts</h2><p>Every row is derived from events carrying the same exact host-supplied session ID. It records cited selection, hashes, portable token estimates, and query timing without claiming provider billing.</p>${sessionReceipts}</section>
<section><h2>Memory footprint</h2>${tableRegion("Memory footprint",`<table><tbody>
<tr><th>Project memory on disk</th><td>${footprint.retained.storageBytes.total.toLocaleString()} bytes</td></tr>
<tr><th>Authoritative ledger text</th><td>${footprint.retained.ledgerCharacters.toLocaleString()} characters · ${footprint.retained.ledgerEstimatedTokens?.toLocaleString() ?? "no retained baseline"} estimated tokens</td></tr>
<tr><th>Compact-import receipt</th><td>${escapeHtml(imported)}</td></tr>
<tr><th>Task pack delivered</th><td>${footprint.deliveredPack.estimatedTokens.toLocaleString()} estimated tokens</td></tr>
${data.contextSavings.status === "measured" ? `<tr><th>Estimated reduction</th><td>${data.contextSavings.savingsPercent ?? 0}% · ${data.contextSavings.baselineToPackRatio ?? 0}:1 · ${escapeHtml(savingsBasis)}</td></tr>` : ""}
<tr><th>Pack identity</th><td><code>${escapeHtml(footprint.deliveredPack.manifestHash)}</code></td></tr>
</tbody></table>`)}<p>Retained project memory and the small task-specific pack are different quantities. The dashboard never presents this as lossless archive compression.</p></section>
<section><h2>Source citations</h2>${list(data.citations,"No external source citations recorded.",{ id:"citations",label:"Source citations" })}</section>
<section><h2>Agent activity timeline</h2>${list(data.activity,"No activity recorded.",{ id:"activity",label:"Agent activity" })}</section>
<section class="wide"><h2>Files and systems affected</h2>${data.affectedFiles.length === 0 ? '<p class="empty">Run qarinah scan to populate the project map.</p>' : paginatedTable({ id:"affected-files",label:"Files and systems affected",headings:["Path","Language","Content hash"],rows:data.affectedFiles.map((file) => [escapeHtml(file.path),escapeHtml(file.language),`<code>${escapeHtml(file.contentHash)}</code>`]) })}</section>
</div></main><script type="application/json" id="qarinah-linked-graph">${linkedGraphJson}</script><script type="application/json" id="qarinah-worktree-projects">${worktreeProjectsJson}</script><script>
const qarinahGraph=JSON.parse(document.getElementById("qarinah-linked-graph").textContent);
const qarinahWorktreeProjects=JSON.parse(document.getElementById("qarinah-worktree-projects").textContent);
const qarinahGraphSvg=document.querySelector("[data-linked-graph]");
const qarinahGraphOrbits=document.querySelector("[data-graph-orbits]");
const qarinahGraphEdges=document.querySelector("[data-graph-edges]");
const qarinahGraphNodes=document.querySelector("[data-graph-nodes]");
const qarinahGraphSearch=document.querySelector("[data-graph-search]");
const qarinahGraphType=document.querySelector("[data-graph-type]");
const qarinahGraphReset=document.querySelector("[data-graph-reset]");
const qarinahGraphSummary=document.querySelector("[data-graph-summary]");
const qarinahGraphResults=document.querySelector("[data-graph-results]");
const qarinahGraphNodeById=new Map(qarinahGraph.nodes.map((node)=>[node.id,node]));
const qarinahGraphNeighbors=new Map(qarinahGraph.nodes.map((node)=>[node.id,new Set()]));
for(const edge of qarinahGraph.edges){qarinahGraphNeighbors.get(edge.source)?.add(edge.target);qarinahGraphNeighbors.get(edge.target)?.add(edge.source)}
const qarinahGraphColors={worktree:"#ff7a90",memory:"#35e0aa",file:"#65a7ff",concept:"#d197ff",directory:"#ffc857",reference:"#9aa7b2"};
let qarinahSelectedNode=null;
const qarinahPositionOverrides=new Map();
let qarinahActiveDrag=null;
const qarinahSvgElement=(name)=>document.createElementNS("http://www.w3.org/2000/svg",name);
const qarinahNodeText=(node)=>[node.label,node.path,node.kind,...node.terms].filter(Boolean).join(" ").toLowerCase();
const qarinahShowNode=(node,basis=null,score=null)=>{
  qarinahSelectedNode=node.id;
  document.querySelector("[data-graph-title]").textContent=node.label;
  document.querySelector("[data-graph-description]").textContent=node.path??node.kind;
  document.querySelector('[data-graph-detail="type"]').textContent=node.type+" | "+node.kind;
  document.querySelector('[data-graph-detail="status"]').textContent=node.status+(node.conflicted?" | conflict recorded":"");
  document.querySelector('[data-graph-detail="importance"]').textContent=node.importance.toFixed(4)+(node.type==="file"?" | repository "+node.repositoryRank.toFixed(4):"");
  document.querySelector('[data-graph-detail="connections"]').textContent=node.incoming+" incoming | "+node.outgoing+" outgoing";
  document.querySelector('[data-graph-detail="basis"]').textContent=basis
    ? basis.formula+" | local "+basis.localSemantic.toFixed(4)+" | linked "+basis.linkedEvidence.toFixed(4)+" | structural "+basis.structuralImportance.toFixed(4)+(score===null?"":" | score "+score.toFixed(4))
    : "Structural browse rank";
  document.querySelector('[data-graph-detail="evidence"]').textContent=node.evidenceHash??node.contentHash??"Derived concept; inspect linked sources";
  document.querySelectorAll(".graph-node,.graph-results button").forEach((entry)=>{entry.dataset.selected=String(entry.dataset.nodeId===node.id)});
  document.querySelectorAll(".graph-edge").forEach((entry)=>{entry.dataset.active=String(entry.dataset.source===node.id||entry.dataset.target===node.id)});
};
const qarinahRenderButtons=(entries,ranked=false)=>{
  qarinahGraphResults.textContent="";
  for(const entry of entries){
    const node=ranked?entry.node:entry;
    const item=document.createElement("li");
    const button=document.createElement("button");
    button.dataset.nodeId=node.id;
    button.dataset.selected=String(node.id===qarinahSelectedNode);
    const strong=document.createElement("strong");
    strong.textContent=node.label;
    const small=document.createElement("small");
    small.textContent=ranked
      ? node.type+" | score "+entry.score.toFixed(4)+" | "+entry.basis.formula
      : node.type+" | importance "+node.importance.toFixed(3);
    button.append(strong,small);
    button.addEventListener("click",()=>qarinahShowNode(node,ranked?entry.basis:null,ranked?entry.score:null));
    item.append(button);
    qarinahGraphResults.append(item);
  }
};
const qarinahRenderGraph=()=>{
  const query=qarinahGraphSearch.value.trim().toLowerCase();
  const type=qarinahGraphType.value;
  const direct=new Set(qarinahGraph.nodes.filter((node)=>(type==="all"||node.type===type)&&(!query||qarinahNodeText(node).includes(query))).map((node)=>node.id));
  const expanded=new Set(direct);
  if(query){for(const id of direct){for(const neighbor of qarinahGraphNeighbors.get(id)??[])if(type==="all"||qarinahGraphNodeById.get(neighbor)?.type===type)expanded.add(neighbor)}}
  const visible=qarinahGraph.nodes.filter((node)=>expanded.has(node.id)).sort((left,right)=>right.importance-left.importance||left.id.localeCompare(right.id)).slice(0,80);
  const visibleIds=new Set(visible.map((node)=>node.id));
  const types=["worktree","memory","file","concept","directory","reference"].filter((candidate)=>visible.some((node)=>node.type===candidate));
  const positions=new Map();
  const center={x:520,y:310};
  const anchor=visible.find((node)=>node.type==="worktree")??visible.find((node)=>node.type==="memory")??visible[0];
  const orbitTypes=types.filter((candidate)=>visible.some((node)=>node.type===candidate&&node.id!==anchor?.id));
  const orbitRadii=orbitTypes.map((candidate,index)=>orbitTypes.length===1?180:105+index*(170/Math.max(1,orbitTypes.length-1)));
  if(anchor)positions.set(anchor.id,qarinahPositionOverrides.get(anchor.id)??center);
  orbitTypes.forEach((candidate,ring)=>{const group=visible.filter((node)=>node.type===candidate&&node.id!==anchor?.id);const radius=orbitRadii[ring];const offset=(ring%2)*Math.PI/Math.max(1,group.length);group.forEach((node,index)=>{const angle=-Math.PI/2+offset+(Math.PI*2*index/Math.max(1,group.length));const natural={x:Math.max(34,Math.min(1006,center.x+Math.cos(angle)*radius)),y:Math.max(34,Math.min(586,center.y+Math.sin(angle)*radius))};positions.set(node.id,qarinahPositionOverrides.get(node.id)??natural)})});
  qarinahGraphOrbits.textContent="";
  const core=qarinahSvgElement("circle");core.classList.add("graph-orbit","graph-orbit-core");core.setAttribute("cx",center.x);core.setAttribute("cy",center.y);core.setAttribute("r","44");qarinahGraphOrbits.append(core);
  for(const radius of orbitRadii){const orbit=qarinahSvgElement("circle");orbit.classList.add("graph-orbit");orbit.setAttribute("cx",center.x);orbit.setAttribute("cy",center.y);orbit.setAttribute("r",String(radius));qarinahGraphOrbits.append(orbit)}
  qarinahGraphEdges.textContent="";
  for(const edge of qarinahGraph.edges){const source=positions.get(edge.source),target=positions.get(edge.target);if(!source||!target)continue;const line=qarinahSvgElement("line");line.classList.add("graph-edge");line.dataset.source=edge.source;line.dataset.target=edge.target;line.dataset.active="false";line.setAttribute("x1",source.x);line.setAttribute("y1",source.y);line.setAttribute("x2",target.x);line.setAttribute("y2",target.y);line.setAttribute("opacity",String(Math.max(.16,Math.min(.72,edge.weight))));const title=qarinahSvgElement("title");title.textContent=edge.type;line.append(title);qarinahGraphEdges.append(line)}
  qarinahGraphNodes.textContent="";
  const alwaysLabeled=new Set(anchor?[anchor.id]:[]);const labeledPoints=anchor?[positions.get(anchor.id)]:[];for(const node of visible){if(alwaysLabeled.size>=10)break;if(node.id===anchor?.id)continue;const point=positions.get(node.id);if(labeledPoints.every((labeled)=>Math.hypot(point.x-labeled.x,point.y-labeled.y)>=92)){alwaysLabeled.add(node.id);labeledPoints.push(point)}}
  for(const node of visible){const point=positions.get(node.id);const group=qarinahSvgElement("g");group.classList.add("graph-node");group.dataset.nodeId=node.id;group.dataset.conflict=String(node.conflicted);group.dataset.selected=String(node.id===qarinahSelectedNode);group.dataset.labeled=String(alwaysLabeled.has(node.id));group.dataset.dragging="false";group.setAttribute("transform","translate("+point.x+" "+point.y+")");group.setAttribute("tabindex","0");group.setAttribute("role","button");group.setAttribute("aria-label",node.type+": "+node.label+". Drag to move; press Enter for details.");const halo=qarinahSvgElement("circle");halo.classList.add("graph-halo");halo.setAttribute("r","10");const circle=qarinahSvgElement("circle");circle.classList.add("graph-dot");const nodeRadius=anchor?.id===node.id?13:6+node.importance*8;circle.setAttribute("r",String(nodeRadius));circle.setAttribute("fill",qarinahGraphColors[node.type]);const title=qarinahSvgElement("title");title.textContent=node.label+" | "+node.type+" | importance "+node.importance.toFixed(4);const label=qarinahSvgElement("g");label.classList.add("graph-node-label");const clipped=node.label.length>24?node.label.slice(0,23)+"…":node.label;const labelWidth=Math.min(210,Math.max(86,22+clipped.length*7));const labelLeft=point.x>760?-labelWidth-nodeRadius-8:nodeRadius+8;const background=qarinahSvgElement("rect");background.setAttribute("x",String(labelLeft));background.setAttribute("y","-20");background.setAttribute("width",String(labelWidth));background.setAttribute("height","35");const labelText=qarinahSvgElement("text");labelText.setAttribute("x",String(labelLeft+9));labelText.setAttribute("y","-6");labelText.textContent=clipped;const labelMeta=qarinahSvgElement("text");labelMeta.classList.add("graph-node-meta");labelMeta.setAttribute("x",String(labelLeft+9));labelMeta.setAttribute("y","8");labelMeta.textContent=node.type+" · "+node.incoming+" in · "+node.outgoing+" out";label.append(background,labelText,labelMeta);group.append(halo,circle,label,title);const activate=()=>qarinahShowNode(node);group.addEventListener("pointerdown",(event)=>{if(event.button!==0)return;group.dataset.dragging="true";qarinahActiveDrag={node,group,positions,pointerId:event.pointerId};qarinahGraphSvg.setPointerCapture(event.pointerId);activate();event.preventDefault()});group.addEventListener("click",activate);group.addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();activate()}});qarinahGraphNodes.append(group)}
  qarinahRenderButtons(visible);
  qarinahGraphSummary.textContent=visible.length+" visual nodes | "+qarinahGraph.edges.filter((edge)=>visibleIds.has(edge.source)&&visibleIds.has(edge.target)).length+" links";
  if(qarinahSelectedNode&&visibleIds.has(qarinahSelectedNode))qarinahShowNode(qarinahGraphNodeById.get(qarinahSelectedNode));
  else if(anchor)qarinahShowNode(anchor);
};
let qarinahSearchVersion=0;
const qarinahRunRankedSearch=async()=>{
  const query=qarinahGraphSearch.value.trim();
  const searchPath=qarinahGraphSearch.dataset.searchPath;
  const version=++qarinahSearchVersion;
  if(!searchPath||!query)return;
  const parameters=new URLSearchParams({q:query,limit:"40"});
  if(qarinahGraphType.value!=="all")parameters.set("type",qarinahGraphType.value);
  try{
    const response=await fetch(searchPath+"?"+parameters.toString(),{cache:"no-store"});
    if(!response.ok)throw new Error("search failed");
    const result=await response.json();
    if(version!==qarinahSearchVersion)return;
    qarinahRenderButtons(result.items,true);
    const completeness=result.coverage.projectionComplete&&result.coverage.authorityComplete?"":" | bounded source coverage";
    qarinahGraphSummary.textContent=result.items.length+" ranked results | "+result.coverage.status+" term coverage"+completeness;
  }catch{
    if(version===qarinahSearchVersion)qarinahGraphSummary.textContent="Ranked search unavailable; showing the local visual filter.";
  }
};
const qarinahRefresh=()=>{qarinahRenderGraph();void qarinahRunRankedSearch()};
qarinahGraphSvg.addEventListener("pointermove",(event)=>{const drag=qarinahActiveDrag;if(!drag||drag.pointerId!==event.pointerId)return;const matrix=qarinahGraphSvg.getScreenCTM();if(!matrix)return;const point=qarinahGraphSvg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(matrix.inverse());const position={x:Math.max(22,Math.min(1018,local.x)),y:Math.max(22,Math.min(538,local.y))};drag.positions.set(drag.node.id,position);qarinahPositionOverrides.set(drag.node.id,position);drag.group.setAttribute("transform","translate("+position.x+" "+position.y+")");for(const line of qarinahGraphEdges.querySelectorAll("line")){if(line.dataset.source===drag.node.id){line.setAttribute("x1",position.x);line.setAttribute("y1",position.y)}if(line.dataset.target===drag.node.id){line.setAttribute("x2",position.x);line.setAttribute("y2",position.y)}}});
const qarinahFinishDrag=(event)=>{const drag=qarinahActiveDrag;if(!drag||drag.pointerId!==event.pointerId)return;drag.group.dataset.dragging="false";try{qarinahGraphSvg.releasePointerCapture(event.pointerId)}catch{}qarinahShowNode(drag.node);qarinahActiveDrag=null};
qarinahGraphSvg.addEventListener("pointerup",qarinahFinishDrag);qarinahGraphSvg.addEventListener("pointercancel",qarinahFinishDrag);
qarinahGraphSearch.addEventListener("input",qarinahRefresh);qarinahGraphType.addEventListener("change",qarinahRefresh);qarinahGraphReset.addEventListener("click",()=>{qarinahPositionOverrides.clear();qarinahRenderGraph()});qarinahRenderGraph();
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
const qarinahRefreshWorktrees=async()=>{for(const project of qarinahWorktreeProjects){try{const response=await fetch("/api/status/"+encodeURIComponent(project.workspaceId),{cache:"no-store"});if(!response.ok)continue;const status=await response.json();for(const node of document.querySelectorAll("[data-worktree-events]"))if(node.dataset.worktreeEvents===project.workspaceId)node.textContent=String(status.eventCount);for(const node of document.querySelectorAll("[data-worktree-activity]"))if(node.dataset.worktreeActivity===project.workspaceId)node.textContent=status.lastActivityAt??"No retained activity";}catch{}}};
if(qarinahWorktreeProjects.length>1){void qarinahRefreshWorktrees();setInterval(qarinahRefreshWorktrees,2000)}
${liveScript}
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
