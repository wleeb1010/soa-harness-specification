# npm Org Audit — `@soa-harness`

M6 Phase 0b (L-60). User-driven checklist. Target completion by day 2 of Phase 0.

## Goal

Before v1.0.0 publishes 8 packages under `@soa-harness`, verify the npm org is in a clean state: every member has 2FA enforced, publish permissions align to the release-gate reviewer set, and no stale tokens are floating around.

## Step 1 — Log in to npmjs.com

Use the account that owns `@soa-harness`. Confirm via browser:

- URL bar shows `https://www.npmjs.com/~<your-username>`
- `@soa-harness` appears under "Organizations" in your user menu

If you cannot reach the org from this account, **STOP**. Recover the owner account first; do not proceed.

## Step 2 — List every member + role

Navigate to: `https://www.npmjs.com/settings/soa-harness/members`

Record each entry as `username — role (owner|admin|developer)` in a scratch file. Do NOT commit this scratch file.

For v1.0.0, acceptable roster states:
- 1 owner (you)
- 0 other members — simplest, zero drift risk
- OR 1 owner + 1 admin (trusted co-maintainer) — acceptable if co-maintainer identity is known and 2FA-verified
- Any other state: reconcile before proceeding

Remove any unexpected members immediately.

## Step 3 — Verify 2FA on every member

Navigate to: `https://www.npmjs.com/settings/soa-harness/members` — each row shows a 2FA indicator.

For each member:
- [ ] 2FA status: enabled
- [ ] 2FA method: authenticator app (OTP) — WebAuthn preferred where available

If any member has 2FA disabled: remove them from the org OR require they enable 2FA before remaining. Do not publish to an org with a non-2FA member.

## Step 4 — Enforce org-wide 2FA requirement

Navigate to: `https://www.npmjs.com/settings/soa-harness/security`

- [ ] "Require 2FA for members" — enabled
- [ ] "Require 2FA for publish" — enabled

If already enabled, good. If not, enable now. Note that enabling after the fact does NOT retroactively lock out non-2FA members — Step 3 is still required.

## Step 5 — Audit existing access tokens

Navigate to: `https://www.npmjs.com/settings/<your-username>/tokens`

For each token:
- [ ] Purpose is known and current
- [ ] Scope is as narrow as possible (`publish` only, not `read and write`)
- [ ] Created date is recent OR tied to a still-active automation

Revoke:
- Any token whose purpose you cannot recall
- Any "classic" token (prefer granular tokens for v1.0.0 publishes)
- Any token created > 90 days ago unless tied to active CI

For M6 release-day publish, you will create a **fresh granular token** Day 18 (Phase 3a), scoped to publish on `@soa-harness/*`, with an expiration matching the 72-hour monitoring window. Token gets revoked after release.

## Step 6 — Snapshot the state

Create a dated snapshot for the record. This is the archive of "what the org looked like when we shipped v1.0.0":

```
docs/m6/archive/npm-org-snapshot-2026-04-XX.md
```

Contents:
- Date + your signature
- Member list (usernames + roles, no PII)
- 2FA status per member
- Active tokens count (not contents)
- Security settings screenshot (optional, local only — don't commit screenshots of settings pages)

Commit the markdown file. It becomes part of the release provenance.

## Step 7 — Package ownership on npm

For each of the 8 packages (after they are first published, or as a pre-check if already published):

```
https://www.npmjs.com/package/@soa-harness/<package>/access
```

- [ ] Owner: your username (or the org)
- [ ] No unexpected maintainers

The 8 packages:
1. `@soa-harness/schemas`
2. `@soa-harness/core`
3. `@soa-harness/runner`
4. `@soa-harness/memory-mcp-sqlite`
5. `@soa-harness/memory-mcp-mem0`
6. `@soa-harness/memory-mcp-zep`
7. `@soa-harness/langgraph-adapter`
8. `create-soa-agent`

## Red flags that block Phase 0 exit

- Any member you don't recognize → remove + investigate
- Any token you don't recognize → revoke + investigate
- Any 2FA-disabled member → fix or remove
- Any package owned by an individual (not org) when it should be org-owned

## References

- L-60 Phase 0b — parent milestone record
- `docs/m6/archive/` — snapshot destination
- Phase 3a (future) — fresh granular token creation for release-day publish
- Phase 3e (future) — token revocation after 72-hour monitoring window
