// §OFFICE-ONBOARDING-WIRE — derive a CIRCULAR office footprint from the drawn parcel.
//
// The office tower is generated from a centroid + radius (a circular plate), but the
// user draws a POLYGON parcel. This pure helper maps the drawn polygon → a sane circle
// that SITS INSIDE the plot:
//   • centre  = the polygon's vertex centroid (mean of the XZ vertices);
//   • radius  = the largest circle, centred at that centroid, that still fits inside
//               the polygon — i.e. the MIN perpendicular distance from the centroid to
//               every polygon edge (the inscribed-circle radius about the centroid),
//               additionally clamped by the bbox half-min-side so a concave/odd plot
//               never yields a circle poking past the bounding box.
//
// Defensive: a degenerate input (null / < 3 distinct points / non-finite) returns null
// so the caller can fall back to a default radius and never block the flow.
//
// PURE: no I/O, no THREE, no DOM — directly unit-testable (deriveOfficeCircle.spec.ts).

/** A footprint vertex (metres, XZ plane). Structurally matches house FootprintPoint. */
export interface ParcelPoint { readonly x: number; readonly z: number }

/**
 * §OFFICE-ONBOARDING-WIRE — true when a brief typologyId denotes the office tower.
 * The TypologyPicker emits the REGISTRY PACK ID (`office-building`); the RAC / short
 * form may emit `office`. Both route to the office generator, so the dispatch accepts
 * either. Single source of truth shared by the onboarding dispatch + its unit test.
 */
export function isOfficeTypologyId(typologyId: string | null | undefined): boolean {
    return typologyId === 'office' || typologyId === 'office-building';
}

/**
 * §OFFICE-ONBOARDING-WIRE — derive the office tower's storey count from the captured
 * brief. Reads `floors` / `levels` / `stories` (first finite > 0 wins), defaults to 40
 * (the demo tower), clamps to [1,40]. Pure + shared with the onboarding controller.
 */
export function resolveOfficeStoreyCount(
    metadata: Record<string, unknown> | null | undefined,
    defaultStories = 40,
): number {
    const md = metadata ?? {};
    const pick = (v: unknown): number | null => {
        const n = typeof v === 'number' && Number.isFinite(v)
            ? v
            : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
                ? Number(v)
                : NaN;
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    const raw = pick(md['floors']) ?? pick(md['levels']) ?? pick(md['stories']) ?? defaultStories;
    return Math.max(1, Math.min(40, Math.round(raw)));
}

/** The derived circular office footprint. */
export interface OfficeCircle {
    /** Centroid X (m). */
    readonly cx: number;
    /** Centroid Z (m). */
    readonly cz: number;
    /** Fit radius (m) — a circle of this radius about (cx,cz) sits inside the plot. */
    readonly radiusM: number;
}

/** Perpendicular distance from point (px,pz) to the segment (ax,az)→(bx,bz). */
function distPointToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq <= 1e-12) {
        // Degenerate edge — fall back to point-to-point.
        const ux = px - ax, uz = pz - az;
        return Math.sqrt(ux * ux + uz * uz);
    }
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx;
    const qz = az + t * dz;
    const ex = px - qx, ez = pz - qz;
    return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Derive the circular office footprint from a parcel polygon. Returns null for a
 * degenerate / unusable polygon (the caller then uses a default radius).
 *
 * @param polygon Closed or open ring of XZ vertices (a trailing duplicate of the
 *                first vertex is tolerated and ignored).
 */
export function deriveOfficeCircleFromParcel(
    polygon: ReadonlyArray<ParcelPoint> | null | undefined,
): OfficeCircle | null {
    if (!polygon || polygon.length < 3) return null;

    // Drop a trailing closing duplicate so it doesn't bias the centroid / add a
    // zero-length edge.
    const pts: ParcelPoint[] = polygon.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
    if (pts.length >= 2) {
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.z - last.z) < 1e-9) pts.pop();
    }
    if (pts.length < 3) return null;

    // Centroid = mean of the vertices.
    let sx = 0, sz = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
        sx += p.x; sz += p.z;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const cx = sx / pts.length;
    const cz = sz / pts.length;

    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (!(width > 0) || !(depth > 0)) return null;

    // Inscribed-circle radius about the centroid = min distance to any edge.
    let minEdgeDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const d = distPointToSegment(cx, cz, a.x, a.z, b.x, b.z);
        if (d < minEdgeDist) minEdgeDist = d;
    }

    // Clamp by the bbox half-min-side so an odd plot never yields a circle past the bbox.
    const bboxFit = Math.min(width, depth) / 2;
    const radiusM = Math.min(minEdgeDist, bboxFit);
    if (!(radiusM > 0) || !Number.isFinite(radiusM)) return null;

    return { cx, cz, radiusM };
}
