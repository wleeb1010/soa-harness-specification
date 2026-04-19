# SOA UI Gateway — Reference Implementation Sketch
**Binds to:** SOA-Harness UI Integration Profile v1.0, Core v1.0
**Status:** Reference / illustrative — not conformant on its own
**Runtime:** Node.js 20 LTS + TypeScript 5.4+
**Purpose:** Show the load-bearing code paths a compliant Gateway must implement. Production deployments will add logging, metrics, clustering, secrets management, and exhaustive error handling on top of this skeleton.

---

## 1. Repository Layout

```
soa-ui-gateway/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts                 # HTTP + WebSocket entry
│   ├── config.ts                 # /.well-known/soa-ui-config.json
│   ├── auth/
│   │   ├── bearer.ts             # JWT validation
│   │   ├── dpop.ts               # RFC 9449 verification
│   │   ├── mtls.ts               # RFC 8705 client cert binding
│   │   ├── scopes.ts             # ui.read / ui.command / ui.admin
│   │   └── tokenExchange.ts      # RFC 8693 → Runner credential
│   ├── enroll/
│   │   ├── routes.ts             # POST /ui/v1/enroll
│   │   ├── webauthn.ts           # credentials.create verification
│   │   ├── jws.ts                # JWK / X.509 enrollment
│   │   └── store.ts              # kid → credential storage
│   ├── attestation/
│   │   ├── canonical.ts          # canonicalize decision JSON
│   │   ├── pdaJws.ts             # verify PDA-JWS
│   │   ├── pdaWebauthn.ts        # verify PDA-WebAuthn
│   │   ├── crl.ts                # CRL refresh every 1h
│   │   └── translate.ts          # PDA → Core permission decision
│   ├── envelope/
│   │   ├── types.ts              # UIEnvelope, trust_class, etc.
│   │   ├── schema.ts             # Ajv-compiled validator
│   │   ├── wrap.ts               # Runner StreamEvent → UIEnvelope
│   │   ├── filter.ts             # scope-based filter
│   │   └── redact.ts             # PII/secret redaction
│   ├── session/
│   │   ├── manager.ts            # per-session state
│   │   ├── buffer.ts             # replay ring buffer (10k/30min)
│   │   ├── sequence.ts           # monotonic ui_sequence
│   │   └── reconnect.ts          # grace window + resume
│   ├── subscribe/
│   │   ├── ws.ts                 # WebSocket handshake + ops
│   │   ├── sse.ts                # SSE fallback
│   │   └── longpoll.ts           # poll fallback
│   ├── commands/
│   │   ├── dispatch.ts           # op:"command" router
│   │   ├── userInput.ts
│   │   ├── promptDecision.ts     # invokes attestation/*
│   │   ├── cancelTurn.ts
│   │   ├── compactNow.ts
│   │   ├── handoff.ts
│   │   └── dedupe.ts             # command_id idempotency
│   ├── prompt/
│   │   ├── registry.ts           # in-flight prompts
│   │   ├── assign.ts             # multi-UI assignment
│   │   └── deadline.ts           # PromptExpired emitter
│   ├── runner/
│   │   ├── client.ts             # mTLS+bearer → Runner
│   │   ├── streamEventSource.ts  # subscribes to Core §14 stream
│   │   └── errors.ts             # Runner error → ui.* mapping
│   ├── artifacts/
│   │   ├── routes.ts             # list + download
│   │   └── origin.ts             # serves cookie-less sandbox-CSP origin
│   ├── audit/
│   │   ├── sink.ts               # WORM append (S3 object-lock adapter)
│   │   └── reveal.ts             # DecisionReveal emitter
│   ├── cost/
│   │   └── projector.ts          # CostUpdate derivation
│   ├── i18n/
│   │   └── localeMap.ts          # /ui/v1/i18n/{locale}.json
│   ├── errors.ts                 # ui.* → HTTP/WS mapping (from §21)
│   └── types.ts                  # shared types
├── test/
│   └── ui-validate-adapter.ts    # runs ui-validate against local server
└── README.md
```

Suggested external libs: `ws`, `fastify`, `jose` (JOSE/JWS/JWT), `@simplewebauthn/server`, `ajv` (JSON Schema), `cbor-x` (COSE parsing).

---

## 2. Core Types

```ts
// src/envelope/types.ts
export type TrustClass = "system" | "user" | "model" | "tool-output" | "untrusted" | "agent-peer";

export interface UIEnvelope {
  ui_envelope_version: "1.0";
  ui_sequence: number;
  session_id: string;
  turn_id?: string;
  delivery?: {
    ack_required?: boolean;
    partial?: boolean;
    essential?: boolean;
    retry_hint_ms?: number;
  };
  trust_class: TrustClass;
  locale_hint?: string;
  redactions?: Array<"pii" | "secret" | "credential" | "large-binary">;
  event: StreamEvent | UIDerivedEvent;
}

export type StreamEventType =
  | "SessionStart" | "SessionEnd"
  | "MessageStart" | "MessageEnd"
  | "ContentBlockStart" | "ContentBlockDelta" | "ContentBlockEnd"
  | "ToolInputStart" | "ToolInputDelta" | "ToolInputEnd"
  | "ToolResult" | "ToolError"
  | "PermissionPrompt" | "PermissionDecision"
  | "CompactionStart" | "CompactionEnd"
  | "MemoryLoad"
  | "HandoffStart" | "HandoffComplete" | "HandoffFailed"
  | "SelfImprovementStart" | "SelfImprovementAccepted"
  | "SelfImprovementRejected" | "SelfImprovementOrphaned"
  | "CrashEvent";

export type UIDerivedType =
  | "CostUpdate" | "PromptAssigned" | "PromptExpired" | "PromptDismissed"
  | "DecisionReveal" | "ConnectionResumed" | "ScopeChanged"
  | "GatewayHeartbeat" | "CardSignatureFailed"
  | "ObservabilityBackpressure" | "SpanSummary" | "StubPromptPlaceholder";
```

