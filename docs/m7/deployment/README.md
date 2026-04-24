# M7 Deployment Artifacts

Reference deployment files for the SOA-Harness Runner. Landed per L-61 evaluator Finding #8: ship a **minimal** Runner-only deployment path at M7 so adopters aren't waiting until M11 Gateway for any production-shaped running topology.

These files are **reference**, not prescriptive. Adopters are expected to copy + adapt + pin to their own infrastructure. Pinning to the exact byte-shape shipped here is not required for conformance.

## What's here

| File | Purpose |
|---|---|
| `Dockerfile.runner` | Multi-stage Node 22 Alpine image. Runtime is non-root (uid 10001), tini as PID 1 for clean SIGTERM forwarding, healthcheck against `/ready`. |
| `docker-compose.yml` | Minimal Runner-only topology. One service, one volume, no Gateway/Redis/MCP. Loopback-only port binding — reverse-proxy TLS is the adopter's responsibility at M7. |
| `systemd/soa-runner.service` | Systemd unit with §25.3-style hardening (ProtectSystem=strict, NoNewPrivileges, RestrictSUIDSGID, MemoryDenyWriteExecute, reduced SystemCallFilter). |
| `systemd/soa-runner-crl-refresh.{service,timer}` | Hourly CRL refresh heartbeat. Currently a no-op placeholder — activates when the operator-facing `/crl/refresh` endpoint ships. The in-process `BootOrchestrator` scheduler is sole authority until then. |

## What's explicitly NOT here (comes later)

- **Kubernetes Helm chart** — M11 deliverable once Gateway is real; production topology is Runner + Gateway + Redis + MCP backend, not just Runner
- **Full docker-compose with Gateway** — same; M11
- **Real-IdP config** (Auth0/Keycloak reference integration) — M11
- **CRL `/crl/refresh` operator endpoint** — the timer placeholder is ready for it; the endpoint lands in a later M7/M8 commit
- **Observability stack** (Grafana dashboards, OTel collector configs) — M12 deliverable

## Typical deployment shapes

**Docker (development / eval):** use `docker-compose.yml`. `docker compose up --build` and curl `http://127.0.0.1:7700/ready`. Agent card + trust anchors + tools.json live alongside the compose file.

**systemd (small production, single-node):** install the three unit files to `/etc/systemd/system/`, create the `soa` system user, provision `/etc/soa/*.json`, enable `soa-runner.service` and `soa-runner-crl-refresh.timer`. Journal logs go to `journalctl -u soa-runner`.

**Kubernetes (multi-node production):** wait for M11 Helm chart. Adopters who need K8s before M11 can hand-convert `docker-compose.yml` to a Deployment + Service + PVC — the Runner has no K8s-specific surface.

## Security notes

- Bootstrap bearer (`SOA_BOOTSTRAP_BEARER`) MUST come from a secrets manager in production. Neither file inlines it.
- `initial-trust.json` and `agent-card.json` are read-only mounts. If your workflow requires rotating them, perform the rotation externally and restart the Runner — the spec does not define a mid-run rotation path for v1.1.
- The compose file drops ALL capabilities + mounts `/` read-only. Systemd hardening achieves the same via `CapabilityBoundingSet=` and `ProtectSystem=strict`.
- Outbound network access in both images is NOT restricted by default. For deployments that do outbound LLM provider calls via the §16.3 dispatcher, adopters MUST add explicit egress rules (`IPAddressAllow=` in systemd, `networks:` allowlist in compose) scoped to the provider endpoints they actually use.

## Smoke-testing the Dockerfile

The Dockerfile builds against the monorepo layout (`packages/core`, `packages/schemas`, `packages/runner`). Smoke-test from the impl repo root:

```bash
cd ~/Projects/soa-harness-impl
docker build -f ../soa-harness-specification/docs/m7/deployment/Dockerfile.runner \
  -t soa-runner:1.1-dev .
docker run --rm -p 7700:7700 \
  -v $(pwd)/packages/runner/test/fixtures/agent-card.sample.json:/etc/soa/agent-card.json:ro \
  -v $(pwd)/packages/runner/test/fixtures/initial-trust.valid.json:/etc/soa/initial-trust.json:ro \
  soa-runner:1.1-dev
```

Then from another terminal:

```bash
curl -fsS http://127.0.0.1:7700/ready       # → 200 {"status":"ready"}
curl -fsS http://127.0.0.1:7700/.well-known/agent-card.jws | head -c 200
```

## References

- L-61 in `IMPLEMENTATION_LESSONS.md` — M7+ roadmap parent record
- `scripts/m7/bench-v1.0-baseline.mjs` — v1.0 perf anchor; M11 SV-PERF-* tests diff against these deployed-topology numbers
- Core §7.3.1 — CRL fetch + stale ceiling semantics
- Core §25.3 — Attack-surface catalog informing the hardening flags above
