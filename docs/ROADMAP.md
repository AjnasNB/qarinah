# Roadmap

## Foundation 0.1

- strict event, relation, and context-pack contracts;
- append-only local store with consent, redaction, locking, and verification;
- deterministic graph/index/Markdown materialization;
- bounded query and context-pack compiler;
- opt-in Codex skill and lifecycle hooks;
- reproducible correctness and performance fixtures.

## Integration 0.2

- Claude Code plugin and generic JSONL adapters;
- Maqam governed read/write tools;
- validated Cockroach `SourceRecord` ingestion;
- ProductLoop `ProvenanceSink` and `RunStore` implementation;
- read-only local MCP server for Codex, Claude Code, and compatible hosts;
- retention, contradiction, supersession, and per-agent disclosure policy.

## Governed control plane

- independently anchored signed checkpoints and portable context bundles;
- identity and capability grants;
- secrets broker and policy simulator;
- sandbox/process/filesystem/network adapters;
- Windows, macOS, and Linux supervisor prototypes;
- team synchronization with end-to-end encryption and audit export.

The product should be described as a governed agent control plane until it actually owns enough process, capability, storage, and device mediation to justify "agentic OS."
