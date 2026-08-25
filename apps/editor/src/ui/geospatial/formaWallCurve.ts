/**
 * formaWallCurve — §MASSING-FOLLOWS-THE-ARC (L-11172, lane MASSCURVE71, 2026-08-25)
 *
 * THE DEFECT. The residential generator emits ONE curved wall per rounded corner
 * (`Wall.curve = { control, segments }`, a quadratic Bézier — §RESI-ROUNDED-CORNERS,
 * L-11130/L-11170). In the BIM scene that is right: `CurvedWallLayerBuilder` walks the
 * arc. On the globe it was NOT: `GISAreaLayout.getFormaWalls` mapped each wall record to
 * `{ a: baseLine[0], b: baseLine[1] }` and never read `wall.curve`; `renderFormaMassing`
 * had no `curve` on its input; so `reconstructPerimeterRing` chained CHORDS into the
 * storey ring and `wallFootprintRing` widened the chord. Every rounded corner read on the
 * globe as CUT STRAIGHT across its tangent points while the slab plate beside it (the
 * drawn footprint, already tessellated) was rounded — mass and floor plate disagreeing
 * at each corner by the arc's sagitta, r·(1 − cos 45°) ≈ 1.2 m at r = 4. Two renderers,
 * one building, two shapes.
 *
 * THE FIX, in one sentence: carry `curve` through the massing payload and, at the ONE
 * point where a massing wall becomes plan geometry, expand a curved wall into the SAME
 * chord run the rest of the repo draws — never a second sampler, never a second density.
 *
 * ⭐ ONE SAMPLER, ONE DENSITY, ONE FRAME — all three are IMPORTED, none is re-stated here:
 *   • SAMPLER  — `tessellateArcSegment` (`@pryzm/geometry-slab/boundary-arc`), the pure
 *     uniform-t quadratic Bézier documented as identical to `PathResolver.toPolyline` /
 *     `THREE.QuadraticBezierCurve3`, i.e. the SAME points `CurvedWallLayerBuilder.
 *     computeStations` builds the 3D wall from. It is also the sampler the boundary tool
 *     drew the footprint with (`arcSegmentThroughMidpoint`) and the one the generator's
 *     recovery (`resolveBoundarySegments`) rebuilt the arc through — so the chain
 *     boundary → recovery → `Wall.curve` → massing is ONE function end to end. Pure maths;
 *     P2 (single THREE owner) is untouched.
 *   • DENSITY  — `resolveArcSegmentCount` (`@pryzm/core-app-model/curved-wall-tessellation`
 *     §ARC-DENSITY), the ONE chord-count authority: the wall's own `curve.segments` is a
 *     FLOOR, the 5 mm sagitta target raises a coarse default, and this consumer's
 *     chord-survival bound (below) is passed in rather than re-deciding density locally.
 *   • FRAME    — `tessellateCurvedWallForTopology`, which samples in the PRE-trim frame
 *     (`_sourceBaseLine` + authored control) and CLIPS to the post-trim span, so a wall
 *     the join resolver shortened is still the authored arc and not a re-fit through
 *     trimmed ends (§FIX-CURVED-WALL-PRETRIM-FRAME, the founder's diagonal-line report).
 *
 * STRAIGHT WALLS ARE BYTE-IDENTICAL. A record without `curve` maps to exactly the object
 * it mapped to before (same keys, same order, no `curve` key at all), and
 * `expandFormaWallsToChords` returns the INPUT ARRAY ITSELF when no wall is curved — so
 * every downstream consumer of a straight-only level sees the same references it saw
 * before this module existed. `formaMassingFollowsCurvedWall.test.ts` pins both.
 *
 * Pure + framework-free (no Cesium, no THREE, no DOM) for the same reason as
 * `formaMassingExtent.ts` next door: `CesiumViewport` cannot be collected under the unit
 * config, and the proof this lane owes is at the perimeter-ring layer, not a mesh.
 */

import {
  tessellateCurvedWallForTopology,
  resolveArcSegmentCount,
  type TessPoint,
} from '@pryzm/core-app-model/curved-wall-tessellation';
import { tessellateArcSegment } from '@pryzm/geometry-slab/boundary-arc';

/** A scene-XZ plan point, metres (the authoring frame). */
export interface FormaXZ { x: number; z: number }

/**
 * The curve descriptor a massing wall carries — `Wall.curve` projected to the plan,
 * plus the pre-trim frame the arc was authored in.
 */
