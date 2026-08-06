# Roadmap

## Implemented platform foundation

Qarinah 0.1.4 includes consent-gated MCP retrieval, one-command Codex/Claude/Cursor setup, a local memory dashboard, freshness checks, seven task packs, separate-authority multi-repository retrieval, optional reranking adapters, encrypted team bundles, role manifests, signed checkpoints, expanded quality evaluation, causal receipts across Cockroach, Qarinah, Maqam, execution, and observation, and a release-integrity gate that keeps package, runtime, type, MCP, and website metadata aligned.

The encrypted sync surface is a public self-hostable protocol foundation. A managed cross-device service, identity-provider federation, durable hosted transport, and organization administration remain future service work.

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
