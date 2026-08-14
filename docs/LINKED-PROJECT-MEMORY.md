# Linked project memory

Qarinah can build one evidence-linked view that connects retained project memories with the latest explicit repository scan. The view is designed for a developer who needs to answer three related questions without replaying an entire history:

1. Which current memory records are relevant to this task?
2. Which files are structurally important to the requested area?
3. How are the selected memories, files, concepts, and source identities connected?

The authoritative source remains `.qarinah/events/events.jsonl`. The linked-memory projection at `.qarinah/graph/linked-memory.json` is deterministic and disposable. `qarinah build` regenerates it from the verified ledger.

## Build the memory and repository map

Initialize the project, record permitted activity, and scan the repository:

```bash
npx qarinah setup . --codex --capture content
npx qarinah scan
npx qarinah build
```

`scan` remains explicit. It honors the project ignore rules and fixed file, byte, and depth ceilings. The linked-memory builder does not walk the repository independently or retain source-file contents. It consumes paths, content identities, languages, and bounded references already present in the reviewed scan event.

The generated projection includes:

- memory nodes for verified ledger events;
- file and directory nodes from the latest retained project scan;
- external or unresolved reference nodes;
- bounded concept nodes derived from retained project language;
- explicit evidence, conflict, supersession, and source relations;
- chronological `precedes` relations;
- file containment, import, link, and reference relations;
- deterministic repository importance scores;
- sparse local relevance signatures and source hashes.

## Query the linked memory

Use the CLI to search across current memory and the repository map:

```bash
npx qarinah map "release approval module"
npx qarinah map "database migration" --type memory,file --limit 12
npx qarinah map "deployment" --repository team/api --scope engineering.api
```

Every result exposes its score components:

- `localSemantic`: overlap in the deterministic sparse relevance signature;
- `linkedEvidence`: the strongest one-hop relevance signal from an admitted neighbor;
- `structuralImportance`: event centrality or repository-link importance;
- `formula`: the exact formula used for that result set.

The default query formula is `0.72*local + 0.18*linked + 0.10*importance`. This is a versioned local ranking method, not a claim that the score measures universal semantic correctness. A query with no text becomes an explicit structural browse sorted by importance.

## Time, supersession, and access boundaries

`--as-of` evaluates validity and supersession at a canonical timestamp. An older decision remains available before the timestamp of an admitted replacement and is excluded after that replacement takes effect.

Restricted records are admitted only when one of their disclosure scopes is supplied. Repository selectors follow the same rule as normal Qarinah retrieval: an event with no repository identity remains eligible, while an identified event must match one of the requested repositories. Query admission is applied before the bounded event window, so an excluded future, restricted, or other-repository event cannot displace admitted evidence. Concepts, relations, conflicts, degrees, importance, and scores are then rebuilt from admitted as-of source profiles. A restricted-only term, hidden neighbor, future replacement, or other-repository reference therefore cannot change an unscoped result or its metadata.

The result records:

- the source ledger head;
- the linked-memory manifest hash;
- the exact query and `asOf` timestamp;
- requested node types, scopes, and repositories;
- excluded-node count;
- query-term coverage;
- admitted projected-event count, bounded-window omitted-event count, and their conservative source-event sum;
- separate `projectionComplete` and `authorityComplete` flags;
- event and content hashes for each result.

## Bounded coverage

The authoritative event store keeps its existing ledger limits. The linked view separately bounds the event window, relations, file references, nodes, edges, source profiles, and serialized projection so an accepted large ledger cannot create an unbounded graph payload. It selects the latest retained event window and preserves the latest valid project-scan event by replacing the oldest window slot when necessary. Relations whose event target falls outside that window are omitted. Source/projected/omitted counts and `projectionComplete` make that boundary visible on every query.

When a shared node has more source profiles than the projection can retain, a selector-dependent query fails closed for that node and returns `authorityComplete: false`. Treat a missing match as exhaustive only when both `projectionComplete` and `authorityComplete` are `true`. Coverage metadata is part of the result contract; omission is never presented as a complete scoped search.

## Repository importance

The repository map runs a fixed 24-iteration link-rank calculation with damping `0.85` over retained file-to-file import, link, and reference edges. A file referenced by several other files can rank above an isolated file. Ties are deterministic.

This score describes structure in the latest retained scan. It does not prove runtime call frequency, ownership, business criticality, or test coverage. Consumers should combine the score with current task language and cited evidence, which is what `qarinah map` does.

## Interactive dashboard

Generate a self-contained snapshot:

```bash
npx qarinah dashboard
```

Or start the loopback-only live view:

```bash
npx qarinah dashboard --serve
```

The **Linked project memory** panel provides:

- a responsive native SVG relationship graph;
- memory, file, concept, directory, and reference filters;
- read-only ranked search with a local visual-filter fallback;
- node details for importance, repository rank, connection counts, status, and evidence identity;
- an accessible result list alongside the visual graph;
- a bounded projection so large repositories do not produce an unbounded browser payload.

Live mode also exposes read-only loopback endpoints for explicitly selected workspaces:

```text
GET /api/graph/<workspace-id>
GET /api/search/<workspace-id>?q=<query>&type=memory,file&limit=20
```

These endpoints do not discover projects, grant access, append events, or execute tools. The server accepts only `GET` and `HEAD`, binds to `127.0.0.1`, validates the host header, sends restrictive browser headers, and returns a bounded query result.

## JavaScript API

```js
import {
  buildLinkedProjectMemory,
  loadLinkedProjectMemory,
  queryLinkedProjectMemory,
  rankLinkedProjectMemory
} from "qarinah";

const result = await queryLinkedProjectMemory("release policy", {
  cwd: process.cwd(),
  types: ["memory", "file"],
  repositoryIds: ["team/api"],
  authorityScopes: ["engineering.api"],
  asOf: new Date().toISOString(),
  limit: 20
});

console.log(result.coverage);
console.log(result.items[0]?.basis);
console.log(result.items[0]?.evidence);
```

`buildLinkedProjectMemory(events, workspaceId)` and `rankLinkedProjectMemory(memory, query, options)` are pure deterministic functions for validated inputs. `loadLinkedProjectMemory` verifies the ledger, compares the persisted projection with a fresh derivation, and repairs a missing or stale projection unless `rebuild: false` is specified. Pass `persist: false` to derive the verified projection without writing it, and `updateCheckpoint: false` when a read must also leave the machine-local checkpoint untouched.

## Integrity and privacy boundary

- Editing `linked-memory.json` cannot change the source ledger and is detected on the next verified load.
- Deleting the projection loses no authoritative memory; run `qarinah build` to restore it.
- The local signatures are term-derived and do not call a model or remote embedding service.
- The builder does not infer approvals, factual truth, runtime behavior, or hidden reasoning.
- Dashboard graph content is project memory. Keep the generated HTML private unless its retained records are safe to share.
