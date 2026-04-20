# SOA-Harness v1.0 Deployment Environment (Informative)

> **Status:** Informative operator guidance — **not part of the normative v1.0 specification bundle**. This document is NOT enumerated in `MANIFEST.json` and carries no test ID in either `soa-validate-must-map.json` or `ui-validate-must-map.json`. All normative requirements live in `SOA-Harness Core Specification v1.0 (Final).md` and `SOA-Harness UI Integration Profile v1.0 (Final).md`. Where this document cites a requirement, the cited spec section is authoritative; if the two disagree, trust the spec.

This document collects the OS, hardware, network, and library prerequisites that an operator needs to bring a conformant Runner or UI Gateway online. It is organized by deployment profile so that operators targeting, say, a CLI-only Gateway don't plan around requirements that only apply to full Runner + `core+si`.

---

## 1. Deployment profile matrix

The requirements split cleanly along conformance profile (Core §18.3) and UI profile targets (UI §18.1):

| Profile            | Runs                          | Host OS      | Container?   |
| ------------------ | ----------------------------- | ------------ | ------------ |
| `core`             | Runner without SI             | Any          | No           |
| `core+si`          | Core + §9 Self-Improvement    | **Linux**    | **Yes**      |
| `core+handoff`     | Core + §17 A2A handoff        | Any          | No           |
| UI — `web`         | Gateway for browser UI        | Any          | No           |
| UI — `mobile`      | Gateway for mobile UI         | Any          | No           |
| UI — `ide`         | Gateway for IDE / IPC peers   | Any          | No           |
| UI — `cli`         | Gateway for CLI / IPC peers   | Any          | No           |

Notes on the table:
- **Host OS = Any** means Linux, macOS, or Windows — all three have normative support in the spec (session atomic writes §12.3, keystore §10.6, IPC peer-creds UI §6.1.1).
- `core+si` is the only profile that requires Linux; the §9.7 Docker + seccomp + host-kernel-userns prerequisite is Linux-native. `core+si` also requires **Docker 20.10+ or containerd + runc ≥ 1.1**.
- UI Gateway profiles (`web` / `mobile` / `ide` / `cli`) are listed separately because UI §18.1 enables different test subsets per profile; the OS/container requirements are identical across them.

**Cross-platform normative support points:**
- Session atomic writes (§12.3) have a POSIX recipe (`rename(.tmp, path)` + `fsync(dir_fd)`) and a Windows recipe (`MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)`).
- Handler key storage (§10.6) accepts Windows DPAPI, macOS Keychain, or Linux kernel keyring.
- Distributed self-improvement lock (§12.4 `local` mode) lives at `/var/soa/self-improve.lock` on POSIX or `%ProgramData%\soa\self-improve.lock` on Windows.
- Local IPC peer-cred check (UI §6.1.1) uses `SO_PEERCRED` on Linux, `LOCAL_PEEREID` on macOS/BSD, or `GetNamedPipeClientProcessId` on Windows.

**Linux-only surfaces:** §9.7 Docker isolation + seccomp profile + host-kernel user-namespace prerequisite. Any Runner claiming `core+si` MUST run on Linux; Core-only implementations are fully cross-platform.

---

## 2. Supported CPU architectures

The companion seccomp profile `soa-harness-profile-v1.json` enumerates five architectures in its `archMap`:

| Arch      | libseccomp token       | Baseline | `CLONE_NEW*` filter |
| --------- | ---------------------- | -------- | ------------------- |
| x86_64    | `SCMP_ARCH_X86_64`     | Applied  | Applied             |
| aarch64   | `SCMP_ARCH_AARCH64`    | Applied  | Applied             |
| riscv64   | `SCMP_ARCH_RISCV64`    | Applied  | Applied             |
| s390x     | `SCMP_ARCH_S390X`      | Applied  | **Skipped**         |
| ppc64le   | `SCMP_ARCH_PPC64LE`    | Applied  | **Skipped**         |

