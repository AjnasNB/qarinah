import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
const github = "https://github.com/AjnasNB/qarinah";
const siteOrigin = "https://qarinah.io";
const npmPackage = "https://www.npmjs.com/package/qarinah";
const doi = "https://doi.org/10.5281/zenodo.21850747";
const conceptDoi = "https://doi.org/10.5281/zenodo.21547684";
const historicalVersionDoi = "https://doi.org/10.5281/zenodo.21843240";
const paperVersion = "1.4";
const paperPdf = `/paper/Qarinah-Technical-White-Paper-v${paperVersion}.pdf`;
const historicalPaperPdfs = new Map([
  ["Qarinah-Technical-White-Paper-v1.2.pdf", "/paper/Qarinah-Technical-White-Paper-v1.2.pdf"],
  ["Qarinah-Technical-White-Paper-v1.3.pdf", "/paper/Qarinah-Technical-White-Paper-v1.3.pdf"]
]);
const releaseDate = "2026-08-08";
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const productVersion = packageJson.version;
const productPositioning = "Evidence-linked project memory for coding agents.";
const productExplanation = "Qarinah keeps one compact, cited project memory beside your code, so Codex, Claude Code, Cursor, and compatible tools can continue from verified context instead of starting from zero.";
const answerEngineQuestions = [
  {
    name: "What is Qarinah?",
    text: `${productPositioning} ${productExplanation}`
  },
  {
    name: "How do I switch coding agents without starting over?",
    text: "Initialize Qarinah once in the project, let supported adapters record permitted decisions and outcomes, then ask the next agent for a verified handoff. Qarinah returns a compact cited context pack with stale, conflicting, and superseded decisions marked."
  },
  {
    name: "Does Qarinah reduce coding-agent context tokens?",
    text: "Qarinah can reduce repeated retained-history context when a task needs only a relevant subset. Its published evaluator measured 442,113 estimated input-context tokens for full-history replay and 5,682 for the same current sources plus Qarinah packs, a 98.71% reduction in the compared repeated-context slice."
  },
  {
    name: "Does Qarinah reduce every Codex or Claude bill by 98.71%?",
    text: "No. The published result compares estimated repeated input-context volume. Total provider cost can also include current source files, output, reasoning, tools, caching, retrieval work, and fixed charges."
  },
  {
    name: "Does Qarinah guarantee correct answers or eliminate hallucinations?",
    text: "No. Qarinah makes selected memory inspectable with event IDs, hashes, coverage diagnostics, conflicts, and supersession. That improves traceability but cannot guarantee a model output is correct."
  },
  {
    name: "Does Qarinah work with Codex and Claude Code?",
    text: "Yes. Qarinah ships reviewed integrations for ChatGPT desktop Work mode and Codex, Codex CLI, and Claude Code or Claude CLI. Codex IDE users can use the project skill or explicit CLI because that surface does not install full plugins."
  },
  {
    name: "Can Codex and Claude Code share one Qarinah memory?",
    text: "Yes, when both integrations use the same explicitly initialized and trusted project root. The durable record belongs to the project rather than one editor's private chat."
  },
  {
    name: "Does Qarinah upload project memory to a hosted service?",
    text: "No hosted Qarinah memory service is required. The authoritative append-only record and deterministic derived views stay in the project unless the user explicitly exports or moves them."
  },
  {
    name: "Does Qarinah have a local memory dashboard?",
    text: "Yes. The qarinah dashboard command generates a local, read-only HTML view of current and superseded decisions, explicit conflicts, citations, recent permitted activity, affected files, and an optional caller-measured context comparison. It is derived from the authoritative ledger and does not grant agent access or execute tools."
  },
  {
    name: "Is Qarinah open source?",
    text: "Yes. Qarinah is available under the Apache License 2.0, with its source, benchmark fixtures, machine-readable results, security model, integrations, and technical paper published for review."
  }
];

const alternativeSystems = [
  {
    name: "Qarinah",
    slug: "qarinah",
    category: "Local project-memory compiler",
    primaryJob: "Preserve permitted software-project history in an inspectable local ledger and compile bounded, cited context packs for coding agents.",
    overlap: "Long-term project memory, retrieval, provenance, and cross-session continuity.",
    boundary: "Qarinah does not run an autonomous agent loop or provide a general personalization service. Its focus is repository-owned evidence that can move across supported coding hosts.",
    fit: "A project needs one auditable memory record across Codex, Claude Code, Cursor, CLI, and compatible MCP workflows.",
    sources: [{ label: "Qarinah source", url: github }]
  },
  {
    name: "Mem0",
    slug: "mem0",
    category: "Personalization and agent memory",
    primaryJob: "Provide user-, session-, and agent-level memory for applications through managed or self-hosted operation.",
    overlap: "Long-term memory extraction, storage, retrieval, and use in agent applications.",
    boundary: "Mem0 addresses broader application personalization. Qarinah foregrounds a local software-project ledger, source identities, conflicts, supersession, and deterministic cited packs.",
    fit: "An application needs reusable personalized memory for users or agents beyond a software repository workflow.",
    sources: [{ label: "Mem0 source", url: "https://github.com/mem0ai/mem0" }]
  },
  {
    name: "Letta",
    slug: "letta",
    category: "Stateful agent platform",
    primaryJob: "Run stateful agents with memory blocks, tools, agent APIs, and local or hosted operation.",
    overlap: "Persistent agent state and memory that survives across conversations or tasks.",
    boundary: "Letta owns the agent runtime and its model loop. Qarinah supplies portable project memory to external coding agents instead of replacing their runtime.",
    fit: "The system needs an integrated stateful-agent runtime, not only a project-memory layer.",
    sources: [{ label: "Letta source", url: "https://github.com/letta-ai/letta" }]
  },
  {
    name: "LangMem and LangGraph memory",
    slug: "langmem-langgraph",
    category: "Programmable agent-memory toolkit",
    primaryJob: "Add semantic, episodic, and procedural memory plus persistence to LangGraph and custom agent systems.",
    overlap: "Memory formation, storage, search, consolidation, and cross-session agent context.",
    boundary: "LangMem is a programmable toolkit used with a chosen model and store. Qarinah's core ledger, lexical and graph retrieval, and pack rendering do not require a model or hosted store.",
    fit: "A LangGraph or custom-agent application needs memory behavior embedded directly in its graph or runtime.",
    sources: [
      { label: "LangMem documentation", url: "https://langchain-ai.github.io/langmem/" },
      { label: "LangGraph memory", url: "https://langchain-ai.github.io/langgraph/agents/memory/" }
    ]
  },
  {
    name: "Graphiti and Zep",
    slug: "graphiti-zep",
    category: "Temporal context graph",
    primaryJob: "Represent evolving entities and facts in a temporal graph with episode provenance and hybrid retrieval.",
    overlap: "Temporal state, provenance, graph relationships, and retrieval over changing knowledge.",
    boundary: "Graphiti targets general evolving knowledge and graph infrastructure. Qarinah targets repository and coding-work evidence stored with the project.",
    fit: "An application needs a general temporal knowledge graph across people, entities, events, or business facts.",
    sources: [{ label: "Graphiti source", url: "https://github.com/getzep/graphiti" }]
  },
  {
    name: "Native coding-host memory",
    slug: "native-coding-host-memory",
    category: "Memory inside one coding product",
    primaryJob: "Retain repository facts, preferences, rules, or instructions within GitHub Copilot, Claude Code, or Cursor.",
    overlap: "Repository context carried across sessions inside a coding assistant.",
    boundary: "Native memory is integrated with its host. Qarinah keeps an independent, inspectable project record designed for use across supported hosts, with explicit citations, hashes, conflicts, and rebuildable views.",
    fit: "A team prefers the convenience and native behavior of one coding host and does not need an independent cross-host record.",
    sources: [
      { label: "GitHub Copilot Memory", url: "https://docs.github.com/en/copilot/concepts/agents/copilot-memory" },
      { label: "Claude Code memory", url: "https://code.claude.com/docs/en/memory" },
      { label: "Cursor Memories", url: "https://docs.cursor.com/en/context/memories" }
    ]
  }
];

