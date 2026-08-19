import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("competitor names remain confined to the explicit comparison surface", () => {
  const comparedSystems = [
    ["me", "m", "0"].join(""),
    ["gr", "aphi", "ti"].join(""),
    ["get", "zep"].join(""),
    ["ai", "der"].join("")
  ];
  const allowedPaths = new Set([
    "docs/MARKET-COMPARISON-2026.md",
    "scripts/build-site.mjs"
  ]);
  for (const value of comparedSystems) {
    const result = spawnSync("git", ["grep", "-I", "-n", "-i", "--fixed-strings", value, "--", "."], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || `Missing comparison reference: ${value}`);
    const paths = result.stdout.trim().split(/\r?\n/u).map((line) => line.split(":", 1)[0]);
    assert.ok(paths.length > 0, `Missing comparison reference: ${value}`);
    for (const relativePath of paths) {
      assert.ok(allowedPaths.has(relativePath), `Unexpected product-copy reference to ${value}: ${relativePath}`);
    }
  }
});

test("tracked dashboard text does not contain common UTF-8 mojibake sequences", () => {
  const corrupted = [
    String.fromCodePoint(0x00c2, 0x00b7),
    String.fromCodePoint(0x00e2, 0x20ac, 0x201d),
    String.fromCodePoint(0x00c3, 0x00a2)
  ];
  for (const value of corrupted) {
    const result = spawnSync("git", ["grep", "-I", "-n", "--fixed-strings", value, "--", "src/dashboard.js", "src/dashboard-server.js"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8"
    });
    assert.equal(result.status, 1, result.stdout || result.stderr || "Unexpected mojibake in a rendered dashboard literal.");
  }
});