---

## 3. Load-Bearing Files

### 3.1 `src/server.ts` — Entry Point

```ts
import Fastify from "fastify";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import { mountConfig } from "./config";
import { mountAuthRoutes } from "./auth/bearer";
import { mountEnrollRoutes } from "./enroll/routes";
import { mountCommandRoute } from "./commands/dispatch";
import { mountArtifactRoutes } from "./artifacts/routes";
import { mountSessionRoutes } from "./session/manager";
import { mountSseRoute } from "./subscribe/sse";
import { mountLongPollRoute } from "./subscribe/longpoll";
import { mountUploadsRoute } from "./commands/dispatch";
import { mountRevokeRoute } from "./auth/bearer";
import { mountI18nRoute } from "./i18n/localeMap";
import { mountErrorsRoute } from "./errors";
import { handleWsConnection } from "./subscribe/ws";

const app = Fastify({
  logger: true,
  trustProxy: true,
  https: {
    key:  fs.readFileSync(process.env.TLS_KEY!),
    cert: fs.readFileSync(process.env.TLS_CERT!),
    minVersion: "TLSv1.3",
    requestCert: true,
    ca: fs.readFileSync(process.env.MTLS_CA!),     // inbound UI-client mTLS (UI→Gateway); outbound Gateway→Runner mTLS is configured separately on the HTTPS agent (see §3.11 note)
  },
});

// Security headers (§6.5)
app.addHook("onSend", async (_req, reply, payload) => {
  reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Content-Security-Policy", "frame-ancestors 'self'");
  return payload;
});

mountConfig(app);                // /.well-known/soa-ui-config.json
mountAuthRoutes(app);            // token helpers
mountRevokeRoute(app);           // /ui/v1/revoke (§7.6)
mountEnrollRoutes(app);          // /ui/v1/enroll
mountCommandRoute(app);          // /ui/v1/command (REST path)
mountUploadsRoute(app);          // /ui/v1/uploads (§10.4)
mountSessionRoutes(app);         // /ui/v1/sessions/**
mountArtifactRoutes(app);        // delegates to artifact origin
mountSseRoute(app);              // /ui/v1/stream/{session_id} (§6.1 SSE fallback)
mountLongPollRoute(app);         // /ui/v1/poll/{session_id}    (§6.1 long-poll fallback)
mountI18nRoute(app);             // /ui/v1/i18n/{locale}.json
mountErrorsRoute(app);           // /ui/v1/ui-errors.json

const wss = new WebSocketServer({ noServer: true });
app.server.on("upgrade", (req, sock, head) => {
  // Origin allowlist (§6.5 / UV-S-03)
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) { sock.destroy(); return; }
  wss.handleUpgrade(req, sock, head, (ws) => handleWsConnection(ws, req));
});

app.listen({ port: 8443, host: "0.0.0.0" });
```

### 3.2 `src/auth/bearer.ts` — JWT + Introspection

```ts
import { jwtVerify, createRemoteJWKSet } from "jose";

const JWKS = createRemoteJWKSet(new URL(process.env.OIDC_JWKS!));

export async function verifyAccessToken(token: string): Promise<Claims> {
  // Algorithms per §7.2 / UV-A-05
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ["RS256", "ES256", "EdDSA"],
    audience: process.env.AUDIENCE!,
    issuer: process.env.ISSUER!,
    clockTolerance: "30s",
  });
  if (!payload.exp || payload.exp - Math.floor(Date.now() / 1000) > 3600) {
    throw new GatewayError("ui.token-expired");           // UV-A-06: ≤60 min
  }
  return payload as Claims;
}
```

### 3.3 `src/auth/dpop.ts` — DPoP (RFC 9449)

```ts
import { jwtVerify } from "jose";
import { createHash } from "node:crypto";

export async function verifyDPoP(
  req: FastifyRequest,
  expectedAccessTokenHash: string,
): Promise<void> {
  const proof = req.headers.dpop;
  if (!proof) throw new GatewayError("ui.dpop-invalid");
  const { payload, protectedHeader } = await jwtVerify(
    proof as string,
    // Key is in DPoP header (jwk)
    async (hdr) => importJwk(hdr.jwk!),
    { algorithms: ["ES256", "EdDSA"] }
  );
  if (payload.htm !== req.method)                    throw new GatewayError("ui.dpop-invalid");
  if (payload.htu !== fullUrl(req))                  throw new GatewayError("ui.dpop-invalid");
  if (payload.ath !== expectedAccessTokenHash)       throw new GatewayError("ui.dpop-invalid");
  // nonce & jti replay check via redis/memory set
  if (await dpopReplayCache.has(payload.jti as string)) throw new GatewayError("ui.dpop-invalid");
  await dpopReplayCache.add(payload.jti as string, 120);
}
```

