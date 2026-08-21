# Qarinah for JetBrains IDEs

This directory is an importable [LSP4IJ custom template](https://github.com/redhat-developer/lsp4ij/blob/main/docs/UserDefinedLanguageServer.md). It connects a JetBrains project to the project-local `qarinah-lsp` executable. It is a standards-based language-server integration, not a native JetBrains plugin.

## Install

1. Install Qarinah in the project and initialize the project memory:

   ```sh
   npm install --save-dev qarinah
   npx qarinah setup . --capture metadata --allow-query
   npx qarinah scan
   ```

2. Install [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) in the JetBrains IDE.
3. Open **Settings > Languages & Frameworks > Language Servers** and select **+**.
4. Choose **Import from custom template...** and select this `qarinah-lsp` directory.
5. Keep the project directory as the workspace root and start the server.

LSP4IJ documents custom templates as directories whose only required descriptor is `template.json`. Its command macros include `$PROJECT_DIR$`; this template uses that macro to run the exact Qarinah dependency installed in the open project. It does not download or execute an unpinned remote binary.

## Surface and limits

The current server provides document symbols, workspace symbols, definitions, references, and the `qarinah.refreshSymbols` command over bounded stdio JSON-RPC. Open-document symbols cover JavaScript, JSX, TypeScript, TSX, Python, Go, Rust, Java, Kotlin, C, C++, and C#. Definitions and references use the current hash-validated project symbol graph, so run `npx qarinah scan` after meaningful file changes.

The integration does not replace the JetBrains debugger, compiler index, refactoring engine, or native inspections. It does not silently read IDE history or install an editor-wide plugin.
