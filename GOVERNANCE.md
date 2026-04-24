# SOA-Harness Governance

**Status as of 2026-04-23: single-maintainer project; v1.0.0 shipped.** This document exists to state that plainly rather than hide behind a "working group" facade.

## Current state

The SOA-Harness specification, reference implementation, and conformance validator are authored and maintained by a single person (`wleeb1010`). Internal text references to "SOA-WG" or `soa-harness.org` describe an **aspirational working group and governance authority that does not yet exist as a formal organization**. Any "SOA-WG" decision cited in the spec is, today, a decision by the current maintainer.

This is honest positioning. Some specs of this scope have been shipped by a single engineer for months before forming a working group (WebAuthn started similarly inside FIDO). We are at that stage.

## Why this matters for adopters

- The spec is well-engineered but its governance is not battle-tested. Treat it as a **draft reference architecture** rather than a ratified industry standard.
- Normative text can change between minor releases without a multi-party review cycle. The `soa-validate.lock` pinning protocol in downstream implementations protects adopters from silent drift.
- There is no formal process yet for disputing a normative decision. Open a GitHub issue; the current maintainer will respond. That is the process until a working group forms.

## Approval rule (interim)

All PRs to the spec repo require:
- **Normative changes** (Markdown spec body, `schemas/`, `test-vectors/`, must-map entries): one approval from the current maintainer + a 48-hour discussion window on the PR for non-trivial changes
- **Non-normative changes** (README, governance docs, tooling scripts): one approval, no waiting window
- **Crypto-sensitive changes** (anything affecting JWS/JCS, hash chains, audit-chain integrity, trust bootstrap): flagged in the PR title with `[CRYPTO]`, requires the 48-hour window regardless of change size

When the second maintainer lands, this rule upgrades to two-of-two approvals for normative changes.

## Path to multi-maintainer

The project explicitly wants to grow to a working group with ≥ 3 maintainers from independent organizations. The prerequisites for that transition:

1. **At least one external reference implementation passes bake-off** (see `soa-validate` repo for the bake-off protocol)
2. **At least one external adopter ships against the spec** and reports concrete implementer feedback
3. **An independent cryptographic review** of the reference implementation's signing paths (scheduled for M9 SelfOptimizer sandbox review; broader signing-path review TBD)

Once all three are met, the current maintainer will:
- Rename "SOA-WG" references in the spec from aspirational to actual
- Register `soa-harness.org` under a foundation (candidates: CNCF sandbox, OpenJS Foundation, Linux Foundation)
- Publish a formal charter defining voting rules, release cadence, and IPR policy

## What "conformance" means today

Two tiers, per the plan in `~/.claude/plans/`:

- **"SOA-Harness v1.0 Reference Implementation"** — self-assigned by implementations that pass the full 420-test `soa-validate` suite (234 Core + 186 UI) against a pinned spec commit. The reference impl + validator shipped at v1.0.0 claim this label.
- **"SOA-Harness v1.0 Bake-Off Verified"** — requires a second-party implementation whose `soa-validate` output converges to zero divergence. This is the label adopters should demand before relying on a conformance claim.

Until a second implementation exists, no "Bake-Off Verified" claims can be published.

## Reporting security issues

Report privately via GitHub Security Advisories on the affected repo. Per `docs/m7/v1.0-lts-branch-policy.md`:

| Severity | Acknowledge within | Patch released within |
|---|---|---|
| Critical (RCE / auth bypass / data exfil / data loss) | 48 hours | 5 business days |
| High (compliance divergence / severe UX regression) | 7 calendar days | 14 calendar days |
| Medium (doc or metadata correctness) | 30 calendar days | Next scheduled patch |

Critical patches ship on the `v1.0-lts` branch as v1.0.Z editorial releases and are cherry-picked forward to `main` if applicable.

## Contributors

This document will be updated as new maintainers join. For now:

- `wleeb1010` — spec author, reference implementation lead, conformance validator lead (acknowledgment of concentration risk is implicit; mitigation tracks: M9 external sandbox review + v1.0-lts 48h security SLA + adopter-concierge program for real-world feedback)

## Adopter-concierge program

The project actively recruits 1-2 pilot organizations for non-production integration during M7-M11 in exchange for weekly support and roadmap influence. See `docs/m7/adopter-concierge-program.md` for eligibility and onboarding.

## License

- Spec text (Markdown files, JSON schemas, test vectors): **CC BY 4.0** (planned; LICENSE to be added)
- Reference tooling code (`.mjs` scripts): **Apache 2.0** (planned; LICENSE to be added)

Neither license is currently in the repo. Adding them is tracked as an immediate open item.
