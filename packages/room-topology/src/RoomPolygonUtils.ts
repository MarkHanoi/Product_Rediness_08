/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Utility / Pure Math
 * File:             src/elements/rooms/RoomPolygonUtils.ts
 * Contract:         docs/01_ELEMENTS/09_Rooms_Contract/01-ROOM-DATA-MODEL-CONTRACT.md §6.2
 *                   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §1.3
 *
 * Pure-function polygon utilities. No THREE.js imports. No store access.
 * All math operates in the XZ plane (x = world X, z = world Z).
 */

import { RoomVertex, RoomBoundary, RoomComputedMetrics } from './RoomTypes';
// §FIX-REGION-RING-PRETRIM-FRAME (2026-08-07) — ONE ring-simplicity predicate,
// shared with the slab triangulation gate. Leaf subpath, so no THREE is pulled in
// and this file stays pure. See the note on `isSimple` below.
import { isSimpleRing } from '@pryzm/core-app-model/ring-simplicity';

export const MAX_POLYGON_VERTICES = 256;
/**
 * Minimum interior face area (m²) below which an enclosed region is NOT
 * promoted to a Room by the auto-detection pipeline.
 *
 * §AREA-THRESHOLD-2026-04 — Lowered from 2.0 m² to 0.5 m² to support small
 * residential / utility rooms (broom cupboards, en-suite WCs, riser shafts,
 * pantries, plant cupboards, niches). 0.5 m² ≈ a 0.7 m × 0.7 m enclosure,
 * which is the smallest space a person can occupy and the smallest unit
 * commonly drawn in residential plans.
 *
 * Per-occupancy minimum-area compliance (§ROOM-VALIDATION) is independent
 * of this constant — it is enforced by `RoomValidationService` against the
 * occupancy's `RoomSystemType.minArea` AFTER the room has been detected.
 *
 * Auditing references:
 *   - `docs/00_AUDITS/ROOM-SYSTEM-AUDIT-2026.md` §28
 *   - `docs/01_ELEMENTS/09_Rooms_Contract/01-ROOM-DATA-MODEL-CONTRACT.md` §6.2
 *   - `docs/01_ELEMENTS/09_Rooms_Contract/10-ROOM-COMPLIANCE-AUDIT.md`
 */
export const MIN_ROOM_AREA_M2 = 0.5;

export interface BoundingBox2D {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Shoelace formula for signed area.
 * Positive result = CCW winding (right-hand XZ system, Y-up).
 * Negative result = CW winding.
 */
export function computeSignedArea(polygon: RoomVertex[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].z;
    area -= polygon[j].x * polygon[i].z;
  }
  return area / 2;
}

/**
 * Unsigned area in m² via the shoelace formula.
 */
export function polygonAreaM2(polygon: RoomVertex[]): number {
  return Math.abs(computeSignedArea(polygon));
}

/**
 * Perimeter length in metres.
 */
export function polygonPerimeterM(polygon: RoomVertex[]): number {
  const n = polygon.length;
  if (n < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = polygon[j].x - polygon[i].x;
    const dz = polygon[j].z - polygon[i].z;
    perimeter += Math.sqrt(dx * dx + dz * dz);
  }
  return perimeter;
}

/**
 * Weighted polygon centroid (not simple average).
 * Uses the standard signed-area decomposition for accurate placement in non-convex rooms.
 */
export function polygonCentroid(polygon: RoomVertex[]): RoomVertex {
  const n = polygon.length;
  if (n === 0) return { x: 0, z: 0 };
  if (n === 1) return { x: polygon[0].x, z: polygon[0].z };
  if (n === 2) return { x: (polygon[0].x + polygon[1].x) / 2, z: (polygon[0].z + polygon[1].z) / 2 };

  let cx = 0;
  let cz = 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = polygon[i].x * polygon[j].z - polygon[j].x * polygon[i].z;
    area += cross;
    cx += (polygon[i].x + polygon[j].x) * cross;
    cz += (polygon[i].z + polygon[j].z) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    // Degenerate — fall back to simple average
    let sx = 0, sz = 0;
    for (const v of polygon) { sx += v.x; sz += v.z; }
    return { x: sx / n, z: sz / n };
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, z: cz * factor };
}

/**
 * Axis-aligned bounding box of a polygon.
 */
