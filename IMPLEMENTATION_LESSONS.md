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

### L-13 — Must-map catalog integration for new test IDs `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · during L-09/L-10/L-11/L-15 normative edits
- **What:** §10.3.1, §10.5.2, §10.5.3, §12.6 reference test IDs `SV-AUDIT-TAIL-01`, `SV-AUDIT-RECORDS-01`, `SV-AUDIT-RECORDS-02`, `SV-SESS-BOOT-01`, `SV-SESS-BOOT-02`. All five landed in the catalog this commit.
- **Resolution:** added five new `tests` entries, two new `tests_by_category` groups (`SV-AUDIT`, `SV-SESS-BOOT`), two new `test_categories` descriptions, all five tests pushed into `execution_order.phases[3]` (Runtime Core). Catalog total: 213 → 218. No must_coverage anchor mapping added yet — the anchors for the new §10.5.2/§10.5.3/§12.6 sections are normative but the must_coverage dict only maps pre-existing anchors. Anchor coverage is non-blocking follow-up.

### L-14 — HR-02 M1 deferral to M3 `[docs + must-map metadata, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator review Week 3 day 2. Must-map HR-02 assertion is "Projection over budget → StopReason::BudgetExhausted before API call" — this exercises §13 Token Budget. §13 is M3 scope per the roadmap; M1 cannot test HR-02 because the projector doesn't exist until M3.
- **Resolution:** added informative fields to HR-02's test entry: `implementation_milestone: "M3"` and `milestone_reason` documenting the §13 dependency. Validators that filter by milestone can skip HR-02 during M1 runs; the must-map invariant check still passes (HR-02 is still in `tests` and `execution_order.phases[3]`).
- **Plan impact:** HR-02 removed from M1 test set in both impl and validator plans. M1 exit gate now 7 tests: HR-01, HR-12, HR-14, SV-CARD-01, SV-SIGN-01, SV-BOOT-01, SV-PERM-01.

### L-15 — Audit records observability endpoint `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator review Week 3 day 2. `HR-14` per must-map requires "any `prev_hash` tamper fails chain verification". `/audit/tail` (L-10) returns only the terminal hash — the validator couldn't reconstruct the chain to test tamper detection. Chain-integrity verification requires access to the records themselves.
- **Root-cause fix:** added §10.5.3 **Audit Records Observability (Normative)** — `GET /audit/records?after=<id>&limit=<n>` returning paginated records in chain order. Response schema: `schemas/audit-records-response.schema.json`. Bearer-scoped `audit:read`, 60 rpm rate limit (lower than /audit/tail since payloads are larger). Explicit not-a-side-effect property. Tamper test is validator-side: validator reads chain, mutates a `prev_hash` in its local copy, re-verifies, asserts failure — Runner never serves a tampered chain, so no "tamper" endpoint is needed.
- **New test IDs:** SV-AUDIT-RECORDS-01 (schema + pagination), SV-AUDIT-RECORDS-02 (chain integrity). HR-14 now references this endpoint for its tamper test.
- **Commit landing this edit:** same patch that added this entry.

### L-16 — Tampered Agent Card fixture for HR-12 `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator review Week 3 day 2. `HR-12` per must-map requires "Tampered Card bytes → CardInvalid; Runner fails closed". No tampered-card fixture existed — both impl and validator had to author their own, producing no cross-impl comparability.
- **Root-cause fix:** added `test-vectors/tampered-card/agent-card.json.tampered.jws` (same protected header as the valid fixture; all-zeros signature) + fixture README documenting the impl and validator contracts. Conformance impl consumes via `RUNNER_CARD_JWS=<path>`, asserts boot-time rejection (`CardSignatureFailed`, reason `signature-invalid`) + `/ready` flips 503 with reason `card-signature-invalid`.

