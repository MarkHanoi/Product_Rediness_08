// GE-12 / C73 §3.7 — THE ORACLE, FROM THE AUTO-DIMENSION SIDE.
//
// WHY THIS FILE EXISTS SEPARATELY. The `planar-topology-engine` family had TWO shipping
// bodies and the founder ruled that both must consume ONE extracted implementation
// (`@pryzm/geometry-kernel/pure/planarFaceWalk`). "Both callers agree" cannot be asserted
// in one file — `room-topology` pulls THREE through its barrel and `auto-dimension`
// forbids it — so it is asserted the only honest way: BOTH SIDES ARE PINNED TO THE SAME
// HAND-COMPUTED ANSWER. `packages/room-topology/src/__tests__/planarTopologyOracle.test.ts`
// asserts a 6×4 rectangle is one room of exactly 24 m² and that its enclosing face is
// −24; this file asserts that the same 6×4 rectangle, entered as WALLS and taken through
// this package's adapter, comes back as a perimeter ring of exactly −24 over the same
// four corners. Two adapters, one known answer.
//
// EVERY EXPECTATION IS HAND-COMPUTABLE — shoelace on integer coordinates. No golden file,
// no snapshot, no value captured from the implementation under test.
//
// EACH ARM IS DELIBERATELY SEMANTICS-SENSITIVE, and each was watched failing against a
// deliberately wrong source before being committed (gates doc §2.2 — an arm never watched
// failing is UNPROVEN). ARM B fails if the outer-face policy silently becomes singular
// (L-268 returning); ARM C fails if a face-area filter is smuggled into the walk; ARM D
// fails if the seed order or the angular tiebreak stops being deterministic.

import { describe, it, expect } from 'vitest';
import { tracePlanarFacesXZ, planarRingSignedAreaXZ } from '@pryzm/geometry-kernel/pure/planarFaceWalk';
import { buildGraph, tracePerimeter, tracePerimeters, dimGraphComponents } from '../src/perimeter.js';
import { partitionBuildings } from '../src/buildings.js';
import type { AutoDimWall } from '../src/types.js';

