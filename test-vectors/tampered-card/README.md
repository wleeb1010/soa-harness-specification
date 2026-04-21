# Tampered Agent Card JWS Fixture

Pinned tampered-signature fixture for `HR-12` per Core §15.5:

> **HR-12** · *Tampered Card bytes → `CardInvalid`; Runner fails closed.*

## Why this exists

`HR-12` asserts that a conforming Runner fails closed when fed a cryptographically-invalid Agent Card JWS. Testing this requires a fixture whose card body AND header are schema-valid but whose **signature** is mathematically wrong. Impls and validators both need the same pinned fixture to compare conformance behavior.

## Contents

`agent-card.json.tampered.jws` is a detached JWS built on the same protected header as `test-vectors/agent-card.json.jws` — same `alg: EdDSA`, same `kid: soa-release-v1.0`, same `typ: soa-agent-card+jws` — but its signature portion is all-zeros (64 bytes of `\x00` base64url-encoded as `AAAA…`). The header is valid; the signature is not.

Detached JWS layout (RFC 7515 § Appendix F):

```
<base64url protected header>..<base64url signature>
```

The middle (detached payload) is empty, as required for detached mode. The signing input is JCS(agent-card.json) per §6.1.1 — same payload as the valid fixture. Verifying the all-zeros signature against that payload under the valid `x5c` key MUST fail with `CardSignatureFailed` (reason `signature-invalid`).

## How conformance impls consume this fixture

At boot or on card re-fetch, impl MUST:

1. Fetch or load the Agent Card body (the matching unmodified `test-vectors/agent-card.json` works as the body).
2. Fetch or load this `.tampered.jws` as the detached JWS.
3. Attempt JWS verification per §6.1.1 (re-canonicalize body with JCS, verify detached signature against `x5c[0]`).
4. Assert the verification **fails** with error code `CardSignatureFailed` and reason `signature-invalid`.
5. Assert the Runner **refuses to serve** the card (startup fails with `HostHardeningInsufficient` OR running Runner flips `/ready` to 503 with reason `card-signature-invalid` on re-verify).

## How validator consumes this fixture

Validator's `HR-12` test executes the impl in a dedicated configuration where this fixture is the card's JWS (e.g., `RUNNER_CARD_JWS=<path-to-this-file>`). Validator asserts:
- Impl process exits non-zero OR `/ready` returns 503 with reason `card-signature-invalid` within 5 seconds of startup.
- `/audit/tail` hash chain does NOT contain a record for the failed verification (audit events for boot-time failures go to stderr + local ops log, not the permission audit log).
- The happy-path card (`test-vectors/agent-card.json.jws`) continues to work when this fixture is removed — confirms the impl's verification path isn't generally broken.

## Not applicable to cards with hardcoded anchors

If the impl is configured with a trust anchor that happens to match an all-zeros signature (practically impossible for Ed25519 but theoretically possible for a catastrophically broken toy key), this fixture would not exercise `HR-12`'s intended failure mode. Real impls using real keys have no such risk.

## Referenced sections

- Core §6.1 — Discovery and Transport
- Core §6.1.1 — Artifact Signing Profile
- Core §15.5 — Harness Regression Suite (HR-12 definition)
- Core §24 — `CardSignatureFailed` closed-set reason codes
