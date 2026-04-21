# Initial-Trust Bootstrap Test Vectors

Positive- and negative-path fixtures for the operator-bundled bootstrap channel defined in **Core §5.3**. Consumed by `soa-validate` (HR-01) to cover the schema-validation gate AND the post-parse semantic gates (`not_after`, channel enum).

## Why this directory exists

The validator session flagged a Week 2 gap: no happy-path fixture existed for HR-01, so `soa-validate` could only assert the *negative* side of the schema (rejections of malformed bundles). Positive coverage requires a fixture that actually **parses clean** against `schemas/initial-trust.schema.json`, against which the Runner's post-parse semantic checks can then be exercised.

## Fixtures

| File | Schema outcome | Semantic outcome | Expected Runner behavior (§5.3) |
|---|---|---|---|
| `valid.json` | **valid** | `not_after` in 2099, `channel = operator-bundled` | Accept; load trust anchor; continue boot. |
| `expired.json` | **valid** | `not_after` = 2020-06-30 (past) | **Reject** with `HostHardeningInsufficient`, reason `bootstrap-expired`. Must NOT be caught by schema — only by the post-parse clock check. |
| `channel-mismatch.json` | **invalid** (enum violation on `channel`) | n/a (schema rejects before semantic checks run) | **Reject** at schema-validation stage with `HostHardeningInsufficient`, reason `bootstrap-invalid-schema`. Demonstrates the closed-enum guard on `channel`. |
| `mismatched-publisher-kid.json` | **valid** | `channel = sdk-pinned`; `publisher_kid = soa-attacker-masquerade-v1.0` intentionally does NOT match what the served Agent Card claims | **Reject** at card-load with `HostHardeningInsufficient`, reason `bootstrap-missing`. Exercises **SV-BOOT-01 negative path**: the SDK-pinned channel MUST refuse to load an Agent Card whose `security.trustAnchors[].publisher_kid` does not match the SDK-pinned value. Use by pointing the Runner to this fixture + a standard valid card — the boot rejection proves the gate is working. |

## Fixed test values (DO NOT USE IN PRODUCTION)

- `publisher_kid` = `soa-test-release-v1.0`
- `spki_sha256` = `46b2c22947693066db8b341724ac1009db8c8bfcf0564eee05fded5c0441c3b0`
  - Computed as `SHA-256("soa-harness-v1.0-test-fixture-DO-NOT-USE-IN-PRODUCTION")`, UTF-8 bytes.
  - This is a synthetic, publicly-documented value — it does NOT correspond to any real signing key. Any Runner that accepts this as a real trust anchor has a bug.
- `issuer` = `CN=SOA-Harness Test Release CA, O=SOA-Harness Test Fixtures, C=US`

## Clock handling

`expired.json` uses `not_after = 2020-06-30T23:59:59Z`, which is already in the past for every plausible test-run clock. No special clock-injection is required in the validator — a real `time.Now()` suffices.

`valid.json` uses `not_after = 2099-12-31T23:59:59Z`, which is in the future for every plausible test-run clock until the end of the century.

## How to regenerate

These fixtures are hand-authored (not machine-generated) because they are small, stable, and must exercise specific semantic edge cases that a generator cannot synthesize without essentially being a hand-written rule set anyway. If the `initial-trust.schema.json` changes in a way that affects validity of any fixture, update the fixture explicitly in a dedicated commit and bump the MANIFEST digest.

## Referenced sections

- Core §5.3 — Initial Trust Bootstrap
- Core §5.3.1 — 30-day rotation overlap (relevant if `successor_publisher_kid` tests are added later; not covered by this initial set)
- Core §24 — `HostHardeningInsufficient` closed-set reason codes
