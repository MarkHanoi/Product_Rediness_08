#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-per-package-compile.ts
 * @description Per-package TypeScript compile gate — Phase H · C01 §5 · Task 7.2
 *
 * Verifies that every workspace package in packages/ that has its own
 * tsconfig.json compiles cleanly with `tsc --noEmit` in isolation (i.e.,
 * using only the package's own tsconfig, not the root composite project).
 *
 * This gate catches:
 *  - Missing "paths" or "references" in a package's tsconfig
 *  - Type errors that are masked at the root level by skipLibCheck or
 *    cross-package type-widening
 *  - Packages that implicitly rely on rootDir-level ambient types
 *
 * Contract: C01 §5 — all CI gates MUST pass before a PR merges.
 * Task:     46-IMPLEMENTATION-PLAN-2026-05-08.md §9 Task 7.2
 *
 * Exit codes:
 *   0 — all non-excluded packages compiled cleanly
 *   1 — one or more packages had TypeScript errors
 *   2 — MISCONFIGURED: tsc did not actually run (see §PER-PACKAGE-COMPILE-WAS-
 *       GREEN-AND-BLIND below), or too few packages were compiled to believe the
 *       result. NEVER absorbable as declared debt.
 *   3 — LEDGER VIOLATION: the exclusion list grew, went stale, or carries a row
 *       missing its reason/owner/exit-condition. See §MT-09-SKIP-LEDGER below.
 *
 * ⚠ RUNTIME (2026-08-11). This gate now spawns ~90 real `tsc --noEmit` runs and
 * takes TENS OF MINUTES on a cold cache. It used to finish in seconds — because it
 * was running nothing at all. The cost is the price of the assertion being true;
 * if that is unaffordable in a pre-merge job, the answer is to shard or cache it,
 * NOT to let a failed spawn read as a pass.
 *
 * ── §MT-09-SKIP-LEDGER (2026-08-15, S3) ─────────────────────────────────────
 *
 * The exclusion list used to be a hard-coded `SKIP_PACKAGES` Map in this file,
 * and the headline read "packages compiled: 85 · floor 40 · skipped 9". Both
 * halves were dishonest in the same way: 85 was reported as though it were the
 * population, and the 9 exclusions were an ASSERTION IN SOURCE, never a
 * measurement. The population is 93 tsconfig-bearing packages. The exclusions
 * covered command-registry, core-app-model, runtime-composer and ai-host, so the
 * true position was 35 of 93 packages not proven to compile in isolation — not
 * 26. A comparator that reports a pass must report its denominator with it.
 *
 * THREE CHANGES, none of which relax what is asserted:
 *
 *   1. The list moved to per-package-compile-skip-ledger.json, where each row
 *      carries reason, owner, exitCondition, class and since. A row missing any
 *      of the five is exit 3.
 *
 *   2. The list is SHRINK-ONLY against SKIP_CEILING, a constant in THIS file.
 *      Adding a row to the ledger alone is exit 3; a new exclusion has to raise
 *      the ceiling too. Two files, one reviewable act — that is the point.
 *
 *   3. EXCLUDED PACKAGES ARE STILL COMPILED. The ledger suppresses a package's
 *      effect on the EXIT CODE, never its measurement. An exclusion that is not
 *      measured cannot be proven stale, and an exclusion that cannot go stale is
 *      permanent by construction. A ledgered package that compiles cleanly is
 *      exit 3 (STALE) — paid debt leaves the ledger in the commit that pays it.
 *
 * ── §MT-09-AUTOSKIP-ABSORBED-A-FAILURE (2026-08-15, S3) ─────────────────────
 *
 * DELETED, and it was the worse of the two holes. This gate used to inspect the
 * error text of a package that had ALREADY FAILED, and if every error line
 * looked like a global-window.d.ts ambient miss, it printed
 *
 *     SKIP  packages/x  (auto-skip: all errors are global-window.d.ts isolation)
 *
 * and dropped the package from the failure list. A measured RED, reclassified as
 * an exclusion by the gate itself, with no ledger row and no human in the loop.
 * It was not theoretical: the 9th skip in the 2026-08-15 run was geometry-beam,
 * which appears in no skip map anywhere. It FAILED and was absorbed. That is the
 * §CONTEXT-DATA-HONESTY law broken in the same place as L-774 — "I looked and
 * found nothing" and "I looked, found something, and swallowed it" printed the
 * same line. geometry-beam now reads FAIL, which is what it always was.
 */

import { spawnSync } from 'child_process';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '..', '..');
const packagesDir = join(repoRoot, 'packages');

