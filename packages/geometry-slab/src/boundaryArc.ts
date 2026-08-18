/**
 * boundaryArc — §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06)
 *
 * The ONE arc model for CURVED boundary drawing on slab-family elements (floor
 * finishes, ceilings, slabs). It is deliberately the WALL's arc model — a quadratic
 * Bézier through a user-clicked midpoint — reused, not reinvented:
 *
 *   • `WallPlanToolHandler` captures start → arc-midpoint → end and commits
 *     `WallCurve { control, segments }` where `control = 2·M − 0.5·(S + E)` (the
 *     control point that makes the Bézier pass through M at t = 0.5) and
 *     `segments = 16` (`ARC_SEGMENTS`).
 *   • `RoomDetectionEngine` / `SlabRegionTracer` / `PathResolver.toPolyline` all
 *     tessellate that same Bézier into polyline chords.
 *
 * Boundaries (FloorData / CeilingData / SlabData) are POLYGONS by schema; the
 * codebase's established way an arc enters a boundary is TESSELLATION into chords
 * (SlabRegionTracer §SLAB-REGION-CURVED, RoomDetectionEngine). So the curve drawing
 * mode appends the tessellated vertices to the polygon — no second arc
 * representation, no schema change (P5 untouched), and every downstream consumer
 * (builders, exports, the L-240 inner-face inset) works unchanged.
 *
 * Pure math — no THREE, no DOM, no store access (mirrors `floorFinishDefaults.ts`,
 * the package's precedent for a pure, span-free helper module).
 */

export interface ArcVertex2D { x: number; z: number }

/** The wall tool's arc tessellation density (WallPlanToolHandler `ARC_SEGMENTS`). */
export const BOUNDARY_ARC_SEGMENTS = 16;

/**
 * Quadratic-Bézier control point from three points, such that the curve passes
 * through `midThrough` at t = 0.5:  P(0.5) = 0.25·S + 0.5·C + 0.25·E = M
 * ⟹ C = 2·M − 0.5·(S + E).  Verbatim mirror of `WallPlanToolHandler._bezierControl`.
 */
export function bezierControlFromMidpoint(
  start: ArcVertex2D,
  midThrough: ArcVertex2D,
  end: ArcVertex2D,
): ArcVertex2D {
  return {
    x: 2 * midThrough.x - 0.5 * (start.x + end.x),
    z: 2 * midThrough.z - 0.5 * (start.z + end.z),
  };
}

/**
 * Tessellate the quadratic Bézier `start → control → end` into `segments` chords,
 * returning the sampled vertices EXCLUDING `start` (so the result can be appended
 * to a polygon whose last vertex is `start` without duplication). The sampling is
 * identical to `PathResolver.toPolyline({kind:'Arc'},…)` / `THREE.QuadraticBezierCurve3`:
 * p(t) = (1−t)²·S + 2(1−t)t·C + t²·E.
 */
export function tessellateArcSegment(
  start: ArcVertex2D,
  control: ArcVertex2D,
  end: ArcVertex2D,
  segments: number = BOUNDARY_ARC_SEGMENTS,
): ArcVertex2D[] {
  const n = Number.isFinite(segments) && segments >= 2 ? Math.min(256, Math.floor(segments)) : BOUNDARY_ARC_SEGMENTS;
  const out: ArcVertex2D[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    out.push({
      x: a * start.x + b * control.x + d * end.x,
      z: a * start.z + b * control.z + d * end.z,
    });
  }
  return out;
}

/**
 * Convenience: the tessellated arc from `start` THROUGH `midThrough` to `end`,
 * excluding `start` — the exact vertex run a curved boundary segment appends.
 */
export function arcSegmentThroughMidpoint(
  start: ArcVertex2D,
  midThrough: ArcVertex2D,
  end: ArcVertex2D,
  segments: number = BOUNDARY_ARC_SEGMENTS,
): ArcVertex2D[] {
  return tessellateArcSegment(start, bezierControlFromMidpoint(start, midThrough, end), end, segments);
}

