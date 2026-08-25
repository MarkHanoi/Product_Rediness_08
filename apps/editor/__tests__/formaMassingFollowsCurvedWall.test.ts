// §MASSING-FOLLOWS-THE-ARC (L-11172, lane MASSCURVE71, 2026-08-25) — the globe massing of a
// level with ONE curved shell wall follows the Bézier, and a straight-only level is untouched.
//
// THE LAYER THIS PROVES AT. `reconstructPerimeterRingFromWalls` returns the ring the storey
// prism is extruded over and the ring the façade study samples — it is the shape the user sees
// on the globe. Before this lane it walked `a → b` chords, so a rounded corner authored as ONE
// curved wall (§RESI-ROUNDED-CORNERS, L-11130/L-11170) was CUT STRAIGHT across its tangent
// points: the founder's building read rounded in the BIM scene and in its slab plate, and
// chamfered in its massing, by the arc's sagitta (≈ 1.2 m at r = 4).
//
// ORACLE ≠ SUBJECT. The Bézier is sampled LONGHAND here (its own closed form, 8192 samples), so
// the assertions do not pass merely because the subject and the oracle share a function. The
// only repo helper the oracle borrows is `bezierControlFromMidpoint`, to author the control the
// way the generator does (through the clicked midpoint) — the same way L-11171 authored it.
//
// Node env, no Cesium / THREE / DOM: the modules under test are pure by construction.

import { describe, it, expect } from 'vitest';
import {
  reconstructPerimeterRingFromWalls,
  PERIMETER_NODE_SNAP_M,
} from '../src/ui/geospatial/formaPerimeterRing';
import {
  expandFormaWallsToChords,
  formaWallFromRecord,
  massingWallCentreline,
  MASSING_ARC_MIN_CHORD_M,
  type FormaMassingWall,
  type FormaXZ,
} from '../src/ui/geospatial/formaWallCurve';
import { buildingGeometrySignature } from '../src/ui/geospatial/formaBuildingFidelity';
import { bezierControlFromMidpoint } from '@pryzm/geometry-slab/boundary-arc';
import { ARC_SAGITTA_TARGET_M } from '@pryzm/core-app-model/curved-wall-tessellation';

// ── the longhand oracle ─────────────────────────────────────────────────────────────────────
const bez = (S: FormaXZ, C: FormaXZ, E: FormaXZ, t: number): FormaXZ => {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
  return { x: a * S.x + b * C.x + d * E.x, z: a * S.z + b * C.z + d * E.z };
};
/** Min distance from `p` to the Bézier, by dense sampling (8192 → sampling error ≪ 1 mm here). */
function distToBezier(p: FormaXZ, S: FormaXZ, C: FormaXZ, E: FormaXZ, N = 8192): number {
  let best = Infinity;
  for (let i = 0; i <= N; i++) {
    const q = bez(S, C, E, i / N);
    best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
  }
  return best;
}
function distToSegment(p: FormaXZ, a: FormaXZ, b: FormaXZ): number {
  const ex = b.x - a.x, ez = b.z - a.z;
  const len2 = ex * ex + ez * ez;
  let t = len2 > 0 ? ((p.x - a.x) * ex + (p.z - a.z) * ez) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * ex), p.z - (a.z + t * ez));
}
/** Min distance from `p` to a CLOSED ring's polyline. */
function distToRing(p: FormaXZ, ring: ReadonlyArray<FormaXZ>): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, distToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return best;
}
const same = (p: FormaXZ, q: FormaXZ, eps = 1e-9): boolean => Math.hypot(p.x - q.x, p.z - q.z) <= eps;

