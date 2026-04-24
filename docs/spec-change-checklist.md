# Spec Change Checklist

Every normative edit to the SOA-Harness specification MUST pass this gate before landing on `main`. The cost of a one-sentence sanity check is always lower than the cost of discovering a flaw during validator or implementation work — where the fix cascades across three repos, a signed MANIFEST, and potentially a published npm package.

L-64 Debt #7 (release-ceremony-order flaw that shipped with v1.1.0 and required a same-day v1.1.1 patch) was the specific failure that prompted this checklist.

## When this applies

**Always:**
- Any new `§N.M` section in the Core spec or UI Integration Profile.
- Any change to a `MUST` / `MUST NOT` / `SHALL` clause.
- Any new or modified schema under `schemas/`.
- Any new `SV-*` or `UV-*` test ID, or any change to `soa-validate-must-map.json` / `ui-validate-must-map.json`.
- Any new error code added to `§24 Error Code Taxonomy`.

**Optional:**
- Editorial-class changes (typos, link fixes, wording clarifications with no normative shift).
- `CHANGELOG.md` / `RELEASE-NOTES-*.md` updates that only describe already-landed work.
- Internal documentation files (`docs/`, `IMPLEMENTATION_LESSONS.md`) that don't change the normative surface.

When in doubt, run the gate. It takes ~2 minutes.

## The gate

Run the `plan-evaluator` skill (or equivalent first-principles review) against the draft BEFORE `git commit`. The evaluator MUST return findings in four categories:

1. **Assumptions surfaced** — what the draft takes for granted.
2. **Core truths** — hard constraints any implementation of the draft must satisfy.
3. **Stress test findings** — errors, contradictions, unsupported leaps, missing steps, redundancies, verification gaps.
4. **Structural challenges** — reordering, combining, eliminating, or re-prioritizing sections.

## Acting on findings

- **Critical findings** — fix before landing. These are errors, contradictions, or missing steps that would surface as bugs in the validator or the reference implementation.
- **Moderate findings** — fix if cheap (one-line clarification, a missing sentence). Otherwise file as a follow-up commit against the same PR before merge.
- **Minor findings** — record in the commit message or the associated `L-NN` entry in `IMPLEMENTATION_LESSONS.md`. Address in a follow-up editorial pass if the count gets noisy.

## What to include in the commit

The commit that lands a normative change MUST:

1. Cite the evaluator pass ran against the draft (even one line — `plan-evaluator pass: verdict "targeted fixes", 3 findings addressed inline`).
2. List any Critical or Moderate findings addressed, with the specific fix.
3. Note any deferred findings that land as follow-up commits.

Example:

```
M8 W1: spec §16.6 Streaming Dispatcher (normative)

plan-evaluator pass: 1 critical (SV-LLM-09 untestable with current
test-double — added env-flag plumbing to the gate); 2 moderate
(reverse-proxy chunked-encoding note; client-disconnect cleanup
normative hook) addressed inline. Minor findings (6) filed as L-67.

[...]
```

## Why this is a hard gate, not a soft suggestion

The SOA-Harness ecosystem is a **three-repo independent-judge architecture**: spec changes propagate to `soa-harness-impl` via `soa-validate.lock` pin-bumps AND to `soa-validate` via a matching pin-bump. Every spec edit that lands un-sanity-checked is a cost multiplier:

- If the validator author finds the flaw first, the spec needs an errata + lock-bump + impl PR + validator PR.
- If an adopter finds the flaw first, the cost is shipped-public — errata documentation + potential conformance-label adjustments + adopter-facing comms.
- Running plan-evaluator upfront catches these for the price of a subagent round-trip.

v1.1.0 → v1.1.1 same-day patch (L-65) is the concrete evidence: a 2-minute evaluator pass on the v1.1.0 release plan would have flagged "the release script publishes npm BEFORE the lock pin bump; PINNED_SPEC_COMMIT will drift". Instead the adopter-facing friction took a full second ceremony to fix.

## Integration with `CLAUDE.md`

This checklist is referenced from the project-level `CLAUDE.md`. Future Claude sessions editing the spec will see the instruction to run plan-evaluator before committing normative changes. Do not rely on memory or ad-hoc judgment — invoke the gate.
