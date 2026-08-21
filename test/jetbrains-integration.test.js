import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateUrl = new URL("../integrations/jetbrains/qarinah-lsp/template.json", import.meta.url);
const readmeUrl = new URL("../integrations/jetbrains/qarinah-lsp/README.md", import.meta.url);

test("JetBrains template starts only the project-local Qarinah LSP and maps every supported document language", async () => {
  const template = JSON.parse(await readFile(templateUrl, "utf8"));
  assert.equal(template.id, "qarinah-lsp");
  assert.match(template.programArgs.default, /^sh -c /u);
  assert.match(template.programArgs.default, /\$PROJECT_DIR\$\/node_modules\/\.bin\/qarinah-lsp/u);
  assert.match(template.programArgs.windows, /^cmd \/d \/s \/c /u);
  assert.match(template.programArgs.windows, /\$PROJECT_DIR\$\\node_modules\\\.bin\\qarinah-lsp\.cmd/u);
  assert.doesNotMatch(JSON.stringify(template.programArgs), /https?:|npx|npm install|curl|wget/iu);

  const patterns = new Set(template.fileTypeMappings.flatMap((mapping) => mapping.fileType.patterns ?? []));
  for (const pattern of ["*.js", "*.jsx", "*.ts", "*.tsx", "*.py", "*.go", "*.rs", "*.java", "*.kt", "*.c", "*.cpp", "*.cs"]) {
    assert.equal(patterns.has(pattern), true, `${pattern} must be mapped`);
  }
  assert.equal(new Set(template.fileTypeMappings.map((mapping) => mapping.languageId)).size, 12);
});

test("JetBrains instructions state the exact interoperability boundary", async () => {
  const readme = await readFile(readmeUrl, "utf8");
  assert.match(readme, /standards-based language-server integration, not a native JetBrains plugin/u);
  assert.match(readme, /does not silently read IDE history/u);
  assert.match(readme, /LSP4IJ custom template/u);
});