// ── the founder's shape: a 30 × 12 block with its (30, 12) corner rounded at r = 4 ─────────
// Tangent points S = (30, 8) on the east façade and E = (26, 12) on the north façade; the arc's
// clicked midpoint M sits on the r = 4 circle about (26, 8) at 45°. The generator authors the
// control THROUGH M (L-11171 K-3: `curve.control = bezierControlFromMidpoint(S, M, E)`).
const A = { x: 0, z: 0 }, B = { x: 30, z: 0 }, S = { x: 30, z: 8 }, E = { x: 26, z: 12 }, D = { x: 0, z: 12 };
const M = { x: 26 + 4 * Math.SQRT1_2, z: 8 + 4 * Math.SQRT1_2 };
const CONTROL = bezierControlFromMidpoint(S, M, E);
const wall = (a: FormaXZ, b: FormaXZ, extra: Partial<FormaMassingWall> = {}): FormaMassingWall => ({
  a, b, height: 3, thickness: 0.2, baseElevation: 0, levelId: 'L0', materialColor: '#d4c5b0', ...extra,
});
const curvedLevel = (): FormaMassingWall[] => [
  wall(A, B), wall(B, S),
  wall(S, E, { curve: { control: CONTROL, segments: 32 } }),
  wall(E, D), wall(D, A),
];
const straightLevel = (): FormaMassingWall[] => [
  wall(A, B), wall(B, { x: 30, z: 12 }), wall({ x: 30, z: 12 }, D), wall(D, A),
];

describe('§MASSING-FOLLOWS-THE-ARC — a level with one curved shell wall', () => {
  it('produces a massing perimeter whose vertices lie ON the Bézier (≤ 1 cm), not on its chord', () => {
    const walls = curvedLevel();
    const ring = reconstructPerimeterRingFromWalls(walls);
    expect(ring).not.toBeNull();
    const r = ring!;

    // The arc contributes n chords ⇒ n − 1 interior vertices; the four straight corners/tangent
    // points contribute the rest. 32 was requested and the density authority never coarsens.
    const n = massingWallCentreline(walls[2]!).length - 1;
    expect(n).toBeGreaterThanOrEqual(32);
    expect(r.length).toBe(4 + n);

    const fixed = [A, B, S, E, D];
    let arcInterior = 0;
    for (const v of r) {
      if (fixed.some((f) => same(v, f))) continue;
      arcInterior++;
      expect(distToBezier(v, S, CONTROL, E)).toBeLessThanOrEqual(0.01);
    }
    expect(arcInterior).toBe(n - 1);

    // The old defect, stated as a number: the arc's midpoint was ≈ 1.2 m off the chord S→E.
    // Now it sits within the sagitta target of the ring polyline.
    const mid = bez(S, CONTROL, E, 0.5);
    expect(distToSegment(mid, S, E)).toBeGreaterThan(1.0);
    expect(distToRing(mid, r)).toBeLessThanOrEqual(ARC_SAGITTA_TARGET_M);
    // Every point of the authored arc is within the sagitta target of the massing ring.
    for (let i = 0; i <= 256; i++) {
      expect(distToRing(bez(S, CONTROL, E, i / 256), r)).toBeLessThanOrEqual(ARC_SAGITTA_TARGET_M + 1e-9);
    }
  });

  it('walks the arc ONCE, in order, between its tangent points (the chord run is contiguous)', () => {
    const walls = curvedLevel();
    const r = reconstructPerimeterRingFromWalls(walls)!;
    const chords = massingWallCentreline(walls[2]!); // S … E
    const iS = r.findIndex((v) => same(v, S));
    expect(iS).toBeGreaterThanOrEqual(0);
    const fwd = same(r[(iS + 1) % r.length]!, chords[1]!);
    const step = fwd ? 1 : -1;
    for (let k = 0; k < chords.length; k++) {
      const v = r[(iS + step * k + r.length * 4) % r.length]!;
      expect(same(v, chords[k]!)).toBe(true);
    }
  });

  it('keeps every chord node through the ring tracer’s 5 cm node grid, even on a tight fillet', () => {
    // The relation the density bound exists for: two points ≥ √2·grid apart never share a cell.
    expect(MASSING_ARC_MIN_CHORD_M).toBeGreaterThanOrEqual(Math.SQRT2 * PERIMETER_NODE_SNAP_M);
    // r = 0.5 m on a 10 × 6 block — the smallest fillet L-11173 says the generator still emits.
    const s = { x: 10, z: 5.5 }, e = { x: 9.5, z: 6 };
    const m = { x: 9.5 + 0.5 * Math.SQRT1_2, z: 5.5 + 0.5 * Math.SQRT1_2 };
    const c = bezierControlFromMidpoint(s, m, e);
    const tight: FormaMassingWall[] = [
      wall({ x: 0, z: 0 }, { x: 10, z: 0 }), wall({ x: 10, z: 0 }, s),
      wall(s, e, { curve: { control: c, segments: 16 } }),
      wall(e, { x: 0, z: 6 }), wall({ x: 0, z: 6 }, { x: 0, z: 0 }),
    ];
    const n = massingWallCentreline(tight[2]!).length - 1;
    expect(n).toBeGreaterThanOrEqual(2);
    const r = reconstructPerimeterRingFromWalls(tight)!;
    expect(r).not.toBeNull();
    expect(r.length).toBe(4 + n); // no chord vertex welded away
    // What survival actually needs: EVERY chord clears the grid's geometric requirement
    // (√2 · 5 cm ≈ 7.1 cm) with margin. The authority's `minChordLength` is a bound on the MEAN
    // chord (it estimates arc length, "within ~3% for quadratics"); a uniform-t fillet's end
    // chords are ~6 % shorter than its middle ones (measured: 0.141 m min, 0.15 m mean), so the
    // per-chord assertion is the grid's, and the bound is asserted on the mean.
    const pts = massingWallCentreline(tight[2]!);
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const chord = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z);
      expect(chord).toBeGreaterThan(Math.SQRT2 * PERIMETER_NODE_SNAP_M * 1.5);
      total += chord;
    }
    expect(total / (pts.length - 1)).toBeGreaterThan(MASSING_ARC_MIN_CHORD_M * 0.97);
  });

  it('samples a TRIMMED curved wall in its AUTHORED (pre-trim) frame, then clips to the trimmed span', () => {
    // As the join resolver would leave it: endpoints moved INWARD along the authored arc
    // (here to t = 0.08 and t = 0.92), control untouched, pre-trim baseline archived.
    const a = bez(S, CONTROL, E, 0.08), b = bez(S, CONTROL, E, 0.92);
    const trimmed = wall(a, b, { curve: { control: CONTROL, segments: 32, source: { a: S, b: E } } });
    const pts = massingWallCentreline(trimmed);
    // Starts and ends EXACTLY where the resolver put the ends (the trim is honoured)…
    expect(same(pts[0]!, a)).toBe(true);
    expect(same(pts[pts.length - 1]!, b)).toBe(true);
    // …and every interior vertex is on the AUTHORED curve (≤ 1 mm), NOT on a re-fit Bézier
    // through the trimmed ends with the untrimmed control — which is a different curve.
    let maxAuthored = 0, maxRefit = 0;
    for (const p of pts.slice(1, -1)) {
      maxAuthored = Math.max(maxAuthored, distToBezier(p, S, CONTROL, E));
      maxRefit = Math.max(maxRefit, distToBezier(p, a, CONTROL, b));
    }
    expect(maxAuthored).toBeLessThanOrEqual(0.001);
    expect(maxRefit).toBeGreaterThan(0.01);
  });
});

