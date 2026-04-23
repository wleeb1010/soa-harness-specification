#!/usr/bin/env bash
# sign-manifest.sh — Bash wrapper for sign-manifest.mjs that prompts for the
# release-key passphrase silently (no echo, no shell history).
#
# USAGE
#   scripts/sign-manifest.sh --key /path/to/soa-release-v1.0.key.enc
#
# RUN FROM: spec-repo root.
# REQUIRES: Node.js 20+ on PATH, bash (Git Bash on Windows works).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Prompt silently; -s suppresses echo
echo "SOA-Harness release-key passphrase (input hidden):"
read -r -s -p "> " RELEASE_KEY_PASSPHRASE
echo ""

if [ -z "${RELEASE_KEY_PASSPHRASE}" ]; then
  echo "Empty passphrase — aborting" >&2
  exit 2
fi

export RELEASE_KEY_PASSPHRASE
cd "${SPEC_ROOT}"
node scripts/sign-manifest.mjs "$@"
ret=$?

# Scrub from env immediately
unset RELEASE_KEY_PASSPHRASE

exit "$ret"
