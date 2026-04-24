# SOA-Harness v1.3.0 Release Notes

Adopter-facing narrative for v1.3.0. For the line-by-line changelog see `CHANGELOG.md`; for change classification see `docs/errata-policy.md`.

v1.3.0 is an **additive minor release** per §19.4.1. A v1.0, v1.1, or v1.2 conformance claim remains valid with zero code changes — v1.3 only adds new capabilities, never removes or breaks existing ones.

---

## What's new

### §17 Agent2Agent (A2A) profile — normative closure

v1.0 shipped §17 with the JSON-RPC 2.0 framing + the five-method table but left important details unspecified: the `HandoffStatus` enum members, per-method deadlines, how callers advertise and match capabilities, the `agent.describe` result-envelope shape, the `agent_card_etag` drift-rejection reason string, and the per-method semantics of "receivers MUST recompute and compare" for the three digest fields. v1.3 closes every one of those gaps.

- **§17.2.1 HandoffStatus enum** — closed six-value set (`accepted`, `executing`, `completed`, `rejected`, `failed`, `timed-out`) with a monotonicity rule (four terminal states MUST NOT transition forward), per-value `last_event_id` semantics, a Runner-crash + resume carve-out (§12 bracket-persistence does NOT transition `HandoffStatus`), and an explicit `rejected` vs `HandoffRejected` disambiguation block. Covered by `SV-A2A-15`.
- **§17.2.2 Per-method deadlines** — six defaults (5 s / 5 s / 30 s / 3 s / 10 s / 300 s for describe/offer/transfer/status/return/task-execution) with six `SOA_A2A_*_DEADLINE_S` operator env overrides. Task-execution expiry emits `SessionEnd(stop_reason=MaxTurns)` and transitions `handoff.status` to `timed-out`. Covered by `SV-A2A-16`.
- **§17.2.3 A2A capability advertisement + matching** — new optional `a2a` object on the Agent Card holding `a2a.capabilities: string[]`. A five-row normative truth table fully determines the receiver's response to `handoff.offer` on capability grounds. Tokens are compared **byte-exact over UTF-8** — no Unicode normalization, case folding, whitespace trimming, or any other transformation. `capabilities_needed` is validated (non-empty strings, order-preserving dedup, 256-element soft cap). Byte-exact reason string `"no-a2a-capabilities-advertised"`. -32003 `CapabilityMismatch` carries `error.data.missing_capabilities: string[]`. §17.2.3.1 reserves the space for a future Normative token registry. Covered by `SV-A2A-17`.
- **§17.2.4 agent.describe result shape** — the `result` member is normatively `{card: object, jws: string}`. `card` is the Agent Card as a JSON object (not stringified, not base64). `jws` is the detached JWS per §6.1.1 with the §17.2.4-specific invariant that the signing input IS `JCS(result.card)`. Five-step verification order. §19.4.1 additive-minor extensibility — receivers MUST IGNORE unknown fields. Schema vs signature error classes split (`AgentCardInvalid` vs `CardSignatureFailed`). Card-rotation race carve-out (dual-endpoint byte-identity is steady-state, not per-response). The `agent_card_etag` formula is pinned: `"\"" + hex_lowercase(SHA-256(JCS(agent-card))) + "\""`. Covered by `SV-A2A-03` (narrowed).
- **§17.1 step 4 clarified** — the HandoffRejected response on `agent_card_etag` mismatch MUST carry byte-exact `reason: "card-version-drift"`. Disjointness with `card-unreachable` is now explicit: fetch-failure → `card-unreachable`; fetch-success with ETag mismatch → `card-version-drift`. Covered by `SV-A2A-13` (narrowed).
- **§17.2.5 Per-method digest recompute** — three-row matrix. `handoff.offer` shape-checks advertised digests only (no data on wire). `handoff.transfer` recomputes `SHA-256(JCS(messages))` and `SHA-256(JCS(workflow))` against the digests retained from the prior offer; mismatch → `digest-mismatch`, missing offer state → `workflow-state-incompatible`. `handoff.return` shape-checks `result_digest` only (no `result` object on wire; semantic binding is caller-side — v1.4+ will address). Offer-state retention MUST (receivers accepting an offer MUST retain digests until the transfer is processed OR the §17.2.2 transfer deadline elapses). Restart-crash observability rule: a receiver that crashes between offer and transfer is wire-indistinguishable from a first-seen transfer and routes to `workflow-state-incompatible`. `final_messages` vs `result` disambiguation: `final_messages` is a wire convenience, NOT a projection of `result`. Covered by `SV-A2A-14` (narrowed).

### Schema extension

`schemas/agent-card.schema.json` gains a new optional `a2a` object with nested `capabilities: string[]` — forward-compatible for future A2A-scoped fields to group here rather than polluting the top-level namespace.

### Reference implementation — new `a2a` subsurface on `@soa-harness/runner`

`@soa-harness/runner@1.3.0` ships four new modules implementing the §17 profile end-to-end:

