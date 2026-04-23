# SOA-Harness Core Specification
**Secure Operating Agents Harness — Production Standard**
**Version:** 1.0
**Status:** Production Standard — Conformance-Grade
**Date:** 2026-04-18

---

## 0. Table of Contents

1. Conventions
2. Normative References
3. Abstract and Scope
4. Core Principles
5. Required Stack and Primitives
   - 5.1 Stack Table
   - 5.2 Primitives Enumerated
   - 5.3 External Bootstrap Root (Normative)
     - 5.3.1 Bootstrap-Key Rotation and Compromise
     - 5.3.2 Anchor Disagreement and Split-Brain
   - 5.4 Operational Probes (Normative)
6. Agent Card
7. AGENTS.md
8. Memory Layer
9. Self-Improvement Layer
10. Permission System
11. Tool Registry & Pool Assembly
12. Session Persistence & Workflow State
13. Token Budget & Cost Controls
14. Structured Streaming, System Event Log, and OpenTelemetry Mapping
15. Verification & Hooks
16. Runtime Execution Model and Cross-Interaction Matrix
17. Agent2Agent (A2A) Wire Protocol
18. Compliance Validation Suite (`soa-validate`)
19. Governance & Spec Evolution
20. Adoption Checklist
21. Glossary
22. Non-Goals
23. Safety Constraints on Self-Improvement
24. Error Code Taxonomy
25. Threat Model (Informative)

---

## 1. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in BCP 14 (RFC 2119 + RFC 8174) when, and only when, they appear in all capitals.

- All text files defined by this specification MUST be UTF-8 encoded without BOM.
- All timestamps MUST be RFC 3339 strings with an explicit timezone offset (UTC is RECOMMENDED) and at least millisecond precision.
- All JSON MUST conform to RFC 8259 and MUST use LF (`\n`) as the line separator in persisted forms.
- Durations in configuration fields MUST be ISO-8601 durations (e.g., `P30D`, `PT5M`).
- **JSON signing inputs** (Agent Card JWS, MANIFEST JWS, `canonical_decision` PDA, audit-record canonical hash) MUST be canonicalized per RFC 8785 (JCS) before hashing or signing. Verifiers MUST re-canonicalize the received object and compare against the provided digest or signature. Full RFC 8785 conformance, including the number-serialization rules (ECMAScript `Number.prototype.toString` for all numeric values — which serializes `-0` as the string `"0"` per ES Abstract Operation `Number::toString`, and applies the exponent/precision thresholds of §7.1.17), is REQUIRED for production signing paths. Implementations MUST NOT attempt to preserve `-0` as a distinct canonical output; doing so produces signatures incompatible with other conformant verifiers. Subsets that handle only integers and strings are acceptable in build tooling that never encounters floats, but any signed or digest-pinned artifact that may contain a non-integer number MUST use a library-grade RFC 8785 implementation (reference implementations: `canonicalize` by Samuel Erdtman for JavaScript (npm package `canonicalize` — Erdtman is an RFC 8785 co-author), `github.com/gowebpki/jcs` for Go, `rfc8785` for Python).
- **Non-JSON signing inputs** (`program.md` Markdown bytes, seccomp profile raw companion bytes, and any future text-format artifact) MUST be signed over the raw UTF-8 / raw byte content. JCS does NOT apply. Verifiers MUST compare byte-for-byte against the signed content.
- Per-artifact JWS serialization, allowed algorithms, and required header fields are normatively specified in §6.1.1.
- **Clock-skew tolerances (normative):**
  - JWT / A2A token validation: ±30 seconds between `iat`/`exp` and verifier clock.
  - PDA `not_before` / `not_after` windows: ±60 seconds between the verifier clock and the declared window edges; `not_after - not_before` MUST be ≤ 15 minutes.
  - CRL freshness: composition per §10.6 — issuer SHOULD revoke within 60 minutes of compromise notification; Runners MUST refresh CRLs at least hourly. End-to-end effective revocation SLA is therefore ≤ 120 minutes in the worst case. SV-PERM-14 verifies the Runner-side 60-minute refresh obligation only; the issuer-side obligation is operational, not validator-testable.
  - External WORM sink timestamp: within ±1 second of UTC (§10.5).
  - Session resume: the session file's recorded timestamps MUST be interpretable without local clock adjustment; no skew tolerance applies on disk.
  All verifiers MUST reject material outside the declared windows with a category-appropriate error (`AuthFailed`, `HandlerKeyRevoked`, etc.).
- Every MUST in this document has at least one corresponding test ID in §18 `soa-validate`.

---

## 2. Normative References

Each reference is pinned to a specific, immutable artifact.

- **[MCP-2026-04]** Model Context Protocol, specification revision **2026-04-03**. Normative content is identified by the SHA-256 digest recorded in `soa-validate` manifest entry `mcp-spec-2026-04-03`. The canonical URL `https://modelcontextprotocol.io/specification/2026-04-03` is **informative only**; per §19.4.3 upstream-drift policy, if the URL is unreachable or its content's digest no longer matches the manifest entry, implementations MUST obtain the normative revision from the release-bundle mirror at `artifacts/external/mcp-spec-2026-04-03.md`. Digest mismatch between the upstream URL and the manifest entry MUST be reported by `soa-validate` with warning `UpstreamDriftObserved` but does not fail conformance so long as the mirror is consumable.
- **[A2A-0.3]** Agent2Agent Protocol, version **0.3.1** (tag `v0.3.1` in the upstream repository); Agent Card section as of 2026-04-03. SOA §17 takes the 0.3.1 message schema as its wire-level baseline. Runtime compatibility with newer upstream A2A versions is governed by §19.4.3 — an implementation declaring a newer `protocolVersion` is conformant when the §17 wire properties hold regardless of upstream version.
- **[HARBOR-1.0]** Harbor Benchmark Format v1.0. The full format is inlined in §9.6.
- **[BCP-14]** IETF BCP 14 (RFC 2119 + RFC 8174).
- **[RFC-3339]** Date and Time on the Internet: Timestamps.
- **[RFC-8259]** The JavaScript Object Notation (JSON) Data Interchange Format.
- **[RFC-7519]** JSON Web Token (JWT).
- **[RFC-7515]** JSON Web Signature (JWS).
- **[RFC-8446]** TLS 1.3 (mandatory minimum).
- **[JSON-SCHEMA-2020-12]** JSON Schema 2020-12.
- **[RFC-8785]** JSON Canonicalization Scheme (JCS). Required for any signed JSON where cross-implementation signature verification is mandated (Agent Card JWS, MANIFEST JWS, Permission Decision Attestation, audit-record canonical hash). `program.md` JWS is a non-JSON artifact (Markdown) and is signed over raw UTF-8 bytes — see Core §1 signing-input rules and §6.1.1 per-artifact profile.

---

## 3. Abstract and Scope

This specification defines a conformance-grade architecture for a production agent harness: a system that (a) runs one primary agent loop, (b) integrates tools and memory via MCP, (c) optionally participates in cross-provider handoff via A2A, and (d) optionally self-optimizes against Harbor benchmarks.

An engineer implementing every MUST against the pinned normative references produces a system interoperable with any other such implementation, provably so via §18 `soa-validate`.

**In scope:** Agent Card schema and discovery; memory layer contract and aging; self-improvement loop with stage-activate atomicity and Goodhart mitigations; permission model (levels × controls × decisions) and audit trail; session persistence with explicit at-least-once tool semantics; streaming/event envelope and OpenTelemetry mapping; verification hooks and regression suite; A2A handoff wire protocol.

**Out of scope (see §22):** multi-agent orchestration beyond A2A handoff; model-provider tuning; UI/front-end concerns.

---

## 4. Core Principles

**Problem solved:** Agentic systems fail when plumbing is treated as secondary.

**Universal pattern:** The model API call is the smallest component. Persistence, permissions, failure paths, and observability are the system.

**Requirements (MUST):**
- Bias toward lean, single-agent design. Multi-agent MUST be justified by a concrete requirement and an explicit §22 Non-Goals waiver.
- Every failure path (crashes, token exhaustion, permission denials, stream interruptions, upstream unavailability, rollback failures) MUST be specified as a normal operating condition with a defined outcome.
- Every primitive MUST be unit-testable in isolation.
- All state and rules MUST be file-system grounded. Databases MAY be used as secondary stores but MUST NOT hold the primary source of truth.
- For any requirement that can compose with another (e.g., self-improvement + handoff), §16 MUST define the composition.

---

## 5. Required Stack and Primitives

### 5.1 Stack Table

| Layer | Component | Primitives | File / Endpoint | Purpose |
|-------|-----------|-----------|-----------------|---------|
| Tooling & Data | MCP Servers | P1, P9 | MCP endpoints | Tools, files, DBs, APIs, benchmarks |
| Identity & Discovery | A2A + Agent Card | P12 | `https://<origin>/.well-known/agent-card.json` and `https://<origin>/.well-known/agent-card.jws` (two separate artifacts; see §6.1) | Persona, types, permissions |
| Coordination | A2A JSON-RPC 2.0 | P11 | A2A endpoint (§17) | Cross-provider handoff |
| Rules & Long-term Memory | AGENTS.md + Memory MCP | P10, P4 | Project root + Memory MCP | Rules, evolving/shareable memory |
| State & Resumability | Session Persistence + Artifacts | P3, P4 | `/artifacts/` + `/sessions/` | Crash recovery, side-effect tracking |
| Execution | Runner + Hook Pipeline | P5, P6, P7, P8, P13 | SDK Runner | Sandboxed loop, streaming, verification |
| Security & Governance | Permission System + Audit Trail | P2, P11 | Agent Card + MCP policy + `/audit/` | Risk classification, approval, audit |
| Observability | OTel + StreamEvent + System Event Log | P14 | Runner config | Traces, logs, metrics, cost |

### 5.2 Primitives Enumerated

Each primitive carries a mandatory `soa-validate` test ID (§18).

| ID | Name | Summary | Normative Section |
|----|------|---------|-------------------|
| P1 | Tool Registry | Pre-classified global tool metadata (name, schema, required_permission) | §11 |
| P2 | Permission System | Levels × controls × decisions × handlers + resolution algorithm | §10 |
| P3 | Session Persistence | Atomic-per-event persistence with at-least-once semantics | §12 |
| P4 | Workflow State | Structured side-effect tracking, separate from conversation | §12 |
| P5 | Runner State Machine | 6-state loop with typed termination | §16 |
| P6 | Stream Envelope | Typed `StreamEvent` with closed `type` enum | §14 |
| P7 | PreToolUse/PostToolUse Hooks | Stdin/stdout JSON contract with enumerated exit codes and timeouts | §15 |
| P8 | Harness Regression | 18 enumerated tests with test IDs `HR-01`…`HR-18` | §15, §18 |
| P9 | MCP Client | Discovery, auth, transport, error taxonomy | §5, §24 |
| P10 | AGENTS.md Rules | Parsed, ordered, validated project rules with bounded `@import` | §7 |
| P11 | A2A Handoff | Enumerated JSON-RPC methods, params, errors, state-transfer scope | §17 |
| P12 | Agent Card | Signed, TLS-served JSON with JSON Schema 2020-12 validation | §6 |
| P13 | Token Budget & Compaction | Projection, cache accounting, compaction algorithm | §13 |
| P14 | Observability Mapping | OTel span ↔ StreamEvent ↔ System Event Log correlation | §14 |

Primitives P1–P10 and P12–P14 are REQUIRED for every `core`-profile Runner. P11 (A2A Handoff) is REQUIRED only for Runners claiming the `core+handoff` profile (§18.3). A Core-only Runner without A2A MAY omit §17 entirely without violating this primitive set.

### 5.3 External Bootstrap Root (Normative)

**Rationale.** Every subsequent signature check in the spec (Agent Card, MANIFEST, program.md, PDA) eventually chains to the trust anchor configured here. If the anchor itself could be discovered from an artifact in the bundle, an attacker who swaps both the artifact and its "pointer to trust" could produce a self-consistent but fraudulent chain — the anchor MUST therefore arrive through a channel the attacker cannot simultaneously forge. Out-of-band delivery (SDK pin, operator-bundled file, DNSSEC) moves the trust decision outside the artifact flow and into a channel with independent integrity guarantees. The three options trade off deployment convenience vs. update agility: SDK pin is strongest but requires a client update to rotate; DNSSEC is most agile but depends on DNSSEC being deployed end-to-end; operator-bundled is the pragmatic middle ground for enterprise deployments. A deployment that picks NONE of the three has no non-circular trust root and MUST fail closed.

The Agent Card signature chain terminates at a trust anchor published under `security.trustAnchors`. The trust anchor itself is not discoverable from any artifact in this bundle — doing so would be circular. v1.0 therefore REQUIRES that the initial trust root be delivered *out of band* via exactly ONE of the following channels per deployment:

- **SDK-pinned.** The operator's SOA client SDK ships with a hard-coded `{publisher_kid, spki_sha256, issuer}` triple identifying the SOA-WG release-signing key. Runners loading an Agent Card whose `security.trustAnchors[].publisher_kid` does not match the SDK-pinned value MUST emit `HostHardeningInsufficient` (reason `bootstrap-missing`) and refuse to load the Card.
- **Operator-bundled.** The operator distributes `initial-trust.json` via a trusted deployment channel (configuration management, signed-container base image, etc.). The file MUST validate against the normative schema at `schemas/initial-trust.schema.json` (required fields: `soaHarnessVersion`, `publisher_kid`, `spki_sha256`, `issuer`; see schema for optional rotation fields). The Runner loads and schema-validates this file at startup before any Agent Card; absence OR schema-validation failure fails startup with `HostHardeningInsufficient` (reason `bootstrap-missing`).
- **DNSSEC-protected TXT record (production).** At `_soa-trust.<deployment-domain>`, a DNSSEC-validated TXT record publishes `publisher_kid=<id>; spki_sha256=<64-hex>; issuer="CN=..."`. The Runner resolves and DNSSEC-validates the record at startup; lookup failure, missing AD bit, or empty result fails startup with `HostHardeningInsufficient` (reason `bootstrap-missing`).

#### 5.3.1 Bootstrap-Key Rotation and Compromise (Normative)

The bootstrap-supplied key (the `publisher_kid` + SPKI hash delivered via SDK-pin, operator-bundled `initial-trust.json`, or DNSSEC TXT) is subject to the same lifecycle discipline as handler keys (§10.6), tightened for its bootstrap role:

- **Scheduled rotation.** The release-signing key MUST rotate at least every **365 days**. Rotation overlap MUST be at least **30 days** — both the outgoing and incoming keys MUST be accepted simultaneously during this window so that in-flight deployments do not fail verification. The incoming key's `publisher_kid` + SPKI hash MUST be published through the SAME bootstrap channel used by the deployment (SDK update, operator-bundled file update, or new DNSSEC TXT entry) at least 30 days before the outgoing key is retired.
- **Emergency compromise response.** On suspected compromise of the release-signing key:
  1. The SOA-WG (or equivalent operator authority) MUST publish an emergency bootstrap update within **4 hours** of confirmed compromise. The update revokes the compromised `publisher_kid` and publishes a successor.
  2. Runners MUST poll their bootstrap channel at a maximum interval of **24 hours** (SHOULD be 1 hour for DNSSEC TXT). On observing a revoked `publisher_kid`, the Runner MUST reject any Agent Card whose `security.trustAnchors[].publisher_kid` still references the revoked value, emit `HostHardeningInsufficient` (reason `bootstrap-revoked`), and halt self-improvement iterations until a successor anchor is observed.
  3. Every `MANIFEST.json.jws` signed by the compromised `publisher_kid` and accepted within the 24 hours preceding revocation MUST be flagged `SuspectDecision` in the audit trail, parallel to the handler-key compromise rule in §10.6.
- **Multi-party control (RECOMMENDED).** Production release-signing keys SHOULD be held under an M-of-N signing scheme (e.g., 2-of-3 HSM quorum, FROST/MuSig threshold signatures). v1.0 does not mandate a specific scheme; operators claiming `core+si` for high-value deployments SHOULD document their scheme in the operator manual referenced below.
- **Storage.** Release-signing private keys MUST be held in an HSM or hardware-backed keystore. Plaintext on disk is forbidden, matching the handler-key rule in §10.6.

Covered by `SV-BOOT-04`.

#### 5.3.2 Anchor Disagreement and Split-Brain (Normative)

A deployment MUST select exactly ONE bootstrap channel per §5.3. When a Runner nevertheless observes two or more channels (e.g., an SDK-pinned value in-process AND a visible DNSSEC TXT record at `_soa-trust.<deployment-domain>`, or an operator-bundled `initial-trust.json` AND an SDK pin), the Runner MUST resolve the disagreement using the following deterministic, fail-closed rules:

1. **Authoritative channel.** The deployment's authoritative channel is the one named in `SOA_BOOTSTRAP_CHANNEL` (environment variable, one of `sdk-pinned` | `operator-bundled` | `dnssec-txt`). If the variable is absent, the Runner MUST fail startup with `HostHardeningInsufficient` (reason `bootstrap-channel-undeclared`). The variable's value is the ONLY authoritative source of `publisher_kid` + `spki_sha256` for verification.
2. **Secondary-channel handling.** A `publisher_kid`/`spki_sha256` observed on any non-authoritative channel MUST NOT be used for verification. If such a value is observed AND disagrees with the authoritative channel's value, the Runner MUST:
   - Emit `HostHardeningInsufficient` (reason `bootstrap-split-brain`) to the audit sink with both observed values, the authoritative channel name, and the dissenting channel name.
   - Halt self-improvement iterations (same stop semantics as §5.3.1 emergency revocation).
   - Continue accepting Agent Cards whose `security.trustAnchors[].publisher_kid` matches the authoritative value; reject all others with `HostHardeningInsufficient` (reason `bootstrap-missing`).
3. **Agreement across channels.** Multiple channels carrying the SAME `publisher_kid` + `spki_sha256` is NOT a split-brain condition and MUST NOT trigger rejection; the authoritative channel is still used exclusively for verification, but no alert is emitted.
4. **Tie-breaking during rotation overlap.** If the authoritative channel carries BOTH the current and `successor_publisher_kid` (§5.3.1 30-day overlap), and a secondary channel carries only one of the two values, no split-brain is triggered — the secondary is considered a lagging observation. If the secondary carries a THIRD value (not current, not successor), rule 2 applies.
5. **Operator recovery.** Recovery from `bootstrap-split-brain` requires either (a) removing the dissenting secondary-channel artifact (e.g., retracting a stale DNSSEC TXT entry) OR (b) rotating the authoritative channel to match per §5.3.1. Manual override of the fail-closed state is NOT permitted in v1.0.

Covered by `SV-BOOT-05`.

#### 5.3.3 Bootstrap Testability Env Hooks (Normative — L-43)

**Rationale.** `SV-BOOT-03`, `SV-BOOT-04`, `SV-BOOT-05` exercise the DNSSEC-TXT channel, the 24h revocation-poll cadence, and multi-channel split-brain detection respectively. Real DNSSEC resolvers, real 24-hour polling intervals, and real multi-channel coordination are infeasible in conformance test runs. Three env hooks enable deterministic injection.

**Env vars (all three follow the same production-guard pattern as §8.4.1 / §11.3.1 — MUST refuse startup with any set on a non-loopback interface):**

- `SOA_BOOTSTRAP_DNSSEC_TXT=<file-path>` — when set, the Runner reads the pinned file at the given path instead of issuing a real DNSSEC resolver query for `_soa-trust.<deployment-domain>`. The file's contents MUST be a JSON object of shape `{ "txt_record": "<string>", "ad_bit": true|false, "empty": true|false }` — matching the three scenarios `SV-BOOT-03` asserts (valid AD-validated record, missing AD bit, empty response). Fixture set lives at `test-vectors/dnssec-bootstrap/`.
- `RUNNER_BOOTSTRAP_POLL_TICK_MS=<milliseconds>` — poll interval for the §5.3.1 revocation-check loop. Default 3600000 (1 hour) when unset. Validators set to a small value (e.g., 100) so `SV-BOOT-04` observes the poll firing within a test window. Complementary env `SOA_BOOTSTRAP_REVOCATION_FILE=<file-path>` — when set, the Runner watches that file path on each poll tick; presence of the file with a matching `publisher_kid` triggers the §5.3.1 revocation refusal path immediately.
- `SOA_BOOTSTRAP_SECONDARY_CHANNEL=<file-path>` — when set, the Runner treats the pinned file as if it were a second observable bootstrap channel (e.g., a dissenting DNSSEC TXT when the authoritative channel is `operator-bundled`). File shape matches `initial-trust.json`. `SV-BOOT-05` uses `test-vectors/bootstrap-secondary-channel/initial-trust.json` as the dissenting fixture and asserts `HostHardeningInsufficient(reason=bootstrap-split-brain)` emission per §5.3.2 rule 2.

**Production guard:** all three env vars MUST NOT be reachable by untrusted principals. Runner MUST refuse startup when any of them is set AND the Runner's listener binds to a non-loopback interface. Same enforcement mechanism as `SOA_MEMORY_MCP_MOCK_TIMEOUT_AFTER_N_CALLS`, `SOA_RUNNER_DYNAMIC_TOOL_REGISTRATION`, `SOA_RUNNER_AGENTS_MD_PATH`.

**Conformance linkage.**
- `SV-BOOT-03` uses `SOA_BOOTSTRAP_DNSSEC_TXT` pointing at each of `test-vectors/dnssec-bootstrap/{valid,empty,missing-ad-bit}.json`.
- `SV-BOOT-04` uses `RUNNER_BOOTSTRAP_POLL_TICK_MS=100` + `SOA_BOOTSTRAP_REVOCATION_FILE=<injection-path>`; writes the injection file after ≥1 tick, asserts `HostHardeningInsufficient(bootstrap-revoked)` emission within 200ms.
- `SV-BOOT-05` uses `SOA_BOOTSTRAP_SECONDARY_CHANNEL=test-vectors/bootstrap-secondary-channel/initial-trust.json` combined with an SDK-pinned authoritative channel carrying a different `publisher_kid`.

Implementations MUST select exactly one bootstrap channel per deployment and document the choice in their operator manual. The bootstrap-supplied trust anchor serves two distinct verification paths, each with its own verification object:

1. **Release bundle integrity.** The anchor verifies `MANIFEST.json.jws`, which in turn pins the SHA-256 digests of the shipped release artifacts (specs, schemas, test vectors, seccomp profile). This path establishes "did this bundle come from the SOA-WG and has it been tampered with in transit?"
2. **Live Agent Card authenticity.** A Runner fetching `https://<agent-origin>/.well-known/agent-card.{json,jws}` verifies the card's detached JWS against `security.trustAnchors[].spki_sha256` — per §6.1 and §6.1.1, not via a manifest-pinned digest. (The Agent Card describes a *live* agent served from an arbitrary operator origin; the MANIFEST has no way to enumerate those cards in advance.) The anchor bootstrapped from §5.3 MAY be the same key that signs `security.trustAnchors[].publisher_kid`, or a separate operator-issued anchor — the two roles (release-signing vs. agent-card issuing) are orthogonal.

Covered by `SV-BOOT-01..03`.

### 5.4 Operational Probes (Normative)

Every SOA-Harness Runner and every UI Gateway MUST expose two HTTP endpoints for lifecycle orchestration. These endpoints are independent of the signed-artifact integrity chain (they carry no policy-bearing data and MUST NOT be used to infer trust decisions).

1. **`GET /health` (liveness).** Returns `200 OK` with body `{"status":"alive","soaHarnessVersion":"1.0"}` whenever the process is responding and its event loop is not deadlocked. A process that cannot answer this endpoint within 5 s MUST be considered dead by an orchestrator. Authentication is NOT required; the endpoint MUST NOT expose session or audit data. `/health` MUST remain reachable even under full rate-limit saturation (§13). (`SV-OPS-01`)
2. **`GET /ready` (readiness).** Returns `200 OK` with body `{"status":"ready"}` only when ALL of the following hold:
   - The bootstrap channel (§5.3) has resolved and the Agent Card / MANIFEST JWS verifications have succeeded at least once since startup.
   - The MCP tool pool (P1, P2, P6) has produced a consistent registry state.
   - The session persistence directory (P3) is writable (write-and-unlink probe within 100 ms).
   - The audit sink (§10.5) is reachable (connect within 1 s).
   - The CRL (§10.6.1) is fresh (within `not_after`).
   When any of the above fails, `/ready` MUST return `503 Service Unavailable` with body `{"status":"not-ready","reason":"<enum>"}` where reason is one of `bootstrap-pending | tool-pool-initializing | persistence-unwritable | audit-sink-unreachable | crl-stale`. Orchestrators MUST NOT route traffic to a Runner that returns 503 on `/ready`. Authentication is NOT required. (`SV-OPS-02`)

Gateways expose the same two endpoints with Gateway-appropriate readiness checks (upstream Runner reachable; IdP discovery successful; enrollment store reachable). Probe endpoints MUST use TLS 1.3+ on public listeners; MAY be plain HTTP when bound to loopback / named pipe / Unix socket only.

---

## 6. Agent Card

### 6.1 Discovery and Transport

- The Agent Card MUST be served at `https://<origin>/.well-known/agent-card.json`.
- TLS 1.3 or higher is REQUIRED. Plain `http` is NOT permitted.
- Response `Content-Type` MUST be `application/json; charset=utf-8`.
- Response MUST include an `ETag` header and respect `If-None-Match`.
- A detached JWS signature (RFC 7515) of the Agent Card JSON MUST be served at `https://<origin>/.well-known/agent-card.jws`. The signing input is the **JCS-canonicalized bytes** of `agent-card.json` per §1 and the per-artifact signing profile in §6.1.1 — verifiers MUST re-canonicalize the received object with RFC 8785 JCS before computing the digest; they MUST NOT sign or verify the raw fetched bytes directly (HTTP transport may introduce whitespace or key-order drift). The signing key's `x5c` certificate chain MUST chain to an issuer advertised in `security.trustAnchors`.
- Clients MUST verify the signature before trusting any policy-bearing field (`permissions.*`, `self_improvement.*`, `security.*`). On verification failure the client MUST fail closed (treat Agent as unreachable) and emit `CardSignatureFailed` (§24).
- `Cache-Control: max-age` MUST NOT exceed 300 seconds. v1.0 does not define a signed TTL extension; any longer cache lifetime observed on the wire is presumed to originate from an unsigned intermediary (proxy, CDN) and MUST be ignored by the client (client MUST refresh no later than 300 s).

### 6.1.1 Artifact Signing Profile (Normative)

**Rationale.** Every signed artifact in the bundle shares the same small set of cryptographic choices so implementations and verifiers converge on one interoperable profile rather than diverging per artifact class. EdDSA (Ed25519) is the preferred baseline for new deployments (no curve-parameter footguns, deterministic signatures, fast verification); ES256 is included for hardware-attestation paths that commonly ship P-256 keys (WebAuthn, YubiKey PIV); RS256 is included only where legacy PKI already issues RSA certificates at ≥3072 bits. MANIFEST specifically forbids RS256 because the release-signing path is bootstrap-critical and RSA adds no security over Ed25519 while increasing verification time and signature size. `typ` is required on every JWS so a verifier cannot be tricked into accepting a signed agent-card bound to the wrong role (e.g., a leaked program.md signature used to attest a decision). The allowlist is intentionally short: extending it requires a spec-level change (§19.4), not a per-deployment policy decision, because a single deployment accepting a weak algorithm undermines every peer it interoperates with.

All signed artifacts in the SOA-Harness v1.0 bundle MUST conform to the following per-artifact profile. Verifiers MUST reject any JWS whose `alg` is not in the allowlist, whose `typ` does not match the artifact class, or whose required header fields are absent.

| Artifact | Serialization | Signing input | Allowed `alg` | Required `typ` | Required header fields |
|---|---|---|---|---|---|
| Agent Card JWS (`.well-known/agent-card.jws`) | detached JWS (RFC 7515) | JCS(agent-card.json) bytes | EdDSA, ES256, RS256 (≥ 3072) | `soa-agent-card+jws` | `alg`, `kid`, `x5c` |
| `program.md` JWS (`program.md.jws`) | detached JWS | raw UTF-8 bytes of `program.md` | EdDSA, ES256 | `soa-program+jws` | `alg`, `kid`, `x5c`, `x5t#S256` |
| MANIFEST JWS (`MANIFEST.json.jws`) | detached JWS | JCS(MANIFEST.json) bytes | EdDSA, ES256 | `soa-manifest+jws` | `alg`, `kid` (MUST equal the configured `publisher_kid`) |
| PDA-JWS (UI §11.4) | compact JWS | BASE64URL(JCS(canonical_decision)) | EdDSA, ES256, RS256 (≥ 3072) | `soa-pda+jws` | `alg`, `kid` |

Notes:
- **Agent Card JWS** carries `x5c` so the signer's chain is verifiable against `security.trustAnchors` without an extra fetch. The `x5c` value MUST be an RFC 7515 §4.1.6 array of one or more base64-encoded DER X.509 certificates, ordered **leaf first** (index 0 = the signing certificate), with each subsequent entry certifying the one before it. The array MUST include every intermediate certificate required to chain to an anchor in `security.trustAnchors`; the trust-anchor root itself is the only certificate that MAY be omitted. Verifiers MUST reject an `x5c` containing only the leaf certificate when the signing chain would otherwise require an intermediate that is absent from the anchor store (`CardSignatureFailed`, reason `x5c-chain-incomplete`). (SV-SIGN-04)
- **MANIFEST JWS** intentionally forbids RS256 — manifest verification is a bootstrap-critical path and RSA adds no value over Ed25519 at that layer.
- **`program.md` JWS** signs raw Markdown bytes (not JCS-canonicalized anything); Markdown is not JSON and has no canonicalization rule. **Signer key resolution (normative, two-step):**
  1. **Cert retrieval + thumbprint match.** The required header `x5c` carries a leaf-first RFC 7515 §4.1.6 certificate array under the same rules as Agent Card JWS (see above): index 0 is the signing certificate, every intermediate required to chain to `security.trustAnchors` is included, only the anchor root MAY be omitted. The required header `x5t#S256` (RFC 7515 §4.1.8) carries the SHA-256 thumbprint of the DER-encoded signing certificate. Verifiers MUST compute SHA-256 of the DER bytes of `x5c[0]` and reject any JWS whose computed value differs from the `x5t#S256` header value (`CardSignatureFailed`, reason `x5t-thumbprint-mismatch`).
  2. **Chain-to-anchor via SPKI.** Verifiers MUST then walk the `x5c` array and confirm that the chain terminates at a certificate whose `SubjectPublicKeyInfo` hashes to the `spki_sha256` of some entry in the Agent Card's `security.trustAnchors`. A signer whose chain does not terminate at an anchor MUST be rejected (`CardSignatureFailed`, reason `chain-anchor-mismatch`).

  The two checks are distinct: `x5t#S256` binds the signer to the end-entity certificate, and `security.trustAnchors[].spki_sha256` binds the chain's trust root. Earlier drafts conflated the two; the present wording supersedes any legacy prose. `program.md` JWS is NOT signed by the `publisher_kid` release key — that key signs MANIFEST only. (SV-SIGN-05)
- All verifiers MUST reject JWS with an absent or unknown `typ` as a category error (`CardSignatureFailed` for Agent Card, `ManifestDigestMismatch` for MANIFEST, `ui.prompt-signature-invalid` for PDA-JWS, appropriate equivalent for `program.md`).

### 6.2 Normative JSON Schema

