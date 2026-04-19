# SOA-Harness UI Integration Profile
**Companion Profile to SOA-Harness Core Specification**
**Version:** 1.0
**Status:** Production Standard — Conformance-Grade
**Date:** 2026-04-18
**Profile Scope:** UI clients (web, IDE extension, CLI dashboard, mobile) consuming a compliant SOA-Harness backend.

---

## 0. Table of Contents

1. Conventions
2. Normative References
3. Abstract, Scope, Non-Goals
4. Design Principles
5. Architecture
6. Transport & Transport Security
7. Authentication, Enrollment & Authorization
8. UI Event Envelope
9. Subscription and Replay
10. Client Command RPC
11. Permission Prompt UI Contract & Attestation
12. A2A Handoff UI Notifications
13. Cost & Observability Surface
14. Session and Artifact Read API
15. Content Safety
16. Accessibility & Internationalization
17. Performance & Backpressure
18. Conformance Profiles
19. UI Validation Suite (`ui-validate`)
20. Versioning & Governance
21. Error Taxonomy (with HTTP + WebSocket mapping)
22. Appendix A — UI vs Gateway MUST Matrix
23. Appendix B — WCAG 2.1 AA Manual Audit Addendum
24. Glossary

---

## 1. Conventions

- BCP 14 keywords apply (MUST, SHOULD, MAY).
- All UI↔Gateway JSON MUST be UTF-8, LF line endings. (ui-validate: UV-E-01)
- All timestamps MUST be RFC 3339 with timezone offset and ≥ millisecond precision. (UV-E-02)
- All identifiers sent over the wire MUST be ≤ 256 bytes. (UV-E-03)
- Every normative MUST in this profile carries an inline `(ui-validate: UV-XX-NN)` tag pointing to the verifying test. Tests with a `†` suffix are partially automated and require completion of Appendix B.

---

## 2. Normative References

- **[SOA-CORE]** SOA-Harness Core Specification v1.0. Conventions in Core §1 (UTF-8, RFC 3339, ISO-8601 durations, LF, JCS canonicalization, clock-skew tolerances) apply to this profile by reference and are not restated.
- **[RFC-8785]** JSON Canonicalization Scheme (JCS) — the canonicalization algorithm for PDA `canonical_decision` bytes (§11.4) and all other signed JSON per Core §1.
- **[RFC-6455]** WebSocket Protocol.
- **[RFC-9110]** HTTP Semantics.
- **[RFC-5424]** Syslog severity levels.
- **[OAuth-2.1-draft]** draft-ietf-oauth-v2-1 (pinned 2026-02 cut) with PKCE.
- **[OIDC-1.0]** OpenID Connect Core 1.0.
- **[RFC-9449]** OAuth 2.0 Demonstrating Proof of Possession (DPoP).
- **[RFC-8705]** OAuth 2.0 Mutual-TLS Client Authentication.
- **[RFC-8693]** OAuth 2.0 Token Exchange.
- **[RFC-8628]** OAuth 2.0 Device Authorization Grant.
- **[WebAuthn-L3]** Web Authentication: An API for accessing Public Key Credentials, Level 3.
- **[COSE]** RFC 9052 CBOR Object Signing and Encryption.
- **[RFC-7515]** JSON Web Signature (JWS).
- **[RFC-7519]** JSON Web Token (JWT).
- **[RFC-8037]** CFRG ECDH and EdDSA for JOSE.
- **[CSP-L3]** Content Security Policy Level 3.
- **[Trusted-Types]** W3C Trusted Types specification.
- **[WCAG-2.1]** Web Content Accessibility Guidelines 2.1 AA (§16 + Appendix B scope the claim).
- **[BCP-47]** Tags for Identifying Languages.
- **[HTML-5]** HTML Living Standard (EventSource).
- **[JSON-SCHEMA-2020-12]** JSON Schema 2020-12.

---

## 3. Abstract, Scope, Non-Goals

### 3.1 Abstract

The Core specification produces typed streams, permission prompts, handoff signals, and observability. A human-facing UI cannot consume these directly without leaking audit credentials or re-implementing trust-class rendering. This profile defines a mandatory **UI Gateway** and a UI contract that renders, commands, and attests against a compliant Runner.

### 3.2 In Scope

Transport, auth + enrollment + attestation, event envelope, prompt flow, handoff UI, cost surface, session/artifact read, content safety, a11y/i18n, four conformance profiles, `ui-validate`.

### 3.3 Non-Goals

- UI visual design, framework choice, theming, analytics, A/B testing.
- Collaborative multi-cursor editing within a session (CRDT).
- Full offline sync of session history.
- Agent-driven UI layout synthesis.
- Payment, subscription, quota UI.
- End-user IdPs beyond OAuth 2.1 / OIDC.
- **Automated claim of full WCAG 2.1 AA conformance.** `ui-validate` tests the automatable subset (Appendix B); a full AA conformance claim requires the manual audit addendum.

---

## 4. Design Principles

- **Backend stays backend.** The Runner MUST NOT serve UI assets. (ui-validate: UV-PRIN-01)
- **UI is an untrusted renderer.** UI enforces no security-critical invariant; the Runner and Gateway enforce.
- **Read-mostly by default.** UIs subscribe to events; writes are the enumerated command set (§10).
- **Trust-class is explicit.** Every content chunk carries a `trust_class` marker; no chunk renders without one.
- **Replayable.** Reconnect resumes from a known sequence number; in-flight prompts survive reconnect.
- **Profile-scaled.** Profiles are proper subsets of Full; each profile's content-safety obligations are fully specified (§15).
- **HITL is a UI primitive.** PermissionPrompt is a first-class interaction with cryptographic attestation.

---

## 5. Architecture

```
┌────────────────┐     WebSocket / SSE / REST / IPC      ┌──────────────────┐
│   UI Client    │ ◄───────────────────────────────────► │    UI Gateway    │
│ (Web/IDE/CLI/  │                                       │  (stateless or   │
│  Mobile)       │                                       │   sticky, HTTP)  │
└────────────────┘                                       └─────────┬────────┘
                                                                   │ mTLS + bearer
                                                                   ▼
                                                         ┌──────────────────┐
                                                         │   SOA Runner     │
                                                         │   (Core)         │
                                                         └──────────────────┘
```

### 5.1 Component MUSTs

See Appendix A for the full UI vs Gateway MUST matrix.

**Gateway** MUST: terminate UI transport (§6); authenticate UI clients (§7); token-exchange to a Runner credential (§7.4); filter/redact per UI scope (§7.5); mint per-session capability tokens (§7.6); enforce rate limits (§17); emit `ui.*` error codes (§21); never serve Runner credentials to UIs. (UV-A-01..04)

**Runner** is unmodified by this profile. Every UI-visible field not present in Core `StreamEvent` payloads is **Gateway-synthesized**; Gateway-synthesized fields carry `"source":"gateway"` per §8.2.

**Pass-through with enrichment carve-out.** Core StreamEvents are passed through semantically unchanged, with one exception: `PermissionPrompt.payload` MAY be enriched by the Gateway with fields `args_redacted`, `context.reasoning_summary`, `context.recent_decisions`, `attestation_required`, and `accepted_attestation_formats` (Core §14.1.1 permits these fields with `additionalProperties: false`). No other Core StreamEvent type may be mutated by the Gateway. Gateways MUST NOT remove, rename, or alter the semantics of any Runner-emitted field.

### 5.2 Deployment Topology Notes (Informative)

- Artifacts MUST be served from a cookie-less origin distinct from the UI origin (§14.3, §15.4). The Gateway MUST publish the artifact origin in its discovery document as `artifacts_origin` (§7.1) so that UIs and conformance tooling can resolve it deterministically. (UV-SESS-06†, verified by the topology probe defined below.)

**Topology probe (normative for UV-SESS-06†).** A conformance client MUST:
(a) resolve `artifacts_origin` (bound to the template variable `{{ARTIFACTS_ORIGIN}}`) and the deployment UI origin (`{{UI_ORIGIN}}`) from the discovery document (§7.1);
(b) verify they differ by registrable domain (eTLD+1);
(c) issue an HTTP GET to an artifact URL and confirm the response carries no `Set-Cookie` headers whose `Domain=` attribute is equal to or a suffix of the UI origin's eTLD+1;
(d) confirm the artifact response sets `Cross-Origin-Resource-Policy: same-site` (or stricter).
A probe recipe with example fixtures is published under `test-vectors/topology-probe.md`.
- Gateway MAY shard sessions across multiple Runners transparently.
- Gateway MAY be stateless at the transport layer but MUST hold buffer state per §17.

---

## 6. Transport & Transport Security

### 6.1 Transports

| Transport | Scheme | Direction | Profiles | RFC |
|---|---|---|---|---|
| WebSocket | `wss://` | Bi-directional | Web, IDE, Mobile | RFC 6455 |
| Server-Sent Events | `https://` | Server→Client | Web fallback, Mobile fallback | HTML Living Standard |
| Long-polling REST | `https://` | Bi-directional (poll) | Mobile low-power, CLI | RFC 9110 |
| Local IPC (Unix socket, named pipe) | `unix:` / `npipe:` | Bi-directional | CLI, IDE | §6.1.1 |

All networked transports MUST be TLS 1.3+. Plain HTTP is NOT permitted. (UV-T-01, UV-T-02)

#### 6.1.1 Local IPC Contract (Normative)

Local IPC transport applies only to CLI and IDE profiles where the UI client and Gateway share the same host or a trusted loopback.

