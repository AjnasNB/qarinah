# SQLite read model

Qarinah keeps `.qarinah/events/events.jsonl` as the authority and builds `.qarinah/index/qarinah.db` only as a fast, disposable read model. Deleting the database does not delete memory. `qarinah rebuild` verifies the chain and recreates the complete database from ledger events and deterministic graph state.

## Why both formats exist

JSONL is inspectable, append-only, hash chained, easy to version, and independent of a database engine. SQLite provides concurrent local reads, indexed temporal filters, typed joins, and FTS5 search. The database is never accepted as evidence when the ledger, checkpoint, or expected head does not match.

## Reliability and schema

The read model uses SQLite WAL, foreign keys, strict tables, FTS5, a `user_version`, and a `read_model_migrations` record. A rebuild is written to a temporary database and atomically replaces the prior projection only after the transaction and WAL checkpoint complete.

The initial schema includes:

- `events`, `nodes`, `edges`, `citations`, `documents`, and `sources`;
- `decisions`, `conflicts`, `supersessions`, and `freshness`;
- `context_packs` and `context_pack_items`;
- `agent_disclosures` and `sync_outbox`; and
- the FTS5 `events_fts` search table.

Project references are relationally unique by source, relationship type, target, and source event. When one file contains the same relationship more than once, the graph stores one semantic edge with `occurrenceCount` and an `occurrences` array containing every observed specifier, span, confidence, and extractor. This keeps SQLite rebuilds deterministic without dropping the individual observations preserved in the authoritative project-structure event.

## Commands

```sh
npx qarinah rebuild
npx qarinah doctor
npx qarinah query "release approval" --minimum-coverage direct
```

Queries validate the database schema version, workspace identity, ledger event count, and verified head hash. Missing or stale derived state is rebuilt only through an explicit mutable path; diagnostic-only reads do not silently modify project memory.

## Extension boundary

Optional local vectors may be added as another disposable projection. They must not replace event citations, disclosure filters, repository boundaries, temporal validity, or the authoritative ledger. Customer-provided semantic adapters may currently rerank only deterministically admitted candidates.
