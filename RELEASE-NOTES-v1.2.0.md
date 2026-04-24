# SOA-Harness v1.2.0 Release Notes

Adopter-facing narrative for v1.2.0. For the line-by-line changelog, see `CHANGELOG.md`. For change classification, see `docs/errata-policy.md`.

v1.2.0 is an **additive minor release** per §19.4. A v1.0 or v1.1 conformance claim remains valid with zero code changes — v1.2 only adds new capabilities.

---

## What's new

### §16.6 Streaming Dispatcher — normative (Core specification)

The v1.1 sync dispatcher (§16.3) always returned a single JSON response per dispatch. v1.2 adds streaming mode: `POST /dispatch` with `Accept: text/event-stream` + body `stream: true` yields an SSE response carrying the §14.1 StreamEvent sequence (`MessageStart` → `ContentBlockStart` → `ContentBlockDelta` (N) → `ContentBlockEnd` → `MessageEnd`).

- **§16.6.1** — optional `ProviderAdapter.dispatchStream?()` surface. Sync-only adapters stay v1.0-conformant; streaming-capable adapters advertise via the optional method.
- **§16.6.2** — HTTP surface: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, SSE framing `event: <type>\ndata: <JCS(event)>\n\n`, terminal `: stream-done` comment before TCP close (SHOULD, not MUST — TCP close is SSE-native termination).
- **§16.6.3** — sequence invariants: exactly one `MessageStart`/`MessageEnd`, `ContentBlockDelta` only inside a matched `ContentBlockStart`/`ContentBlockEnd` pair, strict per-session sequence monotonicity.
- **§16.6.4** — mid-stream cancellation endpoint: `POST /dispatch/{correlation_id}/cancel` returns `202 Accepted` + fires the abort signal on the adapter's `dispatchStream` iterator. 404 on unknown correlation IDs (idempotent), 400 on malformed, 429 rate-limited.
- **§16.6.5** — reserves three new test IDs: `SV-LLM-08` (SSE framing), `SV-LLM-09` (adapter-unsupported → 406), `SV-LLM-10` (sequence invariants). `SV-LLM-05` flipped skip → live.

### §14.1.1 MessageEnd payload extension

`MessageEnd` payload schema adds optional `stop_reason` + `dispatcher_error_code` properties so streaming dispatches can carry terminal classification on the wire. v1.1 producers emitting only `{message_id, usage}` remain schema-valid (v1.2 schema `required` unchanged).

### §24 Error Code Taxonomy — Dispatcher additions

- `DispatcherStreamUnsupported` (`-32111`) — adapter lacks `dispatchStream` but client requested SSE. Runner responds HTTP 406.
- `DispatcherAdapterError` (`-32112`) — adapter-internal failure surfaced through a streaming dispatch.

### New packages (reference implementation)

- **`@soa-harness/chat-ui`** — React + TypeScript. Direct-to-Runner chat UI with SSE consumer, permission prompt overlay, audit tail viewer. WCAG 2.1 AA targets (`role="log"` + `aria-live="polite"` on the message list, focus-trapped `role="dialog"` on permission prompts, visually-hidden `role="status"` for audit-tail announcements). Zero dependencies beyond React + `@soa-harness/runner`.
- **`@soa-harness/cli`** — `soa` command-line client. Subcommands: `soa status`, `soa audit tail`, `soa chat` (streaming REPL), `soa conform` (wraps `soa-validate`). Library export of `RunnerClient` for programmatic use.

### New tooling (not published to npm)

- **`tools/vscode-extension`** — stub-level VS Code extension. Reads `.soa/config.json` for Runner URL + session bearer, renders Runner status tree in the Explorer sidebar, `soaHarness.dispatch` command fires a sync dispatch from the editor, `soaHarness.tailAudit` opens a terminal running `soa audit tail`. Load via "Install from VSIX…" or F5 in an Extension Development Host — not on the VS Code marketplace in v1.2.

### Validator additions (`soa-validate`)

- `SV-LLM-05` live probe: streams a 5-delta dispatch, cancels after delta 2, asserts no further deltas + terminal `MessageEnd.stop_reason = "UserInterrupt"` + `dispatcher_error_code = null`.
- `SV-LLM-08` live probe: SSE framing (`Content-Type`, `event:` / `data:` lines, `\n\n` delimiter).
- `SV-LLM-09` skip: adapter-unsupported 406 path. Unit-tested in impl; live probe needs a boot-flag to disable streaming in the test-double (v1.2.x).
- `SV-LLM-10` live probe: sequence invariants.
- `SV-COMPAT-05` live: `/version` surfaces `spec_commit_sha` (40-char hex). Debt #7 regression guard.
- `SV-COMPAT-06` live: `/version runner_version` is semver-shaped (rejects the stale hard-coded `"1.0"` that shipped in v1.1.0).
- `SV-COMPAT-07`/`SV-COMPAT-08` skip: paired-Runner / vector-path probes; impl unit tests cover them.