export function polygonAABB(polygon: RoomVertex[]): BoundingBox2D {
  if (polygon.length === 0) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  let minX = polygon[0].x, maxX = polygon[0].x;
  let minZ = polygon[0].z, maxZ = polygon[0].z;
  for (const v of polygon) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Ensures the polygon is wound CCW.
 * If the signed area is negative (CW), reverses the array in-place.
 * Returns the same array reference.
 */
export function ensureCCW(polygon: RoomVertex[]): RoomVertex[] {
  if (computeSignedArea(polygon) < 0) {
    polygon.reverse();
  }
  return polygon;
}

/**
 * Returns true if the polygon has no self-intersections.
 * O(n²) — acceptable for n < 200 vertices.
 *
 * §FIX-REGION-RING-PRETRIM-FRAME (2026-08-07) — the maths (and its epsilons)
 * moved verbatim to `@pryzm/core-app-model/ring-simplicity` so the SLAB
 * triangulation path can assert earcut's precondition without depending on room
 * topology. Rooms speak `{x, z}`; the shared predicate speaks `{x, y}` for "the
 * two planar axes", hence the map. Behaviour is unchanged, including "fewer than
 * 3 vertices is NOT simple".
 */
export function isSimple(polygon: RoomVertex[]): boolean {
  return isSimpleRing(polygon.map(v => ({ x: v.x, y: v.z })));
}

/**
 * Ray-casting algorithm: true if point (px, pz) is inside the polygon.
 */
export function pointInPolygon(px: number, pz: number, polygon: RoomVertex[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > pz) !== (zj > pz)) &&
      (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * §FLOOR-INNER-FACE (2026-06-10) — inset a room CENTRELINE polygon inward, per
 * edge, to the INNER FACES of the bounding walls.
 *
 * The room boundary polygon runs along the wall CENTRELINES (the planar-topology
 * face tracer walks wall-graph nodes, which sit on `wall.baseLine`). A floor finish
 * built on that polygon therefore spans to the wall centre and OVERLAPS the
 * neighbouring room's floor UNDER the partition. The founder requires the floor to
 * stop at each wall's inner face — the actual usable floor area.
 *
 * This pure helper offsets each directed edge `i` (from `polygon[i]` to
 * `polygon[i+1]`) INWARD by `edgeInsets[i]` metres — normally the bounding wall's
 * `thickness / 2` — and recomputes each vertex as the intersection of its two
 * adjacent offset edge-lines (a MITER join, exactly like a wall corner). A
 * per-edge inset of `0` leaves that edge on the centreline (used at door openings,
 * so adjacent rooms' floors meet at the threshold).
 *
 * Winding: the input is assumed CCW (RoomDetectionEngine calls `ensureCCW`); for a
 * CCW ring the interior lies to the LEFT of each directed edge, so the inward
 * normal of edge (a→b) with direction (dx,dz) is (dz, -dx) normalised. The result
 * is re-sanitised (drops the degenerate verts a too-large inset can produce); if
 * the inset collapses the polygon (≥1 non-finite / <3 verts / near-zero area) the
 * ORIGINAL polygon is returned unchanged so a floor is always produced (fail-safe).
 *
 * Pure: no THREE, no store access, no I/O. O(n).
 *
 * @param polygon   CCW centreline ring (≥3 verts).
 * @param edgeInsets Per-edge inward offset in metres; `edgeInsets[i]` applies to
 *                   the edge starting at `polygon[i]`. Length MUST equal
 *                   `polygon.length`. Missing/NaN entries are treated as 0.
 */
export function insetPolygonToInnerFaces(
  polygon: RoomVertex[],
  edgeInsets: number[],
  onDiag?: (line: string) => void,
): RoomVertex[] {
  const n = polygon.length;
  if (n < 3) return polygon;

  // ── §FLOOR-INSET-COLLAPSE (2026-06-16) ──────────────────────────────────────
  // FIRST attempt the inset on the ring AS GIVEN. `_insetToInnerFacesOnce` returns
  // a clean simple inset polygon, or `null` when any guard (spike / inversion /
  // bow-tie / collapse) rejects it.
  const direct = _insetToInnerFacesOnce(polygon, edgeInsets, onDiag);
  if (direct) return direct;

  // The given ring failed — usually a BOW-TIE on a ROTATED room whose boundary was
  // subdivided at DOOR GAPS: `CreateFloorsByRoomTypeCommand._innerFacePolygon`
  // splits a straight wall edge at each opening, inserting COLLINEAR intermediate
  // vertices whose two adjacent edges are exactly collinear but carry DIFFERENT
  // insets (wall half-thickness on the solid run, 0 across the door gap). The
  // per-corner bevel fall-back at those collinear inset-transition vertices folds
  // the offset edges into a self-intersecting wedge → §FLOOR-INSET-SIMPLE rejects
  // it → the OVERSIZED centreline floor ships and overlaps the neighbour.
  //
  // RETRY on a COLLINEAR-COLLAPSED ring: merge each run of forward-collinear edges
  // into ONE edge carrying the MAX inset of the run (the wall, never the 0 of the
  // door gap). That removes the bow-tie SOURCE (the spurious collinear vertices)
  // while preserving the true room corners and the true wall insets, so the ring
  // insets cleanly to the inner face. Accept the retry ONLY if it is SIMPLE and
  // STRICTLY SMALLER than the centreline source (an inset can never grow the floor);
  // otherwise keep the centreline fall-back so a floor is always produced.
  const collapsed = _collapseCollinearRing(polygon, edgeInsets);
  if (collapsed && collapsed.ring.length >= 3 && collapsed.ring.length < n) {
    const retry = _insetToInnerFacesOnce(collapsed.ring, collapsed.insets, onDiag);
    if (retry && isSimple(retry)) {
      const retryArea = polygonAreaM2(retry);
      const srcArea = polygonAreaM2(polygon);
      if (retryArea > 0.01 && retryArea < srcArea - 1e-6) {
        onDiag?.(`§DIAG-FLOOR-INSET collinear-collapse retry succeeded (${n}→${collapsed.ring.length} edges, area ${retryArea.toFixed(2)}m² < source ${srcArea.toFixed(2)}m²) → inner-face inset`);
        return retry;
      }
    }
  }

  // §FLOOR-INSET-UNIFORM (founder 2026-06-18 "floor finish should ALWAYS fit the inner
  // wall face but sometimes goes off") — THIRD fall-back before the centreline overshoot.
  // The per-edge retry can STILL bow-tie when a door-gap edge keeps its 0 inset and folds.
  // The floor must sit inside the inner wall face on EVERY edge — a door OPENING must not
  // grow the floor out to the wall centreline (that's the overshoot the founder sees). So
  // inset EVERY edge of the corner ring UNIFORMLY by the dominant wall half-thickness: this
  // removes the door-gap-0 bow-tie source and yields the correct inner-face boundary. Accept
  // ONLY if simple + STRICTLY SMALLER than the centreline source (an inset never grows the
  // floor); otherwise keep the centreline ring so a floor is always produced.
  const cornerRing = (collapsed && collapsed.ring.length >= 3) ? collapsed.ring : polygon;
  const wallInset = edgeInsets.reduce((m, v) => (v > m ? v : m), 0);
  if (wallInset > 1e-6 && cornerRing.length >= 3) {
    const uniformInsets = cornerRing.map(() => wallInset);
    const retry2 = _insetToInnerFacesOnce(cornerRing, uniformInsets, onDiag);
    if (retry2 && isSimple(retry2)) {
      const a2 = polygonAreaM2(retry2);
      const srcArea = polygonAreaM2(polygon);
      if (a2 > 0.01 && a2 < srcArea - 1e-6) {
        onDiag?.(`§DIAG-FLOOR-INSET uniform fall-back succeeded (inset ${wallInset.toFixed(3)}m all edges, area ${a2.toFixed(2)}m² < source ${srcArea.toFixed(2)}m²) → inner-face`);
        return retry2;
      }
    }
  }

  // §FLOOR-INSET-CENTROID-SHRINK (founder 2026-06-18 "floor finishes still not fitting the
  // inner face") — LAST resort before the centreline overshoot. On a rotated room with door-gap
  // subdivided vertices, EVERY edge-based inset can bow-tie (the §DIAG "self-intersecting" /
  // "winding inverted" → centreline). Returning the CENTRELINE ring makes the floor extend to
  // the wall CENTRE → it pokes UNDER the partition and OVERLAPS the neighbour (the founder's
  // "floor goes off"). A uniform similarity-scale toward the centroid CANNOT self-intersect
  // (a star-shaped/convex ring stays simple), so it always yields a floor strictly INSIDE the
  // wall face — an approximate inner face, never an overlap. Better a slightly-conservative
  // floor that sits inside the room than one bleeding under the wall. Accept only if simple +
  // strictly smaller than the centreline source (an inset never grows the floor).
  // Gate to a PLAUSIBLE wall half-thickness (≤ 0.30 m). A larger requested inset means the
  // room genuinely cannot be inset (a too-large inset that would collapse/invert the room, or
  // a degenerate thin sliver) → keep the centreline fall-back (the original ring) so those
  // cases are unchanged. Only the real bow-tie case (a normal room, wall inset ≈ 0.05–0.10 m,
  // that bow-tied on a rotated corner) is rescued by the shrink.
  const shrinkInset = edgeInsets.reduce((m, v) => (v > m ? v : m), 0);
  if (shrinkInset > 1e-6 && shrinkInset <= 0.30) {
    let cx = 0, cz = 0;
    for (const v of polygon) { cx += v.x; cz += v.z; }
    cx /= n; cz /= n;
    let meanR = 0;
    for (const v of polygon) meanR += Math.hypot(v.x - cx, v.z - cz);
    meanR /= n;
    const f = meanR > 1e-6 ? Math.min(0.45, shrinkInset / meanR) : 0;
    if (f > 1e-6) {
      const shrunk = polygon.map(v => ({ ...v, x: cx + (v.x - cx) * (1 - f), z: cz + (v.z - cz) * (1 - f) }));
      if (isSimple(shrunk)) {
        const sa = polygonAreaM2(shrunk);
        const srcArea = polygonAreaM2(polygon);
        if (sa > 0.01 && sa < srcArea - 1e-6) {
          onDiag?.(`§DIAG-FLOOR-INSET centroid-shrink fall-back (f=${f.toFixed(3)}, area ${sa.toFixed(2)}m² < source ${srcArea.toFixed(2)}m²) → floor inside the wall face (approx, no overlap)`);
          return shrunk;
        }
      }
    }
  }

  // Neither the direct inset, the collapsed retry, the uniform inset, nor the centroid shrink
  // produced a valid inner-face polygon — keep the simple centreline ring so a floor is ALWAYS
  // produced (last-resort; the shrink above covers the rotated-room bow-tie case).
  return polygon;
}

/**
 * §FLOOR-INSET-COLLAPSE — merge runs of FORWARD-collinear edges in a subdivided
 * room ring into single edges, each carrying the MAX inset of the run.
 *
 * `_innerFacePolygon` subdivides a straight wall edge at every door opening,
 * inserting collinear intermediate vertices (perpendicular deviation ≈ float-noise
 * from the lerp) whose adjacent edges carry different insets (wall half-thickness
 * vs 0 at the door gap). A vertex is "removable" when its perpendicular distance
 * from the line through its two neighbours is < 1 mm AND it projects strictly
 * BETWEEN them (a genuine on-edge subdivision point, never a real corner or a
 * fold-back). Dropping it collapses the door-gap notch and removes the bow-tie
 * source; the surviving edge insets to the wall face (max inset), so floors of
 * adjacent rooms still abut UNDER the wall centreline (the door run is consumed by
 * the larger neighbour-side run, which is acceptable — the visible seam is at the
 * inner face, and the §FLOOR-INSET-SIMPLE guard still backstops any bad result).
 *
 * Returns `null` when no vertex is removable (nothing to collapse). Pure, O(n).
 */
function _collapseCollinearRing(
  polygon: RoomVertex[],
  edgeInsets: number[],
): { ring: RoomVertex[]; insets: number[] } | null {
  const n = polygon.length;
  if (n < 3) return null;
  const COLL_DIST = 1e-3; // 1 mm — a lerp-inserted on-edge vertex deviates ≈ 0.
  const removable: boolean[] = new Array(n).fill(false);
  for (let j = 0; j < n; j++) {
    const a = polygon[(j - 1 + n) % n]!;
    const b = polygon[j]!;
    const c = polygon[(j + 1) % n]!;
    const dx = c.x - a.x, dz = c.z - a.z;
    const baseLen = Math.hypot(dx, dz);
    if (baseLen < 1e-9) continue;
    // Perpendicular distance of b from the line a→c.
    const perp = Math.abs((b.x - a.x) * dz - (b.z - a.z) * dx) / baseLen;
    // Projection parameter of b onto a→c (must lie strictly between the neighbours
    // so a true corner / fold-back is never collapsed).
    const proj = ((b.x - a.x) * dx + (b.z - a.z) * dz) / (baseLen * baseLen);
    if (perp < COLL_DIST && proj > 1e-6 && proj < 1 - 1e-6) removable[j] = true;
  }
  if (!removable.some(Boolean)) return null;

  // Start the walk at a KEPT vertex so each run merges into the edge leaving it.
  let start = 0;
  while (start < n && removable[start]) start++;
  if (start >= n) return null; // degenerate (all collinear) — leave to the backstop.

  const ring: RoomVertex[] = [];
  const insets: number[] = [];
  for (let k = 0; k < n; k++) {
    const idx = (start + k) % n;
    if (removable[idx]) continue;
    ring.push({ x: polygon[idx]!.x, z: polygon[idx]!.z });
    // The surviving edge leaving `idx` spans every removed (collinear) vertex up to
    // the next kept vertex — its inset is the MAX over that run (the wall, not the
    // door gap's 0).
    let maxInset = Math.max(0, edgeInsets[idx] ?? 0);
    let m = (idx + 1) % n;
    let guard = 0;
    while (removable[m] && guard < n) {
      maxInset = Math.max(maxInset, edgeInsets[m] ?? 0);
      m = (m + 1) % n;
      guard++;
    }
    insets.push(maxInset);
  }
  if (ring.length < 3) return null;
  return { ring, insets };
}

/**
 * Core single-pass inner-face inset. Returns the mitered/bevelled inset polygon, or
 * `null` if any robustness guard rejects it (spike / sanitise / near-zero / winding
 * inversion / larger-than-source / self-intersecting bow-tie). The PUBLIC
 * `insetPolygonToInnerFaces` wraps this with the §FLOOR-INSET-COLLAPSE retry and the
 * centreline fail-safe. Pure, O(n²) (the `isSimple` guard dominates).
 */
function _insetToInnerFacesOnce(
  polygon: RoomVertex[],
  edgeInsets: number[],
  onDiag?: (line: string) => void,
): RoomVertex[] | null {
  const n = polygon.length;
  if (n < 3) return null;

  // Offset each edge-line inward by its inset. Represent each offset line by a
  // point on it (the offset midpoint anchor) plus its direction (unchanged).
  interface Line { px: number; pz: number; dx: number; dz: number; }
  const lines: Line[] = [];
  let maxInset = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) {
      // Degenerate edge — keep the line through `a` with a placeholder direction;
      // adjacent intersections will skip it gracefully.
      lines.push({ px: a.x, pz: a.z, dx: 0, dz: 0 });
      continue;
    }
    dx /= len; dz /= len;
    // Inward normal for a CCW ring: the interior lies to the LEFT of each directed
    // edge, so rotate the edge direction by +90° → (-dz, dx).
    const nx = -dz, nz = dx;
    const rawInset = edgeInsets[i];
    const inset = (typeof rawInset === 'number' && Number.isFinite(rawInset)) ? Math.max(0, rawInset) : 0;
    if (inset > maxInset) maxInset = inset;
    lines.push({ px: a.x + nx * inset, pz: a.z + nz * inset, dx, dz });
  }

  // §DIAG-FLOOR-INSET (2026-06-10) — bound for how far a mitered corner vertex may
  // legitimately move from its source corner. A true miter can grow with 1/sin(θ),
  // so for an acute corner it is sometimes a few × the inset — but a runaway
  // near-parallel intersection lands HUNDREDS of metres away (the founder's
  // "spike"). The two thresholds below separate the two cases robustly:
  //   - MITER_SIN_EPS: |cross| below this → adjacent edges too near-parallel to
  //     trust the intersection; bevel-fall-back instead.
  //   - maxMiterDist:  even when the intersection is computed, reject any vertex
  //     further than this from the original corner; bevel-fall-back.
  // The bevel fall-back offsets the original corner along the AVERAGE inward normal
  // by the local inset (a finite, local, never-exploding join). This keeps the
  // corner near the room and the floor plausible on irregular / rotated polygons.
  const MITER_SIN_EPS = 0.06;                 // ~3.4° between adjacent edges
  const maxMiterDist = Math.max(0.5, maxInset * 8); // ≥0.5 m, else 8× the inset
  let clampedCount = 0;

  // Bevel fall-back for vertex i: average the two adjacent edges' inward normals
  // (weighted equally) and step the original corner inward by the local inset
  // (the larger of the two adjacent edge insets, so a thick wall still pulls back).
  const bevelVertex = (i: number): RoomVertex => {
    const orig = polygon[i]!;
    const prevLine = lines[(i - 1 + n) % n]!;
    const curLine = lines[i]!;
    // Inward normal of a directed edge (dx,dz) on a CCW ring is (-dz, dx).
    const pnx = -prevLine.dz, pnz = prevLine.dx;
    const cnx = -curLine.dz, cnz = curLine.dx;
    let anx = pnx + cnx, anz = pnz + cnz;
    const alen = Math.hypot(anx, anz);
    if (alen < 1e-9) {
      // Opposed normals (collinear spike corner) — no sensible bevel direction;
      // keep the original corner (a 0-offset, never a spike).
      return { x: orig.x, z: orig.z };
    }
    anx /= alen; anz /= alen;
    const insetPrev = Math.max(0, edgeInsets[(i - 1 + n) % n] ?? 0);
    const insetCur = Math.max(0, edgeInsets[i] ?? 0);
    const localInset = Math.max(
      Number.isFinite(insetPrev) ? insetPrev : 0,
      Number.isFinite(insetCur) ? insetCur : 0,
    );
    return { x: orig.x + anx * localInset, z: orig.z + anz * localInset };
  };

  // Each NEW vertex i is the intersection of offset-line (i-1) and offset-line (i)
  // (the two edges meeting at original vertex i). Parallel / degenerate / runaway
  // pairs fall back to a local bevel so the inset never explodes into a spike.
  const out: RoomVertex[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n]!;
    const cur = lines[i]!;
    const orig = polygon[i]!;
    const cross = prev.dx * cur.dz - prev.dz * cur.dx;
    // MITER CLAMP (1): near-parallel adjacent edges → intersection is unreliable
    // (divides by ~0 → huge coordinate). Bevel instead.
    if (Math.abs(cross) < MITER_SIN_EPS || (prev.dx === 0 && prev.dz === 0) || (cur.dx === 0 && cur.dz === 0)) {
      out.push(bevelVertex(i));
      clampedCount++;
      continue;
    }
    // Solve prev.p + t*prev.d = cur.p + s*cur.d for the crossing point.
    const wx = cur.px - prev.px;
    const wz = cur.pz - prev.pz;
    const t = (wx * cur.dz - wz * cur.dx) / cross;
    const vx = prev.px + t * prev.dx;
    const vz = prev.pz + t * prev.dz;
    // MITER CLAMP (2): even with a non-trivial cross the intersection can land far
    // from the corner on a shallow/irregular join → reject + bevel.
    if (!Number.isFinite(vx) || !Number.isFinite(vz) || Math.hypot(vx - orig.x, vz - orig.z) > maxMiterDist) {
      out.push(bevelVertex(i));
      clampedCount++;
      continue;
    }
    out.push({ x: vx, z: vz });
  }

  if (clampedCount > 0) {
    onDiag?.(`§DIAG-FLOOR-INSET miter-clamp fired on ${clampedCount}/${n} corner(s) (near-parallel/runaway) → bevel fall-back`);
  }

  // PER-VERTEX SANITY: no output vertex may sit further than maxMiterDist from the
  // SOURCE polygon's corresponding corner. A spike that survived the per-corner
  // clamp (e.g. a finite-but-large miter just under the distance bound stacking
  // with another) is rejected here — fall back to the original centreline polygon
  // so the floor is still produced (a slightly-too-large floor beats a spike).
  for (let i = 0; i < out.length; i++) {
    const o = out[i]!;
    const src = polygon[i]!;
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z) || Math.hypot(o.x - src.x, o.z - src.z) > maxMiterDist + 1e-6) {
      onDiag?.(`§DIAG-FLOOR-INSET per-vertex sanity rejected vertex ${i} (${Math.hypot(o.x - src.x, o.z - src.z).toFixed(1)}m from source) → centreline fall-back`);
      return null;
    }
  }

  const sane = sanitisePolygon(out);
  if (!sane) { onDiag?.('§DIAG-FLOOR-INSET sanitise failed → centreline fall-back'); return null; } // fail-safe — never lose the floor
  if (polygonAreaM2(sane) < 0.01) { onDiag?.('§DIAG-FLOOR-INSET near-zero area → centreline fall-back'); return null; }
  // Inversion guard — a too-large inset crosses the offset edges past each other
  // and FLIPS the winding (the "polygon" turns inside-out, often with a larger
  // unsigned area, so the area check above misses it). If the signed-area sign no
  // longer matches the input, the inset has collapsed → fall back to the original.
  const srcCCW = computeSignedArea(polygon) >= 0;
  const dstCCW = computeSignedArea(sane) >= 0;
  if (srcCCW !== dstCCW) { onDiag?.('§DIAG-FLOOR-INSET winding inverted → centreline fall-back'); return null; }
  // Sanity: the inner face can never be LARGER than the centreline polygon.
  if (polygonAreaM2(sane) > polygonAreaM2(polygon) + 1e-6) { onDiag?.('§DIAG-FLOOR-INSET larger than source → centreline fall-back'); return null; }
  // SELF-INTERSECTION guard (§FLOOR-INSET-SIMPLE, 2026-06-16) — a too-large /
  // irregular inset (or a bevel fall-back on a near-collinear subdivided ring) can
  // cross adjacent offset edges and produce a BOW-TIE that survives EVERY check
  // above: its larger lobe keeps the winding sign, and its unsigned area stays
  // below the source. A bow-tie renders as a diagonal triangular WEDGE across the
  // room — the founder's recurring "one floor geometrically not working" (FL002/3).
  // Reject it → §FLOOR-INSET-COLLAPSE retry / centreline fall-back (always a simple
  // ring from detection/graph). This is the missing guard: the consumer's v213
  // area-ratio check can't catch a ~50%-area bow-tie, but `isSimple` catches it.
  if (!isSimple(sane)) { onDiag?.('§DIAG-FLOOR-INSET self-intersecting (bow-tie) → centreline fall-back'); return null; }
  return sane;
}

