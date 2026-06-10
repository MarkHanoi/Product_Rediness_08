// PW.2 (§DIAG-PARTY-WALL, 2026-06-10) — editor-side neighbour-footprint store.
//
// WHY THIS EXISTS
// ---------------
// Context-building footprints (the surrounding OSM buildings) are fetched ONLY by
// the GIS viewports (`apps/editor/src/ui/geospatial/contextBuildings.ts` →
// `CesiumViewport.loadContextBuildings` + `SiteBoundaryMap2D.loadContextBuildings`)
// as VISUAL massing. They were never stored anywhere the layout pipeline could
// reach. PW.2 needs them at generate time so `resolveBlindFacades` can test each
// shell wall for proximity to a neighbour edge (a party/blind wall — no windows,
// no doors). This module is the smallest possible bridge: a plain editor-side
// (L5) store that the GIS fetch sites WRITE to and `resolveBlindFacades` READS.
//
// SHAPE — we keep the RAW lon/lat rings (as fetched) PLUS the fetch centre lat/lon.
// The projection into the editor's world-XZ frame happens lazily in
// `resolveBlindFacades` (via the SAME `latLonToSceneXZ` the parcel boundary uses),
// because the C19 site origin can be pinned AFTER the footprints are fetched. Keep
// raw + project-on-read = always projected about the live origin.
//
// LAYERING — no engine (`@pryzm/ai-host`) dependency, no THREE, no DOM. Just a
// module-level latest-value cell. Deterministic to read.

/** One neighbour footprint: an outer ring of WGS84 lon/lat pairs `[lon, lat]`. */
export interface NeighbourFootprint {
    /** GeoJSON outer ring: [ [lon,lat], … ] (closed or open — closing dup tolerated). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** OSM id (debug / dedupe), if known. */
    readonly osmId?: number;
}

/** The latest captured neighbour footprints + the lat/lon they were fetched around. */
export interface NeighbourFootprintSnapshot {
    /** The fetch-centre latitude (deg) — used only as a sanity reference. */
    readonly fetchLat: number;
    /** The fetch-centre longitude (deg). */
    readonly fetchLon: number;
    /** The neighbour footprints (lon/lat rings). */
    readonly footprints: readonly NeighbourFootprint[];
}

/** Module-level latest snapshot. `null` until the GIS view fetches once. */
let _snapshot: NeighbourFootprintSnapshot | null = null;

/**
 * Minimal shape of a context-building collection we accept — matches
 * `ContextBuildingCollection` from `contextBuildings.ts` (kept structural so this
 * store carries NO import dependency on the GIS module / its types).
 */
interface CollectionLike {
    readonly features?: ReadonlyArray<{
        readonly geometry?: { readonly coordinates?: unknown };
        readonly properties?: { readonly osmId?: unknown };
    }>;
}

/**
 * Capture the latest neighbour footprints from a GIS context-buildings fetch.
 * Called by the GIS viewports right after `fetchContextBuildings` resolves. Pure
 * value-store write — never throws. An EMPTY / malformed collection clears the
 * snapshot to an empty footprint set (so a site that genuinely has no neighbours
 * yields the additive-identity empty blind set downstream).
 *
 * @param fetchLat the latitude the footprints were fetched around.
 * @param fetchLon the longitude the footprints were fetched around.
 * @param collection a `ContextBuildingCollection` (GeoJSON FeatureCollection).
 */
export function setNeighbourFootprints(
    fetchLat: number,
    fetchLon: number,
    collection: CollectionLike | null | undefined,
): void {
    try {
        const footprints: NeighbourFootprint[] = [];
        const features = collection?.features ?? [];
        for (const f of features) {
            const coords = f?.geometry?.coordinates;
            // GeoJSON Polygon coordinates = number[][][] (rings); first = outer ring.
            if (!Array.isArray(coords) || coords.length === 0) continue;
            const outer = coords[0];
            if (!Array.isArray(outer) || outer.length < 3) continue;
            const ring: Array<readonly [number, number]> = [];
            for (const pt of outer) {
                if (
                    Array.isArray(pt) && pt.length >= 2 &&
                    Number.isFinite(pt[0]) && Number.isFinite(pt[1])
                ) {
                    ring.push([pt[0] as number, pt[1] as number]);
                }
            }
            if (ring.length < 3) continue;
            const osmIdRaw = f?.properties?.osmId;
            footprints.push(
                typeof osmIdRaw === 'number'
                    ? { ring, osmId: osmIdRaw }
                    : { ring },
            );
        }
        _snapshot = { fetchLat, fetchLon, footprints };
    } catch {
        // Best-effort capture — never disturb the GIS fetch path.
        _snapshot = { fetchLat, fetchLon, footprints: [] };
    }
}

/** Read the latest captured neighbour footprints, or `null` if none captured. */
export function getNeighbourFootprints(): NeighbourFootprintSnapshot | null {
    return _snapshot;
}

/** Test/diagnostic helper — clears the captured snapshot. */
export function clearNeighbourFootprints(): void {
    _snapshot = null;
}
