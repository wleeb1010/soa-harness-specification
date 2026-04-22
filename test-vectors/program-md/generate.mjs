#!/usr/bin/env node
// Regenerates program.md.jws and program.md.x5t.jws from program.md + the pinned
// handler-keypair. Detached JWS over raw UTF-8 bytes of program.md (NOT JCS —
// §9.2 program.md is human-authored Markdown, canonicalized-as-bytes).
//
// Run: node test-vectors/program-md/generate.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PROGRAM_PATH = path.join(HERE, "program.md");
const PRIV_PATH = path.join(HERE, "..", "handler-keypair", "private.pem");
const OUT_BASIC = path.join(HERE, "program.md.jws");
const OUT_X5T = path.join(HERE, "program.md.x5t.jws");

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const payload = fs.readFileSync(PROGRAM_PATH);
const priv = crypto.createPrivateKey(fs.readFileSync(PRIV_PATH, "utf8"));

// SV-SIGN-02 — basic detached JWS, no thumbprint header
const h1 = { alg: "EdDSA", kid: "soa-conformance-test-handler-v1.0", typ: "soa-program+jws" };
const h1b = b64url(JSON.stringify(h1));
const p1b = b64url(payload);
const s1 = b64url(crypto.sign(null, Buffer.from(`${h1b}.${p1b}`), priv));
fs.writeFileSync(OUT_BASIC, `${h1b}..${s1}\n`);

// SV-SIGN-05 — detached JWS with x5t#S256 header for two-step signer resolution
const pubSpkiDer = crypto.createPublicKey(priv).export({ format: "der", type: "spki" });
const x5t = b64url(crypto.createHash("sha256").update(pubSpkiDer).digest());
const h2 = { alg: "EdDSA", kid: "soa-conformance-test-handler-v1.0", typ: "soa-program+jws", "x5t#S256": x5t };
const h2b = b64url(JSON.stringify(h2));
const p2b = b64url(payload);
const s2 = b64url(crypto.sign(null, Buffer.from(`${h2b}.${p2b}`), priv));
fs.writeFileSync(OUT_X5T, `${h2b}..${s2}\n`);

console.log(`Wrote ${OUT_BASIC}`);
console.log(`Wrote ${OUT_X5T}`);
console.log(`x5t#S256 = ${x5t}`);