### L-17 — Mismatched publisher_kid fixture for SV-BOOT-01 `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator review Week 3 day 2. `SV-BOOT-01` per must-map requires "SDK-pinned channel refuses to load an Agent Card whose `security.trustAnchors[].publisher_kid` does not match the SDK-pinned value". Testing the **negative path** required a fixture whose `publisher_kid` deliberately mismatched. Only happy-path testing existed (via `/ready`=200 assertion).
- **Root-cause fix:** added `test-vectors/initial-trust/mismatched-publisher-kid.json` with `publisher_kid: soa-attacker-masquerade-v1.0` + `channel: sdk-pinned`. Conformance impl pointed at this file alongside a standard valid card MUST refuse to boot with `HostHardeningInsufficient` (reason `bootstrap-missing`). Impl-binary-coupled test (validator invokes impl process, reads exit code + stderr); documented in the fixture's README.

### L-18 — Conformance Agent Card fixture with DangerFullAccess `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 2 — validator reported the card fixture in use declares `activeMode: ReadOnly`. §12.6 session bootstrap tightens-only from the card's declared maximum, so validator could only exercise `ReadOnly`, not the full `SV-PERM-01` sweep across all three capability levels.
- **Root-cause fix:** added `test-vectors/conformance-card/agent-card.json` — a pinned Agent Card TEMPLATE declaring `activeMode: DangerFullAccess`. Impl consumes via `RUNNER_CARD_FIXTURE=<path>`; substitutes only the `security.trustAnchors[0].spki_sha256` placeholder with the Runner's actual key's SPKI at load; signs with runtime key; serves at the spec-defined endpoints. Validator now creates three sessions (ReadOnly, WorkspaceWrite, DangerFullAccess) via §12.6 against this card and exercises the 24-cell Tool Registry × activeMode matrix end-to-end. Fixture deliberately disables optional feature surfaces (self_improvement, memory, policyEndpoint) to keep the matrix deterministic.

### L-19 — Permission decision recording endpoint `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · second plan-evaluator pass on the impl plan (finding F-03/F-04/F-07). §10.3.1 `/permissions/resolve` is explicitly not-a-side-effect, meaning queries never produce audit records. In M1 scope the impl has no agent loop, no MCP-driven tool invocations, and therefore no other mechanism that drives permission decisions. Audit chain would stay at GENESIS forever — `SV-AUDIT-RECORDS-01/02` and `HR-14` (chain integrity + tamper detection) could not be exercised.
- **Root-cause fix:** new subsection §10.3.2 **Permission Decision Recording (Normative)** — `POST /permissions/decisions` takes `{tool, session_id, args_digest, pda?}`, drives §10.3 steps 1–5 (resolver + dispatch), writes the audit record per §10.5, and returns `{decision, audit_record_id, audit_this_hash, handler_accepted, ...}`. Distinct scope class (`permissions:decide:<session_id>`) from the resolve endpoint; session bootstrap MUST explicitly opt-in via `request_decide_scope: true`. Forgery-resistant: endpoint computes decision internally from §10.3 steps, ignores any client-supplied override; PDA mismatches with resolver output return 403 `pda-decision-mismatch`.
- **Why not a test hook:** operators legitimately need this endpoint for decision replay + incident investigation ("run this decision again and show me the full trace + audit record"). Making it a first-class public API with a privileged scope fits the same pattern as L-09 (resolve) and L-15 (records).
- **New schemas:** `schemas/permission-decision-request.schema.json`, `schemas/permission-decision-response.schema.json`.
- **New test IDs in must-map:** `SV-PERM-20` (endpoint + scope + audit write), `SV-PERM-21` (PDA verify happy path), `SV-PERM-22` (PDA verify negative paths incl. decision-mismatch). Catalog total now 221.

