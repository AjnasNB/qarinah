import {
  ApprovalQueue,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway
} from "maqam";
import { registerMaqamContextAdapters } from "qarinah";

const approvalQueue = new ApprovalQueue();
const gateway = new ToolGateway({
  approvalQueue,
  evidenceLedger: new EvidenceLedger(),
  policyEngine: new PolicyEngine({
    allowedTools: ["context.query", "context.append"],
    approvalRequiredEffects: ["write"]
  })
});

registerMaqamContextAdapters({
  gateway,
  cwd: process.cwd(),
  maxChars: 20_000,
  maxItems: 20
});

const result = await gateway.call("context.query", { query: "governed release" }, {
  runId: "run_context_example",
  taskId: "query"
});
console.log(JSON.stringify(result, null, 2));
