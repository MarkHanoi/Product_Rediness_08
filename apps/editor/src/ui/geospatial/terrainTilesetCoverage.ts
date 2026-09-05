// §TERRAIN-TILESET-BOUNDS-CHECK (L-12923, founder 2026-09-05 at Amsterdam: "why is the canal water
// not displaying? I have seen it in the past — I need consistency").
//
// THE DEFECT. `maybeAttachTerrainProvider` accepts a candidate tileset the moment its `layer.json`
// loads. But a tileset's `layer.json` carries its OWN `bounds`, and the Dutch CITY tilesets (AHN)
// are ~250 m patches: amsterdam's bounds are [4.8864, 52.3689, 4.8902, 52.3712], measured 2026-09-05.
// A site 1 km away is inside `TERRAIN_CITY_BBOXES.amsterdam` (the resolver's city bbox), so the
// patch tileset is attached — and outside its bounds Cesium has only the coarse placeholder plates
// (177-byte tiles at 43.6–44.5 m). The ground becomes a flat plate at ~44.5 m; water seated at
// base + 0.03 = 43.63 m sits UNDER it and the canals vanish. The national `netherlands` tileset
// (Mapterhorn, complete at z10) would have served the site correctly — it was never tried, because
// the city candidate "succeeded".
//
// THE RULE. A candidate serves a site only if its declared `bounds` contain the site (with a small
// margin for the tile grid). Otherwise it is skipped by NAME and the next candidate (the region)
// is tried. Pure: the fetch is injected so the decision is testable.

export interface TerrainLayerJsonLike {
    /** [west, south, east, north] in degrees, as Cesium's quantized-mesh layer.json declares it. */
    readonly bounds?: readonly number[] | null;
}

/** Degrees of slack around the declared bounds (≈ 55 m at the equator) — the tile grid overhangs. */
export const TILESET_BOUNDS_MARGIN_DEG = 0.0005;

/** `${tilesetUrl}/layer.json`, keeping a `?v=` query on the tileset URL where it belongs (after the path). */
export function layerJsonUrl(tilesetUrl: string): string {
    const q = tilesetUrl.indexOf('?');
    if (q < 0) return `${tilesetUrl.replace(/\/$/, '')}/layer.json`;
    const path = tilesetUrl.slice(0, q).replace(/\/$/, '');
    return `${path}/layer.json${tilesetUrl.slice(q)}`;
}

export type TilesetCoverageVerdict =
    | { readonly covers: true; readonly bounds: readonly number[] }
    | { readonly covers: false; readonly reason: 'outside-bounds'; readonly bounds: readonly number[] }
    /** No usable `bounds` in the layer.json (older bakes) — cannot refuse, so the candidate stands. */
    | { readonly covers: true; readonly bounds: null; readonly reason: 'no-bounds-declared' };

/** Does the declared bounds box contain (lon, lat)? A missing / malformed bounds cannot refuse. */
export function tilesetBoundsCoverSite(layer: TerrainLayerJsonLike | null | undefined, lon: number, lat: number): TilesetCoverageVerdict {
    const b = layer?.bounds;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        return { covers: true, bounds: null, reason: 'no-bounds-declared' };
    }
    const [w, s, e, n] = b as [number, number, number, number];
    const m = TILESET_BOUNDS_MARGIN_DEG;
    const inside = lon >= w - m && lon <= e + m && lat >= s - m && lat <= n + m;
    return inside ? { covers: true, bounds: b } : { covers: false, reason: 'outside-bounds', bounds: b };
}

/**
 * Fetch a candidate tileset's layer.json and decide whether it covers the site. A fetch failure is
 * reported as `covers: true` with `no-bounds-declared`: this check exists to SKIP a tileset that
 * demonstrably does not cover the site, never to refuse one it could not read — Cesium's own
 * `fromUrl` is the authority on whether the tileset loads at all.
 */
export async function terrainTilesetCoversSite(
    tilesetUrl: string,
    lon: number,
    lat: number,
    fetchImpl: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (u) => fetch(u),
): Promise<TilesetCoverageVerdict> {
    try {
        const res = await fetchImpl(layerJsonUrl(tilesetUrl));
        if (!res.ok) return { covers: true, bounds: null, reason: 'no-bounds-declared' };
        const layer = (await res.json()) as TerrainLayerJsonLike;
        return tilesetBoundsCoverSite(layer, lon, lat);
    } catch {
        return { covers: true, bounds: null, reason: 'no-bounds-declared' };
    }
}
