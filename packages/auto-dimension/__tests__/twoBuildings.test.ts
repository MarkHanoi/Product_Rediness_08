// §FIX-AUTODIM-MULTI-BUILDING (L-268) — auto-dimension dimensioned ONE of two buildings.
//
// The founder has two disjoint footprints on one level. Only one was dimensioned, and
// NOTHING said so. This file REPRODUCES that before it fixes it, because the root cause
// was asserted three different ways on this project and guessed wrong more than once.
//
// PROVEN ROOT CAUSE (`perimeter.ts:tracePerimeter`): the half-edge walk correctly traces
// a closed face for BOTH footprints, then this happens —
//
//     let outer: Ring | null = null;
//     let outerArea = Infinity;
//     for (const f of faces) {
//       const a = signedArea(f.nodeIds, pos);
//       if (a < outerArea) { outerArea = a; outer = f; }   // ← keeps ONE
//     }
//     return outer;
//
// It keeps the single MOST-NEGATIVE signed-area face — i.e. the LARGEST footprint — and
// silently discards every other one. It is not a "first loop wins" bug and not a
// bbox-collinearity bug: it is **largest-component collapse**, and the smaller building
// is thrown away with no warning. The engine's whole notion of "the perimeter" is
// singular; there is NO notion of a BUILDING anywhere in the documentation layer.

import { describe, it, expect } from 'vitest';
import { planAutoDimensions, partitionBuildings } from '../src/index.js';
import { buildGraph, tracePerimeter, tracePerimeters } from '../src/perimeter.js';
import type { AutoDimSnapshot, AutoDimWall } from '../src/types.js';

/** An axis-aligned rectangular footprint of 4 walls, at (ox, oz), w × d. */
function rect(prefix: string, ox: number, oz: number, w: number, d: number): AutoDimWall[] {
  const c = [
    { x: ox,     z: oz },
    { x: ox + w, z: oz },
    { x: ox + w, z: oz + d },
    { x: ox,     z: oz + d },
  ];
  return c.map((a, i) => ({
    id: `${prefix}_w${i}`,
    a,
    b: c[(i + 1) % 4]!,
    thickness: 0.2,
    levelId: 'L0',
    openings: [],
  }));
}

/** BIG building 10×8 at the origin; SMALL building 6×5 well clear of it. */
const BIG = rect('big', 0, 0, 10, 8);
const SMALL = rect('small', 20, 0, 6, 5);
const TWO_BUILDINGS: AutoDimSnapshot = { walls: [...BIG, ...SMALL] };

describe('L-268 — the disjoint-footprint collapse, reproduced', () => {
  it('tracePerimeter (the OLD singular API) returns only ONE footprint — the LARGER', () => {
    const graph = buildGraph(TWO_BUILDINGS.walls, 0.2);
    const ring = tracePerimeter(graph);
    expect(ring).not.toBeNull();
    // Every wall in the surviving ring belongs to the BIG building. The small building
    // is silently gone. THIS IS THE BUG, asserted rather than described.
    const survivors = new Set(ring!.wallIds);
    expect([...survivors].every((id) => id.startsWith('big_'))).toBe(true);
    expect([...survivors].some((id) => id.startsWith('small_'))).toBe(false);
  });
});

describe('L-268 — tracePerimeters partitions ALWAYS (N = 1 is not a special case)', () => {
  it('finds BOTH footprints', () => {
    const graph = buildGraph(TWO_BUILDINGS.walls, 0.2);
    const rings = tracePerimeters(graph);
    expect(rings).toHaveLength(2);

    const wallSets = rings.map((r) => new Set(r.wallIds));
    const hasBig = wallSets.some((s) => [...s].every((id) => id.startsWith('big_')) && s.size === 4);
    const hasSmall = wallSets.some((s) => [...s].every((id) => id.startsWith('small_')) && s.size === 4);
    expect(hasBig).toBe(true);
    expect(hasSmall).toBe(true);
  });

  it('a SINGLE building goes down the SAME code path and yields exactly one footprint', () => {
    // The whole point: there is no "if two buildings" branch. One building is N = 1.
    const graph = buildGraph(BIG, 0.2);
    const rings = tracePerimeters(graph);
    expect(rings).toHaveLength(1);
    expect(new Set(rings[0]!.wallIds).size).toBe(4);
  });

  it('is deterministic — footprints come back in a stable order', () => {
    const g1 = buildGraph(TWO_BUILDINGS.walls, 0.2);
    const g2 = buildGraph(TWO_BUILDINGS.walls, 0.2);
    expect(JSON.stringify(tracePerimeters(g1))).toBe(JSON.stringify(tracePerimeters(g2)));
  });
});

