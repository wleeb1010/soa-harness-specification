# Credential Sweep — trufflehog3 Baseline

M6 Phase 0d (L-60). Result of the mandatory pre-release credential scan across the spec repo.

## Result

**Zero HIGH severity findings.** No credentials, tokens, private keys, or known-format secrets were detected in the spec repo or its git history at the point of the scan.

**847 MEDIUM findings**, all of rule `high-entropy`. Every one of them is expected content:

| Path | Count | Explanation |
|---|---|---|
| `MANIFEST.json` | 741 | SHA256 content hashes for every artifact; every `sha256` field in the JSON looks high-entropy by design |
| `test-vectors/jcs-parity/go-cli/go.sum` | 12 | Go module content hashes |
| `test-vectors/tasks-fingerprint/README.md` | 11 | Example hashes and canonicalization output |
| `IMPLEMENTATION_LESSONS.md` | 6 | Commit SHA references in the L-XX prose |
| `test-vectors/conformance-card/agent-card.json` | 5 | Signed Agent Card JWS content |
| `SOA-Harness Core Specification v1.0 (Final).md` | 4 | Hash/fingerprint examples in normative prose |
| `test-vectors/jwt-clock-skew/*.jwt` | 12 (3×4) | JWT token content (three for each of four test vectors) |
| `MANIFEST.json.jws` | 2 | Placeholder JWS signature blob |
| Other test vectors | ~50 | Signed artifacts across various test-vector subdirectories |

## Why MEDIUM findings are safe

The `high-entropy` rule has no semantic understanding of what bytes *mean*. A 64-character hexadecimal string in a field called `sha256` looks identical to a 64-character hex API token to an entropy-based scanner. The spec repo, by design, ships a lot of hashes:
- Every artifact in `MANIFEST.json` has a `sha256` field (that's the whole point of a manifest).
- Every test vector that exercises JWS signing ships a pre-computed signature.
- Every JCS parity fixture produces a known-good hash.

Treating any of these as a secret leak would be a false positive at 100% — the repo **cannot** function without them.

## Zero HIGH is the pass gate

Pattern-based HIGH findings are what matter: AWS access keys (`AKIA…`), GitHub tokens (`ghp_…`), JWT tokens with embedded secrets, RSA/DSA/Ed25519 private key PEM blocks, Slack webhooks, etc. These have recognizable structure that would fire regardless of entropy. The scan found **none** of these.

## What the scan commands were

```bash
# Full scan, all severities, JSON output
python -m trufflehog3 --format JSON -o /tmp/trufflehog-spec-all.json .

# HIGH-only gate (the one that matters for release):
python -m trufflehog3 --severity HIGH --format JSON -o /tmp/trufflehog-spec-high.json .
```

Exit codes: `0` means no findings at the requested severity; the full scan (LOW severity) returned 0 exit only after ensuring HIGH returns empty.

## Going forward — `.trufflehog3.yml`

The `.trufflehog3.yml` config at repo root suppresses the known-artifact paths so future scans only surface *new* noise. Any new file or new path that trips `high-entropy` will still be flagged — the config only whitelists the paths we've already audited.

**Future scans** (developers, CI) should run:
```bash
python -m trufflehog3 -c .trufflehog3.yml .
```

With the config, a clean run should produce zero findings. Any new finding is a real signal.

## Sibling repos (impl, validate)

The impl + validate repos also need credential sweeps before their v1.0.0 release. Recommended scan (runs from each repo root):

```bash
# From soa-harness-impl/ or soa-validate/
pip install --user trufflehog3
python -m trufflehog3 --severity HIGH --format JSON -o /tmp/$(basename $(pwd))-trufflehog.json .
```

Expected findings in sibling repos will differ:
- impl may have test fixtures with embedded Ed25519 test keys (those are fine — not production keys)
- validate may have test JWTs (same — test content, not production credentials)
- BUT: if either repo has a `.env`, `credentials.json`, `.aws/`, or similar operator-config file, that's a real finding.

Document sibling-repo sweep results in each repo's own `docs/m6/credential-sweep-results.md`.

## References

- `.trufflehog3.yml` — path-based exclusions for known-artifact noise
- `scripts/analyze-trufflehog.py` — post-scan rollup (useful for one-off audits)
- Phase 0j CI anchor-stability — separate concern; does NOT run credential scan
- Phase 0b npm org audit — complementary: tokens + 2FA hygiene at the registry level
- L-60 Phase 0d — this doc's parent milestone record
