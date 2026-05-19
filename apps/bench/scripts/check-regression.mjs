#!/usr/bin/env node
// Diff `.run-output/*.json` against `baseline.json` and emit warn / fail per
// bench.  S01: every gate is **warn-only** (exit 0 even on miss).  Per-sprint
// exit criteria flip individual gates to hard-fail by setting
// `hardFail: true` in the baseline entry.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RUN_OUTPUT = join(ROOT, '.run-output');
const BASELINE = join(ROOT, 'baseline.json');

const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
const benches = baseline.benches ?? {};

if (!existsSync(RUN_OUTPUT)) {
  console.warn('[bench] no .run-output/ — nothing to check.');
  process.exit(0);
}

let failed = 0;
let warned = 0;
let skipped = 0;
const allFiles = readdirSync(RUN_OUTPUT)
  .filter(f => f.endsWith('.json'))
  .map(f => ({ file: f, json: JSON.parse(readFileSync(join(RUN_OUTPUT, f), 'utf-8')) }));

// `.run-output/` may also contain ad-hoc reports (e.g. `codec-spike-bytes.json`
// emitted by `codec-spike.bench.ts` to feed ADR-004) that are NOT bench
// timings — they have no `name`/`p95` shape.  Skip them with a noted line so
// the script doesn't crash on `undefined.padEnd`.
const samples = [];
for (const { file, json } of allFiles) {
  if (typeof json.name === 'string' && typeof json.p95 === 'number') {
    samples.push(json);
  } else {
    console.log(`[bench] skipped non-timing report: ${file}`);
    skipped++;
  }
}

for (const sample of samples) {
  const base = benches[sample.name];
  const tag = sample.name.padEnd(40);
  const p95 = sample.p95;

  if (!base) {
    console.log(`[bench] ${tag} new bench — p95=${p95}ms (no baseline yet).`);
    continue;
  }

  if (p95 > base.budgetMs) {
    if (base.hardFail) {
      console.error(`[bench] ${tag} HARD-FAIL — p95=${p95}ms exceeds budget=${base.budgetMs}ms.`);
      failed++;
    } else {
      console.warn(`[bench] ${tag} WARN (would-fail) — p95=${p95}ms exceeds budget=${base.budgetMs}ms.`);
      warned++;
    }
  } else if (p95 > base.warnMs) {
    console.warn(`[bench] ${tag} WARN — p95=${p95}ms exceeds warn=${base.warnMs}ms.`);
    warned++;
  } else {
    console.log(`[bench] ${tag} OK — p95=${p95}ms (warn=${base.warnMs}ms, budget=${base.budgetMs}ms).`);
  }
}

console.log(
  `[bench] summary — ${samples.length} bench(es), ${warned} warn(s), ${failed} fail(s)` +
    (skipped > 0 ? `, ${skipped} non-timing report(s) skipped` : '') +
    '.',
);
process.exit(failed > 0 ? 1 : 0);