- `matching.ts` — §17.2.3 truth-table as a pure function with a discriminated outcome. Plugin-side switch-dispatch gets exhaustiveness for free.
- `jwt.ts` — §17.1 steps 1 + 3 + partial step 2. Alg allowlist, claim shape validation, `jti` replay cache with exact exp+30s retention, per-outcome routing to `AuthFailed` / `HandoffRejected(bad-alg|key-not-found|jti-replay)`.
- `signer-discovery.ts` — §17.1 step 2 Agent-Card-kid path + mTLS `x5t#S256` path + §17.1 step 4 `agent_card_etag` drift detection. `CallerCardCache` with 60 s TTL, `fetchCallerCard` with 3 s connect / 5 s total timeouts per spec, compositional resolvers.
- `digest-check.ts` — §17.2.5 recompute helpers + the `checkTransferDigests` pure function.

Plus `A2aTaskRegistry` gains offer-metadata retention tied to the §17.2.2 transfer deadline, and `buildRunnerApp` accepts an optional `a2a: { bearer, a2aCapabilities? }` block that mounts `POST /a2a/v1` with a real §6.1.1-compliant signed Agent Card JWS in `agent.describe` responses (the same key that signs `/.well-known/agent-card.jws` produces `result.jws`, so the §17.2.4 per-response JWS-verify invariant holds by construction).

`A2aHandoffRejectedReason` vocabulary grows from nine to ten members with the addition of `card-version-drift` (§17.1 step 4).

Test totals climbed from 816 at v1.2.1 to 882 at v1.3.0 across the `runner` package — 66 new assertions covering the §17 surface (27 signer-discovery + 16 JWT + 16 digest-check + 7 a2a-boot end-to-end).

### Conformance validator — forward-registered probes

`soa-validate@1.3.0` registers handlers for `SV-A2A-10..17` as skip-with-rationale probes pointing at the impl-unit-test coverage. Live promotion lands in v1.3.x once the full JWT + card-fetch test harness is scaffolded — the unit layer carries the assertions today.

---

## Adoption path

### For existing v1.2 adopters (zero code changes)

Your v1.2 Runner continues to conform under v1.3 without modification. `handoff.*` methods not served remain 404; `a2a.capabilities` absent on your Agent Card is the semantically-identical "serves no A2A capabilities" state.

### For adopters opting into §17

Enable in `buildRunnerApp`:

```typescript
const app = await buildRunnerApp({
  trust, card, alg, kid, privateKey, x5c,
  a2a: {
    bearer: process.env.SOA_A2A_BEARER!,  // W1 smoke mode; W3 JWT profile is the production path
    a2aCapabilities: ["summarize-document", "translate-en-de"],  // your advertised surface
  },
});
```

Card schema extension:

```json
{
  "soaHarnessVersion": "1.0",
  "...": "...",
  "a2a": {
    "capabilities": ["summarize-document", "translate-en-de"]
  }
}
```

Production adopters: configure the §17.1 JWT profile via the full `a2a.jwt` option block. See `packages/runner/test/a2a-jwt.test.ts` and `packages/runner/test/a2a-signer-discovery.test.ts` for working examples.

---

## Compatibility & pinning

- **Spec pin**: b87c2ffb5879d21d83692c9aa1c2666a606f8be2 (commit in `soa-harness-specification`).
- **Signing key**: v1.0 release key (fingerprint unchanged; no key rotation at v1.3).
- **npm packages**: `@soa-harness/{schemas, core, runner, memory-mcp-sqlite, memory-mcp-mem0, memory-mcp-zep, langgraph-adapter, example-provider-adapter, chat-ui, cli}` + `create-soa-agent`, all at `1.3.0`.
- **Conformance profile coverage**: Core + Self-Improvement + Handoff all available; new §17 surface lives under the Handoff (`core+handoff`) profile.

---

## Governance

v1.3 continues the single-maintainer cadence documented in `GOVERNANCE.md`. Every normative commit in the M9 chain passed the plan-evaluator hard-gate defined at `docs/spec-change-checklist.md` — findings from each pass are cited in the corresponding commit messages and summarized in `CHANGELOG.md` under "HARD-GATE exercise records".

---

## Known deferrals to v1.3.x

- **SV-A2A-10..17 live-probe promotion** — needs a validator-side JWT + card-fetch test harness. Unit-level coverage at `soa-harness-impl/packages/runner/test/a2a-{jwt,signer-discovery,digest-check}.test.ts` carries the assertions today.
- **§17.2.5 caller-side `result_digest` attestation** — v1.3 scopes result_digest recompute to shape-check only (no `result` object on wire). A future v1.3.x revision will normatively define the caller-side signing obligation that binds `result_digest` to the produced `result`.
- **§17.2.3.2 reserved-tokens Normative successor** — v1.3 ships §17.2.3.1 as Informative; cross-ecosystem vocabulary coordination is a v1.4+ track.
