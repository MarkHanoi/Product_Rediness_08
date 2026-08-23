/**
 * §GRAPH-3D-ONE-LAYOUT (L-8430 · L-8431) — one Barnes-Hut, two dimensionalities,
 * and PROOF that the 2-D picture did not move.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * ADR:             ADR-0364 §3.5 · continues §PERF-GRAPH-BARNES-HUT (L-6620)
 * Contracts:       C66 §1.1 (nothing is supported at a size it was not benched at)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THE FIXTURE, AND WHY `toBe` RATHER THAN `toBeCloseTo`
 * ═════════════════════════════════════════════════════════════════════════════
 * `nodeLinkSvg.ts` carried a written promise: every graph that could be drawn
 * before §PERF-GRAPH-BARNES-HUT draws BYTE-IDENTICALLY. Making the quadtree
 * dimension-generic — so the 3-D viewport does not need a second one — is exactly
 * the kind of change that quietly shifts every diagram by a pixel and breaks that
 * promise where nobody is looking.
 *
 * `forceLayout2dBaseline.json` was produced by running the PREVIOUS
 * implementation, before a line of the refactor existed, over four graph sizes
 * chosen to straddle the exact/approximate switch at `EXACT_BELOW = 60`:
 * **12 · 59 · 60 · 140**. 59 and 60 are the pair that matters — one either side
 * of the branch — because a refactor that broke only one arm would pass a test
 * that sampled only the other.
 *
 * ⛔ THE COMPARISON IS `toBe`. A tolerance would make this test worthless: the
 * whole claim is bit-identity, and `toBeCloseTo` would pass on the very drift it
 * exists to catch. If this suite ever goes red, the correct response is to
 * restore the arithmetic — NOT to loosen the assertion.
 *
 * ⚠ WHAT THIS SUITE DOES NOT CLAIM. It says nothing about milliseconds. C66 §1.1
 * forbids describing a capacity as supported at a size it was not benched at, and
 * a CI box is not a bench — `graphLayoutScale.spec.ts` already owns the
 * complexity-SHAPE assertion, which is machine-stable, and this one owns
 * identity.
 */

import { describe, expect, it } from 'vitest';

import { forceLayout, forceLayout3D } from '../nodeLinkSvg';
import { EXACT_BELOW, layoutND } from '../forceLayoutND';
import baseline from './forceLayout2dBaseline.json';

const W = 360;
const H = 280;

/** The same deterministic ring-plus-chords graph the baseline was captured over. */
function ring(n: number): {
  ids: string[];
  pairs: Array<readonly [string, string]>;
} {
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const pairs: Array<readonly [string, string]> = [];
  for (let i = 0; i < n; i++) pairs.push([ids[i]!, ids[(i + 1) % n]!] as const);
  for (let i = 0; i < n; i += 7) pairs.push([ids[i]!, ids[(i + Math.floor(n / 3)) % n]!] as const);
  return { ids, pairs };
}

const CASES: ReadonlyArray<readonly [number, string]> = [
  [12, 'n12'],   // well below the switch
  [59, 'n59'],   // the last exact-pass size
  [60, 'n60'],   // the first Barnes-Hut size
  [140, 'n140'], // comfortably inside Barnes-Hut
];

describe('L-8430 — the 2-D layout is BIT-IDENTICAL to the pre-refactor implementation', () => {
  for (const [n, key] of CASES) {
    it(`n=${n} (${n < EXACT_BELOW ? 'exact O(n²)' : 'Barnes-Hut'}) reproduces the captured baseline exactly`, () => {
      const { ids, pairs } = ring(n);
      const pos = forceLayout(ids, pairs, W, H);
      const expected = (baseline as unknown as Record<string, Record<string, number[]>>)[key]!;

      expect(pos.size).toBe(Object.keys(expected).length);
      for (const [id, xy] of Object.entries(expected)) {
        const got = pos.get(id);
        expect(got, `${id} missing`).toBeDefined();
        // ⛔ toBe, deliberately. See this file's header.
        expect(got!.x, `${key}/${id}.x`).toBe(xy[0]!);
        expect(got!.y, `${key}/${id}.y`).toBe(xy[1]!);
      }
    });
  }

  it('⛔ the switch really is at 60 — 59 and 60 take different code paths', () => {
    // Differentiating: if the branch moved, one of the two baseline arms above
    // would be comparing the wrong algorithm's output and would already be red.
    expect(EXACT_BELOW).toBe(60);
  });
});

describe('L-8431 — the 3-D layout: deterministic, bounded, and genuinely three-dimensional', () => {
  it('returns a position per node, inside the padded box on every axis', () => {
    const { ids, pairs } = ring(80);
    const pos = forceLayout3D(ids, pairs, 400, 400, 400);
    expect(pos.size).toBe(80);
    for (const [id, [x, y, z]] of pos) {
      for (const [axis, v] of [['x', x], ['y', y], ['z', z]] as const) {
        expect(v, `${id}.${axis} below the pad`).toBeGreaterThanOrEqual(44);
        expect(v, `${id}.${axis} above the pad`).toBeLessThanOrEqual(400 - 44);
        expect(Number.isFinite(v), `${id}.${axis} not finite`).toBe(true);
      }
    }
  });

  it('⭐ is DETERMINISTIC — two runs over one graph are identical', () => {
    // The property the whole surface depends on: without it, two openings of the
    // same model produce two different pictures and nothing can be compared.
    const { ids, pairs } = ring(90);
    const a = forceLayout3D(ids, pairs, 300, 300, 300);
    const b = forceLayout3D(ids, pairs, 300, 300, 300);
    for (const [id, p] of a) expect(b.get(id)).toEqual(p);
  });

  it('⛔ actually USES the third dimension — it is not a slab', () => {
    // A generalisation that silently collapsed z would still pass every bounds
    // check above while drawing a flat picture in a 3-D viewport.
    const { ids, pairs } = ring(100);
    const pos = forceLayout3D(ids, pairs, 400, 400, 400);
    const zs = [...pos.values()].map((p) => p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(40);
  });

  it('handles the degenerate inputs a real model produces', () => {
    expect(forceLayout3D([], [], 300, 300).size).toBe(0);
    // One node: the Fibonacci seed must not divide by zero or emit NaN.
    const one = forceLayout3D(['solo'], [], 300, 300);
    for (const v of one.get('solo')!) expect(Number.isFinite(v)).toBe(true);
    // Coincident ids exercise the depth-24 floor in the tree rather than blowing
    // the stack — the case the original 2-D implementation guarded for the same
    // reason, now guarded once for both dimensionalities.
    const dup = Array.from({ length: 80 }, () => 'same');
    expect(() => forceLayout3D(dup, [], 300, 300)).not.toThrow();
  });

  it('⭐ ONE implementation serves both — `layoutND` is dimension-driven, not hard-coded', () => {
    // Differentiating: if a second tree were ever added for 3-D, this call would
    // stop being the shared path and the 2-D baseline arms above would no longer
    // be testing what the SVG card runs.
    const { ids, pairs } = ring(70);
    const via2d = layoutND(ids, pairs, [W, H]);
    const viaWrapper = forceLayout(ids, pairs, W, H);
    for (const [id, p] of via2d) {
      expect(viaWrapper.get(id)!.x).toBe(p[0]);
      expect(viaWrapper.get(id)!.y).toBe(p[1]);
    }
  });
});
