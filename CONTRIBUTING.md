# Contributing to Qarinah

Thank you for improving Qarinah. Security boundaries, evidence fidelity, user consent, and reproducibility take priority over convenience.

## Before you start

- Use [GitHub Discussions](https://github.com/AjnasNB/qarinah/discussions) for usage questions and design exploration.
- Search existing issues before opening a new one.
- Use an issue template for a reproducible defect, feature proposal, or host integration.
- Report suspected vulnerabilities through GitHub's private vulnerability reporting flow. Do not publish exploit details in an issue or discussion.

Maintainers may close proposals that silently expand capture, execute retrieved context, weaken workspace isolation, obscure provenance, or publish claims without reproducible evidence.

## Development setup

Use a maintained Node.js 22, 24, or 26 release.

```sh
git clone https://github.com/AjnasNB/qarinah.git
cd qarinah
npm ci
npm run check
```

Run focused tests while iterating, then run `npm run check` before requesting review. A pull request is not release-ready until the full check passes from a clean install.

### White-paper builds

White-paper generation is a repository-maintainer workflow, not a public npm-package command. The Python builders are intentionally excluded from the npm tarball; the current generated paper and its receipts are shipped as read-only release evidence. From a complete source checkout with Python 3 and ReportLab installed, build the current paper directly:

```sh
python scripts/build-whitepaper-pdf-v1.7.py
```

The v1.7 source receipt binds `docs/WHITEPAPER.md`, the shared layout engine, and the v1.4 through v1.7 wrappers. Its companion build metadata records the Python, ReportLab, platform, and font inputs used for that generated artifact. v1.3, v1.4, v1.5, and v1.6 remain immutable historical artifacts; never run a historical builder to replace an existing PDF.

## Architecture invariants

Qarinah's JSONL event log is the authoritative record. Graphs, indexes, Markdown views, OKF exports, and context packs must remain deterministic derivatives.

Every change must preserve these rules:

1. Capture requires an explicit workspace configuration and matching machine-local trust.
2. Metadata capture remains the default. Content capture is an explicit per-workspace choice.
3. Prompts, tool results, retrieved content, paths, plugin configuration, and imported records are untrusted data.
4. Retrieved context is never executed as instructions by Qarinah.
5. Records and derived views remain bounded, attributable, and reproducible.
6. Summaries and context packs cite source event IDs or digests.
7. Read-only diagnostics cannot create trust, mutate a workspace, or broaden authority.
8. Credentials, cookies, environment secrets, private transcripts, and hidden model reasoning are outside the capture contract.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), and [PRIVACY.md](PRIVACY.md) before modifying trust, capture, storage, retrieval, MCP, or host integration code.

## Public contract checklist

When a change affects a public command, JavaScript export, event type, context pack, schema, or host adapter, update the complete contract:

- runtime implementation;
- package exports and TypeScript declarations;
- JSON schemas and runtime validation;
- CLI help and reference documentation;
- positive, negative, and packed-consumer tests;
- migration notes when existing records or callers are affected.

Do not add permissive fallbacks for unknown event shapes. Reject or ignore unknown data according to the documented boundary instead of guessing.

## Tests and benchmark evidence

- Add a regression test for every defect.
- Add adversarial cases for path traversal, linked files, untrusted content, oversized inputs, replay, rollback, malformed timestamps, and authority confusion when relevant.
- Keep fixtures synthetic or explicitly redistributable.
- Commit machine-readable benchmark results and the command that produced them.
- Compare equivalent inputs on both sides of an evaluation.
- Describe exactly what a percentage measures. Do not turn estimated context reduction into a universal provider-billing, latency, or answer-quality claim.

## Pull requests

- Keep one pull request focused on one reviewable outcome.
- Explain user impact, security impact, compatibility, tests, and documentation.
- Link the issue or design discussion when one exists.
- Do not include secrets, private project context, hidden reasoning, copied third-party code, or generated assets without documented rights.
- Do not weaken a failing check merely to make CI green.
- Do not publish packages, tags, releases, or deployments from a contributor branch.
- Expect exact-commit review for security-sensitive or release-bound changes.

## Developer Certificate of Origin

Qarinah uses the Developer Certificate of Origin 1.1. Sign every commit with:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Use `git commit -s`. By signing off, you certify the contribution under the [Developer Certificate of Origin 1.1](https://developercertificate.org/).

## Community conduct and stewardship

All participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Project decision-making and release stewardship are described in [GOVERNANCE.md](GOVERNANCE.md).
