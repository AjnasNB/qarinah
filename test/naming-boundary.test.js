import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("competitor comparison names remain absent from public product surfaces", () => {
  const comparedSystems = [
    ["me", "m", "0"].join(""),
    ["gr", "aphi", "ti"].join(""),
    ["get", "zep"].join(""),
    ["ai", "der"].join("")
  ];
  for (const value of comparedSystems) {
    const result = spawnSync("git", ["grep", "-I", "-n", "-i", "--fixed-strings", value, "--", "."], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8"
    });
    assert.equal(result.status, 1, result.stdout || result.stderr || `Unexpected public comparison reference: ${value}`);
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
