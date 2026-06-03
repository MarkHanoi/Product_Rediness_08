// A.8.f — pure read-model helpers for the Site Inspector panel.
//
// HEADLESS + PURE: no DOM, no THREE, no store import. Takes the plain
// C19 read shapes (SiteLocation / ParcelBoundary) the SiteModelStore
// exposes via getLocation()/getParcelBoundary() and derives the small
// display facts the panel renders. Extracted so the geometry math
// (shoelace area) is unit-testable in isolation.
//
// References:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §2.3 (Parcel.area)
//   - apps/editor/src/ui/site/boundaryProjection.ts (sibling signed-area helper)

/** A polygon vertex in scene-XZ metres (matches C19 `PtSchema`). */
export interface XZVertex {
    readonly x: number;
    readonly z: number;
}

/**
 * Shoelace (Gauss) area of a closed XZ ring, in square metres. Returns the
 * ABSOLUTE area so winding (CW vs CCW) does not flip the sign. A ring with
 * fewer than 3 vertices has zero area. A trailing vertex that duplicates the
 * first is harmless (it contributes a zero-length term).
 */
export function polygonAreaXZ(ring: ReadonlyArray<XZVertex>): number {
    const n = ring.length;
    if (n < 3) return 0;
    let twice = 0;
    for (let i = 0; i < n; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % n]!;
        twice += p.x * q.z - q.x * p.z;
    }
    return Math.abs(twice) / 2;
}

/** The boundary shape the SiteModelStore returns from getParcelBoundary(). */
export interface ParcelBoundaryLike {
    readonly polygon: ReadonlyArray<XZVertex>;
    readonly edgeClassifications?: ReadonlyArray<string>;
}

/** The location shape the SiteModelStore returns from getLocation(). */
export interface SiteLocationLike {
    readonly latitude?: number;
    readonly longitude?: number;
    readonly siteAddress?: string | null;
    readonly trueNorth?: number;
}

/** The flat, display-ready facts the panel renders. */
export interface SiteInspectorSummary {
    readonly hasSite: boolean;
    readonly address: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly vertexCount: number;
    /** Parcel area in m². Prefers the store-computed `area`; falls back to shoelace. */
    readonly areaM2: number;
    /** Count of edges classified as 'front' (frontage), or null when unknown. */
    readonly frontageEdges: number | null;
    /** Site true-north in degrees (0 = aligned to scene −Z), or null. */
    readonly trueNorthDeg: number | null;
}

/**
 * Derive the panel's display facts from the raw store reads. `storeArea` is the
 * `Parcel.area` the L3 store may have pre-computed (C19 §2.3); when it is absent
 * or zero we fall back to the shoelace area of the boundary polygon so the panel
 * always shows a meaningful number once a boundary exists.
 */
export function summarizeSite(
    location: SiteLocationLike | null,
    boundary: ParcelBoundaryLike | null,
    storeArea?: number | null,
): SiteInspectorSummary {
    const hasSite = location != null || boundary != null;
    const polygon = boundary?.polygon ?? [];
    const vertexCount = polygon.length;

    const shoelace = polygonAreaXZ(polygon);
    const areaM2 =
        typeof storeArea === 'number' && storeArea > 0 ? storeArea : shoelace;

    const classes = boundary?.edgeClassifications ?? null;
    const frontageEdges = classes
        ? classes.filter((c) => c === 'front').length
        : null;

    const trueNorthDeg =
        typeof location?.trueNorth === 'number'
            ? (location.trueNorth * 180) / Math.PI
            : null;

    const address =
        typeof location?.siteAddress === 'string' && location.siteAddress.length > 0
            ? location.siteAddress
            : null;

    return {
        hasSite,
        address,
        latitude: typeof location?.latitude === 'number' ? location.latitude : null,
        longitude: typeof location?.longitude === 'number' ? location.longitude : null,
        vertexCount,
        areaM2,
        frontageEdges,
        trueNorthDeg,
    };
}

/**
 * Build a normalised SVG-path "d" string (in a 0..1 unit box) for an inline
 * thumbnail of the parcel polygon, or null when there are too few vertices.
 * Pure string math — the panel scales it into its viewBox.
 */
export function boundaryThumbnailPath(
    polygon: ReadonlyArray<XZVertex>,
    size = 1,
    pad = 0.08,
): string | null {
    if (polygon.length < 3) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const w = maxX - minX || 1;
    const h = maxZ - minZ || 1;
    const span = Math.max(w, h);
    const inner = size * (1 - pad * 2);
    // Centre the polygon in the box, preserving aspect ratio.
    const offX = (size - (w / span) * inner) / 2;
    const offZ = (size - (h / span) * inner) / 2;
    const map = (p: XZVertex) => {
        const px = offX + ((p.x - minX) / span) * inner;
        const pz = offZ + ((p.z - minZ) / span) * inner;
        return `${px.toFixed(3)},${pz.toFixed(3)}`;
    };
    return `M${polygon.map(map).join('L')}Z`;
}
