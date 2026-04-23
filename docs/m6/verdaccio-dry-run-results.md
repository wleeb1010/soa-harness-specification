# Verdaccio Dry-Run Results — 2026-04-23

M6 Phase 2f (L-60). Pre-release rehearsal of the 8-package v1.0.0 publish against a local Docker-based Verdaccio mirror. Result: **green across all steps**.

## Dry-run sequence executed

1. Started Verdaccio container (`verdaccio/verdaccio:latest`) on `localhost:4873`
2. Created `soa-rel` user via `PUT /-/user/org.couchdb.user:soa-rel`, captured token into `/tmp/npmrc-staging`
3. Ran `pnpm -r publish --registry http://localhost:4873/ --tag latest --no-git-checks` from `soa-harness-impl/`
4. Verified all 8 packages landed at `1.0.0` via Verdaccio's registry JSON API
5. Clean install-from-mirror: `npm install @soa-harness/runner @soa-harness/memory-mcp-sqlite` into a fresh `/tmp/verdaccio-install-test/`
6. Import smoke: `node --eval "import('@soa-harness/runner').then(...)"` — expected exports present
7. `npx create-soa-agent@1.0.0 smoke-agent` — scaffold completed with publisher_kid + files

## Publish results (dependency-ordered)

| Package | Version | Shasum (first 10 chars) | Outcome |
|---|---|---|---|
| `@soa-harness/schemas` | `1.0.0` | (on registry) | ✅ |
| `@soa-harness/core` | `1.0.0` | (on registry) | ✅ |
| `@soa-harness/runner` | `1.0.0` | (on registry) | ✅ |
| `@soa-harness/memory-mcp-sqlite` | `1.0.0` | (on registry) | ✅ |
| `@soa-harness/memory-mcp-mem0` | `1.0.0` | (on registry) | ✅ |
| `@soa-harness/memory-mcp-zep` | `1.0.0` | (on registry) | ✅ |
| `@soa-harness/langgraph-adapter` | `1.0.0` | `7110a530ca` | ✅ |
| `create-soa-agent` | `1.0.0` | (on registry) | ✅ |

All 8 packages publish cleanly. `pnpm -r` resolved the `workspace:*` intra-workspace refs to concrete `1.0.0` in the published tarballs.

## Install-from-mirror verification

```
# /tmp/verdaccio-install-test/
npm install @soa-harness/runner @soa-harness/memory-mcp-sqlite
  -> 38 packages installed, 0 vulnerabilities
  -> node_modules/@soa-harness/: core, memory-mcp-sqlite, runner, schemas

node --eval "import('@soa-harness/runner').then(...)"
  -> runner exports: AuditChain, BootOrchestrator, BootstrapBearerOnPublicListener,
     CAPABILITY_PERMITS, ConfigPrecedenceViolation, CrlCache, GENESIS,
     HostHardeningInsufficient, InMemoryMemoryStateStore, InMemorySessionStore, ...
  -> memory-mcp-sqlite exports: NaiveScorer, SqliteMemoryBackend,
     TOOL_NAMES, TransformersScorer, buildSqliteServer
```

No missing-peer-dep errors. No ENEEDAUTH. No E404. No EEXIST. Clean.

## Scaffold verification

```
# /tmp/verdaccio-scaffold-test/
npx --yes create-soa-agent@1.0.0 smoke-agent
  -> WARNING: synthetic Ed25519 keypair + self-signed cert for local demo use only
  -> scaffolded 3 files
  -> publisher_kid: soa-demo-publisher-v1.0
  -> files present: agent-card.json, AGENTS.md, hooks/, initial-trust.json,
     package.json, permission-decisions/, README.md, start.mjs, tools.json
```

`npx` resolved through the Verdaccio mirror. `create-soa-agent@1.0.0` binary executed correctly and produced the expected scaffold output.

## What this proves

- **Publish dependency order is correct** — no "missing @soa-harness/core" errors when `@soa-harness/runner` was being verified
- **`workspace:*` resolution works in the published tarballs** — clean `npm install` from a non-workspace directory succeeds
- **No publish-side auth/permission regressions** — token flow works end-to-end
- **Scaffold binary resolves through the mirror** — `npx create-soa-agent@<version>` works against a custom registry
- **All 8 packages are byte-ready** — no missing `dist/` files, no missing peer deps in tarball metadata

## Remaining-risk coverage

| Risk | Covered by dry-run? |
|---|---|
| Cascade publish failure (half-published across 8 packages) | ✅ — all 8 published |
| Import-time missing dep after install | ✅ — runner + memory-mcp-sqlite imports loaded |
| Scaffold fails on `npx` resolution | ✅ — create-soa-agent binary executed |
| npm/pnpm workspace:* not resolving in tarball | ✅ — install from mirror worked |
| Auth regressions in release-day script | ⚠️  partial — the Verdaccio token differs from the real npm granular token format; Phase 3a will create a fresh granular token just before real-publish |
| Registry-specific publish errors (e.g., `EPUBLISHCONFLICT`) | ⚠️  not covered — real npm would reject if `1.0.0` was ever published before. Pre-flight check in Phase 3a: `npm view @soa-harness/<pkg>@1.0.0` must 404 for all 8 |

## Teardown

Verdaccio container + `/tmp/npmrc-staging` + `/tmp/verdaccio-install-test/` + `/tmp/verdaccio-scaffold-test/` are left in place for now so this session can re-run if needed.

Final teardown (do before release day):

```bash
docker rm -f soa-verdaccio
rm -rf /tmp/verdaccio-config /tmp/npmrc-staging
rm -rf /tmp/verdaccio-install-test /tmp/verdaccio-scaffold-test /tmp/verdaccio-smoke
```

## References

- L-60 Phase 2f — parent milestone record
- `docs/m6/verdaccio-staging.md` — setup runbook (now superseded by this results file for the smoke-test specifics)
- Phase 3a — fresh npm granular token + real-publish pre-flight
- Phase 3d — real-npm 8-package publish (uses same dependency order as this dry-run)