/** An axis-aligned rectangular footprint of 4 walls at (ox, oz), w × d. */
function rect(prefix: string, ox: number, oz: number, w: number, d: number): AutoDimWall[] {
  const c = [
    { x: ox, z: oz },
    { x: ox + w, z: oz },
    { x: ox + w, z: oz + d },
    { x: ox, z: oz + d },
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

/** Shoelace of a traced ring, read back through the kernel's own accessor. */
function ringArea(ring: { nodeIds: readonly string[] }, graph: ReturnType<typeof buildGraph>): number {
  const pos = new Map(graph.nodes.map((n) => [n.id, n.point]));
  return planarRingSignedAreaXZ(ring.nodeIds, pos);
}

describe('auto-dimension ⇄ planarFaceWalk — the SAME known answer as the room-topology oracle', () => {
  // ── ARM A: the 6×4 rectangle, the identical fixture the other oracle uses ────
  it('ARM A — a 6×4 rectangle of walls yields ONE perimeter ring of exactly −24 m² over its four corners', () => {
    // A(0,0) B(6,0) C(6,4) D(0,4). Shoelace = 24 m²; the PERIMETER is the enclosing face
    // and therefore comes back CLOCKWISE, at −24 exactly. `room-topology`'s ARM 1 asserts
    // the same rectangle is one ROOM of +24. Same geometry, same walk, both sides pinned.
    const walls = rect('r', 0, 0, 6, 4);
    const graph = buildGraph(walls, 0.2);

    const rings = tracePerimeters(graph);
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0]!, graph)).toBeCloseTo(-24, 9);
    expect(rings[0]!.nodeIds).toHaveLength(4);
    expect(new Set(rings[0]!.wallIds).size).toBe(4);

    // And the walk sees exactly two faces summing to zero — +24 in, −24 out.
    const pos = new Map(graph.nodes.map((n) => [n.id, n.point]));
    const faces = tracePlanarFacesXZ({
      positions: pos,
      edges: [...graph.wallNodes.entries()].map(([id, e]) => ({ id, ...e })),
    });
    expect(faces.map((f) => Number(f.signedAreaM2.toFixed(6))).sort((a, b) => a - b)).toEqual([-24, 24]);
  });

  // ── ARM B: §PTE-OUTER-FACE — the policy split, at two EQUAL footprints ───────
  it('ARM B — two congruent 6×4 footprints: POLICY A keeps one, POLICY B keeps both (L-268)', () => {
    // Congruent ON PURPOSE. Both outer faces are −24, so "most negative" TIES, which is
    // exactly the case §PTE-TIEBREAK (T4) exists for and the case a "largest wins" rule
    // cannot even express. tracePerimeter (POLICY A, singular by design) must return ONE;
    // tracePerimeters (POLICY B) must return BOTH. If these ever agree, L-268 is back.
    const walls = [...rect('aa', 0, 0, 6, 4), ...rect('bb', 20, 0, 6, 4)];
    const graph = buildGraph(walls, 0.2);

    const single = tracePerimeter(graph)!;
    expect(single).not.toBeNull();
    expect(ringArea(single, graph)).toBeCloseTo(-24, 9);
    // One footprint's walls only — the other is discarded, which IS the L-268 defect,
    // asserted rather than described.
    const prefixes = new Set(single.wallIds.map((id) => id.split('_')[0]));
    expect(prefixes.size).toBe(1);

    const both = tracePerimeters(graph);
    expect(both).toHaveLength(2);
    expect(both.map((r) => Number(ringArea(r, graph).toFixed(6)))).toEqual([-24, -24]);
    expect(
      both.map((r) => [...new Set(r.wallIds.map((id) => id.split('_')[0]))].join('')).sort(),
    ).toEqual(['aa', 'bb']);
  });

  // ── ARM C: §PTE-FILTERED — this package passes NO face-area filter, and needs to ──
  it('ARM C — a 0.36 m² footprint still yields a perimeter (no face-area filter is smuggled into the walk)', () => {
    // 0.6 × 0.6 = 0.36 m². THE DRIFT AXIS: `room-topology` dropped faces below 0.1 m²
    // inside the walk; this package dropped nothing. Had the extraction adopted
    // room-topology's constant as the walk's default, a small structure would silently
    // stop being dimensioned. It does not — the only area judgement on this path is
    // `buildings.ts`'s 1e-6 degeneracy guard, four orders of magnitude below this.
    const graph = buildGraph(rect('tiny', 0, 0, 0.6, 0.6), 0.05);
    const rings = tracePerimeters(graph);
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0]!, graph)).toBeCloseTo(-0.36, 9);

    const { buildings, hasPerimeter } = partitionBuildings(rect('tiny', 0, 0, 0.6, 0.6), 0.05);
    expect(hasPerimeter).toBe(true);
    expect(buildings).toHaveLength(1);
  });

  // ── ARM D: §PTE-TIEBREAK — determinism is a property, not a habit ────────────
  it('ARM D — presenting the walls in a different order yields byte-identical rings and component keys', () => {
    const walls = [...rect('aa', 0, 0, 6, 4), ...rect('bb', 20, 0, 6, 4)];
    const forward = buildGraph(walls, 0.2);
    const backward = buildGraph([...walls].reverse(), 0.2);

    expect(JSON.stringify(tracePerimeters(backward))).toBe(JSON.stringify(tracePerimeters(forward)));

    // The component key is the component's lexicographically smallest node id, and
    // `BuildingFootprint.id` IS that key — so this pins the building identity contract
    // that `buildings.ts` depends on, now that both resolve through the same kernel body.
    const a = dimGraphComponents(forward);
    const b = dimGraphComponents(backward);
    expect([...new Set(b.values())].sort()).toEqual([...new Set(a.values())].sort());
    for (const [nodeId, key] of a) expect(b.get(nodeId)).toBe(key);

    // End to end: the same two buildings, same ids, whichever order the walls arrive in.
    const p1 = partitionBuildings(walls, 0.2);
    const p2 = partitionBuildings([...walls].reverse(), 0.2);
    expect(p1.buildings.map((x) => x.id)).toEqual(p2.buildings.map((x) => x.id));
    expect(p1.buildings).toHaveLength(2);
  });

  // ── ARM F: the TRAVERSAL RULE, which no rectangle in this file can see ──────
  it('ARM F — an interior partition (degree-3 nodes) still yields ONE −24 m² perimeter, not an interior 12 m² face', () => {
    // WHY THIS ARM EXISTS, MEASURED NOT ASSUMED. With the next-half-edge rule
    // deliberately broken from `(uIdx - 1 + n) % n` to `(uIdx + 1) % n`, the
    // room-topology oracle went RED on three arms and EVERY arm in this file stayed
    // GREEN. Every fixture here was a rectangle, and a rectangle has only degree-2
    // nodes — there is no "immediately clockwise of where I came from" to get wrong
    // when there is only one other way to go. The engine's own header has said so since
    // ARM 2 was written; this file had not taken the point, and auto-dimension is the
    // half that SHIPS (applyAutoDimensions.ts:50 → planAutoDimensions →
    // buildings.ts:103 → tracePerimeters).
    //
    // THE KNOWN ANSWER. A 6×4 rectangle with a spine wall at x = 3:
    //   A(0,0) M1(3,0) B(6,0) C(6,4) M2(3,4) D(0,4), plus the spine M1–M2.
    // Three faces: two interior cells of exactly 12 m² each, and the enclosing face at
    // exactly −24 m². `tracePerimeters` must return the ENCLOSING one — one component,
    // one perimeter, six corners. Returning a 12 m² cell would mean dimensioning an
    // interior room as though it were the building.
    const walls: AutoDimWall[] = ([
      ['A', 0, 0, 3, 0], ['M1', 3, 0, 6, 0], ['B', 6, 0, 6, 4],
      ['C', 6, 4, 3, 4], ['M2', 3, 4, 0, 4], ['D', 0, 4, 0, 0],
      ['S', 3, 0, 3, 4], // the spine — this is what makes M1 and M2 degree-3
    ] as Array<[string, number, number, number, number]>).map(([id, ax, az, bx, bz]) => ({
      id: `sp_${id}`,
      a: { x: ax, z: az },
      b: { x: bx, z: bz },
      thickness: 0.2,
      levelId: 'L0',
      openings: [],
    }));

    const graph = buildGraph(walls, 0.05);

    // The walk sees all three faces, and they sum to zero — no area invented, none lost.
    const pos = new Map(graph.nodes.map((n) => [n.id, n.point]));
    const faces = tracePlanarFacesXZ({
      positions: pos,
      edges: [...graph.wallNodes.entries()].map(([id, e]) => ({ id, ...e })),
    });
    expect(faces.map((f) => Number(f.signedAreaM2.toFixed(6))).sort((a, b) => a - b))
      .toEqual([-24, 12, 12]);
    expect(faces.reduce((s, f) => s + f.signedAreaM2, 0)).toBeCloseTo(0, 9);

    // ONE building, and its perimeter is the OUTER ring — six nodes, −24 m². Not a
    // 12 m² interior cell.
    const rings = tracePerimeters(graph);
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0]!, graph)).toBeCloseTo(-24, 9);
    expect(rings[0]!.nodeIds).toHaveLength(6);
    // The spine is interior: it bounds no part of the perimeter ring.
    expect(rings[0]!.wallIds).not.toContain('sp_S');

    const { buildings, hasPerimeter } = partitionBuildings(walls, 0.05);
    expect(hasPerimeter).toBe(true);
    expect(buildings).toHaveLength(1);
    // "This building's walls" means ALL of them, the interior partition included.
    expect(buildings[0]!.wallIds).toContain('sp_S');
    expect(buildings[0]!.wallIds).toHaveLength(7);
  });

  // ── ARM E: the refusing half — and WHERE the refusal lives ──────────────────
  it('ARM E — an open polyline traces a DEGENERATE zero-area ring, and the BUILDING guard is what refuses', () => {
    // The mirror of the room-topology oracle's ARM 5, one adapter over — but the two
    // packages refuse in DIFFERENT PLACES, and pretending otherwise is how this drifts.
    // (This arm was WRITTEN asserting zero rings, and MEASURED one. The measurement was
    // right and the assumption was wrong: the ring is pre-existing behaviour, documented
    // at `buildings.ts:135-141` and unchanged by the extraction.)
    //
    // `room-topology` refuses inside the walk: its 0.1 m² face filter eats the
    // out-and-back ring, so its ARM 5 sees zero rooms and a null outer face.
    //
    // `auto-dimension` passes NO face filter (§PTE-FILTERED; ARM C is why), so the walk
    // hands it exactly what a half-edge walk over an open run of walls IS: a ring that
    // goes out along the polyline and comes back, enclosing NOTHING — area 0 to the last
    // bit. The refusal is `buildings.ts:142`, MIN_BUILDING_AREA_M2 = 1e-6, where the word
    // BUILDING is in scope and "must enclose area" is a statement about the domain rather
    // than about topology.
    //
    // THIS ARM PINS THAT SPLIT. If the zero-area ring is later "tidied away" inside the
    // kernel, `room-topology` would not notice and `auto-dimension` would lose the only
    // evidence that its own guard is load-bearing.
    const open = rect('r', 0, 0, 6, 4).slice(0, 2);
    const graph = buildGraph(open, 0.2);

    const rings = tracePerimeters(graph);
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0]!, graph)).toBe(0);
    // Out and back (A→B→C→B), so the ring necessarily repeats a node.
    expect(rings[0]!.nodeIds.length).toBeGreaterThan(new Set(rings[0]!.nodeIds).size);

    const { buildings, hasPerimeter } = partitionBuildings(open, 0.2);
    expect(hasPerimeter).toBe(false);
    expect(buildings).toHaveLength(0);
  });
});
