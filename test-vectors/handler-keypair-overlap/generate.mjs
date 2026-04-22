#!/usr/bin/env node
// Regenerates two Ed25519 handler keypairs + per-key manifests for SV-PERM-10
// (§10.6 24h rotation overlap). Both keys MUST verify during the overlap
// window; outside the window, only the current kid verifies.
//
// Pinned overlap window:
//   key-1 issued_at           = 2026-04-20T00:00:00Z
//   key-1 rotation_overlap_end = 2026-04-23T00:00:00Z (3 days overlap — exceeds §10.6 minimum of 24h)
//   key-2 issued_at           = 2026-04-22T00:00:00Z (1 day before key-1 retirement — within overlap)
//   key-2 rotation_overlap_end = 2026-04-26T00:00:00Z (key-2 as current after key-1 retires)
//
// Validator probe choreography with RUNNER_TEST_CLOCK=2026-04-22T12:00:00Z:
//   - Both key-1 and key-2 should verify (inside overlap for both)
//   - With clock=2026-04-19T00:00:00Z: key-1 not-yet-valid; key-2 not-yet-issued
//   - With clock=2026-04-24T00:00:00Z: key-1 past overlap_end (reject); key-2 valid
//
// Deterministic Ed25519 PureEdDSA from 32-byte seeds (same pattern as
// test-vectors/handler-keypair/).
//
// Run: node test-vectors/handler-keypair-overlap/generate.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function deriveKeypair(seedStr) {
  const seed = Buffer.from(seedStr, "utf8");
  if (seed.length !== 32) throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  const priv = crypto.createPrivateKey({ key: seed, format: "raw", type: "raw", namedCurve: "Ed25519" });
  return priv;
}

// Seed strings chosen to be exactly 32 bytes each
const seed1 = "SOA-OVERLAP-HANDLER-KEY-1-v1.0!!"; // 32 bytes
const seed2 = "SOA-OVERLAP-HANDLER-KEY-2-v1.0!!"; // 32 bytes

function writeKeypair(name, seed, manifest) {
  // Use Node's generateKeyPairSync with a seed-derived approach; Node doesn't
  // take seed directly, so we sign a fixed buffer with the seed and use that.
  // Simpler: Node 22 supports crypto.createPrivateKey({key: <32-byte seed>,
  // format: "raw", type: "raw"}) for Ed25519 via a PKCS#8 wrapper — but the
  // reliable cross-platform path is to wrap the 32-byte seed as PKCS#8 manually.
  const seedBytes = Buffer.from(seed, "utf8");
  if (seedBytes.length !== 32) throw new Error(`seed ${name} must be 32 bytes`);

  // Ed25519 PKCS#8 prefix: 0x30 0x2e 0x02 0x01 0x00 0x30 0x05 0x06 0x03 0x2b 0x65 0x70 0x04 0x22 0x04 0x20
  const pkcs8Prefix = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
  ]);
  const pkcs8 = Buffer.concat([pkcs8Prefix, seedBytes]);
  const priv = crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });

  const privPem = priv.export({ format: "pem", type: "pkcs8" });
  const pub = crypto.createPublicKey(priv);
  const pubPem = pub.export({ format: "pem", type: "spki" });
  const pubSpkiDer = pub.export({ format: "der", type: "spki" });
  const spkiSha256 = crypto.createHash("sha256").update(pubSpkiDer).digest("hex");

  const dir = path.join(HERE, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "private.pem"), privPem);
  fs.writeFileSync(path.join(dir, "public.pem"), pubPem);
  fs.writeFileSync(path.join(dir, "spki_sha256.txt"), spkiSha256 + "\n");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${name}/ with kid=${manifest.kid} spki_sha256=${spkiSha256.slice(0, 16)}…`);
}

writeKeypair("key-1", seed1, {
  kid: "soa-conformance-overlap-key-1-v1.0",
  issued_at: "2026-04-20T00:00:00Z",
  rotation_overlap_end: "2026-04-23T00:00:00Z",
  algo: "EdDSA"
});

writeKeypair("key-2", seed2, {
  kid: "soa-conformance-overlap-key-2-v1.0",
  issued_at: "2026-04-22T00:00:00Z",
  rotation_overlap_end: "2026-04-26T00:00:00Z",
  algo: "EdDSA"
});

console.log("Overlap window (both keys valid): 2026-04-22T00:00:00Z — 2026-04-23T00:00:00Z");
