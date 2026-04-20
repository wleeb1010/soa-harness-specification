# jcs-cli

Tiny Go helper used by `../generate-vectors.mjs`. Reads raw JSON bytes on stdin, writes the RFC 8785 canonical form to stdout using `github.com/gowebpki/jcs`.

## Build

```sh
cd test-vectors/jcs-parity/go-cli
go build -o jcs-cli       # Linux/macOS
go build -o jcs-cli.exe   # Windows
```

The binary is consumed by `generate-vectors.mjs`. The JS generator looks for `jcs-cli` / `jcs-cli.exe` in this directory and invokes it via `execFileSync`.

## Library choice — `gowebpki/jcs`, NOT `canonicaljson-go`

The package `canonicaljson-go` (by gibson042) is **not** an RFC 8785 implementation — it implements a separate canonical-JSON specification (`canonicaljson-spec`) with different rules (capital-E exponents, different escape behavior). Using it would silently produce output that does not byte-match `canonicalize` (Erdtman's JS RFC 8785 reference), breaking cross-language signature verification.

`github.com/gowebpki/jcs` is the actual RFC 8785 Go implementation — widely adopted (60+ importers), Apache 2.0 licensed, explicitly RFC 8785 compliant.

## Why a separate binary

Building `gowebpki/jcs` into the JS generator would require cgo or a wasm bridge. A standalone Go binary is the cleanest cross-language bridge: JS spawns it, writes stdin, reads stdout, done.

## Dependency pin

`gowebpki/jcs` is pinned in `go.mod`. Bumping the version is a reviewable action — library output changes trigger vector regeneration, which the CI `--verify` gate will catch as drift.

## Binary distribution

The built `jcs-cli` binary is intentionally **NOT committed** (it's in `.gitignore`). Each clone rebuilds from source. This keeps the spec repo platform-neutral and source-reproducible.
