# Pin-Bump Runbook

How to roll a coordinated `soa-validate.lock` pin bump across the three SOA-Harness repositories. This codifies the pattern L-62 established during the M7 night-shift cadence.

Audience: maintainers of `soa-harness-impl` or `soa-validate` whose repo's pin needs to advance. The spec repo is the source of truth — spec commits precede the bump on its consumers.

## When to bump

A pin bump is required when **any** of the following files change in the spec repo between the current pin and HEAD:

- `SOA-Harness Core Specification v1.0 (Final).md` or `SOA-Harness UI Integration Profile v1.0 (Final).md` (normative text)
- `schemas/*.schema.json` (any schema addition, change, or removal)
- `test-vectors/**` (pinned vectors that impl or validate may load)
- `soa-validate-must-map.json` or `ui-validate-must-map.json` (conformance contract)
- `MANIFEST.json` / `MANIFEST.json.jws` (artifact digests)

Editorial-only spec changes (typo fixes, re-phrasings that don't move MUSTs) are NOT required to trigger a bump — they land on `v1.0-lts` per `docs/m7/v1.0-lts-branch-policy.md` and are reported via `ERRATA.md`.

When uncertain: **bump anyway**. A stale pin is a silent liar; an over-bumped pin is just a visible commit.

## Pre-bump checks (local)

```bash
# Both sibling repos present and at expected branches
ls ../soa-harness-impl/soa-validate.lock && ls ../soa-validate/soa-validate.lock

# No uncommitted changes in either sibling
(cd ../soa-harness-impl && git status --porcelain) | head -5
(cd ../soa-validate      && git status --porcelain) | head -5

# Current pin in each (should match pre-bump)
python -c "import json; print('impl:',     json.load(open('../soa-harness-impl/soa-validate.lock'))['spec_commit_sha'])"
python -c "import json; print('validate:', json.load(open('../soa-validate/soa-validate.lock'))['spec_commit_sha'])"

# Scripted drift check (catches pre-existing silent drift)
python scripts/check-pin-drift.py
```

If the two siblings are already drifted before the bump, stop — resolve the pre-existing drift first, then restart this runbook.

## Identify the target commit

The target is normally the spec repo's current `HEAD` (latest `main`). Record the full SHA and the date:

```bash
cd ../soa-harness-specification
git rev-parse HEAD                  # full SHA
git show -s --format=%cI HEAD       # commit date (ISO-8601)
```

Compute the MANIFEST SHA-256 so you can record it in `spec_manifest_sha256`:

```bash
python -c "import hashlib; print(hashlib.sha256(open('MANIFEST.json','rb').read()).hexdigest())"
```

Note whether `MANIFEST.json.jws` is a real signature or the placeholder (`spec_manifest_status: "signed-v1.0"` vs `"placeholder"`).

## Bump impl

```bash
cd ../soa-harness-impl
# Edit soa-validate.lock:
#   - spec_commit_sha       → new SHA
#   - spec_commit_date      → new date
#   - spec_manifest_sha256  → new manifest SHA
#   - spec_manifest_status  → "signed-v1.0" or "placeholder" per above
#   - Append new entry to pin_history with:
#       {"sha": <OLD_SHA>, "bumped_to": <NEW_SHA>, "reason": "<...>"}
python -c "import json; json.load(open('soa-validate.lock'))"   # syntax check
```

Reason-field contents matter. Minimum: which L-entries and spec commits are being adopted, whether any wire-format change is involved, any downstream implications (schemas re-vendor? new test IDs? breaking change?). See the existing `pin_history` entries for the expected depth.

Then re-vendor schemas + rebuild + test:

```bash
SOA_SCHEMAS_FORCE_REFRESH=1 node packages/schemas/scripts/build-validators.mjs
pnpm -r build
pnpm -r test
```

All tests must pass. Any failure means the bump either adopted a breaking change you weren't expecting, or a schema addition didn't get reflected in impl code — investigate and fix before committing.

Commit:

```bash
git add soa-validate.lock packages/schemas/src/schemas/vendored/
git commit -m "Pin-bump to spec <SHA>: <one-line reason>

<body — same detail as the pin_history reason field>

Regression: pnpm -r test <N>/<N> green.
"
```

**Do not push yet** — the validate-side bump should land in the same window.

## Bump validate

```bash
cd ../soa-validate
# Edit soa-validate.lock the same way — same new SHA, same new date, same
# manifest SHA, same status. The pin_history reason MUST include
# "lockstep bump with soa-harness-impl's matching pin bump (impl commit <HASH>)"
# naming the impl commit from the previous step.
python -c "import json; json.load(open('soa-validate.lock'))"
go build ./...
go vet ./...
go test ./...
# Vector-only sanity run
go build -o /tmp/soa-validate ./cmd/soa-validate/
/tmp/soa-validate --spec-vectors ../soa-harness-specification --profile core --out /tmp/release-gate.json
```

Expected: no test regressions vs pre-bump. Any new SV-* tests may land in `skip` state if their impl prerequisites haven't shipped yet (matches SV-LLM-05 pattern).

Commit on validate:

```bash
git add soa-validate.lock
git commit -m "Pin-bump to spec <SHA>: <matching reason>

Lockstep bump with soa-harness-impl commit <HASH>.

Regression: go build + go vet + go test clean. Vector-only validator run
reports <N> pass / <M> skip / 0 fail.
"
```

## Post-bump verification

```bash
cd ../soa-harness-specification
python scripts/check-pin-drift.py
# Expect: OK - no drift; all present siblings pin to the same spec commit.
```

If both siblings expose a `/version` endpoint (impl at spec >= 68b34f1), also:

```bash
# Start impl Runner in demo mode
RUNNER_DEMO_MODE=1 SOA_RUNNER_BOOTSTRAP_BEARER=test node .../start-runner.js &
# Validator check-pins
soa-validate --check-pins --impl-url http://127.0.0.1:7700 --spec-vectors ../soa-harness-specification
# Expect: OK - pins aligned.
```

## Push when ready

Once local checks pass AND both sibling commits are ready, push both in rapid succession:

```bash
cd ../soa-harness-impl && git push origin main
cd ../soa-validate       && git push origin main
```

The CI `pin-drift.yml` workflow will run on both push events and confirm alignment from a clean checkout. A red CI gate here means you missed a step — go back to the `check-pin-drift.py` local step.

## Rollback

If a push went out and something breaks downstream (e.g., a dependent npm consumer's CI fails because a schema changed shape):

1. Revert the impl pin-bump commit: `git revert <impl-bump-sha> && git push origin main`
2. Revert the validate pin-bump commit: `git revert <validate-bump-sha> && git push origin main`
3. `python scripts/check-pin-drift.py` confirms return to pre-bump alignment
4. Open an issue on the spec repo documenting the rollback reason so the next bump attempt avoids the same trap

## Anti-patterns

- **Bumping only one side.** Always bump both. The pin-drift CI gate exists precisely to catch this.
- **Silent bumps with no `pin_history` entry.** The history is append-only and load-bearing for future adopters diagnosing "why does my pin lag six bumps behind?" — don't skip it.
- **Bumping to a non-`main` commit.** The target should be `HEAD` of spec/main at the moment of the bump. Tracking spec branches is an open-source fork pattern, not a pin-bump.
- **Batching more than one incremental spec change into a single pin-bump.** One bump per commit-bundle is the norm. If you need to adopt three L-entries at once, say so explicitly in the reason and include all three SHAs — don't pretend it's one change.
- **Amending published pin-bump commits.** Pin history is effectively public the moment it pushes. A follow-up correction commit is better than a force-push.

## References

- `scripts/check-pin-drift.py` — automated check, read first
- `docs/errata-policy.md` — editorial vs minor vs major decision tree (informs whether a bump is required)
- `docs/m7/v1.0-lts-branch-policy.md` — the `v1.0-lts` branch and what lands there instead of `main`
- L-62 in `IMPLEMENTATION_LESSONS.md` — worked example of this runbook in practice (M7 coordinated bump)
