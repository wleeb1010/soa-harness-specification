# PermissionPrompt + PDA Test Vector (UV-P-17..20)

Reference flow demonstrating the prompt-nonce + replay-cache + deadline rules from UI §11.4.1.

## Files

| File | Purpose |
|---|---|
| [`permission-prompt.json`](./permission-prompt.json) | Example `PermissionPrompt` as the Gateway would emit it — carries the REQUIRED `payload.nonce` field minted fresh by the Gateway. |
| [`canonical-decision.json`](./canonical-decision.json) | Matching `canonical_decision` that echoes the `prompt_id`, `session_id`, and the same `nonce` back. |
| [`pda.jws`](./pda.jws) | Detached PDA-JWS demonstrating the compact serialization `BASE64URL(header) . BASE64URL(JCS(canonical_decision)) . BASE64URL(sig)`. Placeholder Ed25519 signature (all-zero); real signing requires a handler keystore. |

## Expected bytes

- `JCS(canonical-decision.json)` = 385 bytes
- `sha256("JCS(canonical_decision)")` = `7bc890692f68b7d3b842380fcf9739f9987bf77c6cdf4c7992aac31c66fe4a8a`
- `nonce` in both prompt payload and decision = `q9Zt-X8bL4rFvH2kNpR7wS` (22 URL-safe chars — meets the `^[A-Za-z0-9_-]{16,}$` pattern)

## What this vector exercises

### UV-P-17: Gateway mints the nonce
`permission-prompt.json` includes `payload.nonce` (required by the schema as of round 5).

### UV-P-18: Nonce equality enforced
`canonical-decision.json.nonce === permission-prompt.json.payload.nonce`. A Gateway verifying the paired PDA-JWS MUST confirm the equality.

### UV-P-19: Replay cache single-use
Conformance harness: replay the same `(session_id, nonce) = ("ses_7fce271312c1824bf9", "q9Zt-X8bL4rFvH2kNpR7wS")` after successful verification — the second attempt MUST reject with `ui.prompt-signature-invalid` (reason `replay`).

### UV-P-20: Deadline enforced on both PDA paths
`payload.deadline = 2026-04-18T12:05:00.000Z`. Submit the same PDA at wall clock `2026-04-18T12:05:31.000Z` (past deadline + 30 s skew) — Gateway MUST reject with `ui.prompt-expired`, identically for PDA-JWS and PDA-WebAuthn.

## How the conformance harness uses the vector

1. Load `permission-prompt.json` and inject it into the Gateway's session stream.
2. Submit `pda.jws` as a `PromptDecision` command.
3. Validate the Gateway's response against UV-P-17..20 expectations.
4. Replay `pda.jws` → MUST be rejected (UV-P-19).
5. Advance mock time past `deadline + 30s` and submit a fresh prompt+PDA with the same pattern — MUST be rejected (UV-P-20).

The placeholder `sig` in `pda.jws` means this vector demonstrates the SHAPE and SEQUENCING of the flow but cannot pass real signature verification. Implementations targeting `SV-CARD-03`-level test coverage should regenerate the JWS with their own keystore — the PermissionPrompt and canonical-decision byte sequences are stable and safe to reuse.

## Regenerating pda.jws with a real key

```bash
# Example: sign the JCS-canonical canonical_decision bytes with Ed25519
node -e "
const fs=require('fs');
const { sign } = require('@noble/ed25519');  // or 'jose' / openssl
function jcs(v){ /* minimal JCS — see build-manifest.mjs in repo root */ }
const cd = JSON.parse(fs.readFileSync('canonical-decision.json','utf8'));
const canonBytes = Buffer.from(jcs(cd), 'utf8');
const header = Buffer.from(JSON.stringify({alg:'EdDSA',kid:'<your kid>',typ:'soa-pda+jws'}),'utf8').toString('base64url');
const payload = canonBytes.toString('base64url');
// sig = Ed25519-sign( header + '.' + payload, private_key )
// const signature = Buffer.from(await sign(header + '.' + payload, privateKey)).toString('base64url');
// fs.writeFileSync('pda.jws', header + '.' + payload + '.' + signature);
"
```
