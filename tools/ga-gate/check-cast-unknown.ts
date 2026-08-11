#!/usr/bin/env tsx
/**
 * GA Gate: check-cast-unknown — the P4 blind spot, ratcheted.
 *
 * §FIX-CAST-UNKNOWN-BLINDSPOT (L-845, 2026-08-11)
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * P4 forbids `(window as any)` outside the allowlisted shim, and
 * `check-cast-count.ts` enforces exactly that SPELLING. The 2026-08-11 audit
 * named `window as unknown as X` as that gate's untested blind spot, and the
 * remediation measured it: **409 occurrences across 151 files repo-wide — the
 * production subset alone (215, tests excluded) equals the old repo-wide `as
 * any` ceiling.** A double cast through `unknown` defeats the type system just
 * as completely as `as any`; it merely takes two hops. So a green
 * check-cast-count means "no new casts in the ONE spelling checked", and P4
 * cannot be called enforced while the other spelling is unbounded.
 *
 * This session also proved WHY the spelling migrates: when the `as any` ratchet
 * bit, the cheapest illegitimate escape was the `unknown` spelling — an agent
 * was explicitly forbidden from using it for exactly that reason, and measured
 * the blind spot instead of adding to it. A ratchet on one spelling without a
 * ratchet on its escape hatch is a funnel, not a fence.
 *
 * ─── What it checks ──────────────────────────────────────────────────────────
 * Shrink-only ceiling on `window as unknown as` in PRODUCTION code (tests and
 * d.ts excluded; comments stripped — this suite has now hit prose-counting five
 * times, and this gate will not be the sixth). Baseline 215, MEASURED
 * 2026-08-11, frozen at the measured value with zero headroom.
 *
 * Exit 0 → at or under the ceiling (auto-ratchets downward).
 * Exit 2 → MISCONFIGURED — the scan could not establish its subject.
 * Exit 3 → RATCHET EXCEEDED (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7) — never
 *          absorbable as declared debt. Fix the new casts; do NOT raise this.
 *
 * The exit target is 0 via typed globals (`src/global-window.d.ts` /
 * `apps/editor/src/types/globals.d.ts`) — the same route that took `as any`
 * from 218 to 206 by GENUINE removal in one session.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFilesStripped, tallyBy } from './lib/sourceScan.js';

const LABEL = 'cast-unknown';
const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..', '..');
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/cast-unknown.json');
const NO_RATCHET = process.argv.includes('--no-ratchet');
const EXIT_RATCHET_EXCEEDED = 3;

/**
 * §L-845 baseline: 215, measured 2026-08-11 over production code (tests and
 * .d.ts excluded, comments stripped). Frozen AT the measurement — a ceiling
 * above the measurement is not a safety margin, it is a blind spot with a
 * number on it (the check-otel-spans lesson, 42 files of headroom).
 */
const FALLBACK_CEILING = 215;

function count(): number {
  const dirs = ['src', 'apps', 'packages', 'plugins'].filter((d) =>
    existsSync(resolve(REPO_ROOT, d)),
  );
  const res = scanFilesStripped({
    root: REPO_ROOT,
    dirs,
    pattern: /window\s+as\s+unknown\s+as\b/,
    // The four production trees are ~4,500 files. Below 3000 the walk is broken,
    // and a broken walk must never print "OK".
    minFiles: 3000,
    exclude: (rel) =>
      rel.endsWith('.d.ts') ||
      /\.(spec|test)\.tsx?$/.test(rel) ||
      rel.includes('/__tests__/') ||
      rel.includes('/__mocks__/') ||
      rel.includes('/__fixtures__/'),
    label: LABEL,
  });
  console.log(
    `[${LABEL}] files scanned: ${res.filesScanned} · dirs: ${dirs.join(', ')} · ` +
    `comments stripped · tests/.d.ts excluded`,
  );
  if (res.matches.length) {
    console.log('  Top files:');
    for (const [f, n] of tallyBy(res.matches, (m) => m.file).slice(0, 10)) {
      console.log(`      ${String(n).padStart(4)}  ${f}`);
    }
  }
  return res.matches.length;
}

function loadBaseline(): number {
  if (!existsSync(BASELINE_FILE)) return FALLBACK_CEILING;
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count ?? FALLBACK_CEILING;
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
          'Auto-ratcheted by tools/ga-gate/check-cast-unknown.ts (L-845). ' +
          'Shrink-only; the P4 blind-spot spelling. Target: 0 via typed globals.',
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
    console.error(`[${LABEL}] FAIL: window-as-unknown-as count = ${current} > baseline ${baseline}.`);
    console.error(`  A regression added ${current - baseline} new double-cast(s) through unknown.`);
    console.error(`  Fix: declare the shape on the typed global (src/global-window.d.ts or`);
    console.error(`  apps/editor/src/types/globals.d.ts) and read window.<name> directly.`);
    console.error(
      `  §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7): exiting 3, not 1 — a ledger entry declares ` +
      `that a gate FAILS, never that it may get WORSE. Do NOT raise this threshold.`,
    );
    return EXIT_RATCHET_EXCEEDED;
  }

  if (current < baseline) {
    if (NO_RATCHET) {
      console.log(`[${LABEL}] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
    } else {
      writeBaseline(current);
      console.log(`[${LABEL}] OK: ${current} (ratchet lowered from ${baseline}).`);
    }
  } else {
    console.log(`[${LABEL}] OK: ${current} = baseline.`);
  }
  return 0;
}

process.exit(main());
