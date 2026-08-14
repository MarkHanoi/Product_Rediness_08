// WallLayerPlanLines — §FIX-PLAN-LAYERED-WALL-SYMBOL (L-62).
//
// PURE module (no THREE, no DOM). Computes the INTERNAL layer-boundary lines of a LAYERED
// wall in plan (world XZ), clipped at any opening whose void crosses the plan cut plane.
//
// WHY: a layered system type (e.g. "Interior – Partition 100 mm") renders correctly in 3D —
// `WallFragmentBuilder` builds ONE mesh per layer, offset along the wall normal — but PLAN
// view showed only the PLAIN single-volume outline (the wall's outer footprint), so the layer
// composition (core + finishes) was invisible. The outer footprint is already drawn by the
// wall's own projection; what is missing are the N−1 lines BETWEEN adjacent layers. This
// module emits exactly those, matching the 3D layer offsets byte-for-byte so plan and 3D agree.
//
// Layer offset convention — mirrored EXACTLY from `WallFragmentBuilder` (the 3D path):
//   totalThickness = Σ layer.thickness
//   cursor starts at −totalThickness/2 (layers centred on the baseline)
//   outward normal = (−dir.z, +dir.x)   (left-perpendicular of the wall direction)
//   layer k spans [cursor_k, cursor_k + t_k] along `outward`; the boundary AFTER layer k
//   (for k = 0 … N−2) is the internal line at offset  −totalThickness/2 + Σ_{i≤k} t_i.
//
// The two OUTER faces (offsets ±totalThickness/2) are the wall's own footprint edges and are
// NOT emitted here (that would double the outline).

export interface LayerLineOpening {
    /** Left-edge offset (m) from the wall start along the baseline. */
    readonly offset: number;
    readonly width: number;
    /** Sill height (m) above the wall base. */
    readonly sillHeight: number;
    /** Opening height (m). */
    readonly height: number;
}

export interface LayerLineWall {
    readonly baseLine: ReadonlyArray<{ readonly x: number; readonly y?: number; readonly z: number }>;
    /**
     * The stored construction assembly. `function` is read ONLY by
     * `computeWallLayerInsulationHatch` (§FEAT-WALL-PLAN-LOD, L-286) — the LOD-300
     * hatch is a property of the layer's stored FUNCTION, never of its index or its
     * name (C09 §4.6.3: the regions and their tones derive from the stored record).
     */
    readonly layers?: ReadonlyArray<{ readonly thickness: number; readonly function?: string }>;
    readonly openings?: ReadonlyArray<LayerLineOpening>;
    /** Presence marks a curved wall — skipped (handled separately). */
    readonly curve?: unknown;
}

/** A world-XZ line segment (endpoints). */
export interface LayerLineSeg {
    readonly ax: number; readonly az: number;
    readonly bx: number; readonly bz: number;
    /** Signed offset of this line from the baseline along the outward normal (m). */
    readonly offset: number;
}

const PLAN_EPS_M = 1e-6;   // C73 §2.3 — 1 micron, in METRES: the degenerate-length guard for layer thicknesses, spans and zones in this file.
/** Vertical tolerance for deciding an opening void straddles the cut plane. */
const CUT_MARGIN_M = 0.05;

/**
 * Internal layer-boundary line segments for one layered wall, in world XZ, clipped at any
 * opening whose void crosses the cut plane `cutRelToBase` (metres above the wall base).
 *
 * Returns `[]` for a plain wall (no `layers`, or a single layer), a curved wall, or a
 * degenerate baseline — nothing to draw.
 */
export function computeWallLayerLines(
    wall: LayerLineWall,
    cutRelToBase: number,
): LayerLineSeg[] {
    const layers = wall.layers;
    if (!layers || layers.length < 2) return [];      // plain / single-layer → outer footprint only
    if (wall.curve) return [];                         // curved layered walls: separate path
    const basis = wallPlanBasis(wall);
    if (!basis) return [];
    const { sx, sz, dx, dz, ox, oz, len } = basis;

    const total = layers.reduce((s, l) => s + (l.thickness > 0 ? l.thickness : 0), 0);
    if (total < PLAN_EPS_M) return [];

    // Internal boundary offsets (skip the two outer faces at ±total/2).
    const boundaries: number[] = [];
    let cursor = -total / 2;
    for (let k = 0; k < layers.length - 1; k++) {
        cursor += Math.max(0, layers[k]!.thickness);
        boundaries.push(cursor);
    }

    // Opening zones (along-wall [min,max]) whose void straddles the cut plane —
    // strictly inside the opening (5 cm tolerance), matching EdgeProjectorService.
    const keptIntervals = subtractZones(len, openingZones(wall, cutRelToBase, len));

    const segs: LayerLineSeg[] = [];
    for (const offset of boundaries) {
        const px = sx + ox * offset, pz = sz + oz * offset;   // boundary line origin (wall start)
        for (const [a, b] of keptIntervals) {
            if (b - a < PLAN_EPS_M) continue;
            segs.push({
                ax: px + dx * a, az: pz + dz * a,
                bx: px + dx * b, bz: pz + dz * b,
                offset,
            });
        }
    }
    return segs;
}

