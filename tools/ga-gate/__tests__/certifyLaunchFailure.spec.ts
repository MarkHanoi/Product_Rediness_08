/**
 * @file tools/ga-gate/__tests__/certifyLaunchFailure.spec.ts
 *
 * §LAUNCH-FAILED-IS-NOT-A-VERDICT (2026-09-10)
 *
 * ─── What this pins ──────────────────────────────────────────────────────────
 * `tools/rac-conformance/certification/certify.ts` spawns every Wave-3 gate and
 * records an outcome per gate in `results/certify.json`. The committed baseline
 * of 2026-08-17 recorded **3221225794** for EIGHT gates — 0xC0000142 =
 * STATUS_DLL_INIT_FAILED, a Windows process-LAUNCH failure — in the field every
 * reader takes to be the check's verdict. Those eight checks never ran, and for
 * three weeks the baseline read as if they had. §CONTEXT-DATA-HONESTY: a crash
 * and a verdict must never share a field.
 *
 * ─── Why the assertion is on the SURFACE, not the unit ───────────────────────
 * The runner is what CI executes (`pnpm run certify:bim20`), and the artefact it
 * writes is what a human or a later gate reads. So this spec spawns the REAL
 * `certify.ts` as a child process, in `--gates-only` mode, pointed at a fixture
 * gate roster in which one gate exits with the exact crash status the baseline
 * recorded, and reads the certify.json it wrote. The classifier
 * (`gateLaunch.ts`) is exercised through the same spawnSync path production uses
 * — nothing is imported and called directly. Both env overrides the runner
 * honours (`PRYZM_CERTIFY_GATES_DIR`, `PRYZM_CERTIFY_RESULTS_DIR`) exist for this
 * spec and are recorded in the artefact, which the spec also asserts.
 *
 * ─── Platform honesty ────────────────────────────────────────────────────────
 * On win32 a child exiting 0xC0000142 reaches the parent as status 3221225794
 * (measured 2026-09-10 on the founder's box). On POSIX the same call is
 * truncated to 8 bits (0x42 = 66), which is still outside the four-code contract.
 * The spec asserts LAUNCH_FAILED on both; the decoded NTSTATUS hint is asserted
 * on win32 only, because it is only true there.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const CERT_DIR = resolve(REPO, 'tools/rac-conformance/certification');
const CERTIFY = resolve(CERT_DIR, 'certify.ts');

// The workspace's own tsx CLI, spawned as `node <entry>` — the same thing
// certify.ts does for its gates, and for the same measured reason (npx's
// per-spawn resolution cost ~80 s on the founder's box under fleet load).
const require_ = createRequire(import.meta.url);
const TSX_CLI = (() => {
  const pkgJsonPath = require_.resolve('tsx/package.json');
  const bin = (JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { bin: string }).bin;
  return resolve(dirname(pkgJsonPath), bin);
})();

/** The roster, parsed from certify.ts's source with the SAME regex run-all.ts uses. */
function readRoster(): string[] {
  const src = readFileSync(CERTIFY, 'utf8');
  const m = /const\s+gates\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (!m) throw new Error('could not parse certify.ts gate roster');
  return [...m[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]!);
}

interface Summary {
  exitCode: unknown;
  gates: Record<string, unknown>;
  launchFailures?: Record<string, { status: number | null; signal: string | null; error: string | null; hint: string }>;
  gatesDir?: string;
  resultsDir?: string;
}

interface Run { status: number | null; stdout: string; summary: Summary }

/** Drive the REAL certify.ts as a child, asynchronously so two scenarios can overlap. */
function runCertify(gatesDir: string, resultsDir: string): Promise<Run> {
  return new Promise((done, fail) => {
    const chunks: string[] = [];
    const child = spawn(process.execPath, [TSX_CLI, CERTIFY, '--gates-only'], {
      cwd: CERT_DIR,
      env: { ...process.env, PRYZM_CERTIFY_GATES_DIR: gatesDir, PRYZM_CERTIFY_RESULTS_DIR: resultsDir },
    });
    child.stdout.on('data', (d: Buffer) => chunks.push(String(d)));
    child.stderr.on('data', (d: Buffer) => chunks.push(String(d)));
    child.on('error', fail);
    child.on('close', (status) => {
      const stdout = chunks.join('');
      const p = join(resultsDir, 'certify.json');
      if (!existsSync(p)) { fail(new Error(`certify.ts wrote no certify.json (status ${status})\n${stdout}`)); return; }
      done({ status, stdout, summary: JSON.parse(readFileSync(p, 'utf8')) as Summary });
    });
  });
}

/** Write one fixture script per roster name; `bodies` overrides the default `process.exit(0)`. */
function writeRoster(dir: string, roster: string[], bodies: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const g of roster) {
    writeFileSync(join(dir, g + '.ts'), (bodies[g] ?? 'process.exit(0);') + '\n');
  }
}