### Process improvements (from L-64/L-65 retros)

- **Spec-change plan-evaluator gate** — `docs/spec-change-checklist.md` + project-level `CLAUDE.md` now enforce that every normative spec change runs through plan-evaluator BEFORE commit. First-use (against §16.6) caught 2 critical + 5 moderate bugs before they cascaded into impl/validator code.
- **Pin-bump BEFORE publish** — release ceremony order now pin-bumps `soa-validate.lock` in the prep commit so `PINNED_SPEC_COMMIT` in `@soa-harness/schemas` converges with the lock target. v1.1.0 shipped with drift; v1.1.1 patched; v1.2.0 ships correctly.

---

## Out-of-scope in v1.2 (deferred)

- **UV-CMD-07..10** (CLI probes) and **UV-A11Y-01..04** (chat-UI accessibility probes) — these are package-local concerns tested in `@soa-harness/cli` + `@soa-harness/chat-ui` vitest suites rather than `soa-validate` wire-probes. `UV-*` conformance for CLI/UI packages will land as a dedicated `ui-validate`-side probe set in a future milestone when the UX-surface contract solidifies.
- **VSIX packaging + marketplace publish** — v1.2.x.
- **Streaming-into-editor** from the VS Code extension — v1.2.x.
- **Real A2A wire protocol** — M9.
- **SelfOptimizer integration** — M10.
- **Gateway (OAuth 2.1 + PKCE + DPoP + real IdP)** — M11.

## Who should upgrade

- **Anyone wiring a real LLM provider for chat UX** — §16.6 is the wire contract that lets adopters ship incremental-response UIs without custom fanout code.
- **Anyone running a dev workflow that would benefit from a sidebar Runner status** — VS Code extension + CLI close the gap between "runner is up" and "I can probe it without curl".
- **Anyone who hit `--allow-drift` during v1.1.0 conformance checks** — the `SV-COMPAT-05/06` probes make the drift detectable in CI so it can't silently ship again.

## Who should stay on v1.1

Nobody, for compatibility reasons — v1.2 is strictly additive per §19.4. The v1.1 sync-dispatch path is byte-identical under v1.2. Staying is a risk-appetite choice, not a compatibility one.

## What's signed in the release bundle

`MANIFEST.json` / `MANIFEST.json.jws` pin every normative artifact shipping with v1.2.0:

- Core + UI spec Markdown
- All JSON schemas (including the extended `stream-event-payloads.schema.json` MessageEnd payload + unchanged dispatch schemas)
- Updated must-maps (SV-LLM-05 flip + SV-LLM-08/09/10 + SV-COMPAT-05..08 new)
- All test vectors
- `GOVERNANCE.md`, `LICENSE`, `CHANGELOG.md`, `ERRATA.md`

Same v1.0 release key signs v1.2.0 — fingerprint `l5TzOjMJfyyDTuEarut87i3T8KhGBV4AeLwOXo028vI=`. Hardware-backed signing remains a scheduled v1.0.x errata item.

## npm packages (11 total, all at `1.2.0`)

- `@soa-harness/schemas`
- `@soa-harness/core`
- `@soa-harness/runner`
- `@soa-harness/memory-mcp-sqlite`
- `@soa-harness/memory-mcp-mem0`
- `@soa-harness/memory-mcp-zep`
- `@soa-harness/langgraph-adapter`
- `@soa-harness/example-provider-adapter`
- **`@soa-harness/chat-ui`** *(new in v1.2)*
- **`@soa-harness/cli`** *(new in v1.2 — ships `soa` binary)*
- `create-soa-agent`

Git tags at `v1.2.0` on all three repos.

## Support window

- **v1.2.x** — security + editorial errata for 12+ months.
- **v1.1.x** — continues under `docs/m7/v1.0-lts-branch-policy.md`.
- **v1.0.x** — LTS continues.
- **v1.3 / v2.0** — no calendar date promised.

## Links

- Spec: `https://github.com/wleeb1010/soa-harness-specification`
- Reference runtime: `https://github.com/wleeb1010/soa-harness-impl`
- Conformance harness: `https://github.com/wleeb1010/soa-validate`
- Prior release notes: `RELEASE-NOTES.md` (v1.0), `RELEASE-NOTES-v1.1.0.md` (v1.1)
