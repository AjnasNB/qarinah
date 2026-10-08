# Persistent auto-initialization and summary-first chat memory

Qarinah remains metadata-only and per-project by default. An operator can now opt in once on a machine to automatic initialization of new project roots. Existing ledgers keep their capture policies, machine trust, and identity. Auto-init never re-enables disabled capture, re-trusts revoked memory, or merges unrelated projects.

## Install once for this user

Run the reviewed installed Qarinah CLI:

```sh
qarinah setup-user --capture content --full-chat
```

This installs a stable user-owned runtime, merges user-level integrations for Codex, Claude Code, Cursor, Antigravity, OpenCode, and Kilo, and then publishes the explicit machine-local opt-in. It backs up replaced files under `~/.qarinah/backups/` and records the actual configuration in `~/.qarinah/setup-report.json`. It does not install the host applications, change API keys/models, publish a release, or upload chat.

Limit setup to selected hosts:

```sh
qarinah setup-user --capture content --full-chat --hosts codex,claude,cursor
```

Codex installs stable user-level hooks, MCP, and skills, independent of marketplace cache upgrades. Review the new hooks once in `/hooks` after restarting. An existing Qarinah plugin is disabled and retained for rollback so it cannot duplicate capture. Claude also uses user-level MCP and global hooks; an outdated Qarinah plugin is disabled, not deleted. OpenCode and Kilo get a compatible plugin that uses public visible-message callbacks and JSON stdin. Their specific installed versions still require a host smoke test. Antigravity hooks retain only the metadata/tool inputs actually exposed by its documented payloads, not private transcript contents.

## Controls

```sh
qarinah auto-init status
qarinah auto-init disable
qarinah auto-init enable
```

Disabling auto-init stops creation of new ledgers. Existing opted-in project capture and retrieval remain available. To stop an existing project, use `qarinah disable` or `qarinah untrust`. A `.qarinah-stop` marker excludes a folder tree from automatic hooks. Global excluded roots and allowed roots are available through `configureAutoInit` and the CLI's `--root`/`--exclude-root` options. Empty allowed roots means any safe active project root, not a recursive scan of the machine.

New project hooks select the active Git root when present; the explicit `context.ensure_workspace` MCP write tool uses the exact supplied root. A project beneath an opted-in parent can therefore receive its own ledger. No startup sweep or every-prompt source-file scan is performed. Home/drive roots, linked directories, dependency directories, client caches, and Qarinah's own machine state are excluded.

## Chat storage and intelligent recall

`.qarinah/events/events.jsonl` remains authoritative. `.qarinah/records/CONTEXT.md` remains a compact recent-event preview. `.qarinah/records/CHAT.md` is a reproducible visible-chat archive of captured user prompts and exposed assistant messages. Long exposed messages are split into cited source chunks rather than silently discarding their endings. The existing host input ceiling remains 512 KiB per string; unsupported/private transcript content and hidden reasoning are not captured.

The retrieval workflow is:

1. `context.recall` with `detail: "summary"` retrieves small cited task summaries.
2. The calling model decides whether those summaries supply enough evidence.
3. When exact wording is needed, `context.recall` with `detail: "full"` and genuine `eventIds` returns bounded source text; `nextOffset` enables pagination.
4. `context.record_summary` stores a short model-written outcome/decision with genuine verified source IDs and `inferred` confidence. A deterministic extractive turn summary is also generated as a fallback.

Qarinah's local search does not call a model or embedding service secretly. Reasoning about relevance and whether to expand belongs to the calling model. Summaries are lossy and never replace source events or grant approval. Recall respects retention, temporal, disclosure, and repository admission rules.

These additional tools appear only when the server starts with `mcp --auto-init`. Initialization and summary storage are explicitly annotated write tools. Status, doctor, query, and recall stay zero-write.

## Remote and cloud environments

User home configuration is local to this machine. A cloud VM, container, remote host, or another laptop must install Qarinah and opt in separately. Codex cloud orchestration does not run ordinary local command hooks in all modes; Cursor cloud does not inherit local user hooks. Use that platform's supported project/admin integration, not a claim that a Windows user configuration covers every cloud chat.

Official host contracts consulted for this implementation:

- [Codex hooks](https://developers.openai.com/codex/hooks/)
- [Cursor hooks](https://cursor.com/docs/agent/hooks)
- [Antigravity hooks](https://antigravity.google/docs/hooks)
- [Antigravity MCP](https://antigravity.google/docs/mcp)
- [OpenCode plugins](https://opencode.ai/docs/plugins/)
- [Kilo MCP setup](https://kilo.ai/docs/automate/mcp/using-in-kilo-code)
