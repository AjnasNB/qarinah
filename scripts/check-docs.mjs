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
