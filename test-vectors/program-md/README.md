# program.md Signing Fixture — SV-SIGN-02 / SV-SIGN-05

Pinned `program.md` content plus two detached JWS variants for conformance testing of the §9.2 program.md signing profile. Both JWS files are regenerable via `generate.mjs` using the pinned handler-keypair.

## Files

| File | Purpose | Test |
|---|---|---|
| `program.md` | Pinned minimal program.md (UTF-8, LF line endings) | source payload |
| `program.md.jws` | Detached JWS, basic `{alg, kid, typ}` header | `SV-SIGN-02` |
| `program.md.x5t.jws` | Detached JWS with `x5t#S256` thumbprint header | `SV-SIGN-05` |
| `generate.mjs` | Regeneration script (requires handler-keypair) | — |

## Signing contract

Per §9.2:
- Payload: `program.md` raw UTF-8 bytes (NOT JCS — program.md is human-authored Markdown, byte-exact).
- Detached JWS format: `<headerB64>..<signatureB64>` (empty middle).
- Signing input: `<headerB64>.<payloadB64>` where payload bytes are the raw program.md content.

### Header shape

`program.md.jws` (SV-SIGN-02):
```json
{ "alg": "EdDSA", "kid": "soa-conformance-test-handler-v1.0", "typ": "soa-program+jws" }
```

`program.md.x5t.jws` (SV-SIGN-05):
```json
{ "alg": "EdDSA", "kid": "soa-conformance-test-handler-v1.0", "typ": "soa-program+jws", "x5t#S256": "dJ8_1Gjlp-fmYEtxyBK2a0V5Mii1V6ROJTiO0HqFkeM" }
```

The `x5t#S256` value is the base64url-no-pad SHA-256 of the DER-encoded SPKI of the handler-keypair public key. Matches `test-vectors/handler-keypair/spki_sha256.txt` in hex (`749f3fd468e5a7e7e6604b71c812b66b45793228b557a44e25388ed07a8591e3`), re-encoded.

## Two-step signer resolution (SV-SIGN-05)

Per §6.1.1 row 4: when a JWS header carries `x5t#S256`, verifiers resolve the signer in two steps:

1. Look up the anchor whose `spki_sha256` matches the decoded `x5t#S256` value.
2. Verify that the anchor's `publisher_kid` matches the header's `kid`.

Both steps MUST succeed. The `x5t.jws` variant exercises this path; the basic `.jws` exercises the `kid`-only path.

## Regeneration

```
node test-vectors/program-md/generate.mjs
```

Requires `test-vectors/handler-keypair/private.pem` to be present. Output is deterministic: Ed25519 PureEdDSA signatures are canonical, so identical inputs produce identical outputs. Any byte difference in the regenerated `.jws` files indicates either `program.md` drift or keypair drift.

## Validator choreography

SV-SIGN-02 happy path:
1. Fetch `test-vectors/program-md/program.md.jws` + `program.md` + `test-vectors/handler-keypair/public.jwk.json`.
2. Parse JWS header, assert `alg=EdDSA`, `kid=soa-conformance-test-handler-v1.0`, `typ=soa-program+jws`.
3. Reconstruct signing input: `<headerB64>.<base64url(program.md bytes)>`.
4. Verify Ed25519 signature against handler public key.
5. Expect: valid.

SV-SIGN-05 adds:
6. Assert `x5t#S256` header present.
7. Verify `x5t#S256` base64url decodes to 32 bytes matching `handler-keypair/spki_sha256.txt`.
8. Assert two-step resolution: anchor matched by `x5t#S256` has `publisher_kid` equal to the header's `kid`.

## Referenced sections

- Core §6.1.1 row 4 — JWS signing profile with x5t#S256 resolution
- Core §9.2 — program.md signing contract
- Core §9.3 — program.md markers (not exercised by this fixture)
