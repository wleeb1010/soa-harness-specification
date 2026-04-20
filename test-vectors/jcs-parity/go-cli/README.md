# jcs-cli

Tiny Go helper used by `../generate-vectors.mjs`. Reads one JSON value on stdin, writes the `canonicaljson-go` canonical form to stdout. No flags, no wrapping — byte-exact.

## Build

```sh
cd test-vectors/jcs-parity/go-cli
go build -o jcs-cli       # Linux/macOS
go build -o jcs-cli.exe   # Windows
```

Resulting binary is consumed by `generate-vectors.mjs`. The JS generator looks for `jcs-cli` / `jcs-cli.exe` in this directory and invokes it via `execFileSync`.

## Why a separate binary

Building `canonicaljson-go` into the JS generator would require cgo or a wasm bridge. A standalone Go binary is the cleanest cross-language bridge: JS spawns it, writes stdin, reads stdout, done.

## Dependency pin

`canonicaljson-go` is pinned in `go.mod`. Bumping the version is a reviewable action — library output changes trigger vector regeneration, which the CI `--verify` gate will catch as drift.

## Binary distribution

The built `jcs-cli` binary is intentionally **NOT committed** to the repo (it's in `.gitignore`). Each clone rebuilds from source. This keeps the spec repo platform-neutral and source-reproducible.