### L-20 — Standalone session schema sync `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · plan-evaluator finding F-10. §12.1 was updated in commit `e7580b9` to add required `activeMode` field to the session schema, but the standalone `schemas/session.schema.json` file was NOT updated at that time — schema drifted from the inline spec body.
- **Root-cause fix:** `schemas/session.schema.json` now mirrors §12.1 verbatim — `activeMode` added to `required` list, enum property defined, description copied from spec body. Future spec edits touching §12.1 should touch both the inline schema in the Markdown AND the standalone JSON file in the same commit.
- **Plan note:** added to plan-refresh triggers — schema-folder drift is a detectable condition; CI should verify inline-schema ↔ standalone-schema identity.

### L-21 — Conformance card fixture ↔ agent-card schema drift `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 3 · validator ran ajv against the L-18 conformance card fixture after impl's `RUNNER_CARD_FIXTURE` loader went live — three schema-validation errors surfaced:
  1. `self_improvement.max_iterations = 0` violated `minimum: 1`
  2. `permissions.policyEndpoint: null` violated `type: string` (field is optional, not nullable)
  3. `security.trustAnchors[0].spki_sha256` placeholder literal `__IMPL_REPLACES_SPKI_AT_LOAD__…` violated `pattern: "^[A-Fa-f0-9]{64}$"`
