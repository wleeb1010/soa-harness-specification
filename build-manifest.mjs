#!/usr/bin/env node
// Build MANIFEST.json (+ placeholder .jws) listing every artifact in the release bundle
// with a SHA-256 digest. JSON → JCS-canonical bytes (RFC 8785 subset: no whitespace,
// keys sorted by UCS-2 code-unit order). Markdown / text → raw UTF-8 bytes.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Repo root — script runs from either the project dir or with the path overridden.
const DL = process.env.SOA_BUNDLE_ROOT
  ?? path.dirname(fileURLToPath(import.meta.url));

// Minimal JCS — sufficient for this bundle's schema content (strings / objects /
// arrays / safe-range integers only). Per Core §1, production signing paths that
// may encounter non-integer numbers MUST use a library-grade RFC 8785 implementation
// (e.g. `@filen/rfc8785`, `canonicaljson-go`, Python `rfc8785`). This builder is
// audited to not hit those cases — schemas and must-maps are integer-only.
function jcs(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JCS: non-finite number");
    return Number.isInteger(value) ? String(value) : value.toString();
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => {
      // UCS-2 code-unit lexicographic order (JavaScript default for string <)
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    return "{" + keys.map(k => JSON.stringify(k) + ":" + jcs(value[k])).join(",") + "}";
  }
  throw new Error("JCS: unsupported type " + typeof value);
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function digestJson(absPath) {
  const parsed = JSON.parse(fs.readFileSync(absPath, "utf8"));
  const canonical = Buffer.from(jcs(parsed), "utf8");
  return sha256Hex(canonical);
}

function digestRawUtf8(absPath) {
  return sha256Hex(fs.readFileSync(absPath));
}

// -------- build artifact list --------

const supplementary = [];

// Markdowns (raw-utf8)
for (const md of [
  { name: "SOA-Harness Core Specification v1.0 (Final).md", path: "SOA-Harness Core Specification v1.0 (Final).md" },
  { name: "SOA-Harness UI Integration Profile v1.0 (Final).md", path: "SOA-Harness UI Integration Profile v1.0 (Final).md" },
  { name: "SOA UI Gateway Reference Implementation Sketch.md", path: "SOA UI Gateway Reference Implementation Sketch.md" }
]) {
  supplementary.push({
    name: md.name,
    path: md.path,
    sha256: digestRawUtf8(path.join(DL, md.path)),
    canonicalization: "raw-utf8"
  });
}

// Must-maps (JCS)
for (const j of [
  { name: "soa-validate-must-map.json",  path: "soa-validate-must-map.json" },
  { name: "ui-validate-must-map.json",   path: "ui-validate-must-map.json" }
]) {
  supplementary.push({
    name: j.name,
    path: j.path,
    sha256: digestJson(path.join(DL, j.path)),
    canonicalization: "JCS-RFC-8785"
  });
}

// Schemas (JCS)
const schemaDir = path.join(DL, "schemas");
for (const f of fs.readdirSync(schemaDir).sort()) {
  if (!f.endsWith(".schema.json")) continue;
  supplementary.push({
    name: f,
    path: `schemas/${f}`,
    sha256: digestJson(path.join(schemaDir, f)),
    canonicalization: "JCS-RFC-8785"
  });
}

// Test vectors (mixed: JCS for signed JSON artifacts, raw-utf8 for everything else).
function walk(dir, base) {
  const out = [];
  for (const f of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, f);
    const rel = path.posix.join(base, f);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) out.push(...walk(abs, rel));
    else if (stat.isFile()) out.push({ abs, rel });
  }
  return out;
}

const testVectorsDir = path.join(DL, "test-vectors");
if (fs.existsSync(testVectorsDir)) {
  for (const { abs, rel } of walk(testVectorsDir, "test-vectors")) {
    if (rel.endsWith(".json") && !rel.endsWith(".json.jws")) {
      supplementary.push({
        name: path.basename(rel),
        path: rel,
        sha256: digestJson(abs),
        canonicalization: "JCS-RFC-8785"
      });
    } else {
      supplementary.push({
        name: path.basename(rel),
        path: rel,
        sha256: sha256Hex(fs.readFileSync(abs)),
        canonicalization: "raw-utf8"
      });
    }
  }
}

// -------- seccomp + validator-binary placeholders (required by release-manifest schema) --------

const seccompSha = digestJson(path.join(DL, "soa-harness-profile-v1.json"));

// Placeholder digests for validator binaries (they don't exist yet; zero-fill sha256 is
// a common placeholder convention). Replace with real digests when binaries ship.
const placeholderSha = "0".repeat(64);

const manifest = {
  spec_version: "1.0",
  released_at: "2026-04-18T00:00:00Z",
  publisher_kid: "soa-release-v1.0",
  artifacts: {
    seccomp: {
      name: "soa-harness-profile-v1.json",
      sha256: seccompSha,
      canonicalization: "JCS-RFC-8785"
    },
    soa_validate_binary: {
      sha256: placeholderSha,
      url: "https://soa-harness.org/soa-validate/v1.0.0/soa-validate"
    },
    ui_validate_binary: {
      sha256: placeholderSha,
      url: "https://soa-harness.org/ui-validate/v1.0.0/ui-validate"
    },
    supplementary_artifacts: supplementary
  }
};

const manifestPath = path.join(DL, "MANIFEST.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${manifestPath}`);
console.log(`  seccomp sha256:           ${seccompSha}`);
console.log(`  supplementary artifacts:  ${supplementary.length}`);

// Placeholder detached JWS. Real signature requires the release signing key.
// Format: BASE64URL(header) . "" . BASE64URL(sig) with empty payload (detached).
const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: "soa-release-v1.0", typ: "soa-manifest+jws" }), "utf8")
  .toString("base64url");
const sigPlaceholder = "0".repeat(86); // 64-byte Ed25519 sig base64url ≈ 86 chars
const jws = `${header}..${sigPlaceholder}`;
fs.writeFileSync(path.join(DL, "MANIFEST.json.jws"), jws + "\n");
console.log(`Wrote MANIFEST.json.jws  (placeholder; requires real release signing key)`);

// Validate the manifest against the extracted schema (ajv-free; trust structural checks).
try {
  if (!manifest.spec_version || !manifest.released_at || !manifest.publisher_kid || !manifest.artifacts) {
    throw new Error("missing required top-level field");
  }
  if (!manifest.artifacts.seccomp || !manifest.artifacts.soa_validate_binary || !manifest.artifacts.ui_validate_binary) {
    throw new Error("missing required artifact");
  }
  console.log("Structural check: OK");
} catch (err) {
  console.log("Structural check: FAIL - " + err.message);
  process.exit(1);
}
