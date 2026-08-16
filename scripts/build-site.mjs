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
const releaseDate = "2026-08-16";
const paperPublishedDate = "2026-08-08";
const publicMetricsUpdatedDate = "2026-08-10";
const toolkitArticleDate = "2026-08-16";
const worktreeArticleDate = "2026-08-16";
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const benchmarkRelease = JSON.parse(await readFile(path.join(root, "bench", "results", "benchmark-release-0.1.6.json"), "utf8"));
const productVersion = packageJson.version;
const productPositioning = "Worktree-aware project memory and cited context graphs for coding agents.";
const productExplanation = "Qarinah gives every Git checkout an isolated evidence-linked ledger, groups sibling worktrees into one repository context graph, and gives Codex, Claude Code, Cursor, and compatible tools a compact cited handoff for the branch and task in front of them.";
const repeatedContextMetric = benchmarkRelease.headlineContextResults.find((result) => result.id === "six-task-repeated-context");
if (!repeatedContextMetric
  || repeatedContextMetric.baselineEstimatedTokens !== 442113
  || repeatedContextMetric.qarinahEstimatedTokens !== 5682
  || repeatedContextMetric.displayReduction !== "98.7148%"
  || benchmarkRelease.multiFileProjectStudy.positiveQueriesPassed !== 380) {
  throw new Error("The public metrics surface does not match the verified Qarinah 0.1.6 benchmark receipt.");
}
const repeatedContextTokensAvoided = repeatedContextMetric.baselineEstimatedTokens - repeatedContextMetric.qarinahEstimatedTokens;
const repeatedContextRatio = repeatedContextMetric.baselineEstimatedTokens / repeatedContextMetric.qarinahEstimatedTokens;
const illustrativeFlatInputRates = [1, 3, 5, 15];
const estimatedInputCost = (tokens, usdPerMillion, repeats = 1) => Number(((tokens / 1_000_000) * usdPerMillion * repeats).toFixed(6));
const illustrativeCostExamples = illustrativeFlatInputRates.map((usdPerMillionInputTokens) => ({
  usdPerMillionInputTokens,
  baselineUsd: estimatedInputCost(repeatedContextMetric.baselineEstimatedTokens, usdPerMillionInputTokens),
  qarinahUsd: estimatedInputCost(repeatedContextMetric.qarinahEstimatedTokens, usdPerMillionInputTokens),
  savedUsd: estimatedInputCost(repeatedContextTokensAvoided, usdPerMillionInputTokens),
  savedAcrossTenRepeatsUsd: estimatedInputCost(repeatedContextTokensAvoided, usdPerMillionInputTokens, 10)
}));
const publicMetrics = {
  schemaVersion: "qarinah.public-metrics.v1",
  product: "Qarinah",
  productVersion,
  updatedAt: publicMetricsUpdatedDate,
  evidenceSource: `${github}/blob/main/bench/results/benchmark-release-0.1.6.json`,
  estimator: benchmarkRelease.portableTokenEstimator.method,
  providerBillingMeasurement: false,
  metrics: {
    repeatedProjectContext: {
      fixture: "six committed software-task fixtures",
      baselineEstimatedTokens: repeatedContextMetric.baselineEstimatedTokens,
      qarinahEstimatedTokens: repeatedContextMetric.qarinahEstimatedTokens,
      estimatedTokensAvoided: repeatedContextTokensAvoided,
      exactReduction: repeatedContextMetric.exactReduction,
      displayReduction: repeatedContextMetric.displayReduction,
      baselineToQarinahRatio: Number(repeatedContextRatio.toFixed(2)),
      coverage: repeatedContextMetric.coverage
    },
    multiFileRetrieval: {
      fileCounts: benchmarkRelease.multiFileProjectStudy.scales.map((scale) => scale.fileCount),
      totalFiles: benchmarkRelease.multiFileProjectStudy.totalFiles,
      rankOnePositiveQueries: benchmarkRelease.multiFileProjectStudy.positiveQueriesPassed,
      unsupportedQueriesCorrectlyRejected: benchmarkRelease.multiFileProjectStudy.unsupportedQueriesCorrectlyRejected,
      providerModelCalls: benchmarkRelease.multiFileProjectStudy.providerModelCalls
    }
  },
  illustrativeCostModel: {
    scope: "the aggregate repeated-context slice across the six committed software-task fixtures",
    formula: "estimatedTokens / 1000000 * usdPerMillionInputTokens * repeats",
    pricingBasis: "flat uncached input-token rate chosen by the reader",
    examples: illustrativeCostExamples,
    exclusions: [
      "provider-native tokenization and usage receipts",
      "cached-input discounts or cache-write premiums",
      "output, reasoning, tool, retrieval, hosting, and fixed charges"
    ]
  },
  claimBoundary: [
    "These are deterministic portable context-volume and retrieval-regression measurements, not provider usage receipts.",
    "The percentage does not measure output tokens, reasoning tokens, tool calls, cache pricing, latency, task completion, or total provider cost.",
    "The multi-file study is a synthetic, auditable local regression and not a universal repository or model-quality guarantee."
  ],
  methodology: `${siteOrigin}/docs/benchmarks/`
};
const qarinahFeatures = [
  "First-class Git worktree context with isolated ledgers",
  "Verified handoffs between coding agents",
  "Local append-only project memory",
  "Evidence-linked cited context packs",
  "Typed project and provenance graph",
  "Budgeted hybrid retrieval",
  "Codex and Claude Code integrations",
  "Consent-gated MCP context retrieval",
  "Multi-repository memory with separate authority",
  "Freshness checks and a visual memory dashboard",
  "Streaming Codex, Claude, and portable agent-history import",
  "Immediate SQLite/FTS5 project search",
  "Beginner-readable project and outcome overview",
  "Encrypted team bundles and signed checkpoints",
  "Deterministic Markdown, JSON, graph, and OKF exports"
];
const answerEngineQuestions = [
  {
    name: "What is Qarinah?",
    text: `${productPositioning} ${productExplanation}`
  },
  {
    name: "Does Qarinah understand Git worktrees?",
    text: "Yes. Every initialized checkout keeps its own ledger and consent record. Qarinah derives a shared repository identity, binds branch and commit context into the project snapshot hash, adds the worktree to the context graph, and can open all initialized siblings in one local dashboard."
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
    text: "Yes. The qarinah dashboard command generates a local, read-only HTML view of current and superseded decisions, explicit conflicts, citations, recent permitted activity, affected files, and an evidence-labeled local ledger-or-import-to-pack context estimate. It is derived from the authoritative ledger and does not grant agent access or execute tools."
  },
  {
    name: "Can Qarinah keep useful context after a native coding-agent chat is deleted?",
    text: "Yes, for permitted events that Qarinah already captured or visible JSONL history that the operator imported. The retained project ledger, SQLite search, graph, and readable memory stay with the project. Qarinah cannot recover content that was never captured or imported."
  },
  {
    name: "Can Qarinah import a large Codex or Claude history?",
    text: "Yes. The archive importer streams Codex, Claude, or portable JSONL exports under explicit byte, file, record, line, and session limits. Compact mode keeps one cited outcome summary per session and excludes hidden or encrypted reasoning blocks."
  },
  {
    name: "Can Qarinah support private or NDA projects?",
    text: "Qarinah supports local storage, metadata-only defaults, explicit content consent, redaction, encrypted team bundles, and signed checkpoints. Those controls can support an NDA-conscious workflow, but the software does not create or replace a legal NDA."
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
    name: "Application personalization memory",
    slug: "application-personalization-memory",
    category: "Personalization and agent memory",
    primaryJob: "Provide user-, session-, and agent-level memory for applications through managed or self-hosted operation.",
    overlap: "Long-term memory extraction, storage, retrieval, and use in agent applications.",
    boundary: "This category addresses broader application personalization. Qarinah foregrounds a local software-project ledger, source identities, conflicts, supersession, and deterministic cited packs.",
    fit: "An application needs reusable personalized memory for users or agents beyond a software repository workflow.",
    sources: []
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
    name: "General temporal knowledge graph",
    slug: "general-temporal-knowledge-graph",
    category: "Temporal context graph",
    primaryJob: "Represent evolving entities and facts in a temporal graph with episode provenance and hybrid retrieval.",
    overlap: "Temporal state, provenance, graph relationships, and retrieval over changing knowledge.",
    boundary: "This category targets general evolving knowledge and graph infrastructure. Qarinah targets repository and coding-work evidence stored with the project.",
    fit: "An application needs a general temporal knowledge graph across people, entities, events, or business facts.",
    sources: []
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
    name: "Is Qarinah better than every adjacent memory category?",
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

const agentStackProjects = [
  {
    name: "Qarinah",
    slug: "qarinah-project-memory",
    category: "Project memory and context",
    role: "Keeps an inspectable project-owned record and compiles bounded, cited context packs for supported coding agents.",
    boundary: "Qarinah does not run the agent loop, execute browser actions, or grant tool authority.",
    url: "https://qarinah.io/",
    source: "https://github.com/AjnasNB/qarinah"
  },
  {
    name: "Cockroach Browser",
    slug: "cockroach-browser-runtime",
    category: "Interactive browser runtime",
    role: "Provides browser sessions, semantic interaction, files, profiles, multi-engine execution, evidence, and human handoff for browser-capable agents.",
    boundary: "Cockroach Browser builds on established browser automation engines. It is not a new browser engine and does not bypass website access controls.",
    url: "https://cockroachbrowser.com/",
    source: "https://github.com/AjnasNB/cockroach-browser"
  },
  {
    name: "Cockroach Crawler",
    slug: "cockroach-crawler-acquisition",
    category: "Web crawling and extraction",
    role: "Crawls sites, renders JavaScript, discovers pages, extracts structured content, and returns cited web records for agents and applications.",
    boundary: "It is not a hosted proxy fleet or an access-control bypass. Its optional quality surface uses Trafilatura as a disclosed dependency.",
    url: "https://cockroachcrawler.com/",
    source: "https://github.com/AjnasNB/cockroach-crawler"
  },
  {
    name: "Maqam",
    slug: "maqam-optional-approval",
    category: "Optional policy and approval",
    role: "Optionally applies policy and human approval to selected registered TypeScript actions and records execution receipts.",
    boundary: "Maqam is an independent add-on. Qarinah, Cockroach Browser, and Cockroach Crawler do not require it for normal use.",
    url: "https://maqamagent.com/",
    source: "https://github.com/AjnasNB/maqam"
  }
];

const agentStackPrimitives = [
  {
    name: "Playwright",
    slug: "playwright",
    category: "Browser automation primitive",
    role: "Automates Chromium, Firefox, and WebKit through one testing and automation API.",
    relationship: "Cockroach Browser uses Playwright for browser control and adds a packaged agent-facing runtime, sessions, evidence, and integrations.",
    url: "https://playwright.dev/docs/intro"
  },
  {
    name: "Puppeteer",
    slug: "puppeteer",
    category: "Browser automation primitive",
    role: "Controls Chrome or Firefox through a high-level JavaScript API over DevTools Protocol or WebDriver BiDi.",
    relationship: "A direct browser-automation choice when application code should own sessions, behavior, evidence, and integrations.",
    url: "https://pptr.dev/guides/what-is-puppeteer"
  },
  {
    name: "Browser Use",
    slug: "browser-use",
    category: "Agentic browser framework",
    role: "Makes websites available to AI agents through an open-source browser-use framework and optional cloud services.",
    relationship: "A higher-level browser-agent option. Evaluate its agent autonomy and deployment model separately from Cockroach Browser's explicit session boundary.",
    url: "https://github.com/browser-use/browser-use"
  },
  {
    name: "Stagehand",
    slug: "stagehand",
    category: "Agentic browser framework",
    role: "Combines code and natural-language browser automation through act, extract, observe, and agent interfaces.",
    relationship: "Useful when AI-assisted interaction authoring is the product center. A host can add separate approval controls when required.",
    url: "https://docs.stagehand.dev/v3/first-steps/introduction"
  },
  {
    name: "Trafilatura",
    slug: "trafilatura",
    category: "Web extraction library",
    role: "Discovers, downloads, and extracts main text, metadata, comments, and links from web documents in Python.",
    relationship: "Cockroach Crawler discloses Trafilatura as the optional quality dependency instead of presenting that extraction algorithm as its own.",
    url: "https://trafilatura.readthedocs.io/en/stable/index.html"
  },
  {
    name: "Firecrawl",
    slug: "firecrawl",
    category: "Web data platform",
    role: "Offers search, scrape, crawl, map, browser, and agent surfaces that return LLM-ready web data.",
    relationship: "A broader managed or self-hosted web-data platform. Cockroach Crawler is the local TypeScript option when bounded acquisition and attached evidence are the center.",
    url: "https://docs.firecrawl.dev/introduction"
  },
  {
    name: "Docling",
    slug: "docling",
    category: "Document conversion toolkit",
    role: "Parses formats such as PDF, DOCX, PPTX, HTML, and images into a unified document representation for export, chunking, and AI workflows.",
    relationship: "A document-ingestion complement or alternative when file conversion is more important than site traversal or interactive browser control.",
    url: "https://docling-project.github.io/docling/"
  },
  {
    name: "LangGraph",
    slug: "langgraph",
    category: "Agent and workflow runtime",
    role: "Provides low-level orchestration for long-running, stateful agents with durable execution and human-in-the-loop control.",
    relationship: "Can own the workflow while Qarinah supplies project memory; Maqam remains an optional approval add-on for selected effects.",
    url: "https://docs.langchain.com/oss/javascript/langgraph/overview"
  },
  {
    name: "OpenAI Agents SDK",
    slug: "openai-agents-sdk",
    category: "Agent runtime",
    role: "Provides an agent loop, tools, handoffs, sessions, tracing, guardrails, and human-in-the-loop mechanisms for TypeScript agents.",
    relationship: "Can build and run the agent while the authored projects supply optional memory, browser, web acquisition, and approval capabilities.",
    url: "https://openai.github.io/openai-agents-js/"
  }
];

const agentStackQuestions = [
  {
    name: "Is this one bundled agent platform?",
    text: "No. Qarinah, Maqam, Cockroach Browser, and Cockroach Crawler are separate open-source projects that can be adopted independently. The other named tools are third-party primitives or integration choices maintained by their own projects."
  },
  {
    name: "Does Cockroach Browser replace Playwright?",
    text: "No. Cockroach Browser uses Playwright and Chromium. Its separate contribution is an explicit session-authority, evidence, audit, and human-handoff boundary for agent use."
  },
  {
    name: "Is Maqam required to use the other projects?",
    text: "No. Qarinah, Cockroach Browser, and Cockroach Crawler work independently. Maqam is an optional connection for workflows that also need policy or human approval."
  },
  {
    name: "Are Playwright, Puppeteer, Trafilatura, Firecrawl, Browser Use, Stagehand, LangGraph, OpenAI Agents SDK, or Docling products by Ajnas N B?",
    text: "No. They are established third-party projects linked to their official documentation. Qarinah, Maqam, Cockroach Browser, and Cockroach Crawler are the projects authored by Ajnas N B discussed in this guide."
  },
  {
    name: "Is this a best-tool ranking?",
    text: "No. It is a category and composition guide based on documented product boundaries. It contains no matched cross-product benchmark and makes no best, first, or only claim."
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
    route: "docs/features",
    source: "docs/FEATURES.md",
    title: "Features",
    description: "Explore Qarinah project memory, cited context compilation, agent integrations, local dashboards, team memory, exports, and operating boundaries.",
    section: "Start",
    aliases: ["qarinah features", "project memory features", "coding agent memory capabilities", "context compiler capabilities"]
  },
  {
    route: "docs/project-overview",
    source: "docs/PROJECT-OVERVIEW.md",
    title: "Understand a project in one page",
    description: "See retained work, latest outcomes, codebase areas, languages, relationships, and durable Qarinah files in one readable overview.",
    section: "Start",
    aliases: ["project overview", "codebase summary", "project graph", "what happened", "latest outcomes"]
  },
  {
    route: "docs/agent-archive-import",
    source: "docs/AGENT-ARCHIVE-IMPORT.md",
    title: "Import old coding-agent history",
    description: "Stream visible Codex, Claude, or portable JSONL histories into durable cited project memory with compact or full modes.",
    section: "Connect",
    aliases: ["codex archive", "claude history", "chat import", "agent export", "large context recovery"]
  },
  {
    route: "docs/agent-archive-backup",
    source: "docs/AGENT-ARCHIVE-BACKUP.md",
    title: "Back up coding-agent archives",
    description: "Copy explicitly selected JSONL or NDJSON agent exports to an external destination with limits, SHA-256 verification, and a compact project receipt.",
    section: "Operate",
    aliases: ["codex jsonl backup", "external archive", "agent history backup", "verified transcript export"]
  },
  {
    route: "docs/private-projects",
    source: "docs/PRIVATE-PROJECTS.md",
    title: "Private and NDA projects",
    description: "Use local storage, explicit consent, redaction, encrypted bundles, signed checkpoints, and authority filters for sensitive projects.",
    section: "Operate",
    aliases: ["private code", "nda project", "confidential project", "local agent memory", "data controls"]
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
    route: "docs/host-compatibility",
    source: "docs/HOST-COMPATIBILITY.md",
    title: "Coding-agent host compatibility",
    description: "Understand the reviewed Codex and Claude hooks, Cursor MCP, Kimi project configuration and import, Antigravity plugin, and portable fallback.",
    section: "Connect",
    aliases: ["kimi memory", "antigravity memory", "codex claude cursor integration", "agent cli compatibility"]
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
    description: "Inspect real local Qarinah activity in responsive static snapshots or a live multi-project loopback dashboard with explicit workspace identity.",
    section: "Operate",
    aliases: ["memory dashboard", "project dashboard", "decision dashboard", "context savings", "agent activity", "affected files"]
  },
  {
    route: "docs/worktree-context",
    source: "docs/WORKTREE-CONTEXT.md",
    title: "Git worktree context",
    description: "Keep isolated project memory per Git checkout and inspect sibling worktrees in one branch-and-commit-aware context graph.",
    section: "Operate",
    aliases: ["git worktree memory", "parallel agents", "branch context", "worktree graph", "isolated ledgers"]
  },
  {
    route: "docs/memory-footprint",
    source: "docs/MEMORY-FOOTPRINT.md",
    title: "Measure retained and delivered project memory",
    description: "Separate archive bytes, local Qarinah storage, task-specific context, and optional flat-rate cost arithmetic without making a lossless compression claim.",
    section: "Understand",
    aliases: ["memory footprint", "context size", "token savings", "archive compression", "coding agent cost"]
  },
  {
    route: "docs/azure-evaluation",
    source: "docs/AZURE-EVALUATION.md",
    title: "Evaluate Azure-backed team retrieval",
    description: "Choose between local SQLite project memory and an explicit Azure AI Search and Blob Storage evaluation for larger teams.",
    section: "Operate",
    aliases: ["azure ai search", "azure rag", "cloud project memory", "vector search", "blob backup"]
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
    description: "Run practical Qarinah recipes for editing, refactoring, debugging, migrations, research, and release preparation.",
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
    route: "docs/public-metrics",
    source: "docs/PUBLIC-METRICS.md",
    title: "Public metrics and launch claims",
    description: "Use Qarinah's verified context-volume and retrieval metrics with exact evidence links, approved wording, and explicit claim boundaries.",
    section: "Verify",
    aliases: ["Qarinah metrics", "launch claims", "98.71 percent", "token savings", "benchmark evidence", "marketing claims"]
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
    title: "Qarinah - Git Worktree Memory and Context Graphs for Coding Agents",
    description: productPositioning,
    headings: [],
    keywords: ["git worktree memory", "coding agent memory", "project memory", "context graph", "token-efficient context"],
    content: "Qarinah keeps an isolated evidence-linked project record per Git checkout, groups sibling worktrees, and compiles the small cited context pack needed for the current coding task."
  },
  {
    route: "/articles/git-worktree-context-for-coding-agents/",
    title: "Why every coding-agent worktree needs its own memory",
    description: "See how Qarinah keeps parallel Git worktrees isolated while joining their branch, commit, files, decisions, and hashes in one local context graph.",
    headings: [
      { id: "why-worktrees", text: "A worktree is a context boundary" },
      { id: "how-it-works", text: "Separate ledgers, one repository graph" },
      { id: "proof", text: "What the graph and hashes prove" },
      { id: "start", text: "Set up the worktrees you want to remember" }
    ],
    keywords: ["Git worktree memory", "coding agents in parallel", "branch context graph", "Codex worktrees", "Claude Code worktrees"],
    content: "Parallel coding agents can work in different Git worktrees without sharing one writable memory store. Qarinah records each checkout independently, derives a shared repository group, and exposes branch-aware cited retrieval and a local visual graph."
  },
  {
    route: "/alternatives/",
    title: "Qarinah alternatives and coding-agent memory comparison",
    description: "Compare Qarinah with application personalization, stateful-agent, programmable-memory, temporal-graph, and native coding-host approaches by product boundary.",
    headings: [
      { id: "choose-by-job", text: "Start with the job you need done" },
      { id: "comparison", text: "Compare the operating boundaries" },
      { id: "evaluation-criteria", text: "Six questions for a useful evaluation" },
      { id: "method", text: "Method and sources" },
      { id: "questions", text: "Questions teams ask before choosing" }
    ],
    keywords: [
      "Qarinah alternatives",
      "Qarinah vs application memory",
      "Qarinah vs Letta",
      "Qarinah vs LangMem",
      "Qarinah vs temporal knowledge graphs",
      "coding agent memory comparison",
      "project memory for coding agents",
      "cross-agent memory"
    ],
    content: alternativeSystems.map((system) => `${system.name}. ${system.category}. ${system.primaryJob} ${system.overlap} ${system.boundary} ${system.fit}`).join(" ")
  },
  {
    route: "/articles/open-source-agent-memory-stack/",
    title: "An open-source memory, browser, and crawler stack for AI agents",
    description: "See how Qarinah, Cockroach Browser, and Cockroach Crawler compose into a practical agent stack, with Maqam available as an optional approval add-on.",
    headings: [
      { id: "authored-projects", text: "Start with the capability you need" },
      { id: "established-tools", text: "Established tools stay in their own categories" },
      { id: "reference-architecture", text: "A reference architecture, not a required bundle" },
      { id: "questions", text: "Questions about the toolkit boundary" },
      { id: "method", text: "Authorship, sources, and limits" }
    ],
    keywords: [
      "open-source AI agent stack",
      "AI agent memory browser crawler",
      "Qarinah Maqam Cockroach Browser Cockroach Crawler",
      "Playwright agent browser stack",
      "agent memory browser crawler stack"
    ],
    content: [
      ...agentStackProjects.map((project) => `${project.name}. ${project.category}. ${project.role} ${project.boundary}`),
      ...agentStackPrimitives.map((tool) => `${tool.name}. ${tool.category}. ${tool.role} ${tool.relationship}`),
      ...agentStackQuestions.map((entry) => `${entry.name} ${entry.text}`)
    ].join(" ")
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
await cp(path.join(root, "assets", "launch", "qarinah-what-you-save.png"), path.join(output, "assets", "qarinah-what-you-save.png"));
await cp(path.join(root, "assets", "launch", "qarinah-project-memory-dashboard.png"), path.join(output, "assets", "qarinah-project-memory-dashboard.png"));
await cp(path.join(root, "assets", "launch", "qarinah-worktree-context-graph.png"), path.join(output, "assets", "qarinah-worktree-context-graph.png"));
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
    if (/^(?:https?:|mailto:|#|\/)/.test(href)) {
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
  return markdown
    .replaceAll(
      'src="../assets/architecture/qarinah-flow.svg"',
      'src="/assets/qarinah-flow.svg"'
    )
    .replaceAll(
      "](../assets/launch/qarinah-project-memory-dashboard.png)",
      "](/assets/qarinah-project-memory-dashboard.png)"
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
    ["Overview", "/", "home"],
    ["Features", "/docs/features/", "features"],
    ["Install", "/docs/getting-started/", "install"],
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
          <a href="/docs/features/">Features</a>
          <a href="/docs/getting-started/">Install and get started</a>
          <a href="/docs/worktree-context/">Git worktree context</a>
          <a href="/docs/cli/">CLI reference</a>
          <a href="/docs/api/">JavaScript API</a>
          <a href="/docs/integrations/">Integrations</a>
        </div>
        <div>
          <strong>Verify</strong>
          <a href="/docs/faq/">Direct answers</a>
          <a href="/articles/git-worktree-context-for-coding-agents/">Worktree context article</a>
          <a href="/articles/open-source-agent-memory-stack/">Agent memory stack</a>
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
      <div class="shell launch-recognition" aria-label="Launch directories">
        <span>Find Qarinah on</span>
        <div class="launch-recognition-links">
          <a class="startupbase-badge" href="https://startupbase.io/products/qarinah?utm_source=startupbase&amp;utm_medium=badge&amp;utm_campaign=launch-badge-dark" rel="noreferrer">
            <img src="https://statics.startupbase.io/site/badges/launched-on-sb-dark.svg" alt="Launched on StartupBase" height="55">
          </a>
          <a href="https://fazier.com/launches/qarinah" target="_blank"><img src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&amp;theme=light" width="120" alt="Fazier badge" /></a>
          <a class="launchnest-badge" href="https://launchnest.io/p/qarinah" target="_blank">
            <img src="https://launchnest.io/badge/qarinah.svg?variant=listed" alt="Qarinah on LaunchNest" width="220" height="56">
          </a>
          <a class="producthunt-badge" href="https://www.producthunt.com/products/qarinah?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-qarinah" target="_blank" rel="noreferrer">
            <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1218378&amp;theme=light&amp;t=1786794111466" alt="Qarinah on Product Hunt" width="250" height="54">
          </a>
          <a class="tiny-startups-link" href="https://tinystartups.com/startup/qarinah" rel="noreferrer">
            <span>Listed on</span>
            <strong>Tiny Startups</strong>
          </a>
        </div>
      </div>
      <div class="shell footer-meta">
        <span>Built openly by Ajnas N B and contributors.</span>
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
    name: "Ajnas N B",
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
        publisher: { "@id": person["@id"] }
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
        featureList: qarinahFeatures,
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
      dateCreated: paperPublishedDate,
      dateModified: paperPublishedDate,
      version: paperVersion,
      identifier: doi,
      creativeWorkStatus: "Published",
      datePublished: paperPublishedDate,
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
  } else if (kind === "worktree-article") {
    graph.push({
      "@type": "Article",
      "@id": `${url}#article`,
      headline: title,
      description,
      url,
      mainEntityOfPage: url,
      inLanguage: "en",
      datePublished: worktreeArticleDate,
      dateModified: worktreeArticleDate,
      author: { "@id": person["@id"] },
      isPartOf: { "@id": `${siteOrigin}/#website` },
      about: [
        { "@type": "Thing", name: "Git worktrees" },
        { "@type": "Thing", name: "Coding-agent project memory" },
        { "@type": "Thing", name: "Evidence-linked context graphs" }
      ],
      image: `${siteOrigin}/assets/qarinah-worktree-context-graph.png`
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
          url: system.sources[0]?.url ?? `${siteOrigin}/alternatives/#${system.slug}`
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
            url: system.sources[0]?.url ?? `${siteOrigin}/alternatives/#${system.slug}`
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
  } else if (kind === "toolkit") {
    const toolkitItems = [...agentStackProjects, ...agentStackPrimitives];
    graph.push(
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: title,
        description,
        url,
        mainEntityOfPage: url,
        inLanguage: "en",
        datePublished: toolkitArticleDate,
        dateModified: toolkitArticleDate,
        author: { "@id": person["@id"] },
        isPartOf: { "@id": `${siteOrigin}/#website` },
        about: { "@id": `${url}#toolkit-map` }
      },
      {
        "@type": "ItemList",
        "@id": `${url}#toolkit-map`,
        name: "Open-source agent memory stack and established adjacent tools",
        itemListOrder: "https://schema.org/ItemListUnordered",
        numberOfItems: toolkitItems.length,
        itemListElement: toolkitItems.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "SoftwareApplication",
            name: item.name,
            description: item.role,
            applicationCategory: "DeveloperApplication",
            url: item.url
          }
        }))
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        name: "Agent memory stack questions",
        mainEntity: agentStackQuestions.map((entry) => ({
          "@type": "Question",
          name: entry.name,
          acceptedAnswer: {
            "@type": "Answer",
            text: entry.text
          }
        }))
      }
    );
  } else if (kind === "features") {
    graph.push(
      {
        "@type": "CollectionPage",
        "@id": `${url}#features`,
        name: title,
        description,
        url,
        inLanguage: "en",
        dateModified: releaseDate,
        author: { "@id": person["@id"] },
        about: { "@id": `${siteOrigin}/#software` }
      },
      {
        "@type": "ItemList",
        "@id": `${url}#capability-list`,
        name: "Qarinah product capabilities",
        itemListOrder: "https://schema.org/ItemListUnordered",
        numberOfItems: qarinahFeatures.length,
        itemListElement: qarinahFeatures.map((name, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name
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
        distribution: [
          {
            "@type": "DataDownload",
            name: "Qarinah public metrics and claim boundaries",
            encodingFormat: "application/json",
            contentUrl: `${siteOrigin}/metrics.json`
          },
          {
            "@type": "DataDownload",
            name: "Six-task software-context result",
            encodingFormat: "application/json",
            contentUrl: `${github}/blob/main/bench/results/software-task-context-0.1.1.json`
          }
        ]
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
  <link rel="alternate" hreflang="en" href="${url}">
  <link rel="alternate" hreflang="x-default" href="${url}">
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
    title: "Qarinah - One Memory System for Every Git Worktree",
    description: "Qarinah keeps isolated project memory per Git checkout, groups sibling worktrees in one context graph, and compiles cited context for coding agents.",
    active: "home",
    canonical: "/",
    kind: "home",
    body: `
      <section class="hero">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Project memory for parallel coding-agent work</p>
            <h1>One memory system for every Git worktree.</h1>
            <p class="hero-lede">Give each checkout its own evidence-linked ledger. Qarinah groups sibling worktrees into one branch-and-commit-aware context graph, then gives each coding agent the cited files, decisions, outcomes, and history relevant to its task.</p>
            <a class="hero-context-proof" href="/docs/benchmarks/" aria-label="98.71% less estimated repeated context in the published six-fixture benchmark. Read the scoped method and artifacts.">
              <strong>98.71%</strong>
              <span><b>less estimated repeated context</b><small>442,113 baseline tokens &rarr; 5,682 cited-pack tokens in the published six-fixture evaluation</small></span>
            </a>
            <div class="hero-actions">
              <a class="btn btn-primary btn-large" href="/docs/getting-started/">Set up this worktree</a>
              <a class="hero-text-link" href="/articles/git-worktree-context-for-coding-agents/">See how the graph works</a>
            </div>
          </div>
          <aside class="worktree-hero-map" aria-label="How Qarinah groups isolated Git worktree memory">
            <div class="worktree-map-header"><span>LOCAL CONTEXT GRAPH</span><strong>one repository · two isolated ledgers</strong></div>
            <div class="worktree-repository"><small>repository group</small><strong>Qarinah project</strong><code>repo_27c94f…</code></div>
            <div class="worktree-branches">
              <article><span>main</span><strong>release context</strong><code>639ee4787a</code><small>own ledger · own consent</small></article>
              <article><span>feature/worktree-context</span><strong>graph implementation</strong><code>3d1619c910</code><small>own ledger · own consent</small></article>
            </div>
            <div class="worktree-map-footer"><span>branch + commit in snapshot hash</span><span>files + decisions in cited graph</span></div>
          </aside>
        </div>
      </section>

      <section class="front-proof section shell" aria-labelledby="cost-equivalent-title">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">Published evidence and cost equivalent</p>
            <h2 id="cost-equivalent-title">98.71% less repeated context. A 77.81:1 baseline-to-pack ratio.</h2>
          </div>
          <p>More than 70:1 compression in the published six-fixture estimate: 442,113 portable estimated input-context tokens for full-history replay versus 5,682 for Qarinah's cited packs. Every required target was directly covered in the top five.</p>
        </div>
        <figure class="what-you-save-figure">
          <img src="/assets/qarinah-what-you-save.png" width="1664" height="936" loading="lazy" decoding="async" alt="What you save with Qarinah: 98.71% less repeated context, a 77.81 to 1 baseline-to-pack ratio, 442,113 baseline tokens versus 5,682 Qarinah pack tokens, and exact illustrative savings at four flat uncached input-token rates.">
          <figcaption>Shareable proof card. The semantic table below remains the source for accessible text and exact values.</figcaption>
        </figure>
        <div class="cost-equivalent-table-wrap">
          <table class="cost-equivalent-table" aria-describedby="cost-equivalent-note">
            <caption>Illustrative flat uncached input-token cost equivalents for the published six-fixture estimate</caption>
            <thead>
              <tr>
                <th scope="col">Rate</th>
                <th scope="col">Baseline</th>
                <th scope="col">Qarinah</th>
                <th scope="col">Estimated saving</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">$1/M tokens</th><td>$0.442113</td><td>$0.005682</td><td>$0.436431</td></tr>
              <tr><th scope="row">$3/M tokens</th><td>$1.326339</td><td>$0.017046</td><td>$1.309293</td></tr>
              <tr><th scope="row">$5/M tokens</th><td>$2.210565</td><td>$0.028410</td><td>$2.182155</td></tr>
              <tr><th scope="row">$15/M tokens</th><td>$6.631695</td><td>$0.085230</td><td>$6.546465</td></tr>
            </tbody>
          </table>
        </div>
        <p class="benchmark-ribbon-note" id="cost-equivalent-note">Formula: <code>estimated tokens / 1,000,000 &times; flat uncached input rate &times; repeats</code>. At a flat $3/M input rate, the aggregate compared slice estimates $1.326339 for full-history replay and $0.017046 for Qarinah, saving $1.309293 per repeat and $13.092930 across ten repeats. This is arithmetic over the committed portable estimate, not a provider invoice. It excludes provider tokenization, caching, output, reasoning, tools, retrieval, hosting, fixed charges, and tiered pricing. <a href="/docs/public-metrics/">Method, calculator, and approved wording</a>.</p>
      </section>

      <section class="handoff-stage" aria-labelledby="handoff-stage-title">
        <div class="shell handoff-stage-grid">
          <div class="handoff-stage-copy">
            <p class="eyebrow">One repository, precise checkout context</p>
            <h2 id="handoff-stage-title">Initialize the worktrees that should remember.</h2>
            <p>Run setup inside each active checkout. Every supported host in that checkout queries its cited decisions and outcomes; the grouped dashboard shows initialized siblings without sharing their writable stores.</p>
            ${commandBlock("npx qarinah setup . --codex --claude --cursor --capture content --allow-query\nnpx qarinah worktrees\nnpx qarinah dashboard --serve --worktrees", "Set up and inspect worktree memory")}
            <div class="host-shortcuts" aria-label="Qarinah host commands">
              <span><strong>Codex</strong><code>$qarinah</code></span>
              <span><strong>Claude Code</strong><code>/qarinah &lt;task&gt;</code></span>
              <span><strong>Any terminal</strong><code>npx qarinah query "&lt;task&gt;"</code></span>
            </div>
          </div>
          <aside class="hero-proof" aria-label="Benchmark summary">
            <p class="eyebrow">One measured result</p>
            <div class="hero-proof-result">
              <strong>77.81&times;</strong>
              <span>baseline-to-pack ratio</span>
            </div>
            <p>442,113 estimated input-context tokens became 5,682 - 98.71% less repeated context. Every required target was directly covered in the top five in the published fixture.</p>
            <a href="/docs/benchmarks/">Read the method, artifacts, and limits</a>
          </aside>
        </div>
      </section>

      <section class="dashboard-proof section shell" aria-labelledby="dashboard-proof-title">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">A real worktree context graph</p>
            <h2 id="dashboard-proof-title">See the branch, files, decisions, relationships, and hashes together.</h2>
          </div>
          <p>This generated screenshot comes from two initialized Git worktrees in one real demo repository. Each checkout owns a separate ledger; the local dashboard groups their repository identity and lets a developer inspect each branch-specific graph.</p>
        </div>
        <figure class="what-you-save-figure dashboard-proof-figure">
          <img src="/assets/qarinah-worktree-context-graph.png" width="1265" height="712" loading="lazy" decoding="async" alt="Qarinah local worktree context graph showing the feature worktree node, files, memories, concepts, evidence relationships, ranked results, and the selected node's evidence hash.">
          <figcaption>Generated from real local CLI setup, retained decisions, a project-structure v2 scan, and the hash-chained ledger. No fictional graph data or hosted account is involved.</figcaption>
        </figure>
        <div class="hero-actions dashboard-proof-actions">
          <a class="btn btn-primary" href="/docs/worktree-context/">Open the worktree guide</a>
          <a class="hero-text-link" href="/docs/dashboard/">Run the local dashboard</a>
        </div>
      </section>

      <section class="section shell" aria-labelledby="durable-memory-title">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">What the project remembers</p>
            <h2 id="durable-memory-title">Open a new agent session without losing the work already done.</h2>
          </div>
          <p>Qarinah keeps permitted requests, visible outcomes, tool results, summaries, decisions, and code relationships beside the repository. A fresh supported agent receives a small cited handoff, not a blind replay of the complete history.</p>
        </div>
        <div class="use-mode-grid">
          <article class="use-mode-card">
            <span>Work</span>
            <h3>What was asked and completed</h3>
            <p>See user requests, latest outcomes, decisions, approvals, summaries, and tool-result counts with source event IDs and hashes.</p>
            <a href="/docs/project-overview/">Open the project overview</a>
          </article>
          <article class="use-mode-card">
            <span>Codebase</span>
            <h3>How the project fits together</h3>
            <p>Map bounded files, folders, languages, imports, Markdown links, changes, renames, deletions, and unresolved relationships into SQLite and a typed graph.</p>
            <a href="/docs/project-overview/">See the codebase map</a>
          </article>
          <article class="use-mode-card">
            <span>Recovery</span>
            <h3>Bring old visible agent history</h3>
            <p>Stream Codex, Claude, or portable JSONL exports. Compact mode keeps one cited outcome summary per session while excluding hidden and encrypted reasoning blocks.</p>
            <a href="/docs/agent-archive-import/">Import agent archives</a>
          </article>
          <article class="use-mode-card">
            <span>Private</span>
            <h3>Keep the operator in control</h3>
            <p>Use project-local storage, metadata-only defaults, explicit content consent, redaction, encrypted team bundles, signed checkpoints, and disclosure filters.</p>
            <a href="/docs/private-projects/">Review private-project controls</a>
          </article>
        </div>
        <div class="handoff-stage-copy">
          ${commandBlock("npx qarinah overview\nnpx qarinah import ./agent-exports --format auto --mode compact", "Understand the project and recover visible history")}
        </div>
      </section>

      <section class="benchmark-ribbon" aria-labelledby="benchmark-ribbon-title">
        <div class="shell">
          <div class="benchmark-ribbon-heading">
            <p class="eyebrow">Reproducible release benchmarks</p>
            <h2 id="benchmark-ribbon-title">Measured, reproducible, and explicitly scoped.</h2>
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
          <div><strong>98.71%</strong><span>less repeated context in the published six-task fixture</span></div>
          <div><strong>436,431</strong><span>fewer portable estimated input-context tokens in the compared slice</span></div>
          <div><strong>77.81&times;</strong><span>as many estimated tokens in the full-history baseline as the compiled context pack</span></div>
          <div><strong>380 / 380</strong><span>file-specific exact and typo-tolerant queries ranked the target first</span></div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">One tool, three ways to use it</p>
            <h2>Start alone. Share when the project grows.</h2>
          </div>
          <p>Qarinah is useful without Maqam, a hosted account, or a team plan. The same local record can later support collaboration or a larger agent stack without changing its source of truth.</p>
        </div>
        <div class="use-mode-grid">
          <article class="use-mode-card">
            <span>Personal</span>
            <h3>One developer, many agents and worktrees</h3>
            <p>Give each checkout an isolated memory, then let Codex, Claude Code, Cursor, CLI tools, and compatible MCP clients retrieve the right cited branch context.</p>
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
            <span>Optional add-on</span>
            <h3>Add Maqam only when you need approval</h3>
            <p>Maqam can attach temporary memory scopes and add policy or human approval to selected high-impact workflows. Qarinah remains an independent project-memory tool before and after that connection.</p>
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
              <p>Worktree-aware project memory and cited context graphs for coding agents.</p>
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
            <p class="eyebrow">One worktree-aware context layer</p>
            <h2>Switch agents or branches. Keep the decisions, outcomes, and proof.</h2>
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
      system: "Application personalization memory",
      href: "#application-personalization-memory"
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
      system: "General temporal knowledge graph",
      href: "#general-temporal-knowledge-graph"
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
    description: "Compare Qarinah with personalization, stateful-agent, programmable-memory, temporal-graph, and native coding-host approaches by product boundary.",
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

function agentStackPage() {
  const projectCards = agentStackProjects.map((project, index) => `
    <article class="toolkit-project-card" id="${project.slug}">
      <header>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <p>${project.category}</p>
      </header>
      <h3>${project.name}</h3>
      <p>${project.role}</p>
      <p class="toolkit-boundary"><strong>Boundary:</strong> ${project.boundary}</p>
      <div class="toolkit-links">
        <a href="${project.url}" rel="noreferrer">Official site</a>
        <a href="${project.source}" rel="noreferrer">Source</a>
      </div>
    </article>`).join("");

  const categories = [
    ["Browser automation primitives", "The low-level browser control layer. The host still owns authorization, evidence, and policy.", ["playwright", "puppeteer"]],
    ["Agentic browser frameworks", "Higher-level browser-agent interfaces for natural-language actions, extraction, and planning.", ["browser-use", "stagehand"]],
    ["Web and document acquisition", "Tools for web extraction, broader web-data APIs, or document conversion into AI-ready structures.", ["trafilatura", "firecrawl", "docling"]],
    ["Agent and workflow runtimes", "Frameworks that own the agent loop, workflow state, tools, handoffs, or durable orchestration.", ["langgraph", "openai-agents-sdk"]]
  ];
  const categoryMarkup = categories.map(([title, description, slugs], categoryIndex) => {
    const tools = slugs.map((slug) => agentStackPrimitives.find((tool) => tool.slug === slug));
    return `
      <section class="toolkit-category" aria-labelledby="toolkit-category-${categoryIndex + 1}">
        <header>
          <span>${String(categoryIndex + 1).padStart(2, "0")}</span>
          <div>
            <h3 id="toolkit-category-${categoryIndex + 1}">${title}</h3>
            <p>${description}</p>
          </div>
        </header>
        <div class="toolkit-tool-list">
          ${tools.map((tool) => `
            <article id="${tool.slug}">
              <div>
                <p>${tool.category}</p>
                <h4>${tool.name}</h4>
                <a href="${tool.url}" rel="noreferrer">Official documentation</a>
              </div>
              <p>${tool.role}</p>
              <p><strong>Composition note:</strong> ${tool.relationship}</p>
            </article>`).join("")}
        </div>
      </section>`;
  }).join("");

  const questionMarkup = agentStackQuestions.map((entry) => `
    <article>
      <h3>${entry.name}</h3>
      <p>${entry.text}</p>
    </article>`).join("");

  return layout({
    title: "An open-source memory, browser, and crawler stack for AI agents",
    description: "See how Qarinah, Cockroach Browser, and Cockroach Crawler compose into a practical agent stack, with Maqam available as an optional approval add-on.",
    canonical: "/articles/open-source-agent-memory-stack/",
    kind: "toolkit",
    body: `
      <section class="toolkit-hero">
        <div class="shell toolkit-hero-grid">
          <div>
            <p class="eyebrow">Open-source agent memory stack</p>
            <h1>Give agents memory, web reach, and a browser.</h1>
            <p class="toolkit-lede">Qarinah keeps project memory and retrieves cited context. Cockroach Crawler discovers and extracts the web. Cockroach Browser handles interactive sessions. Use each project alone or connect them into one practical agent stack. Add Maqam only when a workflow also needs policy or human approval.</p>
            <p class="toolkit-byline">Written by <strong>Ajnas N B</strong> - reviewed <time datetime="2026-08-16">16 August 2026</time></p>
            <div class="comparison-actions">
              <a class="btn btn-primary btn-large" href="#authored-projects">Explore the stack</a>
              <a class="hero-text-link" href="#reference-architecture">View a reference stack</a>
            </div>
          </div>
          <aside class="toolkit-disclosure" aria-label="Authorship and comparison disclosure">
            <p>Authorship disclosure</p>
            <strong>Four authored projects. Nine established tools.</strong>
            <p>Qarinah, Maqam, Cockroach Browser, and Cockroach Crawler are projects by Ajnas N B. Every other named project remains the work of its respective maintainers.</p>
            <p>This is a composition guide, not a ranking, endorsement, or claim of affiliation.</p>
          </aside>
        </div>
        <div class="shell toolkit-layer-strip" aria-label="The four authored project boundaries">
          ${agentStackProjects.map((project, index) => `<a href="#${project.slug}"><span>0${index + 1}</span><strong>${project.name}</strong><small>${project.category}</small></a>`).join("")}
        </div>
      </section>

      <section class="section shell" aria-labelledby="authored-projects">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">The authored project family</p>
            <h2 id="authored-projects">Start with the capability you need.</h2>
          </div>
          <p>Each project installs and works on its own. Connect them when an agent needs persistent project memory, public-web discovery, interactive browser work, or optional approvals in the same workflow.</p>
        </div>
        <div class="toolkit-project-grid">${projectCards}</div>
      </section>

      <section class="section section-alt" aria-labelledby="established-tools">
        <div class="shell">
          <div class="section-heading split-heading">
            <div>
              <p class="eyebrow">Primitives, frameworks, and adjacent products</p>
              <h2 id="established-tools">Established tools stay in their own categories.</h2>
            </div>
            <p>These projects solve important parts of the stack. They are linked to official documentation and described by product job, not absorbed into the authored project family.</p>
          </div>
          <div class="toolkit-categories">${categoryMarkup}</div>
        </div>
      </section>

      <section class="section shell" aria-labelledby="reference-architecture">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">One possible composition</p>
            <h2 id="reference-architecture">A reference architecture, not a required bundle.</h2>
          </div>
          <p>Start with the layer your system is missing. A production system may use one, several, or none of these projects.</p>
        </div>
        <ol class="toolkit-reference-stack">
          <li><span>01</span><div><strong>Run the agent or workflow</strong><p>Use LangGraph, OpenAI Agents SDK, or another host to own models, tools, handoffs, and state.</p></div></li>
          <li><span>02</span><div><strong>Compile project memory when needed</strong><p>Use Qarinah when supported coding agents need one local, cited project record across sessions and hosts.</p></div></li>
          <li><span>03</span><div><strong>Add approval only when needed</strong><p>Optionally route selected high-impact actions through Maqam for policy, human approval, and receipts.</p></div></li>
          <li><span>04</span><div><strong>Run an interactive browser session</strong><p>Use Cockroach Browser for stateful web work, forms, files, screenshots, and session evidence. It builds on established browser automation engines.</p></div></li>
          <li><span>05</span><div><strong>Crawl and extract the public web</strong><p>Use Cockroach Crawler for page discovery, JavaScript rendering, extraction, and cited web records, or choose another web-data tool when its product center fits better.</p></div></li>
          <li><span>06</span><div><strong>Convert document-heavy sources</strong><p>Use Docling when PDF, office document, image, and document-structure conversion is the primary ingestion problem.</p></div></li>
        </ol>
      </section>

      <section class="section section-alt" aria-labelledby="questions">
        <div class="shell">
          <div class="section-heading split-heading">
            <div>
              <p class="eyebrow">Direct answers</p>
              <h2 id="questions">Questions about the toolkit boundary.</h2>
            </div>
            <p>The short answers below match the Article, ItemList, FAQ, and breadcrumb metadata published with this page.</p>
          </div>
          <div class="comparison-faq">${questionMarkup}</div>
        </div>
      </section>

      <section class="comparison-method" id="method" aria-labelledby="toolkit-method-title">
        <div class="shell comparison-method-grid">
          <div>
            <p class="eyebrow">Authorship, sources, and limits</p>
            <h2 id="toolkit-method-title">Every category points to its official source.</h2>
          </div>
          <div>
            <p>Written by Ajnas N B. Product descriptions were reviewed against official project documentation on 16 August 2026. External projects are not presented as dependencies unless the relationship is explicitly disclosed.</p>
            <p>Cockroach Browser uses Playwright. Cockroach Crawler's optional quality surface uses Trafilatura. Other composition examples are architectural options, not installed dependencies or endorsements.</p>
            <p>This page makes no best, first, only, certification, or matched-performance claim. Verify current versions, licenses, deployment models, and guarantees before adoption.</p>
          </div>
        </div>
      </section>

      <section class="section final-cta">
        <div class="shell final-cta-inner">
          <div>
            <p class="eyebrow">Begin with the missing boundary</p>
            <h2>Use Qarinah when the missing layer is cited project memory.</h2>
          </div>
          <div>
            <a class="btn btn-primary btn-large" href="/docs/getting-started/">Set up Qarinah</a>
            <a class="text-link" href="/alternatives/">Compare memory approaches</a>
          </div>
        </div>
      </section>`
  });
}

function worktreeContextArticlePage() {
  return layout({
    title: "Why every coding-agent worktree needs its own memory",
    description: "See how Qarinah keeps parallel Git worktrees isolated while joining their branch, commit, files, decisions, and hashes in one local context graph.",
    canonical: "/articles/git-worktree-context-for-coding-agents/",
    kind: "worktree-article",
    body: `
      <article>
        <header class="toolkit-hero">
          <div class="shell toolkit-hero-grid">
            <div>
              <p class="eyebrow">Git worktrees + coding agents</p>
              <h1>Parallel code needs precise memory.</h1>
              <p class="toolkit-lede">Two worktrees can belong to the same repository while containing different source, decisions, tests, and unfinished work. Qarinah keeps their writable memory separate and joins their identities in one local context graph.</p>
              <p class="toolkit-byline">Written by <strong>Ajnas N B</strong> - published <time datetime="2026-08-16">16 August 2026</time></p>
              <div class="comparison-actions">
                <a class="btn btn-primary btn-large" href="/docs/getting-started/">Set up a worktree</a>
                <a class="hero-text-link" href="/docs/worktree-context/">Read the technical guide</a>
              </div>
            </div>
            <aside class="toolkit-disclosure" aria-label="Worktree storage model">
              <p>Storage model</p>
              <strong>One repository group. One ledger per checkout.</strong>
              <p>No symlinked ledgers. No shared writable database. No remote URL or credential collection.</p>
              <p>Branch and commit context are covered by the project snapshot hash.</p>
            </aside>
          </div>
        </header>

        <section class="section shell" id="why-worktrees" aria-labelledby="why-worktrees-title">
          <div class="section-heading split-heading">
            <div><p class="eyebrow">The problem</p><h2 id="why-worktrees-title">A worktree is a context boundary.</h2></div>
            <p>When two agents work in parallel, a decision that is current on one branch may be wrong on another. A single mutable memory store can flatten those differences or race with both writers.</p>
          </div>
          <div class="feature-grid">
            <article class="feature-card feature-card-wide"><span class="feature-index">01</span><h3>Keep writes isolated</h3><p>Every initialized checkout owns its event chain, consent, SQLite view, graph, Markdown, JSON, dashboard, and export projections.</p></article>
            <article class="feature-card"><span class="feature-index">02</span><h3>Keep the repository connection</h3><p>A non-secret repository ID groups linked worktrees without exposing a remote URL or sharing writable storage.</p></article>
            <article class="feature-card"><span class="feature-index">03</span><h3>Bind context to source</h3><p>The branch, commit, and worktree identity are part of project-structure v2 and its deterministic snapshot hash.</p></article>
          </div>
        </section>

        <section class="section section-alt" id="how-it-works" aria-labelledby="how-it-works-title">
          <div class="shell workflow-grid">
            <div>
              <p class="eyebrow">The workflow</p>
              <h2 id="how-it-works-title">Separate ledgers, one repository graph.</h2>
              <ol class="steps">
                <li><span>1</span><div><strong>Initialize the active checkout</strong><p>Setup binds Qarinah to the exact requested root; it never silently attaches a sibling or parent.</p></div></li>
                <li><span>2</span><div><strong>Record visible work</strong><p>Retain permitted decisions, outcomes, summaries, tool results, and source relationships in that checkout.</p></div></li>
                <li><span>3</span><div><strong>Scan the current branch</strong><p>Project-structure v2 maps bounded files and relationships and includes the current Git worktree metadata in its hash.</p></div></li>
                <li><span>4</span><div><strong>Open initialized siblings</strong><p>The loopback dashboard asks Git for live worktrees and groups only the checkouts with exact-root Qarinah configuration.</p></div></li>
              </ol>
            </div>
            <div>${commandBlock("npx qarinah setup . --capture content --allow-query\nnpx qarinah scan\nnpx qarinah build\nnpx qarinah worktrees\nnpx qarinah dashboard --serve --worktrees", "Worktree-aware project memory")}</div>
          </div>
        </section>

        <section class="dashboard-proof section shell" id="proof" aria-labelledby="worktree-proof-title">
          <div class="section-heading split-heading">
            <div><p class="eyebrow">Generated proof</p><h2 id="worktree-proof-title">The worktree is a node, not a label pasted onto a screenshot.</h2></div>
            <p>This image was captured from a real two-worktree demo using the release code. The selected node exposes its kind, current status, importance, connections, ranking basis, and event evidence hash.</p>
          </div>
          <figure class="what-you-save-figure dashboard-proof-figure">
            <img src="/assets/qarinah-worktree-context-graph.png" width="1265" height="712" loading="lazy" decoding="async" alt="Qarinah worktree context graph with the feature worktree selected and its evidence-linked files, memories, concepts, and ranked results visible.">
            <figcaption>Real local data from branch <code>feature/worktree-context</code>. The demo repository and ledgers were created only for this public capture.</figcaption>
          </figure>
        </section>

        <section class="section section-alt" id="start" aria-labelledby="worktree-start-title">
          <div class="shell final-cta-inner">
            <div><p class="eyebrow">Start locally</p><h2 id="worktree-start-title">Give each active checkout the context it actually owns.</h2></div>
            <div><a class="btn btn-primary btn-large" href="/docs/getting-started/">Open the setup guide</a><a class="text-link" href="/docs/worktree-context/">Inspect identities and hashes</a><a class="text-link" href="/docs/benchmarks/">Verify the separate context benchmark</a></div>
          </div>
        </section>
      </article>`
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
        : page.route === "docs/features"
          ? "features"
          : page.route === "docs/getting-started"
            ? "install"
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
        : page.route === "docs/features"
          ? "features"
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
const toolkitDestination = path.join(output, "articles", "open-source-agent-memory-stack");
await mkdir(toolkitDestination, { recursive: true });
await writeFile(path.join(toolkitDestination, "index.html"), agentStackPage());
const worktreeArticleDestination = path.join(output, "articles", "git-worktree-context-for-coding-agents");
await mkdir(worktreeArticleDestination, { recursive: true });
await writeFile(path.join(worktreeArticleDestination, "index.html"), worktreeContextArticlePage());
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
await writeFile(path.join(output, "metrics.json"), `${JSON.stringify(publicMetrics, null, 2)}\n`);

const sitemapRoutes = [
  "/",
  "/alternatives/",
  "/articles/git-worktree-context-for-coding-agents/",
  "/articles/open-source-agent-memory-stack/",
  "/docs/",
  "/search/",
  ...docPages.map((page) => `/${page.route}/`)
];
const staticRedirects = (await readFile(path.join(root, "website", "static", "_redirects"), "utf8")).trim();
const canonicalDirectoryRedirects = sitemapRoutes
  .filter((route) => route !== "/")
  .map((route) => `${route.slice(0, -1)} ${route} 308`);
await writeFile(
  path.join(output, "_redirects"),
  `${canonicalDirectoryRedirects.join("\n")}\n${staticRedirects}\n`
);
await writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>${siteOrigin}${route}</loc><lastmod>${releaseDate}</lastmod></url>`).join("\n")}\n</urlset>\n`
);

console.log(`Built ${sitemapRoutes.length} Qarinah pages in ${path.relative(root, output)}.`);