/**
 * Computes all RoomComputedMetrics from a boundary.
 */
export function computeRoomMetrics(boundary: RoomBoundary): RoomComputedMetrics {
  const { polygon, height } = boundary;
  const area = polygonAreaM2(polygon);
  const perimeter = polygonPerimeterM(polygon);
  const centroid = polygonCentroid(polygon);
  const bb = polygonAABB(polygon);
  return {
    area,
    grossArea: area,   // Phase 1: grossArea = area; wall-thickness offset in Phase 2
    perimeter,
    volume: area * height,
    centroid,
    boundingBox: bb,
  };
}

/**
 * Sanitises an external input polygon:
 * - Filters out non-finite vertices
 * - Removes consecutive duplicate vertices
 * - Clamps to MAX_POLYGON_VERTICES
 * Returns null if the polygon is degenerate (< 3 vertices or near-zero area).
 */
export function sanitisePolygon(vertices: unknown[]): RoomVertex[] | null {
  if (!Array.isArray(vertices)) return null;

  const valid: RoomVertex[] = [];
  for (const v of vertices) {
    if (typeof v !== 'object' || v === null) continue;
    const vv = v as Record<string, unknown>;
    const x = Number(vv['x']);
    const z = Number(vv['z']);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    // Remove consecutive duplicates
    if (valid.length > 0) {
      const last = valid[valid.length - 1];
      if (Math.abs(last.x - x) < 1e-10 && Math.abs(last.z - z) < 1e-10) continue;
    }
    valid.push({ x, z });
    if (valid.length >= MAX_POLYGON_VERTICES) break;
  }

  if (valid.length < 3) return null;
  if (polygonAreaM2(valid) < 0.01) return null;

  return valid;
}

