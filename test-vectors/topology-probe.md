# Topology Probe (UV-SESS-06†)

Reference recipe for verifying UI §5.1: artifacts served from a cookie-less origin distinct from the UI origin.

Normative steps are in **UI Integration Profile §5.1**. This file is an informative recipe plus canned fixtures for harness bring-up.

## Inputs

- Discovery document at `https://{{GATEWAY_HOST}}/.well-known/soa-ui-config.json` (published per UI §7.1).
- One sample artifact URL from the Runner under test (e.g., a static image or binary referenced by a `ContentBlock` in a reference session transcript).

## Steps

1. **Resolve origins.**
   - Fetch the discovery doc.
   - Parse `ws_endpoint` (the UI origin's `wss://` endpoint) and `artifacts_origin` / `{{ARTIFACTS_ORIGIN}}` from the doc.
   - Derive the UI origin from the deployment (normally the origin that serves the UI SPA; in CLI/IDE this is the IPC peer identity).

2. **Registrable-domain separation.**
   - Compute eTLD+1 of the UI origin using the [Public Suffix List](https://publicsuffix.org/).
   - Compute eTLD+1 of `{{ARTIFACTS_ORIGIN}}`.
   - MUST differ.

3. **Fully cookie-less artifact responses (normative).**
   - Issue `GET {{ARTIFACTS_ORIGIN}}/<sample-artifact-path>` with no credentials, no `Cookie` header.
   - Inspect all response headers.
   - The response MUST NOT emit any `Set-Cookie` header — neither a UI-scoped cookie (Domain reaching the UI eTLD+1) nor a host-only cookie on the artifact origin itself. The artifact origin is a pure-content origin; session state lives on the Gateway origin, not here.
   - Rationale: the design intent in §5.1 is "cookie-less, to prevent CSRF token leakage." A narrower check that only rejects UI-eTLD+1-scoped cookies would allow host-only cookies on the artifact origin, which still creates a confused-deputy surface if the artifact origin is ever reached via a browser context that also carries credentials.

4. **Cross-origin resource policy.**
   - The artifact response MUST carry `Cross-Origin-Resource-Policy: cross-origin`.
   - `same-site` and `same-origin` values fail the probe: step 2 REQUIRES the UI and artifact origins to differ by eTLD+1, which makes any stricter CORP value incompatible with the deployment topology (the UI would be blocked from embedding the artifact).
   - Responses without the header fail the probe.

## Pass / Fail

- All four checks pass → UV-SESS-06† recorded as PASS in `ui-validate` output.
- Any check fails → UV-SESS-06† recorded as FAIL with the failed step and observed header values.

## Example Pass

```
Discovery doc:          https://gateway.example.com/.well-known/soa-ui-config.json
  ws_endpoint:          wss://gateway.example.com/ui/v1/connect
  artifacts_origin:     https://artifacts.example-cdn.net
UI origin eTLD+1:       example.com
Artifact origin eTLD+1: example-cdn.net                             ✓ differ
Artifact GET /sample.png
  Set-Cookie: (none)                                                ✓ no UI-scoped cookie
  Cross-Origin-Resource-Policy: cross-origin                        ✓ present, cross-origin
PASS UV-SESS-06†
```

## Example Fail

```
Artifact origin eTLD+1: example.com                                  ✗ same eTLD+1 as UI
FAIL UV-SESS-06†  (step 2: registrable-domain separation)
```

## Automation

A JSON fixture for unit tests of the probe itself is published at
`https://soa-harness.org/test-vectors/v1.0/topology-probe-fixture.json` and
mirrored at `test-vectors/topology-probe-fixture.json` in the release bundle.
