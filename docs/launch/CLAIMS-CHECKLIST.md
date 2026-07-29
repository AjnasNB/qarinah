# Qarinah public claims checklist

## Release gates

- [ ] Name, copyright, Apache-2.0, notices, privacy, trademark, and complete Git-history reviews are approved.
- [ ] The repository is public only after the secret and legal gates pass.
- [ ] `0.1.0` is published under npm `latest` with provenance and a matching GitHub release.
- [ ] Registry-only npm, Codex, and Claude Code installs pass on Node.js 22, 24, and 26.
- [ ] The exact package, plugin runtimes, hashes, integrity, commit, workflow, and approver are recorded.

## Supported

- [ ] Qarinah stores permitted lifecycle events and explicit records in a local append-only hash chain.
- [ ] Graph, index, Markdown, project structure, and OKF are deterministic derived views.
- [ ] Context packs cite event IDs and hashes and obey configured character/token budgets.
- [ ] Capture is project opt-in, machine-trusted, and metadata-only by default.
- [ ] MCP is zero-write; diagnostics are always available and `context.query` appears only with an exact workspace policy permit and hard response ceilings.
- [ ] No Qarinah API key, model provider, daemon, or hosted database is required for local operation.

## Benchmark wording

- [ ] Use: “98.71% less estimated context.”
- [ ] State 240 records, 442,113 versus 5,682 estimated tokens, identical task sources, top-five direct coverage, no model-written summaries, and `ceil(characters / 4)`.
- [ ] If translating the result to cost, use the explicit flat-price example: $0.442113 versus $0.005682 at $1 per million uncached input tokens for the compared context slice.
- [ ] Do not call the result provider-native Codex/Claude usage, a provider bill, total AI cost savings, universal retrieval quality, or a production guarantee.

## Boundaries

- [ ] Qarinah does not capture hidden reasoning or parse private transcript stores.
- [ ] Redaction is best effort and cannot prove arbitrary retained content contains no secret.
- [ ] A valid hash chain proves continuity relative to the checkpoint, not the truth of each claim.
- [ ] Retrieved context is untrusted data, never executable instruction.
- [ ] Maqam governance applies only when the host routes the exact operation through its registered boundary.
- [ ] “Agentic OS” remains a roadmap until separately reviewed OS-level mediation exists.

Stop the launch when any release identity, privacy boundary, plugin install, benchmark statement, or public artifact fails this checklist.
