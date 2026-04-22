# Project-Scope Memory Card Fixture — SV-MEM-06

Pinned Agent Card fixture with `memory.enabled: true` and `memory.sharing_policy: "project"` for conformance testing that the Runner threads card-driven sharing-policy through to `search_memories` calls instead of defaulting to session scope.

## Why this fixture

`SV-MEM-06` asserts "sharing_policy value from Agent Card reflected in `search_memories` calls" per Core §8.5. The base `conformance-card` fixture carries `memory.enabled: false`, so Memory MCP paths aren't exercised. This variant enables memory, points at the memory-mcp-mock on `127.0.0.1:8001`, and sets `sharing_policy` to a non-default value (`project`) so validators can observe that the Runner honors the card value (as opposed to the impl's historical hardcoded `"session"` default).

## Delta from `test-vectors/conformance-card/`

Four fields differ; everything else identical:

| Field | Base card | Project-scope card |
|---|---|---|
| `name` | `soa-conformance-test-agent` | `soa-conformance-test-agent-memory-project` |
| `memory.enabled` | `false` | `true` |
| `memory.mcp_endpoint` | `mcp://unused.conformance.test/` | `mcp://127.0.0.1:8001/` |
| `tokenBudget.billingTag` | `conformance-test` | `conformance-test-memory-project` |

`memory.sharing_policy` is already `"project"` in the base card; this fixture inherits that value.

## Usage

Validator starts Runner with this card AND the memory-mcp-mock running on `:8001` seeded from `test-vectors/memory-mcp-mock/corpus-seed.json`:

```
RUNNER_AGENT_CARD_PATH=test-vectors/conformance-card-memory-project/agent-card.json
SOA_MEMORY_MCP_MOCK_SEED=test-vectors/memory-mcp-mock/corpus-seed.json
```

Then drives a session that triggers a `search_memories` call and asserts the outgoing request's `sharing_scope` parameter equals `"project"` (from the card), not `"session"` (the historical impl default).

## Referenced sections

- Core §7 — Agent Card `memory.sharing_policy` field
- Core §8.1 — `search_memories` signature (takes `sharing_scope` param)
- Core §8.5 — Sharing-policy binding + server-side enforcement

## Mock interaction

The memory-mcp-mock logs every inbound `search_memories` request to its audit channel. Validator reads the mock's log (separate from Runner's `/logs/system/recent`) to verify the request carried `sharing_scope: "project"`.
