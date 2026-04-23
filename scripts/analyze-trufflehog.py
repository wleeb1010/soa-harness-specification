#!/usr/bin/env python3
"""Summarize trufflehog3 JSON output by rule + severity + file."""
import json
import sys
from collections import Counter
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(f"Total findings: {len(data)}\n")

by_severity = Counter(f.get("rule", {}).get("severity", "?") for f in data)
print("By severity:")
for sev, n in by_severity.most_common():
    print(f"  {sev:8s} {n}")

by_rule = Counter(f.get("rule", {}).get("id", "?") for f in data)
print("\nTop rules:")
for rule, n in by_rule.most_common(15):
    print(f"  {n:5d}  {rule}")

by_path = Counter(f.get("path", "?") for f in data)
print("\nTop paths (count of findings):")
for path, n in by_path.most_common(20):
    print(f"  {n:5d}  {path}")

# Surface anything HIGH severity explicitly
highs = [f for f in data if f.get("rule", {}).get("severity") == "HIGH"]
print(f"\nHIGH severity findings: {len(highs)}")
for f in highs[:30]:
    print(f"  [{f.get('rule', {}).get('id')}] {f.get('path')}:{f.get('line')}")
    secret = f.get("secret", "")
    if secret:
        print(f"    secret snippet: {secret[:80]!r}")

# Surface MEDIUM severity findings that aren't in obvious-false-positive paths
FP_PATHS = (
    "graphify-out/",
    "test-vectors/",  # signed fixtures by design
    "IMPLEMENTATION_LESSONS.md",  # discusses crypto abstractly
    ".git/",
)
def is_fp(path):
    return any(path.startswith(fp) for fp in FP_PATHS)

mediums = [f for f in data if f.get("rule", {}).get("severity") == "MEDIUM" and not is_fp(f.get("path", ""))]
print(f"\nMEDIUM severity findings (excl. likely-FP paths): {len(mediums)}")
for f in mediums[:30]:
    print(f"  [{f.get('rule', {}).get('id')}] {f.get('path')}:{f.get('line')}")
