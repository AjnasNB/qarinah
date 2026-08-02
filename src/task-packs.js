import { compileContext } from "./compiler.js";

export const TASK_MEMORY_PACKS = Object.freeze({
  debugging: Object.freeze({
    label: "Debugging",
    focus: "failure error reproduction regression logs traces recent changes",
    minimumCoverage: "partial"
  }),
  "code-review": Object.freeze({
    label: "Code review",
    focus: "design decision changed files policy security tests approval",
    minimumCoverage: "partial"
  }),
  "feature-implementation": Object.freeze({
    label: "Feature implementation",
    focus: "requirements architecture decision affected files interfaces tests",
    minimumCoverage: "partial"
  }),
  "database-migration": Object.freeze({
    label: "Database migration",
    focus: "schema migration rollback compatibility data integrity approval",
    minimumCoverage: "partial"
  }),
  "incident-response": Object.freeze({
    label: "Incident response",
    focus: "incident impact timeline mitigation evidence owner rollback",
    minimumCoverage: "partial"
  }),
  "release-preparation": Object.freeze({
    label: "Release preparation",
    focus: "release version checks approval migration documentation rollback",
    minimumCoverage: "partial"
  }),
  "security-review": Object.freeze({
    label: "Security review",
    focus: "threat boundary credential authorization policy dependency vulnerability evidence",
    minimumCoverage: "partial"
  })
});

export async function compileTaskMemoryPack(task, query = "", options = {}) {
  const profile = TASK_MEMORY_PACKS[task];
  if (!profile) {
    throw new TypeError(`task must be one of: ${Object.keys(TASK_MEMORY_PACKS).join(", ")}.`);
  }
  if (typeof query !== "string" || query.length > 4_096) {
    throw new TypeError("query must be a string up to 4096 characters.");
  }
  const focusedQuery = [query.trim(), profile.focus].filter(Boolean).join(" ");
  const pack = await compileContext(focusedQuery, {
    ...options,
    minimumCoverage: options.minimumCoverage ?? profile.minimumCoverage
  });
  return Object.freeze({
    schemaVersion: "qarinah.task-memory-pack.v1",
    task,
    label: profile.label,
    requestedQuery: query,
    pack
  });
}
