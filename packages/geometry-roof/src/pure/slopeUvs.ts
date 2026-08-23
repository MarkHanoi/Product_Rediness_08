// ─────────────────────────────────────────────────────────────────────────────
// §ROOF-SLOPE-METRE-UVS — C100 §10.16 (slice S34, minted in §10.15.f as "S33").
// Issue-log L-10020 … L-10025.
//
// PURE. No THREE, no DOM, no I/O — the arithmetic that turns a roof's triangle
// soup into a REAL-WORLD-METRE parameterisation measured ALONG THE SLOPE.
//
// ── WHY NOT THE PLAN PROJECTION, WHICH IS WHAT A SLAB DOES ──────────────────
//
// `SlabFragmentBuilder.rewriteAxisAlignedUVsToMetres` picks the dominant axis of
// the face normal and projects onto it: a horizontal face becomes `(x, z)`. That
// is EXACT for a slab, because a slab's top face is horizontal and the plan IS
// the surface. A roof is the one element family where it is never exact: the
// same projection applied to a pitched face measures the RUN, not the RAFTER, so
// a course that is 143 mm on the drawing renders 143·cos(pitch) mm on the model —
// 13 % short at 30° and 41 % short at 45°. Half the ten roof generators produce
// horizontal faces (flat, mansard cap, ridge caps) where the two agree, and half
// produce pitched faces where they do not, so a plan projection would ship a
// product in which SOME roofs tile truly and others tile squashed, with nothing
// on screen to tell them apart. C100 §10.15.f rules that strictly worse than the
// uniform refusal PRYZM shipped before this slice.
//
// ── THE PARAMETERISATION, AND WHY IT IS ONE FUNCTION FOR TEN GENERATORS ─────
//
// Every roof surface this repository builds is a triangle soup, and every
// triangle is planar by definition. So the frame is derived from the TRIANGLE's
// own normal `n` rather than from any generator's idea of its slope direction:
//
//     h = normalise(up × n)     — horizontal in the face plane: ALONG THE EAVE
//     s = n × h                 — up-slope in the face plane: ALONG THE RAFTER
//     uv = ( (p−c)·h , (p−c)·s )
//
// `h` and `s` are unit and orthogonal, so the map is an ISOMETRY of the face
// plane: one metre travelled on the roof is one unit travelled in uv, whichever
// direction you travel. That single property is the whole correctness claim, it
// is what the test asserts edge-by-edge, and it is exactly what the plan
// projection fails. It needs no per-generator knowledge, which is why all ten
// entry points are covered by one call at `RoofGeometryBuilder.generate()`
// instead of ten edits that could each be wrong differently.
//
// `c` is the geometry centroid. It only sets the pattern's PHASE, never its
// scale, and keeping uv near the origin keeps float32 precision far away from
// the sub-millimetre detail of a shingle course on a roof that may sit 400 m
// from the project origin.
//
// ── WHY VERTICES ARE SPLIT, AND WHY THAT CANNOT CHANGE A PIXEL ──────────────
//
// A roof's ridge vertex is shared by two slopes and two gable-end triangles —
// four planes, four frames, one vertex. No single uv can serve them, so a vertex
// is duplicated per (vertex × frame). ⛔ The duplicate COPIES its source's
// position and its ALREADY-COMPUTED normal; nothing is recomputed. The expanded
// triangle soup — every position and every normal the shader ever sees — is
// therefore bit-identical to the geometry before this pass, and a roof carrying
// no texture renders exactly as it did (`RoofSlopeUvsReachMesh.test.ts`,
// "leaves the rendered triangle soup bit-identical").
//
// Faces whose frames agree to within 0.57° reuse ONE frame, so a continuous
// slope stays welded and its pattern stays seamless; only a genuine crease —
// ridge, hip, valley, eave — splits, which is where a real roofer cuts and caps
// the courses anyway.
// ─────────────────────────────────────────────────────────────────────────────

