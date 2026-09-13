# Provider token accounting

Qarinah can retain **host-supplied provider usage**, independently of its portable context-size estimates. No provider invoice, cost saving, or quality equivalence is inferred from a token count.

Hosts call `recordProviderUsage(receipt, { cwd })` once for every attempted model call, including retries, repairs, failures, and cancellations. The workspace must already be enabled and machine-trusted. This API does not initialize capture or grant trust. Only identifiers and numeric counters are accepted; do not pass prompts, completions, API keys, or response bodies.

```js
import { recordProviderUsage, readProviderUsage } from 'qarinah';

await recordProviderUsage({
  schemaVersion: 'qarinah.provider-usage.v1',
  provider: 'azure', model: 'your-deployment-model',
  sessionId: 'session-1', callId: 'logical-call-1', attempt: 1,
  purpose: 'production', outcome: 'completed',
  inputTokens: 1200, outputTokens: 200,
  cachedInputTokens: 800, reasoningTokens: null
}, { cwd: '/absolute/project' });
console.log(await readProviderUsage({ cwd: '/absolute/project' }));
```

Input must include cached input. Output must include reasoning output. Those fields are subsets, never extra tokens. Normalize provider-specific conventions in the host adapter. Use `null` for unreported counts; an unavailable request is not a zero-token request. `purpose: 'test'` keeps fixtures separate from production totals. Counts are unverified host claims even when obtained from a provider response.

Replaying the same session/call/attempt/provider/model/purpose is idempotent. Reusing that identity with different values fails. Assign each retry its own attempt number, and keep identifiers unique within the session. A failed response that supplies usage still contributes to usage. An aggregate with missing counts reports known subtotals and an unknown complete total.

The read API is zero-write and cites event IDs and hashes. Capturing numbers is supported in both metadata and content capture modes. Existing ledgers need no migration; old free-form `data.usage` objects are not silently treated as this contract or reclassified as real production usage.

For an Azure host, map `prompt_tokens` to `inputTokens`, `completion_tokens` to `outputTokens`, and explicitly reported cached/reasoning details to their matching subset fields. Qarinah cannot obtain billing usage from a host that does not expose it. Installing Qarinah alone does not grant access to Codex/Claude account billing or retroactively recover missing counters.

Savings need a matched OFF/ON workload with the same requirements and quality checks. Dollar estimates additionally need model-specific dated rates and cache billing. A context-pack estimate and provider cost savings are different measurements.