/**
 * §MT-09-SKIP-LEDGER — SHRINK-ONLY CEILING on the exclusion list.
 *
 * This number lives in gate SOURCE on purpose. The ledger alone cannot police
 * its own growth: anyone adding a row would also be the one deciding the row is
 * acceptable. Raising this constant is a separate, deliberate, reviewable edit
 * that says "we are shipping one more package nobody has proven compiles".
 *
 * MOVES DOWN ONLY.  8 (2026-08-15, minted from the hard-coded map — no row added).
 */
const SKIP_CEILING = 8;

const LEDGER_PATH = join(__dir, 'per-package-compile-skip-ledger.json');

interface SkipRow {
  class?: string;
  reason?: string;
  owner?: string;
  exitCondition?: string;
  since?: string;
}

const ledgerViolations: string[] = [];

function loadSkipLedger(): Map<string, SkipRow> {
  if (!existsSync(LEDGER_PATH)) {
    console.error(
      `[per-package-compile] LEDGER VIOLATION (exit 3) — ${LEDGER_PATH} is missing.`
      + `\n  The exclusion list is not optional. A gate that cannot read its own exclusions`
      + `\n  does not know its denominator, and must not report a pass.`,
    );
    process.exit(3);
  }
  const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as {
    skips?: Record<string, SkipRow>;
  };
  const rows = new Map<string, SkipRow>(Object.entries(raw.skips ?? {}));

  // RULE 4 — every row needs all five fields. An exclusion nobody owns is an
  // exclusion nobody removes.
  for (const [name, row] of rows) {
    for (const field of ['class', 'reason', 'owner', 'exitCondition', 'since'] as const) {
      const value = row[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        ledgerViolations.push(
          `row "${name}" is missing a non-empty "${field}" — an exclusion without one is undeletable by design`,
        );
      }
    }
  }

  // RULE 1 — shrink-only.
  if (rows.size > SKIP_CEILING) {
    ledgerViolations.push(
      `RATCHET EXCEEDED: ledger holds ${rows.size} rows against SKIP_CEILING ${SKIP_CEILING}. `
      + `Adding an exclusion requires raising the ceiling in gate source in the same commit.`,
    );
  }

  // RULE 5 — a row naming a package that does not exist, or that has no
  // tsconfig.json, is stale: it excludes nothing and hides that it excludes nothing.
  for (const name of rows.keys()) {
    if (!existsSync(join(packagesDir, name, 'tsconfig.json'))) {
      ledgerViolations.push(
        `STALE: row "${name}" names no packages/${name}/tsconfig.json — delete the row`,
      );
    }
  }

  return rows;
}

function reportLedgerViolationsAndExit(): never {
  console.error(
    `\n[per-package-compile] LEDGER VIOLATION (exit 3) — ${ledgerViolations.length} problem(s) `
    + `with per-package-compile-skip-ledger.json:`,
  );
  for (const v of ledgerViolations) console.error(`  • ${v}`);
  console.error(
    '\n  The exclusion list is SHRINK-ONLY. It exists so an exclusion cannot silently absorb'
    + '\n  the next package that stops compiling — which is exactly what the deleted auto-skip'
    + '\n  branch was doing to geometry-beam. See §MT-09-SKIP-LEDGER.',
  );
  process.exit(3);
}

const SKIP_PACKAGES = loadSkipLedger();

// STRUCTURAL ledger faults (missing fields, ceiling exceeded, a row naming a package
// that no longer exists) are decidable WITHOUT compiling anything — so they fail in
// seconds rather than at the end of a ~25-minute run. Only RULE 2 (a ledgered package
// that now compiles cleanly) needs the full run, and it is checked after the loop.
if (ledgerViolations.length > 0) reportLedgerViolationsAndExit();


