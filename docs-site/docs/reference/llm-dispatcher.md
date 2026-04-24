---
sidebar_position: 2
---

# LLM Dispatcher (§16.3, v1.1)

New in v1.1 per M7 week 1. Closes the gap between §16.1 S3 "Model Request" and the provider-specific API call.

## What it does

The dispatcher is an **interface + lifecycle**. It sits between the Runner's turn pipeline and the LLM provider adapter. Every conformant Runner invokes it exactly once per turn, between projection (§13.1) and tool-call detection.

The dispatcher is NOT a provider. OpenAI, Anthropic, a local llama.cpp server, a corporate proxy — each is a `ProviderAdapter` behind the dispatcher. v1.1 ships an in-memory test-double adapter for conformance probing; production adopters wire their own.

## Six-step lifecycle (MUST, ordered)

Every dispatcher implementation follows this sequence for every request:

1. **Validate request** against `schemas/llm-dispatch-request.schema.json`. Failure → `DispatcherError(DispatcherRequestInvalid)`, no provider call.
2. **Budget pre-check** via §13.1 projection. If `projected + headroom > budget_ceiling_tokens`, synthesize a response with `stop_reason: BudgetExhausted`, zero usage, no provider call.
3. **Propagate `billing_tag`** to adapter metadata + OTel span + audit row.
4. **Register cancellation target** so §13.2 mid-stream cancel aborts the in-flight provider call at the next `ContentBlockDelta` boundary.
5. **Map provider errors** per §16.3.1 taxonomy. Runner never sees raw provider error shapes.
6. **Record audit row** — exactly one per dispatch, hash-chained into the §10.5 chain. Success, cancellation, or error — doesn't matter, one row always.

## Error taxonomy (§16.3.1)

Seven provider conditions get classified into `dispatcher_error_code` values:

| Condition | Retryable? | Subcode | Maps to |
|---|---|---|---|
| HTTP 429 | ✓ (≤3) | -32100 | `ProviderRateLimited` |
| HTTP 401/403 | ✗ | -32101 | `ProviderAuthFailed` |
| HTTP 5xx | ✓ (≤3) | -32102 | `ProviderUnavailable` |
| Network/TLS/DNS/TCP-reset | ✓ (≤3) | -32103 | `ProviderNetworkFailed` |
| Content filter / safety refusal | ✗ | -32104 | `ContentFilterRefusal` |
| Context-length exceeded | ✗ | -32105 | `ContextLengthExceeded` |
| Dispatcher request failed schema | ✗ | -32110 | `DispatcherRequestInvalid` |

Retry budget is 3 **total** across retryable classes — switching between rate-limit and network doesn't reset the counter.

## Observability (§16.4)

`GET /dispatch/recent?session_id=<sid>&limit=<n>` returns the newest-first ring of dispatches with full metadata (usage, latency, provider, billing_tag, error codes). Session-bearer auth or admin-bearer override for cross-session reads.

Like other observability endpoints (§13.5 `/budget/projection`, §14.5 `/events/recent`), this is not-a-side-effect: reads never fire retries, write audit rows, or emit events. Byte-identity holds across reads when `generated_at` is excluded.

## Adopter flow

To wire a real LLM provider:

1. Implement `ProviderAdapter` from `@soa-harness/runner`:
   ```typescript
   class MyAdapter implements ProviderAdapter {
     readonly name = "my-provider";
     async dispatch(req: DispatchRequest, ctx: AdapterDispatchContext): Promise<DispatchResponse> {
       // Provider-specific request shaping + HTTP call + response mapping
       // Throw AdapterError(code, {...}) on provider errors so dispatcher can classify
     }
   }
   ```
2. Construct a `Dispatcher` with your adapter:
   ```typescript
   const dispatcher = new Dispatcher({
     adapter: new MyAdapter(),
     budgetTracker,
     auditChain,
     clock
   });
   ```
3. Wire into the Runner via `buildRunnerApp({..., dispatch: { dispatcher, sessionStore, clock }})`.

The dispatcher owns budget, billing, cancellation, retries, and audit. Your adapter owns provider-specific auth, request shaping, error classification, and response parsing.

## Conformance tests

| Test ID | What | Where |
|---|---|---|
| `SV-LLM-01` | Request schema round-trip + 3 negatives | vector |
| `SV-LLM-02` | Response schema + allOf/if invariant | vector |
| `SV-LLM-03` | Budget pre-check before provider call | live |
| `SV-LLM-04` | `billing_tag` propagation to audit + `/dispatch/recent` | live |
| `SV-LLM-05` | Mid-stream cancellation at `ContentBlockDelta` boundary | live (M8 — streaming mode) |
| `SV-LLM-06` | One audit row per dispatch, hash-chained | live |
| `SV-LLM-07` | Taxonomy mapping for all 6 provider error codes | live |

## v1.1 scope limits

- **Synchronous dispatch only** — streaming mode (where the dispatcher emits StreamEvents per §14.1 during the in-flight call) lands in M8.
- **One adapter per Runner** — multi-provider routing (failover, A/B, cost-minimizing selection) is out of scope through v1.6.
- **No response caching** — provider-native prompt caching is honored via `usage.cached_tokens`, but the dispatcher doesn't run its own cache.
- **No request coalescing / batching** — each §16.1 S3 fires exactly one dispatch.

## References

- Spec §16.3 — lifecycle (MUST sequence)
- Spec §16.3.1 — error taxonomy
- Spec §16.4 — `/dispatch/recent` observability contract
- Spec §16.5 — reserved test IDs
- Schemas: `schemas/llm-dispatch-request.schema.json`, `-response.schema.json`, `schemas/dispatch-recent-response.schema.json`
