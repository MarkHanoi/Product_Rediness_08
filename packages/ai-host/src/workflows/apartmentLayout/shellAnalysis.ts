// Apartment Layout Generator — shell analysis (SPEC §5, step A3).
//
// PURE: given the perimeter shell walls (world X-Z, metres) + per-wall window
// counts + per-wall SL-3 orientation + the entrance wall, derive net floor area,
// bounding dimensions, and a face classification the space-planning prompt needs.
// No stores/DOM/THREE — the workflow's thin wrapper (A4) reads the stores +
// FacadeOrientationService and calls this. Unit-testable in plain Node.

export type FaceClass = 'entrance-side' | 'best-light' | 'secondary-light' | 'blind';

export interface ShellWallInput {
    id: string;
    baseLine: [{ x: number; z: number }, { x: number; z: number }];
}

export interface ShellAnalysisOptions {
    /** Wall hosting the entrance door. */
    entranceWallId: string;
    /** Window count per wall id. */
    windowCountByWall: Record<string, number>;
    /** SL-3 compass orientation per wall id (null for interior/undeterminable). */
    orientationByWall?: Record<string, 'N' | 'E' | 'S' | 'W' | null>;
}

export interface ShellFaceInfo {
    wallId: string;
    class: FaceClass;
    windowCount: number;
    orientation: 'N' | 'E' | 'S' | 'W' | null;
}

export interface ShellAnalysis {
    netAreaM2: number;
    widthM: number;
    depthM: number;
    perimeter: Array<{ x: number; z: number }>;
    faces: ShellFaceInfo[];
}

const EPS = 0.05; // 50 mm endpoint-match tolerance

function near(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) < EPS;
}

/**
 * Chain perimeter wall baselines into an ordered closed polygon (greedy walk over
 * shared endpoints). Returns the ordered vertex ring. Handles rectangles and
 * simple concave shells; on a broken chain it returns whatever it could order.
 */
export function wallsToPolygon(walls: readonly ShellWallInput[]): Array<{ x: number; z: number }> {
    if (walls.length === 0) return [];
    const segs = walls.map(w => ({ a: w.baseLine[0], b: w.baseLine[1], used: false }));
    segs[0]!.used = true;
    const ring: Array<{ x: number; z: number }> = [segs[0]!.a, segs[0]!.b];
    let tail = segs[0]!.b;

    for (let guard = 0; guard < segs.length + 1; guard++) {
        let advanced = false;
        for (const s of segs) {
            if (s.used) continue;
            if (near(s.a, tail)) { ring.push(s.b); tail = s.b; s.used = true; advanced = true; break; }
            if (near(s.b, tail)) { ring.push(s.a); tail = s.a; s.used = true; advanced = true; break; }
        }
        if (!advanced) break;
        if (near(tail, ring[0]!)) { ring.pop(); break; } // closed the loop
    }
    return ring;
}

/** Shoelace area (m²) of a polygon (absolute value). */
export function polygonAreaM2(poly: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

// ─── §PERIMETER-CLASS (Phase 1 / C53 Tier-1 / v3.0 §2 / ADR-0062) ────────────────
// Classify the shell FOOTPRINT shape so the layout engine + the future rectangular-dual
// solver pick the right strategy (a CONVEX-RECT takes the fast path; an L/T/U is split
// into lobes). Pure + deterministic; ADDITIVE (no existing caller — nothing downstream
// reads it yet, so this is byte-identical to today). Counts re-entrant (reflex) corners
// after collinear simplification.

export type PerimeterClass =
    | 'CONVEX-RECT'   // 4 corners, convex, aspect ≤ 3:1 — the standard zoning + squarify path
    | 'CONVEX-POLY'   // convex but non-rectangular (trapezoid / pentagon)
    | 'L-SHAPE'       // exactly 1 re-entrant (reflex) corner — two rectangular lobes
    | 'T-U-SHAPE'     // 2–3 reflex corners — medial-axis decomposition into convex sub-cells
    | 'COMPLEX';      // ≥ 4 reflex corners or degenerate — fall back to the generic packer

export interface PerimeterClassification {
    readonly class: PerimeterClass;
    readonly corners: number;        // vertex count after collinear simplification
    readonly reflexCorners: number;  // re-entrant corners (interior angle > 180°)
    readonly aspect: number;         // longer / shorter bbox side (Infinity if degenerate)
}

/** Drop (near-)collinear vertices so a true rectangle reads as exactly 4 corners. Pure. */
function simplifyCollinear(poly: ReadonlyArray<{ x: number; z: number }>, tol = 1e-3): Array<{ x: number; z: number }> {
    const n = poly.length;
    if (n < 4) return poly.slice();
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < n; i++) {
        const a = poly[(i - 1 + n) % n]!, b = poly[i]!, c = poly[(i + 1) % n]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        const scale = Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z);
        if (scale < tol || Math.abs(cross) > tol * Math.max(1, scale)) out.push(b);   // keep real corners
    }
    return out.length >= 3 ? out : poly.slice();
}

