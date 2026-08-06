# MCP guide

Qarinah 0.1.4 includes a native, zero-write Model Context Protocol server. It always provides local ledger status and integrity diagnostics. It provides `context.query` only after the user creates an explicit permit bound to the exact workspace, current consent-policy hash, and response ceilings.

That narrow boundary is intentional:

- project capture is explicit;
- durable writes remain CLI operations or separately governed Maqam capabilities;
- model-facing context disclosure is explicit and consent-gated;
- diagnostic tools cannot expand their own authority.

## Package and registry identity

| Field | Value |
| --- | --- |
| MCP name | `io.github.AjnasNB/qarinah` |
| npm package | `qarinah` |
| Version | `0.1.4` |
| Transport | `stdio` |
| CLI entry | `npx qarinah mcp` |
| Default tools | `context_status`, `context_doctor` |
| Permitted tool | `context.query` |

Authorized `context.query` calls accept `format: "pack"` (default) or `format: "handoff"`. The handoff representation is a bounded model-facing summary pointer linked to the selected event and complete pack manifest. It does not weaken disclosure permits or replace the auditable pack.

The registry declaration is stored in the repository's `server.json`. The npm package also publishes `mcpName: "io.github.AjnasNB/qarinah"`.

## Requirements

- Node.js 22, 24, or 26.
- A local Qarinah installation or a reviewed Qarinah host plugin.
- An initialized, enabled workspace.
- Valid machine-local trust for that exact workspace and policy.
- A host that supports newline-delimited stdio MCP.

Initialize, install the three supported host integrations, authorize bounded retrieval, and verify the project:

```sh
npx -y qarinah@latest setup . --codex --claude --cursor --capture content --allow-query
```

## Direct stdio command

The diagnostic-only server command is:

```sh
npx qarinah mcp
```

An authorized query server must receive the exact reviewed policy hash:

```sh
npx qarinah mcp \
  --allow-query \
  --policy-hash sha256:<reviewed-policy-digest> \
  --max-chars 12000 \
  --max-items 20
```

For a host configuration that accepts an MCP command object:

```json
{
  "mcpServers": {
    "qarinah-context": {
      "command": "npx",
      "args": ["-y", "qarinah@0.1.0", "mcp"]
    }
  }
}
```

Using a project-local executable avoids downloading at process start:

```json
{
  "mcpServers": {
    "qarinah-context": {
      "command": "node",
      "args": ["/absolute/project/node_modules/qarinah/bin/qarinah.js", "mcp"],
      "cwd": "/absolute/project"
    }
  }
}
```

Review the resolved executable and package location before trusting either form. Do not allow a repository-controlled `node`, `npx`, or wrapper earlier on `PATH`.

## Codex plugin

The packaged Codex integration defines:

```json
{
  "mcpServers": {
    "context": {
      "command": "node",
      "args": ["./runtime/qarinah.mjs", "mcp"],
      "cwd": "."
    }
  }
}
```

Install the reviewed release:

```sh
codex plugin marketplace add AjnasNB/qarinah --ref v0.1.0
codex plugin add qarinah@qarinah
```

Then start a new Codex task. Existing tasks do not hot-swap an MCP process from a newly installed plugin cache.

Current Codex hosts do not guarantee filesystem roots to plugin MCP servers. Pass the current task's absolute workspace path in each tool call:

```json
{
  "workspace": "D:\\projects\\shop"
}
```

or:

```json
{
  "workspace": "file:///D:/projects/shop"
}
```

Codex plugin installation is personal, while Qarinah trust remains project-specific.

## Claude Code plugin

The packaged Claude integration defines:

```json
{
  "mcpServers": {
    "context": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/runtime/qarinah.mjs", "mcp"]
    }
  }
}
```

Install:

```sh
claude plugin marketplace add AjnasNB/qarinah@v0.1.0 --scope user
claude plugin install qarinah@qarinah --scope user
```

Project and local scopes are also supported by Claude Code:

```sh
claude plugin marketplace add AjnasNB/qarinah@v0.1.0 --scope project
claude plugin install qarinah@qarinah --scope project
```

After changing a plugin, run:

```text
/reload-plugins
```

Claude can resolve a workspace from `CLAUDE_PROJECT_DIR` or negotiated MCP roots. Passing the exact absolute `workspace` argument remains the most portable and auditable selection.

## Tool: `context_status`

Reads the trusted local ledger status without initializing, trusting, repairing, or changing it.

