import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const packageJson = JSON.parse(await read("package.json"));
const serverManifest = JSON.parse(await read("server.json"));
const runtimeVersion = await read("src/version.js");
const typeDeclarations = await read("types/index.d.ts");
const llmsFullSource = await read("website/static/llms-full.txt");
const contributing = await read("CONTRIBUTING.md");
const architecture = (await read("docs/architecture.mmd")).trim();
const architectureSvg = await read("assets/architecture/qarinah-flow.svg");
const architectureDigest = createHash("sha256").update(`${architecture}\n`, "utf8").digest("hex");
const committedDigest = (await read("assets/architecture/qarinah-flow.source.sha256")).trim();
const whitePaperSource = await read("docs/WHITEPAPER.md");
const publishedWhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.2.pdf")
);
const publishedWhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.2.source.sha256")
).trim();
const currentWhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.3.pdf")
);
const currentWhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.3.source.sha256")
).trim();
const currentWhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.3.pdf.sha256")
).trim();
const currentWhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.3.build.json")
);
const publishedWhitePaperSourceDigest = "7b76b3ed889b5939ef3fba2e7bf302b41fcf010ce6dfc2d8ab612145865d7756";
const publishedWhitePaperPdfDigest = "6b214e40697179bc9eca6544824b201926e901b4209fca642849d191906fb8cd";
const currentWhitePaperSourcePaths = [
  "docs/WHITEPAPER.md",
  "scripts/build-whitepaper-pdf.py",
  "scripts/build-whitepaper-pdf-v1.3.py"
];
const currentWhitePaperSourceBytes = await Promise.all(
  currentWhitePaperSourcePaths.map((relativePath) => readFile(path.join(root, relativePath)))
);

const escapedVersion = packageJson.version.replaceAll(".", "\\.");
if (!new RegExp(`QARINAH_VERSION\\s*=\\s*["']${escapedVersion}["']`, "u").test(runtimeVersion)) {
  throw new Error("src/version.js must match package.json.");
}
if (!new RegExp(`QARINAH_VERSION:\\s*["']${escapedVersion}["']`, "u").test(typeDeclarations)) {
  throw new Error("types/index.d.ts must match package.json.");
}
if (serverManifest.version !== packageJson.version || serverManifest.packages?.[0]?.version !== packageJson.version) {
  throw new Error("server.json package and server versions must match package.json.");
}
if (!llmsFullSource.includes(`Current release: \`${packageJson.version}\``)) {
  throw new Error("website/static/llms-full.txt must match package.json.");
}
if (packageJson.scripts?.["build:whitepaper"] !== undefined
  || packageJson.files.some((entry) => entry.includes("build-whitepaper-pdf"))) {
  throw new Error("White-paper generation must remain a source-checkout workflow, not a public npm-package contract.");
}
if (!contributing.includes("python scripts/build-whitepaper-pdf-v1.3.py")
  || !contributing.includes("intentionally excluded from the npm tarball")) {
  throw new Error("CONTRIBUTING.md must document the repository-only white-paper build contract.");
}

if (!/^flowchart T[BD]\b/u.test(architecture)) {
  throw new Error("docs/architecture.mmd must contain the canonical top-to-bottom Mermaid flowchart.");
}

