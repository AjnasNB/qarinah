# Qarinah 0.2.0

Qarinah 0.2.0 makes Git worktrees a first-class project-memory boundary.

## Highlights

- Each initialized checkout receives a stable worktree identity, its own workspace identity, and its own append-only ledger.
- Related checkouts share a repository identity derived from Git root commits without retaining a remote URL or credentials.
- Project snapshots bind the current branch and commit into the snapshot hash.
- `qarinah worktrees` discovers initialized siblings without silently initializing them.
- `qarinah dashboard --serve --worktrees` opens separately identified worktree ledgers in one grouped local dashboard.
- The linked graph includes repository and worktree nodes, branch and commit metadata, typed edges, evidence identities, and worktree-aware filtering.
- Project-structure schema v2 adds worktree metadata while the reader continues to accept valid v1 snapshots.
- The website, README, LLM maps, worktree guide, and launch article now lead with developer-first worktree context rather than an optional approval integration.

## Compatibility and boundaries

- Existing Qarinah workspaces remain readable. The next scan writes project-structure v2.
- Worktree ledgers are not symlinked or merged. Each checkout retains its own consent and capture policy.
- Sibling discovery includes only existing, non-bare Git worktrees and reports whether each exact root is already initialized.
- A shared repository identity groups related checkouts; it does not grant one worktree permission to read another.
- The published 98.71% context-reduction result remains the same frozen six-fixture estimate. It is not a new worktree benchmark or a universal provider-cost guarantee.

## Install

```sh
npm install qarinah@0.2.0
npx qarinah setup . --capture content --allow-query
npx qarinah worktrees
npx qarinah dashboard --serve --worktrees
```

Release only the reviewed commit whose package, generated plugins, types, website, and trusted-publishing artifact pass the complete release gate.
