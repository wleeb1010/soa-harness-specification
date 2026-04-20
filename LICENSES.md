# Licenses

This repository uses a **dual-license split** between code and documentation. This is the standard pattern for standards bodies (IETF, W3C, Linux Foundation) where the spec text and the reference code serve different audiences and adoption paths.

## The split

| Content | License | File |
|---|---|---|
| Specification text (`.md` spec files) | **CC BY 4.0** | `LICENSE-docs.md` |
| JSON Schemas (`schemas/*.schema.json`) | **CC BY 4.0** | `LICENSE-docs.md` |
| Test vectors (`test-vectors/`) | **CC BY 4.0** | `LICENSE-docs.md` |
| Documentation (`docs/`, `README.md`, `GOVERNANCE.md`, `CLAUDE.md`) | **CC BY 4.0** | `LICENSE-docs.md` |
| Node build scripts (`build-manifest.mjs`, `extract-schemas.mjs`) | **Apache 2.0** | `LICENSE` |
| Python analysis scripts (`extract-citations.py`, `refresh-graph.py`) | **Apache 2.0** | `LICENSE` |
| Anything else executable that ships in this repo | **Apache 2.0** | `LICENSE` |

## Why dual-license

- **Apache 2.0 for code** — permissive, includes an explicit patent grant, enterprise-legal-team friendly. Matches sibling repos (`soa-harness-impl`, `soa-validate`) which are also Apache 2.0.
- **CC BY 4.0 for text** — the standards-body default. Lets implementers quote, translate, port to different formats, and build derivative documentation freely, subject only to attribution.

Mixing the two licenses in one repository is a well-established pattern; most IETF Working Group repos and the Linux Foundation style use this split. Per-file license headers are not required when a top-level `LICENSES.md` (this file) documents the split clearly.

## Contributing

By submitting contributions to this repo, you agree that:
- Contributions to code files will be licensed under Apache 2.0
- Contributions to documentation or spec text will be licensed under CC BY 4.0
- You have the right to submit the contribution under these terms

DCO sign-off (`git commit -s`) is your formal attestation. No Contributor License Agreement (CLA) is currently required.

## Trademark

"SOA-Harness" is not yet a registered trademark. The governance document (`GOVERNANCE.md`) notes that the specification is currently a single-maintainer project; formal trademark registration would happen alongside working-group formation.

## Upstream references

For the full legal text of each license:

- Apache License 2.0 — see the `LICENSE` file in this repository (full text inlined) or https://www.apache.org/licenses/LICENSE-2.0
- Creative Commons Attribution 4.0 International — https://creativecommons.org/licenses/by/4.0/legalcode (canonical) or https://creativecommons.org/licenses/by/4.0/ (summary)

## Questions

If you need clarification on whether a specific contribution falls under Apache 2.0 or CC BY 4.0, open an issue before submitting the PR. Generally: if it compiles or runs, Apache; if it reads or gets quoted, CC BY.
