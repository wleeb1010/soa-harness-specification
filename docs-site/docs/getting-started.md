---
sidebar_position: 3
---

# Getting Started

From zero to a signed Agent Card served + one audit row written + one conformance pass in about two minutes.

## 1. Scaffold

```bash
npx create-soa-agent my-agent
cd my-agent
npm install
```

This produces:

```
my-agent/
  agent-card.json            # ReadOnly demo card
  initial-trust.json         # synthetic trust root (NOT production-safe)
  tools.json                 # 3-tool demo registry
  hooks/pre-tool-use.mjs     # illustrative §15 hook
  permission-decisions/auto-allow.json  # first-boot decision body
  start.mjs                  # demo entrypoint
  conform.mjs                # scaffold-shipped conformance probe runner
  package.json               # npm run start + npm run conform
```

## 2. Run the Runner

```bash
npm start
```

On a warm npm cache this takes under 90 seconds to first audit row. You'll see:

```
[start-runner] Runner live at 127.0.0.1:7700
  GET http://127.0.0.1:7700/.well-known/agent-card.json
  GET http://127.0.0.1:7700/.well-known/agent-card.jws
  GET http://127.0.0.1:7700/health
  GET http://127.0.0.1:7700/ready
  GET http://127.0.0.1:7700/audit/tail
  ...
```

The Runner drives one `POST /permissions/decisions` against the pre-built `auto-allow.json` decision body, so `GET /audit/tail` returns `record_count: 1` within a few seconds.

## 3. Poke it

In another terminal:

```bash
# Agent Card (JSON)
curl -s http://127.0.0.1:7700/.well-known/agent-card.json | head -c 200

# Agent Card (detached JWS)
curl -s http://127.0.0.1:7700/.well-known/agent-card.jws | head -c 200

# Audit chain tip
curl -s http://127.0.0.1:7700/audit/tail \
  -H "Authorization: Bearer <SOA_RUNNER_BOOTSTRAP_BEARER-from-start-output>"
```

## 4. Validate conformance

With the Runner still running and `soa-validate` installed (see [Install](install.md)):

```bash
# Spec-vectors checkout (one-time)
git clone https://github.com/wleeb1010/soa-harness-specification ../soa-harness-specification

# Export the bootstrap bearer that start.mjs printed
export SOA_RUNNER_BOOTSTRAP_BEARER=<value>

# Run conformance
npm run conform
```

You should see per-test output like:

```
SV-CARD-01     pass  passed (vector)
SV-SIGN-01     pass  passed (vector)
SV-PERM-01     pass  passed (vector,live)
...
total=170 pass=62 fail=0 skip=108 error=0
```

## 5. Stop

Ctrl+C in the terminal running `npm start`. Audit log and sessions persist under `./audit/` and `./sessions/` for next time.

## Where to next

- **Add a real LLM provider** — wire a `ProviderAdapter` per `@soa-harness/runner`'s `ProviderAdapter` interface. The v1.1 dispatcher accepts any adapter; real providers (OpenAI, Anthropic, local llama.cpp) are adopter-written.
- **Read the spec** — §10 (permissions), §14 (streaming), §16 (runtime + dispatcher), §10.5 (audit chain) are where most of the load-bearing design lives.
- **[Conformance Tiers](conformance-tiers.md)** — what "conformant" actually means and how to claim it.
