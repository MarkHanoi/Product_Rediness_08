// ADR-0074 P1b (C21 §10) — face → sample-point grid (pure geometry helper).
//
// PURE + THREE-FREE so it is unit-testable without a GL context. Given a triangle
// (three world-space corners) and an outward unit normal, produce a grid of
// interior sample points at ~`spacing` metres, each nudged `offset` metres OUT
// along the normal (so an occlusion raycast does not immediately self-hit the
// surface it starts on). Points are barycentric samples of the triangle, which is
// robust for the arbitrary triangles a meshed roof/wall yields.
//
// The renderer-three pass (computeSunHoursOnModel) converts mesh geometry into
// world-space triangles and calls this per triangle to build each SolarSurface's
// `samplePoints` (the texels the @pryzm/solar-analysis accumulator integrates).

export interface V3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

function area(a: V3, b: V3, c: V3): number {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    return 0.5 * Math.hypot(cx, cy, cz);
}

export interface FaceGridOptions {
    /** Target spacing between sample points, metres. Default 0.75 m. */
    readonly spacing?: number;
    /** Outward nudge along the normal, metres (avoids self-hit). Default 0.02 m. */
    readonly offset?: number;
    /** Hard cap on points emitted for one triangle (guards huge faces). Default 400. */
    readonly maxPoints?: number;
}

/**
 * Sample a single triangle into a grid of interior points, each pushed `offset`
 * out along `normal`. Density is chosen from the triangle area + `spacing`. Always
 * returns at least the triangle centroid (so a sub-spacing face still scores).
 * Pure + deterministic.
 */
export function gridTriangle(
    a: V3,
    b: V3,
    c: V3,
    normal: V3,
    opts: FaceGridOptions = {},
): V3[] {
    const spacing = opts.spacing && opts.spacing > 0 ? opts.spacing : 0.75;
    const offset = opts.offset ?? 0.02;
    const maxPoints = opts.maxPoints && opts.maxPoints > 0 ? opts.maxPoints : 400;

    const triArea = area(a, b, c);
    const out: V3[] = [];

    // Barycentric grid resolution from area / spacing². ⌈√(2·area)/spacing⌉ gives a
    // subdivision count that scales with the triangle's linear extent.
    let n = Math.ceil(Math.sqrt(2 * triArea) / spacing);
    if (!Number.isFinite(n) || n < 1) n = 1;

    // Emit at the centroids of the n² sub-cells via a barycentric lattice. Cap by
    // shrinking n if it would overshoot maxPoints.
    while (n > 1 && (n * (n + 1)) / 2 > maxPoints) n--;

    const nx = offset * normal.x;
    const ny = offset * normal.y;
    const nz = offset * normal.z;

    if (n <= 1) {
        out.push({
            x: (a.x + b.x + c.x) / 3 + nx,
            y: (a.y + b.y + c.y) / 3 + ny,
            z: (a.z + b.z + c.z) / 3 + nz,
        });
        return out;
    }

    // Lattice of barycentric coords at sub-cell centres: u,v,w each (i+1/3)/n style.
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n - i; j++) {
            const u = (i + 1 / 3) / n;
            const v = (j + 1 / 3) / n;
            const w = 1 - u - v;
            if (w <= 0) continue;
            out.push({
                x: a.x * w + b.x * u + c.x * v + nx,
                y: a.y * w + b.y * u + c.y * v + ny,
                z: a.z * w + b.z * u + c.z * v + nz,
            });
            if (out.length >= maxPoints) return out;
        }
    }
    if (out.length === 0) {
        out.push({
            x: (a.x + b.x + c.x) / 3 + nx,
            y: (a.y + b.y + c.y) / 3 + ny,
            z: (a.z + b.z + c.z) / 3 + nz,
        });
    }
    return out;
}