describe('§MASSING-FOLLOWS-THE-ARC — a straight-only level is byte-identical', () => {
  it('expandFormaWallsToChords returns the INPUT ARRAY ITSELF when no wall is curved', () => {
    const walls = straightLevel();
    expect(expandFormaWallsToChords(walls)).toBe(walls);
    for (let i = 0; i < walls.length; i++) expect(expandFormaWallsToChords(walls)[i]).toBe(walls[i]);
  });

  it('traces the same four-corner ring, in the same order, as the pre-change tracer', () => {
    // The clockwise wall-follower from the hull-extreme node (0,0): seed heading +Z, smallest
    // clockwise sweep → (30,0) → (30,12) → (0,12) → back to start.
    const r = reconstructPerimeterRingFromWalls(straightLevel());
    expect(r).toEqual([{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 12 }, { x: 0, z: 12 }]);
  });

  it('formaWallFromRecord emits the SAME seven keys, in the same order, for a straight record', () => {
    const mapped = formaWallFromRecord({
      baseLine: [{ x: 0, y: 3, z: 0 }, { x: 30, y: 3, z: 0 }],
      height: 3, thickness: 0.2, baseOffset: 0.1,
    });
    expect(mapped).toStrictEqual({
      a: { x: 0, z: 0 }, b: { x: 30, z: 0 }, height: 3, thickness: 0.2, baseElevation: 3.1,
      levelId: undefined, materialColor: undefined,
    });
    expect(Object.keys(mapped!)).toEqual(['a', 'b', 'height', 'thickness', 'baseElevation', 'levelId', 'materialColor']);
    expect('curve' in mapped!).toBe(false);
    // Defaults the closure applied before: 2.5 m height, 0.1 m thickness, no baseline ⇒ null.
    expect(formaWallFromRecord({ baseLine: [{ x: 0, z: 0 }, { x: 1, z: 0 }] })!.height).toBe(2.5);
    expect(formaWallFromRecord({ baseLine: [{ x: 0, z: 0 }, { x: 1, z: 0 }] })!.thickness).toBe(0.1);
    expect(formaWallFromRecord({ baseLine: [{ x: 0, z: 0 }] })).toBeNull();
    expect(formaWallFromRecord({})).toBeNull();
  });

  it('buildingGeometrySignature is unchanged for straight walls and moves with a control point', () => {
    const base = { openings: [], slabCount: 1, roofCount: 0, stairCount: 0, furnitureCount: 0 };
    const straight = straightLevel();
    const sigBefore = buildingGeometrySignature({ ...base, walls: straight });
    // The pre-change hash over (a, b, height, thickness) — recomputed longhand.
    let h = 0;
    const mix = (n: number): void => { h = (Math.imul(h, 31) + (Number.isFinite(n) ? n | 0 : 0)) | 0; };
    for (const w of straight) { mix(w.a.x * 100); mix(w.a.z * 100); mix(w.b.x * 100); mix(w.b.z * 100); mix(w.height * 100); mix(w.thickness * 100); }
    expect(sigBefore).toBe([straight.length, 0, 1, 0, 0, 0, h].join('|'));

    const curved = curvedLevel();
    const sigCurved = buildingGeometrySignature({ ...base, walls: curved });
    const moved = curvedLevel();
    moved[2]!.curve = { control: { x: CONTROL.x + 0.5, z: CONTROL.z }, segments: 32 };
    expect(buildingGeometrySignature({ ...base, walls: moved })).not.toBe(sigCurved);
  });
});

