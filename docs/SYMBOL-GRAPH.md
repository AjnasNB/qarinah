# Symbol graph and language server

Qarinah 0.5 extends the code-aware layer beside its event, worktree, and evidence graphs. It uses the TypeScript compiler parser for JavaScript, JSX, TypeScript, and TSX and pinned, runtime-compatible Tree-sitter WASM grammars for Python, Go, Rust, Java, Kotlin, C, C++, and C# source from the latest explicit `qarinah scan` snapshot.

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

The v2 extractor records its exact parser and grammar package versions, the registered language set, the languages actually indexed, and the parser lane used for each file. JavaScript and TypeScript retain compiler-grade declaration handling. The WASM lane intentionally extracts high-signal declarations and identifier references; it does not claim full language-server semantic analysis, type inference, or compiler parity. Unsupported file types and stale source hashes remain explicit coverage gaps.

The graph is capped at 100,000 declarations and 500,000 reference observations. LSP messages are capped at 4 MiB. Ambiguous names do not resolve to a guessed definition. The graph file is a disposable read model under `.qarinah/graph/symbol-graph.json`; the event ledger and project snapshot remain authoritative.
