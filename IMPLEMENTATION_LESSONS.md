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

### L-33 rev 2 — M3 kickoff post-evaluator resolution `[normative, in-spec @ <this-commit>]`

Plan-evaluator subagent (run against the original L-33 kickoff at commit `00c23c9`) flagged 15 findings + 10 structural challenges. All 25 resolved in this rev 2 commit.

**Spec additions this rev:**
- **§14.5 Minimum StreamEvent Observability Channel (NEW).** `GET /events/recent?session_id=<sid>&after=<event_id>&limit=<n>` — polling-friendly observability for the full §14.1 25-type StreamEvent enum. Schema: `schemas/events-recent-response.schema.json`. Coexists with §14.3 SSE transport (M4); subsumes §12.5.4 `/audit/sink-events` for conformance. Resolves F-01 (kickoff prose falsely claimed §12.5.4 covered SV-STR; §14.5 is the real answer).

**Must-map retags (net: M3 drops 155 → 145; M4 gains 4; M5 gains 12):**

| Test(s) | From | To | Reason |
|---|---|---|---|
| HR-08, HR-18, SV-AGENTS-06, SV-GOOD-01..07 | M3 | **M5** | Depend on §9 Self-Improvement runtime (M5-deferred). Evaluator F-03/F-04. |
| HR-16 | M3 | **M5** | Depends on §9.7 seccomp runtime. F-05. |
| HR-15 | M3 | **M5** | Depends on §17 A2A Handoff (M5-deferred). F-02. |
| SV-STR-12, SV-STR-13, SV-STR-14 | M3 | **M4** | Require §14.3 full SSE transport with Last-Event-ID / terminal-SSE semantics. §14.5 polling channel is not sufficient. F-01. |
| SV-SESS-12 | UNTAGGED | **M4** | Tests §12.2 ↔ UI §11.4.1 relationship; UI §11.4.1 requires Gateway (M4). F-07. |
| HR-01 | UNTAGGED | **M3** | Core §10.3 destructive-without-Prompt regression. F-06 / F-14 (was silently UNTAGGED; risk-class mismatch with §9/§17 deferrals). |
| SV-AUDIT-TAIL-01, SV-AUDIT-RECORDS-01, SV-AUDIT-RECORDS-02, SV-SESS-BOOT-01, SV-SESS-BOOT-02 | UNTAGGED | **M2 (retroactive)** | Already shipped + passing during M2. F-07 catalog-tidying. |
| HR-12 | UNTAGGED | **M1 (retroactive)** | Tampered Card test; shipped via L-16 + validator V2-09. |
| HR-14 | UNTAGGED | **M2 (retroactive)** | Chain-tamper; shipped via L-15 /audit/records + validator V2-10. |
| SV-SI-01..32 | UNTAGGED | **M5** (explicit) | §9 Self-Improvement. Was "UNTAGGED = M5 by convention"; now explicit. |
| SV-A2A-10..23 | UNTAGGED | **M5** (explicit) | §17 A2A Handoff. Was "UNTAGGED = M5 by convention"; now explicit. |

**Four new test IDs:**
- `SV-MEM-STATE-02` — memory-state byte-identity not-a-side-effect invariant (F-12)
- `SV-BUD-PROJ-02` — budget projection byte-identity invariant (F-12)
- `SV-REG-OBS-02` — tool registry byte-identity invariant (F-12)
- `SV-STR-OBS-01` — §14.5 channel schema + pagination + not-a-side-effect (F-01)

**Final milestone tally (230 total):** M1: 1 retroactive · M2: 22 · M3: 145 · M4: 4 · M5: 58. Zero UNTAGGED.

