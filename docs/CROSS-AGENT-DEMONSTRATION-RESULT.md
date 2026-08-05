# Cross-agent demonstration result

Status: user-reported functional demonstration; not a controlled research result.

On 2026-08-05, the project owner reported that Qarinah context switching worked between Claude Code and Codex. This supports proceeding to a recorded pilot, but no provider transcript, usage receipt, repository snapshot hash, randomized condition assignment, or SWE-bench outcome was supplied for independent verification.

Accordingly, this artifact records only:

- the handoff was reported as operational in both supported coding-agent environments;
- the packaged Codex and Claude Qarinah runtimes are independently checked for byte identity and MCP transport health by the release gate;
- no claim is made here about task success, token savings, cost, latency, or causal improvement.

For the recorded video and pilot, preserve the Agent-A snapshot hash, Qarinah ledger/index hashes, exact Agent-B runtime and model identifier, query and pack, cited record IDs, condition, provider usage, commands, elapsed time, final patch, and evaluator result. Start Agent B in a fresh session with native session resume disabled.

The reproducible procedure is in [CROSS-AGENT-VIDEO-PROTOCOL.md](CROSS-AGENT-VIDEO-PROTOCOL.md) and the final controls are in [FINAL-EXPERIMENT-PROTOCOL-v1.md](FINAL-EXPERIMENT-PROTOCOL-v1.md).
