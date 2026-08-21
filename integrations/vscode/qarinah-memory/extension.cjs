const vscode = require("vscode")
const { execFile } = require("node:child_process")
const { randomBytes } = require("node:crypto")
const { existsSync } = require("node:fs")
const path = require("node:path")

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function commandFor(root) {
  const candidates = [
    path.join(root, "node_modules", "qarinah", "bin", "qarinah.js"),
    path.join(root, "bin", "qarinah.js")
  ]
  const local = candidates.find((candidate) => existsSync(candidate))
  if (local) return { command: process.execPath, args: [local] }
  return { command: process.platform === "win32" ? "qarinah.cmd" : "qarinah", args: [] }
}

function readPanel(root) {
  const executable = commandFor(root)
  return new Promise((resolve, reject) => {
    execFile(executable.command, [...executable.args, "panel", "--limit", "80"], {
      cwd: root,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: process.env
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error("Qarinah returned an invalid developer-memory view."))
      }
    })
  })
}

function nonce() {
  return randomBytes(24).toString("base64url")
}

function renderMessage(webview, title, body) {
  const token = nonce()
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${token}';"><style nonce="${token}">body{padding:16px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:13px/1.5 var(--vscode-font-family)}h1{font-size:18px}p{color:var(--vscode-descriptionForeground)}code{font-family:var(--vscode-editor-font-family);overflow-wrap:anywhere}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`
}

