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
const historicalV13WhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.3.pdf")
);
const historicalV13WhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.3.source.sha256")
).trim();
const historicalV13WhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.3.pdf.sha256")
).trim();
const historicalV13WhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.3.build.json")
);
const historicalV14WhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.4.pdf")
);
const historicalV14WhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.4.source.sha256")
).trim();
const historicalV14WhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.4.pdf.sha256")
).trim();
const historicalV14WhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.4.build.json")
);
const historicalV15WhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.5.pdf")
);
const historicalV15WhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.5.source.sha256")
).trim();
const historicalV15WhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.5.pdf.sha256")
).trim();
const historicalV15WhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.5.build.json")
);
const historicalV16WhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.6.pdf")
);
const historicalV16WhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.6.source.sha256")
).trim();
const historicalV16WhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.6.pdf.sha256")
).trim();
const historicalV16WhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.6.build.json")
);
const historicalV17WhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.7.pdf")
);
const historicalV17WhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.7.source.sha256")
).trim();
const historicalV17WhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.7.pdf.sha256")
).trim();
const historicalV17WhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.7.build.json")
);
const currentWhitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.8.pdf")
);
const currentWhitePaperSourceReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.8.source.sha256")
).trim();
const currentWhitePaperPdfReceipt = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.8.pdf.sha256")
).trim();
const currentWhitePaperBuildMetadata = JSON.parse(
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.8.build.json")
);
const publishedWhitePaperSourceDigest = "7b76b3ed889b5939ef3fba2e7bf302b41fcf010ce6dfc2d8ab612145865d7756";
const publishedWhitePaperPdfDigest = "6b214e40697179bc9eca6544824b201926e901b4209fca642849d191906fb8cd";
const currentWhitePaperSourcePaths = [
  "docs/WHITEPAPER.md",
  "scripts/build-whitepaper-pdf.py",
  "scripts/build-whitepaper-pdf-v1.4.py",
  "scripts/build-whitepaper-pdf-v1.5.py",
  "scripts/build-whitepaper-pdf-v1.6.py",
  "scripts/build-whitepaper-pdf-v1.7.py",
  "scripts/build-whitepaper-pdf-v1.8.py"
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
if (!contributing.includes("python scripts/build-whitepaper-pdf-v1.8.py")
  || !contributing.includes("v1.3 through v1.7 remain immutable historical artifacts")
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
if (!historicalV13WhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  || historicalV13WhitePaperPdf.byteLength < 150_000
  || historicalV13WhitePaperSourceReceipt !== "1d058bd27537a2b716667decea0b50d4f521f500bafadec34275d41f6c323393  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py+scripts/build-whitepaper-pdf-v1.3.py"
  || historicalV13WhitePaperBuildMetadata.paperVersion !== "1.3"
  || historicalV13WhitePaperBuildMetadata.combinedSourceSha256 !== "sha256:1d058bd27537a2b716667decea0b50d4f521f500bafadec34275d41f6c323393"
  || historicalV13WhitePaperPdfReceipt !== `${createHash("sha256").update(historicalV13WhitePaperPdf).digest("hex")}  output/pdf/Qarinah-Technical-White-Paper-v1.3.pdf`) {
  throw new Error("The immutable v1.3 white-paper publication changed.");
}
if (!historicalV14WhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  || historicalV14WhitePaperPdf.byteLength < 150_000
  || historicalV14WhitePaperSourceReceipt !== "22dbb22e4ea54010553b6823c9b772d214ea624cc5abc40ca2e05fa93f89b3bd  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py+scripts/build-whitepaper-pdf-v1.4.py"
  || historicalV14WhitePaperBuildMetadata.paperVersion !== "1.4"
  || historicalV14WhitePaperBuildMetadata.combinedSourceSha256 !== "sha256:22dbb22e4ea54010553b6823c9b772d214ea624cc5abc40ca2e05fa93f89b3bd"
  || historicalV14WhitePaperPdfReceipt !== `${createHash("sha256").update(historicalV14WhitePaperPdf).digest("hex")}  output/pdf/Qarinah-Technical-White-Paper-v1.4.pdf`) {
  throw new Error("The immutable v1.4 white-paper publication changed.");
}
if (!historicalV15WhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  || historicalV15WhitePaperPdf.byteLength < 150_000
  || historicalV15WhitePaperSourceReceipt !== "108cbe323482c94e9c31a8829c6d81a4986f72a7f5815e4f902ff2fa66b92f2f  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py+scripts/build-whitepaper-pdf-v1.4.py+scripts/build-whitepaper-pdf-v1.5.py"
  || historicalV15WhitePaperBuildMetadata.paperVersion !== "1.5"
  || historicalV15WhitePaperBuildMetadata.combinedSourceSha256 !== "sha256:108cbe323482c94e9c31a8829c6d81a4986f72a7f5815e4f902ff2fa66b92f2f"
  || historicalV15WhitePaperPdfReceipt !== `${createHash("sha256").update(historicalV15WhitePaperPdf).digest("hex")}  output/pdf/Qarinah-Technical-White-Paper-v1.5.pdf`) {
  throw new Error("The immutable v1.5 white-paper artifact changed.");
}
if (!historicalV16WhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  || historicalV16WhitePaperPdf.byteLength < 150_000
  || historicalV16WhitePaperSourceReceipt !== "8456db9c4aa695a415a5f7304bf049505b3030f7c9943d2b7c103fa785021e50  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py+scripts/build-whitepaper-pdf-v1.4.py+scripts/build-whitepaper-pdf-v1.5.py+scripts/build-whitepaper-pdf-v1.6.py"
  || historicalV16WhitePaperBuildMetadata.paperVersion !== "1.6"
  || historicalV16WhitePaperBuildMetadata.combinedSourceSha256 !== "sha256:8456db9c4aa695a415a5f7304bf049505b3030f7c9943d2b7c103fa785021e50"
  || historicalV16WhitePaperPdfReceipt !== `${createHash("sha256").update(historicalV16WhitePaperPdf).digest("hex")}  output/pdf/Qarinah-Technical-White-Paper-v1.6.pdf`) {
  throw new Error("The immutable v1.6 white-paper artifact changed.");
}
if (!historicalV17WhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  || historicalV17WhitePaperPdf.byteLength < 150_000
  || historicalV17WhitePaperSourceReceipt !== "77d96285267968c3bb2e7633b6ed9b8e617514ace05cd743ce164ad1496b13bb  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py+scripts/build-whitepaper-pdf-v1.4.py+scripts/build-whitepaper-pdf-v1.5.py+scripts/build-whitepaper-pdf-v1.6.py+scripts/build-whitepaper-pdf-v1.7.py"
  || historicalV17WhitePaperBuildMetadata.paperVersion !== "1.7"
  || historicalV17WhitePaperBuildMetadata.combinedSourceSha256 !== "sha256:77d96285267968c3bb2e7633b6ed9b8e617514ace05cd743ce164ad1496b13bb"
  || historicalV17WhitePaperPdfReceipt !== `${createHash("sha256").update(historicalV17WhitePaperPdf).digest("hex")}  output/pdf/Qarinah-Technical-White-Paper-v1.7.pdf`) {
  throw new Error("The immutable v1.7 white-paper artifact changed.");
}
if (!currentWhitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii")) || currentWhitePaperPdf.byteLength < 150_000) {
  throw new Error("The v1.8 white paper is not a valid PDF artifact.");
}
const currentWhitePaperSourceHash = createHash("sha256");
for (const [index, sourceBytes] of currentWhitePaperSourceBytes.entries()) {
  if (index) currentWhitePaperSourceHash.update(Buffer.from([0]));
  currentWhitePaperSourceHash.update(sourceBytes);
}
const currentWhitePaperSourceDigest = currentWhitePaperSourceHash.digest("hex");
if (currentWhitePaperSourceReceipt !== `${currentWhitePaperSourceDigest}  ${currentWhitePaperSourcePaths.join("+")}`) {
  throw new Error("The v1.8 white-paper source receipt is stale.");
}
if (currentWhitePaperBuildMetadata.schemaVersion !== "qarinah.white-paper-build.v1"
  || currentWhitePaperBuildMetadata.paperVersion !== "1.8"
  || currentWhitePaperBuildMetadata.combinedSourceSha256 !== `sha256:${currentWhitePaperSourceDigest}`
  || currentWhitePaperBuildMetadata.generator?.command !== "python scripts/build-whitepaper-pdf-v1.8.py"
  || !currentWhitePaperBuildMetadata.generator?.pythonImplementation
  || !currentWhitePaperBuildMetadata.generator?.pythonVersion
  || !currentWhitePaperBuildMetadata.generator?.reportlabVersion
  || !currentWhitePaperBuildMetadata.generator?.platform
  || currentWhitePaperBuildMetadata.generator?.fonts?.length !== 4) {
  throw new Error("The v1.8 white-paper build metadata is incomplete or stale.");
}
for (const [index, relativePath] of currentWhitePaperSourcePaths.entries()) {
  const recorded = currentWhitePaperBuildMetadata.sources?.[index];
  const digest = createHash("sha256").update(currentWhitePaperSourceBytes[index]).digest("hex");
  if (recorded?.path !== relativePath || recorded?.sha256 !== `sha256:${digest}`) {
    throw new Error(`The v1.8 build metadata does not bind ${relativePath}.`);
  }
}
const currentWhitePaperPdfDigest = createHash("sha256").update(currentWhitePaperPdf).digest("hex");
if (currentWhitePaperPdfReceipt !== `${currentWhitePaperPdfDigest}  output/pdf/Qarinah-Technical-White-Paper-v1.8.pdf`) {
  throw new Error("The v1.8 white-paper PDF receipt is stale.");
}
if (!whitePaperSource.includes("**Paper version:** 1.8")
  || !whitePaperSource.includes("**Implementation:** Qarinah `0.6.0`")
  || !whitePaperSource.includes("10 / 10 public-checkout memory scenarios")
  || !whitePaperSource.includes("12 / 12 proof-carrying task-context scenarios")
  || !whitePaperSource.includes("Acceptance scenarios passed | 16 / 16")
  || !whitePaperSource.includes("Acceptance scenarios passed | 12 / 12")
  || !whitePaperSource.includes("Second-snapshot source bytes verified and restored exactly | 390,226")
  || !whitePaperSource.includes("not generated-code quality or cross-product superiority")
  || !whitePaperSource.includes("[10.5281/zenodo.21850747](https://doi.org/10.5281/zenodo.21850747)")
  || !whitePaperSource.includes("[10.5281/zenodo.21547684](https://doi.org/10.5281/zenodo.21547684)")) {
  throw new Error("The v1.8 source must disclose its version, implementation, proof/public/deep-memory/worktree evidence boundaries, and historical/concept DOIs.");
}
for (const [relativePath, paperPath] of [
  ["README.md", "output/pdf/Qarinah-Technical-White-Paper-v1.8.pdf"],
  ["docs/WHITEPAPER.md", "output/pdf/Qarinah-Technical-White-Paper-v1.8.pdf"]
]) {
  const markdown = await read(relativePath);
  if (!markdown.includes(paperPath)) throw new Error(`${relativePath} does not link to the v1.8 PDF.`);
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

const currentReleaseDocRequirements = new Map([
  ["docs/API-REFERENCE.md", ["version 0.6.0", "| `QARINAH_VERSION` | `\"0.6.0\"` |"]],
  ["docs/FAQ.md", ["Qarinah 0.6.0 supports", "multifile-context-0.6.0.json"]],
  ["docs/HOST-COMPATIBILITY.md", ["The 0.6.0 installer"]],
  ["docs/HOST-INTEGRATIONS.md", ["--ref v0.6.0", "qarinah@v0.6.0"]],
  ["docs/MCP-GUIDE.md", ["Qarinah 0.6.0 includes", "qarinah@0.6.0"]],
  ["docs/TOKEN-EFFICIENT-CONTEXT.md", ["--ref v0.6.0", "qarinah@v0.6.0"]],
  ["docs/RECIPES.md", ["--ref v0.6.0", "qarinah@v0.6.0"]],
  ["docs/BENCHMARKS.md", ["deep-memory-platform-v0.6.0.json", "0.6.0 machine-readable result", "multifile-context-0.6.0.json"]],
  ["docs/PUBLIC-METRICS.md", ["deep-memory-platform-v0.6.0.json", "multifile-context-0.6.0.json"]]
]);
for (const [relativePath, requiredSnippets] of currentReleaseDocRequirements) {
  const markdown = await read(relativePath);
  for (const snippet of requiredSnippets) {
    if (!markdown.includes(snippet)) throw new Error(`${relativePath} is missing current release documentation: ${snippet}`);
  }
}

console.log("Documentation diagrams, encoding, and local links are valid.");
