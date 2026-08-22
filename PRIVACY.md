# Privacy

Qarinah is local-first. The core ledger, graph, index, Markdown record, and context compiler require no Qarinah account, hosted service, analytics endpoint, model API, or database.

Capture is disabled until a workspace is explicitly initialized and trusted on the current machine. Metadata capture is the default. Content capture must be explicitly enabled and can retain sensitive material despite bounded redaction, so it should be used only for reviewed inputs.

Qarinah does not intentionally record credentials, hidden reasoning, private browser state, host transcripts, or files outside the approved project scan boundary. Host applications, model providers, package registries, source-control systems, and optional connectors have their own privacy behavior and policies.

No software can guarantee that arbitrary tool output contains no secret. Review retained content before sharing a `.qarinah` directory or exported context bundle.

## Optional content-free activation measurement

Qarinah activation measurement is disabled by default. It is enabled only when the operator runs `qarinah activation enable` or passes `--share-activation` to `qarinah setup`. The choice is stored locally in `.qarinah/activation.json` and can be inspected with `qarinah activation status` or revoked with `qarinah activation disable`.

When enabled, Qarinah sends each of these milestone names at most once for that local installation:

- `setup_completed`
- `first_capture`
- `first_retrieval`
- `first_cross_session_handoff`
- `seven_day_return`

The application payload contains only the schema and consent versions, a random installation UUID, the milestone name, Qarinah version, operating-system family, and timestamp. It does not include the project name or path, repository identity, Git branch, query, prompt, event title or body, file name or content, agent transcript, hostname, username, email, or model/provider identity. The receiving Worker validates a strict 2 KiB request and records only the random installation UUID, milestone, Qarinah version, platform, and consent version in an aggregated Cloudflare Analytics Engine dataset.

Activation reporting never grants context access, changes capture policy, or blocks local operation when the endpoint is unavailable. Cloudflare still processes the network request under its infrastructure policies. Operators who require a completely offline path should leave the feature disabled.
