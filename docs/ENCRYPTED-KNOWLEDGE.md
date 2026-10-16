# Encrypted knowledge across machines and teams

Qarinah's shared knowledge transport stores client-encrypted memory in a private R2 bucket through an authenticated HTTPS Worker. Coding agents on another authorized machine or cloud runtime can fetch the same immutable bundle, decrypt it with their separately held key, verify the complete event chain, and reconstruct its index and graph. This extends the project-owned memory model across devices without putting plaintext knowledge or decryption keys into the service.

## Cryptographic contract

- `createEncryptedSyncBundle` encrypts the canonical event history and team manifest with AES-256-GCM and a fresh 96-bit nonce. The trusted manifest digest is authenticated additional data.
- `putEncryptedKnowledge` transmits only the encrypted envelope. An immutable object ID and full SHA-256 digest identify its ciphertext. The service's separate access token is scoped to one team and workspace.
- `getEncryptedKnowledge` bounds the response and verifies the requested object and workspace identity before returning it.
- `decryptEncryptedSyncBundle` requires the trusted manifest, an authorized member, and the separate 256-bit encryption key. It verifies GCM authentication, exact manifest identity, every canonical event digest, ordered hash continuity, duplicate IDs, and optionally `expectedHeadHash` before returning usable knowledge.
- Cryptographic integrity does not establish truth, semantic relevance, author identity, or action approval. Inferred facts remain inferred. The service cannot search end-to-end-encrypted plaintext; authorized clients or isolated cloud agents reconstruct and query it after decryption.

## Client example

```js
import { createEncryptedSyncBundle, putEncryptedKnowledge, getEncryptedKnowledge,
  decryptEncryptedSyncBundle } from "qarinah";

const manifest = { workspaceId, teamId: "my-team", members: [{ id: "owner", role: "owner" }] };
const service = { endpoint: process.env.QARINAH_KNOWLEDGE_ORIGIN, teamId: manifest.teamId,
  workspaceId, token: process.env.QARINAH_SYNC_TOKEN };
const key = Buffer.from(process.env.QARINAH_MEMORY_KEY_BASE64, "base64");
const encrypted = await createEncryptedSyncBundle({ cwd, manifest, memberId: "owner", key });
const receipt = await putEncryptedKnowledge(encrypted, service);
const fetched = await getEncryptedKnowledge(receipt.bundleId, service);
const knowledge = decryptEncryptedSyncBundle(fetched, { manifest, memberId: "owner", key,
  expectedHeadHash: knownSourceHead });
```

Distribute the encryption key through the team's approved secret store. A reader access token cannot write objects. Removing or rotating a service grant stops future access; it cannot revoke knowledge or keys a recipient already copied. No project is automatically uploaded by setup, capture, recall, or catalog search.

## Operator setup

The deployable Worker is `services/knowledge-worker`, with generated binding types and a separate Wrangler configuration. Provision its private bucket and the `QARINAH_SYNC_GRANTS` secret. Each grant contains exactly `tokenHash` (SHA-256 hex of a high-entropy base64url bearer token), `teamId`, `workspaceId`, `memberId`, and `role` (`owner`, `maintainer`, or `reader`). Keep the actual token on the client. Do not put grant secrets, tokens, or encryption keys in source, command arguments, logs, or chat.

`GET /v1/teams/:team/workspaces/:workspace/bundles` lists at most 20 object identities with an opaque next cursor. `GET` and `PUT` on the bundle's exact ID retrieve and store immutable encrypted envelopes. Anonymous access, wrong scopes, reader writes, cross-origin browser requests, unknown fields, changed object identities, and over-limit bodies fail closed. Deletion and open public writes are not exposed.

The initial service bounds envelope bodies to 8,000,000 bytes and supports at most 500 explicit grants. Rate limiting is per member/workspace per Cloudflare location; it is not a global billing or storage quota. Larger history segmentation, managed organization identity, automatic key distribution, regional controls, and a contractual enterprise SLA require additional service work. This release provides the encrypted shared transport and client verification boundary, with explicit limits.

Source of truth remains the verified event history. Graphs, summaries, facts, code relationships, and OKF exports are reproducible interpretations of that history.

## Migration

The existing encrypted bundle version remains `qarinah.encrypted-sync-bundle.v1`. Decryption now rejects internally inconsistent manifests, invalid event chains, duplicate identities, and an optional pinned-head mismatch. Existing valid bundles remain compatible. Use the separate transport boundary for the stricter 8 MB hosted-service limit.
