# Dist-Tag Promotion Strategy

M6 Phase 0h (L-60). Governs `@soa-harness/*` npm dist-tag state through the v1.0.0 release + 14-day observation window.

## Current state (pre-release)

All 8 packages are at `1.0.0-rc.X` published under the `next` dist-tag:

| Package | Current | Current dist-tag |
|---|---|---|
| `@soa-harness/schemas` | `1.0.0-rc.X` | `next` |
| `@soa-harness/core` | `1.0.0-rc.X` | `next` |
| `@soa-harness/runner` | `1.0.0-rc.X` | `next` |
| `@soa-harness/memory-mcp-sqlite` | `1.0.0-rc.X` | `next` |
| `@soa-harness/memory-mcp-mem0` | `1.0.0-rc.X` | `next` |
| `@soa-harness/memory-mcp-zep` | `1.0.0-rc.X` | `next` |
| `@soa-harness/langgraph-adapter` | `1.0.0-rc.X` | `next` |
| `create-soa-agent` | `1.0.0-rc.X` | `next` |

`next` has been the install target for RC users since M4: `npm install @soa-harness/runner@next`.

`latest` is either unset (never pointed at an RC) or pointed at the most recent RC that completed internal validation.

## Release-day (Phase 3d) — promote to `latest`

On release day, after all 8 packages publish at `1.0.0`, promote `latest` per package. Publishing order follows the dependency graph (schemas → core → runner → sqlite/mem0/zep → adapter → create-soa-agent).

```bash
# After each package successfully publishes at 1.0.0
npm dist-tag add @soa-harness/schemas@1.0.0 latest
npm dist-tag add @soa-harness/core@1.0.0 latest
npm dist-tag add @soa-harness/runner@1.0.0 latest
npm dist-tag add @soa-harness/memory-mcp-sqlite@1.0.0 latest
npm dist-tag add @soa-harness/memory-mcp-mem0@1.0.0 latest
npm dist-tag add @soa-harness/memory-mcp-zep@1.0.0 latest
npm dist-tag add @soa-harness/langgraph-adapter@1.0.0 latest
npm dist-tag add create-soa-agent@1.0.0 latest
```

Verify after each:

```bash
npm dist-tag ls @soa-harness/runner
# Expected:
#   latest: 1.0.0
#   next: 1.0.0-rc.X  (still pointing at the last RC)
```

## Post-release (Phase 3g) — 14-day observation window

For 14 days after release, maintain both tags:
- `latest` at `1.0.0` — default for new adopters
- `next` at `1.0.0-rc.X` — frozen at last RC for any adopter who was pinned to `next` and is testing migration

Adopters who had `@soa-harness/runner@next` in their `package.json` continue to resolve to the RC version until they explicitly repoint. This avoids silent upgrades for RC testers.

**Monitoring during the window:**
- GitHub issues tagged `v1.0.0`
- npm download counts per package (expected: climb as `latest` adoption grows)
- Any fresh-install verification regressions reported

**Rollback trigger (retained from Phase 2g rollback-runbook):**
- CRITICAL bug reported against v1.0.0 with a clean repro on a supported platform
- Response: publish v1.0.1 errata within 72 hours; `latest` advances to 1.0.1 and `next` stays at rc

## Day 15+ — retire `next`

Once the 14-day observation passes with no CRITICAL issues:

```bash
# Remove the `next` tag from each package
npm dist-tag rm @soa-harness/schemas next
npm dist-tag rm @soa-harness/core next
npm dist-tag rm @soa-harness/runner next
npm dist-tag rm @soa-harness/memory-mcp-sqlite next
npm dist-tag rm @soa-harness/memory-mcp-mem0 next
npm dist-tag rm @soa-harness/memory-mcp-zep next
npm dist-tag rm @soa-harness/langgraph-adapter next
npm dist-tag rm create-soa-agent next
```

After this, `npm install @soa-harness/runner@next` returns "tag not found". That is the expected end state.

## Future release tags

When v1.1.0 ships (minor release):
- Re-introduce `next` for pre-release testing of v1.1.0: `npm publish @soa-harness/runner@1.1.0-rc.1 --tag next`
- Do NOT advance `latest` to 1.1.0 until after its own 14-day window
- `latest` stays at `1.0.X` (most recent patch) during v1.1 RC period

Same pattern for v2.0.0 breaking releases.

## Package-specific notes

- **`create-soa-agent`** is the scaffolding bin (`npx create-soa-agent`). `latest` promotion matters most here — new users invoking `npx` get whichever `latest` resolves to.
- **Peer-dependency packages** (`@soa-harness/schemas`, `@soa-harness/core`): `latest` promotion must happen BEFORE dependent packages publish, otherwise `npm install @soa-harness/runner@latest` resolves peer dep to a version with no `latest` tag.

## Avoiding the `--tag nex` trap

A prior M5 incident (recorded in L-5X conversational notes) involved a typo: `--tag nex` instead of `--tag next`. Verdict: **do not rely on `--tag` flag at publish time**. Use `publishConfig` in each `package.json` to declare the publish tag; keeps the CLI invocation typo-free.

Example `package.json` snippet:
```json
{
  "publishConfig": {
    "access": "public",
    "tag": "next"
  }
}
```

For v1.0.0 release, flip each package's `publishConfig.tag` to `"latest"` as part of Phase 2a version-bump work (after the 14-day window, or omit this and run `npm dist-tag add` separately). Either is fine — just pick one and stay consistent.

## References

- L-60 Phase 0h — this doc's parent milestone record
- `docs/m6/release-orchestration.md` (Phase 2f) — the publish script that uses these tags
- `docs/m6/rollback-runbook.md` (Phase 2g) — 72-hour rollback decision tree
- Phase 3d — release-day execution using this strategy
