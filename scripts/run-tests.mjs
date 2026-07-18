import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "qarinah-test-state-"));
try {
  const child = spawn(process.execPath, ["--test"], {
    cwd: process.cwd(),
    env: { ...process.env, QARINAH_STATE_DIR: stateDirectory },
    stdio: "inherit",
    shell: false
  });
  const result = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  if (result.signal) throw new Error(`Test runner exited after signal ${result.signal}.`);
  process.exitCode = result.code ?? 1;
} finally {
  await rm(stateDirectory, { recursive: true, force: true });
}
