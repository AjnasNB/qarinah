import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESULT_PATH,
  executeV2Evaluation,
  verifyBindingsOnly
} from "./context-efficiency-v2-lib.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedArguments = new Set(["--binding-only", "--execute", "--write"]);
for (const argument of process.argv.slice(2)) {
  assert.ok(allowedArguments.has(argument), `Unknown context-efficiency v2 argument: ${argument}`);
}

const execute = process.argv.includes("--execute");
const bindingOnly = process.argv.includes("--binding-only") || !execute;
const write = process.argv.includes("--write");

assert.equal(bindingOnly && execute, false, "--binding-only and --execute are mutually exclusive.");
assert.equal(write && !execute, false, "--write requires the explicit --execute flag.");

if (bindingOnly) {
  const report = await verifyBindingsOnly(repositoryRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const result = await executeV2Evaluation(repositoryRoot);
  const absoluteResultPath = path.join(repositoryRoot, ...RESULT_PATH.split("/"));
  if (write) {
    await writeFile(absoluteResultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  } else {
    try {
      const committed = JSON.parse(await readFile(absoluteResultPath, "utf8"));
      assert.deepEqual(committed, result, "Context-efficiency v2 result no longer matches its versioned artifact.");
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error("No v2 result exists. Use --execute --write only after independent evaluator review and explicit run authorization.");
      }
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
