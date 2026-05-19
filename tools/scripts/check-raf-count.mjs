#!/usr/bin/env node
// tools/scripts/check-raf-count.mjs
//
// Snapshot-diff CI gate for `requestAnimationFrame` call sites in the
// PRYZM-1 legacy `src/` tree (R1A-15).
//
// Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T9` (line 301) the
// `pryzm/no-raf` ESLint rule has TWO modes:
//   • HARD-FAIL on any rAF call outside `packages/frame-scheduler/`.
//   • WARN-ONLY in `src/` (PRYZM 1) so existing call sites are surfaced
//     in editors but don't block CI.
//
// The actual hard-fail mechanism in CI is THIS script — a snapshot diff
// of the count of rAF call sites in `src/`.  S02 exit criterion (line 342):
//
//   "rAF count in `src/` did not change (snapshot diff)."
//
// Behaviour:
//   • Walks `src/**/*.{ts,tsx,js,jsx}` and counts every `requestAnimationFrame(`
//     occurrence (a regex match — fast, no AST needed).
//   • Compares against `tools/scripts/raf-count.baseline.json`.
//   • Exits 0 if count is `<= baseline.maxAllowed`.
//   • Exits 1 if count > baseline.maxAllowed (NEW rAF site introduced).
//   • Always prints a one-line summary.
//
// To intentionally REDUCE the count (e.g. when a PRYZM-1 module is ported
// to PRYZM 2 and its rAF site is replaced by a `scheduler.requestFrame`
// call), update `tools/scripts/raf-count.baseline.json` so the new lower
// number sticks.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const BASELINE_FILE = join(__dirname, 'raf-count.baseline.json');

const RAF_PATTERN = /\brequestAnimationFrame\s*\(/g;
const FILE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules / build artefacts inside src/ if any sneak in.
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walk(full);
    } else if (stat.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot > 0 && FILE_EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

function countRafSites(dir) {
  if (!existsSync(dir)) return { files: 0, sites: 0 };
  let files = 0;
  let sites = 0;
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf-8');
    const matches = text.match(RAF_PATTERN);
    if (matches && matches.length > 0) {
      files++;
      sites += matches.length;
    }
  }
  return { files, sites };
}

if (!existsSync(BASELINE_FILE)) {
  console.error(`[check-raf-count] missing baseline: ${BASELINE_FILE}`);
  console.error(`[check-raf-count] run with --write to seed it (CI does NOT do this).`);
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const { files, sites } = countRafSites(SRC_DIR);

const tag = '[check-raf-count]';
console.log(
  `${tag} src/ rAF inventory — files=${files}, sites=${sites} ` +
    `(baseline.maxAllowed=${baseline.maxAllowed}, recorded=${baseline.recordedSites}).`,
);

if (sites > baseline.maxAllowed) {
  console.error(
    `${tag} HARD-FAIL — rAF call site count in src/ went UP ` +
      `(${sites} > ${baseline.maxAllowed}).  Either:\n` +
      `  • Route the new code through @pryzm/frame-scheduler.requestFrame, OR\n` +
      `  • If you intentionally added a PRYZM-1-only call site, bump ` +
      `tools/scripts/raf-count.baseline.json.maxAllowed and explain in the PR.`,
  );
  process.exit(1);
}

if (sites < baseline.recordedSites) {
  console.log(
    `${tag} OK — and the count went DOWN (${sites} < recorded=${baseline.recordedSites}). ` +
      `Consider lowering tools/scripts/raf-count.baseline.json.maxAllowed to lock in the win.`,
  );
} else {
  console.log(`${tag} OK — within budget.`);
}
process.exit(0);