Definition:

```json
{
  "name": "context_status",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workspace": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "openWorldHint": false
  }
}
```

Input:

| Field | Required | Meaning |
| --- | --- | --- |
| `workspace` | Recommended; required when the host cannot identify one exact root | Non-empty absolute local path or local `file:` URI. |

Successful structured content:

```json
{
  "ok": true,
  "workspaceId": "ws_...",
  "eventCount": 12,
  "headHash": "sha256:...",
  "capture": "metadata",
  "enabled": true,
  "contextMaxChars": 12000
}
```

The result intentionally omits the absolute root.

## Tool: `context_doctor`

Verifies the authoritative store and checks persisted derived state without rebuilding or updating a checkpoint.

Input is identical to `context_status`.

Successful current result:

```json
{
  "ok": true,
  "workspaceId": "ws_...",
  "eventCount": 12,
  "headHash": "sha256:...",
  "capture": "metadata",
  "derived": "current"
}
```

If the event store verifies but derived state is unavailable:

```json
{
  "ok": false,
  "workspaceId": "ws_...",
  "eventCount": 12,
  "headHash": "sha256:...",
  "capture": "metadata",
  "derived": "INDEX_STALE"
}
```

The tool does not repair this condition. Review it locally and run `npx qarinah build` if the authoritative chain is valid.

## Tool: `context.query`

Compiles a bounded, cited context pack without writing to the workspace. This tool is listed only when the server has the exact disclosure permit described below.

```json
{
  "workspace": "D:\\projects\\shop",
  "query": "release provenance",
  "limit": 10,
  "maxChars": 8000,
  "minimumCoverage": "direct",
  "minimumEvidence": "partial",
  "temporalBoundary": "strict-before",
  "asOf": "2026-08-05T07:30:00.000Z"
}
```

Retrieval uses the `admission-first-v2` profile: repository, time, retention, disclosure, and supersession admission happens before ranking; admissible lexical candidates retain BM25 order, and fuzzy or graph evidence may only fill gaps. `temporalBoundary: "strict-before"` excludes evidence at the exact `asOf` timestamp and is recommended for prequential research evaluation. The default `inclusive` boundary is appropriate for normal as-of queries.

`minimumEvidence` accepts `any`, `partial`, or `direct`. A stricter value returns `CONTEXT_EVIDENCE_INSUFFICIENT` when the deterministic evidence diagnostic does not meet the requested level. In `evidence-sufficiency-v2`, only `DIRECTLY_SUPPORTED` produces `ACCEPT_DIRECT`; partial and insufficient evidence both produce `ABSTAIN`. The frozen development run observed zero direct false accepts at the conservative 0.65 operating point, but exact 95% upper bounds remain 7.25% static and 11.22% online and acceptance coverage is only 3.33%-5.00%. Callers must still inspect cited records and reason codes.

## Tool result errors

Expected operational failures are returned as MCP tool results with:

- textual JSON content;
- matching `structuredContent`;
- `isError: true`.

Safe messages are exposed for:

```text
WORKSPACE_NOT_INITIALIZED
WORKSPACE_DISABLED
WORKSPACE_NOT_TRUSTED
TRUST_REVIEW_REQUIRED
CAPTURE_NOT_APPROVED
INDEX_STALE
INDEX_INVALID
EVENT_LOG_MISSING
MCP_TOOL_NOT_FOUND
CONTEXT_COVERAGE_TOO_LOW
CONTEXT_EVIDENCE_INSUFFICIENT
```

Other internal errors are reduced to a stable code and the generic message:

```text
Context Ledger could not complete the request.
```

The protocol does not disclose absolute workspace paths.

## Workspace selection

The server resolves a workspace in this order:

1. Explicit `workspace` tool argument.
2. `cwd` supplied programmatically to `createMcpServer` or `runMcpServer`.
3. `CLAUDE_PROJECT_DIR`, if no earlier candidate exists.
4. Client-advertised MCP filesystem roots.
5. Server process current directory as a non-exact fallback.

An explicit selector is exact:

- it must be an absolute path or valid local `file:` URI;
- it must resolve to the initialized root itself;
- the server does not accept a child path that merely walks up into an initialized parent.

If a client advertises several trusted workspaces and no exact selector chooses one, the server returns `MCP_WORKSPACE_AMBIGUOUS`.

## Protocol behavior

The server supports:

```text
2024-11-05
2025-03-26
2025-06-18
```

If the requested version is not in that set, initialization responds with `2025-06-18`.

