#!/usr/bin/env python3
"""Filter trufflehog3 JSON output to exclude well-known noise paths."""
import json
import re
import sys
from pathlib import Path

EXCLUDE_PATTERNS = [
    r"node_modules[/\\]",
    r"[/\\]dist[/\\]",
    r"[/\\]build[/\\]",
    r"\.pnpm[/\\]",
    r"graphify-out[/\\]",
    r"logs[/\\]",
    r"\.git[/\\]",
]
exc_re = re.compile("|".join(EXCLUDE_PATTERNS))

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
real = [f for f in data if not exc_re.search(f.get("path", ""))]
print(f"total: {len(data)}  real: {len(real)}")
for f in real[:30]:
    rid = f.get("rule", {}).get("id", "?")
    print(f"  [{rid}] {f.get('path')}:{f.get('line')}")
