/**
 * §L-850 — behavioural specs for `tools/ga-gate/check-no-dark-test-files.ts`.
 *
 * The gate is run as a SUBPROCESS so the assertions are on its REAL exit code
 * and its REAL printed controls, not on a re-implementation of its logic here.
 * A test that re-derives what the gate derives proves only that two copies of
 * the same mistake agree (C72 §3.4).
 *
 * What these pin, and why each one is a failure mode that actually happened:
 *
 *  1. THE GATE IS NOT BLIND. Its executed controls must show the four planted
 *     dark classes firing BY EXACT PATH, and the clean fixture reading zero.
 *     C70 §5.6: a comparator never watched going red has never been shown to
 *     work. The gate itself exits 2 if a control stays silent — this spec pins
 *     that the control BLOCK IS PRESENT AND POSITIVE, so a future edit cannot
 *     quietly delete `selfTest()` and leave a gate that always passes.
 *  2. GREEN IS REACHABLE (L-716). The clean fixture is the satisfiability
 *     proof. A gate whose pass condition can never be true is not a gate, it is
 *     a permanent red light people learn to walk past.
 *  3. THE GATE NEVER EXITS 2 ON THE REAL TREE. Exit 2 is MISCONFIGURED — it
 *     means the floors were unmet and NOTHING was measured. `0 problems found`
 *     over an empty subject is the exact lie this suite exists to prevent.
 *  4. THE LEDGER IS REAL. Every path on `dark-test-files-ledger.json` must
 *     exist on disk and carry a class tag. A ledger row pointing at a deleted
 *     file is debt that can never be paid off and hides the next regression
 *     inside itself — the gate's own STALE arm catches it, and this catches a
 *     ledger that was hand-edited into nonsense.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE_DIR = resolve(HERE, '..');
const ROOT = resolve(GATE_DIR, '..', '..');
const GATE = join(GATE_DIR, 'check-no-dark-test-files.ts');
const LEDGER = join(GATE_DIR, 'dark-test-files-ledger.json');

/** Run the gate, returning its combined output and real exit code. */
function runGate(): { out: string; code: number } {
  try {
    const out = execFileSync('npx', ['tsx', GATE], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true,
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: (err.stdout ?? '') + (err.stderr ?? ''), code: err.status ?? -1 };
  }
}

describe('check-no-dark-test-files (§L-850)', () => {
  const run = runGate();

  it('is not a blind comparator — every planted dark class fires by exact path', () => {
    expect(run.out).toContain('executed controls');
    // The L-849 double miss: package-ROOT directory AND the wrong suffix.
    expect(run.out).toContain('D::packages/a/__tests__/rootSuite.test.ts');
    expect(run.out).toContain('D::packages/a/src/nearSubject.test.ts');
    // A suite quarantined by `exclude` must stay visible, not vanish.
    expect(run.out).toContain('D::packages/b/__tests__/red.test.ts');
    // Checked-in tsc output must be classified, not "enabled".
    expect(run.out).toContain('D::packages/c/__tests__/dup.test.js');
    // C70 §2.2 — an unreadable include is UNPROVEN, never assumed coverage.
    expect(run.out).toContain('U::packages/d/vitest.config.ts');
    // …and no control may report a BLIND COMPARATOR or a FALSE POSITIVE.
    expect(run.out).not.toContain('BLIND COMPARATOR');
    expect(run.out).not.toContain('FALSE POSITIVE');
  }, 300_000);

  it('proves green is REACHABLE — the clean fixture reads 0 findings (L-716)', () => {
    expect(run.out).toContain('SATISFIABILITY PROOF');
    expect(run.out).toContain('green is REACHABLE');
  }, 300_000);

  it('never exits 2 on the real tree — the floors are met, so a verdict was actually reached', () => {
    // 2 is MISCONFIGURED: the subject could not be established. A pass over an
    // empty subject is not a pass, and it is never absorbable as debt.
    expect(run.code).not.toBe(2);
    expect([0, 1, 3]).toContain(run.code);
  }, 300_000);

  it('states its scope honestly — glob reachability is not CI invocation', () => {
    expect(run.out).toContain('GLOB REACHABILITY, not CI INVOCATION');
  }, 300_000);

  it('ledger rows all point at files that exist and carry a class tag', () => {
    expect(existsSync(LEDGER)).toBe(true);
    const j = JSON.parse(readFileSync(LEDGER, 'utf8')) as {
      dark?: Record<string, string>;
      firstReading?: { dark?: number };
    };
    const dark = j.dark ?? {};
    const paths = Object.keys(dark);
    expect(paths.length).toBeGreaterThan(0);

    const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, `ledger rows pointing at files that do not exist: ${missing.join(', ')}`).toEqual([]);

    const untagged = paths.filter((p) => !/^\[(no-runner|excluded-by|compiled-artefact|unproven-coverage)\]/.test(dark[p]!));
    expect(untagged, `ledger rows with no class tag: ${untagged.join(', ')}`).toEqual([]);

    // The recorded first reading must match the rows it claims to summarise, or
    // the header is a number somebody typed rather than a number measured.
    expect(j.firstReading?.dark).toBe(paths.length);
  });
});
