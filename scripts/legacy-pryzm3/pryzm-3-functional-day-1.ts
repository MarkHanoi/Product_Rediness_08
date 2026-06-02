#!/usr/bin/env tsx
/**
 * Wave 15 Task 1 — `pnpm pryzm-3-functional-day-1` verifier.
 *
 * Single command that aggregates every structural, plugin, TypeScript,
 * and NFT spot-check that must be green for the Wave-15 "functional
 * day-1" gate to pass.
 *
 * Spec:        docs/archive/pryzm3-internal/04-PLAN-FORWARD/18-WAVES-13-15-ZERO-WASTE.md §3
 * Anchored to: 01-VISION.md §5 (17 NFTs)
 *              02-ARCHITECTURE.md §8 (convergence booleans)
 *              00-PROCESS-TRACKER.md §3 (day-1 ladder rung 2)
 *              12-DISCIPLINE-AND-DOD.md §1 Rule 3 (no vacuous assertions;
 *                all checks test production paths, not type contracts)
 *
 * Usage:
 *   pnpm pryzm-3-functional-day-1                 # fast structural checks
 *   pnpm pryzm-3-functional-day-1 --with-tests    # + test-count (slow ≈ 5 min)
 *
 * Exit:  0 = ALL enabled checks PASSED  → Wave 15 gate GREEN
 *        1 = one or more checks FAILED  → gate RED
 *
 * ── Wave-14 co-development note ──────────────────────────────────────────────
 * Wave 14 (god-file split + 150 panel wiring in src/ui/) is in progress
 * simultaneously.  This script has NO merge-conflict risk with Wave 14 because:
 *   • It lives in scripts/ — Wave 14 only touches src/ui/.
 *   • It is read-only: it never modifies source files.
 *   • All checks that WILL depend on Wave 14 (setRuntime removal) are
 *     verified by Wave 14's own exit gate (check-cast-count.ts) and are
 *     not re-tested here; Wave 15 inherits those booleans as pre-conditions.
 * The structural checks below are verifiable independently of Wave 14 status.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
//                         Configuration
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const WITH_TESTS = process.argv.includes('--with-tests');

/**
 * The 5 NFT bench files spot-checked (out of 17 total).
 * Selected to cover: cold-boot, I/O (IFC), protocol (BCF), interactivity
 * (tool-latency), and real-file measurement (bundle-size).
 * Spec: 18-WAVES-13-15-ZERO-WASTE.md §3, anchored to 01-VISION.md §5.
 */
const NFT_SPOT_FILES = [
  'cold-boot.bench.ts',          // NFT-1  Cold-boot to first paint    < 2.5 s
  'tool-latency.bench.ts',       // NFT-3  Tool latency                < 50 ms p95
  'crdt-merge.bench.ts',         // NFT-7  CRDT merge (2 users)        < 80 ms p95
  'ifc-import-tier1.bench.ts',   // NFT-9  IFC import Tier-1 50 MB     < 30 s
  'bundle-size.bench.ts',        // NFT-15 Bundle size                 < 4 MB gzip
] as const;

/**
 * L0–L5 package names that plugins must NOT import directly.
 * Plugins may only import from @pryzm/plugin-sdk.
 * Canonical source: 02-ARCHITECTURE.md §2 boundary lint matrix
 *                   tools/ga-gate/check-l7-boundary.ts BLOCKED_PATTERN
 */
const BLOCKED_L0_TO_L5 = [
  'command-bus', 'event-bus', 'frame-scheduler', 'renderer',
  'renderer-three', 'scene-committer', 'sync-client', 'visibility',
  'persistence-client', 'input-host', 'physics-host', 'picking',
  'render-runtime', 'runtime-undo-stack', 'view-state', 'stores',
  'runtime-composer', 'ai-host', 'ai-cost', 'protocol', 'schemas',
  'geometry-kernel', 'drawing-primitives', 'types-builtin', 'snapping',
  'spatial-index', 'constraint-solver', 'file-format', 'ui-base', 'ui',
] as const;

// ---------------------------------------------------------------------------
//                         Result type
// ---------------------------------------------------------------------------

