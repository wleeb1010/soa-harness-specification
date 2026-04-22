#!/usr/bin/env node
// Regenerates four JWT fixtures exercising the §1 ±30s clock-skew window.
// Signed with the pinned handler-keypair; Ed25519 PureEdDSA so output is
// reproducible byte-for-byte.
//
// Reference clock: T_REF = 2026-04-23T12:40:00Z (1776948000 UNIX seconds).
// Validators consume these fixtures with that same T_REF injected so the
// assertions are deterministic regardless of wall-clock time at test execution.
//
// Run: node test-vectors/jwt-clock-skew/generate.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PRIV_PATH = path.join(HERE, "..", "handler-keypair", "private.pem");
const priv = crypto.createPrivateKey(fs.readFileSync(PRIV_PATH, "utf8"));

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const T_REF = 1776948000; // 2026-04-23T12:40:00Z
const HEADER = { alg: "EdDSA", kid: "soa-conformance-test-handler-v1.0", typ: "JWT" };
const HB = b64url(JSON.stringify(HEADER));

function signJwt(payload) {
  const pb = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.sign(null, Buffer.from(`${HB}.${pb}`), priv));
  return `${HB}.${pb}.${sig}`;
}

// Four scenarios per §1 ±30s skew window
const scenarios = [
  {
    name: "iat-in-window",
    // iat exactly at T_REF, exp 5 minutes later — valid under ±30s skew
    payload: { iss: "soa-conformance-test", sub: "conformance-session-001", iat: T_REF, exp: T_REF + 300 },
    expect: "verify succeeds",
  },
  {
    name: "iat-past",
    // iat 60s before T_REF — outside the -30s skew window → reject
    payload: { iss: "soa-conformance-test", sub: "conformance-session-001", iat: T_REF - 60, exp: T_REF + 240 },
    expect: "AuthFailed(iat-past-skew)",
  },
  {
    name: "iat-future",
    // iat 60s after T_REF — outside the +30s skew window → reject
    payload: { iss: "soa-conformance-test", sub: "conformance-session-001", iat: T_REF + 60, exp: T_REF + 360 },
    expect: "AuthFailed(iat-future-skew)",
  },
  {
    name: "exp-expired",
    // exp 100s before T_REF — already expired even allowing +30s skew → reject
    payload: { iss: "soa-conformance-test", sub: "conformance-session-001", iat: T_REF - 400, exp: T_REF - 100 },
    expect: "AuthFailed(exp-expired)",
  },
];

for (const s of scenarios) {
  const jwt = signJwt(s.payload);
  const out = path.join(HERE, `${s.name}.jwt`);
  fs.writeFileSync(out, jwt + "\n");
  console.log(`Wrote ${out}  (${s.expect})`);
}
console.log(`T_REF = ${T_REF} (2026-04-23T12:40:00Z)`);
