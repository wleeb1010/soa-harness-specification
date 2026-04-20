// jcs-cli — tiny Go helper invoked by generate-vectors.mjs.
// Reads one JSON value from stdin, writes the RFC 8785 canonical form to stdout.
//
// Build: go build -o jcs-cli   (on Windows: go build -o jcs-cli.exe)
//
// This binary is intentionally minimal — it exists so the JS generator can shell
// out to canonicaljson-go without needing a Go runtime in the same process.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	canonicaljson "github.com/gibson042/canonicaljson-go"
)

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: read stdin: %v\n", err)
		os.Exit(1)
	}

	// Use json.Decoder with UseNumber to preserve integer precision —
	// canonicaljson-go will re-emit using the number's exact representation.
	var value interface{}
	dec := json.NewDecoder(nopReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&value); err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: parse input JSON: %v\n", err)
		os.Exit(2)
	}

	out, err := canonicaljson.Marshal(value)
	if err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: canonicalize: %v\n", err)
		os.Exit(3)
	}

	// Write bytes exactly as produced — no trailing newline (canonical form is byte-exact).
	if _, err := os.Stdout.Write(out); err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: write stdout: %v\n", err)
		os.Exit(4)
	}
}

// nopReader wraps a byte slice as an io.Reader without extra allocations.
type nopReader []byte

func (r nopReader) Read(p []byte) (int, error) {
	if len(r) == 0 {
		return 0, io.EOF
	}
	n := copy(p, r)
	return n, nil
}
