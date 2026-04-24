---
sidebar_position: 1
---

# Three-Repo Architecture

SOA-Harness uses an **independent-judge** architecture across three git repositories. No single repository can bless itself as conformant — the spec defines contracts, an implementation offers code, and an independent validator grades the implementation against the spec.

## The three repos

```
soa-harness-specification   <-- normative source of truth
         │                       (Markdown spec, JSON schemas,
         │                        test vectors, must-map)
         │
         │  pin via soa-validate.lock
         │
    ┌────┴────────┐
    │             │
    ▼             ▼
  impl         validate
  (TS)          (Go)
  runs          judges
```

- **spec repo** — Markdown + schemas + vectors. Every normative change lands here first. Changes flow outward via the pin-bump protocol.
- **impl repo** — `@soa-harness/runner`, `@soa-harness/core`, `@soa-harness/schemas`, memory backends, `create-soa-agent`. Pinned to a spec commit via `soa-validate.lock`.
- **validate repo** — `soa-validate` CLI (Go). Pinned to the SAME spec commit as impl (lockstep). Runs vector + live probes against an impl.

## Pin-bump protocol

Every normative spec change flows to siblings through a reviewable pin-bump:

1. Spec change lands on spec/main.
2. Impl maintainer (same person, in this project) opens a bump PR on impl/main updating `soa-validate.lock`: `spec_commit_sha` advances, `pin_history` gets a new entry with the reason for the bump.
3. Validate maintainer opens a lockstep bump PR on validate/main.
4. Both merge within the same window — impl + validate never ship against mismatched spec commits in production.

**Silent drift is a bug.** The spec repo's `scripts/check-pin-drift.py` + `.github/workflows/pin-drift.yml` gate detects impl/validate pin divergence and fails CI on drift unless explicitly allowed.

## Schema flow

The 33 JSON schemas live in `spec/schemas/`. Implementations **vendor** them from the spec at the pinned commit:

- Spec repo: authoritative schemas at `schemas/*.schema.json`
- Impl repo: `@soa-harness/schemas` re-vendors them into `packages/schemas/src/schemas/vendored/` at pin-bump time, then emits an ajv-compiled validator registry at build
- Validate repo: reads schemas directly from the pinned spec checkout — no vendoring

## Must-map: the conformance contract

`spec/soa-validate-must-map.json` maps every MUST anchor in the Markdown spec (like `§16.3#lifecycle-budget`) to test IDs (like `SV-LLM-03`). A new MUST without a test anchor fails CI. An orphan test without a MUST anchor fails CI. Together they ensure the spec and the conformance suite never drift.

## Why three repos and not one monorepo

A monorepo would be easier to coordinate but would make the validator's judgment suspect. "Pass/fail" produced by a validator living in the same repo as the thing being tested is circular. Splitting the validator into its own repo — with its own git history, its own pin-bump cadence, its own contributors in principle — makes the grade legible.

The cost is coordination overhead (the pin-bump protocol above). The benefit is that adopters can trust a `soa-validate --profile core` run in a way that they couldn't trust `npm test` in the impl repo.

## Versioning across the three

- Spec: semantic versioning at the `spec_version` field in MANIFEST.json. v1.0 → v1.1 → v1.2 per §19.4 decision tree (editorial / minor / major).
- Impl: npm semver. `@soa-harness/runner@1.0.x` = v1.0 spec. `@soa-harness/runner@1.1.x` = v1.1 spec.
- Validate: Go semver via git tags. Pins to a spec commit; the Go tag is the validate release tag, independent of spec version.

Adopters who want strict version pinning should lock ALL THREE: a specific impl version, a specific validator version, and the spec commit both pin to. The `soa-validate.lock` in each sibling repo makes this trivial to read.