interface CheckResult {
  readonly pass: boolean;
  readonly actual: string;
  readonly expected: string;
  readonly note?: string;
}

// ---------------------------------------------------------------------------
//                         Helpers
// ---------------------------------------------------------------------------

function sh(cmd: string, opts?: { timeout?: number }): string {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    timeout: opts?.timeout ?? 30_000,
  });
}

/** Like sh() but treats rg exit-1 (zero matches) as returning '0'. */
function shCount(cmd: string): number {
  let raw: string;
  try {
    raw = sh(cmd);
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return 0; // rg/grep exits 1 on zero matches
    throw err;
  }
  return parseInt(raw.trim() || '0', 10);
}

function countNonBlankLines(text: string): number {
  return text.split('\n').filter((l) => l.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
//                         The 9 production checks
// ---------------------------------------------------------------------------

/**
 * Check 1 — src-folders
 * Verifies that src/ contains exactly 2 directories: engine/ and ui/.
 * Waves 9-11 migrated all 35 legacy src/ sub-folders leaving exactly these two.
 * Spec: 18-WAVES-13-15-ZERO-WASTE.md §3; 00-PROCESS-TRACKER.md §1 row 5.
 */
function checkSrcFolders(): CheckResult {
  try {
    const out = sh('ls -d src/*/');
    const folders = out.trim().split('\n').filter(Boolean);
    const count = folders.length;
    const pass = count === 2
      && folders.some((f) => f.includes('engine'))
      && folders.some((f) => f.includes('ui'));
    return {
      pass,
      actual: count === 2 ? `2 (${folders.map((f) => f.replace('src/', '').replace('/', '')).join(', ')})` : String(count),
      expected: '2 (engine/, ui/)',
      note: pass ? undefined : `Found: ${folders.join(', ')}`,
    };
  } catch {
    return { pass: false, actual: 'error reading src/', expected: '2 (engine/, ui/)' };
  }
}

/**
 * Check 2 — window-any-ui
 * Counts (window as any) casts in src/ui/ TypeScript files.
 * Wave 5 (S82-WIRE) drove this to 0; it must never rise.
 * Spec: 01-VISION.md §2 P4; 02-ARCHITECTURE.md §4 P4; 00-PROCESS-TRACKER.md §1 row 2.
 */
function checkWindowAnyUi(): CheckResult {
  const count = shCount(
    `rg -c '\\(window as any\\)' src/ui/ --type ts ` +
    `| awk -F: '{s+=$2} END {print s+0}'`,
  );
  return {
    pass: count === 0,
    actual: String(count),
    expected: '0',
    note: count > 0 ? `${count} cast(s) in src/ui/ — Wave 5 must hold this at 0` : undefined,
  };
}

/**
 * Check 3 — raf-owners
 * Counts files in packages/ that own requestAnimationFrame() calls,
 * excluding: the canonical owner (frame-scheduler), test fixtures (__tests__/),
 * and lint-rule fixture files (*.bad.ts, *.good.ts).
 * Architectural invariant (P3): only packages/frame-scheduler/ may call rAF.
 * The canonical gate is tools/ga-gate/check-raf-count.ts (HARD_FAIL = 1).
 * Spec: 01-VISION.md §2 P3; 02-ARCHITECTURE.md §4 P3; 00-PROCESS-TRACKER.md §1 row 3.
 */
function checkRafOwners(): CheckResult {
  const count = shCount(
    `rg -l 'requestAnimationFrame\\(' packages/ --type ts ` +
    `-g '!**/node_modules/**' ` +
    `-g '!**/__tests__/**' ` +
    `-g '!**/*.bad.ts' ` +
    `-g '!**/*.good.ts' ` +
    `| grep -v 'frame-scheduler' | wc -l`,
  );
  return {
    pass: count === 0,
    actual: String(count),
    expected: '0',
    note: count > 0
      ? `${count} file(s) in packages/ own rAF outside frame-scheduler — violates P3`
      : 'frame-scheduler is sole rAF owner ✓',
  };
}

/**
 * Check 4 — engine-bootstrap
 * Verifies src/engine/EngineBootstrap.ts has been deleted (Wave 7 S87-WIRE).
 * Boolean #5 in 02-ARCHITECTURE.md §8.
 * Spec: 00-PROCESS-TRACKER.md §1 row 4; 00-PROCESS-TRACKER.md §2 row 5.
 */
function checkEngineBootstrap(): CheckResult {
  const path = resolve(REPO_ROOT, 'src/engine/EngineBootstrap.ts');
  const absent = !existsSync(path);
  return {
    pass: absent,
    actual: absent ? 'absent' : 'present — FILE EXISTS',
    expected: 'absent',
    note: absent
      ? 'Deleted in Wave 7 S87-WIRE ✓'
      : 'Must be deleted — see 07-WAVE-7-CLEANUP-PHASE-F.md §3',
  };
}

/**
 * Check 5 — plugin-compliance
 * Counts plugins/ TypeScript files that directly import L0–L5 packages,
 * bypassing the @pryzm/plugin-sdk facade.  Wave 12 drove this to 0.
 * Architectural invariant: L7 plugins must import ONLY from @pryzm/plugin-sdk.
 * Spec: 02-ARCHITECTURE.md §2 (L7 row); 00-PROCESS-TRACKER.md §2 row 13;
 *       17-WAVES-9-12-SRC-MIGRATION.md §4 (Wave 12 exit gate).
 */
function checkPluginCompliance(): CheckResult {
  const pattern = `from '@pryzm/(${BLOCKED_L0_TO_L5.join('|')})'`;
  const count = shCount(
    `rg -l ${JSON.stringify(pattern)} plugins/ --type ts ` +
    `-g '!**/node_modules/**' -g '!**/__tests__/**' | wc -l`,
  );
  return {
    pass: count === 0,
    actual: String(count),
    expected: '0',
    note: count > 0
      ? `${count} plugin file(s) import L0–L5 directly — must use @pryzm/plugin-sdk only`
      : 'All 46 plugins import via @pryzm/plugin-sdk only ✓',
  };
}

/**
 * Check 6 — plugin-count
 * Verifies exactly 46 plugins exist in plugins/.
 * Count established in Wave 12 and frozen: 46 is the contractual number
 * in 01-VISION.md §3 and 02-ARCHITECTURE.md §1.
 * Spec: 00-PROCESS-TRACKER.md §1 row 7.
 */
function checkPluginCount(): CheckResult {
  try {
    const out = sh('ls -d plugins/*/');
    const count = out.trim().split('\n').filter(Boolean).length;
    return {
      pass: count === 46,
      actual: String(count),
      expected: '46',
      note: count !== 46 ? `Plugin count drifted from 46 — update 00-PROCESS-TRACKER.md §1 row 7` : undefined,
    };
  } catch {
    return { pass: false, actual: 'error reading plugins/', expected: '46' };
  }
}

/**
 * Check 7 — nft-bench-spot-check
 * Spot-checks 5 of the 17 NFT bench files (01-VISION.md §5) for:
 *   (a) file existence
 *   (b) minimum 20 non-comment lines (proof of non-trivial implementation)
 * The 5 selected cover cold-boot, interactivity, CRDT, IFC I/O, and bundle size.
 * Full NFT execution is via `pnpm exec vitest run apps/bench/src/benches/`.
 * Spec: 18-WAVES-13-15-ZERO-WASTE.md §1 (Wave 13 exit gate — all 17 files).
 */
function checkNftBenchSpot(): CheckResult {
  const BENCH_DIR = resolve(REPO_ROOT, 'apps/bench/src/benches');
  const missing: string[] = [];
  const trivial: string[] = [];

  for (const f of NFT_SPOT_FILES) {
    const p = resolve(BENCH_DIR, f);
    if (!existsSync(p)) {
      missing.push(f);
      continue;
    }
    const src = readFileSync(p, 'utf8');
    const realLines = src
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    if (realLines.length < 20) {
      trivial.push(`${f} (${realLines.length} non-comment lines)`);
    }
  }

  const pass = missing.length === 0 && trivial.length === 0;
  return {
    pass,
    actual: pass
      ? `5/5 present, ≥20 non-comment lines each`
      : [
          missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
          trivial.length > 0 ? `trivial: ${trivial.join(', ')}` : '',
        ].filter(Boolean).join('; '),
    expected: '5/5 present, ≥20 non-comment lines each',
  };
}

/**
 * Check 8 — tsc-0-errors
 * Runs `tsc --skipLibCheck --noEmit` from the repo root and counts
 * non-blank output lines.  A clean compile emits 0 lines and exits 0.
 * Equivalent to the first step of `npm run build`.
 * Spec: 18-WAVES-13-15-ZERO-WASTE.md §3 check `tsc`.
 * NOTE: This check takes ~15–30 s.
 */
function checkTsc(): CheckResult {
  let output = '';
  let threw = false;
  try {
    output = execSync('tsc --skipLibCheck --noEmit 2>&1', {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      timeout: 90_000,
    });
  } catch (err: unknown) {
    threw = true;
    const e = err as { stdout?: string; stderr?: string };
    output = [e.stdout ?? '', e.stderr ?? ''].join('');
  }

  const lines = countNonBlankLines(output);
  const pass = !threw && lines === 0;

  return {
    pass,
    actual: pass ? '0 error lines' : `${lines} error lines`,
    expected: '0 error lines',
    note: !pass && output.trim()
      ? `First error: ${output.trim().split('\n')[0]}`
      : undefined,
  };
}

/**
 * Check 9 — test-count [SLOW — requires --with-tests flag]
 * Runs the full vitest suite via `pnpm exec vitest run --reporter=json`
 * and asserts numPassedTests > 1428.
 * 1428 is the test baseline after Wave 13 close (NFT benches + zero-test drive).
 * Spec: 18-WAVES-13-15-ZERO-WASTE.md §3 check `test-count`.
 * NOTE: Slow path — skipped unless --with-tests is passed.
 */
function checkTestCount(): CheckResult {
  if (!WITH_TESTS) {
    return {
      pass: true,
      actual: 'SKIPPED',
      expected: '>1428 passed',
      note: 'Run with --with-tests to execute this check',
    };
  }

  console.log('  [test-count] Running full vitest suite — this may take ~5 min …');

  let passed = 0;
  let failed = 0;
  let error = '';

  try {
    const raw = execSync(
      'pnpm exec vitest run --reporter=json 2>/dev/null',
      { encoding: 'utf8', cwd: REPO_ROOT, timeout: 600_000 },
    );
    const lastLine = raw.trim().split('\n').filter(Boolean).pop() ?? '{}';
    const result = JSON.parse(lastLine) as { numPassedTests?: number; numFailedTests?: number };
    passed = result.numPassedTests ?? 0;
    failed = result.numFailedTests ?? 0;
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    error = e.message ?? 'vitest run failed';
    const lastLine = (e.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '{}';
    try {
      const r = JSON.parse(lastLine) as { numPassedTests?: number; numFailedTests?: number };
      passed = r.numPassedTests ?? 0;
      failed = r.numFailedTests ?? 0;
    } catch {
      return { pass: false, actual: `error: ${error}`, expected: '>1428 passed' };
    }
  }

  const pass = passed > 1428 && failed === 0;
  return {
    pass,
    actual: `${passed} passed, ${failed} failed`,
    expected: '>1428 passed, 0 failed',
    note: error || undefined,
  };
}

// ---------------------------------------------------------------------------
//                         Runner + report
// ---------------------------------------------------------------------------

interface Check {
  readonly id: string;
  readonly description: string;
  readonly run: () => CheckResult;
}

const CHECKS: readonly Check[] = [
  {
    id: 'src-folders',
    description: 'src/ has exactly 2 folders: engine/ + ui/ (Waves 9–11)',
    run: checkSrcFolders,
  },
  {
    id: 'window-any-ui',
    description: '(window as any) in src/ui/ = 0 (Wave 5, P4)',
    run: checkWindowAnyUi,
  },
  {
    id: 'raf-owners',
    description: 'rAF owner files in packages/ outside frame-scheduler = 0 (Wave 7, P3)',
    run: checkRafOwners,
  },
  {
    id: 'engine-bootstrap',
    description: 'src/engine/EngineBootstrap.ts absent (Wave 7, boolean #5)',
    run: checkEngineBootstrap,
  },
  {
    id: 'plugin-compliance',
    description: 'plugins/ direct L0–L5 imports = 0 (Wave 12, L7 boundary)',
    run: checkPluginCompliance,
  },
  {
    id: 'plugin-count',
    description: 'plugins/ count = 46 (Wave 12)',
    run: checkPluginCount,
  },
  {
    id: 'nft-bench-spot-check',
    description: '5 of 17 NFT bench files present and non-trivial (Wave 13)',
    run: checkNftBenchSpot,
  },
  {
    id: 'tsc-0-errors',
    description: 'tsc --skipLibCheck --noEmit → 0 error lines',
    run: checkTsc,
  },
  {
    id: 'test-count',
    description: 'full vitest suite numPassedTests > 1428 (Wave 13 baseline)',
    run: checkTestCount,
  },
] as const;

const BANNER = '═'.repeat(62);
const DIVIDER = '─'.repeat(62);

function main(): number {
  const startMs = Date.now();

  console.log(`\n${BANNER}`);
  console.log('  PRYZM 3 — Functional Day-1 Gate Verifier  [Wave 15]');
  console.log(BANNER);
  if (!WITH_TESTS) {
    console.log('  Mode: fast structural checks (omit test-count)');
    console.log('  Add --with-tests to include the full vitest suite.');
  } else {
    console.log('  Mode: full (structural + test-count)');
  }
  console.log(`  Spec:  18-WAVES-13-15-ZERO-WASTE.md §3`);
  console.log(`  Anchor: 01-VISION.md §5 · 02-ARCHITECTURE.md §8`);
  console.log(`${DIVIDER}\n`);

  const results: Array<{ check: Check; result: CheckResult }> = [];
  let failures = 0;
  let skipped = 0;

  for (const check of CHECKS) {
    const result = check.run();

    if (result.actual === 'SKIPPED') {
      skipped++;
      const icon = '⏭ ';
      console.log(`  ${icon} ${check.id.padEnd(24)} ${result.actual}`);
    } else if (result.pass) {
      const icon = '✅';
      console.log(`  ${icon} ${check.id.padEnd(24)} ${result.actual}`);
      if (result.note) {
        console.log(`       ${''.padEnd(24)} ${result.note}`);
      }
    } else {
      failures++;
      const icon = '❌';
      console.log(`  ${icon} ${check.id.padEnd(24)} ${result.actual}  (expected: ${result.expected})`);
      if (result.note) {
        console.log(`       ${''.padEnd(24)} ↳ ${result.note}`);
      }
    }

    results.push({ check, result });
  }

  const elapsedS = ((Date.now() - startMs) / 1000).toFixed(1);
  const enabled = CHECKS.length - skipped;
  const passed = enabled - failures;

  console.log(`\n${DIVIDER}`);

  if (failures === 0) {
    console.log(`  RESULT: ${passed}/${enabled} enabled checks PASSED  ✅  (${elapsedS}s)`);
    if (skipped > 0) {
      console.log(`  NOTE:   ${skipped} check(s) skipped — run with --with-tests for full gate`);
    }
    console.log(DIVIDER);
    console.log('  Day-1 ladder rung 2 (Wave 15): READY TO DECLARE when Wave 14 closes');
    console.log('  Next: pnpm vitest run tests/integration/  (Wave 15 Task 2 — 3 tests)');
  } else {
    console.log(`  RESULT: ${failures} check(s) FAILED  ❌  (${elapsedS}s)`);
    console.log(DIVIDER);
    console.log('  ── Failed checks ─────────────────────────────────────');
    for (const { check, result } of results) {
      if (!result.pass && result.actual !== 'SKIPPED') {
        console.log(`    • ${check.id}: ${check.description}`);
        console.log(`      actual=${result.actual}  expected=${result.expected}`);
        if (result.note) console.log(`      ${result.note}`);
      }
    }
  }

  console.log(`${BANNER}\n`);

  return failures > 0 ? 1 : 0;
}

process.exit(main());