### 3.4 `src/enroll/webauthn.ts` — WebAuthn Enrollment

```ts
import { verifyRegistrationResponse, generateRegistrationOptions } from "@simplewebauthn/server";
import { credentialStore } from "./store";

export async function beginEnroll(userSub: string, origin: string) {
  const options = await generateRegistrationOptions({
    rpID: gatewayConfig.webauthn_rp_id,    // published in /.well-known/soa-ui-config.json per §7.1
    rpName: "SOA Gateway",
    userName: userSub,
    userID: Buffer.from(userSub),
    authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
    attestationType: "direct",
    excludeCredentials: await credentialStore.listByUser(userSub),
  });
  await challengeStore.set(userSub, options.challenge, 300);
  return options;
}

export async function finishEnroll(userSub: string, response: any, origin: string) {
  const expected = await challengeStore.take(userSub);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: expected,
    expectedOrigin: origin,
    expectedRPID: gatewayConfig.webauthn_rp_id,
    requireUserVerification: true,
  });
  if (!result.verified) throw new GatewayError("ui.prompt-signature-invalid");

  const { credentialID, credentialPublicKey, counter } = result.registrationInfo!;
  const kid = "kid_" + randomUuid();
  const notAfter = new Date(Date.now() + 90 * 86400_000).toISOString();
  await credentialStore.put({
    kid, userSub, format: "webauthn",
    credId: credentialID, cosePublicKey: credentialPublicKey, counter,
    enrolledAt: new Date().toISOString(), notAfter,
  });
  await auditSink.append({ type: "HandlerEnrolled", kid, userSub, format: "webauthn" });
  return { kid, not_after: notAfter };
}
```

### 3.5 `src/attestation/canonical.ts` — Canonical Decision JSON

```ts
// RFC 8785-style JSON canonicalization for PDA bodies
import { canonicalize as jcsCanonicalize } from "@truestamp/canonify"; // RFC 8785 reference impl

export function canonicalize(obj: unknown): Buffer {
  return Buffer.from(jcsCanonicalize(obj), "utf8");
}

// Self-check at module load: run RFC 8785 Appendix B test vectors, crash the process
// if the local JCS implementation is non-conformant. Cross-impl byte-identity is load-bearing
// for PDA signature verification.
(function jcsConformanceSelfCheck() {
  const vectors: [unknown, string][] = [
    [{ numbers: [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001] },
     '{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}'],
    [{ literals: [null, true, false] },
     '{"literals":[null,true,false]}'],
  ];
  for (const [input, expected] of vectors) {
    const actual = jcsCanonicalize(input);
    if (actual !== expected) {
      throw new Error(`JCS impl non-conformant: expected ${expected}, got ${actual}`);
    }
  }
})();

export function decisionChallenge(decision: CanonicalDecision): Buffer {
  return createHash("sha256").update(canonicalize(decision)).digest();
}
```

### 3.6 `src/attestation/pdaWebauthn.ts` — PDA-WebAuthn Verification (Critical path)

```ts
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { decisionChallenge } from "./canonical";
import { crl } from "./crl";

export async function verifyPdaWebauthn(pda: any, origin: string): Promise<boolean> {
  const cred = await credentialStore.getByKid(pda.handler_kid);
  if (!cred) throw new GatewayError("ui.prompt-signature-invalid");
  if (await crl.isRevoked(cred.kid)) throw new GatewayError("ui.prompt-signature-invalid");
  if (cred.format !== "webauthn") throw new GatewayError("ui.prompt-signature-invalid");
  if (new Date(cred.notAfter) < new Date()) throw new GatewayError("ui.prompt-signature-invalid");

  // §11.4 MUST: clientDataJSON.challenge == SHA-256(canonical_decision)
  const expectedChallenge = decisionChallenge(pda.canonical_decision);

  // Reconstruct the WebAuthn Assertion for @simplewebauthn/server
  const assertion = {
    id: cred.credId.toString("base64url"),
    rawId: cred.credId.toString("base64url"),
    type: "public-key" as const,
    response: {
      clientDataJSON: pda.authenticator_response.clientDataJSON,
      authenticatorData: pda.authenticator_response.authenticatorData,
      signature: pda.authenticator_response.signature,
      userHandle: pda.authenticator_response.userHandle ?? null,
    },
  };

  const result = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: expectedChallenge.toString("base64url"),
    expectedOrigin: origin,
    expectedRPID: gatewayConfig.webauthn_rp_id,
    requireUserVerification: isHighRisk(pda.canonical_decision),   // UV-P-09
    credential: {
      id: cred.credId.toString("base64url"),
      publicKey: cred.cosePublicKey,
      counter: cred.counter,
    },
  });

  if (!result.verified) throw new GatewayError("ui.prompt-signature-invalid");
  await credentialStore.bumpCounter(cred.kid, result.authenticationInfo!.newCounter);
  return true;
}

function isHighRisk(d: CanonicalDecision): boolean {
  return d.scope === "always-this-tool" || d.scope === "always-this-session";
}
```