/**
 * Proper-intersection point of two segments, or null. Mirrors the (exclusive)
 * crossing test in `ringSegmentsProperlyCross`/`isSimple` but RETURNS the point
 * so the repair can split the ring there.
 */
function segmentCrossPoint(
  p1: RoomVertex, p2: RoomVertex,
  p3: RoomVertex, p4: RoomVertex,
): RoomVertex | null {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x, d2z = p4.z - p3.z;
  const cross = d1x * d2z - d1z * d2x;
  if (Math.abs(cross) < 1e-10) return null; // parallel / collinear
  const dx = p3.x - p1.x, dz = p3.z - p1.z;
  const t = (dx * d2z - dz * d2x) / cross;
  const u = (dx * d1z - dz * d1x) / cross;
  if (t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10) {
    return { x: p1.x + t * d1x, z: p1.z + t * d1z };
  }
  return null;
}

/**
 * §A.21.D58 — Repair a self-intersecting room boundary into a SIMPLE polygon.
 *
 * The planar face-tracer (PlanarTopologyEngine) walks half-edges around a face.
 * On the upper floor of a generated house — the central-stair storey with many
 * partitions plus the stairwell void — a single traced face can come back
 * NON-SIMPLE in three ways, all of which fail RoomStore's `isSimple()` Zod gate
 * ("Room boundary polygon must not self-intersect") so the room is silently
 * dropped (missing floor / furniture):
 *
 *   (a) PROPER CROSSING (the live root) — two NON-ADJACENT boundary edges of the
 *       SAME face geometrically cross. This happens when a wall crossing on the
 *       dense upper floor was not split into a shared graph node (the partition /
 *       stair-void layout produces a crossing that escapes the T/X-junction
 *       margins), so the minimal-face walk threads an edge across another edge of
 *       its own boundary — a bow-tie / loop.
 *
 *   (b) PINCH / figure-8 — the boundary visits the same graph node twice (a
 *       partition that bridges the outer shell to the stair-void ring). The ring
 *       contains a repeated vertex and decomposes into two loops joined there.
 *
 *   (c) SPUR — the walk goes OUT along a dangling / §WJR-INVALID edge and back
 *       (the n===1 half-edge rule returns straight back), leaving a collinear
 *       back-and-forth dead-end A→B→A.
 *
 * Repair is DETERMINISTIC and conservative — it does NOT change which rooms
 * exist, only makes one room's boundary valid:
 *   1. Snap-quantise (1 mm), drop consecutive duplicates, strip collinear spurs.
 *   2. Split at any repeated vertex (pinch) → keep the largest simple sub-ring.
 *   3. Excise proper-crossing loops: at the first self-crossing, split the ring
 *      into the two loops that meet at the crossing point and keep the larger one;
 *      repeat to a fixpoint.
 *   4. Validate with `isSimple`; return null if still irreparable.
 *
 * Returns a simple polygon (≥3 verts, area ≥ 0.01 m²) or null.
 */
