# Sibling-Repo README Templates — v1.0.0

M6 Phase 1g (L-60). Reference drafts for the `soa-harness-impl` and `soa-validate` sibling-repo READMEs at v1.0.0 release. User-driven — spec-session cannot author files in sibling repos. Copy the relevant template to the sibling repo's `README.md` and adapt the specifics.

Both templates assume the spec's `RELEASE-NOTES.md`, `CHANGELOG.md`, and `ERRATA.md` have landed at v1.0.0 and are cross-linked.

---

## Template A — `soa-harness-impl/README.md`

```markdown
# SOA-Harness Impl — TypeScript Reference Runtime

Reference implementation of the SOA-Harness v1.0 specification. Ships as 8 npm packages under `@soa-harness/*`. Proves the spec is implementable, serves as a fork-able skeleton for production deployments, and is the first target of conformance verification via `soa-validate`.

**Not affiliated with the spec-authoring working group.** The impl is independently maintained and tracks the spec via pinned digest in `soa-validate.lock`. Spec updates land in the `soa-harness-specification` repo first; impl pin-bumps follow as separate reviewable PRs.

## Packages

| Package | Role |
|---|---|
| `@soa-harness/schemas` | 14 ajv-compilable JSON Schemas (code-gen from spec) |
| `@soa-harness/core` | JCS, digest, tasks-fingerprint primitives |
| `@soa-harness/runner` | Core-profile Runner: Agent Card, permissions, audit, session, budget, streams |
| `@soa-harness/memory-mcp-sqlite` | Reference Memory MCP backend (single-node sqlite) |
| `@soa-harness/memory-mcp-mem0` | Reference Memory MCP backend (mem0 hosted) |
| `@soa-harness/memory-mcp-zep` | Reference Memory MCP backend (Zep self-hosted) |
| `@soa-harness/langgraph-adapter` | LangGraph integration for §14.6 event mapping + §18.5 adapter conformance |
| `create-soa-agent` | `npx` scaffold for bootstrapping a new agent |

## Getting started

```bash
npx create-soa-agent my-agent
cd my-agent
npm start
```

Expected within 90 seconds on a warm cache:
- Signed Agent Card on localhost
- Five JCS-canonicalized StreamEvents per demo turn
- One stdin permission prompt resolved
- One audit row appended to the WAL

## Conformance

Clone [`soa-validate`](https://github.com/wleeb1010/soa-validate), point it at a running Runner:

```bash
soa-validate --profile=core --runner-url http://localhost:7700
```

## Status

v1.0.0 release. 8 packages on npm under `latest` dist-tag. Reference Implementation conformance label; Bake-Off Verified pending a second-party reimplementation.

## Links

- [Specification](https://github.com/wleeb1010/soa-harness-specification)
- [Conformance harness (soa-validate)](https://github.com/wleeb1010/soa-validate)
- [Release notes](https://github.com/wleeb1010/soa-harness-specification/blob/main/RELEASE-NOTES.md)
- [Errata](https://github.com/wleeb1010/soa-harness-specification/blob/main/ERRATA.md)

## License

Apache 2.0 for code, CC-BY-4.0 for documentation (matches spec repo).
```

---

## Template B — `soa-validate/README.md`

```markdown
# soa-validate — SOA-Harness Conformance Harness

Independent Go conformance harness for the SOA-Harness v1.0 specification. Drives 234 Core + 186 UI conformance tests against any implementation claiming `core`, `core+si`, `core+handoff`, or `full` profile. Produces JUnit XML + `release-gate.json`.

**Deliberately separate from `soa-harness-impl`.** The independent-judge property — validator and reference runtime authored in different repos, different languages, pinned to the spec's must-map by digest — is load-bearing for meaningful conformance claims. A validator that ships alongside its own reference impl is inherently self-proving.

## Getting started

```bash
go install github.com/wleeb1010/soa-validate/cmd/soa-validate@v1.0.0
soa-validate --profile=core --runner-url http://localhost:7700
```

Exit code `0` = all required tests passed. Non-zero = failures enumerated in `report.json`.

## Pin to the spec

`soa-validate.lock` pins the must-map digest. Impls running conformance MUST match the digest in their own lock file. Spec updates land via a pin-bump PR; the lock is a reviewable action.

## Status

v1.0.0 release. 420-test coverage across Core + UI profiles. Reference Harness for the reference impl; used by second-party implementers for independent verification of their own runs.

## Links

- [Specification](https://github.com/wleeb1010/soa-harness-specification)
- [Reference implementation](https://github.com/wleeb1010/soa-harness-impl)
- [Release notes](https://github.com/wleeb1010/soa-harness-specification/blob/main/RELEASE-NOTES.md)
- [Errata](https://github.com/wleeb1010/soa-harness-specification/blob/main/ERRATA.md)

## License

Apache 2.0.
```

---

## What to adapt per repo

- **Badge row at top** (CI, npm version, license, downloads) — add once the repos are public and have working badge URLs.
- **Detailed install per platform** — Linux / macOS / Windows notes if any install friction exists.
- **`ARCHITECTURE.md` or `HACKING.md`** — contributor-facing internals if the project attracts outside contributors.
- **Deprecation notices** for packages that may retire in v1.1+ — none apply at v1.0.0.

## Leave alone

- **The "Reference Implementation" / "Bake-Off Verified" split** — this wording is deliberate; it's what keeps the conformance labels meaningful.
- **The pin-bump workflow** — landing spec changes in sibling PRs is a load-bearing governance property; don't streamline it away.