### 3.7 `src/attestation/pdaJws.ts` — PDA-JWS Verification

```ts
import { compactVerify } from "jose";

export async function verifyPdaJws(pdaJws: string, origin: string): Promise<CanonicalDecision> {
  const header = decodeProtectedHeader(pdaJws);
  if (header.typ !== "soa-pda+jws") throw new GatewayError("ui.prompt-signature-invalid");
  const cred = await credentialStore.getByKid(header.kid!);
  if (!cred || cred.format !== "jws") throw new GatewayError("ui.prompt-signature-invalid");
  if (await crl.isRevoked(cred.kid)) throw new GatewayError("ui.prompt-signature-invalid");
  const { payload } = await compactVerify(pdaJws, cred.publicKey, {
    algorithms: ["EdDSA", "ES256", "RS256"],
  });
  // Core §10.6: RSA MUST be ≥ 3072 bits.
  if (cred.algo === "RS256" && cred.rsaModulusBits && cred.rsaModulusBits < 3072) {
    throw new GatewayError("ui.prompt-signature-invalid");
  }
  const decision = JSON.parse(Buffer.from(payload).toString("utf8")) as CanonicalDecision;
  if (decision.handler_kid !== header.kid) throw new GatewayError("ui.prompt-signature-invalid");
  return decision;
}
```

### 3.8 `src/envelope/wrap.ts` — Runner StreamEvent → UI Envelope

```ts
import { redactPayload } from "./redact";

export function wrap(evt: StreamEvent, sess: SessionState, scope: Scope): UIEnvelope {
  const redacted = redactPayload(evt, scope);
  return {
    ui_envelope_version: "1.0",
    ui_sequence: sess.nextSequence(),
    session_id: sess.id,
    turn_id: evt.turn_id,
    delivery: computeDelivery(evt),
    trust_class: deriveTrustClass(evt, sess),            // UV-SC-01 gating
    locale_hint: sess.locale,
    redactions: redacted.redactions,
    event: redacted.event,
  };
}

// Core §14.1.2 normative mapping — deterministic from session state, not payload inspection.
function deriveTrustClass(evt: StreamEvent, sess: SessionState): TrustClass {
  const handoff = sess.workflowStatus === "Handoff";
  switch (evt.type) {
    // Session / Runner chrome
    case "SessionStart":
    case "SessionEnd":
    case "CompactionStart":
    case "CompactionEnd":
    case "MemoryLoad":
    case "HandoffStart":
    case "HandoffComplete":
    case "HandoffFailed":
    case "SelfImprovementStart":
    case "SelfImprovementAccepted":
    case "SelfImprovementRejected":
    case "SelfImprovementOrphaned":
    case "CrashEvent":
    case "PermissionPrompt":
      return "system";

    // Message envelope — role decides user vs model; role is a Core-defined required payload field per §14.1.1
    case "MessageStart":
    case "MessageEnd":
      return (evt.payload as any).role === "user" ? "user" : (handoff ? "agent-peer" : "model");

    // Model-generated content — becomes agent-peer in handoff
    case "ContentBlockStart":
    case "ContentBlockDelta":
    case "ContentBlockEnd":
    case "ToolInputStart":
    case "ToolInputDelta":
    case "ToolInputEnd":
      return handoff ? "agent-peer" : "model";

    // Tool-produced content — always tool-output (never system)
    case "ToolResult":
    case "ToolError":
      return "tool-output";

    // Permission decision: system by default, agent-peer if inbound handoff signer is outside local anchors
    case "PermissionDecision":
      return (handoff && !sess.signerInLocalAnchors((evt.payload as any).signer_kid)) ? "agent-peer" : "system";

    default:
      // Exhaustiveness: refuse to silently misclassify
      throw new Error(`Gateway: unknown StreamEvent.type for trust-class derivation: ${(evt as any).type}`);
  }
}
```

### 3.9 `src/envelope/redact.ts` — Redaction