const alternativeQuestions = [
  {
    name: "What kind of product is Qarinah?",
    text: "Qarinah is a local, evidence-linked project-memory compiler for coding agents. It preserves permitted software-project history in an inspectable ledger and compiles bounded cited context packs for supported hosts."
  },
  {
    name: "Is Qarinah better than Mem0, Letta, LangMem, or Graphiti?",
    text: "There is no universal winner because these products solve different jobs. Qarinah emphasizes repository-owned, cross-host project evidence; the alternatives may emphasize personalization, a complete agent runtime, programmable application memory, or a general temporal graph."
  },
  {
    name: "Does Qarinah replace GitHub Copilot Memory, Claude Code memory, or Cursor Memories?",
    text: "Not necessarily. Native host memory is convenient inside its own product. Qarinah is useful when a project needs one independent, inspectable record that can be queried by several supported coding hosts."
  },
  {
    name: "Does Qarinah require a hosted service, embedding API, or vector database?",
    text: "No. Qarinah's core local workflow uses the project ledger plus deterministic lexical and graph retrieval. Hosted services, an embedding API, and a vector database are not required for that workflow."
  },
  {
    name: "How should teams compare coding-agent memory systems?",
    text: "Compare ownership of the source record, portability across hosts, provenance, conflict and supersession handling, model and infrastructure requirements, runtime scope, and how evidence can be inspected or rebuilt."
  }
];

const docPages = [
  {
    route: "docs/cross-agent-handoffs",
    source: "docs/CROSS-AGENT-HANDOFFS.md",
    title: "Switch coding agents without starting over",
    description: "Complete a verified handoff across Codex, Claude Code, Cursor, and other supported coding agents without replaying the project history.",
    section: "Start",
    aliases: ["agent handoff", "switch coding agents", "cross agent context", "universal context engine", "shared coding context"]
  },
  {
    route: "docs/getting-started",
    source: "docs/GETTING-STARTED.md",
    title: "Getting started",
    description: "Install Qarinah local project memory, initialize one codebase, and compile the first cited context pack.",
    section: "Start",
    aliases: ["install qarinah", "project setup", "first query", "coding agent memory quickstart"]
  },
  {
    route: "docs/cli",
    source: "docs/CLI-REFERENCE.md",
    title: "CLI reference",
    description: "Use every Qarinah CLI command, option, input format, output mode, and verified failure behavior.",
    section: "Reference",
    aliases: ["command line", "qarinah commands", "init record scan build query doctor status export"]
  },
  {
    route: "docs/api",
    source: "docs/API-REFERENCE.md",
    title: "JavaScript and TypeScript API",
    description: "Embed Qarinah project memory with the exported JavaScript functions, TypeScript types, schemas, and examples.",
    section: "Reference",
    aliases: ["node api", "typescript api", "javascript sdk", "developer reference"]
  },
  {
    route: "docs/integrations",
    source: "docs/HOST-INTEGRATIONS.md",
    title: "Codex and Claude Code project memory",
    description: "Connect one local Qarinah project memory to Codex, Claude Code, local CLIs, and compatible MCP hosts.",
    section: "Connect",
    aliases: ["codex memory", "claude code memory", "cross editor memory", "coding agent integrations"]
  },
  {
    route: "docs/mcp",
    source: "docs/MCP-GUIDE.md",
    title: "MCP server guide",
    description: "Configure diagnostic-only or explicitly consent-gated, zero-write MCP context retrieval for supported agent clients.",
    section: "Connect",
    aliases: ["model context protocol", "mcp tools", "context status", "context doctor", "stdio"]
  },
  {
    route: "docs/team-memory",
    source: "docs/TEAM-MEMORY.md",
    title: "Shared team memory",
    description: "Set up shared, verifiable multi-agent memory, dashboards, freshness, federation, encrypted sync, evaluation, and causal receipts.",
    section: "Connect",
    aliases: ["team memory", "dashboard", "freshness", "multi repo", "encrypted sync", "context query", "task packs"]
  },
  {
    route: "docs/dashboard",
    source: "docs/DASHBOARD.md",
    title: "Local memory dashboard",
    description: "Generate and interpret Qarinah's local dashboard for decisions, supersession, conflicts, citations, permitted activity, affected files, and measured context savings.",
    section: "Operate",
    aliases: ["memory dashboard", "project dashboard", "decision dashboard", "context savings", "agent activity", "affected files"]
  },
  {
    route: "docs/sqlite-read-model",
    source: "docs/SQLITE-READ-MODEL.md",
    title: "SQLite read model",
    description: "Use the WAL and FTS5 read model without replacing Qarinah's authoritative hash-chained JSONL ledger.",
    section: "Understand",
    aliases: ["sqlite", "fts5", "wal", "read database", "rebuild database", "schema migrations"]
  },
  {
    route: "docs/temporal-authority",
    source: "docs/TEMPORAL-AUTHORITY.md",
    title: "Temporal memory and authority",
    description: "Apply point-in-time validity, freshness, Maqam-owned scopes, supersession, conflicts, and repository isolation.",
    section: "Understand",
    aliases: ["temporal memory", "stale context", "supersession", "memory scopes", "repository isolation"]
  },
  {
    route: "docs/token-efficient-context",
    source: "docs/TOKEN-EFFICIENT-CONTEXT.md",
    title: "Reduce repeated coding-agent context",
    description: "Compile token-efficient cited context packs for coding agents without replaying accumulated project history.",
    section: "Use",
    aliases: ["save tokens", "token reduction", "context compression", "context window", "prompt compression"]
  },
  {
    route: "docs/recipes",
    source: "docs/RECIPES.md",
    title: "Coding-agent memory recipes",
    description: "Run practical Qarinah recipes for editing, refactoring, debugging, migrations, research, and governed releases.",
    section: "Use",
    aliases: ["examples", "workflows", "codex recipes", "claude code recipes", "use cases"]
  },
  {
    route: "docs/architecture",
    source: "docs/ARCHITECTURE.md",
    title: "Architecture",
    description: "Understand Qarinah's authoritative ledger, SQLite read model, temporal graph, Maqam scopes, retrieval pipeline, and cited compiler.",
    section: "Understand",
    aliases: ["knowledge graph", "bm25", "retrieval", "provenance", "hash chain"]
  },
  {
    route: "docs/benchmarks",
    source: "docs/BENCHMARKS.md",
    title: "Context reduction benchmarks",
    description: "Reproduce Qarinah's 98.71% estimated repeated-context reduction and its 40/50/100-file retrieval and projection-integrity regression.",
    section: "Verify",
    aliases: ["token benchmark", "context compression", "cost comparison", "machine readable result", "multi file benchmark", "sqlite graph markdown"]
  },
  {
    route: "docs/security",
    source: "docs/SECURITY.md",
    title: "Security",
    description: "Review Qarinah workspace trust, capture consent, privacy, redaction, integrity, and disclosure boundaries.",
    section: "Verify",
    aliases: ["privacy", "capture policy", "local first", "redaction", "threat model"]
  },
  {
    route: "docs/interoperability",
    source: "docs/INTEROPERABILITY.md",
    title: "Interoperability",
    description: "Move Qarinah project memory across tools with deterministic Markdown, JSON, graph, and Open Knowledge Format exports.",
    section: "Connect",
    aliases: ["cross editor", "import export", "okf", "open knowledge format", "portable memory"]
  },
  {
    route: "docs/troubleshooting",
    source: "docs/TROUBLESHOOTING.md",
    title: "Troubleshooting and recovery",
    description: "Diagnose Qarinah installation, workspace trust, MCP transport, integrity, retrieval, and rebuild failures.",
    section: "Operate",
    aliases: ["errors", "repair", "mcp closed", "doctor", "recovery"]
  },
  {
    route: "docs/faq",
    source: "docs/FAQ.md",
    title: "Frequently asked questions",
    description: "Answers about Qarinah project memory, context reduction, token estimates, privacy, MCP, Codex, and Claude Code.",
    section: "Start",
    aliases: ["faq", "questions", "token savings", "does qarinah summarize", "vector database"]
  },
  {
    route: "docs/migrations",
    source: "docs/MIGRATIONS.md",
    title: "Migration guide",
    description: "Upgrade Qarinah releases, workspaces, plugins, schemas, and derived views without losing the source record.",
    section: "Operate",
    aliases: ["upgrade", "version migration", "plugin reinstall", "schema migration"]
  },
  {
    route: "paper",
    source: "docs/WHITEPAPER.md",
    title: "Technical white paper",
    description: "The implementation-backed technical white paper for Qarinah local project memory and cited context compilation.",
    section: "Verify",
    aliases: ["research paper", "doi", "zenodo", "project memory compiler"]
  }
];