Supported requests:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Supported notification:

- `notifications/roots/list_changed`, which invalidates the cached root list

Other methods return JSON-RPC `-32601`.

Important protocol errors:

| JSON-RPC code | Condition |
| --- | --- |
| `-32700` | Invalid JSON or a frame over the configured byte limit. |
| `-32600` | Invalid JSON-RPC object or repeated initialization. |
| `-32602` | `tools/call` lacks a string tool name. |
| `-32601` | Unsupported method. |
| `-32002` | A request arrived before initialization. |
| `-32603` | Unexpected request-processing failure, with a safe Qarinah code in `data`. |

The transport reads one JSON object per line. Default maximum frame size is 1 MiB. Programmatic callers may choose 1,024 through 16,777,216 bytes.

When a client advertises roots, the server sends `roots/list` and waits up to three seconds. Timeout produces `MCP_CLIENT_TIMEOUT`.

## Programmatic server

```js
import { createMcpServer } from "qarinah/mcp";

const messages = [];
const server = createMcpServer({
  cwd: "/absolute/project",
  write(message) {
    messages.push(message);
  }
});

await server.handle({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {}
  }
});

await server.handle({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "context_status",
    arguments: { workspace: "/absolute/project" }
  }
});

server.close();
```

For stream transport:

```js
import { runMcpServer } from "qarinah/mcp";

await runMcpServer({
  cwd: "/absolute/project",
  input: process.stdin,
  write(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }
});
```

## Context retrieval is explicit and consent-gated

The MCP server exposes `context.query` only when all of these conditions hold:

1. the exact workspace is initialized, enabled, and trusted;
2. setup or the caller passes `--allow-query`;
3. the supplied `--policy-hash` matches the workspace's current consent policy;
4. the request selects the exact workspace rather than an opted-in parent; and
5. the requested item and character limits remain within the permit.

The tool performs a verified, zero-write compilation with no implicit rebuild or checkpoint advancement. It returns a bounded cited context pack and cannot initialize, grant trust, append, repair, walk into another workspace, or enlarge its own permit.

Without a query permit, only `context_status` and `context_doctor` are listed. Users may also run `qarinah query`, call `compileContext`, or register Qarinah's separately exported Maqam `context.query` capability.

Durable append remains absent from MCP. The Maqam `context.append` adapter is a high-risk write capability with exact execution verification and required approval.

Do not describe the diagnostic tools as model memory injection or describe permitted `context.query` as ambient disclosure.

## Verification

Repository maintainers can run the packaged transport test:

```sh
npm run build:plugins
npm run mcp:smoke
```

The smoke suite:

- starts both packaged host runtimes;
- negotiates lifecycle;
- tests Codex without advertised roots using an explicit workspace;
- tests Claude with negotiated roots;
- verifies the default diagnostic tools;
- verifies that `context.query` is absent without a permit and bounded by an exact permit when enabled;
- requires the process to remain alive until the client closes stdin;
- rejects unexpected standard-error output.

## Troubleshooting

### Host reports a closed transport

1. Confirm a trusted Node 22, 24, or 26:

   ```powershell
   (Get-Command node -CommandType Application).Source
   node --version
   ```

2. Confirm plugin state:

   ```sh
   codex plugin list
   codex mcp list

   claude plugin list
   claude mcp list
   ```

3. Reinstall the reviewed plugin.
4. Start a new Codex task or run `/reload-plugins` in Claude Code.
5. Run `npm run mcp:smoke` in a reviewed source checkout if diagnosing the package itself.

The server cannot reopen a pipe that its host has already closed.

### `WORKSPACE_NOT_INITIALIZED`

Pass the exact initialized root, not a child directory:

```json
{ "workspace": "/absolute/project-root" }
```

Then verify locally:

```sh
cd /absolute/project-root
npx qarinah status
```

### `WORKSPACE_NOT_TRUSTED`

Trust cannot be granted through MCP:

```sh
npx qarinah policy .
# Review the exact result.
npx qarinah trust . --capture metadata --policy-hash sha256:<reviewed-digest>
```

### `INDEX_STALE` or `derived` is not `current`

MCP never repairs state:

```sh
npx qarinah doctor
npx qarinah build
npx qarinah doctor
```

Do not rebuild if `doctor` reports checkpoint rollback, mismatch, or authoritative log corruption.

See [Troubleshooting](TROUBLESHOOTING.md) for the full recovery matrix.
