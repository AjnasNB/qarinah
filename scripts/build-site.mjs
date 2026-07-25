import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
const github = "https://github.com/AjnasNB/qarinah";
const zenodoPdf = "https://zenodo.org/records/21547685/files/Qarinah-Technical-White-Paper-v1.0.pdf?download=1";

const docPages = [
  {
    route: "docs/getting-started",
    source: "docs/GETTING-STARTED.md",
    title: "Getting started",
    description: "Install Qarinah, initialize one project, and compile the first cited memory pack."
  },
  {
    route: "docs/integrations",
    source: "docs/HOST-INTEGRATIONS.md",
    title: "Codex and Claude Code",
    description: "Connect Qarinah to Codex, Claude Code, local CLIs, and read-only MCP diagnostics."
  },
  {
    route: "docs/architecture",
    source: "docs/ARCHITECTURE.md",
    title: "Architecture",
    description: "Understand the append-only record, typed graph, hybrid index, and coverage-aware compiler."
  },
  {
    route: "docs/benchmarks",
    source: "docs/BENCHMARKS.md",
    title: "Benchmarks",
    description: "Reproduce the 98.71% context reduction and inspect every committed result."
  },
  {
    route: "docs/security",
    source: "docs/SECURITY.md",
    title: "Security",
    description: "Review workspace trust, capture consent, redaction, integrity, and disclosure boundaries."
  },
  {
    route: "docs/interoperability",
    source: "docs/INTEROPERABILITY.md",
    title: "Interoperability",
    description: "Use deterministic Markdown, JSON, graph, and Open Knowledge Format exports."
  },
  {
    route: "paper",
    source: "docs/WHITEPAPER.md",
    title: "Technical white paper",
    description: "The implementation-backed technical paper for Qarinah 0.1.0."
  }
];

const routesBySource = new Map(docPages.map((page) => [page.source.replaceAll("\\", "/"), `/${page.route}/`]));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(path.join(output, "assets"), { recursive: true });
await mkdir(path.join(output, "paper"), { recursive: true });

await cp(path.join(root, "website", "site.css"), path.join(output, "site.css"));
await cp(path.join(root, "website", "site.js"), path.join(output, "site.js"));
await cp(path.join(root, "website", "static"), output, { recursive: true });
await cp(path.join(root, "node_modules", "@primer", "css", "dist", "primer.css"), path.join(output, "primer.css"));
await cp(path.join(root, "assets", "brand", "qarinah-mark.svg"), path.join(output, "assets", "qarinah-mark.svg"));
await cp(path.join(root, "assets", "architecture", "qarinah-flow.svg"), path.join(output, "assets", "qarinah-flow.svg"));
await cp(path.join(root, "assets", "launch", "qarinah-social-preview.png"), path.join(output, "assets", "qarinah-social-preview.png"));
await cp(path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.0.pdf"), path.join(output, "paper", "Qarinah-Technical-White-Paper-v1.0.pdf"));

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  mangle: false
});

function normalizeVisibleCopy(value) {
  return value
    .replaceAll("—", " - ")
    .replaceAll("–", "-")
    .replaceAll("0.1.0-alpha.3", "0.1.0")
    .replaceAll("@next", "@latest")
    .replaceAll("public prerelease", "public release")
    .replaceAll("technical preview", "stable release");
}

