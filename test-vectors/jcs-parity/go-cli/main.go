// jcs-cli — tiny Go helper invoked by generate-vectors.mjs.
//
// Reads raw JSON bytes from stdin, writes the RFC 8785 canonical form to
// stdout using github.com/gowebpki/jcs (Transform).
//
// IMPORTANT: this uses gowebpki/jcs, NOT canonicaljson-go. canonicaljson-go
// implements a different spec (canonicaljson-spec, with capital-E exponents
// and different escape rules) and is NOT RFC 8785 compatible. The difference
// would silently break byte-equivalence with the TS side.
//
// Build: go build -o jcs-cli      (on Windows: go build -o jcs-cli.exe)
package main

import (
	"fmt"
	"io"
	"os"

	"github.com/gowebpki/jcs"
)

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: read stdin: %v\n", err)
		os.Exit(1)
	}

	out, err := jcs.Transform(raw)
	if err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: canonicalize: %v\n", err)
		os.Exit(2)
	}

	if _, err := os.Stdout.Write(out); err != nil {
		fmt.Fprintf(os.Stderr, "jcs-cli: write stdout: %v\n", err)
		os.Exit(3)
	}
}
