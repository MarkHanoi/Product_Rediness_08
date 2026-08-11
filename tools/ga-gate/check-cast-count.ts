#!/usr/bin/env tsx
/**
 * Wave 1 task 2 — `(window as any)` cast-count tripwire (monotonic ratchet).
 *
 * Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/02-WAVE-1-TRIPWIRES.md §3
 * Anchor: docs/01-strategy/STR-03-engineering-vision.md (P4 — No `(window as any)`);
 *         docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/09-WAVE-5-CAST-DELETION.md
 *
 * Hard-fail if reach count across src/ rises above the baseline.
 * Auto-ratchets the baseline DOWN when count drops (one-way ratchet).
 * Baseline file: .ga-gate/baselines/cast-count.json
 *
 * --no-ratchet  : do not auto-lower the baseline on a drop (CI mode).
 */
// ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-09 ─────────────────────────────
// This gate used to run `rg -c … | awk -F: '{s+=$2}'` through execSync. TWO
// failures stacked:
//   • `rg` is not a declared dependency and CI never installed it, so the gate
//     died with `Error: spawnSync rg ENOENT` and P4 was enforced by nothing.
//   • `awk` does not exist outside a POSIX shell, so even WITH ripgrep the
//     pipeline returned garbage on win32.
// Because the gate was also listed in `gate-debt.json`, the crash was absorbed as
// "known failing" — MISSING PREREQUISITE and REGRESSION looked identical.
// Rewritten on `lib/sourceScan.ts`: Node only, no external binaries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFiles, scanFilesStripped, tallyBy } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/cast-count.json');
const NO_RATCHET = process.argv.includes('--no-ratchet');
const LABEL = 'cast-tripwire';

/**
 * `(window as any)` occurrences.
 *
 * Scan targets:
 *   src/                     — root SPA shell (Wave 7 target: 0). Measures 0 today.
 *   apps/editor/src/engine/  — WIDENED 2026-08-09 from the single file
 *     `window-shim.ts` to the whole engine directory. The shim is cast-free since
 *     OI-024, but its NEIGHBOURS are not: the widening surfaced 20 casts the
 *     one-file scope could never see. Declared here rather than quietly folded in.
 *
 * See MAX_REPO_WIDE below for the second, wider counter — the strict scope alone
 * covers a fraction of what P4 actually claims.
 */
