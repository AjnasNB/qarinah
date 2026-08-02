# Shared and verifiable team memory

Qarinah is **the evidence-linked cross-agent context engine for software projects**. Its source of truth is an explicitly authorized, append-only project record. Every compiled memory item carries an event ID and content hash so a person or agent can follow it back to evidence.

This release adds the local and protocol foundations for consent-gated retrieval, multi-host setup, freshness checks, multi-repository memory, team synchronization, task-specific packs, evaluation, dashboards, and end-to-end causal receipts. It does not silently upload a project or create a hosted team account.

## One-command host setup

From the project root:

```sh
npx qarinah setup . --codex --claude --cursor --capture content --allow-query
```

The command:

1. initializes the exact project if needed;
2. verifies a maintained Node 22, 24, or 26 runtime;
3. installs project-local Codex and Claude hooks and skills;
4. writes Codex, Claude, and Cursor MCP configuration without replacing unrelated settings;
5. binds `context.query` to the workspace's exact reviewed consent-policy hash;
6. rebuilds deterministic views; and
7. runs an integrity health check.

Omit `--allow-query` to install diagnostic-only MCP access. Setup is idempotent for Qarinah-managed files and refuses to overwrite a conflicting skill or unsafe linked configuration.

Project-local configuration makes Qarinah available to new supported agent sessions opened in that folder. It cannot retroactively recover events a host never emitted, read hidden reasoning, or stop a model provider from compacting its own conversation.

## Consent-gated MCP context retrieval

The native MCP server always exposes zero-write `context_status` and `context_doctor`. It exposes `context.query` only when the user installs an explicit query permit:

```sh
npx qarinah setup . --codex --claude --cursor --allow-query
```

The permit is bound to:

- the exact absolute initialized workspace;
- the current workspace consent-policy hash;
- a maximum returned character count; and
- a maximum returned item count.

`context.query` cannot initialize a project, grant trust, walk into a parent workspace, write an event, repair state, advance a checkpoint, or expand its own origin. It compiles a cited pack using verified read-only state.

## Visual memory dashboard

Generate a local static dashboard:

```sh
npx qarinah dashboard
```

Add measured context figures for a particular run:

```sh
npx qarinah dashboard --baseline-tokens 442113 --delivered-tokens 5682
```

The dashboard shows:

- current decisions;
- superseded decisions;
- conflicts requiring attention;
- source citations and hashes;
- the agent activity timeline;
- measured context and estimated input-token savings;
- affected files and systems; and
- the workspace capture policy.

The generated file is `.qarinah/dashboard/index.html`. It contains no remote scripts or analytics.

## Memory freshness

Run:

```sh
npx qarinah freshness
```

Qarinah compares the most recent recorded project-structure snapshot with current files and reports each cited file as `current`, `changed`, `missing`, or `unsafe`. Hosts should run this check before supplying durable context for a consequential task. A changed or missing source is a warning to rebuild or retrieve newer evidence, not permission to overwrite the decision.

Events can also carry expected file and dependency hashes together with repository branch and commit identity. File citations are checked locally. Dependency citations are reported as `unverified` unless the host supplies an explicit resolver; Qarinah never guesses a package or service state from ambient network access.

## Maqam-owned dynamic memory attachment

Maqam can attach memory to an exact agent run without exposing scope selection to the agent:

```js
registerMaqamContextAdapters({
  gateway,
  cwd: ".",
  requireMemoryAttachment: true,
  async resolveMemoryAttachment({ runId, agentId }) {
    return policyStore.resolve({ runId, agentId });
  }
});
```

The resolver returns attachment IDs, disclosure scopes, and repository IDs. `context.query` rejects caller-provided scope fields, an absent required attachment fails closed, and a revoked or expired ledger attachment no longer resolves. The agent can ask a question; only the host decides which memory it is allowed to search.

## Task-specific memory packs

Ready-made retrieval profiles are available for:

```sh
npx qarinah task-pack debugging "checkout timeout"
npx qarinah task-pack code-review "authorization boundary"
npx qarinah task-pack feature-implementation "team dashboard"
npx qarinah task-pack database-migration "rollback plan"
npx qarinah task-pack incident-response "production outage"
npx qarinah task-pack release-preparation "npm provenance"
npx qarinah task-pack security-review "credential flow"
```

