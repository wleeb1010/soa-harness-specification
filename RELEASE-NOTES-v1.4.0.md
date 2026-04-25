# SOA-Harness v1.4.0 Release Notes

Adopter-facing narrative for v1.4.0. For the line-by-line changelog see `CHANGELOG.md`; for change classification see `docs/errata-policy.md`.

v1.4.0 is an **additive minor release** per §19.4.1. A v1.0, v1.1, v1.2, or v1.3 conformance claim remains valid with zero code changes — v1.4 only adds new capabilities, never removes or breaks existing ones.

---

## What's new

### §17.2.3.2 Reserved-tokens registry mechanism (Normative)

v1.3.0 shipped §17.2.3 A2A capability matching with byte-equality semantics over UTF-8 strings, plus an Informative §17.2.3.1 placeholder noting that a Normative successor "lands in v1.4+ if a cross-ecosystem vocabulary emerges." v1.4 closes that promise — *the mechanism* — while deferring the artifact itself to a later release.

- **§17.2.3.2 (Normative).** Defines the admission regex `^(?!x-)[a-z][a-z0-9]*(-[a-z0-9]+)*$` (length 3–64 UTF-8 bytes) for tokens eligible for inclusion in a reserved registry. Negative lookahead excludes the `x-` vendor prefix. Schema authors SHOULD pair the regex with a `"not": {"pattern": "^x-"}` clause to remain compatible with JSON Schema validators that lack ECMA-262 lookahead support.
- **Three-state lifecycle:** entries are `"active"` by default; can transition to `"deprecated"` (planned EOL, requires `deprecated_in` + `deprecation_note`) or `"withdrawn"` (escape hatch for clerical errors, requires `withdrawn_in` + `withdrawn_reason`). Transitions are one-way; merged entries are never removed from the file.
- **Required fields:** `token`, `description` (10–500 bytes), `sponsor` (deprecation contact), `added_in`, `status`, plus the lifecycle-conditional fields. Uniqueness on `token` (first-accepted wins).
- **Wire decoupling:** registry membership is **non-normative for runtime matching**. §17.2.3's UTF-8 byte-equality rule remains the sole matching contract. Registered tokens and unregistered well-formed tokens are equivalent on the wire.
- **MANIFEST digest semantics:** when the registry file ships, its digest will change on every addition. Implementations MUST NOT pin a specific registry-file digest as a conformance requirement. These MUSTs govern conformance claims, not wire bytes; enforcement is by review of conformance documentation.
- **Two-vocabulary permanence:** v1.3 wire compatibility is permanent. Wire-legal tokens (superset, anything well-formed under §17.2.3) and registered tokens (subset, admission-regex-matching) coexist for the life of v1.x.

**Deferred to v1.4.1+:** the registry file itself (`registries/a2a-capability-tokens.json`), its companion schema (`registries/a2a-capability-tokens.schema.json`), the repo-hygiene must-map (`registry-validate-must-map.json`), and the `REG-A2A-01..05` test IDs. These ship together with the first accepted token submission, or as a v1.5.0 companion artifact if no submissions materialize.

### §17.2.3 emitter convention paragraph (Informative)

A new "Convention for non-registered tokens" paragraph in §17.2.3 documents that emitters SHOULD prefix vendor-specific, private, or experimental tokens with `x-` (e.g., `x-acme-compress`) to avoid collision with future §17.2.3.2 registry entries. This is a convention for emitters only; receivers MUST continue to treat `x-`-prefixed tokens identically to any other well-formed token per the byte-equality rule (no pattern-based rejection on the wire). RFC 6648 is acknowledged explicitly: its scope (HTTP message headers + MIME parameters) does not extend to general application-protocol namespaces, and SOA-Harness A2A retains `x-` as the emitter convention for non-registered tokens.

### §18.5.6 Framework Reservations (Informative)

A new subsection defines `"reserved"` as a named concept for the §18.5.1 `adapter_notes.host_framework` closed enum. A reserved framework is a value in the enum for which the SOA-Harness maintainers have declared no first-party adapter will ship during the current major version line. Reservation is a *scoping statement* about maintainer plans; it does NOT remove the value from the enum, deprecate it, or alter any normative MUST in §18.5.1–§18.5.5.

**First reservation:** `"crewai"` is reserved for v1.x. The SOA-Harness maintainers will NOT publish a first-party `@soa-harness/crewai-adapter` during v1.x. Rationale: CrewAI is Python-only, so a first-party adapter would require standing up a parallel pypi packaging + Python CI + Python signing pipeline that exceeds single-maintainer capacity per `GOVERNANCE.md`.

**Adopter paths for running CrewAI under SOA-Harness:**

1. **Community CrewAI adapter.** Build and distribute an adapter that declares `adapter_notes.host_framework: "crewai"` and satisfies §18.5.1–§18.5.4. Because `SV-ADAPTER-03` defaults to a LangGraph fixture, a non-LangGraph adapter MUST use the §14.6.4 Adapter Deviation Protocol to declare its own event mapping and publish a paired test vector. Under these conditions the community adapter is conformant on the same terms as any other adapter.
2. **Use `"custom"` instead.** Declare `adapter_notes.host_framework: "custom"` with `adapter_notes.host_framework_details: "CrewAI"`. This is the *preferred v1.x path* for adopters who do not intend to publish their adapter for community conformance testing.

