# Security model

## Defaults

1. Capture requires a portable workspace config plus a matching machine-local v2 permit; a committed config is not consent. The permit digest binds the exact real root, workspace ID, enabled state, capture mode, event/log/context bounds, and retention class.
2. Metadata-only capture unless a user explicitly selects and locally trusts content capture. The central append boundary replaces unreviewed caller body/data with deterministic digest and size metadata; built-in adapters may retain only their code-reviewed coarse metadata projection.
3. Secret-like keys and token patterns are redacted before persistence on a best-effort basis.
4. Input depth, node count, string length, event size, relation count, and log size are bounded.
5. The central append boundary requires the event retention class to equal the machine-approved workspace class; an adapter cannot silently relabel project data as durable. Retention class is classification metadata, while an explicit `expiresAt` controls retrieval eligibility; neither performs physical log deletion.
6. Storage components reject symbolic links, junctions, and multiply linked regular files and resolve beneath the trusted real workspace root. The in-place event-log append additionally verifies the opened handle against the current named file before writing.
7. Appends use a renewable owner-token lease, validate the canonical head and checkpoint-authenticated event-ID projection, extend and flush the log, update the disposable projection, checkpoint both identities, and release only if ownership is unchanged.
8. Full verification detects deletion, truncation, duplicate IDs, non-canonical bytes, and chain discontinuity relative to the retained checkpoint.
9. Derived state is deterministically recomputed and compared with the verified log before retrieval.
10. Retrieved context is data and may contain prompt injection. Markdown structure is escaped/indented, and Qarinah never executes retrieved content.

## Non-goals

- Capturing hidden model reasoning or chain of thought.
- Reading browser cookies, authentication state, environment secrets, or unrelated files.
- Authorizing, dispatching, or proving governance of a browser action.
- Treating a hook as a complete enforcement layer.
- Providing a privileged operating-system sandbox in the library process.
- Proving that a retained claim is true merely because its hash is valid.
- Guaranteeing that best-effort pattern redaction finds every secret in arbitrary content-mode tool output.

## Known foundation limits

- The initial lock is single-host and single-workspace; network filesystems need a different coordination design.
- Hash chaining plus the machine-local checkpoint is tamper-evident, not tamper-proof. Signed, independently anchored checkpoints are roadmap work.
- Appends validate the current head for bounded latency. `doctor`, rebuild, and query validate every canonical record and the complete chain.
- Hybrid local retrieval is deterministic, but BM25, typo-tolerant character matching, and one-hop graph evidence do not prove semantic equivalence or factual truth. Optional dense/model adapters must remain explicitly versioned and cannot replace the authoritative record.
- Retention expiry and an `asOf` checkpoint filter disclosure candidates; they do not delete or rewrite the append-only event history. The compiler resolves one current UTC checkpoint when callers omit it, while deterministic replay must provide the recorded `asOf` explicitly.
- An explicit per-call `maxChars` is clamped to the machine-approved `contextMaxChars` ceiling before any pack is compiled.
- Host lifecycle schemas may change. Known Codex event schemas reject missing or unrecognized fields; unknown lifecycle event names are ignored without capture instead of being guessed.
- Interoperability timestamps use the same calendar-valid, millisecond-precision UTC pattern in runtime validation and published schemas; impossible dates, offset forms, expanded years, and `24:00` are rejected.
- Local Codex hooks do not observe hosted `WebSearch` and may not cover specialized tool paths. They are not an enforcement boundary.
- Claude binds lifecycle-hook execution to a required user-reviewed `node_path` file setting. Its read-only MCP server uses the host's portable `node` lookup so noninteractive plugin installs can register diagnostics before hook configuration; review that lookup before enabling the plugin. Codex currently has no equivalent per-plugin setting: its hooks and MCP server first change to the immutable installed-plugin root to defeat workspace-current-directory shadowing, but both MCP packages still inherit the host's remaining executable-search-path trust boundary.
- MCP workspace selectors must be absolute local paths or `file:` URIs and are resolved as exact opted-in workspace roots. They never fall through to an opted-in parent, create trust, mutate state, or appear in diagnostic results. This is the portable fallback for hosts such as Codex that do not guarantee MCP filesystem roots.
- Content-mode capture stores host-exposed prompt/tool/completion values after bounded best-effort redaction; use metadata mode for unclassified data.
- Unknown Claude hook fields are ignored; metadata records only their count, never unreviewed property names or values.
- Portable policy edits fail closed until exact review: `qarinah policy` displays every requested field and its digest, and `qarinah trust --capture <mode> --policy-hash <digest>` accepts only that digest after reloading under the workspace lock. Re-trust validates the complete event chain against any existing v1/v2 machine checkpoint before issuing a new v2 permit, so a policy review cannot reset rollback continuity. `enable`, `disable`, `untrust`, re-trust, append, and checkpoint writes serialize through the workspace write lock.
- A valid ProductLoop receipt proves canonical hash continuity, not author identity or truth; signed provenance remains separate.
- ProductLoop sequence identity is durable in Qarinah, but a restarted sink must replay its run from sequence 1 because the sink does not use ProductLoop's `RunStore` as an ordering oracle.
- Cockroach Crawler does not yet export a runtime SourceRecord validator or hash-recomputation contract, so Qarinah enforces its own structural boundary and does not call the record certified.
- Cockroach revision and acquisition records are two idempotent serialized appends, not an atomic pair. A failed acquisition can be completed by retry while the already-written revision remains reviewable.
- Cockroach Browser outcomes are passive, cited metadata inputs. Qarinah recursively omits known secret-bearing metadata keys and retains only an allowlisted projection, but it does not inspect the cited evidence bytes, authenticate the browser host, or turn receipt hashes into action authority or signatures.
- Interoperability adapters reload machine-local trust from a supplied root; a structural workspace object is only a locator, never an authority.
- Maqam adapters require the private, one-dispatch verifier supplied by `ToolGateway.registerGuardedTool`. It binds the exact active input and context objects, tool registration, run, input hash, decision, and consumed approvals; retained handlers and fabricated plain contexts fail before Qarinah access. [Maqam issue #24](https://github.com/AjnasNB/maqam/issues/24) records this contract. This does not mediate unregistered code or direct host side effects.
- Qarinah and Maqam evidence are separate append-only systems. A successful `context.append` emits both records, but there is no cross-ledger transaction: if Maqam's evidence ledger fails after the Qarinah append, the governed call fails while the context event remains reviewable.

Report vulnerabilities privately to the repository owner before opening a public issue.
