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
    readonly layers?: ReadonlyArray<{ readonly thickness: number }>;
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

const EPS = 1e-6;
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
    const bl = wall.baseLine;
    if (!bl || bl.length < 2 || !bl[0] || !bl[1]) return [];

    const sx = bl[0].x, sz = bl[0].z;
    const dxRaw = bl[1].x - sx, dzRaw = bl[1].z - sz;
    const len = Math.hypot(dxRaw, dzRaw);
    if (len < EPS) return [];
    const dx = dxRaw / len, dz = dzRaw / len;          // unit wall direction
    const ox = -dz, oz = dx;                           // outward normal = (−dir.z, +dir.x)

    const total = layers.reduce((s, l) => s + (l.thickness > 0 ? l.thickness : 0), 0);
    if (total < EPS) return [];

    // Internal boundary offsets (skip the two outer faces at ±total/2).
    const boundaries: number[] = [];
    let cursor = -total / 2;
    for (let k = 0; k < layers.length - 1; k++) {
        cursor += Math.max(0, layers[k]!.thickness);
        boundaries.push(cursor);
    }

    // Opening zones (along-wall [min,max]) whose void straddles the cut plane.
    const zones: Array<{ min: number; max: number }> = [];
    for (const op of wall.openings ?? []) {
        const w = Number(op.width), off = Number(op.offset);
        const sill = Number(op.sillHeight) || 0, h = Number(op.height);
        if (!Number.isFinite(w) || !Number.isFinite(off) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
        // Strictly inside the opening (5 cm tolerance) — matches EdgeProjectorService.
        if (cutRelToBase <= sill + CUT_MARGIN_M || cutRelToBase >= sill + h - CUT_MARGIN_M) continue;
        const min = Math.max(0, Math.min(len, off));
        const max = Math.max(0, Math.min(len, off + w));
        if (max - min > EPS) zones.push({ min, max });
    }
    const keptIntervals = subtractZones(len, zones);

    const segs: LayerLineSeg[] = [];
    for (const offset of boundaries) {
        const px = sx + ox * offset, pz = sz + oz * offset;   // boundary line origin (wall start)
        for (const [a, b] of keptIntervals) {
            if (b - a < EPS) continue;
            segs.push({
                ax: px + dx * a, az: pz + dz * a,
                bx: px + dx * b, bz: pz + dz * b,
                offset,
            });
        }
    }
    return segs;
}

/** Complement of merged `zones` within [0, len] → the kept sub-intervals. Pure. */
function subtractZones(len: number, zones: ReadonlyArray<{ min: number; max: number }>): Array<[number, number]> {
    if (zones.length === 0) return [[0, len]];
    const sorted = [...zones].sort((p, q) => p.min - q.min);
    const merged: Array<{ min: number; max: number }> = [];
    for (const z of sorted) {
        const last = merged[merged.length - 1];
        if (last && z.min <= last.max + EPS) last.max = Math.max(last.max, z.max);
        else merged.push({ min: z.min, max: z.max });
    }
    const kept: Array<[number, number]> = [];
    let x = 0;
    for (const z of merged) {
        if (z.min - x > EPS) kept.push([x, z.min]);
        x = Math.max(x, z.max);
    }
    if (len - x > EPS) kept.push([x, len]);
    return kept;
}
