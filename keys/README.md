# Release Keys

Public keys used for verifying signed artifacts distributed with SOA-Harness releases.

## Current release key

| File | Algorithm | Fingerprint (base64url SHA-256 of DER-encoded pubkey) | First used |
|---|---|---|---|
| `soa-release-v1.0.pub` | Ed25519 | `pV5dl4OVvpjgLhJCeFddcZPHAWK3n4v1WAPL/3rE+sA=` | v1.0.0 |

The fingerprint appears in `MANIFEST.json` as `publisher_kid` and binds every signed artifact in the v1.0 release bundle to this key. Verify any signed artifact against this public key following the §5.3 bootstrap protocol.

## Private-key custody

The corresponding private key is held by the single maintainer, passphrase-encrypted, backed up to two offline locations per `docs/m6/release-key-ceremony.md`. Never check the private key into any git repository.

## Rotation

Release-key rotation is governed by:
- Core §5.3.1 for bootstrap-layer trust anchors
- `docs/errata-policy.md` for the release process (editorial in the compromise-response case, breaking for voluntary rotation without prior notice)

Rotation always emits a new public key file here under a distinct filename (e.g., `soa-release-v1.1.pub`). The old key file is retained for a full rotation-overlap window so adopters can verify artifacts signed with either.
