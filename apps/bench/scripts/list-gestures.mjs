#!/usr/bin/env node
// list-gestures.mjs — Z.5 of PRYZM2-WIREUP-PLAN-S72 §26.1.
//
// Enumerates the user-visible gestures the platform-shell supports.
// Source of truth: `apps/bench/scripts/gestures-manifest.json`.
//
// Output: machine-readable JSON on stdout.
//
// Usage:
//   node apps/bench/scripts/list-gestures.mjs
//   node apps/bench/scripts/list-gestures.mjs --owner ProjectHub
//   node apps/bench/scripts/list-gestures.mjs --phase C.2.02
//   node apps/bench/scripts/list-gestures.mjs --names-only
//
// Exit codes:
//   0 — listing emitted
//   1 — manifest missing or invalid

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, 'gestures-manifest.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (err) {
    console.error(`list-gestures: cannot read ${MANIFEST}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(manifest.gestures)) {
    console.error('list-gestures: manifest.gestures is not an array');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  let rows = manifest.gestures;
  if (args.owner) rows = rows.filter((g) => g.owner === args.owner);
  if (args.phase) rows = rows.filter((g) => g.phase === args.phase);

  if (args['names-only']) {
    for (const g of rows) console.log(g.name);
    return;
  }

  console.log(JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    as_of: manifest.as_of,
    count: rows.length,
    gestures: rows,
  }, null, 2));
}

main();