The Agent Card MUST validate against the JSON Schema 2020-12 document below.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://soa-harness.org/schemas/v1.0/agent-card.schema.json",
  "type": "object",
  "required": ["soaHarnessVersion", "name", "version", "url", "protocolVersion", "agentType", "permissions", "security"],
  "additionalProperties": false,
  "properties": {
    "soaHarnessVersion": { "type": "string", "const": "1.0" },
    "name": { "type": "string", "minLength": 1, "maxLength": 255 },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+(-[A-Za-z0-9.-]+)?$" },
    "description": { "type": "string", "maxLength": 1024 },
    "url": { "type": "string", "format": "uri", "pattern": "^https://" },
    "protocolVersion": { "type": "string", "const": "a2a-0.3" },
    "agentType": {
      "type": "string",
      "enum": ["general-purpose", "explore", "editor", "reviewer", "coordinator", "specialist"]
    },
    "skills": { "type": "array", "items": { "type": "string" }, "maxItems": 64 },
    "provider": { "type": "string", "minLength": 1, "maxLength": 255 },
    "supported_core_versions": {
      "type": "array",
      "items": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
      "minItems": 1,
      "uniqueItems": true,
      "default": ["1.0"],
      "description": "Wire-level version advertisement per §19.4.1. MUST include the value of soaHarnessVersion; MAY include earlier minors within the two-minor compatibility window."
    },
    "self_improvement": {
      "type": "object",
      "required": ["enabled"],
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "directive_file": { "type": "string", "default": "program.md" },
        "entrypoint_file": { "type": "string", "default": "agent.py", "description": "Path (relative to project root) to the single-file entrypoint containing EDITABLE SURFACES / IMMUTABLE ADAPTER markers (§9.3)" },
        "editable_surfaces": {
          "type": "array",
          "items": { "type": "string", "enum": ["system_prompt", "tool_definitions", "routing_logic", "prompt_templates"] },
          "uniqueItems": true
        },
        "immutable": {
          "type": "array",
          "items": { "type": "string", "enum": ["harbor_adapter", "security_adapter", "mcp_client", "permission_system", "session_persistence", "agents_md", "tasks_directory"] },
          "uniqueItems": true,
          "default": ["harbor_adapter", "security_adapter", "mcp_client", "permission_system", "session_persistence", "agents_md", "tasks_directory"]
        },
        "benchmark_mcp_endpoint": { "type": "string", "format": "uri" },
        "min_score_threshold": { "type": "number", "minimum": 0, "maximum": 1 },
        "max_iterations": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "holdout_fraction": { "type": "number", "minimum": 0.05, "maximum": 0.5, "default": 0.2 },
        "safety_gates":       { "type": "boolean", "default": true,  "description": "If true (default), §9.5 step 7 permission check is blocking for mutating-destructive surfaces." },
        "docker_isolation":   { "type": "boolean", "default": true,  "description": "If true (default), §9.7 Docker baseline is enforced. Disabling is NON-CONFORMANT; the flag exists only for test-harness short-circuits." },
        "stage_activate":     { "type": "boolean", "default": true,  "description": "If true (default), §9.5 step 12 stage-activate protocol is used. Disabling is NON-CONFORMANT." },
        "git_commit_policy":  { "type": "string", "enum": ["signed-only","any"], "default": "signed-only", "description": "'signed-only' requires commit.gpgsign=true (§9.5 step 12d). 'any' is NON-CONFORMANT outside test harnesses." },
        "budget":             { "type": "integer", "minimum": 1,     "description": "Optional per-iteration token budget; if absent, self-improvement shares the session budget bounded by §16.2 (≤ 10% of maxTokensPerRun)." }
      }
    },
    "memory": {
      "type": "object",
      "required": ["enabled"],
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "mcp_endpoint": { "type": "string", "format": "uri" },
        "type": { "type": "string", "enum": ["evolving-graph", "flat-list", "kv-store"] },
        "sharing_policy": { "type": "string", "enum": ["none", "session", "project", "tenant"] },
        "aging_rules": {
          "type": "object",
          "required": ["consolidation_threshold","max_in_context_tokens"],
          "additionalProperties": false,
          "properties": {
            "temporal_indexing": { "type": "boolean", "default": true },
            "consolidation_threshold": { "type": "string", "pattern": "^P(\\d+Y)?(\\d+M)?(\\d+D)?(T(\\d+H)?(\\d+M)?(\\d+S)?)?$", "default": "P30D", "description": "Required by §8.2 recency scoring and §8.4 consolidation trigger." },
            "max_in_context_tokens": { "type": "integer", "minimum": 0, "maximum": 1000000, "description": "0 disables memory for the session." }
          }
        },
        "in_context_strategy": {
          "type": "object",
          "required": ["weights"],
          "additionalProperties": false,
          "properties": {
            "weights": {
              "type": "object",
              "required": ["semantic_relevance", "recency", "graph_strength"],
              "properties": {
                "semantic_relevance": { "type": "number", "minimum": 0, "maximum": 1 },
                "recency": { "type": "number", "minimum": 0, "maximum": 1 },
                "graph_strength": { "type": "number", "minimum": 0, "maximum": 1 }
              }
            },
            "tie_breaker": { "type": "string", "enum": ["importance", "id-lex", "created-at-asc"], "default": "importance" }
          }
        }
      }
    },
    "permissions": {
      "type": "object",
      "required": ["activeMode", "handler"],
      "additionalProperties": false,
      "properties": {
        "activeMode": { "type": "string", "enum": ["ReadOnly", "WorkspaceWrite", "DangerFullAccess"] },
        "handler": { "type": "string", "enum": ["Interactive", "Coordinator", "Autonomous"] },
        "toolRequirements": {
          "type": "object",
          "additionalProperties": { "type": "string", "enum": ["AutoAllow", "Prompt", "Deny"] }
        },
        "policyEndpoint": { "type": "string", "format": "uri", "pattern": "^https://" }
      }
    },
    "compaction": {
      "type": "object",
      "required": ["preserveRecentTurns", "triggerTokens"],
      "additionalProperties": false,
      "properties": {
        "preserveRecentTurns": { "type": "integer", "minimum": 1, "maximum": 100 },
        "triggerTokens": { "type": "integer", "minimum": 1000 },
        "targetTokens": { "type": "integer", "minimum": 500 },
        "pushToMemory": { "type": "boolean", "default": true }
      }
    },
    "tokenBudget": {
      "type": "object",
      "required": ["maxTokensPerRun", "billingTag"],
      "additionalProperties": false,
      "properties": {
        "maxTokensPerRun": { "type": "integer", "minimum": 1 },
        "billingTag": { "type": "string", "pattern": "^[A-Za-z0-9_:.-]{1,64}$" },
        "projectionWindow": { "type": "integer", "minimum": 3, "maximum": 100, "default": 10 }
      }
    },
    "observability": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "otelExporter": { "type": "string", "format": "uri" },
        "requiredResourceAttrs": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["service.name", "soa.agent.name", "soa.agent.version", "soa.billing.tag"]
        }
      }
    },
    "security": {
      "type": "object",
      "required": ["oauthScopes", "trustAnchors"],
      "additionalProperties": false,
      "properties": {
        "oauthScopes": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
        "trustAnchors": {
          "type": "array",
          "minItems": 1,
          "description": "Agent Card trust anchors. At least one entry MUST carry publisher_kid: that entry identifies the release-signing anchor used by the §5.3 bootstrap to verify MANIFEST.json.jws. Cards published into a deployment that does not run soa-validate locally MAY omit publisher_kid on all anchors IF and ONLY IF no §9 self-improvement loop is active; §5.3 bootstrap and any core+si deployment requires at least one publisher_kid-carrying anchor.",
          "contains": {
            "type": "object",
            "required": ["publisher_kid"]
          },
          "items": {
            "type": "object",
            "required": ["issuer", "spki_sha256", "uri"],
            "additionalProperties": false,
            "properties": {
              "issuer":      { "type": "string" },
              "spki_sha256": { "type": "string", "pattern": "^[A-Fa-f0-9]{64}$" },
              "uri":         { "type": "string", "format": "uri", "pattern": "^https://", "description": "Base URI for trust-anchor artifacts; CRL MUST resolve at <uri>/crl.json" },
              "publisher_kid": { "type": "string", "description": "Present only on the trust anchor authorized to sign the soa-validate release manifest (§9.7.1); kid matches the JWS header of MANIFEST.json.jws. At least one trustAnchors entry MUST carry this field (enforced by the contains constraint)." }
            }
          }
        },
        "mtlsRequired": { "type": "boolean", "default": true },
        "auditSink": { "type": "string", "format": "uri", "description": "WORM audit sink endpoint (§10.5); scheme MAY be https, s3, gs, azblob, or a site-local scheme" },
        "data_residency": { "type": "array", "items": { "type": "string", "pattern": "^[A-Z]{2}$", "description": "ISO 3166-1 alpha-2 country code" }, "uniqueItems": true, "description": "OPTIONAL residency pinning per §10.7 step 5 (L-41). Array of ISO 3166-1 country codes. When present, Runner MUST apply the layered-defence gate and emit a ResidencyCheck audit row per tool invocation." },
        "coordinationEndpoint": { "type": "string", "format": "uri", "pattern": "^https://", "description": "REQUIRED when Runner runs in SOA_COORD_MODE=distributed per §12.4; points at the etcd/ZooKeeper/Redis/MCP coordination service issuing monotonic fencing tokens for clustered self-improvement acceptance." }
      }
    }
  }
}
```

### 6.3 Informative Example

```json
{
  "soaHarnessVersion": "1.0",
  "name": "example-project-agent",
  "version": "1.0.0",
  "description": "Handles spreadsheet workflows with self-improvement",
  "url": "https://agent.example.com",
  "protocolVersion": "a2a-0.3",
  "agentType": "general-purpose",
  "skills": ["research", "coding", "analysis"],
  "provider": "anthropic",
  "self_improvement": {
    "enabled": true,
    "directive_file": "program.md",
    "editable_surfaces": ["system_prompt", "tool_definitions", "routing_logic"],
    "benchmark_mcp_endpoint": "mcp://benchmarks.internal/project-evals",
    "min_score_threshold": 0.85,
    "max_iterations": 50,
    "holdout_fraction": 0.2
  },
  "memory": {
    "enabled": true,
    "mcp_endpoint": "mcp://memory.internal/project",
    "type": "evolving-graph",
    "sharing_policy": "project",
    "aging_rules": { "temporal_indexing": true, "consolidation_threshold": "P30D", "max_in_context_tokens": 8000 },
    "in_context_strategy": { "weights": { "semantic_relevance": 0.5, "recency": 0.3, "graph_strength": 0.2 }, "tie_breaker": "importance" }
  },
  "permissions": { "activeMode": "ReadOnly", "handler": "Interactive", "toolRequirements": { "delete_file": "Prompt" }, "policyEndpoint": "https://policy.example.com" },
  "compaction": { "preserveRecentTurns": 4, "triggerTokens": 80000, "targetTokens": 40000 },
  "tokenBudget": { "maxTokensPerRun": 200000, "billingTag": "project-spreadsheet" },
  "observability": { "otelExporter": "https://otel.internal/ingest" },
  "security": { "oauthScopes": ["read:files", "write:artifacts"], "trustAnchors": [{"issuer":"CN=SOA Internal CA","spki_sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","uri":"https://ca.example.com/soa-internal","publisher_kid":"soa-release-v1.0"}], "auditSink": "https://audit.example.com/worm" }
}
```

A reference test vector demonstrating schema validity and a detached JWS signature is published at `https://soa-harness.org/test-vectors/v1.0/agent-card.{json,json.jws}` and mirrored in the release bundle under `test-vectors/`. Conformance runners consume this vector for `SV-CARD-03` and `HR-12`.

### 6.4 Validation Failure Behavior

On schema-validation or signature-verification failure the Runner MUST:
1. Emit `CardInvalid` (§24) on the System Event Log.
2. Refuse to accept handoffs from, or to, the agent.
3. Refuse to start if the failure concerns the Runner's own Card.

### 6.5 Precedence Among Declaration Sources

Self-improvement configuration, memory configuration, permissions, and endpoints MAY appear in multiple artifacts. Precedence (highest to lowest):

1. Signed Agent Card.
2. `program.md` (for `self_improvement.*` objective text only; numeric/policy fields in Card win).
3. `AGENTS.md` Human-in-the-Loop Gates (for permission escalation only; may tighten but not loosen Card).
4. `self_optimize(...)` call arguments (ephemeral; may override Card only for a single invocation; MUST log `ConfigOverride`).
5. Defaults from this specification.

A lower source that attempts to loosen a higher source MUST be rejected with `ConfigPrecedenceViolation` (§24).

---

## 7. AGENTS.md

### 7.1 Location and Encoding

- The file MUST exist at project root, UTF-8 encoded, LF line endings.
- The file is declared **immutable** with respect to the self-improvement loop (see §9).

### 7.2 Required Headings and Grammar

- Required top-level (H1) heading: `# AGENTS`.
- Required second-level (H2) headings, in the following order, each appearing exactly once:
  1. `## Project Rules`
  2. `## Agent Persona`
  3. `## Immutables`
  4. `## Self-Improvement Policy` — MUST contain a single line `entrypoint: <path>` naming the single-file entrypoint (`agent.py` by default). The same value is reflected in Agent Card `self_improvement.entrypoint_file`; the two MUST agree or startup fails with `AgentsMdInvalid`.
  5. `## Memory Policy`
  6. `## Human-in-the-Loop Gates`
  7. `## Agent Type Constraints`
- Additional H2 headings MAY follow; they are informative.
- Missing, duplicate, or out-of-order required headings MUST cause startup failure with `AgentsMdInvalid` (§24).

### 7.3 `@import` Semantics

- Syntax: a line beginning with `@import ` followed by a relative path. Path resolution base is the file containing the directive.
- Maximum recursion depth is 8. Exceeding it MUST fail with `AgentsMdImportDepthExceeded`.
- Cycles MUST be detected and rejected with `AgentsMdImportCycle`.
- Imports are textual inclusion; the importing file is re-parsed after substitution.
- Imported files MUST also be UTF-8 and MUST NOT re-declare H1.

### 7.4 Reload Rules

- The Runner MUST read AGENTS.md on startup and after any self-improvement iteration that is **accepted** (see §9).
- Concurrent reload during an in-flight turn is NOT permitted. A reload is deferred until the current turn terminates (§16).

---

## 8. Memory Layer

### 8.1 MCP Tool Contract

The Memory MCP server MUST expose the following tools. Error responses follow §24.

```text
add_memory_note(
  summary: string (≤ 16 KiB),
  data_class: "public" | "internal" | "confidential" | "personal",
  session_id: string,
  note_id?: string,
  tags?: array<string> (≤ 32, each ≤ 64 chars),
  importance?: number (0.0–1.0 inclusive, default 0.5)
) → { "note_id": string, "created_at": string /* RFC 3339 */ }
Errors: MemoryQuotaExceeded, MemoryDuplicate, MemoryMalformedInput, MemoryDeletionForbidden

search_memories(
  query: string,
  limit: integer (1–1000, default 20),
  time_range?: { start: string, end: string } /* RFC 3339 */
) → { "hits": array<{ id, score, snippet, created_at, tags, importance }>, "truncated": boolean }
Errors: MemoryUnavailable, MemoryTimeout

search_memories_by_time(
  start: string, end: string
) → { "hits": array<{ id, created_at, tags }>, "truncated": boolean }

read_memory_note(id: string) → { id, note, tags, importance, created_at, graph_edges: array<{peer, weight}> }
Errors: MemoryNotFound

consolidate_memories(
  threshold: string /* ISO-8601 duration */
) → { "merged": integer, "strengthened_edges": integer, "summary_ids": array<string> }

delete_memory_note(
  id: string,
  reason: string (≤ 512 chars)
) → { "deleted": boolean, "tombstone_id": string, "deleted_at": string /* RFC 3339 */ }
Errors: MemoryNotFound, MemoryDeletionForbidden
```

`delete_memory_note` MUST be idempotent on `id`: a repeated call with the same `id` returns the same `tombstone_id` and `deleted_at`. The deletion MUST leave a tombstone record retaining `id`, `created_at`, `tags`, `deleted_at`, and `reason` (but not the note body). `search_memories` MUST NOT return tombstoned notes. `MemoryDeletionForbidden` is returned when the caller lacks the `delete:memory` scope.

**`add_memory_note` normative behavior (L-58 clarification):**

- **`summary`** is the lossy-compressed content to persist (the memory's working-context form). The raw conversation text that spawned a note is NOT the `summary`; the Runner computes the summary via §8.2 loading-algorithm context or §9.5 self-improvement path before invoking `add_memory_note`.
- **`data_class`** (REQUIRED) binds the note's §10.7 classification at persistence. The MCP server MUST reject `data_class == "sensitive-personal"` with `MemoryDeletionForbidden` (reason `sensitive-class-forbidden`) — that class MUST NOT be persisted to memory in any form (§10.7.2, already-normative rule extended to the add-path).
- **`session_id`** (REQUIRED) binds the note for §8.5 `sharing_policy` enforcement. The server uses this to decide cross-session visibility on subsequent `search_memories` calls.
- **`note_id`** (OPTIONAL) enables idempotent writes. When present: if a non-tombstoned note with the same `note_id` exists, the server returns that existing `{note_id, created_at}` without creating a duplicate (idempotent success); if a tombstoned note with the same `note_id` exists, the server rejects with `MemoryDuplicate` (tombstoned ids cannot be reused). When absent: the server mints a fresh `note_id` and returns it.
- **`tags`** (OPTIONAL) are caller-supplied classification hints; the server MAY enrich during consolidation. Absent `tags` → empty array.
- **`importance`** (OPTIONAL, default `0.5`) is a caller-supplied priority hint used in §8.2's composite score.
- **Response `note_id`** is the same identifier value that `search_memories` returns under its `hits[].id` key and that `read_memory_note` accepts as its `id` parameter. The field-name asymmetry (`note_id` on write, `id` on read) is intentional: `note_id` disambiguates against request-ambient noise on a write (`session_id`, `data_class`), while `id` is the natural read-side key.
- **Wire shape:** HTTP request body is flat JSON with fields as top-level keys (no nesting under an outer `note` object). Response is flat JSON with `note_id` and `created_at` at the top level.

### 8.2 Loading Algorithm

On each Runner loop iteration (defined as one execution of §16 state 1 → state 6), the Runner MUST:

1. Compute a candidate set by calling `search_memories(query=loop_intent, limit=L)` where `L = clamp(ceil(4 * aging_rules.max_in_context_tokens / mean_note_tokens), 1, 1000)` — clamped to the `search_memories` contract bounds (§8.1). `mean_note_tokens` is estimated from the last 100 reads, or `512` on cold start. If `max_in_context_tokens == 0`, memory is disabled for the session and this step is skipped.
2. Score each candidate with `score(c) = w_s*semantic + w_r*recency_exp + w_g*graph_strength` where weights come from `memory.in_context_strategy.weights`, `recency_exp = exp(-age_days / consolidation_threshold_days)`, and `semantic`/`graph_strength` come from the MCP response.
3. Sort descending by score; break ties per `tie_breaker`.
4. Accumulate notes in order until the next note would exceed `max_in_context_tokens`; stop. Do not partially include notes.
5. Record the loaded set in the System Event Log with category `MemoryLoad`.

### 8.3 Unavailability and Timeout

- Default Memory MCP call timeout is 2000 ms.
- On timeout or connection failure during startup: the Runner MUST fail startup with `MemoryUnavailableStartup`. Fail-open to empty memory is NOT permitted.
- On timeout mid-loop: the Runner MUST proceed with the last successfully loaded memory slice and emit `MemoryDegraded` on the System Event Log. A persistent failure (≥ 3 consecutive loops) MUST terminate the session with `StopReason::MemoryDegraded`.

### 8.3.1 MemoryDegraded Observability (Normative — clarification for L-34)

**Rationale.** `MemoryDegraded` is a `StopReason` (§13.4 enum) emitted when the Memory MCP server fails three consecutive calls. It is NOT a bare `StreamEvent` type in the §14.1 27-value closed enum. For external observation:

1. **Via SessionEnd event:** when `MemoryDegraded` terminates a session, the `SessionEnd` StreamEvent (a §14.1 type) carries `payload.stop_reason: "MemoryDegraded"`. Validators assert `HR-17` (Memory MCP timeouts → MemoryDegraded) by polling `GET /events/recent` for a `SessionEnd` event with this stop_reason.
2. **Via System Event Log:** the `/logs/system.log` entry per §14.2 carries the `MemoryDegraded` category.

Do NOT interpret "MemoryDegraded StreamEvent" in any plan, test harness, or validator assertion as a direct §14.1 type — it is always observed through `SessionEnd.payload.stop_reason` or the System Event Log.

### 8.4 Consolidation Trigger

The Runner MUST invoke `consolidate_memories(aging_rules.consolidation_threshold)` at least once per 24 hours, or after any session accumulating ≥ 100 new notes, whichever is sooner. A dedicated consolidation process MAY perform this out-of-band.

#### 8.4.1 Consolidation Trigger Test Hooks (Normative — Testability, L-40)

**Rationale.** `SV-MEM-05` asserts the §8.4 trigger fires within the specified window. The 24-hour arm is infeasible to exercise against real wall-clock in a conformance run; the 100-new-notes arm exercises the §8.1 `add_memory_note` write primitive (available since the spec's initial §8.1 publication — an earlier version of this rationale incorrectly described `add_memory_note` as missing from §8.1; corrected in L-56 Phase 0a tool-surface lockdown). A deterministic elapsed-time injection remains required to make `SV-MEM-05` testable against the 24-hour arm.

**Env vars:**

- `RUNNER_CONSOLIDATION_TICK_MS=<milliseconds>` — poll interval for the consolidation scheduler. Default 60000 (1 minute) when unset. Validators set to a small value (e.g., 100) to reduce polling latency during testing.
- `RUNNER_CONSOLIDATION_ELAPSED_MS=<milliseconds>` — injected elapsed-time offset added to the scheduler's internal timer on each tick. Default 0 when unset. Validators set to 86400001 (24h + 1ms) to fast-forward the 24h arm deterministically. The Runner MUST fire `consolidate_memories` on the next tick after elapsed-time crosses the 24-hour threshold per §8.4.

**Production guard:** same rule as `RUNNER_TEST_CLOCK` / `SOA_RUNNER_DYNAMIC_TOOL_REGISTRATION` — MUST NOT be reachable by untrusted principals, MUST refuse startup with either env set on a non-loopback interface. Both env vars are test-only.

**Conformance linkage.** `SV-MEM-05` validator starts Runner with `RUNNER_CONSOLIDATION_TICK_MS=100` + `RUNNER_CONSOLIDATION_ELAPSED_MS=86400001`, observes `consolidate_memories` called on the memory-mcp-mock (via mock's call log) within 200ms, asserts `threshold` argument equals `aging_rules.consolidation_threshold` from the Agent Card.

### 8.5 Sharing Policy and Isolation

`sharing_policy` values bind the maximum visibility of `search_memories` results:
- `none`: no cross-session visibility.
- `session`: visible within the session that wrote the note.
- `project`: visible to any session in the same billing-tag namespace.
- `tenant`: visible across projects for the same tenant.

The Memory MCP server MUST enforce `sharing_policy` on the server side based on the authenticated caller. Client-side enforcement is advisory.

### 8.6 Memory State Observability (Normative)

**Rationale.** §8.1–§8.5 define the Memory layer as MCP-connected with aging rules, consolidation triggers, and sharing-policy enforcement. Without an externally-observable state surface, `SV-MEM-01..08` cannot verify aging has fired, consolidation is pending/done, or sharing-policy is reflected in what's in-context for a session. Same pattern as §10.3.1, §10.5.2, §12.5.1 — define a read-only observation endpoint so conformance tests aren't blind-guessing.

**Endpoint.** Every conformant Runner whose Agent Card carries `memory.enabled: true` MUST expose:

```
GET /memory/state?session_id=<session_id>
```

- **Transport, auth, rate-limit:** same pattern as §12.5.1 — TLS 1.3 / loopback plain, `sessions:read:<session_id>` scope (reuses the §12.6 default-granted bearer scope set), 120 rpm.
- **Response schema:** `schemas/memory-state-response.schema.json`.
- **Response body (200):**

```json
{
  "session_id": "ses_...",
  "sharing_policy": "none | session | project | tenant",
  "in_context_notes": [
    { "note_id": "mem_...",
      "summary": "...",
      "data_class": "public | internal | confidential | personal",
      "weight_semantic": 0.42,
      "weight_recency": 0.33,
      "weight_graph_strength": 0.18,
      "composite_score": 0.93,
      "loaded_at": "<RFC 3339>"
    }
  ],
  "available_notes_count": 142,
  "consolidation": {
    "last_run_at": "<RFC 3339>",
    "next_due_at": "<RFC 3339>",
    "pending_notes": 17
  },
  "aging": {
    "temporal_indexing": true,
    "consolidation_threshold": "P30D",
    "max_in_context_tokens": 8000
  },
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

- When `memory.enabled: false` in the Agent Card: endpoint returns `501 Not Implemented` with body `{"error":"memory-disabled","reason":"memory-disabled"}`.
- When session exists but has no in-context notes: `in_context_notes` is an empty array, `available_notes_count >= 0`.

**Not-a-side-effect (MUST).** Reading `/memory/state` MUST NOT: trigger consolidation, advance aging clocks, emit StreamEvents, or write audit rows. Byte-identity excludes `generated_at` (same rule as §12.5.1).

**Conformance linkage.** `SV-MEM-STATE-01` (new) — schema + not-a-side-effect + memory-disabled 501 path. `SV-MEM-01..08` live paths use this endpoint as the observation surface for aging, consolidation, and sharing-policy assertions.

### 8.7 Reference Memory Backend Implementations (Informative)

**Status.** This subsection is **informative** (non-normative). It documents reference Memory MCP backend implementations shipped under the `@soa-harness/memory-mcp-*` namespace alongside v1.0.0. None of the specific backends are privileged by §8 — the §8.1–§8.6 contract is the sole normative surface, and any server honoring it is conformant. The three backends below exist to prove §8 is implementable by the ecosystem's leading memory layers, not to elevate them above alternatives.

#### 8.7.1 Backend Comparison

| Backend | External deps | Persistence | Embedding | Native graph | Best-fit deployment |
|---|---|---|---|---|---|
| `@soa-harness/memory-mcp-sqlite` | none (in-process) | SQLite file | `transformers.js` local (MiniLM or similar) | adjacency JSON | Single-agent deployments, local dev, conformance testing |
| `@soa-harness/memory-mcp-mem0` | Qdrant + LLM API + optional Neo4j | Qdrant + Postgres | vector (backend-configured) | native (via optional Neo4j) | Multi-agent production; operators comfortable with Qdrant + LLM infra |
| `@soa-harness/memory-mcp-zep` | Zep server + Postgres | Postgres | Zep-native | native temporal knowledge graph | Multi-agent deployments valuing temporal reasoning + summarization |

#### 8.7.2 Selection Rubric (Descriptive)

- **`sqlite` suits:** bounded-scale deployments where operational simplicity outweighs multi-agent scale. Zero external services. Ships as the scaffold default in `create-soa-agent`.
- **`mem0` suits:** deployments that already run a vector store, have LLM-API budget for production-mode entity extraction, and value the mem0 ecosystem's tooling (hosted dashboard, SDK ergonomics).
- **`zep` suits:** deployments where temporal reasoning matters (episodic memory with time-windowed reasoning) and Postgres is already part of the stack.

Operators SHOULD choose based on workload shape and existing infrastructure, not vendor preference. All three backends are Apache-2.0 licensed.

#### 8.7.3 Deployment Recipe (sqlite — exemplary)

```bash
npm install @soa-harness/memory-mcp-sqlite@next
npx soa-memory-mcp-sqlite --port 8001 --db-path ./memory.sqlite
# In your Agent Card:
#   "memory": {"enabled": true, "mcp_endpoint": "http://127.0.0.1:8001"}
```

`mem0` and `zep` deployments require external services — see each package's README for docker-compose recipes.

#### 8.7.4 Data Portability (Normative in spirit — informative in location)

Memory MCP backends are **not interoperable by design**. Each backend owns its storage semantics. Migrating from backend A to B requires exporting notes from A using §8.1 `search_memories` + `read_memory_note` paginated over the full corpus, and re-inserting into B via `add_memory_note`. Tombstones and `deleted_at` timestamps are not guaranteed to transfer. Tooling for cross-backend migration is out of scope for v1.0.0 and left to operator-specific scripts.

#### 8.7.5 Conformance Gate

Each reference backend ships with an independent `soa-validate --memory-backend=<name>` pass result published in `backend-conformance-report.json` per release. v1.0.0 final ships when all published backends pass `SV-MEM-01..08 + HR-17` OR explicitly waive specific tests with documented rationale (per the `waiver_reference` field in the report schema).

#### 8.7.6 Not Covered Here

- Backend-specific tuning guides
- Custom backend authoring walkthroughs
- Backend-migration tooling

These are deferred to v1.0.x or later and deliberately scope-bounded out of §8.7 to keep the informative surface small.

---

## 9. Self-Improvement Layer

### 9.1 Required Files

- `program.md` MUST exist at root and conform to the schema in §9.2.
- `agent.py` (or the single-file entrypoint declared in `AGENTS.md`) MUST contain the markers in §9.3.
- `/tasks/` MUST contain Harbor-format benchmark tasks per §9.6. `/tasks/` is declared **immutable** with respect to the self-improvement loop; edits to `/tasks/` by the meta-agent MUST fail with `ImmutableTargetEdit` (§24).

### 9.2 `program.md` Schema

```
# Program
## Objective
<free text; the optimization target described in human prose>

## Success Criteria
- <criterion> (target: <metric operator value>)
- …

## Constraints
- <free-text constraint>
- …

## Non-Goals
- <free-text non-goal>
- …
```

All four H2 sections are REQUIRED. `## Success Criteria` items MUST follow the pattern `(target: <name> <op> <value>)` where `<op> ∈ {>, >=, <, <=, ==}`. `program.md` MUST be covered by detached JWS (file: `program.md.jws`) whose signer is listed in the Agent Card's `security.trustAnchors`.

### 9.3 `agent.py` Markers

```python
# === EDITABLE SURFACES (meta-agent may modify) ===
# Contains only code whose bytes fall within surfaces declared in
# agent-card.json :: self_improvement.editable_surfaces.
# === END EDITABLE SURFACES ===

# === IMMUTABLE ADAPTER (do not edit) ===
# Harbor integration, trajectory serialization, MCP client,
# security adapter, permission system, session persistence.
# === END IMMUTABLE ADAPTER ===
```

Marker enforcement:
- Each marker pair MUST appear exactly once.
- The meta-agent's proposed edits MUST be expressed as a unified diff; the harness MUST reject any diff that modifies bytes outside the EDITABLE SURFACES span. Validation is syntactic (exact byte ranges) AND structural (AST parse of the edited file MUST succeed).
- A SHA-256 digest of the IMMUTABLE ADAPTER span MUST be recorded in the improvement log (§9.8) before and after the iteration; mismatch aborts.

### 9.4 SelfOptimizer Primitive

```text
runner.self_optimize(
  directive_file="program.md",
  benchmark_mcp_endpoint="mcp://benchmarks.internal",
  max_iterations=50,
  min_score_threshold=0.85,
  holdout_fraction=0.2,
  safety_gates=true,
  docker_isolation=true,
  stage_activate=true,
  git_commit_policy="signed-only"
)
```

All arguments MUST default from Agent Card values (§6.5 precedence). Unknown arguments MUST be rejected.

### 9.5 Execution Sequence

Each iteration MUST execute the following steps strictly in order. Any step's failure triggers the abort path in §9.9.

1. **Authenticate.** Establish an mTLS-authenticated MCP session to `benchmark_mcp_endpoint`. Scopes REQUIRED: `read:benchmarks`, `write:scores`. Missing scopes → `BenchmarkAuthFailed`.
2. **Freeze Inputs.** Compute and record SHA-256 of: `program.md`, `program.md.jws`, `/tasks/**` content, current `agent.py`, Agent Card, IMMUTABLE ADAPTER span. This set is the **iteration fingerprint**.
3. **Read Directive.** Load `program.md`. Verify its JWS (§9.2). Record `directive_hash`.
4. **Propose Edits.** The meta-agent (running under `permissions.handler` as declared in the Agent Card) emits a unified diff proposing changes only to surfaces in `self_improvement.editable_surfaces`. The diff MUST NOT touch files in `self_improvement.immutable`.
5. **Static Validation.** Run byte-range check (§9.3) and AST parse. On failure → abort.
6. **Stage.** Apply the diff to a **staging worktree** (git worktree rooted at `refs/self-improvement/staging-<iteration-id>`). The main branch is untouched until step 12.
7. **Permission Check.** If any change touches a surface classified as mutating-destructive (see §10), the handler MUST emit `PermissionPrompt` and block until a decision is recorded in the Audit Trail. Autonomous handlers MUST NOT bypass high-risk decisions; see §10.4.
8. **Holdout Split.** Partition `/tasks/` into **training** (fraction `1 - holdout_fraction`, selected by stable hash over task IDs using iteration-id as salt) and **holdout** (remainder). The training score drives acceptance; the holdout score gates Goodhart abort (§23).
9. **Run Benchmarks (Docker).** Execute training tasks in Docker containers conforming to §9.7. Parse `results.tsv` (§9.6.3) and compute `training_score = mean(task_score)`. Also run holdout tasks and compute `holdout_score`.
10. **Regression Suite.** Run the full Harness Regression suite `HR-01`…`HR-18` (§15, §18) against the staging worktree.
11. **Accept/Reject Decision.** Accept if and only if:
    - `training_score > baseline_training_score` (strict improvement), AND
    - `training_score ≥ min_score_threshold`, AND
    - `holdout_score ≥ baseline_holdout_score - 0.02`, AND
    - Every `HR-*` test passes.
12. **Activate (Stage-Activate Protocol).** On accept:
    a. Write `pending.ptr` atomically pointing at the staging commit SHA.
    b. Call `add_memory_note` with the improvement log summary; obtain `memory_note_id`.
    c. Write `activation.record.json` containing `{ iteration_id, staging_sha, memory_note_id, fingerprint, decision_time }` atomically (tempfile + `fsync` + rename; on Windows use `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH`).
    d. Fast-forward `main` to `staging_sha` using `git update-ref --create-reflog` with a signed commit (`commit.gpgsign=true` REQUIRED). Commit author is `soa-harness-meta <meta@agent.local>` with message `"self-improvement[<iteration-id>]: +<delta> (<training_score>/<holdout_score>)"`.
    e. Emit `SelfImprovementAccepted` on StreamEvent and OTel span.
13. **Artifact Write.** Write `improvement.log.md` (§9.8) and produced artifacts under `/artifacts/self_improvement/<iteration-id>/`. The task-directory layout, `task.json` schema, and scoring contract referenced throughout steps 2–10 are normatively defined in §9.6 (Harbor-Format) and its subsections §9.6.1–§9.6.3; non-conforming task bundles MUST be rejected at S3 gate with `HarborFormatInvalid`.

### 9.6 Harbor-Format (Normative)

#### 9.6.1 Task Directory Layout

```
/tasks/
  <task-id>/
    task.json                     # required; schema §9.6.2
    Dockerfile                    # required; base image pinned by digest
    expected/                     # optional; files compared during scoring
    inputs/                       # optional; read-only mounted at /inputs
    entrypoint.sh                 # required; receives /inputs and writes /output
```

#### 9.6.2 `task.json` Schema

```json
{
  "$id": "https://soa-harness.org/schemas/v1.0/harbor-task.schema.json",
  "type": "object",
  "required": ["task_id", "version", "scoring", "resources"],
  "additionalProperties": false,
  "properties": {
    "task_id": { "type": "string", "pattern": "^[A-Za-z0-9_.-]{1,64}$" },
    "version": { "type": "string" },
    "description": { "type": "string" },
    "scoring": {
      "type": "object",
      "required": ["kind"],
      "oneOf": [
        { "properties": { "kind": { "const": "exact-match" }, "target": { "type": "string" } }, "required": ["target"] },
        { "properties": { "kind": { "const": "regex" }, "pattern": { "type": "string" } }, "required": ["pattern"] },
        { "properties": { "kind": { "const": "numeric" }, "tolerance": { "type": "number", "minimum": 0 } }, "required": ["tolerance"] },
        { "properties": { "kind": { "const": "external-scorer" }, "image": { "type": "string" } }, "required": ["image"] }
      ]
    },
    "resources": {
      "type": "object",
      "required": ["cpus", "memory_mib", "wall_clock_seconds"],
      "properties": {
        "cpus": { "type": "number", "minimum": 0.1, "maximum": 16 },
        "memory_mib": { "type": "integer", "minimum": 64, "maximum": 16384 },
        "wall_clock_seconds": { "type": "integer", "minimum": 1, "maximum": 3600 },
        "pids": { "type": "integer", "minimum": 16, "maximum": 4096, "default": 256 }
      }
    },
    "network": { "type": "string", "enum": ["none", "restricted"], "default": "none" },
    "env": { "type": "object", "additionalProperties": { "type": "string" } }
  }
}
```

#### 9.6.3 `results.tsv` Format

A tab-separated file per iteration at `/artifacts/self_improvement/<iteration-id>/results.tsv`.

```
task_id<TAB>partition<TAB>score<TAB>wall_clock_ms<TAB>status<TAB>notes
<string><TAB>train|holdout<TAB>0.0-1.0<TAB>int<TAB>pass|fail|error<TAB>string(no tab)
```

The first row MUST be the header above verbatim. Aggregation: `training_score = mean(score where partition=train AND status=pass, counting fail/error as 0.0)`. Identical computation for `holdout_score`.

### 9.7 Docker Isolation Baseline (Normative)

**Rationale.** Self-improvement tasks execute arbitrary code that the agent proposed and the harness has not yet validated — by definition these are the least-trusted processes in the system. The baseline is an intersection of the smallest-surface Linux isolation primitives whose combined effect is that a successful RCE in the task process still cannot (a) reach the host filesystem outside `/output`, (b) escalate beyond UID 65534, (c) make outbound network calls, (d) persist after the wall-clock timeout, or (e) affect sibling tasks. Docker was chosen over raw seccomp+namespaces because operator familiarity reduces misconfiguration risk, and over stronger sandboxes (gVisor, Firecracker) because the additional isolation comes at a startup-time cost that would dominate the inner-loop iteration rate self-improvement depends on. The `soa-harness-profile-v1` seccomp policy is explicitly enumerated (rather than "default Docker") so that a silent Docker-version default-change cannot weaken isolation without tripping conformance. Operators whose threat model requires stronger isolation (untrusted multi-tenant, regulatory) are expected to layer a VM boundary *outside* the Docker boundary — the baseline is a floor, not a ceiling.

Each benchmark task container MUST be launched with the following settings.

- `--read-only` root filesystem; writable tmpfs at `/tmp` (size ≤ 256 MiB).
- `--network=none` (or `restricted` bridge that drops egress to any address not listed in the task's `task.json.network=restricted` policy; `restricted` requires MCP policy approval).
- `--security-opt seccomp=<soa-harness-profile-v1>` (see §9.7.1).
- `--security-opt no-new-privileges`.
- `--user=65534:65534` (nobody:nogroup) with user-namespace remapping enabled; host UID/GID MUST NOT be 0.
- `--cap-drop=ALL`.
- `--pids-limit=<task.resources.pids>`.
- `--memory=<memory_mib>m`, `--memory-swap=<memory_mib>m` (no swap).
- `--cpus=<cpus>`.
- Timeout enforced by wall-clock via host watchdog; `wall_clock_seconds` exceeded → container SIGKILL and task `status=error`.
- Host socket (`/var/run/docker.sock`) MUST NOT be mounted.
- Mounts: `/inputs` read-only; `/output` writable; nothing else.
- Environment variables MUST be scrubbed; only `task.json.env` entries are passed through. Host env MUST NOT leak.
- Image MUST be referenced by digest (`image@sha256:...`). Tag-only references are rejected.
- **Host kernel prerequisite:** unprivileged user-namespace creation MUST be disabled on the host before launching any benchmark container. Implementations MUST verify at least one of the following at startup:
  - `sysctl user.max_user_namespaces=0` (portable; Linux ≥ 4.9), OR
  - `sysctl kernel.unprivileged_userns_clone=0` (Debian/Ubuntu patched kernels), OR
  - an AppArmor/SELinux policy that denies `userns_create` to the container's security context.

  If none is in effect, the Runner MUST emit `HostHardeningInsufficient` (§24) and abort. Rationale: `clone3(CLONE_NEWUSER)` cannot be filtered at the seccomp layer, and `CLONE_NEWUSER` is the only `CLONE_NEW*` flag that does not require `CAP_SYS_ADMIN`; `cap-drop=ALL` blocks the other six.

#### 9.7.1 Seccomp Profile and Release Manifest

**Release Manifest Schema (normative).** The `soa-validate` release manifest at `https://soa-harness.org/soa-validate/v1.0.0/MANIFEST.json` MUST conform to the JSON Schema below. The manifest itself MUST be covered by detached JWS at `MANIFEST.json.jws` signed by the SOA-WG release key; the signer's `kid` MUST match `publisher_kid` on a `security.trustAnchors[]` entry of every Agent Card that uses the manifest. The Runner MUST verify the manifest JWS before trusting any digest it contains, and MUST verify the seccomp profile's SHA-256 against `artifacts.seccomp.sha256` before applying it; mismatch emits `ManifestDigestMismatch` (§24) and blocks benchmark-container launch.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://soa-harness.org/schemas/v1.0/release-manifest.schema.json",
  "type": "object",
  "required": ["spec_version","released_at","publisher_kid","artifacts"],
  "additionalProperties": false,
  "properties": {
    "spec_version": { "type": "string", "const": "1.0" },
    "released_at": { "type": "string", "format": "date-time" },
    "publisher_kid": { "type": "string" },
    "artifacts": {
      "type": "object",
      "required": ["seccomp","soa_validate_binary","ui_validate_binary","supplementary_artifacts"],
      "additionalProperties": false,
      "allOf": [
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"SOA-Harness Core Specification v1.0 (Final).md"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"SOA-Harness UI Integration Profile v1.0 (Final).md"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"soa-validate-must-map.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"ui-validate-must-map.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/agent-card.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/canonical-decision.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/crl.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/gateway-config.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/harbor-task.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/locale-map.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/release-manifest.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/session.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/stream-event.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/stream-event-payloads.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/ui-derived-payloads.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/ui-envelope.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"schemas/wcag-addendum.schema.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/agent-card.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/agent-card.json.jws"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/topology-probe.md"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/tasks-fingerprint/README.md"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/permission-prompt/README.md"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/permission-prompt/permission-prompt.json"}}, "required":["path"] } } } },
        { "properties": { "supplementary_artifacts": { "contains": { "type":"object","properties": {"path": {"const":"test-vectors/permission-prompt/canonical-decision.json"}}, "required":["path"] } } } }
      ],
      "properties": {
        "supplementary_artifacts": {
          "type": "array",
          "description": "REQUIRED: the non-binary portion of the release bundle (spec MDs, must-maps, JSON Schema files, test vectors). The allOf/contains constraints above enforce the specific paths that MUST appear in every v1.0 release; additional entries are permitted. Runners verifying the manifest MAY fetch these; conformance tooling (soa-validate, ui-validate) MUST consume the ones relevant to its scope.",
          "items": {
            "type": "object",
            "required": ["name","path","sha256","canonicalization"],
            "additionalProperties": false,
            "properties": {
              "name": { "type": "string" },
              "path": { "type": "string" },
              "sha256": { "type": "string", "pattern": "^[A-Fa-f0-9]{64}$" },
              "canonicalization": { "type": "string", "enum": ["JCS-RFC-8785","raw-utf8"] }
            }
          }
        },
        "seccomp": {
          "type": "object",
          "required": ["name","sha256","canonicalization"],
          "properties": {
            "name": { "type": "string", "const": "soa-harness-profile-v1.json" },
            "sha256": { "type": "string", "pattern": "^[A-Fa-f0-9]{64}$" },
            "canonicalization": { "type": "string", "const": "JCS-RFC-8785" }
          }
        },
        "soa_validate_binary": { "type": "object", "required": ["sha256","url"], "additionalProperties": false, "properties": { "sha256":{"type":"string","pattern":"^[A-Fa-f0-9]{64}$"}, "url":{"type":"string","format":"uri"}, "status": {"type":"string","enum":["placeholder","shipped"],"description":"placeholder = all-zero digest reserved until a signed validator binary ships; conformance tools MUST refuse to verify against a placeholder entry."} } },
        "ui_validate_binary":  { "type": "object", "required": ["sha256","url"], "additionalProperties": false, "properties": { "sha256":{"type":"string","pattern":"^[A-Fa-f0-9]{64}$"}, "url":{"type":"string","format":"uri"}, "status": {"type":"string","enum":["placeholder","shipped"],"description":"placeholder = all-zero digest reserved until a signed validator binary ships; conformance tools MUST refuse to verify against a placeholder entry."} } }
      }
    }
  }
}
```

The seccomp JSON digest is computed over the file's JCS-canonicalized bytes (RFC 8785), so whitespace and key-order differences between source and deployed copy do not cause digest drift.

**Seccomp Parser.** Implementations MUST use a libseccomp-compatible parser that tolerates keys beginning with `$` at any nesting depth as non-normative annotations. Top-level examples include `$schema_note` and `$deployment_notes`; nested examples inside `syscalls[]` entries include `$group` and `$comment`. Docker 20.10+ (`dockerd`/`containerd`) and `runc` ≥ 1.1 satisfy this; strict parsers that reject unknown keys MUST recursively strip `$`-prefixed keys at every depth before loading.



The spec publishes `soa-harness-profile-v1.json` as a companion artifact. The profile's SHA-256 digest is recorded in the release manifest (schema above) under `artifacts.seccomp.sha256`; implementations MUST verify the digest against the JCS-canonicalized profile bytes before applying it and MUST refuse to launch benchmark containers if the digest does not match (`ManifestDigestMismatch`, §24). The profile is NOT the stock Docker default minus a deny list; rather, it is a **deny-by-default allowlist** that (a) omits the §9.7.1 deny list entirely and (b) extends beyond the classic Docker default to admit modern syscalls (`cachestat`, `fchmodat2`, `mseal`, `pidfd_getfd`, `close_range`, `openat2`, `io_uring_*`, `landlock_*`, `futex_waitv`, `memfd_secret`, `process_mrelease`, RISC-V–specific, etc.). Compatibility depends on the userspace seccomp name table (libseccomp ≥ 2.5) and loader behavior (Docker ≥ 20.10, runc ≥ 1.1). `clone3` is allowed (see §9.7.3); namespace-creation defense is layered through `cap-drop=ALL` and the host sysctl prerequisite above.

#### 9.7.2 Docker Unavailability

If Docker is not reachable or a container launch fails with non-task-caused error (daemon down, image pull denied), the iteration MUST abort with `DockerUnavailable`. Fail-open-to-host is NOT permitted.

#### 9.7.3 clone3 Policy

`clone3` MUST be allowed in the seccomp profile. The `CLONE_NEW*` flags inside its `struct clone_args` argument are defended by layered controls, not seccomp:

| Flag | Defense |
|---|---|
| CLONE_NEWNS, NEWUTS, NEWIPC, NEWPID, NEWNET, NEWCGROUP | `--cap-drop=ALL` (each requires CAP_SYS_ADMIN) |
| CLONE_NEWUSER | Host sysctl `user.max_user_namespaces=0` (or equivalent; see §9.7) |

Note on the table above: the seccomp mask `0x7E020000` at `soa-harness-profile-v1.json` L148 blocks all seven `CLONE_NEW*` flags (including NEWUSER) at the seccomp layer for legacy `clone()` — belt-and-suspenders. The table above describes the kernel-level defense for `clone3()`, whose flags live in a `struct clone_args` that seccomp cannot filter; `clone3()`'s NEWUSER defense is the host sysctl row.

Implementations MAY optionally deploy a `SECCOMP_RET_USER_NOTIF` supervisor (Linux ≥ 5.0, libseccomp ≥ 2.5) to inspect `clone_args.flags` at kernel-trap time. OPTIONAL, NOT REQUIRED for conformance.

This design ensures compatibility with all major libc implementations including musl ≥ 1.2.5 (Alpine ≥ 3.20), which uses `clone3` in `pthread_create` without fallback.

### 9.8 `improvement.log.md`

Every iteration (accepted or rejected) produces a log at `/artifacts/self_improvement/<iteration-id>/improvement.log.md`:

```
# Iteration <id>
- Fingerprint: <sha256>
- Directive hash: <sha256>
- Start: <RFC3339>
- End: <RFC3339>
- Decision: accept|reject|abort
- Reason: <enum; §24>
- Training score: <0.0-1.0> (baseline <0.0-1.0>, delta <±0.0-1.0>)
- Holdout score: <0.0-1.0> (baseline <0.0-1.0>, delta <±0.0-1.0>)
- Regression: pass|fail (failed tests: [<HR-ID>, ...])
- Memory note id: <string|null>
- Commit SHA: <sha|null>

