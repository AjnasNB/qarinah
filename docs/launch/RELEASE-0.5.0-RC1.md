# Qarinah 0.5.0-rc.1

Qarinah 0.5.0-rc.1 is the reviewed release candidate for proof-carrying developer memory across languages, sessions, editors, Git worktrees, and self-hosted teams.

## What is new

- source-hash-bound symbols, definitions, and unambiguous references across ten language families;
- lifecycle-bound v2 session receipts with ordered event and outcome manifests but no transcript bodies;
- an atomic incremental-cycle journal with deterministic interrupted-run recovery;
- detailed session replay in the sandboxed VS Code/Cursor panel;
- multi-language document symbols through `qarinah-lsp`;
- a packaged project-local JetBrains LSP4IJ template;
- an optional self-hosted service for opaque encrypted team bundles, strict membership roles, revision checks, rate limits, and token-free audit records;
- a 10/10 deterministic evaluation over an isolated copy of Qarinah's public checkout; and
- technical white paper v1.7 with source and PDF integrity receipts.

## Install the release candidate

```sh
npm install --save-dev qarinah@next
npx qarinah setup . --capture content --allow-query --auto-compact
npx qarinah dashboard --serve --worktrees
```

The npm prerelease is published only under `next`; the stable `latest` tag remains on 0.4.0 until real installation and migration evidence supports promotion.

## Public product evidence

The committed public-checkout evaluator passes 10 of 10 structural scenarios. It indexes every eligible source file in the copied checkout, resolves four exact implementation definitions, records a completed session lifecycle, writes a minimized receipt, compiles cited continuation context, and verifies the event chain. It uses no private data, provider call, learned embedding service, or model-written summary.

Run it with:

```sh
npm run check:public-project-memory
```

This is maintainer-run product acceptance on the named public checkout. It is not independent reproduction, a provider-billing result, or a universal semantic-accuracy claim.

## Compatibility and boundaries

- Node.js 22, 24, and 26 are supported.
- VS Code and Cursor use the packaged extension; JetBrains uses the supplied standard-LSP template rather than a native plugin.
- The symbol graph provides project-memory navigation, not full compiler semantics, refactoring, debugging, or test generation.
- Team sync is self-hosted opaque storage. It does not include a managed cloud, SSO, billing, or enterprise administration.
- Qarinah does not passively capture unrelated desktop activity, hidden reasoning, or chats that were never captured or imported.

## Promotion gate

Stable 0.5.0 requires the exact prerelease bytes to pass protected review, hosted OS and Node matrices, packed clean-install tests, restore and migration checks, security/privacy review, and an observation period. Do not relabel this release candidate as stable before those gates are complete.
