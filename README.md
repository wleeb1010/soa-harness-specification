# SOA-Harness Specification v1.0

Normative specification bundle for **Secure Operating Agents (SOA)** — a conformance-testable harness for agentic runtimes and their UI gateways, centering cryptographic integrity, permission gating, hash-chained audit, and signed-artifact provenance.

**Release documents** for adopters reading at v1.0.0:
- [`RELEASE-NOTES.md`](./RELEASE-NOTES.md) — adopter-facing narrative: what this is, who should adopt now, 90-second getting-started
- [`CHANGELOG.md`](./CHANGELOG.md) — line-by-line capability summary for v1.0.0
- [`ERRATA.md`](./ERRATA.md) — per-patch errata for versions after v1.0.0
- [`docs/errata-policy.md`](./docs/errata-policy.md) — editorial / minor / breaking decision tree
- [`GOVERNANCE.md`](./GOVERNANCE.md) — honest single-maintainer acknowledgment, issue-reporting paths

**Conformance-label stance at v1.0.0:**
- **"Reference Implementation"** label — self-assigned for the TypeScript reference runtime (`@soa-harness/*`) and Go conformance harness (`soa-validate`), both shipping under the same v1.0.0 tag.
- **"Bake-Off Verified"** label — requires one independent second-party implementation whose `soa-validate` output converges to zero divergence. Until one exists, downstream adopters claim Reference-level conformance only.

The [UI Gateway Reference Sketch](./SOA%20UI%20Gateway%20Reference%20Implementation%20Sketch.md) ships alongside the spec as illustrative TypeScript — explicitly labeled non-normative. The production Gateway reference lives in the `soa-harness-impl` sibling repository.

Normative specification bundle for **Secure Operating Agents (SOA)** — a conformance-testable harness for agentic runtimes and their UI gateways, centering cryptographic integrity, permission gating, hash-chained audit, and signed-artifact provenance as the core guarantees on every page.

The bundle is self-contained: every MUST in the spec has a corresponding test ID in one of the two `*-validate` must-maps, every referenced JSON Schema is published as a standalone `.schema.json` under [`schemas/`](./schemas/), and every enumerated artifact is digest-pinned in [`MANIFEST.json`](./MANIFEST.json) (JCS-RFC-8785 for JSON, raw-utf8 for Markdown). `MANIFEST.json` itself is the root of the digest chain — per Core §19.1 it is not self-listed; its integrity is established by the detached JWS [`MANIFEST.json.jws`](./MANIFEST.json.jws) verified against the §5.3 bootstrap anchor.

## Artifacts

### Normative specs (Markdown)

| File                                                                                                   | Role                       |
| ------------------------------------------------------------------------------------------------------ | -------------------------- |
| [Core Spec](./SOA-Harness%20Core%20Specification%20v1.0%20%28Final%29.md)                              | Runner normative spec      |
| [UI Integration Profile](./SOA-Harness%20UI%20Integration%20Profile%20v1.0%20%28Final%29.md)           | Gateway normative spec     |
| [UI Gateway Reference Sketch](./SOA%20UI%20Gateway%20Reference%20Implementation%20Sketch.md)           | Non-normative TS reference |

- **Core spec** — Agent Card, Permission System, Session Persistence, StreamEvent envelope, Self-Improvement loop, Audit Trail, Host Hardening, A2A Handoff, Error Taxonomy.
- **UI profile** — transport (WebSocket / SSE / REST / Local IPC), OAuth + DPoP + WebAuthn enrollment, envelope wrapping, content safety, PDA (JWS + WebAuthn), per-UI replay, accessibility.
- **Reference sketch** — illustrative TypeScript covering load-bearing Gateway paths only.

### Conformance must-maps (JSON)

| File                                                         | Role                              |
| ------------------------------------------------------------ | --------------------------------- |
| [`soa-validate-must-map.json`](./soa-validate-must-map.json) | Core MUST → test ID → phase       |
| [`ui-validate-must-map.json`](./ui-validate-must-map.json)   | UI MUST → test ID → phase         |

### Companion artifacts

