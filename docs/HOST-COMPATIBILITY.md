# Coding-agent host compatibility

Qarinah keeps one project-owned memory record and exposes a bounded, read-only MCP retrieval surface to supported coding agents. Native capture varies by host; the compatibility labels below distinguish tested configuration from portable import.

| Host | Project setup | Durable capture | Existing-history path |
| --- | --- | --- | --- |
| Codex | Project MCP config, lifecycle hooks, and Qarinah skills | Reviewed lifecycle adapter records permitted prompts, tools, approvals, compactions, turns, and subagents | Native Codex JSONL import |
| Claude Code | Project MCP config, lifecycle hooks, and Qarinah skills | Reviewed lifecycle adapter records permitted visible events | Native Claude JSONL import |
| Cursor | Project MCP config, always-on project rule, and VS Code-compatible panel | MCP retrieval; no claimed native transcript hook | Portable JSONL/NDJSON import |
| JetBrains IDEs | Packaged LSP4IJ custom template | Symbols, definitions, and references through project-local `qarinah-lsp` | No native plugin or IDE-history capture claim |
| Kimi Code | Project-local `.kimi-code/mcp.json` | MCP retrieval; no claimed native transcript hook | Explicit `--format kimi` for official stream-json message output |
| Classic Kimi CLI | Generated `.kimi/qarinah-mcp.json`, loaded with `--mcp-config-file` | MCP retrieval; no silent edits to the user-global config | Explicit `--format kimi` for official stream-json output |
| Google Antigravity | Workspace plugin under `.agents/plugins/qarinah/` with MCP and a project-memory rule | MCP retrieval; no claimed native transcript hook | Portable JSONL/NDJSON import after an operator-controlled export |
| Freebuff | Project-local agent definition under `.agents/qarinah-memory.js` | MCP retrieval; no claimed native transcript hook | Portable JSONL/NDJSON import after an operator-controlled export |
| Other MCP clients | Use the Qarinah stdio command and exact workspace permit | Depends on the client | Portable JSONL/NDJSON import |

## Editor symbol integration

The shipped VS Code extension provides the interactive Qarinah memory panel and runs in Cursor-compatible extension hosts. Qarinah also ships a separate standards-compatible `qarinah-lsp` stdio server for multi-language document symbols, workspace symbols, definitions, and references. Editors with a generic Language Server Protocol client can start that executable at the initialized project root. JetBrains users can import the packaged LSP4IJ template from `integrations/jetbrains/qarinah-lsp`.

Qarinah does not silently install editor-wide extensions. It does not ship a dedicated native JetBrains, Neovim, Emacs, or Visual Studio package; those hosts use their generic LSP client and the project-local MCP setup where available. The JetBrains template follows LSP4IJ's documented custom-template format and invokes only the dependency already installed in the project. See [Symbol graph and language server](SYMBOL-GRAPH.md).

Qarinah does not capture hidden reasoning, credentials, private browser state, or unsupported internal host files. A host without a reviewed event adapter still gets retrieval through MCP, but its chat/tool history enters Qarinah only through an explicit supported export.

## Preview, install, and remove one host safely

The 0.6.0-alpha.2 installer is deliberately narrower than `setup`: it handles one reviewed project-scoped host surface and records exact ownership. Always inspect the dry run first.

```sh
npx qarinah install . --host freebuff --scope project --dry-run
npx qarinah install . --host freebuff --scope project
npx qarinah uninstall . --host freebuff --scope project
```

Supported `--host` values are `codex`, `claude`, `cursor`, `kimi`, `antigravity`, and `freebuff`. The ownership manifest stores exact paths and installed digests. Uninstall refuses to delete a file that changed after installation and preserves unrelated shared configuration.

## Configure all supported project integrations

```sh
npx qarinah setup . --capture content
```

With no host flags, setup configures Codex, Claude Code, Cursor, Kimi Code/classic Kimi, and Antigravity. To configure only selected hosts:

```sh
npx qarinah setup . --kimi --antigravity
```

## Kimi

Kimi Code discovers the generated project-level `.kimi-code/mcp.json`. Classic Kimi CLI can load the separate project file without modifying `~/.kimi/mcp.json`:

```sh
kimi --mcp-config-file .kimi/qarinah-mcp.json
```

The generated stdio definition starts Qarinah in the exact project and binds an authorized query server to that workspace ID and policy hash. Keep Kimi's MCP approvals enabled.

Kimi's documented stream-json format contains user, assistant, tool-call, and tool-result messages. Capture an operator-approved stream and import it:

```sh
kimi --print -p "Run the reviewed task" --output-format=stream-json > kimi-session.jsonl
npx qarinah import ./kimi-session.jsonl --format kimi --mode compact
```

Compact mode records a cited session summary. Full mode retains each supported visible message/tool item and requires content-authorized capture. Thinking content is not part of Kimi's documented stream-json output.

Official contracts: [Kimi MCP](https://moonshotai.github.io/kimi-cli/en/customization/mcp.html), [Kimi print/stream-json](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html), and [Kimi Code project MCP](https://moonshotai.github.io/kimi-code/en/customization/mcp.html).

## Antigravity

Antigravity documents workspace plugins under `.agents/plugins/` and MCP definitions in `mcp_config.json`. Qarinah setup creates:

```text
.agents/plugins/qarinah/
├── plugin.json
├── mcp_config.json
└── rules/qarinah.md
```

The plugin makes the same read-only diagnostic and explicitly authorized retrieval tools available in Antigravity. The rule tells the agent to retrieve a bounded cited pack before replaying broad project history. It does not grant write authority.

Official contracts: [Antigravity plugins](https://www.antigravity.google/docs/plugins) and [Antigravity MCP](https://www.antigravity.google/docs/mcp).

## Freebuff

Qarinah generates a project-local Freebuff agent definition under `.agents/qarinah-memory.js`. It starts the same bounded stdio MCP surface and tells the host to retrieve a cited project pack before replaying broad history. The generated definition is inspectable, versioned, and reversible through the ownership manifest. It does not claim native Freebuff transcript capture or a universal host lifecycle.

## Verify the integration

```sh
npx qarinah doctor
npx qarinah status
```

In Kimi, inspect or test the MCP server through its MCP interface. In Antigravity, inspect the installed workspace plugin/MCP server and keep the default Ask permission for MCP tools until the exact read-only surface has been reviewed.
