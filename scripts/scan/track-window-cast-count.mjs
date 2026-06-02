#!/usr/bin/env node
// track-window-cast-count.mjs
//
// Phase C ratchet — fails the build if the count of `(window as any)`
// casts in `*.ts` / `*.tsx` rises above the baseline captured in
// `eslint-baseline-window-as-any.json`.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 (Phase C
// honesty harness — companion to the per-sub-phase Playwright stubs +
// vitest-bench files).
//
// Usage:
//   node scripts/track-window-cast-count.mjs           # check
//   node scripts/track-window-cast-count.mjs --update  # rewrite baseline
//
// Exit codes:
//   0 — OK (count <= baseline)
//   1 — REGRESSION (count > baseline)
//   2 — Internal error (ripgrep missing, baseline unreadable, etc.)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE_PATH = resolve(process.cwd(), 'eslint-baseline-window-as-any.json');
const PATTERN = '(window as any)';

function countCasts() {
  // ripgrep: literal string (-F), counts per file (-c), TS+TSX globs.
  let stdout;
  try {
    stdout = execFileSync(
      'rg',
      ['-F', '-c', PATTERN, '-g', '*.ts', '-g', '*.tsx'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    // rg exits 1 when no matches found (count == 0).
    if (err.status === 1) return { occurrences: 0, files: 0 };
    if (err.code === 'ENOENT') {
      console.error('[track-window-cast-count] ripgrep (`rg`) is not installed.');
      process.exit(2);
    }
    throw err;
  }
  let occurrences = 0;
  let files = 0;
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue;
    const idx = line.lastIndexOf(':');
    if (idx < 0) continue;
    const n = Number(line.slice(idx + 1));
    if (!Number.isFinite(n) || n <= 0) continue;
    occurrences += n;
    files += 1;
  }
  return { occurrences, files };
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (err) {
    console.error(`[track-window-cast-count] cannot read baseline at ${BASELINE_PATH}:`, err.message);
    process.exit(2);
  }
}

const baseline = readBaseline();
const current = countCasts();
const update = process.argv.includes('--update');

if (update) {
  baseline.totals = current;
  baseline.capturedAt = new Date().toISOString();
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`[track-window-cast-count] baseline updated → occurrences=${current.occurrences} files=${current.files}`);
  process.exit(0);
}

const { occurrences: baseOcc } = baseline.totals;
const { occurrences: curOcc, files: curFiles } = current;
const delta = curOcc - baseOcc;

console.log(`[track-window-cast-count] baseline=${baseOcc}  current=${curOcc}  Δ=${delta >= 0 ? '+' : ''}${delta}  files=${curFiles}`);

if (delta > 0) {
  console.error('');
  console.error(`[track-window-cast-count] REGRESSION — ${delta} new \`(window as any)\` cast(s) introduced.`);
  console.error('  • Reach the engine through `runtime.<slot>` instead (see PRYZM2-WIREUP-PLAN-S72 §3.2).');
  console.error('  • If the new cast is unavoidable (e.g. legacy bridge during a migration), update the baseline');
  console.error('    with `node scripts/track-window-cast-count.mjs --update` and document the rationale in the PR.');
  process.exit(1);
}

if (delta < 0) {
  console.log(`[track-window-cast-count] OK — dropped ${-delta} cast site(s) since baseline.`);
} else {
  console.log('[track-window-cast-count] OK — no change.');
}
process.exit(0);