- **Discovery**: Gateway publishes its socket path in `soa-ui-config.json` (§7.1) under `local_ipc`: an object with `unix_socket_path` (POSIX, e.g., `/run/soa/gateway.sock`, mode `0660`, owned by group `soa`) OR `named_pipe_name` (Windows, e.g., `\\.\pipe\soa-gateway`, ACL grants the invoking user's SID). Clients not operating on the same host MUST NOT use this transport.
- **Framing**: newline-delimited JSON (`\n` separator), one envelope per line. Maximum line length equals `max_event_bytes` from the discovery doc.
- **Authentication**: the kernel peer-credentials primitive is authoritative — `SO_PEERCRED` (Linux), `LOCAL_PEEREID` (macOS/BSD), or `GetNamedPipeClientProcessId` + token lookup (Windows). The Gateway MUST NOT accept IPC connections whose peer UID/SID differs from the Gateway's running user unless a site policy explicitly permits cross-UID access via a documented `authorized_peers` list.
- **Token exchange**: on accept, the client sends `{ "op": "authenticate", "access_token": "..." }` as the first line; Gateway validates per §7 (OAuth bearer + DPoP if required) before any `subscribe`. Unauthenticated frames are closed.
- **Attach model**: after `authenticate` success, client proceeds with `subscribe` per §9.1; close on either side tears down the connection. Reconnect follows §9.3 backoff.
- **Profile declaration**: the `subscribe` message MUST include `soa_ui_profile` per §18.1; there is no IPC header equivalent.

### 6.2 Endpoints

| Path | Method | Purpose |
|---|---|---|
| `/.well-known/soa-ui-config.json` | GET | Gateway discovery |
| `/ui/v1/connect` | WebSocket | Bi-directional UI session |
| `/ui/v1/stream/{session_id}` | GET (SSE) | Server-push fallback |
| `/ui/v1/poll/{session_id}` | POST | Long-poll fallback |
| `/ui/v1/command` | POST | Submit a client command (§10) |
| `/ui/v1/uploads` | POST | Large attachment upload (§10.4) |
| `/ui/v1/sessions` | GET | List sessions |
| `/ui/v1/sessions/{session_id}` | GET | Session metadata |
| `/ui/v1/sessions/{session_id}/artifacts` | GET | Artifact list |
| `/ui/v1/sessions/{session_id}/artifacts/{id}` | GET | Artifact bytes |
| `/ui/v1/enroll` | POST | Handler-key enrollment (§7.3) |
| `/ui/v1/revoke` | POST | Revoke per-session capability |
| `/ui/v1/i18n/{locale}.json` | GET | Reference locale map (§16.3) |
| `/ui/v1/ui-errors.json` | GET | Error-code → HTTP/close mapping (§21) |

### 6.3 Framing

- WebSocket frames MUST carry a single JSON envelope (§8) per message; binary frames MUST NOT be used. Artifact download is NOT a WebSocket operation — it is HTTP GET on a separate origin (§14.3). (UV-T-03)
- SSE events: `event:` = envelope `event.type`, `id:` = envelope `ui_sequence`, `data:` = envelope JSON.
- Long-poll returns `{ events: [envelope, ...], next_ack: int, has_more: bool }`.

### 6.4 WebSocket Close Codes (Closed Set)

| Code | Reason | Client re-connect? |
|---|---|---|
| 1000 | Normal | Yes (new session) |
| 1001 | Going away | Yes |
| 1011 | Server error | Yes (backoff) |
| 4001 | Scope revoked | No (re-auth user first) |
| 4002 | Replay gap exceeded | Yes (fresh subscribe) |
| 4003 | Idle timeout | Yes |
| 4004 | Gateway shutdown | Yes (backoff) |
| 4005 | Protocol violation | No (client bug) |
| 4006 | Rate-limit terminal | Yes (longer backoff) |
| 4007 | Capability token expired | Yes (after token refresh) |
| 4008 | Session terminated (Runner) | No |
| 4009 | Essential-event retention exceeded | Yes (fresh subscribe) |
| 4010 | Observer lag (single UI exceeded horizon) | Yes (fresh subscribe) |

Gateways MUST use this set exclusively for 4xxx codes. Codes 4006 (rate-limit terminal), 4009 (essential-event eviction), and 4010 (per-UI lag eviction) are semantically distinct — clients MUST differentiate: 4006 → longer backoff; 4009/4010 → immediate fresh subscribe once within ack window. (UV-T-04)

### 6.5 Transport Security

- **CSP**: Web and IDE profiles MUST serve UI origin with Content-Security-Policy at least as strict as the reference policy in §15.3. (UV-S-01)
- **Token storage**: access tokens in memory only; `localStorage`/`sessionStorage` for long-lived tokens NOT permitted. Refresh tokens MAY use HttpOnly, SameSite=Strict cookies only. (UV-S-02)
- **CSRF**: state-changing endpoints require a double-submit CSRF token OR SameSite=Strict cookies with `Origin` validation. WebSocket upgrade requests MUST have `Origin` checked against a Gateway allowlist. (UV-S-03)
- **Frame embedding**: Gateway MUST send `Content-Security-Policy: frame-ancestors 'self'`. Permission-prompt UI MUST NOT render in an iframe under any condition. (UV-S-04)
- **HSTS**: Web UI origin and Gateway origin MUST send `Strict-Transport-Security: max-age=31536000; includeSubDomains`. (UV-S-05)

---

## 7. Authentication, Enrollment & Authorization

### 7.1 Gateway Discovery

The discovery document served at `/.well-known/soa-ui-config.json` MUST validate against the JSON Schema 2020-12 document below.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://soa-harness.org/schemas/ui/v1.0/gateway-config.schema.json",
  "type": "object",
  "required": ["soa_ui_profile_version","issuer","authorization_endpoint","token_endpoint","scopes_supported","agents_supported","ws_endpoint","rest_base","enroll_endpoint","attestation_formats_supported","max_event_bytes","supported_profiles","replay"],
  "additionalProperties": false,
  "properties": {
    "soa_ui_profile_version":          { "type": "string", "const": "1.0" },
    "issuer":                          { "type": "string", "format": "uri", "pattern": "^https://" },
    "authorization_endpoint":          { "type": "string", "format": "uri", "pattern": "^https://" },
    "token_endpoint":                  { "type": "string", "format": "uri", "pattern": "^https://" },
    "device_authorization_endpoint":   { "type": "string", "format": "uri", "pattern": "^https://" },
    "scopes_supported":                { "type": "array", "items": { "type": "string", "enum": ["ui.read","ui.command","ui.admin"] }, "uniqueItems": true, "minItems": 1 },
    "agents_supported":                { "type": "array", "items": { "type": "string", "format": "uri", "pattern": "^https://" }, "uniqueItems": true, "minItems": 1 },
    "ws_endpoint":                     { "type": "string", "format": "uri", "pattern": "^wss://" },
    "sse_endpoint":                    { "type": "string", "format": "uri", "pattern": "^https://" },
    "rest_base":                       { "type": "string", "format": "uri", "pattern": "^https://" },
    "enroll_endpoint":                 { "type": "string", "format": "uri", "pattern": "^https://" },
    "attestation_formats_supported":   { "type": "array", "items": { "type": "string", "enum": ["jws","webauthn"] }, "uniqueItems": true, "minItems": 1 },
    "dpop_required_for_public_clients":{ "type": "boolean", "default": true },
    "max_event_bytes":                 { "type": "integer", "minimum": 1024, "maximum": 1048576 },
    "supported_profiles":              { "type": "array", "items": { "type": "string", "enum": ["web","ide","mobile","cli"] }, "uniqueItems": true, "minItems": 1 },
    "webauthn_rp_id":                  { "type": "string", "description": "Registrable-domain suffix for WebAuthn RP ID per §7.3; typically eTLD+1 shared by UI and Gateway origins." },
    "artifacts_origin":                { "type": "string", "format": "uri", "pattern": "^https://", "description": "Base URL (scheme + registrable-domain host) from which the Gateway serves tool-output artifacts. MUST differ from the UI origin by eTLD+1 per §5.1 (UV-SESS-06†). The topology probe at test-vectors/topology-probe.md reads this field." },
    "runner_endpoint":                 { "type": "string", "oneOf": [ { "format": "uri", "pattern": "^https://" }, { "const": "loopback" } ], "description": "Base URL of the upstream SOA-Harness Runner the Gateway brokers for (§5, §14.3). Gateway composes `${runner_endpoint}/stream/v1/{session_id}` for SSE subscription. The literal value `loopback` declares co-hosted deployment (Gateway and Runner on the same host, routed over the loopback interface); in that mode outbound mTLS and the CA-digest pin MAY be omitted — see §7.4 for the exact co-host contract. REQUIRED when Gateway is not co-hosted with Runner." },
    "runner_mtls_ca_digest":           { "type": "string", "pattern": "^sha256:[A-Fa-f0-9]{64}$", "description": "SHA-256 of the mTLS CA bundle (DER-encoded root certificate) that the Gateway uses to authenticate the Runner. Gateway MUST verify this digest against its configured CA bundle at every outbound mTLS handshake to the Runner; mismatch fails the handshake with `ui.runner-mtls-failed` and triggers CA-rotation reconciliation before any further stream attempts. REQUIRED when `runner_endpoint` is an https URL." },
    "stream_scope_template":           { "type": "string", "pattern": "^[a-z][a-z0-9:_-]*(\\{[a-z_][a-z0-9_]*\\}[a-z0-9:_-]*)*$", "description": "RFC 6570 Level 1 URI template the Gateway MUST use to build the `scope` parameter for RFC 8693 token exchange on a per-session basis (§7.4). Default: `stream:read:{session_id}`. Admin consumers MAY use the literal scope `stream:read:all`. The authorization server MUST refuse scopes broader than the template's expansion for a given session." },
    "local_ipc": {
      "type": "object",
      "additionalProperties": false,
      "anyOf": [
        { "required": ["unix_socket_path"] },
        { "required": ["named_pipe_name"] }
      ],
      "properties": {
        "unix_socket_path":  { "type": "string", "description": "POSIX socket path, e.g., /run/soa/gateway.sock; mode SHOULD be 0660 with group ownership." },
        "named_pipe_name":   { "type": "string", "description": "Windows named pipe, e.g., \\\\.\\pipe\\soa-gateway." }
      }
    },
    "replay": {
      "type": "object",
      "required": ["buffer_events","buffer_seconds","max_backfill","grace_seconds"],
      "additionalProperties": false,
      "properties": {
        "buffer_events":  { "type": "integer", "minimum": 10000,  "description": "Per-UI replay buffer size; MUST be ≥ 10 000 per §17.5." },
        "buffer_seconds": { "type": "integer", "minimum": 1800,   "description": "Per-UI replay buffer age in seconds; MUST be ≥ 1800 (30 min) per §17.5." },
        "max_backfill":   { "type": "integer", "minimum": 1,      "maximum": 5000, "description": "Upper bound on backfill per subscribe; MUST be ≤ 5000 per §17.5." },
        "grace_seconds":  { "type": "integer", "minimum": 600,    "description": "Reconnect grace window in seconds; MUST be ≥ 600 (10 min) per §9.3." }
      }
    }
  }
}
```

#### 7.1.1 Informative Example

```json
{
  "soa_ui_profile_version": "1.0",
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/token",
  "device_authorization_endpoint": "https://auth.example.com/device",
  "scopes_supported": ["ui.read", "ui.command", "ui.admin"],
  "agents_supported": ["https://agent.example.com"],
  "ws_endpoint": "wss://gateway.example.com/ui/v1/connect",
  "sse_endpoint": "https://gateway.example.com/ui/v1/stream",
  "rest_base": "https://gateway.example.com/ui/v1",
  "enroll_endpoint": "https://gateway.example.com/ui/v1/enroll",
  "attestation_formats_supported": ["jws", "webauthn"],
  "dpop_required_for_public_clients": true,
  "max_event_bytes": 65536,
  "supported_profiles": ["web", "ide", "mobile", "cli"],
  "webauthn_rp_id": "example.com",
  "replay": { "buffer_events": 10000, "buffer_seconds": 1800, "max_backfill": 5000, "grace_seconds": 600 }
}
```

### 7.2 UI Client Identity

- JWT bearer per RFC 7519 with RS256 / ES256 / EdDSA (EdDSA via RFC 8037) signatures; opaque tokens require RFC 7662 introspection. (UV-A-05)
- Access token lifetime ≤ 60 minutes. Authorization-code exchange MUST use PKCE (RFC 7636). Refresh is performed via OAuth 2.1 refresh tokens issued at the initial authorization-code exchange; refresh tokens SHOULD be rotated on use (one-time) and MAY be sender-constrained via DPoP (RFC 9449) for public clients. (UV-A-06)
- Device flow (RFC 8628) MUST be supported for CLI and IDE profiles. (UV-A-07)

### 7.3 Handler-Key Enrollment

Every prompt decision requires a handler-bound attestation (§11.4). To enroll, a user MUST register at least one **attestation credential** with the Gateway. Gateway MUST accept at least one of:

| Attestation Format | Produced By | Profiles |
|---|---|---|
| **JWS** (RFC 7515 compact) over canonical decision JSON | Native keystore (OS-backed: Secure Enclave, TPM, Windows Hello, Linux kernel keyring, HSM); or YubiKey PIV | IDE, Mobile (native), CLI (with keystore) |
| **WebAuthn assertion** per WebAuthn-L3 | Platform or roaming FIDO2 authenticator (PassKey, YubiKey, Touch ID, Face ID, Windows Hello, Android StrongBox) | Web, Mobile (browser), IDE (browser-embedded) |

Enrollment flow (`POST /ui/v1/enroll`):
1. User authenticates via OIDC with sufficient scope (`ui.command` for self-enrollment; `ui.admin` for admin-bound).
2. Client requests a `challenge` from `/ui/v1/enroll` (`{ op: "begin", user_sub }`).
3. Client produces a credential:
   - **JWS path**: generate an Ed25519 or ES256 keypair in the platform keystore; the Gateway accepts the raw public key (JWK) or an X.509 chain terminating in a trust anchor from the agent's `security.trustAnchors`. The challenge is signed to prove possession.
   - **WebAuthn path**: invoke `navigator.credentials.create({publicKey: {...}})` with the Gateway's `challenge`, `rp.id` = the **registrable-domain suffix** shared by the UI origin and the Gateway origin (per WebAuthn L3 §5.1.7 — typically the eTLD+1, e.g., `example.com` when UI is `ui.example.com` and Gateway is `gateway.example.com`), `user` = user sub, `authenticatorSelection.userVerification: "required"`, `attestation: "direct"`. The published `rp.id` MUST appear in the Gateway discovery document (§7.1) as `webauthn_rp_id` so UIs can construct the call without ambiguity. POST the resulting `PublicKeyCredential` to `/ui/v1/enroll` (`{ op: "finish", credential_json, challenge }`).
4. Gateway validates possession, verifies attestation (WebAuthn: chain to an accepted Root CA list; JWS: trust-anchor chain per Core §10.6), assigns a stable `kid`, records `{ kid, user_sub, format, algo, public_key_or_cred_id, enrolled_at, not_after }` in the audit trail.
5. Gateway returns `{ kid, not_after }`. Lifetime ≤ 90 days; rotation is a re-enrollment with a 24-hour overlap window. (UV-P-11)

An enrolled `kid` MUST be bound to one user_sub and one attestation format. A user MAY enroll multiple credentials (primary PassKey + backup YubiKey). (UV-P-12)

**Headless environments** (CI, automated tests, server-side CLI without keystore) MUST use the Device Authorization Grant (RFC 8628) to delegate prompt signing to an out-of-band authenticated device. (UV-P-13)

#### 7.3.1 Gateway CRL Cache (Normative)

Gateway MUST maintain a local cache of each trust anchor's CRL (Core §10.6.1) for the purpose of verifying enrolled handler `kid`s during PDA verification (§11.4). The cache:

- MUST be refreshed at least **once per hour** per trust anchor (matching the Core Runner obligation in §10.6).
- MUST fail-closed on fetch failure beyond `not_after`: past the CRL's declared `not_after` with no successful refresh, Gateway MUST reject every `PermissionDecision` signed by *any* `handler_kid` under that trust anchor with `ui.prompt-signature-invalid` (reason `crl-stale`) until refresh succeeds.
- MUST fail-closed on fetch failure even before `not_after` if the cache has missed two consecutive refresh cycles (> 2 hours without a successful fetch) — Gateway MUST emit `ui.gateway-config-invalid` (reason `crl-unreachable`) and reject new decisions signed under the affected anchor until refresh recovers.
- MUST be covered by observability metrics `soa_ui_crl_cache_age_seconds` (per anchor, sampled at each verification) and `soa_ui_crl_refresh_failures_total`.

Covered by `UV-P-16`.

### 7.4 Token Exchange (Gateway → Runner)

Gateway MUST exchange the UI token for a short-lived Runner credential via RFC 8693. UI MUST NOT receive, forward, or inspect Runner credentials. (UV-A-08)

**Runner discovery (normative, UV-A-16).** The Gateway's upstream Runner is declared in the discovery document (§7.1) via three fields:
- `runner_endpoint` — base URL the Gateway brokers for. The Gateway MUST compose the Runner SSE subscription URL as `${runner_endpoint}/stream/v1/{session_id}` per Core §14.3.
- `runner_mtls_ca_digest` — SHA-256 of the DER-encoded mTLS CA root that signs the Runner's serving certificate. The Gateway MUST verify the Runner's presented certificate chains to a CA whose DER digest equals this value; on mismatch emit `ui.runner-mtls-failed` (§21).
- `stream_scope_template` — RFC 6570 Level 1 URI template the Gateway MUST use to construct the `scope` parameter for token exchange. Default: `stream:read:{session_id}`; admin consumers MAY use `stream:read:all`. Runtime expansion MUST substitute the active `session_id`; requested scopes broader than the template's expansion MUST be refused by the authorization server.

These fields are REQUIRED when the Gateway is not co-hosted with the Runner (the common case). Co-hosted deployments MAY declare the `loopback` sentinel; `UV-A-16` MUST pass either by field presence or by the explicit sentinel with matching co-host evidence.

**Co-host contract (`runner_endpoint: "loopback"`).** When this sentinel appears, the Gateway MUST satisfy ALL of the following at every Runner subscription attempt:
1. Bind the outbound Runner connection to a loopback IP address (`127.0.0.0/8`, `::1/128`, or a UNIX domain socket).
2. Use the scheme `http://` (since TLS on loopback is not meaningful when the peer cannot be tampered with by network attackers) OR `unix://` for a Unix-domain socket bridge.
3. Confirm the Runner process runs under the same security principal (UID on POSIX, user SID on Windows) as the Gateway — e.g., verify `SO_PEERCRED` (Linux), `LOCAL_PEEREID` (BSD/macOS), or `GetNamedPipeClientProcessId` (Windows) before the first subscribe.
4. Emit a one-time `soa_ui_cohost_mode=true` label on every OTel span under `soa.turn` so observability pipelines can distinguish co-host runs from brokered ones.

