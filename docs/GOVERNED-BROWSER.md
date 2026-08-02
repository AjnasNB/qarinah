# Governed browser automation

## Product boundary

Natural-language form filling and multi-page browser assistance are valuable only when the effect boundary is explicit:

```text
Cockroach Crawler -> bounded public-source records -> Qarinah
agent / ProductLoop -> Maqam policy + exact approval -> browser driver
browser host -> cited metadata outcome -> Qarinah
```

The crawler never receives authenticated browser state. Qarinah never dispatches browser actions. The browser driver never approves its own request.

This design is independent. A third-party DOM controller may be evaluated as an optional pinned observation driver, but its agent loop, extension bridge, prompts, branding, and enforcement model are not the product boundary.

## Published Cockroach Browser receiving boundary

`cockroach-browser@0.1.0` is now public and exports a `cockroach.browser-memory.v1` outcome shape. Qarinah implements only the receiving side of that shape:

- `createCockroachBrowserMemorySink()` accepts outcome notifications and exposes no browser operation;
- only outcomes with at least one evidence ID are retained, while uncited lifecycle notifications are ignored;
- every retained event is an untrusted, metadata-only projection, even when the Qarinah workspace allows content capture;
- session IDs are hashed, actor and purpose are coarsened, and arbitrary browser metadata is not retained;
- secret-bearing metadata keys are recursively omitted before the event reaches the ledger; and
- the current machine-local Qarinah trust record is reloaded before every durable append.

The exact public package is a development-only conformance fixture, not a Qarinah runtime dependency. Qarinah does not launch Cockroach Browser, attach to its profiles, read its cookies or storage, resolve its value references, verify its Maqam approvals, or grant it origin or action authority. Evidence IDs are opaque citations to browser-host evidence; receiving them does not independently verify the evidence bytes or turn receipt hashes into signatures.

See [governed interoperability boundaries](INTEROPERABILITY.md#cockroach-browser-cited-metadata-outcomes) for the schema, sink, replay, and conflict contract.

## Maqam 0.3.1 tool split

This document targets the published `maqam@0.3.1` artifact and matching [`v0.3.1`](https://github.com/AjnasNB/maqam/releases/tag/v0.3.1) release. Verify the live registry `gitHead` and integrity before installation; Qarinah must not infer availability from source metadata alone.

| Tool | Effect | Risk | Rule |
| --- | --- | --- | --- |
| `browser.observe` | `browser:read` | low | Approved exact origin, session, page, and revision only |
| `browser.preview` | `browser:read` | low | Structural proposal; no DOM mutation |
| `browser.apply` | `browser:write`, `browser:apply`, `network:write` | high | Exact one-use approval; form-state operations only |
| `browser.submit` | `browser:write`, `browser:submit`, `network:write` | critical | Separate exact approval; one activate, form-submit, or navigation operation |

The implemented adapter excludes arbitrary JavaScript, raw field values, passwords, OTPs, payment data, file uploads, security-setting changes, ambient tab access, profile/cookie discovery, and automatic submission. New pages and origin changes are explicit in the submit plan.

## Revision-bound target

Every proposed action uses an opaque target tied to one observation. Operations use driver-defined `elementId` references; they never carry CSS/XPath selectors or raw HTML:

```ts
interface BrowserTargetRef {
  sessionId: string
  pageId: string
  origin: string
  revision: string
}
```

The adapter canonicalizes the full proposal. Maqam binds approval to the exact `{runId, toolName, inputHash}`. Any changed origin, target, field, value handle, action, or submit URL invalidates the approval.

The preview output carries a SHA-256 `planHash` over the exact target, phase, and operations. Maqam confirms that the approval was consumed for the active gateway dispatch, calls the host driver once, then re-observes and emits a bounded structural receipt. The host driver remains responsible for detecting a stale or replaced revision before mutation; Maqam validates all conditions it can know before dispatch and validates the returned target afterward.

## Sensitive values

Raw secrets never enter model prompts, MCP messages, Maqam traces, or Qarinah. The proposal carries an opaque host-owned reference:

```json
{
  "kind": "setValueRef",
  "elementId": "account-name",
  "valueRef": "ref:profile.account-name"
}
```

The trusted host or local vault resolves the reference only inside the final approved driver call. Maqam never receives or stores the raw value.

## Extension and loopback boundary

- Request optional host permission per approved origin; never default to `<all_urls>`.
- Use per-run nonces and authenticated extension ports.
- Validate sender, tab ownership, origin, schema, and message size in the background process.
- If a loopback bridge exists, use a random port, bearer or WebSocket-subprotocol nonce, Host/Origin validation, one active client identity, and no auto-approve mode.
- Provider credentials stay in a local daemon or server-side proxy, never extension storage or MCP task payloads.

## Required tests

- denial or missing approval causes zero driver calls;
- a one-byte proposal change invalidates approval;
- apply and submit approvals cannot be reused or combined;
- stale DOM, overlay replacement, redirect, and target mutation fail closed;
- a new page or changed origin is accepted only when the exact plan declares it;
- replayed approvals perform no second write;
- injected page text remains untrusted data;
- raw credentials, personal fields, and entered values never reach logs, traces, context records, or model payloads;
- uncertain post-dispatch outcomes are marked `partial` or `unknown`, never rolled back by claim.

## Optional DOM-agent controller

An independently installed DOM controller can support embedded copilots, accessibility commands, form filling, multi-page extensions, or an MCP-facing browser host. Do not expose a broad natural-language `execute(task)` method as one approved write. Let the controller propose structural operations, map those operations into Maqam's preview/apply/submit contract, and resolve approved value references only inside the trusted driver. Model credentials, local-model configuration, extension permissions, CORS behavior, and MCP transport remain separate host responsibilities.

Safe launch claim: **governed browser actions for approved origins with preview-before-fill and separately approved submit**.
