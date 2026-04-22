# AGENTS

## Project Rules

Pinned fixture for SV-REG-04 conformance test. Do not edit without bumping the `test-vectors/` MANIFEST digest. §7.2-compliant AGENTS.md; the denylist lives in the `## Agent Type Constraints` H2 below.

## Agent Persona

Conformance test agent for deny-list subtraction behavior (Core §11.2).

## Immutables

None — test-only fixture.

## Self-Improvement Policy

entrypoint: agent.py

## Memory Policy

No persistent memory for this fixture; `memory.enabled: false` on the companion card.

## Human-in-the-Loop Gates

Interactive handler required for any Mutating tool.

## Agent Type Constraints

### Deny

fs_write_dangerous