/**
 * §FEAT-WALL-PLAN-LOD (L-286) — the LOD-300 addition for a wall in plan: the
 * INSULATION HATCH, one stroke set per stored layer whose `function` is 'insulation'.
 *
 * WHY THIS, AND WHY IT IS NOT INVENTED
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-121 §4.2 defines LOD 300 as "full construction detail … every dimension read
 * from the element's record", and names the **insulation hatch** explicitly among the
 * additions. The wall record already carries the assembly (`wall.layers`) and each
 * layer already carries its `function` (`WallLayerFunction`, one of which is
 * 'insulation') — the same field `resolveWallLayerPocheFill` tones the poché from.
 * So the hatch asks the RECORD which bands are insulation; it never counts layers,
 * never matches a name, and never types a dimension:
 *
 *   • WHICH bands  → `layer.function === 'insulation'`   (stored)
 *   • band extent  → the layer's own `thickness` at its own cursor offset (stored,
 *                     identical to the offsets `computeWallLayerLines` and the 3D
 *                     `WallFragmentBuilder` use — so hatch, boundary line and 3D
 *                     layer cannot drift apart)
 *   • stroke pitch → the band's own thickness. A 45° stroke across a band of
 *                     thickness t, repeated every t, is the ISO convention AND is
 *                     scale-free: it is the only pitch derivable from the record.
 *
 * STRICT SUPERSET (ADR-121 §4.2 invariant): the hatch is drawn INSIDE the bands the
 * LOD-200 boundary lines already bound. It ADDS strokes; it moves and removes nothing.
 *
 * Openings: hatched exactly where the boundary lines survive (`subtractZones`), so a
 * door void is not hatched — the insulation is not there.
 *
 * @param wall          The wall record (baseline + layers + openings).
 * @param cutRelToBase  Plan cut height above the wall base (m).
 */
export function computeWallLayerInsulationHatch(
    wall: LayerLineWall,
    cutRelToBase: number,
): LayerLineSeg[] {
    const layers = wall.layers;
    if (!layers || layers.length < 2) return [];
    if (wall.curve) return [];
    const basis = wallPlanBasis(wall);
    if (!basis) return [];
    const { sx, sz, dx, dz, ox, oz, len } = basis;

    const total = layers.reduce((s, l) => s + (l.thickness > 0 ? l.thickness : 0), 0);
    if (total < PLAN_EPS_M) return [];

    const keptIntervals = subtractZones(len, openingZones(wall, cutRelToBase, len));

    const segs: LayerLineSeg[] = [];
    let cursor = -total / 2;
    for (const layer of layers) {
        const t = Math.max(0, layer.thickness);
        const near = cursor;
        cursor += t;
        if (layer.function !== 'insulation' || t < PLAN_EPS_M) continue;
        const far = cursor;

        // World point at (along, offset) in the wall's plan frame.
        const at = (along: number, offset: number): [number, number] => [
            sx + dx * along + ox * offset,
            sz + dz * along + oz * offset,
        ];

        for (const [a, b] of keptIntervals) {
            // 45° strokes: run `t` along the wall while crossing the band's `t` depth.
            // Pitch = t. Only whole strokes are emitted, so no stroke escapes the band
            // or the kept interval — the hatch never draws where the wall is not.
            for (let s = a; s + t <= b + PLAN_EPS_M; s += t) {
                const [ax, az] = at(s, near);
                const [bx, bz] = at(s + t, far);
                segs.push({ ax, az, bx, bz, offset: (near + far) / 2 });
            }
        }
    }
    return segs;
}

/** Shared plan basis for a wall — start point, unit direction, outward normal, length. */
function wallPlanBasis(wall: LayerLineWall):
    { sx: number; sz: number; dx: number; dz: number; ox: number; oz: number; len: number } | null {
    const bl = wall.baseLine;
    if (!bl || bl.length < 2 || !bl[0] || !bl[1]) return null;
    const sx = bl[0].x, sz = bl[0].z;
    const dxRaw = bl[1].x - sx, dzRaw = bl[1].z - sz;
    const len = Math.hypot(dxRaw, dzRaw);
    if (len < PLAN_EPS_M) return null;
    const dx = dxRaw / len, dz = dzRaw / len;
    return { sx, sz, dx, dz, ox: -dz, oz: dx, len };
}

/** Along-wall [min,max] zones of the openings whose void straddles the cut plane. */
function openingZones(
    wall: LayerLineWall,
    cutRelToBase: number,
    len: number,
): Array<{ min: number; max: number }> {
    const zones: Array<{ min: number; max: number }> = [];
    for (const op of wall.openings ?? []) {
        const w = Number(op.width), off = Number(op.offset);
        const sill = Number(op.sillHeight) || 0, h = Number(op.height);
        if (!Number.isFinite(w) || !Number.isFinite(off) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
        if (cutRelToBase <= sill + CUT_MARGIN_M || cutRelToBase >= sill + h - CUT_MARGIN_M) continue;
        const min = Math.max(0, Math.min(len, off));
        const max = Math.max(0, Math.min(len, off + w));
        if (max - min > PLAN_EPS_M) zones.push({ min, max });
    }
    return zones;
}

/** Complement of merged `zones` within [0, len] → the kept sub-intervals. Pure. */
function subtractZones(len: number, zones: ReadonlyArray<{ min: number; max: number }>): Array<[number, number]> {
    if (zones.length === 0) return [[0, len]];
    const sorted = [...zones].sort((p, q) => p.min - q.min);
    const merged: Array<{ min: number; max: number }> = [];
    for (const z of sorted) {
        const last = merged[merged.length - 1];
        if (last && z.min <= last.max + PLAN_EPS_M) last.max = Math.max(last.max, z.max);
        else merged.push({ min: z.min, max: z.max });
    }
    const kept: Array<[number, number]> = [];
    let x = 0;
    for (const z of merged) {
        if (z.min - x > PLAN_EPS_M) kept.push([x, z.min]);
        x = Math.max(x, z.max);
    }
    if (len - x > PLAN_EPS_M) kept.push([x, len]);
    return kept;
}
