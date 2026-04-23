# Errata — SOA-Harness Specification

Per-patch errata for versions after the initial 1.0.0 release. Errata entries are authored per the decision tree in `docs/errata-policy.md` and the classification rules in Core §19.4.

Every entry MUST cite:
- The version that introduces the errata
- The section(s) affected
- The class (editorial / minor / breaking)
- A one-sentence summary of what changed
- A longer paragraph describing the problem and the resolution
- Links to the PR + release commit

---

## v1.0.0 errata — (none yet)

No errata entries exist at v1.0.0 initial release. This file will accumulate entries as they are issued.

The first errata — if and when one is needed — will be classified editorial (v1.0.1), minor (v1.1.0), or breaking (v2.0.0) per `docs/errata-policy.md`.

---

## Template for future entries

Copy this block verbatim when opening an errata PR. Fill every field. Do not merge an errata that omits the version, class, or resolution paragraph.

```markdown
### v{VERSION} — {YYYY-MM-DD} — {one-line title}

**Class:** editorial | minor | breaking
**Sections affected:** §X.Y, §X.Z
**Test IDs affected:** (none | SV-XYZ-NN, HR-NN)
**Summary:** {one sentence}

**Problem:**

{Plain description of what was wrong. Cite the exact section text and the exact test-ID mapping if applicable. If the bug was reported by someone external, credit them (with permission) and link the issue.}

**Resolution:**

{Plain description of the fix. What changed in the spec, the schema, the test IDs, the must-map, or the test vectors. If the fix requires impl changes, say what. If it requires validator changes, say what. If sibling repos must pin-bump, say so.}

**Migration (if not editorial):**

{Step-by-step what adopters do to stay conformant. Include a dated cutoff if relevant.}

**Commit:** `<spec-repo-sha>`
**PR:** `https://github.com/wleeb1010/soa-harness-specification/pull/<N>`
**Release tag:** `v{VERSION}`
**MANIFEST digest change:** {yes / no — yes if any signed artifact's SHA256 moved}
```

---

## Rules of the road

1. **Every errata lands in the spec repo first.** Sibling `soa-harness-impl` and `soa-validate` repos pin-bump AFTER the spec tag lands — never in the same PR.
2. **Classification is conservative.** When unsure between editorial and minor, pick minor. When unsure between minor and breaking, pick breaking. Downstream adopters prefer to be over-warned.
3. **Test IDs are permanent.** A test ID MAY be deprecated (marked so, left in the must-map until v2.0.0) but MAY NOT be silently renamed or removed.
4. **Section anchors are permanent.** An anchor MAY move to a new file or a new number under a breaking release; in editorial and minor, anchors never change.
5. **Signed-artifact digest changes require MANIFEST regen + re-sign.** This is always ceremony per `docs/m6/release-key-ceremony.md`.

## References

- `docs/errata-policy.md` — detailed decision tree
- `CHANGELOG.md` — cumulative change log (broader than errata)
- Core §19.4 — versioning rules
- `.git/hooks/pre-commit` — blocks anchor-breaking commits locally
- `.github/workflows/anchor-stability.yml` — same check in CI
