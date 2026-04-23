# Release Day Runbook — v1.0.0

M6 Phase 3 (L-60). Step-by-step operator procedure for the day you actually ship v1.0.0. Everything in Phase 0-2 is done; this is the execution.

Estimated time: **2-3 hours total**, with 72-hour monitoring window after.

**Prerequisites** (all confirmed by commits already pushed):
- ✅ Phase 0 complete (key ceremony, npm audit, test-ID stability, errata policy, etc.)
- ✅ Phase 1 complete (content refactor, CHANGELOG, ERRATA template, README sweeps)
- ✅ Phase 2a-2d, 2f, 2g done (version bumps, docs archived, license + credential checks, Verdaccio rehearsal, rollback runbook)
- ✅ Encrypted release key backed up to two offline locations
- ✅ Public key committed at `keys/soa-release-v1.0.pub`
- ✅ All three repos public on GitHub
- ✅ All three working trees clean (no uncommitted/untracked spec-relevant content)

## Day-of sequence

### Step 1 — Final dry-run against Verdaccio (Phase 3a, ~15 min)

Verify the release script preflight still passes cleanly. From spec repo root:

```bash
# Tear down any stale Verdaccio state from earlier rehearsals
docker rm -f soa-verdaccio 2>/dev/null || true
rm -rf /tmp/verdaccio-config /tmp/npmrc-staging /tmp/verdaccio-install-test /tmp/verdaccio-scaffold-test

# Bring up a fresh Verdaccio
mkdir -p /tmp/verdaccio-config
cat > /tmp/verdaccio-config/config.yaml << 'EOF'
storage: /verdaccio/storage
auth:
  htpasswd: { file: /verdaccio/storage/htpasswd, max_users: 1000 }
uplinks:
  npmjs: { url: https://registry.npmjs.org/ }
packages:
  '@soa-harness/*': { access: $all, publish: $all, proxy: npmjs }
  'create-soa-agent': { access: $all, publish: $all, proxy: npmjs }
  '@*/*': { access: $all, publish: $all, proxy: npmjs }
  '**': { access: $all, publish: $all, proxy: npmjs }
logs: { type: stdout, level: warn }
EOF
docker run -d --name soa-verdaccio -p 4873:4873 \
  -v /tmp/verdaccio-config:/verdaccio/conf verdaccio/verdaccio:latest
sleep 5

# Register + capture token
TOKEN=$(curl -s -X PUT "http://localhost:4873/-/user/org.couchdb.user:soa-rel" \
  -H "Content-Type: application/json" \
  -d '{"name":"soa-rel","password":"stage","email":"x@x.com"}' \
  | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token||'')")
cat > /tmp/npmrc-staging << EOF
registry=http://localhost:4873/
@soa-harness:registry=http://localhost:4873/
//localhost:4873/:_authToken=${TOKEN}
EOF

# Run the real script in staging mode
NPM_CONFIG_USERCONFIG=/tmp/npmrc-staging node scripts/release-v1.0.mjs \
  --impl-root ../soa-harness-impl --registry http://localhost:4873/
```

Expected: 8/8 "OK (<elapsed>ms)" lines, `release-log.json` written, `overall_status: success`.

If ANY package fails here, stop and triage per `docs/m6/rollback-runbook.md` Mode 1 BEFORE touching real npm.

### Step 2 — Sign MANIFEST.json.jws with the real key (Phase 2e, ~10 min)

Still in spec repo root. Have your password manager open and ready to paste the release-key passphrase.

```bash
# Regenerate MANIFEST.json first so its digest set is up-to-date
node build-manifest.mjs
# This writes MANIFEST.json.jws with the PLACEHOLDER signature.

# Now replace the placeholder with a real signature
scripts/sign-manifest.sh --key C:/Users/wbrumbalow/soa-release-material/soa-release-v1.0.key.enc
```

You'll be prompted for the passphrase (no echo). Expected output:

