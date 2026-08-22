const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const days = Number(process.env.QARINAH_FUNNEL_DAYS ?? 30);

if (!accountId || !/^[0-9a-f]{32}$/iu.test(accountId)) {
  throw new TypeError("Set CLOUDFLARE_ACCOUNT_ID to the 32-character account ID.");
}
if (!apiToken) throw new TypeError("Set CLOUDFLARE_API_TOKEN to an Account Analytics Read token.");
if (!Number.isInteger(days) || days < 1 || days > 365) throw new TypeError("QARINAH_FUNNEL_DAYS must be an integer from 1 to 365.");

const sql = `SELECT
  blob1 AS event,
  count(DISTINCT index1) AS installations
FROM qarinah_activation
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
GROUP BY blob1
ORDER BY installations DESC
FORMAT JSON`;

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiToken}`,
    "content-type": "text/plain;charset=UTF-8"
  },
  body: sql,
  signal: AbortSignal.timeout(15_000)
});
const text = await response.text();
if (!response.ok) throw new Error(`Analytics Engine query failed with HTTP ${response.status}.`);
const parsed = JSON.parse(text);
const rows = Array.isArray(parsed) ? parsed : parsed.data ?? [];
const counts = Object.fromEntries(rows.map((row) => [row.event, Number(row.installations)]));
const target = {
  qualified_visitors: 100,
  setup_completed: 30,
  first_retrieval: 15,
  first_cross_session_handoff: 8,
  seven_day_return: 5,
  public_testimonials: 3
};
const observed = {
  qualified_visitors: Number(process.env.QARINAH_QUALIFIED_VISITORS ?? 0),
  setup_completed: counts.setup_completed ?? 0,
  first_retrieval: counts.first_retrieval ?? 0,
  first_cross_session_handoff: counts.first_cross_session_handoff ?? 0,
  seven_day_return: counts.seven_day_return ?? 0,
  public_testimonials: Number(process.env.QARINAH_PUBLIC_TESTIMONIALS ?? 0)
};

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  windowDays: days,
  target,
  observed,
  conversion: {
    visitor_to_setup: observed.qualified_visitors ? observed.setup_completed / observed.qualified_visitors : null,
    setup_to_retrieval: observed.setup_completed ? observed.first_retrieval / observed.setup_completed : null,
    retrieval_to_handoff: observed.first_retrieval ? observed.first_cross_session_handoff / observed.first_retrieval : null,
    handoff_to_return: observed.first_cross_session_handoff ? observed.seven_day_return / observed.first_cross_session_handoff : null
  }
}, null, 2));
