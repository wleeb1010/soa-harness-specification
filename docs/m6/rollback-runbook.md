# Release-Day Rollback Runbook

M6 Phase 2g (L-60). Decision tree for what to do when Phase 3 release-day execution hits trouble. Read this before release day; reference during the 72-hour post-release monitoring window.

## First principles

Releases are not all-or-nothing. There are three recovery modes, in declining order of preference:

1. **Roll forward** — fix the issue and keep going. Every step in Phase 3 is designed to be retry-safe where possible.
2. **Patch release (v1.0.1)** — issue is real but not catastrophic. Ship a fix in an editorial errata.
3. **Full rollback** — only if a released version is actively unsafe.

**npm's 72-hour unpublish window is narrow.** After 72 hours, `npm unpublish` stops working. After that, v1.0.0 is permanent on the registry forever.

Within the window, `npm unpublish @soa-harness/<pkg>@1.0.0` removes the version — but then that specific version number can't be republished for 24 hours. Abusing unpublish breaks downstream adopters.

## Decision tree per failure mode

### Mode 1 — Publish cascade failure mid-way through the 8-package publish

**Scenario:** Package 5 of 8 fails to publish. Packages 1-4 are already on npm; 6-8 are not. Release-day script halts.

**Decision:**

```
Is the failure transient (network, rate-limit, 5xx)?
├── YES → wait 2 minutes, retry from package 5. Keep the 1-4 publishes.
└── NO  → diagnose root cause:
           Token expired mid-publish?         → regenerate token; retry from 5
           Peer-dep resolution broke at 5?    → fix the dep spec locally;
                                                 republish 5-8 as 1.0.0
                                                 (packages 1-4 unchanged)
           EPUBLISHCONFLICT (already exists)? → STOP. Something published 1.0.0
                                                 out of band. Investigate before
                                                 any recovery action.
           Corrupt tarball (mid-upload)?      → retry from package 5
```

**Never do:**
- Unpublish packages 1-4 to "start over". That burns the 1.0.0 version number on those packages for 24h. Fix forward.
- Publish packages 6-8 as 1.0.1 to skip the broken 5. The chain assumes all 8 are at the same version.

### Mode 2 — Post-publish critical bug (inside 72-hour window)

**Scenario:** All 8 packages at 1.0.0. 24 hours later, an adopter reports that `npx create-soa-agent` produces a broken scaffold on macOS, reproducibly.

**Decision:**

```
Is the bug blocking any adopter's fresh install?
├── YES → ship v1.0.1 editorial errata within 24 hours
│         1. Fix in impl repo, bump all 8 packages to 1.0.1
│         2. Write ERRATA.md entry per docs/errata-policy.md
│         3. Publish 8 packages in order to npm at 1.0.1
│         4. Promote `latest` from 1.0.0 → 1.0.1 per package
│         5. v1.0.0 stays on npm as-is; `latest` now resolves to 1.0.1
│
└── NO  → wait out the 14-day observation window; ship fix in v1.0.2 per
         docs/errata-policy.md
```

**Unpublish v1.0.0 is the wrong answer** unless the bug is a **security vulnerability** with active exploitation potential. Unpublishing breaks adopters who installed before the fix landed.

### Mode 3 — Security vulnerability in v1.0.0

**Scenario:** A CVE-level security issue is found in `@soa-harness/runner@1.0.0` within the 72-hour window.

**Decision:**

```
Is there active exploitation or a clear exploit path?
├── YES (active) → 
│   1. Unpublish affected packages immediately: `npm unpublish @soa-harness/<pkg>@1.0.0`
│   2. Ship v1.0.1 within 12 hours with the fix
│   3. Post a GitHub security advisory at https://github.com/wleeb1010/soa-harness-impl/security
│   4. Email all known adopters (if any)
│
└── NO (theoretical) →
    1. Ship v1.0.1 within 72 hours with the fix
    2. Post a CVE + security advisory
    3. Do NOT unpublish v1.0.0 — adopters who already pinned to 1.0.0 need time to upgrade
```

