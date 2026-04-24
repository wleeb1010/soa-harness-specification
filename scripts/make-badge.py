#!/usr/bin/env python3
"""
make-badge.py — generate a shields.io-style SVG conformance badge from
an emitted release-gate.json.

Intended for adopters who want to embed `![SOA-Harness conformance](badge.svg)`
in their README. The badge surfaces the pass/fail/skip/error counts at
a glance without requiring viewers to open the full release-gate JSON.

Usage:
  python scripts/make-badge.py --input release-gate.json --output badge.svg

Color convention (matches shields.io's 'badges-of-the-sacred-three' pattern):
  - brightgreen — 0 failures, 0 errors, any number of passes
  - yellow      — 0 failures, 0 errors, but >50% of tests skipped (suggests
                  you're not actually probing much)
  - orange      — 1+ errors (test harness broke; needs investigation)
  - red         — 1+ failures (spec violation)

The output is self-contained SVG — no external font or image refs.
Paste into a web page or inline in Markdown.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path


def pick_color(passed: int, failed: int, skipped: int, errored: int, total: int) -> str:
    if failed > 0:
        return "#e05d44"  # red
    if errored > 0:
        return "#fe7d37"  # orange
    if total > 0 and (skipped / total) > 0.50:
        return "#dfb317"  # yellow
    if passed > 0:
        return "#4c1"  # brightgreen
    return "#9f9f9f"  # gray — no data


def render_badge(label: str, message: str, color: str) -> str:
    """
    Return a shields.io-compatible SVG. Hand-rolled; minimal deps. The
    resulting image is ~20px tall, label on the left in dark gray, message
    on the right in the selected color.
    """
    label_w = max(6 * len(label) + 10, 40)
    message_w = max(6 * len(message) + 10, 40)
    total_w = label_w + message_w
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="20" role="img" aria-label="{label}: {message}">
  <title>{label}: {message}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="{total_w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_w}" height="20" fill="#555"/>
    <rect x="{label_w}" width="{message_w}" height="20" fill="{color}"/>
    <rect width="{total_w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="{label_w * 10 // 2}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="{(label_w - 10) * 10}">{label}</text>
    <text x="{label_w * 10 // 2}" y="140" transform="scale(.1)" fill="#fff" textLength="{(label_w - 10) * 10}">{label}</text>
    <text aria-hidden="true" x="{(label_w + message_w // 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="{(message_w - 10) * 10}">{message}</text>
    <text x="{(label_w + message_w // 2) * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="{(message_w - 10) * 10}">{message}</text>
  </g>
</svg>
"""
    return svg


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate SOA-Harness conformance SVG badge from release-gate.json")
    parser.add_argument("--input", type=Path, default=Path("release-gate.json"), help="path to release-gate.json (default ./release-gate.json)")
    parser.add_argument("--output", type=Path, default=Path("badge.svg"), help="output SVG path (default ./badge.svg)")
    parser.add_argument("--label", default="soa conformance", help="left-side label (default 'soa conformance')")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input file {args.input} not found", file=sys.stderr)
        return 2

    try:
        with args.input.open("r", encoding="utf-8") as f:
            gate = json.load(f)
    except Exception as exc:
        print(f"ERROR: failed to parse {args.input}: {exc}", file=sys.stderr)
        return 2

    passed = int(gate.get("passed", 0))
    failed = int(gate.get("failed", 0))
    skipped = int(gate.get("skipped", 0))
    errored = int(gate.get("errored", 0))
    total = int(gate.get("total", passed + failed + skipped + errored))

    color = pick_color(passed, failed, skipped, errored, total)

    if failed > 0:
        message = f"{failed} failing"
    elif errored > 0:
        message = f"{errored} errors"
    else:
        message = f"{passed}/{total} passing"

    svg = render_badge(args.label, message, color)
    args.output.write_text(svg, encoding="utf-8")
    print(f"wrote {args.output} ({len(svg)} bytes, color {color}, message '{message}')")
    return 0


if __name__ == "__main__":
    sys.exit(main())
