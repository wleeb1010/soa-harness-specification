---
sidebar_position: 2
---

# Install

Two moving parts: the Runner (TypeScript, npm) and the validator (Go).

## Runner — `@soa-harness/runner`

Published on npm. Install via your package manager of choice:

```bash
# Using the scaffold (recommended for first-time adopters)
npx create-soa-agent my-agent
cd my-agent
npm install
npm start

# Or directly
npm install @soa-harness/runner
# or: pnpm add @soa-harness/runner
# or: yarn add @soa-harness/runner
```

Sibling packages (install only what you use):

- `@soa-harness/core` — JCS canonicalization + digests (auto-installed as a runner dep)
- `@soa-harness/schemas` — ajv-compiled JSON-schema validators for every wire artifact
- `@soa-harness/memory-mcp-sqlite` — local sqlite memory backend
- `@soa-harness/memory-mcp-mem0` — mem0 server adapter
- `@soa-harness/memory-mcp-zep` — Zep server adapter
- `@soa-harness/langgraph-adapter` — LangGraph interception layer
- `create-soa-agent` — the scaffold itself

## Validator — `soa-validate`

A Go binary. Two install paths:

### Via Go toolchain (bleeding edge)

Requires Go ≥ 1.22.

```bash
go install github.com/wleeb1010/soa-validate/cmd/soa-validate@latest
# Add $(go env GOPATH)/bin to your PATH if it isn't already
soa-validate --version
```

### Via release binary

Download the latest pre-built binary:

```
https://github.com/wleeb1010/soa-validate/releases/latest
```

Verify the binary against the release signature (once release signing lands — tracked as an M7 follow-up).

## Spec-vectors checkout

The validator reads test vectors, must-maps, and JSON schemas from the spec repo at a specific commit. You need a local checkout:

```bash
git clone https://github.com/wleeb1010/soa-harness-specification ../soa-harness-specification
```

The scaffold's `conform` script (`npm run conform`) auto-discovers the spec repo at `../soa-harness-specification` by default. Override via `SOA_SPEC_VECTORS=<abs-path>`.

## Verify pins are aligned

Both `@soa-harness/runner` and the `soa-validate` you installed each pin to a specific spec commit. Mismatched pins mean you're validating against a different spec than the Runner was built against — diagnosing the wrong system.

The spec repo ships a detector:

```bash
cd ../soa-harness-specification
python scripts/check-pin-drift.py
```

Output tells you both pins, flags drift, and shows the bump reason that produced each pin.

## Next

Head to [Getting Started](getting-started.md).