If any of these invariants fails, the Gateway MUST abort with `ui.gateway-config-invalid` (reason `loopback-mismatch`). `runner_mtls_ca_digest` and out-of-band TLS trust are NOT required in loopback mode; kernel-enforced process identity replaces them.

### 7.5 Scopes and Filtering

| Scope | Grants |
|---|---|
| `ui.read` | Subscribe to authorized streams, read own sessions and their artifacts |
| `ui.command` | Submit commands (§10), respond to own prompts, interrupt own sessions, self-enroll attestation credentials |
| `ui.admin` | Observe all project sessions, admin-dismiss prompts, configure Gateway policy, admin-enroll credentials |

Scope filtering is per-session. `ui.read` MUST NOT receive unredacted `PermissionPrompt` payloads; a **stub event** is delivered instead (§11.2). (UV-A-09)

### 7.6 Per-Session Capability Token

On `/ui/v1/connect` attach, Gateway MUST mint a per-session capability token with:
- `session_id` binding;
- Lifetime ≤ session TTL, capped at 24 hours;
- **Possession binding** via one of (in preference order):
  1. mTLS `cnf` thumbprint (RFC 8705) when the client presents a client certificate;
  2. **DPoP** (RFC 9449) for public clients that cannot mTLS (browsers, mobile web views); Gateway MUST require DPoP proof on every command endpoint when mTLS is unavailable and `dpop_required_for_public_clients=true`. (UV-A-10)
- Revocable via `POST /ui/v1/revoke`. (UV-A-11)

---

## 8. UI Event Envelope

Every event is wrapped; the inner Runner event is passed through unmodified.

### 8.1 Envelope Schema

```json
{
  "$id": "https://soa-harness.org/schemas/ui/v1.0/ui-envelope.schema.json",
  "type": "object",
  "required": ["ui_envelope_version", "ui_sequence", "session_id", "trust_class", "event"],
  "additionalProperties": false,
  "properties": {
    "ui_envelope_version": { "type": "string", "const": "1.0" },
    "ui_sequence": { "type": "integer", "minimum": 0 },
    "session_id": { "type": "string" },
    "turn_id": { "type": "string" },
    "delivery": {
      "type": "object",
      "properties": {
        "ack_required": { "type": "boolean", "default": false },
        "partial": { "type": "boolean", "default": false },
        "essential": { "type": "boolean", "default": false, "description": "Never dropped by backpressure; see §17.3" },
        "retry_hint_ms": { "type": "integer", "minimum": 0 }
      }
    },
    "trust_class": {
      "type": "string",
      "enum": ["system", "user", "model", "tool-output", "untrusted", "agent-peer"]
    },
    "locale_hint": { "type": "string", "pattern": "^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$" },
    "redactions": {
      "type": "array",
      "items": { "type": "string", "enum": ["pii", "secret", "credential", "large-binary"] }
    },
    "event": { "type": "object" }
  }
}
```

(UV-E-04: schema validation on every envelope)

### 8.2 Event Catalog (Closed)

The Gateway delivers exactly the union of (a) the 25 Core `StreamEvent.type` values unmodified and (b) the 12 UI-derived events below. Unknown types on the wire MUST be logged and skipped by UIs (forward-compat).

**Core pass-through types** (from Core §14.1, reproduced here as the authoritative set this profile binds to):

