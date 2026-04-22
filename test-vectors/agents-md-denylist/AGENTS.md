# AGENTS.md — Denylist Fixture

Pinned fixture for SV-REG-04 conformance test. Do not edit without bumping the `test-vectors/` MANIFEST digest.

## Summary

Fixture agent for conformance testing of AGENTS.md denylist subtraction behavior per Core §11.2 + §11.2.1.

## Inputs

Validator-driven. No runtime inputs required.

## Outputs

None; fixture used by SV-REG-04 to verify /tools/registered response excludes denied tools.

## Safety & Permissions

Test-only; production deployments resolve AGENTS.md via operator configuration.

## Workflow

1. Runner starts with SOA_RUNNER_AGENTS_MD_PATH pointing here.
2. Runner parses ## Agent Type Constraints → ### Deny section below.
3. Denied tool names subtract from per-session Tool Pool.
4. Validator asserts /tools/registered.tools[] excludes denied names.

## Testing & CI

Consumed by SV-REG-04 in soa-validate M3 conformance suite.

## Agent Type Constraints

### Deny

fs_write_dangerous
