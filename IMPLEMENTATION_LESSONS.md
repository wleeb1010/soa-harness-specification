# Implementation Lessons — SOA-Harness v1.0

Running log of lessons surfaced during the **reference-implementation exercise** (`soa-harness-impl` + `soa-validate` parallel build, Q2 2026). Purpose: prevent the spec from drifting away from what real implementers discover, and prevent softer process / adopter-pattern lessons from being lost between ping-pong sessions.

Every lesson is triaged into one of three destinations:

- **`normative`** — the normative body of the Core or UI spec, or a `schemas/` file, needs to change
- **`docs`** — a new or existing `docs/*` document needs the rule captured (authoring discipline, testing discipline, release process)
- **`pattern`** — captures an adopter-deployment pattern; belongs in `docs/deployment-environment.md` or a new `docs/adoption-patterns.md`

A lesson is `in-spec` when its destination file has been updated and the commit SHA is recorded below.

## Status legend

| Status | Meaning |
|---|---|
| `open` | Surfaced and triaged; not yet landed anywhere |
| `in-spec` | Normative or documentary edit landed; commit SHA recorded |
| `deferred` | Agreed scope for a later milestone; milestone tag in parens |
| `scratched` | Re-examined and concluded it isn't a real gap; reason recorded |

## Lessons log

### L-01 — CRL clock injectability for testability `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · validator Week 2 day 1
- **What:** Implementations SHOULD accept an injectable clock for the time-dependent verification paths in §10.6.1 (CRL freshness: `issued_at` proximity to "now", `not_after` expiry) so conformance vectors can deterministically exercise the three freshness states (`fresh` | `stale-but-valid` | `expired`) regardless of wall-clock time at test execution.
- **Why it matters:** `test-vectors/crl/stale.json` is designed to land in `stale-but-valid` under a reference clock `T_ref = 2026-04-20T12:00:00Z` (age 90 min from `issued_at`). Without clock injection, a validator running the fixture in 2027 would observe age ≈ 1 year and classify it as `expired` instead of `stale-but-valid` — the state-machine test becomes non-deterministic.
- **Destination:** §10.6.1 note immediately after the existing **Failure-mode MUSTs** paragraph.
- **Commit landing this edit:** this file's initial commit — the same patch introduces the tracker AND the §10.6.1 testability note. Check `git log --follow IMPLEMENTATION_LESSONS.md` for the exact SHA.

### L-02 — `/ready` 503 reason enum already complete `[scratched]`

- **Surfaced:** 2026-04-20 · during impl session Week 2 day 1
- **Initial read:** I believed §5.4 was thin on `/ready` semantics and had to derive the 503 contract in a paste block to impl.
- **Re-examined:** §5.4 line 207 already enumerates the full `{bootstrap-pending | tool-pool-initializing | persistence-unwritable | audit-sink-unreachable | crl-stale}` reason set with normative MUST language. Impl just needed to implement what's already there.
- **Resolution:** not a spec gap. Marking scratched so a future reviewer of this tracker doesn't re-open it.

### L-03 — `x5c` requirement emphasis `[scratched]`

- **Surfaced:** 2026-04-20 · both impl and validator initially missed `x5c` in the Agent Card JWS protected header
- **Initial read:** Possibly worth adding a "common implementer mistakes" callout in §6.1.1.
- **Re-examined:** §6.1.1 row 1 already states `Required header fields = alg, kid, x5c` and line 239 explains the leaf-first array semantics with `SV-SIGN-04` anchor. The normative text is clear and testable; the miss was an impl reading bug, not a spec readability bug. The validator's independent reading correctly caught it — which is exactly the function the three-repo architecture was built to perform.
- **Resolution:** not a spec gap. Scratched.

### L-04 — Test-vector authoring discipline `[docs, open]`

- **Surfaced:** 2026-04-20 · Week 0 JCS parity incident
- **What:** Cross-library parity test vectors MUST NOT contain hand-authored `expected_canonical` values — the expected output MUST be machine-generated from the canonicalizer libraries themselves (see `test-vectors/jcs-parity/generate-vectors.mjs`). Hand-authored values caused the original parity divergence that blocked Week 0 for a full day.
- **Why it matters:** Future contributors adding vectors for new cross-library invariants (e.g., `ed25519-parity`, `jws-signing-input-parity`) must apply the same discipline or recreate the incident.
- **Destination:** new `docs/testing-discipline.md` with sections on vector authoring, MANIFEST regen cadence, and fixture clock handling.
- **Milestone target:** land alongside M1 close or when a second parity suite is contemplated — whichever comes first.