```
SessionStart, SessionEnd,
MessageStart, MessageEnd,
ContentBlockStart, ContentBlockDelta, ContentBlockEnd,
ToolInputStart, ToolInputDelta, ToolInputEnd,
ToolResult, ToolError,
PermissionPrompt, PermissionDecision,
CompactionStart, CompactionEnd,
MemoryLoad,
HandoffStart, HandoffComplete, HandoffFailed,
SelfImprovementStart, SelfImprovementAccepted,
SelfImprovementRejected, SelfImprovementOrphaned,
CrashEvent
```

Trust-class rendering for each Core pass-through type is normatively fixed by Core §14.1.2 (Event Type → Trust Class Mapping). Gateways MUST apply that mapping when populating the envelope's `trust_class` field. Trust-class selection is deterministic from session state (specifically `workflow.status` and, for `PermissionDecision`, the signer's kid against local trust anchors); Gateways MUST NOT inspect Core payload contents to choose a trust_class beyond what §14.1.2 explicitly permits.

#### 8.2.1 UI-Derived Event Payload Schemas (Normative)

Each UI-derived event's `payload` MUST validate against the `$defs` entry below. All entries inherit `source: "gateway"` as a required field.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://soa-harness.org/schemas/ui/v1.0/ui-derived-payloads.schema.json",
  "$defs": {
    "CostUpdate":        { "type":"object","required":["source","session_id","tokens_used_in_turn","tokens_used_in_session","tokens_remaining","billing_tag"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"session_id":{"type":"string"},"turn_id":{"type":"string"},"tokens_used_in_turn":{"type":"integer","minimum":0},"tokens_used_in_session":{"type":"integer","minimum":0},"tokens_remaining":{"type":"integer"},"billing_tag":{"type":"string"},"cache_input_tokens":{"type":"integer","minimum":0},"projected_next_turn":{"type":"integer","minimum":0},"currency_estimate":{"type":"object","required":["amount","currency","source"],"properties":{"amount":{"type":"string"},"currency":{"type":"string","pattern":"^[A-Z]{3}$"},"source":{"const":"advisory"}}}} },
    "PromptAssigned":    { "type":"object","required":["source","prompt_id","state"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"prompt_id":{"type":"string"},"state":{"type":"string","enum":["assigned","unassigned"]},"to_ui_id":{"type":"string"}} },
    "PromptExpired":     { "type":"object","required":["source","prompt_id","expired_at"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"prompt_id":{"type":"string"},"expired_at":{"type":"string"}} },
    "PromptDismissed":   { "type":"object","required":["source","prompt_id","dismissed_by"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"prompt_id":{"type":"string"},"dismissed_by":{"type":"string"},"reason":{"type":"string"}} },
    "DecisionReveal":    { "type":"object","required":["source","prompt_id","revealed_by"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"prompt_id":{"type":"string"},"revealed_by":{"type":"string"},"fields_revealed":{"type":"array","items":{"type":"string"}}} },
    "ConnectionResumed": { "type":"object","required":["source","last_delivered_sequence"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"last_delivered_sequence":{"type":"integer","minimum":0},"partial":{"type":"boolean","default":false},"resume_from":{"type":"integer","minimum":0}} },
    "ScopeChanged":      { "type":"object","required":["source","scopes"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"scopes":{"type":"array","items":{"type":"string","enum":["ui.read","ui.command","ui.admin"]}},"reason":{"type":"string"}} },
    "GatewayHeartbeat":  { "type":"object","required":["source","server_time"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"server_time":{"type":"string"}} },
    "CardSignatureFailed":{ "type":"object","required":["source","agent_url","reason"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"agent_url":{"type":"string","format":"uri"},"reason":{"type":"string"}} },
    "ObservabilityBackpressure":{ "type":"object","required":["source","dropped_count_window"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"dropped_count_window":{"type":"integer","minimum":0},"window_seconds":{"type":"integer","minimum":1}} },
    "SpanSummary":       { "type":"object","required":["source","span_name","duration_ms","status","soa.session.id","soa.turn.id"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"span_name":{"type":"string"},"duration_ms":{"type":"integer","minimum":0},"status":{"type":"string","enum":["ok","error","unset"]},"soa.session.id":{"type":"string"},"soa.turn.id":{"type":"string"}} },
    "StubPromptPlaceholder":{ "type":"object","required":["source","prompt_id","tool_name","risk_class","deadline","state"],"additionalProperties":false,"properties":{"source":{"const":"gateway"},"prompt_id":{"type":"string"},"tool_name":{"type":"string"},"risk_class":{"type":"string","enum":["ReadOnly","Mutating","Destructive"]},"deadline":{"type":"string"},"assigned_to_user_sub_hmac":{"type":"string","pattern":"^hmac-sha256:[A-Fa-f0-9]{64}$","description":"HMAC-SHA256 keyed with the session's per-session secret (not disclosed to UIs); stable within a session, unlinkable across sessions."},"state":{"type":"string","enum":["awaiting","decided","expired","dismissed"]}} }
  }
}
```

#### 8.2.2 Essential-Event Binding for Core Pass-Through Types (Normative)

The `delivery.essential` flag for each Core pass-through type is fixed by the table below. Gateways MUST set `delivery.essential = true` when emitting any of the following; all other Core pass-through types are non-essential by default.

| Core event type | Essential |
|---|---|
| `PermissionPrompt`, `PermissionDecision` | Yes |
| `HandoffStart`, `HandoffComplete`, `HandoffFailed` | Yes |
| `SessionStart`, `SessionEnd` | Yes |
| `CrashEvent` | Yes |
| `SelfImprovementAccepted`, `SelfImprovementRejected`, `SelfImprovementOrphaned` | Yes |
| `ToolResult` | **No** — Gateway MAY drop or redact per §13.3 policy; contradicts any prose that labels this essential. |
| All other Core types | No (coalescing permitted) |

**UI-derived events** (`event.payload.source = "gateway"`):

| Type | Meaning | Essential? |
|---|---|---|
| `CostUpdate` | Token and advisory-cost telemetry (§13.2) | No |
| `PromptAssigned` | Names the UI that owns an in-flight `PermissionPrompt` (§11.6) | Yes |
| `PromptExpired` | Prompt deadline elapsed without decision | Yes |
| `PromptDismissed` | Admin dismissed prompt on user's behalf (§11.6) | Yes |
| `DecisionReveal` | A `ui.admin` revealed redacted args (§11.3) | No |
| `ConnectionResumed` | Reconnect landed; carries `last_delivered_sequence` and `partial` flag (§9.3) | Yes |
| `ScopeChanged` | User scope widened or revoked mid-session | Yes |
| `GatewayHeartbeat` | Keep-alive ≤ 30 s period | No |
| `CardSignatureFailed` | Gateway or peer agent Card signature failed verification (§12.3) | Yes |
| `ObservabilityBackpressure` | Gateway is dropping or coalescing non-essential events (§17.3) | No (rate-limited) |
| `SpanSummary` | Optional OTel span surface for `ui.admin` (§13.3) | No |
| `StubPromptPlaceholder` | Redacted prompt indicator for `ui.read` (§11.2) | Yes |

(UV-E-05: every event observed is a Core-pass-through or a UI-derived in this table)

### 8.3 Ordering Guarantees

- Per-session `ui_sequence` MUST be strictly monotonic and gap-free. (UV-E-06)
- Pass-through events preserve Runner ordering.
- UI-derived events MAY be interleaved; their order relative to adjacent pass-through events is advisory.

---

## 9. Subscription and Replay

### 9.1 Subscribe

```json
{ "op": "subscribe",
  "session_id": "ses_...",
  "soa_ui_profile": "web",
  "filter": { "types": ["ContentBlockDelta","ToolResult","PermissionPrompt","CostUpdate"],
              "include_payload": true },
  "replay": { "from_sequence": 1421, "max_backfill": 5000 } }
```

- `soa_ui_profile` is REQUIRED on the first subscribe message and fixes the session's rate-limit tier (§17). (UV-F-01)
- `filter.types` omitted = all authorized.
- `replay.from_sequence = 0` = session start, subject to retention.
- Excess replay → `ConnectionResumed { partial: true, resume_from }`. (UV-T-05)

### 9.2 Acknowledgment

- `delivery.ack_required = true` → UI MUST `{ op:"ack", ui_sequence:N }` within 30 s, else Gateway assumes disconnect and buffers. (UV-T-06)

### 9.3 Reconnection Grace Window

- On `close codes 1000/1001/4003/4004`: Gateway keeps per-session state for 10 minutes to align with command-idempotency dedupe (§10.3). (UV-T-07)
- Client reconnect uses exponential backoff (base 500 ms, factor 2, jitter ±25%, ceiling 30 s). (UV-T-08)
- Reconnect request includes `last_ack_sequence`; Gateway resumes from there OR sends `ConnectionResumed { partial: true, resume_from }`. (UV-T-09)

### 9.4 Close-Code Client Behavior

Reconnect allowed per §6.4. On `4001` / `4005` / `4008`, client MUST NOT auto-reconnect.

---

## 10. Client Command RPC

### 10.1 Command Set (Closed)

```json
{ "op": "command",
  "command_id": "cmd_<ulid>",
  "session_id": "ses_...",
  "command": { "type": "<ENUM>", "payload": { ... } } }
```

| `command.type` | Required scope | Purpose |
|---|---|---|
| `UserInput` | `ui.command` | Append user turn |
| `CancelTurn` | `ui.command` | Interrupt (maps to `StopReason::UserInterrupt`) |
| `PromptDecision` | `ui.command` | Answer in-flight prompt (§11) |
| `CompactNow` | `ui.command` | Force compaction now, regardless of `triggerTokens` |
| `Handoff` | `ui.admin` | Initiate outgoing A2A handoff |
| `AttachArtifact` | `ui.command` | Reference artifact in next turn |
| `SetBillingTag` | `ui.admin` | Change `billingTag` |
| `SaveDraft` | `ui.command` | UI-only; no Runner hit |
| `DismissPrompt` | `ui.admin` | Deny in-flight prompt on user's behalf |

Unknown types → `ui.unknown-command`. Additions in future versions MUST be additive. (UV-CMD-01)

### 10.2 Response

```json
{ "command_id": "cmd_...",
  "status": "accepted" | "rejected",
  "error": { "code": "ui.*", "message": "..." },
  "runner_request_id": "req_..." }
