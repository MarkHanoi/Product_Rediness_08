/**
 * NFT CI driver + **Ratchet R2 — "NFT benches EXECUTED in CI"**.
 *
 * ## Why this script exists (W5-1, 2026-08-11)
 *
 * C10 §4 has listed "All NFT benches pass" as a MERGE BLOCKER since the
 * contract was stamped. Measured on 2026-08-11:
 * `grep -rn "bench" .github/workflows/` returned **zero matches**. No workflow
 * had ever invoked `apps/bench`. The gate asserted a fact nobody checked.
 *
 * ## The three axes, kept separate ON PURPOSE
 *
 * Conflating these is exactly how "17 benches pass" came to be false:
 *
 *   1. **EXECUTED**  — the bench body ran at all.
 *   2. **PASSED**    — its assertion held.
 *   3. **MEASURED THE RIGHT QUANTITY** — it measured what C10 names, in an
 *      environment where that quantity exists.
 *
 * Ratchet R2 counts axis 1 ONLY, because it is the weakest and therefore the
 * honest first rung. Axis 3 is tracked in `@pryzm/perf-budgets` via
 * `measurability`, and `nftLimit()` THROWS for a not-yet-measurable NFT so a
 * proxy can never borrow C10's number.
 *
 * ## "Executed" is defined narrowly, and skips do NOT count
 *
 * A file that fails to COLLECT (module-load ReferenceError) produces zero
 * assertion results — it did not execute. A `skipIf`-skipped test did not
 * execute either. Both are EMPTINESS, and per standing doctrine emptiness must
 * never read as a pass. Only a test that actually ran — passed or failed —
 * counts.
 *
 * ## Exit codes
 *
 *   0  — ratchet held (executed >= baseline). Budget MISSES do not fail this
 *        script; see the job header in ci.yml for why the pass/fail axis lands
 *        ADVISORY on the repo's own L-247 ladder while two NFTs are RED.
 *   1  — RATCHET REGRESSION: fewer benches executed than the baseline. That
 *        means a bench silently stopped running, which is the precise failure
 *        this ratchet exists to catch. Hard-fail.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NFT_TARGETS,
  R2_NFT_EXECUTED_IN_CI_BASELINE,
  type NftTarget,
} from '@pryzm/perf-budgets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(BENCH_ROOT, '..', '..');
const RUN_OUTPUT = join(BENCH_ROOT, '.run-output');
const JSON_REPORT = join(RUN_OUTPUT, 'nft-ci-report.json');

type Axis1 = 'executed' | 'not-collected' | 'skipped' | 'no-file';

interface Row {
  readonly nft: number;
  readonly id: string;
  readonly executed: Axis1;
  readonly passed: boolean | null;
  readonly measurability: NftTarget['measurability'];
  readonly note: string;
}

/** NFT rows that name a bench file that actually exists on disk. */
const RUNNABLE = NFT_TARGETS.filter(
  (t): t is NftTarget & { benchPath: string } =>
    t.benchPath !== null && existsSync(resolve(REPO_ROOT, t.benchPath)),
);

