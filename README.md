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
| [`test-vectors/topology-probe.md`](./test-vectors/topology-probe.md) | Recipe for the `UV-SESS-06†` topology probe (artifacts-origin separation). |
| [`build-manifest.mjs`](./build-manifest.mjs), [`extract-schemas.mjs`](./extract-schemas.mjs) | Build tools: re-extract schemas from the MDs and rebuild `MANIFEST.json` after spec edits. Requires Node ≥ 18. |

## Conformance profiles

- `core` — baseline Runner conformance (Agent Card, Permissions, Session Persistence, Stream, Hooks, Tool Pool, Audit Trail, Observability).
- `core+si` — adds Self-Improvement loop + Docker isolation + Harness Regression suite `HR-01…HR-18`.
- `core+handoff` — adds A2A handoff (JSON-RPC 2.0 wire protocol per §17).
- UI Profile — web / ide / mobile / cli, each with their own test subset.

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
