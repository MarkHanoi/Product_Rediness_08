/**
 * ColumnSectionGeometry — §FEAT-COLUMN-PLAN-LOD (L-286), the COLUMN row of ADR-121.
 *
 * PURE module (no THREE, no OBC, no DOM). It answers exactly two questions, and both
 * answers come from the COLUMN'S OWN RECORD:
 *
 *   1. `computeColumnSectionPolygon` — WHAT SHAPE IS THIS COLUMN WHERE THE PLANE CUTS IT?
 *   2. `computeSectionHatch`        — the LOD-300 material hatch, clipped to that shape.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * A DEFECT FOUND WHILE WIRING THE LOD, AND FIXED HERE (it is not an LOD bug, it was
 * always wrong): **a CIRCULAR column was drawn in plan as a RECTANGLE.**
 * `ColumnPlanSymbolBuilder._injectConcreteSymbol` took `profile: 'rectangular' | 'circular'`
 * and drew `width × depth` corners for BOTH — so a Ø300 circular column printed as a
 * 300×300 square, on the drawing an engineer dimensions off. The record has said
 * `profile: 'circular'` all along (`ColumnData.profile`, and `width` is documented as
 * "or diameter"); the symbol simply never asked. This module asks.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * ADR-121 §4.4 — THE SYMBOL IS DERIVED FROM THE RECORD, NEVER FROM LITERALS. Every
 * dimension below is `col.width` / `col.depth` / `col.rotation`, or the steel type's own
 * `D`/`B`/`t`/`T` from `SteelProfileLibrary`. The only constants are TESSELLATION
 * RESOLUTION (how many chords approximate a circle) and the hatch ANGLE — neither is a
 * dimension of anything, and neither changes where a line lands.
 */

/** A world-XZ polygon vertex. */
export interface Pt { readonly x: number; readonly z: number }
/** A world-XZ line segment. */
export interface Seg { readonly ax: number; readonly az: number; readonly bx: number; readonly bz: number }

/** The subset of `ColumnData` this module reads. */
export interface SectionColumn {
    readonly position: { readonly x: number; readonly z: number };
    readonly rotation?: number;
    readonly profile?: 'rectangular' | 'circular' | 'UC' | 'UB';
    readonly width?: number;
    readonly depth?: number;
}

/** The steel section's dimensions, IN METRES (`SteelProfileLibrary.toMetres`). */
export interface SteelSectionMetres {
    readonly D: number; readonly B: number; readonly t: number; readonly T: number;
}

/** Chords used to approximate a circular column — resolution, not a dimension. */
const CIRCLE_SEGMENTS = 32;

/**
 * The column's TRUE cut section, as a closed world-XZ polygon.
 *
 * `steel` is supplied only for a 'UC'/'UB' column whose `steelProfileName` resolved in the
 * library; when it is absent the column falls back to its rectangular footprint, which is
 * what the record then says it is.
 */
export function computeColumnSectionPolygon(col: SectionColumn, steel?: SteelSectionMetres | null): Pt[] {
    const cx = col.position.x, cz = col.position.z;
    const rot = col.rotation ?? 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const world = (lx: number, lz: number): Pt => ({
        x: cx + lx * cos - lz * sin,
        z: cz + lx * sin + lz * cos,
    });

    if (steel) {
        // The 12-point I/H section: flange outer edges, flange returns, web faces.
        const hw = steel.B / 2, hd = steel.D / 2;
        const ht = steel.t / 2, wh = hd - steel.T;
        return ([
            [-hw, -hd], [ hw, -hd], [ hw, -wh],
            [ ht, -wh], [ ht,  wh], [ hw,  wh],
            [ hw,  hd], [-hw,  hd], [-hw,  wh],
            [-ht,  wh], [-ht, -wh], [-hw, -wh],
        ] as Array<[number, number]>).map(([lx, lz]) => world(lx, lz));
    }

    if (col.profile === 'circular') {
        // §FEAT-COLUMN-PLAN-LOD — `width` IS the diameter for a circular column (the
        // record's own doc comment: "width: number; // or diameter"). Drawing this as a
        // rectangle, as the symbol did, is a dimensional lie on a construction drawing.
        const r = Math.max(0, (col.width ?? 0.3) / 2);
        const pts: Pt[] = [];
        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
            pts.push(world(r * Math.cos(a), r * Math.sin(a)));
        }
        return pts;
    }

    const hw = (col.width ?? 0.3) / 2;
    const hd = (col.depth ?? 0.3) / 2;
    return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Array<[number, number]>)
        .map(([lx, lz]) => world(lx, lz));
}

/** The polygon's closing edges, as segments — the outline every LOD draws. */
export function polygonEdges(poly: readonly Pt[]): Seg[] {
    const segs: Seg[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    }
    return segs;
}

/**
 * The LOD-300 MATERIAL HATCH: 45° strokes filling the cut section, clipped to the polygon.
 *
 * ADR-121 §4.2 names the material hatch among the LOD-300 additions, and C09 §4.6.2 makes a
 * CUT solid a FILLED REGION rather than an outline. The hatch is **strictly additive** — it
 * lives INSIDE the outline every lower tier already draws, and moves nothing (§4.2's
 * superset invariant).
 *
 * The clip is an even-odd scanline against the real polygon, so it works unchanged for the
 * rectangle, the circle AND the re-entrant I-section — the web notches of a UC are NOT
 * hatched, because there is no steel there. (A hatch that ignores the section's true shape
 * would be the same class of lie as the rectangle-for-a-circle above.)
 *
 * @param poly  The cut section polygon (world XZ).
 * @param pitch Stroke spacing — the CALLER derives it from the record, never this module.
 */
export function computeSectionHatch(poly: readonly Pt[], pitch: number): Seg[] {
    if (poly.length < 3 || !(pitch > 0)) return [];

    // Scan along u = (x + z)/√2 — i.e. hatch lines run at 45° (direction (1,−1)/√2).
    // Working in the rotated frame (u, v) makes the clip a 1-D interval problem.
    const R = Math.SQRT1_2;
    const u = (p: Pt) => (p.x + p.z) * R;
    const v = (p: Pt) => (p.x - p.z) * R;
    const toWorld = (uu: number, vv: number): Pt => ({ x: (uu + vv) * R, z: (uu - vv) * R });

    let uMin = Infinity, uMax = -Infinity;
    for (const p of poly) { const c = u(p); if (c < uMin) uMin = c; if (c > uMax) uMax = c; }
    if (!Number.isFinite(uMin) || uMax - uMin < 1e-9) return [];

    const segs: Seg[] = [];
    // Start on a pitch multiple so the hatch is stable under translation of the column.
    const first = Math.ceil(uMin / pitch) * pitch;
    for (let uu = first; uu < uMax; uu += pitch) {
        // Every crossing of the scan line u = uu with the polygon's edges.
        const xs: number[] = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            const ua = u(a), ub = u(b);
            if ((ua <= uu && ub > uu) || (ub <= uu && ua > uu)) {
                const t = (uu - ua) / (ub - ua);
                xs.push(v(a) + t * (v(b) - v(a)));
            }
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        // Even-odd: [0,1], [2,3], … are INSIDE the section; the gaps are the web notches.
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const p0 = toWorld(uu, xs[i]!), p1 = toWorld(uu, xs[i + 1]!);
            if (Math.hypot(p1.x - p0.x, p1.z - p0.z) < 1e-9) continue;
            segs.push({ ax: p0.x, az: p0.z, bx: p1.x, bz: p1.z });
        }
    }
    return segs;
}