export function repairToSimplePolygon(polygon: RoomVertex[]): RoomVertex[] | null {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;

  // 1mm grid key so float jitter from the trace collapses coincident vertices.
  const SNAP = 1e-3;
  const key = (v: RoomVertex) => `${Math.round(v.x / SNAP)},${Math.round(v.z / SNAP)}`;

  // Drop consecutive (and cyclically-closing) duplicate vertices.
  const dedup = (verts: RoomVertex[]): RoomVertex[] => {
    const out: RoomVertex[] = [];
    for (const v of verts) {
      const prev = out[out.length - 1];
      if (prev && key(prev) === key(v)) continue;
      out.push(v);
    }
    while (out.length > 1 && key(out[0]) === key(out[out.length - 1])) out.pop();
    return out;
  };

  // Strip collinear spurs (A B A → A) to a fixpoint.
  const stripSpurs = (verts: RoomVertex[]): RoomVertex[] => {
    let ring = verts;
    let changed = true;
    while (changed && ring.length >= 3) {
      changed = false;
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n];
        const next = ring[(i + 1) % n];
        if (key(prev) === key(next)) {
          ring = dedup(ring.filter((_, idx) => idx !== i && idx !== (i + 1) % n));
          changed = true;
          break;
        }
      }
    }
    return ring;
  };

  // Split at the first repeated vertex (pinch) → keep largest simple sub-ring.
  const extractAtRepeatedVertex = (verts: RoomVertex[]): RoomVertex[] | null => {
    const seen = new Map<string, number>();
    for (let i = 0; i < verts.length; i++) {
      const k = key(verts[i]);
      if (seen.has(k)) {
        const j = seen.get(k)!;
        const loopA = verts.slice(j, i);
        const loopB = [...verts.slice(0, j), ...verts.slice(i)];
        const candidates = [loopA, loopB]
          .map(l => dedup(l))
          .filter(l => l.length >= 3)
          .map(l => extractAtRepeatedVertex(l))
          .filter((l): l is RoomVertex[] => l !== null);
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
        return candidates[0];
      }
      seen.set(k, i);
    }
    return verts.length >= 3 ? verts : null;
  };

  // Excise the first proper self-crossing loop; keep the larger component.
  // Returns the same ring if no proper crossing is found.
  const exciseFirstCrossing = (verts: RoomVertex[]): RoomVertex[] => {
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const a1 = verts[i], a2 = verts[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent (closing) edge
        const b1 = verts[j], b2 = verts[(j + 1) % n];
        const x = segmentCrossPoint(a1, a2, b1, b2);
        if (!x) continue;
        // Edges i and j cross at x. Two loops meet there:
        //   inner: x, verts[i+1..j], x   (the portion between the crossing edges)
        //   outer: verts[0..i], x, verts[j+1..n-1]
        const inner = dedup([x, ...verts.slice(i + 1, j + 1)]);
        const outer = dedup([...verts.slice(0, i + 1), x, ...verts.slice(j + 1)]);
        const innerOk = inner.length >= 3 ? inner : null;
        const outerOk = outer.length >= 3 ? outer : null;
        if (innerOk && outerOk) {
          return polygonAreaM2(innerOk) >= polygonAreaM2(outerOk) ? innerOk : outerOk;
        }
        return innerOk ?? outerOk ?? verts;
      }
    }
    return verts; // no proper crossing
  };

  let ring = stripSpurs(dedup(polygon));
  if (ring.length < 3) return null;

  // Pinch decomposition first (cheap, removes repeated-vertex degeneracies).
  ring = extractAtRepeatedVertex(ring) ?? ring;
  if (ring.length < 3) return null;

  // Proper-crossing excision to a fixpoint (bounded by vertex count).
  let guard = 0;
  while (!isSimple(ring) && guard < ring.length + 4) {
    const next = exciseFirstCrossing(ring);
    if (next === ring || next.length < 3) break; // no progress
    ring = stripSpurs(dedup(next));
    ring = extractAtRepeatedVertex(ring) ?? ring;
    if (ring.length < 3) return null;
    guard++;
  }

  if (ring.length < 3) return null;
  if (!isSimple(ring)) return null;
  if (polygonAreaM2(ring) < 0.01) return null;
  return ring;
}

