# Third-party notices

Qarinah's standalone Codex and Claude Code plugin runtimes bundle the following dependencies.

## ignore 7.0.6

Copyright (c) 2013 Kael Zhang <i@kael.me>, contributors
http://kael.me/

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## web-tree-sitter 0.20.8

Copyright (c) 2018 Max Brunsfeld

Distributed under the MIT License. The complete upstream license is included at
`runtime/vendor/web-tree-sitter/LICENSE` in each standalone plugin.

## TypeScript 5.9.3 (`typescript-classic` package alias)

Copyright (c) Microsoft Corporation.

Distributed under the Apache License 2.0. The complete upstream license and
third-party notices are included at `runtime/vendor/typescript-classic/LICENSE.txt`
and `runtime/vendor/typescript-classic/ThirdPartyNoticeText.txt` in each standalone plugin.

## tree-sitter-wasms 0.1.13

The prebuilt grammar distribution is released under the Unlicense. Its eight
vendored grammar binaries provide the C, C++, C#, Go, Java, Kotlin, Python, and
Rust parser lanes used by Qarinah's standalone plugins. The upstream package is
<https://github.com/Gregoor/tree-sitter-wasms>.

## Development-only interoperability fixture

`cockroach-browser@0.1.0` (`AGPL-3.0-or-later`) is used only for development-time contract and type conformance. It is not bundled and is not a runtime, optional, or peer dependency of Qarinah. Its source is obtained separately under its own license. The separate package and license boundary is documented in Qarinah's `docs/LICENSE-STRATEGY.md`.
