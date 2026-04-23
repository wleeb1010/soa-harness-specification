# LangGraph Adapter Fixture — SV-ADAPTER-03 (L-52 M4)

Reference fixture for `SV-ADAPTER-03` (LangGraph Event Mapping). Pins a deterministic LangGraph `astream_events v2` trace and the expected SOA StreamEvent emission sequence under the §14.6.1 default mapping, so a conformance validator can verify an adapter's event-translation without executing a real LangGraph process.

## Files

```
simple-agent-trace.json  # deterministic pinned trace + expected emission
README.md                # this file
```

## Fixture scope

A minimal LangGraph agent: one `StateGraph` with two nodes (an LLM call and a tool call), invoked with a single user message, returning a final assistant response. The trace exercises:

- `SessionStart` / `SessionEnd` (from thread boundaries)
- `MessageStart` / `MessageEnd` on both LLM turns (role=assistant)
- `ContentBlockStart` / `ContentBlockDelta` / `ContentBlockEnd` on token streaming
- `ToolInputStart` / `ToolInputEnd` / `ToolResult` on the tool call
- Synthetic `PermissionPrompt` / `PermissionDecision` surrounding the tool call per §18.5.2
- Synthetic `PreToolUseOutcome` / `PostToolUseOutcome` per §15 hook pipeline (if adapter declares hooks)
- Synthetic `MemoryLoad` at session start (if adapter declares §8 Memory)

Out of scope (reserved for follow-up fixtures):
- Compaction mid-stream (would require M5 real-LLM dispatcher)
- A2A handoff (exercised by existing §17 vectors)
- Self-improvement flow (exercised by existing §9 vectors)
- Crash + resume path (exercised by existing §14.5.5 CrashEvent vector)

## Expected-sequence semantics

`simple-agent-trace.json` has two top-level keys:

- `langgraph_events` — the input trace: an ordered array of LangGraph `astream_events v2` records. Each record carries `event` (one of the 40 event names from §14.6.1), `name`, `run_id`, `metadata`, and a `data` payload shaped per LangGraph's own callback schema.
- `expected_soa_emission` — the reference output: an ordered array of SOA StreamEvents the adapter MUST emit when driven with the `langgraph_events` trace. Each entry carries `type` (one of §14.1's 27-type enum) and `payload_shape` (an abstract description of required payload fields; concrete bytes will vary with the adapter's `event_id` / `timestamp` minting).

An adapter passes `SV-ADAPTER-03` when, for every emission in `expected_soa_emission[i]`, the adapter emits a StreamEvent whose `type` equals the expected type and whose `payload` validates against the §14.1.1 `$defs` schema for that type AND whose `payload_shape` invariants hold. Ordering MUST match exactly.

## Deviation-protocol interaction

Adapters declaring `adapter_notes.event_mapping_deviations` in their Agent Card (§14.6.4) supply their own paired test vector. The validator substitutes that vector for this default when computing the expected emission.

## Referenced sections

- Core §14.6.1 — LangGraph Event Inventory (default mapping)
- Core §14.6.2 — Synthetic Events
- Core §14.6.3 — Example Trace
- Core §14.6.4 — Deviation Protocol
- Core §18.5.3 — Required Conformance Tests (`SV-ADAPTER-03`)
