import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function temporaryDirectory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qarinah-test-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

export function eventInput(overrides = {}) {
  return {
    kind: "decision",
    actor: { type: "human", id: "test-user" },
    title: "Keep context writes governed",
    body: "Maqam must authorize durable context writes.",
    data: { component: "maqam" },
    confidence: "claimed",
    relations: [],
    provenance: { adapter: "test", sourceId: "fixture" },
    retention: { class: "project", expiresAt: null },
    ...overrides
  };
}
