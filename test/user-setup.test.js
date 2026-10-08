import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { setupUser, readAutoInitPolicy } from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("user setup preserves existing config, backs up changes, and installs a self-contained cross-host runtime", async (t) => {
  const home = await temporaryDirectory(t);
  const previousState = process.env.QARINAH_STATE_DIR;
  process.env.QARINAH_STATE_DIR = path.join(home, "machine-state");
  t.after(() => {
    if (previousState === undefined) delete process.env.QARINAH_STATE_DIR;
    else process.env.QARINAH_STATE_DIR = previousState;
  });
  await mkdir(path.join(home, ".claude"));
  await mkdir(path.join(home, ".codex", "plugins", "cache", "qarinah", "qarinah", "0.6.0", ".codex-plugin"), { recursive: true });
  await writeFile(path.join(home, ".codex", "config.toml"), '[plugins."qarinah@qarinah"]\nenabled = true\n\n[plugins."unrelated@market"]\nenabled = true\n');
  await writeFile(path.join(home, ".codex", "plugins", "cache", "qarinah", "qarinah", "0.6.0", ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "qarinah", version: "0.6.0" }));
  await writeFile(path.join(home, ".claude", "settings.json"), JSON.stringify({
    permissions: { defaultMode: "plan" }, enabledPlugins: { "unrelated@market": true, "qarinah@qarinah": true },
    hooks: { Stop: [{ hooks: [{ type: "command", command: "existing-safe-hook" }] }] }
  }));
  await writeFile(path.join(home, ".claude.json"), JSON.stringify({ unrelatedFlag: true, mcpServers: { existing: { command: "existing" } } }));
  const result = await setupUser({
    home, targets: ["codex", "claude", "cursor", "antigravity", "opencode", "kilo"],
    capture: "content", fullChat: true,
    runtimeSource: path.join(repository, "integrations", "codex", "qarinah", "runtime", "qarinah.mjs")
  });
  assert.equal(result.ok, true);
  assert.ok(result.backups.length >= 2);
  const codexConfig = await readFile(path.join(home, ".codex", "config.toml"), "utf8");
  assert.match(codexConfig, /\[plugins\."qarinah@qarinah"\]\nenabled = false/u);
  assert.match(codexConfig, /\[plugins\."unrelated@market"\]\nenabled = true/u);
  assert.deepEqual(JSON.parse(await readFile(path.join(home, ".codex", "plugins", "cache", "qarinah", "qarinah", "0.6.0", ".codex-plugin", "plugin.json"), "utf8")),
    { name: "qarinah", version: "0.6.0" });
  assert.ok(codexConfig.includes("[mcp_servers.qarinah]"));
  const codexHooks = JSON.parse(await readFile(path.join(home, ".codex", "hooks.json"), "utf8"));
  assert.ok(codexHooks.hooks.SessionStart);
  assert.ok(result.targets.find((target) => target.host === "codex").requiresHookReview);
  const settings = JSON.parse(await readFile(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.permissions.defaultMode, "plan");
  assert.equal(settings.enabledPlugins["unrelated@market"], true);
  assert.equal(settings.enabledPlugins["qarinah@qarinah"], false);
  assert.equal(settings.hooks.Stop.length, 2);
  const claude = JSON.parse(await readFile(path.join(home, ".claude.json"), "utf8"));
  assert.equal(claude.unrelatedFlag, true);
  assert.equal(claude.mcpServers.existing.command, "existing");
  assert.ok(claude.mcpServers.qarinah.args.includes("--auto-init"));
  const cursor = JSON.parse(await readFile(path.join(home, ".cursor", "hooks.json"), "utf8"));
  assert.ok(cursor.hooks.afterAgentResponse);
  assert.equal(cursor.hooks.afterAgentThought, undefined);
  const anti = JSON.parse(await readFile(path.join(home, ".gemini", "config", "hooks.json"), "utf8"));
  assert.ok(anti["qarinah-project-memory"].PreInvocation);
  assert.ok(anti["qarinah-project-memory"].Stop);
  const plugin = await readFile(path.join(home, ".config", "opencode", "plugins", "qarinah.js"), "utf8");
  assert.ok(plugin.includes('shell: false'));
  assert.ok(plugin.includes('part.type === "text"'));
  assert.ok(plugin.includes('child.stdin.end(JSON.stringify'));
  assert.equal((await readAutoInitPolicy()).fullChat, true);
  const runtimeHelp = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [result.runtime, "help"], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(runtimeHelp.code, 0, runtimeHelp.stderr);
  assert.ok(runtimeHelp.stdout.includes("setup-user"));
  await setupUser({ home, targets: ["claude", "cursor"], capture: "content", fullChat: true,
    runtimeSource: path.join(repository, "integrations", "codex", "qarinah", "runtime", "qarinah.mjs") });
  const repeated = JSON.parse(await readFile(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.equal(repeated.hooks.Stop.length, 2);
});