const routesBySource = new Map(docPages.map((page) => [page.source.replaceAll("\\", "/"), `/${page.route}/`]));
const searchEntries = [
  {
    route: "/",
    title: "Qarinah - Local Project Memory and Context Compiler for Coding Agents",
    description: productPositioning,
    headings: [],
    keywords: ["coding agent memory", "project memory", "context compiler", "token-efficient context"],
    content: "Qarinah keeps a local evidence-linked project record and compiles the small cited context pack needed for the current coding task."
  },
  {
    route: "/alternatives/",
    title: "Qarinah alternatives and coding-agent memory comparison",
    description: "Compare Qarinah with Mem0, Letta, LangMem, LangGraph memory, Graphiti, Zep, and native coding-host memory by product boundary.",
    headings: [
      { id: "choose-by-job", text: "Start with the job you need done" },
      { id: "comparison", text: "Compare the operating boundaries" },
      { id: "evaluation-criteria", text: "Six questions for a useful evaluation" },
      { id: "method", text: "Method and sources" },
      { id: "questions", text: "Questions teams ask before choosing" }
    ],
    keywords: [
      "Qarinah alternatives",
      "Qarinah vs Mem0",
      "Qarinah vs Letta",
      "Qarinah vs LangMem",
      "Qarinah vs Graphiti",
      "coding agent memory comparison",
      "project memory for coding agents",
      "cross-agent memory"
    ],
    content: alternativeSystems.map((system) => `${system.name}. ${system.category}. ${system.primaryJob} ${system.overlap} ${system.boundary} ${system.fit}`).join(" ")
  }
];

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
for (const filename of [
  "Qarinah-Technical-White-Paper-v1.2.pdf",
  "Qarinah-Technical-White-Paper-v1.3.pdf",
  `Qarinah-Technical-White-Paper-v${paperVersion}.pdf`
]) {
  await cp(path.join(root, "output", "pdf", filename), path.join(output, "paper", filename));
}

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
    } else if (resolved.endsWith(`Qarinah-Technical-White-Paper-v${paperVersion}.pdf`)) {
      target = paperPdf;
    } else if ([...historicalPaperPdfs.keys()].some((filename) => resolved.endsWith(filename))) {
      const filename = [...historicalPaperPdfs.keys()].find((candidate) => resolved.endsWith(candidate));
      target = historicalPaperPdfs.get(filename);
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
  return markdown
    .replace(
      `https://github.com/AjnasNB/qarinah/blob/main/output/pdf/Qarinah-Technical-White-Paper-v${paperVersion}.pdf`,
      paperPdf
    )
    .replace(
      "The v1.4 version DOI is assigned only when this manuscript is deposited; the persistent paper series uses concept DOI",
      "The published v1.4 version DOI is [10.5281/zenodo.21850747](https://doi.org/10.5281/zenodo.21850747); the persistent paper series uses concept DOI"
    )
    .replace(
      "- **Version DOI:** assigned by Zenodo when v1.4 is deposited",
      "- **Version DOI:** [10.5281/zenodo.21850747](https://doi.org/10.5281/zenodo.21850747)"
    )
    .replace(
      "https://doi.org/10.5281/zenodo.21547684. A version DOI is assigned\nwhen this manuscript is deposited.",
      "https://doi.org/10.5281/zenodo.21547684. The published v1.4 version DOI is\nhttps://doi.org/10.5281/zenodo.21850747."
    );
}