function rewriteMarkdownLinks(markdown, source) {
  const sourceDir = path.posix.dirname(source.replaceAll("\\", "/"));
  return markdown.replace(/(!?\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, href) => {
    if (/^(?:https?:|mailto:|#)/.test(href)) {
      return `${label}(${href})`;
    }

    const [rawPath, anchor = ""] = href.split("#", 2);
    const resolved = path.posix.normalize(path.posix.join(sourceDir, rawPath));
    let target;

    if (routesBySource.has(resolved)) {
      target = routesBySource.get(resolved);
    } else if (resolved === "README.md") {
      target = "/docs/";
    } else if (resolved.startsWith("assets/")) {
      target = `/${resolved}`;
    } else if (resolved.endsWith("Qarinah-Technical-White-Paper-v1.0.pdf")) {
      target = source === "docs/WHITEPAPER.md"
        ? zenodoPdf
        : "/paper/Qarinah-Technical-White-Paper-v1.0.pdf";
    } else {
      target = `${github}/blob/main/${resolved}`;
    }

    return `${label}(${target}${anchor ? `#${anchor}` : ""})`;
  });
}

function rewriteMarkdownAssets(markdown) {
  return markdown.replaceAll(
    'src="../assets/architecture/qarinah-flow.svg"',
    'src="/assets/qarinah-flow.svg"'
  );
}

function rewritePublicationLink(markdown, source) {
  if (source !== "docs/WHITEPAPER.md") return markdown;
  return markdown.replace(
    "https://github.com/AjnasNB/qarinah/blob/main/output/pdf/Qarinah-Technical-White-Paper-v1.0.pdf",
    zenodoPdf
  );
}

function nav(active = "") {
  const items = [
    ["Product", "/", "home"],
    ["Docs", "/docs/", "docs"],
    ["Benchmarks", "/docs/benchmarks/", "benchmarks"],
    ["Paper", "/paper/", "paper"]
  ];

  return `
    <header class="site-header">
      <div class="shell header-inner">
        <a class="brand" href="/" aria-label="Qarinah home">
          <img src="/assets/qarinah-mark.svg" width="30" height="30" alt="">
          <span>Qarinah</span>
          <span class="version-label">0.1.0</span>
        </a>
        <button class="mobile-menu" type="button" aria-expanded="false" aria-controls="primary-nav">Menu</button>
        <nav id="primary-nav" class="primary-nav" aria-label="Primary navigation">
          ${items.map(([label, href, id]) => `<a class="${active === id ? "selected" : ""}" href="${href}">${label}</a>`).join("")}
          <a href="${github}" rel="noreferrer">GitHub</a>
          <button class="theme-toggle" type="button" aria-label="Toggle color theme">Theme</button>
        </nav>
      </div>
    </header>`;
}

function footer() {
  return `
    <footer class="site-footer">
      <div class="shell footer-grid">
        <div>
          <a class="brand footer-brand" href="/"><img src="/assets/qarinah-mark.svg" width="28" height="28" alt=""><span>Qarinah</span></a>
          <p>Less context. More proof.</p>
        </div>
        <div>
          <strong>Build</strong>
          <a href="/docs/getting-started/">Getting started</a>
          <a href="/docs/integrations/">Integrations</a>
          <a href="/docs/architecture/">Architecture</a>
        </div>
        <div>
          <strong>Verify</strong>
          <a href="/docs/benchmarks/">Benchmarks</a>
          <a href="/docs/security/">Security</a>
          <a href="/paper/">White paper</a>
        </div>
        <div>
          <strong>Project</strong>
          <a href="${github}">Source</a>
          <a href="${github}/issues">Issues</a>
          <a href="${github}/blob/main/LICENSE">Apache-2.0</a>
        </div>
      </div>
      <div class="shell footer-meta">
        <span>Built openly by Ajnas NB and contributors.</span>
        <span>Qarinah 0.1.0</span>
      </div>
    </footer>`;
}

function layout({ title, description, body, active = "", canonical = "/" }) {
  const fullTitle = title === "Qarinah" ? "Qarinah - Less context. More proof." : `${title} - Qarinah`;
  const url = `https://qarinah.io${canonical}`;
  return `<!doctype html>
<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#0d1117">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://qarinah.io/assets/qarinah-social-preview.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${fullTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://qarinah.io/assets/qarinah-social-preview.png">
  <link rel="icon" href="/assets/qarinah-mark.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/primer.css">
  <link rel="stylesheet" href="/site.css">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Qarinah",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: "0.1.0",
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    url: "https://qarinah.io",
    codeRepository: github,
    author: { "@type": "Person", name: "Ajnas NB" }
  })}</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${nav(active)}
  <main id="main">${body}</main>
  ${footer()}
  <script src="/site.js" defer></script>
</body>
</html>`;
}

function commandBlock(command, label = "Terminal") {
  const escaped = command.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<div class="command-block"><div><span>${label}</span><button class="copy-button" type="button" data-copy="${escaped.replaceAll('"', "&quot;")}">Copy</button></div><pre><code>${escaped}</code></pre></div>`;
}

function homePage() {
  return layout({
    title: "Qarinah",
    description: "Cross-editor project memory with 98.71% less repeated context in the published evaluation.",
    active: "home",
    canonical: "/",
    body: `
      <section class="hero">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Cross-editor project memory for coding agents</p>
            <h1>Your agents remember the project. You stop paying to replay it.</h1>
            <p class="hero-lede">Qarinah turns project decisions, code structure, tool outcomes, and evidence into a small cited memory pack for the task in front of you.</p>
            <div class="hero-actions">
              <a class="btn btn-primary btn-large" href="/docs/getting-started/">Install Qarinah</a>
              <a class="btn btn-outline btn-large" href="${github}">View source</a>
            </div>
            ${commandBlock("npm install --save-dev qarinah", "Install")}
            <div class="hero-proof" aria-label="Benchmark summary">
              <div class="hero-proof-result">
                <strong>98.71%</strong>
                <span>less repeated context</span>
              </div>
              <p>442,113 estimated input-context tokens became 5,682. Every required target was directly covered in the top five, and the compared input-context cost fell by the same 98.71% at the same token rate.</p>
              <a href="/docs/benchmarks/">Open the evidence</a>
            </div>
          </div>
        </div>
      </section>

      <section class="proof-strip" aria-label="Qarinah proof points">
        <div class="shell proof-strip-grid">
          <div><strong>98.71%</strong><span>less repeated context and input-context cost at the same token rate</span></div>
          <div><strong>77.81×</strong><span>the full project history was 77.81 times larger than the compiled context pack</span></div>
          <div><strong>100%</strong><span>required target coverage in the evaluated tasks</span></div>
          <div><strong>Cross-editor</strong><span>Codex, Claude Code, CLI, and compatible MCP workflows</span></div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">Why it exists</p>
            <h2>Long agent histories create an expensive choice.</h2>
          </div>
          <p>Replay everything and spend the context window. Summarize everything and lose the proof. Qarinah keeps the durable record and the compact pack separate.</p>
        </div>
        <div class="feature-grid">
          <article class="feature-card feature-card-wide">
            <span class="feature-index">01</span>
            <h3>Send less context</h3>
            <p>Coverage-aware retrieval selects complete, cited records under a hard budget. Current code and tools keep more room in the model request.</p>
          </article>
          <article class="feature-card">
            <span class="feature-index">02</span>
            <h3>Catch unsupported answers</h3>
            <p>Every selected item carries an event ID and content hash. Missing evidence can fail closed instead of becoming a confident guess.</p>
          </article>
          <article class="feature-card">
            <span class="feature-index">03</span>
            <h3>Keep the source of truth local</h3>
            <p>The append-only JSONL record stays in the project. Graphs, indexes, Markdown, JSON, and OKF exports are deterministic views you can rebuild.</p>
          </article>
        </div>
      </section>

      <section class="section section-alt">
        <div class="shell workflow-grid">
          <div>
            <p class="eyebrow">How it works</p>
            <h2>Record once. Compile only what the next task needs.</h2>
            <ol class="steps">
              <li><span>1</span><div><strong>Capture permitted events</strong><p>Codex, Claude Code, CLIs, crawlers, workflows, and project files enter through explicit adapters.</p></div></li>
              <li><span>2</span><div><strong>Build verifiable memory</strong><p>Qarinah writes a hash-chained record and derives the typed graph, hybrid index, and human-readable views.</p></div></li>
              <li><span>3</span><div><strong>Compile a cited pack</strong><p>The retriever respects evidence coverage, authority, conflicts, supersession, time, retention, and the requested token budget.</p></div></li>
            </ol>
          </div>
          <div class="architecture-frame">
            <img src="/assets/qarinah-flow.svg" alt="Qarinah architecture from permitted project activity to a small cited context pack.">
          </div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <p class="eyebrow">Works where you code</p>
          <h2>Keep one local project memory across Codex, Claude Code, CLI workflows, and compatible MCP clients.</h2>
        </div>
        <div class="integration-list">
          <a href="/docs/integrations/#codex"><span>Codex</span><strong>Lifecycle hooks and a Qarinah context skill</strong><i>Open guide</i></a>
          <a href="/docs/integrations/#claude-code"><span>Claude Code</span><strong>Reviewed plugin runtime with project-specific opt-in</strong><i>Open guide</i></a>
          <a href="/docs/integrations/#mcp"><span>MCP</span><strong>Read-only integrity and workspace diagnostics over stdio</strong><i>Open guide</i></a>
          <a href="/docs/interoperability/"><span>Open formats</span><strong>Markdown, JSON, typed graph, and Google OKF export</strong><i>Open guide</i></a>
        </div>
      </section>

      <section class="section final-cta">
        <div class="shell final-cta-inner">
          <div>
            <p class="eyebrow">Start with one project</p>
            <h2>Give the next agent the proof, not the whole transcript.</h2>
          </div>
          <div>
            <a class="btn btn-primary btn-large" href="/docs/getting-started/">Start in five minutes</a>
            <a class="text-link" href="/paper/">Read the white paper</a>
          </div>
        </div>
      </section>`
  });
}

function docsIndex() {
  const cards = docPages.filter((page) => page.route !== "paper").map((page, index) => `
    <a class="doc-card" href="/${page.route}/">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <h2>${page.title}</h2>
      <p>${page.description}</p>
      <strong>Read guide</strong>
    </a>`).join("");

  return layout({
    title: "Documentation",
    description: "Install, integrate, verify, and operate Qarinah project memory.",
    active: "docs",
    canonical: "/docs/",
    body: `
      <section class="docs-hero">
        <div class="shell">
          <p class="eyebrow">Qarinah documentation</p>
          <h1>From one initialized project to a small cited memory pack.</h1>
          <p>Install the package, opt in one workspace, connect a supported host, and verify every pack against the local event record.</p>
          ${commandBlock("npx qarinah init . && npx qarinah doctor")}
        </div>
      </section>
      <section class="section shell">
        <div class="doc-card-grid">${cards}</div>
      </section>`
  });
}

function tableOfContents(html) {
  const headings = [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)]
    .slice(0, 18)
    .map((match) => `<a class="toc-level-${match[1]}" href="#${match[2]}">${match[3].replace(/<[^>]+>/g, "")}</a>`);
  return headings.join("");
}

