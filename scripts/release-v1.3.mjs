#!/usr/bin/env node
/**
 * release-v1.3.mjs — Release orchestration script for SOA-Harness v1.3.0.
 *
 * Publishes all 11 packages in dependency order to npm (or a custom registry
 * for staging), verifies each publish, and emits a JSON log of the sequence.
 *
 * Differences from release-v1.0.mjs:
 *   - TARGET_VERSION bumped 1.0.0 → 1.1.0
 *   - PACKAGES list gains @soa-harness/example-provider-adapter (new in v1.1;
 *     reference scaffold for §16.3 dispatcher ProviderAdapter adopters)
 *     slotted after langgraph-adapter (same depth in the dep tree — both
 *     consume @soa-harness/runner only) and before create-soa-agent
 *
 * USAGE
 *   node release-v1.3.mjs --impl-root <path> [--registry <url>] [--dry-run]
 *
 * EXAMPLES
 *   Staging (Verdaccio):
 *     node release-v1.3.mjs --impl-root ../soa-harness-impl --registry http://localhost:4873/
 *
 *   Production (npm):
 *     node release-v1.3.mjs --impl-root ../soa-harness-impl
 *     (uses the default registry from ~/.npmrc)
 *
 *   Dry run (no actual publish):
 *     node release-v1.3.mjs --impl-root ../soa-harness-impl --dry-run
 *
 * PREREQUISITES
 *   1. MANIFEST.json.jws is signed with the real release key
 *      (same key as v1.0, fingerprint l5TzOjMJfyyDTuEarut87i3T8KhGBV4AeLwOXo028vI=)
 *   2. Fresh granular npm token is active in ~/.npmrc
 *   3. Verdaccio dry-run with this script passed
 *   4. All 9 packages at 1.3.0 in impl/packages/*
 *   5. This script is run from the spec repo root
 *
 * FAILURE SEMANTICS
 *   - Halts on first failed publish; writes release-log.json showing what
 *     succeeded so far. Does NOT attempt rollback — see
 *     docs/m6/rollback-runbook.md for Mode 1 (cascade failure) decisions.
 *   - Pre-flight check validates that NO package@1.3.0 already exists on
 *     the target registry. EPUBLISHCONFLICT at that stage means
 *     investigate BEFORE any publish fires.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

// Dependency order — schemas + core first (leaves of the dep tree),
// runner consumes them, memory backends consume runner, adapters
// (langgraph, example-provider) consume runner, scaffold consumes
// runner + memory-mcp-sqlite.
const PACKAGES = [
  { name: "@soa-harness/schemas", dir: "packages/schemas" },
  { name: "@soa-harness/core", dir: "packages/core" },
  { name: "@soa-harness/runner", dir: "packages/runner" },
  { name: "@soa-harness/memory-mcp-sqlite", dir: "packages/memory-mcp-sqlite" },
  { name: "@soa-harness/memory-mcp-mem0", dir: "packages/memory-mcp-mem0" },
  { name: "@soa-harness/memory-mcp-zep", dir: "packages/memory-mcp-zep" },
  { name: "@soa-harness/langgraph-adapter", dir: "packages/langgraph-adapter" },
  { name: "@soa-harness/example-provider-adapter", dir: "packages/example-provider-adapter" },
  { name: "@soa-harness/chat-ui", dir: "packages/chat-ui" },
  { name: "@soa-harness/cli", dir: "packages/cli" },
  { name: "create-soa-agent", dir: "packages/create-soa-agent" },
];

const TARGET_VERSION = "1.3.0";

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--impl-root") args.implRoot = argv[++i];
    else if (a === "--registry") args.registry = argv[++i];
    else if (a === "--otp") args.otp = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[0]);
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!args.implRoot) {
    console.error("--impl-root is required");
    process.exit(2);
  }
  args.implRoot = resolve(args.implRoot);
  return args;
}

function run(cmd, opts = {}) {
  // execSync returns null when stdio is "inherit" (child output went to
  // parent TTY, not captured), so trim() would throw. Default to empty
  // string in that case — callers that use this via tryRun() treat
  // "no throw + empty stdout" as success.
  const r = execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
  return r == null ? "" : String(r).trim();
}

function tryRun(cmd, opts = {}) {
  try {
    return { ok: true, stdout: run(cmd, opts) };
  } catch (e) {
    return { ok: false, code: e.status, stderr: e.stderr?.toString() || "", stdout: e.stdout?.toString() || "" };
  }
}

function preflight(args) {
  const failures = [];

  // Impl root exists + has package.json
  if (!existsSync(args.implRoot)) failures.push(`impl root does not exist: ${args.implRoot}`);
  if (!existsSync(join(args.implRoot, "package.json"))) failures.push(`no package.json at impl root`);

  // Every package.json is at TARGET_VERSION
  for (const pkg of PACKAGES) {
    const pkgJsonPath = join(args.implRoot, pkg.dir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      failures.push(`missing: ${pkgJsonPath}`);
      continue;
    }
    const v = JSON.parse(readFileSync(pkgJsonPath, "utf8")).version;
    if (v !== TARGET_VERSION) {
      failures.push(`${pkg.name} version is ${v}, expected ${TARGET_VERSION}`);
    }
  }

  // Registry is accessible
  const registry = args.registry || run("npm config get registry");
  console.log(`target registry: ${registry}`);
  const ping = tryRun(`npm ping --registry ${registry}`);
  if (!ping.ok) failures.push(`registry ${registry} unreachable: ${ping.stderr}`);

  // npm whoami is authenticated (skip for dry-run)
  if (!args.dryRun) {
    const who = tryRun(`npm whoami --registry ${registry}`);
    if (!who.ok) failures.push(`not authenticated: ${who.stderr}`);
    else console.log(`npm whoami: ${who.stdout}`);
  }

  // Target version does NOT yet exist on the registry
  for (const pkg of PACKAGES) {
    const check = tryRun(`npm view ${pkg.name}@${TARGET_VERSION} version --registry ${registry}`);
    if (check.ok && check.stdout.trim() === TARGET_VERSION) {
      failures.push(`EPUBLISHCONFLICT pre-detect: ${pkg.name}@${TARGET_VERSION} already exists on ${registry}`);
    }
  }

  // MANIFEST.json.jws exists + is not the placeholder
  const manifestJwsPath = join(SPEC_ROOT, "MANIFEST.json.jws");
  if (!existsSync(manifestJwsPath)) {
    failures.push(`MANIFEST.json.jws not found at ${manifestJwsPath}`);
  } else {
    const jws = readFileSync(manifestJwsPath, "utf8").trim();
    // Placeholder JWS has 86 zeros for the signature (see build-manifest.mjs).
    if (/^[A-Za-z0-9_-]+\.\.0{50,}$/.test(jws)) {
      failures.push(
        `MANIFEST.json.jws appears to be the placeholder (signature is all zeros). ` +
        `Sign with the real release key before running this script.`,
      );
    }
  }

  return failures;
}

function publishPackage(pkg, args) {
  const cwd = join(args.implRoot, pkg.dir);
  const registryFlag = args.registry ? `--registry ${args.registry}` : "";
  const dryFlag = args.dryRun ? "--dry-run" : "";
  const otpFlag = args.otp ? `--otp ${args.otp}` : "";
  const cmd = `pnpm publish --tag latest --no-git-checks ${registryFlag} ${dryFlag} ${otpFlag}`.trim();

  console.log(`\n=== ${pkg.name} ===`);
  console.log(`cd ${cwd}`);
  console.log(`$ ${cmd}`);

  const started = Date.now();
  const result = tryRun(cmd, { cwd, stdio: "inherit" });
  const elapsed = Date.now() - started;

  if (!result.ok) {
    console.error(`  PUBLISH FAILED (exit ${result.code}, ${elapsed}ms)`);
    return { name: pkg.name, ok: false, error: result.stderr || result.stdout, elapsed_ms: elapsed };
  }

  // Verify the version landed (skip for dry-run)
  if (!args.dryRun) {
    const registry = args.registry || run("npm config get registry");
    const check = tryRun(`npm view ${pkg.name}@${TARGET_VERSION} version --registry ${registry}`);
    if (!check.ok || check.stdout.trim() !== TARGET_VERSION) {
      return { name: pkg.name, ok: false, error: "published but not visible on registry", elapsed_ms: elapsed };
    }
  }

  console.log(`  OK (${elapsed}ms)`);
  return { name: pkg.name, ok: true, elapsed_ms: elapsed };
}

function writeReleaseLog(startedAt, args, results) {
  const log = {
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    registry: args.registry || run("npm config get registry"),
    dry_run: args.dryRun,
    target_version: TARGET_VERSION,
    packages: results,
    overall_status: results.every((r) => r.ok) ? "success" : "partial",
  };
  const logPath = join(SPEC_ROOT, "release-log.json");
  writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
  console.log(`\nrelease log: ${logPath}`);
  return log;
}

function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();

  console.log("=== Preflight ===");
  const failures = preflight(args);
  if (failures.length > 0) {
    console.error("PREFLIGHT FAILED:");
    for (const f of failures) console.error("  - " + f);
    console.error("\nDo NOT publish. Fix the prerequisites above before re-running.");
    process.exit(1);
  }
  console.log("preflight OK");

  console.log(`\n=== Publishing ${PACKAGES.length} packages${args.dryRun ? " (DRY-RUN)" : ""} ===`);
  const results = [];
  for (const pkg of PACKAGES) {
    const r = publishPackage(pkg, args);
    results.push(r);
    if (!r.ok) {
      console.error(`\nHALT after ${pkg.name} failed.`);
      writeReleaseLog(startedAt, args, results);
      console.error(`\nSee docs/m6/rollback-runbook.md Mode 1 for next steps.`);
      process.exit(1);
    }
  }

  console.log(`\n=== All ${PACKAGES.length} packages published successfully ===`);
  writeReleaseLog(startedAt, args, results);
  console.log("\nNext: docs/m6/dist-tag-strategy.md — verify latest dist-tag per package.");
  console.log("Next: gh release create v1.3.0 per repo.");
}

main();
