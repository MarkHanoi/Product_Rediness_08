/**
 * curvedWallTessellation — §FIX-CURVED-WALL-PRETRIM-FRAME (founder, 2026-08-07)
 *
 * THE REPORT (three times): a floor finish in a curved room shows a thin STRAIGHT
 * line cutting diagonally across one corner, inside the arc — while the curved
 * WALL beside it renders correctly.
 *
 * THE PROOF IT IS NOT THE FINISH: the log showed
 *   §DIAG-PARTITION-REACH reconnected guest=wall_X_c23.end onto host=wall_X_c22
 *   body — closed a 599mm dangling gap
 * `_c22` and `_c23` are ADJACENT TESSELLATION SEGMENTS OF ONE ARC. They are
 * emitted as `pts[i] → pts[i+1]` from a single polyline, so `_c22.end` IS
 * `_c23.start` by construction. Two of them being 599 mm apart is impossible
 * unless something downstream moved one — so the ROOM RING was already wrong
 * before any floor code ran. The finish reproduced it faithfully.
 *
 * ROOT CAUSE — a PRE-TRIM / POST-TRIM FRAME MISMATCH.
 * `RoomDetectionEngine` tessellated a curved wall like this:
 *     start   = wall.baseLine[0]      ← POST-trim (WallJoinResolver shortened it)
 *     end     = wall.baseLine[1]      ← POST-trim
 *     control = wall.curve.control    ← PRE-trim  (as the user authored it)
 * A quadratic Bézier through TRIMMED endpoints with an UNTRIMMED control point is
 * not the original arc restricted to the trimmed span — it is a DIFFERENT CURVE.
 * It agrees near the middle and diverges near the ends, which is exactly why the
 * founder sees a good arc with one bad corner. The mis-fitted tail then lands far
 * enough from its neighbour that `§DIAG-PARTITION-REACH` treats it as a dangling
 * partition end and drags it onto the nearest collinear host — which, for a
 * mis-fitted arc, is its own parent's previous sub-segment. That "recovery" is the
 * straight chord in the screenshot.
 *
 * THIS BUG WAS ALREADY SOLVED ONCE, ELSEWHERE. `WallFragmentBuilder`
 * (§V2-PRETRIM-FIX, 2026-05-27, also found by an architect screenshot) hit the
 * identical failure — post-trim endpoints mixed with a pre-trim frame producing
 * degenerate geometry — and fixed it by reading the archived pre-trim baseline
 * `wall._sourceBaseLine`. `RoomDetectionEngine` never adopted it. That is why the
 * 3D wall mesh draws the true arc while room detection walks a different one, and
 * therefore why the finish disagrees with the wall it sits against.
 *
 * THE FIX, in one sentence: tessellate the arc in the PRE-TRIM frame (the frame it
 * was authored in, so the curve is the real curve), then CLIP that polyline to the
 * post-trim span — rather than re-fitting a new Bézier through trimmed ends.
 *
 * Pure 2D/3D-agnostic maths: no THREE, no DOM, no store access, so it is unit
 * testable without a scene. (Span-free by the same precedent as the other pure
 * geometry helpers: the C10 §2 OTel gate scopes to `plugins/&#42;/src/handlers/`.)
 *
 * ── §FIX-REGION-RING-PRETRIM-FRAME (2026-08-07) — HOISTED, NOT REWRITTEN ──────
 * This module was authored in `@pryzm/room-topology`. A SECOND consumer,
 * `@pryzm/geometry-slab`'s `SlabRegionTracer`, was found running the identical
 * pre-fix maths, so the fix has to be shared rather than copied — a copy is how
 * this defect survived being fixed once already (WallFragmentBuilder
 * §V2-PRETRIM-FIX → RoomDetectionEngine §FIX-CURVED-WALL-PRETRIM-FRAME →
 * SlabRegionTracer). `core-app-model` (L3) is the lowest package BOTH consumers
 * already depend on, so hosting it here needs no new package dependency and no
 * lockfile change. `room-topology/src/curvedWallTessellation.ts` is now a
 * re-export shim, so `ba7ee582` and every existing import are untouched.
 *
 * The module stays THREE-free and is reached by a LEAF subpath export
 * (`@pryzm/core-app-model/curved-wall-tessellation`) — NOT via the root barrel
 * or the `./geometry` sub-barrel, both of which pull THREE in and would break
 * `SlabRegionTracer`'s documented purity.
 */

export interface TessPoint { x: number; y?: number; z: number }

