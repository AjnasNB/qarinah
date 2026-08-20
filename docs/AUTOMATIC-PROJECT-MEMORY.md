# Automatic project memory

`qarinah watch` is an explicit, foreground project watcher. It notices bounded source changes by running the same reviewed project scanner as `qarinah scan`, refreshes the JavaScript/TypeScript symbol graph, records one cited incremental context checkpoint, and rebuilds the disposable JSON, graph, Markdown, dashboard, and SQLite views.

```sh
npx qarinah watch --once
npx qarinah watch --interval-ms 2000
```

The watcher is deliberately not a hidden startup service. Closing the process stops observation. It never searches unrelated folders or other desktop applications. Each cycle uses the initialized workspace root and its active capture policy. Project ignore files, generated/dependency exclusions, secret-name exclusions, link rejection, and scan resource ceilings remain in force.

## Incremental behavior

An unchanged source snapshot produces a small `changed:false` cycle receipt and does not write another checkpoint or rebuild derived views. A changed snapshot performs this serial sequence:

1. append a hash-linked project-structure event;
2. verify source hashes and rebuild the local symbol graph;
3. compile and idempotently record a cited coding-context checkpoint;
4. regenerate the derived index, linked graph, Markdown views, dashboard, and SQLite read model.

Only one cycle runs at a time. `SIGINT`, `SIGTERM`, the API `stop()` method, or an `AbortSignal` interrupts the wait between cycles and every downstream operation that supports cancellation. Qarinah finishes already-started atomic recovery metadata rather than leaving a partially committed ledger write.

## API

```js
import { createProjectMemoryWatcher, runProjectMemoryCycle } from "qarinah";

const receipt = await runProjectMemoryCycle({ cwd: process.cwd() });
console.log(receipt.changed, receipt.cycleHash);

const watcher = createProjectMemoryWatcher({
  cwd: process.cwd(),
  intervalMs: 2_000,
  onCycle(cycle) {
    console.log(cycle.changed, cycle.scan.snapshotHash);
  }
});

process.once("SIGINT", () => watcher.stop());
await watcher.run();
```

The public receipt schema is exported as `qarinah/schemas/project-memory-cycle.json`. Cycle receipts describe actual local activity. They do not inherit the historical six-fixture 98.7148% context estimate.

## Retention boundary

Automatic compaction is a cited projection, not lossless compression. The append-only event ledger remains the source of truth, and exact selected project bytes can be preserved separately with the opt-in encrypted content archive. Qarinah does not claim that an arbitrary project, chat, or device history becomes lossless at the benchmark's context-reduction percentage.
