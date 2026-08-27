# Git worktree context

Qarinah treats a Git worktree as a real context boundary. Parallel checkouts can contain different source, decisions, tests, and unfinished work even when they belong to the same repository. Sharing one writable memory store across them would flatten those differences and create race conditions.

## The model

Each initialized checkout owns:

- its own `.qarinah/events/events.jsonl` hash chain;
- its own consent and capture policy;
- its own SQLite, graph, Markdown, JSON, dashboard, and export projections;
- a stable worktree ID derived from its canonical checkout root;
- the current branch and commit captured in project-structure v2.

Sibling checkouts share only a non-secret repository group ID derived from Git history. Qarinah does not collect remote URLs or credentials and does not replace worktree storage with symlinks, junctions, or a shared writable database.

## Set up and inspect

Run setup in every checkout that should retain its own activity:

```sh
npx qarinah setup . --capture content --auto-compact
npx qarinah scan
npx qarinah build
```

From any checkout in the repository:

```sh
npx qarinah worktrees
npx qarinah dashboard --serve --worktrees
npx qarinah harness "current task" --worktrees
```

The first command lists up to 64 live Git worktrees with repository ID, worktree ID, branch, commit, linked/detached state, and exact-root Qarinah initialization status. The second opens every initialized sibling in one loopback-only dashboard. The harness command compiles and measures a separate cited pack per initialized checkout; it never flattens sibling contents into one authority surface.

## What the hashes mean

| Identity | Meaning |
| --- | --- |
| Git commit | The source revision Git reports for the checkout |
| Repository ID | A non-secret grouping key shared by linked worktrees; not an evidence hash |
| Worktree ID | A stable local checkout identity; not an evidence hash |
| Project snapshot hash | The exact bounded file graph plus the worktree metadata captured by `qarinah scan` |
| Event hash | One record in the authoritative append-only event chain |
| Graph manifest hash | The deterministic derived graph written from verified admitted events |

The snapshot, event, and graph hashes answer different questions. Qarinah exposes all of them rather than presenting a single ambiguous fingerprint.

## Graph and retrieval

Project-structure v2 adds a `worktree` node and a verified `contains` edge to the scanned root directory. Ranked linked-memory queries can filter or retrieve that node alongside memories, files, directories, concepts, and references. The live dashboard exposes the same bounded API and keeps disclosure, repository, time, and evidence coverage visible.

Historical project-structure v1 events remain readable. New scans emit v2; existing ledgers do not need rewriting.
