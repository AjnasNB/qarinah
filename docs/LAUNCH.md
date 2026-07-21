# Qarinah launch runbook

Qarinah is preparing an Apache-2.0 alpha. Do not publish an npm package, public repository, plugin marketplace entry, or immutable release until every incomplete gate below is satisfied and the exact artifact is approved.

## Release gates

1. Confirm the product name with professional trademark review and reserve the package, domains, and social identifiers.
2. Confirm every copyright holder can license the work under Apache-2.0. Keep the DCO, brand-use policy, and complete third-party attributions in the artifact.
3. Complete the capture, disclosure, MCP-root, hook, interpreter, and browser-receipt threat-model review.
4. Use a clean main commit, reproducible generated runtimes, clean-consumer types, all tests, benchmarks, and packed-artifact inspection.
5. Record exact artifact identity: package, version, registry, commit, tarball SHA-256, npm integrity, dist-tag, and explicit approval.
6. Run a full current-tree and Git-history secret scan. Review historical Actions logs before changing repository visibility.
7. Verify privacy, security reporting, support, contribution, trademark, and third-party notice documents.
8. Test real Codex and Claude Code installs from the release artifacts on Node 22, 24, and 26.

## Release candidate

- Validate both repository catalogs and Claude's install-free `--plugin-dir` path.
- Use metadata-only capture in disposable workspaces.
- Verify `doctor`, stale-index refusal, root negotiation, upgrade, reinstall, uninstall, and interpreter resolution.
- Run adversarial prompt, secret, linked-path, rollback, concurrent append, malformed hook, and no-evidence retrieval fixtures.
- Confirm the package contains `LICENSE`, `NOTICE`, third-party attributions, declarations, schemas, plugins, and no private files.

## Public technical preview

- Publish source only after the incomplete legal, name, secret-scan, and artifact gates are resolved.
- Use `v0.1.0-alpha.2` as a GitHub prerelease and npm `next`, not `latest`.
- Lead with a 60-second proof: opt in, record a decision, scan, verify hashes, and retrieve a direct-evidence pack.
- State limits beside the demo: hooks observe supported host events, metadata is default, MCP diagnostics are read-only, hidden reasoning is excluded, and no universal internet access is claimed.
- Use trusted npm publishing with provenance after the first package is staged and approved.

## Community launch

- Prepare a concise Show HN post, technical article, architecture diagram, reproducible benchmark, security model, and contributor issues.
- Offer copy-paste install, verification, and uninstall instructions.
- Keep browser automation as a separately governed experimental capability until denial, approval, and DOM-race suites pass.
- Respond to technical feedback with fixtures and evidence instead of unsupported claims.

## Positioning

Use:

- "Qarinah - evidence-linked project memory for AI agents."
- "Small cited context packs instead of entire transcripts."
- "Local-first and no Qarinah API key."
- "Maqam governs. Cockroach gathers. Qarinah remembers. ProductLoop orchestrates."
- "94.96% smaller context payload in the committed 54-record evaluator," only with the four-case, character-volume qualification beside it.

Avoid:

- "Prompt-injection proof," "tamper-proof," or "fully autonomous."
- "Works with every agent, model, or website."
- "No API key required for all internet and model access."
- "70% lower token cost" until provider usage is measured.
- "Agentic OS" until process, capability, secrets, filesystem, network, and device mediation exist.

## Open-source stewardship

Apache-2.0 permits commercial use. Stewardship comes from copyright, reviewed contributions, a distinct brand, maintained release infrastructure, hosted services, and execution quality. It does not come from prohibiting compliant commercial use of the open-source code.