| File                                                           | Role                            |
| -------------------------------------------------------------- | ------------------------------- |
| [`soa-harness-profile-v1.json`](./soa-harness-profile-v1.json) | §9.7 Docker seccomp profile     |
| [`schemas/`](./schemas/)                                       | 14 standalone JSON Schemas      |
| [`MANIFEST.json`](./MANIFEST.json)                             | Release digest set              |
| [`MANIFEST.json.jws`](./MANIFEST.json.jws)                     | Detached MANIFEST signature     |
| [`test-vectors/agent-card.{json,json.jws}`](./test-vectors/)   | SV-CARD-03 / HR-12 vector       |
| [`test-vectors/topology-probe.md`](./test-vectors/topology-probe.md) | UV-SESS-06† / 06a recipe  |
| [`test-vectors/tasks-fingerprint/`](./test-vectors/tasks-fingerprint/) | SV-GOOD-07 fixture        |
| [`build-manifest.mjs`](./build-manifest.mjs), [`extract-schemas.mjs`](./extract-schemas.mjs) | Node ≥ 18 build tools |

Notes on the artifact table:
- **`soa-harness-profile-v1.json`** enforces the §9.7 deny-by-default allowlist. Baseline applies on `x86_64`, `aarch64`, `riscv64`, `s390x`, `ppc64le`; the `CLONE_NEW*` arg filter is gated to the first three via `includes.arches`.
- **`schemas/`** contains: `agent-card`, `session`, `stream-event`, `stream-event-payloads`, `harbor-task`, `release-manifest`, `crl`, `gateway-config`, `ui-envelope`, `ui-derived-payloads`, `canonical-decision`, `locale-map`, `wcag-addendum`.
- **`MANIFEST.json`** lists every artifact with SHA-256 digest + canonicalization rule; validates against `schemas/release-manifest.schema.json`.
- **`MANIFEST.json.jws`** is signed with the v1.0 release key (Ed25519; fingerprint recorded in `keys/soa-release-v1.0.pub`); verifiers chain to the bootstrap anchor per §5.3 and the `publisher_kid` in MANIFEST.
- **Build tools** run from the repo root or with `SOA_BUNDLE_ROOT` set; they regenerate `schemas/` and `MANIFEST.json` after any spec edit.

## Conformance profiles

- `core` — baseline Runner conformance (Agent Card, Permissions, Session Persistence, Stream, Hooks, Tool Pool, Audit Trail, Observability).
- `core+si` — adds Self-Improvement loop + Docker isolation + Harness Regression suite `HR-01…HR-18`.
- `core+handoff` — adds A2A handoff (JSON-RPC 2.0 wire protocol per §17).
- UI Profile — web / ide / mobile / cli, each with their own test subset.

## Operator documentation

Non-normative guidance for bringing a deployment online lives under [`docs/`](./docs/). These files are not part of the v1.0 normative bundle and are not enumerated in `MANIFEST.json`.

- [`docs/deployment-environment.md`](./docs/deployment-environment.md) — OS / kernel / library / network prerequisites organized by conformance profile, with a summary checklist and cross-reference to authoritative spec sections.

## Gateway discovery document

The UI Gateway publishes its configuration at `https://<gateway>/.well-known/soa-ui-config.json` (validates against [`schemas/gateway-config.schema.json`](./schemas/gateway-config.schema.json)). The schema's top-level `required` list now includes every load-bearing discovery field (plus two conditional requirements covered by `if/then`). Required fields:

- `issuer`, `authorization_endpoint`, `token_endpoint` — OAuth 2.1 metadata
- `ws_endpoint`, optional `sse_endpoint`, `rest_base`, optional `local_ipc` — transport surfaces
- `scopes_supported`, `supported_profiles`, `attestation_formats_supported` — capability declaration
- `webauthn_rp_id` — REQUIRED via `if/then` when `supported_profiles` contains any of `web`, `ide`, or `mobile`; OPTIONAL for `cli`-only deployments
- `replay` — buffer sizing (`buffer_events ≥ 10 000`, `buffer_seconds ≥ 1800`, `max_backfill ≤ 5000`, `grace_seconds ≥ 600`)
- `artifacts_origin` — cookie-less origin for tool-output artifacts; MUST differ from the UI origin by eTLD+1 (UI §5.1 MUST; `UV-SESS-06a`)
- `runner_endpoint` — Runner base URL; either `^https://…` or the literal `"loopback"` sentinel declaring co-hosted deployment. When `loopback`, UI §7.4 requires routing via `127.0.0.0/8` / `::1/128` / a UNIX domain socket, matching process-identity check (`SO_PEERCRED` / `LOCAL_PEEREID` / `GetNamedPipeClientProcessId`), and an OTel `soa_ui_cohost_mode=true` span label.
- `runner_mtls_ca_digest` — SHA-256 of the DER-encoded CA root; Gateway MUST verify on every outbound mTLS handshake to the Runner; mismatch fails the handshake with `ui.runner-mtls-failed`.
- `stream_scope_template` — RFC 6570 Level 1 template (pattern-validated by the schema) for the token-exchange scope. Default: `stream:read:{session_id}`. Admin consumers MAY use `stream:read:all`.

