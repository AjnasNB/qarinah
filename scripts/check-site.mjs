import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
const required = [
  "index.html",
  "alternatives/index.html",
  "articles/open-source-governed-agent-toolkit/index.html",
  "docs/index.html",
  "docs/cross-agent-handoffs/index.html",
  "docs/getting-started/index.html",
  "docs/features/index.html",
  "docs/cli/index.html",
  "docs/api/index.html",
  "docs/integrations/index.html",
  "docs/mcp/index.html",
  "docs/team-memory/index.html",
  "docs/token-efficient-context/index.html",
  "docs/recipes/index.html",
  "docs/architecture/index.html",
  "docs/benchmarks/index.html",
  "docs/security/index.html",
  "docs/interoperability/index.html",
  "docs/troubleshooting/index.html",
  "docs/faq/index.html",
  "docs/migrations/index.html",
  "search/index.html",
  "search-index.json",
  "paper/index.html",
  "paper/Qarinah-Technical-White-Paper-v1.4.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.3.pdf",
  "paper/Qarinah-Technical-White-Paper-v1.2.pdf",
  "assets/qarinah-mark.svg",
  "assets/qarinah-flow.svg",
  "assets/qarinah-social-preview.png",
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
}

const searchIndex = JSON.parse(await readFile(path.join(output, "search-index.json"), "utf8"));
const indexedRoutes = new Set(searchIndex.map((entry) => entry.route));
for (const route of availableRoutes) {
  if (route.startsWith("/docs/") && route !== "/docs/" && !indexedRoutes.has(route)) {
    errors.push(`search-index.json is missing ${route}`);
  }
}
if (!indexedRoutes.has("/alternatives/")) {
  errors.push("search-index.json is missing /alternatives/");
}
if (!indexedRoutes.has("/articles/open-source-governed-agent-toolkit/")) {
  errors.push("search-index.json is missing /articles/open-source-governed-agent-toolkit/");
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
  "https://qarinah.io/alternatives/",
  "https://qarinah.io/articles/open-source-governed-agent-toolkit/",
  "https://www.npmjs.com/package/qarinah",
  "https://github.com/AjnasNB/qarinah",
  "https://doi.org/10.5281/zenodo.21547684"
]) {
  if (!llms.includes(canonicalResource)) errors.push(`llms.txt is missing ${canonicalResource}`);
}