```
SOA-Harness release-key passphrase (input hidden):
> [paste from password manager, press Enter]
Loading encrypted private key: C:/Users/wbrumbalow/soa-release-material/soa-release-v1.0.key.enc
Key fingerprint (b64url SHA-256 of DER pubkey): l5TzOjMJfyyDTuEarut87i3T8KhGBV4AeLwOXo028vI=
MANIFEST.json JCS byte length: <N>
JWS header: {"alg":"EdDSA","kid":"soa-release-v1.0","typ":"soa-manifest+jws"}
Self-verify: OK
Wrote: .../MANIFEST.json.jws
  length: <N> chars
  signature preview: <first16>...<last8>
```

**Fingerprint must equal `l5TzOjMJfyyDTuEarut87i3T8KhGBV4AeLwOXo028vI=`.** If it differs, you signed with the wrong key — STOP.

If decryption fails ("wrong passphrase or corrupt key file"), see `docs/m6/rollback-runbook.md` Mode 4.

Commit + push the real JWS:

```bash
git add MANIFEST.json MANIFEST.json.jws
git commit -m "M6 Phase 2e: sign MANIFEST.json.jws with v1.0 release key

Fingerprint: l5TzOjMJfyyDTuEarut87i3T8KhGBV4AeLwOXo028vI=
Algorithm: EdDSA (Ed25519)
Signing input: JCS-canonicalized MANIFEST.json bytes
Format: detached compact JWS per RFC 7515 B.1
Self-verified via scripts/sign-manifest.mjs before write"
git push origin main
```

### Step 3 — Create the fresh granular npm token (Phase 3a, ~5 min)

Open in a browser: `https://www.npmjs.com/settings/wleeb/tokens/granular-access-tokens/new`

- Token description: `soa-harness v1.0.0 release — <today's date>`
- Expiration: **4 days** (covers today + 72h monitoring window + small buffer)
- Packages and scopes:
  - Scope: "Select packages and scopes" → organization → `@soa-harness`
  - Permissions: Read and write (Read/Write/Publish/Unpublish)
  - Also add `create-soa-agent` individually (same permissions)
- Click "Generate token" → copy the `npm_...` value

In your terminal:

```bash
# Configure npm to use this token for publishes
echo "//registry.npmjs.org/:_authToken=npm_<paste-token-here>" > ~/.npmrc-release
npm whoami --registry https://registry.npmjs.org/ --userconfig ~/.npmrc-release
# Should print: wleeb

# Verify scope
npm access get permissions @soa-harness/schemas --userconfig ~/.npmrc-release
# Should confirm write access
```

### Step 4 — Tear down Verdaccio + run the REAL release script (Phase 3d, ~30 min)

```bash
docker rm -f soa-verdaccio

# Execute the real publish to npmjs.org
NPM_CONFIG_USERCONFIG=~/.npmrc-release node scripts/release-v1.0.mjs \
  --impl-root ../soa-harness-impl
```

Expected: 8/8 packages publish in order; each takes ~5-15s. Total ~2-5 min. `release-log.json` shows `overall_status: success`.

If ANY package fails: STOP. See `docs/m6/rollback-runbook.md` Mode 1. The script halts on first failure and writes the partial log.

Verify all 8 are live on real npm:

```bash
for pkg in schemas core runner memory-mcp-sqlite memory-mcp-mem0 memory-mcp-zep langgraph-adapter; do
  npm view @soa-harness/$pkg@1.0.0 version
done
npm view create-soa-agent@1.0.0 version
```

All 8 should print `1.0.0`.

### Step 5 — Tag v1.0.0 on all three repos (Phase 3e, ~5 min)

**Spec repo** (first, since impl + validate pin to its MANIFEST digest):

```bash
# From spec repo root
git tag -a v1.0.0 -m "SOA-Harness v1.0.0 — initial public release"
git push origin v1.0.0
```

**Impl repo**:

```bash
cd ../soa-harness-impl
git tag -a v1.0.0 -m "SOA-Harness impl v1.0.0 — all 8 packages at 1.0.0 on npm"
git push origin v1.0.0
```

**Validate repo**:

```bash
cd ../soa-validate
git tag -a v1.0.0 -m "SOA-Harness validate v1.0.0 — 234 Core + 186 UI test IDs"
git push origin v1.0.0
```

### Step 6 — GitHub releases per repo (Phase 3f, ~15 min)