/**
 * §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) — a read-only view of a wall the
 * room-finish boundary derivation needs: its centreline endpoints, thickness, and
 * door/window openings. Mirrors the WallData shape without importing the full type
 * (keeps this helper pure + decoupled from the wall store / geometry-wall package).
 */
export interface RoomFinishWall {
  /** Wall centreline as `[start, end]` in world X-Z. For a CURVED wall these are
   *  the arc's endpoints (the CHORD) — see `curve`. */
  baseLine?: ReadonlyArray<{ x: number; z: number }>;
  /** Overall wall thickness (m). The finish insets each edge by `thickness / 2`. */
  thickness: number;
  /** Door/window openings — only DOORS create a threshold gap in the finish. */
  openings?: ReadonlyArray<{ type: 'door' | 'window'; offset: number; width: number }>;
  /**
   * §FIX-CURVED-ROOM-FINISH-BOUNDARY (L-CURVE 2026-08-06) — quadratic-Bézier arc
   * metadata, mirroring the canonical wall schema (`packages/schemas/src/elements/Wall.ts`
   * `WallCurve`): when present the wall's true centreline is the Bézier
   * `baseLine[0] → control → baseLine[1]`, tessellated at `segments ?? 16` — the EXACT
   * sampling `RoomDetectionEngine` uses to build the room ring, so the room's arc-edge
   * chords align 1:1 with this wall's sampled chords. Only `control.x/.z` are read
   * (the maths is planar); `y` is tolerated so a raw `WallData.curve` passes through.
   */
  curve?: { control: { x: number; z: number; y?: number }; segments?: number };
}

/**
 * §FIX-CURVED-ROOM-FINISH-BOUNDARY — the wall's centreline as a polyline of chords.
 * Straight wall → the single `[start, end]` chord (bit-identical to the previous
 * behaviour). Curved wall → the quadratic Bézier sampled at `segments ?? 16`,
 * matching `PathResolver.toPolyline({kind:'Arc'},…)` / `THREE.QuadraticBezierCurve3`
 * exactly: p(t) = (1-t)²·s + 2(1-t)t·c + t²·e. Pure, no THREE.
 */
function _wallCentrelinePolyline(wall: RoomFinishWall): RoomVertex[] {
  const w0 = wall.baseLine?.[0], w1 = wall.baseLine?.[1];
  if (!w0 || !w1) return [];
  const c = wall.curve?.control;
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) {
    return [{ x: w0.x, z: w0.z }, { x: w1.x, z: w1.z }];
  }
  const rawSegs = wall.curve?.segments;
  const n = (typeof rawSegs === 'number' && Number.isFinite(rawSegs) && rawSegs >= 4)
    ? Math.min(256, Math.floor(rawSegs))
    : 16;
  const pts: RoomVertex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    pts.push({
      x: a * w0.x + b * c.x + d * w1.x,
      z: a * w0.z + b * c.z + d * w1.z,
    });
  }
  return pts;
}

/**
 * §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) — THE single canonical derivation of
 * a room's floor-finish boundary from its CENTRELINE ring + bounding walls. Both the
 * batch generators (`CreateFloorsByRoomTypeCommand`) and the interactive floor tool
 * (`FloorPlanToolHandler` AUTO mode) MUST call this so a room's finish has ONE boundary
 * regardless of entry point (C11: one element type → one creation pipeline).
 *
 * The room boundary polygon runs along the wall CENTRELINES (the planar face tracer
 * walks wall-graph nodes on `wall.baseLine`). A floor built on that polygon spans to the
 * wall centre and OVERLAPS the neighbour's floor UNDER the partition. This helper insets
 * each edge inward to its bounding wall's INNER FACE (`thickness / 2`), keeping the
 * centreline only across DOOR openings so adjacent floors meet at the threshold
 * (§FLOOR-DOOR-GAP). Fail-safe: returns the centreline polygon on any degenerate result
 * (so a floor is ALWAYS produced) — never a compensating second offset.
 *
 * Strategy (extracted verbatim from the batch path so its output is byte-identical):
 *   1. For each centreline edge, find the bounding wall whose centreline segment is
 *      collinear with — and contains the midpoint of — that edge.
 *   2. The edge's inset = that wall's thickness/2 (0 if no wall matched — keeps the
 *      centreline, the safe default).
 *   3. If the matched wall has ≥1 door opening, subdivide the edge into the door span(s)
 *      (inset 0) and the solid run(s) (inset thickness/2), introducing the span-boundary
 *      vertices so the miter inset only pulls back the solid runs.
 *   4. Call the pure `insetPolygonToInnerFaces`, which miters the offset edges, then
 *      accept the inset only if it is sane (≥3 verts, area ≥ 50% of the centreline);
 *      otherwise fall back to the centreline polygon.
 *
 * Pure: no THREE, no store access, no I/O. The caller resolves `walls` from its store and
 * passes an optional `onDiag` sink for the §DIAG breadcrumbs.
 *
 * @param centreline CCW room centreline ring (≥3 verts). Not mutated.
 * @param walls      Candidate bounding walls (the per-edge collinear test selects each).
 * @param onDiag     Optional diagnostic sink (dev-only; gated OFF in prod by callers).
 */
