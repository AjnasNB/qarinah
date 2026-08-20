# Symbol graph and language server

Qarinah 0.4 adds a code-aware layer beside its event, worktree, and evidence graphs. It uses the TypeScript compiler parser to index JavaScript, JSX, TypeScript, and TSX declarations and references from the latest explicit `qarinah scan` snapshot.

This is not a stored copy of source code. The derived graph stores symbol names, kinds, containers, exported status, exact spans, signature hashes, file content hashes, and resolved reference locations. Before parsing a file, Qarinah verifies that its bytes still match the recorded project-snapshot hash. Stale, linked, binary, oversized, and unsupported files are reported in coverage instead of silently indexed.

## Build and search

```powershell
npx qarinah scan
npx qarinah symbols build
npx qarinah symbols query "release verifier" --kind function,class --limit 20
```

The built-in query formula is public:

```text
0.62 * lexical
+ 0.28 * deterministic local subword vector
+ 0.10 * resolved-reference structure
```

The 128-dimensional local vector uses hashed character subwords and requires no model download, API key, remote vector database, or network call. It improves typo and identifier-shape matching, but it is not a learned natural-language embedding model. Callers that need learned embeddings can still rerank the bounded candidate set through the existing semantic-adapter contract.

## Language Server Protocol

Qarinah ships a stdio executable:

```powershell
npx qarinah-lsp
```

The bounded JSON-RPC server implements:

- `initialize` and `shutdown`;
- full-text document synchronization;
- document symbols;
- workspace symbol search;
- definitions when the declaration is unambiguous;
- references resolved by the persisted project symbol graph;
- `qarinah.refreshSymbols` through `workspace/executeCommand`.

Open buffers are parsed in memory for document symbols. Workspace definition/reference results come from the last verified scan and therefore remain evidence-bound. Run `qarinah scan` and `qarinah symbols build` after material file changes.

VS Code and Cursor use the shipped Qarinah memory panel. Other editors can attach any standards-compatible generic LSP client to `qarinah-lsp`; Qarinah does not yet ship separate native JetBrains, Neovim, Emacs, or Visual Studio packages.

## Coverage and limits

The built-in parser currently covers JavaScript and TypeScript language families. The schema is public so future language adapters can emit the same closed, hash-linked graph without changing the event ledger. Python, Go, Rust, Java, Kotlin, Ruby, C/C++, and other grammars are reported as unsupported in this v1 extractor rather than parsed by regular expressions or presented as complete.

The graph is capped at 100,000 declarations and 500,000 reference observations. LSP messages are capped at 4 MiB. Ambiguous names do not resolve to a guessed definition. The graph file is a disposable read model under `.qarinah/graph/symbol-graph.json`; the event ledger and project snapshot remain authoritative.