/* ─── §ARC-DENSITY (founder "not organic", 2026-08-07) — THE ONE chord-density
 * authority for tessellating a quadratic-Bézier curved wall.
 *
 * THE SECOND HALF OF THE ROOF-BY-REGION REPORT. §FIX-REGION-RING-PRETRIM-FRAME
 * (above) made the traced ring CORRECT; this section makes it LOOK like the arc
 * it is. Before it, every consumer picked its own chord count — the wall schema
 * default (16), `WallTool` (24), `SlabRegionTracer` (a local 0.5 m chord target
 * capped at 48) — none of which knows anything about CURVATURE. A 10 m-scale
 * arc at 16 chords departs from the true curve by ~15 mm at mid-chord
 * (measured: |P0−2C+P1| = 10 m ⇒ 9.8 mm; the founder's slightly deeper arc ⇒
 * the 15.0 mm residual reported by the b431a17b fix), which reads as a faceted
 * polygon, not an "organic" curve.
 *
 * THE MATHS. For a quadratic Bézier sampled at uniform t into n chords, the
 * second derivative is CONSTANT: B″ = 2·(P0 − 2C + P1). The mid-chord departure
 * (sagitta) of each chord is therefore EXACTLY |P0 − 2C + P1|·h²/4 with
 * h = 1/n — not an estimate. Inverting it gives the chord count that achieves a
 * target sagitta:  n = ⌈√(|P0 − 2C + P1| / 4ε)⌉.  Verified against dense
 * numeric sampling to <1% (scratchpad measurement, 2026-08-07: n=16 bound
 * 9.8 mm vs measured 9.7 mm; n=48 bound 1.1 mm vs measured 1.1 mm).
 *
 * TWO BOUNDS, BOTH LOUD (ADR-0299 — a limit that silently truncates produces a
 * plausible wrong answer):
 *   • `maxSegments` — a pathological arc must not explode the triangle budget
 *     (each ring vertex costs ~4 slab triangles: 2 caps + 2 side-quad faces).
 *   • `minChordLength` — the consumer's vertex-weld / node-grid tolerance:
 *     chords shorter than the weld radius get their interior vertices WELDED
 *     AWAY by the loop builder, so density beyond that bound is not just wasted,
 *     it corrupts the ring. Each consumer passes its own survival bound
 *     (SlabRegionTracer: 1.5 × REGION_WELD_TOLERANCE).
 * When either bound forces the count below what the sagitta target requires,
 * `resolveArcSegmentCount` says so once per (tag, bound) on the console instead
 * of silently shipping a faceted curve.
 *
 * FRAME RULE: pass the SAME frame you will SAMPLE in — for a trimmed wall that
 * is the PRE-trim frame (`_sourceBaseLine` + authored control), per the header
 * above. Density derived in one frame for a curve sampled in another is the
 * same category of bug as the mixed-frame fit this module exists to kill.
 */

/**
 * Default max mid-chord departure (sagitta) of a tessellated arc, metres.
 * 5 mm at building scale: the b431a17b residual of 15 mm was the founder's
 * "not organic"; 5 mm matches the visual quality of the 3D wall mesh itself
 * (WallTool authors `segments: 24` ⇒ ~4–7 mm on 10 m-scale arcs), so the slab
 * edge and the wall it sits against read as the same curve.
 */
export const ARC_SAGITTA_TARGET_M = 0.005;

/**
 * Hard ceiling on chords per arc. At 64 the sagitta target is met for arcs up
 * to |P0−2C+P1| = 4·ε·64² ≈ 82 m — beyond any building-scale wall. A ring
 * vertex costs ~4 slab triangles, so one arc is bounded at ~260 triangles.
 */
export const ARC_MAX_SEGMENTS = 64;

/**
 * EXACT max mid-chord departure of an n-chord uniform-t tessellation of the
 * quadratic Bézier `start → control → end` (constant B″ ⇒ closed form).
 */
export function arcChordSagittaBound(
  start: TessPoint, end: TessPoint, control: TessPoint, segments: number,
): number {
  const dx = start.x - 2 * control.x + end.x;
  const dz = start.z - 2 * control.z + end.z;
  return Math.hypot(dx, dz) / (4 * segments * segments);
}

export interface ArcDensityArgs {
  /** Arc endpoints IN THE FRAME THAT WILL BE SAMPLED (pre-trim when archived). */
  start: TessPoint;
  end: TessPoint;
  /** Quadratic-Bézier control point (authored frame). */
  control: TessPoint;
  /** The wall's own `curve.segments` — honoured as a FLOOR, never a ceiling. */
  requested?: number | null;
  /**
   * The consumer's chord-survival bound: chords must stay LONGER than its
   * vertex-weld / node-grid radius or the loop builder dissolves them. 0/absent
   * disables the bound.
   */
  minChordLength?: number;
  /** Max mid-chord departure (m). Default {@link ARC_SAGITTA_TARGET_M}. */
  sagittaTarget?: number;
  /** Ceiling on chords. Default {@link ARC_MAX_SEGMENTS}. */
  maxSegments?: number;
}