const pkgNames = readdirSync(packagesDir).sort();

/**
 * ─── §PER-PACKAGE-COMPILE-WAS-GREEN-AND-BLIND (2026-08-11, R5/C9) ────────────
 * THIS GATE HAD NEVER COMPILED A SINGLE PACKAGE ON WINDOWS, and said PASS ~90
 * times per run while doing it. It is L-774 verbatim, surviving inside a gate:
 *
 *   spawnSync('npx', ['tsc', …])            // no shell: true
 *     → win32 cannot exec `npx.cmd` through CreateProcess
 *     → { error: ENOENT, status: null, stdout: null, stderr: null }
 *     → output === ''  ⇒  hasErrors === false  ⇒  "  PASS  packages/x"
 *
 * "tsc found no errors" and "tsc never ran" produced the identical line. That is
 * the §CONTEXT-DATA-HONESTY law broken in the worst place it can break: a gate
 * that was never on gate-debt.json, because it was never red.
 *
 * Three fixes, none of which relax what is asserted:
 *   1. shell: true on win32 — the same portable fix run-all.ts already carries.
 *   2. A SPAWN THAT DID NOT RUN IS EXIT 2, never a PASS and never an ordinary
 *      failure. `result.error` or a null status means no compiler ran.
 *   3. MIN_COMPILED_SUBJECTS — a declared floor on how many packages were
 *      actually compiled. Zero compiles must never print "✅ All checked
 *      packages compiled cleanly".
 */
const NEEDS_SHELL = process.platform === 'win32';
const MIN_COMPILED_SUBJECTS = 40;
let compiled = 0;

let anyFailed = false;
const failures: string[] = [];
/** Failures with ≥1 error in the package's OWN source — real, actionable work. */
const ownSourceFailures: string[] = [];
/** Failures with ZERO own-source errors — they fail only via a broken dependency. */
const cascadeOnlyFailures: string[] = [];
/** Ledgered exclusions that were compiled and DID fail — the expected state. */
const excludedStillFailing: string[] = [];
/** Ledgered exclusions that compiled CLEANLY — paid debt that never left the ledger. */
const excludedNowClean: string[] = [];
/** Package dirs carrying no tsconfig.json at all — outside this gate's population. */
const noTsconfig: string[] = [];
/** Every package dir that has a tsconfig.json — THE DENOMINATOR. */
const tsconfigBearing: string[] = [];

console.log('[per-package-compile] Checking per-package tsc --noEmit...\n');

