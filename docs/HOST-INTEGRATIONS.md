# Host integrations

Qarinah keeps one local event/graph/compiler core and uses thin host adapters. A host integration may observe only fields the host explicitly supplies. It must not parse transcripts, recover hidden reasoning, inherit browser authentication, or silently initialize a workspace.

## Supported surfaces

| Surface | Distribution | Capture | Retrieval | Status |
| --- | --- | --- | --- | --- |
| ChatGPT desktop Work mode/Codex, Codex CLI | Codex plugin | Ten Codex lifecycle hooks on supported local hosts | Skill, CLI, local zero-write MCP diagnostics | Implemented, packaged, and tested |
| Codex IDE extension | Project/global skill or explicit CLI | No plugin lifecycle-hook claim | Skill or CLI | Plugin installation is not supported by this surface |
| Claude Code / Claude CLI | Claude plugin | Session, prompt, tool, compaction, stop, subagent, session-end hooks | Skill, CLI, local zero-write MCP diagnostics | Implemented; native manifest validation passes |
| ChatGPT web Work mode / Claude.ai web | Remote authenticated MCP app or connector | No local filesystem hooks | Remote service only | Not shipped; the local ledger is not uploaded implicitly |
| Other MCP-capable hosts | User-supplied stdio MCP configuration | No implicit host capture | Local zero-write MCP diagnostics | Contract-compatible; host conformance required |
| Hosts without MCP | Explicit CLI or future versioned JSONL adapter | Host-specific | CLI | No universal-support claim |

The Codex package follows OpenAI's current plugin layout: `.codex-plugin/plugin.json`, `skills/`, `hooks/`, and `.mcp.json`. The Claude package follows Anthropic's plugin layout: `.claude-plugin/plugin.json`, `skills/`, `hooks/`, and `.mcp.json`. Claude automatically discovers the standard `hooks/hooks.json` component, so its manifest intentionally does not name that file again.

## Local development

Build both standalone runtimes:

```powershell
npm run build:plugins
```

Validate both packages and the Qarinah context skill:

```powershell
python C:\path\to\plugin-creator\scripts\validate_plugin.py integrations/codex/qarinah
python C:\path\to\skill-creator\scripts\quick_validate.py integrations/codex/qarinah/skills/qarinah-context
claude plugin validate integrations/claude/qarinah
```

The repository contains local marketplace catalogs for both hosts. From a reviewed clone, install into an isolated development profile with:

```powershell
codex plugin marketplace add .
codex plugin add qarinah@qarinah

claude plugin marketplace add . --scope local
claude plugin install qarinah@qarinah --scope local
```

Claude's plugin manifest requires `node_path` as a file-valued user setting and passes it in exec form to every hook and its MCP server. During enablement, use Claude's plugin configuration UI to select an absolute trusted Node 22, 24, or 26 executable outside the project. The installed Claude CLI may not yet expose the newer documented `plugin install --config` flag, so the command above intentionally uses only the broadly available `--scope` option. The host checks that a required file value exists; the user must review that its resolved path is absolute and outside project control. Qarinah then rejects unsupported Node major versions after launch.

The current Codex plugin schema has no corresponding per-plugin executable-path setting. Its bundled hooks require a separate host trust review, change the process directory to the installed plugin root before invoking Node (preventing a workspace-local `node.exe`/`node.cmd` from winning Windows current-directory lookup), and its local MCP definition starts in that same plugin root. Both still follow the host's standard bare-`node` pattern. Before trusting the plugin, verify the remaining `PATH` resolution selects a trusted Node 22, 24, or 26 installation (for example, `(Get-Command node -CommandType Application).Source` on PowerShell). This host-level interpreter resolution is an explicit boundary, not protection Qarinah can enforce after an interpreter has already launched.

For an install-free Claude development session, use `claude --plugin-dir integrations/claude/qarinah` instead. Do not distribute either private-alpha catalog as a public marketplace until the name, license, threat-model, and artifact gates in `docs/LAUNCH.md` are complete.

Both hosts copy plugins into versioned caches. Editing the source folder does not mutate an installed plugin; reinstall after each reviewed build and start a new Codex task or reload Claude plugins so hooks, skills, and MCP servers use the new artifact. Treat bundled hooks as executable configuration: review the exact plugin, its resolved interpreter, and trust the configuration only when the host prompts for it. Qarinah does not bypass host trust decisions.

Workspace re-trust is also exact: `qarinah policy` prints the requested capture policy and digest without granting permission; `qarinah trust` requires that digest and reloads it under the workspace lock. Confirming only `metadata` or `content` is insufficient.

## Read-only MCP contract

The bundled stdio server exposes only:

- `context_status`: verifies that the active workspace opted in and is machine-trusted;
- `context_doctor`: checks the hash chain, checkpoint, and persisted index/graph/Markdown currency without repair;

Both tools advertise `readOnlyHint: true`, `openWorldHint: false`, and `destructiveHint: false`. They do not advance the machine-local checkpoint, repair derived state, or disclose absolute workspace paths. The server negotiates MCP lifecycle/version, supports client filesystem roots, caps newline-delimited JSON-RPC frames, emits protocol messages only on stdout, and sends no credentials over the protocol.

Durable writes and automatic context disclosure are intentionally absent. Writes remain explicit CLI operations or Maqam `ToolGateway` calls with exact one-use approval. Context packs are available through a Maqam-scoped `context.query` capability, or through the compatibility CLI when the user explicitly requests a direct local query. Model-facing CLI calls use only `record --stdin-json` and `query --stdin-json`: the bounded request object travels through process stdin, never through shell-interpolated text or model-controlled argv.

## Context and model budgets

Do not hardcode product behavior to names such as “Ultra,” “Max,” or a specific model generation. Hosts rename models and expose different context windows. Use deterministic per-call budgets instead:

1. start with focused task terms;
2. use the Maqam-scoped query capability, or an explicitly user-directed `query --stdin-json` request, for the smallest pack that can answer the task;
3. carry event IDs and hashes into subagent handoffs;
4. query again only when the task changes;
5. keep model effort as metadata, not authority.

`budget.usedChars` is an exact ceiling over both rendered JSON and Markdown. Callers may also supply `maxTokens`, `reserveTokens`, deterministic framing/citation/content reservations, and a synchronous versioned token estimator. Without a host estimator, Qarinah uses the portable characters-divided-by-four fallback and marks it as inexact. `reservedTokens` is output/tool headroom removed before context allocation; `usedTokens` must fit the remaining `availableTokens`. Provider billing remains outside this contract, so callers should keep a conservative character ceiling when a model family tokenizes the working language more densely.

Claude's exposed effort level and Codex's exposed model field may be recorded in metadata mode. Neither grants disclosure authority or changes disclosure policy. Large-context models receive no automatic MCP context pack.

## Key and cost boundary

The ledger, generated runtimes, hooks, hybrid local retrieval, graph, and local MCP server need no separate API key. The AI host still requires whatever subscription, local model, or provider access it normally uses. “No ledger API key” must never be shortened to “all AI and internet access is free or keyless.”

Official references: [OpenAI plugin and skill manual](https://learn.chatgpt.com/), [Claude Code plugins](https://code.claude.com/docs/en/plugins), [Claude Code hooks](https://code.claude.com/docs/en/hooks), and [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle).