All three runner fields are covered by `UV-A-16`.

## Diagnostic counters vs error envelopes

UI §21 is a closed set of **emitted** error codes (`ui.auth-required`, `ui.replay-gap`, ...). §21.1 covers **diagnostic counters** that appear in observability metrics but never surface as error envelopes. `UV-ERR-01` tests the closed set; counters are explicitly excluded.

## Trust bootstrap (non-circular)

Agent Card JWS verification chains to a trust anchor published under `security.trustAnchors`, but the trust anchor itself cannot be discovered from any artifact in this bundle — that would be circular. Core §5.3 therefore REQUIRES that the initial trust root be delivered *out of band* via exactly ONE of three channels per deployment:

- **SDK-pinned** — the operator's SOA client SDK hard-codes the `publisher_kid` + SPKI hash.
- **Operator-bundled** — a trusted `initial-trust.json` shipped via configuration management or signed-container base image.
- **DNSSEC-protected TXT record** — `_soa-trust.<deployment-domain>` carries the `publisher_kid` and SPKI digest with the AD bit set.

The release manifest (§9.7.1) is NOT itself the root of trust; its JWS is verified against the bootstrap-supplied anchor. §19.1 explicitly reflects this. Runners MUST refuse to load Agent Cards absent a valid bootstrap (emit `HostHardeningInsufficient` reason `bootstrap-missing`). Tests: `SV-BOOT-01..03`. The inline Agent Card schema now makes `security` a top-level REQUIRED field.

## Signing profile (per artifact)

All signed artifacts conform to a normative per-artifact JWS profile (Core §6.1.1):

| Artifact | Serialization | Signing input | Allowed `alg` | Required `typ` | Required headers |
|---|---|---|---|---|---|
| Agent Card JWS | detached | JCS(agent-card.json) | EdDSA, ES256, RS256 ≥ 3072 | `soa-agent-card+jws` | `alg`, `kid`, `x5c` |
| program.md JWS | detached | raw UTF-8 bytes | EdDSA, ES256 | `soa-program+jws` | `alg`, `kid` |
| MANIFEST JWS | detached | JCS(MANIFEST.json) | EdDSA, ES256 (RS256 forbidden at the bootstrap layer) | `soa-manifest+jws` | `alg`, `kid` (= `publisher_kid`) |
| PDA-JWS (UI §11.4) | compact | BASE64URL(JCS(canonical_decision)) | EdDSA, ES256, RS256 ≥ 3072 | `soa-pda+jws` | `alg`, `kid` |

Core §1 now separates **JSON signing inputs** (JCS-RFC-8785 required) from **non-JSON signing inputs** (raw UTF-8 bytes; JCS does not apply — `program.md` is Markdown, not JSON). Core §2 RFC-8785 reference list reflects the split. Tests: `SV-SIGN-01..03`.

### A2A digest canonicalization

A2A method params use `*_digest` fields of the form `sha256:<64-hex-lowercase>`. Per Core §17.2, the hashed bytes are `JCS(messages)`, `JCS(workflow)`, or `JCS(result)` — never raw JSON. Receivers MUST recompute and compare; mismatch → `HandoffRejected` (reason `digest-mismatch`). Test: `SV-A2A-14`.

### Always-* step-up (UI §11.4)

`scope ∈ {always-this-tool, always-this-session}` requires step-up evidence:

- **PDA-WebAuthn:** `authenticatorData.flags.UV == 1` AND `hardware_backed == true` on the enrolled credential (derived from a known HSM-anchored attestation format — `packed`, `tpm`, `android-key`, `apple`; `none`/`self` attestation does NOT qualify).
- **PDA-JWS:** hardware-backed enrollment (via OS-keystore, TPM quote, TEE quote, or PIV attestation) PLUS a Fresh-Auth Proof — a separate `soa-fresh-auth+jwt` tied to the PDA by `pda_digest` and bounded by `iat + 300 s`.

Enrollment records now carry `hardware_backed: boolean` and `attestation_format`.

## Prompt-decision anti-replay

Every `PermissionPrompt` now carries a Gateway-minted `nonce` (required ≥ 128 bits, ASCII URL-safe). UI §11.4.1 Prompt Nonce Replay Cache governs verification:

