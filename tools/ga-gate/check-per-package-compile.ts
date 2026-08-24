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
 *   2 — MISCONFIGURED: at least one subject produced NO MEASUREMENT (see
 *       §PPC-UNMEASURED-IS-A-CLASS below), or too few packages were measured to
 *       believe the result. NEVER absorbable as declared debt.
 *   3 — LEDGER VIOLATION: the exclusion list grew, went stale, or carries a row
 *       missing its reason/owner/exit-condition. See §MT-09-SKIP-LEDGER below.
 *
 * Exit precedence when several apply: 2 > 3 > 1 > 0. A gate that could not
 * measure part of its subject reports THAT first — but it reports the part it
 * DID measure first of all. See §PPC-REPORT-THEN-EXIT.
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── §PPC-ONE-NAMED-COMPILER (2026-08-24, lane PKGCOMPILE23 · L-10360) ───────
 *
 * ⭐ THE THIRD RECURRENCE OF §PER-PACKAGE-COMPILE-WAS-GREEN-AND-BLIND, AND THIS
 * TIME IT FABRICATED **FAILURES** INSTEAD OF PASSES.
 *
 * This gate used to launch the compiler as:
 *
 *     spawnSync('npx', ['tsc', …], { shell: NEEDS_SHELL })
 *
 * MEASURED 2026-08-24 across ALL 97 tsconfig-bearing packages, using that exact
 * invocation: in **59 of the 97**, `npx tsc` NEVER STARTED A COMPILER. It exited
 * 1 having printed a Node module-loader stack trace:
 *
 *     Error: Cannot find module 'C:\…\Product_Rediness_08\node_modules\
 *            node_modules\.pnpm\typescript@5.9.3\…\bin\tsc'   ← doubled node_modules
 *       code: 'MODULE_NOT_FOUND'
 *
 * 76 packages carry their own `node_modules/.bin/tsc` shim — pnpm writes one
 * wherever `typescript` is a direct devDependency — and npx prefers the nearest
 * shim over the root one. Those shims resolve the compiler one directory short of
 * the repo root. The compiler itself is FINE and it is ONE version: measured, all
 * 76 package-local `node_modules/typescript` symlinks and the root one resolve to
 * typescript **5.9.3**. It was never a version problem. It was a LAUNCHER problem,
 * and the launcher's failure was being counted as a compile result.
 *
 * The old predicate `hasErrors = output.includes(': error TS') || status !== 0`
 * turned every one of those loader crashes into
 *
 *     FAIL  packages/schemas  [own 0 · foreign 0]
 *
 * — for a package that in fact compiles CLEANLY (verified: exit 0, empty output,
 * running the compiler directly). "tsc reported N type errors" and "the tsc
 * launcher crashed before reaching the compiler" printed the same line. That is
 * §CONTEXT-DATA-HONESTY broken in this same gate for the third time, and the
 * headline it produced — "27 packages fail isolated compilation" — was in
 * substantial part a census of pnpm's bin shims.
 *
 * ⛔ `shell: true` was never the fix, it was the SYMPTOM's fix. THE FIX IS TO
 * STOP ASKING A SHELL TO FIND A COMPILER WHOSE PATH WE ALREADY KNOW:
 *
 *     spawn(process.execPath, [TSC_JS, …])      // no shell, no PATH, no npx
 *
 * TSC_JS is resolved once, from THIS file, via createRequire — and the resolved
 * path AND the tsc version are PRINTED IN THE HEADER OF EVERY RUN. A gate that
 * cannot name the compiler it ran cannot claim what that compiler found.
 *
 * ── §PPC-UNMEASURED-IS-A-CLASS (2026-08-24, lane PKGCOMPILE23 · L-10361) ────
 *
 * ⭐ THE BUG THIS LANE WAS OPENED FOR: THE GATE COULD NOT REPORT ITS OWN RESULT.
 *
 * §MT-09-NONZERO-AND-SILENT (2026-08-16) correctly identified that a compiler
 * which exits non-zero and says nothing is not a pass — and then handled it with
 * a bare `process.exit(2)` INSIDE THE PER-PACKAGE LOOP. So ONE unmeasurable
 * subject destroyed the other 96 measurements, and the runner printed:
 *
 *     ❌ MISCONFIGURED (exit 2, never excusable as debt): per-package-compile
 *
 * with no denominator, no failure list, and no way to tell whether the gate had
 * found 0 problems or 90. THAT IS THE DEFECT THIS GATE EXISTS TO PREVENT, one
 * level up: an unreportable gate is indistinguishable from a gate that found
 * nothing. Same shape as the runner defect where two missing JSON strings
 * silenced 130 gates and the run ended after 9 lines.
 *
 * UNMEASURED is now a per-subject OUTCOME alongside PASS and FAIL, with FOUR
 * named reasons, and the run CONTINUES past it:
 *
 *   SPAWN-FAILED    the child never started (ENOENT, EPERM, status === null)
 *   KILLED          the child died on a signal (OOM-killer, external kill)
 *   SILENT-NONZERO  non-zero exit, stdout+stderr empty — §MT-09-NONZERO-AND-SILENT
 *   LAUNCHER-CRASH  non-zero exit, output present, but NOT ONE `error TSnnnn:`
 *                   line in it — a loader/runtime crash, not a compile result.
 *                   ⭐ NEW. This is the class that was reading as FAIL.
 *
 * ⛔ NONE of these is a pass, NONE is declarable debt, and NONE is a FAIL either.
 * A fabricated failure is a lie in the same way a fabricated pass is; it just
 * costs someone a day chasing a type error that does not exist. Any UNMEASURED
 * subject still exits 2, and exit 2 still dominates every other code. What
 * changed is that the gate now says WHICH subjects, WHY, and what the other
 * ninety-odd did. See §PPC-REPORT-THEN-EXIT.
 *
 * ── §PPC-ERROR-LINE-REGEX (2026-08-24, lane PKGCOMPILE23) ───────────────────
 *
 * The error-line predicate was the substring `': error TS'`. tsc's non-pretty
 * format is `file(12,3): error TSnnnn:` — but its GLOBAL diagnostics have no file
 * prefix at all and print as `error TS18003: No inputs were found in config file
 * …`. That line does not contain `': error TS'`, so a package whose project
 * matched ZERO input files scored 0 error lines, exited non-zero, and printed
 * `FAIL … [own 0 · foreign 0]` — byte-identical to a launcher crash. The
 * predicate is now `/\berror TS\d+:/`, and `--pretty false` is passed explicitly
 * so the diagnostic format cannot depend on TTY detection or carry ANSI escapes.
 *
 * ── §PPC-AFFORDABLE-OR-UNRUN (2026-08-24, lane PKGCOMPILE23) ────────────────
 *
 * ⚠ An unaffordable gate is a silent gate by another route. This one spawned ~97
 * SEQUENTIAL compilers and was clocked at 10 subjects in 20 minutes — hours per
 * run — so in practice it was not run, and whatever it might have found was not
 * known. Two changes, neither of which shrinks the subject set:
 *
 *   1. PARALLELISM. A worker pool of PPC_CONCURRENCY (default: cpus-1, capped at
 *      4 — tsc is memory-hungry, and each subject drags in its dependencies' full
 *      SOURCE closure; see §MT-09-ISOLATION-IS-NOT-ISOLATED).
 *   2. INCREMENTAL. `--incremental --tsBuildInfoFile <cache>/<pkg>.tsbuildinfo`
 *      under node_modules/.cache/ (gitignored). TypeScript persists its
 *      diagnostics in the buildinfo and replays them, so a warm run reports the
 *      SAME errors — it does not report FEWER. Set PPC_NO_CACHE=1 to force cold.
 *
 * ⛔ THE SUBJECT SET IS NOT SAMPLED AND MUST NOT BECOME SAMPLED SILENTLY. Every
 * tsconfig-bearing package is compiled on every run, and the header says so. If a
 * future lane needs a sampled arm, the gate must PRINT that it sampled and NAME
 * what it skipped — an undeclared denominator is the defect §MT-09-DENOMINATOR
 * was written for.
 *
 * ── §PPC-REPORT-THEN-EXIT (2026-08-24, lane PKGCOMPILE23) ───────────────────
 *
 * Every exit path now goes through the same reporter. The DENOMINATOR block, the
 * failure list and the unmeasured list are printed BEFORE any exit code is
 * chosen, in pass and in fail alike. A gate is allowed to be red; it is not
 * allowed to be mute.
 */

