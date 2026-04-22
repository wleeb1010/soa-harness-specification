# AGENTS

## Project Rules

Conformance fixture exercising §7.3 `@import` max-depth enforcement. Imports `level-1.md`; each level imports the next, reaching depth 9 which exceeds the maximum of 8.

@import level-1.md

## Agent Persona

Conformance test agent.

## Immutables

None.

## Self-Improvement Policy

entrypoint: agent.py

## Memory Policy

No persistent memory.

## Human-in-the-Loop Gates

Interactive.

## Agent Type Constraints

### Deny