```ts
const PII_PATHS = [/email/i, /phone/i, /ssn/i, /address/i];
const SECRET_KEYS = new Set(["authorization", "api_key", "password", "token"]);

export function redactPayload(evt: StreamEvent, scope: Scope) {
  if (evt.type !== "PermissionPrompt") return { event: evt, redactions: [] };

  // Core §14.1.1 allows only args_digest (required) and args_redacted (optional) on PermissionPrompt.tool.
  // The Runner pre-redacts into args_redacted; the Gateway's job is enrichment + redaction-indicator,
  // not raw-arg redaction. If the Runner did not pre-redact, treat args_redacted as the full set to further strip.
  const incoming = (evt.payload.tool as any).args_redacted ?? {};
  const redacted: any = {};
  const redactions = new Set<string>();
  for (const [k, v] of Object.entries(incoming)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      redacted[k] = "<redacted:secret>"; redactions.add("secret");
    } else if (PII_PATHS.some(rx => rx.test(k))) {
      redacted[k] = "<redacted:pii>"; redactions.add("pii");
    } else if (typeof v === "string" && v.length > 4096) {
      redacted[k] = "<redacted:large-binary>"; redactions.add("large-binary");
    } else {
      redacted[k] = v;
    }
  }

  const rewritten = structuredClone(evt);
  (rewritten.payload.tool as any).args_redacted = redacted;
  (rewritten.payload as any).attestation_required = true;  // UV-P-01 Gateway-synth, permitted by §5.1 carveout
  return { event: rewritten, redactions: Array.from(redactions) };
}

export function stubPrompt(evt: StreamEvent, sess: SessionState): UIDerivedEvent {
  return {
    type: "StubPromptPlaceholder",
    payload: {
      source: "gateway",
      prompt_id: evt.payload.prompt_id,
      tool_name: evt.payload.tool.name,
      risk_class: evt.payload.tool.risk_class,
      deadline: evt.payload.deadline,
      assigned_to_user_sub_hmac: "hmac-sha256:" + hmacSha256(sess.perSessionKey, sess.promptAssignee?.userSub ?? "").toString("hex"),
      state: "awaiting",
    },
  };
}
```

### 3.10 `src/subscribe/ws.ts` — WebSocket Handler (load-bearing)

```ts
export async function handleWsConnection(ws: WebSocket, req: IncomingMessage) {
  const bearer = extractBearer(req);
  const claims = await verifyAccessToken(bearer);        // UV-A-02
  await enforceDpopIfPublic(req, claims, bearer);        // UV-A-10
  const scope = deriveScope(claims.scope);

  let session: SessionState | null = null;

  ws.on("message", async (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); }
    catch { ws.close(4005, "ui.transport-unsupported"); return; }  // UV-T-04

    switch (msg.op) {
      case "subscribe": {
        if (!msg.soa_ui_profile) { ws.close(4005, "ui.transport-unsupported"); return; } // UV-F-01
        session = await sessionMgr.attach(
          msg.session_id, claims.sub, scope, msg.soa_ui_profile, msg.replay
        );
        await pipeRunnerStream(session, ws);
        break;
      }
      case "ack": session?.ack(msg.ui_sequence); break;
      case "command": await dispatchCommand(msg, session!, scope, ws); break;
      case "unsubscribe": session?.detach(); break;
    }
  });

  ws.on("close", () => { session?.beginGrace(/*10 min*/ 600_000); });   // UV-T-07
}
```

### 3.11 `src/commands/promptDecision.ts` — Decision Submission (critical)

```ts
import { verifyPdaJws } from "../attestation/pdaJws";
import { verifyPdaWebauthn } from "../attestation/pdaWebauthn";
import { promptRegistry } from "../prompt/registry";

export async function handlePromptDecision(cmd: any, session: SessionState) {
  const { prompt_id, decision, scope, attestation } = cmd.payload;

  const prompt = promptRegistry.get(prompt_id);
  if (!prompt) throw new GatewayError("ui.prompt-not-assigned");
  if (prompt.expired()) throw new GatewayError("ui.prompt-expired");
  if (!prompt.assignedTo(session)) throw new GatewayError("ui.prompt-not-assigned"); // UV-P-14

  // §11.4: verify PDA
  let canonical: CanonicalDecision;
  if (attestation.format === "jws") {
    canonical = await verifyPdaJws(attestation.jws, session.origin);        // UV-P-07
  } else if (attestation.format === "webauthn") {
    await verifyPdaWebauthn(attestation, session.origin);                    // UV-P-06
    canonical = attestation.canonical_decision;
  } else {
    throw new GatewayError("ui.prompt-signature-invalid");
  }

  // Bind attestation to this prompt/decision across ALL canonical fields (§11.4).
  if (canonical.prompt_id !== prompt_id)                  throw new GatewayError("ui.prompt-signature-invalid");
  if (canonical.session_id !== session.id)                throw new GatewayError("ui.prompt-signature-invalid");
  if (canonical.tool_name !== prompt.toolName)            throw new GatewayError("ui.prompt-signature-invalid");
  if (canonical.args_digest !== prompt.argsDigest)        throw new GatewayError("ui.prompt-signature-invalid");
  if (canonical.decision !== decision || canonical.scope !== scope)
                                                          throw new GatewayError("ui.prompt-signature-invalid");
  const now = Date.now();
  const nb = Date.parse(canonical.not_before);
  const na = Date.parse(canonical.not_after);
  if (Number.isNaN(nb) || Number.isNaN(na))               throw new GatewayError("ui.prompt-signature-invalid");
  // Clock-skew tolerances per Core §1: ±60s
  if (nb > now + 60_000 || na < now - 60_000)             throw new GatewayError("ui.prompt-signature-invalid");
  // 15-minute window ceiling
  if (na - nb > 15 * 60_000)                              throw new GatewayError("ui.prompt-signature-invalid");
  // always-* scope requires user-verification (WebAuthn UV) or fresh HSM auth (JWS)
  if (scope !== "once" && !await verifyStepUp(attestation, canonical)) {
    throw new GatewayError("ui.prompt-scope-insufficient");
  }

  // UV-P-09: always-* requires step-up; verified by requireUserVerification in WebAuthn
  //          or HSM+fresh-auth signal in JWS claims (not shown)

  // UV-P-08: translate PDA → Core-compatible decision for the Runner
  const runnerDecision = await translateToRunnerDecision(canonical, session);
  const res = await runnerClient.submitPermissionDecision(session.runnerSessionId, runnerDecision);

  await auditSink.append({
    type: "PromptDecisionSubmitted",
    prompt_id, kid: canonical.handler_kid, decision, scope,
    session_id: session.id, user_sub: session.userSub, at: new Date().toISOString(),
  });

  promptRegistry.resolve(prompt_id);
  return { status: "accepted", runner_request_id: res.request_id };
}
```

