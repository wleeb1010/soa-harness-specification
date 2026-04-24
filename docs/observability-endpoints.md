# Observability Endpoints — Adopter Reference

One-page summary of every observability + operator HTTP endpoint a conformant Runner exposes. Lives here rather than in the spec body so adopters have a scannable table without walking §5–§18 in order.

Each endpoint: method + path, auth scope, rpm (requests per minute per bearer), TLS requirement, response schema, not-a-side-effect status, normative anchor.

## Read surfaces

### Core lifecycle

| Endpoint | Scope | RPM | Response | §N |
|---|---|---|---|---|
| `GET /.well-known/agent-card.json` | none (public) | — | Agent Card (inline JSON) | §5.1 / §6 |
| `GET /.well-known/agent-card.jws` | none (public) | — | detached JWS (RFC 7515 §B.1) | §5.1 / §6 |
| `GET /health` | none | — | 200 once runner process alive | §5.4 |
| `GET /ready` | none | — | 200 when §7.3.1 CRL fresh + §5.4 components wired; 503 + closed-enum reason otherwise | §5.4 |
| `GET /version` | none | — | `{soaHarnessVersion, supported_core_versions[], runner_version, spec_commit_sha, generated_at}` | §19.4.1 (+ L-62) |

### Audit chain

| Endpoint | Scope | RPM | Response | §N |
|---|---|---|---|---|
| `GET /audit/tail` | session bearer OR reader-token | 120 | `{this_hash, record_count, runner_version, generated_at}` | §10.5.2 |
| `GET /audit/records?after=<id>&limit=<n>` | session bearer OR reader-token | 120 | pagination over the §10.5 chain | §10.5.3 |
| `GET /audit/sink-events?after=<id>&limit=<n>` | operator bearer | 60 | WORM sink transitions (`degraded`, `recovered`) | §10.5.1 |
| `POST /audit/reader-tokens` | operator bearer | — | mints a short-TTL audit-read-only bearer | §10.5.7 |

### Permission + session + memory

| Endpoint | Scope | RPM | Response | §N |
|---|---|---|---|---|
| `GET /permissions/resolve?tool=<n>&session_id=<sid>` | session bearer | 120 | resolved decision + three-axis provenance | §10.3.1 |
| `POST /permissions/decisions` | handler bearer (admin variants for Autonomous escalation) | 60 | verifies PDA, records decision row, fires PermissionDecision StreamEvent | §10.3.2 |
| `POST /sessions` | bootstrap bearer | 30 | creates session; returns `{session_id, session_bearer, ...}` | §12.6 |
| `GET /sessions/<sid>/state` | session bearer | 120 | §12.5.1 session-state snapshot | §12.5.1 |
| `GET /memory/state/<sid>` | session bearer | 120 | §8.6 memory-load snapshot + aging metadata | §8.6 |

### Budget + tools + streaming

| Endpoint | Scope | RPM | Response | §N |
|---|---|---|---|---|
| `GET /budget/projection/<sid>` | session bearer | 120 | p95-over-W projection + cumulative + headroom | §13.5 |
| `GET /tools/registered` | session bearer | 120 | per-session tool pool snapshot | §11.4 |
| `GET /events/recent?session_id=<sid>&after=<eid>&limit=<n>` | session bearer OR admin bearer | 120 session / 60 admin | newest-first §14.1 StreamEvents | §14.5 |
| `GET /observability/otel-spans/recent?session_id=<sid>&after=<span_id>&limit=<n>` | session bearer | 120 | §14.2 OTel ring | §14.5.2 |
| `GET /observability/backpressure` | operator bearer | 60 | OTel emitter buffer depth + drop counters | §14.5.3 |
| `GET /logs/system/recent?session_id=<sid>&category=<c>&after=<slog_id>&limit=<n>` | session bearer OR admin bearer | 120 session / 60 admin | §14.2 System Event Log tail | §14.5.4 |

### LLM dispatcher (v1.1)

| Endpoint | Scope | RPM | Response | §N |
|---|---|---|---|---|
| `POST /dispatch` | session bearer | 120 | DispatchResponse — always 200 (failure modes surface via `stop_reason` + `dispatcher_error_code`) | §16.3 |
| `GET /dispatch/recent?session_id=<sid>&limit=<n>` | session bearer OR admin bearer | 120 session / 60 admin | newest-first DispatchRecentRow array | §16.4 |

## Operator surfaces

| Endpoint | Scope | RPM | Purpose | §N |
|---|---|---|---|---|
| `POST /crl/refresh` | operator bearer | — | force a §7.3.1 CRL refresh pass across all anchors; systemd timer invokes this hourly | §7.3.1 (+ L-62) |
| `POST /handlers/enroll` | operator bearer | 60 | dynamic handler-key enrollment | §10.6.3 |
| `GET /security/key-storage` | operator bearer OR admin:read | 60 | `{storage_mode, private_keys_on_disk, conformance_flags}` | §10.6.4 |

## Debug-only (v1.1, test-double adapter only)

| Endpoint | Scope | RPM | Purpose | §N / Note |
|---|---|---|---|---|
| `POST /dispatch/debug/set-behavior` | operator bearer | — | flip `InMemoryTestAdapter` behavior at runtime; registered ONLY when the dispatcher's adapter is the in-memory test-double | L-62 |

Adopters wiring real LLM providers will NEVER see this route — type-check gating in the dispatch plugin means real adapters produce a 404.

## Not-a-side-effect invariant

These endpoints hold the normative invariant that two rapid reads of a quiescent state return byte-identical bodies when `generated_at` is excluded:

- `GET /audit/tail` (§10.5.2)
- `GET /audit/records` (§10.5.3)
- `GET /budget/projection/:sid` (§13.5)
- `GET /tools/registered` (§11.4)
- `GET /events/recent` (§14.5)
- `GET /observability/otel-spans/recent` (§14.5.2)
- `GET /observability/backpressure` (§14.5.3)
- `GET /logs/system/recent` (§14.5.4)
- `GET /memory/state/:sid` (§8.6)
- `GET /sessions/:sid/state` (§12.5.1)
- `GET /dispatch/recent` (§16.4)

Tests `SV-*-OBS-*` or `SV-*-PROJ-*` exercise this per endpoint.

## Scope hierarchy

- **session bearer** — minted by `POST /sessions`; valid for its session's lifetime; binds to an activeMode (ReadOnly / WorkspaceWrite / DangerFullAccess)
- **bootstrap bearer** — from `SOA_RUNNER_BOOTSTRAP_BEARER` env; creates sessions
- **operator bearer** — typically equal to the bootstrap bearer in single-operator deployments; admin:read + admin:write surfaces
- **handler bearer** — minted via `POST /handlers/enroll`; signs PDAs
- **reader-token** — short-TTL narrow-scope bearer minted via `POST /audit/reader-tokens`; audit reads only

admin:read is a **superset** of session:read for the shared endpoints — cross-session observability is admin-only.

## References

- Core §5.4 Operational Probes
- Core §10.5 Audit Trail (+ §10.5.1..§10.5.7)
- Core §13.5 Budget Projection Observability
- Core §14.5 StreamEvent observability
- Core §16.4 Dispatcher Observability (v1.1)
- `docs/pin-bump-runbook.md` — bumping protocol when new endpoints land
