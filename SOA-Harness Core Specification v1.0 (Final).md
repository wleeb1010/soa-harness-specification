# SOA-Harness Core Specification
**Self-Optimizing Agentic Harness — Production Standard**
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

---

## 1. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in BCP 14 (RFC 2119 + RFC 8174) when, and only when, they appear in all capitals.

- All text files defined by this specification MUST be UTF-8 encoded without BOM.
- All timestamps MUST be RFC 3339 strings with an explicit timezone offset (UTC is RECOMMENDED) and at least millisecond precision.
- All JSON MUST conform to RFC 8259 and MUST use LF (`\n`) as the line separator in persisted forms.
- Durations in configuration fields MUST be ISO-8601 durations (e.g., `P30D`, `PT5M`).
- **JSON signing inputs** (Agent Card JWS, MANIFEST JWS, `canonical_decision` PDA, audit-record canonical hash) MUST be canonicalized per RFC 8785 (JCS) before hashing or signing. Verifiers MUST re-canonicalize the received object and compare against the provided digest or signature. Full RFC 8785 conformance, including the number-serialization rules (ECMAScript `Number.prototype.toString` for all numeric values, distinguishing negative zero, exponent thresholds), is REQUIRED for production signing paths — subsets that handle only integers and strings are acceptable in build tooling that never encounters floats, but any signed or digest-pinned artifact that may contain a non-integer number MUST use a library-grade RFC 8785 implementation (reference implementations: `@filen/rfc8785` for JavaScript, `canonicaljson-go`, Python `rfc8785`).
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

- **[MCP-2026-04]** Model Context Protocol, specification revision **2026-04-03**, published at `https://modelcontextprotocol.io/specification/2026-04-03` (SHA-256 digest recorded in `soa-validate` manifest).
- **[A2A-0.3]** Agent2Agent Protocol, version **0.3.1** (tag `v0.3.1` in the upstream repository); Agent Card section as of 2026-04-03. Compatible with A2A ≥ 0.3, < 0.4.
- **[HARBOR-1.0]** Harbor Benchmark Format v1.0. The full format is inlined in §9.6.
- **[BCP-14]** IETF BCP 14 (RFC 2119 + RFC 8174).
- **[RFC-3339]** Date and Time on the Internet: Timestamps.
- **[RFC-8259]** The JavaScript Object Notation (JSON) Data Interchange Format.
- **[RFC-7519]** JSON Web Token (JWT).
- **[RFC-7515]** JSON Web Signature (JWS).
- **[RFC-8446]** TLS 1.3 (mandatory minimum).
- **[JSON-SCHEMA-2020-12]** JSON Schema 2020-12.
- **[RFC-8785]** JSON Canonicalization Scheme (JCS). Required for any signed JSON where cross-implementation signature verification is mandated (Agent Card JWS, `program.md` JWS, Permission Decision Attestation, audit-record canonical hash).

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
| Identity & Discovery | A2A + Agent Card | P12 | `https://<origin>/.well-known/agent-card.json` + `.jws` | Persona, types, permissions |
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

---

## 6. Agent Card

### 6.0 External Bootstrap Root (Normative)

The Agent Card signature chain terminates at a trust anchor published under `security.trustAnchors`. The trust anchor itself is not discoverable from any artifact in this bundle — doing so would be circular. v1.0 therefore REQUIRES that the initial trust root be delivered *out of band* via exactly ONE of the following channels per deployment:

- **SDK-pinned.** The operator's SOA client SDK ships with a hard-coded `{publisher_kid, spki_sha256, issuer}` triple identifying the SOA-WG release-signing key. Runners loading an Agent Card whose `security.trustAnchors[].publisher_kid` does not match the SDK-pinned value MUST emit `HostHardeningInsufficient` (reason `bootstrap-missing`) and refuse to load the Card.
- **Operator-bundled.** The operator distributes `initial-trust.json` (`{"publisher_kid": "...", "spki_sha256": "<64-hex>", "issuer": "CN=..."}`) via a trusted deployment channel (configuration management, signed-container base image, etc.). The Runner loads this file at startup before any Agent Card; absence fails startup with `HostHardeningInsufficient` (reason `bootstrap-missing`).
- **DNSSEC-protected TXT record (production).** At `_soa-trust.<deployment-domain>`, a DNSSEC-validated TXT record publishes `publisher_kid=<id>; spki_sha256=<64-hex>; issuer="CN=..."`. The Runner resolves and DNSSEC-validates the record at startup; lookup failure, missing AD bit, or empty result fails startup with `HostHardeningInsufficient` (reason `bootstrap-missing`).

