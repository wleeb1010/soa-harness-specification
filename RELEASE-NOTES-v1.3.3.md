# SOA-Harness v1.3.3 Release Notes

Editorial-class patch per §19.4.1. No spec changes; v1.3 conformance claims unchanged.

---

## What's fixed

### §17.2.2 `SessionEnd(MaxTurns)` emission

v1.3.0 shipped §17.2.2 with two normative MUSTs on the destination-side Runner:

1. Enforce the task-execution deadline.
2. Emit `SessionEnd` with `stop_reason: "MaxTurns"` at the boundary.

v1.3.1 closed MUST #1 via computed-on-read `timed-out` synthesis. v1.3.3 closes MUST #2 via an opt-in `onTaskExecutionDeadline` callback on `a2aPlugin`.

### Adoption

**Zero-code-change upgrade.** The callback is opt-in; omitting it preserves v1.3.2 behavior (deadline enforcement via computed-on-read, no stream event).

**Opt-in for conformance-MUST compliance:**

```typescript
await app.register(a2aPlugin, {
  bearer: process.env.SOA_A2A_BEARER!,
  card, cardJws,
  onTaskExecutionDeadline: ({ task_id, destination_session_id, deadlineS }) => {
    streamEmitter.emit({
      session_id: destination_session_id,
      type: "SessionEnd",
      payload: { stop_reason: "MaxTurns", task_id, deadline_s: deadlineS },
    });
  },
});
```

---

## Compatibility & pinning

- **Spec pin**: `8f8bdb465fc2d6063eaabd5185728d471f1fa65f` (unchanged from v1.3.2).
- **MANIFEST**: byte-identical to v1.3.2's signed bundle. No re-signing.
- **npm packages**: all 11 bump `1.3.2` → `1.3.3`.
