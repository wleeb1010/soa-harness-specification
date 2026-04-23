# Verdaccio Staging Registry — Release Dry-Run Harness

M6 Phase 2f (L-60). Local Docker-based npm mirror used to rehearse the 8-package v1.0.0 publish before touching the real npm registry.

**Why this exists:** per critic Finding 5, going straight to the real npm registry with an unrehearsed dependency-ordered publish is asymmetric bad: if package 6 of 8 fails due to a missing peer dep or a typo in `publishConfig.tag`, you're half-published with no rollback (npm's 72-hour unpublish window is narrow; after that, packages are immutable forever). Verdaccio is a throwaway mirror: publish, verify, tear down, publish-for-real.

## Current state (2026-04-23)

Container running and reachable:

```bash
$ docker ps --filter name=soa-verdaccio
  CONTAINER ID   IMAGE                        PORTS                    NAMES
  cba1d066c1b5   verdaccio/verdaccio:latest   0.0.0.0:4873->4873/tcp   soa-verdaccio

$ curl -s http://localhost:4873/-/ping
  {}
```

The container will survive laptop reboots unless stopped. To tear down:

```bash
docker rm -f soa-verdaccio
```

To bring back up later:

```bash
docker run -d --name soa-verdaccio -p 4873:4873 verdaccio/verdaccio:latest
```

## How to run the Phase 2f dry-run

**Step 1 — Create a staging `.npmrc` (not the global one):**

```bash
cat > ~/.npmrc-staging <<'EOF'
registry=http://localhost:4873
//localhost:4873/:_authToken=soa-staging-token
@soa-harness:registry=http://localhost:4873
EOF
```

**Step 2 — Register a Verdaccio user** (one-time per container):

```bash
NPM_CONFIG_USERCONFIG=~/.npmrc-staging npm adduser --registry http://localhost:4873
# username: soa-release
# password: anything
# email: wbrumbalow@outlook.com
```

**Step 3 — Publish the 8 packages in dependency order** from the `soa-harness-impl` repo:

```bash
cd /path/to/soa-harness-impl

# Dependency chain: schemas -> core -> runner -> (sqlite|mem0|zep) -> adapter -> create-soa-agent
for pkg in \
    packages/schemas \
    packages/core \
    packages/runner \
    packages/memory-mcp-sqlite \
    packages/memory-mcp-mem0 \
    packages/memory-mcp-zep \
    packages/langgraph-adapter \
    packages/create-soa-agent
do
  echo "=== publishing $pkg ==="
  NPM_CONFIG_USERCONFIG=~/.npmrc-staging \
    npm publish "$pkg" --registry http://localhost:4873 --tag latest
done
```

Every package MUST publish cleanly. Any failure is the signal to abort the real release and investigate. Treat `ENEEDAUTH`, `E404`, `EEXIST` (version collision) as hard stops — they represent the exact failure modes that would wreck the real publish.

**Step 4 — Verify install from the staging mirror:**

```bash
cd /tmp && mkdir test-install && cd test-install
NPM_CONFIG_USERCONFIG=~/.npmrc-staging \
  npm install @soa-harness/runner@latest
node -e "import('@soa-harness/runner').then(r => console.log('runner loads:', Object.keys(r)))"
```

Expected: the runner loads without missing-peer-dep errors. Test with `create-soa-agent` too:

```bash
cd /tmp && mkdir test-scaffold && cd test-scaffold
NPM_CONFIG_USERCONFIG=~/.npmrc-staging \
  npx create-soa-agent@latest test-agent
```

Expected: scaffold produces a runnable directory under ~90s.

**Step 5 — Tear down:**

```bash
docker rm -f soa-verdaccio
rm ~/.npmrc-staging
rm -rf /tmp/test-install /tmp/test-scaffold
```

## Checklist before the real release

- [ ] All 8 packages publish cleanly to Verdaccio
- [ ] `npm install @soa-harness/runner@latest` from staging resolves every peer dep
- [ ] `npx create-soa-agent` from staging produces a runnable agent
- [ ] No unexpected warnings on publish (e.g., `deprecated`, `notice created a lockfile`)
- [ ] Publish duration per package noted (total dry-run should complete in < 2 minutes)
- [ ] Tear down ran cleanly (container gone, staging npmrc removed)

Only then proceed to Phase 3d real-publish. Do NOT re-use `~/.npmrc-staging` for the real publish — use the global `~/.npmrc` authenticated against `registry.npmjs.org`.

## Why NOT a shared CI Verdaccio

For a single-maintainer project, spinning Verdaccio per-release-rehearsal is cheaper than maintaining a long-running staging service. The container is ephemeral: pull, publish-test, tear down. If the org grows past one maintainer, consider a persistent staging service (Nexus / Artifactory) that survives across maintainers.

## References

- L-60 Phase 2f — parent milestone record
- `docs/m6/dist-tag-strategy.md` — tag semantics that the real publish follows
- `docs/m6/rollback-runbook.md` (Phase 2g, pending) — what to do if Phase 3d goes sideways