export interface ArcDensity {
  /** The chord count to sample at (always ≥ 2). */
  segments: number;
  /** What the sagitta target alone required. */
  requiredForTarget: number;
  /** Which bound, if any, forced `segments` BELOW `requiredForTarget`. */
  boundedBy: 'none' | 'ceiling' | 'min-chord';
  /** Exact sagitta bound (m) at the returned count. */
  achievedSagittaBound: number;
}

/**
 * Pure density solver — no logging, so tests can assert on it directly.
 * `resolveArcSegmentCount` is the logging front door consumers call.
 */
export function computeArcDensity(args: ArcDensityArgs): ArcDensity {
  const eps = args.sagittaTarget !== undefined && args.sagittaTarget > 0
    ? args.sagittaTarget
    : ARC_SAGITTA_TARGET_M;
  const ceiling = Math.max(2, Math.floor(args.maxSegments ?? ARC_MAX_SEGMENTS));

  const { start: s, end: e, control: c } = args;
  const dNorm = Math.hypot(s.x - 2 * c.x + e.x, s.z - 2 * c.z + e.z);
  const requiredForTarget = Math.max(2, Math.ceil(Math.sqrt(dNorm / (4 * eps))));

  const requested = typeof args.requested === 'number'
    && Number.isFinite(args.requested) && args.requested >= 2
    ? Math.floor(args.requested)
    : 0;

  const target = Math.max(2, requested, requiredForTarget);

  // Chord-survival cap. Arc length estimated as the mean of the control-polygon
  // length (an upper bound) and the chord (a lower bound) — within ~3% for
  // quadratics, and only a CAP is derived from it.
  let chordCap = Infinity;
  if (args.minChordLength !== undefined && args.minChordLength > 0) {
    const chord = Math.hypot(e.x - s.x, e.z - s.z);
    const ctrlPoly = Math.hypot(c.x - s.x, c.z - s.z) + Math.hypot(e.x - c.x, e.z - c.z);
    const arcLenEst = (ctrlPoly + chord) / 2;
    chordCap = Math.max(2, Math.floor(arcLenEst / args.minChordLength));
  }

  const segments = Math.min(target, ceiling, chordCap);
  const boundedBy: ArcDensity['boundedBy'] = segments >= requiredForTarget
    ? 'none'
    : (chordCap < ceiling ? 'min-chord' : 'ceiling');

  return {
    segments,
    requiredForTarget,
    boundedBy,
    achievedSagittaBound: arcChordSagittaBound(s, e, c, segments),
  };
}

/** One log per (tag, bound) so a rebuild loop cannot flood the console. */
const _arcDensityBoundLogged = new Set<string>();

/**
 * THE ONE arc chord-count resolver. When a bound forces the count below the
 * sagitta target, that is REPORTED (once per tag+bound) — never silent
 * (ADR-0299: an absence produced by a limit is not an absence).
 *
 * @param tag identifies the consumer (and ideally the wall) in the bound log.
 */
export function resolveArcSegmentCount(args: ArcDensityArgs & { tag?: string }): number {
  const d = computeArcDensity(args);
  if (d.boundedBy !== 'none') {
    const key = `${args.tag ?? 'arc'}|${d.boundedBy}`;
    if (!_arcDensityBoundLogged.has(key)) {
      if (_arcDensityBoundLogged.size < 256) _arcDensityBoundLogged.add(key);
      console.warn(
        `[curvedWallTessellation] §ARC-DENSITY bound bit (${args.tag ?? 'arc'}): `
        + `${d.boundedBy} capped chords at ${d.segments} where the `
        + `${((args.sagittaTarget ?? ARC_SAGITTA_TARGET_M) * 1000).toFixed(0)}mm sagitta `
        + `target needs ${d.requiredForTarget}; the tessellated curve departs up to `
        + `${(d.achievedSagittaBound * 1000).toFixed(1)}mm from the authored arc. `
        + `(Logged once per consumer+bound; further bites are silent.)`,
      );
    }
  }
  return d.segments;
}

/** Squared XZ distance — comparisons only, so the sqrt is not paid. */
function d2(a: TessPoint, b: TessPoint): number {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * The closest point to `p` on segment `a→b`, plus how far along it sits (`t`, 0..1)
 * and the squared distance. XZ only — walls are vertical extrusions.
 */
function closestOnSegment(p: TessPoint, a: TessPoint, b: TessPoint): { t: number; d2: number; x: number; z: number } {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-18) return { t: 0, d2: d2(p, a), x: a.x, z: a.z };
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + abx * t, z = a.z + abz * t;
  const dx = p.x - x, dz = p.z - z;
  return { t, d2: dx * dx + dz * dz, x, z };
}

