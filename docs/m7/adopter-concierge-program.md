# Adopter Concierge Program — Pre-M7

M7 prerequisite (L-61). Identifies and onboards 1-2 pilot organizations willing to integrate SOA-Harness in a non-production environment during M7-M10 in exchange for weekly support and early influence on the roadmap.

## Why this exists

The critic finding on the M7+ roadmap was clear: without real adopters, the "full-featured production-deployable" claim is self-assessed. The spec + impl + validator team cannot verify the claim against its own work — that's what "Reference Implementation" vs "Bake-Off Verified" captures. We need adopters to:
- Validate the scaffold + docs are actually onboardable
- Surface real-world bugs the 420-test suite doesn't catch
- Inform Gateway design decisions (M10) with actual OAuth provider experience
- Serve as a staging ground for SelfOptimizer rollout (M9)

Without adopters, M11's "Full Featured" tag risks being an unverified claim.

## Target profile

A pilot organization is a good fit if they meet 3+ of these criteria:

- **Building agents already** — LangChain, CrewAI, custom Python/TS — and frustrated with missing audit/permission guarantees
- **Security/compliance team** that cares about signed artifacts and audit trails
- **Team of 2-6 engineers** — small enough to move fast, big enough to provide real feedback
- **Not a public-facing SaaS** (too risky for pilot) — internal tools, B2B platforms, research systems
- **Willing to run non-production workloads on v1.0+** for 3-6 months
- **Can spare 2 hours/week** for sync + bug triage with the maintainer

## What we offer

- Direct maintainer access (Slack / GitHub Discussions / scheduled call)
- Priority on bugs blocking their use case (within the 48h LTS SLA)
- Influence on M7-M11 roadmap prioritization
- Early access to pre-release RC builds
- Credit in `GOVERNANCE.md` as a "Design Partner" (if they want it)

## What we ask

- **Honest feedback** — no politeness about rough edges
- **Bug reports with repros** on GitHub issues
- **One write-up** at M11 close: "What we built, what worked, what didn't"
- **Optional:** permission to cite them as a reference adopter

## What we do NOT ask

- Paying anything
- Running in production (pilot = non-prod only)
- Committing to long-term use past M11
- Writing spec text themselves

## Recruitment channels

- Post to Hacker News "Show HN" when v1.0.0 GitHub releases land (already done)
- Reach out to known agent-framework users in operator's network
- Post to Reddit `r/LocalLLaMA`, `r/MachineLearning`, `r/ExperiencedDevs`
- Direct-message LangChain / LlamaIndex / CrewAI discord users who have posted about auth/audit concerns
- LinkedIn post + X/Twitter from operator's personal accounts

## Pilot onboarding

Once identified, onboard each pilot through:

1. **Intro call** (30 min) — what they're building, what they need, expectations
2. **Scaffold walkthrough** (45 min) — `npx create-soa-agent`, swap in their Agent Card, wire their LLM
3. **Integration check-in** (1h, week 1) — did it work? what's blocking?
4. **Weekly 30-min sync** through M11 close (can drop to bi-weekly once stable)
5. **M11 retrospective** (1h) — capture the "what worked, what didn't" writeup

## Pilot count target

**Minimum: 1 pilot by end of M7 (week 8).** If zero pilots by then, re-scope v1.5.0 "Full Featured" claim to "Research Preview" and lower expectations.

**Aspirational: 2 pilots by end of M7, 1 additional by end of M9.** More than 3 and maintainer capacity collapses; cap at 3.

## Running tally

Updated as pilots sign up:

```
Pilot 1: [TBD]
Pilot 2: [TBD]
```

## Bake-Off partner — separate from concierge

"Bake-Off Verified" requires a 2nd-party reimplementation — a DIFFERENT team, not a pilot adopter. A pilot adopter uses the reference impl. A Bake-Off partner writes a clean-room implementation of the spec and runs `soa-validate` against it. Different relationship, different time commitment (~16 weeks of engineering from the partner side).

If a pilot adopter ALSO wants to do a Bake-Off, that's fine — but the two roles are separable.

## References

- L-61 in `IMPLEMENTATION_LESSONS.md` — parent milestone record
- `docs/m6/release-day-runbook.md` — what was shipped
- `RELEASE-NOTES.md` — v1.0.0 adopter narrative (the pitch to pilots)
- `docs/m7/v1.0-lts-branch-policy.md` — what we commit to pilots on v1.0.x support
