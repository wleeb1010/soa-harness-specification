# Pinned Conformance Tool Registry Fixture

Pinned Tool Registry fixture used by `SV-PERM-01` live-path conformance (Core §10.3 + §10.3.1). Consumed by `soa-validate` to drive the capability-lattice sweep across every `(session.activeMode, tool.risk_class, tool.default_control)` combination.

## Why this exists

Before this fixture, `soa-validate` had to either (a) read the impl's own Tool Registry (impl-specific, no cross-impl comparability) or (b) author its own fixture (author-specific, no spec authority). Neither produced a conformance claim that bound impl and validator to the same bytes. This fixture is the common reference both sides pin to.

## Coverage matrix

The 8 tools deliberately span the assertions in `SV-PERM-01` and exercise each §10.3 code path at least once:

| tool | risk_class | default_control | Expected /permissions/resolve decision per activeMode |
|---|---|---|---|
| `fs__read_file` | ReadOnly | AutoAllow | **ReadOnly:** AutoAllow · **WorkspaceWrite:** AutoAllow · **DangerFullAccess:** AutoAllow |
| `fs__list_directory` | ReadOnly | AutoAllow | Same as above |
| `fs__write_file` | Mutating | Prompt | **ReadOnly:** CapabilityDenied · **WorkspaceWrite:** Prompt · **DangerFullAccess:** Prompt |
| `fs__append_file` | Mutating | AutoAllow | **ReadOnly:** CapabilityDenied · **WorkspaceWrite:** AutoAllow · **DangerFullAccess:** AutoAllow |
| `fs__delete_file` | Destructive | Prompt | **ReadOnly:** CapabilityDenied · **WorkspaceWrite:** CapabilityDenied · **DangerFullAccess:** Prompt |
| `net__http_get` | ReadOnly | Prompt | **Any activeMode:** Prompt (default_control tightens read-only to Prompt for egress hygiene) |
| `proc__spawn_shell` | Destructive | Deny | **ReadOnly:** CapabilityDenied · **WorkspaceWrite:** CapabilityDenied · **DangerFullAccess:** Deny |
| `mem__recall` | ReadOnly | AutoAllow | All three: AutoAllow |

**24 expected decisions** (8 tools × 3 activeModes). The validator asserts every cell; any single mismatch fails `SV-PERM-01` live.

## Fixture design notes

- `default_control` values follow Core §10.2 semantics: AutoAllow < Prompt < Deny, tighten-only composition. A `default_control` of `Prompt` or `Deny` is tighter than `AutoAllow`; the resolver MUST apply tightening in step 3 before the capability check in step 2 gates.
- `proc__spawn_shell` at `default_control = Deny` demonstrates that even at DangerFullAccess the resolver cannot LOOSEN past the default_control. This is the §10.3 step 3 tighten-only rule in effect.
- `net__http_get` at `risk_class = ReadOnly, default_control = Prompt` demonstrates that `default_control` can be strictly tighter than the capability-class floor — risk is read-only but egress-prompt is a security-hygiene default.

## Relationship to impl-side Tool Registries

An impl's production Tool Registry MAY contain any tools the deployment needs. For conformance runs, the impl's Runner MUST be configurable to load this fixture as its authoritative Tool Registry (e.g., `RUNNER_TOOLS_FIXTURE=<path-to-tools.json>`). The fixture is NOT a production Tool Registry and MUST NOT be shipped as one — these tools are synthetic conformance aids, not real capabilities.

## Pinning and regeneration

This fixture is hand-authored and stable. Digests in `MANIFEST.json.supplementary_artifacts` pin it. If a Core §10.3 algorithmic change or a §10.2 risk_class addition makes the 8×3 matrix incomplete or ambiguous, the fixture is revised in a dedicated commit with a pinned digest bump.

## Referenced sections

- Core §10.2 — Tool Classification (`risk_class`, `default_control` semantics)
- Core §10.3 — Resolution Algorithm (5-step function under test)
- Core §10.3.1 — Permission Decision Observability (the endpoint exercised by the validator)
- Core §12.6 — Session Bootstrap (how the validator obtains three sessions at three activeModes)
- Core §11 — Tool Registry primitive (runtime shape this fixture instantiates)
