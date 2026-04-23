# Low-Budget Conformance Card Fixture — SV-BUD-02

Pinned Agent Card fixture with low `tokenBudget.maxTokensPerRun` for conformance testing the projection-over-budget path without consuming real LLM tokens.

## Why this fixture

`SV-BUD-02` asserts "over-budget projection → no API call issued" per Core §13.1. The base `conformance-card` fixture carries `maxTokensPerRun: 200000`, which would require ~200k tokens of driven traffic to trigger the projection path. This fixture sets `maxTokensPerRun: 1000` so a single driven turn crosses the threshold deterministically.

## Delta from `test-vectors/conformance-card/`

Two fields differ; everything else identical:

| Field | Base card | Low-budget card |
|---|---|---|
| `name` | `soa-conformance-test-agent` | `soa-conformance-test-agent-low-budget` |
| `tokenBudget.maxTokensPerRun` | `200000` | `1000` |
| `tokenBudget.billingTag` | `conformance-test` | `conformance-test-low-budget` |

## Usage

Validator starts Runner with this card as the initial Agent Card:

```
RUNNER_AGENT_CARD_PATH=test-vectors/conformance-card-low-budget/agent-card.json
```

Then drives a single decision with `input_tokens + projected_output_tokens > 1000` and asserts:

1. No API call issued (fail-closed on projection-over)
2. `SessionEnd` event with `payload.stop_reason: "BudgetExhausted"` emitted
3. `HR-02` also exercises this fixture (projection-over-budget pre-call).

## Referenced sections

- Core §7 — Agent Card `tokenBudget.maxTokensPerRun` field
- Core §13.1 — Projection algorithm
- Core §13.2 — Mid-stream enforcement (NOT exercised by this fixture; SV-BUD-03 covers that path separately)
- Core §13.4 — `StopReason::BudgetExhausted`
