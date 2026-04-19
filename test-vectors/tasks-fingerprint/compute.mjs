#!/usr/bin/env node
// Reference tasks_fingerprint computation per Core §23 novelty quota rule.
// Run: `node compute.mjs` from this directory.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = path.join(HERE, "tasks");

// Minimal JCS (RFC 8785 subset — strings/objects/arrays/integers only, which is all task.json contains).
function jcs(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("JCS: non-finite number");
    return Number.isInteger(v) ? String(v) : v.toString();
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + jcs(v[k])).join(",") + "}";
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const entries = [];
for (const name of fs.readdirSync(TASKS_DIR).sort()) {
  const taskDir = path.join(TASKS_DIR, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  if (!fs.existsSync(taskJsonPath)) continue;

  const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, "utf8"));
  const taskJsonCanonical = Buffer.from(jcs(taskJson), "utf8");

  const dockerfilePath = path.join(taskDir, "Dockerfile");
  const dockerfileBytes = fs.readFileSync(dockerfilePath);

  const entrypointPath = path.join(taskDir, "entrypoint.sh");
  const entrypointSha = fs.existsSync(entrypointPath)
    ? sha256Hex(fs.readFileSync(entrypointPath))
    : "absent";

  entries.push({
    task_id: name,
    task_json_sha256: sha256Hex(taskJsonCanonical),
    dockerfile_sha256: sha256Hex(dockerfileBytes),
    entrypoint_sha256: entrypointSha
  });
}

entries.sort((a, b) => a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : 0);

const outerCanonical = Buffer.from(jcs(entries), "utf8");
const fingerprint = "sha256:" + sha256Hex(outerCanonical);

console.log("Per-task rows:");
for (const e of entries) {
  console.log(`  ${e.task_id}:`);
  console.log(`    task_json_sha256:  ${e.task_json_sha256}`);
  console.log(`    dockerfile_sha256: ${e.dockerfile_sha256}`);
  console.log(`    entrypoint_sha256: ${e.entrypoint_sha256}`);
}
console.log(`\nCanonical outer (${outerCanonical.length} bytes):`);
console.log(`  ${outerCanonical.toString("utf8")}\n`);
console.log(`tasks_fingerprint: ${fingerprint}`);