function nav(active = "") {
  const items = [
    ["Product", "/", "home"],
    ["Docs", "/docs/", "docs"],
    ["Answers", "/docs/faq/", "answers"],
    ["Compare", "/alternatives/", "alternatives"],
    ["Benchmarks", "/docs/benchmarks/", "benchmarks"],
    ["Paper", "/paper/", "paper"],
    ["Search", "/search/", "search"]
  ];

  return `
    <header class="site-header">
      <div class="shell header-inner">
        <a class="brand" href="/" aria-label="Qarinah home">
          <img src="/assets/qarinah-mark.svg" width="30" height="30" alt="">
          <span>Qarinah</span>
          <span class="version-label">${productVersion}</span>
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
          <p>${productPositioning}</p>
        </div>
        <div>
          <strong>Build</strong>
          <a href="/docs/getting-started/">Getting started</a>
          <a href="/docs/cli/">CLI reference</a>
          <a href="/docs/api/">JavaScript API</a>
          <a href="/docs/integrations/">Integrations</a>
        </div>
        <div>
          <strong>Verify</strong>
          <a href="/docs/faq/">Direct answers</a>
          <a href="/alternatives/">Compare approaches</a>
          <a href="/docs/benchmarks/">Benchmarks</a>
          <a href="/docs/security/">Security</a>
          <a href="/paper/">White paper</a>
        </div>
        <div>
          <strong>Project</strong>
          <a href="${npmPackage}">npm package</a>
          <a href="${github}">Source</a>
          <a href="${github}/issues">Issues</a>
          <a href="${github}/blob/main/LICENSE">Apache-2.0</a>
        </div>
      </div>
      <div class="shell footer-meta">
        <span>Built openly by Ajnas NB and contributors.</span>
        <span>Qarinah ${productVersion}</span>
      </div>
    </footer>`;
}

function breadcrumbSchema(canonical, title) {
  if (canonical === "/") return null;
  const parts = [{ name: "Qarinah", item: `${siteOrigin}/` }];
  if (canonical.startsWith("/docs/") && canonical !== "/docs/") {
    parts.push({ name: "Documentation", item: `${siteOrigin}/docs/` });
  }
  parts.push({ name: title, item: `${siteOrigin}${canonical}` });
  return {
    "@type": "BreadcrumbList",
    itemListElement: parts.map((part, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: part.name,
      item: part.item
    }))
  };
}

function structuredData({ title, description, canonical, kind = "doc" }) {
  const url = `${siteOrigin}${canonical}`;
  const person = {
    "@type": "Person",
    "@id": `${siteOrigin}/#ajnas-nb`,
    name: "Ajnas NB",
    url: "https://github.com/AjnasNB"
  };
  const graph = [person];

  if (kind === "home") {
    graph.push(
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#website`,
        url: `${siteOrigin}/`,
        name: "Qarinah",
        description,
        inLanguage: "en",
        publisher: { "@id": person["@id"] },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteOrigin}/search/?q={search_term_string}`
          },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteOrigin}/#software`,
        name: "Qarinah",
        description,
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "Cross-agent context engine for software projects",
        operatingSystem: "Windows, macOS, Linux",
        softwareVersion: productVersion,
        softwareRequirements: "Node.js 22, 24, or 26",
        isAccessibleForFree: true,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        url: `${siteOrigin}/`,
        downloadUrl: npmPackage,
        installUrl: `${siteOrigin}/docs/getting-started/`,
        codeRepository: github,
        releaseNotes: `${github}/releases/tag/v${productVersion}`,
        featureList: [
          "Verified handoffs between coding agents",
          "Local append-only project memory",
          "Evidence-linked cited context packs",
          "Typed project and provenance graph",
          "Budgeted hybrid retrieval",
          "Codex and Claude Code integrations",
          "Consent-gated MCP context retrieval",
          "Multi-repository memory with separate authority",
          "Freshness checks and a visual memory dashboard",
          "Encrypted team bundles and signed checkpoints",
          "Deterministic Markdown, JSON, graph, and OKF exports"
        ],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD"
        },
        author: { "@id": person["@id"] },
        sameAs: [github, npmPackage, doi]
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${siteOrigin}/#source`,
        name: "Qarinah source code",
        description,
        codeRepository: github,
        programmingLanguage: ["JavaScript", "TypeScript"],
        runtimePlatform: "Node.js 22, 24, and 26",
        version: productVersion,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        author: { "@id": person["@id"] }
      }
    );
  } else if (kind === "paper") {
    graph.push({
      "@type": "ScholarlyArticle",
      "@id": `${url}#paper`,
      headline: title,
      description,
      url,
      inLanguage: "en",
      dateCreated: releaseDate,
      dateModified: releaseDate,
      version: paperVersion,
      identifier: doi,
      creativeWorkStatus: "Published",
      datePublished: releaseDate,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      author: { "@id": person["@id"] },
      contributor: {
        "@type": "Person",
        name: "Shahin Ahammed"
      },
      encoding: {
        "@type": "MediaObject",
        contentUrl: paperPdf,
        encodingFormat: "application/pdf"
      },
      sameAs: [doi],
      isPartOf: { "@id": `${siteOrigin}/#website` }
    });
  } else if (kind === "alternatives") {
    graph.push(
      {
        "@type": "CollectionPage",
        "@id": `${url}#comparison`,
        name: title,
        description,
        url,
        inLanguage: "en",
        dateModified: releaseDate,
        author: { "@id": person["@id"] },
        about: alternativeSystems.map((system) => ({
          "@type": "SoftwareApplication",
          name: system.name,
          applicationCategory: "DeveloperApplication",
          url: system.sources[0].url
        }))
      },
      {
        "@type": "ItemList",
        "@id": `${url}#systems`,
        name: "Project-memory and coding-agent memory approaches",
        itemListOrder: "https://schema.org/ItemListUnordered",
        numberOfItems: alternativeSystems.length,
        itemListElement: alternativeSystems.map((system, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "SoftwareApplication",
            name: system.name,
            description: system.primaryJob,
            applicationCategory: "DeveloperApplication",
            url: system.sources[0].url
          }
        }))
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        name: "Qarinah alternatives questions",
        mainEntity: alternativeQuestions.map((entry) => ({
          "@type": "Question",
          name: entry.name,
          acceptedAnswer: {
            "@type": "Answer",
            text: entry.text
          }
        }))
      }
    );
  } else if (kind === "benchmark") {
    graph.push(
      {
        "@type": "TechArticle",
        headline: title,
        description,
        url,
        dateModified: releaseDate,
        inLanguage: "en",
        author: { "@id": person["@id"] }
      },
      {
        "@type": "Dataset",
        name: "Qarinah software-task context evaluation",
        description: "Committed inputs and machine-readable outputs for the Qarinah repeated-context evaluation.",
        url,
        version: productVersion,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        creator: { "@id": person["@id"] },
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${github}/blob/main/bench/results/software-task-context-0.1.1.json`
        }
      }
    );
  } else if (kind === "howto") {
    const handoffSteps = canonical === "/docs/cross-agent-handoffs/"
      ? [
          { "@type": "HowToStep", name: "Begin a real task", text: "Work in one supported coding agent." },
          { "@type": "HowToStep", name: "Record permitted outcomes", text: "Keep decisions, changes, evidence, and tool outcomes in the project-owned Qarinah record." },
          { "@type": "HowToStep", name: "Switch agents", text: "Open the same project in another supported coding agent." },
          { "@type": "HowToStep", name: "Ask for the handoff", text: "Query Qarinah for the task that needs to continue." },
          { "@type": "HowToStep", name: "Receive cited context", text: "Use the compact pack with stale, conflicting, and superseded decisions marked." },
          { "@type": "HowToStep", name: "Finish the task", text: "Continue without replaying the complete project history." }
        ]
      : [
          { "@type": "HowToStep", name: "Install Qarinah", text: "Install the qarinah npm package in the project." },
          { "@type": "HowToStep", name: "Initialize the workspace", text: "Run qarinah init for the exact project root." },
          { "@type": "HowToStep", name: "Compile a cited pack", text: "Record or capture permitted evidence, build the derived views, and query a bounded pack." }
        ];
    graph.push({
      "@type": "HowTo",
      name: title,
      description,
      url,
      totalTime: "PT5M",
      step: handoffSteps
    });
  } else if (kind === "faq") {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      name: title,
      description,
      url,
      inLanguage: "en",
      dateModified: releaseDate,
      author: { "@id": person["@id"] },
      mainEntity: answerEngineQuestions.map((entry) => ({
        "@type": "Question",
        name: entry.name,
        acceptedAnswer: {
          "@type": "Answer",
          text: entry.text
        }
      }))
    });
  } else {
    graph.push({
      "@type": kind === "api" ? "APIReference" : "TechArticle",
      headline: title,
      description,
      url,
      dateModified: releaseDate,
      inLanguage: "en",
      author: { "@id": person["@id"] },
      isPartOf: { "@id": `${siteOrigin}/#website` }
    });
  }

  const breadcrumb = breadcrumbSchema(canonical, title);
  if (breadcrumb) graph.push(breadcrumb);
  return { "@context": "https://schema.org", "@graph": graph };
}

