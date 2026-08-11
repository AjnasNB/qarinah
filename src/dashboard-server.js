import { createServer } from "node:http";
import path from "node:path";
import { buildMemoryDashboard, renderMemoryDashboard } from "./dashboard.js";
import { loadWorkspace, openSecureReadFile } from "./workspace.js";

const MAX_PROJECTS = 32;
const WORKSPACE_ID = /^ws_[0-9a-f]{32}$/u;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$/iu;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function projectHref(workspaceId) {
  return `/project/${encodeURIComponent(workspaceId)}/`;
}

async function resolveProjects(cwd, requested) {
  if (!Array.isArray(requested)) throw new TypeError("workspaces must be an array.");
  if (requested.length + 1 > MAX_PROJECTS) throw new TypeError(`A live dashboard supports at most ${MAX_PROJECTS} projects.`);
  const roots = [cwd, ...requested];
  const byWorkspaceId = new Map();
  for (const candidate of roots) {
    if (typeof candidate !== "string" || candidate.trim() === "") {
      throw new TypeError("Each live dashboard project must be a non-empty path.");
    }
    const workspace = await loadWorkspace(path.resolve(cwd, candidate));
    if (!byWorkspaceId.has(workspace.config.workspaceId)) {
      byWorkspaceId.set(workspace.config.workspaceId, Object.freeze({
        name: path.basename(workspace.root),
        root: workspace.root,
        workspaceId: workspace.config.workspaceId,
        href: projectHref(workspace.config.workspaceId)
      }));
    }
  }
  return Object.freeze([...byWorkspaceId.values()]);
}

async function liveStatus(project) {
  const workspace = await loadWorkspace(project.root);
  const ledger = await openSecureReadFile(workspace, ["events", "events.jsonl"]);
  await ledger.handle.close();
  const checkpoint = workspace.consent.checkpoint;
  return Object.freeze({
    workspaceId: workspace.config.workspaceId,
    eventCount: checkpoint.eventCount,
    headHash: checkpoint.headHash,
    logBytes: ledger.metadata.size,
    lastActivityAt: checkpoint.updatedAt
  });
}

function renderProjectIndex(projects) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Qarinah local projects</title><style>
:root{color-scheme:dark;--bg:#090d12;--panel:#101720;--line:#27313c;--text:#edf5f2;--muted:#9aa7b2;--mint:#35e0aa}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1040px,calc(100% - 28px));margin:auto;padding:56px 0 80px}.eyebrow{color:var(--mint);font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(36px,7vw,68px);line-height:1;margin:18px 0}p{color:var(--muted);max-width:740px}.projects{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;margin-top:30px}.project{display:block;min-width:0;padding:20px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);text-decoration:none}.project:hover,.project:focus-visible{border-color:var(--mint);outline:none}.project h2{margin:0 0 8px;font-size:20px}.project dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;margin:16px 0 0}.project dt{color:var(--muted)}.project dd{margin:0;overflow-wrap:anywhere}.project code{font-size:11px}.live{display:inline-flex;align-items:center;gap:8px;color:var(--mint);font-weight:700}.live::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgb(53 224 170 / 14%)}@media(max-width:480px){main{padding-top:34px}.project dl{grid-template-columns:1fr}.project dt{margin-top:6px}}
</style></head><body><main><div class="eyebrow">Qarinah · local dashboard</div><h1>Your real project memory.</h1><p class="live">Live from authorized local ledgers</p><p>Each project remains a separate Qarinah workspace. This page rereads the project-owned ledger; it does not invent activity or search the rest of your disk.</p><div class="projects">
${projects.map((project) => `<a class="project" href="${escapeHtml(project.href)}" data-project="${escapeHtml(project.workspaceId)}"><h2>${escapeHtml(project.name)}</h2><div>${escapeHtml(project.root)}</div><dl><dt>Workspace</dt><dd><code>${escapeHtml(project.workspaceId)}</code></dd><dt>Events</dt><dd data-events>Loading…</dd><dt>Last activity</dt><dd data-activity>Loading…</dd></dl></a>`).join("")}
</div></main><script>
const refresh=async()=>{for(const card of document.querySelectorAll("[data-project]")){try{const id=card.dataset.project;const response=await fetch("/api/status/"+encodeURIComponent(id),{cache:"no-store"});if(!response.ok)continue;const status=await response.json();card.querySelector("[data-events]").textContent=String(status.eventCount);card.querySelector("[data-activity]").textContent=status.lastActivityAt??"No retained activity";}catch{}}};refresh();setInterval(refresh,2000);
</script></body></html>`;
}

function send(response, statusCode, contentType, body, method = "GET") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  if (method !== "HEAD") response.end(body);
  else response.end();
}

export async function serveMemoryDashboard(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projects = await resolveProjects(cwd, options.workspaces ?? []);
  const projectById = new Map(projects.map((project) => [project.workspaceId, project]));
  const port = options.port ?? 8777;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("port must be an integer from 0 to 65535.");
  }
  const server = createServer((request, response) => {
    void (async () => {
      const method = request.method ?? "GET";
      if (!LOOPBACK_HOST.test(request.headers.host ?? "")) {
        send(response, 421, "text/plain; charset=utf-8", "Misdirected request.\n", method);
        return;
      }
      if (method !== "GET" && method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        send(response, 405, "text/plain; charset=utf-8", "Method not allowed.\n", method);
        return;
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        send(response, 200, "text/html; charset=utf-8", renderProjectIndex(projects), method);
        return;
      }
      const statusMatch = /^\/api\/status\/(ws_[0-9a-f]{32})$/u.exec(url.pathname);
      if (statusMatch) {
        const project = projectById.get(statusMatch[1]);
        if (!project) {
          send(response, 404, "application/json; charset=utf-8", '{"error":"not_found"}\n', method);
          return;
        }
        send(response, 200, "application/json; charset=utf-8", `${JSON.stringify(await liveStatus(project))}\n`, method);
        return;
      }
      const projectMatch = /^\/project\/(ws_[0-9a-f]{32})\/$/u.exec(url.pathname);
      if (projectMatch && WORKSPACE_ID.test(projectMatch[1])) {
        const project = projectById.get(projectMatch[1]);
        if (!project) {
          send(response, 404, "text/plain; charset=utf-8", "Project not found.\n", method);
          return;
        }
        const data = await buildMemoryDashboard({ cwd: project.root });
        send(response, 200, "text/html; charset=utf-8", renderMemoryDashboard(data, {
          live: true,
          liveStatusPath: `/api/status/${project.workspaceId}`,
          projects
        }), method);
        return;
      }
      send(response, 404, "text/plain; charset=utf-8", "Not found.\n", method);
    })().catch(() => {
      if (!response.headersSent) send(response, 500, "text/plain; charset=utf-8", "Dashboard data could not be read.\n", request.method);
      else response.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return Object.freeze({
    url: `http://127.0.0.1:${actualPort}/`,
    host: "127.0.0.1",
    port: actualPort,
    projects,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  });
}
