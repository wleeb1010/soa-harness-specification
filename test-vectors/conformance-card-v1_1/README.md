# Conformance Card v1.1 Fixture (SV-SESS-09 Drift Test Companion)

Companion to `test-vectors/conformance-card/agent-card.json`. Identical in every field except `version` — this fixture carries `"version": "1.1.0"` vs the original's `"1.0.0"`. Used by `SV-SESS-09` (card-version-drift) to exercise §12.5 step 2.

## Why this fixture exists

Impl's `RUNNER_CARD_FIXTURE` loader performs a MANIFEST digest check, which correctly refuses to serve a tampered fixture. That same check makes `SV-SESS-09` live-testing impossible without a second fixture: the validator cannot swap the served card to trigger `card_version` drift without failing the digest check first.

Root-cause fix: ship a SECOND conformance card fixture with a different `version` field, both pinned in MANIFEST. Validator swaps `RUNNER_CARD_FIXTURE` between the two via subprocess restart. Each file passes its own digest check individually; swapping the env var is legitimate reconfiguration, not tampering.

## How the drift test uses it

1. Launch impl with `RUNNER_CARD_FIXTURE=<spec>/test-vectors/conformance-card/agent-card.json` (version 1.0.0).
2. Mint a session via `POST /sessions`; drive a side_effect through `POST /permissions/decisions`. Session file on disk now carries `card_version="1.0.0"` (or whatever impl chose to derive from the Agent Card's `version` field).
3. Kill impl subprocess.
4. Relaunch impl with `RUNNER_CARD_FIXTURE=<spec>/test-vectors/conformance-card-v1_1/agent-card.json` (version 1.1.0).
5. Impl's startup resume scan (§12.5 trigger 1) invokes `resume_session` for the interrupted session.
6. `resume_session` step 2 compares session's `card_version` against the currently-served card. Mismatch.
7. Assert the session is terminated with `StopReason::CardVersionDrift`. Audit log records the drift.

The rest of the card (trust anchors, activeMode, permissions, memory, etc.) is deliberately byte-identical to the v1.0 fixture. The ONLY semantic change is `version`. This isolates SV-SESS-09's assertion to card_version drift specifically — not any other card-field mutation.

## What does NOT change

- `security.trustAnchors` — identical. Both fixtures validate against the same handler keypair and the same placeholder trust anchor.
- `permissions.activeMode` — DangerFullAccess, identical to v1.0 fixture. Session bootstrap path unchanged.
- All other semantic fields.

## Impl contract

Conformance impl's `RUNNER_CARD_FIXTURE` loader MUST:
- Accept either fixture path
- Substitute the placeholder SPKI at `trustAnchors[0].spki_sha256` with the runtime key SPKI, preserving all other bytes verbatim
- Verify the (substituted) card's digest matches MANIFEST.supplementary_artifacts entry for the corresponding path
- NOT conflate the two fixtures' digests — each has its own MANIFEST entry

Cross-swap detection (malicious scenario): if an attacker serves the v1.0 fixture's content at the v1.1 path (or vice versa), the MANIFEST digest check correctly rejects it. The two fixtures produce different SHA-256 values at the byte level (`version` string alone guarantees this).

## Referenced sections

- Core §12.1 Session File Schema (card_version field)
- Core §12.5 Resume Algorithm step 2 (drift termination rule)
- Core §12.5 Trigger Points — when resume fires