```

### 10.3 Idempotency

- Client MUST supply `command_id` (ULID RECOMMENDED). (UV-CMD-02)
- Gateway dedupes within 10 minutes; replays return the original response. (UV-CMD-03)

### 10.4 Large Attachments

Payloads > 256 KiB: `POST /ui/v1/uploads` → `{ upload_id, sha256 }`; reference `upload_id` in the command. Gateway verifies sha256 before forwarding. Mismatches → `ui.upload-sha-mismatch`; server→client equivalent `ui.artifact-sha-mismatch` in §21. (UV-CMD-04)

---

## 11. Permission Prompt UI Contract & Attestation

### 11.1 Prompt Payload

When the Runner emits `PermissionPrompt`, Gateway delivers:

```json
{ "event": {
    "type": "PermissionPrompt",
    "payload": {
      "source": "gateway",
      "prompt_id": "prm_...",
      "tool": { "name": "mcp__files__delete_file",
                "risk_class": "Destructive",
                "description": "Deletes a file on disk",
                "args_redacted": { "path": "<redacted:pii>" },
                "args_digest": "sha256:..." },
      "context": {
        "capability": "WorkspaceWrite",
        "control": "Prompt",
        "handler": "Interactive",
        "reasoning_summary": "Model intends to remove the stale draft.",
        "recent_decisions": [
          { "prompt_id": "prm_...", "tool": "mcp__files__write_file", "decision": "allow", "at": "2026-04-18T14:22:03Z" }
        ]
      },
      "deadline": "2026-04-18T14:25:00Z",
      "allowed_decisions": ["allow", "deny"],
      "attestation_required": true,
      "accepted_attestation_formats": ["jws", "webauthn"]
    }
  } }
```

`attestation_required` is Gateway-synthesized from Core §10.4 rules (Prompt control + handler=Interactive/Coordinator). (UV-P-01)

`recent_decisions` enrichment for `ui.admin` draws from the Permission Audit Trail (Core §10.5); for `ui.command` it draws from the user's own prior decisions only. (UV-P-02)

### 11.2 Stub Prompt for `ui.read`

```json
{ "event": {
    "type": "StubPromptPlaceholder",
    "payload": {
      "source": "gateway",
      "prompt_id": "prm_...",
      "tool_name": "mcp__files__delete_file",
      "risk_class": "Destructive",
      "deadline": "2026-04-18T14:25:00Z",
      "assigned_to_user_sub_hmac": "hmac-sha256:...",
      "state": "awaiting" | "decided" | "expired" | "dismissed"
    }
  } }
```

No args, no reasoning, no history. (UV-P-03)

### 11.3 Redaction and Admin Reveal

UIs MUST display: tool name (never redacted), `risk_class` badge, `reasoning_summary`, `<redacted:*>` placeholders where present. (UV-P-04)

A "Reveal args" control is enabled only when (a) caller holds `ui.admin`, or (b) Gateway policy permits user-reveal of user's own data. Reveal emits `DecisionReveal` to the session's observer set and writes an audit entry. (UV-P-05)

### 11.4 Attestation

All `PromptDecision` commands MUST carry a **Prompt Decision Attestation** (PDA) in one of two formats:

The `canonical_decision` object MUST validate against the JSON Schema 2020-12 document below. `additionalProperties: false` forces all implementations to agree on the exact field set; unknown fields are rejected by conformant verifiers.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://soa-harness.org/schemas/ui/v1.0/canonical-decision.schema.json",
  "type": "object",
  "required": ["prompt_id","session_id","tool_name","args_digest","decision","scope","not_before","not_after","nonce","handler_kid"],
  "additionalProperties": false,
  "properties": {
    "prompt_id":   { "type": "string", "pattern": "^prm_[A-Za-z0-9]{8,}$" },
    "session_id":  { "type": "string", "pattern": "^ses_[A-Za-z0-9]{16,}$" },
    "tool_name":   { "type": "string", "minLength": 1, "maxLength": 256 },
    "args_digest": { "type": "string", "pattern": "^sha256:[A-Fa-f0-9]{64}$" },
    "decision":    { "type": "string", "enum": ["allow","deny"], "description": "Temporal breadth is carried in `scope`; `*_once` variants are retired to prevent contradictory combinations." },
    "scope":       { "type": "string", "enum": ["once","always-this-tool","always-this-session"] },
    "not_before":  { "type": "string", "format": "date-time" },
    "not_after":   { "type": "string", "format": "date-time" },
    "nonce":       { "type": "string", "pattern": "^[A-Za-z0-9_-]{16,}$" },
    "handler_kid": { "type": "string", "minLength": 1, "maxLength": 256 }
  }
}
```

UIs MUST produce one of:

**PDA-JWS** (RFC 7515 compact, used by native clients):
```
JWS = BASE64URL(header) . BASE64URL(canonical_decision) . BASE64URL(sig)
header = { "alg": "EdDSA"|"ES256"|"RS256", "kid": "<kid>", "typ": "soa-pda+jws" }
```

RSA keys MUST be ≥ 3072 bits (Core §10.6); Gateway rejects PDA-JWS with RSA modulus < 3072 as `ui.prompt-signature-invalid`.

**Signer-identity equality (normative).** Three `kid` values exist in the PDA flow: `canonical_decision.handler_kid` (inside the signed payload), the PDA-JWS `header.kid` (on the JWS), and the PDA-WebAuthn wrapper `handler_kid` (on the wrapper). Gateway MUST enforce:
- **PDA-JWS**: `canonical_decision.handler_kid === header.kid`.
- **PDA-WebAuthn**: `canonical_decision.handler_kid === wrapper.handler_kid === the kid bound to the verified credentialId in the enrolled-credential store`.
- **Audit authority**: `canonical_decision.handler_kid` is the single authoritative identifier for audit, revocation lookups, and downstream authorization.

Mismatch on any of these comparisons MUST be rejected with `ui.prompt-signature-invalid` (reason `signer-identity-mismatch`). Covered by `UV-CMD-06`.

**PDA-WebAuthn** (used by browsers):
```json
{
  "format": "webauthn",
  "handler_kid": "<kid enrolled under §7.3>",
  "canonical_decision": { ... as above ... },
  "authenticator_response": {
    "clientDataJSON": "<base64url>",
    "authenticatorData": "<base64url>",
    "signature": "<base64url>",
    "userHandle": "<base64url|null>"
  }
}
```

- `canonical_decision JSON bytes` MUST be produced by JSON Canonicalization Scheme (JCS) per RFC 8785. Implementations MUST use a conformant JCS serializer; re-serialization by the verifier MUST produce byte-identical output. Diverging serializations (differing key order, whitespace, Unicode normalization, numeric formatting) invalidate the signature.
- For PDA-WebAuthn, `clientDataJSON.challenge` MUST equal `SHA-256(canonical_decision JSON bytes)` base64url-encoded. This binds the WebAuthn assertion to the decision without a general-purpose JWS signer.
- Clock-skew tolerances per Core §1 apply: `not_before`/`not_after` are validated ±60 s against the verifier clock, and `not_after − not_before ≤ 15 minutes`. WebAuthn `clientDataJSON` freshness is additionally bounded by the prompt `deadline` field.
- Gateway verification for WebAuthn: re-hash `canonical_decision`, compare to `clientDataJSON.challenge`; verify `authenticatorData.rpIdHash` = SHA-256 of the Gateway's declared `webauthn_rp_id` (§7.1; the registrable-domain suffix shared by UI and Gateway origins — NOT an arbitrary origin string); verify `clientDataJSON.origin` appears in the Gateway's UI-origin allowlist for that RP ID; verify `userPresent` + (for high-risk) `userVerified`; verify signature against the enrolled COSE public key for `handler_kid` (credential store lookup, not trust-anchor lookup); verify `handler_kid` not listed on the issuing trust anchor's CRL. (UV-P-06)
- Gateway verification for JWS: decode header; look up `kid` in the **enrolled credential store** (populated via §7.3, indexed by `kid`); retrieve the enrolled public key; verify signature; verify `typ=soa-pda+jws`; verify the `kid` is not listed on the issuing trust anchor's CRL. Trust anchors are the roots that sign handler-key certificates, not the keys themselves; do not look up `kid` in `security.trustAnchors`. (UV-P-07)
- Gateway translates the PDA into a Core-compatible signed decision for the Runner's permission handler. (UV-P-08)

### 11.5 Decision Submission

```json
{ "op": "command",
  "command_id": "cmd_...",
  "session_id": "ses_...",
  "command": {
    "type": "PromptDecision",
    "payload": {
      "prompt_id": "prm_...",
      "decision": "allow",
      "scope": "once",
      "reason": "User approved",
      "attestation": { "format": "jws"|"webauthn", "...": "..." }
    }
  } }
```

- `scope = always-this-tool|always-this-session` REQUIRES `userVerification=required` (WebAuthn) OR HSM-backed key + fresh user auth (JWS). Non-compliance → `ui.prompt-scope-insufficient`. (UV-P-09)
- On Web: `always-*` MUST gate behind a WebAuthn UV (user-verifying) step. On Mobile: biometric gate required. On IDE: OS authentication dialog required. These are equivalent across profiles. (UV-P-10)

### 11.6 Multi-UI Assignment & Tie-Breaking

Assignment algorithm (deterministic):
1. UI with the most recent `UserInput` in this session owns the prompt.
2. Tie / no `UserInput` in last 5 minutes → UI with the earliest-established capability token of `ui.command` scope.
3. No such UI → prompt is pending; Gateway emits `PromptAssigned { state: "unassigned" }` and all `ui.admin` observers may decide.

Other UIs render read-only. `ui.admin` may override via `DismissPrompt`, which emits `PromptDismissed` to all observers. (UV-P-14)

### 11.7 Accessibility for Prompts

- Prompts MUST be announced via ARIA `aria-live="assertive"` (Web/IDE). (UV-X-01)
- Default keyboard: `Esc` = Deny. Allow MUST require an explicit confirm (button focus + `Enter`, or `Ctrl/Cmd+Enter`). Enter on focused input MUST NOT be the sole path to Allow. (UV-X-02)
- Color MUST NOT be the sole risk indicator; icon + text label are REQUIRED. (UV-X-03)

---

## 12. A2A Handoff UI Notifications

### 12.1 Extended Payload

`HandoffStart.payload` (Gateway-enriched):

```json
{ "handoff_id": "hof_...",
  "source_agent": { "name": "agent-a", "url": "https://a.example.com", "card_version": "1.0.0" },
  "destination_agent": { "name": "agent-b", "url": "https://b.example.com", "card_version": "2.1.3" },
  "direction": "outgoing" | "incoming",
  "task_id": "tsk_...",
  "transferred_state_scope": ["messages", "workflow", "billing_tag", "correlation_id"],
  "expected_duration_hint_ms": 120000 }
```

### 12.2 UI Behavior

- Persistent indicator naming destination agent between `HandoffStart` and `HandoffComplete`/`HandoffFailed`. (UV-H-01)
- `CancelTurn` during in-flight handoff → A2A `handoff.return` with cancellation; Gateway translates UI↔A2A error codes (§21). (UV-H-02)
- `HandoffFailed.payload.error_code` MUST be a Core §17.3 A2A error code (-32000..-32060) rendered via the locale map.

### 12.3 Trust Signalling