## Diff
<unified diff if proposed>

## Notes
<free text>
```

### 9.9 Abort, Rollback, and Recovery

- **Abort path.** Any step 1–11 failure discards the staging worktree and emits `SelfImprovementRejected` with `reason`.
- **Step 12 partial failure.**
  - 12a succeeds, 12b fails → delete `pending.ptr`, abort.
  - 12b succeeds, 12c fails → compensating action: call `delete_memory_note(memory_note_id, reason="activation.record write failed for iteration <id>")`. On `delete_memory_note` failure, retry with exponential backoff up to 5 attempts; persistent failure escalates to `SelfImprovementOrphaned` and operator intervention.
  - 12c succeeds, 12d fails → recovery at next Runner start reads `activation.record.json`, verifies the staging commit is still present, and retries 12d. Three failed retries → `SelfImprovementOrphaned`.
- **Git failure in step 12d.** The staging commit remains reachable by ref; recovery retries on next start.
- **Max iterations reached.** The Runner emits `SelfImprovementMaxIterations`, writes a "best so far" summary, and leaves `main` at whatever was last accepted.
- **Crash mid-container.** Orphan containers are reaped on Runner start by label filter `soa-iteration-id=<id>`.

---

## 10. Permission System

### 10.1 Model

The permission system has three orthogonal dimensions:

- **Capability Level** (`activeMode`): the static capability envelope of a session.
  - Ordered (stricter → more permissive): `ReadOnly` < `WorkspaceWrite` < `DangerFullAccess`.
- **Per-Tool Control**: action required before invoking a tool.
  - `AutoAllow`, `Prompt`, `Deny`.
- **Handler** (`handler`): who makes the decision when a control is `Prompt`.
  - `Interactive` (human), `Coordinator` (delegating agent), `Autonomous` (policy engine).

These three dimensions are not comparable to each other.

### 10.2 Tool Classification

Every tool in the global Tool Registry (§11) MUST be pre-classified with a `risk_class ∈ {ReadOnly, Mutating, Destructive}` and a default `control ∈ {AutoAllow, Prompt, Deny}`.

- `Destructive` tools MUST have default `control = Prompt`.
- `ReadOnly` tools MAY default to `AutoAllow`.
- Classification lives in the Tool Registry and is authoritative.

### 10.3 Resolution Algorithm

`activeMode` as used throughout §10 denotes the **session's bound capability**, established at session bootstrap per §12.6 and constrained to be at-or-below the Agent Card's declared `permissions.activeMode`. The Agent Card's value is the upper bound (the deployment-wide maximum); each session carries its own bound value (MAY be tightened at bootstrap, MUST NOT be loosened). Older wording that reads "`activeMode`" in isolation — including in §10.1 and the assertion text of `SV-PERM-01` — refers to the session's bound value, not the Agent Card's.

For each tool invocation the Runner MUST resolve `(capability, control, handler)`:

1. Start with `capability = session.activeMode` (the bound value established at §12.6 bootstrap, ≤ the Agent Card's declared maximum) and `control = tool.default_control`.
2. Reject if `tool.risk_class` is not permitted under `capability`:
   - `ReadOnly` permits only `risk_class = ReadOnly`.
   - `WorkspaceWrite` permits `ReadOnly` and `Mutating` (not `Destructive`).
   - `DangerFullAccess` permits any.
   Rejection: emit `PermissionCapabilityDenied`, do NOT invoke.
3. Apply `permissions.toolRequirements[tool.name]` (if present). This override MAY only *tighten*: `AutoAllow → Prompt → Deny`. Loosening is rejected with `ConfigPrecedenceViolation`.
4. If `policyEndpoint` is set, POST `{ tool, args_digest, capability, control, session_id, request_id }` over mTLS; receive `{ decision: allow | prompt | deny, reason }`. The endpoint MAY only tighten further.
5. Dispatch to resolved `handler`:
   - `AutoAllow` → proceed, audit.
   - `Prompt` → block, emit `PermissionPrompt`, wait for signed decision, proceed or abort.
   - `Deny` → emit `PermissionDenied`, do NOT invoke.

#### 10.3.1 Permission Decision Observability (Normative)

**Rationale.** §10.3 defines permission resolution as an in-process function with deterministic inputs (`tool.risk_class`, `activeMode`, `permissions.toolRequirements[tool.name]`, optional `policyEndpoint` response). An in-process function with no externally observable surface cannot be independently verified by a conformance validator or inspected by an operator: the Runner's claim "I would decide X" carries only the weight of the Runner's own unit tests. Every other normative subsystem in this specification exposes a window onto its state (`/health`, `/ready`, `/.well-known/agent-card.*`, the audit sink, StreamEvent feed); permission resolution requires the same treatment. This section defines the window — a first-class endpoint, not a test-only hook. Operators legitimately need to know "what would the resolver decide for user X calling tool Y under session Z" for policy review, incident response, and capability-planning work; validators need the same window for `SV-PERM-01` live-path conformance.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /permissions/resolve?tool=<tool_name>&session_id=<session_id>
```

- **Transport:** HTTPS / TLS 1.3. Plain HTTP is NOT permitted. The endpoint MAY be additionally reachable over a loopback-only listener (Unix socket, named pipe) for operator tools running co-located with the Runner; that listener MAY be plain.
- **Authentication:** the request MUST present a session-scoped bearer token obtained via §12.3's session handshake (the same token class used for `/stream/v1/{session_id}`). Unauthenticated requests return `401 Unauthorized`. Bearer tokens not authorized for the named `session_id` return `403 Forbidden`. Unauthenticated probes to this endpoint MUST NOT leak Tool Registry (§11) contents, existing session identifiers, or trust-anchor state in either the response body or response timing.
- **Rate limiting:** the endpoint MUST be rate-limited per-bearer-token at no more than 60 requests/minute. Exceeding the limit returns `429 Too Many Requests` with `Retry-After`. Conformance: `SV-PERM-19`.

**Response (200 OK).** JSON body conforming to `schemas/permissions-resolve-response.schema.json`. The Runner computes the response by executing steps 1–4 of §10.3 against the `(tool, session_id)` pair and reporting the terminal state WITHOUT reaching step 5 (no dispatch, no invocation, no handler activation).

**Other responses:**
- `400 Bad Request` — malformed query parameters (missing `tool` or `session_id`, unrecognized characters).
- `401 Unauthorized` — missing or invalid bearer.
- `403 Forbidden` — bearer not authorized for the named session.
- `404 Not Found` — `tool` not in the Tool Registry (§11) OR `session_id` does not map to an active session.
- `429 Too Many Requests` — rate-limit exceeded.
- `503 Service Unavailable` — `/ready` is 503 (the resolver cannot be queried before boot completes). Body conforms to the §5.4 readiness-failure shape.

**Not-a-side-effect property (normative MUST).** A `/permissions/resolve` query MUST NOT produce any of the following:
1. An entry in `/audit/permissions.log` (§10.5) or any change to the audit hash chain. Conformance: `SV-PERM-01` validators issue `GET /permissions/resolve` twice and assert the audit log's terminal `this_hash` is unchanged between the two reads.
2. A StreamEvent (§14) emission on any session's stream.
3. A mutation to session state (§12), Tool Registry state (§11), CRL cache state (§10.6.1), or any other Runner-internal counter, clock, or handler-activation record.
4. A `PermissionPrompt` request, even when the resolved decision is `Prompt`. The response body carries `decision: "Prompt"`; no prompt is issued, no handler is contacted.

The Runner MAY invoke `policyEndpoint` (step 4) when computing the response because that is the only way to produce an accurate decision, and `policyEndpoint` is by its own contract an idempotent query service. When the Runner does invoke `policyEndpoint`, `policy_endpoint_applied: true` appears in the response. Operators who need a view of permission resolution WITHOUT the external network call can compare responses across two queries differing only by Runner configuration (policyEndpoint set vs unset on a test deployment).

**Deterministic query fixture.** The §10.3 algorithm receives `args_digest` as an input at step 4 (the `policyEndpoint` POST payload). `/permissions/resolve` does not carry real arguments; the Runner MUST substitute the literal fixed string `"SOA-PERM-RESOLVE-QUERY"` for `args_digest` when forwarding to `policyEndpoint`. This value is reserved — `policyEndpoint` implementations MUST either (a) treat it as "answer based on tool and capability only, ignoring args" or (b) respond with a tightening `Prompt` or `Deny`. Any `policyEndpoint` that loosens the decision on the basis of this reserved args_digest is non-conformant.

**Versioning.** Addition of this endpoint is strictly additive — no existing §10.3 behavior changes. Runners claiming `soaHarnessVersion: "1.0"` MUST ship this endpoint. Validators MAY accept a `501 Not Implemented` response on this endpoint from Runners claiming a pre-1.0 version, but such a Runner fails `SV-PERM-01` live-path conformance.

**Conformance linkage.** `SV-PERM-01` is fulfilled by two paths:
  1. **Vector path** — schema validation of `test-vectors/permission-prompt/` PDA-JWS and canonical-decision bundle (§18).
  2. **Live path** — validator establishes a session (out-of-band, via whatever bearer-provisioning surface the deployment provides), then for each entry in the pinned Tool Registry fixture issues `GET /permissions/resolve?tool=<name>&session_id=<validator session>` under each of the three `activeMode` values exercised in the fixture, and asserts that every response's `decision` matches the deterministic output of §10.3 steps 1–4 applied to the same inputs. The validator separately asserts the not-a-side-effect property by reading the audit log's tail hash before and after the query batch.

#### 10.3.2 Permission Decision Recording (Normative)

**Rationale.** §10.3.1 `/permissions/resolve` is a pure **query** — it reports what the resolver *would* decide without running step 5 (dispatch) and without writing an audit record. §10.5 requires that real permission decisions produce audit records. An externally-observable Runner therefore needs a surface on which the decision pipeline is *actually driven* — the resolver queried, step 5 dispatched, the audit row written. In production this happens when an agent invokes a tool through the MCP client; but for operator testing (replay a suspicious decision to see the full trace) and for conformance tests that depend on the audit chain accumulating (`HR-14`, `SV-AUDIT-RECORDS-01`, `SV-AUDIT-RECORDS-02`), the Runner MUST expose the decision pipeline as a first-class endpoint that **does** produce the side effects §10.5 mandates.

This is distinct from a full tool-invocation endpoint: no tool is actually executed. The Runner runs steps 1–5 of §10.3, stopping after the handler dispatches the outcome (and before any tool-side I/O). It is the pure permission-decision pipeline with its natural side effects (audit write, StreamEvent emission when §14 is shipped).

**Endpoint.** Every conformant Runner MUST expose:

```
POST /permissions/decisions
Content-Type: application/json
```

- **Transport:** HTTPS / TLS 1.3 on the public listener; loopback plain-HTTP permitted on Unix socket / named pipe (same rule as §10.3.1).
- **Authentication:** the request MUST present a session-scoped bearer token with scope `permissions:decide:<session_id>` (NEW scope class distinct from `permissions:resolve:<session_id>`). Deciding is a privileged operation — it mutates the audit chain. The session bootstrap in §12.6 grants `permissions:resolve:<session_id>` by default; operators MUST explicitly opt-in to `permissions:decide:<session_id>` at session creation (via an optional request-body field `request_decide_scope: true`) and the bootstrap issuer MAY refuse the scope for untrusted callers.
- **Rate limiting:** at most 30 requests/minute per bearer. `429 Too Many Requests` with `Retry-After` when exceeded.

**Request body.** JSON object:

```json
{
  "tool": "<tool_name>",
  "session_id": "<session_id>",
  "args_digest": "sha256:<hex>",
  "pda": "<compact-JWS-or-null>"
}
```

- `tool` — tool name from the Tool Registry (§11). Required.
- `session_id` — session whose `activeMode` determines the capability. Required; must match the session scope of the bearer.
- `args_digest` — SHA-256 of the invocation arguments as the request context would carry them. Required. This gets recorded in the audit row's `args_digest` field. For conformance tests where no real args exist, the validator MAY use a pinned placeholder value of `"sha256:0000…0000"` (64 zeros); the audit row faithfully records whatever value is submitted.
- `pda` — compact JWS of the signed `canonical-decision.json` per §6.1.1 row 4. Required when the §10.3 resolver reaches `decision = Prompt`; omitted (or null) otherwise. The Runner verifies the PDA against `security.trustAnchors` before accepting the decision.

**Response (201 Created).** JSON body conforming to `schemas/permission-decision-response.schema.json`:

```json
{
  "decision": "AutoAllow | Prompt | Deny | CapabilityDenied | ConfigPrecedenceViolation",
  "resolved_capability": "ReadOnly | WorkspaceWrite | DangerFullAccess",
  "resolved_control": "AutoAllow | Prompt | Deny",
  "reason": "<closed enum per §10.3.1>",
  "audit_record_id": "aud_<id>",
  "audit_this_hash": "<64-char hex>",
  "handler_accepted": true,
  "runner_version": "1.0",
  "recorded_at": "<RFC 3339>",
  "idempotency_key": "<UUIDv4 — surface for §12.2 idempotency replay>",
  "replayed": false
}
```

When the caller supplies an `Idempotency-Key` request header matching a prior `(session_id, idempotency_key)` pair, the Runner MUST:
- Return the cached decision body with the same `audit_record_id` and `audit_this_hash`
- Set `replayed: true`
- NOT append a second audit row (chain does not advance)

This surfaces the §12.2 idempotency rule for permission decisions as an observable API property rather than a silent implementation detail.

- `audit_record_id` / `audit_this_hash` — the identifier and chain hash of the audit row written for this decision. Callers reconcile by fetching `/audit/records` and matching.
- `handler_accepted` — true when the PDA (if required) verified successfully against `security.trustAnchors`, or when the decision was AutoAllow/Deny/CapabilityDenied (handler not required). False only when a required PDA failed verification; in that case `decision` is coerced to `Deny` with `reason="pda-verify-failed"` AND an audit row is still written (the attempted decision is itself an auditable event).

**Other responses:**
- `400 Bad Request` — client-side request envelope is wire-level malformed. Authoritative reason codes for this endpoint:
  - `reason="malformed-json"` — the request body isn't parseable JSON.
  - `reason="missing-required-field"` — JSON parses but is missing `tool`, `session_id`, or `args_digest`.
  - `reason="unknown-tool"` — `tool` is not in the Tool Registry (§11); also returnable as 404 — implementations MAY choose either but MUST be consistent.
  - `reason="pda-malformed"` — submitted `pda` field is not a parseable compact JWS (three base64url segments separated by dots). Structural/wire failure distinct from signature-invalid (which returns 201+audited per the handler_accepted path) and from pda-decision-mismatch (403; PDA parses and verifies but claims disagree with resolver). Moved here from the L-22 403 enum because semantically the client sent invalid wire bytes — an authorization check never had a parseable subject to evaluate.
- `401 Unauthorized` — missing or invalid bearer
- `403 Forbidden` — authoritative closed-set reasons for this endpoint:
  - `reason="insufficient-scope"` — bearer lacks the required `permissions:decide:<session_id>` scope. Most common failure mode for callers that authenticated via POST /sessions without `request_decide_scope: true`.
  - `reason="session-bearer-mismatch"` — bearer is valid but scoped for a different session_id than the one in the request body.
  - `reason="pda-decision-mismatch"` — PDA's `canonical-decision.decision` disagrees with what the §10.3 resolver computed for the same (tool, session_id). No audit record is written — the attempt is rejected before dispatch.
  - (`pda-malformed` MOVED to the 400 Bad Request enum above — a wire-malformed JWS is a client-side request-envelope issue, not an auth-scope denial. See the 400 block.)
  Error-code name `ConfigPrecedenceViolation` is RESERVED for §10.3 step 3 (toolRequirements loosens default) and MUST NOT be returned by this endpoint for auth-scope or PDA failures.
