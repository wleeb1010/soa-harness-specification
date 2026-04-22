# Bootstrap Secondary-Channel Fixture — SV-BOOT-05

Pinned dissenting-channel fixture for `SV-BOOT-05` exercising the §5.3.2 multi-channel split-brain detection rule.

## What this fixture is

A synthetic `initial-trust.json` that carries a DIFFERENT `publisher_kid` + `spki_sha256` than whatever the Runner's authoritative channel reports. When the Runner observes both channels simultaneously via the §5.3.3 `SOA_BOOTSTRAP_SECONDARY_CHANNEL` env hook, §5.3.2 rule 2 triggers:

> Emit `HostHardeningInsufficient` (reason `bootstrap-split-brain`) to the audit sink with both observed values, the authoritative channel name, and the dissenting channel name.

## Files

| File | Purpose |
|---|---|
| `initial-trust.json` | Dissenting bootstrap anchor (different publisher_kid + spki_sha256 from conformance-card's authoritative channel) |

## Validator choreography

```
SOA_BOOTSTRAP_CHANNEL=sdk-pinned                                                # authoritative
SOA_BOOTSTRAP_SECONDARY_CHANNEL=test-vectors/bootstrap-secondary-channel/initial-trust.json   # dissenting
```

Validator spawns subprocess-isolated Runner with:
- SDK-pinned authoritative anchor = `soa-conformance-test-release-v1.0` + SPKI `16dc826f…250606`.
- Dissenting fixture anchor = `soa-dissenting-channel-v1.0` + SPKI `ffff…0001` (obviously different).

Runner MUST:

1. Detect the disagreement during bootstrap.
2. Fail `/ready` with 503, reason `bootstrap-split-brain`.
3. Emit `HostHardeningInsufficient` record on `/logs/system/recent?category=Config` with both values + channel names.
4. NOT load either anchor for Card/PDA verification — fail-closed per §5.3.2 rule 5.

## Production guard

The `SOA_BOOTSTRAP_SECONDARY_CHANNEL` env var is test-only. Runner MUST refuse startup when set AND listener binds to non-loopback interface. Same pattern as `SOA_BOOTSTRAP_DNSSEC_TXT`.

## Referenced sections

- Core §5.3.2 — Anchor Disagreement and Split-Brain
- Core §5.3.3 — Bootstrap Testability Env Hooks
- Core §24 — `HostHardeningInsufficient` error code
