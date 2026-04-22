# JWT Clock-Skew Fixture — SV-ENC-06

Pinned JWT fixtures exercising the §1 `±30s` clock-skew window for bearer-token verification.

## Reference clock

**`T_REF = 2026-04-22T12:00:00Z`** (UNIX epoch seconds: `1776948000`).

All fixtures are built against this constant. Validators inject the same `T_REF` as the Runner's verification clock (via `RUNNER_TEST_CLOCK` per §10.6.1 testability note) so assertions are deterministic regardless of wall-clock time at test execution.

## Scenarios

| File | `iat` | `exp` | Expected Runner verdict |
|---|---|---|---|
| `iat-in-window.jwt` | `T_REF` | `T_REF + 300` | accept |
| `iat-past.jwt` | `T_REF − 60` | `T_REF + 240` | reject with `AuthFailed(iat-past-skew)` — iat outside `−30s` window |
| `iat-future.jwt` | `T_REF + 60` | `T_REF + 360` | reject with `AuthFailed(iat-future-skew)` — iat outside `+30s` window |
| `exp-expired.jwt` | `T_REF − 400` | `T_REF − 100` | reject with `AuthFailed(exp-expired)` — exp already passed even with `+30s` skew |

## JWT shape

All four JWTs share:

- **Header:** `{ "alg": "EdDSA", "kid": "soa-conformance-test-handler-v1.0", "typ": "JWT" }`
- **Payload issuer / subject:** `iss=soa-conformance-test`, `sub=conformance-session-001`
- **Signature:** Ed25519 PureEdDSA over `base64url(header).base64url(payload)` using the handler-keypair private key (`test-vectors/handler-keypair/private.pem`).

Payloads differ only in `iat` / `exp`.

## Regeneration

```
node test-vectors/jwt-clock-skew/generate.mjs
```

Output is deterministic — Ed25519 PureEdDSA is canonical. Any byte difference in regenerated `.jwt` files indicates `T_REF` drift or keypair drift.

## Validator choreography

For each fixture:

1. Start Runner with `RUNNER_TEST_CLOCK=2026-04-22T12:00:00Z` (injects `T_REF`).
2. Submit the JWT as a bearer on any `sessions:read:<session_id>`-scoped endpoint.
3. Assert response matches the expected verdict column.

Validator MUST verify all four scenarios; success requires `iat-in-window.jwt` to accept AND the three reject cases to return `401 AuthFailed` with distinct `reason` codes.

## Referenced sections

- Core §1 — Conventions (±30s clock-skew tolerance for JWT iat/exp)
- Core §10.6.1 — `RUNNER_TEST_CLOCK` testability note (reference-clock injection)
- Core §24 — `AuthFailed` error code family