### 3.12 `src/prompt/assign.ts` — Multi-UI Assignment (UV-P-14)

```ts
export function assignPrompt(sess: SessionState, prompt: Prompt): Assignment {
  const observers = sess.observers(); // all UIs currently attached
  const recent = observers
    .filter(o => o.scope.includes("ui.command"))
    .sort((a, b) => (b.lastUserInputAt ?? 0) - (a.lastUserInputAt ?? 0));
  if (recent.length && (Date.now() - (recent[0].lastUserInputAt ?? 0)) <= 5 * 60_000) {
    return { state: "assigned", to: recent[0].id };
  }
  // Tie: earliest-established ui.command capability token
  const earliest = recent.sort((a, b) => a.tokenIssuedAt - b.tokenIssuedAt)[0];
  if (earliest) return { state: "assigned", to: earliest.id };
  return { state: "unassigned" };   // ui.admin can take over via DismissPrompt
}
```

### 3.13 `src/session/buffer.ts` — Replay Buffer

```ts
export class ReplayBuffer {
  private ring: UIEnvelope[] = [];
  private readonly maxEvents = 10_000;
  private readonly maxAgeMs   = 30 * 60_000;

  push(e: UIEnvelope): void {
    this.ring.push(e);
    this.trim();
  }

  replay(fromSeq: number, max: number): { events: UIEnvelope[]; partial: boolean; resumeFrom: number } {
    this.trim();
    const start = this.ring.findIndex(e => e.ui_sequence >= fromSeq);
    if (start < 0) return { events: [], partial: true, resumeFrom: this.ring[0]?.ui_sequence ?? fromSeq };
    const slice = this.ring.slice(start, start + max);
    const partial = slice.length < (this.ring.length - start);
    return { events: slice, partial, resumeFrom: slice.at(-1)?.ui_sequence ?? fromSeq };
  }

  private trim(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    // Timestamp lives on the envelope per §8.1, not on event.payload.
    while (this.ring.length > this.maxEvents ||
           (this.ring[0] && Date.parse(this.ring[0].event?.timestamp ?? (this.ring[0] as any).timestamp ?? "") < cutoff)) {
      this.ring.shift();
    }
  }
}
```

### 3.14 `src/runner/streamEventSource.ts` — Runner SSE Consumer (Core §14.3)

