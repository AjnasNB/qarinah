import { AgentRuntime, FileRunStore } from "ajnas-runtime";
import { createProductLoopProvenanceSink } from "qarinah";

const runtime = new AgentRuntime({
  provenance: createProductLoopProvenanceSink({ cwd: process.cwd() }),
  store: new FileRunStore({ directory: ".productloop-runs" })
});

const result = await runtime.run({
  name: "document-release",
  steps: [{ id: "prepare", run: async () => ({ ready: true }) }]
});
console.log(result.runId, result.status);
