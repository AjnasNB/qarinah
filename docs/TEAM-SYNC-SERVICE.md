# Self-hosted opaque team sync

Qarinah includes a small self-hosted service for moving encrypted project-memory bundles between trusted devices without giving the service plaintext project history. The client creates an `AES-256-GCM` bundle with `createEncryptedSyncBundle()`. The service validates the closed envelope, derives its content identity, and stores the canonical encrypted bytes immutably.

This is a transport and evidence boundary, not a managed cloud account. The built-in server binds only to `127.0.0.1` or `::1`. A remote deployment must place an authenticated TLS proxy in front, provision independent bearer tokens, back up the storage directory, rotate tokens, and monitor audit exports.

## Start the service

```js
import { createTeamSyncServer } from "qarinah";

const service = createTeamSyncServer({
  root: "/var/lib/qarinah-sync",
  host: "127.0.0.1",
  port: 8788,
  tokens: [
    {
      token: process.env.QARINAH_SYNC_OWNER_TOKEN,
      teamId: "platform",
      memberId: "ajnas",
      role: "owner"
    },
    {
      token: process.env.QARINAH_SYNC_READER_TOKEN,
      teamId: "platform",
      memberId: "reviewer",
      role: "reader"
    }
  ]
});

await service.start();
```

Tokens must contain at least 32 characters. Qarinah hashes them in memory and compares digests in constant time. The service does not persist token values. Roles are exact: `owner` and `maintainer` may write, while `reader` may only read.

## Store and retrieve a bundle

Derive the immutable bundle ID before upload:

```js
import { encryptedSyncBundleId } from "qarinah";

const bundleId = encryptedSyncBundleId(bundle);
const route = `/v1/teams/platform/workspaces/${bundle.workspaceId}/bundles/${bundleId}`;
```

`PUT` the bundle as `application/json` with `Authorization: Bearer ...`. A new object returns `201`; an exact replay returns `200` with `created: false`; a mismatched content identity returns `409`. `GET` returns the same validated encrypted envelope. There is no mutation or deletion route.

The service limits body bytes, header count, request duration, requests per token per minute, identifier length, audit page size, and stored ciphertext size. Tenant identity comes from the token and must match the URL. Browser requests with a non-loopback Origin or an unexpected Host are rejected.

## Inspect operational evidence

- `GET /v1/admin/status` reports the authenticated team's workspace count and storage mode.
- `GET /v1/admin/audit?limit=100` returns up to 500 immutable audit records to owners and maintainers.

Audit records contain the operation, role, member ID, workspace ID, bundle ID, bundle hash, timestamp, request ID, and audit hash. They never contain bearer tokens, ciphertext, authentication tags, plaintext events, project paths, or encryption keys.

## Trust and recovery boundary

The client remains responsible for decrypting and verifying the bundle against its team manifest. The service cannot inspect or repair plaintext memory. Operators must keep encryption keys outside the storage directory and test restore of both encrypted objects and audit files. A remote production deployment additionally needs TLS, durable object storage or replicated disks, identity lifecycle, token rotation, monitoring, backup retention, and abuse controls at the proxy layer.

The public closed contract is shipped as `qarinah/schemas/team-sync-service.json`.