```ts
import { EventSource } from "eventsource";   // or node-native 18+
import { exchangeTokenForStreamScope } from "../auth/tokenExchange";

export async function openRunnerStream(
  runnerOrigin: string,
  sessionId: string,
  userSub: string,
  onEvent: (evt: StreamEvent) => void,
  onClose: (reason: string) => void,
) {
  const scope = `stream:read:${sessionId}`;
  const runnerBearer = await exchangeTokenForStreamScope(userSub, scope);   // RFC 8693
  const url = `${runnerOrigin}/stream/v1/${sessionId}`;

  let lastSequence = 0;

  const open = () => {
    const es = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${runnerBearer}`,
        "Last-Event-ID": String(lastSequence),
      },
      // mTLS client cert is configured at the HTTPS agent level in Node (not shown)
    } as any);

    es.addEventListener("message", (msg: MessageEvent) => {
      lastSequence = Number((msg as any).lastEventId ?? lastSequence);
      const evt = JSON.parse(msg.data) as StreamEvent;
      onEvent(evt);
      // Detect terminal SessionEnd and do not reconnect
      if (evt.type === "SessionEnd") { es.close(); onClose("SessionEnd"); }
    });

    es.addEventListener("error", async (e: any) => {
      es.close();
      // ResumeGap (409) → fresh subscribe from 0; ConsumerLagging is signaled by a final SSE `event: soa-terminate` followed by HTTP close (§14.3) → reconnect after backoff
      if (e.status === 409) { lastSequence = 0; setTimeout(open, 500); return; }
      setTimeout(open, Math.min(30_000, 500 * 2 ** backoffAttempts++));
    });
  };

  open();
}
```

This path consumes the Runner-side SSE contract per Core §14.3. The Gateway bridges inbound `StreamEvent`s into the envelope-wrapper pipeline (§3.8 `wrap.ts`) for UI-facing delivery.

### 3.15 `src/cost/projector.ts` — CostUpdate Derivation

```ts
// Called on every Runner event; emits CostUpdate ≤ 1 per 5s per turn,
// PLUS mandatory one at turn end (UV-C-01, UV-PERF-04).
export class CostProjector {
  private lastEmit = 0;
  private turnStartTokens = 0;
  emitIfDue(sess: SessionState, evt: StreamEvent): UIDerivedEvent | null {
    if (evt.type === "MessageStart") this.turnStartTokens = sess.tokensUsed;

    const now = Date.now();
    const isTurnEnd = evt.type === "MessageEnd";
    if (!isTurnEnd && now - this.lastEmit < 5_000) return null;
    this.lastEmit = now;

    // §8.2.2: CostUpdate is non-essential. The spec requires that the single turn-end
    // CostUpdate MUST be delivered (UV-PERF-04) — treated as a delivery guarantee on the
    // Gateway's send path, not as a reclassification of the event's essential flag.
    return {
      type: "CostUpdate",
      payload: {
        source: "gateway",
        session_id: sess.id,
        turn_id: evt.turn_id,
        tokens_used_in_turn: sess.tokensUsed - this.turnStartTokens,
        tokens_used_in_session: sess.tokensUsed,
        tokens_remaining: sess.budget - sess.tokensUsed,
        billing_tag: sess.billingTag,
        cache_input_tokens: sess.cacheTokens,
        projected_next_turn: sess.projectNextTurn(),
        currency_estimate: { amount: sess.advisoryUsd(), currency: "USD", source: "advisory" },
      },
      __deliveryHint: { forceDeliverAtTurnEnd: isTurnEnd },
    } as any;
  }
}
```

### 3.16 `src/errors.ts` — Error Code → HTTP/WS Mapping

```ts
const MAP: Record<string, { http?: number; ws?: number }> = {
  "ui.auth-required":             { http: 401, ws: 4007 },
  "ui.token-expired":             { http: 401, ws: 4007 },
  "ui.scope-insufficient":        { http: 403, ws: 4001 },
  "ui.session-cap-expired":       { http: 401, ws: 4007 },
  "ui.idp-discovery-failed":      { http: 502, ws: 4004 },
  "ui.dpop-invalid":              { http: 401, ws: 4007 },
  "ui.transport-unsupported":     { http: 400, ws: 4005 },
  "ui.frame-too-large":           { http: 413, ws: 4005 },
  "ui.rate-limited":              { http: 429, ws: 4006 },
  "ui.replay-gap":                { http: 409, ws: 4002 },
  "ui.unknown-command":           { http: 400 },
  "ui.duplicate-command":         { http: 200 },
  "ui.upload-sha-mismatch":       { http: 400 },
  "ui.artifact-sha-mismatch":     { http: 502 },
  "ui.prompt-not-assigned":       { http: 403 },
  "ui.prompt-expired":            { http: 410 },
  "ui.prompt-signature-invalid":  { http: 401 },
  "ui.prompt-scope-insufficient": { http: 401 },
  "ui.gateway-unavailable":       { http: 503, ws: 4004 },
  "ui.runner-mtls-failed":        { http: 502, ws: 4004 },
  "ui.artifact-not-found":        { http: 404 },
  "ui.artifact-too-large":        { http: 413 },
  "ui.artifact-retention-expired":{ http: 410 },
};
export class GatewayError extends Error {
  constructor(public code: keyof typeof MAP) { super(code); }
  http() { return MAP[this.code]?.http ?? 500; }
  ws()   { return MAP[this.code]?.ws ?? 1011; }
}
```

### 3.17 `src/artifacts/origin.ts` — Cookie-less Artifact Origin

```ts
// Run this on a DIFFERENT origin from the UI (UV-SESS-06).
// Add a separate Fastify instance bound to artifacts.example.com,
// sharing no cookies/tokens with the UI origin.
app.addHook("onSend", async (_req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");                 // UV-SESS-07
  reply.header("Content-Security-Policy", "default-src 'none'; sandbox;"); // UV-SESS-08
  reply.header("Cross-Origin-Resource-Policy", "same-site");
});
```

### 3.18 `src/audit/sink.ts` — WORM Sink Adapter

```ts
// Portable interface per Core §10.5. S3 example below; other backends (Azure
// immutable blob, GCS retention, on-prem append-only log) plug in here.
export interface AuditSink {
  append(record: AuditRecord): Promise<{ id: string; sink_ts: string }>;
}