After handoff:
- Update agent identity indicator (name, avatar, URL).
- Mark subsequent `ContentBlockDelta` with `trust_class = "agent-peer"`. (UV-H-03)
- Gateway MUST re-fetch the destination agent's Agent Card and JWS; verification failure → Gateway emits `CardSignatureFailed` UI-derived event (§8.2) and UI MUST display a badge. (UV-H-04)

---

## 13. Cost & Observability Surface

### 13.1 Minimum Viable Surface

The critical UI surfaces are attestation and content safety; cost is operational telemetry.

### 13.2 `CostUpdate`

```json
{ "type": "CostUpdate",
  "payload": {
    "source": "gateway",
    "session_id": "ses_...",
    "turn_id": "trn_...",
    "tokens_used_in_turn": 3420,
    "tokens_used_in_session": 18210,
    "tokens_remaining": 181790,
    "billing_tag": "project-spreadsheet",
    "cache_input_tokens": 1200,
    "projected_next_turn": 4200,
    "currency_estimate": { "amount": "0.0142", "currency": "USD", "source": "advisory" }
  } }
```

- Emit at turn end and at most once per 5 s during a turn. (UV-C-01)
- `CostUpdate` is **not essential** (§8.2). Under backpressure, older `CostUpdate` events MAY be dropped in favor of the latest; a single `CostUpdate` at turn end is REQUIRED. (UV-C-02)
- `currency_estimate.source = "advisory"` is mandatory when the field is present. (UV-C-03)

### 13.3 Optional Admin Surfaces

Gateway MAY emit, only to `ui.admin`:
- `MemoryLoad` passthrough with `loaded_notes` (ids + titles; never bodies unless `ui.admin` policy allows). (UV-C-04)
- `ToolInputDelta` / `ToolResult` digests. (UV-C-05)
- `SpanSummary` UI-derived event (fields: `span_name, duration_ms, status, soa.session.id, soa.turn.id`). (UV-C-06)

### 13.4 System Log → UI Severity

| Core System Log category | UI Severity (RFC 5424) |
|---|---|
| `Error` | error |
| `MemoryDegraded` | warning |
| `Budget` | notice |
| `Permission` | notice |
| `Card` | warning |
| `SelfImprovement` | info |
| `Audit` | info |
| `Handoff` | info |
| `ContextLoad`, `MemoryLoad`, `Routing`, `Config` | info |

(UV-C-07)

---

## 14. Session and Artifact Read API

### 14.1 List Sessions

`GET /ui/v1/sessions?owner=me&status=Executing,Handoff&limit=50&cursor=<opaque>` → `{ sessions: [...], next_cursor: "<opaque|null>" }`. (UV-SESS-01)

### 14.2 Session Metadata

`GET /ui/v1/sessions/{session_id}` returns the session's `workflow` with `side_effects` filtered to phase ∈ {`committed`, `compensated`}. `pending`/`inflight` MUST NOT leak to any scope. (UV-SESS-02)

### 14.3 Artifact Access

- `GET /ui/v1/sessions/{session_id}/artifacts` → `[{ id, path, size, content_type, created_at, sha256, digest_verified }]`. (UV-SESS-03)
- `GET /ui/v1/sessions/{session_id}/artifacts/{id}` serves bytes with `Content-Type`, `Content-Length`, `ETag`, `Content-Disposition: attachment`. (UV-SESS-04)
- Artifacts > 16 MiB MUST support range requests (`Accept-Ranges: bytes`). Ranges do not participate in envelope framing. (UV-SESS-05)
- Artifact origin MUST:
  - Differ from UI origin (cookie-less, to prevent CSRF token leakage). (UV-SESS-06†)
  - Serve `X-Content-Type-Options: nosniff`. (UV-SESS-07)
  - Serve `Content-Security-Policy: default-src 'none'; sandbox;` on all responses. (UV-SESS-08)
- `sha256` on download MUST be verifiable by the client; mismatch → `ui.artifact-sha-mismatch`. (UV-SESS-09)

### 14.4 Search (Optional)

`GET /ui/v1/sessions/search?q=&since=<rfc3339>` — when implemented, MUST scope to the user's visible sessions and MUST exclude `pending`/`inflight` side effects. (UV-SESS-10)

---

## 15. Content Safety

### 15.1 Six Trust Classes (Unified Rendering Rules)

| trust_class | Rendering rule (Web/IDE/Mobile) |
|---|---|
| `system` | UI chrome; Markdown + rich UI permitted. **MUST NOT** be applied to any content produced by a tool, model, or peer agent. Gateway MUST reject outbound envelopes that label tool/model/peer content as `system`. (UV-SC-01) |
| `user` | User input echo; HTML-escaped |
| `model` | Markdown through SAFELIST sanitizer: allowed tags `p, ul, ol, li, code, pre, em, strong, a, blockquote, h1-h6, hr, table, thead, tbody, tr, th, td`. Links MUST have `rel="noopener noreferrer nofollow"`. No inline styles, no raw HTML, no `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, no `javascript:` / `vbscript:` / unvetted `data:` URIs. |
| `tool-output` | Same safelist as `model`, PLUS a visible "Tool Output" banner, PLUS `<details>` collapsed by default, PLUS `max-height` with scroll, PLUS "copy" affordance is explicit. |
| `untrusted` | Plain text only; all markup escaped; no link auto-detection. |
| `agent-peer` | `model` rules + "From Agent X" attribution line. |

(UV-SC-02..UV-SC-07)

### 15.2 Redactions Indicator

Envelope `redactions` field lists categories the Gateway redacted; UIs MUST show a visible indicator (icon + tooltip). (UV-SC-08)

### 15.3 Reference CSP (Web/IDE)

The **reference CSP** below uses `{{UI_ORIGIN}}`, `{{GATEWAY_ORIGIN}}`, `{{AUTH_ORIGIN}}`, and `{{ARTIFACTS_ORIGIN}}` as substitution placeholders. Deployments MUST substitute their own origins and MAY apply stricter directives. `{{UI_ORIGIN}}` appears only where `'self'` would not suffice for cross-origin references; `'self'` refers to the UI origin itself.

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' data: {{ARTIFACTS_ORIGIN}};
connect-src 'self' {{GATEWAY_ORIGIN}} {{GATEWAY_ORIGIN_WS}} {{AUTH_ORIGIN}};
object-src 'none';
frame-ancestors 'self';
base-uri 'self';
form-action 'self';
require-trusted-types-for 'script';
trusted-types soa-ui;
```

`{{GATEWAY_ORIGIN_WS}}` is the `wss://` form of the Gateway origin (e.g., the `ws_endpoint` origin from the discovery doc).

Inline styles MUST NOT use `'unsafe-inline'`. Implementations MAY enable inline styles via per-style `'sha256-<hash>'` directives or nonce-based allowlisting (`'nonce-<n>'`), but SHOULD prefer linked CSS files. Trusted Types (`require-trusted-types-for 'script'`, `trusted-types soa-ui`) governs script/URL/HTML sinks only; it does not authorize CSS inline styles. (UV-SC-09)

### 15.4 Tool-Output Injection Defense

- UIs MUST NOT re-submit tool output as user input unless the user takes an explicit action. (UV-SC-10)
- Markdown `<a href>` in `tool-output` class MUST NOT be auto-followed on hover, click-through, or preview. (UV-SC-11)
- "Run this code" affordances MUST be explicit human actions; no auto-execution. (UV-SC-12)

### 15.5 Clickjacking

Permission-prompt UI MUST NOT render in an iframe; CSP `frame-ancestors 'self'` enforces this (§6.5). (UV-SC-13)

### 15.6 Logging Privacy

- UIs MUST NOT log full tool args, model output, or user input to client-side analytics providers. (UV-SC-14)
- Error reports MUST redact per envelope `redactions`. For pre-envelope errors (auth, CSP, connect), UIs MUST apply a default redactor that drops tokens, paths, and user sub IDs before reporting. (UV-SC-15)

### 15.7 Uniform Biometric Step-Up for Always-\*

Cross-profile parity:
- Web: WebAuthn with `userVerification: "required"` for any `scope = always-*` decision. (UV-SC-16)
- Mobile: platform biometric (Face ID / Touch ID / fingerprint). (UV-SC-17)
- IDE: OS authentication dialog (Windows Hello / polkit / macOS auth). (UV-SC-18)
- CLI: out-of-band device flow (RFC 8628) to a device that can produce an attestation. (UV-SC-19)

### 15.8 Forbidden Content

UIs MUST NOT auto-execute code blocks, auto-open inline `data:` URIs, or auto-follow links from `model`/`tool-output`/`agent-peer`/`untrusted` classes. (UV-SC-20)

### 15.9 CLI Content-Safety Overlay

CLI profile content safety is normative and parallel to §15.1:

- Each event rendered with a one-line prefix: `[system]`, `[user]`, `[model]`, `[tool-output]`, `[untrusted]`, `[agent-peer]`. (UV-CLI-01)
- `tool-output` MUST be enclosed in a visually distinct block using Unicode box-drawing (`┌─ tool-output: <tool> ───── ┐ ... └───────────────┘`) and MUST be collapsed behind a pager by default. (UV-CLI-02)
- Control-character sanitization: ANSI escape sequences in `tool-output`, `model`, `agent-peer`, and `untrusted` MUST be stripped or displayed as their escaped form. (UV-CLI-03)
- No auto-linkification in any class; URLs rendered as plain text. (UV-CLI-04)
- For Destructive `PermissionPrompt`, the CLI MUST require typing a confirmation word (default `yes`) + Enter; no single-key allow. (UV-CLI-05)
- `NO_COLOR` env MUST be honored; fallback styling MUST still convey risk class via bracketed text markers (`[!! DESTRUCTIVE !!]`). (UV-CLI-06)

---

## 16. Accessibility & Internationalization

### 16.1 WCAG Conformance — Scoped Claim

Web and IDE profiles MUST:
- Pass the **Automated WCAG 2.1 AA subset** enumerated in Appendix B (approximately 35–40% of AA success criteria are reliably automatable). `ui-validate` asserts this subset via `UV-X-*` tests. (UV-X-04)
- Provide a completed **Manual Audit Addendum** (Appendix B template) signed by a named accessibility reviewer before a product claims WCAG 2.1 AA conformance. (UV-X-05†)

The profile MUST NOT advertise "WCAG 2.1 AA" unless the manual addendum is on file. A product passing only the automated subset MAY advertise "WCAG 2.1 AA — Automated Subset."

### 16.2 Streaming and Screen Readers

- Default announcement: `MessageEnd` / `ContentBlockEnd` boundaries only. (UV-X-06)
- Live per-delta announcement is a user-togglable preference, defaulted to off and forced off when `prefers-reduced-motion: reduce` is set. (UV-X-07)

### 16.3 Localization