Notes on the table:
- x86_64 includes the `SCMP_ARCH_X86` and `SCMP_ARCH_X32` sub-arches; aarch64 includes `SCMP_ARCH_ARM`.
- The clone-arg filter (which blocks `CLONE_NEW*` namespace flags via a bitmap check on syscall-arg index 0) is skipped on s390x and ppc64le because those ABIs place the flags bitmap at arg index 1, not 0. Defense on those arches is best-effort: `cap-drop=ALL` + host userns sysctl + no-new-privileges.
- Core (without SI) has **no architecture restriction** — the seccomp profile is only loaded on `core+si`.

---

## 3. Required software dependencies

Every dependency in this section is load-bearing for at least one normative path. Version floors are taken from the spec's normative references (§2) or the profile's `$parser_requirement`.

### 3.1 Ubiquitous (all profiles)

- **TLS 1.3** ([RFC-8446]). TLS 1.2 is non-conformant.
- **JSON Schema 2020-12 validator** — needed to validate Agent Cards, the Gateway discovery document, `canonical_decision` PDAs, etc.
- **RFC 8785 JCS library** ([RFC-8785], cited in Core §2 and §1). Required for signed Agent Card JWS, MANIFEST JWS, PDA-JWS, audit canonical hashing, and the A2A digest fields (§17.2). Reference implementations: `canonicalize` (JavaScript, npm — authored by RFC 8785 co-author Samuel Erdtman), `github.com/gowebpki/jcs` (Go), `rfc8785` (Python). A subset JCS that handles only integers/strings is acceptable in build tooling that never touches floats (see Core §1).
- **POSIX-semantics file system** or Windows NTFS with atomic rename support — required for §12.3 session persistence.
- **OS-level key storage** (Windows DPAPI, macOS Keychain, Linux kernel keyring) OR an HSM — plaintext handler keys on disk are forbidden (§10.6).
- **Git** ≥ 2.30 — required by the self-improvement stage-activate flow (§9.5 step 12d); `git verify-commit` is used for the novelty-quota unlock path (§23). Pure `core` deployments may omit.

### 3.2 `core+si` only