if (committedDigest !== `${architectureDigest}  docs/architecture.mmd`) {
  throw new Error("The rendered architecture source digest is stale. Regenerate assets/architecture/qarinah-flow.svg.");
}
for (const label of ["Codex / Claude Code / Cursor", "Hash-chained JSONL ledger", "SQLite WAL + FTS5", "Maqam policy", "Small cited context pack"]) {
  if (!architectureSvg.includes(label)) throw new Error(`Rendered architecture image is missing ${label}.`);
}
if (/Â/u.test(architectureSvg)) {
  throw new Error("Rendered architecture image contains a likely text-encoding artifact.");
}
if (!publishedWhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
  throw new Error("The immutable v1.2 publication is not a valid PDF artifact.");
}
if (publishedWhitePaperPdf.byteLength < 150_000) {
  throw new Error("The immutable v1.2 publication is unexpectedly small.");
}
if (publishedWhitePaperSourceReceipt !== `${publishedWhitePaperSourceDigest}  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py`) {
  throw new Error("The immutable v1.2 publication source receipt changed.");
}
if (createHash("sha256").update(publishedWhitePaperPdf).digest("hex") !== publishedWhitePaperPdfDigest) {
  throw new Error("The immutable v1.2 publication PDF changed.");
}
if (!currentWhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii")) || currentWhitePaperPdf.byteLength < 150_000) {
  throw new Error("The v1.3 white paper is not a valid PDF artifact.");
}
const currentWhitePaperSourceHash = createHash("sha256");
for (const [index, sourceBytes] of currentWhitePaperSourceBytes.entries()) {
  if (index) currentWhitePaperSourceHash.update(Buffer.from([0]));
  currentWhitePaperSourceHash.update(sourceBytes);
}
const currentWhitePaperSourceDigest = currentWhitePaperSourceHash.digest("hex");
if (currentWhitePaperSourceReceipt !== `${currentWhitePaperSourceDigest}  ${currentWhitePaperSourcePaths.join("+")}`) {
  throw new Error("The v1.3 white-paper source receipt is stale.");
}
if (currentWhitePaperBuildMetadata.schemaVersion !== "qarinah.white-paper-build.v1"
  || currentWhitePaperBuildMetadata.paperVersion !== "1.3"
  || currentWhitePaperBuildMetadata.combinedSourceSha256 !== `sha256:${currentWhitePaperSourceDigest}`
  || currentWhitePaperBuildMetadata.generator?.command !== "python scripts/build-whitepaper-pdf-v1.3.py"
  || !currentWhitePaperBuildMetadata.generator?.pythonImplementation
  || !currentWhitePaperBuildMetadata.generator?.pythonVersion
  || !currentWhitePaperBuildMetadata.generator?.reportlabVersion
  || !currentWhitePaperBuildMetadata.generator?.platform
  || currentWhitePaperBuildMetadata.generator?.fonts?.length !== 4) {
  throw new Error("The v1.3 white-paper build metadata is incomplete or stale.");
}
for (const [index, relativePath] of currentWhitePaperSourcePaths.entries()) {
  const recorded = currentWhitePaperBuildMetadata.sources?.[index];
  const digest = createHash("sha256").update(currentWhitePaperSourceBytes[index]).digest("hex");
  if (recorded?.path !== relativePath || recorded?.sha256 !== `sha256:${digest}`) {
    throw new Error(`The v1.3 build metadata does not bind ${relativePath}.`);
  }
}
const currentWhitePaperPdfDigest = createHash("sha256").update(currentWhitePaperPdf).digest("hex");
if (currentWhitePaperPdfReceipt !== `${currentWhitePaperPdfDigest}  output/pdf/Qarinah-Technical-White-Paper-v1.3.pdf`) {
  throw new Error("The v1.3 white-paper PDF receipt is stale.");
}
if (!whitePaperSource.includes("**Paper version:** 1.3")
  || !whitePaperSource.includes("**Implementation:** Qarinah `0.1.6`")
  || !whitePaperSource.includes("development-v0.4")
  || !whitePaperSource.includes("[10.5281/zenodo.21843240](https://doi.org/10.5281/zenodo.21843240)")
  || !whitePaperSource.includes("[10.5281/zenodo.21547684](https://doi.org/10.5281/zenodo.21547684)")) {
  throw new Error("The v1.3 source must disclose its version, implementation, v0.4 evidence, and version/concept DOIs.");
}
for (const relativePath of ["README.md", "docs/WHITEPAPER.md"]) {
  const markdown = await read(relativePath);
  if (!markdown.includes("output/pdf/Qarinah-Technical-White-Paper-v1.3.pdf")) {
    throw new Error(`${relativePath} does not link to the v1.3 PDF.`);
  }
}

for (const [relativePath, imagePath] of [
  ["README.md", "assets/architecture/qarinah-flow.svg"],
  ["docs/ARCHITECTURE.md", "../assets/architecture/qarinah-flow.svg"]
]) {
  const markdown = await read(relativePath);
  if (!markdown.includes(`src="${imagePath}"`)) {
    throw new Error(`${relativePath} does not embed the rendered architecture image.`);
  }
}

const publicMarkdown = ["README.md"];
for (const name of await readdir(path.join(root, "docs"))) {
  if (name.endsWith(".md")) publicMarkdown.push(path.posix.join("docs", name));
}

for (const relativePath of publicMarkdown) {
  const markdown = await read(relativePath);
  if (/[ÂÃ�]/u.test(markdown)) {
    throw new Error(`${relativePath} contains a likely text-encoding artifact.`);
  }

  const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const target of links) {
    if (/^(?:https?:\/\/|mailto:|#|<)/u.test(target)) continue;
    const localTarget = target.split("#", 1)[0];
    if (!localTarget) continue;
    await access(path.resolve(path.dirname(path.join(root, relativePath)), localTarget)).catch(() => {
      throw new Error(`${relativePath} links to missing local target ${target}.`);
    });
  }
}

console.log("Documentation diagrams, encoding, and local links are valid.");
