# Security policy

Qarinah is a local project-memory library and CLI. It is designed to make captured records tamper-evident and retrieval bounded; it is not an operating-system sandbox, credential vault, or complete enforcement boundary.

## Supported versions

| Version | Security fixes |
| --- | --- |
| Current `0.1.x` release | Supported |
| Older prereleases and unreleased source snapshots | Upgrade required |

Confirm the current public version with `npm view qarinah version`.

## Report a vulnerability privately

Use the repository's [private vulnerability reporting flow](https://github.com/AjnasNB/qarinah/security/advisories/new). Include:

- the affected version and operating system;
- the exact command, API, hook, or MCP method;
- a minimal reproduction using synthetic data;
- expected and observed behavior;
- impact, prerequisites, and suggested mitigations if known.

Do not put credentials, private project context, private transcripts, exploit details, or undisclosed vulnerabilities in a public issue. If private reporting is unavailable, open a public issue containing no exploit detail and ask the maintainer to establish a private channel.

The maintainer will acknowledge a complete report, reproduce it, coordinate a fix and disclosure, and credit the reporter unless anonymity is requested. Response time is best effort; the open-source project does not promise a service-level agreement or bug bounty.

## Security scope

Reports are especially useful when they demonstrate:

- capture without explicit machine-local trust;
- workspace escape, path traversal, or linked-file substitution;
- secret exposure that bypasses documented bounds and redaction;
- event-log, checkpoint, or derived-state integrity failures;
- authority expansion through MCP, Codex, Claude Code, Maqam, or interoperability adapters;
- prompt or retrieved-content execution by Qarinah;
- denial of service that bypasses documented input and resource ceilings;
- supply-chain compromise in the packed npm artifact or release workflow.

Claims that a retained statement is factually true, model-provider behavior, and unregistered host side effects are outside Qarinah's security guarantee unless Qarinah itself violates a documented boundary.

The detailed threat model, defaults, non-goals, and known limits are maintained in [docs/SECURITY.md](docs/SECURITY.md). Privacy behavior is documented in [PRIVACY.md](PRIVACY.md).