export interface FormaWallCurve {
  /** Quadratic-Bézier control point, scene-XZ, in the AUTHORED (pre-trim) frame. */
  control: FormaXZ;
  /** The wall's own `curve.segments` — honoured as a FLOOR by the density authority. */
  segments?: number;
  /**
   * The PRE-trim baseline (`WallData._sourceBaseLine`) when the join resolver archived
   * one; absent for a wall that was never trimmed (pre-trim ≡ post-trim by construction).
   */
  source?: { a: FormaXZ; b: FormaXZ } | null;
}

/** The least a massing consumer needs from a wall to turn it into plan geometry. */
export interface FormaMassingWallLike {
  a: FormaXZ;
  b: FormaXZ;
  /** Present ⇒ the wall is the Bézier `a → control → b`; absent ⇒ straight. */
  curve?: FormaWallCurve | null;
}

/** The FULL massing wall the Forma / globe payload carries (`renderFormaMassing.walls[]`). */
export interface FormaMassingWall extends FormaMassingWallLike {
  height: number;
  thickness: number;
  /** Storey base elevation in metres above the project floor plane (wall.baseLine.y + baseOffset). */
  baseElevation: number;
  levelId?: string;
  /** §A.21.D-GLOBE3 — the wall's REAL BIM finish hex (photoreal globe path only). */
  materialColor?: string;
}

/**
 * Chord-survival bound handed to the ONE density authority (`resolveArcSegmentCount`).
 *
 * `reconstructPerimeterRing` (formaPerimeterRing.ts) identifies wall endpoints by snapping
 * them to a `PERIMETER_NODE_SNAP_M` (5 cm) grid; two chord vertices that round into the
 * same cell become ONE node and the chord between them vanishes, which corrupts the ring
 * rather than refining it (the same failure `SlabRegionTracer` guards with
 * `ARC_MIN_CHORD_FOR_WELD`). Two points at least √2 · 5 cm ≈ 7.1 cm apart can never share
 * a cell; 15 cm is that bound with a 2× margin. `formaMassingFollowsCurvedWall.test.ts`
 * asserts the relation to the ring's grid executably, so the two constants cannot drift
 * apart in silence. Not a density decision — the density lives in one place, upstream.
 */
export const MASSING_ARC_MIN_CHORD_M = 0.15;

/**
 * THE sampler, in the shape `tessellateCurvedWallForTopology` injects: the uniform-t
 * quadratic Bézier INCLUDING `start` (the boundary-arc export omits it so the tool can
 * append to a polygon; the topology helper wants the whole polyline).
 */
function sampleQuadraticBezierXZ(
  start: TessPoint, end: TessPoint, control: TessPoint, segments: number,
): TessPoint[] {
  const run = tessellateArcSegment(
    { x: start.x, z: start.z }, { x: control.x, z: control.z }, { x: end.x, z: end.z }, segments,
  );
  return [{ x: start.x, z: start.z }, ...run];
}

const finiteXZ = (p: { x?: unknown; z?: unknown } | null | undefined): p is FormaXZ =>
  !!p && typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.z === 'number' && Number.isFinite(p.z);

/**
 * A massing wall's plan CENTRELINE as a polyline — `[a, b]` for a straight wall, the
 * tessellated arc (`a` first, `b` last) for a curved one. Every massing consumer that
 * turns a wall into plan geometry reads THIS, so the prism, the per-wall-box fallback and
 * the footprint bbox agree on one shape.
 */
export function massingWallCentreline(w: FormaMassingWallLike): FormaXZ[] {
  const c = w.curve?.control;
  if (!finiteXZ(c)) return [{ x: w.a.x, z: w.a.z }, { x: w.b.x, z: w.b.z }];

  const post: readonly [TessPoint, TessPoint] = [{ x: w.a.x, z: w.a.z }, { x: w.b.x, z: w.b.z }];
  const src = w.curve?.source;
  const pre: readonly [TessPoint, TessPoint] | null =
    src && finiteXZ(src.a) && finiteXZ(src.b) ? [{ x: src.a.x, z: src.a.z }, { x: src.b.x, z: src.b.z }] : null;
  const control: TessPoint = { x: c.x, z: c.z };

  // §ARC-DENSITY — derived in the frame that is SAMPLED (pre-trim when archived), per the
  // authority's FRAME RULE.
  const segments = resolveArcSegmentCount({
    start: pre?.[0] ?? post[0],
    end: pre?.[1] ?? post[1],
    control,
    requested: w.curve?.segments,
    minChordLength: MASSING_ARC_MIN_CHORD_M,
    tag: 'FormaMassing',
  });

  const pts = tessellateCurvedWallForTopology(
    { baseLine: post, sourceBaseLine: pre, control, segments },
    sampleQuadraticBezierXZ,
  );
  return pts.map((p) => ({ x: p.x, z: p.z }));
}