const CRASH_STATUS_WIN32 = 3221225794; // 0xC0000142 — verbatim from the 2026-08-17 baseline

describe('§LAUNCH-FAILED-IS-NOT-A-VERDICT — certify.ts refuses to record a launch failure as a verdict', () => {
  let root = '';
  let roster: string[] = [];
  let crashed = '';
  let declared = '';
  let crashRun: Run;
  let cleanRun: Run;

  beforeAll(async () => {
    roster = readRoster();
    expect(roster.length, 'the roster must parse (run-all relies on the same literal)').toBeGreaterThan(2);
    crashed = roster[0]!;
    declared = roster[1]!;
    root = mkdtempSync(join(tmpdir(), 'pryzm-certify-launch-'));

    // Scenario A — ONE gate dies at launch with the baseline's exact status,
    // one gate reads DECLARED-LEVEL (1), every other gate is CLEAN (0).
    const gatesA = join(root, 'gates-crash');
    writeRoster(gatesA, roster, {
      [crashed]: `process.exit(${CRASH_STATUS_WIN32});`,
      [declared]: 'process.exit(1);',
    });

    // Scenario B — the SAME roster with the crash removed: the classifier must
    // pass ordinary verdicts through untouched, or it has merely made everything red.
    const gatesB = join(root, 'gates-clean');
    writeRoster(gatesB, roster, { [declared]: 'process.exit(1);' });

    // Both runs are independent processes writing to separate results dirs, so
    // they overlap; the roster is 21 spawns each and this box is shared.
    [crashRun, cleanRun] = await Promise.all([
      runCertify(gatesA, join(root, 'results-crash')),
      runCertify(gatesB, join(root, 'results-clean')),
    ]);
  }, 900_000);

  afterAll(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('records the crashed gate as LAUNCH_FAILED — a NAME in the verdict field, never a number', () => {
    expect(crashRun.summary.gates[crashed]).toBe('LAUNCH_FAILED');
  });

  it('keeps the raw status beside it, in its own field, with a decoded hint', () => {
    const f = crashRun.summary.launchFailures?.[crashed];
    expect(f, 'launchFailures must carry the crashed gate').toBeDefined();
    expect(typeof f!.status).toBe('number');
    // Outside the four-code contract on every platform; the exact NTSTATUS on win32.
    expect([0, 1, 2, 3]).not.toContain(f!.status);
    if (process.platform === 'win32') {
      expect(f!.status).toBe(CRASH_STATUS_WIN32);
      expect(f!.hint).toContain('STATUS_DLL_INIT_FAILED');
    }
    expect(f!.hint.length).toBeGreaterThan(20);
  });

  it('never lets a raw process status reach the verdict field for ANY gate', () => {
    for (const [g, v] of Object.entries(crashRun.summary.gates)) {
      const legal = v === 'LAUNCH_FAILED' || v === 'SCRIPT_MISSING' || v === 0 || v === 1 || v === 2 || v === 3;
      expect(legal, `${g} recorded ${JSON.stringify(v)}`).toBe(true);
    }
  });

  it('folds the launch failure into the run as MISCONFIGURED (2) — the process exit AND the artefact agree', () => {
    expect(crashRun.summary.exitCode).toBe(2);
    expect(crashRun.status).toBe(2);
  });

  it("does not let the crash replace the run's exit code (the old `worst()` defect)", () => {
    expect(crashRun.summary.exitCode).not.toBe(CRASH_STATUS_WIN32);
    expect(typeof crashRun.summary.exitCode).toBe('number');
  });

  it('says so on the console, naming the gate and that it is not a verdict', () => {
    expect(crashRun.stdout).toContain(`${crashed}: LAUNCH FAILED`);
    expect(crashRun.stdout).toContain('NOT a verdict');
    expect(crashRun.stdout).toContain('DID NOT LAUNCH');
  });

  it('records the overridden directories in the artefact, so a fixture run can never pass as a real one', () => {
    expect(crashRun.summary.gatesDir?.replace(/\\/g, '/')).toContain('gates-crash');
    expect(crashRun.summary.resultsDir?.replace(/\\/g, '/')).toContain('results-crash');
  });

  it('CONTROL — with no crash, ordinary verdicts pass through untouched and launchFailures is an EMPTY map', () => {
    expect(cleanRun.summary.gates[declared]).toBe(1);
    expect(cleanRun.summary.gates[crashed]).toBe(0);
    expect(cleanRun.summary.launchFailures, 'present-but-empty says "every gate launched"').toEqual({});
    expect(cleanRun.summary.exitCode).toBe(1);
    expect(cleanRun.status).toBe(1);
    expect(cleanRun.stdout).not.toContain('LAUNCH FAILED');
  });
});