for (const pkgName of pkgNames) {
  const pkgDir = join(packagesDir, pkgName);
  const tsconfig = join(pkgDir, 'tsconfig.json');

  if (!existsSync(tsconfig)) {
    console.log(`  n/a   packages/${pkgName}  (no tsconfig.json — not in population)`);
    noTsconfig.push(pkgName);
    continue;
  }
  tsconfigBearing.push(pkgName);

  // §MT-09-SKIP-LEDGER RULE 3 — a ledgered package is compiled anyway. The ledger
  // suppresses its effect on the exit code, never its measurement.
  const skipRow = SKIP_PACKAGES.get(pkgName);
  const isExcluded = skipRow !== undefined;

  const result = spawnSync(
    'npx',
    ['tsc', '--noEmit', '--skipLibCheck', '--project', 'tsconfig.json'],
    {
      cwd: pkgDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: NEEDS_SHELL,
    },
  );

  // §PER-PACKAGE-COMPILE-WAS-GREEN-AND-BLIND — the compiler must have RUN.
  if (result.error !== undefined || result.status === null) {
    console.error(
      `\n[per-package-compile] MISCONFIGURED (exit 2) — tsc did not run for packages/${pkgName}.`
      + `\n  error: ${result.error ? `${(result.error as NodeJS.ErrnoException).code ?? ''} ${result.error.message}` : 'none'} · status: ${String(result.status)}`
      + `\n  A compiler that never started produces empty output, and empty output used to read as`
      + `\n  "no errors" — this gate printed PASS for every package on win32 for its entire life.`
      + `\n  This is NOT a pass and NOT declarable debt.`,
    );
    process.exit(2);
  }
  compiled++;

  const output = (result.stdout ?? '') + (result.stderr ?? '');

  /**
   * §MT-09-NONZERO-AND-SILENT (2026-08-16, M7) — A COMPILER THAT FAILED AND SAID
   * NOTHING IS NOT A PASS.
   *
   * The predicate here used to read:
   *
   *     hasErrors = output.includes(': error TS')
   *              || (result.status !== 0 && output.trim().length > 0)
   *
   * so a `tsc` that exited NON-ZERO with EMPTY output fell through BOTH arms and
   * printed `  PASS  packages/x`. That is §PER-PACKAGE-COMPILE-WAS-GREEN-AND-BLIND
   * surviving inside the residue of its own fix: that section closed the SPAWN-level
   * case (`result.error`, `status === null` — the compiler never started) and left the
   * RUN-level case (the compiler started, failed, and emitted nothing) reading as
   * health. Same law, one layer in — "tsc found no errors" and "tsc failed and told us
   * nothing" must never print the same line.
   *
   * This is exit 2 MISCONFIGURED, not exit 1: there is no finding to fix, only a
   * measurement that did not produce one. NEVER absorbable as declared debt.
   */
  if (result.status !== 0 && output.trim().length === 0) {
    console.error(
      `\n[per-package-compile] MISCONFIGURED (exit 2) — tsc exited ${result.status} for packages/${pkgName} and produced NO output.`
      + `\n  A non-zero status with an empty stdout+stderr is a compiler that failed without`
      + `\n  reporting why. It is not "no errors": there is no measurement here at all, and the`
      + `\n  old predicate printed PASS for exactly this shape. See §MT-09-NONZERO-AND-SILENT.`
      + `\n  This is NOT a pass and NOT declarable debt.`,
    );
    process.exit(2);
  }

  // Non-zero status now implies non-empty output, so the second arm needs no length test.
  const hasErrors = output.includes(': error TS') || result.status !== 0;

  // §MT-09-AUTOSKIP-ABSORBED-A-FAILURE — the auto-skip branch that used to sit here
  // has been DELETED. It read the error text of an ALREADY-FAILED package and, if every
  // line looked like a global-window.d.ts ambient miss, reclassified the failure as a
  // skip. A gate does not get to excuse its own red. If a package genuinely warrants an
  // exclusion, that is a ledger row with an owner and an exit condition — a decision a
  // human makes once, in a reviewable commit, not one the gate makes on every run with
  // nobody watching. geometry-beam was being absorbed this way; it now reads FAIL.

  // Regex split, not '\n' — tsc emits CRLF on win32 and a bare-LF split leaves a
  // trailing \r on every line, which quietly breaks any endsWith/equality check
  // downstream. Same class of win32 defect as §PER-PACKAGE-COMPILE-WAS-GREEN-AND-BLIND.
  const errorLines = output.split(/\r?\n/).filter((l) => l.includes(': error TS'));

  /**
   * §MT-09-ISOLATION-IS-NOT-ISOLATED (2026-08-15, S3) — OWN vs FOREIGN errors.
   *
   * Every workspace package sets `"types": "./src/index.ts"` in its package.json —
   * raw TypeScript SOURCE, not built declarations. So compiling package X does not
   * compile X; it compiles X plus the ENTIRE TRANSITIVE SOURCE CLOSURE of everything
   * X imports. The consequence is that this gate's failure count has never measured
   * per-package health:
   *
   *   editor-ui       1855 errors — ZERO of them its own
   *   engine          1854 errors — ZERO of them its own
   *   geometry-beam     45 errors — ZERO of them its own
   *   geometry-column 1854 errors — ONE of them its own
   *
   * A package with no defect of its own reads FAIL because something it imports has
   * one. "26 packages fail isolated compilation" therefore measures REACHABILITY TO A
   * BROKEN DEPENDENCY, not 26 broken packages — and the dependencies doing the
   * breaking (command-registry, core-app-model, constraint-solver) are already on the
   * skip ledger. The number was counting the ledger's own contents, reflected.
   *
   * tsc reports foreign files by a path that escapes the package root, so the split is
   * decidable from the error text alone. Both halves are printed. The EXIT CODE IS
   * UNCHANGED — a cascade failure is still a failure, because a package that cannot be
   * compiled cannot be shipped in isolation either. This reports what the red MEANS;
   * it does not make any of it green.
   *
   * The structural fix is packages consuming built .d.ts (composite + references +
   * `types: ./dist/index.d.ts`) rather than each other's source — the same fix the
   * `headless` ledger row already names as its exit condition. That is an
   * architecture-wide change, not a per-package one, and it is NOT taken here.
   */
  const foreignErrorLines = errorLines.filter((l) => /^\.\.[\\/]/.test(l.trim()));
  const ownErrorCount = errorLines.length - foreignErrorLines.length;
  const foreignPkgs = [...new Set(
    foreignErrorLines
      .map((l) => /^\.\.[\\/]([^\\/]+)[\\/]/.exec(l.trim())?.[1])
      .filter((n): n is string => n !== undefined),
  )].sort();

  if (isExcluded) {
    // Measured, but not counted against the exit code. Both outcomes are reported —
    // a clean compile here is a LEDGER VIOLATION, not a quiet success.
    if (hasErrors) {
      excludedStillFailing.push(pkgName);
      console.log(
        `  EXCL  packages/${pkgName}  (ledgered: ${skipRow?.class ?? '?'} - owner ${skipRow?.owner ?? '?'})`
        + `  -- ${errorLines.length} error(s), exclusion still warranted`,
      );
    } else {
      excludedNowClean.push(pkgName);
      console.error(`  STALE packages/${pkgName}  — LEDGERED BUT COMPILES CLEANLY.`);
      console.error(
        '        Delete its row from per-package-compile-skip-ledger.json and drop'
        + ' SKIP_CEILING in the same commit.',
      );
    }
    continue;
  }

  if (hasErrors) {
    console.error(
      `  FAIL  packages/${pkgName}`
      + `  [own ${ownErrorCount} · foreign ${foreignErrorLines.length}`
      + `${foreignPkgs.length > 0 ? ` via ${foreignPkgs.join(',')}` : ''}]`,
    );
    if (ownErrorCount === 0) {
      cascadeOnlyFailures.push(pkgName);
      console.error(
        '        ⤷ CASCADE ONLY — zero errors in this package\'s own source. It fails'
        + ' because\n          it imports a package that fails. See §MT-09-ISOLATION-IS-NOT-ISOLATED.',
      );
    } else {
      ownSourceFailures.push(pkgName);
    }
    // Show OWN errors first — they are the only ones this package can act on.
    const ownFirst = [
      ...errorLines.filter((l) => !/^\.\.[\\/]/.test(l.trim())),
      ...foreignErrorLines,
    ];
    for (const line of ownFirst.slice(0, 8)) {
      console.error(`        ${line.trim()}`);
    }
    failures.push(pkgName);
    anyFailed = true;
  } else {
    console.log(`  PASS  packages/${pkgName}`);
  }
}

