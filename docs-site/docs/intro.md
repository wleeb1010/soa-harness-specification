---
sidebar_position: 1
slug: /intro
---

# Introduction

**SOA-Harness** — Secure Operating Agents — is a specification plus a reference implementation for building and running LLM-backed agents in production. It lands the security, auditability, permissions, and conformance surfaces that the first generation of agent frameworks punted on.

## Why SOA-Harness exists

A typical agent framework in 2026 lets you wire an LLM, tools, and a memory layer, and treats the resulting runtime as "good enough." What's usually missing:

- **Trust bootstrapping** — who signs the Agent Card the Runner serves, and what happens when the signature fails?
- **Permission decisions as first-class artifacts** — every tool call has a decision, hash-chained into an audit log, with a cryptographic PermissionDecisionAssertion behind it.
- **Wire-format conformance** — "does my agent behave the same way yours does?" — answered by a spec + test vectors + a validator, not hand-waving.
- **Crash-safe session persistence** — bracket-persist bookends so an agent that dies mid-tool-call can be resumed without double-executing side effects.
- **Budget + cancellation + observability** — projection algorithms, mid-stream cancel, a closed StreamEvent enum, and standard observability endpoints (`/audit/tail`, `/events/recent`, `/budget/projection`, `/dispatch/recent`).

SOA-Harness v1.0 is the minimum set of normative contracts that make those five bullet points implementable and testable. v1.1 adds the LLM dispatcher (§16.3 — this session's M7 deliverable) plus deployment artifacts.

## Three repositories

SOA-Harness is an **independent-judge architecture**. No single repository can bless itself as conformant.

- **`soa-harness-specification`** — the normative spec (Markdown), the JSON schemas, the test vectors, and the must-map (MUSTs → test IDs). This repo is the source of truth.
- **`soa-harness-impl`** — the reference TypeScript implementation. `@soa-harness/runner` + `create-soa-agent` + memory backends. Pinned to a specific spec commit via `soa-validate.lock`.
- **`soa-validate`** — the Go validator. Reads the spec repo at a pinned commit, runs 170+ conformance probes against any Runner exposing the spec's HTTP surface. Pinned to the same spec commit as impl (in lockstep).

## What v1.0 ships

| Surface | State |
|---|---|
| Spec sections §1–§25 | normative, published |
| JSON schemas for every signed/validated artifact | normative, published (33 schemas as of v1.1) |
| Test vectors | pinned + digested in MANIFEST.json.jws |
| `@soa-harness/runner` + 7 sibling npm packages | v1.0.0 shipped, signed MANIFEST |
| `create-soa-agent` scaffold | v1.0.0 — `npx create-soa-agent my-agent` works |
| `soa-validate` CLI (Go) | 170+ probes; 35+ pass against the reference impl |
| Deployment artifacts (Dockerfile + compose + systemd) | shipped at v1.1 per M7 |

## Current status

SOA-Harness is a **single-maintainer project by design** (see `GOVERNANCE.md` in the spec repo). Internal references to "SOA-WG" describe an aspirational working group, not a current organization. Adopters should treat the spec as a well-engineered draft reference architecture. Normative text can change between minor releases; the `soa-validate.lock` pin protocol protects against silent drift.

Two conformance tiers exist:

1. **SOA-Harness v1.1 Reference Implementation** — self-assigned by implementations that pass the full `soa-validate` suite against a pinned spec commit. The reference impl claims this label.
2. **SOA-Harness v1.1 Bake-Off Verified** — requires a second-party implementation whose `soa-validate` output converges to zero divergence. Currently **not actively pursued** per the 2026-04-23 solo-operation decision. No adopter should make a Bake-Off Verified claim as of v1.1.

## Next steps

- [Install](install.md) — get `@soa-harness/runner` + `soa-validate`
- [Getting Started](getting-started.md) — scaffold + run + validate in 90 seconds
- [Conformance Tiers](conformance-tiers.md) — what "conformant" means in practice
