import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
const required = [
  "index.html",
  "articles/git-worktree-context-for-coding-agents/index.html",
  "articles/open-source-agent-memory-stack/index.html",
  "docs/index.html",
  "docs/cross-agent-handoffs/index.html",
  "docs/getting-started/index.html",
  "docs/features/index.html",
  "docs/cli/index.html",
  "docs/api/index.html",
  "docs/integrations/index.html",
  "docs/mcp/index.html",
  "docs/team-memory/index.html",
  "docs/content-archive/index.html",
  "docs/automatic-project-memory/index.html",
  "docs/cited-facts/index.html",
  "docs/proof-carrying-context/index.html",
  "docs/symbol-graph/index.html",
  "docs/worktree-context/index.html",
  "docs/token-efficient-context/index.html",
  "docs/recipes/index.html",
  "docs/architecture/index.html",
  "docs/benchmarks/index.html",
  "docs/public-metrics/index.html",
  "docs/security/index.html",
  "docs/interoperability/index.html",
  "docs/troubleshooting/index.html",
  "docs/faq/index.html",
  "docs/migrations/index.html",
  "search/index.html",
  "search-index.json",
  "metrics.json",
  "paper/index.html",
  "paper/Qarinah-Technical-White-Paper-v1.8.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.7.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.4.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.5.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.3.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.2.pdf",
  "assets/qarinah-mark.svg",
  "assets/qarinah-flow.svg",
  "assets/qarinah-social-preview.png",
  "assets/qarinah-what-you-save.png",
  "assets/qarinah-project-memory-dashboard.png",
  "assets/qarinah-worktree-context-graph.png",
  "site.css",
  "site.js",
  "primer.css",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "llms-full.txt",
  ".well-known/security.txt"
];

for (const file of required) {
  await access(path.join(output, file));
}

const worktreeGraphSignature = await readFile(path.join(output, "assets/qarinah-worktree-context-graph.png"));
if (!worktreeGraphSignature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
  throw new Error("Worktree graph screenshot must contain PNG bytes that match its public media type.");
}

const htmlFiles = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(target);
    } else if (entry.name.endsWith(".html")) {
      htmlFiles.push(target);
    }
  }
}
await collect(output);

const availableRoutes = new Set(htmlFiles.map((file) => {
  const relative = path.relative(output, file).replaceAll("\\", "/");
  return relative === "index.html" ? "/" : `/${relative.replace(/index\.html$/, "")}`;
}));
const slashlessDirectoryAliases = new Map(
  [...availableRoutes]
    .filter((route) => route !== "/")
    .map((route) => [route.slice(0, -1), route])
);

