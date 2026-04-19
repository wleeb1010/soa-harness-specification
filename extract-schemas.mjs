#!/usr/bin/env node
// Extract every JSON Schema block from the Core + UI MDs into standalone .json files under schemas/.
// Matches blocks by $id (required). Verifies each extracted file parses.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DL = process.env.SOA_BUNDLE_ROOT
  ?? path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DL, "schemas");
fs.mkdirSync(OUT, { recursive: true });

const SOURCES = [
  "SOA-Harness Core Specification v1.0 (Final).md",
  "SOA-Harness UI Integration Profile v1.0 (Final).md"
];

function extractBlocks(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let inJson = false;
  let buf = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!inJson && t === "```json") { inJson = true; buf = []; start = i; continue; }
    if (inJson && t === "```") {
      const content = buf.join("\n");
      const m = content.match(/"\$id":\s*"(https:\/\/soa-harness\.org\/schemas\/[^"]+)"/);
      if (m) {
        blocks.push({ id: m[1], content, startLine: start + 1, endLine: i + 1 });
      }
      inJson = false;
      buf = [];
      continue;
    }
    if (inJson) buf.push(line);
  }
  return blocks;
}

const allBlocks = [];
for (const src of SOURCES) {
  const blocks = extractBlocks(path.join(DL, src));
  for (const b of blocks) allBlocks.push({ ...b, source: src });
}

for (const b of allBlocks) {
  const name = b.id.split("/").pop();
  const out = path.join(OUT, name);
  // Validate parse
  try {
    const parsed = JSON.parse(b.content);
    fs.writeFileSync(out, JSON.stringify(parsed, null, 2) + "\n");
    console.log(`OK  ${name.padEnd(40)} ← ${b.source}:${b.startLine}-${b.endLine}`);
  } catch (err) {
    console.log(`FAIL ${name.padEnd(40)} ← ${b.source}:${b.startLine}-${b.endLine}  ${err.message}`);
  }
}

console.log(`\nExtracted ${allBlocks.length} blocks to ${OUT}`);