1. `canonical_decision.nonce` MUST equal `PermissionPrompt.payload.nonce` — both PDA formats.
2. `(session_id, nonce)` MUST be single-use — replay → `ui.prompt-signature-invalid` (reason `replay`).
3. Deadline enforced uniformly on PDA-JWS and PDA-WebAuthn — past deadline → `ui.prompt-expired`.
4. Replay cache survives Gateway restart within `deadline + skew` horizon.

Signer-identity equality is also normative: `canonical_decision.handler_kid == PDA-JWS header.kid` (or `== PDA-WebAuthn wrapper.handler_kid == enrolled credential kid`); `canonical_decision.handler_kid` is authoritative for audit. Tests: `UV-P-17..20`, `UV-CMD-06`.

## A2A handoff auth

Core §17.1 now pins the A2A JWT profile: algorithm allowlist {EdDSA, ES256, RS256 ≥ 3072}; signing-key discovery (Agent Card signer `kid` OR mTLS SPKI via `x5t#S256`); `jti` replay cache with 330 s retention; `agent_card_etag` mismatch emits `CardVersionDrift` + JSON-RPC `-32051`. Tests: `SV-A2A-10..13`.

## Handler-key revocation

Handler keys enrolled at the Gateway (§7.3) are revoked through the Core §10.6.1 trust-anchor CRL — no separate UI-side CRL schema. The Gateway's local cache is governed by UI §7.3.1 (`UV-P-16`):

- Refresh at least **once per hour** per trust anchor.
- Past `crl.not_after` with no successful refresh → reject every `PermissionDecision` under that anchor with `ui.prompt-signature-invalid` (reason `crl-stale`).
- After **> 2 hours** of fetch failure → emit `ui.gateway-config-invalid` (reason `crl-unreachable`) and reject new decisions until recovery.
- Expose `soa_ui_crl_cache_age_seconds` and `soa_ui_crl_refresh_failures_total` metrics.

## Test vectors as normative artifacts

Per Core §19, the following vectors are **required** release-bundle content — conformance tools MUST consume them either from the canonical URL under `https://soa-harness.org/test-vectors/v1.0/` or from a locally unpacked bundle. Digest mismatch versus MANIFEST.json fails conformance with `ManifestDigestMismatch` (§24); removal of an existing vector is SemVer-breaking (§19.4).

| Vector | Covers |
|---|---|
| `test-vectors/agent-card.{json,json.jws}` | `SV-CARD-03`, `HR-12` |
| `test-vectors/topology-probe.md` | `UV-SESS-06†`, `UV-SESS-06a` |
| `test-vectors/tasks-fingerprint/` + `compute.mjs` | `SV-GOOD-07` (Core §23 novelty quota) |
| `test-vectors/permission-prompt/` (prompt + decision + PDA-JWS) | `UV-P-17..20` (UI §11.4.1 prompt-nonce / replay / deadline) |
| [`test-vectors/RESERVED.md`](./test-vectors/RESERVED.md) | Reserved test IDs (UV-ERR-02..17, UV-P-22, SV-SESS-12, UV-TRUST-01..03, UV-E-09, UV-LOG-01..03, UV-REPL-01..04) — scope locked, vectors pending |

## Conformance stance

Every MUST in either spec has a corresponding test ID in one of the two must-maps. Test IDs listed in [`test-vectors/RESERVED.md`](./test-vectors/RESERVED.md) are normatively cited but do not yet have published reference vectors; conformance tools running in `--strict` mode treat them as "assertion present, evidence pending" and implementers SHOULD author local vectors matching the reserved scope. Signing paths REQUIRE a library-grade RFC 8785 JCS implementation (the in-repo [`build-manifest.mjs`](./build-manifest.mjs) JCS is a documented subset — integer/string content only).

## Rebuilding the bundle

After editing the spec Markdown:

```bash
# Re-extract schemas from the updated MDs
node extract-schemas.mjs

# Rebuild MANIFEST.json with fresh SHA-256 digests
node build-manifest.mjs
```

Both scripts are idempotent and only touch `schemas/` and `MANIFEST.json`.

## Verifying digests

```js
// Node ≥ 18
import fs from "node:fs";
import crypto from "node:crypto";

const manifest = JSON.parse(fs.readFileSync("MANIFEST.json", "utf8"));
for (const a of manifest.artifacts.supplementary_artifacts) {
  const bytes = a.canonicalization === "JCS-RFC-8785"
    ? canonicalizeJSON(JSON.parse(fs.readFileSync(a.path, "utf8")))  // see build-manifest.mjs for the JCS helper
    : fs.readFileSync(a.path);
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  console.log(`${a.name}: ${actual === a.sha256 ? "OK" : "MISMATCH"}`);
}
```