**M3 skip budget (resolves F-09):** target 120 green, M3-tagged 145 → 25-test skip budget. Expected skip classes at M3 close:
- SV-STR transport-adjacent tests that turn out to need real §14.3 SSE after all (e.g., SV-STR-04 CrashEvent-last semantics): up to 5
- HR-09/HR-10/HR-11 precedence-rejection tests if they prove vector-only (can't be exercised live): up to 3
- UI-straddler tests: up to 10 (any SV-* test whose assertion turns out to depend on Gateway primitives M3 doesn't ship)
- Platform-specific guards (POSIX-only, Windows-only): up to 3
- Explicit defer-during-execution: up to 4

If actual skip count exceeds 25, raise to user before sibling plans proceed to Week 3.

**HR-unblock mapping (resolves F-11, F-09):**

| Endpoint | Unblocks |
|---|---|
| §8.6 `GET /memory/state` | SV-MEM-01..08, SV-MEM-STATE-01/02, HR-17 |
| §11.4 `GET /tools/registered` | SV-REG-01..05, SV-REG-OBS-01/02, HR-13 |
| §13.5 `GET /budget/projection` | SV-BUD-01..07, SV-BUD-PROJ-01/02, HR-02, HR-03, HR-06 |
| §14.5 `GET /events/recent` | SV-STR-01..11/15/16, SV-STR-OBS-01, HR-03 mid-stream cancel observation |

**Version-policy note (resolves F-15):** these §8.6/§11.4/§13.5/§14.5 additions are normative feature extensions to v1.0. Per §19.4 interpretation in this project's pre-Final-consumers phase: v1.0 is treated as still-mutating until the first external conformance claim ships (§18 "SOA-Harness v1.0 Reference Implementation" label). Additions that are strictly additive (new endpoints with no breaking changes to existing endpoints, new test IDs, new schemas) roll into v1.0 errata. Once the reference-impl label attaches, subsequent normative additions become v1.1 scope and v1.0 receives only breakage-fix amendments. Adopters should read the MANIFEST for the list of shipped observability endpoints — all §X.Y Observability subsections added post-L-27 are discoverable via the MANIFEST supplementary_artifacts list for their schemas.

**Sibling plan authoring (resolves F-13):** M3 sibling plans at `soa-harness-impl/docs/plans/m3.md` + `soa-validate/docs/plans/m3.md` follow in the next commit wave (this session or next). Spec-kickoff is necessary but not sufficient — plans sequence the 145 tests across weeks and identify which impl surfaces each requires.

### L-33 — M3 kickoff: Memory/Budget/Registry observability + bulk milestone tagging `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · M2 close · user approval to scope M3 at full 120/150 Core target, single bundled commit.
- **M3 target:** 120/150 Core-profile tests green + start on UI profile. Master plan timeline: 4 weeks (compressed per ongoing cadence).
- **Three new observability endpoints landed this commit (same L-27 front-loading discipline as M2):**
  1. **§8.6 Memory State Observability** — `GET /memory/state?session_id=<sid>` returns persisted memory state with aging, consolidation, in-context notes, sharing-policy. Schema: `schemas/memory-state-response.schema.json`. 501 when `memory.enabled: false` in Agent Card. Not-a-side-effect. Unblocks SV-MEM-01..08.
  2. **§11.4 Dynamic Registration Observability** — `GET /tools/registered` returns the current Tool Registry including `registration_source` (static-fixture vs mcp-dynamic) and `registry_version` (sha256 of JCS(tools[])). Schema: `schemas/tools-registered-response.schema.json`. Unblocks SV-REG-01..05 + dynamic MCP registration testing.
  3. **§13.5 Budget Projection Observability** — `GET /budget/projection?session_id=<sid>` returns projection with safety_factor pinned at 1.15, cold-start-baseline flag, cache accounting, projection headroom in turns. Schema: `schemas/budget-projection-response.schema.json`. Unblocks SV-BUD-01..07 + HR-02 + HR-03 + HR-06.
- **HR-02 un-deferred.** Previously M3-deferred in L-14 pending §13 ship. Now actively in M3 scope.
- **Must-map bulk tagging:** 152 test IDs tagged as M3 (across SV-MEM, SV-BUD, SV-STR, SV-HOOK, SV-REG, SV-ENC, SV-PRIN, SV-STACK, SV-OPS, SV-GOV, SV-PRIV, SV-GOOD, SV-CLUS, SV-AGENTS, plus M3 HRs, plus untagged SV-CARD/SV-PERM/SV-BOOT/SV-SIGN remainders). Catalog total 223 → 226 (three new observability IDs: SV-MEM-STATE-01, SV-BUD-PROJ-01, SV-REG-OBS-01).
- **Remaining untagged (55):** SV-SI (32, Self-Improvement — M5) + SV-A2A (14, Handoff — M5) + misc edge cases. No M3 work blocked on these.
- **What M3 explicitly SKIPS (deferred / out of scope):**
  - Full UI Gateway (UV-*, 186 tests) — start in M3 if time permits, complete in M4 per master plan.
  - §14 StreamEvent full transport — existing §14 text covers transport; conformance tests use §12.5.4 /audit/sink-events pattern for state-transition events. Full transport verification (SSE/WebSocket) is validator-specific and can use test harness patterns established in M1/M2.
  - §9 Self-Improvement (SV-SI 32) — M5.
  - §17 A2A Handoff (SV-A2A 14) — M5.
- **Plan-evaluator pass expected after this commit** — same cadence as L-27 → L-28 in M2. User will invoke; I'll execute findings at root before sibling plans.

### L-34 — M3 sibling-plan evaluator resolution `[normative, in-spec @ <this-commit>]`

Plan-evaluator subagent ran against both sibling M3 plans (impl `ad4e99d` + validator `121cc69`) and produced 15 findings + 6 structural challenges. All spec-side resolutions bundled here. Plan-file corrections follow in sibling repo commits.

**Spec additions:**

1. **§8.3.1 MemoryDegraded Observability (NEW clarification)** — `MemoryDegraded` is a `StopReason` (§13.4), not a direct §14.1 StreamEvent. External observation is via `SessionEnd.payload.stop_reason: "MemoryDegraded"` OR the System Event Log (§14.2). Resolves F-01: sibling plans implied a bare `MemoryDegraded` event that doesn't exist in the 25-type enum.

2. **§11.3.1 Runtime Tool-Addition Test Hook (NEW, normative testability)** — `SOA_RUNNER_DYNAMIC_TOOL_REGISTRATION=<trigger-file-path>` env var. Runner watches file; writes trigger §11.1 registration. Same production-guard pattern as other test hooks (loopback-only). Resolves F-09: `SV-REG-03` had no runtime tool-add transport.

3. **`test-vectors/memory-mcp-mock/` (NEW fixture directory)** — pinned protocol specification + `corpus-seed.json` (20 notes with varied data_class for SV-MEM-03..05 weighting). Env vars:
   - `SOA_MEMORY_MCP_MOCK_TIMEOUT_AFTER_N_CALLS=<n>` (HR-17 three-timeout driver)
   - `SOA_MEMORY_MCP_MOCK_RETURN_ERROR=<tool_name>`
   - `SOA_MEMORY_MCP_MOCK_SEED=<path>`
   README documents `HR-17` test choreography using the fixture + observation via `SessionEnd.stop_reason`. Resolves F-08: Memory MCP mock was unscheduled, gating 9 tests.

**Must-map retags:**
- `SV-CLUS-01..04` → M4 (§12.4 distributed coordination is Gateway-adjacent). Resolves F-07: SV-CLUS classified as "manifest-check" but requires runtime coordination + fencing.
- `SV-GOV-10` → M5 (core+handoff profile requires §17 A2A). Resolves F-06 partial.
- `SV-GOV-12` → M5 (status=reserved, §17 dep). Resolves F-06 partial.

**Final milestone tally (230 total):** M1: 1 · M2: 22 · M3: **139** (was 145) · M4: 8 (was 4) · M5: 60 (was 58).

**Revised M3 skip budget:** 139 tagged; target ≥120 green → 19-test skip budget. Tighter than pre-L-34's 25.

**Plan-file corrections (applied in sibling repos separately — F-02, F-03, F-04, F-05, F-10, F-11, F-12, F-13, F-14, S-3, S-4, S-6):** test-count arithmetic refreshes, Week-4 scaffold pattern extended, validator V-9 split into V-9a/V-9b/V-9c, impl T-0 Memory MCP mock slot added, full SHA correction, wall-clock baseline task added, machine-readable STATUS.md schema suggested.

**Citation graph stale vs M3 kickoff additions (F-15):** `graphify-out/citations.json` indexes no HR tests and no OBS-category test nodes (SV-MEM-STATE-*, SV-BUD-PROJ-*, SV-REG-OBS-*, SV-STR-OBS-*). Not a plan-validity blocker; spec-repo graph-maintenance item. `refresh-graph.py` re-runs at this commit should reduce the drift.

### L-35 — M3 execution findings: hook-lifecycle observability + AGENTS.md denylist fixture `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · validator Week 3 execution — four findings (L/M/N + SV-REG-04 dual gap)
- **What:** Validator's SV-HOOK probe harness hit root causes the spec could articulate more directly. Four distinct execution findings routed; three to impl as wiring gaps, one (SV-HOOK-07) required a spec-design decision routed via user (Option A chosen: extend §14.1 enum). Dual impl+spec gap on SV-REG-04: no AGENTS.md fixture in `test-vectors/` AND no loader env var.
- **Findings summary:**
  - **L (SV-HOOK-05 replace_args):** `outcome.replace_args` typed in impl but never consumed. Pure impl wiring.
  - **M (SV-HOOK-06 replace_result):** `outcome.replace_result` typed but never consumed. Pure impl wiring.
  - **N (SV-HOOK-08 reentrancy):** zero impl for `StopReason::HookReentrancy`. Pure impl feature gap.
  - **SV-HOOK-07 (step-5 ordering):** no observable surface for PreToolUse/PostToolUse lifecycle outcomes. Required spec decision.
  - **SV-REG-04 (AGENTS.md denylist):** no pinned fixture + no loader env var.

**Spec additions:**

1. **§14.1 closed enum grows 25 → 27 `[§19.4 errata, minor bump]`** — adds `PreToolUseOutcome` and `PostToolUseOutcome`. These are emitted when §15 hook pipeline stages produce an outcome and are the observation surface for `SV-HOOK-05/06/07`. Payload schemas added to §14.1.1 `$defs` (includes `outcome` enum, `args_digest_before/after` for replace_args, `output_digest_before/after` for replace_result). Trust class: `system` (Runner chrome, like other hook-lifecycle markers). Affects `schemas/stream-event.schema.json` + `schemas/stream-event-payloads.schema.json`.

2. **§11.2.1 AGENTS.md Source Path Test Hook (NEW, normative testability)** — `SOA_RUNNER_AGENTS_MD_PATH=<file-path>` env var. Same production-guard pattern as §11.3.1 (loopback-only, refuses non-loopback interface). Fail-startup with `AgentsMdUnavailableStartup` on missing/unreadable path. Resolves SV-REG-04 impl-half gap.

3. **`test-vectors/agents-md-denylist/` (NEW fixture directory)** — pinned `AGENTS.md` with `## Agent Type Constraints → ### Deny` naming `fs_write_dangerous`, companion `tools-with-denied.json` five-tool registry, `README.md` documenting the SV-REG-04 choreography. Resolves SV-REG-04 spec-half gap.

**Must-map updates:**
- `SV-REG-04.section`: `§11.2` → `§11.2 + §11.2.1`; assertion specifies env-var usage + fixture path.
- `SV-HOOK-05/06` assertions updated to reference new StreamEvent types + digest-before/after observation.
- `SV-HOOK-07` assertion specifies ordering via sequence monotonicity across the 27-value enum.
- `SV-STR-02` + `SV-STR-OBS-01` enum-count references updated 25 → 27.

**Other 25-enum references updated:** §8.3.1 MemoryDegraded rationale ("not in the 25-value closed enum" → 27), §14.5 structural reference to §12.5.4 ("full 25-type enum" → 27).

**Version impact:** §19.4 minor bump (1.0.0 → 1.0.1 at publication of this errata; closed-enum additions are wire-format extensions, not breaking changes — consumers of the §14.1 enum see two new types they can ignore per existing unknown-type rejection rules).

**Validator action:** bump `soa-validate.lock` to this commit. Rewrite SV-HOOK-07 probe to poll `/events/recent` for `PreToolUseOutcome` + `PostToolUseOutcome` with expected sequence order. SV-REG-04 handler launches impl with `SOA_RUNNER_AGENTS_MD_PATH=test-vectors/agents-md-denylist/AGENTS.md`.

**Impl action:** emit `PreToolUseOutcome` + `PostToolUseOutcome` at the hook-pipeline boundaries per §14.1.1 payload schemas. Wire `outcome.replace_args` / `outcome.replace_result` into decision pipeline (Findings L + M root-cause fix). Ship `HookReentrancy` detection per-session PID tracking (Finding N). Implement `SOA_RUNNER_AGENTS_MD_PATH` loader per §11.2.1.

### L-36 — OTel + backpressure observability channels + 2 M4 retags `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · validator Week 3 V-9a — 5 of the 7 "stayed-skip" SV-STR tests came back with precise routing diagnostics
- **What:** Two genuine spec gaps + two milestone retags + one "already fine" classification:
  - **Gap A (SV-STR-06/07):** §14.4 MUSTs OTel span emission but no validator-observable surface. In production, spans export to operator OTLP collectors; conformance can't assume collector reachability. Spec needed an in-process OTel observability endpoint.
  - **Gap B (SV-STR-08):** §14.4 specifies "10k buffer, drop-oldest with `ObservabilityBackpressure`" and §24 has the error-code, but nowhere could a validator observe that backpressure was applied. Spec needed a backpressure status endpoint.
  - **Retag 1 (SV-STR-11):** CompactionDeferred mid-ContentBlockDelta requires real LLM dispatcher streaming — beyond M3 scope; M4.
  - **Retag 2 (SV-STR-16):** Trust-class enforcement observation requires Gateway surface; §14.1.2 is Runner-side static mapping. M4.
  - **No-op (SV-STR-10):** Composable with SV-SESS-06 crash-marker harness once impl ships those fixtures. Not a spec gap.

**Spec additions:**

1. **§14.5.2 OTel Span Observability Channel (NEW normative — M3 addition)** — `GET /observability/otel-spans/recent?session_id=<sid>&after=<span_id>&limit=<n>`. Returns array of spans byte-equivalent to what the Runner exports (or would export) to an OTLP collector per §14.4. Session-scoped bearer (`sessions:read:<session_id>`), 120 rpm. Not-a-side-effect. Byte-identity excludes `generated_at`. Resolves SV-STR-06/07 observation gap.

2. **§14.5.3 Observability Backpressure Status Endpoint (NEW normative — M3 addition)** — `GET /observability/backpressure`. Returns process-global buffer capacity (MUST be 10000 per §14.4), current size, monotonic `dropped_since_boot` counter, `last_backpressure_applied_at` + `last_backpressure_dropped_count`. Admin-scoped bearer (`admin:read`), 60 rpm. Not-a-side-effect. Resolves SV-STR-08 observation gap without extending the §14.1 closed enum.

3. **`schemas/otel-spans-recent-response.schema.json` (NEW)** — wire schema for §14.5.2 responses. Spans array with `span_id` (16-hex), `trace_id` (32-hex), `name` (soa.turn / soa.tool.<name>), `attributes`, `events` (StreamEvent events), `resource_attributes`.

4. **`schemas/backpressure-status-response.schema.json` (NEW)** — wire schema for §14.5.3 responses. `buffer_capacity` locked to const 10000 per §14.4.

**Must-map updates:**
- `SV-STR-06`: `§14.4` → `§14.4 + §14.5.2`; assertion specifies `/observability/otel-spans/recent` probe + required attributes.
- `SV-STR-07`: `§14.4` → `§14.4 + §14.5.2`; assertion is two-part: `/ready` 503 on missing attrs + `resource_attributes` completeness on the span endpoint.
- `SV-STR-08`: `§14.4` → `§14.4 + §14.5.3`; assertion specifies `/observability/backpressure` flood-and-poll.
- `SV-STR-11`: `implementation_milestone` M3 → M4 (CompactionDeferred needs real LLM dispatcher).
- `SV-STR-16`: `implementation_milestone` M3 → M4 (trust_class enforcement is Gateway-scope).

**Milestone tally delta:** M3: 139 → **137** · M4: 8 → 10. Total still 230.

**M3 skip budget impact:** 137 tagged; target ≥120 green → 17-test skip budget. Retaining 4 pre-budgeted skips (SV-STR-04, SV-GOV-09, SV-MEM-08, HR-13) → 13 real-slip headroom.

**Version impact:** §19.4 minor errata bump (1.0.1 → 1.0.2 at publication of L-35+L-36 errata). Additive endpoints + schemas — no breaking changes.

**Validator action:** pin-bump to this commit. Load two new schemas in registry. Write two new probes: `/observability/otel-spans/recent` flood-safe polling for SV-STR-06/07, `/observability/backpressure` before-and-after flood assertion for SV-STR-08. Retag SV-STR-11/16 handlers as M4-pending (skip with "M4 scope" diagnostic until M4 runtime lands).

**Impl action:** implement `/observability/otel-spans/recent` endpoint — store emitted spans in-process ring buffer, serve from there. Byte-equivalence to OTLP export is the key invariant. Implement `/observability/backpressure` — surface the existing 10k buffer state + drop counter. `admin:read` scope (process-global, not session-scoped). Same production-guard pattern as other observability endpoints (loopback + TLS 1.3). Bounce :7700 after each lands so validator probes flip on next poll.

### L-37 — V-9b budget-batch execution findings: 1 retag + 4 impl asks `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · validator Week 3 V-9b — budget batch delivered 0 of 5 expected flips
- **What:** V-9b ran while validator was still on pre-L-36 spec pin. Confusion overlapping but distinct from L-36:
  - **1 new retag:** SV-BUD-03 (mid-stream cancel on ContentBlockDelta boundary) — same class as SV-STR-11, needs real LLM streaming. M3 → M4.
  - **4 pure impl asks** (spec already covers these, no spec change needed — validator's punch list documents what impl hasn't wired):
    - SV-BUD-02: impl hardcodes `maxTokensPerRun=200_000` instead of reading `card.tokenBudget.maxTokensPerRun` (line 375/379 of spec mandates card-driven). Impl bug; fix is reading from card, not adding env override.
    - SV-BUD-04: `TurnRecord` missing `prompt_tokens_cached` + `completion_tokens_cached` fields. Spec already has these in session-state-response (line 1863-1864). Impl gap.
    - SV-BUD-05: `billing_tag` end-to-end (bootstrap → audit → events → OTel) entirely absent (zero grep matches). Spec mandates: Agent Card field (line 375/379), session-state match (line 1821), OTel attribute `soa.billing.tag` (line 2046), audit linkage. Pure impl feature gap.
    - SV-BUD-07: `BillingTagMismatch` gate at POST /sessions depends on SV-BUD-05 landing. Error code already in §24 (line 2595). Impl gap.

**Must-map updates:**
- `SV-BUD-03`: `implementation_milestone` M3 → M4 (mid-stream cancel needs LLM streaming).

**Milestone tally delta:** M3: 137 → **136** · M4: 10 → 11. Total still 230.

**M3 skip budget impact:** 136 tagged; target ≥120 green → 16-test skip budget. Retaining 4 pre-budgeted → 12 real-slip headroom. SV-BUD-03 already skipping — counts as pre-budgeted from now.

**No new spec-normative text this L-entry** other than the retag. Four impl asks are straightforward feature-completion against already-normative spec clauses. Routed directly to impl as Findings O/P/Q/R with line-number citations.

**Pattern note:** validator wrote the punch list before pulling L-36, so their list conflates "spec gaps I need" (SV-STR-06/07/08 + SV-STR-11/16) with impl asks. After pulling e77dba2, the first three spec gaps + two retags are already resolved. Only SV-BUD-03 was genuinely new.

### L-38 — System Event Log observation channel + memory-mcp-mock protocol completion `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · validator V-9c — +2 of expected +7 SV-MEM flips. Two genuine spec gaps identified.
- **What:**
  - **Gap A (SV-MEM-04):** §14.2 System Event Log is file-only (`/logs/system.log` JSON Lines); no HTTP observation surface. `SV-MEM-04` observes a NON-terminal `MemoryDegraded` category record on the System Event Log (per-timeout, pre-threshold). Without an HTTP endpoint, validator cannot deterministically read the log without shared filesystem access to impl.
  - **Gap B (SV-MEM-07):** L-34 `test-vectors/memory-mcp-mock/README.md` documented three tools (`search_memories`, `write_memory`, `consolidate_memories`). §8.1 lines 541–563 define five tools with different names (no `write_memory`; uses `add_memory_note` concept via `delete_memory_note` idempotent-tombstone semantics). Mock README was incomplete and used a non-spec tool name; conformance mock could not support `SV-MEM-07` delete-idempotency assertion.

**Spec additions:**

1. **§14.5.4 System Event Log Observation Channel (NEW normative — M3 addition)** — `GET /logs/system/recent?session_id=<sid>&category=<cat1,cat2>&after=<record_id>&limit=<n>`. Returns records from the same buffer backing `/logs/system.log` with identical `ts` + `record_id`. Session-scoped bearer, 120 rpm. Not-a-side-effect on reads. Schema: `schemas/system-log-recent-response.schema.json`. Resolves SV-MEM-04 observation gap.

2. **`schemas/system-log-recent-response.schema.json` (NEW)** — wire schema with closed 12-category enum matching §14.2, record_id pattern `^slog_[A-Za-z0-9]{8,}$`, level enum `{info, warn, error}`.

3. **`test-vectors/memory-mcp-mock/README.md` (UPDATED)** — protocol table replaced to match §8.1 exactly: `search_memories`, `search_memories_by_time`, `read_memory_note`, `consolidate_memories`, `delete_memory_note`. Removed non-spec `write_memory`. Added idempotency + tombstone semantics for `delete_memory_note` per §8.1 line 566. Corpus-seed.json unchanged (20 notes still valid for search-weighting tests).

**Must-map updates:**
- `SV-MEM-04`: `§8.3` → `§8.3 + §14.5.4`. Assertion sharpened to specify observation via `/logs/system/recent` with category filter + exactly-one-record + session-continues invariant.

**Routed to impl (no spec change, feature/wiring work only):**
- **Finding S (SV-MEM-03):** `MemoryMcpClient` lacks a startup-time probe surfacing `MemoryUnavailableStartup` before `/ready` flips 200. §8.3 line 581 already MANDATES fail-startup on timeout-or-connection-failure during bootstrap. Impl must wire a startup probe.
- **Finding T (SV-MEM-04 gating):** impl emits `SessionEnd{MemoryDegraded}` on EVERY timeout, bypassing the 3-consecutive threshold gate. §8.3 line 582 is clear: per-timeout is non-terminal (System Event Log only); 3-consecutive terminates session. Impl must add `MemoryDegradationTracker.isDegraded()` gate.
- **Finding U (SV-MEM-05):** consolidation trigger not wired. §8.4 mandates 24h timer OR per-session note-count ≥ 100. Impl must ship background scheduler + note-count tracker.
- **Finding V (SV-MEM-06):** `sharing_scope` hard-coded to `"session"` in impl. §8.5 + Agent Card `memory.default_sharing_scope` field define the source. Impl must thread from Agent Card through to `search_memories` calls.

**Version impact:** §19.4 minor errata. 1.0.2 → 1.0.3 at publication. Additive endpoint + schema + fixture protocol clarification. No breaking changes.

**Milestone tally:** unchanged at 136 M3 · 11 M4 · 60 M5 · 22 M2 · 1 M1.

### L-39 — Conformance card variants for path-coverage probes `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · validator V-9 cleanup — board at 67/0/13/0, validator self-corrected one phantom fail (SV-STR-07 attribute set — Finding X retracted, impl already had service.version correctly)
- **What:** Two SV-* probes need non-default Agent Card variants to exercise card-driven paths that the base `conformance-card` fixture can't:
  - **SV-BUD-02** (projection-over-budget): base card carries `maxTokensPerRun=200000`. Burning 200k tokens of driven traffic per test is infeasible; need a low-value variant.
  - **SV-MEM-06** (sharing_policy threading): base card carries `memory.enabled=false`. Memory MCP paths can't be exercised without `enabled=true` + a reachable `mcp_endpoint`. Validator also needs the card to carry a non-default `sharing_policy` value so they can assert the Runner threads the card value through to `search_memories` calls (Finding V shipped the code path; this fixture exercises it).

**Spec additions:**

1. **`test-vectors/conformance-card-low-budget/` (NEW)** — `agent-card.json` + `README.md`. Delta from base: `name`, `tokenBudget.maxTokensPerRun=1000`, `tokenBudget.billingTag`. All other fields identical to base. Usage: `RUNNER_AGENT_CARD_PATH=test-vectors/conformance-card-low-budget/agent-card.json`, drive one decision with `input_tokens+projected > 1000`, observe `SessionEnd.stop_reason=BudgetExhausted`.

2. **`test-vectors/conformance-card-memory-project/` (NEW)** — `agent-card.json` + `README.md`. Delta from base: `name`, `memory.enabled=true`, `memory.mcp_endpoint=mcp://127.0.0.1:8001/`, `tokenBudget.billingTag`. `memory.sharing_policy` stays `"project"` (already non-default relative to impl's hardcoded `"session"`). Usage: pair with memory-mcp-mock running on :8001 seeded from `corpus-seed.json`; observe outgoing `search_memories` call carries `sharing_scope="project"`.

**Must-map updates:**
- `SV-BUD-02` assertion sharpened to reference the low-budget fixture path + single-decision threshold arithmetic.
- `SV-MEM-06` assertion sharpened to reference the project-scope fixture path + sharing_scope observation against mock outgoing request.

**Also noted (no spec change):**
- **Finding X retracted.** Validator's SV-STR-07 probe asserted wrong required-resource-attr set ({service.name, service.version, session_id}) vs spec §14.4 default ({service.name, soa.agent.name, soa.agent.version, soa.billing.tag}). Impl had service.version correctly all along. L-36 + Finding W were the real fixes. Finding X was a validator false-positive chased after Finding W's bounce; harmless because impl didn't ship against it.

**Field-naming clarification:** spec uses `memory.sharing_policy` (§7 line 318 + enum). Validator conversations used `sharing_scope` and `default_sharing_scope`. These are the same field — `sharing_policy` is the normative Agent Card field name; `sharing_scope` is the matching parameter name on `search_memories()` calls (§8.1 line 541–545). If future conversation mixes the two terms, they refer to the same policy value.

**Milestone tally:** unchanged. 136 M3 · 11 M4 · 60 M5 · 22 M2 · 1 M1.

### L-40 — billing_tag audit+stream schema extensions + consolidation test hooks + HR-06 retag `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-21 · validator cleanup after Q+R landed — +1 flip (SV-BUD-07 clean) but Q's audit/stream embed blocked on schema `additionalProperties:false` + hash-chain desync constraint; HR-06 confirmed M4 scope; SV-MEM-05 blocked on 24h timer arm being the only testable path after L-38 removed write_memory from the mock
- **What:** Three distinct spec items + two route-backs to impl:
  - **Gap A (SV-BUD-05 impl-blocker):** impl can't add `billing_tag` to audit records without schema permitting it (existing `additionalProperties:false`). Also can't add to `PermissionDecision` payload. Impl noted the hash-chain desync risk at `decisions-route.ts:710` — if schema adds billing_tag as required, existing audit records without it break validation; if added without hash-chain inclusion, the field becomes a side channel.
  - **Gap B (SV-MEM-05 testability):** §8.4 consolidation trigger is 24h-or-100-notes. 24h infeasible in test runs; 100-notes arm blocked because §8.1 tool contract doesn't include write/add (note-creation is §9.5, M5). Validator needs deterministic elapsed-time injection.
  - **Retag (HR-06 M3→M4):** Compaction integrity requires real LLM dispatch with ContentBlockDelta streaming to produce the pre/post-compaction conversation slices. Q's billing_tag wiring doesn't unlock it. Same class as SV-STR-11, SV-BUD-03.
  - **Route-back (SV-MEM-06):** impl reads `card.memory.default_sharing_scope`; spec canonical key is `memory.sharing_policy` (§7.318). One-line field rename.
  - **Route-back (SV-MEM-05 follow-up):** after §8.4.1 env hook lands, impl must honor `RUNNER_CONSOLIDATION_TICK_MS` + `RUNNER_CONSOLIDATION_ELAPSED_MS`.

**Spec additions:**

1. **`schemas/audit-records-response.schema.json` (EXTENDED)** — added optional `billing_tag` field with pattern `^[A-Za-z0-9_:.-]{1,64}$` matching Agent Card `tokenBudget.billingTag` (§7 line 379). Hash-chain semantics: when present, the field is canonical-JCS-serialized and contributes to `this_hash`. When absent, hash-chain computation excludes the field (not "" placeholder). Backwards-compatible — existing audit records without the field still validate.

2. **`schemas/stream-event-payloads.schema.json` + §14.1.1 inline (EXTENDED)** — `PermissionDecision` payload `$defs` adds optional `billing_tag` field with matching pattern. Does NOT affect signed PDA bytes (signed canonical_decision doesn't carry billing_tag; Runner attaches at StreamEvent emit time per §13.3 propagation path).

3. **§8.4.1 Consolidation Trigger Test Hooks (NEW normative — Testability, M3 addition)** — two env vars:
   - `RUNNER_CONSOLIDATION_TICK_MS` (poll interval; default 60000)
   - `RUNNER_CONSOLIDATION_ELAPSED_MS` (injected elapsed-time offset; default 0)
   
   Same production-guard pattern as `RUNNER_TEST_CLOCK` + `SOA_RUNNER_DYNAMIC_TOOL_REGISTRATION`. Makes the 24h arm deterministically testable; 100-notes arm remains M5-dependent on write/add primitive landing (§9.5).

**Must-map updates:**
- `SV-BUD-05` assertion sharpened: billing_tag observed on all three surfaces (OTel span, audit record, PermissionDecision StreamEvent) with identical value matching Agent Card.
- `HR-06` retagged M3 → M4 with milestone_reason citing ContentBlockDelta streaming dependency.

**Milestone tally:** M3: 136 → **135** · M4: 11 → 12. Total unchanged at 230.

**M3 skip budget:** 135 tagged; target ≥120 green → **15-test skip budget**. 4 pre-budgeted + 11 real-slip headroom.

**Impl action (after pin-bump):**
- Embed `billing_tag` in audit records + PermissionDecision StreamEvent per new optional schema fields. Hash-chain inclusion via canonical JCS on the record's serialized form.
- Honor `RUNNER_CONSOLIDATION_TICK_MS` + `RUNNER_CONSOLIDATION_ELAPSED_MS` per §8.4.1. Production guard: refuse startup on non-loopback.
- SV-MEM-06 one-line rename: `card.memory.default_sharing_scope` → `card.memory.sharing_policy` in start-runner.ts.
- **STOP work on HR-06** — retagged M4. Don't attempt compaction-integrity wiring in M3.

**Version impact:** §19.4 minor errata. 1.0.4 → 1.0.5. Additive schema fields (backwards-compatible) + new test-hook env vars + one retag. No breaking changes.

### L-41 — Admin audit record subtypes + Agent Card `security.data_residency` field `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator T-12 probe batch — +7 flips but 5 new findings (3 impl-side: AF/AG/AH; 2 spec-side: AI/AJ). One accidental live-runner audit-chain poisoning exposed Finding AJ (validator's first SV-PRIV-03 probe wrote SubjectSuppression rows against :7700 which failed schema validation under the old decision-only required-field set).
- **What:**
  - **Gap A (AJ — SV-AUDIT-RECORDS-01/02/HR-14/SV-PERM-21 cascade):** `schemas/audit-records-response.schema.json` required `args_digest, capability, control, handler, signer_key_id` for every record. The privacy endpoints (`/privacy/delete_subject`, `/privacy/export_subject`) and the residency gate (`/permissions/decisions` with `security.data_residency` declared) emit `SubjectSuppression`, `SubjectExport`, `ResidencyCheck` rows that carry NO permission-decision fields. Any such row breaks schema validation on subsequent `/audit/records` reads, cascading into 4 tests when it lands on a chain page.
  - **Gap B (AI — SV-PRIV-05):** `agent-card.schema.json` `security` object has `additionalProperties: false`, rejecting the `data_residency` field that §10.7 step 5 normatively requires.

**Spec additions:**

1. **`schemas/audit-records-response.schema.json` (EXTENDED)** — `decision` enum grew from 5 to 8 values adding `SubjectSuppression`, `SubjectExport`, `ResidencyCheck`. Record shape switches to `oneOf` with `decision` as discriminator: decision-rows require the full §10.5 field set; admin-rows require the reduced `{id, timestamp, session_id, subject_id, decision, reason, prev_hash, this_hash}` set. Both participate in the same hash-chain. Backwards-compatible for existing decision rows.

2. **`schemas/agent-card.schema.json` + §7 inline (EXTENDED)** — `security.data_residency: array<string>` added as OPTIONAL. Items pattern `^[A-Z]{2}$` (ISO 3166-1 alpha-2). When present, Runner MUST apply layered-defence gate per §10.7 step 5 and emit `ResidencyCheck` audit rows.

3. **§10.5.4 Admin Audit Record Subtypes (NEW normative)** — defines the three admin subtypes, required-field contract, hash-chain participation rule, schema discriminator explanation, and conformance linkage to `SV-AUDIT-RECORDS-01/02`, `SV-PRIV-03`, `SV-PRIV-05`.

**Routed to impl (no spec change — AF/AG/AH):**
- **Finding AF (SV-GOV-02/03/04/11 + SV-PRIV-01):** serve `docs/{stability-tiers,migrations,errata-v1.0,release-gate,data-inventory}` via `/docs/*` HTTP routes. Currently repo-root files unreachable from a live Runner.
- **Finding AG (SV-PRIV-02):** `MemoryDeletionForbidden` error on sensitive-personal consolidation is swallowed at `sessions-route.ts:455` (console.warn only). Emit a `/logs/system/recent` record with category `SelfImprovement` or `Error` so validators can observe.
- **Finding AH (SV-PRIV-04):** `RetentionSweepScheduler` has no env override for testing. Add `RUNNER_RETENTION_TICK_MS` + `RUNNER_RETENTION_INTERVAL_MS` mirroring §8.4.1 consolidation-hook pattern. Needs a matching spec clause (§10.7 step 6 or §10.7.1 testability subsection).

**URGENT: :7700 audit chain bounce required.** Validator's first SV-PRIV-03 probe wrote 1+ `SubjectSuppression` rows to the live :7700 in-memory chain before switching to subprocess isolation. Under the old schema those rows break validation; 4 tests going red: `HR-14`, `SV-AUDIT-RECORDS-01`, `SV-AUDIT-RECORDS-02`, `SV-PERM-21`. After L-41 schema update, the rows validate. Impl SHOULD still bounce :7700 to reset the in-memory chain to GENESIS for test determinism.

**Must-map:** no existing assertion changes needed — `SV-PRIV-05` already points at `data_residency`; `SV-AUDIT-RECORDS-*` already allow admin rows implicitly once schema validates them.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.5 → 1.0.6. Additive schema fields + backwards-compatible `oneOf` restructure + new spec clause. No breaking changes.

**Pattern note:** Finding AJ is a valuable "latent bug" find — the schema gap existed for as long as the privacy endpoints have been declared normatively (§10.7 in the original v1.0 spec). Nobody caught it until validator's live-runner probe wrote a real SubjectSuppression row and then read the chain back. Exactly the independent-judge property paying off.

### L-42 — V-9a card/sign fixtures: precedence-violation + program.md JWS `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator V-9a bulk wiring landed +11 flips. 3 remaining required fixtures; routed as Findings AL + AM.
- **What:**
  - **AL (SV-CARD-10):** no fixture exercised the §10.3 three-axis tightening rule. Validator needs a Card intentionally violating precedence (lower-axis loosening upper) so the Runner's ConfigPrecedenceViolation refusal path can be tested.
  - **AM (SV-SIGN-02 + SV-SIGN-05):** no fixture for §9.2 program.md signing profile. Validator needs a signed detached JWS pair — basic `{alg, kid, typ}` form for SV-SIGN-02, plus `x5t#S256` variant for SV-SIGN-05's two-step signer resolution path.

**Spec additions:**

1. **`test-vectors/conformance-card-precedence-violation/` (NEW)** — `agent-card.json` + `README.md`. Card combines `agentType: "explore"` (implicit ReadOnly-only per §11.2) with `permissions.activeMode: "DangerFullAccess"` — lower-precedence axis attempting to loosen. Runner MUST refuse bootstrap: `/ready` 503, `/logs/system/recent` category=`Config` carries exactly one `ConfigPrecedenceViolation` record. Intentionally non-conformant; DO NOT use as a real template.

2. **`test-vectors/program-md/` (NEW)** — four files:
   - `program.md` — pinned minimal §9.2-shaped program.
   - `program.md.jws` — detached JWS, header `{alg: "EdDSA", kid: "soa-conformance-test-handler-v1.0", typ: "soa-program+jws"}`, signature over `base64url(header).base64url(program.md bytes)`. Payload is **raw UTF-8**, not JCS.
   - `program.md.x5t.jws` — same structure with added `x5t#S256` header containing base64url-no-pad SHA-256 of handler-keypair SPKI DER (`dJ8_1Gjlp-fmYEtxyBK2a0V5Mii1V6ROJTiO0HqFkeM` = hex `749f3fd4…8591e3`).
   - `generate.mjs` — deterministic regenerator using handler-keypair; Ed25519 PureEdDSA signatures are canonical so output is reproducible byte-for-byte.
   - `README.md` — signing contract + two-step signer resolution choreography for SV-SIGN-05.

**Must-map updates:**
- `SV-CARD-10` assertion points at precedence-violation fixture + bootstrap refusal observables.
- `SV-SIGN-02` assertion points at `program.md.jws` fixture + header constraints.
- `SV-SIGN-05` assertion points at `program.md.x5t.jws` fixture + two-step resolution contract.

**Also noted from V-9a landing:**
- **SV-CARD-04 assertion calibration** (validator self-correction): original assertion required `JWS.kid ∈ trustAnchors[].publisher_kid`. Per §6.1, chain validation is cryptographic (cert chain → anchor SPKI), not identity match by kid. Validator loosened to structural shape (anchors + x5c present); full X.509 chain crypto verification stays as future work. No spec change — the original assertion was stricter than the spec mandates.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.6 → 1.0.7. Additive fixtures only.

**Pattern note:** The program-md generator pattern — deterministic regeneration from pinned keypair — should become the template for future signed fixtures. Ed25519 PureEdDSA canonicality means the `.jws` bytes are reproducible, so the pin is the generator-script + payload, not a potentially-drifting signed blob. Future MANIFEST-style signed fixtures should adopt the same regenerator pattern.

### L-43 — V-9c trust-init env hooks + DNSSEC + split-brain fixtures `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator V-9c landed +2 flips, 3 routed. Three impl env hooks + two fixture sets needed for SV-BOOT-03/04/05.
- **What:**
  - **AP (SV-BOOT-03 DNSSEC):** real DNSSEC resolver calls infeasible in tests. Need `SOA_BOOTSTRAP_DNSSEC_TXT` env hook + three-scenario fixture (valid / empty / missing-AD-bit).
  - **AQ (SV-BOOT-04 24h poll + revocation):** real 24-hour polling infeasible in tests. Need `RUNNER_BOOTSTRAP_POLL_TICK_MS` override + `SOA_BOOTSTRAP_REVOCATION_FILE` watch path for injecting a revocation synchronously.
  - **AR (SV-BOOT-05 split-brain):** need `SOA_BOOTSTRAP_SECONDARY_CHANNEL` env hook + dissenting-channel fixture to simulate §5.3.2 multi-channel disagreement.

**Spec additions:**

1. **§5.3.3 Bootstrap Testability Env Hooks (NEW normative)** — three env vars, same production-guard pattern as §8.4.1 / §11.3.1 / §11.2.1 (loopback-only, refuse startup on non-loopback). Documents the synchronous injection mechanism for each of the three SV-BOOT tests.

2. **`test-vectors/dnssec-bootstrap/` (NEW)** — `README.md` + three JSON fixtures (`valid.json`, `empty.json`, `missing-ad-bit.json`) matching the Runner's read-shape for the env-hook injection path.

3. **`test-vectors/bootstrap-secondary-channel/` (NEW)** — `README.md` + `initial-trust.json` carrying a dissenting `publisher_kid` (`soa-dissenting-channel-v1.0`) + obviously-unusable SPKI pattern (`ffff…0001`) so split-brain detection is the only path that triggers.

**Must-map updates:**
- `SV-BOOT-03/04/05` assertions sharpened with env-hook references + fixture paths + exact observability assertions.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.7 → 1.0.8. Additive fixtures + one new normative subsection + must-map sharpenings. No breaking changes.

**Pattern note:** Three consecutive spec bundles (L-40 §8.4.1, L-42 deterministic generator, L-43 bootstrap hooks) all ship test-only env hooks following the identical production-guard shape. That consistency is intentional — once impl implements one such hook correctly, subsequent hooks reuse the same guard enforcement code. Any deviation in future test hooks from this pattern should be flagged as a spec-design concern.

### L-44 — JWT clock-skew fixture set `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator V-10 landed +15 flips (all 7 SV-ENC except 06, all 5 SV-PRIN, both SV-STACK, both SV-OPS). Board at 119 — one test from ≥120. One finding routed.
- **What:** `SV-ENC-06` asserts the §1 `±30s` JWT iat/exp clock-skew window. No pinned fixtures existed; validator couldn't exercise the assertion deterministically.
- **Fixture:** `test-vectors/jwt-clock-skew/` — four JWT files (`iat-in-window`, `iat-past`, `iat-future`, `exp-expired`) + `generate.mjs` + `README.md`. Signed with the existing `handler-keypair` (same pattern as L-42 `program-md` fixture). Reference clock `T_REF = 2026-04-22T12:00:00Z`. Validators inject the same clock via `RUNNER_TEST_CLOCK` (§10.6.1) so assertions are deterministic.

**Must-map update:** `SV-ENC-06` assertion sharpened with fixture paths + reference-clock setup + distinct reject `reason` codes (`iat-past-skew`, `iat-future-skew`, `exp-expired`).

**Also noted from V-10 landing (no spec change):**
- **SV-ENC-04 validator self-correction:** first pass scanned raw filesystem bytes; Windows `core.autocrlf=true` rewrites LF→CRLF on checkout so ALL schema files looked non-compliant. Validator switched to `git show HEAD:<path>` — canonical bytes drive the assertion. Manifest digest at pin-bump already proves the stored form; the runtime probe reads git-canonical.
- **SV-ENC-07 validator self-correction:** probe first tried signed PDA-pair fixture (handler-kid + capability + control focus, no window fields). Switched to unsigned `permission-prompt/canonical-decision.json` which has the `not_before`/`not_after` 4m25s window. No spec change; fixture was already correct, probe selected wrong one initially.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.8 → 1.0.9. Additive fixture + must-map sharpening. No breaking changes.

**Pattern note:** L-44 is the third fixture bundle using the same deterministic-generator pattern (L-42 program-md, L-43 dnssec-bootstrap, L-44 jwt-clock-skew). Handler-keypair signs; Ed25519 PureEdDSA canonicality means regeneration produces byte-identical output. The pin is the generator + reference-clock constant, not a potentially-drifting signed blob.

### L-45 — AGENTS.md grammar fixture set + L-44 T_REF correction `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · **🎯 M3 ≥120 TARGET CROSSED** at 120/0/17/0. V-11 landed +1 flip (SV-ENC-06 via L-44 fixtures); V-11 SV-AGENTS surfaced one impl finding + one fixture ask.
- **What:**
  - **Finding AT (impl):** §7.2/§7.3 AGENTS.md parser only handles the `### Deny` denylist subset. Full parser (required H2s in order, `@import` depth + cycle, entrypoint-match, reload rules) not yet shipped.
  - **Finding AU (spec):** validator probes for AT need pinned fixture set covering 7 scenarios — missing-h2, duplicate-h2, out-of-order-h2, import-depth-9, import-cycle, mid-turn-reload, entrypoint-mismatch.
  - **L-44 cosmetic typo:** UNIX epoch 1776948000 actually resolves to `2026-04-23T12:40:00Z`, not the label `2026-04-22T12:00:00Z` in the original README. Fixtures are self-consistent (validator verified); fix is label-only.

**Spec additions:**

1. **`test-vectors/agents-md-grammar/` (NEW)** — seven subdirectories + top-level README. Each scenario is a self-contained fixture ready for subprocess-isolated Runner probe with `SOA_RUNNER_AGENTS_MD_PATH=<scenario-path>/AGENTS.md`.
   - `missing-h2/` — `## Immutables` removed
   - `duplicate-h2/` — `## Memory Policy` appears twice
   - `out-of-order-h2/` — Agent Persona before Project Rules
   - `import-depth-9/` — 9-deep `@import` chain (AGENTS.md → level-1.md → … → level-9.md) exceeding the §7.3 depth-8 maximum
   - `import-cycle/` — A imports B, B imports A (3-file cycle including AGENTS.md)
   - `mid-turn-reload/` — valid AGENTS.md; validator mutates mid-turn and asserts §7.4 reload-deferred semantics
   - `entrypoint-mismatch/` — declares `entrypoint: wrong-entrypoint.py` conflicting with Card's `self_improvement.entrypoint_file: agent.py`

2. **L-44 README + must-map correction** — all references to the mislabeled `2026-04-22T12:00:00Z` updated to the correct `2026-04-23T12:40:00Z`. UNIX epoch 1776948000 is authoritative; the fixtures + signatures remain unchanged (validator confirmed they verify).

**Must-map updates:**
- `SV-ENC-06` assertion now references the correct `RUNNER_TEST_CLOCK=2026-04-23T12:40:00Z` + UNIX-epoch `T_REF=1776948000`.
- SV-AGENTS assertions (existing — impl-dependent) are unblocked once impl ships AT. No normative prose change needed since §7.2/§7.3/§7.4 already define the grammar.

**Routed to impl:**
- **Finding AT:** implement the full §7.2/§7.3/§7.4 parser. Error paths: `AgentsMdInvalid` with `data.reason ∈ {missing-h2, duplicate-h2, out-of-order-h2, entrypoint-mismatch}`, `AgentsMdImportDepthExceeded`, `AgentsMdImportCycle`. Reload semantics: mid-turn file mutations ignored until turn-end. Validator's 7 probe bodies are ready to wire once AT ships.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**M3 target achievement:** 120 pass at this commit. Target ≥120 MET with 11 real-slip budget remaining (skip count 17 is under the 15+2-new-fixture-deps limit once AT/AE/AU resolve).

**Version impact:** §19.4 minor errata. 1.0.9 → 1.0.10. Additive fixtures + cosmetic correction. No breaking changes.

**Pattern note:** AGENTS.md grammar fixtures are the first multi-scenario fixture bundle that doesn't need crypto signing (unlike L-42 program-md, L-43 dnssec, L-44 jwt-clock-skew). Validator wires all 7 scenarios from pinned Markdown files + an Agent Card base fixture; no generator.mjs required. Reload semantics test is validator-driven (subprocess mutation of the file on disk between turns); spec-side ships only the initial valid state.

### L-46 — Finding AT ship-time fixture alignment: denylist §7.2 compliance + card entrypoint field `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator V-11 wave +8 flips (128/1/12/0 after AT+AP+AQ+AR). Two spec fixtures need alignment with the now-live full §7.2 parser.
- **What:**
  - **Finding AY (spec):** `test-vectors/agents-md-denylist/AGENTS.md` was authored in L-35 before the full §7.2 parser shipped. Its structure had free-form H2s (`## Summary`, `## Inputs`, etc.) that impl's new parser correctly rejects. Cascaded: `SV-REG-04` regressed to FAIL — the new 1-fail on the scoreboard.
  - **Finding AZ (spec):** `test-vectors/conformance-card/agent-card.json` lacks `self_improvement.entrypoint_file`. AT's entrypoint-mismatch check compares `AGENTS.md :: Self-Improvement Policy :: entrypoint:` against Card's `entrypoint_file`; absence silently skips the check (defeats `SV-AGENTS-08`).

**Spec additions:**

1. **`test-vectors/agents-md-denylist/AGENTS.md` (REWRITTEN)** — now §7.2-compliant: `# AGENTS` H1 + 7 required H2s in declared order + `entrypoint: agent.py` under Self-Improvement Policy + existing `## Agent Type Constraints → ### Deny → fs_write_dangerous` preserved. Unblocks SV-REG-04 regression.

2. **`test-vectors/conformance-card/agent-card.json` + three card variants (UPDATED)** — all four cards (base, low-budget, memory-project, precedence-violation) now declare `self_improvement.entrypoint_file: "agent.py"`. Activates AT's entrypoint-mismatch check. The `entrypoint-mismatch` AGENTS.md fixture declares `entrypoint: wrong-entrypoint.py` → real mismatch → `AgentsMdInvalid(entrypoint-mismatch)` fires.

**Must-map:** no assertion changes — existing SV-REG-04 and SV-AGENTS-08 assertions already describe the correct behavior; the fixtures just needed alignment with the live parser.

**Also acknowledged (validator-side calibrations, no spec change):**
- `SV-BOOT-04` revocation payload shape: validator's first pass used `{"revoked_publisher_kid": ...}` + wrong kid (`soa-conformance-test-release-v1.0`); impl reads `.publisher_kid` with the trust-store's actual kid (`soa-test-release-v1.0`). Validator recalibrated.
- `SV-BOOT-04` log code: validator expected nested `code=HostHardeningInsufficient + data`; impl emits `code=bootstrap-revoked` directly. Validator recalibrated. Both are interpretation differences; impl behavior is spec-conformant.

**Outstanding impl findings (V-12 HR routing — specifics pending from validator):**
- `HR-07 / HR-09 / HR-10 / HR-11` all skipped pending impl surface. Validator labeled "agentType runtime enforcement, SI edit pipeline, precedence-guard axis 3". The SI edit pipeline is §9 → M5 scope; may warrant M3→M5 retag on HR-09/HR-10. Awaiting validator's per-test diagnostics before routing vs retagging.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.10 → 1.0.11. Fixture alignment with post-L-45 parser. No breaking changes.

**Pattern note:** L-46 is the first "fixture drift after new normative behavior" bundle. The cascade (L-35 fixture → L-45 parser → L-46 fixture realignment) is expected when test fixtures predate the parser behavior they're meant to exercise. Going forward, any spec change that adds a new parser rule should trigger a sweep of existing fixtures to check §7.2-style compliance.

### L-47 — §14.5.5 admin-scope extension to `/events/recent` for post-crash observation `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator V-9b landed; board at 134/0/24/0 (HR-09/10 also flipped validator-side via internal diff-validator package). SV-STR-10 / Finding AE sharpened diagnostic inline — impl needs crash-event emission + post-relaunch observability surface.
- **What:** §14.1 defines `CrashEvent` as a closed-enum type; §14.5 `/events/recent` serves all 27 types under `sessions:read:<session_id>` scope. Bearers are in-memory per §5.4; a pre-crash session's bearer does NOT survive a process restart. When boot-scan resumes a session with an open bracket (§12), the new process emits `CrashEvent` — but no external observer can read it, because the validating bearer is gone with the old process.
- **Validator's two options:** (a) persist bearers across restarts (heavier ops change), (b) admin-bearer path on `/events/recent` (lighter; matches §14.5.3 backpressure + §10.5.3 audit-records admin pattern). Spec-side decision: Option (b).

**Spec addition:**

1. **§14.5.5 Post-Crash Observation via Admin Scope (NEW normative — M3 addition)** — `/events/recent` accepts EITHER `sessions:read:<session_id>` OR `admin:read` scope:
   - With `sessions:read:<session_id>`: unchanged from §14.5. 120 rpm.
   - With `admin:read`: `session_id` query param OPTIONAL. Returns events across ALL sessions in current process boot, including pre-crash-resumed sessions. Type-filter via `?type=CrashEvent`. 60 rpm.
   - Scope hierarchy: both scopes on same request → treated as admin (broader). Neither → `401 Unauthenticated`.
   - All other §14.5 semantics unchanged: byte-identity excludes `generated_at`; not-a-side-effect; pagination unchanged.

**Must-map updates:**
- `SV-STR-10` section `§14.1` → `§14.1 + §14.5.5`; assertion specifies the kill/restart/poll choreography + admin:read bearer + type=CrashEvent filter.

**Routed to impl (Finding AE):**
- Emit `CrashEvent` StreamEvent from boot-scan's resume-with-open-bracket path (§12 persistence).
- Honor `admin:read` scope on `/events/recent` with the extended semantics (`session_id` optional, 60 rpm cap).

**Validator-side HR-09 + HR-10:** flipped via new `internal/sidiff` pure-function package — no impl or spec dependency. Those are validator-local wins already counted in the 134 board.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.11 → 1.0.12. Additive scope path on existing endpoint + must-map sharpening. No breaking changes (existing sessions:read clients continue to work).

**Pattern note:** §14.5.5 is the third "admin:read extends session:read" observation path (§14.5.3 backpressure is admin-only; §10.5.2/.3 audit is audit:read). The admin-scope pattern is crystallizing as the canonical mechanism for process-global post-crash queries. Future post-crash observation needs should extend along this same axis rather than introducing new endpoints.

**Outstanding:** validator surfaced 14 SV-PERM findings labeled BB..BJ (9 findings across 14 tests — env-hook pattern for BB/BD/BE/BF, endpoint/schema additions for BC/BG/BH/BI/BJ). Full diagnostic sheet pending; routing decisions (impl vs spec env-hook vs spec endpoint) will follow once per-test details arrive.

### L-48 — SV-PERM spec bundle: WORM modeling, handler lifecycle hooks, enrollment + introspection endpoints, retention class, reader tokens `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator delivered 8 of 9 SV-PERM diagnostics (BC/BD/BE/BF/BG/BH/BI/BJ). BB diagnostic still missing — category hint was "escalation-timeout"; inferred to cover SV-PERM-02/03/04 but awaiting validator resurface. AE shipped earlier in same session at eec6ae1 (+15 impl tests).
- **What:** Validator's V-9b SV-PERM bulk wiring surfaced a cluster of spec gaps spanning two major sections (§10.5 audit, §10.6 handler-key management). All routing decisions: ship spec bundle; impl then ships the test-hook + endpoint behaviors against the new spec clauses.

**Spec additions (8 SV-PERM findings covered):**

1. **§10.5.5 WORM Sink Modeling Test Hook (BC — SV-PERM-06/07)** — `RUNNER_AUDIT_SINK_MODE=worm-in-memory` env hook (loopback-guarded per §5.3.3 / §8.4.1 pattern). Model rejects mutation/deletion (`405 ImmutableAuditSink`) and stamps each record with `sink_timestamp` distinct from Runner-internal `timestamp` (|Δ| ≤ 1s normal). Schema extension adds optional `sink_timestamp` field on decision-rows; hash-chain participation matches L-40 `billing_tag`.

2. **§10.5.6 Retention Class Tagging (BI — SV-PERM-16)** — `dfa-365d` vs `standard-90d` enum derived from granted `activeMode` at append time. Schema adds optional `retention_class` enum field. Immutable post-append (WORM).

3. **§10.5.7 Audit-Reader Token Endpoint (BJ — SV-PERM-17)** — `POST /audit/reader-tokens` operator-minted scope-limited bearer carrying only `audit:read:*`. Reader bearer accepted on `/audit/*`; rejected on any write with `{error:bearer-lacks-audit-write-scope}`. Parallels L-47's admin:read scope-hierarchy pattern.

4. **§10.6.2 Handler Key Lifecycle Test Hooks (BD + BE + BF — SV-PERM-08/09/10/14)** — three env hooks following the established loopback-guarded pattern:
   - `SOA_HANDLER_ENROLLED_AT=<RFC 3339>` — paired with `RUNNER_TEST_CLOCK` exercises 90-day rotation boundary (SV-PERM-08).
   - `SOA_HANDLER_KEYPAIR_OVERLAP_DIR=<dir>` — multi-kid directory with per-key manifests for 24h rotation overlap (SV-PERM-10).
   - `RUNNER_HANDLER_CRL_POLL_TICK_MS=<ms>` — extends existing §5.3.3 revocation-file watcher to accept `{handler_kid, ...}` entries in addition to `{publisher_kid, ...}` (SV-PERM-09). CRL refresh emits `/logs/system/recent` code=`crl-refresh-complete` with `data.last_crl_refresh_at` (SV-PERM-14 observability).

5. **§10.6.3 Handler Enrollment Endpoint (BG — SV-PERM-12)** — `POST /handlers/enroll` normative operator-bearer endpoint. 201 on clean enroll, 409 `HandlerKidConflict` on duplicate, 400 `AlgorithmRejected` for forbidden algos (RS256, RSA<3072).

6. **§10.6.4 Key-Storage Introspection (BH — SV-PERM-13)** — `GET /security/key-storage` operator-bearer OR admin:read. Returns `{storage_mode, private_keys_on_disk, provider, attestation_format}`. Conformance requires `private_keys_on_disk === false` + `storage_mode != "ephemeral"`.

7. **§10.6.5 Retroactive SuspectDecision Flagging (BE — SV-PERM-15)** — WORM-compatible mechanism: on kid revocation, Runner appends new admin-rows with `decision: SuspectDecision`, `referenced_audit_id: <original>`, `reason: kid-revoked-24h-window`. Schema adds `SuspectDecision` to the `decision` enum + a third `oneOf` branch requiring `referenced_audit_id`.

8. **`test-vectors/handler-keypair-overlap/` (NEW fixture)** — two Ed25519 keypairs with pinned overlap window (`2026-04-22T00:00:00Z → 2026-04-23T00:00:00Z`, 24h). Deterministic `generate.mjs` derives keys from 32-byte seeds via PKCS#8 wrapping; PureEdDSA canonicality → byte-identical regeneration. Fixture powers SV-PERM-10.

**Must-map updates:** all 8 assertions (SV-PERM-06/07/08/09/10/12/13/14/15/16/17) sharpened to reference new sections + env hooks + fixture paths.

**Schema additions (`audit-records-response.schema.json`):**
- `decision` enum grows 9 → 10 (adds `SuspectDecision`).
- Third `oneOf` branch for `SuspectDecision` admin-row requiring `referenced_audit_id`.
- Optional `sink_timestamp`, `retention_class`, `referenced_audit_id` fields.
- All additions backwards-compatible with existing records.

**Impl routing:** after pin-bump, impl ships:
- `RUNNER_AUDIT_SINK_MODE=worm-in-memory` + `PUT`/`DELETE /audit/records/<id>` 405 paths + `sink_timestamp` stamping
- `retention_class` derivation at append-time from session's granted activeMode
- `POST /audit/reader-tokens` + reader bearer scope enforcement
- Three §10.6.2 env hooks + watcher extension to handler_kid
- `POST /handlers/enroll` + conflict/algo rejection
- `GET /security/key-storage`
- §10.6.5 SuspectDecision append-on-revocation

**Outstanding:**
- **Finding BB:** category labeled "escalation-timeout"; diagnostic text missing from paste. Likely covers SV-PERM-02/03/04. Awaiting validator resurface before routing.
- **Ops issue:** validator flagged `:7700` is running `agents-md-denylist/tools-with-denied.json` fixture instead of the conformance tools fixture, causing 9 tests to 404 on "unknown-tool" (SV-REG-02, SV-PERM-01, SV-BUD-05, SV-STR-06/07, SV-SESS-BOOT-01, SV-PERM-20/21/22). Not a validator regression; impl-operator needs to rebind `:7700` with the conformance fixture to restore the 134 baseline before counting L-48 flips.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.12 → 1.0.13. Largest single spec bundle of M3 — three new §10.5 subsections + four new §10.6 subsections + 4 schema extensions + 1 new fixture set. All additive (backwards-compatible).

**Pattern note:** L-48 is the first bundle adding first-class runtime endpoints (not just env hooks + schemas). `/audit/reader-tokens`, `/handlers/enroll`, `/security/key-storage` are all new operator-bearer surfaces following the existing `/docs/*`, `/release-gate.json`, `/errata/v1.0.json` pattern from T-12. Operator-bearer is crystallizing as the canonical "runtime enrollment / administrative mint" scope alongside session-scope (read-write), admin:read (read-only cross-session), and audit:read (read-only audit). Future §10.x runtime surfaces should adopt the same scope taxonomy.

### L-49 — Finding BB: §10.4 escalation state-machine + test hooks `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator resurfaced the missing BB diagnostic with full detail after L-48 landed. BB covers SV-PERM-03 (Autonomous escalation timeout) + SV-PERM-04 (HITL-required rejection of Autonomous/Coordinator). Two tests; lines up with the escalation state-machine §10.4 already references in one prose bullet but never formalizes.
- **What:** §10.4 says "Autonomous handlers MUST escalate to an Interactive or Coordinator handler. If none is reachable within 30 seconds the action MUST be denied." The prose was normative but left the state-machine implicit, the 30s timeout testability ambiguous, and the Coordinator-insufficient-for-HITL case unstated. Validator couldn't deterministically probe escalation without (a) sub-second timeout override, (b) a test-only responder injection path, (c) normative explicit rejection detail for Autonomous/Coordinator on HITL-gated actions.

**Spec additions:**

1. **§10.4 extended (existing prose tightened, L-49)** — Coordinator/Autonomous signature explicitly does NOT satisfy HITL for high-risk decisions; rejection shape defined (`hitl-required` + `autonomous-insufficient`/`coordinator-insufficient` detail). Also tightened: tools with `risk_class ∈ {Mutating, DangerFullAccess}` trigger escalation when signer is `Autonomous`.

2. **§10.4.1 Escalation State-Machine (NEW normative)** — 6-step state machine:
   1. Block decision.
   2. Emit `PermissionPrompt` with `handler: Interactive`.
   3. Await Interactive responder.
   4. On timeout → `403 {reason: escalation-timeout}` + audit `handler:Autonomous, decision:Deny`.
   5. On Interactive approval → process normally with Interactive as audit handler.
   6. On Interactive denial → `403 {reason: hitl-denied}` + audit `handler:Interactive, decision:Deny`.
   
   Coordinator-signed Prompt on HITL-gated action bypasses escalation and directly rejects with `coordinator-insufficient` (escalation-to-Interactive applies only from Autonomous).

3. **§10.4.2 Escalation Test Hooks (NEW normative, testability)** — two env hooks following the §5.3.3 / §8.4.1 / §10.6.2 loopback-guarded pattern:
   - `RUNNER_HANDLER_ESCALATION_TIMEOUT_MS=<ms>` — overrides §10.4 30-second timeout (default 30000). Validators set 500ms for sub-second test cadence.
   - `SOA_HANDLER_ESCALATION_RESPONDER=<file-path>` — test-only file the Runner watches for JSON responder injections `{kid, response ∈ {approve, deny, silence}}`. Truncate-after-ingest per §11.3.1 dynamic-tool-registration pattern. Responder `kid` bound to Autonomous/Coordinator role rejected with `hitl-required` (an Autonomous responder cannot forge Interactive satisfaction).

**Must-map updates:**
- `SV-PERM-03` section `§10.4` → `§10.4 + §10.4.1 + §10.4.2`; assertion specifies env-hook configuration + probe choreography + exact reject shape.
- `SV-PERM-04` section `§10.4, §19.6` → `§10.4 + §10.4.1 + §10.4.2 + §19.6`; assertion specifies responder-based Autonomous-insufficient probe + Coordinator variant.

**Impl routing (Finding BB):**
- Implement §10.4.1 6-step state machine at the decision-resolver boundary.
- Honor `RUNNER_HANDLER_ESCALATION_TIMEOUT_MS` + `SOA_HANDLER_ESCALATION_RESPONDER` per §10.4.2, loopback-guarded.
- Ship Coordinator-insufficient / Autonomous-insufficient rejection shapes per §10.4 tightened prose.
- Responder-kid role check (reject Autonomous/Coordinator responder with `hitl-required`).

**Trajectory correction (validator noted):** earlier projection attributed SV-PERM-02 to BB; actually covered by Finding AW (precedence-guard axis 3, same surface as HR-11). Corrected attribution:
- AE → SV-STR-10 (+1)
- AV → HR-07 (+1)
- AW → SV-PERM-02 + HR-11 (+2)
- BA → SV-AGENTS-08 (+1)
- BB → SV-PERM-03 + SV-PERM-04 (+2)
- L-48 set (BC/BD/BE/BF/BG/BH/BI/BJ) → SV-PERM-06/07/08/09/10/12/13/14/15/16/17 (+11)

Total impl-pending after L-48 + L-49 ships: +18 flips from current 134 → 152 ceiling (before ops-fix restoration of 9 tests hidden by wrong-fixture binding).

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**Version impact:** §19.4 minor errata. 1.0.13 → 1.0.14. Additive (§10.4 extended prose is a tightening of existing normative language — "Coordinator/Autonomous does NOT satisfy HITL" was implicit in the existing "Human-in-the-Loop is satisfied only when an Interactive handler signs"; L-49 makes it explicit with reject shapes). §10.4.1 + §10.4.2 purely additive.

**Ops issue reminder:** impl still running wrong tools fixture on `:7700` (agents-md-denylist/tools-with-denied.json instead of conformance tools fixture). Rebind is pending from the L-48 paste. 9 tests stuck in 404 "unknown-tool" until rebind completes; they're not real regressions.

### L-50 — Post-L-48/L-49 wire-up findings: role field on enrollment + impl asks `[normative, in-spec @ <this-commit>]`

- **Surfaced:** 2026-04-22 · validator wrote the real probe bodies against live L-47/L-48/L-49 surfaces and polled :7700. 🎯 **134 → 147 (+13 clean flips)**. Three remaining impl-gap findings during wire-up:
  - **BB-ext (spec+impl):** the conformance handler default kid is hardcoded `role:"Interactive"`; validator has no way to submit an Autonomous-signed PDA to trigger §10.4.1 escalation. Needs either `role` field on POST /handlers/enroll OR a `SOA_HANDLER_DEFAULT_ROLE` env hook.
  - **BE-ext (pure impl):** §10.6.2 CRL refresh observability normatively requires `/logs/system/recent` records with `code=crl-refresh-complete` + `data.last_crl_refresh_at`. Impl shipped poll tick + revocation watcher but not the observability emission.
  - **BI-impl (pure impl):** §10.5.6 retention_class derivation clause shipped spec-side, but impl's audit-row builder isn't populating the field from session's granted activeMode.

**Spec addition (BB-ext):**

1. **§10.6.3 extended — `role` field on POST /handlers/enroll** — REQUIRED field carrying one of `{Interactive, Coordinator, Autonomous}` per §10.4 handler-role taxonomy. Binds the kid to the role that governs §10.4.1 escalation triggers. Unknown role → `400 {error:"RoleRejected", detail:"role not in {...}"}`. Response body echoes `role` on 201.

**Routed to impl (no spec change):**
- **BE-ext (SV-PERM-14):** wire `/logs/system/recent` emission on each CRL refresh tick. Record shape: `category=Config, level=info, code=crl-refresh-complete, data.last_crl_refresh_at=<RFC 3339>`. Already specified in §10.6.2; impl just needs to thread the emission into the poll loop.
- **BI-impl (SV-PERM-16):** wire audit-row builder to derive `retention_class` from session's granted `activeMode` per §10.5.6: `DangerFullAccess → "dfa-365d"`, else `→ "standard-90d"`.

**Impl picks one for BB-ext:** the spec extension to §10.6.3 makes `role` part of the normative enrollment surface. Validator enrolls an Autonomous handler via `POST /handlers/enroll {kid, spki, algo, issued_at, role:"Autonomous"}` and uses that kid to sign the triggering PDA for SV-PERM-03/04. Cleaner than an env-var workaround — role is a first-class handler property.

**Must-map updates:**
- `SV-PERM-12` assertion extended: fresh enroll body includes `role`; response echoes `role`; unknown role → `RoleRejected`.

**Milestone tally:** unchanged. 135 M3 · 12 M4 · 60 M5 · 22 M2 · 1 M1.

**M3 exit projection refined:**
- Current: 147/0/11/0
- + BB-ext impl: +2 (SV-PERM-03/04)
- + BE-ext impl: +1 (SV-PERM-14)
- + BI-impl: +1 (SV-PERM-16)
- + AE (SV-STR-10) full crash harness: +1
- = **152/0/6/0 projected exit**

Remaining 6 skips are legit deferrals (4 M4 retags + 1 pre-budgeted + 1 platform-gated). M3 closes cleanly well above the ≥120 target.

**Version impact:** §19.4 minor errata. 1.0.14 → 1.0.15. Additive `role` REQUIRED on /handlers/enroll. Strictly speaking this adds a required field which MIGHT appear to be a breaking change — but /handlers/enroll is brand-new in L-48 (1.0.13), shipped this same day, no deployed consumers yet. Safe to extend its shape before any consumer lands. Could alternatively have made `role` OPTIONAL with default `Interactive`; chose REQUIRED for safety (operators MUST explicitly declare role, not get Interactive by default which could hide Autonomous misuse).

**Pattern note:** L-50 captures the pattern where impl ships the shape of a spec clause but misses a side-effect the clause implies. §10.5.6 retention_class "derivation rule" is the schema contract; impl shipped the schema but not the population. §10.6.2 CRL refresh is the schedule + semantic; impl shipped the scheduler but not the observability emission. Both are caught cleanly by validator's real probes hitting live endpoints — the "skip → fail → finding" transition only works when probes actually execute against live impl.

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
