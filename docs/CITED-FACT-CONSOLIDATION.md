# Cited fact consolidation

Qarinah can turn an admitted context pack into a small structured set of decisions, constraints, tool activity, outcomes, evidence, conflicts, and summaries. Every fact cites one or more exact source event IDs from the verified pack.

```sh
npx qarinah facts "release readiness"
npx qarinah facts "release readiness" --record --max-facts 24
```

The built-in extractor is deterministic and local. It restates bounded titles and excerpts from the admitted pack; it does not invent a second hidden memory store. `--record` writes one idempotent summary event. A content-capture workspace may retain the cited statements. A metadata-only workspace retains only counts, hashes, adapter identity, source event IDs/hashes, and the consolidation receipt.

## Optional model extractor

Library callers may supply a versioned extractor:

```js
import { consolidateProjectFacts } from "qarinah";

const result = await consolidateProjectFacts({
  query: "current database decisions",
  extractor: {
    id: "local-fact-model-v1",
    async extract(input, { signal }) {
      return localModel.extractFacts(input, { signal });
    }
  }
});
```

The adapter receives only a bounded pack labeled `untrusted-data`, not a whole transcript or hidden reasoning. Its response is rejected unless every fact:

- uses a supported category;
- is no more than 500 characters;
- says whether it is extracted or inferred;
- cites one to eight unique event IDs present in the admitted input; and
- contains no extra fields or duplicate fact identity.

This is a structural citation gate, not a proof that a model interpretation is true. Consumers should show source events beside inferred facts and resolve conflicts against current files and stronger evidence.

## Rebuild and replay

The stable consolidation identity binds workspace, admitted source IDs and hashes, extractor identity, model label, and facts. Repeating the same consolidation reuses the existing recorded event even when the display timestamp changes. A changed source, extractor, or output produces a different identity. Recorded source relations let the graph expand every fact back to its evidence.

The strict public result schema is exported as `qarinah/schemas/fact-consolidation.json`.
