# Precedence-Violation Conformance Card Fixture — SV-CARD-10

Pinned Agent Card fixture intentionally violating the §10.3 three-axis tightening rule. Runner MUST refuse to load this card at bootstrap and emit `ConfigPrecedenceViolation` on the System Event Log.

## What's wrong with it

Two Card fields are in contradiction:

| Field | Value | Implication |
|---|---|---|
| `agentType` | `"explore"` | Per §11.2 line 1407, explore-class agents see only `ReadOnly` tools. |
| `permissions.activeMode` | `"DangerFullAccess"` | Card is requesting the highest-capability activeMode. |

Per §10.3, lower-precedence axes MAY tighten but MUST NOT loosen. `agentType` (as an implicit constraint axis tied to tool-pool filtering) says "ReadOnly only". The Card's `activeMode` tries to grant DangerFullAccess — that's loosening, not tightening. Violation.

## Expected Runner behavior

On bootstrap with `RUNNER_AGENT_CARD_PATH` pointing here:

1. Runner detects the contradiction during Card validation.
2. Runner refuses to proceed to `/ready` 200 state.
3. Runner emits a `ConfigPrecedenceViolation` record on `/logs/system/recent` (category `Config` per §14.2, level `error`, code `ConfigPrecedenceViolation`).
4. Runner `/ready` returns 503 with reason `config-precedence-violation`.

## Validator choreography

```
RUNNER_AGENT_CARD_PATH=test-vectors/conformance-card-precedence-violation/agent-card.json
```

Validator spawns subprocess-isolated Runner, polls `/ready` (expects 503), polls `/logs/system/recent?category=Config` (expects exactly one ConfigPrecedenceViolation record), asserts Runner never reached `/ready` 200.

## Delta from `test-vectors/conformance-card/`

| Field | Base card | Precedence-violation card |
|---|---|---|
| `name` | `soa-conformance-test-agent` | `soa-conformance-test-agent-precedence-violation` |
| `agentType` | `"general-purpose"` | `"explore"` |
| `tokenBudget.billingTag` | `conformance-test` | `conformance-test-precedence-violation` |
| `skills` | `["conformance-testing"]` | `["precedence-violation-fixture"]` |

All other fields identical. `permissions.activeMode` stays `DangerFullAccess` in both; the violation comes from pairing it with `agentType: explore`.

## Referenced sections

- Core §10.3 — Three-axis precedence + tighten-never-loosen rule
- Core §11.2 — Per-session tool pool (agentType → tool filter)
- Core §14.2 — System Event Log `Config` category
- Core §24 — `ConfigPrecedenceViolation` error code

## DO NOT USE IN PRODUCTION

This fixture is intentionally non-conformant. Cards matching this shape in a real deployment indicate either an operator misconfiguration or a template that was copied without fixing the agentType/activeMode tension.
