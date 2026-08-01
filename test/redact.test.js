import assert from "node:assert/strict";
import test from "node:test";
import { redactText } from "../src/redact.js";

test("private-key redaction handles complete and truncated PEM values", () => {
  assert.equal(
    redactText([
      "before",
      "-----BEGIN RSA PRIVATE KEY-----",
      "rsa-secret",
      "-----END RSA PRIVATE KEY-----",
      "between",
      "-----BEGIN PRIVATE KEY-----",
      "pkcs8-secret",
      "-----END PRIVATE KEY-----",
      "after"
    ].join("\n")),
    ["before", "[REDACTED]", "between", "[REDACTED]", "after"].join("\n")
  );
  assert.equal(
    redactText("before\n-----BEGIN EC PRIVATE KEY-----\ntruncated-secret"),
    "before\n[REDACTED]"
  );
  assert.equal(
    redactText("-----BEGIN PUBLIC KEY-----\npublic-material\n-----END PUBLIC KEY-----"),
    "-----BEGIN PUBLIC KEY-----\npublic-material\n-----END PUBLIC KEY-----"
  );
});

test("private-key redaction remains bounded for repeated unterminated headers", () => {
  const repeatedHeaders = "-----BEGIN PRIVATE KEY-----".repeat(2_048);
  assert.equal(redactText(`safe-prefix:${repeatedHeaders}`), "safe-prefix:[REDACTED]");
});
