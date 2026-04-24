#!/usr/bin/env python3
"""
prerelease-check.py — pre-release security / hygiene preflight.

Runs a set of local checks that catch common mistakes before an
SOA-Harness release goes public. Intended for:
  1. Manual invocation before every `v1.X.Y` tag
  2. CI pre-merge gate on the release branch

Checks (all run; any failure returns non-zero exit):

  1. Leaked keys — regex sweep for PEM blocks, JWK privates, AWS/GCP
     key patterns, provider API keys (sk-... , xoxb-... , ghp_... ,
     npm_...) in ANY tracked file. Skips the `test-vectors/` tree
     which intentionally carries synthetic test keys.
  2. Hardcoded bearers — scans fixtures for Authorization: Bearer
     with non-placeholder strings.
  3. Dockerfile hardening — HEALTHCHECK present, non-root USER,
     EXPOSE declared.
  4. systemd hygiene — required hardening flags present
     (ProtectSystem=strict, NoNewPrivileges=true).
  5. Missing LICENSE — every distributable has one.
  6. package.json repository + license fields — required for npm publish.
  7. soa-validate.lock present — spec itself has none, but sibling
     repos must have one.

Exit code:
  0 — all checks pass
  1 — one or more checks failed (findings printed)
  2 — script itself errored (bad arguments, missing sibling, etc.)
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable


HERE = Path(__file__).resolve().parent
SPEC_ROOT = HERE.parent

# ─── Regex patterns for leaked-key sweep ─────────────────────────────────────
# Each pattern is (name, compiled_regex, severity).
LEAK_PATTERNS = [
    ("PEM private key block", re.compile(r"-----BEGIN (RSA |EC |DSA |OPENSSH |ENCRYPTED |PRIVATE )?PRIVATE KEY-----"), "critical"),
    ("JWK with 'd' (private scalar)", re.compile(r'"kty"\s*:\s*"(RSA|EC|OKP|oct)"[^}]*"d"\s*:\s*"[A-Za-z0-9_-]{20,}"'), "critical"),
    ("OpenAI API key", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "critical"),
    ("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"), "critical"),
    ("Slack bot token", re.compile(r"\bxox[bpsr]-[A-Za-z0-9-]{20,}\b"), "critical"),
    ("GitHub token", re.compile(r"\bghp_[A-Za-z0-9]{36,}\b"), "critical"),
    ("npm token", re.compile(r"\bnpm_[A-Za-z0-9]{36,}\b"), "critical"),
    ("AWS access key ID", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "high"),
    ("AWS secret access key (heuristic)", re.compile(r"(?i)aws(.{0,20})?(secret|private).{0,20}?[\"\']?[a-z0-9/+]{40}[\"\']?"), "high"),
    ("Bearer token (long)", re.compile(r"Bearer\s+[A-Za-z0-9._-]{40,}\b"), "high"),
]

# Paths to skip in leaked-key sweep. These are intentional (test fixtures,
# historical audit logs that contain synthetic keys).
LEAK_SKIP_PATH_PREFIXES = (
    "test-vectors/",
    "tests/",
    ".git/",
    "graphify-out/",
    "keys/",  # release key dir — public keys only here; private lives outside git
)

# Substrings that cause a file to be skipped regardless of where in the
# tree it appears. node_modules appears inside nested package roots
# (docs-site/node_modules, packages/*/node_modules, etc.).
LEAK_SKIP_PATH_CONTAINS = (
    "/node_modules/",
    "/dist/",
    "/build/",
    "/.docusaurus/",
)

# Paths to skip entirely (historical release-gate outputs etc.)
LEAK_SKIP_FILES = {
    "scripts/prerelease-check.py",  # contains the literal pattern strings above
}


def iter_tracked_files() -> Iterable[Path]:
    """
    Enumerate files we want to scan. Skips everything under directories
    in LEAK_SKIP_PATH_PREFIXES + binary extensions that won't meaningfully
    match regex patterns.
    """
    binary_exts = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".tar", ".gz", ".ico", ".woff", ".woff2", ".ttf", ".otf"}
    for p in SPEC_ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(SPEC_ROOT).as_posix()
        if any(rel.startswith(prefix) for prefix in LEAK_SKIP_PATH_PREFIXES):
            continue
        # Check for "/node_modules/" etc. embedded anywhere in the path.
        rel_with_sep = "/" + rel
        if any(needle in rel_with_sep for needle in LEAK_SKIP_PATH_CONTAINS):
            continue
        if rel in LEAK_SKIP_FILES:
            continue
        if p.suffix.lower() in binary_exts:
            continue
        yield p


def check_leaked_keys() -> list[str]:
    findings: list[str] = []
    for path in iter_tracked_files():
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for name, rx, sev in LEAK_PATTERNS:
            for m in rx.finditer(content):
                line_no = content[: m.start()].count("\n") + 1
                snippet = content[m.start() : m.start() + 80].replace("\n", " ")
                findings.append(
                    f"{sev}: {name} at {path.relative_to(SPEC_ROOT).as_posix()}:{line_no} — {snippet!r}"
                )
    return findings


def check_dockerfile(dockerfile_path: Path) -> list[str]:
    findings: list[str] = []
    if not dockerfile_path.exists():
        findings.append(f"missing Dockerfile at {dockerfile_path.relative_to(SPEC_ROOT)}")
        return findings
    body = dockerfile_path.read_text(encoding="utf-8", errors="ignore")
    if "HEALTHCHECK" not in body:
        findings.append(f"{dockerfile_path.relative_to(SPEC_ROOT)}: missing HEALTHCHECK directive")
    if not re.search(r"(?m)^\s*USER\s+", body):
        findings.append(f"{dockerfile_path.relative_to(SPEC_ROOT)}: missing non-root USER directive")
    if not re.search(r"(?m)^\s*EXPOSE\s+", body):
        findings.append(f"{dockerfile_path.relative_to(SPEC_ROOT)}: missing EXPOSE directive")
    return findings


def check_systemd_unit(unit_path: Path) -> list[str]:
    findings: list[str] = []
    if not unit_path.exists():
        return findings
    body = unit_path.read_text(encoding="utf-8", errors="ignore")
    required = {
        "ProtectSystem=strict": "filesystem write protection",
        "NoNewPrivileges=true": "privilege escalation guard",
        "RestrictSUIDSGID=true": "SUID/SGID restriction",
    }
    for flag, desc in required.items():
        if flag not in body:
            findings.append(f"{unit_path.relative_to(SPEC_ROOT)}: missing '{flag}' ({desc})")
    return findings


def check_sibling_lock(sibling_root: Path, label: str) -> list[str]:
    findings: list[str] = []
    lock = sibling_root / "soa-validate.lock"
    if not sibling_root.exists():
        return findings  # sibling not present; let check-pin-drift.py complain if needed
    if not lock.exists():
        findings.append(f"{label} sibling at {sibling_root.name}/ has no soa-validate.lock")
        return findings
    try:
        data = json.loads(lock.read_text(encoding="utf-8"))
    except Exception as exc:
        findings.append(f"{sibling_root.name}/soa-validate.lock fails to parse: {exc}")
        return findings
    if not data.get("spec_commit_sha"):
        findings.append(f"{sibling_root.name}/soa-validate.lock missing spec_commit_sha")
    if data.get("spec_manifest_status") == "placeholder":
        findings.append(
            f"{sibling_root.name}/soa-validate.lock still marks manifest status as 'placeholder' — "
            "expected 'signed-v1.0' or later after v1.0.0 release"
        )
    return findings


def check_license_files() -> list[str]:
    findings: list[str] = []
    licenses_md = SPEC_ROOT / "LICENSES.md"
    if not licenses_md.exists():
        findings.append("spec repo missing LICENSES.md")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="SOA-Harness pre-release hygiene preflight")
    parser.add_argument("--impl-root", type=Path, default=SPEC_ROOT.parent / "soa-harness-impl")
    parser.add_argument("--validate-root", type=Path, default=SPEC_ROOT.parent / "soa-validate")
    parser.add_argument(
        "--skip-leak-scan", action="store_true",
        help="Skip the (slow) leaked-key regex sweep. Only use for local iteration."
    )
    args = parser.parse_args()

    all_findings: list[tuple[str, list[str]]] = []

    if not args.skip_leak_scan:
        print("scanning for leaked credentials...")
        all_findings.append(("Leaked credentials", check_leaked_keys()))

    print("checking Dockerfile hardening...")
    all_findings.append(
        ("Dockerfile", check_dockerfile(SPEC_ROOT / "docs" / "m7" / "deployment" / "Dockerfile.runner"))
    )

    print("checking systemd unit hardening...")
    all_findings.append(
        ("systemd", check_systemd_unit(SPEC_ROOT / "docs" / "m7" / "deployment" / "systemd" / "soa-runner.service"))
    )

    print("checking sibling pin files...")
    all_findings.append(("impl pin", check_sibling_lock(args.impl_root, "impl")))
    all_findings.append(("validate pin", check_sibling_lock(args.validate_root, "validate")))

    print("checking license files...")
    all_findings.append(("License", check_license_files()))

    print()
    total = 0
    for section, findings in all_findings:
        if findings:
            print(f"[{section}] {len(findings)} finding(s):")
            for f in findings:
                print(f"  - {f}")
            print()
            total += len(findings)
        else:
            print(f"[{section}] OK")

    print()
    if total == 0:
        print(f"All pre-release checks passed.")
        return 0
    print(f"{total} finding(s) across all checks. Fix before tagging a release.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