const errors = [];
const titles = new Map();
const descriptions = new Map();
const canonicals = new Map();
const htmlByRoute = new Map();

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const fileLabel = path.relative(root, file);
  const relative = path.relative(output, file).replaceAll("\\", "/");
  const route = relative === "index.html" ? "/" : `/${relative.replace(/index\.html$/, "")}`;
  htmlByRoute.set(route, html);

  if (/\u2014|&mdash;|&#8212;|&#x2014;/i.test(html)) {
    errors.push(`${fileLabel} contains an em dash; public pages must use a normal hyphen`);
  }

  if (html.includes("â€”") || html.includes("â€“")) {
    errors.push(`${fileLabel} contains corrupted dash encoding`);
  }

  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];

  if (!title) {
    errors.push(`${fileLabel} is missing a title`);
  } else if (titles.has(title)) {
    errors.push(`${fileLabel} duplicates the title from ${titles.get(title)}`);
  } else {
    titles.set(title, fileLabel);
  }

  if (!description) {
    errors.push(`${fileLabel} is missing a description`);
  } else if (descriptions.has(description)) {
    errors.push(`${fileLabel} duplicates the description from ${descriptions.get(description)}`);
  } else {
    descriptions.set(description, fileLabel);
  }

  if (!canonical) {
    errors.push(`${fileLabel} is missing a canonical URL`);
  } else {
    const expected = `https://qarinah.io${route}`;
    if (canonical !== expected) errors.push(`${fileLabel} canonical ${canonical} does not match ${expected}`);
    if (canonicals.has(canonical)) errors.push(`${fileLabel} duplicates canonical ${canonical}`);
    canonicals.set(canonical, fileLabel);
  }

  for (const language of ["en", "x-default"]) {
    const alternate = html.match(new RegExp(`<link rel="alternate" hreflang="${language}" href="([^"]+)">`))?.[1];
    const expected = `https://qarinah.io${route}`;
    if (alternate !== expected) errors.push(`${fileLabel} ${language} alternate ${alternate ?? "is missing"}; expected ${expected}`);
  }

  if ((html.match(/<h1(?:\s|>)/g) || []).length !== 1) {
    errors.push(`${fileLabel} must contain exactly one h1`);
  }

  for (const requiredMeta of [
    '<meta name="robots"',
    '<meta property="og:site_name"',
    '<meta property="og:image:alt"',
    '<meta name="twitter:image:alt"'
  ]) {
    if (!html.includes(requiredMeta)) errors.push(`${fileLabel} is missing ${requiredMeta}`);
  }

  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (!jsonLd) {
    errors.push(`${fileLabel} is missing JSON-LD`);
  } else {
    try {
      const parsed = JSON.parse(jsonLd);
      if (parsed["@context"] !== "https://schema.org" || !Array.isArray(parsed["@graph"])) {
        errors.push(`${fileLabel} has an invalid structured-data graph`);
      }
    } catch (error) {
      errors.push(`${fileLabel} has invalid JSON-LD: ${error.message}`);
    }
  }

  for (const image of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="[^"]*"/.test(image[0])) errors.push(`${fileLabel} has an image without alt text`);
  }

  for (const match of html.matchAll(/href="(\/[^"#?]*\/)(?:#[^"]*)?"/g)) {
    const linkedRoute = match[1];
    if (!availableRoutes.has(linkedRoute) && !linkedRoute.startsWith("/assets/") && !linkedRoute.startsWith("/paper/Qarinah-")) {
      errors.push(`${fileLabel} links to missing route ${linkedRoute}`);
    }
  }

  for (const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const linkedPath = match[1];
    if (slashlessDirectoryAliases.has(linkedPath)) {
      errors.push(`${fileLabel} links to slashless directory alias ${linkedPath}; use ${slashlessDirectoryAliases.get(linkedPath)}`);
    }
  }
}

for (const [sourceRoute, html] of htmlByRoute) {
  for (const match of html.matchAll(/href="(\/[^"#?]*\/)#([^"]+)"/g)) {
    const [, targetRoute, anchor] = match;
    const target = htmlByRoute.get(targetRoute);
    if (target && !target.includes(`id="${anchor}"`)) {
      errors.push(`${sourceRoute} links to missing anchor ${targetRoute}#${anchor}`);
    }
  }
}

const sitemap = await readFile(path.join(output, "sitemap.xml"), "utf8");
const sitemapRoutes = new Set([
  ...sitemap.matchAll(/<loc>https:\/\/qarinah\.io([^<]+)<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)
].map((match) => match[1]));
for (const route of availableRoutes) {
  if (!sitemapRoutes.has(route)) errors.push(`sitemap.xml is missing ${route}`);
}
for (const route of sitemapRoutes) {
  if (!availableRoutes.has(route)) errors.push(`sitemap.xml contains unknown route ${route}`);
  if (route !== "/" && !route.endsWith("/")) errors.push(`sitemap.xml contains non-canonical slashless route ${route}`);
}

const redirects = await readFile(path.join(output, "_redirects"), "utf8");
const redirectRules = redirects
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split(/\s+/));
const redirectSources = new Set();
for (const [source, destination, status] of redirectRules) {
  if (redirectSources.has(source)) errors.push(`_redirects contains duplicate source ${source}`);
  redirectSources.add(source);
  if (slashlessDirectoryAliases.has(source)) {
    const expected = slashlessDirectoryAliases.get(source);
    if (destination !== expected || !["301", "308"].includes(status)) {
      errors.push(`_redirects must permanently canonicalize ${source} to ${expected}`);
    }
  }
}
for (const [source, destination] of slashlessDirectoryAliases) {
  if (!redirectRules.some(([candidateSource, candidateDestination, status]) =>
    candidateSource === source && candidateDestination === destination && ["301", "308"].includes(status)
  )) {
    errors.push(`_redirects is missing permanent canonicalization ${source} -> ${destination}`);
  }
}
if (!redirectRules.some(([source, destination, status]) =>
  source === "/articles/open-source-governed-agent-toolkit/"
  && destination === "/articles/open-source-agent-memory-stack/"
  && ["301", "308"].includes(status)
)) {
  errors.push("_redirects is missing the permanent legacy article redirect.");
}

