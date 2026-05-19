#!/usr/bin/env node
// Promote the latest `.run-output/*.json` samples into `baseline.json`.
// Used by the human (Founder) after an intentional perf change is accepted.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RUN_OUTPUT = join(ROOT, '.run-output');
const BASELINE = join(ROOT, 'baseline.json');

if (!existsSync(RUN_OUTPUT)) {
  console.error(`[bench] no .run-output/ — run \`npm run bench --workspace=@pryzm/bench\` first.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
baseline.generatedAt = new Date().toISOString();
baseline.benches = baseline.benches ?? {};

const files = readdirSync(RUN_OUTPUT).filter(f => f.endsWith('.json'));
for (const f of files) {
  const sample = JSON.parse(readFileSync(join(RUN_OUTPUT, f), 'utf-8'));
  baseline.benches[sample.name] = {
    p50: sample.p50,
    p95: sample.p95,
    p99: sample.p99,
    samples: sample.samples,
    warnMs: sample.warnMs,
    budgetMs: sample.budgetMs,
  };
}

writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
console.log(`[bench] wrote ${files.length} bench(es) to baseline.json`);
