# AGENTS.md Denylist Fixture — SV-REG-04

Pinned fixture for `SV-REG-04` — conformance test that asserts tools named under `AGENTS.md :: ## Agent Type Constraints → ### Deny` MUST NOT appear in `/tools/registered.tools[]`.

## Files

- `AGENTS.md` — minimum-viable AGENTS.md with a `## Agent Type Constraints → ### Deny` section naming `fs_write_dangerous` as the denied tool.
- `tools-with-denied.json` — five-tool registry fixture whose array includes `fs_write_dangerous` (the denied one) plus four unrelated tools.

## Usage

Conformant Runner is started with:

```
SOA_RUNNER_AGENTS_MD_PATH=test-vectors/agents-md-denylist/AGENTS.md
RUNNER_TOOLS_FIXTURE=test-vectors/agents-md-denylist/tools-with-denied.json
```

per §11.2.1 (AGENTS.md source path test hook) and the impl-defined `RUNNER_TOOLS_FIXTURE` bootstrap path.

Validator then polls `GET /tools/registered` and asserts:

1. `tools[].name` is a subset of the five-tool fixture
2. `tools[].name` does NOT include `fs_write_dangerous`
3. `registry_version` is present and non-empty
4. Size of returned `tools[]` equals 4 (five minus one denied)

## Referenced sections

- Core §11 — Tool Registry
- Core §11.2 — Per-Session Tool Pool (deny-list subtraction)
- Core §11.2.1 — AGENTS.md Source Path Test Hook (this fixture's binding)
- Core §11.4 — Dynamic Registration Observability (`/tools/registered` endpoint)