- `404 Not Found` — `tool` unknown or `session_id` unknown
- `429 Too Many Requests` — rate-limit exceeded
- `503 Service Unavailable` with body `{"error":"not-ready","reason":"<§5.4 enum>"}` — `/ready` is 503 (Runner hasn't completed boot)
- `503 Service Unavailable` with body `{"error":"pda-verify-unavailable","reason":"pda-verify-unavailable"}` — the endpoint needs to verify a PDA (resolver output for this `(tool, session)` pair is `Prompt`) but the Runner has no PDA verification configuration loaded (no `security.trustAnchors` wired to a verify key resolver, OR the verify key resolver refuses to answer). This is a **deployment-misconfiguration** signal, not a client error. Operators MUST correct the deployment (typically: configure `resolvePdaVerifyKey` or load `security.trustAnchors` content at boot) before the endpoint can serve Prompt-resolving tools. Conformance-mode Runners MUST be started with PDA verification configured; this 503 branch exists so degenerate deployments fail visibly rather than silently accepting unsigned decisions. `pda-verify-unavailable` extends the L-22 authoritative reason enum. Returning `400` for this case is non-conformant — this is a 5xx-class server-state issue, not a malformed request.

**Side-effect property (normative MUST).** A successful `POST /permissions/decisions` call MUST:
1. Append exactly one record to `/audit/permissions.log` conforming to §10.5's field set and hash-chain rule. `this_hash` equals the response body's `audit_this_hash`.
2. Ship that record to the external WORM sink per §10.5 rules 1–5 (or, in M1 scope where external sink is deferred, write to a local append-only file substituting for the external sink).
3. Emit a `PermissionDecision` StreamEvent on the session's `/stream/v1/:session_id` channel (§14 — emitted once §14 is shipped; until then, audit write alone suffices for conformance).

**Forgery resistance (normative MUST).** The endpoint MUST NOT accept a decision that contradicts what the §10.3 resolver would compute. Concretely:
- The submitted `tool` + `session.activeMode` + Tool Registry entry drive the deterministic `decision` per §10.3 steps 1–4. The endpoint **ignores** any client-supplied decision override (the request body does not even carry one) and computes the decision internally.
- When the resolver output is `Prompt`, a valid `pda` is required. A signed PDA whose `canonical-decision.decision` field disagrees with the §10.3 output (e.g., PDA says AutoAllow but resolver computed Prompt) MUST be rejected with `403 reason="pda-decision-mismatch"` and audited as a suspect attempt.

**Conformance linkage.**
- `SV-PERM-20` (new) — endpoint schema conformance, scope enforcement, 201 writes audit record, 403 on missing decide scope.
- `SV-PERM-21` (new) — PDA verify happy path (valid PDA → decision recorded).
- `SV-PERM-22` (new) — PDA verify negative path (invalid PDA → 403/audit-record with pda-verify-failed).
- `HR-14` — validator drives N AutoAllow decisions (no PDA needed for ReadOnly Tool Registry tools), reads accumulated chain via `/audit/records`, verifies integrity. Tamper test runs validator-side on the local copy.
- `SV-AUDIT-RECORDS-01` / `SV-AUDIT-RECORDS-02` — same as HR-14 for accumulation and chain-integrity.

**Relationship to §10.3.1.** Both endpoints exist and serve different purposes. Operators and validators use `/permissions/resolve` (GET) for "what would the resolver decide" — no side effects. They use `/permissions/decisions` (POST) for "actually decide, with audit" — full side effects. A caller wanting both transparency and a recorded decision issues GET first (predict), then POST (record); the two responses MUST carry identical `decision` values for the same `(tool, session_id)` pair (forgery resistance above).

### 10.4 Autonomous Handler and High-Risk Actions

- **High-risk action** = any self-edit (§9), any tool with `risk_class = Destructive`, or a self-improvement iteration with `|training_score - baseline_training_score| > 0.10`. Additionally, tools with `risk_class ∈ {Mutating, DangerFullAccess}` trigger escalation when the signer's handler role is `Autonomous` (per §10.4.1).
- Autonomous handlers MUST NOT auto-approve high-risk actions. An Autonomous handler facing a high-risk Prompt MUST escalate to an Interactive or Coordinator handler. If none is reachable within 30 seconds the action MUST be denied.
- Human-in-the-Loop (§19) is satisfied only when an `Interactive` handler signs the prompt decision. Coordinator and Autonomous signatures do NOT satisfy HITL for high-risk decisions; a Coordinator/Autonomous-signed Prompt on a HITL-gated action MUST reject with `403 {error:"PermissionDenied", reason:"hitl-required", detail:"autonomous-insufficient"}` (or `detail:"coordinator-insufficient"`).

#### 10.4.1 Escalation State-Machine (Normative — L-49)

When the resolved control for a decision is `Prompt` AND the signing handler's role is `Autonomous` AND the tool's `risk_class ∈ {Mutating, DangerFullAccess}`, the Runner MUST:

1. Block the decision (do NOT return to caller immediately).
2. Emit a `PermissionPrompt` StreamEvent with `handler: "Interactive"` per §14.1.1 (the prompt is now awaiting an Interactive responder, regardless of the originally-submitted signature's role).
3. Await an Interactive responder via the production-configured surface (UI Gateway interactive-prompt socket per UI §11, operator console, or equivalent).
4. On timeout (≥ 30 seconds per §10.4, operator-configurable downward but NOT upward in conformance), emit `403 {error:"PermissionDenied", reason:"escalation-timeout"}` + append an audit record with `handler: "Autonomous"` (the original signer), `decision: "Deny"`, `reason: "escalation-timeout"`.
5. On responder approval (Interactive-signed PDA arriving before timeout), process the decision normally with the Interactive handler as the audit-row `handler`.
6. On responder denial, emit `403 {error:"PermissionDenied", reason:"hitl-denied"}` + audit with `handler: "Interactive"`, `decision: "Deny"`, `reason: "hitl-denied"`.

The escalation state-machine applies only when resolved_control is `Prompt`; `AutoAllow`/`Deny` short-circuit before reaching this path. `Coordinator`-signed Prompt on a HITL-gated action bypasses escalation and directly rejects with `hitl-required` + `coordinator-insufficient` per §10.4 (escalation-to-Interactive is only from Autonomous; Coordinator is not a valid escalation waypoint for HITL).

#### 10.4.2 Escalation Test Hooks (Normative — L-49, testability)

**Rationale.** The 30-second production timeout is infeasible for conformance runs; real Interactive-responder surfaces (UI Gateway, operator console) are not part of the Runner. Two env hooks make `SV-PERM-03` / `SV-PERM-04` deterministic, following the established §5.3.3 / §8.4.1 / §10.6.2 loopback-guarded pattern.

**`RUNNER_HANDLER_ESCALATION_TIMEOUT_MS=<milliseconds>`** — overrides the §10.4 30-second timeout. Default `30000` (production). Validators set a small value (e.g., 500ms) for sub-second test cadence. Production guard: MUST refuse startup when set on non-loopback interface.

**`SOA_HANDLER_ESCALATION_RESPONDER=<file-path>`** — when set, the Runner watches the named file for JSON responder injections. When a pending escalation exists, the Runner reads the file and, if it contains a JSON object matching the shape below, applies the response:

```json
{ "kid": "<responder-kid>", "response": "approve" | "deny" | "silence" }
```

- `response: "approve"` — treat as an Interactive-signed approval. The `kid` MUST be a handler enrolled with role `Interactive` (per §10.6.3 enrollment or Card-pinned trust anchor). A `kid` bound to `Autonomous` or `Coordinator` role MUST be rejected per §10.4 with `hitl-required` — an Autonomous/Coordinator responder cannot forge Interactive satisfaction.
- `response: "deny"` — treat as Interactive denial; emit §10.4.1 step 6.
- `response: "silence"` — ignore the file; let the timeout fire per §10.4.1 step 4. (Same as not writing to the file at all; included for explicit test choreography.)

After the Runner consumes the file, it MUST truncate (so a subsequent write triggers another responder cycle). Same truncate-after-ingest pattern as §11.3.1 dynamic-tool registration.

Production guard: MUST refuse startup when set on non-loopback interface. The env var is test-only; production deployments deliver Interactive responses via the Gateway's operator console.

**Conformance linkage.**
- `SV-PERM-03` (autonomous escalation timeout): `RUNNER_HANDLER_ESCALATION_TIMEOUT_MS=500` + no file write for 600ms → `403 {error:"PermissionDenied", reason:"escalation-timeout"}` + audit row with `handler:"Autonomous", decision:"Deny", reason:"escalation-timeout"`.
- `SV-PERM-04` (Coordinator/Autonomous insufficient for HITL): submit high-risk Prompt signed by an Autonomous handler. Write `{"response":"approve", "kid":"<Autonomous-kid>"}` to the responder file. Runner MUST reject with `403 {error:"PermissionDenied", reason:"hitl-required", detail:"autonomous-insufficient"}` — Autonomous cannot satisfy HITL even via the responder surface.

### 10.5 Audit Trail

- Every permission decision, every self-edit, and every handoff MUST be appended to `/audit/permissions.log`.
- Each record is a JSON line with the following REQUIRED fields: `id`, `timestamp`, `session_id`, `subject_id`, `tool`, `args_digest`, `capability`, `control`, `handler`, `decision`, `reason`, `signer_key_id`, `prev_hash`, `this_hash`. The `subject_id` field carries the stable identifier of the data subject (if any) whose personal data is implicated by the decision — drawn from the UI caller's `user_sub` claim when the operation is user-initiated, from the tool's declared subject binding (§10.7 `data_class` tagging) when the operation is agent-initiated, or the literal string `"none"` when no personal data is touched. The `subject_id` field is the authoritative linkage between audit and the §10.7.1 `privacy.export_subject` / `privacy.delete_subject` tools; absence or malformation fails `SV-PERM-05`.
- `this_hash = SHA-256(prev_hash || canonical_json_of_record_without_this_hash)` where `canonical_json_of_record_without_this_hash` MUST include `subject_id` (it is part of the signed/hashed body, not metadata). First record: `prev_hash = "GENESIS"`.
- The Runner MUST additionally ship every record to an **external WORM sink** satisfying:
  1. **Append-only**: once written, records MUST NOT be mutable or deletable by credentials available to the Runner.
  2. **Tamper-evident**: the sink MUST preserve the record's `this_hash` chain; independent verification MUST be possible without Runner cooperation.
  3. **External timestamp**: each record MUST carry a sink-issued timestamp, accurate to within 1 second of UTC.
  4. **Retention**: minimum 365 days for `activeMode=DangerFullAccess` sessions; minimum 90 days otherwise.
  5. **Audit-reader access**: a verifier with read-only credentials MUST be able to list and read records without write authority.

  Conforming backends (non-exhaustive): AWS S3 with Object Lock (compliance mode), Azure Blob immutable storage, GCS bucket with retention policy, on-premises append-only log server with signed receipts, or a filesystem with per-record immutable attribute and privilege-separated writer. The sink endpoint is declared at `security.auditSink`.

#### 10.5.1 Runtime Audit-Sink Failure (Normative)

**Rationale.** The naïve choices at sink failure are (a) fail-closed immediately — halt everything the moment a single audit write fails — or (b) fail-open — keep serving and silently drop audit records. Both are wrong. (a) turns a transient network blip into a full outage and incentivizes operators to disable audit at the first false alarm. (b) means a motivated adversary with momentary sink access can silence logging during their attack window with no observable effect. The three-state model splits the difference by bounding *exposure* rather than *availability*: the Runner tolerates short blips for ReadOnly traffic indefinitely (those cannot mutate state worth forging), while refusing Mutating/Destructive operations whenever audit cannot prove it will later ship the record. The 60 s / 1000-record thresholds are deliberately tight — long enough to weather routine sink-side restarts and route flaps, short enough that an attacker cannot accumulate a significant horizon of un-audited mutating activity. The `AuditSinkDegraded` → `AuditSinkUnreachable` → `AuditSinkRecovered` events ensure operators see the state transition even when the sink itself is the blind spot.

Readiness rules at §5.4 prevent a Runner from accepting new traffic when the sink is unreachable at startup. This subsection defines behavior when the sink becomes unreachable **during an active session** after readiness was previously green. The Runner MUST operate a three-state degradation model:

| State | Trigger | Behavior |
|---|---|---|
| `healthy` | Sink ship-acknowledged within 1 s for the most recent record | Normal operation; no events emitted |
| `degraded-buffering` | Sink ship failed or timed out for ≤ 60 s OR local buffer < 1000 records since last successful ship | Continue operation; buffer audit records in an fsync-backed local queue (`/audit/pending/`); emit a single `AuditSinkDegraded` StreamEvent per state-transition with `{first_failed_at, buffered_records}`; retry with exponential backoff (1s → 30s ceiling); `/ready` remains 200 in this state |
| `unreachable-halt` | Sink ship has failed continuously > 60 s OR local buffer exceeds 1000 records | (1) REFUSE any new tool invocation whose `risk_class ∈ {Mutating, Destructive}` with `PermissionDenied` (reason `audit-sink-unreachable`); (2) permit `ReadOnly` tools to continue; (3) emit `AuditSinkUnreachable` StreamEvent with `{unreachable_since, buffered_records}`; (4) `/ready` flips to 503 (reason `audit-sink-unreachable`) so orchestrators drain the Runner; (5) on sink recovery, flush the local buffer in order, verify the external sink's `this_hash` chain resumes correctly, emit `AuditSinkRecovered`, and return to `healthy` |

Local buffer MUST be on the same file-system as `/audit/permissions.log` and MUST use atomic writes per §12.3 so a crash during buffering does not lose records. Buffered records retain their original `timestamp`; the sink-issued timestamp (§10.5 rule 3) is applied on ship, not at buffer time.

New error codes introduced by this subsection: `AuditSinkDegraded`, `AuditSinkUnreachable`, `AuditSinkRecovered` (all under the `Audit` category in §24). Covered by `SV-PERM-19`.

#### 10.5.2 Audit Tail Observability (Normative)

**Rationale.** §10.5 defines the audit hash chain as tamper-evident — every record links to the previous record's hash. For that property to be independently verifiable, the chain's terminal state MUST be externally observable. `SV-PERM-01`'s not-a-side-effect property (§10.3.1) depends on it: the validator reads the tail hash before a query batch, runs the batch, reads the tail hash again, and asserts equality. Without a defined observation surface, tamper-evidence is a Runner-self-attested property — useless for independent verification. This section defines that surface as a first-class endpoint, not a test hook. Operators also legitimately need it for audit-integrity dashboards, incident response ("did the hash chain advance during window X?"), and handoff to WORM-sink reconciliation tooling.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /audit/tail
```

- **Transport:** HTTPS / TLS 1.3 on the public listener; loopback plain-HTTP permitted on Unix socket / named pipe co-located listeners (same rule as §10.3.1).
- **Authentication:** the request MUST present a bearer token scoped for `audit:read` (issued via §12.6 session bootstrap or an operator-tool bearer issuance surface outside this spec). `401` unauthenticated, `403` without `audit:read` scope.
- **Rate limiting:** at most 120 requests/minute per bearer. `429 Too Many Requests` with `Retry-After` when exceeded.

**Response (200 OK).** JSON body conforming to `schemas/audit-tail-response.schema.json`, containing:
- `this_hash`: the `this_hash` field of the most recent record in `/audit/permissions.log`. When the log is empty (no records written since genesis), the value is the literal string `"GENESIS"`.
- `record_count`: integer count of records in the hash chain from GENESIS to the tail inclusive.
- `last_record_timestamp`: RFC 3339 timestamp of the most recent record. When the log is empty, the field is omitted.
- `runner_version`: matches the value reported by other observability endpoints, for drift attribution.
- `generated_at`: RFC 3339 timestamp of when the Runner computed this response. Under an injected test clock (§10.6.1 testability note) this reports the injected clock value.

**Other responses:**
- `503 Service Unavailable` — `/ready` is 503. Body conforms to the §5.4 readiness-failure shape. The audit chain cannot be trusted before the WAL replay in §10.5.1 completes at boot, so `/audit/tail` returning 200 implies WAL replay is complete.
- `5xx` for infrastructure failure reading the log — MUST NOT return a stale cached `this_hash` in lieu of a real read. A Runner that cannot read its own audit tail SHOULD transition `/ready` to 503 and recover.

**Not-a-side-effect property (MUST).** Reading `/audit/tail` MUST NOT append a record to the audit log (no "tail was read by <bearer>" meta-record), MUST NOT emit a StreamEvent, MUST NOT mutate any Runner-internal counter. Observability of the audit chain is itself ambient — if a validator could trigger an audit mutation by reading, `SV-PERM-01`'s not-a-side-effect assertion would fail false-negative even on a perfectly conforming Runner. Implementations that wish to record "tail-hash was read" for their own operational monitoring MUST do so in a **separate** observability channel (logging, metrics) and MUST NOT touch `/audit/permissions.log`.

**Conformance linkage.** `SV-AUDIT-TAIL-01` (new) asserts schema conformance of the response and the GENESIS fallback when the log is empty. `SV-PERM-01` consumes this endpoint for its not-a-side-effect assertion per §10.3.1.

#### 10.5.3 Audit Records Observability (Normative)

**Rationale.** §10.5 defines the audit log as a hash-chained JSONL stream; §10.5.2 exposes the terminal state via `/audit/tail`. The terminal hash alone is insufficient for **independent chain verification**: a validator that wants to prove the chain is self-consistent — every record's `prev_hash` equals the prior record's `this_hash` — needs to read the records themselves, in order, from GENESIS to the tail. `HR-14` per §15.5 asserts "any `prev_hash` tamper fails chain verification", which cannot be tested without access to the records. Without this endpoint, `HR-14` is untestable by an external validator; the tamper-evidence property becomes Runner-self-attested and therefore worthless as conformance evidence.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /audit/records?after=<record_id>&limit=<n>
```

- **Transport:** HTTPS / TLS 1.3 on the public listener; loopback plain-HTTP permitted on Unix socket / named pipe.
- **Authentication:** the request MUST present a bearer token scoped for `audit:read` (same scope class as `/audit/tail`). `401` unauthenticated, `403` without scope.
- **Rate limiting:** at most 60 requests/minute per bearer. `429 Too Many Requests` with `Retry-After` when exceeded. Note the rate limit is lower than `/audit/tail`'s 120 rpm because this endpoint returns larger payloads.

**Query parameters.**
- `after` (optional) — the `id` of a record after which to start reading. When omitted, the response starts at the GENESIS record. When provided, the response begins with the record whose `prev_hash` equals the `this_hash` of the record with id `after`. If no record with id `after` exists, returns `404`.
- `limit` (optional, default 100, max 1000) — the maximum number of records to return in this response. Responses larger than this MUST be paginated.

**Response (200 OK).** JSON body conforming to `schemas/audit-records-response.schema.json`:

```json
{
  "records": [
    {
      "id": "aud_...",
      "timestamp": "2026-04-20T12:00:00Z",
      "session_id": "ses_...",
      "subject_id": "user_abc123",
      "tool": "fs__write_file",
      "args_digest": "sha256:...",
      "capability": "WorkspaceWrite",
      "control": "Prompt",
      "handler": "Interactive",
      "decision": "AutoAllow",
      "reason": "prompt-signed-approval",
      "signer_key_id": "kid-...",
      "prev_hash": "sha256:...",
      "this_hash": "sha256:..."
    }
  ],
  "next_after": "aud_last_in_page",
  "has_more": true,
  "runner_version": "1.0",
  "generated_at": "2026-04-20T12:00:00Z"
}
```

- `records[]` — array of zero or more audit records in **chain order** (earliest to latest). Each record's fields are exactly as §10.5 defines them (no redaction, no transformation — raw chain bytes). Validators reconstruct the chain by paginating through `next_after` until `has_more` is false.
- `next_after` — the `id` of the last record in this page. When `has_more` is true, the next query is `?after=<next_after>&limit=<n>`.
- `has_more` — false when the response's last record's `id` is the current audit-log tail.

**Other responses:**
- `400 Bad Request` — malformed query parameters
- `401 / 403 / 429` — per the auth + rate-limit rules
- `404 Not Found` — `after` references an id that doesn't exist
- `503 Service Unavailable` — `/ready` is 503

**Not-a-side-effect property (MUST).** Reading `/audit/records` MUST NOT:
1. Append a meta-record to the chain (the chain is forward-only; reads are outside it).
2. Emit a StreamEvent.
3. Advance any Runner-internal counter visible to other endpoints.
4. Trigger the §10.5.1 three-state degradation state machine even if a remote WORM sink is slow to respond (the endpoint reads from the local hash-chained log; WORM-sink replication is orthogonal).

**Privacy note.** Audit records MAY contain `subject_id` values that are GDPR/CCPA-covered personal data. Operators MUST ensure that only authorized principals are granted `audit:read` scope. The spec does not dictate HOW bearers obtain `audit:read` scope — deployment-specific IdP logic. The `audit:read` scope is the ONLY gate; no additional field-level redaction is required from the Runner.

**Conformance linkage.**
- `SV-AUDIT-RECORDS-01` (new) — schema conformance of the response; pagination semantics (after → next_after → has_more transitions correctly).
- `SV-AUDIT-RECORDS-02` (new) — chain integrity: validator reads all records, verifies `records[0].prev_hash == "GENESIS"` and `∀ i > 0, records[i].prev_hash == records[i-1].this_hash`.
- `HR-14` (existing, §15.5) — tamper detection: validator reconstructs the full chain via this endpoint, **mutates** one `prev_hash` in its local copy, re-runs chain verification, asserts **failure**. Because mutation happens validator-side, this doesn't require a "tampered" endpoint on the Runner — the Runner only needs to serve the real chain faithfully.

#### 10.5.4 Admin Audit Record Subtypes (Normative — L-41)

**Rationale.** §10.5–§10.5.3 describe the canonical permission-decision audit row. Three additional record types are emitted by non-permission subsystems but share the same hash-chain for integrity:

- **`SubjectSuppression`** — emitted by `POST /privacy/delete_subject` per §10.7 step 3 (WORM-compatible redaction). No permission decision was evaluated; no tool was invoked; these fields are absent.
- **`SubjectExport`** — emitted by `POST /privacy/export_subject` per §10.7 step 4 (subject-access export compliance record). Same shape as SubjectSuppression.
- **`ResidencyCheck`** — emitted by `POST /permissions/decisions` per §10.7 step 5 when `security.data_residency` is declared on the Agent Card; records the layered-defence verdict (tool-declared signal + network cross-check). Even when a companion decision row is also written for the same invocation, the ResidencyCheck row is a separate chain entry preserving the verdict independently for audit.

**Required fields for admin subtypes:** `id, timestamp, session_id, subject_id, decision, reason, prev_hash, this_hash` (the decision-only fields — `tool, args_digest, capability, control, handler, signer_key_id` — are absent because no permission decision was evaluated).

**Hash-chain participation:** admin rows MUST participate in the same chain as decision rows. `prev_hash` equals the prior record's `this_hash` regardless of subtype. Chain verification per `HR-14` walks both subtypes uniformly.

**Schema discriminator:** `schemas/audit-records-response.schema.json` uses `oneOf` with `decision` as the discriminator. Five decision-values require the full field set; three admin-values require the reduced set. `additionalProperties: false` applies to both; unknown record fields are invalid.

**Conformance linkage.** `SV-AUDIT-RECORDS-01/02` validate BOTH subtypes roundtrip through `/audit/records`. `SV-PRIV-03` asserts `SubjectSuppression` + `SubjectExport` emission on the privacy endpoints. `SV-PRIV-05` asserts `ResidencyCheck` emission on residency-gated decisions.

#### 10.5.5 WORM Sink Modeling Test Hook (Normative — L-48, testability)

**Rationale.** Production deployments back the audit chain with operator-chosen WORM storage (S3 Object Lock, Azure Immutable Blob, on-prem WORM appliance). Conformance tests cannot assume access to real WORM infrastructure. This section defines a test-only env hook that models WORM semantics in-memory so `SV-PERM-06` / `SV-PERM-07` deterministically exercise append-only + external-timestamp properties.

**Env var `RUNNER_AUDIT_SINK_MODE=worm-in-memory`** — when set, the Runner backs the audit chain with an in-memory WORM model:

- Accepts append via the existing audit-append path.
- Rejects mutation (`PUT /audit/records/<id>`) and deletion (`DELETE /audit/records/<id>`) with `405 Method Not Allowed`, body `{error:"ImmutableAuditSink", reason:"worm-sink-forbids-mutation"}`, and emits a `/logs/system/recent` record (category `Audit`, level `error`, code `ImmutableAuditSink`).
- Stamps each appended record with `sink_timestamp` (RFC 3339) set by the WORM model, distinct from Runner-internal `timestamp`. Under normal operation `|sink_timestamp − timestamp| ≤ 1s`.

Schema: `audit-records-response.schema.json` gains OPTIONAL `sink_timestamp` field. Hash-chain participation matches L-40 `billing_tag` (canonical-JCS-serialized when present; excluded when absent).

**Production guard:** same pattern as §5.3.3 / §8.4.1 / §11.2.1 — MUST refuse startup with this env var set on a non-loopback interface.

**Conformance linkage.** `SV-PERM-06` asserts `PUT` / `DELETE /audit/records/<id>` return `405 ImmutableAuditSink`. `SV-PERM-07` asserts `|sink_timestamp − timestamp| ≤ 1s` on a driven decision.

#### 10.5.6 Retention Class Tagging (Normative — L-48)

**Rationale.** §10.7 defines retention ceilings per record category but does not normatively attach a retention class to individual audit records. `SV-PERM-16` requires per-record introspection so deployments with heterogeneous session classes verify correct propagation.

**Classes:**
- `dfa-365d` — sessions whose granted `activeMode` is `DangerFullAccess`. Retention ≥ 365 days.
- `standard-90d` — all other sessions. Retention ≥ 90 days.

**Derivation:** at audit-record append, the Runner reads the session's granted `activeMode` (from session-state after §12.6 bootstrap tightening) and stamps the record. Immutable post-append per WORM semantics.

Schema: `audit-records-response.schema.json` gains OPTIONAL `retention_class` enum field `{dfa-365d, standard-90d}`. When present, retention-sweep schedulers honor the per-record class.

**Conformance linkage.** `SV-PERM-16` asserts records from a DFA-granted session carry `retention_class:"dfa-365d"` and records from a ReadOnly-granted session carry `retention_class:"standard-90d"`.

#### 10.5.7 Audit-Reader Token Endpoint (Normative — L-48)

**Rationale.** Operators requiring audit-read access without any write authority MAY issue scoped reader bearers. `SV-PERM-17` asserts a reader bearer reads `/audit/*` but rejects any write.

**Endpoint `POST /audit/reader-tokens`** — operator-bearer scope. Mints a short-lived bearer with ONLY `audit:read:*` scope.

**Request body:** `{"ttl_seconds": 900}` — OPTIONAL, range `60..3600`, default `900`. Out-of-range → `400 BadRequest`.

**Response (`201 Created`):**

```json
{
  "reader_bearer": "<opaque-token>",
  "expires_at": "<RFC 3339>",
  "scope": "audit:read:*"
}
```

**Reader bearer semantics:**
- `GET /audit/tail`, `GET /audit/records` → `200` if other preconditions met.
- Any `POST` / `PUT` / `DELETE` on any endpoint → `403 Forbidden`, body `{error:"bearer-lacks-audit-write-scope"}`.
- `admin:read` or `sessions:read:*` endpoints → `403` (reader scope is audit-only).

**Conformance linkage.** `SV-PERM-17` asserts reader bearer (a) succeeds on audit reads, (b) rejects any non-audit write with `bearer-lacks-audit-write-scope`.

### 10.6 Handler Key Management

Every prompt decision of type `Prompt` MUST be signed by the handler that produced it.

- **Key type**: Ed25519 (RECOMMENDED) or ECDSA P-256. RSA permitted for legacy HSMs with key size ≥ 3072 bits.
- **Key identity**: each handler key MUST have a stable `kid` carried in the JWS header of every signed decision. `kid` MUST be unique across all handlers registered for the project.
- **Issuance**: handler keys are issued by a trust anchor listed in `security.trustAnchors`. Self-signed handler keys are NOT permitted.
- **Rotation**: handler keys MUST have a maximum lifetime of 90 days. Rotation MUST overlap — new key published ≥ 24 hours before old key retirement; both accepted during overlap.
- **Revocation**: `security.trustAnchors` publishes a revocation list at `<trust-anchor-uri>/crl.json`. The Runner MUST refresh the CRL at least once per hour and MUST reject any decision signed by a revoked `kid` with `HandlerKeyRevoked`.
- **Compromise response**: on suspected compromise, the issuer MUST revoke the `kid` within 60 minutes. Audit records signed by the compromised `kid` in the 24 hours preceding revocation MUST be flagged `SuspectDecision`; operator review is required.
- **End-to-end SLA**: the 60-minute issuer obligation and the 60-minute Runner refresh interval compose to an end-to-end ≤ 120-minute SLA. Deployments requiring tighter effective revocation MUST shorten the Runner refresh interval and MAY run CRL refresh on event-push from the trust anchor.
- **Storage**: handler private keys MUST NOT be stored on disk unencrypted. HSM or OS keystore (Windows DPAPI, macOS Keychain, Linux kernel keyring) is REQUIRED.

#### 10.6.1 CRL Artifact Format (Normative)

The CRL served at `<trust-anchor-uri>/crl.json` MUST validate against the schema below.

```json
{
  "$id": "https://soa-harness.org/schemas/v1.0/crl.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["issuer","issued_at","not_after","revoked_kids"],
  "additionalProperties": false,
  "properties": {
    "issuer":       { "type": "string", "description": "Matches security.trustAnchors[].issuer" },
    "issued_at":    { "type": "string", "format": "date-time" },
    "not_after":    { "type": "string", "format": "date-time", "description": "CRL validity horizon; Runner MUST treat as stale past this moment" },
    "revoked_kids": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "object",
        "required": ["kid","revoked_at","reason"],
        "additionalProperties": false,
        "properties": {
          "kid":        { "type": "string" },
          "revoked_at": { "type": "string", "format": "date-time" },
          "reason":     { "type": "string", "enum": ["compromise","rotation","administrative","unspecified"] }
        }
      }
    }
  }
}
```

**Failure-mode MUSTs:** Runner MUST fetch the CRL every ≤ 60 min. On fetch failure, Runner MAY serve the stale CRL until `not_after`; past `not_after`, Runner MUST reject all new high-risk decisions with `HandlerKeyRevoked` (reason `crl-stale`) until refresh succeeds. Covered by `SV-PERM-18`.

**Testability — clock injectability (SHOULD):** implementations SHOULD expose an injectable time source to the CRL verification path (and to all other time-dependent checks in §5.3, §6.1, and §10.6) so that conformance test vectors can deterministically exercise the three freshness states (`fresh` | `stale-but-valid` | `expired`) regardless of wall-clock time at test execution. `soa-validate` consumes `test-vectors/crl/` under a reference clock `T_ref = 2026-04-20T12:00:00Z`; a Runner that reads only `system wall-clock now()` at verify time cannot be tested against the `stale-but-valid` vector past the short window where wall-clock happens to land 60–120 minutes after the fixture's `issued_at`. Production Runners MAY fall back to wall-clock; conformance-tested Runners MUST accept a reference clock from the validator's test harness through an implementation-defined hook (environment variable, config flag, or test-only HTTP endpoint). This is a testability requirement, not a trust-boundary weakening — the injectable clock MUST NOT be reachable by untrusted principals in production deployments.

#### 10.6.2 Handler Key Lifecycle Test Hooks (Normative — L-48, testability)

**Rationale.** §10.6 defines handler-key rotation cadence (90-day max), compromise response (60-minute revocation + 24h retroactive flagging), and a 24h rotation overlap during which both old + new kids verify. Calendar time makes these untestable in conformance runs. Three env hooks inject time + kid state deterministically. All three follow the existing test-only env-hook pattern per §5.3.3 / §8.4.1 / §11.2.1 — MUST refuse startup with any set on a non-loopback interface.

**`SOA_HANDLER_ENROLLED_AT=<RFC 3339>`** — when set, the Runner treats the default handler key's enrollment timestamp as this value (overriding any on-disk manifest). Paired with `RUNNER_TEST_CLOCK`, validators compute `age_days = clock − enrolled_at` and exercise the 90-day rotation boundary. `SV-PERM-08` uses `RUNNER_TEST_CLOCK=T_ref` + `SOA_HANDLER_ENROLLED_AT=(T_ref − 91d)` → high-risk decision signed by aged handler returns `403 {error:"HandlerKeyExpired", reason:"key-age-exceeded", age_days:91}`.

**`SOA_HANDLER_KEYPAIR_OVERLAP_DIR=<directory-path>`** — when set, the Runner loads multiple handler keys from the pinned directory, each with per-key manifest `{kid, issued_at, rotation_overlap_end}`. During the overlap window, both kids verify; outside it, only the current kid verifies. `SV-PERM-10` uses this with `test-vectors/handler-keypair-overlap/` and `RUNNER_TEST_CLOCK` inside the overlap window.

**`RUNNER_HANDLER_CRL_POLL_TICK_MS=<milliseconds>`** — CRL refresh interval for handler-kid revocation detection. Default `3600000` (60 minutes per §10.6). Validators set a small value (e.g., 100ms) so `SV-PERM-09` observes revocation propagation within a test window. Uses the same revocation-file watcher as §5.3.3 `SOA_BOOTSTRAP_REVOCATION_FILE`; the watched file accepts either `{"publisher_kid":...}` (bootstrap per AQ) OR `{"handler_kid":...}` (handler-kid per L-48).

**CRL refresh observability.** On each successful refresh (whether triggered by the test hook or the production 60-minute ceiling), the Runner MUST emit a `/logs/system/recent` record with category `Config`, level `info`, code `crl-refresh-complete`, and `data.last_crl_refresh_at: <RFC 3339>`. `SV-PERM-14` polls this and asserts the interval between records ≤ `RUNNER_HANDLER_CRL_POLL_TICK_MS` (or the 60-minute ceiling in production).

**Conformance linkage:**
- `SV-PERM-08` (90d rotation boundary) — `SOA_HANDLER_ENROLLED_AT` + `RUNNER_TEST_CLOCK`.
- `SV-PERM-09` (handler-kid revocation within 1 poll tick) — `RUNNER_HANDLER_CRL_POLL_TICK_MS` + revocation-file watcher with `handler_kid` entry.
- `SV-PERM-10` (24h rotation overlap) — `SOA_HANDLER_KEYPAIR_OVERLAP_DIR`.
- `SV-PERM-14` (CRL refresh interval observability) — `/logs/system/recent` `crl-refresh-complete` records.
- `SV-PERM-15` (retroactive SuspectDecision flagging) — see §10.6.5.

#### 10.6.3 Handler Enrollment Endpoint (Normative — L-48)

**Rationale.** §10.6 requires handler keys to be issued by a trust anchor with unique `kid`s. Deployments that enroll handlers at runtime (vs. bootstrapping a fixed set via Card) need a normative enrollment endpoint. `SV-PERM-12` asserts kid-uniqueness + algorithm rejection at enrollment time.

**Endpoint `POST /handlers/enroll`** — operator-bearer scope.

**Request body:**
```json
{
  "kid": "<unique identifier>",
  "spki": "<base64url-encoded DER SPKI>",
  "algo": "EdDSA | ES256 | RS3072 | RS4096",
  "issued_at": "<RFC 3339>",
  "role": "Interactive | Coordinator | Autonomous"
}
```

`role` REQUIRED — binds this kid to a handler role per §10.4 taxonomy. The role governs §10.4.1 escalation: a `Prompt` decision signed by an `Autonomous`-role kid on a `risk_class ∈ {Mutating, DangerFullAccess}` tool triggers the escalation state-machine. `role` values unknown to the §10.4 enum reject with `400 {error:"RoleRejected", detail:"role not in {Interactive,Coordinator,Autonomous}"}`.

**Responses:**
- `201 Created` — `{"enrolled": true, "kid": "...", "issued_at": "...", "role": "..."}`.
- `400 Bad Request` — `{"error": "AlgorithmRejected", "detail": "<reason>"}` when `algo` outside §10.6 accepted set (e.g., `RS256` rejected; RSA < 3072 rejected). OR `{"error": "RoleRejected"}` when `role` outside §10.4 enum.
- `409 Conflict` — `{"error": "HandlerKidConflict", "detail": "kid already enrolled"}` when `kid` matches an existing enrolled handler.
- `401` / `403` — auth failures.

**Conformance linkage.** `SV-PERM-12` asserts (a) first enroll succeeds, (b) duplicate kid rejects with `HandlerKidConflict`, (c) `RS256` body rejects with `AlgorithmRejected`. `SV-PERM-03/04` enroll an `Autonomous`-role kid and sign the triggering PDA with it to drive §10.4.1 escalation.

#### 10.6.4 Key-Storage Introspection (Normative — L-48)

**Rationale.** §10.6 mandates handler private keys MUST NOT be stored on disk unencrypted. Validators cannot prove the negative via filesystem inspection. This endpoint exposes storage metadata for external verification.

**Endpoint `GET /security/key-storage`** — operator-bearer scope; `admin:read` also accepted. Rate limit 60 rpm. Not-a-side-effect.

**Response (`200 OK`):**
```json
{
  "storage_mode": "hsm | software-keystore | ephemeral",
  "private_keys_on_disk": false,
  "provider": "aws-kms | windows-dpapi | macos-keychain | linux-keyring | <vendor-string>",
  "attestation_format": "tpm-ak | pkcs11 | platform-attestation | <vendor-string>"
}
```

- `storage_mode` REQUIRED. `ephemeral` is test-only; production Runners MUST report `hsm` or `software-keystore`.
- `private_keys_on_disk` REQUIRED boolean. MUST be `false` for conformance.
- `provider` and `attestation_format` OPTIONAL, informative.

**Conformance linkage.** `SV-PERM-13` asserts `private_keys_on_disk === false`.

#### 10.6.5 Retroactive SuspectDecision Flagging (Normative — L-48)

**Rationale.** §10.6 requires flagging audit records signed by a compromised `kid` in the 24 hours preceding revocation. WORM semantics (§10.5) forbid mutating the original records. `SV-PERM-15` asserts the retroactive-flagging property via the same admin-row pattern as §10.5.4 subject-suppression.

**Flagging mechanism.** When handler-kid `k` is revoked (via `RUNNER_HANDLER_CRL_POLL_TICK_MS` watcher OR production CRL refresh), the Runner MUST scan its audit chain back 24 hours and, for every record whose `signer_key_id == k`, append a NEW admin-row to the chain with:

- `decision: "SuspectDecision"`
- `referenced_audit_id: <original-row-id>`
- `reason: "kid-revoked-24h-window"`
- remaining required fields per admin-row shape (`id, timestamp, session_id, subject_id, prev_hash, this_hash`)

The original decision-rows remain immutable. Validators reconstruct the "this decision is flagged as suspect" view by joining `SuspectDecision` admin-rows to the rows they reference.

**Schema.** `audit-records-response.schema.json` adds `SuspectDecision` to the `decision` enum and adds a third `oneOf` branch requiring `referenced_audit_id`.

**Conformance linkage.** `SV-PERM-15` revokes a handler-kid via the watcher, reads `/audit/records`, and asserts that every decision-row from the 24h preceding revocation with matching `signer_key_id` has a corresponding `SuspectDecision` admin-row whose `referenced_audit_id` points at it.

### 10.7 Privacy and Data-Governance Controls (Normative)

SOA-Harness emits three classes of persistent records that MAY carry personal data: audit records (§10.5), memory entries (§8), and session/workflow state (§12). v1.0 defines the following normative controls; operators remain responsible for the legal classification of specific data items under their applicable regime (e.g., GDPR, CCPA, HIPAA).

1. **Data inventory.** Every deployment MUST publish a data-inventory document at `docs/data-inventory.md` enumerating, per primitive, which fields MAY contain personal data, the field's retention category (see §10.7.3), and the legal basis asserted for collection. Absence of the file fails conformance (`SV-PRIV-01`). The document is informative in text but its presence and schema adherence are normative.
2. **Field-level tagging.** Any StreamEvent payload, memory entry, or audit record containing a field that MAY carry personal data MUST tag that field with a `data_class` annotation drawn from the closed enum `{ "public" | "internal" | "confidential" | "personal" | "sensitive-personal" }`. Tagging is carried at the schema level (JSON Schema `x-soa-data-class` extension) and at the record level for entries that do not flow through a fixed schema. Untagged fields default to `internal`. `sensitive-personal` (e.g., health, credentials, precise location) MUST NOT be persisted to memory in any form; attempting to consolidate such an entry MUST emit `MemoryDeletionForbidden` (reason `sensitive-class-forbidden`). (`SV-PRIV-02`)

#### 10.7.1 Deletion and Subject-Access Semantics

3. **Deletion requests.** The Runner MUST expose an MCP tool `privacy.delete_subject` with parameters `{ subject_id, scope: "memory" | "audit" | "session" | "all", legal_basis, operator_kid }`. On invocation the Runner MUST:
   - For `scope = memory`: tombstone every memory entry whose metadata contains `subject_id`, per the §8 memory-deletion rules. Tombstones (not physical deletion) satisfy the integrity-chain requirement and MUST include the originating `operator_kid` and `legal_basis`.
   - For `scope = audit`: the WORM sink rule (§10.5) forbids destructive deletion; the Runner instead writes a `SubjectSuppression` audit record that downstream consumers MUST honor when producing subject-access exports. The original records remain intact for regulatory audit of the suppression itself.
   - For `scope = session`: active sessions touching the subject MUST be paused; persisted session bodies MUST be tombstoned in place and the summary-only record retained. Resumption after suppression is NOT permitted — the Runner MUST emit `SessionFormatIncompatible` (reason `subject-suppressed`) on any resume attempt.
   - For `scope = all`: apply all three above atomically under a single `privacy.delete_subject` audit record.
4. **Subject-access export.** The Runner MUST also expose `privacy.export_subject` returning a JCS-canonical JSON object `{ memory: [...], audit: [...], sessions: [...] }` filtered to entries whose `subject_id` matches. The export MUST honor `SubjectSuppression` records (suppressed entries appear as redacted stubs). (`SV-PRIV-03`)

#### 10.7.2 Cross-Border and Residency

5. **Residency pinning.** Deployments that require data residency MUST declare the allowed set of geographic regions in Agent Card `security.data_residency` (array of ISO-3166 alpha-2 country codes). Enforcement is a **layered defence**; no single signal below is authoritative, but ALL declared layers MUST agree before the Runner permits a tool invocation:
   - **Tool-declared processing location (primary).** Every MCP tool MUST expose a `data_processing_location` manifest field (closed enum of ISO-3166 alpha-2 codes covering the regions where the tool actually stores, processes, or transits personal data). The Runner MUST reject any invocation whose declared location intersects empty set with `security.data_residency` with `PermissionDenied` (reason `residency-violation`, sub-reason `tool-declaration-mismatch`). Tools that cannot declare this field MUST be treated as region `"*"` (unknown) and rejected by any deployment with a non-empty residency pin.
   - **Cryptographic attestation (when available).** When the tool's MCP server signs its responses with a key enrolled under `security.trustAnchors`, the signature MUST assert the `data_processing_location` value. Mismatch between signed attestation and manifest claim → `PermissionDenied` (reason `residency-violation`, sub-reason `attestation-mismatch`).
   - **Network-signal cross-check (supporting evidence only).** The Runner MAY additionally verify that DNS + TLS SNI + reverse-lookup of the tool's endpoint map to a region in `security.data_residency`. Network signals are inherently spoofable (anycast, CDN fronting, BGP hijack); they are corroborating evidence only. A deployment relying solely on network signals to enforce residency is NON-CONFORMANT; conformance requires at least the tool-declared primary signal.
   - **Audit record.** Every residency-gated decision (accept or reject) MUST emit an audit record carrying `{ tool, declared_location, attested_location, network_signal_regions, decision }` so downstream compliance review can see which layers agreed.

   Absence of `security.data_residency` MUST be treated as "no residency constraint"; strict deployments SHOULD declare it explicitly. (`SV-PRIV-05`)

#### 10.7.3 Retention

6. **Retention categories.** Every record type MUST declare a retention category, pinned here:

| Category | Applies to | Default retention | Override mechanism |
|---|---|---|---|
| `audit-integrity` | Records covered by §10.5 WORM rule | Indefinite (append-only) | NOT overridable; §10.5 precedence |
| `audit-personal` | Audit records tagged with personal fields | ≤ 400 days, or the shorter of applicable legal maximum and operator-declared | Operator policy at `docs/data-inventory.md`; `SubjectSuppression` reduces to redacted stubs |
| `memory-personal` | Memory entries tagged `personal` or containing subject references | Consolidation horizon per §8.2 `consolidation_threshold`, capped at 400 days for personal-class | Per-subject `privacy.delete_subject` |
| `session-body` | Full session message bodies | ≤ 90 days after session close | Summary record retained indefinitely; body tombstone on expiry |
| `operational` | Everything else | ≤ 30 days | Operator discretion |

A record whose age exceeds its category's retention MUST be either tombstoned (memory, session-body) or redacted in new exports (audit-personal). Runners MUST run a retention sweep at least every 24 hours (`SV-PRIV-04`).

7. **Boundary with §10.5 WORM.** The WORM immutability requirement (§10.5) precludes destructive deletion of audit records but not structural redaction on export. Deployments needing hard-delete for regulatory reasons beyond the `SubjectSuppression` stub MUST NOT claim conformance with `core+si`; that conflict is acknowledged as a known limitation of v1.0 and is NOT resolvable within §19.4 two-minor evolution.

---

## 11. Tool Registry & Pool Assembly

### 11.1 Global Tool Registry

- MUST expose `list_tools()` returning an array of `{ name, description, input_schema, risk_class, default_control }`.
- MCP tool names MUST match the grammar `name := "mcp__" segment "__" segment` where `segment := segment-start segment-rest{0,62}`, `segment-start := [A-Za-z0-9]`, and `segment-rest := [A-Za-z0-9_-] | pct-encoded`, with `pct-encoded := "%" HEXDIG HEXDIG` using uppercase hex only. A bare `%` not followed by two uppercase hex digits is invalid. Tool names produced by percent-decoding any valid name MUST NOT collide with another registered tool; Registry MUST reject collisions at registration. Length limits (64 chars per segment) apply to the encoded form; percent-encoded octets count toward the limit as three characters.

### 11.2 Per-Session Tool Pool

Assembled at session start (and after any self-improvement acceptance; see §11.3) by filtering the global registry by:
- `capability = permissions.activeMode` (§10.3).
- `agentType` constraints (e.g., `explore` sees only `ReadOnly`).
- Deny lists in `AGENTS.md :: ## Agent Type Constraints`.
- MCP server availability.

Deny lists live in `AGENTS.md`; the syntax is one tool name per line under `### Deny` within Agent Type Constraints.

#### 11.2.1 AGENTS.md Source Path Test Hook (Normative — Testability)

**Rationale.** `SV-REG-04` asserts the deny-list subtraction behavior: tools named under `### Deny` in `AGENTS.md :: ## Agent Type Constraints` MUST NOT appear in the per-session Tool Pool (§11.2) and MUST NOT surface in the `/tools/registered` response (§11.4) for sessions in that Agent Type. Conformant Runners locate `AGENTS.md` via operator configuration in production deployments. For conformance testing, validators need a deterministic way to point the Runner at a pinned fixture without mutating the project root.

**Env var `SOA_RUNNER_AGENTS_MD_PATH=<file-path>`** — when set, conformant Runners MUST read `AGENTS.md` from the named path instead of the default project-root location. The path MUST resolve to a readable file on startup or the Runner MUST fail startup with `AgentsMdUnavailableStartup` (no fail-open). The file's `## Agent Type Constraints → ### Deny` section MUST be parsed per the grammar in §11.2: one tool name per line, leading/trailing whitespace stripped, blank lines and `#`-prefixed comments ignored. Denied names subtract from the per-session Tool Pool.

**Production guard:** same rule as `RUNNER_TEST_CLOCK` / `RUNNER_CRASH_TEST_MARKERS` / `SOA_RUNNER_DYNAMIC_TOOL_REGISTRATION` — MUST NOT be reachable by untrusted principals, MUST refuse startup with the env set on a non-loopback interface. The env var is test-only; production deployments resolve `AGENTS.md` via operator configuration.

**Conformance linkage.** `SV-REG-04` validator starts Runner with `SOA_RUNNER_AGENTS_MD_PATH=test-vectors/agents-md-denylist/AGENTS.md` and `RUNNER_TOOLS_FIXTURE=test-vectors/agents-md-denylist/tools-with-denied.json`; asserts `/tools/registered.tools[]` excludes the names listed under `### Deny`.

### 11.3 Re-Registration Timing

- On self-improvement iteration acceptance (§9.5 step 12e), the Runner MUST pin the **new** Tool Pool for **new** sessions.
- Sessions in flight during acceptance MUST continue with their pinned pool; they observe no tool additions or removals mid-session. The session file records the Tool Pool manifest by content hash.
- On session resume: if the Tool Pool manifest hash no longer resolves (tools removed), the session MUST terminate with `StopReason::ToolPoolStale` and emit `ToolPoolStaleResume`. No partial-pool resume is permitted.

#### 11.3.1 Runtime Tool-Addition Test Hook (Normative — Testability)

**Rationale.** `SV-REG-03` asserts "Tools added mid-session do not appear in in-flight pool". §11.2 covers session-start pool assembly; §11.3 covers re-registration at SI acceptance (M5). Neither path gives a validator a deterministic way to add a tool at runtime during a single M3 test execution without invoking the full self-improvement flow. This section defines a test-only env-var hook.

**Env var `SOA_RUNNER_DYNAMIC_TOOL_REGISTRATION=<trigger-file-path>`** — when set, conformant Runners watch the named file (fsnotify or equivalent polling) and, when a JSON-array of tool entries is written to it, invoke the §11.1 registration path with each entry. The validator writes a tool-spec JSON to this file during a test to simulate MCP dynamic registration. After the file is consumed, the Runner MUST truncate it so a subsequent write triggers another registration.

**Production guard:** same rule as `RUNNER_TEST_CLOCK` / `RUNNER_CRASH_TEST_MARKERS` — MUST NOT be reachable by untrusted principals, MUST refuse startup with the env set on a non-loopback interface. The env var is test-only; production deployments add tools via the MCP transport per §11.2/§11.3.

**Conformance linkage.** `SV-REG-03` validator drives the env var with a controlled tool entry; asserts `registry_version` (`/tools/registered` per §11.4) updates AND the in-flight session's `tool_pool_hash` does NOT (mid-session pool is pinned per §11.2).

### 11.4 Dynamic Registration Observability (Normative)

**Rationale.** §11.1–§11.3 define the global Tool Registry + per-session Tool Pool + re-registration rules. Dynamic MCP registration (tools added to the registry at runtime) is M3 scope. Conformance validators need an observation surface to verify: current registered tools, pool assignments per session, and re-registration events since boot.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /tools/registered
```

Returns the currently-registered global Tool Registry state. `sessions:read:<any>` scope (any valid session bearer can read; registry is session-independent). Rate limit: 60 rpm.

**Response schema:** `schemas/tools-registered-response.schema.json`. Body:

```json
{
  "tools": [
    { "name": "...",
      "risk_class": "ReadOnly | Mutating | Destructive",
      "default_control": "AutoAllow | Prompt | Deny",
      "idempotency_retention_seconds": 3600,
      "registered_at": "<RFC 3339>",
      "registration_source": "static-fixture | mcp-dynamic"
    }
  ],
  "registry_version": "sha256:...",
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

Byte-identity excludes `generated_at`. Not-a-side-effect: no registry state change, no StreamEvent emission on read. `SV-REG-01..05` consume this endpoint for registry-contract assertions.

---

## 12. Session Persistence & Workflow State

### 12.1 Session File Schema

A session file at `/sessions/<session-id>.json` MUST conform to:

```json
{
  "$id": "https://soa-harness.org/schemas/v1.0/session.schema.json",
  "type": "object",
  "required": ["session_id", "format_version", "activeMode", "messages", "workflow", "counters", "tool_pool_hash", "card_version"],
  "properties": {
    "session_id": { "type": "string", "pattern": "^ses_[A-Za-z0-9]{16,}$" },
    "format_version": { "type": "string", "const": "1.0" },
    "created_at": { "type": "string" },
    "activeMode": { "type": "string", "enum": ["ReadOnly", "WorkspaceWrite", "DangerFullAccess"], "description": "The session's bound capability. Set at §12.6 bootstrap; MUST be ≤ Agent Card's permissions.activeMode; MUST NOT change during a session's lifetime (handoff creates a new session per §17)." },
    "messages": { "type": "array" },
    "workflow": {
      "type": "object",
      "required": ["task_id", "status", "side_effects", "checkpoint"],
      "properties": {
        "task_id": { "type": "string" },
        "status": { "type": "string", "enum": ["Planning", "Executing", "Optimizing", "Handoff", "Blocked", "Succeeded", "Failed", "Cancelled"] },
        "side_effects": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["tool", "idempotency_key", "phase"],
            "properties": {
              "tool": { "type": "string" },
              "idempotency_key": { "type": "string" },
              "args_digest": { "type": "string" },
              "phase": { "type": "string", "enum": ["pending", "inflight", "committed", "compensated"] },
              "result_digest": { "type": "string" }
            }
          }
        },
        "checkpoint": { "type": "object" }
      }
    },
    "counters": { "type": "object" },
    "tool_pool_hash": { "type": "string" },
    "card_version": { "type": "string" }
  }
}
```

### 12.2 Significant Events and Persistence Points

**Significant events (normative closed set).** The following operations are "significant events" for §12.2 purposes:
1. Tool invocations that produce side-effects (MCP `tools/call`, HTTP tool calls, etc.).
2. Permission decisions recorded via `POST /permissions/decisions` (§10.3.2) — each decision, whether AutoAllow / Prompt / Deny / CapabilityDenied / ConfigPrecedenceViolation, advances the audit chain and therefore warrants bracket-persist in the session's `workflow.side_effects[]`.
3. Handoff events (§17) — out of M2 scope; listed for completeness.
4. Self-improvement iterations (§9.7) — out of M2 scope; listed for completeness.

Persistence is **bracketed** around each significant event. For each significant event the Runner MUST:

1. Persist `phase = pending` with an **idempotency key** (UUIDv4) and `args_digest` BEFORE executing.
2. Execute (or, for permission decisions, dispatch the §10.3 step 5 handler outcome).
3. Persist `phase = committed` with `result_digest` AFTER successful execution, OR `phase = compensated` on failure followed by the compensating action.

Bracket-persist events MUST emit the §12.5.3 crash-test markers at the corresponding boundaries when `RUNNER_CRASH_TEST_MARKERS=1`. For `POST /permissions/decisions`:
- `SOA_MARK_PENDING_WRITE_DONE` fires after fsync of the `phase=pending` side_effect entry (before §10.3 dispatch).
- `SOA_MARK_TOOL_INVOKE_START` fires at the §10.3 step 5 dispatch boundary (the handler accepting its input). For decisions without actual tool execution, this marker MUST still fire — the decision pipeline's dispatch IS the "invoke-start" event for observability purposes.
- `SOA_MARK_TOOL_INVOKE_DONE` fires after the handler returns (decision computed).
- `SOA_MARK_COMMITTED_WRITE_DONE` fires after fsync of the `phase=committed` side_effect entry.
- `SOA_MARK_DIR_FSYNC_DONE` fires after the directory-level fsync that atomically commits the side_effect entry.

This gives **at-least-once** semantics on resume: `pending` tools are replayed; `committed` are not. Each tool MUST accept an `X-Soa-Idempotency-Key` header (for HTTP-like tools) or MCP equivalent and MUST dedupe on it. Permission decisions MUST also be replayable on resume via the `idempotency_key`; re-submitting the same `(session_id, idempotency_key)` to `/permissions/decisions` MUST return the original decision + audit_record_id without appending a second audit row.

**Tool-side retention window (normative).** The tool's dedupe cache for a given `idempotency_key` MUST retain the committed result for at least the longer of:
- **1 hour** (absolute minimum floor — covers routine restart windows), OR
- The session's declared resume-grace window (§14.3; minimum 10 minutes for UI transports, Runner session TTL for headless), OR
- The session's maximum lifetime as declared in Agent Card `compaction.triggerTokens`-derived session-age cap (24 hours cap).

A tool whose dedupe horizon is shorter than this floor MUST be classified `risk_class = Destructive` (alongside the no-idempotency rule) because a late replay could re-execute the action. Tools declare their actual retention horizon in their MCP manifest as `idempotency_retention_seconds`; a tool declaring < 3600 seconds whose `risk_class` is not `Destructive` MUST be rejected by the Runner at tool-pool assembly with `ToolPoolStale` (reason `idempotency-retention-insufficient`). (`SV-SESS-11`)

Tools without any idempotency support MUST be classified `risk_class = Destructive` and run only under `control = Prompt` with a re-prompt on resume.

**Relationship to UI §11.4.1 Prompt Nonce Replay Cache (normative clarification).** §12.2 tool idempotency and UI §11.4.1 prompt-nonce replay prevention are **disjoint, non-substitutable mechanisms** operating at different layers:

- §12.2 dedupes *tool invocations* keyed by `X-Soa-Idempotency-Key` (UUIDv4 per invocation). It protects against the Runner re-executing a tool after a crash/resume where the same tool call would otherwise fire twice. Its cache lives in the tool's own storage and survives Runner restarts for at least the retention window above.
- UI §11.4.1 dedupes *user permission decisions* keyed by `(session_id, prompt.nonce)` (Gateway-minted per-prompt). It protects against a replayed or reused PDA granting a fresh authorization window to an attacker. Its cache lives in the Gateway and its persistence rules are profile-gated per UI §11.4.1.

The two caches MUST NOT share storage or key space. A tool idempotency hit does NOT authorize a later PDA to bypass the nonce cache, and a PDA replay-cache hit does NOT cause the Runner to skip tool-side idempotency checks. Implementations bridging these layers (e.g., a Gateway that proxies both prompt decisions and tool calls) MUST maintain the two caches as independent subsystems with independent metrics (`soa_ui_replay_cache_*` for UI §11.4.1; `soa_tool_idempotency_*` for §12.2). (`SV-SESS-12`)

### 12.3 Atomic Writes

- **POSIX**: write to `<path>.tmp`, `fsync(fd)`, `rename(.tmp, path)`, `fsync(dir_fd)`.
- **Windows**: write to `<path>.tmp`, `FlushFileBuffers`, `MoveFileExW(<tmp>, <path>, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)`.
- Multi-file commits (e.g., session + audit + memory-note pointers) MUST use the stage-activate pattern (§9.5 step 12): a single activation record rename is the commit boundary.

### 12.4 Concurrency

- Per session, write access is serialized by a file-level advisory lock (`flock`/`LockFileEx`) held for the duration of a significant event.
- Multiple Runner processes MAY share a project directory only if each runs a distinct session. Self-improvement acceptance (which writes to git) is serialized by a cluster-wide lock. Runners MUST declare the mode via `SOA_COORD_MODE`:
  - **`local`** (default): advisory file lock at `/var/soa/self-improve.lock` (POSIX) or `%ProgramData%\soa\self-improve.lock` (Windows). Sufficient for a single host sharing a filesystem.
  - **`distributed`**: a lease-based coordination primitive providing monotonic **fencing tokens** MUST be used. Conforming backends: etcd v3 (`Lease` + CAS), Apache ZooKeeper (ephemeral sequential znodes), Redis with Redlock + fencing, or a coordination MCP tool. Fencing tokens MUST be included in the git commit trailer (`Soa-Fencing-Token: <monotonic integer>`). The coordination endpoint is declared at `security.coordinationEndpoint`.
  - Contention beyond 30 s → `SelfImproveLockBusy`. In `distributed` mode, a token gap in git history MUST trigger `SelfImproveFencingViolation`.

### 12.5 Resume Algorithm

`resume_session(session_id)` MUST:

1. Read session file; validate `format_version == "1.0"` (else `SessionFormatIncompatible`).
2. Verify `card_version` matches the currently served Agent Card; on mismatch, the session is terminated with `StopReason::CardVersionDrift`.
3. Verify `tool_pool_hash` still resolves; see §11.3.
4. For each `side_effects[i].phase`: replay `pending` with the recorded idempotency key; skip `committed`; run compensating actions for `inflight` whose tool supports it, else mark `compensated` with a `ResumeCompensationGap` note.

**Trigger points (normative, added at L-29).** `resume_session` MUST be invoked at the following trigger points. Without explicit triggers the algorithm's function-level correctness is unobservable externally and the persisted-session file format becomes write-only in practice.

1. **Runner startup scan.** At every Runner boot, immediately after trust bootstrap (§5.3) and before opening any public listener, the Runner MUST enumerate the session directory (§12.1 default `/sessions/` or `RUNNER_SESSION_DIR` override) and invoke `resume_session(session_id)` for every session file whose `workflow.status` is in the in-progress set `{Planning, Executing, Optimizing, Handoff, Blocked}`. Sessions whose status is terminal (`Succeeded`, `Failed`, `Cancelled`) MUST NOT be auto-resumed. Each auto-resume's outcome (success, `CardVersionDrift`, `SessionFormatIncompatible`, `ResumeCompensationGap`) MUST be recorded in the audit log.
2. **Client reconnect.** When a session-scoped bearer is presented against `/stream/v1/<session_id>` or `/sessions/<session_id>/state` for a session_id that exists on disk but is not currently active in memory, the Runner MUST invoke `resume_session(session_id)` before serving the request. This is the lazy-hydrate path.
3. **Explicit operator-tool invocation (optional).** Operators MAY trigger `resume_session` through administrative tooling (not normatively specified here; deployment-defined).

Triggers 1 and 2 are both MUST. A Runner that ships `resume_session` as a callable function without wiring either trigger is non-conformant — the resume algorithm becomes dead code and `HR-04`, `HR-05`, `SV-SESS-02`, `SV-SESS-04`, `SV-SESS-08`, `SV-SESS-09`, `SV-SESS-10` all go untestable despite the function existing.

#### 12.5.1 Session State Observability (Normative)

**Rationale.** §12.1 defines the session-file schema, §12.2 defines bracket-persist semantics, §12.3 defines atomic writes, §12.5 defines resume. Every element is on-disk state, which means without an external observation surface the bracket-persist + atomic-write + resume-algorithm behaviors are Runner-self-attested. A conformance validator cannot verify `HR-04` (pending replays idempotently), `HR-05` (committed does NOT replay), `SV-SESS-03` (bracket observed for every event), or `SV-SESS-04` (replay same idempotency key) without a way to read the session's current state while the Runner is live. Filesystem access is not universally available (validator may be remote; containerized deployments mount `/sessions/` privately). This section defines the on-wire observation path.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /sessions/<session_id>/state
```

- **Transport:** HTTPS / TLS 1.3 on the public listener; loopback plain-HTTP permitted on Unix socket / named pipe (same rule as §10.3.1, §10.5.2, §10.5.3).
- **Authentication:** session-scoped bearer with `sessions:read:<session_id>` scope (granted by §12.6 bootstrap by default alongside `permissions:resolve` + `audit:read`). `401`/`403` per the standard patterns.
- **Rate limiting:** 120 requests/minute per bearer (higher than /permissions/decisions because state polls are idempotent and expected-common during crash-recovery debugging).

**Response (200 OK).** JSON body conforming to `schemas/session-state-response.schema.json`:

```json
{
  "session_id": "ses_...",
  "format_version": "1.0",
  "activeMode": "ReadOnly | WorkspaceWrite | DangerFullAccess",
  "created_at": "<RFC 3339>",
  "last_significant_event_at": "<RFC 3339>",
  "workflow": {
    "task_id": "...",
    "status": "Planning | Executing | Optimizing | Handoff | Blocked | Succeeded | Failed | Cancelled",
    "side_effects": [
      { "tool": "...",
        "idempotency_key": "...",
        "phase": "pending | inflight | committed | compensated",
        "args_digest": "sha256:...",
        "result_digest": "sha256:..." | null,
        "first_attempted_at": "<RFC 3339>",
        "last_phase_transition_at": "<RFC 3339>"
      }
    ]
  },
  "counters": {},
  "tool_pool_hash": "...",
  "card_version": "...",
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

The body MUST reflect the current state of the session as it would appear if `resume_session` ran right now — i.e., the response is derived from the same persisted state that a crash-and-restart would read. Implementations SHOULD return the response from the in-memory representation synchronized with the last atomic-write flush; a Runner that returns a STALE snapshot (pre-flush in-memory state that hasn't hit disk yet) violates the not-a-side-effect contract because the validator's crash test could then observe different state than what a real crash would expose.

**Other responses:**
- `400 Bad Request` — session_id does not match the `^ses_[A-Za-z0-9]{16,}$` pattern
- `401 / 403 / 429` — per standard auth + rate-limit rules
- `404 Not Found` — `session_id` does not map to an active OR previously-persisted session
- `503 Service Unavailable` — `/ready` is 503

**Not-a-side-effect property (normative MUST).** A `GET /sessions/.../state` call MUST NOT:
1. Advance any workflow state or transition any side-effect phase
2. Append to `/audit/permissions.log` or any other audit sink
3. Emit a StreamEvent
4. Touch the session file on disk (read-only in-memory observation; implementations that need to sync from disk do so AT MOST once per request and treat it as a cache refresh, not a file mutation)

**Byte-identity contract (normative).** Two successive `GET /sessions/.../state` calls against an otherwise-quiescent session MUST return response bodies that are byte-identical **when `generated_at` is excluded from the comparison**. `generated_at` is wall-clock per-request timestamp — excluding it from the identity check is the validator's conformance predicate for not-a-side-effect. Every other field (session_id, activeMode, workflow.*, counters, tool_pool_hash, card_version, runner_version) MUST match byte-for-byte across the two responses. A conformant validator predicate: `strip(response_body, "generated_at") == strip(response_body_prior, "generated_at")`.

**Conformance linkage.**
- `SV-SESS-STATE-01` (new) — schema conformance of the response; correct fields populated for a session with known bracket-persist state
- `HR-04` — validator drives a tool invocation, reads /state before the Runner commits the side-effect, asserts `phase=pending` with a populated `idempotency_key`; kills the Runner subprocess at that point; restarts; reads /state again; asserts `phase=committed` after replay (assuming tool's dedupe accepted the replay) or stays `pending` + `first_attempted_at` preserved if the tool refused
- `HR-05` — same pattern but observation point is AFTER commit; kill; restart; assert `phase=committed` AND tool was not called a second time (observable via tool-side counter or an audit row only appearing once)
- `SV-SESS-03` — observe every significant event hits `pending` first, then `committed` (never directly `committed` without a `pending` predecessor)
- `SV-SESS-04` — replay observes the same `idempotency_key` value across the pre-kill and post-restart /state reads

#### 12.5.2 Audit Sink Failure Simulation Hook (Normative — Testability)

**Rationale.** §10.5.1's three-state degradation model (`healthy` → `degraded-buffering` → `unreachable-halt`) is triggered by external audit-sink reachability failures. In production those failures arise from network partitions, sink-side outages, or rate-limit rejections. A conformance validator running locally against an impl cannot reliably cause network partitions — `SV-PERM-19` would be untestable without a test-only knob.

**Test hook (MUST accept in conformance mode).** Conformance-tested Runners MUST accept the environment variable:

```
SOA_RUNNER_AUDIT_SINK_FAILURE_MODE=<enum>
```

with values `healthy | degraded-buffering | unreachable-halt`. When set, the Runner behaves AS IF the sink were in the named state AND drives the corresponding concrete side effects: in `degraded-buffering` the Runner MUST actually write audit records to the fsync-backed `/audit/pending/` local queue (so crash-recovery tests over this buffer exercise real persistence), and in `unreachable-halt` the Runner MUST actually refuse Mutating/Destructive tool calls per §10.5.1 (not just set `/ready` to 503). The env var bypasses external-sink reachability checks but does NOT elide the Runner-internal persistence behaviors those states require.

**State-transition-on-restart (normative clarification for SV-PERM-19).** A fresh Runner process booting with `SOA_RUNNER_AUDIT_SINK_FAILURE_MODE` set MUST emit the corresponding `AuditSink*` StreamEvent exactly once at boot, treating the fresh process as transitioning from an implicit `healthy` prior state. This makes env-var-restart testing deterministic: `SV-PERM-19` validators can restart the subprocess across the three values and observe exactly one StreamEvent per boot matching the env value.

**Production guard:** same rule as §10.6.1's clock-injection test hook — the sink-failure env var MUST NOT be reachable by untrusted principals in production, and conformance-tested Runners SHOULD refuse to start with this env var set when bound to a non-loopback interface.

#### 12.5.3 Crash Test Markers + Session Isolation Env Vars (Normative — Testability)

**Rationale.** `HR-04`, `HR-05`, `SV-SESS-03`, `SV-SESS-04` require the validator to kill the Runner subprocess at specific fsync boundaries and observe post-resume behavior. Without a deterministic marker protocol, the validator can't name a kill point; tests become impl-version-coupled. This section pins the marker names + emission points so cross-impl validators (including `soa-validate`) can target the same boundaries.

**Env var `RUNNER_CRASH_TEST_MARKERS=1`** — when set, conformant Runners MUST emit structured marker lines to stderr at each of the following boundaries, in order:

| Marker | Emitted when | Context |
|---|---|---|
| `SOA_MARK_PENDING_WRITE_DONE session_id=<sid> side_effect=<sidx>` | After fsync of the `phase=pending` session-file write completes successfully | §12.2 bracket step 1 |
| `SOA_MARK_TOOL_INVOKE_START session_id=<sid> side_effect=<sidx>` | Immediately before the tool's actual invocation (post-permission-dispatch) | §12.2 step 2 |
| `SOA_MARK_TOOL_INVOKE_DONE session_id=<sid> side_effect=<sidx> result=<committed\|compensated>` | After tool returns, before persistence of the committed/compensated phase | §12.2 step 3 pre-persist |
| `SOA_MARK_COMMITTED_WRITE_DONE session_id=<sid> side_effect=<sidx>` | After fsync of the `phase=committed` session-file write completes | §12.2 step 3 post-persist |
| `SOA_MARK_DIR_FSYNC_DONE session_id=<sid>` | After dir-fsync (§12.3 POSIX) or `MoveFileExW(WRITE_THROUGH)` (§12.3 Windows) completes — the true atomic-write boundary | §12.3 |
| `SOA_MARK_AUDIT_APPEND_DONE audit_record_id=<aid>` | After an audit row's local fsync completes (`/audit/permissions.log` append) | §10.5 |
| `SOA_MARK_AUDIT_BUFFER_WRITE_DONE audit_record_id=<aid>` | After an audit row is written to the `/audit/pending/` local buffer (in `degraded-buffering`) | §10.5.1 |

Cross-platform identity: the markers MUST fire in the same logical order on Linux, macOS, and Windows for equivalent workflow paths. Platform-specific differences (fsync on POSIX vs FlushFileBuffers+MoveFileEx on Windows) are ABSTRACTED behind the `SOA_MARK_DIR_FSYNC_DONE` marker — a validator kill-at-marker harness doesn't need to know platform mechanics.

**Env var `RUNNER_SESSION_DIR=<path>`** — overrides the default `/sessions/` directory. REQUIRED for crash-recovery test harnesses that need isolated per-test session state. When unset, Runners use their platform-default session directory. This env var is a production-safe configuration knob (not a test-only hook) — deployments routinely override the session directory for multi-tenant isolation or encrypted-disk placement.

**Production guard for `RUNNER_CRASH_TEST_MARKERS`:** the marker-emission env var MUST NOT be enabled on production Runners; the stderr stream could leak session identifiers to log aggregators that don't carry the required confidentiality controls. Conformance-tested Runners SHOULD refuse to start with `RUNNER_CRASH_TEST_MARKERS=1` on non-loopback interfaces.

#### 12.5.4 Audit-Sink Event Channel (Normative — M2 Minimum Observability)

**Rationale.** §10.5.1's three-state degradation model emits `AuditSinkDegraded`, `AuditSinkUnreachable`, `AuditSinkRecovered` as StreamEvents. Full StreamEvent transport (§14) is M3 scope — which would leave `SV-PERM-19` untestable in M2. This section defines a minimum-viable observability channel for these three event types in M2.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /audit/sink-events?after=<event_id>&limit=<n>
```

- **Transport, auth, rate-limit:** identical rules to `/audit/tail` / `/audit/records` — `audit:read` scope, TLS 1.3 / loopback plain allowed, 60 rpm per bearer.
- **Pagination:** `after`/`limit`/`next_after`/`has_more` per the same protocol as `/audit/records` (§10.5.3).

**Response (200 OK).** JSON body with array of state-transition events:

```json
{
  "events": [
    { "event_id": "evt_...",
      "type": "AuditSinkDegraded | AuditSinkUnreachable | AuditSinkRecovered",
      "transition_at": "<RFC 3339>",
      "detail": { "first_failed_at": "<RFC 3339>", "buffered_records": 42 }
    }
  ],
  "next_after": "evt_...",
  "has_more": false,
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

Response schema: `schemas/audit-sink-events-response.schema.json`. Byte-identity contract: same as `/sessions/:id/state` (excluding `generated_at` from comparison).

**Deprecation note.** When §14 StreamEvent transport ships (M3), this endpoint is retained as an alternate polling-friendly observability path. Validators that prefer long-poll over push semantics continue using it.

**Conformance linkage.** `SV-PERM-19` validator fetches this endpoint at each state-transition checkpoint and asserts the expected `AuditSink*` event emitted exactly once per transition.

### 12.6 Session Bootstrap (Normative)

**Rationale.** §12.1 defines the session file format and §12.5 defines resume, but the spec prior to v1.0 defined no surface for *creating* a new session. Session creation was implicit — "sessions exist" — which left two gaps: (a) operators and validators had no defined mechanism to obtain a session bearer for the observability endpoints (§10.3.1, §10.5.2), and (b) the session's bound `activeMode` (§10.3) had no mechanism for tightening from the Agent Card's declared maximum on a per-session basis. Both are closed here with a single first-class endpoint.

**Endpoint.** Every conformant Runner MUST expose:

```
POST /sessions
Content-Type: application/json
```

- **Transport:** HTTPS / TLS 1.3 on the public listener; loopback plain-HTTP permitted on Unix socket / named pipe (same rule as §10.3.1 and §10.5.2).
- **Authentication:** the request MUST present a **bootstrap bearer** — a deployment-defined credential (operator SSO token, service-account JWT, per-operator API key, etc.) that authorizes the caller to create a session. The mechanism for issuing bootstrap bearers is outside this spec (each deployment configures an `identity.bootstrapEndpoint` in its operator configuration). What IS in scope: the bootstrap bearer is a **distinct credential class** from the session bearer returned by this endpoint. The session bearer granted here MUST NOT be usable to create another session (scope does not include `sessions:create`).
- **Rate limiting:** at most 30 requests/minute per bootstrap bearer. `429` with `Retry-After` when exceeded.

**Request body.** JSON object with the following fields:

```json
{
  "requested_activeMode": "ReadOnly" | "WorkspaceWrite" | "DangerFullAccess",
  "user_sub": "<stable user identifier>",
  "session_ttl_seconds": <optional integer, 60..86400>
}
```

- `requested_activeMode` — MUST be a value in the §10.1 enum and MUST be at-or-below the Agent Card's declared `permissions.activeMode`. Requesting a stricter (smaller) mode than the card is permitted and is the expected path for validators exercising the capability lattice. Requesting a looser mode than the card MUST return `403 Forbidden` with reason `ConfigPrecedenceViolation`.
- `user_sub` — stable identifier of the data subject associated with the session (drives §10.7 audit binding). Opaque to the Runner; not authenticated by the Runner — the bootstrap bearer's issuer is responsible for the user-sub binding being trustworthy.
- `session_ttl_seconds` — optional; caller MAY request a session lifetime shorter than the deployment default. Runner enforces the default when omitted and clamps to the deployment maximum (typically ≤ 24 hours per §8 compaction rules).

**Response (201 Created).** JSON body conforming to `schemas/session-bootstrap-response.schema.json`:

```json
{
  "session_id": "ses_<16+ url-safe base64>",
  "session_bearer": "<opaque token; used for /stream, /permissions/resolve, /audit/tail>",
  "granted_activeMode": "ReadOnly" | "WorkspaceWrite" | "DangerFullAccess",
  "expires_at": "<RFC 3339 timestamp>",
  "runner_version": "1.0"
}
```

- `session_id` — newly minted, matches the §12.1 schema's `session_id` pattern, not re-derivable from the bootstrap bearer. The Runner MUST persist the session file (§12.1) before returning 201.
- `session_bearer` — an opaque bearer token authorizing session-scoped endpoints for exactly this `session_id`. Default-granted scopes: `stream:read:<session_id>`, `permissions:resolve:<session_id>`, `sessions:read:<session_id>`, `audit:read`. When `request_decide_scope: true` is present in the request body, the additional `permissions:decide:<session_id>` scope is also granted (per L-19). Does NOT carry `sessions:create`. `sessions:read:<session_id>` authorizes `GET /sessions/<session_id>/state` (§12.5.1) without a separate scope-grant request — the state-observability surface is a default privilege of any minted session bearer because it reads data the bearer already has access to indirectly via the same session's other endpoints.
- `granted_activeMode` — MUST equal `requested_activeMode` when the request was within bounds; equals the Agent Card's activeMode clamped-down only when `requested_activeMode` was provided as a value stricter than the Agent Card's maximum (this is informative, not an error; the request succeeded with a tighter mode than requested is NEVER done — if requested is looser than card it's 403).

**Other responses:**
- `400 Bad Request` — malformed JSON or missing required fields
- `401 Unauthorized` — missing or invalid bootstrap bearer
- `403 Forbidden` with `reason: "ConfigPrecedenceViolation"` — requested_activeMode > Agent Card's activeMode
- `429 Too Many Requests` — rate-limit exceeded
- `503 Service Unavailable` — `/ready` is 503

**No side effect other than session creation.** The endpoint MUST NOT write to the audit log merely for the act of creating the session (the audit chain covers permission decisions and self-edits, not session lifecycle events). Operators wanting session-lifecycle observability MUST consume the §14 StreamEvent `SessionCreated` (emitted on the newly-minted session's stream) or the local operator-log channel.

**Bootstrap bearer issuance (informative).** `identity.bootstrapEndpoint` points to an external IdP or operator-tool surface (OAuth 2.1 with PKCE, SPIFFE, signed JWT issuance, etc.). For purely local test deployments a deployment MAY accept a literal fixed bootstrap bearer configured via the environment variable `SOA_RUNNER_BOOTSTRAP_BEARER`; such a deployment MUST NOT bind to any non-loopback interface (belt-and-suspenders: a fixed bootstrap bearer on a public listener is a trivially-reachable admin backdoor). Conformance harnesses like `soa-validate` consume the fixed-bearer path when running against a locally-bound test Runner.

**Conformance linkage.**
- `SV-SESS-BOOT-01` (new) — schema conformance of the 201 response and the granted_activeMode-clamping rule.
- `SV-SESS-BOOT-02` (new) — 403 ConfigPrecedenceViolation for activeMode above Agent Card max.
- `SV-PERM-01` (updated) — live-path consumes this endpoint to create three sessions (one per activeMode) and exercises the capability lattice across them.

---

## 13. Token Budget & Cost Controls

### 13.1 Projection Algorithm

Before each API call the Runner MUST compute `projected_tokens` and MUST refuse the call (emit `StopReason::BudgetExhausted`) if `tokens_used_so_far + projected_tokens > tokenBudget.maxTokensPerRun`.

```
W = tokenBudget.projectionWindow  # default 10
recent = last W turns' actual_total_tokens
if |recent| < 3:
    baseline = max(tokens_in_message_stack + 2048, 4096)
    projected_tokens = baseline
else:
    projected_tokens = ceil(percentile(recent, 0.95) * 1.15)
```

### 13.2 Mid-Stream Enforcement

If actual consumption exceeds `maxTokensPerRun` during streaming, the Runner MUST cancel the in-flight request on the next `ContentBlockDelta` boundary and emit `StopReason::BudgetExhausted` on the stream, followed by safe shutdown.

### 13.3 Cache Accounting

- Cached input tokens are counted at 10% of full weight unless the provider advertises a different ratio via MCP tool metadata.
- Billing tag MUST be propagated to: OTel resource attributes, Permission Audit Trail, `observability.requiredResourceAttrs`.
- `billingTag` values in session state MUST match the Agent Card's; divergence raises `BillingTagMismatch`.

### 13.4 `StopReason` Enum (Closed)

```
StopReason := NaturalStop
            | MaxTurns
            | UserInterrupt
            | BudgetExhausted
            | MemoryDegraded
            | CardVersionDrift
            | ToolPoolStale
            | SelfImproveLockBusy
            | Crash
```

### 13.5 Budget Projection Observability (Normative)

**Rationale.** §13.1 defines the p95-over-window projection algorithm with 1.15 safety factor. §13.2 defines mid-stream enforcement. §13.3 defines cache accounting. Conformance tests (`SV-BUD-01..07` + `HR-02` + `HR-03` + `HR-06`) can't verify the projection is actually correct without reading the projection value. Standard observability-endpoint pattern.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /budget/projection?session_id=<session_id>
```

- `sessions:read:<session_id>` scope, 120 rpm, TLS 1.3 / loopback plain.
- Response schema: `schemas/budget-projection-response.schema.json`.
- Response body (200):

```json
{
  "session_id": "ses_...",
  "projected_tokens_remaining": 42381,
  "max_tokens_per_run": 200000,
  "cumulative_tokens_consumed": 157619,
  "p95_tokens_per_turn_over_window_w": 3240,
  "safety_factor": 1.15,
  "projection_headroom": 5,
  "stop_reason_if_exhausted": "BudgetExhausted",
  "cold_start_baseline_active": false,
  "cache_accounting": {
    "prompt_tokens_cached": 12400,
    "completion_tokens_cached": 0
  },
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

- Not-a-side-effect: no counters advance, no cancellation fires, no events. Byte-identity excludes `generated_at`.
- When session has no prior turns (cold start): `p95_tokens_per_turn_over_window_w` is the cold-start baseline per §13.1; `cold_start_baseline_active: true`.

**Conformance linkage.** `SV-BUD-PROJ-01` (new) — schema + projection-math correctness. `SV-BUD-01..07` live paths use this endpoint. `HR-02` (previously M3-deferred per L-14) now has its observation surface — the test exercises projection-over-budget returning `StopReason::BudgetExhausted` BEFORE any actual API call fires.

---

## 14. Structured Streaming, System Event Log, and OpenTelemetry Mapping

### 14.1 StreamEvent (Closed `type` Enum)

```json
{
  "$id": "https://soa-harness.org/schemas/v1.0/stream-event.schema.json",
  "type": "object",
  "required": ["event_id", "sequence", "session_id", "type", "payload", "timestamp"],
  "properties": {
    "event_id": { "type": "string", "pattern": "^evt_[A-Za-z0-9]{16,}$" },
    "sequence": { "type": "integer", "minimum": 0 },
    "session_id": { "type": "string" },
    "turn_id": { "type": "string" },
    "type": {
      "type": "string",
      "enum": [
        "SessionStart", "SessionEnd",
        "MessageStart", "MessageEnd",
        "ContentBlockStart", "ContentBlockDelta", "ContentBlockEnd",
        "ToolInputStart", "ToolInputDelta", "ToolInputEnd",
        "ToolResult", "ToolError",
        "PermissionPrompt", "PermissionDecision",
        "CompactionStart", "CompactionEnd",
        "MemoryLoad",
        "HandoffStart", "HandoffComplete", "HandoffFailed",
        "SelfImprovementStart", "SelfImprovementAccepted", "SelfImprovementRejected", "SelfImprovementOrphaned",
        "CrashEvent",
        "PreToolUseOutcome", "PostToolUseOutcome"
      ]
    },
    "payload": { "type": "object" },
    "timestamp": { "type": "string" }
  }
}
```

The enum is a **closed 27-type set** (25 baseline + 2 hook-lifecycle types added per §19.4 errata). `PreToolUseOutcome` and `PostToolUseOutcome` are emitted when §15 hook pipeline stages produce an outcome (allow/deny/replace_args/replace_result); they are the observation surface for `SV-HOOK-07` step-5 ordering assertions. See §14.1.1 payload schemas and §14.1.2 trust-class mapping.

### 14.1.1 Per-Type Payload Schemas (Normative)

The inlined schemas below constitute `stream-event-payloads.schema.json`. Every emitted `StreamEvent.payload` MUST validate against the schema for its declared `type`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://soa-harness.org/schemas/v1.0/stream-event-payloads.schema.json",
  "type": "object",
  "required": ["type","payload"],
  "oneOf": [
    { "properties": { "type": { "const": "SessionStart"   }, "payload": { "$ref": "#/$defs/SessionStart"   } } },
    { "properties": { "type": { "const": "SessionEnd"     }, "payload": { "$ref": "#/$defs/SessionEnd"     } } },
    { "properties": { "type": { "const": "MessageStart"   }, "payload": { "$ref": "#/$defs/MessageStart"   } } },
    { "properties": { "type": { "const": "MessageEnd"     }, "payload": { "$ref": "#/$defs/MessageEnd"     } } },
    { "properties": { "type": { "const": "ContentBlockStart" }, "payload": { "$ref": "#/$defs/ContentBlockStart" } } },
    { "properties": { "type": { "const": "ContentBlockDelta" }, "payload": { "$ref": "#/$defs/ContentBlockDelta" } } },
    { "properties": { "type": { "const": "ContentBlockEnd"   }, "payload": { "$ref": "#/$defs/ContentBlockEnd"   } } },
    { "properties": { "type": { "const": "ToolInputStart"  }, "payload": { "$ref": "#/$defs/ToolInputStart"  } } },
    { "properties": { "type": { "const": "ToolInputDelta"  }, "payload": { "$ref": "#/$defs/ToolInputDelta"  } } },
    { "properties": { "type": { "const": "ToolInputEnd"    }, "payload": { "$ref": "#/$defs/ToolInputEnd"    } } },
    { "properties": { "type": { "const": "ToolResult"      }, "payload": { "$ref": "#/$defs/ToolResult"      } } },
    { "properties": { "type": { "const": "ToolError"       }, "payload": { "$ref": "#/$defs/ToolError"       } } },
    { "properties": { "type": { "const": "PermissionPrompt" }, "payload": { "$ref": "#/$defs/PermissionPrompt" } } },
    { "properties": { "type": { "const": "PermissionDecision" }, "payload": { "$ref": "#/$defs/PermissionDecision" } } },
    { "properties": { "type": { "const": "CompactionStart" }, "payload": { "$ref": "#/$defs/CompactionStart" } } },
    { "properties": { "type": { "const": "CompactionEnd"   }, "payload": { "$ref": "#/$defs/CompactionEnd"   } } },
    { "properties": { "type": { "const": "MemoryLoad"      }, "payload": { "$ref": "#/$defs/MemoryLoad"      } } },
    { "properties": { "type": { "const": "HandoffStart"    }, "payload": { "$ref": "#/$defs/HandoffStart"    } } },
    { "properties": { "type": { "const": "HandoffComplete" }, "payload": { "$ref": "#/$defs/HandoffComplete" } } },
    { "properties": { "type": { "const": "HandoffFailed"   }, "payload": { "$ref": "#/$defs/HandoffFailed"   } } },
    { "properties": { "type": { "const": "SelfImprovementStart"    }, "payload": { "$ref": "#/$defs/SelfImprovementStart"    } } },
    { "properties": { "type": { "const": "SelfImprovementAccepted" }, "payload": { "$ref": "#/$defs/SelfImprovementAccepted" } } },
    { "properties": { "type": { "const": "SelfImprovementRejected" }, "payload": { "$ref": "#/$defs/SelfImprovementRejected" } } },
    { "properties": { "type": { "const": "SelfImprovementOrphaned" }, "payload": { "$ref": "#/$defs/SelfImprovementOrphaned" } } },
    { "properties": { "type": { "const": "CrashEvent"      }, "payload": { "$ref": "#/$defs/CrashEvent"      } } },
    { "properties": { "type": { "const": "PreToolUseOutcome"  }, "payload": { "$ref": "#/$defs/PreToolUseOutcome"  } } },
    { "properties": { "type": { "const": "PostToolUseOutcome" }, "payload": { "$ref": "#/$defs/PostToolUseOutcome" } } }
  ],
  "$defs": {
    "SessionStart":   { "type": "object", "required": ["agent_name","agent_version","card_version"], "properties": { "agent_name":{"type":"string"},"agent_version":{"type":"string"},"card_version":{"type":"string"},"resumed":{"type":"boolean","default":false} }, "additionalProperties": false },
    "SessionEnd":     { "type": "object", "required": ["stop_reason"], "properties": { "stop_reason":{"type":"string"},"final_event_id":{"type":"string"} }, "additionalProperties": false },
    "MessageStart":   { "type": "object", "required": ["message_id","role"], "properties": { "message_id":{"type":"string"},"role":{"type":"string","enum":["user","assistant","tool","system"]} }, "additionalProperties": false },
    "MessageEnd":     { "type": "object", "required": ["message_id"], "properties": { "message_id":{"type":"string"},"usage":{"type":"object"} }, "additionalProperties": false },
    "ContentBlockStart": { "type": "object", "required": ["block_id","content_type"], "properties": { "block_id":{"type":"string"},"content_type":{"type":"string","enum":["text","tool_use","thinking"]} }, "additionalProperties": false },
    "ContentBlockDelta": { "type": "object", "required": ["block_id","delta"], "properties": { "block_id":{"type":"string"},"delta":{"type":"string"} }, "additionalProperties": false },
    "ContentBlockEnd":   { "type": "object", "required": ["block_id"], "properties": { "block_id":{"type":"string"} }, "additionalProperties": false },
    "ToolInputStart":    { "type": "object", "required": ["tool_call_id","tool_name"], "properties": { "tool_call_id":{"type":"string"},"tool_name":{"type":"string"},"risk_class":{"type":"string","enum":["ReadOnly","Mutating","Destructive"]},"ui_hint":{"type":"string"} }, "additionalProperties": false },
    "ToolInputDelta":    { "type": "object", "required": ["tool_call_id","args_delta"], "properties": { "tool_call_id":{"type":"string"},"args_delta":{"type":"string"} }, "additionalProperties": false },
    "ToolInputEnd":      { "type": "object", "required": ["tool_call_id","args_digest"], "properties": { "tool_call_id":{"type":"string"},"args_digest":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$"} }, "additionalProperties": false },
    "ToolResult":        { "type": "object", "required": ["tool_call_id","ok","output_digest"], "properties": { "tool_call_id":{"type":"string"},"ok":{"type":"boolean"},"output_digest":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$"},"output":{"type":"string","description":"May be omitted or redacted by Gateway per §15 trust rules"} }, "additionalProperties": false },
    "ToolError":         { "type": "object", "required": ["tool_call_id","code","message"], "properties": { "tool_call_id":{"type":"string"},"code":{"type":"string"},"message":{"type":"string","maxLength":1024} }, "additionalProperties": false },
    "PermissionPrompt":  { "type": "object", "required": ["prompt_id","tool","deadline","allowed_decisions","capability","control","handler","nonce"], "additionalProperties": false, "properties": { "prompt_id":{"type":"string","pattern":"^prm_[A-Za-z0-9]{8,}$"},"tool":{"type":"object","required":["name","risk_class","args_digest"],"additionalProperties":false,"properties":{"name":{"type":"string"},"risk_class":{"type":"string","enum":["ReadOnly","Mutating","Destructive"]},"description":{"type":"string"},"args_digest":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$"},"args_redacted":{"type":"object"}}},"capability":{"type":"string","enum":["ReadOnly","WorkspaceWrite","DangerFullAccess"]},"control":{"type":"string","enum":["AutoAllow","Prompt","Deny"]},"handler":{"type":"string","enum":["Interactive","Coordinator","Autonomous"]},"deadline":{"type":"string"},"allowed_decisions":{"type":"array","items":{"type":"string","enum":["allow","deny"]}},"nonce":{"type":"string","pattern":"^[A-Za-z0-9_-]{22,}$","description":"Gateway-minted single-use challenge. Gateway MUST generate a fresh ≥128-bit random value per PermissionPrompt and emit it as base64url without padding. The {22,} lower bound is derived from ceil(128/6)=22: shorter base64url strings cannot carry 128 bits of entropy and are rejected at the schema layer. Clients MUST echo this value in canonical_decision.nonce when producing a PDA; Gateway MUST verify equality and enforce single-use via the replay cache defined in UI §11.4.1."},"context":{"type":"object","additionalProperties":false,"properties":{"reasoning_summary":{"type":"string","maxLength":500},"recent_decisions":{"type":"array","items":{"type":"object"}}}},"attestation_required":{"type":"boolean","description":"Gateway-synthesized per UI Profile §11.1; Runner MAY omit"},"accepted_attestation_formats":{"type":"array","items":{"type":"string","enum":["jws","webauthn"]}} } },
    "PermissionDecision":{ "type": "object", "required": ["prompt_id","decision","scope","signer_kid"], "properties": { "prompt_id":{"type":"string","pattern":"^prm_[A-Za-z0-9]{8,}$"},"decision":{"type":"string","enum":["allow","deny"]},"scope":{"type":"string","enum":["once","always-this-tool","always-this-session"]},"signer_kid":{"type":"string"},"reason":{"type":"string"},"billing_tag":{"type":"string","pattern":"^[A-Za-z0-9_:.-]{1,64}$","description":"OPTIONAL; propagated from Agent Card tokenBudget.billingTag per §13.3. Attached at StreamEvent emit time (not part of signed PDA bytes)."} }, "additionalProperties": false },
    "CompactionStart":   { "type": "object", "required": ["trigger_tokens","turns_before"], "properties": { "trigger_tokens":{"type":"integer"},"turns_before":{"type":"integer"} }, "additionalProperties": false },
    "CompactionEnd":     { "type": "object", "required": ["tokens_after","turns_after","memory_note_id"], "properties": { "tokens_after":{"type":"integer"},"turns_after":{"type":"integer"},"memory_note_id":{"type":["string","null"]} }, "additionalProperties": false },
    "MemoryLoad":        { "type": "object", "required": ["loaded_count","tokens"], "properties": { "loaded_count":{"type":"integer"},"tokens":{"type":"integer"},"loaded_notes":{"type":"array","items":{"type":"object","required":["id"],"properties":{"id":{"type":"string"},"title":{"type":"string"}}}} }, "additionalProperties": false },
    "HandoffStart":      { "type": "object", "required": ["handoff_id","source_agent","destination_agent","task_id","direction"], "properties": { "handoff_id":{"type":"string"},"source_agent":{"type":"object"},"destination_agent":{"type":"object"},"task_id":{"type":"string"},"direction":{"type":"string","enum":["incoming","outgoing"]},"transferred_state_scope":{"type":"array","items":{"type":"string"}} }, "additionalProperties": false },
    "HandoffComplete":   { "type": "object", "required": ["handoff_id","result_digest"], "properties": { "handoff_id":{"type":"string"},"result_digest":{"type":"string"} }, "additionalProperties": false },
    "HandoffFailed":     { "type": "object", "required": ["handoff_id","error_code","message"], "properties": { "handoff_id":{"type":"string"},"error_code":{"type":"integer"},"message":{"type":"string"} }, "additionalProperties": false },
    "SelfImprovementStart":    { "type": "object", "required": ["iteration_id","fingerprint"], "properties": { "iteration_id":{"type":"string"},"fingerprint":{"type":"string"} }, "additionalProperties": false },
    "SelfImprovementAccepted": { "type": "object", "required": ["iteration_id","training_score","holdout_score","commit_sha","memory_note_id"], "properties": { "iteration_id":{"type":"string"},"training_score":{"type":"number"},"holdout_score":{"type":"number"},"commit_sha":{"type":"string"},"memory_note_id":{"type":"string"} }, "additionalProperties": false },
    "SelfImprovementRejected": { "type": "object", "required": ["iteration_id","reason"], "properties": { "iteration_id":{"type":"string"},"reason":{"type":"string"},"training_delta":{"type":"number"},"holdout_delta":{"type":"number"} }, "additionalProperties": false },
    "SelfImprovementOrphaned": { "type": "object", "required": ["iteration_id","staging_sha","reason"], "properties": { "iteration_id":{"type":"string"},"staging_sha":{"type":"string"},"reason":{"type":"string"} }, "additionalProperties": false },
    "CrashEvent":        { "type": "object", "required": ["reason","workflow_state_id","last_committed_event_id"], "properties": { "reason":{"type":"string"},"workflow_state_id":{"type":"string"},"last_committed_event_id":{"type":"string"},"stack_hint":{"type":"string","maxLength":4096} }, "additionalProperties": false },
    "PreToolUseOutcome":  { "type": "object", "required": ["tool_call_id","tool_name","outcome"], "properties": { "tool_call_id":{"type":"string"},"tool_name":{"type":"string"},"outcome":{"type":"string","enum":["allow","deny","replace_args"]},"reason":{"type":"string","maxLength":1024},"args_digest_before":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$"},"args_digest_after":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$","description":"Present when outcome=replace_args; equals fingerprint over hook-substituted args"} }, "additionalProperties": false },
    "PostToolUseOutcome": { "type": "object", "required": ["tool_call_id","tool_name","outcome"], "properties": { "tool_call_id":{"type":"string"},"tool_name":{"type":"string"},"outcome":{"type":"string","enum":["pass","replace_result"]},"reason":{"type":"string","maxLength":1024},"output_digest_before":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$"},"output_digest_after":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$","description":"Present when outcome=replace_result; equals digest of hook-substituted result"} }, "additionalProperties": false }
  }
}
```

### 14.1.2 Event Type → Trust Class Mapping (Normative)

This table normatively binds each `StreamEvent.type` to its rendering trust class (see UI Integration Profile §15 for render rules). Profiles that surface events to humans MUST honor this mapping; Gateways MUST reject outbound envelopes that label content against this table.

| StreamEvent.type                                           | Trust class                   | Source of truth |
| ---------------------------------------------------------- | ----------------------------- | --------------- |
| `SessionStart`, `SessionEnd`                               | `system`                      | Session chrome  |
| `MessageStart`, `MessageEnd`                               | per `role` (see note 1)       | `payload.role`  |
| `ContentBlockStart`/`Delta`/`End`                          | per `workflow.status` (note 2)| session state   |
| `ToolInputStart`/`Delta`/`End`                             | per `workflow.status` (note 2)| session state   |
| `ToolResult`, `ToolError`                                  | `tool-output`                 | deterministic   |
| `PermissionPrompt`                                         | `system`                      | always          |
| `PermissionDecision`                                       | per signer origin (note 3)    | signer_kid      |
| `CompactionStart`, `CompactionEnd`                         | `system`                      | Runner chrome   |
| `MemoryLoad`                                               | `system`                      | Runner chrome   |
| `HandoffStart`, `HandoffComplete`, `HandoffFailed`         | `system`                      | Handoff chrome  |
| `SelfImprovementStart`/`Accepted`/`Rejected`/`Orphaned`    | `system`                      | Runner chrome   |
| `CrashEvent`                                               | `system`                      | Terminal chrome |
| `PreToolUseOutcome`, `PostToolUseOutcome`                  | `system`                      | Runner chrome (hook §15) |

Notes on the table:

1. **`MessageStart` / `MessageEnd` role mapping (derived exhaustively from §14.1.1 `role` enum):**
   - `role == "user"` → `user`
   - `role == "tool"` → `tool-output`
   - `role == "system"` → `system`
   - otherwise → `model`
2. **`ContentBlock*` and `ToolInput*` workflow-status mapping (closed coverage over §12.1 `workflow.status` enum):**
   - `status ∈ {Planning, Executing, Optimizing, Blocked, Succeeded, Failed, Cancelled}` → `model` (for `ContentBlock*`) or `model` (for `ToolInput*`)
   - `status == Handoff` → `agent-peer`
   - The class is deterministic from session state; Gateways MUST NOT inspect payload contents.
3. **`PermissionDecision` signer mapping:**
   - Signer is local `Interactive`/`Coordinator`/`Autonomous` → `system`
   - Decision delivered as part of an inbound handoff payload (`workflow.status == Handoff` AND `signer_kid` outside the local trust-anchor set) → `agent-peer` (peer-origin semantics preserved)
4. **`ToolResult`/`ToolError`** is always `tool-output`. The UI MAY additionally apply the UI §15.1 `untrusted` class based on local policy, but the envelope-level `trust_class` MUST remain `tool-output`.

### 14.2 System Event Log

A separate log at `/logs/system.log` (JSON Lines) with categories: `ContextLoad`, `MemoryLoad`, `MemoryDegraded`, `Permission`, `Routing`, `Config`, `Card`, `SelfImprovement`, `Audit`, `Budget`, `Handoff`, `Error`.

Each record: `{ ts, session_id, category, level, code, message, data }`.

### 14.3 Runner Stream Subscription Contract

The Runner MUST expose its session stream at an mTLS-authenticated endpoint:

- **Endpoint:** `https://<runner-origin>/stream/v1/{session_id}`, HTTP/1.1 or HTTP/2, `Accept: text/event-stream` (Server-Sent Events).
- **Authentication:** mTLS REQUIRED (client certificate chains to `security.trustAnchors`) AND bearer token (scope `stream:read:<session_id>` or `stream:read:all` for admin consumers). Tokens are obtained via RFC 8693 token exchange.
- **Framing:** Each SSE `message` event carries one JSON `StreamEvent` (§14.1) in `data:`; `id:` is the event `sequence`; `retry:` omitted.
- **Resume:** Clients reconnecting MUST send `Last-Event-ID: <sequence>`; the Runner replays starting at the next sequence or responds `409 Conflict` with `{error:"ResumeGap"}` if the requested sequence is past the buffer horizon (≥ 1 hour or ≥ 50 000 events, whichever is sooner).
- **Buffering & backpressure:** The Runner MUST buffer at minimum 50 000 recent events or 1 hour for resumption, and MUST NOT exceed 500 000 events or 24 hours (memory-safety ceiling); eviction is oldest-first. Clients that fall > 10 000 events behind the head MUST be terminated per SSE semantics: the Runner emits a final SSE event `event: soa-terminate` with `data: {"error":"ConsumerLagging"}` and then closes the underlying HTTP response. (SSE has no "close frames" per WebSocket semantics; the terminal event + connection close is the SSE-native equivalent.) Clients MUST reconnect. This Runner-side buffer is distinct from the UI Gateway's per-UI replay buffer (UI Profile §17.5) — a Gateway consumes Runner SSE into its own buffer with different horizon (see §24 taxonomy `ConsumerLagging` vs UI close code `4010`).
- **Termination:** The Runner closes the stream with a final `SessionEnd` event when the session terminates per `StopReason` (§13.4). Clients MUST NOT auto-reconnect after `SessionEnd`.
- **Error codes:** Subscription-layer errors use the same §24 taxonomy: `Card*`, `MemoryUnavailable`, `SessionFormatIncompatible`, etc.

This endpoint is the primary consumer surface for UI Gateways (see UI Integration Profile §5.1) and for observability pipelines.

### 14.4 OpenTelemetry Mapping (formerly §14.3 in pre-release numbering; consumers MUST bind to §14.4)

- Each Runner turn MUST produce an OTel span named `soa.turn` with attributes `soa.session.id`, `soa.turn.id`, `soa.billing.tag`, `soa.agent.name`, `soa.agent.version`.
- Each tool invocation MUST be a child span `soa.tool.<tool_name>` with attributes `soa.tool.risk_class`, `soa.permission.decision`.
- StreamEvent.event_id MUST appear as a span event on the turn or tool span.
- `observability.requiredResourceAttrs` are REQUIRED; missing → refuse to start.
- OTel exporter unavailable: the Runner MUST buffer up to 10,000 spans then drop with `ObservabilityBackpressure`. The Runner MUST NOT halt.

### 14.5 Minimum StreamEvent Observability Channel (Normative)

**Rationale.** §14.1–§14.4 define the StreamEvent closed enum, per-type payload schemas, SSE transport at `/stream/v1/{session_id}`, and OTel mapping. Full SSE transport (§14.3) is M4 scope. Many conformance tests (`SV-STR-01..04`, `SV-STR-09/10/11/15`) need an observation surface for StreamEvents that DON'T require the full SSE pipeline — they just need to READ emitted events. This section defines a polling-friendly minimum observability channel that parallels §12.5.4 (audit-sink events) but scoped to the full StreamEvent enum.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /events/recent?session_id=<session_id>&after=<event_id>&limit=<n>
```

- **Transport, auth, rate-limit:** `sessions:read:<session_id>` scope; 120 rpm per bearer; TLS 1.3 / loopback plain.
- **Response schema:** `schemas/events-recent-response.schema.json`.
- **Response body (200):**

```json
{
  "events": [
    { "event_id": "evt_...",
      "sequence": 42,
      "type": "<one of 27 §14.1 closed enum>",
      "session_id": "ses_...",
      "emitted_at": "<RFC 3339>",
      "workflow_state_id": "...",
      "payload": { /* per §14.1.1 payload schema for the type */ }
    }
  ],
  "next_after": "evt_...",
  "has_more": false,
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

Pagination same pattern as `/audit/records` (§10.5.3). Byte-identity excludes `generated_at` and the `generated_at`-analog timestamps inside event payloads where the timestamp is Runner-wall-clock rather than deterministic (e.g., `emitted_at` MAY vary across re-reads if the Runner re-synthesizes from a buffer, but stored `sequence` + `event_id` MUST NOT change).

**Relationship to §14.3 SSE transport.** When §14.3 SSE ships (M4), both channels coexist. Clients preferring push use `/stream/v1/{session_id}`; polling-friendly clients (including `soa-validate`) use `/events/recent`. Events emitted to either channel carry identical `event_id` + `sequence`; cross-channel ordering MUST be deterministic (a sequence value appears at most once in either channel for a session).

**Relationship to §12.5.4 audit-sink-events channel.** §12.5.4 is narrower — returns only the three `AuditSink*` state-transition events, not the full 27-type enum. §14.5 subsumes §12.5.4 for conformance purposes (a validator polling `/events/recent?type=AuditSinkDegraded,...` gets the same data as `/audit/sink-events`). §12.5.4 is retained for compatibility with M2-era validators that bound to it before §14.5 shipped.

**Not-a-side-effect (MUST).** Reading `/events/recent` MUST NOT advance state, emit new events, or write audit rows.

**Conformance linkage.** `SV-STR-OBS-01` (new) — schema + pagination + not-a-side-effect + full-enum coverage. SV-STR-01/02/03/04/09/10/11/15 consume this endpoint for their assertions. SV-STR-12/13/14 remain M4 (require §14.3 full SSE transport with Last-Event-ID / terminal SSE semantics).

### 14.5.2 OTel Span Observability Channel (Normative)

**Rationale.** §14.4 normatively MUSTs OTel span emission (`soa.turn` + `soa.tool.<name>` with required attributes, `StreamEvent.event_id` as span event) but defines no validator-observable surface. In production, impls export spans to operator-configured OTLP collectors; conformance tests can't assume a collector is reachable or inspectable. `SV-STR-06/07` need an in-process surface that mirrors what was (or would have been) exported, independent of collector availability.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /observability/otel-spans/recent?session_id=<session_id>&after=<span_id>&limit=<n>
```

- **Transport, auth, rate-limit:** `sessions:read:<session_id>` scope; 120 rpm per bearer; TLS 1.3 / loopback plain.
- **Response schema:** `schemas/otel-spans-recent-response.schema.json`.
- **Response body (200):**

```json
{
  "spans": [
    {
      "span_id": "<16-hex>",
      "trace_id": "<32-hex>",
      "parent_span_id": "<16-hex or null>",
      "name": "soa.turn | soa.tool.<tool_name>",
      "start_time": "<RFC 3339 nanos>",
      "end_time": "<RFC 3339 nanos>",
      "attributes": { "soa.session.id": "...", "soa.turn.id": "...", "soa.billing.tag": "...", "soa.agent.name": "...", "soa.agent.version": "...", "soa.tool.risk_class": "...", "soa.permission.decision": "..." },
      "events": [ { "name": "StreamEvent", "time": "<RFC 3339 nanos>", "attributes": { "event_id": "evt_..." } } ],
      "status_code": "OK | ERROR | UNSET",
      "resource_attributes": { /* all observability.requiredResourceAttrs per §14.4 */ }
    }
  ],
  "next_after": "<span_id>",
  "has_more": false,
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

Span content MUST be byte-equivalent to what the Runner exports (or would have exported) to a configured OTLP collector per §14.4. If no collector is configured, spans MUST still be emitted to this endpoint — the channel is a conformance observation surface, not an alternative export.

**Byte-identity.** Excludes `generated_at`. The `start_time` / `end_time` values ARE part of byte-identity (they're not Runner-wall-clock synthesized at read; they were recorded at span-emission time and stored).

**Not-a-side-effect (MUST).** Reading `/observability/otel-spans/recent` MUST NOT advance state, emit new spans, or write audit rows.

**Relationship to §14.4 OTLP export.** Both channels coexist: impls MAY export to a configured OTLP collector per §14.4 AND serve this endpoint. The validator reads from this endpoint for deterministic conformance; operators rely on OTLP for production observability. A span appears on both channels with identical `span_id`.

**Conformance linkage.** `SV-STR-06` validates `soa.turn` + `soa.tool.<name>` span presence with required attributes. `SV-STR-07` validates `observability.requiredResourceAttrs` completeness (missing → refuse start, observable via Runner failing `/ready` probe — existing conformance coverage in §5.4; the span endpoint itself asserts non-empty `resource_attributes`).

### 14.5.3 Observability Backpressure Status Endpoint (Normative)

**Rationale.** §14.4 line 2050 specifies "buffer up to 10,000 spans then drop with `ObservabilityBackpressure`" as the exporter-unavailable behavior. §24 defines `ObservabilityBackpressure` as an error-code identifier, but the spec did not define WHERE a validator observes that backpressure has been applied. `SV-STR-08` needs a deterministic surface to assert drop-oldest + named signal happened.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /observability/backpressure
```

- **Transport, auth, rate-limit:** `admin:read` scope (process-global observability, not session-scoped); 60 rpm per bearer; TLS 1.3 / loopback plain.
- **Response schema:** `schemas/backpressure-status-response.schema.json`.
- **Response body (200):**

```json
{
  "buffer_capacity": 10000,
  "buffer_size_current": 0,
  "dropped_since_boot": 0,
  "last_backpressure_applied_at": null,
  "last_backpressure_dropped_count": 0,
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

- `buffer_capacity` MUST be `10000` per §14.4.
- `dropped_since_boot` is a monotonically non-decreasing counter of spans dropped due to backpressure since Runner startup. Reset only on process restart.
- `last_backpressure_applied_at` is the RFC 3339 timestamp of the most recent drop-oldest event; `null` if no backpressure has occurred since boot.
- `last_backpressure_dropped_count` is the drop-count of the most recent backpressure event (one backpressure event MAY drop multiple spans).

**Byte-identity.** Excludes `generated_at`.

**Not-a-side-effect (MUST).** Reading `/observability/backpressure` MUST NOT advance state, emit new spans, reset counters, or write audit rows.

**Conformance linkage.** `SV-STR-08` floods the OTLP exporter (or drives a pinned scenario that forces backpressure with the collector unavailable), polls `/observability/backpressure`, asserts `dropped_since_boot` > 0 AND `last_backpressure_applied_at` > test-start wall-clock.

### 14.5.4 System Event Log Observation Channel (Normative)

**Rationale.** §14.2 defines the System Event Log at `/logs/system.log` (JSON Lines) with closed-set categories `ContextLoad, MemoryLoad, MemoryDegraded, Permission, Routing, Config, Card, SelfImprovement, Audit, Budget, Handoff, Error` and record shape `{ ts, session_id, category, level, code, message, data }`. The file-path surface is the production persistence channel; conformance tests cannot assume shared filesystem access to impl's log file. `SV-MEM-04` observes non-terminal `MemoryDegraded` (per-timeout, pre-threshold) via this log — a pure HTTP observation surface is required.

**Endpoint.** Every conformant Runner MUST expose:

```
GET /logs/system/recent?session_id=<session_id>&category=<cat1,cat2,...>&after=<record_id>&limit=<n>
```

- **Transport, auth, rate-limit:** `sessions:read:<session_id>` scope; 120 rpm per bearer; TLS 1.3 / loopback plain.
- **Query params:**
  - `session_id` REQUIRED (scope-bound to bearer).
  - `category` OPTIONAL comma-separated list of §14.2 categories; omit to return all categories; unknown category → `400 BadRequest`.
  - `after` OPTIONAL opaque record_id; omit to return from buffer start.
  - `limit` OPTIONAL 1–1000, default 100.
- **Response schema:** `schemas/system-log-recent-response.schema.json`.
- **Response body (200):**

```json
{
  "records": [
    {
      "record_id": "slog_...",
      "ts": "<RFC 3339>",
      "session_id": "ses_...",
      "category": "ContextLoad | MemoryLoad | MemoryDegraded | Permission | Routing | Config | Card | SelfImprovement | Audit | Budget | Handoff | Error",
      "level": "info | warn | error",
      "code": "<§24 error code or category-specific code>",
      "message": "<human-readable, ≤ 1024 chars>",
      "data": { /* category-specific payload; optional */ }
    }
  ],
  "next_after": "slog_...",
  "has_more": false,
  "runner_version": "1.0",
  "generated_at": "<RFC 3339>"
}
```

**Byte-identity.** Excludes `generated_at`. The `ts` value IS part of byte-identity (recorded at emission time, stored).

**Not-a-side-effect (MUST).** Reading `/logs/system/recent` MUST NOT advance state, rotate the log, or write audit rows.

**Relationship to `/logs/system.log` file.** Both channels expose identical content. The HTTP endpoint is a view over the same in-process buffer; production operators MAY tail the file, validators MUST use the HTTP endpoint. Records MUST carry matching `ts` + `record_id` across both channels.

**Conformance linkage.** `SV-MEM-04` asserts mid-loop timeout emits a non-terminal `MemoryDegraded` record: Validator drives one timeout (mock configured to time out once), polls `/logs/system/recent?session_id=<sid>&category=MemoryDegraded`, asserts exactly one record with `level=warn` + `code=MemoryDegraded` + session continues (no `SessionEnd` with this `session_id`). Same endpoint subsumes observation of other §14.2 categories for future conformance tests.

### 14.5.5 Post-Crash Observation via Admin Scope (Normative)

**Rationale.** `/events/recent` (§14.5) requires `sessions:read:<session_id>` scope. Bearers are in-memory (§5.4), so a pre-crash session's bearer does NOT survive a process restart. When the Runner's boot-scan (§12) resumes a session with an open bracket, it MUST emit a `CrashEvent` for that session per §14.1. Without an auth path that survives the restart, conformance validators cannot observe the emission — `SV-STR-10` becomes untestable.

**Admin-scope extension to `/events/recent`.** A bearer carrying `admin:read` scope MAY read `/events/recent` with the following extended semantics:

- `session_id` query parameter is OPTIONAL. When omitted, the response returns events across ALL sessions in the current process boot, including sessions that existed only in pre-crash persistence and whose original bearers are no longer valid.
- `type` query parameter MAY filter the result to specific `StreamEvent.type` values (e.g., `?type=CrashEvent`). Unknown types → `400 BadRequest`.
- Rate limit: **60 rpm per bearer** (lower than session-scoped 120 rpm; matches §14.5.3 backpressure + §10.5.3 audit-records pattern).
- All other semantics from §14.5 unchanged: byte-identity excludes `generated_at`; not-a-side-effect; pagination via `next_after` / `has_more`.

**Scope hierarchy clarification.** `/events/recent` accepts EITHER `sessions:read:<session_id>` OR `admin:read`. A request carrying both is treated as admin-scope (broader read access). A request carrying neither returns `401 Unauthenticated`.

**Conformance linkage.** `SV-STR-10` (`HR-04` / crash-event observation): validator (1) drives a session with an open bracket, (2) kills the Runner process mid-turn (§12 simulated-crash pattern), (3) restarts the Runner, (4) polls `/events/recent?type=CrashEvent` with `admin:read` bearer (OR with optional `session_id=<pre-crash session>`), (5) asserts exactly one `CrashEvent` record whose `payload` carries the required fields per §14.1.1 `CrashEvent` schema.

**Privacy note.** `admin:read` scope holders receive broad read access across all sessions in the current process boot. This is consistent with the existing admin-scope surfaces (§14.5.3 `/observability/backpressure`, §10.5.2 `/audit/tail`, §10.5.3 `/audit/records`). Operators MUST ensure `admin:read` is granted only to principals authorized to read audit-class data.

### 14.6 LangGraph Event Mapping (Informative)

**Status.** This subsection is **informative** (non-normative). It documents the expected mapping from LangGraph's `astream_events v2` event surface to the §14.1 closed 27-type StreamEvent enum when an adapter (per §18.5 Adapter Conformance) wraps a LangGraph `StateGraph`. Normative requirements for adapter event emission are in §18.5.3 (Required Conformance Tests) and §18.5.4 (Documented Exceptions); this section supports `SV-ADAPTER-03` by providing the authoritative mapping table against which an adapter's emission is checked.

**Rationale.** LangGraph emits approximately 40 distinct event types from its astream_events surface and callback-handler ecosystem. The SOA-Harness StreamEvent enum is deliberately closed at 27 types to keep §14.1.2 trust-class mapping and §15 hook ordering tractable. The mapping below is lossy (many LangGraph events drop with rationale) and partially synthetic (several SOA event types have no LangGraph equivalent and MUST be synthesized by the adapter). An adapter that deviates from this mapping without documenting the deviation in its own README SHOULD be considered non-conformant against `SV-ADAPTER-03` regardless of whether its StreamEvent bytes validate §14.1.

#### 14.6.1 Event Inventory (40 LangGraph events → 27 SOA types)

**Direct mappings (LangGraph → SOA).** These are 1:1 or 1:N translations where the adapter reshapes LangGraph's payload to match the §14.1.1 $defs schema for the target SOA type.

| LangGraph event | SOA StreamEvent type | Notes |
|---|---|---|
| `on_thread_start` (or root `on_chain_start`) | `SessionStart` | First thread event becomes session start; subsequent thread starts within a session are dropped |
| `on_thread_end` (or root `on_chain_end`) | `SessionEnd` | `stop_reason` derived from chain output; `Completed` by default, `Failed` if `on_chain_error` preceded |
| `on_chat_model_start` | `MessageStart` (role=`assistant`) | `message_id` synthesized from LangGraph `run_id` |
| `on_chat_model_stream` | `ContentBlockDelta` | Token delta maps to `payload.delta`; `block_id` stable per `run_id` |
| `on_chat_model_end` | `MessageEnd` (role=`assistant`) | `usage` carried through from LangGraph's `response_metadata` if present |
| `on_llm_start` | `MessageStart` | Legacy non-chat LLM path; same shape as on_chat_model_start |
| `on_llm_stream` | `ContentBlockDelta` | Legacy streaming path |
| `on_llm_end` | `MessageEnd` | Legacy completion path |
| `on_tool_start` | `ToolInputStart` + synthesized `PermissionPrompt` if §18.5.2 interception fires | `tool_call_id` = LangGraph `run_id`; `risk_class` resolved from §11 Tool Registry lookup |
| `on_tool_stream` | `ToolInputDelta` | Streaming tool arguments (rare in LangGraph) |
| `on_tool_end` | `ToolResult` | `ok=true`; `output_digest` computed per §14.1.1 |
| `on_tool_error` | `ToolError` | `code` derived from error class; `message` truncated to 1024 chars |
| `on_interrupt` | `PermissionPrompt` | LangGraph's human-in-the-loop gate maps to SOA permission prompt; `prompt_id` synthesized; `nonce` minted per §14.1.1 |
| `on_text` | `ContentBlockDelta` | Legacy streaming-text callback |

**Dropped events (with rationale).** These LangGraph events do NOT map to any SOA StreamEvent type. Adapters MUST NOT synthesize an SOA event from them; the events are observable via LangGraph's own telemetry for debugging but are not part of SOA's audit surface.

| LangGraph event | Rationale |
|---|---|
| `on_chain_start` (non-root) | Internal graph-node chain boundaries; SOA sessions do not expose sub-graph structure |
| `on_chain_stream` (non-root) | Internal sub-chain streaming; ContentBlockDelta only models LLM token output |
| `on_chain_end` (non-root) | Internal sub-graph completion |
| `on_chain_error` (non-root) | Bubbles up to `SessionEnd(stop_reason=Failed)` at root; sub-chain errors are not independently observable |
| `on_node_start` / `on_node_end` | Graph-node invocation is internal to LangGraph; SOA models tool-use, not node-dispatch |
| `on_checkpoint_start` / `on_checkpoint_end` | §12 session persistence is observed via `CrashEvent` on resume, not via checkpoint streaming |
| `on_agent_action` | LangChain agent-loop decision; merged into the surrounding `on_tool_start` |
| `on_agent_finish` | Merged into the terminal `on_chain_end` → `SessionEnd` |
| `on_prompt_start` / `on_prompt_end` | Prompt-template rendering is internal; not a user-observable event |
| `on_parser_start` / `on_parser_end` | Output parsing is internal; not a user-observable event |
| `on_retriever_start` / `on_retriever_stream` / `on_retriever_end` / `on_retriever_error` | Retrieval is a tool from the SOA perspective. Adapters that wrap a Retriever as a tool MUST route its invocation through `on_tool_*` rather than the retriever callbacks |
| `on_custom_event` | Adapter-defined payloads have no SOA schema; dropped unless the adapter declares an explicit custom-event → SOA mapping in its README (and such a mapping MUST keep the event set closed at 27 types — adapters MUST NOT add new `StreamEvent.type` values) |
| `on_channel_write` / `on_channel_read` / `on_channel_update` | Internal LangGraph state-channel plumbing; not semantically a user-observable event |
| `on_state_update` | Graph state is internal |
| `on_graph_stream` | Equivalent to `on_chain_stream` at the root; use the chain variant |
| `on_llm_error` | Bubbles to contextual `SessionEnd(stop_reason=Failed)` or to `ToolError` when the LLM call is inside a tool node |

**Total: 14 direct-mapped + 22 dropped = 36 LangGraph-native events accounted for, plus 4+ synthetic-only SOA types below.**

#### 14.6.2 Synthetic Events (SOA → adapter synthesis)

The following SOA StreamEvent types have NO LangGraph equivalent. The adapter MUST synthesize them from its own execution bookkeeping.

| SOA StreamEvent type | Synthesis trigger | Required-by |
|---|---|---|
| `MemoryLoad` | Adapter's §8 Memory layer load-on-context-assembly hook | §18.5.3 SV-ADAPTER-03 assertion |
| `CompactionStart` / `CompactionEnd` | Adapter's §13.2 compaction trigger (if adapter wraps compaction; pass-through adapters omit per §18.5.4 exception list) | §18.5.4 documented exception |
| `PermissionDecision` | Adapter's §10.3 permission-hook result after §18.5.2 interception fires | §18.5.3 SV-ADAPTER-02 assertion (pre-dispatch) |
| `PreToolUseOutcome` / `PostToolUseOutcome` | Adapter's §15 hook pipeline stages (allow/deny/replace_args/replace_result) | §18.5.3 SV-ADAPTER-04 assertion |
| `CrashEvent` | Adapter-resumed sessions after process crash (only when adapter implements §12.6 resume path) | §18.5.4 documented exception when adapter is stateless |
| `HandoffStart` / `HandoffComplete` / `HandoffFailed` | Only under `core+handoff` profile (§17); stateless adapters omit per §18.5.4 | §18.5.4 documented exception |
| `SelfImprovementStart` / `Accepted` / `Rejected` / `Orphaned` | Only under `core+si` profile (§9); adapters omit per §18.5.4 | §18.5.4 documented exception |

#### 14.6.3 Example Trace

A minimal LangGraph agent invoking one tool and completing produces the following LangGraph event sequence:

```
on_thread_start → on_chain_start(root) → on_chat_model_start → on_chat_model_stream (×N)
 → on_chat_model_end → on_tool_start → on_tool_end → on_chat_model_start
 → on_chat_model_stream (×M) → on_chat_model_end → on_chain_end(root) → on_thread_end
```

Under the §14.6.1 mapping, an adapter emits the SOA sequence:

```
SessionStart → MemoryLoad (synth, if §8 configured)
 → MessageStart(assistant) → ContentBlockStart → ContentBlockDelta (×N) → ContentBlockEnd
 → MessageEnd → ToolInputStart → PermissionPrompt (synth, if gated) → PermissionDecision (synth)
 → PreToolUseOutcome (synth) → ToolInputEnd → ToolResult → PostToolUseOutcome (synth)
 → MessageStart(assistant) → ContentBlockStart → ContentBlockDelta (×M) → ContentBlockEnd
 → MessageEnd → SessionEnd
```

The test vector `test-vectors/langgraph-adapter/simple-agent-trace.json` enumerates a concrete realization and is the reference input for `SV-ADAPTER-03`.

#### 14.6.4 Adapter Deviation Protocol

An adapter that cannot honor §14.6.1 exactly MUST:

1. Document the specific LangGraph events that deviate from the table in its own `README.md`.
2. Publish a test vector showing the adapter's emission under a fixture trace.
3. Declare the deviation in its Agent Card under an `adapter_notes.event_mapping_deviations` field (informative; §6.2 schema permits additional properties on this object under the adapter-conformance profile).

Deviations do NOT automatically invalidate SV-ADAPTER-03 — a conforming validator consults the adapter's declared mapping when computing the expected event set. Silent deviation (no README, no Agent Card declaration, no test vector) IS non-conformant.

---

## 15. Verification & Hooks

### 15.1 Hook Invocation Contract

- Hooks are local executables launched by the Runner with a single stdin message (JSON) and expected to exit within a bounded time.
- Default timeout: PreToolUse 5 s, PostToolUse 10 s.
- On timeout: hook is SIGKILL'd, treated as `Deny` (PreToolUse) or logged and ignored (PostToolUse).

### 15.2 Stdin JSON Schema

```json
{
  "hook": "PreToolUse" | "PostToolUse",
  "session_id": "...",
  "turn_id": "...",
  "tool": {
    "name": "mcp__files__write_file",
    "risk_class": "Mutating",
    "args": { ... },
    "args_digest": "sha256:..."
  },
  "capability": "WorkspaceWrite",
  "handler": "Interactive",
  "result": { /* PostToolUse only */ "ok": true, "output_digest": "sha256:..." }
}
```

### 15.3 Stdout and Exit Codes

- Stdout MUST be empty or a single-line JSON `{ "reason": "<string>", "replace_args"?: { ... }, "replace_result"?: { ... } }`.
- `replace_args` is honored by PreToolUse only; `replace_result` by PostToolUse only.

| Code | PreToolUse | PostToolUse |
|------|------------|-------------|
| 0 | Allow | Acknowledge |
| 1 | Treat as error; Deny | Treat as error; log, do not retry |
| 2 | Deny | Force retry (at most once) |
| 3 | Prompt (force Prompt regardless of defaults) | Reserved |
| 127 / 137 / 143 / other | Treated as exit 1 with `HookAbnormalExit` emitted | Same |

### 15.4 Ordering Within §16 Step 5

Within "Tool Execution (with Pre/Post hooks)":

1. Permission resolution (§10.3) → if denied, no hook runs.
2. PreToolUse hooks, in order declared; any `Deny` short-circuits, no tool run.
3. Tool execution.
4. PostToolUse hooks, in order declared.
5. Audit append; StreamEvent emission; session persist commit.

Steps 1, 2, 5 are atomic against a crash: the audit append is the commit boundary. A crash between step 3 and step 5 leaves the event in `phase = inflight` for §12.2 resume semantics.

### 15.5 Harness Regression Suite (HR-01..HR-18)

| ID | Name | Success Condition |
|----|------|-------------------|
| HR-01 | Destructive approval | Destructive tool without Prompt → fails |
| HR-02 | Budget exhaustion pre-call | Projection exceeding budget → StopReason::BudgetExhausted before API call |
| HR-03 | Budget exhaustion mid-stream | Mid-stream overage → cancel + StopReason::BudgetExhausted |
| HR-04 | Crash recovery (pending tool) | Crash with `phase=pending` → replay, idempotent result |
| HR-05 | Crash recovery (committed tool) | Crash with `phase=committed` → no replay |
| HR-06 | Compaction integrity | Post-compaction conversation is prefix-equivalent + Memory MCP push |
| HR-07 | Agent-type enforcement | `explore` cannot invoke Mutating |
| HR-08 | Self-improvement quality gate | Reject iteration if training delta positive but holdout delta < −0.02 |
| HR-09 | Self-improvement marker escape | Reject diff editing bytes outside EDITABLE SURFACES |
| HR-10 | Self-improvement immutable task | Reject diff touching `/tasks/` |
| HR-11 | Permission override tighten-only | `toolRequirements: Prompt → AutoAllow` is rejected |
| HR-12 | Card signature failure | CardInvalid on tampered bytes |
| HR-13 | Tool Pool stale on resume | Removed tool before resume → StopReason::ToolPoolStale |
| HR-14 | Audit hash chain | Any tamper of prev record → verification fails |
| HR-15 | Handoff auth | A2A handoff with invalid token rejected |
| HR-16 | Docker profile (core+si) | Task attempting seccomp-blocked syscall fails within container. Active only under `core+si` profile (§18.3). |
| HR-17 | Memory degradation | 3 consecutive MCP timeouts → StopReason::MemoryDegraded |
| HR-18 | Config precedence | `self_optimize()` arg loosening Card is rejected |

Every HR-\* test has canonical input fixtures shipped with `soa-validate`.

---

## 16. Runtime Execution Model and Cross-Interaction Matrix

### 16.1 State Machine

1. **S1 Input** — Receive user input OR A2A handoff payload OR resume checkpoint.
2. **S2 Context Assembly** — Load memory slice (§8.2), compact if triggered (§13 + §6.2 `compaction.triggerTokens`).
3. **S3 Model Request** — Projection (§13.1); API call.
4. **S4 Tool Detection** — Parse tool calls from stream.
5. **S5 Execute** — For each tool: permission (§10.3) → PreToolUse → tool → PostToolUse → audit + stream + persist (§15.4).
6. **S6 Terminate or Loop** — Evaluate `StopReason`; if none, back to S3.

Termination reasons are the closed `StopReason` enum (§13.4). Conflict resolution between any two of these six phases — and between S-phases and the orthogonal concerns of §10 Permission System, §11 Tool Registry, §12 Session Persistence, §17 A2A Wire Protocol — is governed by the normative matrix in §16.2 below. Implementations MUST resolve every listed interaction exactly as specified; any case not in the matrix MUST halt the turn with `StopReason::UnhandledInteraction` rather than picking an implementation-defined behavior.

### 16.2 Cross-Interaction Matrix (Normative Resolutions)

| Interaction                                     | Summary                                          |
| ----------------------------------------------- | ------------------------------------------------ |
| A2A handoff during self-improvement             | Reject incoming; no outgoing (note 1)            |
| Resume during self-improvement (mid-regression) | Discard staging; emit rejected; return (note 2)  |
| Self-improvement during budget exhaustion       | Rejected (reason `BudgetExhausted`) (note 3)     |
| Compaction during streaming                     | Defer to next `MessageEnd` (note 4)              |
| Nested hook invocation                          | Forbidden; session terminates `HookReentrancy`   |
| Workflow state transfer in handoff              | Messages + WF state + tags only (note 5)         |
| Agent Card changes mid-session                  | `CardVersionDrift` on next turn; new sessions OK |
| OTel exporter failure                           | Buffer 10k spans; drop oldest (`ObservabilityBackpressure`); Runner does not halt |
| `soa-validate` self-compliance                  | Validator is not itself a conformant harness; may ship as stateless CLI |
| Concurrent self-improvement                     | Cluster-wide §12.4 lock; wait ≤ 30 s then `SelfImproveLockBusy` |

Notes on the table:

1. **A2A handoff during self-improvement** — If `workflow.status == Optimizing`, the Runner MUST reject incoming handoff with `HandoffBusy` (`-32050`). Outgoing handoffs are not initiated while `Optimizing`.
2. **Resume during self-improvement (mid-regression)** — On resume with `status == Optimizing`, the staging worktree is discarded and the iteration emits `SelfImprovementRejected` (reason `Aborted`) via StreamEvent. The `SelfImprovementAborted` code in §24 is the terminal-outcome label logged to the audit trail, not a StreamEvent type. Runner returns to `status == Succeeded` (the state prior to Optimizing). `main` is unchanged — the stage-activate protocol guarantees this.
3. **Self-improvement during budget exhaustion** — SI iterations consume a dedicated budget (MUST be ≤ 10% of `maxTokensPerRun` unless the Agent Card sets `self_improvement.budget`). Exhaustion emits `SelfImprovementRejected` (reason `BudgetExhausted`) via StreamEvent and logs `SelfImprovementAborted` to the audit trail; no partial accept.
4. **Compaction during streaming** — Compaction MUST NOT run while a `ContentBlockDelta` sequence is open. It is deferred to the next `MessageEnd`. If triggered mid-stream, the Runner emits `CompactionDeferred`.
5. **Workflow state transfer in handoff** — Transferred: conversation messages, Workflow State (`task_id`, `status == Handoff`, `side_effects` where `phase == committed` only), billing tag, correlation IDs. NOT transferred: Memory MCP content, session file location, audit `prev_hash`. See §17.4.

---

## 17. Agent2Agent (A2A) Wire Protocol

### 17.1 Endpoint and Transport

- A2A JSON-RPC 2.0 endpoint: `https://<origin>/a2a/v1`.
- Transport: HTTPS (TLS 1.3+). Mutual TLS is REQUIRED by default; server certs chain to the peer's `security.trustAnchors`.
- Each request MUST carry a signed JWT in `Authorization: Bearer <jwt>`. JWT claims: `iss` (caller's `name`), `sub` (caller's URL), `aud` (callee's URL), `iat`, `exp` (≤ 300 s from `iat`), `jti` (nonce), `agent_card_etag`.

  **A2A JWT normative profile:**
  1. **Algorithm allowlist.** `alg ∈ {EdDSA, ES256, RS256}`. RS256 requires key size ≥ 3072 bits. Any other `alg` MUST be rejected with `HandoffRejected` (reason `bad-alg`). (SV-A2A-10)
  2. **Signing-key discovery.** The signing key MUST match ONE of:
     - The caller's Agent Card JWS signer `kid` — same trust anchor, same SPKI as the `agent-card.jws` header. Default when the transport is not mutually authenticated. To obtain the caller's Agent Card the receiver MUST issue an HTTPS GET to the URL supplied in the JWT `sub` claim, with a connection timeout ≤ 3 s and a total-request deadline ≤ 5 s; if the fetch fails, times out, or returns a body that does not validate against §6 the receiver MUST reject the handoff with `HandoffRejected` (reason `card-unreachable`). A freshly-fetched Agent Card JWS MAY be cached for up to 60 s (the same window used for `agent_card_etag` in step 4) to avoid per-request fetches.
     - The SPKI of the caller's mTLS client certificate when the handoff is served behind mTLS. The JWT header MUST carry `x5t#S256` (RFC 7515 §4.1.8) whose value matches the SHA-256 of the DER-encoded client certificate presented at the TLS handshake.
     No other discovery mechanism is permitted; a JWT whose signing key cannot be resolved via either path MUST be rejected with `HandoffRejected` (reason `key-not-found`). (SV-A2A-11)
  3. **`jti` replay cache.** Receiver MUST reject a repeated `jti` within a retention window of `exp + 30 s = 330 s` from first observation with `HandoffRejected` (reason `jti-replay`). Cache MAY be per-connection (mTLS-scoped) or per-(`iss`,`aud`) keyed. (SV-A2A-12)
  4. **`agent_card_etag` mismatch.** Receiver MUST fetch the caller's Agent Card at the URL declared in `sub`, compute its JWS digest, and compare with the presented `agent_card_etag`. On mismatch the receiver MUST emit `CardVersionDrift` (§24) and respond JSON-RPC error `-32051` (`HandoffRejected`). Fetched etags MAY be cached for up to 60 seconds to amortize per-request fetches. (SV-A2A-13)
  Absence or malformation of any required claim or header MUST produce JSON-RPC error `-32002` (`AuthFailed`).

### 17.2 Methods

| Method | Params | Result |
|---|---|---|
| `agent.describe` | — | Agent Card bytes + JWS |
| `handoff.offer` | `{ task_id, summary, messages_digest, workflow_digest, capabilities_needed }` | `{ accept: bool, reason? }` |
| `handoff.transfer` | `{ task_id, messages, workflow, billing_tag, correlation_id }` | `{ accepted_at, destination_session_id }` |
| `handoff.status` | `{ task_id }` | `{ status: enum, last_event_id }` |
| `handoff.return` | `{ task_id, result_digest, final_messages }` | `{ ack: true }` |

**Digest-field canonicalization (normative).** Every `*_digest` field in A2A method params has the form `sha256:<64-hex-lowercase>`. The bytes hashed are:

- `messages_digest` — SHA-256 of `JCS(messages)` where `messages` is a JSON array of the caller-side conversation messages to be transferred. Array order is caller-chronological; each message MUST validate against Core §14.1.1 (same schema as StreamEvent `MessageStart..MessageEnd` payloads collapsed into a single object `{role, content, ...}`).
- `workflow_digest` — SHA-256 of `JCS(workflow)` where `workflow` is the full caller-side `workflow` object defined in Core §12.1 (`task_id`, `status`, `side_effects[]` committed-only, `checkpoint`).
- `result_digest` — SHA-256 of `JCS(result)` where `result` is the `{artifacts?, final_state?, signals?}` object produced at task completion. Receivers MUST recompute and compare; mismatch → `HandoffRejected` (reason `digest-mismatch`). (SV-A2A-14)

All three digests are over JCS-RFC-8785-canonical bytes — not raw JSON — so whitespace and key-order differences between sender and receiver do not cause drift. Hexadecimal MUST be lowercase.

### 17.3 Errors (JSON-RPC Error Codes)

| Code | Meaning |
|---|---|
| -32000 | AgentUnavailable |
| -32001 | AgentCardInvalid |
| -32002 | AuthFailed |
| -32003 | CapabilityMismatch |
| -32050 | HandoffBusy |
| -32051 | HandoffRejected |
| -32052 | HandoffStateIncompatible |
| -32060 | TrustAnchorMismatch |

### 17.4 State Transfer Scope

- **Transferred**: messages (full), Workflow State (committed side effects only), `billing_tag`, `correlation_id`, `task_id`.
- **Not transferred**: Memory MCP contents, audit chain, session file path, Tool Pool manifest, `program.md`.
- On receipt, the destination Runner starts a **new** session with `workflow.status = Handoff`, imports the messages, reissues the memory load using its own `in_context_strategy`, and emits `HandoffStart`.

### 17.5 Test Vectors

§18 includes reference request/response pairs for each method and each error. `HR-15` verifies auth.

---

## 18. Compliance Validation Suite (`soa-validate`)

### 18.1 Distribution

- `soa-validate` version 1.0.0 is the official suite. The binary and source are published at `https://soa-harness.org/soa-validate/v1.0.0/` with SHA-256 digest recorded in the release tag.
- The suite is NOT itself required to be SOA-compliant.

### 18.2 MUST-to-Test Map

Every MUST in this specification is assigned at least one test ID. The mapping file `soa-validate-must-map.json` is part of the suite distribution (published at the bundle root; also enumerated in `MANIFEST.json.artifacts.supplementary_artifacts`). A MUST without a test ID is a spec defect.

### 18.3 Conformance Levels

Every profile (including the Self-Improvement and Handoff add-ons) inherits the universal preamble: **§1 Conventions**, **§2 Normative References**, **§19 Governance**, **§22 Non-Goals**, **§24 Error Taxonomy**. These are not optional.

- **Core (required)**: preamble + §4, §5, §6, §7, §8, §10, §11, §12, §13, §14, §15, §16, §18. (§§4–5 added so their normative MUSTs — lean design, failure-path definition, primitive unit-testability, file-system grounding, composition — are inside formal coverage; corresponding tests are `SV-PRIN-01..05` and `SV-STACK-01..02` in the must-map.)
- **Self-Improvement (optional)**: Core + §9, §23. An implementation without self-improvement advertises `self_improvement.enabled = false` and skips §9 tests.
- **Handoff (optional)**: Core + §17. An implementation without A2A advertises no `/a2a/v1` endpoint; `agent.describe` via Card fetch is still required.
- **Full**: Core + Self-Improvement + Handoff. Full is the union of all three add-on profiles and is the only profile permitted to claim `implementation_capabilities = ["core","core+si","core+handoff"]` simultaneously in the Agent Card. Full-profile implementations MUST pass every test in `SV-*` and `UV-*` catalogs including the optional §9 and §17 suites.

Profile names in the Agent Card `implementation_capabilities` field are drawn from the closed set {`core`, `core+si`, `core+handoff`, `full`}. An implementation MUST declare exactly one profile in its Agent Card; declaring `full` is equivalent to declaring all three constituent profiles and is the canonical way to advertise universal capability. A "Core-only" implementation declares `core`, satisfies the preamble and Core sections, and is a valid SOA-Harness v1.0 implementation.

### 18.4 Invocation

```
soa-validate --agent-url https://agent.example.com \
             --profile core|core+si|core+handoff|full \
             --report report.json
```

Exit code `0` means all required tests passed. Non-zero indicates failures enumerated in `report.json`.

### 18.5 Adapter Conformance (Normative)

**Motivation.** Many SOA-Harness deployments begin life as agents built on a third-party orchestration framework (LangGraph, CrewAI, AutoGen, LangChain Agents). An *adapter* is a module that wraps such a framework so the resulting runtime satisfies SOA-Harness wire contracts (§5 bootstrap, §6 Agent Card, §10 permission, §14 StreamEvent, §15 hooks). Adapters are orthogonal to the Conformance Levels defined in §18.3 — an adapter MAY claim Core, Core+SI, Core+Handoff, or Full conformance, but its qualification as an adapter (as distinct from a native Runner implementation) imposes the additional normative requirements in this subsection. §14.6 provides the informative event-mapping companion for LangGraph-based adapters.

#### 18.5.1 Adapter Definition (Normative)

A runtime is an **SOA-Harness Adapter** if and only if:

1. It delegates model dispatch, tool execution, or graph state management to an external orchestration framework ("host framework"), AND
2. It exposes the §5 Required Stack HTTP surface (`/.well-known/agent-card.json`, `/.well-known/agent-card.jws`, `/health`, `/ready`, and at least one StreamEvent emission channel per §14.5) such that `soa-validate` can drive conformance tests against it at a network boundary, AND
3. It declares `adapter_notes.host_framework` in its Agent Card under the adapter-conformance profile with values drawn from the closed set `{"langgraph","crewai","autogen","langchain-agents","custom"}` (case-insensitive; `"custom"` permitted with free-form `adapter_notes.host_framework_details` for frameworks not yet enumerated).

A runtime that implements §5 without delegating to a host framework is a **native Runner** and is NOT subject to §18.5. Native Runners pass `soa-validate` via the existing `SV-*` tests only; `SV-ADAPTER-*` tests are not executed against native Runners.

#### 18.5.2 Permission Interception Points (Normative)

Permission enforcement for adapters is the single hardest correctness invariant in §18.5 because host frameworks typically dispatch tools eagerly. The following requirements are normative and apply to every adapter regardless of host framework:

1. **Pre-dispatch interception.** An adapter MUST intercept every tool invocation **before** the host framework executes the tool. Interception MUST occur at a point where the adapter can:
   a. Identify the tool by its §11 registry name (`mcp__<server>__<tool>` or native equivalent),
   b. Compute the `args_digest` (SHA-256 of JCS-canonicalized arguments per §14.1.1),
   c. Emit a `PermissionPrompt` StreamEvent per §14.1.1,
   d. Block the host framework's tool dispatcher until a `PermissionDecision` is available, AND
   e. Cancel or bypass the dispatch when the decision is `deny`.
2. **Hook pipeline ordering.** The §15.4 ordering within the execution step (permission → PreToolUse hooks → tool → PostToolUse hooks → audit + stream + persist) MUST be preserved by the adapter. The adapter MAY implement this by wrapping the host framework's tool-dispatch entry point (e.g., LangGraph's `ToolNode.invoke`, LangChain's `AgentExecutor._call_tool`, CrewAI's `Task.execute`) or by substituting a permission-aware tool executor at host-framework registration time; either approach is conformant.
3. **No post-dispatch regression.** An adapter MUST NOT implement permission enforcement by inspecting a tool's output after execution (post-dispatch "undo" is not conformant). A permission denial after execution cannot un-do side effects of a `Mutating` or `Destructive` tool; the permission check MUST fire pre-dispatch.
4. **Fallback: advisory mode (permitted, documented).** An adapter that cannot guarantee pre-dispatch interception against its host framework MAY operate in **advisory mode** with the following requirements: (a) the Agent Card declares `adapter_notes.permission_mode: "advisory"`, (b) every tool-invocation event carries a §14 `PermissionDecision` synthesized after-the-fact for audit purposes only, (c) the adapter MUST NOT advertise `implementation_capabilities` containing `"core"` (advisory-mode adapters are non-conformant against Core profile), and (d) the README clearly warns that advisory mode is unsuitable for tools with side effects. Conformance validators MUST treat advisory-mode adapters as failing `SV-ADAPTER-02`.
5. **Observability.** The adapter MUST emit `PermissionPrompt` and `PermissionDecision` StreamEvents on its §14.5 observability channel so that `SV-ADAPTER-02` can verify pre-dispatch ordering by subscribing to the channel and asserting `PermissionPrompt.occurred_at < tool.invoke.occurred_at < PermissionDecision.occurred_at`.

Implementations MAY add PreToolUse/PostToolUse hook wiring (§15) on top of the adapter's permission path; when present, §15.4 ordering is preserved, and the adapter emits `PreToolUseOutcome` / `PostToolUseOutcome` StreamEvents per §14.1.

#### 18.5.3 Required Conformance Tests (Normative)

An adapter claiming Core profile conformance MUST pass the following test sets from `soa-validate`:

| Test family | Requirement | Adapter-specific notes |
|---|---|---|
| `SV-BOOT-01..06` | All MUST pass; bootstrap is adapter-agnostic | Adapter MUST honor §5.3 external bootstrap root; no carve-outs |
| `SV-CARD-*` | All MUST pass; Agent Card schema applies unchanged | Adapter's Card MAY add `adapter_notes.*` fields per §18.5.1 |
| `SV-PERM-01..22` | All MUST pass **except** tests explicitly listed in the §18.5.4 exception enumeration for the declared host framework | Pre-dispatch interception invariant is covered by `SV-ADAPTER-02` below |
| `SV-STR-01..16` | All MUST pass; StreamEvent schema applies unchanged | Event-mapping deviations declared per §14.6.4 |
| `SV-HOOK-01..08` | All MUST pass when adapter implements §15 hooks; adapter MAY declare no hooks in its Agent Card, in which case `SV-HOOK-*` is skipped per profile declaration | |
| `SV-AUDIT-*` | All MUST pass; audit chain is adapter-agnostic | Adapter forwards tool invocations through Runner audit chain |
| `SV-MEM-*`, `SV-BUD-*`, `SV-SESS-*` | MAY be deferred per §18.5.4 documented exceptions | Pass-through adapters declare these deferrals explicitly |
| `SV-ADAPTER-01..04` | All MUST pass (new in v1.0.16) | CardInjection, PermissionInterception, EventMapping, AuditForwarding |

An adapter reports its test result set as `{passed, failed, skipped, documented_exceptions}` in its `release-gate.json` output. The `documented_exceptions` count MUST match the declared exceptions in §18.5.4 exactly; any undeclared skip is a failure.

#### 18.5.4 Documented Exceptions Enumeration (Normative)

An adapter MAY defer the following test families under pass-through semantics, provided the deferral is declared in both the Agent Card (`adapter_notes.deferred_test_families`) and the adapter README:

1. **Memory pass-through (§8):** `SV-MEM-01..08` MAY be skipped if the adapter does not implement its own §8 Memory layer and instead delegates to (a) the host framework's native context store, or (b) a back-end Runner via `/memory/state/:session_id`. The adapter MUST emit `MemoryLoad` StreamEvents synthesized from observable context-assembly points; silent Memory omission is non-conformant.

2. **Budget pass-through (§13):** `SV-BUD-01..07` MAY be skipped if the adapter does not implement its own §13 Token Budget and instead relies on (a) the host framework's native token accounting, or (b) a back-end Runner via `/budget/projection`. The adapter MUST NOT claim `StopReason::BudgetExhausted` without the upstream budget source confirming it.

3. **Session persistence pass-through (§12):** `SV-SESS-01..11` MAY be partially deferred. `SV-SESS-06` (POSIX-only, already deferred) is not reopened by adapter conformance. Adapters that delegate session persistence to a back-end Runner pass `SV-SESS-*` transparently; adapters that manage their own state MUST pass the full set. Stateless adapters (no session persistence) declare `adapter_notes.session_mode: "stateless"` and skip the entire `SV-SESS-*` family; stateless adapters CANNOT claim Core profile conformance (bootstrap and observability assume a session surface).

4. **Handoff (§17) and Self-Improvement (§9):** These are profile-scoped, not adapter-scoped. Adapters claiming `core+handoff` or `core+si` MUST pass the corresponding `SV-A2A-*` / `SV-SI-*` / `SV-GOOD-*` sets; adapters claiming Core only skip them per existing profile rules.

5. **Event-mapping deviations (§14.6.4):** Declared in the adapter README and Agent Card; the conformance validator substitutes the adapter's declared mapping for §14.6's default when computing the expected event set for `SV-ADAPTER-03`.

Exceptions outside this enumerated list are NOT permitted. An adapter that wishes to skip a test family not listed here MUST either (a) implement the underlying capability until the test passes, or (b) NOT claim Core profile conformance. The enumeration is closed at v1.0.16; additions require a §19.4 minor version bump.

#### 18.5.5 Adapter-Specific Invocation

```
soa-validate --agent-url https://adapter.example.com \
             --profile core \
             --adapter langgraph \
             --report report.json
```

The `--adapter` flag (values: `langgraph`, `crewai`, `autogen`, `langchain-agents`, `custom`) enables `SV-ADAPTER-*` test execution and substitutes the adapter-declared event mapping into `SV-ADAPTER-03` expectations. Omitting `--adapter` skips `SV-ADAPTER-*` tests (native Runner mode). A Runner that declares `adapter_notes.host_framework` in its Agent Card but is invoked without `--adapter` fails `SV-ADAPTER-01` (card-vs-invocation-mismatch).

---

## 19. Governance & Spec Evolution

### 19.1 Governing Body

The SOA-Harness specification is maintained by the **SOA-Harness Working Group** (SOA-WG). Charter, membership, and voting rules are published at `https://soa-harness.org/governance`. Spec changes require two-of-three maintainer approvals.

**Bootstrap note.** v1.0 publication relies on the out-of-band bootstrap channels defined in **§5.3 External Bootstrap Root** — SDK-pinned, operator-bundled, or DNSSEC-protected TXT. The release manifest (§9.7.1) itself is NOT the root of trust: its JWS is verified against the bootstrap-supplied trust anchor, which is why the release manifest cannot also be the source of that anchor. The hostname `soa-harness.org` is the canonical publication endpoint; implementers deploying behind a mirror MUST pin the mirror's public key as a trust anchor equivalent (via one of the §5.3 channels), not substitute the hostname.

**Worked `publisher_kid` example (informative).** A release-signing trust anchor and the corresponding MANIFEST JWS header are bound through `publisher_kid`:

```json
// security.trustAnchors[] entry
{ "issuer": "CN=SOA Release Authority", "spki_sha256": "<64-hex>", "uri": "https://soa-harness.org/pki/release", "publisher_kid": "soa-release-v1.0" }
```

```json
// MANIFEST.json.jws header
{ "alg": "EdDSA", "kid": "soa-release-v1.0", "typ": "soa-manifest+jws" }
```

Runner MUST reject any MANIFEST whose JWS `kid` does not equal the `publisher_kid` field of a configured trust anchor.

**Release bundle contents (normative).** Every v1.0 release MUST ship the artifact classes below. Classes 1–3 are enumerated inside `MANIFEST.json` with digests; class 4 is the manifest itself and its detached JWS — the manifest cannot list its own digest without circularity, so its integrity is established by the JWS chain (verified against the §5.3 bootstrap anchor), not by a self-entry.
1. **Normative specifications** — the Core Markdown, the UI Integration Profile, the companion seccomp profile JSON, and both conformance must-maps. All MUST appear in `MANIFEST.json.artifacts.supplementary_artifacts`.
2. **Extracted JSON Schemas** under `schemas/` — one file per `$id` URI referenced in the specs. All MUST appear in `supplementary_artifacts`. Conformance tooling resolves `$id` lookups against this directory or the canonical HTTPS URL.
3. **Test vectors** under `test-vectors/` — first-class conformance inputs. All MUST appear in `supplementary_artifacts`. The vectors currently REQUIRED to be present:
   - `test-vectors/agent-card.{json,json.jws}` — exercised by `SV-CARD-03` / `HR-12` (§6.3).
   - `test-vectors/topology-probe.md` — recipe consumed by `UV-SESS-06†` / `UV-SESS-06a` (UI §5.1).
   - `test-vectors/tasks-fingerprint/` — two-task `/tasks/` fixture + `compute.mjs` producing the canonical `tasks_fingerprint` string; exercised by `SV-GOOD-07` (§23 novelty quota).
   - `test-vectors/permission-prompt/` — paired `PermissionPrompt` + `canonical_decision` + detached PDA-JWS (placeholder signature) demonstrating the §14.1.1 nonce field and the UI §11.4.1 replay/deadline rules; exercised by `UV-P-17..20`.
4. **MANIFEST.json + MANIFEST.json.jws** — the canonical digest set and its detached JWS, signed by the release key identified by `publisher_kid` per §5.3 bootstrap. These two files are the **root** of the digest chain and are therefore NOT listed inside `supplementary_artifacts`; their integrity is established by verifying `MANIFEST.json.jws` against the bootstrap-supplied trust anchor before any other digest is trusted.

Conformance tools (`soa-validate`, `ui-validate`) MUST consume test vectors from the release bundle unambiguously: either by fetching the canonical URL under `https://soa-harness.org/test-vectors/v1.0/` or by reading the mirrored copies in a locally-unpacked bundle. Mismatch between the vector's computed digest and the MANIFEST entry fails conformance with `ManifestDigestMismatch` (§24). New vectors added in patch releases MUST appear in `supplementary_artifacts` of MANIFEST.json; removal of an existing vector is a breaking change subject to §19.4 SemVer rules.

#### 19.1.1 Release-Build Verification Gate (Normative)

The bundle's integrity guarantee depends on the JSON Schemas inlined in this document matching the standalone files under `schemas/`, and on `MANIFEST.json` listing every distributable artifact with its current digest. Any release tagged by the SOA-WG MUST pass the following steps in a CI environment that is fresh (no pre-existing build outputs) before the release tag is pushed:

1. **Schema-extraction parity.** Re-run `node extract-schemas.mjs` with `SOA_BUNDLE_ROOT` set to the repository root. Every file under `schemas/` that is produced from a fenced code block in Core or UI profile Markdown MUST be byte-identical to the committed copy. Any drift fails the release. The script MUST exit non-zero on first drift observation.
2. **MANIFEST regeneration parity.** Re-run `node build-manifest.mjs` against the same tree. The produced `MANIFEST.json` and `MANIFEST.json.jws` MUST be byte-identical to the committed copies (modulo the JWS signature bytes, which are recomputed under the release-signing key).
3. **Must-map zero-orphan check.** Run the orphan-detection script against both `soa-validate-must-map.json` and `ui-validate-must-map.json`; any test defined in `tests` but not referenced from `must_coverage` or `execution_order.phases` fails the release.
4. **Test-vector digest parity.** Recompute SHA-256 over every file listed in `supplementary_artifacts`; mismatch fails the release.
5. **JSON Schema lint.** Every file under `schemas/` MUST parse as a JSON Schema 2020-12 document (syntactic validation); failure fails the release.

The CI pipeline MUST surface a machine-readable artifact (`release-gate.json`) enumerating each of the five checks with its outcome. A release without a passing `release-gate.json` is NOT a conformant v1.0 release and MUST NOT carry a signed MANIFEST. (`SV-GOV-11`)

### 19.2 Errata

- Errata are tracked at `https://soa-harness.org/errata/v1.0/`.
- Errata MUST NOT change any MUST's meaning; clarifications only.

### 19.3 Stability Tiers

Every normative field and MCP tool signature carries a stability tier:

- **Stable**: removed only in a major version bump.
- **Provisional**: may change in a minor version; MUST be noted in the migration guide.
- **Experimental**: may change in any release; MUST be opt-in via an explicit flag.

All fields are **Stable** unless noted otherwise in `stability-tiers.md`.

### 19.4 Versioning

- SOA-Harness uses SemVer. Backward compatibility (wire + on-disk + API surface) MUST be maintained for two minor versions.
- Each minor version MUST ship a migration guide (`migrations/1.x-to-1.y.md`).
- **"Compatible minor" defined:** for any published versions `A.B` and `A.C` of Core (same major `A`, minors `B < C`), `A.C` is compatible with `A.B` iff `C - B ≤ 2`. Companion profiles (e.g., UI Integration Profile) are compatible with a Core minor iff the profile's declared `bound_to_core` is within the same two-minor window. An implementation claiming compliance with `A.C` MUST also pass all MUSTs of `A.B` for the compatibility window.

**Binding Table (Informative).** Entries grow as minor versions release; rows persist for the two-minor compatibility window then age out.

| Core version | Compatible Core versions | Compatible UI Profile (`bound_to_core`) |
|---|---|---|
| 1.0 | 1.0 only (no predecessors) | 1.0 |

#### 19.4.1 Wire-Level Version Negotiation (Normative)

SemVer compatibility (§19.4) defines WHICH peer versions can interoperate. This subsection defines HOW two peers discover and agree on a shared wire version at connection time.

1. **Advertisement.** Every SOA-Harness endpoint MUST advertise its supported Core version set:
   - Agent Card: field `supported_core_versions` (array of `"A.B"` strings; MUST include `soaHarnessVersion`; MAY include earlier minors within the §19.4 two-minor window).
   - A2A `agent.describe` result: the returned Agent Card carries the same field; no separate advertisement is required.
   - UI Gateway discovery document (UI §5.1): field `supported_core_versions` with the same semantics, reflecting the Core version the Gateway's Runner backend supports.
2. **Selection.** A caller establishing a session (A2A handoff, WebSocket/SSE attach, `handoff.offer`, etc.) MUST:
   - Compute the intersection of its own `supported_core_versions` and the callee's advertised set.
   - If the intersection is empty, abort with `VersionNegotiationFailed` (§24) and JSON-RPC error `-32061` on A2A, `ui.version-mismatch` on UI transports. No further traffic is permitted on the connection.
   - Otherwise SELECT the highest version (lexicographically, treating the `A.B` pair as a (major, minor) numeric tuple) present in the intersection. That value is the **negotiated Core version** for the session.
3. **Binding.** The negotiated version MUST be echoed in:
   - A2A JWT claim `soa_core_version` (new REQUIRED claim; receivers MUST reject a handoff whose `soa_core_version` is absent or disagrees with the advertised intersection with `HandoffRejected` reason `version-not-negotiated`).
   - UI session-attach frame `negotiated_core_version` (per UI §6.x session handshake).
   - OTel `resource` attribute `soa.core.version` on every span emitted for that session.
4. **Lifetime.** The negotiated version is frozen for the session's duration; mid-session renegotiation is NOT supported. A peer that updates its supported set during a session MUST close existing sessions before accepting traffic under the new set (graceful drain permitted).
5. **Test coverage.** `SV-GOV-08` (empty-intersection → `VersionNegotiationFailed`), `SV-GOV-09` (highest-common selection across a three-version intersection), `SV-GOV-10` (JWT claim binding on A2A).

#### 19.4.3 Upstream-Protocol Compatibility Horizon (Normative)

SOA-Harness v1.0 §17 was authored against A2A v0.3.1 and MCP revision 2026-04-03; both upstream protocols are independently versioned and may advance faster than SOA-Harness minor releases. To keep the harness usable against newer upstream versions without forcing a synchronous SOA spec bump, the following compatibility horizon applies:

1. **Wire-property baseline (A2A).** A SOA Runner MUST interoperate with any A2A peer whose declared `protocolVersion` differs from `a2a-0.3.x` provided ALL of the following §17 wire properties hold at runtime:
   - JWT carrying `iss`/`sub`/`aud`/`iat`/`exp ≤ 300s`/`jti`/`agent_card_etag` (§17.1).
   - Key discovery through the Agent Card signer `kid` or mTLS SPKI path (§17.1).
   - `*_digest` canonicalization per §17.2.
   - Replay cache with `jti` retention ≥ 330 s.
   - JSON-RPC error code allocation for `HandoffRejected`, `VersionNegotiationFailed`, `CardVersionDrift`.
   If any property fails, the Runner MUST reject the peer with `HandoffRejected` (reason `wire-incompatibility`) and report the failing property in the error payload.
2. **Upstream-major transitions.** Upstream A2A major-version bumps (e.g., `a2a-2.0`) trigger a SOA-Harness **minor** release IF and ONLY IF the new major version breaks any §17 wire property listed above. A new A2A major that changes only fields SOA §17 does not depend on (e.g., expanded task-lifecycle metadata) is absorbed without a SOA spec change. `SV-GOV-12` (reserved in soa-validate-must-map.json) covers this detection logic.
3. **MCP compatibility.** MCP revisions are handled symmetrically via the wire-property list implicit in Core §11 (tool registry) and §14.1.1 (payload schema). A Runner MUST refuse to load an MCP server whose reported capability set violates the Core §11 closed-enum `risk_class` values or the Core §14.1.1 envelope schema; other MCP additions are absorbed silently.
4. **Normative-reference drift.** When the upstream URL for an external normative reference (MCP spec, A2A spec, RFC, JSON Schema meta-schema) becomes unreachable, conformance tools MUST fall back to the release-bundle mirror identified by the MANIFEST digest; see Core §2 drift-policy note.
5. **Ecosystem-tracking cadence.** The SOA-WG reviews upstream A2A and MCP versions on at least a quarterly schedule and publishes either (a) a statement that the current SOA release remains wire-compatible, or (b) a minor-bump timeline for a specific wire-break. Absence of this review constitutes a §19 governance defect, not a wire-compatibility change.

### 19.5 Deprecation

- A field marked deprecated in release N MUST still work through release N+2.

### 19.6 Human-in-the-Loop

- HITL is satisfied only by an `Interactive` handler signing the decision (§10.4).
- HITL is REQUIRED for all high-risk actions (§10.4 definition).

---

## 20. Adoption Checklist

- [ ] `https://<origin>/.well-known/agent-card.json` and `https://<origin>/.well-known/agent-card.jws` (two separate endpoints per §6.1; the JWS path does NOT include `.json.`), signed by a trust-anchor key.
- [ ] MCP servers: tools + memory + benchmarks, with scopes declared.
- [ ] `AGENTS.md` with required H2 headings in order; bounded `@import`.
- [ ] `program.md` + `program.md.jws` if `self_improvement.enabled = true`.
- [ ] `program.md` JWS verifiable against a trust anchor in `security.trustAnchors` per §6.1.1's two-step rule: (1) `x5t#S256` equals SHA-256 of `x5c[0]` DER bytes; (2) chain terminates at an anchor's SPKI. NOT signed by the `publisher_kid` release key — that key signs MANIFEST only.
- [ ] `security.auditSink` configured and reachable (§10.5).
- [ ] `security.coordinationEndpoint` configured if `SOA_COORD_MODE=distributed` (§12.4).
- [ ] `/tasks/` with Harbor-format tasks (pinned images).
- [ ] `agent.py` with required markers.
- [ ] Runner wired for hooks + SelfOptimizer + Permission resolution + OTel exporter.
- [ ] Session persistence + atomic-write verified per OS.
- [ ] Audit trail + WORM sink configured.
- [ ] Host kernel hardening (`user.max_user_namespaces=0` or equivalent) if self-improvement enabled.
- [ ] `soa-validate --profile=core` → pass.
- [ ] `soa-validate --profile=core+si` → pass (if SI enabled).
- [ ] `soa-validate --profile=core+handoff` → pass (if A2A enabled).

---

## 21. Glossary

- **Harbor-format**: Standardized benchmark tasks per §9.6.
- **Aged slice**: Relevant subset of memory per §8.2 algorithm.
- **Significant event**: A state-changing boundary per §12.2.
- **High-risk action**: Per §10.4.
- **Tool Pool**: Session-pinned filtered set of tools per §11.2.
- **Stage-activate**: Two-step commit protocol per §9.5 step 12.
- **Iteration fingerprint**: SHA-256 bundle per §9.5 step 2.
- **PDA (Prompt Decision Attestation)**: Signed attestation of a permission decision.

---

## 22. Non-Goals

This specification explicitly does NOT specify:

- Multi-agent orchestration beyond the single-hop A2A handoff in §17.
- Model-provider tuning (temperature, sampling strategy).
- UI/UX or IDE integration (see companion UI Integration Profile).
- Billing enforcement (beyond tag propagation).
- Cross-tenant memory federation beyond `sharing_policy: tenant`.
- Agent marketplaces or directory services.
- Natural-language policy languages (policy is JSON/JWS/enum only).
- Real-time collaboration between end users and agents.

Including any of these in a future minor version requires a scope-change RFC (§19).

---

## 23. Safety Constraints on Self-Improvement

The self-improvement loop optimizes a measurable aggregate score; Goodhart's Law predicts convergence to benchmark overfit absent mitigations. Mandatory mitigations:

- **Holdout split** (§9.5 step 8): `holdout_fraction` of tasks reserved per iteration by stable hash, not used for acceptance training score. Holdout regression > 0.02 → reject.
- **Immutable task set** (§9.1): `/tasks/` is immutable to the meta-agent.
- **Fingerprint audit** (§9.5 steps 2, 12): iteration fingerprints recorded to the audit chain.
- **Novelty quota (enforced)**: the Runner MUST compute `tasks_fingerprint` using the following deterministic algorithm at each iteration:
  1. Enumerate every immediate child directory of `/tasks/`. A directory is a *task directory* iff it contains a regular file named `task.json` (not a symlink, not a directory). Descend recursively only into immediate child directories that are themselves task directories; subdirectories without `task.json` are ignored entirely (neither enumerated nor descended into).
  2. For each task directory, compute the tuple:
     `{ "task_id": <dir name>, "task_json_sha256": <hex SHA-256 of the JCS-RFC-8785-canonical bytes of task.json>, "dockerfile_sha256": <hex SHA-256 of the raw UTF-8 Dockerfile bytes>, "entrypoint_sha256": <hex SHA-256 of the raw UTF-8 entrypoint.sh bytes, or the literal string "absent" if the file is not present> }`.
  3. Sort the resulting array by `task_id` in code-unit lexicographic order.
  4. Compute `tasks_fingerprint = "sha256:" + hex(SHA-256(JCS-RFC-8785(sorted_array)))`.
  Inputs and outputs are SPECIFIED: `task.json` uses JCS canonicalization (consistent with §1); Dockerfile and entrypoint.sh are hashed raw because their semantics are byte-exact; side artifacts under `inputs/` and `expected/` are intentionally excluded (expected outputs may legitimately change without changing task novelty).
  If `tasks_fingerprint` is unchanged across 10 consecutive accepted iterations, the Runner MUST emit `SelfImprovementSaturation` with reason `NoveltyQuotaUnmet` and MUST refuse further iterations until the fingerprint changes. Only a human-signed commit (non-meta-agent signer, verified against `security.trustAnchors`) MAY introduce the fingerprint change. **Resumption path:** the human maintainer pushes a signed commit to the project's git repository that modifies `/tasks/`; the Runner's next iteration recomputes the fingerprint, observes the change, verifies the commit's signer via `git verify-commit` against trust anchors, records the signer's `kid` in `improvement.log.md`, and resumes. A commit authored or signed by `soa-harness-meta` MUST NOT unlock the quota.
  A reference test vector (two-task `/tasks/` tree with expected `tasks_fingerprint`) is published at `test-vectors/tasks-fingerprint/` and covered by `SV-GOOD-07`.
- **Score ceiling**: If `training_score ≥ 0.98` for three consecutive iterations, the Runner MUST emit `SelfImprovementSaturation` and SHOULD pause optimization until the task set is refreshed.
- **Autonomous escalation rule**: Any score-delta > 0.10 is high-risk (§10.4) and MUST be signed by an Interactive handler.

---

## 24. Error Code Taxonomy

All errors emitted by the Runner, MCP tools, A2A endpoints, or `soa-validate` use stable string codes.

**Card**: `CardInvalid`, `CardSignatureFailed`, `CardVersionDrift`
**AgentsMd**: `AgentsMdInvalid`, `AgentsMdImportDepthExceeded`, `AgentsMdImportCycle`
**Memory**: `MemoryUnavailable`, `MemoryUnavailableStartup`, `MemoryTimeout`, `MemoryDegraded`, `MemoryNotFound`, `MemoryQuotaExceeded`, `MemoryDuplicate`, `MemoryMalformedInput`, `MemoryDeletionForbidden`
**Permission**: `PermissionCapabilityDenied`, `PermissionDenied`, `ConfigPrecedenceViolation`, `HandlerKeyRevoked`, `SuspectDecision`
Note: `PermissionPrompt` is a StreamEvent type, not an error code (§14.1); earlier drafts overloaded the name.
**Session**: `SessionFormatIncompatible`, `ToolPoolStale`, `ToolPoolStaleResume`, `ResumeCompensationGap`
**SelfImprovement**: `BenchmarkAuthFailed`, `ImmutableTargetEdit`, `DockerUnavailable`, `SelfImprovementRejected`, `SelfImprovementAccepted`, `SelfImprovementAborted`, `SelfImprovementOrphaned`, `SelfImprovementMaxIterations`, `SelfImprovementSaturation`, `SelfImproveLockBusy`
**Budget**: `BudgetExhausted`, `BillingTagMismatch`
**Hook**: `HookAbnormalExit`, `HookReentrancy`
**Observability**: `ObservabilityBackpressure`
**Audit**: `AuditSinkDegraded`, `AuditSinkUnreachable`, `AuditSinkRecovered`
**A2A**: `HandoffBusy`, `HandoffRejected`, `HandoffStateIncompatible`, `TrustAnchorMismatch`
**Cluster**: `SelfImproveFencingViolation`
**Host**: `HostHardeningInsufficient`
**Stream**: `ConsumerLagging`, `ResumeGap`, `ManifestDigestMismatch`
**Config**: `ConfigOverride`
**Version**: `VersionNegotiationFailed`
**Privacy**: `SubjectSuppression`

A full JSON catalog is published at `https://soa-harness.org/errors/v1.0.json`.

### 24.1 UI-Surface Mappings (Informative)

Round-trip index for Core error codes that surface through the UI Gateway. UI Profile §21 remains authoritative for the UI-side `ui.*` taxonomy; this table is informative only.

| Core code | UI surface | HTTP status | WS close |
|---|---|---|---|
| `ConsumerLagging` | (SSE terminal event + connection close on Runner→Gateway) → Gateway→UI: `ui.replay-exhausted` or forced reconnect | — | 4010 (UI close) |
| `ResumeGap` | `ui.replay-gap` | 409 | 4002 |
| `HandlerKeyRevoked` | `ui.prompt-signature-invalid` | 401 | — |
| `ManifestDigestMismatch` | `ui.gateway-config-invalid` | 500 | 4004 |
| `HostHardeningInsufficient` | Operational alert only; never reaches UI envelopes | — | — |
| `CardInvalid` / `CardSignatureFailed` / `CardVersionDrift` | `ui.gateway-config-invalid` | 500 | 4004 |

---

## 25. Threat Model (Informative)

This appendix is **informative**. It names the adversaries v1.0 defends against, catalogs the attack surface, and cross-references the normative mitigations so operators can evaluate residual risk. Conformance does NOT require implementing anything from this section beyond what normative sections already mandate; this section exists so that operators can reason about whether the normative bar meets their deployment's threat level.

### 25.1 Assets

| Asset                                          | Why it matters                                                |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Handler private keys (§10.6)                   | Forge `PermissionDecision`; bypass HITL; exfiltrate via `allow` |
| Release-signing key (`publisher_kid`, §5.3.1)  | Forge MANIFEST; poison the entire release-bundle trust chain  |
| Agent Card signing keys                        | Impersonate an agent; redirect handoffs; poison policy fields |
| Session file + audit trail                     | Tamper with history; evade post-incident analysis             |
| `program.md` (SI directive) + `/tasks/` tree   | Bend self-improvement loop to attacker-chosen outcomes        |
| Runner bearer tokens (RFC 8693 stream scope)   | Subscribe to sessions the attacker is not authorized for     |
| UI-side PDA credentials (WebAuthn/JWS)         | Forge user consent                                            |

### 25.2 Adversaries (named, ordered by assumed sophistication)

1. **Network adversary** — on-path MITM, replay, traffic analysis. Capabilities: read/modify/inject TCP streams; serve stale or attacker-chosen responses.
2. **Compromised MCP tool** — a registered tool whose output is attacker-controlled. Capabilities: return malicious `ToolResult` content; attempt prompt injection into the model stream.
3. **Compromised UI client** — an authenticated UI whose keys/DPoP are under attacker control, or a malicious browser extension injecting into a legitimate UI. Capabilities: submit arbitrary `PromptDecision` / commands within the UI's scope.
4. **Rogue Gateway** — a Gateway operator attempting to violate the normative pass-through rules (remove/alter runner-emitted fields, fabricate essential events). Capabilities: full control of WS/SSE transport between UI and Runner.
5. **Compromised handler key** — a specific `handler_kid` under attacker control (e.g., stolen HSM PIN, phished YubiKey). Capabilities: forge signed `PermissionDecision` for any prompt within the key's authorized scope.
6. **Supply-chain attacker on `publisher_kid`** — attacker substitutes a valid-looking but attacker-signed MANIFEST. Capabilities: swap any release-bundle artifact with attacker-chosen bytes before the Runner digest-checks it.
7. **Malicious peer agent over A2A** — a peer claiming to be an honest agent, making handoffs to the Runner. Capabilities: submit handoff offers with attacker-chosen messages/workflow state.
8. **Insider with Runner-host access** — an operator with shell on the Runner host. Capabilities: read files, modify binaries, but NOT extract HSM keys. (Out of scope: HSM extraction; hardware side-channels; physical compromise.)
9. **Prompt-injection / model-level adversary** — attempts to exfiltrate data or alter behavior by planting instructions in tool outputs, memory notes, or peer messages. (Partial scope: §15 content-safety mitigations; full model-alignment is explicitly §22 non-goal.)

### 25.3 Attack-surface catalog with mitigations

| Surface / vector                                  | Primary mitigation (normative)                                   |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| HTTP transport tampering                          | TLS 1.3 required (§1, §2); mTLS for Runner↔Gateway + A2A (§14.3, §17.1) |
| Agent Card swap at fetch time                     | Detached JWS + JCS canonicalization + `security.trustAnchors` pinning (§6.1, §6.1.1) |
| MANIFEST swap                                     | `MANIFEST.json.jws` verified against §5.3 bootstrap anchor; `publisher_kid` pinning |
| Release-signing key compromise                    | §5.3.1 rotation + 4h emergency revocation + `SuspectDecision` flagging |
| Stolen handler key                                | §10.6 CRL (hourly refresh, ≤ 120 min end-to-end revocation SLA); §10.6.1 crl.json schema |
| Replay of a valid PDA                             | UI §11.4.1 single-use `(session_id, nonce)` cache; Gateway-minted per-prompt `nonce` |
| Replay of an A2A JWT                              | §17.1 `jti` replay cache (330 s retention)                       |
| Cross-session PDA token reuse                     | `canonical_decision.session_id` + `handler_kid` equality checks (UI §11.4) |
| Prompt-deadline bypass                            | Uniform `now() ≤ deadline + 30s` check on both PDA paths (UI §11.4.1) |
| Scope elevation via `always-*` without user intent| §11.4 step-up: UV=1 on WebAuthn + `hardware_backed` OR Fresh-Auth Proof on JWS |
| Tool-output prompt injection                      | `trust_class = tool-output` rendering + SAFELIST sanitizer + §15.4 no-resubmission rule (UI §15.1) |
| Artifact-origin CSRF via cookies                  | Cookie-less artifact origin + CORP header + `UV-SESS-06a` topology probe (UI §5.1) |
| Gateway pass-through violation                    | `PermissionPrompt` schema `additionalProperties:false` at Core §14.1.1; essential-flag enforced by UV-E-08 |
| Gateway restart losing nonce state                | UI §11.4.1 web/mobile persistence MUST (Redis/WORM/fsync)        |
| Runner impersonation by Gateway                   | `runner_mtls_ca_digest` pinning per §7.4 + `x5t#S256` in A2A JWT (§17.1) |
| A2A peer forging a caller                         | §17.1 key-discovery rule (Agent Card signer kid OR mTLS SPKI); no other path accepted |
| Stale Agent Card accepted                         | §17.1 `agent_card_etag` mismatch → `CardVersionDrift` + `-32051` |
| `/tasks/` novelty gaming                          | §23 novelty quota + `tasks_fingerprint` + human-signed-commit unlock |
| Audit tampering                                   | §10.5 WORM sink; canonical hash chain; `prev_hash` verification  |
| Container escape during SI                        | §9.7 seccomp profile + cap-drop=ALL + `user.max_user_namespaces=0` + Docker/runc pinned versions |
| `clone3(CLONE_NEWUSER)` namespace escape          | Host sysctl prerequisite (§9.7); §9.7.3 layered defense          |
| UI-asset injection via Runner                     | UI §4 "Runner MUST NOT serve UI assets" + `UV-PRIN-01`           |
| DNS hijack of bootstrap channel                   | DNSSEC required for the TXT-bootstrap channel (§5.3); AD bit enforced |
| Stale CRL allowing revoked key                    | UI §7.3.1 fail-closed past `not_after` or > 2 h unreachable      |
| Audit-sink unavailability masking malicious activity | §10.5.1 three-state degradation (normal / degraded / halted); Runner MUST halt new significant-event execution when audit-sink enters `halted` for > 60 s; metrics `soa_audit_sink_state` observable by operators |
| Privacy-data mishandling / retention overrun      | §10.7 data-class-aware retention + per-subject `privacy.delete_subject`; `data_class` tagging enforced by schema (§14.1.1); violations emit `PrivacyPolicyViolation` at audit layer |
| Cross-border data egress violating residency policy | §10.7.2 layered residency defence: config-declared allowed regions, per-artifact `data_region` field, Runner egress block with `ResidencyViolation` on mismatch; operator-owned outer boundary (network egress policy) is layer-2 defense |
| Trust-class mis-labelling at event-type boundary  | §14.1.2 closed `type → trust_class` mapping enforced by Runner; unknown `type` → `UnknownEventType` rather than defaulting to a permissive class; UV-E-08 verifies closed-set behavior |
| Trust-signal spoofing in UI chrome                | UI §12.3 normative indicator rules (position, dismissability, accessibility); UI MUST render from Gateway-labelled `trust_class` only, never re-compute; UV-TRUST-* verifies rendering parity across profiles |
| Log-based PII exfiltration                        | UI §15.6 logging-privacy redaction rules; Gateway MUST strip fields tagged with `data_class` value `personal`, `sensitive-personal`, or `confidential` (closed enum per §10.7) from any log output before disk write; UV-LOG-* verifies redaction under representative payloads |
| Replay-buffer memory exhaustion / poisoning       | UI §17.5 `buffer_events` / `buffer_seconds` ceilings + eviction policy; Gateway MUST reject subscribe with `ui.replay-gap` when requested sequence is before retention horizon; UV-REPL-* verifies buffer bounds |

### 25.4 Out of scope / residual risk

The following are explicitly NOT defended against by v1.0 and are declared §22 Non-Goals or accepted residual risk:

- **Hardware / HSM extraction.** Physical attacks on HSMs and TPMs are out of scope; v1.0 assumes HSM private keys are extractable only by adversaries with physical access + hardware attack capability.
- **Side-channel analysis** on handler keys (timing, power, speculative-execution exfiltration). Mitigation is HSM policy, not spec-level.
- **Model alignment and prompt-injection-by-design.** Content-safety rules (§15) reduce damage per event, but the spec does not claim to prevent a sufficiently-crafted prompt injection from steering the agent. Model-level alignment is §22 non-goal.
- **Availability / DoS at scale.** Rate limits (UI §17) bound per-session cost; volumetric DDoS defense at the network edge is operator responsibility.
- **Insider with full HSM + root + audit-sink write access.** An adversary with simultaneous possession of the release key, host root, and audit-sink admin privileges can rewrite history. v1.0's compensating control is §25.1's M-of-N release signing (RECOMMENDED) + audit-sink WORM semantics (§10.5).
- **Clock-skew attacks beyond the ±30 s / ±60 s windows** declared in §1. Operators deploying in environments without NTP MUST treat this as a deployment gap.

### 25.5 Relationship to other sections

- §1 clock-skew tolerances constrain the time windows for replay caches (§17.1 `jti`, UI §11.4.1 prompt nonce).
- §5.3 + §5.3.1 establish the bootstrap root without which MANIFEST verification is circular.
- §10 Permission System + §10.6 / §10.6.1 key management are the HITL backbone; compromises here are the highest-severity incidents.
- §15 Content Safety + §15.4 Tool-Output Injection Defense handle model-adjacent risks within the stated scope.
- §22 Non-Goals explicitly enumerates what v1.0 declines to defend against; operators whose threat model exceeds v1.0's scope MUST layer additional controls outside the harness.

Threat-model updates are NOT breaking spec changes under §19.4 SemVer rules — they are informative revisions to this appendix. Normative tightening triggered by a new adversary class is a minor version bump; a new required mitigation is a major version bump.

---

**Conformance**
An implementation is SOA-Harness v1.0 compliant at a chosen profile (Core, Core+SI, Core+Handoff, Full) if and only if it satisfies every MUST in the sections that profile covers, and `soa-validate --profile=<p>` exits 0 against it.
