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

## HARD RULE — impl work cannot invent spec content

When writing impl code for `soa-harness-impl` or `soa-validate`, if you must make a design decision the spec doesn't normatively specify — pick enum values, invent field names, choose default behavior, select error reasons — **STOP**. Do not commit impl that establishes a de facto contract through shipped bytes.

Instead:
1. Close the spec gap first (new subsection, new enum member list, new default rule).
2. Run plan-evaluator on the spec draft (same gate as below).
3. Commit the spec change with evaluator citation.
4. Then resume impl, mirroring the normative values.

This rule is why `docs/spec-change-checklist.md` extends the plan-evaluator gate to impl-initiated drift. Precedent: v1.1.0 Debt #7 (scaffold `PINNED_SPEC_COMMIT` drift), v1.2.1 Debt #8 (scaffold `runnerVersion` drift), M9 W1 `A2aHandoffStatusEnum` (invented 7 values §17.2 never listed). Every time we let impl invent, we ship debt.

## Before committing any normative section (HARD GATE)

**MANDATORY:** After drafting but BEFORE `git commit`, run the plan-evaluator skill against the draft. This is not a nice-to-have — it's a hard gate defined in `docs/spec-change-checklist.md`.

The evaluator returns findings in four categories (assumptions, core truths, stress-test, structural challenges). Act on them:

- **Critical** → fix before committing.
- **Moderate** → fix if cheap; otherwise address in a follow-up commit against the same PR before merge.
- **Minor** → note in the commit message or the associated `L-NN` entry.

The commit message MUST cite the evaluator pass (e.g., "plan-evaluator pass: verdict 'targeted fixes', 2 critical addressed inline, 3 moderate addressed inline, 5 minor deferred to L-67").

**Why:** L-64 Debt #7 (v1.1.0 → v1.1.1 same-day patch) is the concrete cost of skipping this gate. A 2-minute evaluator pass would have caught the release-ceremony-ordering flaw. See `docs/spec-change-checklist.md` for the full rationale and the list of when this applies vs when it's optional.

This rule applies to all spec authors, human or AI. Future Claude sessions: do NOT skip this step, even if the change "seems small". Every skip is a potential Debt #N.

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
