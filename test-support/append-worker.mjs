import { appendEvent } from "../src/index.js";

const workerId = process.argv[2];
const count = Number(process.argv[3]);
for (let index = 0; index < count; index += 1) {
  await appendEvent({
    kind: "tool.completed",
    actor: { type: "agent", id: `worker-${workerId}` },
    title: `Worker ${workerId} event ${index}`,
    body: "Multi-process append fixture.",
    data: { workerId, index },
    confidence: "extracted",
    relations: [],
    provenance: { adapter: "test-worker", sourceId: `${workerId}:${index}` },
    retention: { class: "project", expiresAt: null }
  }, { cwd: process.cwd() });
}
