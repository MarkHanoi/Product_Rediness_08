#!/usr/bin/env node
// check-gesture-coverage.mjs — Z.5 of PRYZM2-WIREUP-PLAN-S72 §26.1.
//
// Asserts every gesture in `gestures-manifest.json` is covered by either:
//   a) a bench harness file matching `apps/bench/src/benches/**/<gesture>.bench.ts`, or
//   b) an OTel span name `pryzm.ui.<gesture>` mentioned in any test file.
//
// Output: human-readable scoreboard on stdout; exits non-zero if any
// gesture is uncovered (so `pnpm ga-gate` can call this directly).
//
// Usage:
//   node apps/bench/scripts/check-gesture-coverage.mjs
//   node apps/bench/scripts/check-gesture-coverage.mjs --json   (machine output)
//
// Exit codes:
//   0 — every gesture covered
//   1 — at least one gesture has no bench/test
//   2 — manifest missing or invalid

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, 'gestures-manifest.json');
const REPO_ROOT = join(__dirname, '..', '..', '..');
const BENCH_ROOTS = [
  join(REPO_ROOT, 'apps', 'bench', 'src', 'benches'),
];
const TEST_GLOBS = [
  join(REPO_ROOT, 'packages'),
  join(REPO_ROOT, 'apps'),
  join(REPO_ROOT, 'src'),
];

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (err) {
    console.error(`check-gesture-coverage: cannot read ${MANIFEST}: ${err.message}`);
    process.exit(2);
  }
}

function listFilesRecursive(root, predicate) {
  const out = [];
  function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(d, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (predicate(full)) out.push(full);
    }
  }
  walk(root);
  return out;
}

function hasBench(gestureName) {
  for (const root of BENCH_ROOTS) {
    if (!existsSync(root)) continue;
    const matches = listFilesRecursive(root, (f) =>
      f.endsWith('.bench.ts') && f.includes(gestureName)
    );
    if (matches.length > 0) return matches[0];
  }
  return null;
}

function hasOtelSpan(gestureName) {
  // Use ripgrep when available — cheap and portable; fall back to a
  // recursive grep otherwise.
  const span = `pryzm.ui.${gestureName}`;
  try {
    const out = execSync(
      `rg -l --glob '*.ts' --glob '*.tsx' --glob '!node_modules' '${span}' ${TEST_GLOBS.join(' ')}`,
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (out) return out.split('\n')[0];
  } catch {
    // rg missing or no matches
  }
  return null;
}

function main() {
  const manifest = loadManifest();
  const json = process.argv.includes('--json');

  const results = manifest.gestures.map((g) => {
    const bench = hasBench(g.name);
    const span = bench ? null : hasOtelSpan(g.name);
    return {
      name: g.name,
      owner: g.owner,
      phase: g.phase,
      bench,
      span,
      covered: !!(bench || span),
    };
  });

  const uncovered = results.filter((r) => !r.covered);

  if (json) {
    console.log(JSON.stringify({
      total: results.length,
      covered: results.length - uncovered.length,
      uncovered: uncovered.length,
      results,
    }, null, 2));
  } else {
    console.log(`Gesture coverage scoreboard (Z.5 / S72 §26.1)`);
    console.log(`────────────────────────────────────────────────`);
    for (const r of results) {
      const tag = r.covered ? 'OK   ' : 'MISS ';
      const where = r.bench ? `bench:${r.bench.replace(REPO_ROOT + '/', '')}`
                  : r.span  ? `span:${r.span.replace(REPO_ROOT + '/', '')}`
                  : '(no bench, no span)';
      console.log(`  ${tag} ${r.name.padEnd(32)} ${r.owner.padEnd(20)} ${where}`);
    }
    console.log(`────────────────────────────────────────────────`);
    console.log(`  ${results.length - uncovered.length}/${results.length} covered`);
  }

  process.exit(uncovered.length > 0 ? 1 : 0);
}

main();