describe('§MASSING-FOLLOWS-THE-ARC — the payload carries the curve', () => {
  it('formaWallFromRecord threads Wall.curve (control, segments) and the archived pre-trim baseline', () => {
    const mapped = formaWallFromRecord({
      baseLine: [{ x: 30, y: 0, z: 8.2 }, { x: 26.2, y: 0, z: 12 }],
      _sourceBaseLine: [{ x: 30, y: 0, z: 8 }, { x: 26, y: 0, z: 12 }],
      curve: { control: { x: CONTROL.x, y: 0, z: CONTROL.z }, segments: 32 },
      height: 3, thickness: 0.2, levelId: 'L0', materialColor: '#abcdef',
    })!;
    expect(mapped.curve).toStrictEqual({
      control: { x: CONTROL.x, z: CONTROL.z }, segments: 32, source: { a: { x: 30, z: 8 }, b: { x: 26, z: 12 } },
    });
    // No archived baseline ⇒ no `source` key (pre-trim ≡ post-trim by construction).
    const untrimmed = formaWallFromRecord({
      baseLine: [{ x: 30, z: 8 }, { x: 26, z: 12 }], curve: { control: { x: CONTROL.x, y: 0, z: CONTROL.z } },
    })!;
    expect(untrimmed.curve).toStrictEqual({ control: { x: CONTROL.x, z: CONTROL.z } });
  });

  it('chord walls inherit every other field of their parent and carry no curve (expansion is idempotent)', () => {
    const walls = curvedLevel();
    const once = expandFormaWallsToChords(walls);
    const twice = expandFormaWallsToChords(once);
    expect(twice).toEqual(once);
    expect(once.length).toBe(4 + (massingWallCentreline(walls[2]!).length - 1));
    for (const w of once) {
      expect(w.height).toBe(3); expect(w.thickness).toBe(0.2); expect(w.levelId).toBe('L0'); expect(w.materialColor).toBe('#d4c5b0');
      expect('curve' in w).toBe(false);
    }
    // Straight walls in a mixed level are the SAME objects, not copies.
    expect(once[0]).toBe(walls[0]);
    expect(once[once.length - 1]).toBe(walls[4]);
  });
});