- **Why it matters:** validator's SV-CARD-01 vector-path assertion schema-validates every Agent Card fixture. The conformance card failed that assertion for honest reasons — the fixture was non-conformant against its own spec. Impls loading this fixture would produce non-conformant serve-time behavior; validators fetching would reject.
- **Root-cause fix:**
  1. `max_iterations: 0 → 1` (harmless: `self_improvement.enabled = false` disables the feature regardless of this value; picking `1` satisfies the schema's minimum).
  2. Removed `policyEndpoint: null`; the field is optional per schema, so absent is valid.
  3. Replaced the ASCII placeholder with a pinned valid hex placeholder: `16dc826f86941f2b6876f4f0f59d91f0021dacbd4ff17b76bbc9d39685250606` (SHA-256 of `"SOA-HARNESS-CONFORMANCE-TEST-FIXTURE-PLACEHOLDER-v1.0"`, deterministic, clearly synthetic). Impl still substitutes this with its runtime key's SPKI at load; MUST NOT serve the raw fixture with placeholder intact — that would advertise a trust anchor no legitimate key matches.
- **Regression protection:** ajv-verified after fix — both the conformance card AND the default `test-vectors/agent-card.json` schema-validate cleanly. README updated with the new placeholder value.
- **Process lesson:** fixtures SHOULD be ajv-validated against their spec schemas in CI before landing. The spec repo's `build-manifest.mjs` doesn't currently validate content, only digests. Adding a `validate-fixtures.mjs` CI step is a follow-up (L-22 candidate).

### L-22 — §10.3.2 403 reason enum + SV-PERM-20 assertion text `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 3 · validator exercised POST /permissions/decisions negative paths and found SV-PERM-20's must-map assertion required `reason="ConfigPrecedenceViolation"` for missing `permissions:decide` scope. That's wrong — `ConfigPrecedenceViolation` is §10.3 step 3's error (toolRequirements loosens default), not an auth-scope failure. Impl correctly returned `reason="missing-scope"` instead; the divergence was a spec typo I introduced in L-19.
- **Root-cause fix:**
  1. §10.3.2 403 Forbidden response list now enumerates a **closed set of reason codes**: `insufficient-scope` (preferred over `missing-scope` for OAuth-adjacent consistency; kebab-case to match spec convention) | `session-bearer-mismatch` | `pda-decision-mismatch` | `pda-malformed`. Explicit MUST statement that `ConfigPrecedenceViolation` MUST NOT be used here.
  2. SV-PERM-20 assertion text updated to reference the corrected enum.
- **Impl impact:** impl currently returns `error: "missing-scope"`. Trivial one-line change to `error: "insufficient-scope"`. Alternatively, impl could emit both (`error: "insufficient-scope", legacy_alias: "missing-scope"`) during a transition, but since nothing else is pinned to the old name, straight rename is fine.
- **Why the spec term wins:** the impl picked a reasonable name ("missing-scope") on its own, but the spec is authoritative for closed enumerations. Validators filter on the spec-declared reason strings; impls that don't match fail conformance. Spec typos like this are exactly what the independent-judge architecture catches — validator ran its assertion, impl diverged, error surfaced in <24h.

### L-23 — §10.3.2 `pda-verify-unavailable` 503 branch `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 3 · validator exercised SV-PERM-22 against a Runner deployment NOT started with `resolvePdaVerifyKey`. Impl returned `400 pda-verify-not-configured`. Problems:
  1. `400` is a client-error class; this scenario is a server-state / deployment-misconfig issue, not a malformed request.
  2. The reason code isn't in the L-22 closed enum (`insufficient-scope | session-bearer-mismatch | pda-decision-mismatch | pda-malformed`).
- **Root-cause fix:** added a normative 503 branch to §10.3.2: `503 pda-verify-unavailable` when the endpoint needs to verify a PDA but no verification config is loaded. Operators correct the deployment (configure `resolvePdaVerifyKey` or load `security.trustAnchors`); conformance Runners MUST boot with verification configured. Returning `400` for this case is explicitly non-conformant.
- **Impl rename:** `400 pda-verify-not-configured` → `503 pda-verify-unavailable`. Simple code-path swap plus a reason-string rename.
- **L-24 candidate (not yet logged):** SV-PERM-21 happy path still SKIP because there's no signing fixture — need a pinned test handler keypair + a pre-signed PDA fixture that impl can verify. Separate spec commit scope.

### L-24 — Conformance test handler keypair + pre-signed PDA fixture `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Week 3 day 3 · `SV-PERM-21` (PDA verify happy path) was stuck at SKIP because no pinned handler keypair existed. Validators had two bad options: (a) generate an ephemeral keypair per test run and hope the impl's trust anchors dynamically include it (impractical), (b) leave SV-PERM-21 permanently skipped (dishonest for M1 conformance). Both wrong.
- **Root-cause fix:**
  - `test-vectors/handler-keypair/` — pinned Ed25519 keypair (both halves published: private key is a test fixture, not a credential). Deterministically derived from a 32-byte seed so any regen yields byte-identical fixture. SPKI: `749f3fd468e5a7e7e6604b71c812b66b45793228b557a44e25388ed07a8591e3`. Files: `private.pem`, `public.pem`, `public.jwk.json`, `spki_sha256.txt`, `README.md`.
  - `test-vectors/permission-prompt-signed/` — pre-signed compact JWS. `canonical-decision.json` declares a Prompt-approval for `fs__write_file` under `WorkspaceWrite`/`Prompt` (matches resolver output for that tool from the pinned Tool Registry). `pda.jws` is the compact JWS over JCS(canonical-decision.json) signed by the pinned handler private key. Header: `{"alg":"EdDSA","kid":"soa-conformance-test-handler-v1.0","typ":"soa-pda+jws"}`. Round-trip-verified at commit time.
  - `test-vectors/conformance-card/agent-card.json` — `security.trustAnchors` extended to a SECOND entry pinning the handler-keypair SPKI. `trustAnchors[0]` remains the impl-substituted placeholder (card signing); `trustAnchors[1]` is the static handler-key anchor (PDA verify). Impl's PDA verification path iterates trustAnchors looking for a matching `kid`; no code change required on impl beyond adding trustAnchors[1] to the loaded anchor store.
- **Impl adoption:** minimal. When `RUNNER_CARD_FIXTURE` is set, impl now loads TWO trust anchors instead of one; the second (handler) anchor is used for PDA verify. If impl's current trust-anchor loader already iterates the trustAnchors array (it should, per §6.1.1), this is zero-code-change from impl side.
- **Validator adoption:** small. Read `test-vectors/handler-keypair/private.pem` at test startup; use either the pre-signed `pda.jws` (simplest) or sign its own `canonical-decision.json` bodies with the pinned private key. SV-PERM-21 flips SKIP → PASS on next live run.
- **Security note:** the committed private key is PUBLIC. Any Runner serving real traffic with this fixture's trust anchor configured accepts signatures from anyone with a git clone of this repo. Production deployments MUST NOT load this fixture.

### L-26 — §10.3.2 pda-malformed moves 403 → 400 `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-20 · Post-M1-close · activating the L-24 PDA verify path (via impl e59f708) exposed that a wire-malformed JWS hits impl's 400 pda-malformed branch before the L-22 403 auth checks run. Impl was semantically correct; spec was wrong.
- **Root-cause diagnosis:** L-22's 403 enum included `pda-malformed` alongside real auth-scope failures (`insufficient-scope`, `session-bearer-mismatch`, `pda-decision-mismatch`). Wrong categorization — a malformed JWS means the client sent invalid wire bytes; no authorization check has a parseable subject to evaluate. Semantically 400 (bad request), not 403 (forbidden).
- **Fix:**
  - §10.3.2 400 Bad Request block now enumerates `{malformed-json, missing-required-field, unknown-tool, pda-malformed}`
  - §10.3.2 403 Forbidden block removes `pda-malformed`; retains `{insufficient-scope, session-bearer-mismatch, pda-decision-mismatch}`
  - Forward-pointer left in the 403 block so readers of the old location find the new home
- **Must-map update:** SV-PERM-20 assertion text now enumerates both sets and the split rationale. Validators filter each negative case against the correct status code.
- **Impl impact:** zero code change. Impl was already returning 400 for wire-malformed JWS; spec catches up. SV-PERM-22 regression that surfaced this reverts to PASS after validator adjusts expectation.
- **Why this is a normative fix (not a spec-convention preference):** status-code choice affects error-handling code in callers. A caller retrying on 4xx-vs-5xx or logging auth-failures differently from malformed-body failures needs the spec to match real semantics. Conflating 400 and 403 in spec wording would silently break caller instrumentation.

### L-27 — M2 kickoff: session state observability + audit-sink failure hook + non-idempotent tool fixture `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · M2 pre-kickoff plan-evaluator pass. Applying the M1 lesson: identify structural gaps BEFORE starting code, not after siblings hit them mid-sprint.
- **Gap diagnosis:** M2's test set (HR-04, HR-05, SV-SESS-01..05, SV-PERM-19) all depend on observing session-state transitions (pending→committed, replay, idempotency-key continuity) OR simulating audit-sink failure states. Without dedicated surfaces these tests would repeat the M1 "spec defines verb, no observable window" pattern that produced L-09/L-10/L-15/L-19.
- **Three additions landed this commit:**
  1. **§12.5.1 Session State Observability (Normative)** — `GET /sessions/<session_id>/state` endpoint. Returns the full persisted session-file state as it would appear if `resume_session` ran right now. Bearer-scoped `sessions:read:<session_id>`, 120 rpm, not-a-side-effect (no state advance, no audit write, no StreamEvent). Response schema: `schemas/session-state-response.schema.json`. Unblocks HR-04, HR-05, SV-SESS-03, SV-SESS-04 end-to-end.
  2. **§12.5.2 Audit Sink Failure Simulation Hook (Normative — Testability)** — `SOA_RUNNER_AUDIT_SINK_FAILURE_MODE=<healthy|degraded-buffering|unreachable-halt>` env var. Conformance Runners accept this knob to drive the §10.5.1 three-state machine deterministically. Same production-guard pattern as L-01's clock injection: MUST NOT be reachable by untrusted principals, MUST refuse to start on non-loopback interface with the env set. Unblocks SV-PERM-19.
  3. **`test-vectors/tool-registry-m2/`** — M2 Tool Registry fixture adding two entries: `compliant_ephemeral_tool` (Destructive/Prompt, positive-path accepted at load) and `non_compliant_ephemeral_tool` (Mutating/AutoAllow, negative-path REJECTED at load with `ToolPoolStale`). Unblocks SV-SESS-05.
- **Must-map catalog:** 8 M2 test IDs tagged with `implementation_milestone: "M2"`. New SV-SESS-STATE-01 added for the state endpoint schema + not-a-side-effect assertions. Catalog total 221 → 222.
- **Why ship upfront:** M1 taught us that speccing "define the verb but not the window" produces mid-sprint churn. M2 has the same structural risk with session state + audit-sink observations. Landing the surfaces now means both siblings can plan against a stable spec from day 1 rather than discovering gaps at day 5.

### L-28 — M2 plan-evaluator resolution: 16 findings fixed at root `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · plan-evaluator subagent run against spec commit `6566707` + both sibling M2 plans. Subagent produced 16 findings (4 critical, 8 moderate, 4 minor) + 9 structural challenges. User directive: resolve all at the spec first, then plans.
- **Root-cause fixes in this commit:**
  1. **F-01 (byte-identity contradiction):** §12.5.1 not-a-side-effect contract now specifies byte-identity EXCLUDING `generated_at` — which is required per-request wall-clock timestamp. Validator predicate: `strip(body, "generated_at") == strip(body_prior, "generated_at")`. Plans will update to reference the exclusion predicate.
  2. **F-02 (optional fields asserted as present):** `schemas/session-state-response.schema.json` now REQUIRES `first_attempted_at` + `last_phase_transition_at` + `args_digest` in `side_effects.items.required`. Validator V2-06/V2-07 assertions now have schema-backed fields.
  3. **F-03 (`inherits_from` undefined):** removed from `test-vectors/tool-registry-m2/tools.json`. README updated to say impls MAY concatenate with M1 fixture at load; no magical inheritance field.
  4. **F-04 (filtered sub-fixtures missing):** shipped `test-vectors/tool-registry-m2/tools-compliant-only.json` + `tools-non-compliant-only.json` — single-tool fixtures for the SV-SESS-05 positive/negative subprocess harnesses.
  5. **F-05 (M2-T5 WORM sink has no must-map coverage):** SV-PERM-16/17 formally deferred to M3 with rationale about external infrastructure dependencies. Plans will drop M2-T5 from M2 scope.
  6. **F-06 + F-07 (SV-SESS-06..11 in silent limbo):** all six tagged as `implementation_milestone: "M2"` with validator-plan cross-reference. M2 now has 15 M2-tagged tests (was 9).
  7. **F-10 (§12.5.2 hook ambiguous on buffer behavior):** clarified — env var drives CONCRETE side effects (buffer writes to `/audit/pending/`, actual Mutating refusal). Does NOT elide Runner-internal persistence.
  8. **F-11 (SV-SESS-04 dedupe half):** plan bullet will be updated to assert dedupe via audit-chain single-record-for-one-decision observation (achievable at M2 without tool-side counter).
  9. **F-12 (crash-marker protocol unspecified):** new §12.5.3 Testability Note pins 7 named markers (`SOA_MARK_PENDING_WRITE_DONE`, `SOA_MARK_TOOL_INVOKE_START`, `SOA_MARK_TOOL_INVOKE_DONE`, `SOA_MARK_COMMITTED_WRITE_DONE`, `SOA_MARK_DIR_FSYNC_DONE`, `SOA_MARK_AUDIT_APPEND_DONE`, `SOA_MARK_AUDIT_BUFFER_WRITE_DONE`) with cross-platform identity guarantee. `RUNNER_CRASH_TEST_MARKERS=1` + `RUNNER_SESSION_DIR` env vars documented with production-guard rules.
  10. **F-13 (state-transition semantics under restart):** §12.5.2 clarified — a fresh boot with the env var set MUST emit exactly one matching `AuditSink*` event at boot, treating the fresh process as transitioning from implicit `healthy`. Makes env-var-restart testing deterministic.
  11. **F-14 (StreamEvent transport undefined for M2):** new §12.5.4 Audit-Sink Event Channel + `schemas/audit-sink-events-response.schema.json` + new test ID SV-AUDIT-SINK-EVENTS-01. `GET /audit/sink-events` as minimum-viable M2 observability channel. Retained in M3 as polling-friendly alternate to §14 StreamEvent transport.
  12. **F-15 (§12.6 scope-granting for `sessions:read`):** §12.6 response description now explicitly lists default-granted scope set including `sessions:read:<session_id>`. Plans can assume bootstrap grants it.
- **Catalog totals:** 222 → 223 tests. Six new M2 tags (SV-SESS-06..11), two M3 deferrals (SV-PERM-16/17), one new test ID (SV-AUDIT-SINK-EVENTS-01).
- **Validator plan impact:** four findings require plan-file updates (F-08 off-by-one, F-09 unit-test-count labeling, F-11 dedupe assertion wording, F-16 literal placeholder). Also structural reordering per subagent's Structural Challenges 1-9. Plans rewrite to rev 2 in follow-up commits.
- **Why ship as one commit:** the 12 spec fixes form a coherent "M2 kickoff rev 2" — individually small, collectively the full set of adjustments surfaced by the evaluator. Bundling reduces pin-bump churn on siblings.

### L-29 — Resume algorithm trigger points normative `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · M2 Week 2 close · validator Finding C: impl's `resumeSession()` has zero callers. No boot scan, no lazy-hydrate. The function is correct but unreachable — blocks HR-04, HR-05, SV-SESS-02/04/08/09/10.
- **Root-cause diagnosis:** §12.5 defined the algorithm but did NOT specify when the Runner MUST invoke it. Impl implemented the function and stopped. Spec let impl stop because no trigger was stated.
- **Root-cause fix:** §12.5 now adds a **Trigger points** block listing two MUST triggers:
  1. Runner startup scan — enumerate `/sessions/` directory, invoke `resume_session` for every session with in-progress `workflow.status` before opening any public listener.
  2. Client reconnect / lazy hydrate — when a session-scoped bearer hits `/stream/v1/<sid>` or `/sessions/<sid>/state` for an on-disk-but-not-in-memory session, invoke `resume_session` before serving.
- **Impl impact:** wire `resume_session` into the boot orchestrator AFTER trust bootstrap but BEFORE opening listeners. Small surface (~20 lines) — the function already exists. Also wire the lazy-hydrate path in the /state endpoint handler.
- **Audit of similar "defined function, no trigger" patterns in the spec:** checked at close-of-commit. No other L-29-style cases found; §10.5.2 /audit/tail, §10.5.3 /audit/records, §12.5.1 /state all have explicit endpoint-invocation as their triggers.

### L-30 — v1.1 conformance-card fixture for SV-SESS-09 drift test `[normative fixture, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · M2 Week 2 close · validator Finding D: impl's L-21 MANIFEST digest check prevents validator from mutating the served Agent Card to trigger `card_version` drift. The digest check is correct (L-21 exists to refuse tampered fixtures) but blocks SV-SESS-09's legitimate test requirement.
- **Root-cause fix:** ship a SECOND pinned conformance card fixture with `"version": "1.1.0"` (vs original's `"1.0.0"`). All other fields byte-identical. Both fixtures pinned in MANIFEST.supplementary_artifacts with distinct digests. Validator swaps `RUNNER_CARD_FIXTURE` env var between the two paths via subprocess restart — each file passes its own digest check individually. Legitimate reconfiguration, not tampering.
- **Why not a digest-bypass env flag:** would require adding another production-guard test hook and would weaken the L-21 anti-tampering property. Ship fixtures is cleaner — both conformance variants are first-class pinned artifacts.
- **Test ID SV-SESS-09** per must-map assertion ("card-drift terminates") is now conformance-testable with zero impl code changes beyond what L-29 (resume triggers) already requires. Validator flips SKIP → PASS when both L-29 and the fixture swap land together.

### L-31 — §12.2 significant-events closed set + markers for permission decisions `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · M2 Day 1 close · validator Finding H: 5 of 7 crash-test markers are defined in impl but never actually fire at runtime. Root cause validator diagnosed precisely: call sites gate on `markerPhase.side_effect` which no production caller passes. The underlying issue is that §12.2 didn't explicitly list `POST /permissions/decisions` as a "significant event" — impl correctly implemented bracket-persist + markers for tool invocations, but tool invocations are M3 scope, so the markers sit dormant.
- **Root-cause fix:** §12.2 now carries a **Significant events (normative closed set)** block enumerating four event classes: tool invocations, `POST /permissions/decisions` calls, handoff events (§17, M5), self-improvement iterations (§9.7, M5). Second block explicitly maps each §12.5.3 marker to where it fires during a `/permissions/decisions` call:
  - `SOA_MARK_PENDING_WRITE_DONE` — after fsync of `phase=pending` side_effect write, before §10.3 dispatch
  - `SOA_MARK_TOOL_INVOKE_START` — at §10.3 step 5 dispatch boundary (fires even without actual tool execution)
  - `SOA_MARK_TOOL_INVOKE_DONE` — after handler returns (decision computed)
  - `SOA_MARK_COMMITTED_WRITE_DONE` — after fsync of `phase=committed` side_effect
  - `SOA_MARK_DIR_FSYNC_DONE` — after directory-level fsync atomic commit
- **Also added:** idempotency for permission decisions — re-submitting the same `(session_id, idempotency_key)` to `/permissions/decisions` MUST return the original decision + audit_record_id without appending a second audit row. Makes HR-04/HR-05 replay-on-resume semantics well-defined for decisions, not just tool invocations.
- **Impl impact:** small — wire `markerPhase.side_effect` through `POST /permissions/decisions` handler. Populate a `side_effect` entry at pending phase before dispatch, transition to committed phase after decision recorded. Markers fire at the appropriate boundaries. `workflow.side_effects[]` in `/state` response populates naturally from this path.
- **Validator impact:** zero code change. V2-04 crash-harness already consumes the §12.5.3 markers correctly; with impl wiring the emission path, the 5 marker-gated handlers (HR-04, HR-05, SV-SESS-03, SV-SESS-07, SV-SESS-08, SV-SESS-10) flip SKIP → PASS.

### L-32 — §10.3.2 response body + idempotency_key surface `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · M2 post-L-31 validator run · Finding J: impl shipped `idempotency_key` in the POST /permissions/decisions response body to surface the §12.2 idempotency replay behavior. Spec's `schemas/permission-decision-response.schema.json` has `additionalProperties: false` and didn't list the field. Schema validation fails for SV-PERM-20 + SV-PERM-21.
- **Root cause:** L-31 introduced the idempotency rule for permission decisions ("re-submitting same `(session_id, idempotency_key)` returns original decision + audit_record_id") but didn't surface the mechanism in the response schema. Impl's addition is semantically correct — caller needs to KNOW the idempotency_key assigned to the decision to replay it — but shipped ahead of a matching schema update.
- **Root-cause fix:**
  - `schemas/permission-decision-response.schema.json` now lists `idempotency_key` (optional string, UUIDv4) and `replayed` (optional boolean) as defined properties.
  - §10.3.2 response-body spec documents the fields and the replay contract (caller presents `Idempotency-Key` header matching prior decision; Runner returns cached body with `replayed: true`, same audit_record_id, no chain advance).
- **Impl impact:** zero. Impl's current emission is schema-valid after the update. SV-PERM-20 + SV-PERM-21 flip fail → pass on validator's next run against a pin-bumped impl.
- **Pattern observation:** impl shipping a semantically-correct addition ahead of a matching schema update is the same pattern as L-26 (400 vs 403 error-code disagreement). Both times impl was right; spec caught up. This is the three-repo architecture's legitimate friction — impl iterates faster than the pinned spec, validator catches the drift, spec ratifies. The friction itself is a feature.

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
