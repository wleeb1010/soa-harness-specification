# Errata Policy — SOA-Harness v1.0 and Forward

M6 Phase 0f (L-60). Defines how changes are classified after v1.0.0 ships. Downstream adopters rely on this policy to make informed upgrade decisions.

Aligns with §19.4 versioning. This document narrows §19.4 into a decision tree and pre-classifies common scenarios.

## The three change classes

### Editorial (v1.0.0 → v1.0.1)

**Definition:** Prose clarification, typo fix, non-normative addition, or correction that does not change any wire format, any signed artifact's byte content, any test ID, any conformance requirement, or any section anchor.

**Examples that qualify:**
- Fixing a typo in a prose paragraph
- Adding a clarifying sentence to a §X.Y.Z subsection
- Correcting a JSON example that was inconsistent with the schema (schema unchanged)
- Adding a new informative subsection (e.g., deployment guidance)
- Adding a missing citation to a test ID that already exists
- Appending a new L-XX record to IMPLEMENTATION_LESSONS.md *before* v1.0.0 release (post-release, L-XX goes into ERRATA.md)

**Gate:** No impl changes required. No validator changes required. Adopters upgrade optionally. Default assumption: safe to upgrade.

**What you must do:**
- Document in `ERRATA.md` under the `v1.0.1` heading
- Bump `MANIFEST.json` `spec_version` to `1.0.1`
- Regenerate `MANIFEST.json.jws` with the same release key
- Do NOT change any test ID
- Do NOT change any section anchor
- Pre-commit hook (`.git/hooks/pre-commit` via `verify-anchor-stability.py`) must still pass

### Minor (v1.0.0 → v1.1.0)

**Definition:** Backward-compatible addition. A new optional field in a signed schema. A new test ID for a previously-unverified requirement. A new section. A new normative capability that implementations MAY support. Upstream protocol version bump in a non-breaking way.

**Examples that qualify:**
- Adding an optional field to Agent Card schema that existing parsers ignore
- Adding a new test ID (e.g., SV-MEM-09) to cover a previously untested MUST
- Adding a new §X.Y subsection that defines new optional behavior
- Introducing a new `profile` (e.g., `core+multiregion`) that is additive
- Adding a new MCP tool name to §8.1's permitted list
- Introducing a new `stop_reason` enum value

**Gate:** Existing impls continue to conform. New impls can leverage new features. Validator adds new tests.

**What you must do:**
- Document in `CHANGELOG.md` under the `v1.1.0` heading with migration notes
- Bump `MANIFEST.json` `spec_version` to `1.1.0`
- Regenerate `MANIFEST.json.jws` (same release key; rotate only on a breaking security need)
- Pin-bump sibling repos (`soa-harness-impl`, `soa-validate`) in separate PRs after spec tag lands
- If new test IDs added: ensure test-ID anchor stability for *existing* tests; new IDs start fresh
- If the `core` profile changed, flag it explicitly — anything that affects `core` is higher-risk than an additive `core+X` profile change

### Breaking (v1.0.0 → v2.0.0)

**Definition:** Any change that invalidates existing conformant implementations. Removing a required field. Changing a wire format. Renaming or removing a test ID. Changing a section anchor that is referenced from a test mapping. Rotating the release key for reasons other than compromise. Changing what "`core` conformance" means.

**Examples that qualify:**
- Removing a required field from Agent Card schema
- Renaming `SV-MEM-01` to `SV-MEMORY-01`
- Changing the JSON encoding of StreamEvent from RFC 8785 JCS to something else
- Removing a `stop_reason` enum value
- Making a previously-optional field required
- Rotating the release key for a non-security reason (upgrading to YubiKey is breaking *only* if the old key is still valid; doing it as rotation is editorial)

**Gate:** Existing impls lose conformance until they adapt. Validator ships a new major version in lock-step with the spec. Adopters must explicitly opt in via version pin.

