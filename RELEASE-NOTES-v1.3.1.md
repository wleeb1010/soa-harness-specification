# SOA-Harness v1.3.1 Release Notes

Adopter-facing narrative for v1.3.1. Editorial-class patch per §19.4.1. No spec changes; the v1.3 conformance contract is unchanged.

---

## What's fixed

### §17.2.2 task-execution deadline — Runner now enforces the MUST

v1.3.0 shipped the reference Runner without enforcing the §17.2.2 task-execution deadline ("Runners serving as destinations MUST enforce it"). A task stuck in `accepted` past the 300 s default (or operator-overridden `SOA_A2A_TASK_DEADLINE_S`) would stay reporting `accepted` forever — silent non-conformance.

v1.3.1 closes the gap via **computed-on-read synthesis**: on every `handoff.status` lookup, the `A2aTaskRegistry` checks whether the row's `acceptedAtS + taskExecutionDeadlineS` has elapsed; if so for a pre-terminal status, the registry returns a synthetic `{status: "timed-out", last_event_id: <preserved>}` response. No background timers, no race with `handoff.return` arriving post-deadline.

Known deferral: `SessionEnd(stop_reason=MaxTurns)` emission per §17.2.2 is not yet wired — that requires session-layer StreamEvent infrastructure the a2a stub-session path doesn't touch. Queued for v1.3.2.

### Conformance validator — nine §17 probes promoted from skip to live

L-70's six-slice live-probe promotion completed in a post-v1.3.0 day-shift run. v1.3.1 ships the promoted handlers:

| Test ID | Scope | Mode |
|---|---|---|
| SV-A2A-03 | §17.2.4 agent.describe envelope | bearer |
| SV-A2A-04 | §17.2 handoff.offer accept | bearer |
| SV-A2A-10 | §17.1 step 1 alg allowlist | bearer (pre-verify check) |
| SV-A2A-11 | §17.1 step 2 Agent-Card-kid discovery | JWT (cooperating key) |
| SV-A2A-12 | §17.1 step 3 jti replay | JWT (cooperating key) |
| SV-A2A-13 | §17.1 step 4 agent_card_etag drift | JWT (cooperating key) |
| SV-A2A-14 | §17.2.5 offer-then-transfer digest recompute | bearer |
| SV-A2A-15 | §17.2.1 transition matrix (partial) | bearer |
| SV-A2A-16 | §17.2.2 task-execution deadline → timed-out | bearer |
| SV-A2A-17 | §17.2.3 capability matching truth table | bearer |

Live probes are gated on runtime env so existing conformance runs under default config stay skip. Bearer probes require `SOA_A2A_BEARER`; JWT probes additionally require `SOA_A2A_AUDIENCE + SOA_A2A_PROBE_CALLER_KEY_PEM + SOA_A2A_PROBE_CALLER_KID`; the deadline probe reads `SOA_A2A_PROBE_DEADLINE_SLEEP_S` (default 4 s) and requires the Runner under test to be booted with a short `SOA_A2A_TASK_DEADLINE_S`.

The `SV-A2A-15` partial-scope flag is intentional — the accepted→executing intermediate state is not observable without a Runner-side execute hook. Closing that gap (Slice 6c) is queued for v1.3.2 and requires a new-wire-contract commit with plan-evaluator + HARD-RULE discipline.

---

## Adoption

No code changes required. `npm upgrade @soa-harness/runner` (or `npx create-soa-agent@1.3.1`) pulls the deadline-enforcing Runner automatically. Existing bearer-mode adopters see the `timed-out` transition on long-running tasks that blow through their configured deadline.

Validator adopters running conformance runs: the new live probes surface as skip under default env (no regression). To activate them, configure your test harness per the env vars in the table above.

---

## Compatibility & pinning

- **Spec pin**: b87c2ffb5879d21d83692c9aa1c2666a606f8be2 (unchanged from v1.3.0).
- **MANIFEST**: byte-identical to v1.3.0's signed bundle. No re-signing ceremony.
- **Signing key**: v1.0 release key (fingerprint unchanged since v1.0.0).
- **npm packages**: all 11 bump `1.3.0` → `1.3.1`. `create-soa-agent@1.3.1` + 10 × `@soa-harness/*@1.3.1`.
- **Conformance profile coverage**: unchanged. v1.3 conformance claims remain valid.