export function deriveRoomFinishBoundary(
  centreline: RoomVertex[],
  walls: ReadonlyArray<RoomFinishWall>,
  onDiag?: (line: string) => void,
): RoomVertex[] {
  const HALF = (t: number): number => Math.max(0, t) / 2;
  const ring: RoomVertex[] = [];
  const insets: number[] = [];
  let matchedEdges = 0;
  let doorGaps = 0;

  for (let i = 0; i < centreline.length; i++) {
    const a = centreline[i]!;
    const b = centreline[(i + 1) % centreline.length]!;
    const wall = _wallForFinishEdge(a, b, walls);
    if (!wall) {
      // No bounding wall on this edge — keep it on the centreline.
      ring.push({ x: a.x, z: a.z });
      insets.push(0);
      continue;
    }
    matchedEdges++;
    const half = HALF(wall.thickness);
    // Door spans on this wall, expressed as [t0,t1] parametric along a→b.
    const spans = _doorSpansOnFinishEdge(a, b, wall);
    if (spans.length === 0) {
      ring.push({ x: a.x, z: a.z });
      insets.push(half);
      continue;
    }
    // Subdivide a→b at door-span boundaries: solid runs inset to the inner face; door
    // runs stay on the centreline (inset 0) so adjacent floors meet at the threshold.
    doorGaps += spans.length;
    const cuts = _mergeFinishSpans(spans);
    let cursor = 0;
    for (const seg of cuts) {
      // Solid run before this door span.
      if (seg.t0 > cursor + 1e-6) {
        ring.push(_lerpFinish(a, b, cursor)); insets.push(half);
      }
      // Door run.
      ring.push(_lerpFinish(a, b, Math.max(seg.t0, cursor))); insets.push(0);
      cursor = seg.t1;
    }
    if (cursor < 1 - 1e-6) {
      ring.push(_lerpFinish(a, b, cursor)); insets.push(half);
    }
  }

  if (ring.length < 3) {
    onDiag?.('boundary=centreline ⚠ (degenerate after subdivide)');
    return centreline;
  }

  const inner = insetPolygonToInnerFaces(ring, insets, onDiag);
  const ok = inner !== ring; // util returns the SAME array ref on fail-safe.
  // §FLOOR-INSET-VALIDATE — the util can return a DIFFERENT array that is nonetheless
  // DEGENERATE (near-collapsed ring) on an odd / rotated room polygon; `inner !== ring`
  // only catches its EXPLICIT same-ref fail-safe. A wall-half-thickness inset (~0.1 m)
  // trims only a few % of area, so a >50% drop (or sign flip → ~0 area, or <3 verts)
  // means the inset folded → fall back to the centreline polygon (always a valid simple
  // ring from room detection / graph).
  const innerArea = polygonAreaM2(inner);
  const baseArea = polygonAreaM2(centreline);
  const insetSane = ok && inner.length >= 3 && baseArea > 0 && innerArea >= 0.5 * baseArea;
  const maxInset = insets.reduce((m, v) => Math.max(m, v), 0);
  onDiag?.(
    `boundary=${insetSane ? 'inner-face ✓' : (ok ? `centreline ⚠ (inset DEGENERATE: ${innerArea.toFixed(2)}m² vs base ${baseArea.toFixed(2)}m²)` : 'centreline ⚠ (inset collapsed)')} ` +
    `edges=${matchedEdges}/${centreline.length} maxInset=${(maxInset * 1000).toFixed(0)}mm door-gaps=${doorGaps}`,
  );
  return insetSane ? inner : centreline;
}

// ─── §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) ───────────────────────────
//
// L-213 converged TWO of the THREE floor-finish creation paths on
// `deriveRoomFinishBoundary` and called it a fix. The third (the 3D `FloorTool`
// AUTO_FROM_ROOM branch) shipped the RAW centreline ring, so its finish overshot
// into every bounding wall by half its thickness — the founder's L-240 bug.
//
// Converging N call sites by hand is a coincidence, not an architecture. The two
// helpers below make the derivation a property of the ELEMENT TYPE rather than of
// each tool:
//
//   • `resolveRoomFinishBoundary` — the ONE store-aware resolver (room → its
//     bounding walls → the pure `deriveRoomFinishBoundary`). Previously duplicated
//     verbatim in `CreateFloorsByRoomTypeCommand._innerFacePolygon` and
//     `FloorPlanToolHandler._innerFacePolygon`; both now delegate here.
//   • `ringsCoincide` — lets the `floor.create` chokepoint RECOGNISE a payload whose
//     polygon *is* the host room's centreline ring, i.e. a room-derived boundary that
//     forgot to say so. That is exactly the shape of the L-240 defect, and it is what
//     lets the command inset it by construction instead of trusting each tool to.
//
// Store-injected (no store import → this package stays a leaf w.r.t. the element
// stores, and the helper stays unit-testable with plain object literals).

/** Minimal store surface the finish resolver needs. Injected by the caller so this
 *  module keeps zero store / THREE / DOM dependencies. */
export interface RoomFinishStoreLookup {
  /** Host-room lookup — only `boundingWallIds` is read. */
  readonly getRoomById?: (id: string) => { boundingWallIds?: string[] } | undefined | null;
  /** Wall lookup by id (the room's recorded bounding walls). */
  readonly getWallById?: (id: string) => RoomFinishWall | undefined | null;
  /** Fallback when the room records no bounding walls: every wall on the level.
   *  The per-edge collinear test in `deriveRoomFinishBoundary` then selects. */
  readonly getWallsByLevel?: (levelId: string) => ReadonlyArray<RoomFinishWall>;
}

/**
 * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — THE single store-aware derivation of
 * a room's floor-finish boundary: resolve the room's candidate bounding walls, then
 * delegate the geometry to the pure `deriveRoomFinishBoundary`.
 *
 * Fail-safe on EVERY branch: an unavailable store, an unknown room, or no bounding walls
 * returns the centreline unchanged, so a floor is ALWAYS produced (never a half-derived
 * or compensated polygon).
 *
 * IDEMPOTENT BY CONSTRUCTION: it insets the CENTRELINE it is given. Callers must never
 * feed it an already-inset ring (the `floor.create` chokepoint guarantees this with
 * `ringsCoincide` + an explicit `boundarySource`), so a second inset is impossible.
 */
export function resolveRoomFinishBoundary(
  centreline: RoomVertex[],
  args: {
    readonly roomId?: string;
    readonly levelId?: string;
    readonly lookup: RoomFinishStoreLookup;
  },
  onDiag?: (line: string) => void,
): RoomVertex[] {
  try {
    const { roomId, levelId, lookup } = args;
    const walls: RoomFinishWall[] = [];

    // Candidate bounding walls: the room's recorded `boundingWallIds` first…
    const ids = (roomId ? lookup.getRoomById?.(roomId)?.boundingWallIds : undefined) ?? [];
    for (const id of ids) {
      const w = lookup.getWallById?.(id);
      if (w) walls.push(w);
    }
    // …else every wall on the level (the per-edge collinear test picks the right one).
    if (walls.length === 0 && levelId && lookup.getWallsByLevel) {
      walls.push(...lookup.getWallsByLevel(levelId));
    }
    if (walls.length === 0) {
      onDiag?.('boundary=centreline ⚠ (no bounding walls)');
      return centreline;
    }
    return deriveRoomFinishBoundary(centreline, walls, onDiag);
  } catch (err) {
    onDiag?.(`boundary=centreline ⚠ (resolver error: ${String(err)})`);
    return centreline;
  }
}