## Conformance profiles in detail

**Core profile (§18.3)** now includes §§4 and 5 so the lean-design / failure-path / primitive-testability / file-system-grounded / composition / stack-completeness MUSTs are formally in scope. `SV-PRIN-01..05` and `SV-STACK-01..02` cover them. UI §4 ("Runner MUST NOT serve UI assets") is exercised by `UV-PRIN-01`.

## Security posture

- **Trust bootstrap:** §5.3 (SDK-pinned / operator-bundled / DNSSEC TXT) + §5.3.1 rotation (≥ 365 d scheduled; ≤ 4 h emergency compromise response; ≥ 30 d overlap; M-of-N signing RECOMMENDED) + §5.3.2 anchor-disagreement / split-brain fail-closed rules driven by `SOA_BOOTSTRAP_CHANNEL`. Tests: `SV-BOOT-04..06`. The operator-bundled file is now schema-pinned (`schemas/initial-trust.schema.json`).
- **Signing profile:** §6.1.1 pins `x5c` to leaf-first chain ordering with mandatory intermediates (`SV-SIGN-04`).
- **Version negotiation:** §19.4.1 defines wire-level supported-set intersection, highest-common selection, and session-lifetime binding on A2A (`soa_core_version` JWT claim) and UI session-attach; `VersionNegotiationFailed` on empty intersection (`SV-GOV-08..10`).
- **Privacy + data governance:** §10.7 adds `data_class` tagging, `privacy.delete_subject` / `privacy.export_subject` MCP tools, `SubjectSuppression` audit records, retention categories with a 24-hour sweep, and an optional `security.data_residency` geographic pin (`SV-PRIV-01..04`).
- **Operational probes:** §5.4 pins `/health` (liveness) and `/ready` (readiness) endpoints on Runner and Gateway with explicit not-ready reason codes (`SV-OPS-01..02`).
- **Release gate:** §19.1.1 requires CI to re-run schema extraction + MANIFEST build before any release tag; drift against the committed bundle fails the release (`SV-GOV-11`).
- **`program.md` signing:** §6.1.1 now pins a two-step signer resolution — `x5t#S256` binds the end-entity cert, `security.trustAnchors[].spki_sha256` binds the chain root, and `x5c` is now a required header so the verifier has the full chain (`SV-SIGN-05`).
- **Token exchange + possession proof:** UI §7.4 pins RFC 8693 to delegation semantics (`act` claim with Gateway as actor), REQUIRED audience and claim set (`UV-A-08a`); §7.6 extends possession proof across REST/SSE/WS/IPC transports (`UV-A-10a`).
- **Audit runtime:** Core §10.5 now records `subject_id` on every audit line (tied to §10.7 privacy exports); §10.5.1 pins a three-state degradation model (healthy / degraded-buffering / unreachable-halt) with `AuditSink*` error codes (`SV-PERM-19`).
- **Residency:** §10.7.2 enforces layered defence — tool-declared `data_processing_location` is primary; network signals (DNS/SNI/reverse-lookup) are supporting evidence only (`SV-PRIV-05`).
- **Tool idempotency:** Core §12.2 requires tools to retain dedupe state ≥ 1 h OR ≥ session-resume grace, whichever is longer; non-conformant tools rejected at pool assembly (`SV-SESS-11`).
- **Threat model:** Core §25 (informative) catalogs 9 named adversary classes, 22 attack-surface vectors, and cross-references every normative mitigation. Out-of-scope / residual-risk items are explicit (HSM extraction, model-level prompt injection, volumetric DoS, ±30s clock-skew bound). Operators whose threat model exceeds v1.0 MUST layer additional controls outside the harness.

## Version

`spec_version: "1.0"` — released `2026-04-18`.

Governance and errata policy: Core §19. SemVer binding table: Core §19.4.

## Status

v1.0.0 public release. Primary audience is conformance-tool implementers (`soa-validate`, `ui-validate`) and Runner / Gateway authors building against the bundle.

`MANIFEST.json` lists `soa_validate_binary` and `ui_validate_binary` with a `status` field per `schemas/release-manifest.schema.json`. Per the schema, `status: "placeholder"` means the validator binary is released separately in its sibling repo (`soa-validate` / `ui-validate`) and conformance tools MUST refuse to verify against a placeholder entry — fetch the binary from the sibling repo's tagged release directly and verify its digest there.
