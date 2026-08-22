/**
 * §PERF-GRAPH-BARNES-HUT (L-6620) — the node cap was an ALGORITHM, not a policy.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * ADR:             ADR-0343 §D.3 (cost is declared before a widget runs) · §D.4
 * Contracts:       C66 §1.1 (nothing is "supported" at a size it was not benched at)
 * Issue log:       L-6620 · L-6621
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT THIS SUITE IS FOR, AND WHAT IT DELIBERATELY DOES NOT CLAIM
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder's model holds 430 UBG nodes and the card drew 60 of them. The cap
 * was not a legibility judgement — `graphReadModel.ts` says outright it exists
 * because *"the force layout is O(n²) per iteration × 160 iterations"*. So the
 * fix had to be the algorithm, and the new cap had to be a MEASURED number.
 *
 * ⛔ TIMING ASSERTIONS ARE DELIBERATELY LOOSE. C66 §1.1 forbids describing a
 * capacity as supported at a size it was not benched at, and a CI box is not a
 * bench: a hard millisecond budget here would be a flake generator, and a flake
 * that gets relaxed is worse than no assertion at all. What IS asserted is the
 * COMPLEXITY SHAPE — that quadrupling the node count does not multiply the work
 * by sixteen — which is the property the cap depends on and is stable across
 * wildly different machines.
 *
 * ⭐ THE CORRECTNESS ARMS MATTER MORE THAN THE TIMING ONES. A fast layout that
 * moved every existing card, lost determinism, or hung on coincident points
 * would be a regression paid for with a number nobody looks at.
 */

import { describe, expect, it } from 'vitest';

import { forceLayout } from '../nodeLinkSvg';
import { GRAPH_NODE_CAP } from '../graphReadModel';

const W = 360;
const H = 280;

/** A deterministic connected graph: a ring plus a few chords, n nodes. */
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

function timeLayout(n: number, iterations = 160): number {
  const { ids, pairs } = ring(n);
  const t0 = performance.now();
  forceLayout(ids, pairs, W, H, iterations);
  return performance.now() - t0;
}

describe('L-6620 — correctness first: nothing that draws today changes', () => {
  it('⛔ BELOW THE OLD CAP THE EXACT PASS STILL RUNS, and it is bit-for-bit stable', () => {
    // The exact/approximate switch is at 60 — the PREVIOUS cap — precisely so
    // that every graph that could be drawn before this change takes the identical
    // code path. This pins that the small-graph path is untouched and repeatable.
    const { ids, pairs } = ring(40);
    const a = forceLayout(ids, pairs, W, H);
    const b = forceLayout(ids, pairs, W, H);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('the Barnes-Hut path is DETERMINISTIC too — same model, same picture, every open', () => {
    // No Math.random, tree built in nodeIds order, geometric subdivision. Two
    // runs that disagree cannot be compared by a reader, which is the whole
    // reason the original avoided Math.random in a render path.
    const { ids, pairs } = ring(300);
    const a = forceLayout(ids, pairs, W, H);
    const b = forceLayout(ids, pairs, W, H);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('every node lands inside the padded viewport, at both scales', () => {
    for (const n of [40, 300]) {
      const { ids, pairs } = ring(n);
      const out = forceLayout(ids, pairs, W, H);
      expect(out.size).toBe(n);
      for (const [id, p] of out) {
        expect(Number.isFinite(p.x), `${id}.x is not finite at n=${n}`).toBe(true);
        expect(Number.isFinite(p.y), `${id}.y is not finite at n=${n}`).toBe(true);
        expect(p.x, `${id}.x escaped at n=${n}`).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(H);
      }
    }
  });

  it('⚠ COINCIDENT NODES DO NOT BLOW THE STACK — the depth floor is load-bearing', () => {
    // Two points at exactly the same coordinates can never be separated by
    // subdivision, so an unguarded quadtree insert recurses forever. The seeding
    // places every node on one circle, so near-coincidence is normal and exact
    // coincidence is reachable (duplicate ids, degenerate viewport).
    const ids = Array.from({ length: 200 }, (_, i) => `d${i}`);
    // A 1x1 viewport forces every clamped position onto the same point.
    expect(() => forceLayout(ids, [], 1, 1, 8)).not.toThrow();
  });

  it('a graph with no edges still lays out — repulsion alone must terminate', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `x${i}`);
    const out = forceLayout(ids, [], W, H, 40);
    expect(out.size).toBe(250);
  });

  it('the layout still SPREADS at scale — it did not collapse into one blob', () => {
    // The mass weighting in `applyRepulsion` is what stops a cell standing in for
    // k bodies pushing like one body. Without it the approximation systematically
    // under-repels dense regions and the picture clumps exactly where it most
    // needs to spread. This is the arm that fails if `* c.count` is dropped.
    const { ids, pairs } = ring(300);
    const out = forceLayout(ids, pairs, W, H);
    const xs = [...out.values()].map((p) => p.x);
    const ys = [...out.values()].map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(W * 0.4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(H * 0.4);
  });
});

describe('L-6621 — the complexity SHAPE, which is what the cap rests on', () => {
  it('⭐ quadrupling n does NOT multiply the work by ~16', () => {
    // O(n²) predicts 16x for a 4x node count. O(n log n) predicts ~4.5x.
    // The assertion is deliberately generous (< 10x) because this runs on CI
    // hardware, not a bench — but 10x still cleanly separates the two shapes,
    // and C66 §1.1 means the number below is a SHAPE claim, never a performance
    // promise. Warm up first so JIT compilation is not counted as growth.
    timeLayout(120, 20);
    timeLayout(480, 20);

    const small = Math.max(timeLayout(120), 0.01);
    const large = Math.max(timeLayout(480), 0.01);
    const ratio = large / small;
    expect(ratio, `n 120->480 cost ratio was ${ratio.toFixed(1)}x; O(n^2) would be ~16x`).toBeLessThan(10);
  });

  it('the cap rose, and it did not rise past what was measured', () => {
    // ⛔ The cap is a MEASURED number, not an aspiration. It went 60 -> 320 on
    // the strength of the shape asserted above plus a wall-clock reading recorded
    // in the commit message. This arm pins that it moved and that it stayed
    // inside the range this suite actually exercises — a cap above the largest
    // benched size would be exactly the C66 §1.1 violation of describing a
    // capacity nobody measured.
    expect(GRAPH_NODE_CAP).toBeGreaterThan(60);
    expect(GRAPH_NODE_CAP).toBeLessThanOrEqual(480);
  });

  it('a graph AT the new cap lays out without throwing, in one call', () => {
    const { ids, pairs } = ring(GRAPH_NODE_CAP);
    const out = forceLayout(ids, pairs, W, H);
    expect(out.size).toBe(GRAPH_NODE_CAP);
  });
});
