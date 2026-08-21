import { createServer } from "node:http";
import path from "node:path";
import { buildMemoryDashboard, renderMemoryDashboard } from "./dashboard.js";
import { queryLinkedProjectMemory } from "./linked-memory.js";
import { listGitWorktrees } from "./git-worktrees.js";
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

async function resolveProjects(cwd, requested, includeWorktrees) {
  if (!Array.isArray(requested)) throw new TypeError("workspaces must be an array.");
  if (requested.length + 1 > MAX_PROJECTS) throw new TypeError(`A live dashboard supports at most ${MAX_PROJECTS} projects.`);
  const discovered = includeWorktrees
    ? (await listGitWorktrees(cwd)).filter((entry) => entry.initialized && !entry.current).map((entry) => entry.root)
    : [];
  const roots = [cwd, ...requested, ...discovered];
  if (roots.length > MAX_PROJECTS) throw new TypeError(`A live dashboard supports at most ${MAX_PROJECTS} projects.`);
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
        repositoryId: workspace.worktree?.repositoryId ?? null,
        worktreeId: workspace.worktree?.worktreeId ?? null,
        branch: workspace.worktree?.branch ?? null,
        commit: workspace.worktree?.commit ?? null,
        linked: workspace.worktree?.linked ?? false,
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
:root{color-scheme:dark;--bg:#080d11;--panel:#101820;--panel-hover:#142129;--line:#283640;--text:#eff7f4;--muted:#9cabb4;--mint:#35e0aa;--mint-ink:#04130e}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background-color:var(--bg);background-image:linear-gradient(rgb(53 224 170 / 3%) 1px,transparent 1px),linear-gradient(90deg,rgb(53 224 170 / 3%) 1px,transparent 1px);background-size:48px 48px;color:var(--text);font:15px/1.55 "Segoe UI Variable",ui-sans-serif,system-ui,sans-serif}main{width:min(1120px,calc(100% - 32px));margin:auto;padding:64px 0 96px}.eyebrow{color:var(--mint);font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1{max-width:850px;font-size:clamp(42px,7vw,76px);line-height:.96;letter-spacing:-.055em;text-wrap:balance;margin:20px 0 24px}p{color:var(--muted);max-width:68ch;text-wrap:pretty}.projects{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:18px;margin-top:40px}.project{display:flex;min-width:0;min-height:390px;flex-direction:column;padding:24px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(145deg,rgb(53 224 170 / 5%),transparent 42%),var(--panel);color:var(--text);text-decoration:none;transition:transform 220ms ease,border-color 220ms ease,background-color 220ms ease}.project:hover,.project:focus-visible{border-color:var(--mint);background-color:var(--panel-hover);transform:translateY(-3px);outline:none}.project:active{transform:translateY(0) scale(.99)}.project-topline{display:flex;align-items:center;justify-content:space-between;gap:16px}.project-number{color:var(--mint);font:700 12px/1 ui-monospace,monospace;letter-spacing:.08em}.project h2{margin:18px 0 8px;font-size:clamp(24px,3vw,34px);line-height:1.05;letter-spacing:-.035em}.project-root{color:var(--muted);overflow-wrap:anywhere}.project dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;margin:22px 0 28px}.project dt{color:var(--muted)}.project dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.project code{font-size:11px}.project-action{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:auto;padding:13px 15px;border-radius:8px;background:var(--mint);color:var(--mint-ink);font-weight:800;letter-spacing:-.01em}.project-action-icon{font:700 18px/1 ui-monospace,monospace;transition:transform 220ms ease}.project:hover .project-action-icon,.project:focus-visible .project-action-icon{transform:translateX(4px)}.live{display:inline-flex;align-items:center;gap:8px;color:var(--mint);font-weight:700}.live::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgb(53 224 170 / 14%)}@media(max-width:520px){main{padding-top:38px}.project{min-height:0}.project dl{grid-template-columns:1fr}.project dt{margin-top:6px}}
</style></head><body><main><div class="eyebrow">Qarinah · local dashboard</div><h1>Your worktrees remember.</h1><p class="live">Live from authorized local ledgers</p><p>One repository can contain several isolated worktree ledgers. Qarinah groups them without sharing writable storage, so parallel branches remain understandable and independently verifiable.</p><div class="projects">
${projects.map((project, index) => `<a class="project" href="${escapeHtml(project.href)}" data-project="${escapeHtml(project.workspaceId)}"><div class="project-topline"><span class="project-number">WORKSPACE ${String(index + 1).padStart(2, "0")}</span><span aria-hidden="true">↗</span></div><h2>${escapeHtml(project.branch ?? project.name)}</h2><div class="project-root">${escapeHtml(project.root)}</div><dl><dt>Repository</dt><dd><code>${escapeHtml(project.repositoryId ?? "not-git")}</code></dd><dt>Worktree</dt><dd><code>${escapeHtml(project.worktreeId ?? "not-git")}</code></dd><dt>Commit</dt><dd><code>${escapeHtml(project.commit?.slice(0, 12) ?? "unborn")}</code></dd><dt>Workspace</dt><dd><code>${escapeHtml(project.workspaceId)}</code></dd><dt>Events</dt><dd data-events>Loading…</dd><dt>Last activity</dt><dd data-activity>Loading…</dd></dl><span class="project-action">Open interactive graph <span class="project-action-icon" aria-hidden="true">→</span></span></a>`).join("")}
</div></main><script>
const refresh=async()=>{for(const card of document.querySelectorAll("[data-project]")){try{const id=card.dataset.project;const response=await fetch("/api/status/"+encodeURIComponent(id),{cache:"no-store"});if(!response.ok)continue;const status=await response.json();card.querySelector("[data-events]").textContent=String(status.eventCount);card.querySelector("[data-activity]").textContent=status.lastActivityAt??"No retained activity";}catch{}}};refresh();setInterval(refresh,2000);
</script></body></html>`;
}

function redirectToProject(response, project, method) {
  response.writeHead(302, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    Location: project.href,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  if (method !== "HEAD") response.end("Open the project memory dashboard.\n");
  else response.end();
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
  if (options.includeWorktrees !== undefined && typeof options.includeWorktrees !== "boolean") {
    throw new TypeError("includeWorktrees must be a boolean.");
  }
  const projects = await resolveProjects(cwd, options.workspaces ?? [], options.includeWorktrees === true);
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
        if (projects.length === 1) {
          redirectToProject(response, projects[0], method);
          return;
        }
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
      const graphMatch = /^\/api\/graph\/(ws_[0-9a-f]{32})$/u.exec(url.pathname);
      if (graphMatch) {
        const project = projectById.get(graphMatch[1]);
        if (!project) {
          send(response, 404, "application/json; charset=utf-8", '{"error":"not_found"}\n', method);
          return;
        }
        const data = await buildMemoryDashboard({ cwd: project.root });
        send(response, 200, "application/json; charset=utf-8", `${JSON.stringify(data.linkedGraph)}\n`, method);
        return;
      }
      const searchMatch = /^\/api\/search\/(ws_[0-9a-f]{32})$/u.exec(url.pathname);
      if (searchMatch) {
        const project = projectById.get(searchMatch[1]);
        if (!project) {
          send(response, 404, "application/json; charset=utf-8", '{"error":"not_found"}\n', method);
          return;
        }
        const query = url.searchParams.get("q") ?? "";
        const limitText = url.searchParams.get("limit") ?? "20";
        const typeText = url.searchParams.get("type");
        if (query.length > 4_096 || !/^[0-9]+$/u.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100) {
          send(response, 400, "application/json; charset=utf-8", '{"error":"invalid_query"}\n', method);
          return;
        }
        const types = typeText === null ? undefined : typeText.split(",").filter(Boolean);
        if (types?.some((type) => !["memory", "file", "directory", "concept", "reference", "worktree"].includes(type))) {
          send(response, 400, "application/json; charset=utf-8", '{"error":"invalid_type"}\n', method);
          return;
        }
        const result = await queryLinkedProjectMemory(query, {
          cwd: project.root,
          limit: Number(limitText),
          types,
          persist: false,
          updateCheckpoint: false
        });
        send(response, 200, "application/json; charset=utf-8", `${JSON.stringify(result)}\n`, method);
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
          searchPath: `/api/search/${project.workspaceId}`,
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