Implementations MUST select exactly one bootstrap channel per deployment and document the choice in their operator manual. The bootstrap provides the initial trust anchor that verifies the `MANIFEST.json.jws` release-manifest signature; the verified manifest then pins digests for subsequent `agent-card.jws` verification. Covered by `SV-BOOT-01..03`.

### 6.1 Discovery and Transport

- The Agent Card MUST be served at `https://<origin>/.well-known/agent-card.json`.
- TLS 1.3 or higher is REQUIRED. Plain `http` is NOT permitted.
- Response `Content-Type` MUST be `application/json; charset=utf-8`.
- Response MUST include an `ETag` header and respect `If-None-Match`.
- A detached JWS signature (RFC 7515) of the Agent Card bytes MUST be served at `https://<origin>/.well-known/agent-card.jws`. The signing key's x5c certificate chain MUST chain to an issuer advertised in `security.trustAnchors`.
- Clients MUST verify the signature before trusting any policy-bearing field (`permissions.*`, `self_improvement.*`, `security.*`). On verification failure the client MUST fail closed (treat Agent as unreachable) and emit `CardSignatureFailed` (§24).
- `Cache-Control: max-age` MUST NOT exceed 300 seconds unless the signer explicitly sets a longer value.

### 6.1.1 Artifact Signing Profile (Normative)

All signed artifacts in the SOA-Harness v1.0 bundle MUST conform to the following per-artifact profile. Verifiers MUST reject any JWS whose `alg` is not in the allowlist, whose `typ` does not match the artifact class, or whose required header fields are absent.

| Artifact | Serialization | Signing input | Allowed `alg` | Required `typ` | Required header fields |
|---|---|---|---|---|---|
| Agent Card JWS (`.well-known/agent-card.jws`) | detached JWS (RFC 7515) | JCS(agent-card.json) bytes | EdDSA, ES256, RS256 (≥ 3072) | `soa-agent-card+jws` | `alg`, `kid`, `x5c` |
| `program.md` JWS (`program.md.jws`) | detached JWS | raw UTF-8 bytes of `program.md` | EdDSA, ES256 | `soa-program+jws` | `alg`, `kid` |
| MANIFEST JWS (`MANIFEST.json.jws`) | detached JWS | JCS(MANIFEST.json) bytes | EdDSA, ES256 | `soa-manifest+jws` | `alg`, `kid` (MUST equal the configured `publisher_kid`) |
| PDA-JWS (UI §11.4) | compact JWS | BASE64URL(JCS(canonical_decision)) | EdDSA, ES256, RS256 (≥ 3072) | `soa-pda+jws` | `alg`, `kid` |

Notes:
- **Agent Card JWS** carries `x5c` so the signer's chain is verifiable against `security.trustAnchors` without an extra fetch.
- **MANIFEST JWS** intentionally forbids RS256 — manifest verification is a bootstrap-critical path and RSA adds no value over Ed25519 at that layer.
- **`program.md` JWS** signs raw Markdown bytes (not JCS-canonicalized anything); Markdown is not JSON and has no canonicalization rule.
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
          "items": {
            "type": "object",
            "required": ["issuer", "spki_sha256", "uri"],
            "additionalProperties": false,
            "properties": {
              "issuer":      { "type": "string" },
              "spki_sha256": { "type": "string", "pattern": "^[A-Fa-f0-9]{64}$" },
              "uri":         { "type": "string", "format": "uri", "pattern": "^https://", "description": "Base URI for trust-anchor artifacts; CRL MUST resolve at <uri>/crl.json" },
              "publisher_kid": { "type": "string", "description": "Present only on the trust anchor authorized to sign the soa-validate release manifest (§9.7.1); kid matches the JWS header of MANIFEST.json.jws" }
            }
          }
        },
        "mtlsRequired": { "type": "boolean", "default": true },
        "auditSink": { "type": "string", "format": "uri", "description": "WORM audit sink endpoint (§10.5); scheme MAY be https, s3, gs, azblob, or a site-local scheme" },
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
  "security": { "oauthScopes": ["read:files", "write:artifacts"], "trustAnchors": [{"issuer":"CN=SOA Internal CA","spki_sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","uri":"https://ca.example.com/soa-internal"}], "auditSink": "https://audit.example.com/worm" }
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
  note: string (≤ 16 KiB),
  tags: array<string> (≤ 32, each ≤ 64 chars),
  importance: number (0.0–1.0 inclusive)
) → { "id": string, "created_at": string /* RFC 3339 */ }
Errors: MemoryQuotaExceeded, MemoryDuplicate, MemoryMalformedInput

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

