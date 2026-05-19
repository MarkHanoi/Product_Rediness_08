#!/usr/bin/env node
/**
 * scripts/check-package-types.mjs — Sprint F-2.6 per-package compile gate.
 *
 * Typechecks each @pryzm/* contracts package in isolation (i.e. only the
 * package's own `src/` files are compiled, not the whole monorepo).
 *
 * Usage:
 *   node scripts/check-package-types.mjs          # check all
 *   node scripts/check-package-types.mjs engine   # check one by pkg dir name
 *
 * Exit code: 0 = all clean, 1 = at least one failure.
 *
 * Why this script?
 *   The root `tsc --skipLibCheck` checks the whole app bundle but does NOT
 *   verify that individual packages are self-contained contracts.  This script
 *   runs `tsc -p tsconfig.json --noEmit` inside each package directory so that
 *   dependency resolution errors or missing type declarations inside a package
 *   surface immediately at CI time instead of being silently masked.
 *
 * Sprint: F-2.6 (2026-05-15)
 * Roadmap: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Packages to check ────────────────────────────────────────────────────────
// Add new contracts packages here as they are created.
const ALL_PACKAGES = [
  'packages/editor-ui',
  'packages/engine',
  'packages/views',
];

// ── CLI filter ────────────────────────────────────────────────────────────────
const filter = process.argv[2];
const PACKAGES = filter
  ? ALL_PACKAGES.filter(p => p.includes(filter))
  : ALL_PACKAGES;

if (PACKAGES.length === 0) {
  console.error(`No packages matched filter: ${filter}`);
  console.error(`Available: ${ALL_PACKAGES.join(', ')}`);
  process.exit(1);
}

// ── Resolve tsc binary ───────────────────────────────────────────────────────
const TSC = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

// ── Run checks ───────────────────────────────────────────────────────────────
const SEP = '─'.repeat(78);
let passed = 0;
let failed = 0;

console.log(`\n${SEP}`);
console.log('Sprint F-2.6 — Per-package compile gate');
console.log(`${SEP}\n`);

for (const relPath of PACKAGES) {
  const pkgDir = resolve(ROOT, relPath);
  let pkgName = relPath;
  try {
    const meta = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    pkgName = meta.name ?? relPath;
  } catch { /* ignore */ }

  try {
    execFileSync('node', [TSC, '-p', 'tsconfig.json', '--noEmit'], {
      cwd: pkgDir,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    console.log(`  ✓  ${pkgName}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${pkgName}`);
    const out = /** @type {any} */ (err).stdout ?? '';
    const errOut = /** @type {any} */ (err).stderr ?? '';
    if (out) process.stderr.write(out);
    if (errOut) process.stderr.write(errOut);
    failed++;
  }
}

console.log(`\n${SEP}`);
const status = failed === 0 ? '✓ ALL PASSED' : `✗ ${failed} FAILED`;
console.log(`${status}  (${passed} passed, ${failed} failed)`);
console.log(`${SEP}\n`);

process.exit(failed > 0 ? 1 : 0);
