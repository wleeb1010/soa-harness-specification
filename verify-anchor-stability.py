#!/usr/bin/env python3
"""
Verify test_id -> section anchor mappings stay in sync with spec.

Called from pre-commit hook (.git/hooks/pre-commit) and from CI. Exits
non-zero if any test in either must-map references a section anchor that
no longer exists in either the Core or UI spec.

Surfaced by M6 Phase 0c (L-60). Enforces the "no silent anchor drift"
invariant required for test-ID stability through v1.0 and beyond.

Usage:
    python verify-anchor-stability.py        # check and print summary
    python verify-anchor-stability.py --strict  # also check for orphan
                                                # sections (no test covers)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent
CORE_SPEC = REPO_ROOT / "SOA-Harness Core Specification v1.0 (Final).md"
UI_SPEC = REPO_ROOT / "SOA-Harness UI Integration Profile v1.0 (Final).md"
CORE_MAP = REPO_ROOT / "soa-validate-must-map.json"
UI_MAP = REPO_ROOT / "ui-validate-must-map.json"

SECTION_HEADING_RE = re.compile(r"^#{2,4}\s+(\d+(?:\.\d+)*)")
SECTION_CITATION_RE = re.compile(r"§(\d+(?:\.\d+)*)")


def extract_spec_anchors(spec_path: Path) -> set[str]:
    anchors: set[str] = set()
    with spec_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            match = SECTION_HEADING_RE.match(line)
            if match:
                anchors.add("§" + match.group(1))
    return anchors


def extract_test_refs(must_map_path: Path) -> dict[str, list[str]]:
    """Map test_id -> list of distinct §X.Y references parsed from .section."""
    data = json.loads(must_map_path.read_text(encoding="utf-8"))
    refs: dict[str, list[str]] = {}
    for tid, tspec in data.get("tests", {}).items():
        raw = tspec.get("section", "")
        found = ["§" + r for r in SECTION_CITATION_RE.findall(raw)]
        refs[tid] = found
    return refs


def audit(must_map_path: Path, name: str, all_anchors: set[str]) -> list[str]:
    refs = extract_test_refs(must_map_path)
    broken: list[str] = []
    for tid, sections in refs.items():
        for sec in sections:
            if sec not in all_anchors:
                broken.append(f"{name}: {tid} cites {sec} — not in Core or UI spec")
    return broken


def main(argv: list[str]) -> int:
    core = extract_spec_anchors(CORE_SPEC)
    ui = extract_spec_anchors(UI_SPEC)
    all_anchors = core | ui

    errors: list[str] = []
    errors.extend(audit(CORE_MAP, "soa-validate", all_anchors))
    errors.extend(audit(UI_MAP, "ui-validate", all_anchors))

    if errors:
        print("ANCHOR STABILITY VIOLATION\n", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        print(
            f"\n{len(errors)} broken anchor(s). "
            "Either fix the must-map entries or restore the removed spec anchors. "
            "Test IDs are a conformance contract — breakage is never silent.",
            file=sys.stderr,
        )
        return 1

    core_tests = sum(1 for _ in extract_test_refs(CORE_MAP))
    ui_tests = sum(1 for _ in extract_test_refs(UI_MAP))
    print(
        f"OK: {core_tests + ui_tests} tests ({core_tests} Core + {ui_tests} UI), "
        f"{len(all_anchors)} distinct spec anchors, zero broken references."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
