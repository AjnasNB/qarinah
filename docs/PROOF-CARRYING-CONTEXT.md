# Proof-carrying task context

Qarinah can compile one task packet that joins project memory with the code map that the task is likely to touch. The packet is designed for a coding agent that needs a small answer to four questions:

1. Which current project decisions and outcomes matter?
2. Which files and symbols are most relevant?
3. Which retained facts are current, conflicted, expired, or superseded?
4. Why was each item selected, and how can another tool verify it?

## Build a packet

Create a verified project scan first so repository symbols can be included:

```sh
npx qarinah scan
npx qarinah proof "verify signed release receipts" --format markdown
```

The JSON form is the public `qarinah.proof-context.v1` contract:

```sh
npx qarinah proof "verify signed release receipts" \
  --max-tokens 4096 \
  --file-limit 8 \
  --symbol-limit 40 \
  --fact-limit 16
```

Use `--persist-symbols` when the rebuilt symbol graph should also replace the local derived graph file. Without that flag, proof compilation is read-only.

## What the packet contains

- A complete `qarinah.context-pack.v2` with selected event IDs, event hashes, excerpts, retrieval reasons, coverage, conflicts, and exclusions.
- Ranked repository files with the source hash from the verified scan.
- Matched declarations with exact spans, signature hashes, reference counts, and separate lexical, local-vector, and structural scores.
- Cited facts with a temporal status and per-source validity interval.
- Superseded sources that were deliberately excluded, including the replacing event IDs.
- One selection summary and one manifest hash over the complete packet.
- An explicit token budget and the identity of the estimator used.

The default portable estimator is deterministic but not provider-exact. A JavaScript caller can supply a synchronous estimator marked `exact: true`; the receipt preserves that distinction.

## JavaScript API

```js
import {
  buildProofContext,
  renderProofContextMarkdown,
  validateProofContext
} from "qarinah";

const proof = await buildProofContext("verify signed release receipts", {
  cwd: process.cwd(),
  maxTokens: 4096,
  fileLimit: 8
});

validateProofContext(proof);
process.stdout.write(renderProofContextMarkdown(proof));
```

`validateProofContext()` recomputes the outer manifest and the nested context-pack identity. A changed query, selection, citation, file hash, fact, budget, or boundary causes `PROOF_CONTEXT_INVALID`.

## Editor view

The Qarinah VS Code/Cursor panel opens on **Task proof**. It shows the packet budget and manifest, then lets the developer search selected memory events, repository files, current facts, and deliberately excluded superseded evidence. The panel remains a sandboxed, read-only projection of the project ledger.

## Reproduce the acceptance result

```sh
npm run evaluate:proof-context
npm run check:proof-context-evidence
```

The committed evaluator creates a 12-file repository across ten registered language families and pairs every current decision with a superseded predecessor. All 12 task packets must:

- select the expected file in the five-file ceiling;
- select the expected symbol;
- retrieve the current decision;
- exclude and identify the superseded decision;
- retain valid event, file, and fact hashes;
- remain within 4,096 portable estimated tokens; and
- reproduce the same packet manifest on an unchanged workspace.

The evaluator separately changes a completed packet and verifies that validation rejects it. This is deterministic product-acceptance evidence over a generated repository. It is not an independent accuracy benchmark, a provider usage receipt, or a comparison with another product.

Inspect the [machine-readable result](../bench/results/proof-context-0.6.0-alpha.1.json) and [evaluation source](../scripts/evaluate-proof-context.mjs).

## Boundary

Proof-carrying context makes selection inspectable. It does not prove that a retained statement is true, that a model will complete the task correctly, or that a file outside the selected packet is irrelevant. Retrieved content remains untrusted data, and the calling agent still owns execution, model choice, current source inspection, and policy.
