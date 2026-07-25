import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const architecture = (await read("docs/architecture.mmd")).trim();
const architectureSvg = await read("assets/architecture/qarinah-flow.svg");
const architectureDigest = createHash("sha256").update(`${architecture}\n`, "utf8").digest("hex");
const committedDigest = (await read("assets/architecture/qarinah-flow.source.sha256")).trim();
const whitePaperSource = await read("docs/WHITEPAPER.md");
const whitePaperBuilder = await read("scripts/build-whitepaper-pdf.py");
const whitePaperPdf = await readFile(
  path.join(root, "output", "pdf", "Qarinah-Technical-White-Paper-v1.0.pdf")
);
const whitePaperPdfDigest = (
  await read("output/pdf/Qarinah-Technical-White-Paper-v1.0.source.sha256")
).trim();
const expectedWhitePaperDigest = createHash("sha256")
  .update(whitePaperSource, "utf8")
  .update("\0", "utf8")
  .update(whitePaperBuilder, "utf8")
  .digest("hex");

if (!/^flowchart T[BD]\b/u.test(architecture)) {
  throw new Error("docs/architecture.mmd must contain the canonical top-to-bottom Mermaid flowchart.");
}

if (committedDigest !== `${architectureDigest}  docs/architecture.mmd`) {
  throw new Error("The rendered architecture source digest is stale. Regenerate assets/architecture/qarinah-flow.svg.");
}
for (const label of ["Codex + Claude Code + CLI", "Hash-chained JSONL", "Small cited context pack"]) {
  if (!architectureSvg.includes(label)) throw new Error(`Rendered architecture image is missing ${label}.`);
}
if (/Â/u.test(architectureSvg)) {
  throw new Error("Rendered architecture image contains a likely text-encoding artifact.");
}
if (!whitePaperPdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
  throw new Error("The publication white paper is not a valid PDF artifact.");
}
if (whitePaperPdf.byteLength < 150_000) {
  throw new Error("The publication white paper is unexpectedly small.");
}
if (
  whitePaperPdfDigest
    !== `${expectedWhitePaperDigest}  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py`
) {
  throw new Error("The publication white paper is stale. Rebuild it with scripts/build-whitepaper-pdf.py.");
}
for (const relativePath of ["README.md", "docs/WHITEPAPER.md"]) {
  const markdown = await read(relativePath);
  if (!markdown.includes("output/pdf/Qarinah-Technical-White-Paper-v1.0.pdf")) {
    throw new Error(`${relativePath} does not link to the publication PDF.`);
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