// ─────────────────────────────────────────────────────────────────────────────
// §L965-RECOVER-BOUNDARY-ARCS — reading the arc back OUT of the polygon.
//
// Everything above is the FORWARD direction, and the header states its
// consequence plainly: boundaries remain POLYGONS by schema, an arc enters by
// TESSELLATION, and there is no second arc representation. That decision is not
// being reversed here. But it has a cost the founder found: "walls by slab"
// walked those tessellated vertices and emitted ONE STRAIGHT WALL PER EDGE, so a
// slab drawn with two arc gestures produced THIRTY-THREE short walls around a
// drum instead of two curved walls (L-965).
//
// That is not only ugly. Thirty-three chords around a tight arc put several
// endpoints inside one junction cluster, and WallJoinResolver §SELF-CLUSTER-GUARD
// then SKIPS every wall with both ends in it — a faceted drum defeats the join
// solver outright. Raising the tessellation makes that strictly worse.
//
// Since the slab stores no arc, the arc has to be RECOVERED. It can be, exactly,
// because tessellateArcSegment samples at UNIFORM parameter t = i/n:
//
//     P(t) = (1-t)^2*S + 2(1-t)t*C + t^2*E
//     P_i  = P(i/n)
//     =>  P_{i+1} - 2*P_i + P_{i-1} = (2/n^2)*(S - 2C + E)   — CONSTANT in i
//
// So a uniformly-sampled quadratic Bezier run is EXACTLY a vertex run whose
// second difference is constant, and the control point comes straight back out:
//
//     C = (S + E)/2 - (n^2/4)*dbar
//
// This is a recovery, not a guess: every candidate run is REBUILT through the
// forward sampler above and refused unless it reproduces the vertices it was
// read from. A run that does not (an imported polyline, a decimated ring, some
// other producer) is left alone and its edges stay straight — the pre-L-965
// behaviour, which is the honest fallback rather than a worse curve.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One resolved run of the boundary ring: either a single straight chord
 * (`chords === 1`, no `control`) or an arc spanning several chords.
 */
export interface BoundarySegment {
  /** Index of this segment's FIRST vertex in the ring passed in. */
  readonly startIndex: number;
  /** Index of this segment's LAST vertex. Wraps past the end for the closing run. */
  readonly endIndex: number;
  /** Ring chords spanned. 1 for a straight edge, >= `minChords` for an arc. */
  readonly chords: number;
  /** Recovered quadratic-Bezier control point — present ONLY on an arc run. */
  readonly control?: ArcVertex2D;
}

export interface BoundarySegmentOptions {
  /**
   * Fewest chords a run must span to be READ as an arc. Default 4.
   *
   * Not a taste setting — a floor on evidence. Two chords give one interior
   * second difference, which is "constant" by having nothing to disagree with,
   * so any corner at all would read as an arc. Four chords require three
   * agreeing second differences, which a rectangle, an L or a chamfer cannot
   * produce by accident, and every arc this repo AUTHORS clears it
   * (`BOUNDARY_ARC_SEGMENTS` is 16; `WallCurve.segments` is >= 4 by schema).
   */
  readonly minChords?: number;
  /**
   * Largest departure, in metres, a rebuilt vertex may have from the vertex it
   * claims to reproduce. Default 1 mm — well under any drawing tolerance, and
   * loose enough to survive float32 round-tripping of a persisted polygon.
   */
  readonly toleranceM?: number;
}

const DEFAULT_MIN_CHORDS = 4;
const DEFAULT_TOLERANCE_M = 1e-3;
/** Below this the run is straight with rounding on it, and must stay N straight edges. */
const MIN_SAGITTA_M = 1e-4;
/**
 * How far two neighbouring second differences may disagree and still be read as
 * one arc, as a FRACTION of their own magnitude. Relative, not absolute: the same
 * arc drawn at 1 m and at 100 m must read the same way, and an absolute epsilon
 * would call the small one straight and the large one curved. A drawn arc agrees
 * far better than this; the slack is for float32 round-tripping.
 */
const CURVATURE_AGREEMENT = 0.05;

/**
 * Read a slab-family boundary ring as a list of straight chords and recovered
 * arcs. Pure; the ring is treated as CLOSED (the last vertex joins the first).
 *
 * The result always covers the whole ring exactly once, in ring order, so a
 * caller that ignores `control` gets precisely the per-edge behaviour it had
 * before this function existed.
 */
