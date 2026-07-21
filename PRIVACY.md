# Privacy

Qarinah is local-first. The core ledger, graph, index, Markdown record, and context compiler require no Qarinah account, hosted service, analytics endpoint, model API, or database.

Capture is disabled until a workspace is explicitly initialized and trusted on the current machine. Metadata capture is the default. Content capture must be explicitly enabled and can retain sensitive material despite bounded redaction, so it should be used only for reviewed inputs.

Qarinah does not intentionally record credentials, hidden reasoning, private browser state, host transcripts, or files outside the approved project scan boundary. Host applications, model providers, package registries, source-control systems, and optional connectors have their own privacy behavior and policies.

No software can guarantee that arbitrary tool output contains no secret. Review retained content before sharing a `.qarinah` directory or exported context bundle.
