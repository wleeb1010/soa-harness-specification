# External Normative Reference Mirrors

Per Core §19.4.3 (Upstream-Protocol Compatibility Horizon) and Core §2 drift-policy note, this directory mirrors the exact revisions of external normative references pinned by SOA-Harness v1.0. Mirror content is included in the release bundle so that conformance remains verifiable even when upstream URLs churn or disappear.

Each entry is identified by the SHA-256 digest recorded in `soa-validate-must-map.json` (manifest entries) and in `MANIFEST.json.artifacts.supplementary_artifacts`. Implementations fetching an external reference MUST:

1. Attempt the canonical upstream URL listed in §2.
2. If the fetch fails, or if the fetched content's SHA-256 differs from the manifest entry, fall back to the file in this directory.
3. Emit a `soa-validate` warning `UpstreamDriftObserved` when step 2 triggers; this is informative, not a conformance failure.

## Expected mirror contents (v1.0)

| File | Upstream | Manifest digest entry |
|---|---|---|
| `mcp-spec-2026-04-03.md` | `https://modelcontextprotocol.io/specification/2026-04-03` | `mcp-spec-2026-04-03` |
| `a2a-0.3.1.md` | A2A upstream repo tag `v0.3.1` | `a2a-0.3.1` |

## Current status

Mirror files are **not yet populated** in this draft. Populating them is a v1.0 release-bundle build step (§19.1.1 release gate). Absence of mirrors in a draft build does not invalidate the spec text; it does mean conformance tools running against this draft cannot exercise the drift-fallback path.
