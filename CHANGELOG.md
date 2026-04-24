# Changelog — SOA-Harness Specification

All notable changes to the SOA-Harness Core Specification and UI Integration Profile are documented here. Format follows Keep a Changelog; versioning follows §19.4 of the Core spec.

Categories per entry: **Added** (new), **Changed** (modified), **Deprecated** (scheduled removal), **Removed** (gone), **Fixed** (errata), **Security** (CVEs or hardening).

---

## [1.3.0] — 2026-04-24

Minor release — additive-minor per §19.4.1. Closes the M9 Agent2Agent (§17) profile with six coordinated spec additions, a schema extension, seven new / narrowed must-map assertions, and a ceremony-ordered pin bump across three repos.

### Added — Core spec (normative)

- **§17.2.1 HandoffStatus enum (v1.3).** Closed-enum with six values (`accepted`, `executing`, `completed`, `rejected`, `failed`, `timed-out`), monotonicity rule, `last_event_id` semantics per value, Runner-crash + resume carve-out, and explicit `rejected` vs `HandoffRejected` disambiguation. Test anchor: `SV-A2A-15`.
- **§17.2.2 Per-method deadlines (v1.3).** Six normative default deadlines with six `SOA_A2A_*_DEADLINE_S` env overrides. Task-execution timeout emits `SessionEnd(stop_reason=MaxTurns)`. Test anchor: `SV-A2A-16`.
- **§17.2.3 A2A capability advertisement + matching (v1.3).** New optional `a2a.capabilities` on the Agent Card. Five-row truth table. Byte-exact reason string `"no-a2a-capabilities-advertised"`. `capabilities_needed` validation (non-empty strings, order-preserving dedup, 256-element soft cap). Byte-exact UTF-8 comparison — no Unicode normalization. `error.data.missing_capabilities` on -32003. §17.2.3.1 Informative token registry. Test anchor: `SV-A2A-17`.
- **§17.2.4 agent.describe result shape (v1.3).** Normative `{card, jws}` envelope. `result.jws` signs `JCS(result.card)` per §6.1.1. Five-step verification order. §19.4.1 additive-minor extensibility (unknown fields IGNORED). Schema vs signature error-class split. Card-rotation race carve-out. §17.1 step 4 `agent_card_etag` formula pinned. Test anchor: `SV-A2A-03` (narrowed).
- **§17.1 step 4 clarified.** HandoffRejected response MUST carry byte-exact `reason: "card-version-drift"`. Disjointness with `card-unreachable` explicit. Test anchor: `SV-A2A-13` (narrowed).
- **§17.2.5 Per-method digest recompute (v1.3).** Three-row matrix. Offer-state retention MUST tied to §17.2.2 transfer deadline. Restart-crash observability rule. `final_messages` vs `result` disambiguation. Test anchor: `SV-A2A-14` (narrowed).

### Added — Schemas

- **`schemas/agent-card.schema.json`** gains optional `a2a` object with nested `capabilities: string[]`.

### Changed / Added — Must-map

- `SV-A2A-03` narrowed to §17.2.4 result-envelope contract.
- `SV-A2A-05` narrowed to -32003 error-code-membership (trigger conditions move to SV-A2A-17).
- `SV-A2A-13` narrowed to name `card-version-drift` reason string.
- `SV-A2A-14` narrowed to §17.2.5 per-method matrix.
- `SV-A2A-15` NEW (critical) — HandoffStatus transition matrix + monotonicity.
- `SV-A2A-16` NEW (moderate) — per-method deadlines + env-var overrides.
- `SV-A2A-17` NEW (critical) — §17.2.3 truth table + reason string + error.data shape.

### Changed — Reference implementation (`soa-harness-impl`)

- All 11 packages bump 1.2.1 → 1.3.0. Four new `a2a` modules (`matching.ts`, `jwt.ts`, `signer-discovery.ts`, `digest-check.ts`). Test total 882/882 (up from 816).
- `buildRunnerApp` accepts `a2a: { bearer, a2aCapabilities? }` option. When present, `POST /a2a/v1` mounts with a real §6.1.1-compliant signed Agent Card JWS in `agent.describe` results.
- `A2aHandoffRejectedReason` vocabulary grows 9 → 10 (adds `card-version-drift`).
- Scaffold `runnerVersion` 1.2 → 1.3; `@soa-harness/*` dep ranges `^1.2.1` → `^1.3.0`. `tools/vscode-extension` 1.2.1 → 1.3.0.