### L-05 — MANIFEST regen cadence rule `[docs, open]`

- **Surfaced:** 2026-04-20 · during the L-01 / HR-01 / HR-02 vector commits
- **What:** `MANIFEST.json` MUST be regenerated via `build-manifest.mjs` whenever any file listed in its `supplementary_artifacts` changes digest. The tool detects this automatically; authors MUST NOT ship a commit where `MANIFEST.json` is stale relative to the files it references.
- **Why it matters:** Stale MANIFEST silently breaks pin integrity — `soa-validate.lock.spec_manifest_sha256` will either fail to match or pin to bytes that don't correspond to the referenced artifacts.
- **Destination:** `docs/testing-discipline.md` (same doc as L-04) or a git pre-commit hook.
- **Milestone target:** M1 close.

### L-06 — `soa-validate.lock` pin-bump protocol `[pattern, open]`

- **Surfaced:** 2026-04-20 · invented for the sibling-repo lockstep
- **What:** The `{spec_commit_sha, spec_manifest_sha256, pin_history[]}` pattern used by `soa-harness-impl/soa-validate.lock` and `soa-validate/soa-validate.lock`. Guarantees that impl and validator are measured against the same spec bytes at every release.
- **Why it matters:** A validator pinned to a different spec commit than the implementation it tests is diagnosing the wrong system. The protocol makes that failure mode impossible to ship silently.
- **Destination:** `docs/deployment-environment.md` as an adopter-pattern recommendation (not a normative requirement — some adopters ship impl-only without a sibling validator).
- **Milestone target:** M1 close.

### L-07 — Three-repo independence model `[pattern, open]`

- **Surfaced:** 2026-04-20 · confirmed by real-world catches during Week 1 and Week 2
- **What:** The three-repo architecture — spec, impl, validator — with independent authors (or at minimum independent reading sessions) and a lockstep pin. Designed to prevent **self-proving conformance** (a validator written by the same author as the impl inheriting the same misreadings).
- **Why it matters:** This week produced two real catches that a single-repo single-author setup would have silently agreed on: the Agent Card URL divergence, and the `/health` + `/ready` gap.
- **Destination:** `docs/deployment-environment.md` or a new `docs/adoption-patterns.md` — as a recommended (not required) organizational pattern for v1.0 adopters who want conformance claims stronger than self-certification.
- **Milestone target:** M1 close.

### L-09 — Permission decision observability `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 2 close, SV-PERM-01 live-path divergence between impl (claimed green) and validator (correctly observed skip)
- **What:** `SV-PERM-01` is a normative conformance test, but §10.3 defined permission resolution as an in-process function with no externally observable surface. The validator's source-grep of the impl's registered routes confirmed no `/permissions/…` path existed — meaning the conformance test had no window to observe.
- **Why it matters:** the gap was structural, not implementation-defect. Any impl passing §10.3 in-process could still fail to expose the decision externally, making `SV-PERM-01` live-testing impossible without an impl-specific backdoor. The three-repo architecture's independent-judge property surfaced the contradiction in Week 2 day 2.
- **Root-cause fix:** added §10.3.1 **Permission Decision Observability (Normative)** to Core — `GET /permissions/resolve?tool=…&session_id=…`, session-scoped bearer auth, 60-rpm rate limit, a closed-enum response schema (`schemas/permissions-resolve-response.schema.json`), and an explicit **not-a-side-effect property** enforced by `SV-PERM-01`'s live path (validator reads audit-log tail hash before and after the query batch). This is a first-class public endpoint — operators legitimately need it for policy review and incident response, not a test-only hook.
- **Versioning note:** the addition is strictly additive; no existing §10.3 step-1-through-5 behavior changes. Runners claiming `soaHarnessVersion: "1.0"` MUST ship the new endpoint.
- **Destination edits landed this commit:**
    - Core spec §10.3.1 (new subsection, ~1 screen of normative text)
    - `schemas/permissions-resolve-response.schema.json` (new)
    - `soa-validate-must-map.json` — SV-PERM-01 assertion text expanded to describe vector-path + live-path
- **Commit landing this edit:** the same patch that added this L-09 entry. Check `git log --follow IMPLEMENTATION_LESSONS.md` for the exact SHA.