**What you must do:**
- Document in `BREAKING-CHANGES.md` (new file) with migration path per breaking change
- Bump `MANIFEST.json` `spec_version` to `2.0`
- Regenerate `MANIFEST.json.jws`
- Tag `v2.0.0` explicitly; do NOT alias `latest` to v2 until the validator also ships v2
- Preserve v1.x branch for at least 12 months — security fixes still land on v1.x as `v1.0.2`, `v1.0.3`, etc.
- Announce in advance via `DEPRECATION-NOTICE.md` where possible; no-notice breaking changes are only acceptable for security incidents

## Decision tree

```
Change proposed
    |
    +-- Does it change a signed artifact's byte output?
    |       Yes -> at minimum editorial; check next
    |       No  -> editorial
    |
    +-- Does it change a wire format, schema required field,
    |   test ID, or section anchor referenced by a test?
    |       Yes -> breaking
    |       No  -> check next
    |
    +-- Does it add new required behavior, new required field,
    |   or change `core` profile semantics?
    |       Yes -> minor (if existing impls still pass) OR breaking
    |       No  -> editorial or minor depending on visibility
```

## Pre-classified scenarios

| Scenario | Class | Rationale |
|---|---|---|
| Fix typo in §10.3.1 prose | Editorial | No wire change, no test impact |
| Add optional `trace_id` to StreamEvent schema | Minor | Existing impls ignore unknown fields (§14.1) |
| Rename `SV-MEM-03` | Breaking | Test IDs are a conformance contract |
| Remove `§8.7.4` informative subsection | Editorial | Informative removal does not affect conformance |
| Remove `§8.7.4` normative subsection | Breaking | Removes a requirement impls may already be meeting |
| Add new MCP memory tool `archive_memory_note` | Minor | Additive; impls that don't support it remain conformant |
| Clarify that "MUST" in §10.3 means "immediately, synchronously" | Breaking (if existing reading allowed async) | Tightens a constraint |
| Add test `SV-BUD-08` for an untested MUST | Minor | Existing impls may fail the new test — they were always non-conformant, test merely reveals it. Non-breaking *to the spec*, breaking *to impls that were never truly compliant*. Expose clearly in CHANGELOG. |
| Rotate release key due to compromise | Editorial | v1.0.1 errata with explicit rotation notice |
| Rotate release key for key-material upgrade (YubiKey) | Editorial | Same spec content, new signature — no impl impact if public-key fingerprint is updated in MANIFEST and re-signed |

## Process

1. **Proposed change opens as an issue** in `soa-harness-specification` repo, labeled with the proposed class.
2. **Maintainer reviews classification** using the decision tree above. Disagreements default to the more conservative (higher) class.
3. **PR opens** with the change plus the ERRATA/CHANGELOG entry drafted.
4. **Sibling repos are NOT touched in the same PR** (per CLAUDE.md guidance). Spec PR lands first; sibling pin-bump follows as separate reviewable PRs.
5. **Release is cut** per §19.4 — tag, signed MANIFEST, GitHub release.

## Edge cases

- **Multiple changes in one release:** the release is classified at the level of the highest-class change. One breaking change + ten editorial fixes = breaking release.
- **Security fixes on v1.0.x:** back-ported as v1.0.Z patches even after v1.1 or v2.0 ships. Patch is editorial unless the fix requires API changes.
- **Discovered ambiguity:** if a MUST is ambiguous and the clarification might break some reasonable interpretation, treat as breaking. Don't assume all impls read it the way you did.
- **Test-vector content change:** changing a test vector's expected output is breaking even if the schema didn't change. Impls validated against the old expected output will regress.

## References

- §19.4 (Core spec) — versioning rules this document refines
- `CHANGELOG.md` — cumulative change log
- `ERRATA.md` — per-patch errata list
- L-60 Phase 0f — this doc's parent milestone record
- `.git/hooks/pre-commit` — enforces test-ID + anchor stability automatically
