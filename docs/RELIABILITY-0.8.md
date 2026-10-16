# Qarinah 0.8: reliable memory and shared knowledge

Qarinah is verifiable project memory for coding agents. The local core owns the authoritative event history; optional shared storage lets authorized agents use encrypted knowledge across machines. The product does not promise unlimited model usage or guaranteed savings.

## Seven changes

| Problem | 0.8 behavior | Evidence and limits |
| --- | --- | --- |
| A summary could hide more relevant source text | Recall ranks summary and raw excerpts together; coverage describes the text actually returned within the budget | Regression tests cover weak summaries, unavailable citations, and clipped evidence; relevance is still lexical |
| Context reduction was confused with provider savings | Per-attempt usage preserves unknown counts, includes retries and failures, and separates production from tests | [Usage accounting](PROVIDER-USAGE.md) and [matched tasks](TASK-COMPARISON.md); caller records are not authenticated invoices |
| Retrieval claims lacked practical task comparisons | A versioned evaluator binds task, repository revision, settings, outcomes, time, and provider usage | No new independent competitor win is claimed; frozen research artifacts remain historical |
| Repeated queries rebuilt parsing and retrieval indexes | Bounded process caches reuse verified work after hashing newly read ledger bytes; trust and admission are checked again | Tests reject same-length tampering and revoked trust; cold reads still verify the complete ledger |
| Runtime packages included research datasets | npm keeps runtime, integrations, schemas, documentation, and licenses; research reproduction uses the matching source checkout | Vendored host runtimes remain for compatibility |
| Installed, captured, and injected were easy to confuse | `qarinah health --online` reports runtime version, capture, last hook and retained event, user setup, and public website version | Provider delivery remains unobserved; generating a pack does not prove injection |
| Shared knowledge needed confidentiality and a truth boundary | Client-side AES-256-GCM, SHA-256 identities, private R2, scoped access, immutable objects, and verified decryption | [Encrypted knowledge](ENCRYPTED-KNOWLEDGE.md); hashes establish integrity, not truth or author identity |

## Five-stage delivery order

1. Correctness: fix recall selection, delivered coverage, and cryptographic verification before optimizing.
2. Operational clarity: expose runtime health and actual usage, with unknowns shown explicitly.
3. Efficiency: reuse verified retrieval work and trim the published payload without changing event authority.
4. Task validation: execute matched tasks against project notes/search or native host memory, include failures, and compare quality as well as cost. The evaluator is implemented; a provider-backed controlled study and independent reproduction are separate work.
5. Adoption: use maintained projects, observe continuation failures and maintenance cost over time, and publish reproducible outcomes. External maintainers and weeks of observation cannot be replaced by tests.

The first three stages are release engineering. Stages four and five require observed outcomes beyond implementation. Release receipts must identify which checks actually ran.

## Product line

- **Personal core**: project-owned memory, exact recovery, cited recall, portable OKF, CLI, MCP, and dashboard.
- **Shared knowledge**: optional private encrypted transport for authorized machines and cloud agents. No plaintext cloud search or automatic uploads.
- **Enterprise integration**: policy and approval through Maqam where required. Organization identity, managed keys, contractual availability, regional controls, and large-history segmentation require additional service work. Contact [contact@cognifyr.co](mailto:contact@cognifyr.co) about those requirements.

Qarinah's strongest starting point is inspectable provenance and project ownership. Comparisons should test that advantage on real continuation tasks instead of inferring superiority from feature counts or full-history token estimates.

## Migration from 0.7

The authoritative `qarinah.event.v1` ledger and valid encrypted bundle format are unchanged. Recall's existing coverage fields now describe delivered excerpts. Usage, health, and matched-task inputs have separate versioned schemas. Research runners and datasets are no longer shipped in npm; use the matching Git tag. Published whitepaper and historical result bytes remain unchanged.

```sh
npm install --global qarinah@0.8.0
qarinah setup-user --help
qarinah health --online
qarinah dashboard --serve --worktrees
```

Review supported setup options before replacing host configuration. Machine opt-in, exclusions, project trust, and capture consent remain authoritative.
