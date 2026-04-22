# AGENTS

## Project Rules

Conformance fixture exercising §7.3 `@import` cycle detection. Imports `cycle-a.md`, which imports `cycle-b.md`, which imports back to `cycle-a.md`.

@import cycle-a.md

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
