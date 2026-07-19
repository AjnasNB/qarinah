# Product strategy

## One product, four boundaries

The product is a governed control plane for software agents. Its first customer promise is:

> Deploy agents that can research and act without losing control of source evidence, context, approval, or execution receipts.

The repositories are implementation boundaries, not four competing product pitches:

- **Maqam** is the control plane. It evaluates policy, binds approval to exact tool input, dispatches registered capabilities, and records execution evidence.
- **Cockroach Crawler** acquires bounded public evidence and reports the real capability and credential boundary of each source.
- **Qarinah** retains explicit events and decisions, compiles small cited context packs, and exports portable knowledge documents.
- **ProductLoop** is the composable workflow and integration SDK around those contracts.

An in-page form or browser actuator is a future governed capability, not another authority layer. It should propose a bounded DOM action; Maqam should authorize the exact action; Cockroach should capture relevant before/after evidence; and Qarinah should retain the resulting receipt.

## The differentiating object: a causal receipt

A useful receipt connects the whole chain instead of logging only the final tool call:

```text
source evidence
  -> retained event
  -> selected context and citations
  -> policy decision
  -> exact human approval, when required
  -> exact tool input
  -> observed effect
  -> outcome evidence
```

Every link needs an identity, hash, timestamp, confidence class, and explicit relation. Conflicting evidence remains visible. A newer decision may supersede an older one, but history is not silently rewritten. Authority is scoped and revocable; it is not inferred from confident wording.

This is the product-level proof: an operator can answer *what acted, for whom, using which context, under which rule, with whose approval, and what changed?*

## Context economics

Qarinah should remember decisions, evidence, outcomes, and relationships. It should not duplicate an agent host by copying every source file or complete transcript into every prompt.

The local no-key baseline is deterministic:

1. verify the append-only event chain and machine-local capture permit;
2. filter expired and future-at-checkpoint records;
3. rank with lexical relevance, typo tolerance, and one-hop graph evidence;
4. preserve contradictions and apply explicit supersession;
5. diversify repeated results;
6. compile only what fits the caller's character and token budget, leaving output headroom;
7. mark retrieved material as untrusted data and carry citations and hashes forward.

Provider tokenizers or embedding services can be optional adapters. They must declare their identity and version and cannot replace source records, policy, or deterministic fallback behavior.

## Path to a governed agent operating layer

The credible path is incremental:

1. **Agent control plane:** registered tools, policy, exact approvals, evidence, compact context, and replayable receipts.
2. **Cross-platform user-space supervisor:** process launch, sandbox profiles, filesystem/network capability brokers, secrets mediation, quotas, revocation, and Windows/macOS/Linux adapters.
3. **Team control plane:** signed policy distribution, encrypted synchronization, identity federation, centralized audit, and incident response.
4. **Deeper operating-system integration:** privileged brokers and device controls only where a platform-specific threat model, installer, rollback, and recovery design exist.

Until the second stage is real, describe the product as an agent control plane, not an operating-system replacement.

## Proof milestones

- A new developer installs one package and initializes one project in under five minutes.
- Codex and Claude Code can record the same explicit project decision without storing hidden reasoning.
- A later session retrieves a smaller cited pack that includes the current decision and any unresolved conflict.
- A Maqam-controlled write binds policy and approval to the exact tool input and emits one causal receipt.
- The same event head reproduces the same portable knowledge bundle and context evaluation metrics.
- Three design partners use the system on real agent workflows and can identify one failure, review, or audit task that became materially faster or safer.

## Non-goals

- universal access to private websites without authentication;
- bypassing robots policy, paywalls, CAPTCHA, or provider terms;
- collecting hidden model reasoning;
- treating browser cookies as ambient shared credentials;
- claiming that hooks observe events a host does not expose;
- claiming that an open-source license prohibits commercial use.
