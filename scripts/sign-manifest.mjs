#!/usr/bin/env node
/**
 * sign-manifest.mjs — Produce a real detached JWS signature over MANIFEST.json
 * using the v1.0 release key.
 *
 * USAGE
 *   RELEASE_KEY_PASSPHRASE=<passphrase> node scripts/sign-manifest.mjs \
 *     --key /path/to/soa-release-v1.0.key.enc
 *
 *   Or use the bash wrapper that prompts silently:
 *     scripts/sign-manifest.sh --key /path/to/soa-release-v1.0.key.enc
 *
 * BEHAVIOR
 *   1. Decrypt the Ed25519 private key using RELEASE_KEY_PASSPHRASE
 *   2. Compute the JWS signing input per RFC 7515 B.1 detached content
 *   3. Sign with Ed25519 (crypto.sign(null, input, key))
 *   4. Emit `<b64url(header)>..<b64url(sig)>` to MANIFEST.json.jws
 *   5. Verify the signature end-to-end before declaring success
 *
 * DEPENDENCIES
 *   Node.js built-in `node:crypto` module only. No external deps.
 *
 * SAFETY
 *   - Prints fingerprint + first 16 chars of signature to the caller so they
 *     can verify the output looks right.
 *   - Does NOT echo the passphrase.
 *   - Does NOT persist the decrypted private key anywhere.
 */
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--key") args.keyPath = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: sign-manifest.mjs --key <encrypted.key>");
      console.log("Requires RELEASE_KEY_PASSPHRASE env var.");
      process.exit(0);
    }
  }
  if (!args.keyPath) {
    console.error("--key is required");
    process.exit(2);
  }
  return args;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function jcs(value) {
  // Delegate to the project's existing JCS implementation. The integer-only
  // subset in build-manifest.mjs is fine for MANIFEST (no floats).
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isInteger(value)) throw new Error("JCS: non-integer numbers not supported here");
      return value.toString();
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    return "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(jcs).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + jcs(value[k])).join(",") + "}";
}

function loadPrivateKey(encPath, passphrase) {
  const pemBytes = readFileSync(encPath);
  try {
    return crypto.createPrivateKey({
      key: pemBytes,
      format: "pem",
      passphrase,
    });
  } catch (e) {
    if (String(e.message).includes("bad decrypt")) {
      console.error("DECRYPT FAILED — wrong passphrase or corrupt key file.");
      process.exit(1);
    }
    throw e;
  }
}

function publicKeyFingerprint(privateKey) {
  const pub = crypto.createPublicKey(privateKey);
  const der = pub.export({ format: "der", type: "spki" });
  const digest = crypto.createHash("sha256").update(der).digest();
  return digest.toString("base64").replace(/=+$/, "").replace(/\+/g, "/").replace(/\//g, "/");
}

function signDetached(privateKey, header, payloadBytes) {
  // Per RFC 7515 B.1: signing input = BASE64URL(header) + "." + BASE64URL(payload).
  // For detached JWS, payload bytes are included in signing but omitted from the
  // serialized JWS. Ed25519 signs the raw signing-input bytes.
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(payloadBytes);
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "ascii");
  const signature = crypto.sign(null, signingInput, privateKey);
  return {
    headerB64,
    payloadB64,
    signatureB64: signature.toString("base64url"),
  };
}

function verifyDetached(publicKey, header, payloadBytes, signatureB64) {
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(payloadBytes);
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "ascii");
  const sigBytes = Buffer.from(signatureB64, "base64url");
  return crypto.verify(null, signingInput, publicKey, sigBytes);
}

function main() {
  const args = parseArgs(process.argv);
  const passphrase = process.env.RELEASE_KEY_PASSPHRASE;
  if (!passphrase) {
    console.error("RELEASE_KEY_PASSPHRASE env var required");
    console.error("Use scripts/sign-manifest.sh for silent passphrase prompt");
    process.exit(2);
  }

  console.log(`Loading encrypted private key: ${args.keyPath}`);
  const privateKey = loadPrivateKey(args.keyPath, passphrase);
  const publicKey = crypto.createPublicKey(privateKey);
  const fingerprint = publicKeyFingerprint(privateKey);
  console.log(`Key fingerprint (b64url SHA-256 of DER pubkey): ${fingerprint}`);

  const manifestPath = resolve(SPEC_ROOT, "MANIFEST.json");
  const manifestJson = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestCanonical = Buffer.from(jcs(manifestJson), "utf8");
  console.log(`MANIFEST.json JCS byte length: ${manifestCanonical.length}`);

  const header = {
    alg: "EdDSA",
    kid: manifestJson.publisher_kid,
    typ: "soa-manifest+jws",
  };
  console.log(`JWS header: ${JSON.stringify(header)}`);

  const { headerB64, signatureB64 } = signDetached(privateKey, header, manifestCanonical);
  const jws = `${headerB64}..${signatureB64}`;

  // Verify before writing
  const ok = verifyDetached(publicKey, header, manifestCanonical, signatureB64);
  if (!ok) {
    console.error("SELF-VERIFY FAILED — refusing to write invalid JWS");
    process.exit(1);
  }
  console.log("Self-verify: OK");

  const jwsPath = resolve(SPEC_ROOT, "MANIFEST.json.jws");
  writeFileSync(jwsPath, jws + "\n");
  console.log(`Wrote: ${jwsPath}`);
  console.log(`  length: ${jws.length} chars`);
  console.log(`  signature preview: ${signatureB64.slice(0, 16)}...${signatureB64.slice(-8)}`);
  console.log("\nNext: git commit + push MANIFEST.json.jws, then proceed to Phase 3d publish.");
}

main();
