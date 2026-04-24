# SOA-Harness v1.3.2 Release Notes

Adopter-facing narrative for v1.3.2. Additive-normative patch — the §17 wire contract is unchanged; only new normative testability content is added.

---

## What's new

### §17.2.2.1 Destination execute hook

v1.3.1 shipped `SV-A2A-15` as a partial-live probe because the reference Runner had no way to transition `accepted → executing` without a real provider adapter on the destination side. v1.3.2 closes that gap with a dedicated test hook.

When a Runner honors `SOA_A2A_AUTO_EXECUTE_AFTER_S=N` (a loopback-guarded env var introduced in §17.2.2.1), every successful `handoff.transfer` schedules two synthetic transitions:

- `accepted → executing` at the **N-second mark**.
- `executing → completed` at the **2N-second mark**.

If `handoff.return` arrives first, the scheduled transitions are cancelled. The 1:1 spacing gives symmetric poll windows for validators while keeping test latency bounded.

### Conformance-MUST / deployment-MAY split

Runners seeking `SV-A2A-15` conformance MUST honor the hook. Production Runners MAY omit the hook entirely — the Runner MUST refuse startup if `SOA_A2A_AUTO_EXECUTE_AFTER_S` is set on a non-loopback listener or if `2N ≥ SOA_A2A_TASK_DEADLINE_S` (deadline-collision guard). The fail-closed startup discipline matches the §11.3.1 / §10.6.2 / §11.2.1 test-hook precedent.

### Reference implementation

`@soa-harness/runner@1.3.2` ships the hook: `A2aTaskRegistry.scheduleAutoExecute` + `cancelAutoExecute` + `handleHandoffTransfer` / `handleHandoffReturn` integration + `buildRunnerApp` startup validation. Test totals: 893/893 (up from 888 at v1.3.1).

### Validator

`SV-A2A-15` gains a seventh env-gated assertion. Set `SOA_A2A_PROBE_EXECUTE_HOOK_N_S=N` on the validator and boot the Runner with `SOA_A2A_AUTO_EXECUTE_AFTER_S=N` at the same value; the probe observes the full `accepted → executing → completed` transition path end-to-end.

---

## Adoption

Zero-code-change upgrade. `npm upgrade @soa-harness/runner` (or `npx create-soa-agent@1.3.2`) pulls the hook-capable Runner. Existing adopters who don't set the env var see no behavioral change. Production deployments MUST NOT set `SOA_A2A_AUTO_EXECUTE_AFTER_S` — the hook fires synthetic transitions that don't correspond to real work, which is only meaningful in a test harness.

---

## Compatibility & pinning

- **Spec pin**: `8f8bdb465fc2d6063eaabd5185728d471f1fa65f`.
- **Signing key**: v1.0 release key (fingerprint unchanged).
- **npm packages**: all 11 bump `1.3.1` → `1.3.2`.
- **v1.3.0 / v1.3.1 conformance claims**: remain valid.

---

## Known deferrals to v1.3.3+

- `§17.2.2` SessionEnd(MaxTurns) emission on timed-out transitions (L-73 Track 2).
- CrewAI / AutoGen adapters (L-73 Track 3).
- §17.2.3.2 reserved capability-tokens registry (v1.4+).
- Caller-side `result_digest` attestation contract (v1.4+).
