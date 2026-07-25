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

## Install once, initialize each project

The host plugin and the project ledger have different scopes:

- install the plugin once so Codex or Claude Code can load the reviewed hooks, context skill, and zero-write diagnostics;
- initialize only the repository roots that are allowed to retain Qarinah records; and
- request a cited pack when a task needs prior evidence. Qarinah does not inject the complete history automatically.

Install the version-pinned stable release for personal use across projects:

```powershell
codex plugin marketplace add AjnasNB/qarinah --ref v0.1.0
codex plugin add qarinah@qarinah

claude plugin marketplace add AjnasNB/qarinah@v0.1.0 --scope user
claude plugin install qarinah@qarinah --scope user
```

Claude Code also supports repository-shared `project` scope and gitignored per-user `local` scope:

```powershell
claude plugin marketplace add AjnasNB/qarinah@v0.1.0 --scope project
claude plugin install qarinah@qarinah --scope project

# Or keep the enablement personal to this repository.
claude plugin marketplace add AjnasNB/qarinah@v0.1.0 --scope local
claude plugin install qarinah@qarinah --scope local
```

Codex plugin installation is personal rather than repository-scoped. The Qarinah workspace boundary supplies the per-project opt-in. From each project root:

```powershell
npx -y qarinah@latest init . --capture content
npx -y qarinah@latest scan
npx -y qarinah@latest doctor
```

Choose `metadata` instead of `content` when prompt, tool-output, source, and completion bodies should not be retained. Content capture is bounded and redacted but remains security-sensitive.

To recover context in a later task, use the installed `qarinah-context` skill and request direct evidence for the task terms. The equivalent explicit local command is:

```powershell
npx -y qarinah@latest query "orders idempotency migration" `
  --minimum-coverage direct `
  --max-tokens 1500 `
  --reserve-tokens 200 `
  --format markdown
```

The compiler selects retained event bodies and cites their event IDs and hashes. It does not make a model-generated summary authoritative. Required current source files still need to be read for the edit; Qarinah replaces replay of unrelated accumulated history.

For consistent task behavior, a repository `AGENTS.md` for Codex or `CLAUDE.md` for Claude Code can include this instruction:

> When prior project decisions, approvals, sources, or tool outcomes could affect the task, use the Qarinah context skill first. Request the smallest direct-evidence pack for the task terms. Do not load the complete event log or generated `CONTEXT.md` into the model.

Start a new Codex task after installation. In an active Claude Code session, run `/reload-plugins`. Both hosts cache installed plugin contents, so source edits require a reviewed rebuild, reinstall, and reload rather than taking effect silently.

### MCP health and recovery

The host process owns the stdio pipe. Qarinah cannot reopen an already-closed pipe from inside the server process. After installing or upgrading the plugin:

```powershell
codex plugin list
codex mcp list

claude plugin list
claude mcp list
```

Codex should list the enabled `context` server from the installed Qarinah cache. Start a new Codex task after a plugin reinstall or cache upgrade; an active task does not hot-swap its plugin MCP process. Claude should list `plugin:qarinah:context` as connected; run `/reload-plugins` after a plugin change. If either host still reports a closed transport, first verify that its listed command resolves to a trusted Node 22, 24, or 26 executable and that the installed plugin version matches the reviewed source.

Repository maintainers can exercise the complete packaged stdio path without an AI model or API key:

```powershell
npm run build:plugins
npm run mcp:smoke
```

The smoke probe runs both bundled host manifests, calls `context_status` and `context_doctor` against a temporary opted-in ledger, requires the server to remain alive until the client closes stdin, and rejects unexpected stderr output. Its Codex case deliberately omits MCP roots and passes the exact workspace selector; its Claude case negotiates `roots/list`.

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
npm run mcp:smoke
```

The repository contains local marketplace catalogs for both hosts. From a reviewed clone, install into an isolated development profile with:

```powershell
codex plugin marketplace add .
codex plugin add qarinah@qarinah

claude plugin marketplace add . --scope local
claude plugin install qarinah@qarinah --scope local
```

The version-pinned install flow is:

```powershell
codex plugin marketplace add AjnasNB/qarinah --ref v0.1.0
codex plugin add qarinah@qarinah

claude plugin marketplace add AjnasNB/qarinah@v0.1.0
claude plugin install qarinah@qarinah
```

Codex installs from a configured Git marketplace snapshot. Claude Code clones the Git marketplace and copies the plugin into its versioned cache. The repository catalogs use only paths inside the same reviewed checkout.

Claude's plugin manifest requires `node_path` as a file-valued user setting and passes it in exec form to every lifecycle hook. During enablement, use Claude's plugin configuration UI to select an absolute trusted Node 22, 24, or 26 executable outside the project. The installed Claude CLI may not yet expose the newer documented `plugin install --config` flag, so the command above intentionally uses only the broadly available `--scope` option. The host checks that a required file value exists; the user must review that its resolved path is absolute and outside project control. Qarinah then rejects unsupported Node major versions after launch.

Claude's plugin MCP manifest intentionally uses the documented portable `node` stdio command with an absolute `${CLAUDE_PLUGIN_ROOT}` runtime argument. This keeps the read-only diagnostic server available after a noninteractive marketplace install even when the host has not restored the hook-only `node_path` setting. Review `(Get-Command node -CommandType Application).Source` before enabling it. The MCP server still rejects Node majors outside 22, 24, and 26 after launch.

The current Codex plugin schema has no corresponding per-plugin executable-path setting. Its bundled hooks require a separate host trust review, change the process directory to the installed plugin root before invoking Node (preventing a workspace-local `node.exe`/`node.cmd` from winning Windows current-directory lookup), and its local MCP definition starts in that same plugin root. Both still follow the host's standard bare-`node` pattern. Before trusting the plugin, verify the remaining `PATH` resolution selects a trusted Node 22, 24, or 26 installation (for example, `(Get-Command node -CommandType Application).Source` on PowerShell). This host-level interpreter resolution is an explicit boundary, not protection Qarinah can enforce after an interpreter has already launched.

For an install-free Claude development session, use `claude --plugin-dir integrations/claude/qarinah` instead. Distribute only the reviewed catalog from the release tag.

Both hosts copy plugins into versioned caches. Editing the source folder does not mutate an installed plugin; reinstall after each reviewed build and start a new Codex task or reload Claude plugins so hooks, skills, and MCP servers use the new artifact. Treat bundled hooks as executable configuration: review the exact plugin, its resolved interpreter, and trust the configuration only when the host prompts for it. Qarinah does not bypass host trust decisions.

Workspace re-trust is also exact: `qarinah policy` prints the requested capture policy and digest without granting permission; `qarinah trust` requires that digest and reloads it under the workspace lock. Confirming only `metadata` or `content` is insufficient.

## Read-only MCP contract

The bundled stdio server exposes only:

- `context_status`: verifies that the selected workspace opted in and is machine-trusted;
- `context_doctor`: checks the selected workspace's hash chain, checkpoint, and persisted index/graph/Markdown currency without repair;

Both tools accept an optional `workspace` string containing an absolute local path or `file:` URI. Pass the current task workspace explicitly on Codex because current Codex hosts do not guarantee MCP filesystem roots to plugin servers. Claude can resolve its project through `CLAUDE_PROJECT_DIR` or negotiated roots, but the same explicit selector is portable. Qarinah treats every selector as an exact boundary: it never walks up into an opted-in parent, never initializes or trusts the target, and never returns the absolute path in the tool result.

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