console.log('');
// §R5-FLOOR — how many packages did a compiler actually look at?
if (compiled < MIN_COMPILED_SUBJECTS) {
  console.error(
    `[per-package-compile] MISCONFIGURED (exit 2) — only ${compiled} package(s) were actually compiled; floor is ${MIN_COMPILED_SUBJECTS}.`
    + `\n  ${pkgNames.length} package directories exist. A run that compiles nothing must never print "all clean".`,
  );
  process.exit(2);
}
/**
 * §MT-09-DENOMINATOR — THE FIVE NUMBERS, always printed together.
 *
 * The old headline was "packages compiled: 85 · floor 40 · skipped 9". It let
 * "85 compiled" be quoted as health while 9 packages — including command-registry,
 * core-app-model, runtime-composer and ai-host — were excluded in gate source and
 * 26 more were failing. A comparator that reports a pass MUST report the population
 * it drew that pass from. All five numbers below are printed on every run, in pass
 * and in fail, so no single one of them can be lifted out and quoted alone.
 */
const excluded = excludedStillFailing.length + excludedNowClean.length;
const passing = tsconfigBearing.length - excluded - failures.length;

console.log('[per-package-compile] ── DENOMINATOR ──────────────────────────────');
console.log(`[per-package-compile]   tsconfig-bearing packages : ${tsconfigBearing.length}   (the population)`);
console.log(`[per-package-compile]   compiled (tsc actually ran): ${compiled}   · floor ${MIN_COMPILED_SUBJECTS}`);
console.log(`[per-package-compile]   excluded by ledger         : ${excluded}   · ceiling ${SKIP_CEILING}`);
console.log(`[per-package-compile]   FAILED                     : ${failures.length}`);
console.log(`[per-package-compile]     ├ own-source errors      : ${ownSourceFailures.length}   (actionable here)`);
console.log(`[per-package-compile]     └ CASCADE ONLY           : ${cascadeOnlyFailures.length}   (zero own errors — a dependency's fault)`);
console.log(`[per-package-compile]   passing in isolation       : ${passing}`);
console.log(
  `[per-package-compile]   NOT PROVEN to compile      : ${excluded + failures.length}`
  + ` of ${tsconfigBearing.length}  ← quote THIS, not "compiled".`,
);
if (noTsconfig.length > 0) {
  console.log(`[per-package-compile]   (outside population, no tsconfig.json: ${noTsconfig.length})`);
}
if (excluded > 0) {
  console.log(
    `[per-package-compile] ⚠️  ${excluded} ledgered exclusion(s), compiled but not counted: `
    + `${[...excludedStillFailing, ...excludedNowClean].join(', ')}`,
  );
}
console.log('[per-package-compile] ─────────────────────────────────────────────');

