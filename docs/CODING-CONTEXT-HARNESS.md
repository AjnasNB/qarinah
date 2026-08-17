# Coding context harness

Qarinah can sit between a coding agent's visible lifecycle events and its next model request. The harness keeps the verified worktree ledger as the source of truth, retrieves a bounded cited pack for the current task, measures that pack against the retained source events, and can record an idempotent compact checkpoint after a completed turn.

## Enable automatic turn checkpoints

Run setup in each checkout that should retain its own activity:

```sh
npx qarinah setup . --capture content --allow-query --auto-compact
```

`--auto-compact` adds an ordered Stop hook for Codex and Claude Code. The normal capture hook records the completed turn first. The harness then compiles a bounded pack and records one evidence-linked checkpoint for that source head. Replaying the hook without a new source event reuses the existing checkpoint instead of creating a chain of duplicate summaries.

The automatic hook uses `--no-rebuild`: it appends the compact checkpoint to the authoritative ledger without making every completed turn pay for a full derived-view rebuild. On-demand reads still compile from the verified ledger, and `qarinah build` refreshes SQLite, graph, Markdown, and dashboard projections when needed.

Metadata-only setup is also supported:

```sh
npx qarinah setup . --capture metadata --auto-compact
```

In metadata mode, the checkpoint keeps its measured counts, pack manifest, source event IDs, and hashes, but does not retain model-facing summary text.

## Prepare context on demand

Current checkout:

```sh
npx qarinah harness "release readiness" --format markdown
```

Record the compact checkpoint:

```sh
npx qarinah harness "release readiness" --record
```

Inspect every live Git worktree in the same repository:

```sh
npx qarinah harness "release readiness" --worktrees
```

Every initialized worktree is compiled separately. Uninitialized worktrees are reported as such. Their contents are never merged into another checkout's pack.

Repository-wide inspection is read-only. `--worktrees` cannot be combined with `--record`, because a crash across multiple writable worktrees could otherwise leave only part of the repository group checkpointed. Run `--record` inside each intended worktree instead.

## Optional model-assisted compaction

The core compiler is deterministic and does not need a model API. A host can optionally summarize the already bounded cited pack:

```js
import { runCodingContextHarness } from "qarinah";

const result = await runCodingContextHarness({
  cwd: process.cwd(),
  query: "finish the database migration",
  maxTokens: 1800,
  reserveTokens: 300,
  record: true,
  summarizer: {
    id: "my-host-model",
    async summarize(input, { signal }) {
      // Send only input.pack to the chosen local or hosted model.
      // Treat input.contentRole === "untrusted-data" as a hard boundary.
      return {
        text: await summarizeWithMyHost(input.pack, { signal }),
        model: "my-reviewed-model"
      };
    }
  }
});
```

The callback receives the bounded pack, not hidden reasoning or an undisclosed transcript. Its output is redacted, length-bounded, marked `model-assisted-v1`, and treated as untrusted lossy text. The host adapter must remain side-effect-free and honor the supplied `AbortSignal`; Qarinah cannot cancel side effects performed inside an arbitrary third-party callback. A recorded checkpoint cites every selected source event ID and hash plus the complete pack manifest. The append-only JSONL ledger remains authoritative.

Treat the summarizer `id` as a versioned behavior identity. Change it when the prompt, model, or compaction policy changes; an unchanged ID deliberately reuses the existing idempotent checkpoint for the same source head instead of paying for another model call.

## Metrics

Each ready worktree reports:

- canonical characters and portable estimated tokens in its verified non-harness source events;
- estimated tokens in the compiled pack;
- estimated tokens saved, reduction percentage, and baseline-to-pack ratio;
- whether that particular local estimate reaches the published 98.71% comparison;
- the exact pack manifest and optional checkpoint event identity.

The embedded published reference is **442,113 baseline tokens versus 5,682 Qarinah pack tokens**, or **98.7148% less estimated repeated input context and a 77.81:1 baseline-to-pack ratio**, across the committed six-fixture comparison. It is not a promise that every repository, session, model context, or provider bill will fall by 98.71%. The harness reports the actual estimate for the current retained ledger rather than replacing it with the published number.

## What “automatic” does and does not mean

The installed host hooks automatically retain only the lifecycle fields that Codex or Claude Code explicitly provide and the workspace policy permits. Qarinah does not scrape hidden chain-of-thought, ignored files, private browser state, credentials, or a chat that was never captured or imported. Project scanning remains an explicit bounded operation. Automatic compaction derives from verified retained events and can always be expanded through its event IDs, hashes, graph, SQLite read model, and Markdown views.

Use [`qarinah dashboard --serve --worktrees`](DASHBOARD.md) to inspect sibling worktrees and their graph, and use [`qarinah query`](TOKEN-EFFICIENT-CONTEXT.md) when a host needs only one task-specific pack without recording a checkpoint.
