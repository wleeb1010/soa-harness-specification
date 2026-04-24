# Organic Adopter Support Policy

M7 Pre-kickoff (L-61 revised). Replaces the prior "adopter-concierge program" — the project has chosen solo-only operation with no actively recruited pilots. This document defines the reactive support model for adopters who find the project organically.

## Why this exists

SOA-Harness ships publicly at v1.0.0. Adopters will find it through GitHub, npm, Hacker News, search engines. When they do, they deserve a predictable support contract. This document is that contract.

## What adopters can count on

### Response times

Per `docs/m7/v1.0-lts-branch-policy.md`:

| Severity | Acknowledgment | Patch target |
|---|---|---|
| CRITICAL (security / data loss / RCE / auth bypass) | **48 hours** | **5 business days** |
| HIGH (compliance divergence / severe UX regression) | 7 calendar days | 14 calendar days |
| MEDIUM (doc / metadata correctness) | 30 calendar days | Next scheduled patch |

These apply regardless of whether the adopter is "known" to the maintainer.

### Channels

- **GitHub Issues** on the affected repo (spec / impl / validate) — primary surface
- **GitHub Security Advisories** (private) — for CRITICAL security issues
- **GitHub Discussions** — questions that aren't bugs
- **No private Slack / no paid support / no direct messages** — everything happens in the open so other adopters benefit

### Issue quality expectations

Adopters get better response if their report includes:
- Version installed (`npm ls @soa-harness/runner`, or `soa-validate --version`)
- Platform (OS, Node version, Go version for validator)
- Minimal reproduction steps
- Expected vs actual behavior

Lower-quality reports still get a response — just slower and usually with a "please add X" follow-up.

## What adopters DO NOT get

- **Proactive outreach** — no weekly syncs, no scheduled calls, no design-partner status
- **Custom feature development** — feature requests land in `GitHub Discussions`; the maintainer prioritizes based on alignment with the roadmap, not individual asks
- **Private bugfixes** — all fixes are public via the `v1.0-lts` or `main` branches
- **Commercial support** — there is no paid tier; the project is not monetized

## What the maintainer does weekly

- Review GitHub issues + discussions across all 3 repos (~30-60 min)
- Triage bugs to `v1.0-lts` (editorial), `main` (queued for next minor), or `won't-fix` (with rationale)
- Monthly: post a "state of SOA-Harness" discussion note summarizing M7+ progress
- Respond to CRITICAL reports within the 48h SLA window

## Discovery / evangelism

The project does NOT run:
- Bug bounties (low value without external contributors)
- Conference sponsorships
- Paid SEO
- Influencer outreach

The project DOES:
- Keep README + RELEASE-NOTES honest and up-to-date
- Maintain a public roadmap (this file + L-entries in IMPLEMENTATION_LESSONS.md)
- Publish clear install instructions and getting-started content
- Ship docs on the `docs-site` as part of M7

Adopters find the project through those surfaces or don't find it. That's the deal.

## What changes if an organic adopter emerges

If an organic adopter shows up and provides good feedback:
- Their bugs get the stated SLA
- Their feature requests compete on merit with the roadmap
- The maintainer may offer an informal sync (GitHub Discussions thread) to work through complex integration

But "pilot status" is not something that's granted — there's no pre-arranged slot.

## Bake-Off Verified label

The "Bake-Off Verified" conformance tier (defined in `GOVERNANCE.md`) requires a 2nd-party independent reimplementation. Per the 2026-04-23 solo-operation decision, this tier is **not actively pursued**. It remains defined in case a 2nd-party ever voluntarily undertakes the work. Until then, all releases carry the "Reference Implementation" label only.

## References

- `docs/m7/v1.0-lts-branch-policy.md` — LTS branch + SLA details
- `GOVERNANCE.md` — maintainer identity + single-maintainer framing
- `docs/errata-policy.md` — change-classification decision tree
- L-61 in `IMPLEMENTATION_LESSONS.md` — solo-operation revision record