**After the 72-hour window, unpublish is not an option.** The only path is v1.0.1 + loud communication.

### Mode 4 — MANIFEST signing fails (pre-publish, Phase 2e)

**Scenario:** You're about to sign MANIFEST.json.jws. `openssl pkey -in soa-release-v1.0.key.enc` returns wrong passphrase or corrupt key.

**Decision:**

```
Is the .enc file intact and readable?
├── YES → problem is passphrase
│         1. Check password manager, retry
│         2. If genuinely lost: regenerate keypair, new public key
│            (keys/soa-release-v1.0.pub), repeat the ceremony,
│            delay release by 1 day
│
└── NO (file corrupted) → restore from offline backup (Copy 1 or Copy 2
                           from the ceremony). If both backups fail: regenerate,
                           delay release.
```

**Never:** check the encrypted `.enc` file into the git repo. If you lose both backups and the passphrase, regenerate from scratch.

### Mode 5 — GitHub release creation fails (Phase 3f)

**Scenario:** `gh release create v1.0.0` returns an error ("tag already exists" / API rate limit / auth failure).

**Decision:**

```
Does the v1.0.0 tag already exist on GitHub?
├── YES → 
│   - If it points to the correct commit: delete the existing release (not the tag!)
│     `gh release delete v1.0.0 --yes`
│     then re-run `gh release create v1.0.0`
│   - If it points to the wrong commit: DO NOT force-move the tag. Leave v1.0.0
│     pointing at what it already points at. Investigate why the commit diverges
│     from expectations before doing anything else.
│
└── NO → 
    - Auth issue: `gh auth login`, retry
    - Rate limit: wait 15 minutes, retry
    - Other API error: check GitHub status page, retry
```

**Never force-push tags.** A tag that was ever published is frozen — any adopter who fetched it will have the old SHA locally. Moving the tag creates divergence.

## The "abandon release" decision

Before canceling a release entirely, confirm:

- [ ] Was the issue caught BEFORE any package was published to real npm?
  - YES → safe to abandon. Tear down Verdaccio, rollback spec commits, restart next week.
  - NO → at least one package is on npm. You CANNOT abandon cleanly. Fix forward.

- [ ] Was the issue caught BEFORE any GitHub release was tagged?
  - YES → safe to rollback git commits locally.
  - NO → the v1.0.0 tag is public. Leave it. Ship v1.0.1 with the fix.

If both answers are NO, **there is no clean abandon path**. Fix forward via v1.0.1.

## 72-hour monitoring checklist

During Phase 3g:

- [ ] GitHub issues tagged `v1.0.0`: check every 4 hours
- [ ] npm download counts per package: baseline expected
- [ ] `create-soa-agent` smoke-test on fresh OS images (Windows 11 + WSL2 Ubuntu + macOS if available)
- [ ] Spec repo CI: green on main
- [ ] No new HIGH truffleHog findings (if anyone commits mid-window)
- [ ] `/releases/latest` on each repo shows v1.0.0

If any checkbox breaks, activate the appropriate mode above.

## Phase 3g exit criteria (safe to "close" the release)

After 72 hours:

- Zero CRITICAL issues open
- Zero rollback actions triggered
- Install-smoke tests green on all three platforms
- `latest` dist-tag still at 1.0.0 on all 8 packages
- v1.0.0 tag unchanged on all three repos

Then the release is sealed. v1.0.1+ patches follow `docs/errata-policy.md`.

## References

- L-60 Phase 2g — parent milestone record
- `docs/errata-policy.md` — classifies v1.0.1 / v1.1.0 / v2.0.0 decisions
- `docs/m6/dist-tag-strategy.md` — dist-tag semantics during/after release
- `docs/m6/verdaccio-dry-run-results.md` — what was validated PRE-release
- npm docs on unpublish: https://docs.npmjs.com/unpublishing-packages-from-the-registry
