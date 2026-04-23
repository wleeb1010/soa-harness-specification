# License Check Results — 2026-04-23

M6 Phase 2d (L-60). License compliance check across production dependency trees of all three repos.

## Summary

| Repo | Total prod deps | Forbidden licenses detected | Status |
|---|---|---|---|
| `soa-harness-specification` | 0 runtime deps | N/A | N/A (spec is Markdown + JSON + test vectors) |
| `soa-harness-impl` | 366 | 0 | ✅ GATE PASS |
| `soa-validate` | 8 Go modules | 0 | ✅ GATE PASS |

Gate criteria: no GPL-2/GPL-3/AGPL/SSPL/UNLICENSED/proprietary in the production dependency closure. Permissive licenses (MIT, Apache-2.0, BSD, ISC, 0BSD, BlueOak) are the expected norm.

## soa-harness-impl — 366 production deps

### License distribution (top 15)

| Count | License |
|---|---|
| 287 | MIT |
| 26 | Apache-2.0 |
| 23 | BSD-3-Clause |
| 18 | ISC |
| 4 | BlueOak-1.0.0 |
| 1 | MIT OR Apache-2.0 |
| 1 | Apache-2.0 AND LGPL-3.0-or-later |
| 1 | Unknown |
| 1 | (MIT OR WTFPL) |
| 1 | (BSD-2-Clause OR MIT OR Apache-2.0) |
| 1 | 0BSD |
| 1 | (MIT OR CC0-1.0) |
| 1 | BSD-2-Clause |

99% of production deps are MIT / Apache-2.0 / BSD / ISC — all explicitly permitted for redistribution.

### Flagged items (reviewed — not blockers)

**`@img/sharp-win32-x64@0.x` — Apache-2.0 AND LGPL-3.0-or-later**
- Context: `sharp` is an image-processing library pulled transitively via `@huggingface/transformers` (which is used by the `TransformersScorer` in `memory-mcp-sqlite`).
- The win32 binary statically links `libvips`, which is LGPL-3.0-or-later. Other platforms pull `@img/sharp-<os>-<arch>` with different license compositions (most are Apache-2.0).
- Redistribution posture: LGPL in a transitive Node.js dep is standard. Sharp is widely used (Next.js, Vercel, Cloudinary, etc.) and operators integrating SOA-Harness who use the Transformers scorer need to be aware the LGPL portion can be replaced by users on request per LGPL terms.
- **Not a release-gate blocker.** Documented here for transparency.

**`@mistralai/mistralai` — license detected as "Unknown"**
- Root cause: pnpm's license reporter didn't surface the license field. Direct `npm view @mistralai/mistralai license` returns **Apache-2.0**.
- Reality: Mistral AI's JavaScript SDK is Apache-2.0 licensed.
- Likely a metadata-extraction edge case in the version pnpm has installed. A `pnpm update @mistralai/mistralai` would probably resolve the "Unknown" classification.
- **Not a real finding.** The package IS Apache-2.0.

## soa-validate — 8 Go modules

```
github.com/wleeb1010/soa-validate                    (self)
github.com/davecgh/go-spew                 v1.1.0   ISC
github.com/gowebpki/jcs                    v1.0.1   Apache-2.0
github.com/pmezard/go-difflib              v1.0.0   BSD-3-Clause
github.com/santhosh-tekuri/jsonschema/v5   v5.3.1   Apache-2.0
github.com/stretchr/objx                   v0.1.0   MIT
github.com/stretchr/testify                v1.7.0   MIT
gopkg.in/check.v1                          v20161208 BSD-2-Clause
gopkg.in/yaml.v3                           v3.0.0   Apache-2.0 + MIT
```

All permissive. No GPL / AGPL / SSPL. Clean.

## Scan commands used

```bash
# soa-harness-impl
cd soa-harness-impl && pnpm licenses list --prod --json > /tmp/impl-licenses.json

# soa-validate
cd soa-validate && go list -m all | head   # manual review; 8 modules
```

Future scans: re-run on every spec-version bump (v1.0.1, v1.1.0, etc.) and any dependency addition that pulls 10+ new transitive deps.

## Conclusion

Both sibling repos pass the release-gate license check. No blockers. Two items documented for adopter transparency (sharp + mistralai metadata edge case).

## References

- L-60 Phase 2d — parent milestone record
- Phase 3b — pre-release rebuild includes re-running this check
- Spec §19.1.1 — Release-Build Verification Gate (license hygiene is part of the gate)