- Locale negotiation via `Accept-Language` (BCP 47) or explicit user preference. (UV-I-01)
- Enum labels (`risk_class`, `StopReason`, A2A error codes, UI close codes) MUST resolve through a locale map. (UV-I-02)
- Gateway MAY publish a reference map at `/ui/v1/i18n/{locale}.json`.
- **Locale map schema**:

```json
{
  "$id": "https://soa-harness.org/schemas/ui/v1.0/locale-map.schema.json",
  "type": "object",
  "required": ["locale", "keys"],
  "additionalProperties": false,
  "properties": {
    "locale": { "type": "string", "pattern": "^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$" },
    "direction": { "type": "string", "enum": ["ltr","rtl"], "default": "ltr" },
    "keys": {
      "type": "object",
      "patternProperties": { "^[a-z][a-z0-9._-]*$": { "type": "string" } }
    }
  }
}
```

Required key namespaces: `risk_class.*`, `stop_reason.*`, `a2a_error.*`, `ui_error.*`, `prompt.button.*`, `handoff.*`. (UV-I-03)

- RTL languages MUST render with `dir="rtl"`; risk-badge placement follows RTL conventions. (UV-I-04)
- Dates, numbers, currency use locale formatters. (UV-I-05)

### 16.4 IME

Text input MUST NOT submit on `Enter` while an IME composition is active (`compositionend` + explicit send). (UV-I-06)

---

## 17. Performance & Backpressure

### 17.1 Rate Limits by Profile

| Metric | Web / IDE | Mobile | CLI |
|---|---|---|---|
| Events/sec/session | 200 | 50 | 100 |
| Bytes/sec/session | 1 MiB | 128 KiB | 512 KiB |
| Max event size | 64 KiB | 32 KiB | 64 KiB |

(UV-PERF-01)

### 17.2 Delta Coalescing

Gateway MAY coalesce adjacent `ContentBlockDelta` events; coalesced total ≤ `max_event_bytes`; `delivery.partial=true` until final delta of block. (UV-PERF-02)

### 17.3 Essential vs Non-Essential

Events with `delivery.essential = true` MUST NOT be dropped. The canonical binding is §8.2.2 (Core pass-through essentials) and §8.2 (UI-derived essentials); this paragraph summarizes: `PromptAssigned`, `PromptExpired`, `PromptDismissed`, `ConnectionResumed`, `ScopeChanged`, `CardSignatureFailed`, `StubPromptPlaceholder`, and all Core `PermissionPrompt`, `PermissionDecision`, `CrashEvent`, `HandoffStart/Complete/Failed`, `SessionStart`, `SessionEnd`, `SelfImprovementAccepted`, `SelfImprovementRejected`, `SelfImprovementOrphaned`. `ToolResult` is **NOT** essential (see §8.2.2 and §13.3) — Gateways MAY drop or redact it per policy.

Non-essential events MAY be coalesced or dropped under backpressure; Gateway emits `ObservabilityBackpressure` at most once per minute. (UV-PERF-03)

`CostUpdate` is non-essential EXCEPT for the single `CostUpdate` at turn end, which MUST be delivered. (UV-PERF-04)

### 17.4 Mobile

SHOULD use long-polling or push notifications when backgrounded; re-sync on foreground via `ConnectionResumed`; honor system data-saver. (UV-PERF-05)

### 17.5 Replay Buffer Semantics (Normative Edge Cases)

- **Buffer horizon**: ≥ 10,000 events OR ≥ 30 minutes, whichever is sooner. Events older than the horizon are evicted. (UV-PERF-06)
- **`max_backfill` ceiling**: 5,000 per `subscribe` call. Requests above the ceiling MUST be capped; excess emits `ConnectionResumed { partial: true, resume_from: <oldest_retained_sequence> }`. (UV-PERF-07)
- **Sequence gaps**: If retention has evicted events between the client's `last_ack_sequence` and the current window, Gateway MUST emit `ConnectionResumed { partial: true, resume_from }` where `resume_from = oldest_retained_sequence`. A client that requires exact-order delivery MUST then either start a fresh subscription (`from_sequence: 0`) or terminate the session. (UV-PERF-08)
- **Essential events under buffer pressure**: When the buffer fills, non-essential events are evicted first (oldest). Essential events (§17.3) MUST be retained until either delivered and acked, or the session terminates. If essential-event retention alone would exceed the buffer horizon, Gateway MUST close the connection with close code `4009` (essential-event retention exceeded). (UV-PERF-09)
- **Multiple observers**: Each attached UI has its own ack cursor. Retention is computed as follows: let `tail_sequence` = min(ack_sequence across all attached observers), let `head_sequence` = current sequence. The Gateway MUST retain events with `sequence >= max(tail_sequence, head_sequence − buffer_events)` AND whose timestamp is within `buffer_seconds`, whichever window is tighter. A single slow observer can extend retention up to `buffer_events`/`buffer_seconds` but no further. Beyond that, the slow observer is disconnected with close code `4010` (observer lag). (UV-PERF-10)
- **Reconnection semantics**: Reconnect within the 10-minute grace window (§9.3) with `last_ack_sequence` restores the session's ack cursor. Reconnect outside the grace window requires a fresh `subscribe`. Multiple reconnects by the same UI within the grace window MUST be idempotent; the Gateway MUST replace the prior attached transport.

---

## 18. Conformance Profiles

### 18.1 Profile Declaration

A UI MUST declare profile on connect:
- Web/Mobile: `soa_ui_profile` field in first `subscribe` op (§9.1).
- IDE/CLI: same, OR `X-Soa-Ui-Profile` header on WebSocket upgrade.

Declared profile fixes rate-limit tier and content-safety overlay. (UV-F-01, UV-F-02)

### 18.2 Web

- Transport: WebSocket primary; SSE fallback.
- Content safety: §15.1 + §15.3 CSP + Trusted Types.
- Attestation: PDA-WebAuthn; UV required for `always-*`.
- Accessibility: automated WCAG AA subset (§16.1) + manual addendum for claims.
- All envelope trust classes supported with full Markdown safelist.

### 18.3 IDE

- Transport: Local IPC (Unix socket / named pipe) OR WebSocket.
- Content safety: §15.1 within webview panels; CSP applies to webview HTML.
- Attestation: PDA-JWS via OS keystore (DPAPI / Keychain / kernel keyring) OR PDA-WebAuthn via embedded browser.
- PTY requirement: Gateway MUST set `event.payload.ui_hint = "requires-pty"` on `ToolInputStart` when a tool declares terminal-interactive in its Tool Registry metadata. IDE honors by allocating a PTY in a dedicated panel. (UV-F-03)
- Keyboard-first; every action reachable without mouse. (UV-X-08)

### 18.4 Mobile

- Transport: WebSocket OR long-polling.
- Push notification for in-flight `PermissionPrompt` when backgrounded. (UV-F-04)
- Content safety: §15.1 (Markdown MAY omit tables, rendered as plain text).
- Attestation: PDA-WebAuthn via platform authenticator; biometric for `always-*`.

### 18.5 CLI

- Transport: Long-polling or local IPC.
- Line-delimited envelopes on stdout (one JSON object per line when `--json` mode; structured TUI otherwise).
- Content safety: **§15.9 overlay is normative**.
- Attestation: PDA-JWS via OS keystore when available, OR device flow delegation (RFC 8628) for headless. (UV-F-05)
- `NO_COLOR`, `TERM=dumb` respected; ncurses-compatible where applicable.

---

## 19. UI Validation Suite (`ui-validate`)

### 19.1 Distribution

`ui-validate` v1.0.0, published at `https://soa-harness.org/ui-validate/v1.0.0/`. Pins to this profile revision; binary digest in release-tag manifest. (UV-GOV-01)

### 19.2 Test Categories

| Prefix | Purpose |
|---|---|
| `UV-T-*` | Transport: WebSocket/SSE/REST framing, reconnect, replay, close codes |
| `UV-E-*` | Envelope: encoding, sequence, trust_class, redactions, event catalog |
| `UV-A-*` | Auth: OAuth, token exchange, scope filtering, DPoP/mTLS |
| `UV-P-*` | Prompt: payload, stub, redaction reveal, attestation (JWS + WebAuthn), assignment |
| `UV-H-*` | Handoff |
| `UV-C-*` | Cost & observability |
| `UV-SESS-*` | Session / artifact read |
| `UV-SC-*` | Content safety (unified) |
| `UV-CLI-*` | CLI content-safety overlay |
| `UV-S-*` | Transport security headers |
| `UV-X-*` | Accessibility (automated subset; `†` = partially-automated requiring manual addendum) |
| `UV-I-*` | Internationalization |
| `UV-F-*` | Profile declaration + profile-specific features |
| `UV-CMD-*` | Client command RPC |
| `UV-PERF-*` | Performance & backpressure |
| `UV-GOV-*` | Governance + versioning |

### 19.3 Inline MUST-to-Test Mapping

Every MUST in this document is tagged inline with `(ui-validate: UV-XX-NN)`. Test markers with `†` denote partially-automated tests requiring manual-audit completion (see Appendix B).

### 19.4 Invocation

```
ui-validate --target-profile web|ide|mobile|cli \
            --ui-url https://ui.example.com \
            --gateway-url https://gateway.example.com \
            --manual-addendum appendix-b-audit.json \
            --report ui-report.json
```

Exit 0 = all automated tests pass AND (for `--profile web|ide`) a valid manual addendum is present. Non-zero enumerates failures. (UV-GOV-02)

---

## 20. Versioning & Governance

### 20.1 SemVer and Core Binding

Binds to SOA-Harness Core v1.0. "Compatible minor" follows Core §19.4: a Core version `1.C` is compatible with UI `1.B` iff `C - B ≤ 2` (two-minor window). If Core exceeds the window, the UI MUST declare non-compliance and advertise an upgrade. Core major bump triggers UI major bump. (UV-GOV-03)

### 20.2 Compatibility Policy (Symmetric)

- Gateway MUST accept UIs one minor version behind. (UV-GOV-04)
- UI MUST accept Gateways one minor version behind unless it depends on a MUST introduced in a later version. On refusal, UI MUST display an actionable upgrade message. (UV-GOV-05)

### 20.3 Governance

Shared with Core per SOA-CORE §19. UI Working Group (SOA-WG-UI) requires 2-of-3 maintainer approval for merges.

---

## 21. Error Taxonomy (with inline HTTP + WebSocket mapping)

All UI-surface errors use stable `ui.*` codes.

