---
sidebar_position: 4
---

# Conformance Tiers

SOA-Harness defines two conformance labels. Knowing which one you can legitimately claim matters — adopters should demand the second one before making production-critical claims about interop.

## Tier 1: Reference Implementation

**Who can claim it:** any implementation that passes the full `soa-validate` suite for a chosen profile against a pinned spec commit.

**How to claim it:**

1. Pin your implementation to a specific spec commit via `soa-validate.lock` (tracking that file in VCS is mandatory).
2. Run the validator:
   ```bash
   soa-validate --impl-url http://your-runner:port \
                --spec-vectors /path/to/spec \
                --profile core \
                --out release-gate.json
   ```
3. Attach `release-gate.json` to your release artifacts. Report `pass` / `fail` / `skip` / `error` counts in your release notes alongside the pinned spec SHA.
4. State plainly that this is a **Reference Implementation** claim, self-assigned.

**What it means in practice:**

The reference `@soa-harness/runner` implementation claims this label. It's a useful baseline — adopters can compare their impl's `release-gate.json` line-by-line against the reference's to find divergences.

It does NOT mean "my implementation is interoperable with yours." For that, see Tier 2.

## Tier 2: Bake-Off Verified

**Who can claim it:** implementations that have passed a two-party bake-off where both parties' `soa-validate` output converges to zero divergence on the same profile.

**How to claim it:**

1. Pair with a second-party implementation that is not genetically descended from yours (a fork of the reference impl doesn't count — you need independent derivation from the spec).
2. Pick a common `--profile` and a common pinned spec commit.
3. Both parties run `soa-validate` against their own Runners. The resulting `release-gate.json` files are compared.
4. Every must-map entry that both parties claim to implement MUST produce the same pass/fail classification. Zero divergence on the intersection. Gaps (one side implements a test the other skips) are acceptable; mismatches (one passes, the other fails) are not.
5. Publish the comparison artifacts publicly.

**Why this tier matters:**

The spec is well-engineered but the governance is not battle-tested (see `GOVERNANCE.md`). Normative ambiguities are real — a single-maintainer spec can be under-specified in ways the maintainer doesn't notice. A bake-off surfaces those ambiguities by making two independent implementers argue about the wire format.

**Current status (v1.1):**

Per the 2026-04-23 solo-operation decision, Bake-Off Verified is **not actively pursued**. No second-party implementation exists. No adopter should make a Bake-Off Verified claim as of v1.1 because the tier is definitionally unreachable without a second-party.

If a second-party implementation emerges organically and passes zero-divergence, the tier becomes claimable. Until then, all v1.1 releases should carry Reference Implementation language only.

## Profiles

| Profile | Scope | Test count |
|---|---|---|
| `core` | Base mandatory functionality: trust, card, permissions, audit, sessions, streaming, budget, dispatcher | ~170 |
| `core+si` | Core + self-improvement layer (§9 + §23) | ~220 |
| `core+handoff` | Core + A2A wire protocol (§17) | ~185 |
| `full` | Everything | ~240 |

Most adopters start at `core` — self-improvement and A2A are additive opt-ins, not prerequisites.

## What adopters should look for

When evaluating someone else's claim of conformance:

1. **Read their `release-gate.json`** — not their marketing. Pass/fail counts tell you more than a checkmark on a page.
2. **Check the pin** — is the `spec_commit_sha` in their `soa-validate.lock` one you recognize as a shipped release commit? Silent forks with custom spec changes are a red flag.
3. **Re-run the validator yourself** — against their Runner. If the numbers don't match what they published, you've found the ambiguity.
4. **Look for a Bake-Off report**. If one exists, read it; if none exists, treat the claim as self-assigned Reference Implementation grade at best.

## References

- `GOVERNANCE.md` in the spec repo — single-maintainer framing + SLA
- `docs/m7/organic-adopter-support.md` — support model for adopters who find the project organically
- `docs/errata-policy.md` — editorial vs minor vs major change decision tree
