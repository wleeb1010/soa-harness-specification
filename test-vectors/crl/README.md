# CRL State-Machine Test Vectors

Freshness-state fixtures for the Certificate Revocation List cache defined in **Core §7.3.1**. Consumed by `soa-validate` (HR-02) to exercise the three-state machine the Runner MUST implement: `fresh` | `stale-but-valid` | `expired`.

## Why this directory exists

The validator session flagged a Week 2 gap: no positive-path fixtures existed for HR-02, so `soa-validate` could only assert the schema (rejection of malformed CRL bodies). Real state-machine coverage requires three schema-valid CRL bodies, each designed to land in a specific freshness state given a reference clock.

## The three freshness states (Core §7.3.1)

| State | Definition | Verification behavior |
|---|---|---|
| **fresh** | `now − issued_at ≤ refresh_interval` (default 1 h) and `now < not_after` | Accept verification; no background refresh needed. |
| **stale-but-valid** | `now − issued_at > refresh_interval` AND `now − issued_at ≤ 2 h` (hard ceiling) AND `now < not_after` | **Accept verification** AND schedule a background CRL refresh. Must NOT fail closed. |
| **expired** | `now ≥ not_after` OR `now − issued_at > 2 h` unreachable OR no cache entry | Fail closed with `CardSignatureFailed`, reason `crl-expired` (or `crl-unreachable` / `crl-missing` per Runner-side condition). |

## Fixtures

All fixtures use a reference clock of `T_ref = 2026-04-20T12:00:00Z` when computing the expected state. The validator MUST inject this clock (or equivalent) when evaluating these fixtures; using real wall-clock time makes the state-machine test non-deterministic.

| File | `issued_at` | `not_after` | Age at T_ref | Expected state |
|---|---|---|---|---|
| `fresh.json` | `2026-04-20T12:00:00Z` | `2026-04-21T12:00:00Z` | 0 s (≤ 1 h) | **fresh** |
| `stale.json` | `2026-04-20T10:30:00Z` | `2026-04-21T12:00:00Z` | 90 min (> 1 h, ≤ 2 h) | **stale-but-valid** |
| `expired.json` | `2020-01-01T00:00:00Z` | `2020-06-30T23:59:59Z` | ~ 6 years (also past `not_after`) | **expired** |

`expired.json` is past `not_after` at every plausible wall-clock time, so it tests the `expired` branch **without** requiring an injected clock. The other two require an injected `T_ref` to land in their intended state — this is normal for freshness-state fixtures and is called out explicitly in the validator test-case comment.

## Schema conformance

All three files validate against `schemas/crl.schema.json`. `stale.json` additionally exercises the `revoked_kids[]` shape (non-empty, one entry with `reason = "compromise"`) to confirm that the revoked-kid list round-trips through the validator.

## Fixed test values (DO NOT USE IN PRODUCTION)

- `issuer` = `CN=SOA-Harness Test Release CA, O=SOA-Harness Test Fixtures, C=US` (matches the issuer string used by `test-vectors/initial-trust/` fixtures, so the same synthetic trust anchor covers both test sets)
- Revoked kid in `stale.json` = `soa-test-compromised-v0.9` — obviously a test value

## How to regenerate

These fixtures are hand-authored. Timestamps are chosen to land in specific states under the stated `T_ref`; a generator would offer no additional value at this scale. If `schemas/crl.schema.json` changes in a way that affects validity, update the fixture explicitly in a dedicated commit and bump the MANIFEST digest.

## Referenced sections

- Core §7.3.1 — CRL cache three-state machine
- Core §24 — `CardSignatureFailed` closed-set reason codes (`crl-expired`, `crl-unreachable`, `crl-missing`)
- Core §10.6 — revocation enforcement in permission resolution path