### L-10 — Audit tail observability `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 1 kickoff — validator session asked for a surface to read the audit log's tail `this_hash` so it could assert the §10.3.1 not-a-side-effect property. No such endpoint existed.
- **What:** §10.5 defined the hash chain as tamper-evident but provided no external observation surface for the tail. Tamper-evidence that only the Runner can prove is useless for independent verification.
- **Root-cause fix:** added §10.5.2 **Audit Tail Observability (Normative)** — `GET /audit/tail` returning `{ this_hash, record_count, last_record_timestamp, runner_version, generated_at }` conforming to the new `schemas/audit-tail-response.schema.json`. Bearer-scoped with `audit:read`, 120 rpm rate limit, TLS 1.3. Explicit not-a-side-effect property (reading MUST NOT append an audit meta-record — that would make the validator's assertion a false-negative even on a conforming Runner).
- **Commit landing this edit:** the same patch that added this L-10 entry (check `git log --follow IMPLEMENTATION_LESSONS.md`).

### L-11 — Session bootstrap + session-scoped activeMode `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 1 — validator session flagged that the SV-PERM-01 capability-lattice sweep requires three activeMode values (ReadOnly, WorkspaceWrite, DangerFullAccess) but the spec only supported one activeMode per Agent Card (i.e., per deployment). Testing all three required three Runner deployments, which is an operational hack.
- **What:** `activeMode` was effectively Agent-Card-scoped — one value for the whole deployment. Per §10.1 it was nominally described as "of a session" but no session-level mechanism existed to bind it.
- **Root-cause fix:** (a) added §12.6 **Session Bootstrap (Normative)** — `POST /sessions` returning `{ session_id, session_bearer, granted_activeMode, expires_at, runner_version }` conforming to the new `schemas/session-bootstrap-response.schema.json`. Bootstrap-bearer authenticated, 30 rpm rate limit. `granted_activeMode` is tightened-only from the Agent Card's declared maximum — requesting a looser mode returns 403 `ConfigPrecedenceViolation`. (b) added `activeMode` as a required field in the §12.1 session file schema. (c) clarified §10.3 step 1 to read `capability = session.activeMode` (preserving the Agent Card as the per-deployment upper bound).
- **Versioning note:** strictly additive from an external observability perspective but `session.activeMode` becoming a persisted field is a §12.1 schema change. Pre-1.0 impls that created sessions without the field MUST migrate on first resume (default to the Agent Card's activeMode, preserving existing behavior).
- **New test IDs:** SV-SESS-BOOT-01 (schema conformance + clamping rule), SV-SESS-BOOT-02 (403 on looser-than-card request). Fold into the M1 Week 6 test-pass target.
- **Commit landing this edit:** the same patch that added this L-11 entry.

### L-12 — Pinned conformance Tool Registry fixture `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 1 — validator asked for "the tools fixture path". None existed on the spec side; impl had its own demo fixture (4 tools) but that isn't spec-authoritative and both sides would diverge on what "the Tool Registry" means for conformance.
- **What:** `SV-PERM-01` asserts behavior across every `(activeMode, risk_class, default_control)` combination. Without a pinned fixture both sides reference, the assertion's inputs drift per impl; cross-impl comparability evaporates.
- **Root-cause fix:** added `test-vectors/tool-registry/tools.json` — 8 hand-authored tools spanning the full §10.2 × §10.3 matrix (each risk_class, each default_control, including the tighten-only edge case where `default_control = Deny` overrides even `DangerFullAccess`). The 24 expected decisions (8 tools × 3 activeModes) are documented in the accompanying README.md. Impls load this fixture for conformance runs via an impl-defined mechanism (e.g., `RUNNER_TOOLS_FIXTURE=<path>`). The fixture is pinned by digest in `MANIFEST.json.supplementary_artifacts`.
- **Commit landing this edit:** the same patch that added this L-12 entry.

### L-13 — Must-map catalog integration for new test IDs `[open, docs, follow-up commit target: this week]`

- **Surfaced:** 2026-04-20 · during L-09 / L-10 / L-11 normative edits
- **What:** §10.3.1, §10.5.2, and §12.6 reference test IDs `SV-PERM-01` (updated), `SV-AUDIT-TAIL-01` (new), `SV-SESS-BOOT-01` (new), `SV-SESS-BOOT-02` (new). SV-PERM-01 is already in `soa-validate-must-map.json` with updated assertion text (landed in the L-09 commit). The three new IDs are not yet in the catalog — spec sections reference them but the 213-test map has no entries.
- **Why it matters:** `soa-validate` loads the must-map as the authoritative test catalog. Sections that reference IDs absent from the catalog produce dangling references; the catalog's invariant check ("No test in tests is orphaned") requires coordinated updates across three nested structures (`tests`, `must_coverage`, `execution_order.phases`).
- **Destination:** single follow-up commit to `soa-validate-must-map.json` adding entries to all three structures. Catalog total moves 213 → 216 (three new test IDs).
- **Not blocking:** validator can run the new tests without the catalog entries (vector-path via schema validation of responses; live-path via direct endpoint calls). Catalog integration is needed before v1.0 release gate passes the invariant check.

### L-16 — Tampered Agent Card fixture for HR-12 `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator review Week 3 day 2. `HR-12` per must-map requires "Tampered Card bytes → CardInvalid; Runner fails closed". No tampered-card fixture existed — both impl and validator had to author their own, producing no cross-impl comparability.
- **Root-cause fix:** added `test-vectors/tampered-card/agent-card.json.tampered.jws` (same protected header as the valid fixture; all-zeros signature) + fixture README documenting the impl and validator contracts. Conformance impl consumes via `RUNNER_CARD_JWS=<path>`, asserts boot-time rejection (`CardSignatureFailed`, reason `signature-invalid`) + `/ready` flips 503 with reason `card-signature-invalid`.

### L-17 — Mismatched publisher_kid fixture for SV-BOOT-01 `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator review Week 3 day 2. `SV-BOOT-01` per must-map requires "SDK-pinned channel refuses to load an Agent Card whose `security.trustAnchors[].publisher_kid` does not match the SDK-pinned value". Testing the **negative path** required a fixture whose `publisher_kid` deliberately mismatched. Only happy-path testing existed (via `/ready`=200 assertion).
- **Root-cause fix:** added `test-vectors/initial-trust/mismatched-publisher-kid.json` with `publisher_kid: soa-attacker-masquerade-v1.0` + `channel: sdk-pinned`. Conformance impl pointed at this file alongside a standard valid card MUST refuse to boot with `HostHardeningInsufficient` (reason `bootstrap-missing`). Impl-binary-coupled test (validator invokes impl process, reads exit code + stderr); documented in the fixture's README.

### L-18 — Conformance Agent Card fixture with DangerFullAccess `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 2 — validator reported the card fixture in use declares `activeMode: ReadOnly`. §12.6 session bootstrap tightens-only from the card's declared maximum, so validator could only exercise `ReadOnly`, not the full `SV-PERM-01` sweep across all three capability levels.
- **Root-cause fix:** added `test-vectors/conformance-card/agent-card.json` — a pinned Agent Card TEMPLATE declaring `activeMode: DangerFullAccess`. Impl consumes via `RUNNER_CARD_FIXTURE=<path>`; substitutes only the `security.trustAnchors[0].spki_sha256` placeholder with the Runner's actual key's SPKI at load; signs with runtime key; serves at the spec-defined endpoints. Validator now creates three sessions (ReadOnly, WorkspaceWrite, DangerFullAccess) via §12.6 against this card and exercises the 24-cell Tool Registry × activeMode matrix end-to-end. Fixture deliberately disables optional feature surfaces (self_improvement, memory, policyEndpoint) to keep the matrix deterministic.

### L-08 — Demo-mode ephemeral self-signed `x5c` leaf `[scratched]`

- **Surfaced:** 2026-04-20 · impl's demo bin generates Ed25519 + self-signed cert when `RUNNER_SIGNING_KEY` + `RUNNER_X5C` are absent
- **Initial read:** Possibly worth a §6.1.1 normative guard ("MUST emit loud warning", "MUST NOT accept self-signed leaf as trust anchor").
- **Re-examined:** Already covered by existing rules. §6.1.1 + §5.3 require the `x5c` chain to terminate at a `security.trustAnchors` SPKI; a self-signed leaf passes ONLY if the operator has explicitly installed that leaf's SPKI as an anchor. So the demo is conformant iff its `initial-trust.json` anchors the self-signed leaf, and non-conformant otherwise. No new normative text needed — the existing chain-to-anchor rule already makes the demo-mode safety property enforceable.
- **Resolution:** not a spec gap. The "loud warning" aspect is an adopter-UX recommendation → folds into L-06 / L-07's deployment-patterns doc if anywhere.

## Authoring notes

- **When to add an entry:** any time a sibling-session STATUS.md flags a gap, any time a paste-handoff block encodes a rule that isn't in the spec, any time I ( Claude / spec-session ) find myself explaining a contract the spec should already state.
- **When to close an entry:** when the destination file is updated and the commit SHA is recorded under the lesson. Never close silently.
- **When to scratch an entry:** when re-examination shows the rule is already adequately captured. Record *why* — a future reader will otherwise wonder if it was lost.
- **Ordering:** append-only, numbered `L-NN`. Do not renumber when scratching.
