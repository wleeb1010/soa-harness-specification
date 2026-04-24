# M7 Exit Criteria

M7 per L-61 revision 4 is "v1.1.0 LLM dispatcher + deployment artifacts + docs-site MVP." Six-week budget. This doc lists the literal gates M7 is done against.

## Hard gates — ALL must pass before M7 ships v1.1.0

### Specification

- [x] §16.3 LLM Dispatcher (Normative) landed
- [x] §16.3.1 Provider Error Taxonomy landed
- [x] §16.4 Dispatcher Observability landed (`GET /dispatch/recent`)
- [x] §16.5 Reserved Dispatcher Test IDs (`SV-LLM-01..07`)
- [x] §13.4 `StopReason` enum extended with `DispatcherError`
- [x] §24 Error Code Taxonomy extended with Dispatcher category (7 numeric subcodes)
- [x] Three new schemas published + vendored: `llm-dispatch-request`, `llm-dispatch-response`, `dispatch-recent-response`
- [x] `soa-validate-must-map.json`: SV-LLM category + 7 test entries + 7 must_coverage anchors + phase-4 execution-order
- [x] `CHANGELOG.md` v1.1.0-dev section
- [ ] MANIFEST.json regenerated + signed with the release key
- [ ] `RELEASE-NOTES-v1.1.0.md` narrative (companion to CHANGELOG)

### Reference implementation (`soa-harness-impl`)

- [x] `packages/runner/src/dispatch/` module (types + errors + adapter interface + test-double + dispatcher + plugin + debug route)
- [x] `POST /dispatch` + `GET /dispatch/recent` HTTP routes
- [x] `POST /dispatch/debug/set-behavior` (admin-only, gated on in-memory test-double adapter)
- [x] `GET /version` surfaces `spec_commit_sha` baked in at schemas build time
- [x] `POST /crl/refresh` operator endpoint + systemd timer wiring
- [x] `create-soa-agent` templates: `npm run conform` target + `conform.mjs` + updated README
- [x] `@soa-harness/example-provider-adapter` scaffold package
- [x] 31+ unit tests covering dispatcher lifecycle
- [x] 19+ integration tests for dispatch HTTP plugin (19 = 15 routes + 4 debug-route)
- [x] 5 tests for `/crl/refresh` route
- [x] 15 tests for the example-provider-adapter
- [x] `pnpm -r test` green — 1,000+ tests total across all 9 packages (incl. new `example-provider-adapter`)
- [x] `pnpm -r build` tsc-clean across all packages
- [ ] `@soa-harness/runner@1.1.0` + `@soa-harness/example-provider-adapter@1.1.0` published to npm (gate: `scripts/release-v1.0.mjs` retargeted for v1.1 + signing ceremony re-run)

### Validator (`soa-validate`)

- [x] Pin-bumped to the spec commit landing §16.3-.5
- [x] `SV-LLM-01` + `SV-LLM-02` vector-path probes
- [x] `SV-LLM-03` + `SV-LLM-04` + `SV-LLM-06` + `SV-LLM-07` live-path probes
- [x] `SV-LLM-05` remains skip with "streaming mode M8" rationale
- [x] `--check-pins` mode
- [x] `--dry-run` mode
- [x] `go build ./... && go vet ./...` clean
- [x] Full validator run against reference impl: 63+ pass, 0 fail, ≤110 skip (of 170 total)

### Tooling

- [x] `scripts/m7/bench-v1.0-baseline.mjs` — v1.0 perf baseline pinned at `docs/m7/v1.0-perf-baseline.md`
- [x] `scripts/check-pin-drift.py` — local + CI pin drift detector
- [x] `.github/workflows/pin-drift.yml` — daily + pre-merge gate
- [x] `docs/pin-bump-runbook.md` — procedural bump documentation

### Deployment artifacts (`docs/m7/deployment/`)

- [x] `Dockerfile.runner` — multi-stage, non-root, tini, HEALTHCHECK; smoke-tested
- [x] `docker-compose.yml` — minimal Runner-only topology
- [x] `systemd/soa-runner.service` — hardened per §25.3
- [x] `systemd/soa-runner-crl-refresh.{service,timer}` — hourly refresh heartbeat calling real `/crl/refresh`
- [x] `docs/m7/deployment/README.md` — usage + security notes

### Documentation site (`docs-site/`)

- [x] Docusaurus skeleton builds cleanly (`npm install && npm run build`)
- [x] 6 starter pages: intro, install, getting-started, conformance-tiers, reference/architecture, reference/llm-dispatcher
- [x] `.gitignore` for node_modules + build/
- [ ] Deployment (GitHub Pages or Netlify) — DEFERRED TO M11 per roadmap

## Soft gates — nice to have before v1.1.0 but not blocking

- [x] L-62 record in `IMPLEMENTATION_LESSONS.md` documenting the M7 execution
- [x] Pin-drift stale-lock warning
- [ ] Run pin-drift CI on a live GitHub Actions environment (not just locally)
- [ ] `soa-validate.exe` release binary built + published to GitHub Releases
- [ ] Conformance badge auto-generated from `release-gate.json` (adopter-facing)
- [ ] `release-gate-report.schema.json` — lock the validator's output JSON shape

## Explicit non-goals (deferred to subsequent milestones)

These are NOT required for M7 exit:

- Streaming-mode dispatcher (`ProviderAdapter.dispatchStream()`) — M8
- Direct-to-Runner chat UI — M8
- CLI for end-user interaction — M8
- VS Code extension — M8
- Real A2A wire protocol wiring — M9
- SelfOptimizer integration — M10
- Gateway (OAuth/DPoP/WebAuthn + Redis + real-IdP) — M11
- Tool marketplace — M12
- Admin UI (10 control areas) — M13

## Exit ceremony

When every checked box in "Hard gates" turns to `[x]`:

1. Tag `v1.1.0` on spec, impl, and validate — same day, same commit message prefix
2. Publish npm + Go release binaries per `scripts/release-v1.0.mjs` (adapted for v1.1)
3. Append an L-63 closure record to `IMPLEMENTATION_LESSONS.md`
4. Update `CHANGELOG.md` to flip `[1.1.0-dev]` → `[1.1.0] — YYYY-MM-DD`
5. Write `RELEASE-NOTES-v1.1.0.md` narrative
6. Announce on the public surfaces that adopters watch (GitHub Discussions + repo README badges)

## References

- L-61 revision 4 in `IMPLEMENTATION_LESSONS.md` — M7 planning record
- L-62 in `IMPLEMENTATION_LESSONS.md` — M7 execution record (both night shifts)
- `docs/pin-bump-runbook.md` — lockstep-bump procedure for the exit ceremony
- `scripts/release-v1.0.mjs` — release orchestration script to adapt for v1.1
