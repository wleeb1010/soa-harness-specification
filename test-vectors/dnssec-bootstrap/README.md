# DNSSEC Bootstrap Fixture — SV-BOOT-03

Pinned fixtures for `SV-BOOT-03` exercising the §5.3 DNSSEC-TXT bootstrap channel under three scenarios: valid AD-validated record, empty resolver response, and response missing the AD bit.

## Files

| File | Scenario | Expected Runner behavior |
|---|---|---|
| `valid.json` | DNSSEC-validated TXT record present | Runner accepts, trust anchor loaded from TXT |
| `empty.json` | Empty resolver response (no TXT record at `_soa-trust.*`) | Runner fails startup with `HostHardeningInsufficient(bootstrap-missing)` |
| `missing-ad-bit.json` | TXT response present but AD bit not set | Runner fails startup with `HostHardeningInsufficient(bootstrap-missing)` (AD bit required per §5.3) |

## File shape

Each JSON file matches the shape the Runner expects to read when `SOA_BOOTSTRAP_DNSSEC_TXT=<path>` env hook is set (per §5.3.3):

```json
{
  "txt_record": "publisher_kid=soa-conformance-test-release-v1.0; spki_sha256=16dc826f86941f2b6876f4f0f59d91f0021dacbd4ff17b76bbc9d39685250606; issuer=\"CN=SOA-Harness Conformance Test CA, O=SOA-Harness Test Fixtures, C=US\"",
  "ad_bit": true,
  "empty": false
}
```

- `txt_record` — the TXT record value as it would appear on the wire. Empty string when `empty: true`.
- `ad_bit` — whether the resolver reports the Authenticated Data bit set (DNSSEC validation succeeded).
- `empty` — whether the resolver response contained zero TXT records.

## Validator choreography

```
SOA_BOOTSTRAP_CHANNEL=dnssec-txt
SOA_BOOTSTRAP_DNSSEC_TXT=test-vectors/dnssec-bootstrap/valid.json   # or empty.json / missing-ad-bit.json
```

Validator spawns subprocess-isolated Runner per scenario, observes:

- `valid.json` → Runner reaches `/ready` 200.
- `empty.json` → `/ready` stays 503; `/logs/system/recent?category=Config` carries one `HostHardeningInsufficient(bootstrap-missing)` record.
- `missing-ad-bit.json` → same observation as empty.json — AD bit enforcement per §5.3.

## Production guard

The `SOA_BOOTSTRAP_DNSSEC_TXT` env var is test-only. Runner MUST refuse startup when it is set AND the listener binds to a non-loopback interface. Production Runners use real DNSSEC resolver calls.

## Referenced sections

- Core §5.3 — External Bootstrap Root (DNSSEC TXT channel definition)
- Core §5.3.3 — Bootstrap Testability Env Hooks (this fixture's binding)
- Core §24 — `HostHardeningInsufficient` error code
