# Qarinah 0.7.0

Qarinah 0.7.0 adds explicitly enabled automatic initialization for safe active project roots, summary-first visible-chat recall, bounded exact-source expansion, and a stable user-owned integration runtime. It preserves project isolation, disabled/revoked state, stop markers, and metadata-only defaults for users who have not opted into content capture.

## Install and inspect

```sh
npx qarinah@latest setup-user --capture content --full-chat
npx qarinah@latest auto-init status
npx qarinah@latest dashboard --serve --worktrees
```

Restart configured hosts and complete any host-required hook review. Global opt-in applies on this machine; it does not configure remote VMs or cloud agents. New projects initialize when used, without a startup disk sweep. Existing projects keep their own identity and policy. `qarinah auto-init disable` stops new automatic initialization; `.qarinah-stop` excludes a folder tree.

## Changes

- Stable user-level setup for six host integration targets, with backups and a setup report. Configuration support and actual lifecycle coverage remain distinct; consult the [host coverage](AUTO-INITIALIZATION.md).
- Upgrade handling disables an older duplicate Qarinah plugin without modifying its cached files.
- `context.recall` defaults to small cited summaries; exact retained text requires bounded full recall with genuine event IDs and pagination.
- `context.record_summary` stores inferred, source-linked outcomes under saved policy. Summary storage and initialization are annotated write tools; diagnostics, query, and recall remain read-only.
- Rebuildable visible-chat Markdown and bounded source chunks preserve exposed message endings when full-chat retention is explicitly enabled.
- README-first pipeline, explicit [SHA-256 contract](CRYPTOGRAPHIC-EVIDENCE.md), OKF explanation, and separately versioned whitepaper v1.9.
- Patched development dependencies, including the MCP tooling, address parsing, HTTP client, and deployment runtime. Miniflare's image dependency is pinned to patched Sharp 0.35.5; the deployment uses reviewed Wrangler 4.148.0. The complete dependency audit reports zero vulnerabilities at preparation time.

## Migration and evidence

No historical event schema or immutable benchmark receipt is rewritten. New product acceptance receipts use 0.7.0 filenames. Historical research results remain scoped to their original implementations and fixtures. A new technical-paper version does not imply a new DOI or independent peer review.

Release publication requires the full check, protected main merge, exact tarball size/SHA-256/SHA-512 integrity, npm provenance, and the matching production deployment. A prepared branch or website version label alone is not publication evidence.
