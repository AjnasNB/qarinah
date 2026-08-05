# Cross-agent demonstration result

Status: automated Codex-to-Codex product smoke verified; cross-provider demonstration still user-reported; not a controlled research result.

On 2026-08-05, the project owner reported that Qarinah context switching worked between Claude Code and Codex. Qarinah 0.1.3 now also runs an automated provider-backed Codex-to-Codex smoke in two distinct ephemeral sessions with native resume disabled. Session A diagnoses a failing fixture without editing it; Session B queries Qarinah before inspecting source, cites the retrieved event ID and hash, implements the minimal fix, and passes the acceptance tests.

Accordingly, the release evidence establishes only:

- one automated Codex-to-Codex continuation succeeded in a disposable synthetic fixture;
- the retrieved inferred summary preserved the exact IDs and hashes of its captured source events;
- the handoff was separately reported as operational between the two supported coding-agent environments;
- the packaged Codex and Claude Qarinah runtimes are independently checked for byte identity and MCP transport health by the release gate;
- no claim is made here about cross-provider task success, general token savings, cost, latency, or causal improvement.

The machine-readable receipt deliberately excludes raw provider transcripts and local paths. See [the continuation benchmark](CROSS-SESSION-CONTINUATION-BENCHMARK.md) and [`bench/results/codex-cross-session-continuation-0.1.3.json`](../bench/results/codex-cross-session-continuation-0.1.3.json).

For the recorded video and pilot, preserve the Agent-A snapshot hash, Qarinah ledger/index hashes, exact Agent-B runtime and model identifier, query and pack, cited record IDs, condition, provider usage, commands, elapsed time, final patch, and evaluator result. Start Agent B in a fresh session with native session resume disabled.

The reproducible procedure is in [CROSS-AGENT-VIDEO-PROTOCOL.md](CROSS-AGENT-VIDEO-PROTOCOL.md) and the final controls are in [FINAL-EXPERIMENT-PROTOCOL-v1.md](FINAL-EXPERIMENT-PROTOCOL-v1.md).