Each profile adds task vocabulary to the user's query, preserves citations, and still applies the caller's normal character, token, coverage, authority, retention, and time limits.

## Multi-repository memory without authority collapse

Use `compileFederatedContext` to query explicitly selected repositories:

```js
import { compileFederatedContext } from "qarinah";

const result = await compileFederatedContext("release contract", {
  workspaces: [
    { cwd: "../web", authority: "frontend-team", repositoryId: "frontend" },
    { cwd: "../api", authority: "backend-team", repositoryId: "backend" },
    { cwd: "../infra", authority: "platform-team", repositoryId: "infrastructure" }
  ],
  relationships: [
    { from: "frontend", to: "backend", type: "shares_contract" },
    { from: "backend", to: "infrastructure", type: "deploys" }
  ],
  maxChars: 12_000
});
```

The result is a federation of separate cited packs. Qarinah does not merge repository identities, consent policies, event chains, or authority labels into one ambiguous record.

## Optional semantic retrieval

The no-key default remains deterministic lexical and graph retrieval. `rerankContextPack` accepts a local or caller-owned semantic adapter after deterministic admission:

```js
import { rerankContextPack } from "qarinah";

const reranked = await rerankContextPack(pack, {
  adapter: {
    id: "local-embeddings-v1",
    async score({ query, candidates }) {
      return localReranker(query, candidates);
    }
  }
});
```

The adapter may reorder only the already admitted, already cited candidate set. It cannot introduce a new event, source, repository, credential, or authority.

## Encrypted team and cross-device protocol

The public package provides a self-hostable protocol foundation:

- workspace membership with `owner`, `maintainer`, and `reader` roles;
- read access for every listed member, with mutation authority reserved for owners and maintainers;
- optional GitHub organization and repository binding;
- AES-256-GCM encrypted export bundles;
- signed checkpoints using Ed25519-compatible Node keys; and
- manifest and workspace identity verification before import.

```js
import {
  createEncryptedSyncBundle,
  createTeamManifest,
  decryptEncryptedSyncBundle
} from "qarinah";

const manifest = createTeamManifest({
  workspaceId,
  teamId: "platform",
  members: [
    { id: "ajnas", role: "owner" },
    { id: "reviewer", role: "reader" }
  ],
  github: { organization: "example", repository: "platform" }
});

const bundle = await createEncryptedSyncBundle({
  cwd: ".",
  manifest,
  memberId: "ajnas",
  key: encryptionKey
});
```

Key generation, key custody, transport, object storage, device enrollment, identity-provider integration, and a hosted control plane remain deployment responsibilities. A managed encrypted sync service can be added later without changing the local record format.

## Evaluation beyond context reduction

`evaluateContextQuality` aggregates explicit evaluation cases and reports:

- decision recall;
- citation accuracy;
- stale-context rejection;
- conflict detection;
- supersession correctness;
- cross-repository isolation;
- unauthorized-disclosure rejection;
- context tokens supplied;
- task completion quality;
- mean retrieval latency;
- net cost per completed task;
- repeated-mistake prevention; and
- compared cost reduction.

```js
import { evaluateContextQuality } from "qarinah";

const result = evaluateContextQuality([{
  id: "release-review",
  requiredDecisionIds: ["release-policy"],
  recalledDecisionIds: ["release-policy"],
  returnedCitationIds: ["release-adr"],
  validCitationIds: ["release-adr"],
  expectedStaleIds: ["old-package-lock"],
  rejectedStaleIds: ["old-package-lock"],
  taskCompleted: true,
  latencyMs: 18,
  baselineCost: 1,
  actualCost: 0.1
}]);
```

Null metrics mean a case did not supply the necessary denominator. Qarinah never manufactures a score from missing labels.

## Causal receipts across the stack

`createCausalReceipt` binds five structural stages:

```text
Cockroach evidence
  -> Qarinah memory
  -> Maqam policy and exact approval
  -> tool execution
  -> observed result
  -> permanent receipt hash
```

Each stage contains an ID, source system, timestamp, and SHA-256 hash. The receipt links every stage to the previous stage hash and hashes the complete chain. It does not claim an action was authorized merely because related memory exists; Maqam remains the policy and approval authority.
