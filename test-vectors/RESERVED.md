# Reserved Test IDs

This document reserves test-vector identifiers that are cited normatively in the specifications but whose concrete test-vector artifacts are not yet published. Each entry names the ID, the normative clause it is tied to, and the minimum scope a conforming implementation of that test MUST cover.

Reserved IDs MUST be honored by `soa-validate --strict` as "assertion present, evidence pending." An implementation claiming conformance to a profile that covers any reserved ID MUST document which of the reserved tests it has locally implemented; publishing a reference test vector that matches the scope below promotes the ID from reserved to published.

Reserved IDs MUST NOT be re-purposed for unrelated assertions, renumbered, or silently filled. Changes to a reserved ID's scope (without a spec change) are prohibited under the governance rules of Core §19.

## UV-ERR-02..17 — UI §21.2 Emission Triggers

Sixteen tests, one per emission trigger in UI §21.2. Each test MUST:

1. Construct a Gateway in the minimally-sufficient state to produce the relevant failure condition (e.g., for `UV-ERR-02 / ui.auth-required`, a Gateway with an authenticated-endpoint configured but no trust store populated).
2. Invoke the endpoint with a payload crafted to trip the trigger (missing token, expired token, oversize frame, etc.).
3. Assert that the emitted error envelope's `code` equals the expected value and that the HTTP/WS status matches the §21 table row.
4. Assert the envelope's `message` field is operator-readable (non-empty, no stack trace) and that `www-authenticate` is present for auth-class 401s.
5. Record the Gateway profile (`web`, `ide`, `mobile`, `cli`) used; each of the sixteen tests MUST run in every profile the Gateway claims to support.

| ID | Code | Trigger |
|---|---|---|
| `UV-ERR-02` | `ui.auth-required` | Request with no bearer |
| `UV-ERR-03` | `ui.token-expired` | Bearer with `exp` in past + §1 skew |
| `UV-ERR-04` | `ui.scope-insufficient` | Command requiring scope not granted |
| `UV-ERR-05` | `ui.session-cap-expired` | Capability token after TTL |
| `UV-ERR-06` | `ui.idp-discovery-failed` | Unreachable `issuer` |
| `UV-ERR-07` | `ui.transport-unsupported` | Client asks for TLS 1.2 or un-advertised transport |
| `UV-ERR-08` | `ui.frame-too-large` | WS frame > `max_event_bytes` |
| `UV-ERR-09` | `ui.rate-limited` | Commands over per-profile ceiling (UI §17) |
| `UV-ERR-10` | `ui.unknown-session` | Subscribe to non-existent `session_id` |
| `UV-ERR-11` | `ui.command-rejected` | Runner 4xx on forwarded command |
| `UV-ERR-12` | `ui.prompt-not-assigned` | Read-only observer submits decision |
| `UV-ERR-13` | `ui.handoff-observe-only` | Observer tries to cancel handoff |
| `UV-ERR-14` | `ui.gateway-unavailable` | `/ready` returns 503 |
| `UV-ERR-15` | `ui.artifact-not-found` | Unknown `artifact_id` |
| `UV-ERR-16` | `ui.artifact-too-large` | Range exceeds artifact size |
| `UV-ERR-17` | `ui.artifact-retention-expired` | Artifact past retention |

## UV-P-22 — PDA-JWS and PDA-WebAuthn Format Independence

Prove that a Gateway configured to accept both PDA-JWS and PDA-WebAuthn accepts each format independently when presented for the same `(session_id, prompt_id)`, and rejects a mixed-format attack where the caller swaps PDA format mid-flight. Scope per UI §11.4 relationship paragraph.

## SV-SESS-12 — Replay Cache / Tool Idempotency Disjointness

Prove that the UI §11.4.1 prompt-nonce replay cache and the Core §12.2 tool-idempotency dedupe are implemented as disjoint subsystems. Test MUST:

1. Hit the prompt-nonce cache (valid PDA, second PDA with same nonce), observe `ui.prompt-signature-invalid`.
2. Independently hit the tool-idempotency cache (tool call with same `X-Soa-Idempotency-Key`), observe the dedupe hit in tool storage.
3. Assert that the two events produce independent metrics on `soa_ui_replay_cache_*` and `soa_tool_idempotency_*` respectively and that neither increments the other.

## UV-TRUST-01..03 — Event Type → Trust Class Mapping Fidelity

Three tests covering UI §8.2 / Core §14.1.2 closed mapping:

- `UV-TRUST-01`: Gateway delivers every Core pass-through `type` with the exact `trust_class` specified in Core §14.1.2.
- `UV-TRUST-02`: Gateway rejects an event whose type would map under Core §14.1.2 to `system` when the caller has scope `ui.read` only (per §11.2 stub-prompt rule).
- `UV-TRUST-03`: Gateway rejects with `ui.gateway-config-invalid` an event whose `type` is unknown to both Core §14.1 and UI §8.2.

## UV-E-09 — UI-Derived Event Payload Schema Validation

Prove that every UI-derived event (§8.2 twelve types) validates against its UI §8.2.1 schema, and that a payload deviating in any required-field dimension is rejected before delivery.

## UV-LOG-01..03 — Logging Privacy Redaction (§25.3, UI §15.6)

Three tests verifying that Gateway strips `data_class=personal|restricted` fields from log output under representative payloads: (01) personal email in a tool result, (02) restricted API key in a peer message, (03) nested personal field inside a structured tool call.

## UV-REPL-01..04 — Replay Buffer Bounds (§25.3, UI §17.5)

Four tests verifying buffer ceilings and rejection semantics: (01) `buffer_events` overflow triggers eviction in insertion order, (02) `buffer_seconds` horizon triggers age-based eviction, (03) subscribe requesting sequence before retention returns `ui.replay-gap`, (04) backfill exceeding `max_backfill` returns `ui.replay-exhausted` with partial results.

---

## Governance

Promotion of a reserved ID to published status requires the usual Core §19 MUST-to-test-map update and the corresponding artifacts under `test-vectors/`. A reserved ID that remains unpublished at the next minor release MUST be explicitly retained in this document with a note explaining the delay; dropping a reserved ID silently is forbidden.
