# Coding-agent memory market comparison

**Reviewed:** 19 August 2026

**Scope:** public product documentation and repositories available on that date
**Purpose:** help a developer choose the right memory or code-context layer. This is not a ranking and there is no matched cross-product benchmark.

Qarinah is a local, project-owned memory layer for coding agents and Git worktrees. It records permitted decisions, visible outcomes, tool events, conflicts, source identities, and project structure in an append-only ledger. It then derives searchable graphs, session receipts, worktree comparisons, and bounded cited context packs. Qarinah does not replace a model, agent loop, IDE, vector database, or managed memory cloud.

## Quick decision guide

| If the main need is | Start with |
| --- | --- |
| Evidence-linked project history across coding hosts and Git worktrees | Qarinah |
| Managed personalization memory for an application | Mem0 or Zep |
| A complete stateful-agent runtime with editable memory blocks | Letta |
| Memory inside a LangGraph application | LangGraph/LangMem |
| Automatic knowledge-graph extraction with embeddings | Graphiti or Cognee |
| Native memory inside one commercial coding assistant | Copilot Memory, Cursor Memories, Windsurf Memories, Pieces, or Augment |
| High-quality symbol navigation and repository structure | Serena, Aider repository map, GitNexus, Codebase Memory MCP, or CodeGraphContext |
| Markdown-first personal knowledge exposed over MCP | Basic Memory |
| Multi-agent orchestration with shared vector/graph memory | Ruflo |

## Large and managed products

