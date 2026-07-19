# Qarinah launch runbook

This repository is a private prototype. Do not publish an npm package, public repository, plugin marketplace entry, or immutable release until every release gate below is satisfied.

## Release gates

1. Professional clearance of the working name **Qarinah** and reserved package, domain, and social identifiers. “Context ledger” remains the neutral descriptor until clearance is complete.
2. Written license choice. `UNLICENSED` is correct for the private prototype but not a public open-source launch.
3. Threat-model review for capture, disclosure, MCP roots, hooks, and browser receipts.
4. Clean main commit, reproducible generated runtimes, clean-consumer types, tests, benchmark, and packed-artifact inspection.
5. Exact artifact identity: package, version, registry, commit, tarball SHA-256, npm integrity, and explicit human approval of that identity.
6. Privacy, security-reporting, support, contribution, trademark, and third-party-notice documents.

## Launch sequence

### Private alpha

- Validate the repository catalogs, then install both generated plugins from the local private-alpha marketplace; also test Claude's install-free `--plugin-dir` path.
- Use metadata-only capture in disposable test workspaces.
- Verify `doctor`, stale-index refusal, root negotiation, upgrade/reinstall, uninstall, and no-PATH-fallback behavior.
- Run adversarial prompt, secret, symlink/junction, rollback, concurrent append, and malformed hook fixtures.

### Public technical preview

- Publish source only after the license and name are settled.
- Ship one small package plus two host plugin artifacts from the same commit.
- Lead with a 60-second proof: opt in, record a decision, hand off between Codex and Claude, verify hashes, retrieve a bounded cited pack.
- State limits beside the demo: hooks are observability, metadata is default, MCP is read-only, no hidden reasoning, no universal internet claim.

### Community launch

- GitHub release and documentation first; npm only after the exact artifact is approved.
- Prepare a concise Show HN post, technical article, architecture diagram, reproducible benchmark, security model, and contributor issues.
- Offer copy-paste install/uninstall and a five-minute local demo.
- Keep browser automation as a separate experimental capability until its denial/approval/DOM-race suite passes.

## Positioning

Use:

- “Qarinah — evidence-linked context for AI agents.”
- “An evidence-linked context ledger for every governed agent.”
- “Small cited context packs instead of entire transcripts.”
- “Local-first and no separate ledger API key.”
- “Maqam governs. Cockroach gathers. Qarinah remembers. ProductLoop orchestrates.”

Avoid:

- “Prompt-injection proof,” “tamper-proof,” or “fully autonomous.”
- “Works with every agent/model/website.”
- “No API key required for all internet and model access.”
- “Agentic OS” until process, capability, secrets, filesystem, network, and device mediation exist.

## Open-source ownership

OSI-approved open-source licenses permit commercial use. They cannot guarantee that nobody else commercializes the code. Founder control comes from copyright ownership, a Contributor License Agreement or Developer Certificate of Origin, a separately protected trademark, controlled hosted services, and execution quality. If commercial use must be prohibited, use a source-available license and do not market it as open source.