const searchIndex = JSON.parse(await readFile(path.join(output, "search-index.json"), "utf8"));
const indexedRoutes = new Set(searchIndex.map((entry) => entry.route));
for (const entry of searchIndex) {
  if (entry.route !== "/" && !entry.route.endsWith("/")) {
    errors.push(`search-index.json contains non-canonical slashless route ${entry.route}`);
  }
  if (!availableRoutes.has(entry.route)) errors.push(`search-index.json contains unknown route ${entry.route}`);
}
for (const route of availableRoutes) {
  if (route.startsWith("/docs/") && route !== "/docs/" && !indexedRoutes.has(route)) {
    errors.push(`search-index.json is missing ${route}`);
  }
}
if (!indexedRoutes.has("/articles/open-source-agent-memory-stack/")) {
  errors.push("search-index.json is missing /articles/open-source-agent-memory-stack/");
}
if (!searchIndex.every((entry) =>
  entry.title
  && entry.description
  && Array.isArray(entry.headings)
  && Array.isArray(entry.keywords)
  && typeof entry.content === "string"
)) {
  errors.push("search-index.json contains an incomplete entry");
}

const robots = await readFile(path.join(output, "robots.txt"), "utf8");
for (const crawler of ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "ChatGPT-User", "Claude-User", "Perplexity-User"]) {
  if (!robots.includes(`User-agent: ${crawler}`)) errors.push(`robots.txt is missing ${crawler}`);
}

const llms = await readFile(path.join(output, "llms.txt"), "utf8");
for (const canonicalResource of [
  "https://qarinah.io/docs/",
  "https://qarinah.io/docs/features/",
  "https://qarinah.io/docs/faq/",
  "https://qarinah.io/docs/public-metrics/",
  "https://qarinah.io/metrics.json",
  "https://qarinah.io/articles/git-worktree-context-for-coding-agents/",
  "https://qarinah.io/articles/open-source-agent-memory-stack/",
  "https://www.npmjs.com/package/qarinah",
  "https://github.com/AjnasNB/qarinah",
  "https://doi.org/10.5281/zenodo.21547684"
]) {
  if (!llms.includes(canonicalResource)) errors.push(`llms.txt is missing ${canonicalResource}`);
}