**Precedent rule:** Additional reservations under §18.5.6 are permitted as informative additions (§19.4 minor). Removing a reserved value from the §18.5.1 enum remains a wire-format narrowing and is a §19.4 major. Future maintainers facing similar decisions for `"autogen"` or `"langchain-agents"` can append to §18.5.6's reservation list as a minor without restructuring §18.5.1.

### §14.6.4 Adapter Deviation Protocol — wording cleanup (Editorial)

§14.6.4's bullet 1 previously read "Document the specific LangGraph events that deviate from the table in its own `README.md`," implicitly assuming every adapter was LangGraph-based. v1.4 generalizes the wording: a LangGraph-based adapter still documents events that diverge from §14.6.1; a non-LangGraph adapter documents its complete host-framework-event → SOA StreamEvent mapping as the substitute. Bullet 2 and the chapeau are similarly framework-agnosticized. No normative force changes; this is purely a wording polish to support §18.5.6's community-CrewAI-adapter conformance path.

---

## Adoption path

### For existing v1.0 / v1.1 / v1.2 / v1.3 adopters (zero code changes)

Your existing Runner continues to conform under v1.4 without modification.

- §18.5.6 framework reservations affect only what first-party adapters the SOA-Harness project commits to ship — they do NOT impose new requirements on existing adapters or Runners.
- §17.2.3.2 ships a *mechanism* with no registry artifact in v1.4.0, so no impl-side wire change is possible from this release.
- §17.2.3's new emitter convention paragraph is a SHOULD for emitters; existing token vocabularies remain wire-legal regardless of `x-` prefix usage.
- §14.6.4's cleanup is editorial — no normative force change.

### For adopters considering a CrewAI-based adapter

See §18.5.6 for the disposition. Two adopter paths are documented; the `"custom"` declaration path is recommended for non-publishing deployments. If you intend to publish a community adapter declaring `"crewai"`, follow §18.5.1–§18.5.4 + §14.6.4's deviation protocol with a CrewAI-flavored event mapping + paired test vector.

### For adopters considering a token registry submission

The registry file itself does not yet exist; submissions can be coordinated via project issues until the artifact ships. The mechanism (regex, lifecycle, governance) is normative as of v1.4.0 — adopters can begin planning submissions now, but the file lands with the first accepted token (or as a v1.5.0 companion if no submissions materialize).

---

## Compatibility & pinning

- **Spec pin:** see commit at v1.4.0 tag (this release).
- **Signing key:** v1.0 release key (fingerprint unchanged; no key rotation at v1.4).
- **npm packages:** `@soa-harness/{schemas, core, runner, memory-mcp-sqlite, memory-mcp-mem0, memory-mcp-zep, langgraph-adapter, example-provider-adapter, chat-ui, cli}` + `create-soa-agent`, all bumping `1.3.3` → `1.4.0` (impl-side pin-bump ships as a separate commit on `soa-harness-impl` per the spec-lands-first rule).
- **Conformance profile coverage:** unchanged from v1.3 (Core + Self-Improvement + Handoff). v1.4 adds no new wire surface; the §17.2.3.2 mechanism is non-normative for runtime matching.

---

## Governance

v1.4 continues the single-maintainer cadence documented in `GOVERNANCE.md`. Every normative commit in the v1.4 chain passed the plan-evaluator hard-gate defined at `docs/spec-change-checklist.md`:

- **§18.5.6 (L-79):** 1 evaluator pass; 0 critical, 6/6 moderate addressed inline, 3 minor deferred to L-79.
- **§17.2.3.2 (L-81):** 3 evaluator passes (plan v1, plan v2, prose); plan v1 surfaced 3 criticals all resolved in plan v2; final prose pass had 1 critical + 5 moderate addressed inline.
- **§14.6.4 cleanup (this release prep):** 1 evaluator pass; 0 critical, 0 moderate, 5 minor (3 addressed inline, 2 deferred).

Findings from each pass are cited in the corresponding commit messages and summarized in `CHANGELOG.md` under the v1.4.0 entry.

---

## Known deferrals to v1.4.x

- **`registries/a2a-capability-tokens.json` + `registries/a2a-capability-tokens.schema.json`** — the §17.2.3.2 registry file artifact and its schema. Ship together with the first accepted token submission or as a v1.5.0 companion artifact if no submissions materialize.
- **`registry-validate-must-map.json` + `REG-A2A-01..05`** — repo-hygiene must-map and test IDs for the registry file. Forward-referenced from §17.2.3.2; ship with the artifact.
- **AutoGen + LangChain-Agents framework dispositions** (L-80) — both deliberately deferred. AutoGen has JS-native bindings (`@autogen/core`) and remains a tractable first-party adapter candidate; LangChain-Agents is supersession-eligible for §18.5.6 reservation but coupled to AutoGen's resolution to keep §18.5.6 lopsidedness-free.
- **mTLS `x5t#S256` live-probe path** (L-78) — feasible per the L-78 design note; queued for v1.4.x bundled with other §17-touching work. Adds `SV-A2A-11b` companion test ID to the existing `SV-A2A-11` Agent-Card-kid path.
- **Caller-side `result_digest` attestation** — v1.3 scopes `result_digest` recompute to shape-check only (no `result` object on wire). A future v1.4.x revision will normatively define the caller-side signing obligation that binds `result_digest` to the produced `result`.