function layout({ title, description, body, active = "", canonical = "/", kind = "doc" }) {
  const fullTitle = canonical === "/"
    ? "Qarinah - Your project remembers across coding agents"
    : `${title} - Qarinah`;
  const url = `${siteOrigin}${canonical}`;
  const ogType = kind === "home" || kind === "search" ? "website" : "article";
  const schema = JSON.stringify(structuredData({ title: fullTitle, description, canonical, kind }))
    .replaceAll("</", "<\\/");
  return `<!doctype html>
<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="theme-color" content="#0d1117">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="Qarinah machine-readable overview">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="Qarinah">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${siteOrigin}/assets/qarinah-social-preview.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="640">
  <meta property="og:image:alt" content="Qarinah - your project remembers across coding agents.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${fullTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${siteOrigin}/assets/qarinah-social-preview.png">
  <meta name="twitter:image:alt" content="Qarinah - your project remembers across coding agents.">
  <link rel="icon" href="/assets/qarinah-mark.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/primer.css">
  <link rel="stylesheet" href="/site.css">
  <script type="application/ld+json">${schema}</script>
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
    title: "Qarinah - Cross-Agent Context Engine",
    description: productPositioning,
    active: "home",
    canonical: "/",
    kind: "home",
    body: `
      <section class="hero">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">${productPositioning}</p>
            <h1>Your project remembers when your coding agent changes.</h1>
            <p class="hero-lede">${productExplanation}</p>
            <div class="hero-actions">
              <a class="btn btn-primary btn-large" href="/docs/getting-started/">Set up one project</a>
              <a class="hero-text-link" href="/docs/cross-agent-handoffs/">See the verified handoff</a>
            </div>
            <a class="hero-evidence-link" href="/docs/benchmarks/">Measured with public artifacts and explicit limits</a>
          </div>
        </div>
      </section>

      <section class="handoff-stage" aria-labelledby="handoff-stage-title">
        <div class="shell handoff-stage-grid">
          <div class="handoff-stage-copy">
            <p class="eyebrow">One project record</p>
            <h2 id="handoff-stage-title">Set it up once. Continue from any supported agent.</h2>
            <p>Qarinah keeps the durable record beside the repository. Every supported host queries the same cited decisions, outcomes, conflicts, and superseded context.</p>
            ${commandBlock("npx qarinah setup . --codex --claude --cursor --capture content --allow-query", "One-time project setup")}
            <div class="host-shortcuts" aria-label="Qarinah host commands">
              <span><strong>Codex</strong><code>$qarinah</code></span>
              <span><strong>Claude Code</strong><code>/qarinah &lt;task&gt;</code></span>
              <span><strong>Any terminal</strong><code>npx qarinah query "&lt;task&gt;"</code></span>
            </div>
          </div>
          <aside class="hero-proof" aria-label="Benchmark summary">
            <p class="eyebrow">One measured result</p>
            <div class="hero-proof-result">
              <strong>98.71%</strong>
              <span>less repeated context</span>
            </div>
            <p>442,113 estimated input-context tokens became 5,682. Every required target was directly covered in the top five in the published fixture.</p>
            <a href="/docs/benchmarks/">Read the method, artifacts, and limits</a>
          </aside>
        </div>
      </section>

      <section class="benchmark-ribbon" aria-labelledby="benchmark-ribbon-title">
        <div class="shell">
          <div class="benchmark-ribbon-heading">
            <p class="eyebrow">Reproducible release benchmarks</p>
            <h2 id="benchmark-ribbon-title">Three outputs. Three exact measurements.</h2>
          </div>
          <div class="benchmark-ribbon-grid">
            <article>
              <strong>98.7148%</strong>
              <span>Six-task repeated-context reduction</span>
              <small>442,113 -&gt; 5,682 estimated tokens</small>
            </article>
            <article>
              <strong>98.75%</strong>
              <span>Model-facing continuation capsule</span>
              <small>9,489 -&gt; 119 estimated tokens</small>
            </article>
            <article>
              <strong>89.05%</strong>
              <span>Complete cited continuation pack</span>
              <small>9,489 -&gt; 1,039 estimated tokens</small>
            </article>
          </div>
          <p class="benchmark-ribbon-note">The two continuation results use the same 42-record history but measure different outputs: a minimal handoff capsule and its complete evidence-rich audit pack. A separate scale regression passed 380/380 file-specific queries across 40-, 50-, and 100-file projects, plus SQLite, graph, Markdown, conflict, supersession, repair, and abstention controls. Portable <code>ceil(characters / 4)</code> estimates; not provider billing receipts. <a href="/docs/benchmarks/">Method, artifacts, and limits</a>.</p>
        </div>
      </section>

      <section class="proof-strip" aria-label="Qarinah proof points">
        <div class="shell proof-strip-grid">
          <div><strong>98.71%</strong><span>less repeated context and input-context cost at the same token rate</span></div>
          <div><strong>77.81 to 1</strong><span>the evaluated full-history input was 77.81 times larger than the compiled context pack</span></div>
          <div><strong>100%</strong><span>required target coverage in the evaluated tasks</span></div>
          <div><strong>Shared memory</strong><span>Codex, Claude Code, Cursor, CLI, and compatible MCP workflows</span></div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">One tool, three ways to use it</p>
            <h2>Start alone. Share when the project grows.</h2>
          </div>
          <p>Qarinah is useful without Maqam, a hosted account, or a team plan. The same local record can later support collaboration or a governed agent stack without changing its source of truth.</p>
        </div>
        <div class="use-mode-grid">
          <article class="use-mode-card">
            <span>Personal</span>
            <h3>One developer, many coding agents</h3>
            <p>Initialize one repository and let Codex, Claude Code, Cursor, CLI tools, and compatible MCP clients query the same cited project memory.</p>
            <a href="/docs/getting-started/">Set up one project</a>
          </article>
          <article class="use-mode-card">
            <span>Portable</span>
            <h3>Inspect memory on any screen</h3>
            <p>Open the generated dashboard or export deterministic Markdown, JSON, graph, and OKF views for read-only review on desktop or mobile. No native mobile agent runtime is required.</p>
            <a href="/docs/interoperability/">See portable formats</a>
          </article>
          <article class="use-mode-card">
            <span>Teams</span>
            <h3>Share memory without flattening authority</h3>
            <p>Connect repositories with typed relationships, preserve their separate access boundaries, and exchange encrypted bundles with signed checkpoints and explicit membership.</p>
            <a href="/docs/team-memory/">Open the team guide</a>
          </article>
          <article class="use-mode-card">
            <span>Governed</span>
            <h3>Add Maqam only when you need control</h3>
            <p>Maqam can attach temporary memory scopes and govern disclosures for high-authority workflows. Qarinah remains an independent project-memory tool before and after that integration.</p>
            <a href="/docs/temporal-authority/">Review authority scopes</a>
          </article>
        </div>
      </section>

      <section class="section section-alt">
        <div class="shell">
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
        </div>
      </section>

      <section class="section">
        <div class="shell workflow-grid">
          <div>
            <p class="eyebrow">Verified handoffs between coding agents</p>
            <h2>Start in one agent. Finish in another.</h2>
            <p class="workflow-intro">The project keeps the shared record. Each agent receives only the cited context needed for the task in front of it.</p>
            <ol class="steps">
              <li><span>1</span><div><strong>Begin a real task</strong><p>Work in Codex, Claude Code, Cursor, or another supported coding agent.</p></div></li>
              <li><span>2</span><div><strong>Record the outcome</strong><p>Keep permitted decisions, changes, evidence, and tool results in the project-owned ledger.</p></div></li>
              <li><span>3</span><div><strong>Switch agents</strong><p>Open the same project in another supported host without copying the old chat.</p></div></li>
              <li><span>4</span><div><strong>Ask for the handoff</strong><p>Query Qarinah for the task that needs to continue.</p></div></li>
              <li><span>5</span><div><strong>Receive cited context</strong><p>Get a compact pack with stale, conflicting, and superseded decisions marked.</p></div></li>
              <li><span>6</span><div><strong>Finish the task</strong><p>Continue with current evidence instead of replaying the complete project history.</p></div></li>
            </ol>
            <a class="text-link workflow-link" href="/docs/cross-agent-handoffs/">Open the complete handoff guide</a>
          </div>
          <div class="architecture-frame">
            <img src="/assets/qarinah-flow.svg" alt="Qarinah architecture from permitted project activity to a small cited context pack.">
          </div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <p class="eyebrow">Works where you code</p>
          <h2>Keep one shared, verifiable project memory across Codex, Claude Code, Cursor, CLI workflows, and compatible MCP clients.</h2>
        </div>
        <div class="integration-list">
          <a href="/docs/integrations/"><span>Codex</span><strong>Lifecycle hooks and a Qarinah context skill</strong><i>Open guide</i></a>
          <a href="/docs/integrations/"><span>Claude Code</span><strong>Reviewed plugin runtime with project-specific opt-in</strong><i>Open guide</i></a>
          <a href="/docs/integrations/"><span>Cursor</span><strong>Project MCP configuration and an always-on memory rule</strong><i>Open guide</i></a>
          <a href="/docs/mcp/"><span>MCP</span><strong>Diagnostics by default, cited context only after explicit workspace authorization</strong><i>Open guide</i></a>
          <a href="/docs/team-memory/"><span>Teams</span><strong>Dashboard, freshness, multi-repo packs, encrypted sync, evaluation, and causal receipts</strong><i>Open guide</i></a>
          <a href="/docs/interoperability/"><span>Open formats</span><strong>Markdown, JSON, typed graph, and Google OKF export</strong><i>Open guide</i></a>
        </div>
      </section>

      <section class="section section-alt">
        <div class="shell">
          <div class="section-heading split-heading">
            <div>
              <p class="eyebrow">Direct answers</p>
              <h2>What coding agents and developers need to know.</h2>
            </div>
            <p>Short answers here link to the canonical FAQ, benchmark evidence, installation guide, source, and publication record.</p>
          </div>
          <div class="feature-grid">
            <article class="feature-card">
              <span class="feature-index">01</span>
              <h3>What is Qarinah?</h3>
              <p>The evidence-linked cross-agent context engine for software projects.</p>
            </article>
            <article class="feature-card">
              <span class="feature-index">02</span>
              <h3>Does it reduce repeated context?</h3>
              <p>The published evaluator measured 98.71% less estimated repeated input context for its compared task set.</p>
            </article>
            <article class="feature-card">
              <span class="feature-index">03</span>
              <h3>Does it work across Codex and Claude?</h3>
              <p>Yes. Both reviewed integrations can use the same explicitly opted-in local project record.</p>
            </article>
          </div>
          <p class="section-followup"><a class="text-link" href="/docs/faq/">Read every direct answer and its evidence boundary</a></p>
        </div>
      </section>

      <section class="section final-cta">
        <div class="shell final-cta-inner">
          <div>
            <p class="eyebrow">One universal context layer</p>
            <h2>Switch agents. Keep the decisions, outcomes, and proof.</h2>
          </div>
          <div>
            <a class="btn btn-primary btn-large" href="/docs/getting-started/">Start in five minutes</a>
            <a class="text-link" href="/alternatives/">Compare memory approaches</a>
            <a class="text-link" href="/paper/">Read the white paper</a>
          </div>
        </div>
      </section>`
  });
}

function alternativesPage() {
  const decisionPaths = [
    {
      need: "One inspectable software-project record across supported coding hosts",
      system: "Qarinah",
      href: "#qarinah"
    },
    {
      need: "Personalized user or agent memory inside an application",
      system: "Mem0",
      href: "#mem0"
    },
    {
      need: "A complete stateful-agent runtime with integrated memory",
      system: "Letta",
      href: "#letta"
    },
    {
      need: "Programmable memory inside a LangGraph or custom agent",
      system: "LangMem and LangGraph memory",
      href: "#langmem-langgraph"
    },
    {
      need: "A general temporal knowledge graph for evolving facts",
      system: "Graphiti and Zep",
      href: "#graphiti-zep"
    },
    {
      need: "Memory integrated directly into one coding assistant",
      system: "Native coding-host memory",
      href: "#native-coding-host-memory"
    }
  ];
  const decisionMarkup = decisionPaths.map((path, index) => `
    <a class="decision-row" href="${path.href}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <strong>${path.need}</strong>
      <em>${path.system}</em>
    </a>`).join("");
  const systemMarkup = alternativeSystems.map((system, index) => `
    <article class="comparison-row" id="${system.slug}">
      <header>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h3>${system.name}</h3>
        <p>${system.category}</p>
        <div class="comparison-sources">
          ${system.sources.map((source) => `<a href="${source.url}" rel="noreferrer">${source.label}</a>`).join("")}
        </div>
      </header>
      <div>
        <strong class="comparison-label">Primary job</strong>
        <p>${system.primaryJob}</p>
      </div>
      <div>
        <strong class="comparison-label">Closest overlap</strong>
        <p>${system.overlap}</p>
      </div>
      <div>
        <strong class="comparison-label">Meaningful boundary</strong>
        <p>${system.boundary}</p>
      </div>
      <p class="comparison-fit"><strong>Consider this approach when:</strong> ${system.fit}</p>
    </article>`).join("");
  const evaluationCriteria = [
    ["Source ownership", "Is the authoritative memory stored with the project, inside a vendor product, or in application infrastructure you operate?"],
    ["Host portability", "Can the same record move across coding agents, or is memory intentionally native to one host or runtime?"],
    ["Evidence model", "Can a selected fact point back to source events, content digests, validity, conflicts, and superseded decisions?"],
    ["Runtime scope", "Are you choosing a memory layer, a complete agent runtime, a graph database, or a native assistant feature?"],
    ["Model dependency", "Does the core memory path require a model, embedding service, vector database, or hosted control plane?"],
    ["Rebuild and review", "Can derived memory be reconstructed and inspected independently of the assistant that consumes it?"]
  ];
  const criteriaMarkup = evaluationCriteria.map(([title, text], index) => `
    <article>
      <span>${String(index + 1).padStart(2, "0")}</span>
      <h3>${title}</h3>
      <p>${text}</p>
    </article>`).join("");
  const questionMarkup = alternativeQuestions.map((entry) => `
    <article>
      <h3>${entry.name}</h3>
      <p>${entry.text}</p>
    </article>`).join("");

  return layout({
    title: "Qarinah alternatives and coding-agent memory comparison",
    description: "Compare Qarinah with Mem0, Letta, LangMem, LangGraph memory, Graphiti, Zep, GitHub Copilot Memory, Claude Code memory, and Cursor Memories by product boundary.",
    active: "alternatives",
    canonical: "/alternatives/",
    kind: "alternatives",
    body: `
      <section class="comparison-hero">
        <div class="shell comparison-hero-grid">
          <div>
            <p class="eyebrow">Project-memory comparison</p>
            <h1>Choose memory by boundary, not by buzzword.</h1>
            <p class="comparison-lede">Qarinah is a local, evidence-linked project-memory compiler for coding agents. This guide compares it with adjacent memory products by the job each system owns, the overlap, and the boundary that remains different.</p>
            <div class="comparison-actions">
              <a class="btn btn-primary btn-large" href="#choose-by-job">Find the matching category</a>
              <a class="hero-text-link" href="#method">Read the method</a>
            </div>
          </div>
          <aside class="comparison-scope" aria-label="Qarinah scope in one view">
            <p>Qarinah in one view</p>
            <dl>
              <div><dt>Record</dt><dd>Project-owned local ledger</dd></div>
              <div><dt>Output</dt><dd>Bounded cited context packs</dd></div>
              <div><dt>Runtime</dt><dd>External supported coding agents</dd></div>
              <div><dt>Position</dt><dd>One category choice, not a universal winner</dd></div>
            </dl>
          </aside>
        </div>
      </section>

      <section class="section shell" aria-labelledby="choose-by-job">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">The shortest useful comparison</p>
            <h2 id="choose-by-job">Start with the job you need done.</h2>
          </div>
          <p>These systems overlap around retained context, but they do not occupy one interchangeable category. A requirement-led choice is more useful than a feature-count ranking.</p>
        </div>
        <div class="decision-list">${decisionMarkup}</div>
      </section>

      <section class="section section-alt" aria-labelledby="comparison">
        <div class="shell">
          <div class="section-heading split-heading">
            <div>
              <p class="eyebrow">Representative maintained alternatives</p>
              <h2 id="comparison">Compare the operating boundaries.</h2>
            </div>
            <p>This is a category comparison based on public product documentation reviewed on 8 August 2026. It is not a performance ranking and does not claim to enumerate every memory library or hosted wrapper.</p>
          </div>
          <div class="comparison-list">${systemMarkup}</div>
        </div>
      </section>

      <section class="section shell" aria-labelledby="evaluation-criteria">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">Evaluation criteria</p>
            <h2 id="evaluation-criteria">Six questions for a useful evaluation.</h2>
          </div>
          <p>A memory comparison should disclose architecture and authority before it reaches for benchmarks. Measure performance only after the products are solving the same task under the same scorer.</p>
        </div>
        <div class="evaluation-grid">${criteriaMarkup}</div>
      </section>

      <section class="comparison-method" id="method" aria-labelledby="method-title">
        <div class="shell comparison-method-grid">
          <div>
            <p class="eyebrow">Method and sources</p>
            <h2 id="method-title">Claims stop at the public evidence.</h2>
          </div>
          <div>
            <p>The comparison uses each project's official source repository or product documentation. It describes product scope and architectural emphasis; it does not merge unrelated benchmarks or infer a universal quality order.</p>
            <p>Qarinah's benchmark results remain on the dedicated <a href="/docs/benchmarks/">benchmark page</a> with their fixtures and limits. No alternative is scored on that Qarinah-specific task set here.</p>
            <p>Found a changed product boundary? <a href="${github}/issues/new" rel="noreferrer">Open a source-linked correction</a>.</p>
          </div>
        </div>
      </section>

      <section class="section shell" aria-labelledby="questions">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">Direct answers</p>
            <h2 id="questions">Questions teams ask before choosing.</h2>
          </div>
          <p>These answers state Qarinah's scope without turning product differences into unsupported superiority claims.</p>
        </div>
        <div class="comparison-faq">${questionMarkup}</div>
      </section>

      <section class="section final-cta">
        <div class="shell final-cta-inner">
          <div>
            <p class="eyebrow">Try the category, then verify the record</p>
            <h2>Keep one cited project memory beside the code.</h2>
          </div>
          <div>
            <a class="btn btn-primary btn-large" href="/docs/getting-started/">Set up Qarinah</a>
            <a class="text-link" href="/docs/architecture/">Inspect the architecture</a>
          </div>
        </div>
      </section>`
  });
}

function docsIndex() {
  const cards = docPages.filter((page) => page.route !== "paper").map((page, index) => `
    <a class="doc-card" href="/${page.route}/">
      <span>${page.section} · ${String(index + 1).padStart(2, "0")}</span>
      <h2>${page.title}</h2>
      <p>${page.description}</p>
      <strong>Read guide</strong>
    </a>`).join("");

  return layout({
    title: "Documentation",
    description: "Complete Qarinah documentation for local coding-agent memory, context compilation, Codex, Claude Code, CLI, API, and MCP.",
    active: "docs",
    canonical: "/docs/",
    body: `
      <section class="docs-hero">
        <div class="shell">
          <p class="eyebrow">Qarinah documentation</p>
          <h1>Build local project memory your coding agents can cite.</h1>
          <p>Install the package, opt in one workspace, connect Codex or Claude Code, query a small cited context pack, and verify every result against the local event record.</p>
          ${commandBlock("npx qarinah init . && npx qarinah doctor")}
          <form class="docs-search-form" action="/search/" method="get" role="search">
            <label for="docs-search">Search every Qarinah command, API, integration, recipe, and failure mode</label>
            <div>
              <input id="docs-search" name="q" type="search" autocomplete="off" placeholder="Try “token budget”, “Codex”, “MCP closed”, or “export OKF”">
              <button class="btn btn-primary" type="submit">Search docs</button>
            </div>
          </form>
        </div>
      </section>
      <section class="section shell">
        <div class="doc-card-grid">${cards}</div>
      </section>`
  });
}

function searchPage() {
  return layout({
    title: "Search documentation",
    description: "Search Qarinah documentation, CLI commands, JavaScript APIs, coding-agent memory recipes, benchmarks, and troubleshooting.",
    active: "search",
    canonical: "/search/",
    kind: "search",
    body: `
      <section class="docs-hero search-hero">
        <div class="shell">
          <p class="eyebrow">Local documentation search</p>
          <h1>Find the exact Qarinah surface.</h1>
          <p>Search the generated documentation index locally. Queries are processed in your browser and are not sent to Qarinah or a hosted search service.</p>
          <form class="docs-search-form" action="/search/" method="get" role="search" data-search-form>
            <label for="site-search">Search commands, functions, guides, recipes, and errors</label>
            <div>
              <input id="site-search" name="q" type="search" autocomplete="off" autofocus placeholder="Try “query --stdin-json” or “Claude Code project memory”">
              <button class="btn btn-primary" type="submit">Search</button>
            </div>
          </form>
          <p class="search-shortcut">Press <kbd>/</kbd> anywhere in the documentation to focus search.</p>
        </div>
      </section>
      <section class="section shell search-results-section" aria-live="polite">
        <div class="search-status" data-search-status>Enter a term to search the complete documentation set.</div>
        <div class="search-results" data-search-results></div>
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

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function documentationSidebar(currentRoute) {
  const sectionOrder = ["Start", "Use", "Connect", "Reference", "Operate", "Understand", "Verify"];
  const pages = docPages.filter((candidate) => candidate.route !== "paper");
  const groups = sectionOrder.map((section) => {
    const links = pages
      .filter((candidate) => candidate.section === section)
      .map((candidate) => `<a class="${candidate.route === currentRoute ? "current" : ""}" href="/${candidate.route}/">${candidate.title}</a>`)
      .join("");
    return links ? `<div class="sidebar-group"><strong>${section}</strong>${links}</div>` : "";
  }).join("");

  return `
    <div class="sidebar-label">Documentation</div>
    <a class="sidebar-search-link" href="/search/">Search all documentation</a>
    ${groups}
    <div class="sidebar-group"><strong>Publication</strong><a class="${currentRoute === "paper" ? "current" : ""}" href="/paper/">Technical white paper</a></div>`;
}

async function markdownPage(page) {
  const raw = await readFile(path.join(root, page.source), "utf8");
  const markdown = rewriteMarkdownLinks(
    rewritePublicationLink(rewriteMarkdownAssets(normalizeVisibleCopy(raw)), page.source),
    page.source
  );
  const rendered = addHeadingIds(marked.parse(markdown));
  const headings = [...rendered.matchAll(/<h([1-3]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)]
    .map((match) => ({ id: match[2], text: plainText(match[3]) }));
  searchEntries.push({
    route: `/${page.route}/`,
    title: page.title,
    description: page.description,
    headings,
    keywords: page.aliases,
    content: plainText(rendered).slice(0, 30_000)
  });
  const active = page.route === "paper"
    ? "paper"
    : page.route.endsWith("benchmarks")
      ? "benchmarks"
      : page.route === "docs/faq"
        ? "answers"
        : "docs";
  const publicationLink = page.route === "paper"
    ? `<a href="${doi}">Published v1.4 DOI: 10.5281/zenodo.21850747</a> · <a href="${conceptDoi}">Paper series DOI</a> · <a href="${historicalVersionDoi}">Published v1.3</a>`
    : "";

  return layout({
    title: page.title,
    description: page.description,
    active,
    canonical: `/${page.route}/`,
    kind: page.route === "paper"
      ? "paper"
      : page.route === "docs/benchmarks"
        ? "benchmark"
        : page.route === "docs/faq"
          ? "faq"
        : page.route === "docs/getting-started" || page.route === "docs/cross-agent-handoffs"
          ? "howto"
          : page.route === "docs/api" || page.route === "docs/cli" || page.route === "docs/mcp"
            ? "api"
            : "doc",
    body: `
      <div class="doc-layout shell">
        <aside class="docs-sidebar" aria-label="Documentation sections">
          ${documentationSidebar(page.route)}
        </aside>
        <article class="markdown-body doc-content">
          <div class="doc-meta">
            <span>Qarinah ${productVersion}</span>
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
const alternativesDestination = path.join(output, "alternatives");
await mkdir(alternativesDestination, { recursive: true });
await writeFile(path.join(alternativesDestination, "index.html"), alternativesPage());
await mkdir(path.join(output, "docs"), { recursive: true });
await writeFile(path.join(output, "docs", "index.html"), docsIndex());

for (const page of docPages) {
  const destination = path.join(output, ...page.route.split("/"));
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "index.html"), await markdownPage(page));
}

const searchDestination = path.join(output, "search");
await mkdir(searchDestination, { recursive: true });
await writeFile(path.join(searchDestination, "index.html"), searchPage());
await writeFile(path.join(output, "search-index.json"), `${JSON.stringify(searchEntries, null, 2)}\n`);

const sitemapRoutes = ["/", "/alternatives/", "/docs/", "/search/", ...docPages.map((page) => `/${page.route}/`)];
await writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>${siteOrigin}${route}</loc><lastmod>${releaseDate}</lastmod></url>`).join("\n")}\n</urlset>\n`
);

console.log(`Built ${sitemapRoutes.length} Qarinah pages in ${path.relative(root, output)}.`);