/**
 * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — do two rings describe the SAME polygon,
 * vertex-for-vertex (same length, index-aligned, within `eps`)?
 *
 * Used by the `floor.create` chokepoint to detect a payload whose polygon IS the host
 * room's centreline ring — a room-derived boundary that did not declare itself. Every
 * correctly-derived finish is strictly INSIDE the centreline, so a true inner-face polygon
 * can never be mistaken for one (and therefore can never be inset twice).
 */
export function ringsCoincide(
  a: ReadonlyArray<{ x: number; z: number }> | undefined | null,
  b: ReadonlyArray<{ x: number; z: number }> | undefined | null,
  eps = 1e-6,
): boolean {
  if (!a || !b || a.length !== b.length || a.length < 3) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!, q = b[i]!;
    if (Math.abs(p.x - q.x) > eps || Math.abs(p.z - q.z) > eps) return false;
  }
  return true;
}

/** Linear interpolation between two X-Z points at parameter `t`. */
function _lerpFinish(a: RoomVertex, b: RoomVertex, t: number): RoomVertex {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Find the bounding wall whose CENTRELINE is collinear with the room edge a→b and
 * contains the edge's midpoint (within a tolerance). The room polygon edge runs along
 * a wall centreline, so the midpoint lies ON the wall's centreline; perpendicular
 * distance ≈ 0 and the foot of the projection is between the segment endpoints.
 * Returns the BEST (closest) match.
 *
 * §FIX-CURVED-ROOM-FINISH-BOUNDARY — the centreline is a POLYLINE of chords
 * (`_wallCentrelinePolyline`): one chord for a straight wall (the previous behaviour,
 * bit-identical), or the tessellated Bézier for a curved wall. Before this, a curved
 * wall was matched against its CHORD `baseLine[0]→baseLine[1]` only, so the room
 * ring's tessellated arc edges matched ERRATICALLY (a few chord-parallel edges within
 * 200 mm matched → inset t/2; the rest missed → inset 0) → a sawtooth mixed-inset
 * boundary that visibly failed to follow the curve — the founder's parity bug: the
 * slab (which stores the traced ring verbatim) hugged the curve, the floor did not.
 * Because room detection samples the SAME Bézier at the SAME segment count, each arc
 * edge of the ring coincides with a sampled chord here → dot≈1, perp≈0 → every arc
 * edge insets by the wall's half-thickness → the finish follows the curve at the
 * INNER FACE, exactly like a straight wall.
 */
function _wallForFinishEdge(
  a: RoomVertex,
  b: RoomVertex,
  walls: ReadonlyArray<RoomFinishWall>,
): RoomFinishWall | undefined {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const exx = b.x - a.x, ezz = b.z - a.z;
  const elen = Math.hypot(exx, ezz);
  if (elen < 1e-6) return undefined;
  const eux = exx / elen, euz = ezz / elen;
  let best: RoomFinishWall | undefined;
  let bestPerp = 0.20; // 200 mm — tolerant of join-trim/miter offsets at ends.
  for (const w of walls) {
    const poly = _wallCentrelinePolyline(w);
    for (let s = 0; s < poly.length - 1; s++) {
      const w0 = poly[s]!, w1 = poly[s + 1]!;
      // Parallel? (edge direction ≈ chord direction, either sign)
      const wdx = w1.x - w0.x, wdz = w1.z - w0.z;
      const wlen = Math.hypot(wdx, wdz);
      if (wlen < 1e-6) continue;
      const wux = wdx / wlen, wuz = wdz / wlen;
      const dot = Math.abs(eux * wux + euz * wuz);
      if (dot < 0.985) continue; // > ~10° off — not the same wall line.
      // Perpendicular distance of the edge midpoint to the chord.
      const vx = mx - w0.x, vz = mz - w0.z;
      const tproj = (vx * wux + vz * wuz) / wlen; // 0..1 along the chord
      const footX = w0.x + tproj * wdx, footZ = w0.z + tproj * wdz;
      const perp = Math.hypot(mx - footX, mz - footZ);
      // Midpoint must project ONTO the chord (allow a small overhang for trims).
      if (tproj < -0.02 || tproj > 1.02) continue;
      if (perp < bestPerp) { bestPerp = perp; best = w; }
    }
  }
  return best;
}

/**
 * Door opening spans on the wall, mapped to parametric `[t0,t1]` along the room edge
 * a→b (t in 0..1). A wall stores openings as `{ offset, width }` where `offset` is the
 * centre position along the wall baseLine (metres from baseLine start). We project the
 * door's start/end onto a→b. Windows are ignored (a floor does not meet a neighbour at a
 * window). Clamped to [0,1]; empty if none land on this edge.
 */
function _doorSpansOnFinishEdge(
  a: RoomVertex,
  b: RoomVertex,
  wall: RoomFinishWall,
): Array<{ t0: number; t1: number }> {
  const openings = wall.openings ?? [];
  if (openings.length === 0) return [];
  // §FIX-CURVED-ROOM-FINISH-BOUNDARY — a curved wall's `offset` runs along the ARC,
  // not the chord, so the straight-line projection below would misplace the threshold.
  // Door-gap subdivision on curved walls is deferred: keep the solid inner-face inset
  // (conservative — the finish stops at the inner face; it never overshoots).
  if (wall.curve) return [];
  const w0 = wall.baseLine?.[0], w1 = wall.baseLine?.[1];
  if (!w0 || !w1) return [];
  const wlen = Math.hypot(w1.x - w0.x, w1.z - w0.z);
  if (wlen < 1e-6) return [];
  const wux = (w1.x - w0.x) / wlen, wuz = (w1.z - w0.z) / wlen;
  const edx = b.x - a.x, edz = b.z - a.z;
  const elen2 = edx * edx + edz * edz;
  if (elen2 < 1e-12) return [];
  // Project a wall-baseLine distance `d` (from w0) onto edge param t.
  const toEdgeT = (d: number): number => {
    const px = w0.x + wux * d, pz = w0.z + wuz * d;
    return ((px - a.x) * edx + (pz - a.z) * edz) / elen2;
  };
  const spans: Array<{ t0: number; t1: number }> = [];
  for (const op of openings) {
    if (op.type !== 'door') continue;
    const half = (op.width ?? 0) / 2;
    const tA = toEdgeT(op.offset - half);
    const tB = toEdgeT(op.offset + half);
    let t0 = Math.min(tA, tB), t1 = Math.max(tA, tB);
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
    if (t1 - t0 > 1e-4) spans.push({ t0, t1 });
  }
  return spans;
}

/** Merge overlapping door spans and sort ascending by t0. */
function _mergeFinishSpans(spans: Array<{ t0: number; t1: number }>): Array<{ t0: number; t1: number }> {
  const sorted = [...spans].sort((p, q) => p.t0 - q.t0);
  const out: Array<{ t0: number; t1: number }> = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.t0 <= last.t1 + 1e-6) { last.t1 = Math.max(last.t1, s.t1); }
    else { out.push({ ...s }); }
  }
  return out;
}
