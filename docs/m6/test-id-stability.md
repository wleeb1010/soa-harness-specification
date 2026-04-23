# Test-ID Stability — Pre-Commit Enforcement

M6 Phase 0c (L-60). Ensures `test_id → §X.Y` anchor mappings stay consistent across the three-repo chain (spec, impl, validate) through v1.0 and beyond.

## Why this matters

Test IDs are a **conformance contract**. Once a tester writes `assert SV-MEM-01 passes`, or a compliance report says `SV-MEM-03: PASS`, that ID cannot silently rename or re-anchor. A broken `test_id → spec anchor` mapping invalidates every downstream claim.

## Spec-repo enforcement (this repo)

Installed at `.git/hooks/pre-commit`. Runs `verify-anchor-stability.py` on every commit; exits non-zero and blocks the commit if any test in either must-map references a `§X.Y` that no longer exists in Core or UI spec.

**Baseline at M6 Phase 0c deployment (2026-04-23):** 420 tests (234 Core + 186 UI), 200 distinct spec anchors, zero broken references.

To run the check manually:

```bash
python verify-anchor-stability.py
```

To bypass (NOT recommended — only for genuine emergency fix-forward):

```bash
git commit --no-verify
```

## Sibling-repo enforcement pattern

Impl + validate repos do not own must-maps. They pin the spec's must-map via `soa-validate.lock` (digest SHA). Their invariant is different: **every test_id referenced in local code must exist in the pinned must-map**.

Recommended hook (draft — deploy in each sibling repo's `.git/hooks/pre-commit`):

```bash
#!/bin/sh
# soa-test-id-pinned-start
# Verify every SV-*/HR-*/UV-* referenced in code exists in the pinned must-map.
SCRIPT_DIR=$(git rev-parse --show-toplevel 2>/dev/null)
PINNED_MAP="$SCRIPT_DIR/vendor/soa-validate-must-map.json"  # or wherever pinned
if [ ! -f "$PINNED_MAP" ]; then exit 0; fi

PY=""
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else exit 0; fi

"$PY" - <<'PYSCRIPT'
import json, re, subprocess, sys
from pathlib import Path

repo = Path.cwd()
pinned = json.loads((repo / "vendor" / "soa-validate-must-map.json").read_text(encoding="utf-8"))
known = set(pinned.get("tests", {}).keys())

# Gather referenced test IDs from staged content
result = subprocess.run(["git", "diff", "--cached", "--name-only"], capture_output=True, text=True)
staged = [Path(f) for f in result.stdout.splitlines() if f.strip()]

id_re = re.compile(r"\b(HR-\d+|SV-[A-Z]+-?\d+|UV-[A-Z]+-?\d+)\b")
referenced = set()
for f in staged:
    if not f.exists():
        continue
    if f.suffix not in (".go", ".ts", ".tsx", ".js", ".mjs", ".py", ".md", ".json"):
        continue
    try:
        text = f.read_text(encoding="utf-8")
    except Exception:
        continue
    referenced |= set(id_re.findall(text))

missing = sorted(referenced - known)
if missing:
    print(f"[test-id-stability] missing from pinned must-map:", file=sys.stderr)
    for m in missing:
        print(f"  {m}", file=sys.stderr)
    print("Either fix the ID, remove the reference, or bump the pinned must-map digest.", file=sys.stderr)
    sys.exit(1)
PYSCRIPT
# soa-test-id-pinned-end
```

Deployment steps for each sibling repo:
1. Copy the hook script to `.git/hooks/pre-commit` (or merge into existing hook).
2. `chmod +x .git/hooks/pre-commit`.
3. Verify: stage a file referencing a known test ID, commit — should pass. Stage a file referencing `SV-FAKE-99`, commit — should block.

## CI enforcement (Phase 0j)

Phase 0j adds a GitHub Actions job that runs `verify-anchor-stability.py` on every PR. Redundant with the pre-commit hook but catches the case where a developer commits with `--no-verify` and pushes.

## When the invariant legitimately breaks

A test ID or spec anchor genuinely deprecates only at a **minor** or **major** spec bump (§19.4). Protocol:
1. Open an errata PR in the spec repo per `docs/errata-policy.md` (Phase 0f).
2. Spec PR lands → spec tag bumps → impl + validate pin-bump their lock to the new digest.
3. Until the pin-bump lands in each sibling, they continue to assert against the older must-map — broken ID remains "missing" from their perspective, which is correct.

## Related

- `verify-anchor-stability.py` — the enforcement script
- `.git/hooks/pre-commit` — installed hook
- L-60 M6 Phase 0c — the parent milestone record
- Phase 0j (future) — CI automation of the same check
- Phase 0f (future) — `docs/errata-policy.md` — what to do when IDs legitimately change
