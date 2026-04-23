#!/usr/bin/env python3
"""
Strip implementation_milestone + milestone_reason fields from every test
entry in soa-validate-must-map.json (and ui-validate-must-map.json, though
it's expected to have zero of each).

M6 Phase 1d (L-60). These fields were M2/M3-era planning annotations that
no longer belong in a v1.0 artifact — the spec reads as v1.0 final, not
as a milestone log.

Byte-preserving: regex-based line deletion, NOT a JSON round-trip. This
avoids rewriting every non-ASCII character in the file (mixed-encoding
origin between the two must-maps would cause massive diff churn if we
re-serialized via json.dumps). The surgical approach touches only the
removed field lines + any trailing comma that becomes dangling.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SPEC_DIR = Path(__file__).parent.parent
TARGETS = [SPEC_DIR / "soa-validate-must-map.json", SPEC_DIR / "ui-validate-must-map.json"]

# JSON string value: opening quote, then (non-quote-non-backslash OR backslash-anything)*, then closing quote.
# Handles escaped quotes inside the string correctly.
FIELD_RE = re.compile(
    r'^[ \t]*"(?:implementation_milestone|milestone_reason)": "(?:[^"\\]|\\.)*",?[ \t]*\n',
    re.MULTILINE,
)

# Fix dangling trailing comma before a closing brace/bracket (which would be invalid JSON).
# Matches: comma, optional whitespace, newline, whitespace, } or ].
DANGLING_COMMA_RE = re.compile(r",(\s*\n\s*[}\]])", re.MULTILINE)


def main() -> int:
    for target in TARGETS:
        if not target.exists():
            print(f"skip (not present): {target.name}")
            continue

        original = target.read_text(encoding="utf-8")
        stripped = FIELD_RE.sub("", original)
        dangling_count = len(DANGLING_COMMA_RE.findall(stripped))
        stripped = DANGLING_COMMA_RE.sub(r"\1", stripped)

        removed_count = len(FIELD_RE.findall(original))

        # Sanity check: must parse as valid JSON
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError as exc:
            print(f"{target.name}: REFUSED — output would be invalid JSON: {exc}", file=sys.stderr)
            return 1

        test_count = len(parsed.get("tests", {}))
        still_carries = sum(
            1 for t in parsed.get("tests", {}).values()
            if "implementation_milestone" in t or "milestone_reason" in t
        )

        if still_carries > 0:
            print(f"{target.name}: REFUSED — {still_carries} tests still carry milestone fields", file=sys.stderr)
            return 1

        target.write_text(stripped, encoding="utf-8")
        print(
            f"{target.name}: removed {removed_count} field line(s), "
            f"fixed {dangling_count} dangling comma(s), "
            f"{test_count} tests intact, valid JSON."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
