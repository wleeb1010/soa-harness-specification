#!/usr/bin/env node
// generate-vectors.mjs — produces cross-language-verified JCS parity vectors.
//
// Reads inputs/{floats,integers,strings,nested}.json, runs every case through
// BOTH @filen/rfc8785 (TypeScript/JavaScript side) AND canonicaljson-go
// (Go side, invoked as subprocess), writes generated/{same}.json with the
// verified expected_canonical field populated from agreed library output.
//
// Usage:
//   node generate-vectors.mjs              # regenerate all
//   node generate-vectors.mjs --verify     # regenerate + assert no drift vs committed
//   node generate-vectors.mjs --files=floats.json,strings.json   # subset
//
// Exit codes:
//   0  — generation successful, libraries agree on every case
//   1  — library divergence detected; manual RFC-8785 resolution required
//   2  — --verify found drift between regenerated output and committed version
//   3  — runtime error (missing Go binary, missing npm dep, malformed input)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = join(HERE, "inputs");
const GENERATED_DIR = join(HERE, "generated");

// ─── CLI flag parsing ────────────────────────────────────────────
const args = process.argv.slice(2);
const VERIFY_MODE = args.includes("--verify");
const FILES_ARG = args.find(a => a.startsWith("--files="));
const FILES_SUBSET = FILES_ARG
  ? FILES_ARG.slice("--files=".length).split(",")
  : ["floats.json", "integers.json", "strings.json", "nested.json"];

// ─── TypeScript-side canonicalizer ───────────────────────────────
// Loads @filen/rfc8785 lazily so the script fails gracefully with a
// clear message if the package isn't installed yet.
let canonicalizeTS;
try {
  const { canonicalize } = await import("@filen/rfc8785");
  canonicalizeTS = canonicalize;
} catch (err) {
  console.error("[generate-vectors] FATAL: @filen/rfc8785 not installed.");
  console.error("[generate-vectors]        Run: npm install @filen/rfc8785");
  console.error("[generate-vectors]        (from the spec repo root, or set up a package.json here)");
  process.exit(3);
}

// ─── Go-side canonicalizer ───────────────────────────────────────
// Invokes a tiny Go helper that reads JSON from stdin and writes canonical
// bytes to stdout. The helper source lives at jcs-parity/go-cli/main.go
// (provided alongside this script). Build once: cd go-cli && go build -o jcs-cli.
const GO_CLI_PATH = join(HERE, "go-cli",
  process.platform === "win32" ? "jcs-cli.exe" : "jcs-cli");

function canonicalizeGo(input) {
  if (!existsSync(GO_CLI_PATH)) {
    throw new Error(
      `Go CLI helper not built. Run: cd ${join(HERE, "go-cli")} && go build -o ${process.platform === "win32" ? "jcs-cli.exe" : "jcs-cli"}`
    );
  }
  const json = JSON.stringify(input);
  const stdout = execFileSync(GO_CLI_PATH, [], {
    input: json,
    encoding: "utf-8",
    timeout: 5000
  });
  return stdout;
}

// ─── Main generation loop ────────────────────────────────────────
let anyDivergence = false;
let anyDrift = false;

for (const filename of FILES_SUBSET) {
  const inputPath = join(INPUTS_DIR, filename);
  const generatedPath = join(GENERATED_DIR, filename);

  if (!existsSync(inputPath)) {
    console.error(`[generate-vectors] SKIP: ${filename} missing from inputs/`);
    continue;
  }

  const inputs = JSON.parse(readFileSync(inputPath, "utf-8"));
  const generated = {
    "$schema": "https://soa-harness.org/schemas/v1.0/jcs-parity-generated.schema.json",
    "generated_by": "generate-vectors.mjs",
    "generated_at": new Date().toISOString(),
    "libraries": {
      "ts": { "name": "@filen/rfc8785", "version": getPkgVersion("@filen/rfc8785") },
      "go": { "name": "canonicaljson-go", "version": "see go-cli/go.mod" }
    },
    "source_inputs": `inputs/${filename}`,
    "cases": []
  };

  for (const c of inputs.cases) {
    let tsBytes, goBytes, tsError, goError;
    try { tsBytes = canonicalizeTS(c.input); }
    catch (e) { tsError = e.message; }
    try { goBytes = canonicalizeGo(c.input); }
    catch (e) { goError = e.message; }

    const entry = {
      name: c.name,
      input: c.input,
      rationale: c.rationale
    };

    if (tsError || goError) {
      entry.error_ts = tsError ?? null;
      entry.error_go = goError ?? null;
      entry.libraries_agree = false;
      entry.MANUAL_RESOLUTION_REQUIRED = "one or both libraries threw an error; see error_ts / error_go";
      anyDivergence = true;
    } else if (tsBytes === goBytes) {
      entry.expected_canonical = tsBytes;
      entry.libraries_agree = true;
    } else {
      entry.ts_output = tsBytes;
      entry.go_output = goBytes;
      entry.libraries_agree = false;
      entry.MANUAL_RESOLUTION_REQUIRED = "libraries disagree; investigate RFC 8785 for correct output and file upstream issue";
      anyDivergence = true;
    }

    generated.cases.push(entry);
  }

  const nextContent = JSON.stringify(generated, null, 2) + "\n";

  if (VERIFY_MODE && existsSync(generatedPath)) {
    const committed = readFileSync(generatedPath, "utf-8");
    // Strip generated_at timestamps before comparison; those are expected to differ
    const strip = s => s.replace(/"generated_at":\s*"[^"]+"/, '"generated_at":""');
    if (strip(committed) !== strip(nextContent)) {
      console.error(`[generate-vectors] DRIFT in ${filename}: committed file does not match regenerated output`);
      console.error(`[generate-vectors]   Run without --verify to update, or investigate library-version change.`);
      anyDrift = true;
      continue;
    }
    console.log(`[generate-vectors] OK: ${filename} matches committed output`);
  } else {
    writeFileSync(generatedPath, nextContent);
    console.log(`[generate-vectors] wrote generated/${filename} — ${generated.cases.length} cases, ${generated.cases.filter(c => !c.libraries_agree).length} divergence(s)`);
  }
}

// ─── Exit code dispatch ──────────────────────────────────────────
if (anyDivergence) {
  console.error("[generate-vectors] LIBRARY DIVERGENCE detected. Check generated files for MANUAL_RESOLUTION_REQUIRED entries.");
  process.exit(1);
}
if (VERIFY_MODE && anyDrift) {
  console.error("[generate-vectors] DRIFT detected in --verify mode. Commit regenerated vectors or investigate library version change.");
  process.exit(2);
}
console.log("[generate-vectors] done.");
process.exit(0);

// ─── Helpers ─────────────────────────────────────────────────────
function getPkgVersion(pkgName) {
  try {
    const pkgJsonPath = join(HERE, "node_modules", pkgName, "package.json");
    if (existsSync(pkgJsonPath)) {
      return JSON.parse(readFileSync(pkgJsonPath, "utf-8")).version;
    }
  } catch (_) { /* fall through */ }
  return "unknown";
}
