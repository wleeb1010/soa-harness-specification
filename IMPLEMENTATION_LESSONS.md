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