describe('L-268 — planAutoDimensions dimensions EVERY building', () => {
  it('emits dimension strings covering BOTH footprints, not just the larger', () => {
    const { strings, report } = planAutoDimensions(TWO_BUILDINGS, { viewId: 'v1', levelId: 'L0' });

    const referenced = new Set<string>();
    for (const s of strings) for (const r of s.references) referenced.add(r.elementId as string);

    const touchedBig = [...referenced].some((id) => id.startsWith('big_'));
    const touchedSmall = [...referenced].some((id) => id.startsWith('small_'));

    expect(touchedBig).toBe(true);
    // Before the fix this was FALSE — the founder's second building, undimensioned.
    expect(touchedSmall).toBe(true);

    // Each building gets its own overall dims — they are separate buildings, so an
    // "overall" spanning both would be a meaningless number across a gap.
    expect(report.coverage.runCount).toBeGreaterThanOrEqual(8);
  });

  it('reports the building count so partial coverage can never be silent again', () => {
    const { report } = planAutoDimensions(TWO_BUILDINGS, { viewId: 'v1', levelId: 'L0' });
    expect(report.coverage.buildingCount).toBe(2);
  });

  it('one building still reports buildingCount = 1 (same path, no special case)', () => {
    const { report } = planAutoDimensions({ walls: BIG }, { viewId: 'v1', levelId: 'L0' });
    expect(report.coverage.buildingCount).toBe(1);
  });
});

// ── The BUILDING as a SHARED domain concept, not a private detail of the plan planner ──
//
// L-268's real lesson is not "auto-dimension needed a loop". It is that the documentation
// layer had no notion of a BUILDING, so every consumer that ever needs one (elevation
// auto-dim L-263, auto-tag L-265, interior elevations, schedules C28) would have had to
// re-derive a perimeter — and would have re-derived the SINGULAR one, reintroducing this
// exact bug. `partitionBuildings` is therefore exported from the package barrel. These
// tests pin the contract those consumers depend on.
describe('L-268 — partitionBuildings is the shared domain concept', () => {
  it('is reachable from the package barrel (auto-tag / elevations consume THIS)', () => {
    expect(typeof partitionBuildings).toBe('function');
  });

  it('partitions two footprints, each carrying its OWN walls, hull and runs', () => {
    const { buildings, hasPerimeter } = partitionBuildings(TWO_BUILDINGS.walls, 0.2);
    expect(hasPerimeter).toBe(true);
    expect(buildings).toHaveLength(2);

    for (const b of buildings) {
      // Each building's hull is its OWN — a hull averaged across both would be the bug.
      expect(b.perimPolygon.length).toBeGreaterThanOrEqual(3);
      expect(b.runs.length).toBeGreaterThanOrEqual(4);
      const prefixes = new Set(b.wallIds.map((id) => id.split('_')[0]));
      expect(prefixes.size).toBe(1); // never mixes two buildings' walls
    }

    const owners = buildings.map((b) => b.wallIds[0]!.split('_')[0]).sort();
    expect(owners).toEqual(['big', 'small']);
  });

  it('N = 1 travels the SAME path — one building, no special case', () => {
    const { buildings, hasPerimeter } = partitionBuildings(BIG, 0.2);
    expect(hasPerimeter).toBe(true);
    expect(buildings).toHaveLength(1);
    expect(buildings[0]!.wallIds).toHaveLength(4);
  });

  it('an INTERIOR partition belongs to its building — "this building\'s walls" means ALL of them', () => {
    // A tag or a schedule asking for a building's walls means the partitions too, not
    // just the façade. The interior wall spans the BIG rect and touches no perimeter node
    // except at its ends, so it must land in BIG's component and in NEITHER of SMALL's.
    const interior: AutoDimWall = {
      id: 'big_interior',
      a: { x: 0, z: 4 },
      b: { x: 10, z: 4 },
      thickness: 0.1,
      levelId: 'L0',
      openings: [],
    };
    const { buildings } = partitionBuildings([...BIG, interior, ...SMALL], 0.2);
    expect(buildings).toHaveLength(2);

    const big = buildings.find((b) => b.wallIds.some((id) => id === 'big_w0'))!;
    const small = buildings.find((b) => b.wallIds.some((id) => id === 'small_w0'))!;
    expect(big.wallIds).toContain('big_interior');
    expect(small.wallIds).not.toContain('big_interior');
  });

  it('has a deterministic, stable identity per building (same input → same ids)', () => {
    const a = partitionBuildings(TWO_BUILDINGS.walls, 0.2);
    const b = partitionBuildings([...SMALL, ...BIG], 0.2); // walls presented in a DIFFERENT order
    expect(a.buildings.map((x) => x.id).sort()).toEqual(b.buildings.map((x) => x.id).sort());
  });

  it('an OPEN footprint yields no closed building and says so (caller falls back per-wall)', () => {
    const open = BIG.slice(0, 2); // two walls — an open run, no closed face
    const { buildings, hasPerimeter } = partitionBuildings(open, 0.2);
    expect(hasPerimeter).toBe(false);
    expect(buildings).toHaveLength(0);
  });
});
