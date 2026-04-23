# Changelog — SOA-Harness Specification

All notable changes to the SOA-Harness Core Specification and UI Integration Profile are documented here. Format follows Keep a Changelog; versioning follows §19.4 of the Core spec.

Categories per entry: **Added** (new), **Changed** (modified), **Deprecated** (scheduled removal), **Removed** (gone), **Fixed** (errata), **Security** (CVEs or hardening).

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
