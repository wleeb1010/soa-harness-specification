#!/usr/bin/env python3
"""
check-pin-drift.py — warn when sibling repos' soa-validate.lock pins diverge.

The three-repo architecture (spec / impl / validate) depends on both impl
and validate pinning to the same spec commit at any given time. Drift is
not a hard error — minor versions, mid-bump windows, and deliberately-
staggered rollouts are all legitimate — but silent drift is a bug.

This script reads sibling repos' pin files when present on disk and
reports divergence. Intended uses:
  - Local developer check: `python scripts/check-pin-drift.py`
  - CI pre-merge guard: same command with --ci (exits 1 on drift unless
    --allow-drift explicitly passed)

Discovery:
  The spec repo knows its own path. Sibling repos are looked up by
  convention: ../soa-harness-impl and ../soa-validate relative to this
  spec repo's root. Override via --impl-root / --validate-root.

Output:
  Prints a summary table of each repo's current pin + the reason for
  the most recent bump (helps debug "why is impl two commits behind
  validate?" at a glance). Exits 0 on alignment, 1 on drift (unless
  --allow-drift), 2 on missing siblings or parse errors.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
SPEC_ROOT = HERE.parent


def load_lock(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        print(f"ERROR: failed to parse {path}: {exc}", file=sys.stderr)
        return None


def summarize(name: str, lock: dict[str, Any]) -> dict[str, str]:
    pin = lock.get("spec_commit_sha", "?")
    status = lock.get("spec_manifest_status", "?")
    # Find the bump entry whose bumped_to == current pin. pin_history
    # is append-ish but not strictly chronological — the entry that
    # produced the *current* pin is what we want.
    current_bump: dict[str, Any] = {}
    for entry in lock.get("pin_history") or []:
        if entry.get("bumped_to") == pin:
            current_bump = entry
            break
    reason = current_bump.get("reason", "")
    first_line = reason.split(".")[0] if reason else ""
    if len(first_line) > 120:
        first_line = first_line[:117] + "..."
    return {
        "repo": name,
        "pin": pin,
        "pin_short": pin[:12],
        "manifest_status": status,
        "last_reason_head": first_line,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect spec-pin drift across sibling repos.")
    parser.add_argument("--impl-root", type=Path, default=SPEC_ROOT.parent / "soa-harness-impl")
    parser.add_argument("--validate-root", type=Path, default=SPEC_ROOT.parent / "soa-validate")
    parser.add_argument("--ci", action="store_true", help="Exit non-zero on drift (for CI gates).")
    parser.add_argument("--allow-drift", action="store_true", help="Report drift but exit 0 even in CI mode.")
    args = parser.parse_args()

    impl_lock = load_lock(args.impl_root / "soa-validate.lock")
    validate_lock = load_lock(args.validate_root / "soa-validate.lock")

    if impl_lock is None and validate_lock is None:
        print("No sibling repos found on disk. Nothing to check.")
        return 0 if not args.ci else 2

    summaries = []
    if impl_lock is not None:
        summaries.append(summarize("impl", impl_lock))
    if validate_lock is not None:
        summaries.append(summarize("validate", validate_lock))

    # Pretty-print
    col_w = {"repo": max(4, max(len(s["repo"]) for s in summaries)),
             "pin_short": 12,
             "status": max(15, max(len(s["manifest_status"]) for s in summaries))}
    print(f"\n{'repo':<{col_w['repo']}}  {'pin (short)':<{col_w['pin_short']}}  {'manifest_status':<{col_w['status']}}  last_bump_reason")
    print(f"{'-' * col_w['repo']}  {'-' * col_w['pin_short']}  {'-' * col_w['status']}  {'-' * 60}")
    for s in summaries:
        print(
            f"{s['repo']:<{col_w['repo']}}  "
            f"{s['pin_short']:<{col_w['pin_short']}}  "
            f"{s['manifest_status']:<{col_w['status']}}  "
            f"{s['last_reason_head']}"
        )

    # Divergence check
    pins = {s["repo"]: s["pin"] for s in summaries}
    unique_pins = set(pins.values())

    if len(unique_pins) <= 1:
        print("\nOK - no drift; all present siblings pin to the same spec commit.")
        return 0

    # Drift
    print("\nDRIFT DETECTED - siblings pin to different spec commits:")
    for repo, pin in pins.items():
        print(f"    {repo}: {pin}")
    print(
        "\nA validator pinned to a different spec commit than the impl it tests is diagnosing\n"
        "the wrong system. Bump one or both in lockstep via each repo's soa-validate.lock\n"
        "pin-bump protocol. If this drift is intentional (e.g. mid-bump window), pass\n"
        "--allow-drift to suppress the CI failure."
    )

    if args.ci and not args.allow_drift:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