/**
 * Expand every curved wall into its chord run — one wall object per chord, carrying the
 * parent's every other field (height, thickness, storey, colour) and NO `curve`, so a
 * consumer that expands twice gets the same answer as one that expands once.
 *
 * ⭐ Returns the INPUT ARRAY ITSELF when no wall is curved. That is the byte-identity
 * guarantee for straight-only levels, and it is a reference the test can assert.
 */
export function expandFormaWallsToChords<W extends FormaMassingWallLike>(
  walls: ReadonlyArray<W>,
): ReadonlyArray<W> {
  let anyCurved = false;
  for (const w of walls) {
    if (finiteXZ(w.curve?.control)) { anyCurved = true; break; }
  }
  if (!anyCurved) return walls;

  const out: W[] = [];
  for (const w of walls) {
    if (!finiteXZ(w.curve?.control)) { out.push(w); continue; }
    const pts = massingWallCentreline(w);
    if (pts.length < 2) { out.push(w); continue; }
    const { curve: _dropped, ...rest } = w;
    void _dropped;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      out.push({ ...rest, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } } as W);
    }
  }
  return out;
}

/** The wall STORE record shape `getFormaWalls` reads (duck-typed; the store is untyped there). */
export interface FormaWallRecordLike {
  baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }> | null;
  height?: number;
  thickness?: number;
  baseOffset?: number;
  levelId?: string;
  materialColor?: string;
  /** Contract §03-1.2 — present ⇒ curved (quadratic Bézier via `control`). */
  curve?: { control?: { x: number; y?: number; z: number } | null; segments?: number } | null;
  /** The join resolver's archived PRE-trim baseline (`WallData._sourceBaseLine`). */
  _sourceBaseLine?: ReadonlyArray<{ x: number; y?: number; z: number }> | null;
}

/**
 * ONE wall record → ONE massing wall, or `null` when the record has no usable baseline.
 *
 * Hoisted verbatim from `GISAreaLayout.getFormaWalls` so it is testable; the straight
 * branch emits EXACTLY the object it emitted there (same seven keys, same order, same
 * defaults — 2.5 m height, 0.1 m thickness, `levelId`/`materialColor` present-but-undefined
 * when absent). `curve` is added ONLY when the record carries a finite control point.
 */
export function formaWallFromRecord(w: FormaWallRecordLike): FormaMassingWall | null {
  const bl = w.baseLine;
  if (!bl || bl.length < 2 || !bl[0] || !bl[1]) return null;
  const yElev = typeof bl[0].y === 'number' && Number.isFinite(bl[0].y) ? bl[0].y : 0;
  const baseOffset =
    typeof w.baseOffset === 'number' && Number.isFinite(w.baseOffset) ? w.baseOffset : 0;
  const wall: FormaMassingWall = {
    a: { x: bl[0].x, z: bl[0].z },
    b: { x: bl[1].x, z: bl[1].z },
    height: typeof w.height === 'number' && w.height > 0 ? w.height : 2.5,
    thickness: typeof w.thickness === 'number' && w.thickness > 0 ? w.thickness : 0.1,
    baseElevation: yElev + baseOffset,
    levelId: typeof w.levelId === 'string' && w.levelId ? w.levelId : undefined,
    materialColor:
      typeof w.materialColor === 'string' && w.materialColor ? w.materialColor : undefined,
  };

  const ctrl = w.curve?.control;
  if (finiteXZ(ctrl)) {
    const src = w._sourceBaseLine;
    const source =
      src && src.length >= 2 && finiteXZ(src[0]) && finiteXZ(src[1])
        ? { a: { x: src[0].x, z: src[0].z }, b: { x: src[1].x, z: src[1].z } }
        : null;
    const segments = w.curve?.segments;
    wall.curve = {
      control: { x: ctrl.x, z: ctrl.z },
      ...(typeof segments === 'number' && Number.isFinite(segments) ? { segments } : {}),
      ...(source ? { source } : {}),
    };
  }
  return wall;
}