function render(webview, data) {
  const token = nonce()
  const payload = JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${token}'; script-src 'nonce-${token}';"><style nonce="${token}">
:root{--mint:#35e0aa;--line:var(--vscode-panel-border);--muted:var(--vscode-descriptionForeground)}*{box-sizing:border-box}body{padding:0 12px 32px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:13px/1.45 var(--vscode-font-family)}header{position:sticky;top:0;z-index:4;padding:14px 0 10px;background:var(--vscode-sideBar-background)}.eyebrow{color:var(--mint);font:700 10px/1.2 var(--vscode-editor-font-family);letter-spacing:.11em;text-transform:uppercase}h1{font-size:22px;line-height:1.05;margin:8px 0 12px}input{width:100%;height:34px;padding:7px 10px;border:1px solid var(--vscode-input-border,var(--line));color:var(--vscode-input-foreground);background:var(--vscode-input-background)}input:focus{outline:1px solid var(--vscode-focusBorder)}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:10px 0;background:var(--line)}.metric{padding:10px;background:var(--vscode-sideBar-background)}.metric strong{display:block;color:var(--mint);font-size:18px}.metric span,small,p{color:var(--muted)}nav{display:flex;gap:4px;overflow:auto;margin:10px 0}button{border:1px solid var(--line);padding:6px 9px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}button[aria-selected="true"],button:hover{border-color:var(--mint);color:var(--mint)}section{display:none}section[data-active="true"]{display:block}.proof-head{margin:0 0 8px;padding:10px;border:1px solid var(--mint)}.proof-head strong,.proof-head code{display:block;overflow-wrap:anywhere}.proof-head strong{color:var(--mint);font-size:16px}.graph{display:block;width:100%;min-height:300px;border:1px solid var(--line)}line{stroke:var(--line)}circle{cursor:pointer;stroke:var(--vscode-sideBar-background);stroke-width:2}.cards{display:grid;gap:6px}.card{padding:9px;border:1px solid var(--line);overflow-wrap:anywhere}.card[role="button"]{cursor:pointer}.card[role="button"]:focus,.card[role="button"]:hover{outline:1px solid var(--mint);outline-offset:-1px}.card strong{display:block}.card code{display:block;color:var(--muted);font:10px/1.35 var(--vscode-editor-font-family);overflow-wrap:anywhere}.session-detail{display:grid;gap:6px;margin:0 0 10px;padding:10px;border:1px solid var(--mint)}.session-detail h2{margin:0;font-size:15px}.session-detail dl{display:grid;grid-template-columns:minmax(80px,.7fr) minmax(0,1.3fr);gap:4px 8px;margin:0}.session-detail dt{color:var(--muted)}.session-detail dd{margin:0;overflow-wrap:anywhere;font-family:var(--vscode-editor-font-family)}.empty{padding:16px;border:1px dashed var(--line)}@media(max-width:280px){.metrics{grid-template-columns:1fr}.session-detail dl{grid-template-columns:1fr}}
</style></head><body><header><div class="eyebrow">Visible developer memory</div><h1>${escapeHtml(data.workspace.name || "Qarinah")}</h1><input type="search" data-search placeholder="Search proof, nodes, symbols, decisions, tools..."><div class="metrics"><div class="metric"><strong>${data.health.graphNodes}</strong><span>graph nodes</span></div><div class="metric"><strong>${data.symbols.available ? data.symbols.coverage.declarations : 0}</strong><span>code symbols</span></div><div class="metric"><strong>${data.timeline.length}</strong><span>events</span></div><div class="metric"><strong>${data.sessions.receiptCount}</strong><span>sessions</span></div><div class="metric"><strong>${data.proof.selection.fileCount}</strong><span>proof files</span></div><div class="metric"><strong>${data.worktreeComparison.worktreeCount}</strong><span>worktrees</span></div></div><nav><button data-tab="proof" aria-selected="true">Task proof</button><button data-tab="graph">Graph</button><button data-tab="symbols">Symbols</button><button data-tab="timeline">Timeline</button><button data-tab="sessions">Sessions</button><button data-tab="worktrees">Worktrees</button></nav></header><main><section data-panel="proof" data-active="true"><div class="proof-head"><strong>${data.proof.budget.usedTokens}/${data.proof.budget.maxTokens} ${data.proof.budget.estimator.exact ? "tokens" : "estimated tokens"}</strong><small>${escapeHtml(data.proof.query)}</small><code>${escapeHtml(data.proof.manifestHash)}</code></div><div class="cards" data-proof></div></section><section data-panel="graph"><svg class="graph" viewBox="0 0 400 320" data-graph role="img" aria-label="Interactive Qarinah project-memory graph"></svg><div class="cards" data-graph-list></div></section><section data-panel="symbols"><div class="cards" data-symbols></div></section><section data-panel="timeline"><div class="cards" data-timeline></div></section><section data-panel="sessions"><div class="session-detail" data-session-detail aria-live="polite"></div><div class="cards" data-sessions></div></section><section data-panel="worktrees"><div class="cards" data-worktrees></div></section></main><script nonce="${token}">
const data=${payload};const colors={memory:"#35e0aa",file:"#65a7ff",concept:"#d197ff",directory:"#ffc857",reference:"#9aa7b2",worktree:"#ff7a90"};const search=document.querySelector("[data-search]");const text=(value)=>String(value??"");const matches=(...values)=>{const query=search.value.trim().toLowerCase();return !query||values.some((value)=>text(value).toLowerCase().includes(query))};const card=(title,meta,id)=>{const node=document.createElement("div");node.className="card";const strong=document.createElement("strong");strong.textContent=text(title);const small=document.createElement("small");small.textContent=text(meta);const code=document.createElement("code");code.textContent=text(id);node.append(strong,small,code);return node};
function renderGraph(){const svg=document.querySelector("[data-graph]");const list=document.querySelector("[data-graph-list]");svg.textContent="";list.textContent="";const nodes=data.graph.nodes.filter((node)=>matches(node.label,node.path,node.kind,...node.terms)).slice(0,60);const ids=new Set(nodes.map((node)=>node.id));const positions=new Map(nodes.map((node,index)=>{const angle=-Math.PI/2+Math.PI*2*index/Math.max(nodes.length,1);const radius=nodes.length<2?0:105;return[node.id,{x:200+Math.cos(angle)*radius,y:150+Math.sin(angle)*radius}]}));for(const edge of data.graph.edges){if(!ids.has(edge.source)||!ids.has(edge.target))continue;const a=positions.get(edge.source),b=positions.get(edge.target),line=document.createElementNS("http://www.w3.org/2000/svg","line");line.setAttribute("x1",a.x);line.setAttribute("y1",a.y);line.setAttribute("x2",b.x);line.setAttribute("y2",b.y);svg.append(line)}for(const node of nodes){const point=positions.get(node.id),dot=document.createElementNS("http://www.w3.org/2000/svg","circle");dot.setAttribute("cx",point.x);dot.setAttribute("cy",point.y);dot.setAttribute("r",String(5+node.importance*7));dot.setAttribute("fill",colors[node.type]||"#9aa7b2");const title=document.createElementNS("http://www.w3.org/2000/svg","title");title.textContent=node.label+" | "+node.type;dot.append(title);dot.addEventListener("click",()=>{list.prepend(card(node.label,node.type+" | importance "+node.importance.toFixed(4),node.evidenceHash||node.contentHash||node.id))});svg.append(dot)}if(nodes.length===0)list.append(card("No matching graph nodes","Try a broader search",data.graph.manifestHash))}
function fill(target,entries,mapper){const root=document.querySelector(target);root.textContent="";for(const entry of entries.filter(mapper.filter).slice(0,100))root.append(mapper.card(entry));if(!root.children.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="No matching records.";root.append(empty)}}
function renderSessionDetail(entry){const root=document.querySelector("[data-session-detail]");root.textContent="";if(!entry){const empty=document.createElement("p");empty.textContent="Select a session to inspect its exact lifecycle and context receipt.";root.append(empty);return}const heading=document.createElement("h2");heading.textContent=entry.sessionId;const list=document.createElement("dl");const values=[["Observed state",entry.lifecycle?.observedState||"legacy"],["Turns",entry.lifecycle?.completedTurns??0],["Outcomes",entry.outcomes?.eventCount??0],["Source events",entry.source.eventCount],["Delivered tokens",entry.delivered.estimatedTokens],["Source manifest",entry.source.eventManifestHash||entry.source.headHash],["Pack manifest",entry.delivered.manifestHash],["Receipt",entry.receiptHash]];for(const [label,value] of values){const term=document.createElement("dt"),description=document.createElement("dd");term.textContent=label;description.textContent=text(value);list.append(term,description)}root.append(heading,list)}
function renderLists(){const proofEntries=[...data.proof.context.items.map((entry)=>({title:entry.title,meta:"memory event | "+entry.reason,id:entry.hash,search:[entry.eventId,entry.kind,entry.excerpt]})),...data.proof.repository.files.map((entry)=>({title:entry.path,meta:"repository file | score "+entry.score+" | "+entry.reasons.join(", "),id:entry.contentHash,search:entry.symbols.flatMap((symbol)=>[symbol.name,symbol.container,symbol.kind])})),...data.proof.facts.items.map((entry)=>({title:entry.statement,meta:"fact | "+entry.status+" | "+entry.category,id:entry.id,search:entry.sourceEventIds})),...data.proof.facts.excludedSources.map((entry)=>({title:entry.title,meta:"excluded | "+entry.reason,id:entry.eventHash,search:[entry.eventId,...entry.supersededBy]}))];fill("[data-proof]",proofEntries,{filter:(entry)=>matches(entry.title,entry.meta,...entry.search),card:(entry)=>card(entry.title,entry.meta,entry.id)});fill("[data-symbols]",data.symbols.results||[],{filter:(entry)=>matches(entry.symbol.name,entry.symbol.container,entry.symbol.path,entry.symbol.kind),card:(entry)=>card((entry.symbol.container?entry.symbol.container+".":"")+entry.symbol.name,entry.symbol.kind+" | "+entry.symbol.path+":"+entry.symbol.span.line+" | score "+entry.score.toFixed(4),entry.symbol.signatureHash)});if(!data.symbols.available){const root=document.querySelector("[data-symbols]");root.textContent="";root.append(card("Symbol memory is not built",data.symbols.reason,"Run qarinah scan, then qarinah symbols build"))}fill("[data-timeline]",data.timeline,{filter:(entry)=>matches(entry.title,entry.kind,entry.category),card:(entry)=>card(entry.title,entry.timestamp+" | "+entry.category,entry.hash)});const sessions=data.sessions.receipts.filter((entry)=>matches(entry.sessionId,...entry.hostAdapters));const sessionsRoot=document.querySelector("[data-sessions]");sessionsRoot.textContent="";for(const entry of sessions.slice(0,100)){const node=card(entry.sessionId,(entry.lifecycle?.observedState||"legacy")+" | "+entry.source.eventCount+" events | "+entry.delivered.estimatedTokens+" estimated delivered tokens",entry.receiptHash);node.setAttribute("role","button");node.setAttribute("tabindex","0");const open=()=>renderSessionDetail(entry);node.addEventListener("click",open);node.addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open()}});sessionsRoot.append(node)}if(!sessionsRoot.children.length)sessionsRoot.append(card("No matching sessions","Try a broader search",data.sessions.manifestHash));renderSessionDetail(sessions[0]||null);fill("[data-worktrees]",data.worktreeComparison.worktrees,{filter:(entry)=>matches(entry.name,entry.branch,entry.commit,entry.root),card:(entry)=>card((entry.current?"Current | ":"")+(entry.branch||entry.name),entry.eventCount+" events | "+entry.currentDecisions+" current decisions | "+entry.conflicts+" conflicts",entry.ledgerHeadHash||entry.workspaceId)})}
function renderAll(){renderGraph();renderLists()}search.addEventListener("input",renderAll);for(const button of document.querySelectorAll("[data-tab]")){button.addEventListener("click",()=>{for(const candidate of document.querySelectorAll("[data-tab]"))candidate.setAttribute("aria-selected",String(candidate===button));for(const panel of document.querySelectorAll("[data-panel]"))panel.dataset.active=String(panel.dataset.panel===button.dataset.tab)})}renderAll();
</script></body></html>`
}

class DeveloperMemoryProvider {
  constructor(context) {
    this.context = context
    this.view = null
  }
  async resolveWebviewView(view) {
    this.view = view
    view.webview.options = { enableScripts: true }
    await this.refresh()
  }
  async refresh() {
    if (!this.view) return
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) {
      this.view.webview.html = renderMessage(this.view.webview, "No project open", "Open an initialized Qarinah project to inspect its local developer memory.")
      return
    }
    this.view.webview.html = renderMessage(this.view.webview, "Loading developer memory", "Reading the verified local graph, timeline, receipts, and worktrees.")
    try {
      this.view.webview.html = render(this.view.webview, await readPanel(root))
    } catch (error) {
      this.view.webview.html = renderMessage(this.view.webview, "Developer memory unavailable", `${error.message} Install qarinah@next, then run: npx qarinah setup . --cursor --auto-compact`)
    }
  }
}

function activate(context) {
  const provider = new DeveloperMemoryProvider(context)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("qarinah.developerMemory", provider),
    vscode.commands.registerCommand("qarinah.refreshDeveloperMemory", () => provider.refresh())
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
