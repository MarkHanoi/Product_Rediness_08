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
 *  5. THE LEDGER IS A SHRINK-ONLY RATCHET. It may fall to zero freely; it may
 *     not rise above the pinned reading without an explicit, reviewable edit to
 *     `LEDGER_RATCHET_MAX` below.
 *
 * ─── §FIX-DARK-SPEC-SHRINK-HOSTILE (2026-08-16) ─────────────────────────────
 * This spec used to end with
 *
 *     expect(j.firstReading?.dark).toBe(paths.length);
 *
 * commented "the recorded first reading must match the rows it claims to
 * summarise". It does not, and it must not. `firstReading` is the FOUNDING
 * measurement — 137 dark files on 2026-08-14, deliberately immutable history.
 * `paths.length` is the LIVE row count. Equating a historical constant with a
 * live quantity means the assertion holds in exactly one state of the world:
 * the day the ledger was minted. Every row struck since — 137 → 65 → 13, the
 * §L-850 drain, all of it real work — pushed the two further apart, so the spec
 * went red BECAUSE the thing it measures IMPROVED. Measured at HEAD before this
 * fix: `AssertionError: expected 137 to be 13`.
 *
 * A red suite that is red for doing the right thing teaches people to ignore
 * the suite. It is the same defect class as the pre-2026-08-11 P8 gate: an
 * assertion whose subject is not the thing anyone cares about.
 *
 * What replaces it — three arms, none of which compares history to the present:
 *   · `firstReading` is checked for INTERNAL consistency (its own byClass sums
 *     to its own total) and for immutability-as-a-ceiling. It is never compared
 *     to the live count except as an upper bound.
 *   · the live row count is cross-checked against the GATE'S OWN MEASUREMENT,
 *     parsed out of the subprocess output. That is the check the deleted line
 *     was reaching for — "is this number measured or typed?" — asked against a
 *     measurement instead of against a constant, so it moves when the tree
 *     moves and cannot go stale.
 *   · the ratchet itself: `paths.length <= LEDGER_RATCHET_MAX`. SHRINKING IS
 *     ALWAYS GREEN. Growing past the pin is RED and stays red until somebody
 *     edits the constant in a reviewable commit.
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

/**
 * §FIX-DARK-SPEC-SHRINK-HOSTILE — the shrink-only ratchet pin.
 *
 * MEASURED, not chosen: `npx tsx tools/ga-gate/check-no-dark-test-files.ts` on
 * 2026-08-16 printed `DARK: 13  (no-runner 4 · excluded-by 6 · compiled-artefact 3)`
 * against a declared ledger of 13 — exit 1, DECLARED-LEVEL, no UNLEDGERED, no STALE.
 *
 * Lower it whenever the ledger drains; the suite will not stop you. RAISING it is
 * the reviewable act: it means a test file went dark and somebody chose to tolerate
 * it, which is a founder decision under C70 §5.3 rule 2, not a chore. Never raise it
 * to make this suite green — the gate itself already fails by NAME on an unledgered
 * dark file, so a raise here without a matching ledger row cannot buy a green anyway.
 */
