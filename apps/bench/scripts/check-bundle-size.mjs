#!/usr/bin/env node
// Bundle-size CI gate.
//
// Two layers:
//   1. PER-PACKAGE budgets — early-warning, per `dist/` byte sizes
//      (used since S01 as a warn-only health check).
//   2. EDITOR ENTRY-CHUNK gate — bundles `apps/editor/src/index.ts`
//      with esbuild + tree-shake, gzip-measures the result, and
//      enforces the S06 exit-criteria hard limit:
//        "< 1.8 MB gzip for the `?pryzm2=1` entry chunk."
//      (`phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 665.)
//
// Flags:
//   --hard-fail    promote per-package WARN-overruns to FAIL
//   --no-entry     skip the entry-chunk gate (per-package only)
//   --entry-only   skip the per-package report

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSizeSync } from 'gzip-size';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..', '..');

// Per-package budget — promoted into ADR/contract as packages stabilise.
const BUDGETS_GZIP_KB = {
  '@pryzm/protocol':         { warn: 12, fail: 15 },  // S01 contract: < 15 KB gzip
  '@pryzm/schemas':          { warn: 30, fail: 40 },
  '@pryzm/command-bus':      { warn: 22, fail: 25 },  // S02 contract
  '@pryzm/frame-scheduler':  { warn: 15, fail: 20 },
  '@pryzm/scene-committer':  { warn: 30, fail: 40 },
  '@pryzm/renderer':         { warn: 90, fail: 120 },
};

// S06 exit-criteria gate — hard-fails ABOVE 1.8 MB gzip.
const ENTRY_BUDGET_KB = { warn: 1500, fail: 1800 };

const HARD_FAIL = process.argv.includes('--hard-fail');
const SKIP_ENTRY = process.argv.includes('--no-entry');
const ENTRY_ONLY = process.argv.includes('--entry-only');

let warned = 0;
let failed = 0;

if (!ENTRY_ONLY) {
  perPackageReport();
}
if (!SKIP_ENTRY) {
  await entryChunkGate();
}

console.log(`[bundle-size] summary — ${warned} warn(s), ${failed} fail(s) (hard-fail=${HARD_FAIL}).`);
process.exit(failed > 0 ? 1 : 0);

// ────────────────────────────────────────────────────────────────────────────
// Per-package report
// ────────────────────────────────────────────────────────────────────────────

function perPackageReport() {
for (const [name, budget] of Object.entries(BUDGETS_GZIP_KB)) {
  const pkgDir = findPackageDir(name);
  if (!pkgDir) {
    console.log(`[bundle-size] ${name.padEnd(28)} — not built yet (skipped).`);
    continue;
  }
  const distDir = join(pkgDir, 'dist');
  if (!existsSync(distDir)) {
    console.log(`[bundle-size] ${name.padEnd(28)} — no dist/ (run \`npm run build\`).`);
    continue;
  }
  const totalGzip = gzippedTotal(distDir);
  const kb = +(totalGzip / 1024).toFixed(2);
  const tag = name.padEnd(28);

  if (kb > budget.fail) {
    const lvl = HARD_FAIL ? 'HARD-FAIL' : 'WARN (would-fail)';
    console[HARD_FAIL ? 'error' : 'warn'](
      `[bundle-size] ${tag} ${lvl} — ${kb} KB gzip exceeds budget ${budget.fail} KB.`,
    );
    if (HARD_FAIL) failed++; else warned++;
  } else if (kb > budget.warn) {
    console.warn(`[bundle-size] ${tag} WARN — ${kb} KB gzip exceeds warn ${budget.warn} KB.`);
    warned++;
  } else {
    console.log(`[bundle-size] ${tag} OK — ${kb} KB gzip (warn=${budget.warn}, fail=${budget.fail}).`);
  }
}

}

// ────────────────────────────────────────────────────────────────────────────
// Editor entry-chunk gate (S06 hard-fail)
// ────────────────────────────────────────────────────────────────────────────

async function entryChunkGate() {
  const entry = join(REPO, 'apps', 'editor', 'src', 'index.ts');
  if (!existsSync(entry)) {
    console.warn(`[bundle-size] entry-chunk SKIP — entry missing: ${entry}`);
    return;
  }

  let esbuild;
  try {
    esbuild = (await import('esbuild')).default ?? (await import('esbuild'));
  } catch {
    console.warn(`[bundle-size] entry-chunk SKIP — esbuild not installed.`);
    return;
  }

  const outDir = mkdtempSync(join(tmpdir(), 'pryzm-entry-'));
  const outFile = join(outDir, 'entry.js');
  try {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      treeShaking: true,
      outfile: outFile,
      logLevel: 'silent',
      // Keep workspace `@pryzm/*` imports in the bundle (we want the
      // full PRYZM 2 entry footprint), but allow `node:*` builtins to
      // be marked external — they don't ship to the browser anyway.
      external: ['node:*'],
    });
    const bytes = readFileSync(outFile);
    const gzipKb = +(gzipSizeSync(bytes) / 1024).toFixed(2);
    const tag = '?pryzm2=1 entry-chunk'.padEnd(28);
    if (gzipKb > ENTRY_BUDGET_KB.fail) {
      console.error(
        `[bundle-size] ${tag} HARD-FAIL — ${gzipKb} KB gzip exceeds budget ${ENTRY_BUDGET_KB.fail} KB.`,
      );
      failed++;
    } else if (gzipKb > ENTRY_BUDGET_KB.warn) {
      console.warn(`[bundle-size] ${tag} WARN — ${gzipKb} KB gzip exceeds warn ${ENTRY_BUDGET_KB.warn} KB.`);
      warned++;
    } else {
      console.log(`[bundle-size] ${tag} OK — ${gzipKb} KB gzip (warn=${ENTRY_BUDGET_KB.warn}, fail=${ENTRY_BUDGET_KB.fail}).`);
    }
  } catch (err) {
    console.error(`[bundle-size] entry-chunk FAIL — esbuild error: ${err.message ?? err}`);
    failed++;
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch {}
  }
}

// ────────────────────────────────────────────────────────────────────────────

function findPackageDir(name) {
  const packagesRoot = join(REPO, 'packages');
  if (!existsSync(packagesRoot)) return null;
  for (const dir of readdirSync(packagesRoot)) {
    const pkgJson = join(packagesRoot, dir, 'package.json');
    if (!existsSync(pkgJson)) continue;
    try {
      const meta = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      if (meta.name === name) return join(packagesRoot, dir);
    } catch {
      // Malformed package.json — skip and let the next workspace be inspected.
    }
  }
  return null;
}

function gzippedTotal(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += gzippedTotal(p);
    else if (entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name)) {
      const buf = readFileSync(p);
      total += gzipSizeSync(buf);
    }
  }
  return total;
}
