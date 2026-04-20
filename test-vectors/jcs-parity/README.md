# JCS Parity Test Vectors

Cross-language byte-equivalence test vectors for RFC 8785 JSON Canonicalization Scheme. Consumed by both `soa-harness-impl` (via `@filen/rfc8785`) and `soa-validate` (via `canonicaljson-go`) pinned at the spec's current MANIFEST digest.

## Why this exists

JCS byte-equivalence across languages is the **single highest-risk technical invariant** in the SOA-Harness ecosystem. If TypeScript and Go canonicalize the same JSON to different bytes, every signed artifact (Agent Card JWS, MANIFEST JWS, PDA-JWS, audit hash chain) will silently fail cross-implementation verification.

These vectors catch the edge cases where RFC 8785 implementations can diverge — floats at IEEE-754 extremes, special number values, and nested structures that exercise key-sorting order.

## How implementations use these

### TypeScript (`soa-harness-impl`)
```typescript
import { canonicalize } from "@filen/rfc8785";
import vectors from "<spec-repo>/test-vectors/jcs-parity/floats.json";

for (const v of vectors.cases) {
  const result = canonicalize(v.input);
  assert.equal(result, v.expected_canonical);
}
```

### Go (`soa-validate`)
```go
import canonicaljson "github.com/gibson042/canonicaljson-go"

for _, v := range vectors.Cases {
    result, _ := canonicaljson.Marshal(v.Input)
    if string(result) != v.ExpectedCanonical {
        t.Errorf("divergence at case %q", v.Name)
    }
}
```

### Cross-language parity harness (in `soa-harness-impl`)
A test in `packages/core/test/parity/ts-vs-go.test.ts` runs both libraries on the same input via `execa` and compares bytes directly. CI fails if either side disagrees with the `expected_canonical` field OR if the two libraries disagree with each other.

## Vector files

| File | Purpose |
|---|---|
| `floats.json` | IEEE-754 edge cases: subnormals, ±infinity, NaN handling, smallest/largest representable, values where shortest-representation algorithm differs across implementations |
| `integers.json` | Integer-range cases: 0, negative, max safe integer, bigints, leading zeros |
| `strings.json` | Unicode normalization, surrogate pairs, control characters, long strings |
| `nested.json` | Object key sort order (UCS-2 code-unit order per RFC 8785), nested arrays with mixed types, empty containers |
| `arrays.json` | Array canonicalization edge cases (empty arrays, arrays of objects, heterogeneous element types) |

## Vector file schema

```json
{
  "$schema": "https://soa-harness.org/schemas/v1.0/jcs-parity-vector.schema.json",
  "cases": [
    {
      "name": "human-readable case name",
      "input": { "any": "JSON value" },
      "expected_canonical": "<canonical bytes as string>",
      "rationale": "why this case is interesting — what divergence it guards against"
    }
  ]
}
```

## Governance

These vectors are **normative** for conformance. Changes here:
- Require spec-repo PR with 48-hour discussion window
- Bump the spec MANIFEST digest
- Trigger both impl and validate to run their pinning protocol

New cases SHOULD be added when a new edge case is discovered (bug reports, cross-language divergence found during testing, new RFC 8785 errata). Never remove a case without a major spec version bump.

## Initial authoring status

The current vectors are **initial drafts** pending cross-validation between `@filen/rfc8785` and `canonicaljson-go`. During Week 0 of impl M1, the parity harness runs both libraries on these vectors — the first discrepancy discovered blocks M1 until resolved. `expected_canonical` fields may need updating once both libraries agree on the correct output for each case.
