# Qarinah Developer Memory for VS Code and Cursor

This extension renders the local Qarinah project-memory graph, ranked nodes, decisions, tools, outcomes, conflicts, exact session lifecycle receipts, and initialized Git worktrees inside the editor. Selecting a session opens its observed state, completed turns, outcome count, source-event manifest, delivered-pack manifest, and receipt hash without exposing retained event bodies.

It makes no network request and does not read the ledger directly. It invokes the installed `qarinah panel` read-only command in the current workspace and renders that verified derived view in a sandboxed webview.

Install Qarinah in the project or on `PATH`, initialize the project, then install the packaged VSIX:

```sh
npm install --save-dev qarinah@next
npx qarinah setup . --cursor --auto-compact
code --install-extension qarinah-developer-memory-0.5.0-rc.1.vsix
```

Cursor accepts the same VSIX through its Extensions view or compatible command-line installer.
