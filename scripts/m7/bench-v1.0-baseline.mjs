#!/usr/bin/env node
/**
 * bench-v1.0-baseline.mjs — Pre-M7 v1.0.0 perf baseline capture.
 *
 * Produces the numbers pinned in docs/m7/v1.0-perf-baseline.md. Runs 10
 * measured iterations per metric after 3 warmup iterations, records p50 +
 * median-of-per-run-p95 per the methodology section of that doc.
 *
 * USAGE
 *   node scripts/m7/bench-v1.0-baseline.mjs \
 *     --impl-root ../soa-harness-impl \
 *     --env-label "Env A — Windows 11 native" \
 *     --output docs/m7/v1.0-perf-raw/env-a.json
 *
 * PREREQS
 *   1. --impl-root points at a v1.0.0-checked-out soa-harness-impl
 *   2. impl has run `pnpm -r build` — we import from `dist/`
 *   3. Node >= 22
 *
 * OUTPUT
 *   Structured JSON to --output containing:
 *     { env, node_version, runs_per_metric, warmup_runs, metrics: { ... } }
 *
 * NON-GOALS
 *   - No network stack tuning (TCP_NODELAY etc.) — bench measures as-shipped
 *   - No CPU pinning — documented as a limitation in the baseline doc
 *   - No cross-env comparison — each invocation produces one env's numbers
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { release, cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

const SPEC_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

function parseArgs(argv) {
  const args = { warmup: 3, runs: 10 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--impl-root") args.implRoot = argv[++i];
    else if (a === "--env-label") args.envLabel = argv[++i];
    else if (a === "--output") args.output = argv[++i];
    else if (a === "--warmup") args.warmup = Number(argv[++i]);
    else if (a === "--runs") args.runs = Number(argv[++i]);
    else if (a === "--npm-mode") args.npmMode = true;
    else if (a === "--fixtures-dir") args.fixturesDir = argv[++i];
    else if (a === "--quick") { args.warmup = 1; args.runs = 2; } // smoke mode
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").match(/\/\*\*[\s\S]*?\*\//)[0]);
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!args.envLabel || !args.output) {
    console.error("required: --env-label <str> --output <path>");
    console.error("plus EITHER --impl-root <path> OR --npm-mode --fixtures-dir <path>");
    process.exit(2);
  }
  if (!args.npmMode && !args.implRoot) {
    console.error("must pass --impl-root <path> or --npm-mode");
    process.exit(2);
  }
  if (args.npmMode && !args.fixturesDir) {
    console.error("--npm-mode requires --fixtures-dir <path> (path to runner/test/fixtures)");
    process.exit(2);
  }
  if (args.implRoot) args.implRoot = resolve(args.implRoot);
  if (args.fixturesDir) args.fixturesDir = resolve(args.fixturesDir);
  args.output = resolve(args.output);
  return args;
}

async function loadImpl(args) {
  if (args.npmMode) {
    // Resolve from node_modules adjacent to --fixtures-dir (a scratch install)
    const nm = join(args.fixturesDir, "node_modules");
    const runnerPkg = JSON.parse(readFileSync(join(nm, "@soa-harness/runner", "package.json"), "utf8"));
    const corePkg = JSON.parse(readFileSync(join(nm, "@soa-harness/core", "package.json"), "utf8"));
    const runnerEntry = join(nm, "@soa-harness/runner", runnerPkg.main || "dist/index.js");
    const coreEntry = join(nm, "@soa-harness/core", corePkg.main || "dist/index.js");
    const runner = await import(pathToFileURL(runnerEntry).href);
    const core = await import(pathToFileURL(coreEntry).href);
    return { runner, core };
  }
  const runnerDist = join(args.implRoot, "packages", "runner", "dist", "index.js");
  const coreDist = join(args.implRoot, "packages", "core", "dist", "index.js");
  if (!existsSync(runnerDist)) throw new Error(`runner dist missing: ${runnerDist}. Run 'pnpm -r build' in impl.`);
  if (!existsSync(coreDist)) throw new Error(`core dist missing: ${coreDist}.`);
  const runner = await import(pathToFileURL(runnerDist).href);
  const core = await import(pathToFileURL(coreDist).href);
  return { runner, core };
}

function loadFixtures(args) {
  const fixDir = args.npmMode
    ? args.fixturesDir
    : join(args.implRoot, "packages", "runner", "test", "fixtures");
  const card = JSON.parse(readFileSync(join(fixDir, "agent-card.sample.json"), "utf8"));
  const trust = JSON.parse(readFileSync(join(fixDir, "initial-trust.valid.json"), "utf8"));
  return { card, trust };
}

// ─── stats helpers ────────────────────────────────────────────────────────────
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function summarize(samplesByRun) {
  // samplesByRun: Array<Array<number_ms>> — per-run arrays of sample timings
  const perRunP50s = samplesByRun.map((r) => {
    const s = [...r].sort((a, b) => a - b);
    return percentile(s, 0.5);
  });
  const perRunP95s = samplesByRun.map((r) => {
    const s = [...r].sort((a, b) => a - b);
    return percentile(s, 0.95);
  });
  const medianOf = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const allSamples = samplesByRun.flat();
  return {
    p50_ms: round(medianOf(perRunP50s), 3),
    p95_ms: round(medianOf(perRunP95s), 3),
    min_ms: round(Math.min(...allSamples), 3),
    max_ms: round(Math.max(...allSamples), 3),
    sample_count: allSamples.length,
  };
}

function round(n, d) { const f = 10 ** d; return Math.round(n * f) / f; }

function opsPerSec(summary) {
  // Approximate throughput from p50 latency under single-client bench — honest
  // but NOT a concurrency benchmark. Documented in methodology.
  return summary.p50_ms > 0 ? round(1000 / summary.p50_ms, 1) : 0;
}

// ─── metric runners ───────────────────────────────────────────────────────────

async function benchCardSignInProcess(impl, fixtures, samplesPerRun) {
  const { signAgentCard, generateEd25519KeyPair, generateSelfSignedEd25519Cert } = impl.runner;
  const keys = await generateEd25519KeyPair();
  const cert = await generateSelfSignedEd25519Cert({ keys, subject: "CN=soa-release-v1.0,O=Bench" });
  const samples = [];
  for (let i = 0; i < samplesPerRun; i++) {
    const t0 = performance.now();
    await signAgentCard({
      card: fixtures.card,
      alg: "EdDSA",
      kid: "soa-release-v1.0",
      privateKey: keys.privateKey,
      x5c: [cert],
    });
    samples.push(performance.now() - t0);
  }
  return samples;
}

async function benchCardEndpointOverHttp(impl, fixtures, samplesPerRun) {
  const { buildRunnerApp, generateEd25519KeyPair, generateSelfSignedEd25519Cert } = impl.runner;
  const keys = await generateEd25519KeyPair();
  const cert = await generateSelfSignedEd25519Cert({ keys, subject: "CN=soa-release-v1.0,O=Bench" });
  const app = await buildRunnerApp({
    trust: fixtures.trust,
    card: fixtures.card,
    alg: "EdDSA",
    kid: "soa-release-v1.0",
    privateKey: keys.privateKey,
    x5c: [cert],
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  const url = `http://127.0.0.1:${addr.port}/.well-known/agent-card.jws`;
  try {
    const samples = [];
    // Prime keepalive
    await fetch(url);
    for (let i = 0; i < samplesPerRun; i++) {
      const t0 = performance.now();
      const res = await fetch(url);
      await res.text();
      samples.push(performance.now() - t0);
    }
    return samples;
  } finally {
    await app.close();
  }
}

async function benchCardEndpointInProcess(impl, fixtures, samplesPerRun) {
  const { buildRunnerApp, generateEd25519KeyPair, generateSelfSignedEd25519Cert } = impl.runner;
  const keys = await generateEd25519KeyPair();
  const cert = await generateSelfSignedEd25519Cert({ keys, subject: "CN=soa-release-v1.0,O=Bench" });
  const app = await buildRunnerApp({
    trust: fixtures.trust,
    card: fixtures.card,
    alg: "EdDSA",
    kid: "soa-release-v1.0",
    privateKey: keys.privateKey,
    x5c: [cert],
  });
  try {
    const samples = [];
    // Prime
    await app.inject({ method: "GET", url: "/.well-known/agent-card.jws" });
    for (let i = 0; i < samplesPerRun; i++) {
      const t0 = performance.now();
      await app.inject({ method: "GET", url: "/.well-known/agent-card.jws" });
      samples.push(performance.now() - t0);
    }
    return samples;
  } finally {
    await app.close();
  }
}

async function benchJcsThroughput(impl, samplesPerRun) {
  // StreamEvent-shaped object, 25-type enum workload proxy: we don't exercise
  // the emitter path end-to-end here (that's covered by the stream plugin,
  // which is a superset). This metric isolates the JCS canonicalization cost
  // which is on the hot path for every signed event.
  const { jcsBytes } = impl.core;
  const streamEvt = {
    event_id: "01H8PZ5X3J0K2M1N4Q6R7S8T9V",
    session_id: "sess-bench-0001",
    seq: 1,
    ts: "2026-04-23T12:00:00.000Z",
    type: "tool_call_started",
    payload: {
      tool_name: "fs.read",
      args: { path: "/tmp/bench.txt", offset: 0, length: 4096 },
      risk_class: "read-only",
      control: "allow",
    },
  };
  const samples = [];
  for (let i = 0; i < samplesPerRun; i++) {
    const t0 = performance.now();
    jcsBytes(streamEvt);
    samples.push(performance.now() - t0);
  }
  return samples;
}

async function benchSha256(impl, samplesPerRun) {
  const { sha256Hex } = impl.core;
  const buf = Buffer.from("x".repeat(2048));
  const samples = [];
  for (let i = 0; i < samplesPerRun; i++) {
    const t0 = performance.now();
    sha256Hex(buf);
    samples.push(performance.now() - t0);
  }
  return samples;
}

async function benchColdBoot(impl, fixtures, runs) {
  // Each run is a FRESH app (no shared state). Warmup isn't applicable —
  // this IS the cold path.
  const { buildRunnerApp, generateEd25519KeyPair, generateSelfSignedEd25519Cert } = impl.runner;
  const bootTimes = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const keys = await generateEd25519KeyPair();
    const cert = await generateSelfSignedEd25519Cert({ keys, subject: "CN=soa-release-v1.0,O=Bench" });
    const app = await buildRunnerApp({
      trust: fixtures.trust,
      card: fixtures.card,
      alg: "EdDSA",
      kid: "soa-release-v1.0",
      privateKey: keys.privateKey,
      x5c: [cert],
    });
    // Wait for /ready=200
    let ready = false;
    for (let attempt = 0; attempt < 50 && !ready; attempt++) {
      const res = await app.inject({ method: "GET", url: "/ready" });
      if (res.statusCode === 200) ready = true;
      else await new Promise((r) => setTimeout(r, 10));
    }
    const elapsed = performance.now() - t0;
    if (!ready) throw new Error(`run ${i}: /ready never returned 200 within 500ms`);
    bootTimes.push(elapsed);
    await app.close();
  }
  return bootTimes;
}

async function benchRssAtIdle(impl, fixtures) {
  const { buildRunnerApp, generateEd25519KeyPair, generateSelfSignedEd25519Cert } = impl.runner;
  const keys = await generateEd25519KeyPair();
  const cert = await generateSelfSignedEd25519Cert({ keys, subject: "CN=soa-release-v1.0,O=Bench" });
  const app = await buildRunnerApp({
    trust: fixtures.trust,
    card: fixtures.card,
    alg: "EdDSA",
    kid: "soa-release-v1.0",
    privateKey: keys.privateKey,
    x5c: [cert],
  });
  try {
    // Settle GC
    await new Promise((r) => setTimeout(r, 500));
    if (global.gc) global.gc();
    await new Promise((r) => setTimeout(r, 100));
    const rss = process.memoryUsage().rss;
    return round(rss / (1024 * 1024), 1);
  } finally {
    await app.close();
  }
}

// ─── orchestrator ─────────────────────────────────────────────────────────────

async function runMetric(name, fn, args) {
  console.log(`\n[${name}]`);
  // Warmup
  for (let i = 0; i < args.warmup; i++) {
    await fn();
    process.stdout.write(".");
  }
  process.stdout.write(" warmup done; measuring");
  const runs = [];
  for (let i = 0; i < args.runs; i++) {
    runs.push(await fn());
    process.stdout.write(".");
  }
  console.log(" done");
  return runs;
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();
  console.log(`bench-v1.0-baseline starting`);
  console.log(`  impl-root: ${args.implRoot}`);
  console.log(`  env-label: ${args.envLabel}`);
  console.log(`  warmup: ${args.warmup}, runs: ${args.runs}`);

  const impl = await loadImpl(args);
  const fixtures = loadFixtures(args);

  const metrics = {};

  const cardSignInProc = await runMetric(
    "agent-card-sign (in-process)",
    () => benchCardSignInProcess(impl, fixtures, 1000),
    args,
  );
  metrics.agent_card_sign_in_process = { ...summarize(cardSignInProc), ops_per_sec_approx: opsPerSec(summarize(cardSignInProc)) };

  const cardEndpointInProc = await runMetric(
    "agent-card-endpoint (in-process inject)",
    () => benchCardEndpointInProcess(impl, fixtures, 1000),
    args,
  );
  metrics.agent_card_endpoint_in_process = { ...summarize(cardEndpointInProc), ops_per_sec_approx: opsPerSec(summarize(cardEndpointInProc)) };

  const cardEndpointHttp = await runMetric(
    "agent-card-endpoint (over HTTP)",
    () => benchCardEndpointOverHttp(impl, fixtures, 1000),
    args,
  );
  metrics.agent_card_endpoint_http = { ...summarize(cardEndpointHttp), ops_per_sec_approx: opsPerSec(summarize(cardEndpointHttp)) };

  const jcs = await runMetric(
    "jcs canonicalize (StreamEvent-shaped)",
    () => benchJcsThroughput(impl, 10000),
    args,
  );
  metrics.jcs_streamevent = { ...summarize(jcs), ops_per_sec_approx: opsPerSec(summarize(jcs)) };

  const sha = await runMetric(
    "sha256 (2KB)",
    () => benchSha256(impl, 10000),
    args,
  );
  metrics.sha256_2kb = { ...summarize(sha), ops_per_sec_approx: opsPerSec(summarize(sha)) };

  // Cold boot is a single-wave metric (no warmup — we ARE measuring cold)
  const bootTimes = await benchColdBoot(impl, fixtures, Math.max(3, args.runs));
  const bootSummary = summarize([bootTimes]);
  metrics.cold_boot = {
    median_ms: round(bootTimes.sort((a, b) => a - b)[Math.floor(bootTimes.length / 2)], 3),
    min_ms: bootSummary.min_ms,
    max_ms: bootSummary.max_ms,
    sample_count: bootTimes.length,
  };

  metrics.rss_idle_mb = await benchRssAtIdle(impl, fixtures);

  const output = {
    schema_version: 1,
    bench: "v1.0-baseline",
    env_label: args.envLabel,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    os_release: release(),
    cpu_model: cpus()[0]?.model ?? "unknown",
    cpu_count: cpus().length,
    total_mem_gb: Math.round(totalmem() / (1024 ** 3) * 10) / 10,
    impl_source: args.npmMode ? "npm-registry@1.0.0" : args.implRoot,
    warmup_runs: args.warmup,
    measured_runs: args.runs,
    metrics,
  };

  // Ensure output dir
  const outDir = resolve(args.output, "..");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nwrote ${args.output}`);
}

main().catch((e) => {
  console.error("bench failed:", e);
  process.exit(1);
});
