# SOA-Harness v1.1.0 Release Notes

Adopter-facing narrative for v1.1.0. For the line-by-line changelog, see `CHANGELOG.md`. For change classification and future-errata rules, see `docs/errata-policy.md`.

v1.1.0 is an **additive minor release** per §19.4 of the Core spec. Every v1.0 conformance claim remains valid without code changes — v1.1 only adds new capabilities.

---

## What's new

### §16.3 LLM Dispatcher — normative (Core specification)

v1.0 left the "S3 → API call" step of the normative request lifecycle as a gap: the spec told implementers *when* an LLM call happens but not *how* to wire it. v1.1 closes that gap with a six-step MUST lifecycle:

1. Request validation against `llm-dispatch-request.schema.json`
2. §13.1 budget pre-check **before** provider call
3. `billing_tag` propagation through to the provider
4. Cancellation target registration (so §12.5 resume can terminate an in-flight dispatch)
5. Provider-error taxonomy mapping
6. Exactly one audit row per dispatch outcome

Three new schemas pin the wire contract: `llm-dispatch-request`, `llm-dispatch-response`, `dispatch-recent-response`.

### §16.3.1 Provider Error Taxonomy — normative

Seven provider failure conditions (HTTP 429 / 401 / 5xx / network / content-filter / context-length / request-invalid) classified into seven `dispatcher_error_code` values with JSON-RPC-aligned numeric subcodes (`-32100..-32105`, `-32110`). Retry budget: ≤3 retries across retryable classes.

### §16.4 Dispatcher Observability — normative

`GET /dispatch/recent?session_id=<sid>&limit=<n>` returns a newest-first ring of recent dispatches for a session. Session-bearer or admin-bearer auth. Not a side effect — byte-identical across reads except for the `generated_at` field.

### §16.5 Reserved Dispatcher Test IDs

`SV-LLM-01..07` anchored to §16.3 / §16.3.1 / §16.4. Six probes run live in `soa-validate` at v1.1.0 (01/02 vector-path, 03/04/06/07 live-path); `SV-LLM-05` continues to skip with an M8 "streaming mode" rationale.

### §13.4 StopReason closed-enum extension

New closed-enum member: `DispatcherError`. The seven fine-grained error codes live in the `dispatcher_error_code` observability field so the StopReason surface stays tight.

### §24 Error Code Taxonomy — Dispatcher category

Seven new JSON-RPC-aligned subcodes corresponding to the §16.3.1 taxonomy.

### Deployment artifacts (`docs/m7/deployment/`)

Reference `Dockerfile.runner` (multi-stage Node 22 Alpine, non-root, tini, healthcheck against `/ready`), minimal `docker-compose.yml` (Runner-only topology, loopback-only, read-only rootfs + tmpfs `/tmp`), and `systemd/` unit files hardened per §25.3 guidance (ProtectSystem=strict, NoNewPrivileges, RestrictSUIDSGID, MemoryDenyWriteExecute, SystemCallFilter). A companion `soa-runner-crl-refresh.{service,timer}` calls the impl's new `/crl/refresh` endpoint hourly.

### Documentation site (`docs-site/`)

Docusaurus-based MVP with intro / install / getting-started / conformance-tiers / reference architecture + LLM dispatcher pages. Builds cleanly. Deployment + versioning deferred to M11.

### Reference implementation additions

- `packages/runner/src/dispatch/` — Dispatcher class + `ProviderAdapter` interface + `InMemoryTestAdapter` + fault-injection DSL.
- `POST /dispatch` + `GET /dispatch/recent` HTTP routes.
- `POST /dispatch/debug/set-behavior` (admin-only, gated on the in-memory test-double adapter).
- `POST /crl/refresh` admin endpoint driving `BootOrchestrator.refreshAllNow()`.
- `GET /version` now surfaces `spec_commit_sha` baked in at schemas build time.
- `create-soa-agent` templates gain `npm run conform` + a bundled `conform.mjs` that runs `soa-validate` against the scaffolded Runner.
- New package: `@soa-harness/example-provider-adapter` — a reference ProviderAdapter scaffold for adopters wiring real LLM providers. Copy-and-customize, not use-as-is.

### Validator additions

- `SV-LLM-01..02` vector probes and `SV-LLM-03/04/06/07` live probes.
- `--check-pins` mode compares `soa-validate.lock` against `<impl>/version`, exits 1 on drift unless `--allow-drift`.
- `--dry-run` mode.

### Tooling

- `scripts/m7/bench-v1.0-baseline.mjs` — v1.0 perf baseline (Windows / WSL2 / Linux), written to `docs/m7/v1.0-perf-baseline.md`. M11+ `SV-PERF-*` regression gates diff against this.
- `scripts/check-pin-drift.py` + `.github/workflows/pin-drift.yml` — pin-drift detector, pre-merge + daily CI.