```bash
# Spec repo
cd ../soa-harness=specification
gh release create v1.0.0 \
  --title "SOA-Harness v1.0.0" \
  --notes-file RELEASE-NOTES.md \
  MANIFEST.json MANIFEST.json.jws

# Impl repo
cd ../soa-harness-impl
gh release create v1.0.0 \
  --title "SOA-Harness Impl v1.0.0" \
  --notes "TypeScript reference runtime for SOA-Harness v1.0. 8 packages live on npm under \`@soa-harness/*\` + \`create-soa-agent\`. See [spec release notes](https://github.com/wleeb1010/soa-harness-specification/releases/tag/v1.0.0) for the full narrative."

# Validate repo
cd ../soa-validate
gh release create v1.0.0 \
  --title "soa-validate v1.0.0" \
  --notes "Go conformance harness for SOA-Harness v1.0. Install: \`go install github.com/wleeb1010/soa-validate/cmd/soa-validate@v1.0.0\`. See [spec release notes](https://github.com/wleeb1010/soa-harness-specification/releases/tag/v1.0.0) for the full narrative."
```

### Step 7 — Smoke test on a fresh environment (~20 min)

In a fresh directory (new terminal window, clean cwd):

```bash
cd /tmp && mkdir release-smoke && cd release-smoke
npm install @soa-harness/runner @soa-harness/memory-mcp-sqlite
node -e "import('@soa-harness/runner').then(r => console.log('runner exports:', Object.keys(r).length))"

# Also test the scaffold
cd /tmp && mkdir scaffold-smoke && cd scaffold-smoke
npx create-soa-agent@1.0.0 fresh-agent
cd fresh-agent && npm install && timeout 30 node ./start.mjs &
sleep 10
curl -s http://127.0.0.1:7700/health | grep -q "alive" && echo "SMOKE PASS" || echo "SMOKE FAIL"
kill %1 2>/dev/null
```

Expected: SMOKE PASS.

### Step 8 — Revoke the release token + begin 72-hour monitoring (Phase 3g)

```bash
# Revoke the release token via UI: https://www.npmjs.com/settings/wleeb/tokens
# Find the token you created in Step 3, click "Delete"

# Remove local release npmrc
rm ~/.npmrc-release
```

**Begin 72-hour monitoring window.** Checklist from `docs/m6/rollback-runbook.md`:
- [ ] GitHub issues per repo: check every 4 hours
- [ ] `npx create-soa-agent` smoke-test on Windows 11 + WSL2 + macOS
- [ ] npm download counts climb (not flat)
- [ ] Zero CRITICAL issue reports
- [ ] `latest` dist-tag still at 1.0.0 per package

If anything breaks, activate the appropriate rollback mode.

### Step 9 — Seal the release (Day +3)

After 72 hours with no rollback triggers:

- Write a closing IMPLEMENTATION_LESSONS entry (L-61): "v1.0.0 sealed 2026-04-XX, 72-hour monitoring passed, stat summary, any lessons learned"
- Commit + push to spec repo
- Consider: retire the `next` dist-tag 14 days after release (per `docs/m6/dist-tag-strategy.md`)

## Total effort

| Step | Time |
|---|---|
| 1. Verdaccio dry-run | 15 min |
| 2. MANIFEST signing | 10 min |
| 3. npm token creation | 5 min |
| 4. Real publish | 30 min |
| 5. Git tags | 5 min |
| 6. GitHub releases | 15 min |
| 7. Smoke test | 20 min |
| 8. Token revoke + monitor start | 5 min |
| **Total day-of** | **~105 min** |
| **Plus 72-hour monitoring** | passive |

## If you need to abort

Between Steps 1 and 4, aborting is safe: nothing has touched real npm. Tear down Verdaccio, rollback any local commits, try again another day.

After Step 4 (anything published to real npm), you CANNOT cleanly abort. Fix forward via `docs/m6/rollback-runbook.md`.

## References

- `docs/m6/rollback-runbook.md` — failure-mode decision trees
- `docs/m6/verdaccio-dry-run-results.md` — Phase 2f baseline
- `docs/m6/dist-tag-strategy.md` — post-release dist-tag handling
- `docs/errata-policy.md` — for any v1.0.1+ patches after release
- `scripts/release-v1.0.mjs` — the publish orchestration script
- `scripts/sign-manifest.mjs` + `.sh` — MANIFEST signing
- L-60 Phase 3 — parent milestone record