// §MT-09-SKIP-LEDGER — ledger integrity is checked AFTER the run, because RULE 2
// (a paid exclusion must leave the ledger) can only be evaluated once every ledgered
// package has actually been compiled.
if (excludedNowClean.length > 0) {
  ledgerViolations.push(
    `STALE: ${excludedNowClean.join(', ')} compile(s) cleanly but still hold a ledger row. `
    + `Paid debt leaves the ledger in the commit that pays it, or the file rots into a list `
    + `of things that are secretly fine.`,
  );
}

if (ledgerViolations.length > 0) reportLedgerViolationsAndExit();

if (anyFailed) {
  console.error(
    `[per-package-compile] ❌ ${failures.length} of ${tsconfigBearing.length} package(s) failed: ${failures.join(', ')}`,
  );
  if (ownSourceFailures.length > 0) {
    console.error(
      `[per-package-compile]    ${ownSourceFailures.length} with OWN-SOURCE errors (fixable in the package): `
      + `${ownSourceFailures.join(', ')}`,
    );
  }
  if (cascadeOnlyFailures.length > 0) {
    console.error(
      `[per-package-compile]    ${cascadeOnlyFailures.length} CASCADE-ONLY — zero own errors, red purely via a `
      + `broken dependency:\n[per-package-compile]      ${cascadeOnlyFailures.join(', ')}`,
    );
    console.error(
      '[per-package-compile]    Fixing these packages is not possible IN these packages. See'
      + '\n[per-package-compile]    §MT-09-ISOLATION-IS-NOT-ISOLATED: every workspace package sets'
      + '\n[per-package-compile]    "types": "./src/index.ts", so each compile drags in the full source'
      + '\n[per-package-compile]    closure of its dependencies. The fix is built .d.ts + project'
      + '\n[per-package-compile]    references, repo-wide.',
    );
  }
  console.error('[per-package-compile] Fix TypeScript errors above before merging.');
  process.exit(1);
}

console.log(
  `[per-package-compile] ✅ All ${passing} non-excluded package(s) compiled cleanly`
  + ` — ${excluded} still excluded by ledger, of ${tsconfigBearing.length} total.`,
);
process.exit(0);
