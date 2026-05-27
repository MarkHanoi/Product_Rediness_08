// WallFootprint2D — Pascal-style wall footprint polygon assembler (ADR-0055 P2).
//
// PURE module (no THREE). Consumes the `WallMiter[]` produced by
// `JunctionResolverV2.resolveJunctions()` plus the original wall inputs, and
// produces a CCW 4-/5-/6-vertex polygon per wall in plan (XZ) coordinates.
//
// Polygon layout (Pascal pattern from `wall-footprint.ts`):
//
//     start ─────────────────────────────────── end
//       │                                        │
//       sL ───────────────────────────── eL
//       │                                        │
//      sPivot? ◀ start junction      end junction ▶ ePivot?
//       │                                        │
//       sR ───────────────────────────── eR
//
// CCW (looking down +Y): [ sR, eR, ePivot?, eL, sL, sPivot? ].
//
// CRITICAL SIGN CONVENTION: `JunctionResolverV2` stores corners in JUNCTION-FRAME
// — "left" is left of the direction AWAY FROM the junction along the wall body.
// At the wall's START that frame == wall frame (direction-away = +walldir), so
// `miter.startLeft` is the wall's left-at-start. At the wall's END, the direction-
// away from the junction is −walldir, so the junction's "left" is the wall's
// RIGHT. The polygon builder therefore SWAPS endLeft/endRight when reading them
// out — without that swap the wall's polygon is flipped at the END.
//
// Walls with NO junction at either end fall back to perpendicular square caps;
// the polygon is a 4-vertex axis-aligned rectangle, identical to today's behaviour.

import type { Pt2, WallInput, WallMiter } from './JunctionResolverV2.js';

export interface WallFootprint {
    readonly id: string;
    /** CCW polygon in plan XZ. 4–6 vertices. */
    readonly polygon: readonly Pt2[];
    /** Wall unit direction (end − start) — useful for the extruder. */
    readonly direction: Pt2;
    /** Centerline endpoints (unchanged from input — for the door/window cutout maths). */
    readonly start: Pt2;
    readonly end:   Pt2;
    /** Wall half-thickness — needed by callers that compute opening offsets. */
    readonly halfThickness: number;
}

// ─── Helpers (mirrored from JunctionResolverV2; pure 2-D) ─────────────────────

const sub = (a: Pt2, b: Pt2): Pt2 => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a: Pt2, b: Pt2): Pt2 => ({ x: a.x + b.x, z: a.z + b.z });
const scale = (a: Pt2, k: number): Pt2 => ({ x: a.x * k, z: a.z * k });
const len = (a: Pt2): number => Math.hypot(a.x, a.z);
const unit = (a: Pt2): Pt2 => { const L = len(a) || 1; return { x: a.x / L, z: a.z / L }; };
const leftPerp = (d: Pt2): Pt2 => ({ x: -d.z, z: d.x });   // CCW 90°

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the CCW footprint polygon for one wall, applying miter overrides where present. */
export function buildWallFootprint(wall: WallInput, miter: WallMiter | null | undefined): WallFootprint {
    const dir = unit(sub(wall.end, wall.start));
    const leftP = leftPerp(dir);
    const halfT = wall.thickness * 0.5;

    // Perpendicular (square-cap) defaults — used when an end is NOT at a junction.
    const sLDefault = add(wall.start, scale(leftP, +halfT));
    const sRDefault = add(wall.start, scale(leftP, -halfT));
    const eLDefault = add(wall.end,   scale(leftP, +halfT));
    const eRDefault = add(wall.end,   scale(leftP, -halfT));

    // Apply junction-derived corners. CRITICAL SWAP at the END (see header).
    //   wall.startLeft  (wall-frame) = junction.startLeft   (junction-frame, same direction)
    //   wall.startRight (wall-frame) = junction.startRight
    //   wall.endLeft    (wall-frame) = junction.endRight    ← SWAP (direction reversed at END)
    //   wall.endRight   (wall-frame) = junction.endLeft     ← SWAP
    const m = miter ?? undefined;
    const sL = m?.startLeft  ?? sLDefault;
    const sR = m?.startRight ?? sRDefault;
    const eL = m?.endRight   ?? eLDefault;
    const eR = m?.endLeft    ?? eRDefault;

    // CCW polygon: start-right → end-right → (end pivot) → end-left → start-left → (start pivot).
    const poly: Pt2[] = [sR, eR];
    if (m?.endPivot)   poly.push(m.endPivot);
    poly.push(eL, sL);
    if (m?.startPivot) poly.push(m.startPivot);

    return {
        id: wall.id,
        polygon: poly,
        direction: dir,
        start: wall.start,
        end: wall.end,
        halfThickness: halfT,
    };
}

/** Build footprints for an entire level. `miters` is index-aligned with `walls`. */
export function buildAllFootprints(
    walls: readonly WallInput[],
    miters: readonly WallMiter[],
): WallFootprint[] {
    const byId = new Map<string, WallMiter>();
    for (const m of miters) byId.set(m.id, m);
    return walls.map(w => buildWallFootprint(w, byId.get(w.id) ?? null));
}
