# M2 Tool Registry Extension Fixture

Companion to `test-vectors/tool-registry/` for M2 test coverage — specifically `SV-SESS-05` (non-idempotent tool classification rule per §12.2).

## Why this directory exists

§12.2 states: *"Tools without any idempotency support MUST be classified `risk_class = Destructive` and run only under `control = Prompt` with a re-prompt on resume."* And: *"a tool declaring `< 3600 seconds` whose `risk_class` is not `Destructive` MUST be rejected by the Runner at tool-pool assembly with `ToolPoolStale` (reason `idempotency-retention-insufficient`)."*

`SV-SESS-05` asserts two things:
1. A tool without idempotency support, correctly classified as `Destructive` + `Prompt`, is accepted by the Runner (positive path).
2. A tool without idempotency support but classified as `Mutating` + `AutoAllow` (or any looser combination) is REJECTED at Tool Registry load with `ToolPoolStale`.

## Contents

| Tool | risk_class | default_control | idempotency_retention_seconds | Expected Runner behavior |
|---|---|---|---|---|
| `compliant_ephemeral_tool` | Destructive | Prompt | 0 | Accept at Tool Registry load. Runs only under Prompt handler; re-prompts on resume (§12.2 + §10.3 step 5). |
| `non_compliant_ephemeral_tool` | Mutating | AutoAllow | 0 | **Reject** at Tool Registry load. Runner startup fails with `ToolPoolStale` reason=`idempotency-retention-insufficient`. |

## How impl consumes

Impl's existing `RUNNER_TOOLS_FIXTURE=<path>` env var accepts this fixture path. When loaded:
- `compliant_ephemeral_tool` passes validation and is added to the Tool Registry.
- `non_compliant_ephemeral_tool` triggers the §12.2 rejection path — Runner refuses to start.

Impls MUST ship a Tool Registry loader that iterates tools at boot and enforces this rule deterministically BEFORE opening any listener. Early rejection prevents a non-conformant tool from ever being resolvable by the permission resolver.

## How validator consumes

`SV-SESS-05` validator runs two subprocess launches:

1. **Positive assertion:** Point impl at a modified fixture that contains only `compliant_ephemeral_tool`. Impl boots clean; `/permissions/resolve?tool=compliant_ephemeral_tool` returns `Prompt`.
2. **Negative assertion:** Point impl at a fixture containing `non_compliant_ephemeral_tool`. Impl MUST exit non-zero within 5s with `ToolPoolStale` reason=`idempotency-retention-insufficient` on stderr or boot log.

The validator's `internal/subprocrunner` from M1 already supports this invocation pattern.

## Relationship to the main Tool Registry fixture

`test-vectors/tool-registry/tools.json` is the 8-tool 24-cell conformance matrix for `SV-PERM-01`. This M2 fixture EXTENDS that with two additional entries targeting a different rule. Implementations MAY merge the two fixtures for a single registry load in conformance-mode runs OR run them as separate invocations — the spec does not constrain the composition.

## Referenced sections

- Core §11 — Tool Registry primitive
- Core §12.2 — Bracket-persist + idempotency rules
- Core §10.3 — Resolution algorithm (references `risk_class` + `default_control`)