// ── brief item 4: the two PARCEL-ring consumers named beside the massing ─────────────────────
// `§PLOT-CLEAR-PHOTOREAL` clips the photoreal tiles to the committed parcel ring and
// `§SITE-FRAME-PROBE` re-derives project north from that same ring. Neither reads walls, so
// neither is touched by this lane — but the founder's rounded footprint is ALSO drawn as a
// densified parcel ring (Curved mode, `arcSegmentThroughMidpoint`), so both now see 16-chord
// arcs in their input. These assert the pure halves still read CONSISTENT on such a ring.
import { arcSegmentThroughMidpoint } from '@pryzm/geometry-slab/boundary-arc';
import { deriveProjectNorthAngleFromParcel } from '../src/ui/site/overlay/projectTrueNorth';
import { detectRingFrameDisagreement } from '../src/ui/geospatial/sceneEnuFrame';

/** The tool's own ring: a 30 × 16 block with BOTH right-hand corners rounded at r = 4. */
function roundedParcelRing(): FormaXZ[] {
  const s1 = { x: 30, z: 4 }, m1 = { x: 26 + 4 * Math.SQRT1_2, z: 4 - 4 * Math.SQRT1_2 }, e1 = { x: 26, z: 0 };
  const s2 = { x: 26, z: 16 }, m2 = { x: 26 + 4 * Math.SQRT1_2, z: 12 + 4 * Math.SQRT1_2 }, e2 = { x: 30, z: 12 };
  return [
    { x: 0, z: 0 },
    e1, ...arcSegmentThroughMidpoint(e1, m1, s1).reverse().slice(1), // e1 → … → s1 along the arc
    s1, { x: 30, z: 12 }, ...arcSegmentThroughMidpoint(e2, m2, s2), // e2=(30,12) → … → s2
    { x: 0, z: 16 },
  ].filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1]!.x, p.z - arr[i - 1]!.z) > 1e-9);
}

describe('§SITE-FRAME-PROBE + §PLOT-CLEAR-PHOTOREAL — a ROUNDED parcel ring still reads CONSISTENT', () => {
  it('the probe’s north derivation is driven by the longest straight frontage, not by the arc chords', () => {
    const ring = roundedParcelRing();
    expect(ring.length).toBeGreaterThan(30); // two 16-chord arcs are in the ring
    // Square in the authoring frame ⇒ residual exactly 0 ⇒ FRAME VERDICT: CONSISTENT.
    expect(deriveProjectNorthAngleFromParcel(ring)).toBe(0);
    // Rotated by 20°: the derivation recovers −20° (mod 90°) from the 30 m frontage; a chord
    // of the arc (≈ 0.4 m) can never out-vote it.
    const th = (20 * Math.PI) / 180;
    const rot = ring.map((p) => ({ x: p.x * Math.cos(th) - p.z * Math.sin(th), z: p.x * Math.sin(th) + p.z * Math.cos(th) }));
    const derived = deriveProjectNorthAngleFromParcel(rot);
    expect(Math.abs(Math.abs(derived) - th)).toBeLessThan(1e-6);
  });

  it('the reflection/displacement arm sees an inset of the rounded ring as the same frame', () => {
    const ring = roundedParcelRing();
    let cx = 0, cz = 0;
    for (const p of ring) { cx += p.x; cz += p.z; }
    cx /= ring.length; cz /= ring.length;
    const inset = ring.map((p) => ({ x: cx + (p.x - cx) * 0.8, z: cz + (p.z - cz) * 0.8 }));
    const v = detectRingFrameDisagreement(ring, inset);
    expect(v.ok).toBe(true);
    expect(v.reflected).toBe(false); expect(v.displaced).toBe(false); expect(v.oversized).toBe(false);
    // …and a MIRRORED inset is still caught on the rounded ring (the arm is not blinded by chords).
    const mirrored = inset.map((p) => ({ x: -p.x, z: p.z }));
    expect(detectRingFrameDisagreement(ring, mirrored).ok).toBe(false);
  });
});
