# Pre-signed Permission Decision JWS Fixture

Companion to `test-vectors/handler-keypair/`. A pre-signed PDA (compact JWS) + its canonical-decision body, ready for `SV-PERM-21` happy-path validation.

## Contents

| File | Purpose |
|---|---|
| `canonical-decision.json` | The decision body: prompt_id, nonce, decision=approve, user_sub, tool, args_digest, capability, control, handler_kid, decided_at. Plain JSON (pretty-printed for readability). The signing input is the **JCS-canonicalized** form of these same bytes. |
| `pda.jws` | Compact-JWS serialization. Three base64url segments separated by dots. Header is `{"alg":"EdDSA","kid":"soa-conformance-test-handler-v1.0","typ":"soa-pda+jws"}`. Signature produced by the private key in `test-vectors/handler-keypair/private.pem`. |

## The decision

Canonical-decision.json declares a Prompt-approval for the synthetic tool `fs__write_file` under capability `WorkspaceWrite`, control `Prompt`. This matches the resolver output for `fs__write_file` against a DangerFullAccess-activeMode session (per the pinned Tool Registry — `fs__write_file` is `risk_class=Mutating, default_control=Prompt`). When an impl running with the conformance card evaluates this decision, the resolver computes `Prompt` and the PDA supplies the required signed approval.

## How SV-PERM-21 uses it

Validator's happy-path assertion:

1. Create a session via `POST /sessions` with `requested_activeMode: WorkspaceWrite` (or DangerFullAccess) and `request_decide_scope: true`.
2. Read `pda.jws` as a string.
3. Read `canonical-decision.json` → extract `tool` (should be `fs__write_file`) and `args_digest`.
4. POST to `/permissions/decisions`:
   ```json
   {
     "tool": "fs__write_file",
     "session_id": "<the session you minted>",
     "args_digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
     "pda": "<contents of pda.jws>"
   }
   ```
5. Assert `201 Created`, `decision: "Prompt"`, `handler_accepted: true`, `audit_this_hash` is a fresh 64-char hex, `audit_record_id` present.
6. Read `/audit/tail` → `this_hash` matches the response's `audit_this_hash`.
7. Read `/audit/records` → the newest record has `signer_key_id` equal to `soa-conformance-test-handler-v1.0`.

## Note on the nonce

The fixture's nonce (`soa-conformance-test-nonce-01`) is pinned for determinism. In production, each Prompt carries a Gateway-minted per-prompt nonce (UI §11.4.1). The conformance assertion does NOT exercise the Gateway's nonce replay cache — that's a separate UI-profile concern (M3). For the Core-profile `SV-PERM-21` live path, the fixture nonce is sufficient.

## Regenerating

If the canonical-decision structure changes (e.g., new required field added to `canonical-decision.schema.json`), regenerate via the same deterministic seed used for `test-vectors/handler-keypair/` — see that directory's README. The regen script is intended to live under `test-vectors/handler-keypair/generate.mjs` as a follow-up artifact (not yet shipped; manual regen for now).

## Referenced sections

- Core §6.1.1 row 4 — PDA-JWS signing profile
- Core §10.3.2 — Permission Decision Recording
- Core §10.4 — Handler class (Interactive)