const home = await readFile(path.join(output, "index.html"), "utf8");
const worktreeArticle = await readFile(path.join(output, "articles", "git-worktree-context-for-coding-agents", "index.html"), "utf8");
const toolkit = await readFile(path.join(output, "articles", "open-source-agent-memory-stack", "index.html"), "utf8");
const paper = await readFile(path.join(output, "paper", "index.html"), "utf8");
const faq = await readFile(path.join(output, "docs", "faq", "index.html"), "utf8");
const features = await readFile(path.join(output, "docs", "features", "index.html"), "utf8");
const publicMetricsPage = await readFile(path.join(output, "docs", "public-metrics", "index.html"), "utf8");
const publicMetrics = JSON.parse(await readFile(path.join(output, "metrics.json"), "utf8"));
const responsiveCss = await readFile(path.join(output, "site.css"), "utf8");
for (const responsiveTableRule of [
  ".cost-equivalent-table-wrap {",
  "overflow-x: auto;",
  ".doc-content table {",
  "overscroll-behavior-inline: contain;"
]) {
  if (!responsiveCss.includes(responsiveTableRule)) errors.push(`site.css is missing responsive table behavior: ${responsiveTableRule}`);
}
for (const responsiveHeroRule of [
  ".hero-copy .command-block {",
  ".hero-privacy {",
  ".hero-copy {\n    text-align: center;",
  ".hero-actions {\n    justify-content: center;"
]) {
  if (!responsiveCss.includes(responsiveHeroRule)) errors.push(`site.css is missing responsive first-run hero behavior: ${responsiveHeroRule}`);
}
if (home.includes('"@type":"SearchAction"') || home.includes("search_term_string")) {
  errors.push("Homepage must not emit the retired sitelinks-search SearchAction or its crawlable URL template.");
}
if (!home.includes("<strong>12 / 12</strong>")
  || !home.includes("<strong>10 / 10</strong>")
  || !home.includes("eligible public-checkout source files indexed")
  || !home.includes("Multi-language symbols and references")
  || !home.includes("Strict cited facts")
  || !home.includes("public-project memory scenarios passed")
  || !home.includes("10 languages")
  || !home.includes("<strong>0 bodies</strong>")) {
  errors.push("Homepage is missing the plain-language visible-memory acceptance proof.");
}
for (const benchmarkProof of ["12 / 12", "Proof-carrying task packets accepted", "98.75%", "89.05%", "Measured, reproducible, and explicitly scoped."]) {
  if (!home.includes(benchmarkProof)) errors.push(`Homepage benchmark ribbon is missing ${benchmarkProof}`);
}
if (!home.includes("What coding agents and developers need to know.") || !home.includes('href="/docs/faq/"')) {
  errors.push("Homepage is missing the direct answer-engine surface.");
}
for (const worktreeHeroProof of [
  "Start a new coding-agent session without re-explaining your project.",
  "Project memory for coding agents",
  "npx qarinah@latest setup .",
  "Metadata-only by default.",
  "npx qarinah demo",
  "Try the two-minute demo",
  "Join the first 10 maintainers",
  "one repository · two isolated ledgers",
  "branch + commit in snapshot hash",
  'href="/docs/getting-started/#try-the-isolated-demo-first"'
]) {
  if (!home.includes(worktreeHeroProof)) errors.push(`Homepage is missing the activation-first product story: ${worktreeHeroProof}`);
}
if (home.indexOf('class="front-proof section shell"') > home.indexOf('class="handoff-stage"')) {
  errors.push("Homepage must place the verified claim and cost table directly after the hero, before the setup workflow.");
}
for (const dashboardProof of [
  'class="dashboard-proof section shell"',
  'src="/assets/qarinah-worktree-context-graph.png"',
  "See the branch, files, decisions, relationships, and hashes together.",
  'href="/docs/worktree-context/"',
  'href="/docs/dashboard/"'
]) {
  if (!home.includes(dashboardProof)) errors.push(`Homepage is missing the real dashboard proof: ${dashboardProof}`);
}
if (home.indexOf('<section class="hero">') > home.indexOf('<section class="benchmark-ribbon"')) {
  errors.push("Homepage must lead with the centered product hero before benchmark detail.");
}
if (!home.includes("Verifiable project memory, exact source recovery, and cited context for coding agents.")
  || !home.includes("Measured, reproducible, and explicitly scoped.")) {
  errors.push("Homepage is missing the worktree-aware category or the separate historical benchmark scope.");
}
if (publicMetrics.schemaVersion !== "qarinah.public-metrics.v1"
  || publicMetrics.productVersion !== "0.6.0"
  || publicMetrics.updatedAt !== "2026-08-22"
  || publicMetrics.providerBillingMeasurement !== false
  || publicMetrics.metrics?.proofCarryingTaskContext?.scenarios !== 12
  || publicMetrics.metrics?.proofCarryingTaskContext?.accepted !== 12
  || publicMetrics.metrics?.proofCarryingTaskContext?.expectedFileHitAt5 !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.expectedSymbolHitAt5Files !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.currentEvidenceRecall !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.staleEvidenceRejection !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.citationValidity !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.budgetConformance !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.deterministicManifestReproduction !== 1
  || publicMetrics.metrics?.proofCarryingTaskContext?.manifestTamperRejection !== true
  || publicMetrics.metrics?.realGitWorktreeContinuity?.scenarios !== 16
  || publicMetrics.metrics?.realGitWorktreeContinuity?.passed !== 16
  || publicMetrics.metrics?.realGitWorktreeContinuity?.failed !== 0
  || publicMetrics.metrics?.realGitWorktreeContinuity?.artifactHash !== "sha256:0a610a0c2f6503d4b3c53c2e8bfc187c2159c70906e1bc7e828693cc34b6be9d"
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.scenarios !== 12
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.passed !== 12
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.failed !== 0
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.restoredSourceBytes !== 390226
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.reusedChunks !== 2
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.indexedSymbols !== 4
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.resolvedReferences !== 3
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.citedFacts !== 2
  || publicMetrics.metrics?.deepMemoryProductAcceptance?.artifactHash !== "sha256:4736652101ffde46e450983285be3f41c74f850728bc4b59848c45b063afb112"
  || publicMetrics.metrics?.publicProjectMemory?.scenarios !== 10
  || publicMetrics.metrics?.publicProjectMemory?.passed !== 10
  || publicMetrics.metrics?.publicProjectMemory?.indexedSymbolFiles !== publicMetrics.metrics?.publicProjectMemory?.eligibleSymbolFiles
  || publicMetrics.metrics?.publicProjectMemory?.providerCalls !== 0
  || publicMetrics.metrics?.publicProjectMemory?.privateDataUsed !== false
  || publicMetrics.metrics?.repeatedProjectContext?.baselineEstimatedTokens !== 442113
  || publicMetrics.metrics?.repeatedProjectContext?.qarinahEstimatedTokens !== 5682
  || publicMetrics.metrics?.repeatedProjectContext?.estimatedTokensAvoided !== 436431
  || publicMetrics.metrics?.repeatedProjectContext?.baselineToQarinahRatio !== 77.81
  || publicMetrics.metrics?.multiFileRetrieval?.rankOnePositiveQueries !== 380
  || publicMetrics.illustrativeCostModel?.pricingBasis !== "flat uncached input-token rate chosen by the reader"
  || publicMetrics.illustrativeCostModel?.examples?.length !== 4
  || publicMetrics.illustrativeCostModel.examples[1]?.usdPerMillionInputTokens !== 3
  || publicMetrics.illustrativeCostModel.examples[1]?.baselineUsd !== 1.326339
  || publicMetrics.illustrativeCostModel.examples[1]?.qarinahUsd !== 0.017046
  || publicMetrics.illustrativeCostModel.examples[1]?.savedUsd !== 1.309293
  || publicMetrics.illustrativeCostModel.examples[1]?.savedAcrossTenRepeatsUsd !== 13.09293
  || !Array.isArray(publicMetrics.claimBoundary)
  || publicMetrics.claimBoundary.length < 3) {
  errors.push("metrics.json is incomplete or has drifted from the verified public benchmark receipt.");
}
for (const requiredPublicMetricCopy of [
  "12 / 12 deep-memory product checks passed",
  "390,226 source bytes exactly",
  "2 of 3",
  "98.7148% less estimated repeated project context",
  "436,431 fewer estimated input-context tokens",
  "full-history baseline contained 77.81 times as many estimated tokens",
  "$1.326339",
  "$13.092930",
  "380 / 380 file-specific queries",
  "Do not publish these claims",
  "provider billing receipt"
]) {
  if (!publicMetricsPage.includes(requiredPublicMetricCopy)) {
    errors.push(`Public metrics page is missing ${requiredPublicMetricCopy}`);
  }
}
for (const primaryDestination of [
  'href="/docs/features/">Features</a>',
  'href="/docs/getting-started/">Install</a>',
  'href="/docs/">Docs</a>'
]) {
  if (!home.includes(primaryDestination)) errors.push(`Homepage navigation is missing ${primaryDestination}`);
}
for (const capability of [
  "Project-owned memory",
  "Cited context compilation",
  "Project structure and derived views",
  "Coding-agent integrations",
  "Team memory and portability",
  "Verify the boundary"
]) {
  if (!features.includes(capability)) errors.push(`Features page is missing ${capability}`);
}
if (!features.includes('"@type":"CollectionPage"')
  || !features.includes('"@type":"ItemList"')
  || !features.includes('"numberOfItems":29')) {
  errors.push("Features page is missing its visible capability collection structured data.");
}
for (const requiredWorktreeArticleCopy of [
  "Why every coding-agent worktree needs its own memory",
  "Parallel code needs precise memory.",
  "A worktree is a context boundary.",
  "Separate ledgers, one repository graph.",
  'src="/assets/qarinah-worktree-context-graph.png"',
  "npx qarinah dashboard --serve --worktrees",
  '"@type":"Article"'
]) {
  if (!worktreeArticle.includes(requiredWorktreeArticleCopy)) {
    errors.push(`Worktree context article is missing ${requiredWorktreeArticleCopy}`);
  }
}
for (const launchDirectoryMarkup of [
  'href="https://startupbase.io/products/qarinah?utm_source=startupbase&amp;utm_medium=badge&amp;utm_campaign=launch-badge-dark"',
  'src="https://statics.startupbase.io/site/badges/launched-on-sb-dark.svg"',
  'alt="Launched on StartupBase" height="55"',
  'href="https://fazier.com/launches/qarinah" target="_blank"',
  'src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&amp;theme=light"',
  'width="120" alt="Fazier badge"',
  'href="https://launchnest.io/p/qarinah" target="_blank"',
  'src="https://launchnest.io/badge/qarinah.svg?variant=listed"',
  'alt="Qarinah on LaunchNest" width="220" height="56"',
  'href="https://www.producthunt.com/products/qarinah?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-qarinah"',
  'src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1218378&amp;theme=light&amp;t=1786794111466"',
  'alt="Qarinah on Product Hunt" width="250" height="54"',
  'href="https://tinystartups.com/startup/qarinah"',
  "Tiny Startups"
]) {
  if (!home.includes(launchDirectoryMarkup)) {
    errors.push(`Homepage launch recognition is missing ${launchDirectoryMarkup}`);
  }
}
const headerPolicy = await readFile(path.join(output, "_headers"), "utf8");
for (const imageOrigin of ["https://api.producthunt.com", "https://launchnest.io", "https://fazier.com", "https://statics.startupbase.io"]) {
  if (!headerPolicy.includes(imageOrigin)) {
    errors.push(`Site image policy is missing launch-directory origin ${imageOrigin}`);
  }
}
for (const requiredToolkitCopy of [
  "Give agents memory, web reach, and a browser.",
  "Written by <strong>Ajnas N B</strong>",
  "Qarinah",
  "Maqam",
  "Cockroach Browser",
  "Cockroach Crawler",
  "Add Maqam only when a workflow also needs policy or human approval.",
  "Playwright",
  "Puppeteer",
  "Trafilatura",
  "Firecrawl",
  "Browser Use",
  "Stagehand",
  "LangGraph",
  "OpenAI Agents SDK",
  "Docling",
  "This is a composition guide, not a ranking, endorsement, or claim of affiliation."
]) {
  if (!toolkit.includes(requiredToolkitCopy)) {
    errors.push(`Agent memory stack page is missing ${requiredToolkitCopy}`);
  }
}
for (const schemaType of ['"@type":"Article"', '"@type":"ItemList"', '"@type":"FAQPage"', '"@type":"BreadcrumbList"']) {
  if (!toolkit.includes(schemaType)) errors.push(`Agent memory stack page is missing ${schemaType}`);
}
if (!toolkit.includes('"numberOfItems":13')) {
  errors.push("Agent memory stack ItemList must contain the four authored projects and nine established tools.");
}
const toolkitQuestionCopy = toolkit.replaceAll("Is this a best-tool ranking?", "");
if (/(?:Qarinah|Maqam|Cockroach Browser|Cockroach Crawler) (?:is|are) (?:the )?(?:best|first|only)|outperforms? every|universal winner/iu.test(toolkitQuestionCopy)) {
  errors.push("Agent memory stack page contains a prohibited superiority term outside the explicit FAQ denial.");
}
if (/governed[- ]agent|governance-ready|Maqam governs/iu.test(toolkit)) {
  errors.push("Agent memory stack page must keep Maqam optional and avoid governance-first product positioning.");
}
const siteCss = await readFile(path.join(output, "site.css"), "utf8");
if (!siteCss.includes(".toolkit-project-grid")
  || !siteCss.includes("@media (max-width: 720px)")
  || !siteCss.includes(".toolkit-tool-list article")) {
  errors.push("Agent memory stack page is missing its responsive layout contract.");
}
if (!faq.includes('"@type":"FAQPage"') || !faq.includes('"mainEntity"')) {
  errors.push("FAQ is missing answer-oriented structured data.");
}
if (!paper.includes('src="/assets/qarinah-flow.svg"')) {
  errors.push("Paper architecture image is not bound to the deployed asset.");
}
if (!paper.includes("/paper/Qarinah-Technical-White-Paper-v1.8.pdf")) {
  errors.push("Paper download does not point to the versioned website PDF.");
}
if (!paper.includes("https://doi.org/10.5281/zenodo.21850747")
  || !paper.includes("https://doi.org/10.5281/zenodo.21547684")
  || !paper.includes("https://doi.org/10.5281/zenodo.21843240")
  || !paper.includes('"creativeWorkStatus":"Published"')
  || !paper.includes('"datePublished":"2026-08-22"')) {
  errors.push("Paper page must bind current v1.8 to the paper series and preserve published v1.4/v1.3 DOIs.");
}
if (/activates on publication|not registered or published|DOI reserved|assigned only when this manuscript is deposited|assigned by Zenodo when v1\.4 is deposited|A version DOI is assigned/iu.test(paper)) {
  errors.push("Paper page contains stale pre-publication lifecycle wording.");
}
if (!paper.includes("View on GitHub") || paper.includes("Edit on GitHub")) {
  errors.push("Paper source action must read View on GitHub.");
}

if (errors.length > 0) {
  throw new Error(`Website verification failed:\n${errors.join("\n")}`);
}

console.log(`Verified ${htmlFiles.length} HTML pages, search, sitemap parity, JSON-LD, social metadata, crawler discovery, required assets, and internal routes.`);
