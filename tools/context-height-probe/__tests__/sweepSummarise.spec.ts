// ─────────────────────────────────────────────────────────────────────────────
// sweep.mjs `summarise` — the §CONTEXT-DATA-HONESTY rule, bound.
//
// WHY THESE ROWS. They are not invented. Every row below is a VERBATIM reading taken 2026-09-09
// (lane DELAWARE-R2) by `probe.mjs` against the staged `delaware` archive from bake run
// 34397872497, plus the Barcelona control from the live tileset. A fixture written from the
// function's own shape could not falsify the function (memory: "fake more capable than real");
// these came out of the real decoder reading real bytes, so they can.
//
// WHAT IS BOUND, and it is one rule with two halves that must never merge:
//   · a point that reached a DATA verdict (measured / unmeasured / empty / not-baked) is counted;
//   · a point that was UNREACHABLE contributes NOTHING — it is excluded from min/median/max and
//     counted separately. A failure and an emptiness are different values (L-581/L-616), and an
//     unreachable point folded in as 0 would turn a dead CDN into "this region has no measured
//     heights", which is a claim about the world made out of a network error.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain-Node ESM tool, no d.ts; the tool is the artefact, the types are not.
import { summarise } from '../sweep.mjs';

/** Measured 2026-09-09 against tiles-staging/delaware/ (bake run 34397872497). */
const DELAWARE = [
  { name: 'wilmington', verdict: 'measured', solidRenderFraction: 0.947 },
  { name: 'newark-de', verdict: 'unmeasured', solidRenderFraction: 0 },
  { name: 'dover', verdict: 'measured', solidRenderFraction: 0.87 },
  { name: 'milford', verdict: 'unmeasured', solidRenderFraction: 0 },
  { name: 'georgetown', verdict: 'unmeasured', solidRenderFraction: 0 },
  { name: 'lewes-town', verdict: 'unmeasured', solidRenderFraction: 0 },
  { name: 'lewes-demo', verdict: 'unmeasured', solidRenderFraction: 0 },
  { name: 'rehoboth', verdict: 'unmeasured', solidRenderFraction: 0 },
  { name: 'fenwick', verdict: 'unmeasured', solidRenderFraction: 0 },
];

/** Measured 2026-09-09 against the LIVE tileset. The parity target. */
const BARCELONA = [{ name: 'barcelona', verdict: 'measured', solidRenderFraction: 0.958 }];

describe('sweep summarise — the spread, not the mean', () => {
  it('reports the Delaware spread that every count-based gate missed', () => {
    const s = summarise(DELAWARE);
    expect(s).not.toBeNull();
    expect(s.counted).toBe(9);
    expect(s.excludedUnreachable).toBe(0);
    // The two facts the statewide 19.6 % could not express.
    expect(s.min).toBe(0);
    expect(s.max).toBe(0.947);
    expect(s.minName).toBe('newark-de');
    expect(s.maxName).toBe('wilmington');
    // Seven of nine fabricated, the founder's site among them.
    expect(s.unmeasured).toHaveLength(7);
    expect(s.unmeasured).toContain('lewes-demo');
    // And the verdict that makes the reader look.
    expect(s.notUniform).toBe(true);
  });

  it('does NOT raise the non-uniform flag on a region that is genuinely uniform', () => {
    // Same shape, same code path, spread 0.011 — so `notUniform` is reacting to the SPREAD and not
    // merely to "some point is unmeasured" or "there is more than one row".
    const uniform = [
      { name: 'a', verdict: 'measured', solidRenderFraction: 0.947 },
      { name: 'b', verdict: 'measured', solidRenderFraction: 0.958 },
      { name: 'c', verdict: 'measured', solidRenderFraction: 0.95 },
    ];
    const s = summarise(uniform);
    expect(s.notUniform).toBe(false);
    expect(s.min).toBe(0.947);
    expect(s.max).toBe(0.958);
  });

  it('EXCLUDES an unreachable point from every fraction instead of scoring it zero', () => {
    // The load-bearing arm. Take the Barcelona control — one perfect point — and add a point whose
    // archive could not be read at all.
    const withDead = [...BARCELONA, { name: 'dead-cdn', verdict: 'unreachable', reason: 'HTTP 503' }];
    const s = summarise(withDead);

    expect(s.excludedUnreachable).toBe(1);
    expect(s.counted).toBe(1);          // the unreachable point is NOT a data point
    expect(s.dataRows).toBe(1);

    // ⛔ If `unreachable` were folded in as a 0 — the L-581/L-616 defect — min would be 0, the
    // spread would be 0.958 and `notUniform` would fire. A network error would have been reported
    // as a region with fabricated heights.
    expect(s.min).toBe(0.958);
    expect(s.max).toBe(0.958);
    expect(s.notUniform).toBe(false);
    expect(s.unmeasured).toEqual([]);   // unreachable is not unmeasured
  });

  it('keeps `unreachable` and `unmeasured` apart even when both are present', () => {
    const mixed = [
      { name: 'good', verdict: 'measured', solidRenderFraction: 0.9 },
      { name: 'fabricated', verdict: 'unmeasured', solidRenderFraction: 0 },
      { name: 'dead', verdict: 'unreachable' },
    ];
    const s = summarise(mixed);
    expect(s.excludedUnreachable).toBe(1);
    expect(s.unmeasured).toEqual(['fabricated']);
    expect(s.dataRows).toBe(2);
    expect(s.counted).toBe(2);
  });

  it('returns null rather than a fabricated zero when nothing reached a fraction', () => {
    // Every point unreachable. There is no coverage number to report, and inventing one — 0, or
    // NaN, or "no data" as a number — is the thing this whole tool exists to refuse.
    expect(summarise([{ name: 'x', verdict: 'unreachable' }, { name: 'y', verdict: 'unreachable' }])).toBeNull();
    expect(summarise([])).toBeNull();
  });
});
