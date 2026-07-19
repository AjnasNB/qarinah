# Security model

## Defaults

1. Capture requires a portable workspace config plus a matching machine-local trust record; a committed config is not consent.
2. Metadata-only capture unless a user explicitly selects and locally trusts content capture.
3. Secret-like keys and token patterns are redacted before persistence on a best-effort basis.
4. Input depth, node count, string length, event size, relation count, and log size are bounded.
5. Storage components reject symbolic links and junctions and resolve beneath the trusted real workspace root.
6. Appends use a renewable owner-token lease, validate the canonical head and checkpoint-authenticated event-ID projection, extend and flush the log, update the disposable projection, checkpoint both identities, and release only if ownership is unchanged.
7. Full verification detects deletion, truncation, duplicate IDs, non-canonical bytes, and chain discontinuity relative to the retained checkpoint.
8. Derived state is deterministically recomputed and compared with the verified log before retrieval.
9. Retrieved context is data and may contain prompt injection. Markdown structure is escaped/indented, and Qarinah never executes retrieved content.

## Non-goals

- Capturing hidden model reasoning or chain of thought.
- Reading browser cookies, authentication state, environment secrets, or unrelated files.
- Treating a hook as a complete enforcement layer.
- Providing a privileged operating-system sandbox in the library process.
- Proving that a retained claim is true merely because its hash is valid.
- Guaranteeing that best-effort pattern redaction finds every secret in arbitrary content-mode tool output.

## Known foundation limits

- The initial lock is single-host and single-workspace; network filesystems need a different coordination design.
- Hash chaining plus the machine-local checkpoint is tamper-evident, not tamper-proof. Signed, independently anchored checkpoints are roadmap work.
- Appends validate the current head for bounded latency. `doctor`, rebuild, and query validate every canonical record and the complete chain.
- Lexical retrieval is deterministic but does not provide semantic equivalence.
- Host lifecycle schemas may change. Adapters version and reject unknown shapes instead of silently guessing.
- Interoperability timestamps use the same calendar-valid, millisecond-precision UTC pattern in runtime validation and published schemas; impossible dates, offset forms, expanded years, and `24:00` are rejected.
- Local Codex hooks do not observe hosted `WebSearch` and may not cover specialized tool paths. They are not an enforcement boundary.
- Content-mode capture stores host-exposed prompt/tool/completion values after bounded best-effort redaction; use metadata mode for unclassified data.
- A valid ProductLoop receipt proves canonical hash continuity, not author identity or truth; signed provenance remains separate.
- ProductLoop sequence identity is durable in Qarinah, but a restarted sink must replay its run from sequence 1 because the sink does not use ProductLoop's `RunStore` as an ordering oracle.
- Cockroach Crawler does not yet export a runtime SourceRecord validator or hash-recomputation contract, so Context Ledger enforces its own structural boundary and does not call the record certified.
- Cockroach revision and acquisition records are two idempotent serialized appends, not an atomic pair. A failed acquisition can be completed by retry while the already-written revision remains reviewable.
- Interoperability adapters reload machine-local trust from a supplied root; a structural workspace object is only a locator, never an authority.
- Maqam adapters require the private, one-dispatch verifier supplied by `ToolGateway.registerGuardedTool`. It binds the exact active input and context objects, tool registration, run, input hash, decision, and consumed approvals; retained handlers and fabricated plain contexts fail before Qarinah access. [Maqam issue #24](https://github.com/AjnasNB/maqam/issues/24) records this contract. This does not mediate unregistered code or direct host side effects.
- Qarinah and Maqam evidence are separate append-only systems. A successful `context.append` emits both records, but there is no cross-ledger transaction: if Maqam's evidence ledger fails after the Qarinah append, the governed call fails while the context event remains reviewable.

Report vulnerabilities privately to the repository owner before opening a public issue.
