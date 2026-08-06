# Cross-agent handoff video protocol

This protocol produces a truthful demonstration of Qarinah's portable project memory in both directions:

```text
Claude Code -> Qarinah -> Codex
Codex -> Qarinah -> Claude Code
```

A recording is a product demonstration, not statistical research evidence. Keep the machine-readable run record beside the video so every displayed claim can be checked later.

## 1. Freeze the exact build

Before recording, show and save:

```powershell
git status --short
git rev-parse HEAD
node --version
node .\bin\qarinah.js --version
claude --version
codex --version
```

Use a dedicated demo repository with no credentials, customer data, or unrelated private history. Start from a named commit and record that commit in the run manifest.

## 2. Enable the shared workspace once

From the demo repository, use the reviewed local Qarinah build:

```powershell
node "D:\skill box\qarinah\bin\qarinah.js" setup . --codex --claude --capture content --allow-query
node "D:\skill box\qarinah\bin\qarinah.js" policy
node "D:\skill box\qarinah\bin\qarinah.js" doctor
```

Content capture is required for a meaningful handoff and must be an explicit choice. The setup binds the consent-gated MCP query permit to this exact workspace and policy hash. Restart both hosts after setup so they load the project integrations.

## 3. Phase A: first agent

Give Agent A a real, bounded task that cannot be completed by a trivial edit. A good demonstration includes diagnosis, a rejected alternative, one partial implementation, and a test result.

Before switching, visibly verify:

- the diagnosed root cause;
- the constraint that must survive the handoff;
- the rejected alternative and why it was rejected;
- changed files;
- test or diagnostic output;
- unfinished work; and
- the Qarinah event IDs and hashes for the retained evidence.

Use host capture where available and explicitly record any consequential decision the host does not expose. Do not record hidden reasoning, complete transcripts, credentials, or unrelated tool output.

Then run:

```powershell
node "D:\skill box\qarinah\bin\qarinah.js" build
node "D:\skill box\qarinah\bin\qarinah.js" doctor
```

Terminate Agent A completely. Do not reuse its conversation or native memory in Phase B.

## 4. Phase B: fresh second agent

Start Agent B in a new process at the same repository state. First show that the previous conversation is absent. Then query Qarinah through the installed skill/MCP integration or the strict JSON-stdin CLI.

An example query request is:

```json
{
  "query": "continue the migration diagnosis and finish the compatibility layer",
  "format": "markdown",
  "maxTokens": 2000,
  "reserveTokens": 200,
  "minimumCoverage": "partial",
  "minimumEvidence": "any",
  "rankingProfile": "admission-first-v2",
  "temporalBoundary": "strict-before",
  "includeEvidenceSufficiency": true
}
```

Pass that file to `node "D:\skill box\qarinah\bin\qarinah.js" query --stdin-json` through stdin. The current evidence-sufficiency score is a research diagnostic, not a calibrated truth label, so the video must not describe it as proof that the task is supported.

Show the resulting pack size, strategy, temporal boundary, selected event IDs, evidence hashes, conflicts, exclusions, and sufficiency reason codes. Then let Agent B finish the task and run the acceptance tests.

## 5. Machine-readable run record

Create one JSON record per handoff direction with this minimum shape:

```json
{
  "schemaVersion": "qarinah.cross-agent-demo-run.v1",
  "direction": "claude-to-codex",
  "repository": "owner/repository",
  "initialCommit": "40-character commit",
  "finalCommit": "40-character commit or null",
  "qarinahCommit": "40-character commit",
  "agentA": { "name": "claude-code", "version": "exact version" },
  "agentB": { "name": "codex", "version": "exact version" },
  "handoff": {
    "query": "bounded task query",
    "packManifestHash": "sha256:digest",
    "eventIds": [],
    "eventHashes": [],
    "estimatedPackTokens": 0
  },
  "usage": {
    "agentA": { "inputTokens": null, "cachedInputTokens": null, "outputTokens": null },
    "agentB": { "inputTokens": null, "cachedInputTokens": null, "outputTokens": null }
  },
  "outcome": {
    "testsPassed": false,
    "testCommand": "exact command",
    "repeatedCommands": null,
    "repeatedFileReads": null,
    "contradictedPriorDecision": null
  }
}
```

Use `null` when the provider or harness does not expose a metric. Never replace missing provider usage with `ceil(characters / 4)`.

## 6. Recording shot list

1. Exact repository and Qarinah commits.
2. Clean initial state and test failure.
3. Agent A diagnosis and partial work.
4. Explicit permitted Qarinah evidence capture.
5. Qarinah `doctor` passing.
6. Agent A process ending.
7. Fresh Agent B process with no transcript.
8. Small cited Qarinah context pack.
9. Agent B continuing the same work.
10. Tests passing and final Git diff.
11. Provider usage fields exactly as reported.
12. Run-record path, pack manifest hash, event IDs, and event hashes.

Repeat the protocol for both directions. A later paper experiment should use 24-40 controlled handoffs and baselines; these two recordings remain supplementary demonstrations.
