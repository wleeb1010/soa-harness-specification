# Claude Code Instructions — SOA-Harness Specification Repo

## What this repo is

This is the **normative source of truth** for SOA-Harness v1.0. Every edit here is potentially a spec change. Reference implementations (`soa-harness-impl`, `soa-validate`) depend on the digests of files in this repo.

## Two MCP servers are available to you

- **`graphify-spec`** (user-level) — the knowledge graph of this repo. 500 nodes / 880+ edges covering every section, cross-reference, test ID, `risk_class`, trust-class mapping, threat-model entry, and rationale. Query this **before grepping** when asked about spec structure, citation impact, test coverage, or relationships.
- **`CodeGraphContext`** (per-project) — code-structure graph for the `.mjs` / `.py` build and analysis tooling in this repo. Query for questions about `build-manifest.mjs`, `extract-citations.py`, `refresh-graph.py`.

Prefer MCP queries over `Grep`/`Read` for:
- "Which sections cite §X?" → `graphify-spec` `get_neighbors`
- "What's load-bearing?" → `graphify-spec` `god_nodes`
- "Are there orphan normatives?" → `graphify-spec` `query_graph` with orphan filter
- "Which tests validate §X?" → citations-based query

## Before editing any normative section

1. Query `graphify-spec` for the section's incoming citations — anything that cites it needs impact review
2. Check if the section has a test ID mapping in `soa-validate-must-map.json` or `ui-validate-must-map.json`
3. If the edit affects wire format, versioned behavior, or security invariants, it's a `§19.4` major/minor bump — flag it explicitly

## Authoritative files (do not reverse-engineer)

- `SOA-Harness Core Specification v1.0 (Final).md` — core normative
- `SOA-Harness UI Integration Profile v1.0 (Final).md` — UI profile normative
- `schemas/*.schema.json` — every signed/validated artifact's wire schema
- `soa-validate-must-map.json` / `ui-validate-must-map.json` — MUST-to-test-ID mapping (conformance contract)
- `test-vectors/` — pinned digest artifacts consumed by implementations

## What auto-runs on commit

- `extract-citations.py` refreshes `graphify-out/citations.json`
- `refresh-graph.py` refreshes `graphify-out/graph.json`, `graph.html`, `GRAPH_REPORT.md`
- `graphify-spec` MCP picks up the refreshed graph on next query — **no restart needed**

## Working with the reference implementation

- `soa-harness-impl` and `soa-validate` live in sibling directories. When a spec change affects them, bump the MANIFEST digest in this repo → they'll notice via their pinned `soa-validate.lock`.
- Never co-author spec + impl changes in the same PR. Spec changes land here first; impl PRs pin-bump afterward as a separate, reviewable action.

## Governance

See `GOVERNANCE.md`. SOA-Harness is currently a single-maintainer project explicitly acknowledged in that file; we are not pretending to be a working group.
