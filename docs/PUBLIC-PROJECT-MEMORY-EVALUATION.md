# Public-project memory evaluation

Qarinah 0.5 evaluates its memory pipeline against an isolated copy of Qarinah's own public repository checkout. This is a maintainer-run self-evaluation, not an independent benchmark. It uses no private data, provider model, learned embedding API, billing estimate, or wall-clock performance claim.

## Reproduce it

```sh
npm ci --ignore-scripts
npm run check:public-project-memory
```

The evaluator copies only Git-tracked public files into a temporary directory, initializes a new Git repository and a content-authorized Qarinah workspace there, scans the project, builds the multi-language symbol graph, queries four exact public definitions, records one bounded session lifecycle, builds a v2 session receipt, compiles a cited continuation pack, and verifies the complete event chain. It removes the temporary checkout after the run.

The current committed JSON result is [public-project-memory-v0.6.0-alpha.1.json](../bench/results/public-project-memory-v0.6.0-alpha.1.json). It binds the evaluator hash, package version, source-file manifest, exact observed counts, scenario outputs, implementation schemas, and limitations. Historical receipts remain unchanged.

## Current observed result

The checked artifact records 10/10 passing structural scenarios on 379 scanned public-project files and 52 directories. The symbol graph indexed all 179 eligible files in that checkout and observed 46,320 declarations and 97,688 identifier references. Exact definition queries found:

- `appendEvent` in `src/store.js`;
- `buildMemoryDashboard` in `src/dashboard.js`;
- `createMcpServer` in `src/mcp/server.js`; and
- `inspectGitWorktree` in `src/git-worktrees.js`.

The session proof records four source events, one completed turn, three outcome events, two delivered memory items, and two citations. Its receipt omits the source event bodies while the delivered pack retains the selected event ID and SHA-256 evidence hash.

These counts describe the exact committed artifact. They do not establish universal semantic accuracy, task success, superiority, latency, storage savings, or provider cost. A changed source manifest, evaluator, runtime contract, or result must produce a new reviewed artifact.