const home = await readFile(path.join(output, "index.html"), "utf8");
const alternatives = await readFile(path.join(output, "alternatives", "index.html"), "utf8");
const toolkit = await readFile(path.join(output, "articles", "open-source-governed-agent-toolkit", "index.html"), "utf8");
const paper = await readFile(path.join(output, "paper", "index.html"), "utf8");
const faq = await readFile(path.join(output, "docs", "faq", "index.html"), "utf8");
const features = await readFile(path.join(output, "docs", "features", "index.html"), "utf8");
if (!home.includes("<strong>98.71%</strong>") || !home.includes("the evaluated full-history input was 77.81 times larger")) {
  errors.push("Homepage is missing the plain-language benchmark proof.");
}
for (const benchmarkProof of ["98.7148%", "98.75%", "89.05%", "Three outputs. Three exact measurements."]) {
  if (!home.includes(benchmarkProof)) errors.push(`Homepage benchmark ribbon is missing ${benchmarkProof}`);
}
if (!home.includes("What coding agents and developers need to know.") || !home.includes('href="/docs/faq/"')) {
  errors.push("Homepage is missing the direct answer-engine surface.");
}
if (!home.includes("Your project remembers when your coding agent changes.") || !home.includes("See the verified handoff") || !home.includes('href="/docs/cross-agent-handoffs/"')) {
  errors.push("Homepage is missing the verified cross-agent handoff workflow.");
}
if (home.indexOf('<section class="hero">') > home.indexOf('<section class="benchmark-ribbon"')) {
  errors.push("Homepage must lead with the centered product hero before benchmark detail.");
}
if (!home.includes("Evidence-linked project memory for coding agents.") || !home.includes("continue from verified context instead of starting from zero")) {
  errors.push("Homepage is missing the cross-agent category or long-term vision.");
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
  || !features.includes('"numberOfItems":11')) {
  errors.push("Features page is missing its visible capability collection structured data.");
}
for (const launchDirectoryMarkup of [
  'href="https://startupbase.io/products/qarinah?utm_source=startupbase&amp;utm_medium=badge&amp;utm_campaign=launch-badge-dark"',
  'src="https://statics.startupbase.io/site/badges/launched-on-sb-dark.svg"',
  'alt="Launched on StartupBase" height="55"',
  'href="https://fazier.com/launches/qarinah.io" target="_blank"',
  'src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&amp;theme=light"',
  'width="120" alt="Fazier badge"',
  'href="https://tinystartups.com/startup/qarinah"',
  "Tiny Startups"
]) {
  if (!home.includes(launchDirectoryMarkup)) {
    errors.push(`Homepage launch recognition is missing ${launchDirectoryMarkup}`);
  }
}
for (const requiredAlternative of [
  "Qarinah alternatives and coding-agent memory comparison",
  "Mem0",
  "Letta",
  "LangMem and LangGraph memory",
  "Graphiti and Zep",
  "GitHub Copilot Memory",
  "Claude Code memory",
  "Cursor Memories",
  "One category choice, not a universal winner",
  "It is not a performance ranking"
]) {
  if (!alternatives.includes(requiredAlternative)) {
    errors.push(`Alternatives page is missing ${requiredAlternative}`);
  }
}
if (!alternatives.includes('"@type":"ItemList"')
  || !alternatives.includes('"itemListOrder":"https://schema.org/ItemListUnordered"')
  || !alternatives.includes('"@type":"FAQPage"')) {
  errors.push("Alternatives page is missing unordered comparison or answer-oriented structured data.");
}
const alternativesClaimCopy = alternatives.replaceAll("Is Qarinah better than Mem0, Letta, LangMem, or Graphiti?", "");
if (/Qarinah is (?:the )?(?:best|only)|Qarinah (?:is )?better than|Qarinah outperforms?/iu.test(alternativesClaimCopy)) {
  errors.push("Alternatives page contains an unsupported superiority term.");
}
for (const requiredToolkitCopy of [
  "Governed agents need explicit layers.",
  "Written by <strong>Ajnas N B</strong>",
  "Qarinah",
  "Maqam",
  "Cockroach Browser",
  "Cockroach Crawler",
  "Cockroach Browser uses Playwright",
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
    errors.push(`Governed-agent toolkit page is missing ${requiredToolkitCopy}`);
  }
}
for (const schemaType of ['"@type":"Article"', '"@type":"ItemList"', '"@type":"FAQPage"', '"@type":"BreadcrumbList"']) {
  if (!toolkit.includes(schemaType)) errors.push(`Governed-agent toolkit page is missing ${schemaType}`);
}
if (!toolkit.includes('"numberOfItems":13')) {
  errors.push("Governed-agent toolkit ItemList must contain the four authored projects and nine established tools.");
}
const toolkitQuestionCopy = toolkit.replaceAll("Is this a best-tool ranking?", "");
if (/(?:Qarinah|Maqam|Cockroach Browser|Cockroach Crawler) (?:is|are) (?:the )?(?:best|first|only)|outperforms? every|universal winner/iu.test(toolkitQuestionCopy)) {
  errors.push("Governed-agent toolkit page contains a prohibited superiority term outside the explicit FAQ denial.");
}
const siteCss = await readFile(path.join(output, "site.css"), "utf8");
if (!siteCss.includes(".toolkit-project-grid")
  || !siteCss.includes("@media (max-width: 720px)")
  || !siteCss.includes(".toolkit-tool-list article")) {
  errors.push("Governed-agent toolkit page is missing its responsive layout contract.");
}
if (!faq.includes('"@type":"FAQPage"') || !faq.includes('"mainEntity"')) {
  errors.push("FAQ is missing answer-oriented structured data.");
}
if (!paper.includes('src="/assets/qarinah-flow.svg"')) {
  errors.push("Paper architecture image is not bound to the deployed asset.");
}
if (!paper.includes("/paper/Qarinah-Technical-White-Paper-v1.4.pdf")) {
  errors.push("Paper download does not point to the versioned website PDF.");
}
if (!paper.includes("https://doi.org/10.5281/zenodo.21850747")
  || !paper.includes("https://doi.org/10.5281/zenodo.21547684")
  || !paper.includes("https://doi.org/10.5281/zenodo.21843240")
  || !paper.includes('"creativeWorkStatus":"Published"')
  || !paper.includes('"datePublished":"2026-08-08"')) {
  errors.push("Paper page must bind published v1.4 to its version and series DOIs and preserve the published v1.3 DOI.");
}
if (/release[- ]candidate|activates on publication|not registered or published|DOI reserved|assigned only when this manuscript is deposited|assigned by Zenodo when v1\.4 is deposited|A version DOI is assigned/iu.test(paper)) {
  errors.push("Paper page contains stale pre-publication lifecycle wording.");
}
if (!paper.includes("View on GitHub") || paper.includes("Edit on GitHub")) {
  errors.push("Paper source action must read View on GitHub.");
}

if (errors.length > 0) {
  throw new Error(`Website verification failed:\n${errors.join("\n")}`);
}

console.log(`Verified ${htmlFiles.length} HTML pages, search, sitemap parity, JSON-LD, social metadata, crawler discovery, required assets, and internal routes.`);
