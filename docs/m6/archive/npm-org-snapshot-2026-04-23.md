# npm Org Snapshot — @soa-harness — 2026-04-23

M6 Phase 0b (L-60). Authoritative pre-release snapshot of the `@soa-harness` npm org state. Captured automatically via `npm org ls` + `npm access list packages` + `npm token list`.

## Authenticated as

```
wleeb
```

## Org members

```
wleeb - owner
```

**State: clean.** Single-maintainer org with the operator as sole owner. No other members to 2FA-audit. No unexpected access.

## Packages owned (across the org + single top-level)

| Package | Access |
|---|---|
| `@soa-harness/core` | read-write |
| `@soa-harness/schemas` | read-write |
| `@soa-harness/runner` | read-write |
| `@soa-harness/memory-mcp-sqlite` | read-write |
| `@soa-harness/memory-mcp-mem0` | read-write |
| `@soa-harness/memory-mcp-zep` | read-write |
| `@soa-harness/langgraph-adapter` | read-write |
| `create-soa-agent` | read-write |

**State: clean.** 8/8 expected packages present. No unexpected packages. No other maintainers attached to any package.

## Personal access tokens

```
(none)
```

**State: clean.** No stale tokens to revoke before v1.0.0 release. A fresh granular token for the 8-package publish will be created on release day (Phase 3a) with `@soa-harness/*` scope and an expiration matching the 72-hour monitoring window.

## 2FA + security settings

The `npm` CLI cannot query or toggle org-wide security settings. These must be verified in the browser:

- URL: `https://www.npmjs.com/settings/soa-harness/security`
- "Require 2FA for members" — **VERIFY ON**
- "Require 2FA for publish" — **VERIFY ON**

Also verify personal 2FA at `https://www.npmjs.com/settings/wleeb/profile`:
- Authenticator app or WebAuthn registered
- Recovery codes saved offline

Once the browser-side check passes, add a note below with the date:

```
2FA browser-verification: <DATE>  by: <operator name>
  org-level "Require 2FA for members":  on
  org-level "Require 2FA for publish":  on
  personal 2FA method:                  authenticator | webauthn
```

## Red flags detected

None.

## Release-day token creation (future, Phase 3a)

When Phase 3a runs:
1. Create a fresh granular token at `https://www.npmjs.com/settings/wleeb/tokens/granular-access-tokens/new`
2. Scope: `@soa-harness/*` publish; `create-soa-agent` publish
3. Expiration: 4 days (covers release-day publish + 72-hour monitoring window + buffer)
4. Save to password manager; never commit
5. Revoke at Phase 3g close

## Sources

- `npm org ls @soa-harness` — org member list
- `npm access list packages` — package ownership
- `npm token list` — personal token inventory
- Manual browser check — 2FA org settings (operator to run)

## References

- L-60 Phase 0b — parent milestone record
- `docs/m6/npm-org-audit.md` — full audit runbook
- Phase 3a (future) — fresh granular token creation
- Phase 3g (future) — token revocation