/** A face frame: the eave-parallel and rafter-parallel unit axes of one plane. */
interface Frame {
    nx: number; ny: number; nz: number;
    hx: number; hy: number; hz: number;
    sx: number; sy: number; sz: number;
}

/**
 * The rewrite a caller must apply to obtain slope metre UVs.
 *
 * `sourceOf[i]` is the ORIGINAL vertex index that new slot `i` copies its
 * position and normal from; `sourceOf[i] === i` for every original vertex, so
 * the first `originalVertexCount` slots are untouched.
 */
export interface SlopeUvPlan {
    /** Vertex count after splitting (≥ the original count). */
    readonly vertexCount: number;
    /** Original vertex each slot copies position + normal from. Length `vertexCount`. */
    readonly sourceOf: Int32Array;
    /** uv pairs in METRES on the face plane. Length `vertexCount * 2`. */
    readonly uv: Float32Array;
    /** The index buffer, SAME length and SAME order as the input — only values move. */
    readonly index: Uint32Array;
    /** Distinct face frames found (1 for a flat roof, 4+ for a hip). */
    readonly frames: number;
    /** Triangles too degenerate to carry a normal; parameterised as horizontal. */
    readonly degenerateFaces: number;
    /** How many vertices the split added. */
    readonly splitVertices: number;
}

/** Two frames within this dot product are ONE frame — 0.57°. */
const FRAME_WELD_DOT = 0.99995;
/** Below this triangle-normal length the face has no usable plane. */
const DEGENERATE_AREA = 1e-12;
/** |n·up| above this is a horizontal face: `up × n` is not a usable axis. */
const HORIZONTAL_DOT = 1 - 1e-9;

/**
 * Slope-distance metre UVs for a triangle-list geometry.
 *
 * Returns `null` — a NAMED refusal, never a silent identity — when the inputs
 * cannot describe a triangle list, so the caller leaves the geometry undeclared
 * and `uvSpaceOfGeometry()` keeps refusing its maps (C100 §10.9.e).
 */
export function computeSlopeMetreUvs(
    position: ArrayLike<number>,
    index: ArrayLike<number>,
    vertexCount: number,
): SlopeUvPlan | null {
    if (!Number.isInteger(vertexCount) || vertexCount < 3) return null;
    if (position.length < vertexCount * 3) return null;
    const idxLen = index.length;
    if (idxLen < 3 || idxLen % 3 !== 0) return null;

    // ── Centroid: phase only, never scale. ────────────────────────────────────
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < vertexCount; i++) {
        cx += position[i * 3]!;
        cy += position[i * 3 + 1]!;
        cz += position[i * 3 + 2]!;
    }
    cx /= vertexCount; cy /= vertexCount; cz /= vertexCount;

    const frames: Frame[] = [];
    /** Per original vertex: frameId → new slot. Sparse; roofs are small. */
    const slots: Array<Map<number, number> | undefined> = new Array(vertexCount);

    const sourceOf: number[] = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) sourceOf[i] = i;
    const uvPairs: number[] = new Array(vertexCount * 2).fill(0);

    const outIndex = new Uint32Array(idxLen);
    let degenerateFaces = 0;

    for (let t = 0; t < idxLen; t += 3) {
        const ia = index[t]!, ib = index[t + 1]!, ic = index[t + 2]!;
        if (ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) return null;

        const frameId = resolveFrame(position, ia, ib, ic, frames, () => { degenerateFaces++; });
        const f = frames[frameId]!;

        for (let k = 0; k < 3; k++) {
            const orig = index[t + k]!;
            let byFrame = slots[orig];
            if (!byFrame) { byFrame = new Map<number, number>(); slots[orig] = byFrame; }
            let slot = byFrame.get(frameId);
            if (slot === undefined) {
                // The FIRST frame to claim an original vertex keeps the original
                // slot, so a single-plane roof adds no vertices at all.
                slot = byFrame.size === 0 ? orig : sourceOf.length;
                if (slot !== orig) {
                    sourceOf.push(orig);
                    uvPairs.push(0, 0);
                }
                byFrame.set(frameId, slot);
                const px = position[orig * 3]! - cx;
                const py = position[orig * 3 + 1]! - cy;
                const pz = position[orig * 3 + 2]! - cz;
                uvPairs[slot * 2]     = px * f.hx + py * f.hy + pz * f.hz;
                uvPairs[slot * 2 + 1] = px * f.sx + py * f.sy + pz * f.sz;
            }
            outIndex[t + k] = slot;
        }
    }

    const n = sourceOf.length;
    return {
        vertexCount:     n,
        sourceOf:        Int32Array.from(sourceOf),
        uv:              Float32Array.from(uvPairs),
        index:           outIndex,
        frames:          frames.length,
        degenerateFaces,
        splitVertices:   n - vertexCount,
    };
}