### Changed — Conformance validator (`soa-validate`)

- `soa-validate.lock` bumps c958bf9 → b87c2ff in lockstep with impl.
- `internal/testrunner/handlers_a2a.go` forward-registers `SV-A2A-10..17` as skip-with-rationale handlers citing impl-unit-test coverage.

### HARD-GATE exercise records

Every normative spec commit passed the plan-evaluator gate at `docs/spec-change-checklist.md`:

- §17.2.1 + §17.2.2 (W1): 3 critical + 8 moderate/minor addressed inline.
- §17.2.3 (W2): 2 critical + 6 moderate addressed inline.
- §17.2.4 (W2): 4 critical + 1 high + 6 moderate addressed inline.
- §17.1 step 4 (W3-prep): 2 moderate addressed inline.
- §17.2.5 (W4-prep): 3 critical + 4 moderate addressed inline.

### Spec artifacts

- `MANIFEST.json` / `MANIFEST.json.jws` regenerated at this commit. Signed with the v1.0 release key (fingerprint unchanged; no key rotation at v1.3).

---

## [1.2.1] — 2026-04-24

Patch release — editorial-class per §19.4. No spec changes. Fixes a scaffold-template wiring bug (Debt #8 from L-66) where `create-soa-agent` scaffolded Runners reported `runner_version: "1.2"` correctly in the field but `/version` still emitted "1.1" because the scaffold hard-codes `runnerVersion` across four `start.mjs` templates and we missed bumping it from the v1.1.1 patch set.

### Fixed — Reference implementation (`soa-harness-impl`)

- **`create-soa-agent` scaffold templates** — all four variants (`runner-starter`, `runner-starter-mem0`, `runner-starter-zep`, `runner-starter-none`) now hard-code `runnerVersion: "1.2"` instead of stale `"1.1"`. Fresh `npx create-soa-agent@1.2.1` produces a Runner whose `/version` correctly self-identifies as 1.2.x. Debt #8 closed.
- Scaffold `package.json` deps bumped to `^1.2.1` across all variants.

### Spec artifacts — unchanged from v1.2.0

- `MANIFEST.json` / `MANIFEST.json.jws` byte-identical to v1.2.0. The v1.2.0 signed release bundle remains authoritative for v1.2.1 (pin target `c958bf9`). No re-signing ceremony.
- `PINNED_SPEC_COMMIT` in `@soa-harness/schemas@1.2.1` stays at `c958bf9` — pure impl patch.

---

## [1.2.0] — 2026-04-24

Additive minor per §19.4. Streaming dispatcher + chat UI + CLI + VS Code extension stub. Everything below is wire-format-compatible with v1.0 / v1.1 conformance claims: an implementation that only supports §16.3 synchronous dispatch stays v1.0-conformant. Streaming is an opt-in capability advertised via the `ProviderAdapter.dispatchStream?()` method.

### Added — Core specification (§16.6)

- **§16.6 Streaming Dispatcher (Normative)** — `ProviderAdapter.dispatchStream?()` extension, SSE response mode (`POST /dispatch` with `Accept: text/event-stream`), StreamEvent sequence invariants, mid-stream cancellation via `POST /dispatch/{correlation_id}/cancel`.
- **§16.6.2** HTTP surface: `text/event-stream` content-type, `event: / data:` SSE framing with JCS-canonicalized event payload, `: stream-done` terminator comment.
- **§16.6.3** sequence invariants: exactly one `MessageStart`/`MessageEnd`; `ContentBlockDelta` only between matching `ContentBlockStart`/`ContentBlockEnd`; strict per-session `sequence` monotonicity.
- **§16.6.4** mid-stream cancellation normatively defined (supersedes the §16.3#lifecycle-cancellation anchor for `SV-LLM-05`).
- **§16.6.5** reserves three new test IDs: `SV-LLM-08` (SSE framing), `SV-LLM-09` (adapter-unsupported fallback), `SV-LLM-10` (sequence invariants).

### Added — §24 Dispatcher error codes

- `DispatcherStreamUnsupported` (`-32111`) — `POST /dispatch` with `Accept: text/event-stream` against an adapter that lacks `dispatchStream`. Runner responds HTTP 406.
- `DispatcherAdapterError` (`-32112`) — adapter-internal failure surfacing through a streaming dispatch.

### Added — Must-map

- `SV-LLM-05` flipped skip → active. Section reference updated `§16.3` → `§16.6.4`.
- `SV-LLM-08..10` registered under the SV-LLM category. Phase-4 execution order extended.
- Four new `must_coverage` anchors: `§16.6.2#sse-framing`, `§16.6.2#adapter-capability`, `§16.6.3#sequence-invariants`, `§16.6.4#cancellation`.

### Planned — Reference implementation (`soa-harness-impl`)

- `packages/runner/src/dispatch/stream.ts` — SSE plugin, abort-signal wiring, sequence invariant enforcement.
- `@soa-harness/chat-ui` — new package. React + Vite, SSE consumer, permission prompt UI, audit tail viewer, WCAG 2.1 AA gate.
- `@soa-harness/cli` — new package. `soa chat / status / audit tail / conform`.
- `vscode-soa-harness` — VS Code extension stub. Reads `.soa/` workspace, sidebar Runner status, trigger dispatch from editor.

### Planned — Validator (`soa-validate`)

- `SV-LLM-05` live probe (streaming cancellation).
- `SV-LLM-08..10` live probes.
- `SV-COMPAT-05..08` compat probes (impl↔validator version surface).
- `UV-CMD-07..10` CLI probes.
- `UV-A11Y-01..04` WCAG accessibility probes.

---

## [1.1.1] — 2026-04-24

Patch release — editorial class per §19.4. No spec changes. Fixes two build-time wiring bugs in the v1.1.0 reference runtime + scaffold. v1.1.0 remains a valid release; v1.1.1 is the recommended upgrade for adopters using `soa-validate --check-pins`.

### Fixed — Reference implementation (`soa-harness-impl`)

- **`@soa-harness/schemas` PINNED_SPEC_COMMIT** — bumped from `68b34f1` (M7-week-1 internal commit) to `2184a32` (v1.1.0 spec tag target). v1.1.0 shipped with the stale pin because the release ceremony published `npm` packages BEFORE the `soa-validate.lock` pin bump, freezing the schemas package at the pre-ceremony SHA. `soa-validate --check-pins` against a v1.1.0-scaffolded Runner needed `--allow-drift`; v1.1.1 removes that friction.
- **`create-soa-agent` scaffold templates** — all four template variants (`runner-starter`, `runner-starter-mem0`, `runner-starter-zep`, `runner-starter-none`) now wire `governance.pinnedSpecCommit: PINNED_SPEC_COMMIT` into the scaffolded `start.mjs`, so `GET /version` surfaces `spec_commit_sha` out of the box. `runnerVersion` bumped to `"1.1"` throughout. Scaffold `package.json` gains `@soa-harness/schemas` as a direct dependency to enable the new import.

### Changed — Process

- **Release ceremony order** — future releases must pin-bump `soa-validate.lock` as part of the release-prep commit, BEFORE `npm publish`. This ensures PINNED_SPEC_COMMIT (baked in at schemas build time) and the sibling `soa-validate.lock` files converge on the same commit. Documented in L-64 retro.

### Spec artifacts — unchanged from v1.1.0

- MANIFEST.json, MANIFEST.json.jws, schemas, test vectors, must-maps all byte-identical to v1.1.0. The v1.1.0 signed release bundle remains authoritative for v1.1.1 (pin target `2184a32`). No re-signing ceremony.

---

## [1.1.0] — 2026-04-24

Additive minor per §19.4. Everything below is wire-format-compatible with v1.0 conformance claims: a v1.0 adopter does not need to change existing code to keep passing — v1.1 adds capabilities without removing anything.

### Added — Core specification (§16)

- **§16.3 LLM Dispatcher (Normative)** — closes the §16.1 S3 "API call" gap. Six-step MUST lifecycle (request validation → §13.1 budget pre-check BEFORE provider call → billing_tag propagation → cancellation target registration → provider-error taxonomy mapping → one audit row per dispatch). Request/response contracts pinned to three new schemas.
- **§16.3.1 Provider Error Taxonomy (Normative)** — seven provider conditions (HTTP 429 / 401 / 5xx / network / content-filter / context-length / request-invalid) classified into seven `dispatcher_error_code` values with JSON-RPC-aligned numeric subcodes (`-32100`..`-32105`, `-32110`). Retry budget: ≤3 retries total across retryable classes.
- **§16.4 Dispatcher Observability (Normative)** — `GET /dispatch/recent?session_id=<sid>&limit=<n>` — newest-first ring, session-bearer auth, admin-bearer override, not-a-side-effect invariant, byte-identity across reads excluding `generated_at`.
- **§16.5 Reserved Dispatcher Test IDs (Normative)** — `SV-LLM-01..07` anchored to §16.3 / §16.3.1 / §16.4.

### Added — StopReason + error catalog

- **§13.4 StopReason enum** — `DispatcherError` added. Single new closed-enum member; the seven fine-grained error codes live in the `dispatcher_error_code` observability field to keep the StopReason surface tight.
- **§24 Error Code Taxonomy** — new "Dispatcher" category with the seven JSON-RPC subcodes listed in §16.3.1.

### Added — Schemas (v1.1 `$id` namespace)

- `schemas/llm-dispatch-request.schema.json`
- `schemas/llm-dispatch-response.schema.json` (allOf/if: `dispatcher_error_code` non-null iff `stop_reason` === `"DispatcherError"`)
- `schemas/dispatch-recent-response.schema.json`

### Added — Must-map

- `SV-LLM-01..07` under new `SV-LLM` category, registered in phase 4 (Runtime Core) execution order.
- Seven new `must_coverage` anchors: `§16.3#dispatcher-request`, `§16.3#dispatcher-response`, `§16.3#lifecycle-budget`, `§16.3#lifecycle-billing-tag`, `§16.3#lifecycle-cancellation`, `§16.3#lifecycle-audit`, `§16.3.1#provider-error-taxonomy`.

### Added — Deployment artifacts (`docs/m7/deployment/`)

- Reference `Dockerfile.runner` (multi-stage Node 22 Alpine, non-root, tini, healthcheck against `/ready`).
- Minimal `docker-compose.yml` (Runner-only topology, loopback-only, read-only rootfs + tmpfs `/tmp`).
- `systemd/soa-runner.service` hardened per §25.3 guidance (ProtectSystem=strict, NoNewPrivileges, RestrictSUIDSGID, MemoryDenyWriteExecute, SystemCallFilter).
- `systemd/soa-runner-crl-refresh.{service,timer}` — hourly CRL refresh heartbeat, activates impl's new `/crl/refresh` endpoint.

### Added — Tooling

- `scripts/m7/bench-v1.0-baseline.mjs` — benches the v1.0 Runner across Windows / WSL2 / Linux environments; produces the pinned perf anchors for M11+ SV-PERF-* regression gates.
- `scripts/check-pin-drift.py` — detects silent divergence between impl and validate `soa-validate.lock` files.
- `.github/workflows/pin-drift.yml` — daily + pre-merge CI gate running the pin-drift detector.

### Added — Docs site (`docs-site/`)

- Docusaurus-based MVP with intro / install / getting-started / conformance-tiers + reference architecture + LLM dispatcher pages. Builds cleanly (`cd docs-site && npm install && npm run build`). Deployment + versioning deferred to M11.

### Added — Reference implementation (`soa-harness-impl`)

- `packages/runner/src/dispatch/` — Dispatcher class + ProviderAdapter interface + InMemoryTestAdapter + DSL for conformance fault injection. 31 unit tests covering the 6-step lifecycle + taxonomy + retry budget.
- `POST /dispatch` + `GET /dispatch/recent` HTTP routes (plus `POST /dispatch/debug/set-behavior` admin-only for test-double fault injection; registered only when the adapter is the in-memory test-double).
- `POST /crl/refresh` admin-bearer endpoint that drives `BootOrchestrator.refreshAllNow()`. Activates the systemd timer placeholder.
- `GET /version` now surfaces `spec_commit_sha` (baked in at schemas build time via `PINNED_SPEC_COMMIT` export).
- Env-driven test-double wiring in `start-runner`: `SOA_DISPATCH_ADAPTER=test-double` + `SOA_DISPATCH_TEST_DOUBLE_CONFIRM=1` + `SOA_DISPATCH_TEST_DOUBLE_BEHAVIOR=<dsl>`.
- `create-soa-agent` templates gain `npm run conform` script + `conform.mjs` that runs `soa-validate` against the scaffolded Runner.

### Added — Validator (`soa-validate`)

- `SV-LLM-01..02` vector probes + `SV-LLM-03/04/06/07` live probes against the new dispatch HTTP routes. `SV-LLM-05` still skips pending streaming-mode dispatcher (M8).
- `--check-pins` flag — reads this validator's own `soa-validate.lock` + hits `<impl>/version` to compare `spec_commit_sha`; exits 1 on drift unless `--allow-drift`.

### Changed

- Nothing. All v1.1 additions are additive. A v1.0 conformance claim remains valid with no code changes.

### Fixed

- Nothing. No errata-class corrections in v1.1 (errata continue to land on the `v1.0-lts` branch per `docs/m7/v1.0-lts-branch-policy.md`).

---

## [1.0.0] — 2026-04-XX (TBD — release date filled at Phase 3)

Initial production release. The specification has completed four rounds of graph-based structural audit plus external reviews. Conformance harness (`soa-validate`), reference runtime (`@soa-harness/runner`), and three reference Memory MCP backends (sqlite / mem0 / Zep) ship simultaneously under the same version tag.

### Added — Core capabilities (§5–§18)

- **External trust bootstrap** (§5.3) — SDK-pinned, operator-bundled, or DNSSEC TXT trust anchors. Rotation and anchor-disagreement protocols. Bootstrap testability env hooks for conformance.
- **Agent Card signing profile** (§6.1.1) — Per-artifact JWS with detached signature, RFC 8785 JCS canonicalization, Ed25519 / ES256 algorithm set, X.509 chain pinned to bootstrap anchors.
- **AGENTS.md source + import semantics** (§7) — File grammar, `@import` resolution, reload rules.
- **Memory layer MCP contract** (§8.1) — Six tools: `add_memory_note`, `search_memories`, `search_memories_by_time`, `read_memory_note`, `consolidate_memories`, `delete_memory_note`. Loading algorithm, unavailability and timeout semantics with three-consecutive-failure `StopReason::MemoryDegraded` rule, consolidation trigger, sharing policy, state observability endpoint.
- **Reference Memory backends** (§8.7 — Informative) — Three production-ready MCP servers: sqlite (single-node), mem0 (hosted graph), Zep (self-hosted long-term memory). Selection rubric, deployment recipes, conformance gate.
- **Self-improvement profile** (§9) — `program.md` + `agent.py` + SelfOptimizer primitive + Harbor task layout + Docker seccomp baseline + `clone3` policy + rollback semantics.
- **Permission resolution** (§10) — Three-axis capability model, tool classification, tighten-only resolution algorithm, autonomous-handler escalation state machine, hash-chained WORM audit, handler key lifecycle, CRL cache three-state machine, privacy and data-governance controls.
- **Tool registry + pool assembly** (§11) — Static global registry, per-session tool pool, re-registration timing rules, dynamic registration observability.
- **Session persistence + bracket-persist** (§12) — Atomic writes on Linux / macOS / Windows, resume algorithm, crash-test markers, audit-sink event channel.
- **Token budget** (§13) — p95-over-W projection with 1.15 safety factor, mid-stream enforcement, cache accounting, `StopReason` closed enum, budget projection observability endpoint.
- **StreamEvent** (§14.1) — 25-type closed enum with per-type payload schemas + event-to-trust-class mapping. OpenTelemetry mapping (§14.4). Minimum StreamEvent observability channel (§14.5) with post-crash observation via admin scope.
- **LangGraph event mapping** (§14.6 — Informative) — 40-LangGraph-events → 27-SOA-types with adapter deviation protocol.
- **Hook contract** (§15) — Stdin JSON schema, stdout + exit code conventions, HR-01..HR-18 regression suite.
- **Agent2Agent handoff** (§17) — JSON-RPC over mTLS + JWT, agent-card-etag drift detection.
- **Conformance framework** (§18) — MUST-to-test map, conformance levels (`core`, `core+si`, `core+handoff`, `full`), invocation protocol, adapter conformance requirements (§18.5).

### Added — Infrastructure

- **Release manifest** — `MANIFEST.json` + `MANIFEST.json.jws` signed by the release key. Pins every normative artifact's SHA256. Placeholder entries for validator binaries carry an explicit `status: "placeholder"` per schema, with normative rider that conformance tools MUST refuse to verify placeholder entries.
- **Test vectors** — JCS-parity fixtures, Agent Card goldens, permission-prompt signed decisions, tasks-fingerprint reference inputs, JWT clock-skew fixtures, Memory MCP mock corpus, LangGraph adapter traces.
- **Schemas** — 14 ajv-compilable JSON Schema draft 2020-12 schemas covering every wire format.
- **Three-repo independent-judge architecture** — `soa-harness-specification` (normative source), `soa-harness-impl` (TypeScript reference), `soa-validate` (Go conformance harness). Must-map pinned by digest between repos.

### Added — Developer experience

- **`create-soa-agent` scaffold** — `npx create-soa-agent my-agent` bootstraps a runnable agent with demo tools, example Agent Card, PreToolUse hook, sample AGENTS.md.
- **Pre-commit hook** (`.git/hooks/pre-commit`) — Enforces `test_id → §X.Y` anchor stability. 420 tests / 200 anchors / zero broken references at initial release.
- **Errata policy** (`docs/errata-policy.md`) — Editorial / minor / breaking decision tree with 10 pre-classified scenarios.
- **Dist-tag strategy** (`docs/m6/dist-tag-strategy.md`) — `latest` advances at release day; `next` retires after 14-day observation window.
- **Credential sweep** (`.trufflehog3.yml`) — Path exclusions for known-artifact high-entropy content (SHA256 hashes, JWS signatures, canonicalized JSON); any net-new finding surfaces.
- **CI anchor-stability workflow** (`.github/workflows/anchor-stability.yml`) — Belt-and-suspenders for the pre-commit hook against `--no-verify` bypass.

### Added — Governance

- **`GOVERNANCE.md`** — Honest single-maintainer acknowledgment. No pretense of a working group.
- **`docs/errata-policy.md`** — Explicit editorial / minor / breaking decision tree.
- **`docs/m6/release-key-ceremony.md`** — Ed25519 key generation, passphrase hygiene, offsite backup, signing-machine protocol, disaster scenarios.
- **Graph-based spec knowledge model** (`graphify-out/graph.json`) — Queryable via the `graphify-spec` MCP at sub-second latency. 500+ nodes covering every section, citation, test ID, trust-class mapping, threat-model entry.

### Security

- All normative signing uses Ed25519 or ES256; RSA is explicitly excluded from the Agent Card / program.md signing profiles.
- Handler CRL cache has a three-state machine (`fresh | stale-but-valid | expired`); only `expired` fails closed.
- Audit WAL pattern (pending → fsync → append) replays on crash restart.
- Docker seccomp baseline (§9.7) governs self-improvement sandbox.
- Threat model (§25) catalogs attack surface with mitigations and documents residual risk.

### Known limitations / deferred to future versions

- **Validator binaries** — `MANIFEST.json` ships with placeholder entries for `soa_validate_binary` and `ui_validate_binary`. Binary artifacts live in their sibling repos and are released separately; adopters fetch them from the `soa-validate` GitHub release.
- **Full `soa+UI` Gateway feature matrix** — The TypeScript Gateway reference implementation in `soa-harness-impl` is a working sketch for `core`; production-ready Gateway depth is targeted for v1.1.
- **Self-hosted Windows durability** — GitHub Actions `windows-latest` is Hyper-V, not bare metal. Simulated-crash tests pass on the GA runner but bare-metal durability verification is a v1.1 goal.
- **External second-party implementation** — The "SOA-Harness v1.0 Bake-Off Verified" conformance label requires an independent reimplementation whose `soa-validate` output converges to zero divergence. Until one materializes, v1.0.0 ships as "Reference Implementation" only.

---

## Pre-1.0 milestones (internal development log)

Development milestones M1 through M5 were internal-planning checkpoints, not released versions. Each is summarized below for historical context. None of them carry a separate SemVer tag.

- **M1 — "Hello Agent" thin slice**: trust bootstrap, Agent Card, StreamEvents, minimal permission resolver, CRL cache, hash-chained audit, scaffold. 8 test IDs passing.
- **M2 — Crash-safe persistence**: session bracket-persist, WAL audit, Linux + macOS + Windows simulated-crash tests. HR-04 / HR-05 / SV-SESS-01.
- **M3 — Gateway + `soa-validate` v1.0 + Memory + Budget**: UI Gateway sketch, memory layer, token budget, dynamic MCP tool registration, conformance harness. ~120/150 Core tests.
- **M4 — Adapter + adoption**: LangGraph adapter, §14.6 event mapping, §18.5 adapter conformance, onboarding gate.
- **M5 — Reference Memory backends**: sqlite + mem0 + Zep implementations; memory wire-shape cleanup (`notes` → `hits`, `add_memory_note` signature normalization).
- **M6 — Release refactor**: spec-as-v1.0-final pass (strip milestone annotations, de-inline planning log references); release orchestration; signed MANIFEST.

---

## References

- `ERRATA.md` — per-patch errata for versions after 1.0.0
- `RELEASE-NOTES.md` — adopter-facing narrative for 1.0.0
- `docs/errata-policy.md` — change-classification decision tree
- Core spec §19.4 — governing versioning rules
