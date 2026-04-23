# Memory MCP Mock Fixture — Conformance Testability

Spec-pinned protocol for a minimum-viable Memory MCP server used by `SV-MEM-01..08` and `HR-17` conformance tests. Implementations MAY ship this mock as part of their test harness; validators MAY use it to drive controlled memory interactions including the three-timeout scenario required by `HR-17`.

## Why this directory exists

`SV-MEM-01..08` and `HR-17` require a Memory MCP server that:
- Implements the §8.1 six-tool contract
- Can be configured to timeout on the Nth call for `HR-17`
- Is deterministic across test runs

Real MCP memory servers (graph databases, vector stores) are operator-deployment concerns and out of scope for this fixture. The conformance tests need *something* consistent to talk to. This fixture is that minimum.

## Protocol (normative for conformance mocks)

The mock MUST implement the Memory MCP tool contract from Core §8.1:

| Tool | Request | Response |
|---|---|---|
| `add_memory_note` | `{summary: string ≤16 KiB, data_class ∈ {public,internal,confidential,personal}, session_id: string, note_id?: string, tags?: array<string> ≤32, importance?: number 0.0-1.0 default 0.5}` | `{note_id, created_at}` |
| `search_memories` | `{query, limit, time_range?}` | `{hits: [{id, score, snippet, created_at, tags, importance}], truncated}` |
| `search_memories_by_time` | `{start, end}` | `{hits: [{id, created_at, tags}], truncated}` |
| `read_memory_note` | `{id}` | `{id, note, tags, importance, created_at, graph_edges: [{peer, weight}]}` |
| `consolidate_memories` | `{threshold}` | `{merged, strengthened_edges, summary_ids}` |
| `delete_memory_note` | `{id, reason}` | `{deleted, tombstone_id, deleted_at}` |

Tool count is **6** per §8.1.

`delete_memory_note` MUST be idempotent on `id` per §8.1 — repeated calls with the same `id` return the same `tombstone_id` + `deleted_at`. Deleted IDs MUST NOT appear in subsequent `search_memories` responses. The mock MUST preserve tombstone records (retaining `id`, `created_at`, `tags`, `deleted_at`, `reason` but not the note body).

`add_memory_note` errors per §8.1: `MemoryQuotaExceeded`, `MemoryDuplicate`, `MemoryMalformedInput`, `MemoryDeletionForbidden` (with reason `sensitive-class-forbidden` for attempts to add `data_class: "sensitive-personal"` per §10.7.2).
`search_memories` errors per §8.1: `MemoryUnavailable`, `MemoryTimeout`.
`read_memory_note` errors per §8.1: `MemoryNotFound`.
`delete_memory_note` errors per §8.1: `MemoryNotFound`, `MemoryDeletionForbidden`.

**Wire-shape note.** `search_memories` and `search_memories_by_time` return `hits` per §8.1. Backends (sqlite / mem0 / Zep and any third-party MCP memory server) MUST use the spec-canonical `hits` shape; `notes` is not a conformant field name.

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
- Core §8.3.1 — MemoryDegraded Observability
- Core §8.6 — Memory state observability endpoint
- Core §13.4 — StopReason enum
- Core §14.1 — SessionEnd StreamEvent type
