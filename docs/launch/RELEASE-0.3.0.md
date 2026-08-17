# Qarinah 0.3.0

Qarinah 0.3.0 turns worktree-aware project memory into an automatic coding context harness.

## Highlights

- `qarinah setup . --auto-compact` installs an ordered completed-turn hook that captures the supported event and records a compact checkpoint.
- `qarinah harness "task"` compiles a bounded, cited context pack and reports the live baseline, delivered-token estimate, reduction, and ratio for that exact run.
- `qarinah harness "task" --worktrees` reports each initialized sibling worktree separately and never silently initializes another checkout.
- Automatic checkpoints exclude earlier harness checkpoints from their own inputs, preventing recursive context growth.
- Every checkpoint retains source event IDs, source hashes, pack manifests, retrieval coverage, and an idempotent run identity.
- The default summary is deterministic and extractive. An optional versioned host summarizer receives only the already bounded, untrusted pack and remains outside the automatic hook.
- The runtime API, CLI, TypeScript declarations, strict JSON Schema, Codex and Claude plugin runtimes, clean-consumer test, documentation, and website ship from the same reviewed tree.

## Measured claim

The frozen six-fixture software-task benchmark remains `442,113` portable estimated baseline tokens versus `5,682` Qarinah-pack tokens: `98.7148%` less estimated repeated context and a `77.81:1` baseline-to-pack ratio. That result is a reproducible fixture measurement, not a guarantee for every repository, model, provider bill, or live harness run. The harness therefore displays its actual per-run estimate instead of substituting the published benchmark.

## Safety and compatibility

- Existing workspaces and events remain readable.
- Each worktree keeps its own ledger, consent, capture mode, and checkpoint identity.
- Repository-wide reads are report-only; recording requires one current worktree.
- Invalid options are rejected before workspace reads or writes.
- Aborted or oversized optional summaries do not create partial checkpoints.
- Metadata capture stores the receipt and measurements without retaining summary text.

## Install

```sh
npm install qarinah@0.3.0
npx qarinah setup . --capture content --allow-query --auto-compact
npx qarinah harness "current task" --format markdown
npx qarinah harness "current task" --worktrees
```

Release only the reviewed commit whose package, generated plugins, types, schema, site, benchmark evidence, and trusted-publishing artifact pass the complete release gate.