| System | Where it is strongest | Relevant overlap | Where Qarinah is stronger | Where Qarinah currently lacks |
| --- | --- | --- | --- | --- |
| [GitHub Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory) | Native repository memories automatically reused by Copilot coding agent | Cross-session repository facts | Independent project-owned evidence, exact event hashes, worktree-local ledgers, and cross-host portability | Copilot's native product integration and managed team experience |
| [Cursor Rules and Memories](https://docs.cursor.com/en/context/memories) | Low-friction memories and rules inside Cursor | Persistent coding context | Inspectable ledger, session receipts, conflicts, typed relations, and worktree comparison outside one editor | Native Cursor UI, automatic host-level memory creation, and deep editor integration |
| [Windsurf Memories](https://docs.windsurf.com/windsurf/cascade/memories) | Native Cascade memories and workspace rules | IDE-local continuity | Rebuildable local evidence graph and portable citations across supported hosts | Native Windsurf lifecycle, marketplace distribution, and editor polish |
| [Pieces Long-Term Memory](https://pieces.app/features/long-term-memory/ai-memory-assistant) | Passive, device-local activity context across apps and long time windows | Local long-term developer context | Explicit project scope, deterministic evidence chain, worktree boundaries, and reproducible context packs | Broad passive desktop capture and months of cross-application activity memory |
| [Augment Context Services](https://docs.augmentcode.com/context-services/overview) | Managed semantic code context across large codebases and teams | Repository retrieval and coding context | Local-first inspectability, open schemas, exact citations, and no hosted account requirement | Managed indexing scale, enterprise search operations, and native team distribution |
| [Sourcegraph Cody context](https://sourcegraph.com/docs/cody/core-concepts/context) | Code search and context across large Sourcegraph-managed codebases | Code-aware context selection | Durable decision/tool/outcome history and cross-worktree memory | Mature large-codebase search, code intelligence, and enterprise deployment |
| [Mem0](https://docs.mem0.ai/open-source/features/graph-memory) | Managed or self-hosted user, session, and agent memory with extraction and graph memory | Long-term memory, vector search, graph relations | Repository-owned ledgers, Git identity, citations, session receipts, deterministic model-free core | Automatic fact extraction, embedding retrieval, managed service, and broad application SDKs |
| [Zep and Graphiti](https://help.getzep.com/graphiti/getting-started/overview) | Temporal knowledge graphs with episodes, entities, relationships, and hybrid retrieval | Temporal graph memory and provenance | Software-project/worktree semantics, local files, exact event hashes, and coding-host adapters | Mature temporal entity extraction, embedding search, graph infrastructure, and hosted operations |
| [Letta](https://docs.letta.com/tutorials/attaching-detaching-blocks/) | Stateful agent runtime with memory blocks, tools, and agent APIs | Persistent agent state | Runtime-independent project memory shared across external coding agents | Complete agent loop, editable memory blocks, managed agents, and model orchestration |
| [LangGraph and LangMem](https://docs.langchain.com/oss/javascript/langchain/long-term-memory) | Programmable memory inside graph-based agent applications | Semantic, episodic, and procedural memory | Ready project ledger, Git worktree identity, evidence receipts, and no required model/store | Application-level memory customization and tight integration with LangGraph execution |

## Open-source memory and context projects

| System | Where it is strongest | Qarinah comparison |
| --- | --- | --- |
| [Cognee](https://docs.cognee.ai/getting-started/introduction) | Data ingestion, graph construction, embeddings, and memory pipelines | Cognee is broader automatic data-to-knowledge infrastructure. Qarinah is narrower project memory with deterministic records, Git identities, and cited coding-agent handoffs. |
| [Basic Memory](https://github.com/basicmachines-co/basic-memory/blob/main/README.md) | Markdown-first local knowledge and MCP access | Basic Memory is attractive for human-editable notes. Qarinah adds lifecycle capture, session receipts, worktree isolation, typed evidence, and deterministic derived views. |
| [OpenMemory](https://github.com/OpenTech-Lab/openmemory) | Local memory service with vector retrieval and broad integrations | OpenMemory provides a general local memory stack. Qarinah adds software-project provenance and exact Git/worktree boundaries but lacks its default semantic-vector experience. |
| [Engram by edg-l](https://github.com/edg-l/engram-mcp) | Branch-aware MCP memory backed by local storage | This is one of the closest small projects on branch-aware memory. Qarinah adds session receipts, event-chain integrity, project graphs, conflict/supersession, host installers, and a wider derived-view set. |
| [Engram by Semantic Craft](https://github.com/semantic-craft/engram) | Automatic project knowledge, wiki generation, and agent handoffs | Its generated documentation and handoff experience are compelling. Qarinah emphasizes explicit evidence identity, worktree separation, and read-model reproducibility. |
| [Cline Memory Bank](https://github.com/cline/prompts/blob/main/.clinerules/memory-bank.md) | Simple Markdown continuity that developers can inspect and edit | Memory Bank is minimal and approachable. Qarinah is more structured and verifiable, but also heavier to initialize and operate. |
| [Ruflo](https://github.com/ruvnet/ruflo/wiki/Quick-Start) | Multi-agent orchestration, swarms, and shared memory | Ruflo owns a much larger orchestration surface. Qarinah can act as a separate cited project-memory source but does not provide swarm execution. |
| [Grimoire](https://github.com/sandsaber/Grimoire) | Compact prompt/context organization for coding workflows | Grimoire is lighter. Qarinah adds durable event provenance, graph retrieval, worktree comparison, and session-level receipts. |

## Repository maps and code-structure memory

| System | Where it is strongest | Qarinah comparison |
| --- | --- | --- |
| [Aider repository map](https://aider.chat/docs/repomap.html) | Compact symbol maps ranked for the current coding conversation | Aider has a more mature source-symbol map. Qarinah retains decisions, tool outcomes, conflicts, and worktree history in addition to a bounded file/reference graph. |
| [Serena](https://github.com/oraios/serena) | Language-server-backed semantic code navigation and editing tools | Serena is stronger for precise symbols and IDE-like operations. Qarinah is stronger for longitudinal project evidence and host-independent memory. |
| [GitNexus](https://github.com/nxpatterns/gitnexus) | Repository knowledge graph and code relationships | GitNexus is stronger on deep code structure. Qarinah adds session/tool/decision history, hash-linked evidence, worktree identities, and context receipts. |
| [Codebase Memory MCP](https://github.com/DeusData/codebase-memory-mcp) | Fast structural index and MCP retrieval over many languages | It is stronger for broad AST/symbol coverage. Qarinah's current repository map is intentionally bounded and simpler, but it joins code with temporal project memory. |
| [CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext) | Graph-based code context exposed through MCP tools | It is stronger for code graph exploration. Qarinah adds append-only lifecycle evidence, cross-session receipts, and worktree-specific writable stores. |
| [Continue codebase context](https://docs.continue.dev/customize/deep-dives/custom-providers) | Extensible coding-assistant context providers and IDE integration | Continue offers a broader assistant/plugin surface. Qarinah can supply one project-memory provider but does not replace Continue's editor or model tooling. |

## Qarinah's defensible strengths

1. **Worktree identity is part of memory, not a tag.** Each initialized checkout has its own writable ledger and consent state, while sibling worktrees can be compared through a repository identity.
2. **A retrieved statement remains inspectable.** Session receipts and context packs bind event IDs, hashes, source manifests, coverage, and selection limits without copying retained event bodies into receipts.
3. **The durable and compact layers are separate.** The append-only ledger is authoritative. SQLite, Markdown, graph, dashboard, receipts, and context packs are derived and rebuildable.
4. **The core does not require a model or hosted database.** Deterministic lexical, typo-tolerant, temporal, authority, and relationship processing works locally. A host model can summarize only an already bounded pack.
5. **The same memory can follow a project across hosts.** Codex, Claude Code, Cursor, Kimi, Antigravity, Freebuff, the CLI, VS Code panel, and compatible MCP clients use project-local surfaces rather than one private chat store.

## Current gaps and priorities

These are product gaps, not hidden roadmap claims:

- Qarinah does not yet build a language-server or Tree-sitter-scale symbol graph comparable to specialist repository-map tools.
- Embedding and vector retrieval are optional external choices, not a polished built-in default.
- It does not passively capture months of activity across every desktop application.
- It has no managed multi-device/team memory cloud, billing plane, or enterprise administration console.
- Automatic model-based fact extraction and consolidation are less mature than memory-first platforms.
- The 0.4.0 editor panel targets VS Code and Cursor-compatible extension hosts; JetBrains and other native IDE packages are not shipped.
- Physical retention deletion and cryptographic erasure workflows remain future work; the current release supports logical retention and bounded derived views.
- There is no matched independent benchmark proving that Qarinah is universally more accurate, cheaper, or faster than the systems above.

## How to evaluate Qarinah yourself

Run the product's real-Git-worktree acceptance evaluator:

```sh
npm run check:worktree-continuity
```

It creates three actual Git worktree checkouts, initializes two independent Qarinah workspaces, and verifies 16 isolation, retrieval, receipt, conflict, and incremental-compaction scenarios. The checked artifact is [`bench/results/worktree-continuity-v0.4.0.json`](../bench/results/worktree-continuity-v0.4.0.json). This is reproducible product-acceptance evidence, not a cross-vendor benchmark.
