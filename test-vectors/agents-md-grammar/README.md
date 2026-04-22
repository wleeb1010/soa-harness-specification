# AGENTS.md Grammar Fixture Set — SV-AGENTS-0x (Finding AU)

Seven pinned AGENTS.md variants exercising the §7.2 required-headings grammar, §7.3 `@import` semantics, §7.4 reload rules, and the §7.2 #4 entrypoint-match invariant. Each subdirectory is a self-contained scenario.

## Scenarios

| Subdirectory | Triggers | Expected Runner verdict |
|---|---|---|
| `missing-h2/` | `## Immutables` removed | Startup fails with `AgentsMdInvalid` + `data.reason: "missing-h2"` |
| `duplicate-h2/` | `## Memory Policy` appears twice | `AgentsMdInvalid(duplicate-h2)` |
| `out-of-order-h2/` | H2 sequence scrambled | `AgentsMdInvalid(out-of-order-h2)` |
| `import-depth-9/` | `@import` chain recurses to depth 9 (> 8) | `AgentsMdImportDepthExceeded` |
| `import-cycle/` | A `@import` B, B `@import` A | `AgentsMdImportCycle` |
| `mid-turn-reload/` | Valid AGENTS.md; validator mutates mid-turn | Per §7.4 reload ignored until turn-end |
| `entrypoint-mismatch/` | `entrypoint: wrong-entrypoint.py` ≠ Card's `self_improvement.entrypoint_file` | `AgentsMdInvalid(entrypoint-mismatch)` |

## Validator choreography

For each failure scenario:

```
SOA_RUNNER_AGENTS_MD_PATH=test-vectors/agents-md-grammar/<scenario>/AGENTS.md
```

Subprocess-isolate, observe:

- `/ready` stays 503
- `/logs/system/recent?category=Config` has one record with expected `code` + `data.reason`

For `mid-turn-reload/`:

1. Start Runner with valid AGENTS.md.
2. Begin a turn.
3. Mutate `AGENTS.md` on disk mid-turn.
4. Complete the turn; assert Runner used the pre-mutation content.
5. Begin a new turn; assert Runner reloaded the new content (§7.4).

## Referenced sections

- Core §7.1 — AGENTS.md location and encoding
- Core §7.2 — Required headings and grammar
- Core §7.3 — `@import` semantics
- Core §7.4 — Reload rules
- Core §24 — `AgentsMdInvalid`, `AgentsMdImportDepthExceeded`, `AgentsMdImportCycle` error codes