function count(): number {
  const dirs = ['src', 'apps/editor/src/engine'].filter((d) => existsSync(resolve(REPO_ROOT, d)));
  // §FIX-CAST-STRICT-COUNTS-PROSE (L-844, 2026-08-11) — scanFilesStripped, not
  // scanFiles. The strict arm was counting COMMENTS: of the 20 matches it read
  // against a baseline of 0, SIXTEEN were prose — and almost every one was a
  // comment ASSERTING P4 COMPLIANCE, e.g. postFxRouting.ts:37:
  //     "P4 — no `(window as any)`; all deps arrive as narrow typed interfaces."
  // A gate that fails on documentation of the rule it enforces teaches people to
  // delete the documentation — the exact inversion of what a gate is for. Same
  // precision fix as check-no-commandmanager's codeLines/mentionLines split, and
  // the same one check-raf-count needed when 4 of its 5 "owners" were comments.
  // The pattern is unchanged; only prose stops counting.
  const res = scanFilesStripped({
    root: REPO_ROOT,
    dirs,
    pattern: /\(\s*window\s+as\s+any\s*\)/,
    // src/ + apps/editor/src/engine is ~250 files. Below 100 the scan is broken,
    // and a broken scan must not be able to print "OK: 0".
    minFiles: 100,
    exclude: (rel) => rel.endsWith('.d.ts'),
    label: LABEL,
  });
  console.log(`[${LABEL}] files scanned: ${res.filesScanned} · dirs: ${dirs.join(', ')}`);
  if (res.matches.length) {
    console.log('  By file:');
    for (const [f, n] of tallyBy(res.matches, (m) => m.file)) console.log(`      ${String(n).padStart(4)}  ${f}`);
  }
  return res.matches.length;
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

/**
 * §FIX-P4-SCOPE-DRIFT (L-811b, 2026-08-09) — the SECOND counter, repo-wide.
 *
 * P4 as written in C01 §1 says `(window as any)` is "forbidden EVERYWHERE except
 * the allowlisted shim". The strict counter above scans `src/` plus the editor
 * engine — which was the whole client when the gate was written in Wave 1. It no
 * longer is. The client moved into `apps/editor`, `packages/*` and `plugins/*`,
 * and the gate's scope did not follow it: **`src/` today contains ZERO casts, so
 * the original gate would have printed "OK: 0" while 215 casts sat outside its
 * field of view.**
 *
 * That is coverage drift, and it is the quiet twin of the ripgrep bug — one gate
 * crashed loudly, this one would have passed loudly, and both told you nothing.
 * So the real scope is now measured and ratcheted too.
 *
 * ⚠ SHRINK-ONLY. Frozen 2026-08-09 at the first honest measurement: **215**
 * production sites (tests and fixtures excluded; they add a further 176; this
 * gate file itself is excluded, or its own prose would move the number).
 *
 *      65  apps/editor              40  packages/room-topology
 *      21  packages/core-app-model  20  apps/component-editor
 *      18  packages/runtime-composer 14  packages/ai-host
 *      11  packages/input-host
 *       … and a 24-package tail of 1–4 apiece
 *
 * This is NOT a raised baseline. The strict counter's ceiling is untouched at 0.
 * This is a new, wider counter frozen at what it actually found on its first run.
 */
const MAX_REPO_WIDE = Number(process.env.PRYZM_P4_MAX_REPO_WIDE ?? 215);

function countRepoWide(): number {
  const dirs = ['src', 'apps', 'packages', 'plugins', 'server', 'tools']
    .filter((d) => existsSync(resolve(REPO_ROOT, d)));
  const res = scanFiles({
    root: REPO_ROOT,
    dirs,
    pattern: /\(\s*window\s+as\s+any\s*\)/,
    minFiles: 3000,
    exclude: (rel) =>
      rel.endsWith('.d.ts')
      || /(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel)
      || /\.(spec|test)\.tsx?$/.test(rel)
      // This gate file — the pattern literal and the prose both live here. Without
      // this the gate counts itself, and every edit to its own comments moves the
      // number it is supposed to be measuring.
      || rel === 'tools/ga-gate/check-cast-count.ts',
    label: `${LABEL}/repo-wide`,
  });
  console.log(`[${LABEL}] repo-wide scope: ${res.filesScanned} files · ${res.matches.length}/${MAX_REPO_WIDE} cast(s) (tests excluded)`);
  if (res.matches.length > MAX_REPO_WIDE) {
    console.error(`\n  Repo-wide casts by package:`);
    for (const [k, n] of tallyBy(res.matches, (m) => m.file.split('/').slice(0, 2).join('/'))) {
      console.error(`      ${String(n).padStart(4)}  ${k}`);
    }
  }
  return res.matches.length;
}

/**
 * §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836, 2026-08-11)
 *
 * ─── The hole this closes ────────────────────────────────────────────────────
 * This gate is on `gate-debt.json`. `run-all.ts` treats ANY non-zero exit from a
 * ledgered gate as 🟡 KNOWN-DEBT and keeps going. So once a gate is ledgered, it
 * is licensed not merely to FAIL but to GET WORSE — and nobody sees it, because
 * "declared debt" and "declared debt, now worse" print identically.
 *
 * That is exactly what happened: the repo-wide `(window as any)` count went
 * 215 → 217 while sitting on this ledger, and no run ever said so. A shrink-only
 * ratchet that can be exceeded without a signal is not a ratchet.
 *
 * ─── Why a distinct exit code, and not just louder text ─────────────────────
 * The ledger is keyed on the gate NAME, so run-all cannot distinguish "failing at
 * its declared level" from "failing worse" by name alone — only the gate knows
 * its own baseline. So the gate must SAY which of the two it is, and the only
 * channel run-all reads is the exit code.
 *
 * This mirrors §MISCONFIG-IS-NEVER-DEBT exactly: exit 2 already means "could not
 * evaluate", is already never absorbable, and exists for the same reason — a
 * distinct FACT deserves a distinct code rather than being aliased onto 1.
 *
 *   exit 0 — clean, or at/below baseline
 *   exit 1 — failed at its DECLARED level (absorbable as ledgered debt)
 *   exit 2 — MISCONFIGURED, could not evaluate (never absorbable)
 *   exit 3 — a SHRINK-ONLY RATCHET WAS EXCEEDED (never absorbable)  ← new
 *
 * The correct response to a 3 is to remove the new casts. It is NOT to raise the
 * threshold: doing so converts a measurement into a permission, which is the
 * failure this whole file exists to prevent.
 */
export const EXIT_RATCHET_EXCEEDED = 3;

const RATCHET_EXCEEDED_NOTE =
  '§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7): exiting 3, not 1 — being on gate-debt.json '
  + 'declares that this gate FAILS, never that it may get WORSE. Fix the new casts; '
  + 'do NOT raise the threshold.';

function main(): number {
  const current = count();
  const baseline = loadBaseline();
  const repoWide = countRepoWide();

  if (repoWide > MAX_REPO_WIDE) {
    console.error(`\n[${LABEL}] FAIL (repo-wide): ${repoWide} (window as any) cast(s) > baseline ${MAX_REPO_WIDE}.`);
    console.error(`  P4 forbids the cast everywhere but the allowlisted shim. Use runtime.<service>,`);
    console.error(`  or a typed global declaration. Do NOT raise this threshold — it is shrink-only.`);
    console.error(`  ${RATCHET_EXCEEDED_NOTE}`);
    return EXIT_RATCHET_EXCEEDED;
  }

  if (current > baseline) {
    console.error(`[cast-tripwire] FAIL: (window as any) count = ${current} > baseline ${baseline}.`);
    console.error(`  A regression added ${current - baseline} new cast(s).`);
    console.error(`  Read: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/09-WAVE-5-CAST-DELETION.md §3`);
    console.error(`  To fix: replace (window as any).<service> with runtime.<service>;`);
    console.error(`          if genuinely a browser global, allowlist in src/engine/subsystems/legacy/window-shim.ts.`);
    console.error(`  ${RATCHET_EXCEEDED_NOTE}`);
    return EXIT_RATCHET_EXCEEDED;
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
