#!/usr/bin/env node
// tools/scripts/check-no-raf-in-pryzm2.mjs
//
// S03-T5 audit (`phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 369):
//
//   "confirm zero `requestAnimationFrame(` in `pryzm2/packages/**`
//    outside `packages/frame-scheduler/src/**`."
//
// The `pryzm/no-raf` ESLint rule already enforces this on every PR
// (S02-T9, line 301).  This script is the belt-and-braces audit that
// runs in CI alongside the lint:
//   • catches commits that bypass eslint (e.g. `--no-verify` push, or
//     a fixture that disables the rule line-by-line),
//   • is greppable from any environment without an eslint runtime,
//   • produces a single line of output naming every offending file
//     so reviewers can act in one click.
//
// Permitted call sites (allow-list):
//   • packages/frame-scheduler/src/**   — the abstraction owner.
//   • packages/legacy-shim/**           — the rAF.bad.ts fixture is
//                                          here on purpose; it is
//                                          imported nowhere.
//
// Permitted IDENTIFIER mentions (do NOT count as a "call"):
//   • A bare reference to the identifier in a comment, JSDoc, or a
//     string literal (`'requestAnimationFrame is forbidden'`).
//
// We restrict the regex to `requestAnimationFrame\s*\(` (the call form)
// to mirror the `pryzm/no-raf` lint rule and avoid false positives from
// the very many comments in `RafAdapter.ts` that reference the API by
// name.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const RAF_CALL_PATTERN = /\brequestAnimationFrame\s*\(/g;
const FILE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Path prefixes (relative to REPO_ROOT, POSIX) that are allowed to
 *  contain rAF call sites.  Mirror this list in eslint.config.js if a
 *  new package is granted the privilege. */
const ALLOWED_PREFIXES = [
  'packages/frame-scheduler/src/',
  'packages/legacy-shim/', // contains rAF.bad.ts fixture (lint-disabled there).
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.run-output',
  '.turbo',
  '.cache',
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (stat.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot > 0 && FILE_EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

function isAllowed(absPath) {
  const rel = relative(REPO_ROOT, absPath).split(sep).join('/');
  return ALLOWED_PREFIXES.some((p) => rel.startsWith(p));
}

if (!existsSync(PACKAGES_DIR)) {
  console.error('[check-no-raf-in-pryzm2] packages/ directory missing.');
  process.exit(2);
}

const offenders = [];
let totalFiles = 0;
for (const file of walk(PACKAGES_DIR)) {
  totalFiles++;
  if (isAllowed(file)) continue;
  const text = readFileSync(file, 'utf-8');
  // Reset regex state — `RAF_CALL_PATTERN` carries `g`.
  RAF_CALL_PATTERN.lastIndex = 0;
  const matches = text.match(RAF_CALL_PATTERN);
  if (matches && matches.length > 0) {
    offenders.push({
      file: relative(REPO_ROOT, file).split(sep).join('/'),
      count: matches.length,
    });
  }
}

const tag = '[check-no-raf-in-pryzm2]';
console.log(
  `${tag} scanned ${totalFiles} file(s) under packages/ ` +
    `(allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}).`,
);

if (offenders.length === 0) {
  console.log(`${tag} OK — zero rAF call sites outside the scheduler.`);
  process.exit(0);
}

console.error(`${tag} HARD-FAIL — found ${offenders.length} offending file(s):`);
for (const o of offenders) {
  console.error(`  • ${o.file}  (${o.count} call site${o.count > 1 ? 's' : ''})`);
}
console.error(
  `${tag} Fix: route through @pryzm/frame-scheduler.  See ADR-003.`,
);
process.exit(1);
