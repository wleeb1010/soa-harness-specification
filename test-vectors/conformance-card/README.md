# Conformance Agent Card Fixture

Pinned Agent Card **template** used by conformance test runs — specifically required by `SV-PERM-01` live-path which sweeps three `activeMode` values (ReadOnly, WorkspaceWrite, DangerFullAccess) via §12.6 session bootstrap. Since sessions tighten-only from the card's declared maximum, the card MUST declare the loosest value for every tightened value to be testable.

## Why this directory exists

Before this fixture, the only pinned Agent Card was `test-vectors/agent-card.json` (used by `SV-CARD-01` / `SV-SIGN-01` structural tests). Its `permissions.activeMode` is `"ReadOnly"` — which means sessions against a Runner configured with that card can only request `ReadOnly`. Requesting `WorkspaceWrite` or `DangerFullAccess` would fail `403 ConfigPrecedenceViolation` per §12.6 (the request is LOOSER than the card's declared maximum).

For SV-PERM-01's 24-cell sweep (8 tools × 3 activeModes) the conformance impl MUST load a card with `activeMode = "DangerFullAccess"`. This fixture is that card.

## How impl consumes this fixture

1. Impl reads `agent-card.json` when `RUNNER_CARD_FIXTURE=<path-to-this-file>` is set.
2. Impl substitutes the literal placeholder `__IMPL_REPLACES_SPKI_AT_LOAD__________________________________` in `security.trustAnchors[0].spki_sha256` with the hex SHA-256 of the Runner's actual signing key's SubjectPublicKeyInfo. This is the only field the impl rewrites at load time.
3. Impl JCS-canonicalizes the (substituted) card bytes.
4. Impl signs the canonical bytes with its runtime key, producing the detached JWS.
5. Impl serves the (substituted) card at `/.well-known/agent-card.json` and the JWS at `/.well-known/agent-card.jws`.
6. Impl's own startup verification passes (it uses the same key for signing and trust anchor).
7. Validator fetches both endpoints, verifies the JWS against the trustAnchors SPKI hash, and sees `permissions.activeMode = "DangerFullAccess"`.

**Only the `spki_sha256` field may be substituted.** Any other modification (changing `activeMode`, adjusting `toolRequirements`, etc.) converts the deployment from "conformance-card mode" to "production card" and the Runner MUST refuse to label itself conformance-tested. Verified at runtime by comparing the served card's JCS-canonical bytes (with the placeholder restored) against the fixture's SHA-256 pinned in MANIFEST.

## Non-conformance-safety properties

This fixture deliberately disables feature surfaces that would otherwise require additional spec-required coordination:

- `self_improvement.enabled = false` — no `program.md` required, no self-edit pipeline active
- `memory.enabled = false` — no MCP memory server required
- `permissions.handler = "Interactive"` — the validator acts as the Interactive handler for any `Prompt` decisions
- `permissions.policyEndpoint = null` — `/permissions/resolve` step 4 is always "skipped" (keeps the 24-cell matrix deterministic)
- `permissions.toolRequirements = {}` — no card-side tightening; all tightening comes from the pinned Tool Registry's `default_control` per tool
- `observability.otelExporter` and `auditSink` point to harmless dummy values; impl MAY substitute a local file:// sink for `auditSink` (required by §10.5's external-WORM requirement — for conformance purposes, a local append-only file is acceptable and documented as such)

## NOT a production card

Production Agent Cards are issued by real trust anchors, signed with HSM-backed release keys, and configured per deployment. This fixture is ONLY for conformance testing. Any impl serving this card unmodified to real traffic has a security bug.

## Relationship to test-vectors/agent-card.json

`test-vectors/agent-card.json` remains the pinned fixture for `SV-CARD-01` and `SV-SIGN-01` (tests the spec's canonicalization and signature envelope, not the permission model). Do not merge these two fixtures — they serve different conformance purposes.

## Referenced sections

- Core §6 — Agent Card (what the card is)
- Core §10.1 — Capability Level (`activeMode` semantics)
- Core §12.6 — Session Bootstrap (tightening rule this fixture enables)
- Core §10.3.1 — Permission Decision Observability (the endpoint this fixture feeds)