/**
 * The frame for one triangle, welded onto an existing near-parallel frame when
 * there is one.
 *
 * ⭐ Welding is not an optimisation. A ring-stack roof (`_buildFromRingStack`,
 * the general-pitched builder) emits eight consecutive strips per edge that are
 * mathematically coplanar and numerically a few 1e-7 apart. Hard-bucketing their
 * normals would split them across a bucket edge and put a pattern seam in the
 * middle of a flat slope; snapping to the first frame within 0.57° cannot.
 */
function resolveFrame(
    position: ArrayLike<number>,
    ia: number, ib: number, ic: number,
    frames: Frame[],
    onDegenerate: () => void,
): number {
    const ax = position[ia * 3]!, ay = position[ia * 3 + 1]!, az = position[ia * 3 + 2]!;
    const bx = position[ib * 3]!, by = position[ib * 3 + 1]!, bz = position[ib * 3 + 2]!;
    const cx = position[ic * 3]!, cy = position[ic * 3 + 1]!, cz = position[ic * 3 + 2]!;

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);

    if (!(len > DEGENERATE_AREA)) {
        // A zero-area triangle has no plane. It also draws no pixel, so it takes
        // the horizontal frame rather than poisoning a real one.
        onDegenerate();
        nx = 0; ny = 1; nz = 0;
    } else {
        nx /= len; ny /= len; nz /= len;
    }

    // ── Canonical sign, so winding cannot decide the pattern. ─────────────────
    // Roof slots are DoubleSide (RoofFragmentBuilder §2.5) and the generators do
    // not agree on winding — `_buildExtrudedPolygon`'s top face and its soffit
    // wind opposite ways over the same plan. Flipping to the upward-facing (then
    // canonically-signed horizontal) normal makes `s` point UP the slope for
    // every pitched face, which is what "courses stack from the eave" means.
    if (ny < -1e-9 || (Math.abs(ny) <= 1e-9 && (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && nz < 0)))) {
        nx = -nx; ny = -ny; nz = -nz;
    }

    for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        if (f.nx * nx + f.ny * ny + f.nz * nz >= FRAME_WELD_DOT) return i;
    }

    // h = up × n, normalised — the horizontal direction in the face plane.
    let hx = 1, hy = 0, hz = 0;
    if (Math.abs(ny) < HORIZONTAL_DOT) {
        hx = nz; hy = 0; hz = -nx;
        const hl = Math.hypot(hx, hy, hz);
        hx /= hl; hy /= hl; hz /= hl;
    } else {
        // Horizontal face — a flat roof, a mansard cap, a hip's ridge polygon.
        // No slope to follow, so plan X/Z IS the surface and is exact.
        hx = 1; hy = 0; hz = 0;
    }

    // s = n × h — unit, in-plane, and pointing up-slope because of the sign
    // canonicalisation above.
    const sx = ny * hz - nz * hy;
    const sy = nz * hx - nx * hz;
    const sz = nx * hy - ny * hx;

    frames.push({ nx, ny, nz, hx, hy, hz, sx, sy, sz });
    return frames.length - 1;
}