- **Linux kernel** ≥ 4.9 (for `user.max_user_namespaces`). Kernel ≥ 5.0 is required only if the optional `SECCOMP_RET_USER_NOTIF` supervisor is deployed (§9.7.3; optional, not conformance-gating).
- **libseccomp** ≥ 2.5 (required for the profile's modern syscall allowlist and `$`-key parser tolerance).
- **Docker** ≥ 20.10 OR `containerd` + `runc` ≥ 1.1. Both deliver the seccomp-JSON conventions the profile relies on (see `$parser_requirement` in `soa-harness-profile-v1.json`).
- **Host kernel hardening — exactly ONE of:**
  - `sysctl user.max_user_namespaces=0` (portable, Linux ≥ 4.9), OR
  - `sysctl kernel.unprivileged_userns_clone=0` (Debian/Ubuntu patched kernels), OR
  - AppArmor/SELinux policy denying `userns_create` to the container security context.
  Absence → `HostHardeningInsufficient` per §9.7.

### 3.3 UI Gateway (any UI profile)

- **WebAuthn-L3** server library (for `web`/`ide`/`mobile` profiles) — required by UI §7.3 enrollment and §11.4 PDA-WebAuthn verification. Attestation formats consumed: `packed`, `tpm`, `android-key`, `apple` (all hardware-backed); `none` / `self` are accepted for enrollment but do NOT satisfy the always-* step-up rule (UI §11.4).
- **OAuth 2.1 + PKCE** client/server — UI §7.2.
- **DPoP (RFC 9449)** support for public clients — UI §7.6.
- **RFC 8693 token exchange** — UI §7.4 Gateway→Runner credential exchange.
- **JWS library** supporting at minimum `EdDSA` and `ES256`; `RS256 ≥ 3072` required if any enrolled handler uses RS256 (Core §10.6, UI §11.4). Algorithms outside the allowlist MUST be rejected.

### 3.4 §5.3 bootstrap channel (pick one per deployment)

- **SDK-pinned** — no external dependency; the SDK ships the `publisher_kid` + SPKI hash.
- **Operator-bundled** — no runtime dependency; `initial-trust.json` ships via configuration management.
- **DNSSEC TXT** — requires a **DNSSEC-validating resolver** that exposes the AD bit (e.g., unbound, knot-resolver, `systemd-resolved` with `DNSSEC=true`, `getdns` with DNSSEC enabled). The OS stub resolver on most major distros does NOT validate by default.

### 3.5 Optional / recommended (production)

- **Redis** ≥ 7 (or a Redis-compatible store such as Valkey, KeyDB) — recommended for the UI §11.4.1 nonce replay cache on `web`/`mobile` profiles (the UI profile permits in-memory for `cli`/`ide`) and for distributed `core+si` fencing (Core §12.4 `distributed` mode). etcd v3 or ZooKeeper also satisfy §12.4.
- **OpenTelemetry Collector** — ingestion endpoint for the Runner's `soa.turn` spans (§14.4). Not strictly required, but without it the Runner still buffers up to 10k spans and emits `ObservabilityBackpressure`.
- **Hardware Security Module** — preferred over OS keystore for high-value handler keys; satisfies the `hardware_backed` enrollment requirement for always-* step-up (UI §11.4).
- **NVIDIA GPU** — if the Agent Card's `self_improvement.benchmark_mcp_endpoint` runs local inference; not required by the harness itself.

---

## 4. TLS, network, and discovery surfaces

| Surface              | Path or form                                   | Transport / auth             | Spec            |
| -------------------- | ---------------------------------------------- | ---------------------------- | --------------- |
| Agent Card           | `/.well-known/agent-card.json` and `/.well-known/agent-card.jws` (two endpoints) | HTTPS / TLS 1.3              | §6.1, §6.1.1    |
| Runner stream        | `/stream/v1/{session_id}`                      | HTTPS + mTLS + bearer token  | §14.3           |
| UI discovery         | `/.well-known/soa-ui-config.json`              | HTTPS / TLS 1.3              | UI §7.1         |
| UI WebSocket         | `/ui/v1/connect`                               | WSS + bearer + DPoP          | UI §6, §7.6    |
| Local IPC            | Unix socket `/` named pipe                     | Peer-cred + authenticate op  | UI §6.1.1       |
| A2A JSON-RPC         | `/a2a/v1`                                      | HTTPS + mTLS + signed JWT    | §17.1           |
| Release MANIFEST JWS | `MANIFEST.json.jws` (detached)                 | JCS(MANIFEST.json) + JWS     | §6.1.1, §9.7.1  |

Notes on the table:
- All HTTPS surfaces REQUIRE TLS 1.3 — TLS 1.2 is non-conformant.
- Agent Card responses MUST include `ETag` and `Cache-Control: max-age ≤ 300` (§6.1).
- Runner-stream bearer is obtained via RFC 8693 token exchange (UI §7.4) with scope `stream:read:{session_id}`.
- Local IPC first-frame auth: the client sends `{"op":"authenticate","access_token":"…"}` before any `subscribe`.
- MANIFEST JWS is verified against the bootstrap-supplied trust anchor (§5.3), not against the manifest itself.

---

## 5. Storage invariants

- **Sessions** (`/sessions/<session-id>.json`): atomic per-event write via the §12.3 rename pattern.
- **Audit trail** (§10.5): WORM / immutable backend. Compatible stores: S3 Object Lock, Azure Immutable Blob Storage, Google Cloud Storage retention policies, MinIO with object-lock, or an on-prem append-only log with hardware write-once semantics.
- **`/tasks/` directory** (§9.6) — flat directory of Harbor-format benchmark task folders; immutable to the meta-agent (only human-signed commits modify it, per §23 novelty quota).
- **CRL cache** (UI §7.3.1, Core §10.6): refresh hourly, fail-closed past `not_after` or after 2 h unreachable.
- **Prompt-nonce replay cache** (UI §11.4.1): durable for `web`/`mobile` (Redis `SET NX PX`, fsync'd store, or WORM sink); in-memory acceptable for `cli`/`ide`.

---

## 6. Hardware sizing (non-normative operator baseline)

The spec imposes no minimum hardware floor. The values below are a sensible starting point for a single-Runner deployment serving light interactive traffic; resize based on traffic, model context length, and benchmark workload.

| Category | Baseline             | Scales with                     |
| -------- | -------------------- | ------------------------------- |
| CPU      | 4 vCPU               | §9.5 benchmark task count       |
| RAM      | 8 GB                 | Model context length            |
| Disk     | 20 GB free           | Audit trail + SI artifacts      |
| Network  | 100 Mbit/s symmetric | SSE stream + artifact downloads |
| GPU      | Optional             | Local benchmark inference only  |

Notes on the table:
- Excludes model weights if the deployment runs local inference (add disk + RAM accordingly).
- Plan for audit-trail rotation; `/artifacts/self_improvement/<iteration-id>/` accumulates one directory per SI iteration.

---

## 7. Summary checklist

Copy this into the deployment runbook:

- [ ] OS chosen matches profile (Linux for `core+si`; any for others).
- [ ] CPU architecture is in the §9.7 archMap (x86_64 / aarch64 / riscv64 for full seccomp; s390x / ppc64le best-effort).
- [ ] TLS 1.3 terminator in place; TLS 1.2 fallback disabled.
- [ ] JSON Schema 2020-12 validator integrated.
- [ ] RFC 8785 JCS library wired into the signing path.
- [ ] Git ≥ 2.30 installed (if `core+si`).
- [ ] libseccomp ≥ 2.5 + Docker 20.10+ / runc ≥ 1.1 installed (if `core+si`).
- [ ] Host kernel hardening — one of the three §9.7 mechanisms verified at startup.
- [ ] Handler-key store: HSM or OS keystore; no plaintext keys on disk.
- [ ] WORM audit backend configured; reachable from Runner.
- [ ] Atomic-write semantics verified on the session FS.
- [ ] UI Gateway (if any): WebAuthn-L3, OAuth 2.1+PKCE, DPoP, RFC 8693 libraries in place.
- [ ] §5.3 bootstrap channel chosen and deployed (SDK-pinned, operator-bundled, or DNSSEC TXT).
- [ ] OTel collector endpoint reachable (optional but recommended).
- [ ] Redis/Valkey (or equivalent) reachable (if distributed fencing or durable replay cache needed).

---

## 8. Quick cross-reference to normative sections

| Topic                              | Authoritative section               |
| ---------------------------------- | ----------------------------------- |
| Bootstrap channels                 | Core §5.3                           |
| Agent Card schema                  | Core §6.2                           |
| Agent Card signing profile         | Core §6.1.1                         |
| Permission system                  | Core §10                            |
| Key management                     | Core §10.6                          |
| CRL artifact format                | Core §10.6.1                        |
| Session atomicity                  | Core §12.3                          |
| Distributed coordination           | Core §12.4                          |
| Stream subscription                | Core §14.3                          |
| Self-improvement loop              | Core §9                             |
| Docker isolation + host hardening  | Core §9.7                           |
| Seccomp profile + manifest         | Core §9.7.1                         |
| A2A handoff                        | Core §17                            |
| A2A digest canonicalization        | Core §17.2                          |
| Error taxonomy (Runner)            | Core §24                            |
| Error taxonomy (UI)                | UI §21                              |
| UI transport                       | UI §6                               |
| UI auth + enrollment               | UI §7                               |
| UI Gateway discovery               | UI §7.1                             |
| Prompt nonce + replay cache        | UI §11.4.1                          |
| Always-* step-up                   | UI §11.4                            |
| Conformance profiles               | Core §18.3                          |
| Release bundle contents            | Core §19                            |
