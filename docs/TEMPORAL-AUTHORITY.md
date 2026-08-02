# Temporal memory and authority

Project truth changes. Qarinah records that change instead of overwriting history or returning an old decision as if it were current.

## Temporal event fields

An event may include:

- `validFrom` and `validUntil`;
- repository ID, branch, and commit;
- file paths and expected hashes;
- dependency names, versions, and expected hashes;
- disclosure scopes and classification; and
- typed `supersedes` and `contradicts` relations.

A point-in-time query resolves the state at one canonical UTC `asOf` instant. Future, expired, stale, superseded, conflicting, unauthorized, and cross-repository candidates are counted in retrieval diagnostics instead of silently leaking into the result.

## Dynamic scope lifecycle

Use `recordMemoryScopeAttachment`, `resolveActiveMemoryScopes`, and `revokeMemoryScopeAttachment` when the authority itself must be recorded locally. A scope binds an attachment ID to an agent, optional run, repositories, attach time, optional expiry, and assigning policy identity.

For Maqam integrations, prefer the host resolver on `registerMaqamContextAdapters`. It makes Maqam the live disclosure authority. The agent-facing query contract contains no field that can grant additional scope.

## Repository isolation

`compileFederatedContext` compiles each repository separately and returns `authorityBoundary: "separate-packs"`. Explicit relationships describe how repositories interact but do not merge their ledgers or permissions. This permits a frontend task to see a public API contract without inheriting infrastructure secrets or production incident records.

## Retrieval order

Qarinah applies:

1. SQLite FTS5 and portable BM25 candidate generation;
2. typo-tolerant character matching;
3. temporal and retention filtering;
4. typed graph traversal;
5. authority and repository admission;
6. conflict and supersession handling;
7. reciprocal-rank fusion and diversity; and
8. optional caller-owned query expansion or reranking.

Dense retrieval remains an optional ranking aid. It cannot create a citation, bypass a scope, cross a repository boundary, or make a stale event current.
