# Getting started

Qarinah is evidence-linked project memory for coding agents - compact enough to save context, inspectable enough to trust. It works for one developer and one repository, across several supported coding agents, or as the memory layer in a larger team workflow. Maqam integration is optional.

Qarinah gives an agent a small, cited slice of project memory instead of replaying the full retained history. The record stays in the project and the generated SQLite index, graph, Markdown, JSON, dashboard, and OKF views can be rebuilt from it.

For the supported hosts, the quickest complete setup is:

```sh
npx qarinah setup . --codex --claude --cursor --capture content --allow-query
```

## Requirements

- Node.js 22, 24, or 26
- a local project you are allowed to index
- explicit initialization in that project

## Install

```sh
npm install --save-dev qarinah
```

Qarinah has no hosted memory service, embedding bill, vector database, or Qarinah API key.

## Initialize one project

Run this from the exact project root:

```sh
npx qarinah init .
```

Metadata-only capture is the default. If the project may retain bounded content exposed by supported hooks, opt in explicitly:

```sh
npx qarinah init . --capture content
```

Initialization creates the portable project configuration and requests machine-local trust. Trust and revocation stay outside the repository so a cloned configuration cannot silently grant itself permission.

## Record one durable decision

```sh
npx qarinah record \
  --kind decision \
  --title "Keep releases provenance-bound" \
  --body "Publish only the reviewed artifact from the reviewed commit."
```

The event is validated, redacted under the active policy, assigned a stable ID, content-hashed, and appended to the hash-chained JSONL record.

## Scan and build

```sh
npx qarinah scan
npx qarinah build
```

`scan` records a bounded project-structure snapshot. `build` verifies the canonical record and deterministically rebuilds the typed graph, hybrid retrieval index, Markdown view, and idempotency projection.

## Query a small cited pack

```sh
npx qarinah query "release provenance" \
  --minimum-coverage direct \
  --max-tokens 1500 \
  --reserve-tokens 200 \
  --format markdown
```

The pack includes complete selected records, event IDs, hashes, a retrieval manifest, and deterministic evidence-coverage diagnostics. `minimum-coverage direct` rejects a result unless one selected record contains every normalized query term.

For agent callers, use JSON stdin:

```sh
printf '%s' '{"query":"release provenance","format":"json","minimumCoverage":"direct","maxChars":8000}' \
  | npx qarinah query --stdin-json
```

## Verify the workspace

```sh
npx qarinah doctor
npx qarinah status
```

`doctor` verifies policy, event hashes, the chain, rollback checkpoint, and derived state. `status` reports the selected workspace and capture mode without mutating it.

## Connect Codex or Claude Code

Install the reviewed plugin for the host, restart the host, then initialize each project that should retain permitted context. Plugin installation can be host-wide while capture permission remains project-specific.

Continue with [Codex and Claude Code integrations](HOST-INTEGRATIONS.md).

## Durable files

```text
.qarinah/
  config.json
  events/events.jsonl
  graph/graph.json
  index/index.json
  records/CONTEXT.md
  records/okf/
  index/event-ids/
```

`events/events.jsonl` is authoritative. Delete any derived view and run `qarinah build` to reproduce it.