const LEDGER_RATCHET_MAX = 13;

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

  /** The ledger, parsed once — the same artefact for every arm below. */
  interface LedgerShape {
    dark?: Record<string, string>;
    firstReading?: { dark?: number; byClass?: Record<string, number> };
  }
  function readLedger(): { j: LedgerShape; paths: string[] } {
    const j = JSON.parse(readFileSync(LEDGER, 'utf8')) as LedgerShape;
    return { j, paths: Object.keys(j.dark ?? {}) };
  }

  it('ledger rows all point at files that exist and carry a class tag', () => {
    expect(existsSync(LEDGER)).toBe(true);
    const { j, paths } = readLedger();

    // NOT `paths.length > 0`. An EMPTY ledger is the goal state of a shrink-only
    // ratchet, and a spec that fails on arrival is the same defect this file was
    // just repaired for. What must hold is that the `dark` key EXISTS — an absent
    // key is a malformed artefact (the gate reads `j.dark ?? {}` and would report
    // a clean tree over a file somebody truncated), whereas `{}` is a real,
    // measured, fully-drained ledger.
    expect(
      typeof j.dark === 'object' && j.dark !== null,
      'ledger has no `dark` object — an absent key reads as "nothing is dark", which is a truncation, not a measurement',
    ).toBe(true);

    const dark = j.dark ?? {};
    const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, `ledger rows pointing at files that do not exist: ${missing.join(', ')}`).toEqual([]);

    const untagged = paths.filter((p) => !/^\[(no-runner|excluded-by|compiled-artefact|unproven-coverage)\]/.test(dark[p]!));
    expect(untagged, `ledger rows with no class tag: ${untagged.join(', ')}`).toEqual([]);
  });

  it('the ledger row count is the GATE\'S OWN measurement, not a number somebody typed', () => {
    // The honest form of the assertion this spec used to make against
    // `firstReading`. The gate prints its live reading as
    //   `DARK: 13  (no-runner 4 · excluded-by 6 · compiled-artefact 3)`
    // and that number is recomputed by walking the tree on every run. Comparing
    // the ledger to THAT moves when the tree moves; comparing it to a constant
    // in the JSON header goes stale the first time anyone fixes anything.
    const m = run.out.match(/DARK:\s*(\d+)\s*\(no-runner\s*(\d+)\s*·\s*excluded-by\s*(\d+)\s*·\s*compiled-artefact\s*(\d+)\)/);
    expect(m, `the gate did not print a parsable DARK reading; output was:\n${run.out.slice(0, 2000)}`).not.toBeNull();

    const [measured, noRunner, excludedBy, compiled] = m!.slice(1).map(Number) as [number, number, number, number];
    const { paths } = readLedger();

    // The gate's own class split must sum to its own headline, or the headline is
    // a print statement rather than a derivation.
    expect(noRunner + excludedBy + compiled).toBe(measured);

    // …and the ledger must name exactly what the gate measured. Off in EITHER
    // direction is a real defect the gate also catches (UNLEDGERED / STALE, exit 3);
    // pinning it here as well means the suite says WHICH, in one line, instead of
    // making a reader diff two lists by eye.
    expect(
      paths.length,
      `ledger rows (${paths.length}) disagree with the gate's live DARK reading (${measured}). ` +
      'Strike or add rows in the SAME commit as the include change (C70 §5.3).',
    ).toBe(measured);
  }, 300_000);

  it('is a SHRINK-ONLY ratchet — draining is green, growing past the pin is red', () => {
    const { j, paths } = readLedger();

    // ── grow-intolerant ──────────────────────────────────────────────────────
    // The teeth. If a test file falls dark and gets a row, this goes red until
    // LEDGER_RATCHET_MAX is deliberately raised — which is the reviewable act.
    expect(
      paths.length,
      `the dark-test ledger GREW to ${paths.length}, above the pinned ratchet of ${LEDGER_RATCHET_MAX}. ` +
      'A test file that no runner can select reads as coverage and asserts nothing (L-849). ' +
      'Wire it up and strike the row — do NOT raise the pin to go green.',
    ).toBeLessThanOrEqual(LEDGER_RATCHET_MAX);

    // ── shrink-tolerant ──────────────────────────────────────────────────────
    // Deliberately NO lower bound. `paths.length` may be anything from 0 up. The
    // whole point of the repair is that this suite must never punish a drain.

    // ── the pin may only ever ratchet DOWN from the founding reading ─────────
    const first = j.firstReading?.dark;
    expect(typeof first, 'firstReading.dark is missing — the founding measurement is the ratchet ceiling').toBe('number');
    expect(
      LEDGER_RATCHET_MAX,
      `the pin (${LEDGER_RATCHET_MAX}) is above the founding reading (${first}). ` +
      'The ledger has only ever been allowed to shrink; a pin above its own origin is not a ratchet.',
    ).toBeLessThanOrEqual(first!);

    // ── firstReading is HISTORY, and history must be internally consistent ───
    // This is the "number somebody typed" check applied where it belongs: to the
    // frozen record's own two halves, never across the frozen record and the live
    // tree. byClass is optional — but if it is present it must sum to its total.
    const byClass = j.firstReading?.byClass;
    if (byClass) {
      const sum = Object.values(byClass).reduce((a, b) => a + b, 0);
      expect(sum, `firstReading.byClass sums to ${sum} but firstReading.dark says ${first}`).toBe(first);
    }
  });
});
