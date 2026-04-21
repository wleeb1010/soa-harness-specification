# Conformance Test Handler Keypair

Pinned Ed25519 keypair used by `SV-PERM-21` (PDA verify happy path) conformance tests. Both halves of the keypair are shipped — the private key is **intentionally public** because this is a test fixture, not a production credential.

## DO NOT USE IN PRODUCTION

The private key below is committed to this public repo. Any Runner that accepts PDAs signed by this key is either (a) running conformance tests or (b) misconfigured. Operators who copy this fixture into a real deployment have a security incident.

## Contents

| File | Purpose |
|---|---|
| `private.pem` | PKCS#8 PEM of the Ed25519 private key. Validators use this to sign PDAs for `SV-PERM-21` happy-path assertions. |
| `public.pem` | SPKI PEM of the Ed25519 public key. |
| `public.jwk.json` | JWK form of the public key (`kty: OKP`, `crv: Ed25519`, `kid: soa-conformance-test-handler-v1.0`). |
| `spki_sha256.txt` | Hex SHA-256 of the DER-encoded SPKI (64 chars lowercase). Matches what appears in `test-vectors/conformance-card/agent-card.json` `security.trustAnchors[1].spki_sha256`. |

## Fixed SPKI

```
749f3fd468e5a7e7e6604b71c812b66b45793228b557a44e25388ed07a8591e3
```

## Deterministic derivation

The keypair is generated from a fixed 32-byte seed: the UTF-8 bytes of the ASCII string

```
SOA-HARNESS-CONFORMANCE-TEST-HANDLER-KEYPAIR-v1.0-seed-32bytes!
```

(truncated to exactly 32 bytes — the `!` at position 31 is the last included byte). Anyone regenerating the fixture from this seed produces byte-identical `private.pem`, `public.pem`, and `public.jwk.json`. This determinism is the pin: if the fixture bytes drift in MANIFEST.supplementary_artifacts, someone either changed the seed derivation or the Node 22 crypto API for Ed25519 PKCS#8 changed — flag it as a regen.

## How impl consumes

When `RUNNER_CARD_FIXTURE=test-vectors/conformance-card/agent-card.json` is loaded, the card's `security.trustAnchors` array now carries **two** entries:

1. `trustAnchors[0]` — placeholder SPKI (`16dc826f…250606`) that the impl substitutes at load time with its own runtime signing key's SPKI. This anchor authorizes the served Agent Card JWS.
2. `trustAnchors[1]` — the pinned handler-keypair SPKI (`749f3fd4…8591e3` — the value above). This anchor authorizes PDA-JWS signatures on `canonical-decision.json` bodies. Impl does NOT substitute this entry; it's recognized as-is at load.

Impl's PDA verification path iterates `trustAnchors` looking for a matching `kid`. When a PDA signed by the conformance test handler (`kid: soa-conformance-test-handler-v1.0`) is submitted to `POST /permissions/decisions`, impl finds the anchor at `trustAnchors[1]`, verifies the signature, and returns `handler_accepted: true`.

## How validator consumes

Validator reads `private.pem` at test startup, signs a synthesized `canonical-decision.json` matching what `/permissions/resolve` would produce for the same `(tool, session)` pair, packs it as a compact JWS with:

```
protected header: {"alg":"EdDSA","kid":"soa-conformance-test-handler-v1.0","typ":"soa-pda+jws"}
payload:          JCS(canonical-decision.json)
signature:        Ed25519 over `<headerB64>.<payloadB64>`
```

then submits the compact JWS in the `pda` field of `POST /permissions/decisions`. Expected response:

```
201 Created
{ "decision": "Prompt",
  "handler_accepted": true,
  "audit_record_id": "aud_...",
  "audit_this_hash": "<new tail hash>",
  ... }
```

Audit row's `signer_key_id` equals the PDA's `kid`.

## Referenced sections

- Core §6.1.1 row 4 — PDA-JWS signing profile (compact JWS over JCS(canonical-decision))
- Core §10.3.2 — Permission Decision Recording (consumes PDAs)
- Core §10.4 — Autonomous handler rules (Interactive handler class matches this fixture's role)

## Companion directory

See `test-vectors/permission-prompt-signed/` for a pre-signed PDA built against this keypair — a canonical-decision body + compact JWS pairing used by `SV-PERM-21` when the validator hasn't yet built its own signing loop.