export function resolveBoundarySegments(
  ring: readonly ArcVertex2D[],
  opts: BoundarySegmentOptions = {},
): BoundarySegment[] {
  const n = ring.length;
  const minChords = Math.max(3, Math.floor(opts.minChords ?? DEFAULT_MIN_CHORDS));
  const tol = opts.toleranceM ?? DEFAULT_TOLERANCE_M;

  const straightAll = (): BoundarySegment[] =>
    Array.from({ length: n }, (_, i) => ({ startIndex: i, endIndex: (i + 1) % n, chords: 1 }));

  // A ring needs one arc's worth of chords PLUS at least one more to close.
  if (n < minChords + 1) return straightAll();
  for (const v of ring) {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) return straightAll();
  }

  // d[i] — the second difference at vertex i, taken around the closed ring.
  const d: ArcVertex2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const here = ring[i]!;
    const next = ring[(i + 1) % n]!;
    d.push({ x: next.x - 2 * here.x + prev.x, z: next.z - 2 * here.z + prev.z });
  }

  // linked[i] — vertex i and vertex i+1 carry the SAME non-zero curvature, so
  // they belong to one uniformly-sampled quadratic run.
  const linked: boolean[] = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const a = d[i]!;
    const b = d[(i + 1) % n]!;
    const scale = Math.max(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z));
    if (scale <= 0) continue;                                   // both collinear — not an arc
    linked[i] = Math.hypot(a.x - b.x, a.z - b.z) <= CURVATURE_AGREEMENT * scale;
  }

  const claimed: Array<{ a: number; k: number; control: ArcVertex2D }> = [];
  // Overlap is tracked as INTERIOR vs ENDPOINT, not as one flat "used" flag: two arc
  // gestures drawn back to back SHARE the vertex between them, and a flat flag would
  // let the first claim veto the second — which is exactly the founder's two-arc drum,
  // half fixed.
  const usedInterior: boolean[] = new Array<boolean>(n).fill(false);
  const usedEndpoint: boolean[] = new Array<boolean>(n).fill(false);

  /** Chain `linked[p … q-1]` means vertices p … q agree, so the run is p-1 … q+1. */
  const tryClaim = (p: number, q: number): void => {
    const a = (p - 1 + n) % n;
    const k = q - p + 2;                                        // chords across vertices a … a+k
    if (k < minChords || k > n - 1) return;                     // never swallow the whole ring
    for (let s = 0; s <= k; s++) if (usedInterior[(a + s) % n]!) return;
    for (let s = 1; s <= k - 1; s++) if (usedEndpoint[(a + s) % n]!) return;

    const S = ring[a]!;
    const E = ring[(a + k) % n]!;

    let mx = 0;
    let mz = 0;
    for (let s = 1; s <= k - 1; s++) { mx += d[(a + s) % n]!.x; mz += d[(a + s) % n]!.z; }
    mx /= (k - 1);
    mz /= (k - 1);

    const control: ArcVertex2D = {
      x: 0.5 * (S.x + E.x) - (k * k / 4) * mx,
      z: 0.5 * (S.z + E.z) - (k * k / 4) * mz,
    };

    const sagitta = 0.5 * Math.hypot(
      control.x - 0.5 * (S.x + E.x),
      control.z - 0.5 * (S.z + E.z),
    );
    if (!(sagitta >= MIN_SAGITTA_M)) return;

    // THE VERIFICATION, and the reason this is recovery rather than inference:
    // rebuild the run through the forward sampler and refuse the claim unless it
    // reproduces the vertices it was read from.
    const rebuilt = tessellateArcSegment(S, control, E, k);
    for (let s = 1; s <= k; s++) {
      const got = rebuilt[s - 1]!;
      const want = ring[(a + s) % n]!;
      if (Math.hypot(got.x - want.x, got.z - want.z) > tol) return;
    }

    for (let s = 1; s <= k - 1; s++) usedInterior[(a + s) % n] = true;
    usedEndpoint[a] = true;
    usedEndpoint[(a + k) % n] = true;
    claimed.push({ a, k, control });
  };

  let i = 0;
  while (i < n) {
    if (!linked[i]) { i++; continue; }
    let q = i;
    while (q - i < n - 1 && linked[q % n]) q++;                 // chain covers linked[i … q-1]
    tryClaim(i, q);
    i = q + 1;
  }

  if (claimed.length === 0) return straightAll();

  // Emit in ring order, starting AT an arc so no arc is split across the seam.
  const arcStartAt = new Map<number, { k: number; control: ArcVertex2D }>();
  for (const c of claimed) arcStartAt.set(c.a, { k: c.k, control: c.control });

  const out: BoundarySegment[] = [];
  let cursor = claimed[0]!.a;
  let covered = 0;
  while (covered < n) {
    const arc = arcStartAt.get(cursor);
    if (arc) {
      out.push({
        startIndex: cursor,
        endIndex: (cursor + arc.k) % n,
        chords: arc.k,
        control: { x: arc.control.x, z: arc.control.z },
      });
      cursor = (cursor + arc.k) % n;
      covered += arc.k;
    } else {
      out.push({ startIndex: cursor, endIndex: (cursor + 1) % n, chords: 1 });
      cursor = (cursor + 1) % n;
      covered += 1;
    }
  }
  return out;
}
