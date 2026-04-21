# Memory MCP Mock Fixture — Conformance Testability

Spec-pinned protocol for a minimum-viable Memory MCP server used by M3 `SV-MEM-01..08` and `HR-17` conformance tests. Implementations MAY ship this mock as part of their test harness; validators MAY use it to drive controlled memory interactions including the three-timeout scenario required by `HR-17`.

## Why this directory exists

`SV-MEM-01..08` and `HR-17` require a Memory MCP server that:
- Accepts `search_memories`, `write_memory`, `consolidate_memories` per §8.1
- Can be configured to timeout on the Nth call for `HR-17`
- Is deterministic across test runs

Real MCP memory servers (graph databases, vector stores) are out of scope for M3 — they're operator-deployment concerns. But the conformance tests need *something* consistent to talk to. This fixture is that minimum.

## Protocol (normative for conformance mocks)

The mock MUST implement the three Memory MCP tools from §8.1:

| Tool | Request | Response |
|---|---|---|
| `search_memories` | `{query, limit, sharing_scope}` | `{notes: [{note_id, summary, data_class, composite_score}]}` |
| `write_memory` | `{summary, data_class, session_id}` | `{note_id}` |
| `consolidate_memories` | `{consolidation_threshold}` | `{consolidated_count, pending_count}` |

The mock MUST accept the following env-var controlled behaviors:

- `SOA_MEMORY_MCP_MOCK_TIMEOUT_AFTER_N_CALLS=<n>` — after N successful calls, the next N+1 calls time out (no response within 5 s). Reset counter every time the process restarts.
- `SOA_MEMORY_MCP_MOCK_RETURN_ERROR=<tool_name>` — the named tool returns `{"error": "mock-error"}` instead of a success response. Omit the env var for normal operation.
- `SOA_MEMORY_MCP_MOCK_SEED=<path-to-fixture-corpus>` — on startup, reads a JSON array of note entries to seed the in-memory corpus for `search_memories`.

## Seeded test corpus

`test-vectors/memory-mcp-mock/corpus-seed.json` provides a pinned, non-sensitive seed corpus of 20 note entries with varied `data_class` values. Validators assert search-result weighting (`SV-MEM-03..05`) against this corpus by picking a specific query and verifying the top-N notes match expected IDs + composite scores.

## Reference implementation

Impls MAY ship the mock as a subdirectory under their test tooling (e.g., `soa-harness-impl/tools/memory-mcp-mock/`). Validators SHOULD build the reference mock from scratch in their test harness to maintain the independent-judge property — a validator running its own mock that diverges from impl's mock would itself be a finding.

## HR-17 test choreography

1. Validator starts the mock with `SOA_MEMORY_MCP_MOCK_TIMEOUT_AFTER_N_CALLS=0` (every call times out immediately)
2. Validator starts impl with Agent Card carrying `memory.enabled: true` and `memory.mcp_endpoint` pointing at the mock
3. Validator drives 3 sessions that each trigger a Memory call
4. Each of the 3 sessions terminates with `StopReason::MemoryDegraded` per §8.3 three-timeout rule
5. Validator observes via `GET /events/recent`:
   - Each session emits a `SessionEnd` event with `payload.stop_reason: "MemoryDegraded"`
6. Assert: 3 `SessionEnd` events with the expected `stop_reason`, no false-positives on sessions that didn't trigger Memory calls

## Referenced sections

- Core §8.1 — Memory MCP tool contract
- Core §8.3 — Unavailability and timeout (three-consecutive-failure rule)
- Core §8.3.1 — MemoryDegraded Observability (L-34)
- Core §8.6 — Memory state observability endpoint
- Core §13.4 — StopReason enum
- Core §14.1 — SessionEnd StreamEvent type