function addHeadingIds(html) {
  const seen = new Map();
  return html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (match, level, content) => {
    const plain = content.replace(/<[^>]+>/g, "").trim().toLowerCase();
    const base = plain
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return `<h${level} id="${id}">${content}</h${level}>`;
  });
}

async function markdownPage(page) {
  const raw = await readFile(path.join(root, page.source), "utf8");
  const markdown = rewriteMarkdownLinks(
    rewritePublicationLink(rewriteMarkdownAssets(normalizeVisibleCopy(raw)), page.source),
    page.source
  );
  const rendered = addHeadingIds(marked.parse(markdown));
  const active = page.route === "paper" ? "paper" : page.route.endsWith("benchmarks") ? "benchmarks" : "docs";
  const publicationLink = page.route === "paper"
    ? '<a href="https://doi.org/10.5281/zenodo.21547685">Cite on Zenodo</a>'
    : "";

  return layout({
    title: page.title,
    description: page.description,
    active,
    canonical: `/${page.route}/`,
    body: `
      <div class="doc-layout shell">
        <aside class="docs-sidebar" aria-label="Documentation sections">
          <div class="sidebar-label">Documentation</div>
          <a href="/docs/getting-started/">Getting started</a>
          <a href="/docs/integrations/">Codex and Claude Code</a>
          <a href="/docs/architecture/">Architecture</a>
          <a href="/docs/benchmarks/">Benchmarks</a>
          <a href="/docs/security/">Security</a>
          <a href="/docs/interoperability/">Interoperability</a>
          <a href="/paper/">White paper</a>
        </aside>
        <article class="markdown-body doc-content">
          <div class="doc-meta">
            <span>Qarinah 0.1.0</span>
            <span class="doc-meta-links">${publicationLink}<a href="${github}/blob/main/${page.source}">View on GitHub</a></span>
          </div>
          ${rendered}
        </article>
        <aside class="page-toc" aria-label="On this page">
          <div class="sidebar-label">On this page</div>
          ${tableOfContents(rendered)}
        </aside>
      </div>`
  });
}

await writeFile(path.join(output, "index.html"), homePage());
await mkdir(path.join(output, "docs"), { recursive: true });
await writeFile(path.join(output, "docs", "index.html"), docsIndex());

for (const page of docPages) {
  const destination = path.join(output, ...page.route.split("/"));
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "index.html"), await markdownPage(page));
}

const sitemapRoutes = ["/", "/docs/", ...docPages.map((page) => `/${page.route}/`)];
await writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>https://qarinah.io${route}</loc></url>`).join("\n")}\n</urlset>\n`
);

console.log(`Built ${sitemapRoutes.length} Qarinah pages in ${path.relative(root, output)}.`);
