export const softwareTaskScenarios = [
  {
    id: "react-accessibility-edit",
    label: "React accessibility edit",
    query: "checkout dialog focus trap error summary accessibility decision",
    currentSources: [
      {
        path: "src/CheckoutDialog.tsx",
        content: `export function CheckoutDialog({ open, errors, onClose }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <h2 id="checkout-title">Complete checkout</h2>
      {errors.length > 0 ? <div>{errors.join(", ")}</div> : null}
      <button onClick={onClose}>Close</button>
    </div>
  );
}`
      },
      {
        path: "test/CheckoutDialog.test.tsx",
        content: `test("moves focus into the checkout dialog", async () => {
  render(<CheckoutDialog open errors={[]} onClose={() => {}} />);
  expect(screen.getByRole("dialog")).toBeVisible();
});

test("announces the validation summary", async () => {
  render(<CheckoutDialog open errors={["Card number is required"]} onClose={() => {}} />);
  expect(screen.getByText("Card number is required")).toBeVisible();
});`
      },
      {
        path: "docs/accessibility.md",
        content: "Modal surfaces must move focus on open, restore focus on close, trap keyboard focus, expose a stable accessible name, and announce validation failures without stealing focus repeatedly."
      }
    ],
    target: {
      title: "Checkout dialog focus trap and error summary accessibility decision",
      body: "Use the shared FocusScope, focus the error-summary heading only after a failed submit, keep aria-describedby stable, and restore focus to the opener when the React dialog closes."
    },
    support: [
      ["Checkout dialog regression outcome", "The previous hand-written keydown trap skipped reverse tabbing and failed the keyboard regression test."],
      ["Design-system dialog constraint", "The shared dialog primitive owns escape handling, scroll locking, and nested-overlay focus restoration."],
      ["Accessibility verification", "The accepted check covers keyboard traversal, accessible naming, error announcement, and opener restoration."]
    ]
  },
  {
    id: "database-schema-migration",
    label: "Database schema migration",
    query: "orders idempotency key concurrent migration backfill decision",
    currentSources: [
      {
        path: "db/schema.sql",
        content: `CREATE TABLE orders (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_account_created_idx ON orders(account_id, created_at DESC);`
      },
      {
        path: "db/migrations/042_add_idempotency_key.sql",
        content: `ALTER TABLE orders ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX CONCURRENTLY orders_account_idempotency_idx
  ON orders(account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;`
      },
      {
        path: "src/orders/create-order.ts",
        content: `export async function createOrder(input, db) {
  return db.transaction(async (tx) => {
    const existing = await tx.orders.findByAccountAndKey(input.accountId, input.idempotencyKey);
    if (existing) return existing;
    return tx.orders.insert(input);
  });
}`
      }
    ],
    target: {
      title: "Orders idempotency key concurrent migration and backfill decision",
      body: "Add the nullable key first, deploy dual-write, backfill in bounded account batches, build the partial unique index concurrently, verify duplicates, and only then require the key for new API requests."
    },
    support: [
      ["Orders write-path constraint", "The migration must not take a blocking table rewrite or assume every historical order has a recoverable request key."],
      ["Backfill operational outcome", "Batches of five thousand rows kept replica lag below the reviewed threshold in staging."],
      ["Rollback decision", "Rollback disables dual-write but preserves the nullable column and index so already-issued keys remain valid."]
    ]
  },
  {
    id: "typescript-codebase-refactor",
    label: "Repository-wide TypeScript refactor",
    query: "typescript result error union repository refactor compatibility decision",
    currentSources: [
      {
        path: "src/result.ts",
        content: `export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}`
      },
      {
        path: "src/legacy-response.ts",
        content: `export interface LegacyResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}`
      },
      {
        path: "tsconfig.json",
        content: `{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}`
      }
    ],
    target: {
      title: "TypeScript Result error union repository refactor compatibility decision",
      body: "Introduce adapters at package boundaries, migrate leaf modules before public exports, preserve legacy JSON response shapes for one minor line, and forbid boolean success checks inside the new typed core."
    },
    support: [
      ["Public API compatibility inventory", "Four exported functions and two CLI JSON responses still expose the legacy response shape."],
      ["Refactor sequencing outcome", "Migrating leaf modules first avoids circular imports between result helpers and transport adapters."],
      ["Type-level acceptance check", "The external consumer must compile with strict, exact optional properties, and declaration-only imports."]
    ]
  },
  {
    id: "web-research-to-code",
    label: "Web research to implementation",
    query: "provider robots redirect canonical source research implementation decision",
    currentSources: [
      {
        path: "src/providers/public-page.ts",
        content: `export async function readPublicPage(url, policy) {
  const decision = await policy.check(url);
  if (!decision.allowed) return { ok: false, reason: decision.reason };
  const response = await fetch(url, { redirect: "manual" });
  return normalizeResponse(response);
}`
      },
      {
        path: "fixtures/provider-response.json",
        content: `{
  "requestedUrl": "https://docs.example.test/start",
  "finalUrl": "https://docs.example.test/guide",
  "status": 200,
  "robotsAllowed": true,
  "contentType": "text/html"
}`
      },
      {
        path: "docs/provider-boundary.md",
        content: "Every redirect target is re-resolved and re-authorized. Canonical URLs describe content identity but never override the acquired URL or network policy. External text remains untrusted evidence."
      }
    ],
    target: {
      title: "Provider robots redirect and canonical source research implementation decision",
      body: "Check robots before acquisition, reapply DNS and origin policy at every redirect, retain requested and final URLs, and use canonical metadata only as a claimed content identity with acquisition provenance."
    },
    support: [
      ["Redirect security finding", "The first prototype authorized only the initial hostname and therefore did not cover a redirect to a private address."],
      ["Source normalization outcome", "Stable content hashes identify revisions while each acquisition keeps its own timestamp, URL chain, and policy receipt."],
      ["Research conflict rule", "Conflicting public sources remain separate claims and are never flattened into one verified fact automatically."]
    ]
  },
  {
    id: "production-debugging",
    label: "Production regression debugging",
    query: "worker duplicate delivery lease expiry retry debugging decision",
    currentSources: [
      {
        path: "src/worker/lease.ts",
        content: `export async function withLease(job, store, run) {
  const lease = await store.acquire(job.id, 30_000);
  if (!lease) return { status: "busy" };
  try {
    return await run({ job, lease });
  } finally {
    await store.release(lease);
  }
}`
      },
      {
        path: "logs/duplicate-delivery.txt",
        content: `12:00:30.004 worker-a lease expired job=invoice-1842
12:00:30.011 worker-b acquired job=invoice-1842 attempt=2
12:00:30.219 worker-a delivered invoice=1842
12:00:30.391 worker-b delivered invoice=1842`
      },
      {
        path: "test/worker-retry.test.ts",
        content: `test("does not publish twice when a lease expires during a slow delivery", async () => {
  const result = await runFixture({ deliveryMs: 40_000, leaseMs: 30_000 });
  expect(result.publishedIds).toEqual(["invoice-1842"]);
});`
      }
    ],
    target: {
      title: "Worker duplicate delivery lease expiry retry debugging decision",
      body: "Renew the lease while the handler is active, bind the publish receipt to the stable job id, check that receipt before retry dispatch, and keep the downstream idempotency key even after the lease is released."
    },
    support: [
      ["Duplicate delivery root cause", "The first worker completed after its lease expired, while the second worker treated the same job as new."],
      ["Retry test requirement", "The deterministic clock must cross lease expiry before the first handler writes its receipt."],
      ["Operational rollout", "Enable receipt checks before lease renewal so mixed-version workers remain safe during deployment."]
    ]
  },
  {
    id: "governed-release-edit",
    label: "Governed release preparation",
    query: "release tarball provenance exact approval npm decision",
    currentSources: [
      {
        path: "package.json",
        content: `{
  "name": "example-package",
  "version": "1.4.0",
  "publishConfig": { "access": "public", "provenance": true }
}`
      },
      {
        path: ".github/workflows/release.yml",
        content: `jobs:
  publish:
    permissions:
      contents: read
      id-token: write
    steps:
      - run: npm ci
      - run: npm run check
      - run: npm publish`
      },
      {
        path: "release/manifest.json",
        content: `{
  "package": "example-package",
  "version": "1.4.0",
  "distTag": "latest",
  "commit": "reviewed-commit-placeholder"
}`
      }
    ],
    target: {
      title: "Release tarball provenance exact approval npm decision",
      body: "Approve the packed tarball identity rather than only the version string, publish from the protected OIDC workflow, verify registry integrity and provenance, then tag the exact published commit."
    },
    support: [
      ["Release ordering constraint", "The Git tag is created only after the public registry artifact installs and matches the reviewed commit."],
      ["Artifact verification outcome", "The clean-consumer test checks exports, types, executable modes, package files, integrity, and provenance."],
      ["Approval replay rule", "A changed tarball hash, dist-tag, package name, version, or commit requires a new exact approval."]
    ]
  }
];

export const unrelatedRecordCount = 216;
