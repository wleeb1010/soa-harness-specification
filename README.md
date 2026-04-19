# SOA-Harness Specification v1.0

Normative specification bundle for **Self-Operating Agents (SOA)** — a conformance-testable harness for agentic runtimes and their UI gateways.

The bundle is self-contained: every MUST in the spec has a corresponding test ID in one of the two `*-validate` must-maps, every referenced JSON Schema is published as a standalone `.schema.json` under [`schemas/`](./schemas/), and every artifact is digest-pinned in [`MANIFEST.json`](./MANIFEST.json) with JCS-RFC-8785 canonicalization for JSON and raw-utf8 for Markdown.

## Artifacts

### Normative specs (Markdown)

| File | Purpose |
|---|---|
| [`SOA-Harness Core Specification v1.0 (Final).md`](./SOA-Harness%20Core%20Specification%20v1.0%20%28Final%29.md) | Runner-side normative spec: Agent Card, Permission System, Session Persistence, StreamEvent envelope, Self-Improvement loop, Audit Trail, Host Hardening, A2A Handoff, Error Taxonomy. |
| [`SOA-Harness UI Integration Profile v1.0 (Final).md`](./SOA-Harness%20UI%20Integration%20Profile%20v1.0%20%28Final%29.md) | UI Gateway normative profile: transport (WebSocket / SSE / REST / Local IPC), OAuth + DPoP + WebAuthn enrollment, envelope wrapping, content safety, Permission Decision Attestation (JWS + WebAuthn), per-UI replay, accessibility. |
| [`SOA UI Gateway Reference Implementation Sketch.md`](./SOA%20UI%20Gateway%20Reference%20Implementation%20Sketch.md) | Non-normative reference sketch of a compliant UI Gateway in TypeScript — load-bearing paths only. |

### Conformance must-maps (JSON)

| File | Purpose |
|---|---|
| [`soa-validate-must-map.json`](./soa-validate-must-map.json) | Core conformance map: every Core MUST → test ID → execution phase. |
| [`ui-validate-must-map.json`](./ui-validate-must-map.json) | UI Profile conformance map: every UI MUST → test ID → execution phase. |

### Companion artifacts

| File | Purpose |
|---|---|
| [`soa-harness-profile-v1.json`](./soa-harness-profile-v1.json) | Docker seccomp profile enforcing the §9.7 deny-by-default allowlist; baseline applies on x86_64 / aarch64 / riscv64 / s390x / ppc64le, with the clone-arg filter gated to the first three via `includes.arches`. |
| [`schemas/`](./schemas/) | 13 extracted JSON Schema 2020-12 files matching the `$id` URIs used in the spec: `agent-card`, `session`, `stream-event`, `stream-event-payloads`, `harbor-task`, `release-manifest`, `crl`, `gateway-config`, `ui-envelope`, `ui-derived-payloads`, `canonical-decision`, `locale-map`, `wcag-addendum`. |
| [`MANIFEST.json`](./MANIFEST.json) | Release manifest listing every artifact with SHA-256 digests + canonicalization rule. Validates against `schemas/release-manifest.schema.json`. |
| [`MANIFEST.json.jws`](./MANIFEST.json.jws) | Detached JWS over the manifest (placeholder signature; real signing key is issued per §9.7.1 `publisher_kid`). |
| [`test-vectors/agent-card.json`](./test-vectors/agent-card.json) + [`.jws`](./test-vectors/agent-card.json.jws) | Reference Agent Card + detached JWS for `SV-CARD-03` / `HR-12` test setup. |
| [`test-vectors/topology-probe.md`](./test-vectors/topology-probe.md) | Recipe for the `UV-SESS-06†` / `UV-SESS-06a` topology probe (artifacts-origin separation, read from the `artifacts_origin` discovery field). |
| [`test-vectors/tasks-fingerprint/`](./test-vectors/tasks-fingerprint/) | Two-task `/tasks/` fixture + [`compute.mjs`](./test-vectors/tasks-fingerprint/compute.mjs) producing the published `tasks_fingerprint` for `SV-GOOD-07` (Core §23 novelty quota). |
| [`build-manifest.mjs`](./build-manifest.mjs), [`extract-schemas.mjs`](./extract-schemas.mjs) | Build tools: re-extract schemas from the MDs and rebuild `MANIFEST.json` after spec edits. Requires Node ≥ 18. Run from the repo root or set `SOA_BUNDLE_ROOT`. |

## Conformance profiles

- `core` — baseline Runner conformance (Agent Card, Permissions, Session Persistence, Stream, Hooks, Tool Pool, Audit Trail, Observability).
- `core+si` — adds Self-Improvement loop + Docker isolation + Harness Regression suite `HR-01…HR-18`.
- `core+handoff` — adds A2A handoff (JSON-RPC 2.0 wire protocol per §17).
- UI Profile — web / ide / mobile / cli, each with their own test subset.

## Gateway discovery document

The UI Gateway publishes its configuration at `https://<gateway>/.well-known/soa-ui-config.json` (validates against [`schemas/gateway-config.schema.json`](./schemas/gateway-config.schema.json)). Required load-bearing fields include:

- `issuer`, `authorization_endpoint`, `token_endpoint` — OAuth 2.1 metadata
- `ws_endpoint`, optional `sse_endpoint`, `rest_base`, optional `local_ipc` — transport surfaces
- `scopes_supported`, `supported_profiles`, `attestation_formats_supported`, `webauthn_rp_id` — capability declaration
- `replay` — buffer sizing (`buffer_events ≥ 10 000`, `buffer_seconds ≥ 1800`, `max_backfill ≤ 5000`, `grace_seconds ≥ 600`)
- `artifacts_origin` — cookie-less origin for tool-output artifacts; MUST differ from the UI origin by eTLD+1 (UI §5.1 MUST; `UV-SESS-06a`)
- `runner_endpoint` — Runner base URL; either `^https://…` or the literal `"loopback"` sentinel declaring co-hosted deployment. When `loopback`, UI §7.4 requires routing via `127.0.0.0/8` / `::1/128` / a UNIX domain socket, matching process-identity check (`SO_PEERCRED` / `LOCAL_PEEREID` / `GetNamedPipeClientProcessId`), and an OTel `soa_ui_cohost_mode=true` span label.
- `runner_mtls_ca_digest` — SHA-256 of the DER-encoded CA root; Gateway MUST verify on every outbound mTLS handshake to the Runner; mismatch fails the handshake with `ui.runner-mtls-failed`.
- `stream_scope_template` — RFC 6570 Level 1 template (pattern-validated by the schema) for the token-exchange scope. Default: `stream:read:{session_id}`. Admin consumers MAY use `stream:read:all`.

All three runner fields are covered by `UV-A-16`.

## Diagnostic counters vs error envelopes

UI §21 is a closed set of **emitted** error codes (`ui.auth-required`, `ui.replay-gap`, ...). §21.1 covers **diagnostic counters** that appear in observability metrics but never surface as error envelopes. `UV-ERR-01` tests the closed set; counters are explicitly excluded.

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

## Conformance stance

Every MUST in either spec has a corresponding test ID in one of the two must-maps; there are zero orphan tests and zero uncovered MUSTs. Signing paths REQUIRE a library-grade RFC 8785 JCS implementation (the in-repo [`build-manifest.mjs`](./build-manifest.mjs) JCS is a documented subset — integer/string content only).

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

## Version

`spec_version: "1.0"` — released `2026-04-18`.

Governance and errata policy: Core §19. SemVer binding table: Core §19.4.

## Status

Private repo. Conformance-tool implementers (`soa-validate`, `ui-validate`) are the intended audience.