/** Where a point projects onto a polyline: which segment, and how far along it. */
interface PolyProjection { segIdx: number; t: number; x: number; z: number; d2: number }

function projectOntoPolyline(p: TessPoint, poly: readonly TessPoint[]): PolyProjection {
  let best: PolyProjection = { segIdx: 0, t: 0, x: poly[0]!.x, z: poly[0]!.z, d2: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const c = closestOnSegment(p, poly[i]!, poly[i + 1]!);
    if (c.d2 < best.d2) best = { segIdx: i, t: c.t, x: c.x, z: c.z, d2: c.d2 };
  }
  return best;
}

/**
 * Clip `poly` to the span between `from` and `to`, which are expected to lie ON (or
 * very near) the polyline — the post-trim endpoints of a wall whose arc was
 * tessellated in the pre-trim frame.
 *
 * The returned polyline:
 *   • STARTS exactly at `from` and ENDS exactly at `to` — so the wall still meets
 *     its neighbours at the junction points the resolver computed. The trim is
 *     honoured; only the SHAPE between the ends comes from the true arc.
 *   • keeps every original interior vertex between those two projections, so the
 *     curvature is the authored curvature, not a re-fit approximation.
 *
 * Degenerate inputs (fewer than 2 points, reversed projections, coincident ends)
 * fall back to a straight `from → to`, which is the pre-fix behaviour — a clip that
 * cannot be computed must not invent geometry.
 */
export function clipPolylineToSpan(
  poly: readonly TessPoint[],
  from: TessPoint,
  to: TessPoint,
): TessPoint[] {
  if (poly.length < 2) return [{ ...from }, { ...to }];

  const pFrom = projectOntoPolyline(from, poly);
  const pTo = projectOntoPolyline(to, poly);

  // Absolute position along the polyline, for ordering.
  const pos = (p: PolyProjection) => p.segIdx + p.t;
  if (pos(pTo) <= pos(pFrom)) return [{ ...from }, { ...to }];

  const out: TessPoint[] = [{ x: from.x, y: from.y, z: from.z }];
  // Interior vertices strictly between the two projections.
  for (let i = pFrom.segIdx + 1; i <= pTo.segIdx; i++) {
    const v = poly[i]!;
    // Skip a vertex that coincides with either clipped end (avoids zero-length segs).
    if (d2(v, from) < 1e-12 || d2(v, to) < 1e-12) continue;
    out.push({ x: v.x, y: v.y, z: v.z });
  }
  out.push({ x: to.x, y: to.y, z: to.z });
  return out;
}

/**
 * THE ONE curved-wall tessellation for topology.
 *
 * `sourceBaseLine` is the wall's PRE-trim baseline (`WallData._sourceBaseLine`,
 * archived by the join resolver); `baseLine` is the current POST-trim one. When no
 * source baseline exists — a freshly created wall that has never been trimmed —
 * pre-trim ≡ post-trim by construction and the result is bit-identical to the old
 * code, so untrimmed walls are provably unaffected.
 *
 * @param tessellate  Injected arc sampler (`PathResolver.toPolyline`), so this
 *                    module stays THREE-free and unit-testable.
 */
export function tessellateCurvedWallForTopology(
  args: {
    baseLine: readonly [TessPoint, TessPoint];
    sourceBaseLine?: readonly [TessPoint, TessPoint] | null;
    control: TessPoint;
    segments: number;
  },
  tessellate: (start: TessPoint, end: TessPoint, control: TessPoint, segments: number) => TessPoint[],
): TessPoint[] {
  const [postStart, postEnd] = args.baseLine;
  const preStart = args.sourceBaseLine?.[0] ?? postStart;
  const preEnd = args.sourceBaseLine?.[1] ?? postEnd;

  // Sample the arc in the frame it was AUTHORED in — this is the real curve.
  const full = tessellate(preStart, preEnd, args.control, args.segments);
  if (full.length < 2) return [{ ...postStart }, { ...postEnd }];

  // Untrimmed wall: nothing to clip, and clipping would only add float noise.
  const untrimmed = d2(preStart, postStart) < 1e-12 && d2(preEnd, postEnd) < 1e-12;
  if (untrimmed) return full;

  return clipPolylineToSpan(full, postStart, postEnd);
}

/**
 * §DIAG-PARTITION-REACH same-parent guard — strip the tessellation/split suffixes
 * to recover the WallStore id a sub-segment belongs to.
 *
 * Sub-segments are named `{id}_c{i}` (curve tessellation AND body-crossing splits)
 * and `{id}_c{i}_s{j}` (T-junction splits), so the suffix run is `/(_[cs]\d+)+$/` —
 * the same regex the room output uses to rebuild `boundingWallIds`.
 */
export function baseWallId(subSegmentId: string): string {
  return subSegmentId.replace(/(_[cs]\d+)+$/, '');
}