/** §PERIMETER-CLASS — classify a closed perimeter ring (world X-Z, metres). */
export function classifyPerimeter(perimeter: ReadonlyArray<{ x: number; z: number }>): PerimeterClassification {
    const poly = simplifyCollinear(perimeter);
    const n = poly.length;
    const xs = poly.map(p => p.x), zs = poly.map(p => p.z);
    const w = n ? Math.max(...xs) - Math.min(...xs) : 0;
    const d = n ? Math.max(...zs) - Math.min(...zs) : 0;
    const aspect = Math.min(w, d) > 1e-6 ? Math.max(w, d) / Math.min(w, d) : Infinity;
    if (n < 4) return { class: 'COMPLEX', corners: n, reflexCorners: 0, aspect };
    let signedArea = 0;
    for (let i = 0; i < n; i++) { const p = poly[i]!, q = poly[(i + 1) % n]!; signedArea += p.x * q.z - q.x * p.z; }
    const ccw = signedArea > 0;
    let reflex = 0;
    for (let i = 0; i < n; i++) {
        const a = poly[(i - 1 + n) % n]!, b = poly[i]!, c = poly[(i + 1) % n]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        // A corner is re-entrant when its turn is OPPOSITE the polygon's winding.
        if ((ccw && cross < -1e-9) || (!ccw && cross > 1e-9)) reflex++;
    }
    let cls: PerimeterClass;
    if (reflex === 0) cls = (n === 4 && aspect <= 3) ? 'CONVEX-RECT' : 'CONVEX-POLY';
    else if (reflex === 1) cls = 'L-SHAPE';
    else if (reflex <= 3) cls = 'T-U-SHAPE';
    else cls = 'COMPLEX';
    return { class: cls, corners: n, reflexCorners: reflex, aspect };
}

/** Classify every shell wall by light/entrance and derive area + dimensions. */
export function analyseShell(walls: readonly ShellWallInput[], opts: ShellAnalysisOptions): ShellAnalysis {
    const perimeter = wallsToPolygon(walls);
    const netAreaM2 = polygonAreaM2(perimeter);

    const xs = perimeter.map(p => p.x);
    const zs = perimeter.map(p => p.z);
    const widthM = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    const depthM = zs.length ? Math.max(...zs) - Math.min(...zs) : 0;

    const counts = opts.windowCountByWall ?? {};
    const maxWindows = walls.reduce((m, w) => Math.max(m, counts[w.id] ?? 0), 0);

    const faces: ShellFaceInfo[] = walls.map(w => {
        const windowCount = counts[w.id] ?? 0;
        const orientation = opts.orientationByWall?.[w.id] ?? null;
        let cls: FaceClass;
        if (w.id === opts.entranceWallId) cls = 'entrance-side';
        else if (windowCount > 0 && windowCount === maxWindows) cls = 'best-light';
        else if (windowCount > 0) cls = 'secondary-light';
        else cls = 'blind';
        return { wallId: w.id, class: cls, windowCount, orientation };
    });

    return { netAreaM2, widthM, depthM, perimeter, faces };
}
