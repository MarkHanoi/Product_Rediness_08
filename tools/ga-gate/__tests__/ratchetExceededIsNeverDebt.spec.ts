/**
 * @file tools/ga-gate/__tests__/ratchetExceededIsNeverDebt.spec.ts
 *
 * §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836 · 2026-08-11)
 *
 * ─── What this pins, and why it needs a test at all ──────────────────────────
 * R7 added a THIRD exit code to the gate contract. The whole value of it is a
 * negative property — "exit 3 is NOT absorbed by gate-debt.json" — and a negative
 * property is exactly the kind that rots silently: nothing fails if somebody
 * later folds the `code === 3` branch back into the generic `code !== 0` one, and
 * the suite goes on printing green while a ratchet climbs.
 *
 * That is not a hypothetical failure mode. It is the one this repo has now hit
 * five times (L-774, L-809, L-811, L-812, L-827): a check that stopped checking,
 * where the only observable difference was a number nobody re-derived.
 *
 * So this spec asserts the CONTRACT rather than any particular gate's reading:
 *
 *   0 — clean
 *   1 — failed at its DECLARED level          → absorbable IF ledgered
 *   2 — MISCONFIGURED, could not evaluate     → NEVER absorbable  (L-811)
 *   3 — SHRINK-ONLY RATCHET EXCEEDED          → NEVER absorbable  (R7)
 *
 * It deliberately does NOT assert that check-cast-count is at any given count.
 * The count changes every week; the contract must not. A test that pins the
 * reading would have to be edited on every legitimate ratchet move, and a test
 * everybody edits is a test nobody reads.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync }         from 'node:fs';
import { join, dirname }        from 'node:path';
import { fileURLToPath }        from 'node:url';

const GATE_DIR = dirname(fileURLToPath(import.meta.url)).replace(/__tests__$/, '');
const runAll   = readFileSync(join(GATE_DIR, 'run-all.ts'), 'utf8');
const castGate = readFileSync(join(GATE_DIR, 'check-cast-count.ts'), 'utf8');

/** Comments blanked, so prose describing the rule cannot satisfy the rule. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('§RATCHET-EXCEEDED-IS-NEVER-DEBT — the exit-code contract', () => {
  const runAllCode = codeOnly(runAll);
  const castCode   = codeOnly(castGate);

  it('run-all handles exit 3 in a branch of its own, before the generic failure branch', () => {
    const three   = runAllCode.indexOf('code === 3');
    const generic = runAllCode.indexOf('code !== 0');

    expect(three, 'run-all must branch on exit 3 explicitly').toBeGreaterThan(-1);
    expect(generic, 'the generic failure branch must still exist').toBeGreaterThan(-1);

    // Order is the whole mechanism: `code !== 0` also matches 3, so if the generic
    // branch runs first, exit 3 is absorbed by the ledger and R7 does nothing.
    expect(three, 'the exit-3 branch must come BEFORE `code !== 0`, which also matches 3')
      .toBeLessThan(generic);
  });

  /**
   * The branch body ONLY — from `code === N` up to and including its `continue`.
   * A fixed-width slice is wrong here and this spec proved it on its first run:
   * 900 characters overran into the following generic `code !== 0` branch, which
   * contains `baseline.has` legitimately, and the assertion failed against
   * correct code. Measuring the right region is the whole point — an over-wide
   * window is the same defect as the zoning gate's mis-slice (L-829), where a
   * comment and an admin button were read as refusal arms.
   */
  function branchBody(src: string, guard: string): string {
    const start = src.indexOf(guard);
    expect(start, `the ${guard} branch must exist`).toBeGreaterThan(-1);
    const end = src.indexOf('continue;', start);
    expect(end, `the ${guard} branch must terminate with continue`).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it('the exit-3 branch fails the run unconditionally — it never consults the ledger', () => {
    const body = branchBody(runAllCode, 'code === 3');

    expect(body, 'exit 3 must set anyFailed').toContain('anyFailed = true');
    // `baseline.has(...)` is how a failure gets excused. Its presence in THIS
    // branch would mean a ledgered gate could still hide a ratchet breach.
    expect(body, 'exit 3 must NOT be conditional on ledger membership')
      .not.toContain('baseline.has');
  });

  it('exit 2 keeps the same unconditional treatment — R7 must not have weakened L-811', () => {
    const body = branchBody(runAllCode, 'code === 2');
    expect(body).toContain('anyFailed = true');
    expect(body).not.toContain('baseline.has');
  });

  it('check-cast-count returns 3 — not 1 — on every shrink-only ratchet path', () => {
    expect(castCode).toContain('EXIT_RATCHET_EXCEEDED = 3');

    // Both ratchet arms (repo-wide, and the scoped current-vs-baseline one) must
    // use it. Returning a bare 1 from either restores the original hole.
    const returns = castCode.match(/return\s+EXIT_RATCHET_EXCEEDED/g) ?? [];
    expect(returns.length, 'both ratchet paths must return the ratchet code').toBe(2);
  });

  it('a raised threshold is not the sanctioned response, and the gate says so', () => {
    // The failure mode R7 guards against is social, not mechanical: the cheapest
    // way to clear a red ratchet is to edit the number. The instruction to NOT do
    // that has to travel with the failure, or it is not present when it is needed.
    expect(castGate).toMatch(/do NOT raise the threshold/i);
    expect(runAll).toMatch(/do NOT raise the threshold/i);
  });
});
