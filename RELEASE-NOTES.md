# SOA-Harness v1.0.0 Release Notes

Adopter-facing narrative for v1.0.0. For the exhaustive line-by-line changelog, see `CHANGELOG.md`. For change classification and future-errata rules, see `docs/errata-policy.md`.

---

## What SOA-Harness is

A specification for building AI agents that are **signed, observable, and verifiable end-to-end**. Every agent exposes:

- A **signed Agent Card** — cryptographic identity plus a declaration of what the agent can do, canonicalized via RFC 8785 JCS, wrapped in a JWS anchored to an external trust root.
- A **closed StreamEvent enum** — 25 typed events per turn, mapped to OpenTelemetry spans. An agent cannot surprise its observer with a new event type.
- A **hash-chained WORM audit trail** — every permission decision, every handler key rotation, every self-improvement event lands on an append-only log whose tail hash proves integrity against tamper.
- **Three-axis permission resolution** — tool risk class × session context × operator policy, tighten-only. Permission decisions are themselves signed.
- **Session persistence** that survives crashes on Linux, macOS, and Windows via platform-aware atomic writes.
- **A memory layer** with a closed 6-tool MCP contract, three-consecutive-failure `MemoryDegraded` fallback, and three production-ready reference backends (sqlite, mem0, Zep).
- **Token budgeting** with p95-over-rolling-window projection and mid-stream enforcement.
- **A conformance harness** (`soa-validate`) that runs 234 Core + 186 UI test IDs against any implementation claiming `core` / `core+si` / `core+handoff` / `full`.

This is a specification-first project. The TypeScript reference runtime (`@soa-harness/runner`) and the Go conformance harness (`soa-validate`) exist to prove the spec is implementable, not as substitutes for reading the spec.

## Who should adopt at v1.0.0

- **Agent framework builders** who need a durable contract for downstream consumers to verify against.
- **Security-conscious agent operators** who need signed decisions, auditable state, and closed observability.
- **Conformance-test authors** who want a pinned must-map and a digest-stable test-vector corpus to write against.

## Who should wait

- **Teams needing a full production Gateway** — the reference Gateway is a working sketch for `core`; production depth (OAuth 2.1 + PKCE + DPoP at scale, large-org multi-tenant UI) is targeted for v1.1.
- **Teams needing hardware-boundary release-key guarantees** — v1.0 ships with a software-Ed25519 release key with passphrase-encrypted storage. Hardware-backed signing (YubiKey) arrives as a v1.0.1 editorial errata.
- **Teams needing a second-party bake-off certification** — v1.0.0 ships under the "Reference Implementation" label. The "Bake-Off Verified" label requires an independent reimplementation; until one exists, downstream adopters claim Reference-level conformance only.

## Getting started

```bash
# Scaffold a new agent
npx create-soa-agent my-agent
cd my-agent
npm start
```

Expected output within 90 seconds on a warm npm cache:
1. A signed Agent Card served on localhost.
2. Five JCS-canonicalized StreamEvents printed as the demo turn runs.
3. One PreToolUse permission prompt resolved via stdin.
4. One audit row appended to the WAL.

From there:

- **To understand the wire formats**: read the spec `schemas/*.schema.json`; every signed and verified artifact ships with a draft-2020-12 JSON Schema.
- **To verify conformance**: clone `soa-validate`, point it at your Runner, run `soa-validate --profile=core --runner-url http://localhost:7700`. It emits JUnit XML plus `release-gate.json`.
- **To extend the memory layer**: plug an MCP server implementing the six-tool contract from §8.1 in the spec; §8.7 lists three production-ready reference backends.
- **To integrate with an existing framework**: §18.5 and §14.6 define the adapter conformance surface (LangGraph is the canonical example; CrewAI and others follow the same contract).

## What's signed in the release bundle

The `MANIFEST.json` / `MANIFEST.json.jws` pair pins the SHA256 of every normative artifact shipped with v1.0.0:

- Core + UI spec Markdown files
- 14 JSON schemas
- 234-test + 186-test must-maps
- All test vectors
- `GOVERNANCE.md`, `LICENSE`, `LICENSE-docs.md`

The MANIFEST itself is signed with the v1.0 release key (Ed25519, fingerprint in `keys/soa-release-v1.0.pub`). Validator binaries ship in their sibling `soa-validate` repo with separate release tags; the MANIFEST references them with explicit `status: "placeholder"` and the normative rider that conformance tools MUST refuse to verify against a placeholder entry.

## Support window

- **v1.0.x** — security fixes + editorial errata for at least 12 months from the v1.0.0 tag.
- **v1.1.0** — additive minor release targeting the deferred items listed above. No calendar date promised; quality over speed.
- **v2.0.0** — any breaking change; announced in advance via `docs/errata-policy.md` process.

## Reporting issues

- **Spec questions / ambiguities** — open an issue in `soa-harness-specification` repo. Cite the section.
- **Impl bugs** — open an issue in `soa-harness-impl` repo. Include your platform + Node version + runnable repro.
- **Validator bugs or must-map ambiguities** — open an issue in `soa-validate` repo.
- **Security issues** — do NOT open a public issue. Use the security disclosure path described in `GOVERNANCE.md`.

## Acknowledgments

SOA-Harness v1.0 is currently a single-maintainer project. `GOVERNANCE.md` is honest about that state; the goal is to recruit additional maintainers before the first `v1.1.0` minor. The specification benefited from graph-based structural audit (500+ nodes tracking every cross-reference) and two independent external reviews. Reviewer credit lives in `GOVERNANCE.md`.

## Links

- **Spec:** `https://github.com/wleeb1010/soa-harness-specification`
- **Reference runtime:** `https://github.com/wleeb1010/soa-harness-impl` (TypeScript, `@soa-harness/*` on npm)
- **Conformance harness:** `https://github.com/wleeb1010/soa-validate` (Go)
- **Release bundle:** see `MANIFEST.json` for the per-artifact digest chain
- **Errata:** `ERRATA.md` for post-v1.0 patches
- **Change log:** `CHANGELOG.md` for the line-by-line history
