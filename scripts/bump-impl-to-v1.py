#!/usr/bin/env python3
"""Bump soa-harness-impl packages from 1.0.0-rc.X to 1.0.0.

- 8 packages/*/package.json get .version set to "1.0.0"
- 4 scaffold templates under packages/create-soa-agent/templates/*/package.json
  get their @soa-harness/* dependency specs updated from ^1.0.0-rc.X to ^1.0.0

Byte-preserving where possible: uses json module (round-trips) but matches
original 2-space indent + LF. npm/pnpm don't care about JSON formatting
subtleties like the must-maps; this is runtime metadata.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

IMPL = Path("C:/Users/wbrumbalow/Documents/Projects/soa-harness-impl")
PKG_NAMES = [
    "core", "schemas", "runner",
    "memory-mcp-sqlite", "memory-mcp-mem0", "memory-mcp-zep",
    "langgraph-adapter", "create-soa-agent",
]
TEMPLATE_DIRS = [
    "runner-starter", "runner-starter-mem0",
    "runner-starter-zep", "runner-starter-none",
]


def write_json_pretty(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def bump_package_version(pkg_path: Path) -> tuple[str, str]:
    data = json.loads(pkg_path.read_text(encoding="utf-8"))
    old = data.get("version", "?")
    data["version"] = "1.0.0"
    write_json_pretty(pkg_path, data)
    return old, "1.0.0"


def bump_template_deps(pkg_path: Path) -> list[tuple[str, str, str]]:
    data = json.loads(pkg_path.read_text(encoding="utf-8"))
    changes: list[tuple[str, str, str]] = []
    for dep_block in ("dependencies", "devDependencies", "peerDependencies"):
        deps = data.get(dep_block, {})
        for name, spec in list(deps.items()):
            if not isinstance(spec, str):
                continue
            # Match ^1.0.0-rc.X or ~1.0.0-rc.X -> ^1.0.0
            m = re.match(r"^([~^]?)1\.0\.0-rc\.\d+$", spec)
            if m:
                new = f"{m.group(1) or '^'}1.0.0"
                deps[name] = new
                changes.append((name, spec, new))
    if changes:
        write_json_pretty(pkg_path, data)
    return changes


def main() -> int:
    print("=== Bumping 8 primary packages/*/package.json to 1.0.0 ===")
    for name in PKG_NAMES:
        p = IMPL / "packages" / name / "package.json"
        if not p.exists():
            print(f"  MISSING: {p}", file=sys.stderr)
            return 1
        old, new = bump_package_version(p)
        print(f"  {name:24s} {old} -> {new}")

    print("\n=== Updating 4 scaffold template package.json deps ===")
    for tname in TEMPLATE_DIRS:
        p = IMPL / "packages" / "create-soa-agent" / "templates" / tname / "package.json"
        if not p.exists():
            print(f"  SKIP (not present): {tname}")
            continue
        changes = bump_template_deps(p)
        if not changes:
            print(f"  {tname}: no changes")
        else:
            print(f"  {tname}:")
            for dep, old, new in changes:
                print(f"    {dep:40s} {old} -> {new}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