### 8.4 Consolidation Trigger

The Runner MUST invoke `consolidate_memories(aging_rules.consolidation_threshold)` at least once per 24 hours, or after any session accumulating ≥ 100 new notes, whichever is sooner. A dedicated consolidation process MAY perform this out-of-band.

### 8.5 Sharing Policy and Isolation

`sharing_policy` values bind the maximum visibility of `search_memories` results:
- `none`: no cross-session visibility.
- `session`: visible within the session that wrote the note.
- `project`: visible to any session in the same billing-tag namespace.
- `tenant`: visible across projects for the same tenant.

The Memory MCP server MUST enforce `sharing_policy` on the server side based on the authenticated caller. Client-side enforcement is advisory.

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
13. **Artifact Write.** Write `improvement.log.md` (§9.8) and produced artifacts under `/artifacts/self_improvement/<iteration-id>/`.

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
      "required": ["seccomp","soa_validate_binary","ui_validate_binary"],
      "additionalProperties": false,
      "properties": {
        "supplementary_artifacts": {
          "type": "array",
          "description": "Optional: additional artifacts published alongside the release bundle (spec MDs, must-maps, JSON Schema files, test vectors). Listed for digest verification; a Runner is not required to fetch these for self-improvement, but conformance tooling MAY rely on them.",
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

For each tool invocation the Runner MUST resolve `(capability, control, handler)`:

1. Start with `capability = activeMode` and `control = tool.default_control`.
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

### 10.4 Autonomous Handler and High-Risk Actions

- **High-risk action** = any self-edit (§9), any tool with `risk_class = Destructive`, or a self-improvement iteration with `|training_score - baseline_training_score| > 0.10`.
- Autonomous handlers MUST NOT auto-approve high-risk actions. An Autonomous handler facing a high-risk Prompt MUST escalate to an Interactive or Coordinator handler. If none is reachable within 30 seconds the action MUST be denied.
- Human-in-the-Loop (§19) is satisfied only when an `Interactive` handler signs the prompt decision.

### 10.5 Audit Trail

- Every permission decision, every self-edit, and every handoff MUST be appended to `/audit/permissions.log`.
- Each record is a JSON line: `id`, `timestamp`, `session_id`, `tool`, `args_digest`, `capability`, `control`, `handler`, `decision`, `reason`, `signer_key_id`, `prev_hash`, `this_hash`.
- `this_hash = SHA-256(prev_hash || canonical_json_of_record_without_this_hash)`. First record: `prev_hash = "GENESIS"`.
- The Runner MUST additionally ship every record to an **external WORM sink** satisfying:
  1. **Append-only**: once written, records MUST NOT be mutable or deletable by credentials available to the Runner.
  2. **Tamper-evident**: the sink MUST preserve the record's `this_hash` chain; independent verification MUST be possible without Runner cooperation.
  3. **External timestamp**: each record MUST carry a sink-issued timestamp, accurate to within 1 second of UTC.
  4. **Retention**: minimum 365 days for `activeMode=DangerFullAccess` sessions; minimum 90 days otherwise.
  5. **Audit-reader access**: a verifier with read-only credentials MUST be able to list and read records without write authority.

  Conforming backends (non-exhaustive): AWS S3 with Object Lock (compliance mode), Azure Blob immutable storage, GCS bucket with retention policy, on-premises append-only log server with signed receipts, or a filesystem with per-record immutable attribute and privilege-separated writer. The sink endpoint is declared at `security.auditSink`.

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

### 11.3 Re-Registration Timing

- On self-improvement iteration acceptance (§9.5 step 12e), the Runner MUST pin the **new** Tool Pool for **new** sessions.
- Sessions in flight during acceptance MUST continue with their pinned pool; they observe no tool additions or removals mid-session. The session file records the Tool Pool manifest by content hash.
- On session resume: if the Tool Pool manifest hash no longer resolves (tools removed), the session MUST terminate with `StopReason::ToolPoolStale` and emit `ToolPoolStaleResume`. No partial-pool resume is permitted.

---

## 12. Session Persistence & Workflow State

### 12.1 Session File Schema

A session file at `/sessions/<session-id>.json` MUST conform to:

```json
{
  "$id": "https://soa-harness.org/schemas/v1.0/session.schema.json",
  "type": "object",
  "required": ["session_id", "format_version", "messages", "workflow", "counters", "tool_pool_hash", "card_version"],
  "properties": {
    "session_id": { "type": "string", "pattern": "^ses_[A-Za-z0-9]{16,}$" },
    "format_version": { "type": "string", "const": "1.0" },
    "created_at": { "type": "string" },
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

Persistence is **bracketed** around each significant event. For each significant event the Runner MUST:

1. Persist `phase = pending` with an **idempotency key** (UUIDv4) and `args_digest` BEFORE executing.
2. Execute.
3. Persist `phase = committed` with `result_digest` AFTER successful execution, OR `phase = compensated` on failure followed by the compensating action.

This gives **at-least-once** semantics on resume: `pending` tools are replayed; `committed` are not. Each tool MUST accept an `X-Soa-Idempotency-Key` header (for HTTP-like tools) or MCP equivalent and MUST dedupe on it. Tools without idempotency support MUST be classified `risk_class = Destructive` and run only under `control = Prompt` with a re-prompt on resume.

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
        "CrashEvent"
      ]
    },
    "payload": { "type": "object" },
    "timestamp": { "type": "string" }
  }
}
```

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
    { "properties": { "type": { "const": "CrashEvent"      }, "payload": { "$ref": "#/$defs/CrashEvent"      } } }
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
    "PermissionPrompt":  { "type": "object", "required": ["prompt_id","tool","deadline","allowed_decisions","capability","control","handler","nonce"], "additionalProperties": false, "properties": { "prompt_id":{"type":"string","pattern":"^prm_[A-Za-z0-9]{8,}$"},"tool":{"type":"object","required":["name","risk_class","args_digest"],"additionalProperties":false,"properties":{"name":{"type":"string"},"risk_class":{"type":"string","enum":["ReadOnly","Mutating","Destructive"]},"description":{"type":"string"},"args_digest":{"type":"string","pattern":"^sha256:[A-Fa-f0-9]{64}$"},"args_redacted":{"type":"object"}}},"capability":{"type":"string","enum":["ReadOnly","WorkspaceWrite","DangerFullAccess"]},"control":{"type":"string","enum":["AutoAllow","Prompt","Deny"]},"handler":{"type":"string","enum":["Interactive","Coordinator","Autonomous"]},"deadline":{"type":"string"},"allowed_decisions":{"type":"array","items":{"type":"string","enum":["allow","deny"]}},"nonce":{"type":"string","pattern":"^[A-Za-z0-9_-]{16,}$","description":"Gateway-minted single-use challenge. Gateway MUST generate a fresh ≥128-bit random value per PermissionPrompt. Clients MUST echo this value in canonical_decision.nonce when producing a PDA; Gateway MUST verify equality and enforce single-use via the replay cache defined in UI §11.4.1."},"context":{"type":"object","additionalProperties":false,"properties":{"reasoning_summary":{"type":"string","maxLength":500},"recent_decisions":{"type":"array","items":{"type":"object"}}}},"attestation_required":{"type":"boolean","description":"Gateway-synthesized per UI Profile §11.1; Runner MAY omit"},"accepted_attestation_formats":{"type":"array","items":{"type":"string","enum":["jws","webauthn"]}} } },
    "PermissionDecision":{ "type": "object", "required": ["prompt_id","decision","scope","signer_kid"], "properties": { "prompt_id":{"type":"string","pattern":"^prm_[A-Za-z0-9]{8,}$"},"decision":{"type":"string","enum":["allow","deny"]},"scope":{"type":"string","enum":["once","always-this-tool","always-this-session"]},"signer_kid":{"type":"string"},"reason":{"type":"string"} }, "additionalProperties": false },
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
    "CrashEvent":        { "type": "object", "required": ["reason","workflow_state_id","last_committed_event_id"], "properties": { "reason":{"type":"string"},"workflow_state_id":{"type":"string"},"last_committed_event_id":{"type":"string"},"stack_hint":{"type":"string","maxLength":4096} }, "additionalProperties": false }
  }
}
```

### 14.1.2 Event Type → Trust Class Mapping (Normative)

This table normatively binds each `StreamEvent.type` to its rendering trust class (see UI Integration Profile §15 for render rules). Profiles that surface events to humans MUST honor this mapping; Gateways MUST reject outbound envelopes that label content against this table.

| StreamEvent.type | Trust class | Notes |
|---|---|---|
| `SessionStart`, `SessionEnd` | `system` | Session chrome. |
| `MessageStart`, `MessageEnd` | `user` when `payload.role == "user"`; `tool-output` when `role == "tool"`; `system` when `role == "system"`; `model` otherwise | Derived exhaustively from the `role` enum (§14.1.1). |
| `ContentBlockStart`, `ContentBlockDelta`, `ContentBlockEnd` | `model` while `workflow.status ∈ {Planning, Executing, Optimizing, Blocked, Succeeded, Failed, Cancelled}`; `agent-peer` while `workflow.status == Handoff` | Deterministic from session state, not from payload inspection. All three event sub-types receive the same class. Closed coverage over the full `workflow.status` enum (§12.1). |
| `ToolInputStart`, `ToolInputDelta`, `ToolInputEnd` | `model` while `workflow.status ∈ {Planning, Executing, Optimizing, Blocked, Succeeded, Failed, Cancelled}`; `agent-peer` while `workflow.status == Handoff` | Tool-call construction belongs to whichever agent is currently speaking. Closed coverage over the full `workflow.status` enum. |
| `ToolResult`, `ToolError` | `tool-output` | Always `tool-output` — deterministic. The UI MAY additionally apply untrusted-content rendering (per UI §15.1 `untrusted` class) based on local policy, but the envelope-level `trust_class` MUST remain `tool-output`. |
| `PermissionPrompt` | `system` | Always. |
| `PermissionDecision` | `system` if signer is local `Interactive`/`Coordinator`/`Autonomous`; `agent-peer` if the `PermissionDecision` is delivered as part of an inbound handoff payload (`workflow.status == Handoff` AND signer_kid is outside the local trust anchor set) | Decisions from peer agents retain peer-origin semantics. |
| `CompactionStart`, `CompactionEnd` | `system` | Runner chrome. |
| `MemoryLoad` | `system` | Runner chrome. |
| `HandoffStart`, `HandoffComplete`, `HandoffFailed` | `system` | Handoff chrome. |
| `SelfImprovementStart`/`Accepted`/`Rejected`/`Orphaned` | `system` | Runner chrome. |
| `CrashEvent` | `system` | Terminal chrome. |

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

Termination reasons are the closed `StopReason` enum (§13.4).

### 16.2 Cross-Interaction Matrix (Normative Resolutions)

| Interaction | Resolution |
|---|---|
| A2A handoff during self-improvement | If `workflow.status == Optimizing`, the Runner MUST reject incoming handoff with `HandoffBusy` (-32050). Outgoing handoffs are not initiated while Optimizing. |
| Resume during self-improvement (mid-regression) | On resume with `status=Optimizing`, staging worktree is discarded, iteration emits `SelfImprovementRejected` (reason `Aborted`) via StreamEvent; the `SelfImprovementAborted` code in §24 is the terminal-outcome label logged to the audit trail, not a StreamEvent type. Runner returns to `status=Succeeded` prior to Optimizing. `main` unchanged (stage-activate guarantee). |
| Self-improvement during budget exhaustion | Self-improvement iterations consume their own dedicated budget (MUST be ≤ 10% of `maxTokensPerRun` unless Agent Card sets `self_improvement.budget`). Exhaustion causes `SelfImprovementRejected` (reason `BudgetExhausted`) via StreamEvent and logs `SelfImprovementAborted` to the audit trail with no partial accept. |
| Compaction during streaming | Compaction MUST NOT run while a `ContentBlockDelta` sequence is open. Deferred to next `MessageEnd`. Emit `CompactionDeferred` if triggered mid-stream. |
| Nested hook invocation | A PreToolUse or PostToolUse hook MUST NOT invoke Runner tools. Reentrancy is NOT supported; session terminates with `HookReentrancy`. |
| Workflow state transfer in handoff | Handoff transfers: conversation messages, Workflow State (task_id, status=`Handoff`, side_effects phase=committed only), billing tag, correlation IDs. NOT transferred: Memory MCP content, session file location, audit prev_hash. See §17.4. |
| Agent Card changes mid-session | Not permitted to affect in-flight sessions. `CardVersionDrift` terminates on next turn. New sessions pick up new Card. |
| OTel exporter failure | Buffer up to 10,000 spans; drop oldest with `ObservabilityBackpressure`. Runner MUST NOT halt. |
| `soa-validate` self-compliance | `soa-validate` itself is NOT required to be a compliant harness; it is a validator. It MAY be distributed as a stateless CLI. |
| Concurrent self-improvement | Cluster-wide advisory lock (§12.4). One meta-agent at a time; others block up to 30s then `SelfImproveLockBusy`. |

---

## 17. Agent2Agent (A2A) Wire Protocol

### 17.1 Endpoint and Transport

- A2A JSON-RPC 2.0 endpoint: `https://<origin>/a2a/v1`.
- Transport: HTTPS (TLS 1.3+). Mutual TLS is REQUIRED by default; server certs chain to the peer's `security.trustAnchors`.
- Each request MUST carry a signed JWT in `Authorization: Bearer <jwt>`. JWT claims: `iss` (caller's `name`), `sub` (caller's URL), `aud` (callee's URL), `iat`, `exp` (≤ 300 s from `iat`), `jti` (nonce), `agent_card_etag`.

  **A2A JWT normative profile:**
  1. **Algorithm allowlist.** `alg ∈ {EdDSA, ES256, RS256}`. RS256 requires key size ≥ 3072 bits. Any other `alg` MUST be rejected with `HandoffRejected` (reason `bad-alg`). (SV-A2A-10)
  2. **Signing-key discovery.** The signing key MUST match ONE of:
     - The caller's Agent Card JWS signer `kid` — same trust anchor, same SPKI as the `agent-card.jws` header. Default when the transport is not mutually authenticated.
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

Every MUST in this specification is assigned at least one test ID. The mapping file `soa-validate/must-map.json` is part of the suite distribution. A MUST without a test ID is a spec defect.

### 18.3 Conformance Levels

Every profile (including the Self-Improvement and Handoff add-ons) inherits the universal preamble: **§1 Conventions**, **§2 Normative References**, **§19 Governance**, **§22 Non-Goals**, **§24 Error Taxonomy**. These are not optional.

- **Core (required)**: preamble + §4, §5, §6, §7, §8, §10, §11, §12, §13, §14, §15, §16, §18. (§§4–5 added so their normative MUSTs — lean design, failure-path definition, primitive unit-testability, file-system grounding, composition — are inside formal coverage; corresponding tests are `SV-PRIN-01..05` and `SV-STACK-01..02` in the must-map.)
- **Self-Improvement (optional)**: Core + §9, §23. An implementation without self-improvement advertises `self_improvement.enabled = false` and skips §9 tests.
- **Handoff (optional)**: Core + §17. An implementation without A2A advertises no `/a2a/v1` endpoint; `agent.describe` via Card fetch is still required.

A "Core-only" implementation is a valid SOA-Harness v1.0 implementation provided it satisfies the preamble and Core sections.

### 18.4 Invocation

```
soa-validate --agent-url https://agent.example.com \
             --profile core|core+si|core+handoff|full \
             --report report.json
```

Exit code `0` means all required tests passed. Non-zero indicates failures enumerated in `report.json`.

---

## 19. Governance & Spec Evolution

### 19.1 Governing Body

The SOA-Harness specification is maintained by the **SOA-Harness Working Group** (SOA-WG). Charter, membership, and voting rules are published at `https://soa-harness.org/governance`. Spec changes require two-of-three maintainer approvals.

**Bootstrap note.** v1.0 publication assumes the SOA-WG is bootstrapped at release time: the initial publisher key is pinned in the release manifest (§9.7.1) and all `security.trustAnchors` references in example Agent Cards resolve to that key until individual deployments elect their own trust anchors. The hostname `soa-harness.org` is the canonical publication endpoint; implementers deploying behind a mirror MUST pin the mirror's public key as a trust anchor equivalent, not substitute the hostname.

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

**Release bundle contents (normative).** Every v1.0 release MUST ship the following artifact classes, all listed in MANIFEST.json with digests:
1. **Normative specifications** — the Core Markdown, the UI Integration Profile, the companion seccomp profile JSON, and both conformance must-maps.
2. **Extracted JSON Schemas** under `schemas/` — one file per `$id` URI referenced in the specs. Conformance tooling resolves `$id` lookups against this directory or the canonical HTTPS URL.
3. **Test vectors** under `test-vectors/` — first-class conformance inputs. The vectors currently REQUIRED to be present:
   - `test-vectors/agent-card.{json,json.jws}` — exercised by `SV-CARD-03` / `HR-12` (§6.3).
   - `test-vectors/topology-probe.md` — recipe consumed by `UV-SESS-06†` / `UV-SESS-06a` (UI §5.1).
   - `test-vectors/tasks-fingerprint/` — two-task `/tasks/` fixture + `compute.mjs` producing the canonical `tasks_fingerprint` string; exercised by `SV-GOOD-07` (§23 novelty quota).
4. **MANIFEST.json + MANIFEST.json.jws** — canonical digest set, signed by the release key pinned in §9.7.1.

Conformance tools (`soa-validate`, `ui-validate`) MUST consume test vectors from the release bundle unambiguously: either by fetching the canonical URL under `https://soa-harness.org/test-vectors/v1.0/` or by reading the mirrored copies in a locally-unpacked bundle. Mismatch between the vector's computed digest and the MANIFEST entry fails conformance with `ManifestDigestMismatch` (§24). New vectors added in patch releases MUST appear in `supplementary_artifacts` of MANIFEST.json; removal of an existing vector is a breaking change subject to §19.4 SemVer rules.

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

### 19.5 Deprecation

- A field marked deprecated in release N MUST still work through release N+2.

### 19.6 Human-in-the-Loop

- HITL is satisfied only by an `Interactive` handler signing the decision (§10.4).
- HITL is REQUIRED for all high-risk actions (§10.4 definition).

---

## 20. Adoption Checklist

- [ ] `https://<origin>/.well-known/agent-card.json` and `.jws`, signed by a trust-anchor key.
- [ ] MCP servers: tools + memory + benchmarks, with scopes declared.
- [ ] `AGENTS.md` with required H2 headings in order; bounded `@import`.
- [ ] `program.md` + `program.md.jws` if `self_improvement.enabled = true`.
- [ ] `program.md` JWS verifiable against a trust anchor with `publisher_kid` (§9.2).
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
  1. Enumerate every immediate child directory of `/tasks/` (recursively only if a child declares `task.json`; subdirectories without `task.json` are ignored).
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
**A2A**: `HandoffBusy`, `HandoffRejected`, `HandoffStateIncompatible`, `TrustAnchorMismatch`
**Cluster**: `SelfImproveFencingViolation`
**Host**: `HostHardeningInsufficient`
**Stream**: `ConsumerLagging`, `ResumeGap`, `ManifestDigestMismatch`
**Config**: `ConfigOverride`

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

**Conformance**
An implementation is SOA-Harness v1.0 compliant at a chosen profile (Core, Core+SI, Core+Handoff, Full) if and only if it satisfies every MUST in the sections that profile covers, and `soa-validate --profile=<p>` exits 0 against it.