---

## Who should upgrade

- **Anyone calling an LLM provider from inside an SOA agent.** v1.1 turns the dispatcher into a contract — billing, cancellation, audit, and error mapping all land in one place.
- **Anyone building or maintaining a Runner-deployment recipe.** The v1.1 `docs/m7/deployment/` kit covers Docker + Compose + systemd with security hardening you'd otherwise have to derive from §25.3 yourself.
- **Conformance-test authors.** SV-LLM-01..07 are normative; `soa-validate` at v1.1.0 runs them.

## Who should stay on v1.0

- **Nobody, for reasons of breaking change.** v1.1.0 is strictly additive per §19.4. Staying on v1.0 is a choice about risk appetite, not about API compatibility.
- **Adopters still waiting for a full production Gateway** — the Gateway story is M11. Running a Runner-only deployment is what v1.1 is for.
- **Adopters blocked on streaming dispatcher** — `ProviderAdapter.dispatchStream()` arrives in v1.2.0 (M8); v1.1 supports sync dispatch only.

## What's signed in the release bundle

The `MANIFEST.json` / `MANIFEST.json.jws` pair pins the SHA256 of every normative artifact shipped with v1.1.0:

- Core + UI spec Markdown files
- 14 JSON schemas from v1.0 + 3 new schemas from v1.1 (`llm-dispatch-request`, `llm-dispatch-response`, `dispatch-recent-response`)
- Updated must-maps (SV-LLM category added to `soa-validate-must-map.json`)
- All test vectors
- `GOVERNANCE.md`, `LICENSE`, `LICENSE-docs.md`, `CHANGELOG.md`, `ERRATA.md`

The MANIFEST is signed with the same v1.0 release key (Ed25519, fingerprint `l5TzOjMJfyyDTuEarut87i3T8KhGBV4AeLwOXo028vI=`). Hardware-backed signing (YubiKey) remains scheduled as a v1.0.1 editorial errata item; v1.1.0 ships with software-Ed25519. Validator binaries continue to ship as `status: "placeholder"` entries — conformance tools MUST refuse to verify against a placeholder per the v1.0 normative rider.

## npm + GitHub artifacts

Published at v1.1.0:

- `@soa-harness/schemas@1.1.0`
- `@soa-harness/core@1.1.0`
- `@soa-harness/runner@1.1.0`
- `@soa-harness/memory-mcp-sqlite@1.1.0`
- `@soa-harness/memory-mcp-mem0@1.1.0`
- `@soa-harness/memory-mcp-zep@1.1.0`
- `@soa-harness/langgraph-adapter@1.1.0`
- **`@soa-harness/example-provider-adapter@1.1.0`** (new in v1.1)
- `create-soa-agent@1.1.0`

Git tags at `v1.1.0` on all three repos (spec + impl + validate), pinned to the same spec commit via `soa-validate.lock` in both siblings.

## Support window

- **v1.1.x** — security fixes and editorial errata for at least 12 months from the v1.1.0 tag.
- **v1.0.x** — the v1.0-LTS branch continues to receive security fixes per `docs/m7/v1.0-lts-branch-policy.md`. Adopters not ready to upgrade stay supported.
- **v1.2.0 (M8)** — streaming dispatcher + direct-to-Runner chat UI + CLI + VS Code extension stub. No calendar date promised; quality over speed.
- **v2.0.0** — any breaking change; announced in advance via `docs/errata-policy.md`.

## Reporting issues

- **Spec questions / ambiguities** — open an issue in the `soa-harness-specification` repo. Cite the section.
- **Impl bugs** — open an issue in `soa-harness-impl`. Include platform + Node version + runnable repro.
- **Validator bugs** — open an issue in `soa-validate`.
- **Security issues** — do NOT open a public issue. Use the security disclosure path described in `GOVERNANCE.md`.

## Acknowledgments

v1.1 was developed between the v1.0 ship date (2026-04-18) and this release. Work covered by L-61 revision 4, L-62 (M7 execution, both night-shifts), and L-63 (M8 kickoff draft) in `IMPLEMENTATION_LESSONS.md`. The project remains single-maintainer per `GOVERNANCE.md`; recruiting additional maintainers is a rolling goal tracked in that file.

## Links

- **Spec:** `https://github.com/wleeb1010/soa-harness-specification`
- **Reference runtime:** `https://github.com/wleeb1010/soa-harness-impl` (TypeScript, `@soa-harness/*` on npm)
- **Conformance harness:** `https://github.com/wleeb1010/soa-validate` (Go)
- **Release bundle:** see `MANIFEST.json` for the per-artifact digest chain
- **Errata:** `ERRATA.md` for post-v1.1 patches
- **Change log:** `CHANGELOG.md` for the line-by-line history
- **v1.0 release notes:** `RELEASE-NOTES.md` (kept in place as the v1.0 narrative)