| Code | Category | HTTP status | WS close | Meaning |
|---|---|---|---|---|
| `ui.auth-required` | Auth | 401 | 4007 | No/expired access token |
| `ui.token-expired` | Auth | 401 | 4007 | Bearer expired |
| `ui.scope-insufficient` | Auth | 403 | 4001 | Missing scope |
| `ui.session-cap-expired` | Auth | 401 | 4007 | Capability token expired |
| `ui.idp-discovery-failed` | Auth | 502 | 4004 | Gateway cannot reach IdP |
| `ui.dpop-invalid` | Auth | 401 | 4007 | DPoP proof missing/invalid |
| `ui.transport-unsupported` | Transport | 400 | 4005 | Unsupported transport |
| `ui.frame-too-large` | Transport | 413 | 4005 | Exceeds `max_event_bytes` |
| `ui.rate-limited` | Transport | 429 | 4006 | Per-profile ceiling exceeded |
| `ui.unknown-session` | Sub | 404 | 4005 | Unknown session id |
| `ui.replay-gap` | Sub | 409 | 4002 | Requested sequence before retention |
| `ui.replay-exhausted` | Sub | 200 (partial) | 4002 | Backfill truncated |
| `ui.unknown-command` | Command | 400 | — | Unknown `command.type` |
| `ui.command-rejected` | Command | 422 | — | Runner rejected |
| `ui.duplicate-command` | Command | 200 (cached) | — | Same `command_id` within window |
| `ui.upload-sha-mismatch` | Command | 400 | — | Upload integrity |
| `ui.artifact-sha-mismatch` | Content | 502 | — | Download integrity |
| `ui.prompt-not-assigned` | Prompt | 403 | — | Read-only observer |
| `ui.prompt-expired` | Prompt | 410 | — | Deadline elapsed |
| `ui.prompt-signature-invalid` | Prompt | 401 | — | PDA verification failed |
| `ui.prompt-scope-insufficient` | Prompt | 401 | — | `always-*` without step-up |
| `ui.handoff-observe-only` | Handoff | 403 | — | Observer cannot cancel |
| `ui.gateway-unavailable` | Gateway | 503 | 4004 | Gateway down |
| `ui.gateway-config-invalid` | Gateway | 500 | 4004 | Discovery doc malformed |
| `ui.runner-mtls-failed` | Gateway | 502 | 4004 | Gateway↔Runner mTLS failure |
| `ui.artifact-not-found` | Content | 404 | — | — |
| `ui.artifact-too-large` | Content | 413 | — | Range requested exceeds policy |
| `ui.artifact-retention-expired` | Content | 410 | — | — |

(UV-ERR-01: observed error codes are a subset of this closed set)

### 21.1 Diagnostic Counters (Not Errors)

These identifiers appear in observability dashboards and OTel metrics but are NOT emitted as UI-surface error envelopes and are NOT part of the §21 closed set for `UV-ERR-01` compliance. They are documented here so that implementers share a vocabulary.

| Identifier | Surface | Meaning |
|---|---|---|
| `ui.backpressure` | Metric counter; OTel `soa_ui_backpressure_total` | Gateway is shedding non-essential events under load (§17.3). Emitted to the observability pipeline at most once per minute per session; never appears in a UI-visible error envelope. |

---

## 22. Appendix A — UI vs Gateway MUST Matrix

Rows are grouped by spec section; columns mark who owns the MUST.

| § | MUST summary | UI | GW |
|---|---|---|---|
| 1 | UTF-8 + RFC 3339 + ≤256-byte IDs | ✓ | ✓ |
| 6.1 | TLS 1.3+; no plain HTTP |  | ✓ |
| 6.3 | WebSocket: single-JSON-per-frame | ✓ | ✓ |
| 6.4 | Close codes from closed 4xxx set |  | ✓ |
| 6.5 | CSP L3, HSTS, frame-ancestors, memory-only tokens | ✓ | ✓ (headers) |
| 7.1 | Discovery doc published |  | ✓ |
| 7.2 | Access-token hygiene, refresh PKCE | ✓ |  |
| 7.3 | Enrollment flow (JWS or WebAuthn) accepted; `kid` assigned; handler-key revocation via the Core §10.6.1 trust-anchor CRL (Gateway caches per §7.3.1 — hourly refresh, fail-closed past `not_after` or after 2h unreachable; no separate UI CRL) | ✓ (produce) | ✓ (validate, store) |
| 7.4 | Token-exchange UI→Runner |  | ✓ |
| 7.5 | Scope filtering per session; stub-prompt for `ui.read` |  | ✓ |
| 7.6 | Capability token with mTLS or DPoP binding | ✓ (DPoP) | ✓ |
| 8.1 | Envelope schema validity | ✓ (accept) | ✓ (produce) |
| 8.2 | UI-derived event catalog (no types outside closed set) |  | ✓ |
| 8.3 | `ui_sequence` monotonic gap-free |  | ✓ |
| 9.1 | `soa_ui_profile` in first subscribe | ✓ |  |
| 9.2 | Ack within 30 s when required | ✓ |  |
| 9.3 | 10-min grace; backoff reconnect | ✓ (client) | ✓ (buffer) |
| 10.1 | Closed command set | ✓ (emit) | ✓ (reject unknowns) |
| 10.3 | `command_id` idempotency | ✓ (emit) | ✓ (dedupe) |
| 10.4 | Upload sha256 verification | ✓ | ✓ |
| 11.1 | `attestation_required` is Gateway-synth |  | ✓ |
| 11.2 | Stub prompt for `ui.read` |  | ✓ |
| 11.3 | Redaction placeholders; admin-reveal audit | ✓ (render) | ✓ (audit) |
| 11.4 | PDA-JWS OR PDA-WebAuthn supported | ✓ (produce) | ✓ (verify) |
| 11.5 | `always-*` step-up requirement | ✓ | ✓ (enforce) |
| 11.6 | Assignment + tie-break + dismissal |  | ✓ |
| 11.7 | ARIA + keyboard + no-color-only | ✓ |  |
| 12 | Handoff indicator + trust signaling | ✓ | ✓ |
| 13.2 | CostUpdate cadence + turn-end guarantee |  | ✓ |
| 13.4 | Severity map |  | ✓ |
| 14.3 | Artifact origin, CSP, sha256 | ✓ (verify) | ✓ (serve) |
| 15.1 | Six trust classes; `system` gating |  | ✓ (label) / ✓ (render) UI |
| 15.3 | Reference CSP served | ✓ (UI origin) | ✓ |
| 15.4 | No auto-exec, no auto-follow | ✓ |  |
| 15.6 | Logging-privacy redaction | ✓ |  |
| 15.7 | Biometric step-up parity | ✓ |  |
| 15.9 | CLI overlay | ✓ |  |
| 16 | WCAG subset + addendum; locale map; IME | ✓ | ✓ (map optional) |
| 17 | Rate limits, coalescing, essential gating |  | ✓ |
| 18 | Profile declaration + per-profile MUSTs | ✓ | ✓ (enforce) |
| 19 | MUSTs tagged to UV-* tests | — | — |
| 20 | SemVer compatibility symmetric | ✓ | ✓ |
| 21 | Error code emission from closed set | ✓ | ✓ |

---

## 23. Appendix B — WCAG 2.1 AA Manual Audit Addendum

### 23.1 Automated Subset (covered by `UV-X-*`)

`ui-validate` automates checks for (non-exhaustive; see `ui-validate-must-map.json`):
- 1.1.1 Non-text Content (alt attributes on images)
- 1.3.1 Info and Relationships (landmark regions, heading hierarchy)
- 1.4.3 Contrast (Minimum) — sampled
- 1.4.4 Resize Text — viewport scaling
- 2.1.1 Keyboard — tab traversal automated scan
- 2.4.3 Focus Order — programmatic ordering
- 2.4.4 Link Purpose — link text presence
- 2.4.7 Focus Visible
- 3.1.1 Language of Page — `lang` attribute
- 3.3.1 Error Identification
- 4.1.1 Parsing — HTML validity
- 4.1.2 Name, Role, Value — accessible name & role presence

Approximate coverage: 35–40% of WCAG 2.1 AA success criteria.

### 23.2 Manual Addendum (required for AA conformance claim)

Implementers claiming "WCAG 2.1 AA conformance" MUST submit a signed addendum (JSON) covering at minimum:
- 1.2.1–1.2.5 (Time-based media, if any)
- 1.3.2 Meaningful Sequence (screen-reader traversal)
- 1.3.3 Sensory Characteristics
- 1.4.1 Use of Color (manual review)
- 1.4.5 Images of Text
- 2.2.1 / 2.2.2 Timing and pause (reviewed in streaming context)
- 2.4.1 Bypass Blocks
- 2.4.5 Multiple Ways
- 2.4.6 Headings and Labels
- 3.1.2 Language of Parts
- 3.2.1 / 3.2.2 On Focus / On Input (no unexpected context change)
- 3.3.3 Error Suggestion / 3.3.4 Error Prevention (reviewing prompt UX)
- 4.1.3 Status Messages

### 23.3 Addendum Schema

```json
{
  "$id": "https://soa-harness.org/schemas/ui/v1.0/wcag-addendum.schema.json",
  "type": "object",
  "required": ["profile_version","reviewed_at","reviewer","ui_version","criteria"],
  "properties": {
    "profile_version": { "const": "1.0" },
    "reviewed_at": { "type": "string", "format": "date-time" },
    "reviewer": { "type": "object", "required":["name","credential"], "properties":{"name":{"type":"string"},"credential":{"type":"string"}} },
    "ui_version": { "type": "string" },
    "criteria": {
      "type": "object",
      "patternProperties": {
        "^[0-9]+\\.[0-9]+\\.[0-9]+$": {
          "type": "object",
          "required": ["status","evidence"],
          "properties": {
            "status": { "enum": ["pass","partial","fail","n/a"] },
            "evidence": { "type": "string" },
            "remediation_plan": { "type": "string" }
          }
        }
      }
    },
    "signature": { "type": "string", "description": "JWS over canonical addendum JSON by reviewer key" }
  }
}
```

A product that cannot produce a pass-signed addendum MUST NOT advertise WCAG 2.1 AA conformance; it MAY advertise "WCAG 2.1 AA — Automated Subset."

---

## 24. Glossary

- **UI Gateway** → §5
- **UI Envelope** → §8
- **UI-derived event** → §8.2
- **Per-session capability token** → §7.6
- **Trust class** → §15.1
- **PDA (Prompt Decision Attestation)** → §11.4
- **Stub prompt** → §11.2
- **Profile** → §18
- **Advisory currency estimate** → §13.2
- **Reference CSP** → §15.3

---

**Conformance**
A UI implementation is SOA-Harness UI Integration Profile v1.0 compliant at a chosen profile (Web, IDE, Mobile, CLI) if and only if it satisfies every MUST in the sections that profile covers, `ui-validate --target-profile=<p>` exits 0 against it (which, for Web/IDE, REQUIRES a valid Appendix B manual addendum), and the Gateway it operates with satisfies every Gateway-side MUST in Appendix A.
