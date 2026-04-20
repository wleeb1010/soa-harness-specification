# JCS Parity Test Vectors

Cross-language byte-equivalence vectors for RFC 8785 JSON Canonicalization Scheme. Consumed by `soa-harness-impl` (via `canonicalize`) and `soa-validate` (via `gowebpki/jcs`), pinned at this spec's MANIFEST digest.

## Why this exists

JCS byte-equivalence across languages is the **single highest-risk technical invariant** in the SOA-Harness ecosystem. If TypeScript and Go canonicalize the same JSON to different bytes, every signed artifact (Agent Card JWS, MANIFEST JWS, PDA-JWS, audit hash chain) silently fails cross-implementation verification.

## Directory layout

```
jcs-parity/
├── inputs/                       # hand-authored: raw JSON cases + rationale
│   ├── floats.json               # NO expected_canonical fields here
│   ├── integers.json
│   ├── strings.json
│   └── nested.json
├── generated/                    # machine-produced: verified expected outputs
│   ├── floats.json               # written by generate-vectors.mjs
│   ├── integers.json
│   ├── strings.json
│   └── nested.json
├── generate-vectors.mjs          # the generator (JS; invokes TS + Go libraries)
├── go-cli/                       # tiny Go helper the generator shells out to
│   ├── main.go                   # reads stdin JSON, emits gowebpki/jcs bytes on stdout
│   ├── go.mod                    # pins gowebpki/jcs version
│   └── README.md                 # build instructions
└── README.md                     # this file
```

**The split matters.** Humans author `inputs/` (test cases + why each case is interesting). The generator produces `generated/` by running both libraries and recording their agreed output. **Hand-authoring `expected_canonical` values is prohibited** — that's what produced the float-canonicalization divergence found in 2026-04-20's Week 0 parity check.

## How to regenerate

Prerequisites: Node 20+, Go 1.22+, and the `canonicalize` npm package (Samuel Erdtman's RFC 8785 reference) available from either the spec-repo root or a local `package.json` in `jcs-parity/`. Install: `npm install canonicalize`.

```sh
# Build the Go helper once
cd test-vectors/jcs-parity/go-cli
go build -o jcs-cli            # Linux/macOS
go build -o jcs-cli.exe        # Windows

# Generate all vectors
cd ..
node generate-vectors.mjs

# Or regenerate a subset
node generate-vectors.mjs --files=floats.json,strings.json

# CI drift check: regenerate and compare against committed generated/*.json
node generate-vectors.mjs --verify
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All libraries agree on every case. `generated/` is up to date (or was verified in `--verify` mode). |
| 1 | **Library divergence.** TS and Go produced different bytes for at least one case. Check `generated/*.json` for entries with `MANUAL_RESOLUTION_REQUIRED` — file upstream issue against the wrong library per RFC 8785 §3.2. |
| 2 | **Drift** (only in `--verify` mode). Committed `generated/` disagrees with freshly-regenerated output. Either a library version changed or a case was edited; commit the regenerated files or pin the library back. |
| 3 | Runtime error — missing dependency, missing Go helper binary, malformed input. |

## How implementations use these

### TypeScript (`soa-harness-impl`)

```typescript
import canonicalize from "canonicalize";  // default export, not named
import vectors from "../../../../soa-harness=specification/test-vectors/jcs-parity/generated/floats.json";

for (const c of vectors.cases) {
  if (!c.libraries_agree) {
    throw new Error(`vector "${c.name}" requires manual resolution — do not use`);
  }
  const result = canonicalize(c.input);
  assert.equal(result, c.expected_canonical);
}
```

### Go (`soa-validate`)

```go
import canonicaljson "github.com/gibson042/gowebpki/jcs"

for _, c := range vectors.Cases {
    if !c.LibrariesAgree {
        t.Fatalf("vector %q requires manual resolution", c.Name)
    }
    result, _ := canonicaljson.Marshal(c.Input)
    if string(result) != c.ExpectedCanonical {
        t.Errorf("divergence at case %q", c.Name)
    }
}
```

### Cross-language parity harness (in `soa-harness-impl`)

`packages/core/test/parity/ts-vs-go.test.ts` runs both libraries on the same inputs and compares bytes to the `expected_canonical` field. CI fails if either side disagrees with the recorded canonical form.

## Vector file schemas

**Input schema** (`inputs/*.json`):
```json
{
  "$schema": "https://soa-harness.org/schemas/v1.0/jcs-parity-input.schema.json",
  "description": "Human-readable description of this file's scope",
  "cases": [
    {
      "name": "human-readable case name",
      "input": { "any": "JSON value" },
      "rationale": "why this case is interesting — what divergence it guards against"
    }
  ]
}
```

**Generated schema** (`generated/*.json`):
```json
{
  "$schema": "https://soa-harness.org/schemas/v1.0/jcs-parity-generated.schema.json",
  "generated_by": "generate-vectors.mjs",
  "generated_at": "2026-04-20T15:39:00.000Z",
  "libraries": {
    "ts": { "name": "canonicalize", "version": "x.y.z" },
    "go": { "name": "gowebpki/jcs", "version": "1.0.3" }
  },
  "source_inputs": "inputs/<same filename>",
  "cases": [
    {
      "name": "...",
      "input": { ... },
      "rationale": "...",
      "expected_canonical": "<bytes both libraries agree on>",
      "libraries_agree": true
    }
  ]
}
```

## Governance

- **Changes to `inputs/`**: require spec-repo PR with 48h discussion window. Regenerate `generated/` in the same PR.
- **Changes to `generated/` without matching `inputs/` change**: forbidden. Always regenerate from `inputs/` via the script.
- **Library version bumps** (`canonicalize` in npm or `gowebpki/jcs` in `go-cli/go.mod`): reviewable PR. Regenerate. CI `--verify` catches silent drift.
- **Removing a case**: major-version spec bump only (breaks downstream implementations that pinned to the vector).

## History

This directory was initially authored with hand-written `expected_canonical` fields (commit `2e0a3fc`). During Week 0 parity testing, the validate session found divergence on every float case — not because the libraries disagreed with each other, but because the hand-authored expected values were imprecise guesses. The `inputs/` + `generated/` + generator split was introduced to eliminate that error class entirely. Implementers should consume only `generated/`.
