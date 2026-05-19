#!/usr/bin/env tsx
/**
 * Wave 1 task 2 — `(window as any)` cast-count tripwire (monotonic ratchet).
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §3
 * Anchor: docs/03_PRYZM3/01-VISION.md §2 P4;
 *         docs/03_PRYZM3/04-PLAN-FORWARD/05-WAVE-5-CAST-DELETION.md
 *
 * Hard-fail if reach count across src/ rises above the baseline.
 * Auto-ratchets the baseline DOWN when count drops (one-way ratchet).
 * Baseline file: .ga-gate/baselines/cast-count.json
 *
 * --no-ratchet  : do not auto-lower the baseline on a drop (CI mode).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/cast-count.json');
const NO_RATCHET = process.argv.includes('--no-ratchet');

function count(): number {
  // rg returns "<file>:<n>" lines; sum the n's. Empty grep → 0.
  // The explicit path args are critical: under execSync (no TTY on stdin)
  // ripgrep would otherwise read from stdin and report 0 matches.
  //
  // Scan targets:
  //   src/                                    — root SPA shell (Wave 7 target: 0)
  //   apps/editor/src/engine/window-shim.ts  — Sprint F-2.5: shim is now
  //     cast-free (OI-024 CLOSED 2026-05-15); included here so CI catches
  //     any re-introduction of (window as any) in that file.
  let out: string;
  try {
    out = execSync(
      `rg -c '\\(window as any\\)' src apps/editor/src/engine/window-shim.ts --type ts | awk -F: '{s+=$2} END {print s+0}'`,
      { encoding: 'utf8', cwd: REPO_ROOT },
    );
  } catch (err: unknown) {
    // rg exits 1 when zero matches. Treat as 0.
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return 0;
    throw err;
  }
  return parseInt(out.trim() || '0', 10);
}

function loadBaseline(): number {
  if (!existsSync(BASELINE_FILE)) return Number.MAX_SAFE_INTEGER;
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count;
}

function writeBaseline(n: number): void {
  mkdirSync(dirname(BASELINE_FILE), { recursive: true });
  writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        count: n,
        ratchedAt: new Date().toISOString(),
        comment:
          'Auto-ratcheted by tools/ga-gate/check-cast-count.ts. Wave 5 target: 670. Wave 7 target: 0.',
      },
      null,
      2,
    ) + '\n',
  );
}

function main(): number {
  const current = count();
  const baseline = loadBaseline();

  if (current > baseline) {
    console.error(`[cast-tripwire] FAIL: (window as any) count = ${current} > baseline ${baseline}.`);
    console.error(`  A regression added ${current - baseline} new cast(s).`);
    console.error(`  Read: docs/03_PRYZM3/04-PLAN-FORWARD/05-WAVE-5-CAST-DELETION.md §3`);
    console.error(`  To fix: replace (window as any).<service> with runtime.<service>;`);
    console.error(`          if genuinely a browser global, allowlist in src/engine/subsystems/legacy/window-shim.ts.`);
    return 1;
  }

  if (current < baseline) {
    if (NO_RATCHET) {
      console.log(`[cast-tripwire] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
    } else {
      writeBaseline(current);
      console.log(`[cast-tripwire] OK: ${current} (ratchet lowered from ${baseline}).`);
    }
  } else {
    console.log(`[cast-tripwire] OK: ${current} = baseline.`);
  }
  return 0;
}

process.exit(main());
