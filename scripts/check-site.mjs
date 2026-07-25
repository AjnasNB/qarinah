import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
const required = [
  "index.html",
  "docs/index.html",
  "docs/getting-started/index.html",
  "docs/integrations/index.html",
  "docs/architecture/index.html",
  "docs/benchmarks/index.html",
  "docs/security/index.html",
  "docs/interoperability/index.html",
  "paper/index.html",
  "paper/Qarinah-Technical-White-Paper-v1.0.pdf",
  "assets/qarinah-mark.svg",
  "assets/qarinah-flow.svg",
  "site.css",
  "site.js",
  "primer.css",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml"
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
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  if (html.includes("—") || html.includes("–")) {
    errors.push(`${path.relative(root, file)} contains a long dash`);
  }
  if (!html.includes("<meta name=\"description\"")) {
    errors.push(`${path.relative(root, file)} is missing a description`);
  }
  for (const match of html.matchAll(/href="(\/[^"#?]*\/)(?:#[^"]*)?"/g)) {
    const route = match[1];
    if (!availableRoutes.has(route) && !route.startsWith("/assets/") && !route.startsWith("/paper/Qarinah-")) {
      errors.push(`${path.relative(root, file)} links to missing route ${route}`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Website verification failed:\n${errors.join("\n")}`);
}

const home = await readFile(path.join(output, "index.html"), "utf8");
const paper = await readFile(path.join(output, "paper", "index.html"), "utf8");
if (!home.includes("<strong>98.71%</strong>") || !home.includes("the full project history was 77.81 times larger")) {
  throw new Error("Homepage is missing the plain-language benchmark proof.");
}
if (!paper.includes('src="/assets/qarinah-flow.svg"')) {
  throw new Error("Paper architecture image is not bound to the deployed asset.");
}
if (!paper.includes("https://zenodo.org/records/21547685/files/Qarinah-Technical-White-Paper-v1.0.pdf?download=1")) {
  throw new Error("Paper download does not point to the permanent Zenodo record.");
}
if (!paper.includes("View on GitHub") || paper.includes("Edit on GitHub")) {
  throw new Error("Paper source action must read View on GitHub.");
}

console.log(`Verified ${htmlFiles.length} HTML pages, required assets, internal routes, metadata, and visible dash policy.`);