import { spawn } from 'child_process';
import { readdirSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import { cpus } from 'os';

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
// seconds rather than at the end of a long run. Only RULE 2 (a ledgered package that
// now compiles cleanly) needs the full run, and it is checked after the loop.
if (ledgerViolations.length > 0) reportLedgerViolationsAndExit();

/**
 * §PPC-ONE-NAMED-COMPILER — resolve the compiler ONCE, by path, and name it.
 *
 * No `npx`, no PATH lookup, no shell, no pnpm .bin shim. `createRequire` against
 * this file resolves `typescript` through the workspace root's node_modules,
 * which is the same physical typescript@5.9.3 that every
 * packages/*&#47;node_modules/typescript symlink points at (measured 2026-08-24:
 * 76 of 76 identical, plus the root — so this changes WHICH LAUNCHER runs, never
 * WHICH COMPILER runs).
 */
const requireFromHere = createRequire(import.meta.url);
function resolveTscEntry(): string {
  try {
    // typescript's package exports do not surface bin/tsc, so resolve the package
    // through its main entry and walk to bin/tsc from the package root.
    const tsLib = requireFromHere.resolve('typescript');            // …/typescript/lib/typescript.js
    const candidate = join(dirname(dirname(tsLib)), 'bin', 'tsc');  // …/typescript/bin/tsc
    if (existsSync(candidate)) return candidate;
  } catch {
    /* fall through to the explicit root path below */
  }
  const fallback = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(fallback)) return fallback;
  console.error(
    '\n[per-package-compile] MISCONFIGURED (exit 2) — cannot resolve the TypeScript compiler.'
    + '\n  Neither require.resolve("typescript") nor node_modules/typescript/bin/tsc found it.'
    + '\n  A gate that cannot name the compiler it ran cannot claim what that compiler found.'
    + '\n  This is NOT a pass and NOT declarable debt. See §PPC-ONE-NAMED-COMPILER.',
  );
  process.exit(2);
}
const TSC_JS = resolveTscEntry();
const TSC_VERSION = ((): string => {
  try {
    return (JSON.parse(
      readFileSync(join(dirname(dirname(TSC_JS)), 'package.json'), 'utf8'),
    ) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

/**
 * §PPC-AFFORDABLE-OR-UNRUN — parallelism and the incremental cache.
 * Both are PRINTED on every run. Neither shrinks the subject set.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env['PPC_CONCURRENCY']) || Math.min(Math.max(cpus().length - 1, 1), 4),
);
const USE_CACHE = process.env['PPC_NO_CACHE'] !== '1';
const CACHE_DIR = join(repoRoot, 'node_modules', '.cache', 'pryzm-per-package-compile');
if (USE_CACHE) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    /* a cache we cannot create is a cache we do not use — never a measurement change */
  }
}

/**
 * §PPC-ERROR-LINE-REGEX — matches BOTH tsc diagnostic shapes:
 *   file(12,3): error TS2322: …      (file-scoped, non-pretty)
 *   error TS18003: No inputs …       (global — no file prefix at all)
 * and does NOT match a Node stack trace ("Error: Cannot find module …").
 */
const ERROR_LINE = /\berror TS\d+:/;

/** How much child output to retain per subject before declaring it truncated. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** §R5-FLOOR — a declared floor on how many packages a compiler actually reported on. */
const MIN_COMPILED_SUBJECTS = 40;

type Outcome = 'PASS' | 'FAIL' | 'EXCL-FAIL' | 'EXCL-CLEAN' | 'UNMEASURED';
type UnmeasuredReason = 'SPAWN-FAILED' | 'KILLED' | 'SILENT-NONZERO' | 'LAUNCHER-CRASH';

interface Measurement {
  pkg: string;
  excluded: boolean;
  outcome: Outcome;
  reason?: UnmeasuredReason;
  detail?: string;
  status: number | null;
  signal: string | null;
  ms: number;
  truncated: boolean;
  errorLines: string[];
  ownErrorCount: number;
  foreignErrorCount: number;
  foreignPkgs: string[];
  /** §PPC-TRANSIENT-PROCESS-CREATION — this subject needed a second attempt. */
  retried?: boolean;
  retryNote?: string;
}

/** Package dirs carrying no tsconfig.json at all — outside this gate's population. */
const noTsconfig: string[] = [];
/** Every package dir that has a tsconfig.json — THE DENOMINATOR. */
const tsconfigBearing: string[] = [];

for (const pkgName of readdirSync(packagesDir).sort()) {
  if (!existsSync(join(packagesDir, pkgName, 'tsconfig.json'))) {
    noTsconfig.push(pkgName);
    continue;
  }
  tsconfigBearing.push(pkgName);
}

/**
 * §PPC-TRANSIENT-PROCESS-CREATION (2026-08-24, lane PKGCOMPILE23 · L-10362)
 *
 * ⭐ THIS IS THE EXACT EVENT THAT PRODUCED THE `exit 2 MISCONFIGURED` THIS LANE
 * WAS OPENED FOR, and it was caught in the act on 2026-08-24:
 *
 *     ????  packages/webhooks  (  0s)  UNMEASURED · SILENT-NONZERO
 *           tsc exited 3221225794 and produced NO output
 *
 * 3221225794 = 0xC0000142 = STATUS_DLL_INIT_FAILED. Windows failed to INITIALISE
 * the child process — it never reached `main`, which is why it took 0s and said
 * nothing. It is an ENVIRONMENTAL, LOAD-DEPENDENT failure: a busy tree with
 * several agents spawning compilers exhausts the desktop heap / process-creation
 * resources and CreateProcess starts handing back 0xC0000142. It is not
 * reproducible on demand — a 97-package sweep an hour earlier hit it zero times.
 *
 * ⛔ THE OLD GATE `process.exit(2)`-ED ON THE SPOT for this, discarding 96 real
 * measurements because Windows hiccupped once on the 97th. That is the entire
 * §PPC-UNMEASURED-IS-A-CLASS thesis demonstrated by an actual event rather than
 * argued.
 *
 * ONE bounded retry, and the retry is PRINTED. Rules that keep this honest:
 *   • Only an UNMEASURED outcome is ever retried. A FAIL is never retried —
 *     retrying a red until it turns green is the defect this whole file exists
 *     to prevent.
 *   • MAX_ATTEMPTS is 2. Not "until it works".
 *   • A subject that is still UNMEASURED after its retry STAYS UNMEASURED, and
 *     the gate still exits 2. A retry buys a measurement; it never buys a pass.
 *   • Every retry appears in the report, so a tree that needs many of them is
 *     visibly a tree with a problem rather than a quietly-flaky green.
 */
const MAX_ATTEMPTS = 2;
const NT_STATUS_NAMES: Record<number, string> = {
  3221225794: '0xC0000142 STATUS_DLL_INIT_FAILED — Windows could not initialise the child process'
    + ' (desktop-heap / process-creation exhaustion under load, NOT a compile result)',
  3221225477: '0xC0000005 STATUS_ACCESS_VIOLATION — the compiler process crashed',
  3221226505: '0xC0000409 STATUS_STACK_BUFFER_OVERRUN — the compiler process aborted',
};

async function compileWithRetry(pkgName: string): Promise<Measurement> {
  let last = await compileOnce(pkgName);
  for (let attempt = 2; attempt <= MAX_ATTEMPTS && last.outcome === 'UNMEASURED'; attempt++) {
    const first = last;
    last = await compileOnce(pkgName);
    last.retried = true;
    last.retryNote = `attempt 1 was UNMEASURED (${first.reason}: ${first.detail ?? ''})`;
  }
  return last;
}

function compileOnce(pkgName: string): Promise<Measurement> {
  return new Promise((res) => {
    const pkgDir = join(packagesDir, pkgName);
    const excluded = SKIP_PACKAGES.has(pkgName);
    const started = Date.now();

    const args = [
      TSC_JS,
      '--noEmit',
      '--skipLibCheck',
      '--pretty', 'false',
      '--project', 'tsconfig.json',
    ];
    if (USE_CACHE) {
      args.push('--incremental', '--tsBuildInfoFile', join(CACHE_DIR, `${pkgName}.tsbuildinfo`));
    }

    // §PPC-ONE-NAMED-COMPILER — process.execPath + an absolute script path. No
    // shell (so no cmd.exe argument concatenation), no PATH, no npx, no .bin shim.
    const child = spawn(process.execPath, args, {
      cwd: pkgDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let truncated = false;
    let spawnErrorDetail: string | null = null;
    const absorb = (chunk: Buffer): void => {
      if (output.length >= MAX_OUTPUT_BYTES) { truncated = true; return; }
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', absorb);
    child.stderr.on('data', absorb);
    child.on('error', (e) => {
      const err = e as NodeJS.ErrnoException;
      spawnErrorDetail = `${err.code ?? ''} ${err.message}`.trim();
    });

    child.on('close', (status, signal) => {
      const ms = Date.now() - started;
      const trimmed = output.trim();
      const errorLines = output.split(/\r?\n/).filter((l) => ERROR_LINE.test(l));
      const foreign = errorLines.filter((l) => /^\.\.[\\/]/.test(l.trim()));
      const foreignPkgs = [...new Set(
        foreign
          .map((l) => /^\.\.[\\/]([^\\/]+)[\\/]/.exec(l.trim())?.[1])
          .filter((n): n is string => n !== undefined),
      )].sort();

      const base = {
        pkg: pkgName,
        excluded,
        status,
        signal,
        ms,
        truncated,
        errorLines,
        ownErrorCount: errorLines.length - foreign.length,
        foreignErrorCount: foreign.length,
        foreignPkgs,
      };

      /* ── §PPC-UNMEASURED-IS-A-CLASS — four ways to produce NO measurement ── */
      if (spawnErrorDetail !== null) {
        res({ ...base, outcome: 'UNMEASURED', reason: 'SPAWN-FAILED', detail: spawnErrorDetail });
        return;
      }
      if (signal !== null) {
        res({
          ...base, outcome: 'UNMEASURED', reason: 'KILLED',
          detail: `child died on ${signal} after ${ms}ms — OOM-killer or an external kill`,
        });
        return;
      }
      if (status === null) {
        res({
          ...base, outcome: 'UNMEASURED', reason: 'SPAWN-FAILED',
          detail: 'status === null with no error and no signal — no compiler ran',
        });
        return;
      }
      if (status !== 0 && trimmed.length === 0) {
        const named = NT_STATUS_NAMES[status];
        res({
          ...base, outcome: 'UNMEASURED', reason: 'SILENT-NONZERO',
          detail: `tsc exited ${status} and produced NO output — §MT-09-NONZERO-AND-SILENT`
            + (named === undefined ? '' : `\n        ${named}`),
        });
        return;
      }
      if (status !== 0 && errorLines.length === 0) {
        res({
          ...base, outcome: 'UNMEASURED', reason: 'LAUNCHER-CRASH',
          detail: `tsc exited ${status} with output but NOT ONE "error TSnnnn:" line`
            + ` — first line: ${trimmed.split(/\r?\n/)[0]?.slice(0, 160) ?? ''}`,
        });
        return;
      }

      /* ── a real measurement ── */
      const hasErrors = errorLines.length > 0;
      if (excluded) {
        res({ ...base, outcome: hasErrors ? 'EXCL-FAIL' : 'EXCL-CLEAN' });
        return;
      }
      res({ ...base, outcome: hasErrors ? 'FAIL' : 'PASS' });
    });
  });
}

/**
 * §PPC-ONE-WRITE-PER-SUBJECT (2026-08-24, lane PKGCOMPILE23)
 *
 * Every subject's block is assembled into ONE string and emitted with ONE write.
 * The first parallel run of this gate was redirected to a file with `> f 2>&1`
 * and came back with 58 distinct subject lines out of the 75-odd that had
 * completed: on win32 `stdout` and `stderr` are separate handles onto the same
 * file, so a report split across a dozen alternating console.log/console.error
 * calls per subject can overwrite itself. A gate whose live log is lossy is a
 * gate that cannot report, in miniature — and this one is not allowed that.
 *
 * Everything goes to STDOUT. Severity is carried by the line's own text (PASS /
 * FAIL / EXCL / STALE / UNMEASURED), which is what a reader greps for anyway;
 * it was never carried by the stream.
 */
function printLive(m: Measurement): void {
  const skipRow = SKIP_PACKAGES.get(m.pkg);
  const secs = (m.ms / 1000).toFixed(0).padStart(3);
  const out: string[] = [];
  switch (m.outcome) {
    case 'PASS':
      out.push(`  PASS  packages/${m.pkg}  (${secs}s)`);
      break;
    case 'FAIL':
      out.push(
        `  FAIL  packages/${m.pkg}  (${secs}s)`
        + `  [own ${m.ownErrorCount} · foreign ${m.foreignErrorCount}`
        + `${m.foreignPkgs.length > 0 ? ` via ${m.foreignPkgs.join(',')}` : ''}]`,
      );
      if (m.ownErrorCount === 0) {
        out.push(
          '        ⤷ CASCADE ONLY — zero errors in this package\'s own source. It fails'
          + ' because\n          it imports a package that fails. See §MT-09-ISOLATION-IS-NOT-ISOLATED.',
        );
      }
      // Show OWN errors first — they are the only ones this package can act on.
      for (const line of [
        ...m.errorLines.filter((l) => !/^\.\.[\\/]/.test(l.trim())),
        ...m.errorLines.filter((l) => /^\.\.[\\/]/.test(l.trim())),
      ].slice(0, 8)) {
        out.push(`        ${line.trim()}`);
      }
      break;
    case 'EXCL-FAIL':
      out.push(
        `  EXCL  packages/${m.pkg}  (ledgered: ${skipRow?.class ?? '?'} - owner ${skipRow?.owner ?? '?'})`
        + `  -- ${m.errorLines.length} error(s), exclusion still warranted`,
      );
      break;
    case 'EXCL-CLEAN':
      out.push(`  STALE packages/${m.pkg}  — LEDGERED BUT COMPILES CLEANLY.`);
      out.push(
        '        Delete its row from per-package-compile-skip-ledger.json and drop'
        + ' SKIP_CEILING in the same commit.',
      );
      break;
    case 'UNMEASURED':
      out.push(`  ????  packages/${m.pkg}  (${secs}s)  UNMEASURED · ${m.reason}`);
      out.push(`        ${m.detail ?? ''}`);
      break;
  }
  if (m.truncated) {
    out.push(
      `        ⚠ output truncated at ${MAX_OUTPUT_BYTES} bytes — the error count is a LOWER BOUND`,
    );
  }
  if (m.retried === true) {
    // §PPC-TRANSIENT-PROCESS-CREATION — a retry is never silent. This line is the
    // difference between "the tree is flaky" and "the gate is quietly green".
    out.push(`        ↻ RETRIED (attempt 2 of ${MAX_ATTEMPTS}) — ${m.retryNote ?? ''}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

async function runPool(): Promise<Measurement[]> {
  const queue = [...tsconfigBearing];
  const done: Measurement[] = [];
  const worker = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      const m = await compileWithRetry(next);
      printLive(m);
      done.push(m);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return done.sort((a, b) => a.pkg.localeCompare(b.pkg));
}

/**
 * §PPC-ONE-WRITE-PER-SUBJECT — the final report goes to ONE stream too.
 *
 * The DENOMINATOR block, the failure list and the UNMEASURED list must arrive
 * in that order and arrive WHOLE. Splitting them across stdout and stderr means
 * two file handles racing for one file position under redirection, and the
 * block a reader needs most is the one most likely to be clobbered.
 */
const say = (s: string): void => { process.stdout.write(`${s}\n`); };

async function main(): Promise<void> {
  say('[per-package-compile] Checking per-package tsc --noEmit...');
  say(`[per-package-compile]   compiler   : ${TSC_JS}`);
  say(
    `[per-package-compile]   tsc version: ${TSC_VERSION}`
    + '   (spawned directly — no npx, no shell, no .bin shim)',
  );
  say(`[per-package-compile]   concurrency: ${CONCURRENCY}   (PPC_CONCURRENCY to override)`);
  say(
    `[per-package-compile]   cache      : ${USE_CACHE ? `INCREMENTAL at ${CACHE_DIR}` : 'OFF (PPC_NO_CACHE=1)'}`,
  );
  say(
    `[per-package-compile]   subjects   : ${tsconfigBearing.length} tsconfig-bearing packages`
    + ' — ALL of them, NOT sampled\n',
  );

  const wall0 = Date.now();
  const results = await runPool();
  const wallMin = ((Date.now() - wall0) / 60000).toFixed(1);

  const failures = results.filter((m) => m.outcome === 'FAIL');
  const ownSourceFailures = failures.filter((m) => m.ownErrorCount > 0);
  const cascadeOnlyFailures = failures.filter((m) => m.ownErrorCount === 0);
  const excludedStillFailing = results.filter((m) => m.outcome === 'EXCL-FAIL');
  const excludedNowClean = results.filter((m) => m.outcome === 'EXCL-CLEAN');
  const unmeasured = results.filter((m) => m.outcome === 'UNMEASURED');
  const passes = results.filter((m) => m.outcome === 'PASS');
  const excluded = excludedStillFailing.length + excludedNowClean.length;
  const compiled = results.length - unmeasured.length;

  /**
   * §MT-09-DENOMINATOR — THE NUMBERS, always printed together, in pass and in fail.
   *
   * The old headline was "packages compiled: 85 · floor 40 · skipped 9". It let
   * "85 compiled" be quoted as health while 9 packages were excluded in gate source
   * and 26 more were failing. A comparator that reports a pass MUST report the
   * population it drew that pass from. UNMEASURED joined this block on 2026-08-24
   * (§PPC-UNMEASURED-IS-A-CLASS): it is the number whose absence let one blind
   * subject blind the entire gate.
   */
  say('');
  say('[per-package-compile] ── DENOMINATOR ──────────────────────────────');
  say(`[per-package-compile]   tsconfig-bearing packages : ${tsconfigBearing.length}   (the population)`);
  say(`[per-package-compile]   MEASURED (tsc reported)   : ${compiled}   · floor ${MIN_COMPILED_SUBJECTS}`);
  say(`[per-package-compile]   UNMEASURED (no result)    : ${unmeasured.length}   <- neither pass NOR fail`);
  say(`[per-package-compile]   excluded by ledger        : ${excluded}   · ceiling ${SKIP_CEILING}`);
  say(`[per-package-compile]   FAILED                    : ${failures.length}`);
  say(`[per-package-compile]     |- own-source errors    : ${ownSourceFailures.length}   (actionable here)`);
  say(`[per-package-compile]     \`- CASCADE ONLY         : ${cascadeOnlyFailures.length}   (zero own errors — a dependency's fault)`);
  say(`[per-package-compile]   passing in isolation      : ${passes.length}`);
  say(
    '[per-package-compile]   NOT PROVEN to compile     : '
    + `${excluded + failures.length + unmeasured.length}`
    + ` of ${tsconfigBearing.length}  <- quote THIS, not "compiled".`,
  );
  if (noTsconfig.length > 0) {
    say(`[per-package-compile]   (outside population, no tsconfig.json: ${noTsconfig.length})`);
  }
  say(`[per-package-compile]   wall clock                : ${wallMin} min at concurrency ${CONCURRENCY}`);
  const retried = results.filter((m) => m.retried === true);
  if (retried.length > 0) {
    // §PPC-TRANSIENT-PROCESS-CREATION — retries are a property of the TREE, not of
    // the code under test, and they are printed so a flaky host cannot hide.
    say(
      `[per-package-compile]   RETRIED after UNMEASURED  : ${retried.length}   `
      + `(${retried.map((m) => `${m.pkg}→${m.outcome}`).join(', ')})`,
    );
  }
  if (excluded > 0) {
    say(
      `[per-package-compile] ⚠️  ${excluded} ledgered exclusion(s), compiled but not counted: `
      + `${[...excludedStillFailing, ...excludedNowClean].map((m) => m.pkg).join(', ')}`,
    );
  }
  say('[per-package-compile] ─────────────────────────────────────────────');

  /* ── §PPC-REPORT-THEN-EXIT — everything is printed BEFORE a code is chosen ── */

  if (failures.length > 0) {
    say(
      `[per-package-compile] ❌ ${failures.length} of ${tsconfigBearing.length} package(s) failed: `
      + `${failures.map((m) => m.pkg).join(', ')}`,
    );
    if (ownSourceFailures.length > 0) {
      say(
        `[per-package-compile]    ${ownSourceFailures.length} with OWN-SOURCE errors (fixable in the package): `
        + `${ownSourceFailures.map((m) => m.pkg).join(', ')}`,
      );
    }
    if (cascadeOnlyFailures.length > 0) {
      say(
        `[per-package-compile]    ${cascadeOnlyFailures.length} CASCADE-ONLY — zero own errors, red purely via a `
        + `broken dependency:\n[per-package-compile]      ${cascadeOnlyFailures.map((m) => m.pkg).join(', ')}`,
      );
      say(
        '[per-package-compile]    Fixing these packages is not possible IN these packages. See'
        + '\n[per-package-compile]    §MT-09-ISOLATION-IS-NOT-ISOLATED: every workspace package sets'
        + '\n[per-package-compile]    "types": "./src/index.ts", so each compile drags in the full source'
        + '\n[per-package-compile]    closure of its dependencies. The fix is built .d.ts + project'
        + '\n[per-package-compile]    references, repo-wide.',
      );
    }
  }

  if (unmeasured.length > 0) {
    say(
      `\n[per-package-compile] ❌ MISCONFIGURED (exit 2) — ${unmeasured.length} of `
      + `${tsconfigBearing.length} subject(s) produced NO MEASUREMENT:`,
    );
    for (const m of unmeasured) {
      say(`  • packages/${m.pkg} — ${m.reason}: ${m.detail ?? ''}`);
    }
    say(
      '\n  These are NOT passes and NOT failures. A launcher that crashed before reaching the'
      + '\n  compiler has found nothing, and printing FAIL for it costs someone a day chasing a'
      + '\n  type error that does not exist — the mirror image of the ~90 fabricated PASS lines'
      + '\n  this gate printed for its entire life on win32. NOT declarable debt.'
      + '\n  See §PPC-UNMEASURED-IS-A-CLASS and §PPC-ONE-NAMED-COMPILER.',
    );
  }

  // §MT-09-SKIP-LEDGER RULE 2 — a paid exclusion must leave the ledger. Evaluated
  // only over MEASURED subjects: an UNMEASURED ledgered package is neither proven
  // stale nor proven warranted, and must not be reported as either.
  if (excludedNowClean.length > 0) {
    ledgerViolations.push(
      `STALE: ${excludedNowClean.map((m) => m.pkg).join(', ')} compile(s) cleanly but still hold a ledger row. `
      + `Paid debt leaves the ledger in the commit that pays it, or the file rots into a list `
      + `of things that are secretly fine.`,
    );
  }
  const unmeasuredLedgered = unmeasured.filter((m) => m.excluded);
  if (unmeasuredLedgered.length > 0) {
    say(
      `[per-package-compile] ⚠ ${unmeasuredLedgered.length} ledgered package(s) were UNMEASURED `
      + `(${unmeasuredLedgered.map((m) => m.pkg).join(', ')}) — their ledger rows are neither`
      + '\n  proven warranted nor proven stale this run. RULE 2 was NOT evaluated for them.',
    );
  }

  /* ── exit precedence: 2 > 3 > 1 > 0 ── */

  if (unmeasured.length > 0) process.exit(2);

  if (compiled < MIN_COMPILED_SUBJECTS) {
    say(
      `[per-package-compile] MISCONFIGURED (exit 2) — only ${compiled} package(s) produced a measurement;`
      + ` floor is ${MIN_COMPILED_SUBJECTS}.`
      + `\n  ${tsconfigBearing.length} tsconfig-bearing packages exist. A run that measures nothing must`
      + '\n  never print "all clean".',
    );
    process.exit(2);
  }

  if (ledgerViolations.length > 0) reportLedgerViolationsAndExit();

  if (failures.length > 0) {
    say('[per-package-compile] Fix TypeScript errors above before merging.');
    process.exit(1);
  }

  say(
    `[per-package-compile] ✅ All ${passes.length} non-excluded package(s) compiled cleanly`
    + ` — ${excluded} still excluded by ledger, of ${tsconfigBearing.length} total.`,
  );
  process.exit(0);
}

void main();