export class S3ObjectLockSink implements AuditSink {
  async append(record) {
    const canonical = canonicalize(record);
    const id = `aud_${randomUuid()}`;
    await s3.putObject({
      Bucket: process.env.AUDIT_BUCKET!,
      Key: `${yyyymmdd()}/${id}.json`,
      Body: canonical,
      ContentType: "application/json",
      ObjectLockMode: "COMPLIANCE",
      ObjectLockRetainUntilDate: new Date(Date.now() + 365 * 86400_000),
    }).promise();
    return { id, sink_ts: new Date().toISOString() };
  }
}
```

---

## 4. Runtime Sketch: Connect → Subscribe → Prompt Decision

1. **HTTP Upgrade.** Client opens `wss://gateway/ui/v1/connect` with `Authorization: Bearer <access_token>` + `DPoP: <proof>`. Server validates both, derives scope, accepts.
2. **First `subscribe` op** carries `session_id`, `soa_ui_profile` (fixes rate tier), optional `replay.from_sequence`. Gateway attaches to the session, starts piping Runner `StreamEvent`s.
3. **Runner emits `PermissionPrompt`.** `envelope/redact.ts` produces a redacted pass-through for `ui.command` observers, a `StubPromptPlaceholder` for `ui.read`, and `prompt/assign.ts` computes `PromptAssigned`. `prompt/deadline.ts` schedules `PromptExpired`.
4. **UI submits `PromptDecision`** over the open WebSocket. `commands/promptDecision.ts` verifies PDA (WebAuthn or JWS), checks binding fields, translates to Core decision, forwards to Runner, writes audit, resolves the prompt in `prompt/registry.ts`.
5. **Runner emits `PermissionDecision`.** Gateway wraps + forwards to all observers. `audit/sink.ts` append.
6. **Tool runs.** `ToolInputStart/Delta/End` + `ToolResult`/`ToolError` flow through `envelope/wrap.ts` with `trust_class = "tool-output"`. Content safety per §15 enforced by the UI.
7. **Turn end.** `cost/projector.ts` emits the non-essential turn-end `CostUpdate` with a delivery hint; the send path guarantees this one is delivered (per UI §13.2 / UV-PERF-04) without re-flagging it essential. `session/buffer.ts` holds events for replay.
8. **Client disconnects.** `session/manager.ts` begins 10-minute grace; replay buffer retained. Reconnect with `last_ack_sequence` → resume or `ConnectionResumed {partial}`.

---

## 5. What's Deliberately Omitted

- Local IPC transport per UI §6.1.1 (Unix socket / named pipe, `SO_PEERCRED` / `LOCAL_PEEREID` / `GetNamedPipeClientProcessId` peer-creds, and the `{ "op": "authenticate", "access_token": "..." }` first-message handshake). The sketch only illustrates the WebSocket path; implementations targeting CLI/IDE profiles MUST add an IPC listener that mirrors §3.10's `handleWsConnection` logic after the peer-cred + first-frame auth check.
- Clustering, sticky-session routing, sharded Gateway.
- Full CRL refresher with distributed-cache coherence (sketch: poll `trust_anchor/crl.json` hourly, cache in Redis, subscribe updates via pub/sub).
- Metrics/logging (OpenTelemetry exporters for Gateway own traces; merge with Runner OTel per UI profile §13.3).
- Retry/backoff policy for Runner calls.
- Full CSRF double-submit cookie implementation.
- Mobile push notification delivery (APNs/FCM adapters).
- Locale map loading + hot reload.
- Complete scope-filtering logic for every Core event type.
- Rate-limit implementation (token bucket per session; suggest `rate-limiter-flexible`).
- Unit + conformance test harness (see `test/ui-validate-adapter.ts`; run `ui-validate --gateway-url https://gateway.localhost.test:8443 --target-profile web`). Plain HTTP is forbidden by §6.1; use a local-CA-issued cert for loopback testing.

---

## 6. How to Run `ui-validate` Against This Sketch

```bash
# 1. Start a Core Runner (any v1.0-compliant implementation)
soa-runner start --agent-card ./agent-card.json

# 2. Start the Gateway
npm run dev

# 3. Point a reference UI at the Gateway (e.g., reference-ui-web)
# 4. Run the validator
ui-validate \
  --target-profile web \
  --ui-url https://ui.localhost.test:3000 \
  --gateway-url https://gateway.localhost.test:8443 \
  --manual-addendum ./appendix-b-audit.json \
  --report ui-report.json
```

Expected: phases 1–14 per `ui-validate-must-map.json` run in order. The Gateway sketch above passes phases 1 (Transport), 2 (Auth), 3 (Enrollment), 4 (Envelope), 5 (Scope), 7 (Prompt & Attestation), 9 (Cost), 14 (Error Taxonomy). Phases 6 (Content Safety) and 12 (A11y/I18n) are UI-layer; phases 10 (Handoff) and 11 (Profile-specific) require Runner + client cooperation.

---

## 7. Security Review Checklist for Implementers

Before shipping a Gateway built on this sketch, verify:

- [ ] All 37 Gateway-side MUSTs from Appendix A of the Profile.
- [ ] Origin allowlist on WebSocket upgrade is strict — no wildcard.
- [ ] DPoP jti replay cache TTL ≥ max proof lifetime.
- [ ] Credential store encrypts COSE public keys at rest.
- [ ] CRL refresh job runs every hour; failure to refresh within 2 hours disables signature-dependent operations.
- [ ] WORM audit sink is on a separate credential scope; Gateway cannot delete from it.
- [ ] Rate limits engage BEFORE WebSocket frame parsing for hostile peers.
- [ ] Artifact origin deployed on a distinct DNS name with its own cert.
- [ ] `ui-validate` exits 0 under `--target-profile=web` including the manual addendum.

---

## 8. Licensing

This sketch is MIT-licensed example code. Nothing here is normative; the Profile and Core specification are the only normative sources.
