import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  installHostIntegration,
  previewHostInstall,
  uninstallHostIntegration
} from "../src/index.js";
import { temporaryDirectory } from "../test-support/helpers.js";

test("host install preview is exact, bounded, and read-only", async (t) => {
  const root = await temporaryDirectory(t);
  const preview = await previewHostInstall({ cwd: root, host: "antigravity", scope: "project" });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.host, "antigravity");
  assert.equal(preview.scope, "project");
  assert.match(preview.binary.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(preview.files.map((entry) => entry.path), [
    ".agents/plugins/qarinah/plugin.json",
    ".agents/plugins/qarinah/mcp_config.json",
    ".agents/plugins/qarinah/rules/qarinah.md"
  ]);
  await assert.rejects(access(path.join(root, ".qarinah")), /ENOENT/u);
});

test("project installer preserves unrelated Claude configuration and uninstalls only recorded bytes", async (t) => {
  const root = await temporaryDirectory(t);
  await mkdir(path.join(root, ".claude"));
  await writeFile(path.join(root, ".mcp.json"), `${JSON.stringify({
    mcpServers: { custom: { command: "custom-server", args: ["serve"] } },
    retained: true
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, ".claude", "settings.json"), `${JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: "custom-hook", timeout: 3 }] }]
    },
    retained: true
  }, null, 2)}\n`, "utf8");

  const installed = await installHostIntegration({ cwd: root, host: "claude", scope: "project", autoCompact: true });
  assert.equal(installed.host, "claude");
  const manifest = JSON.parse(await readFile(path.join(root, installed.installManifest), "utf8"));
  assert.equal(manifest.schemaVersion, "qarinah.host-install-manifest.v1");
  assert.equal(manifest.files.length, 5);
  assert.ok(manifest.files.every((entry) => /^sha256:[a-f0-9]{64}$/u.test(entry.installed.digest)));
  const configured = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  assert.equal(configured.mcpServers.custom.command, "custom-server");
  assert.equal(configured.mcpServers.qarinah.type, "stdio");

  const removed = await uninstallHostIntegration({ cwd: root, host: "claude", scope: "project" });
  assert.equal(removed.ok, true);
  const finalMcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  assert.deepEqual(finalMcp, {
    mcpServers: { custom: { command: "custom-server", args: ["serve"] } },
    retained: true
  });
  const finalSettings = JSON.parse(await readFile(path.join(root, ".claude", "settings.json"), "utf8"));
  assert.equal(finalSettings.retained, true);
  assert.equal(finalSettings.hooks.SessionStart[0].hooks[0].command, "custom-hook");
  assert.equal(Object.values(finalSettings.hooks).flatMap((entries) => entries).flatMap((entry) => entry.hooks)
    .some((hook) => hook.command.includes("qarinah.js")), false);
  await assert.rejects(access(path.join(root, ".claude", "skills", "qarinah", "SKILL.md")), /ENOENT/u);
  await assert.rejects(access(path.join(root, installed.installManifest)), /ENOENT/u);
});

test("uninstall refuses a locally changed exact integration file", async (t) => {
  const root = await temporaryDirectory(t);
  const installed = await installHostIntegration({ cwd: root, host: "freebuff", scope: "project" });
  const agentPath = path.join(root, ".agents", "qarinah-memory.ts");
  await writeFile(agentPath, `${await readFile(agentPath, "utf8")}\n// user change\n`, "utf8");
  await assert.rejects(
    uninstallHostIntegration({ cwd: root, host: "freebuff", scope: "project" }),
    (error) => error?.code === "UNINSTALL_FILE_CHANGED"
  );
  assert.match(await readFile(agentPath, "utf8"), /user change/u);
  assert.equal(typeof (await readFile(path.join(root, installed.installManifest), "utf8")), "string");
});