function runVitest(): void {
  mkdirSync(RUN_OUTPUT, { recursive: true });
  const rel = RUNNABLE.map((t) => t.benchPath.replace(/^apps\/bench\//, ''));
  try {
    // Resolve the platform binary directly rather than via `shell: true` —
    // shell-concatenated args are unescaped (node DEP0190).
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vitest', 'run', ...rel, '--reporter=json', `--outputFile=${JSON_REPORT}`],
      { cwd: BENCH_ROOT, stdio: 'inherit' },
    );
  } catch {
    // A non-zero exit means at least one BUDGET MISS or collect error. Both are
    // data for the report below, not a reason to abort: the ratchet verdict is
    // computed from the report, never from vitest's exit code.
  }
}

interface JestLikeAssertion {
  readonly status: string;
  readonly fullName?: string;
  readonly failureMessages?: readonly string[];
}
interface JestLikeFile {
  readonly name: string;
  readonly assertionResults?: readonly JestLikeAssertion[];
  readonly message?: string;
}

function classify(): Row[] {
  if (!existsSync(JSON_REPORT)) {
    throw new Error(`vitest produced no JSON report at ${JSON_REPORT} — cannot judge the ratchet.`);
  }
  const report = JSON.parse(readFileSync(JSON_REPORT, 'utf8')) as {
    testResults?: readonly JestLikeFile[];
  };
  const files = report.testResults ?? [];

  return NFT_TARGETS.map((t): Row => {
    if (t.benchPath === null || !existsSync(resolve(REPO_ROOT, t.benchPath))) {
      return {
        nft: t.nft,
        id: t.id,
        executed: 'no-file',
        passed: null,
        measurability: t.measurability,
        note: t.blockedBy ?? 'no bench file on disk',
      };
    }
    const norm = (s: string): string => s.replace(/\\/g, '/');
    const file = files.find((f) => norm(f.name).endsWith(norm(t.benchPath)));
    const assertions = file?.assertionResults ?? [];
    const ran = assertions.filter((a) => a.status === 'passed' || a.status === 'failed');

    if (ran.length === 0) {
      const skipped = assertions.length > 0;
      return {
        nft: t.nft,
        id: t.id,
        executed: skipped ? 'skipped' : 'not-collected',
        passed: null,
        measurability: t.measurability,
        note: skipped
          ? 'collected but every test was skipped — EMPTINESS, not a pass'
          : `failed to collect: ${(file?.message ?? 'file missing from report').slice(0, 160)}`,
      };
    }
    const failed = ran.filter((a) => a.status === 'failed');
    return {
      nft: t.nft,
      id: t.id,
      executed: 'executed',
      passed: failed.length === 0,
      measurability: t.measurability,
      note:
        failed.length === 0
          ? 'ok'
          : (failed[0]?.failureMessages?.[0] ?? 'assertion failed').split('\n')[0]!.slice(0, 200),
    };
  });
}

function main(): void {
  runVitest();
  const rows = classify();
  const executed = rows.filter((r) => r.executed === 'executed');

  const pad = (s: string, n: number): string => s.padEnd(n);
  console.log('\n─── NFT status — three axes, kept separate ───────────────────────────');
  console.log(
    `${pad('NFT', 4)}${pad('id', 28)}${pad('EXECUTED', 16)}${pad('PASSED', 9)}MEASURES-C10`,
  );
  for (const r of rows) {
    console.log(
      `${pad(String(r.nft), 4)}${pad(r.id, 28)}${pad(r.executed, 16)}` +
        `${pad(r.passed === null ? '—' : r.passed ? 'yes' : 'NO', 9)}` +
        `${r.measurability === 'measured' ? 'yes' : 'no (proxy)'}` +
        (r.executed !== 'executed' || r.passed === false ? `\n      ↳ ${r.note}` : ''),
    );
  }

  const misses = executed.filter((r) => r.passed === false && r.measurability === 'measured');
  console.log(
    `\nEXECUTED ${executed.length}/${NFT_TARGETS.length}` +
      `  ·  R2 baseline ${R2_NFT_EXECUTED_IN_CI_BASELINE}` +
      `  ·  governed budget MISSES ${misses.length}`,
  );
  for (const m of misses) console.log(`  ✗ NFT ${m.nft} ${m.id} — ${m.note}`);

  writeFileSync(
    join(RUN_OUTPUT, 'nft-r2-ratchet.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), executed: executed.length, baseline: R2_NFT_EXECUTED_IN_CI_BASELINE, rows },
      null,
      2,
    ),
  );

  if (executed.length < R2_NFT_EXECUTED_IN_CI_BASELINE) {
    console.error(
      `\n✗ RATCHET R2 REGRESSION — ${executed.length} NFT benches executed, baseline is ` +
        `${R2_NFT_EXECUTED_IN_CI_BASELINE}. A bench stopped running. That is the exact\n` +
        `  failure this ratchet exists to catch: a bench that does not run must never\n` +
        `  read as a bench that passed. Fix the bench, or raise an ADR to lower the\n` +
        `  baseline — do not delete the bench.`,
    );
    process.exit(1);
  }
  console.log(`\n✓ Ratchet R2 held (${executed.length} >= ${R2_NFT_EXECUTED_IN_CI_BASELINE}).`);
  if (executed.length > R2_NFT_EXECUTED_IN_CI_BASELINE) {
    console.log(
      `  ↑ ${executed.length} > baseline — RAISE R2_NFT_EXECUTED_IN_CI_BASELINE in\n` +
        `    packages/perf-budgets/src/nft-targets.ts to ${executed.length} to lock the gain in.`,
    );
  }
}

main();
