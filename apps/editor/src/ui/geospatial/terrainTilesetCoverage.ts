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
    /**
     * §TERRAIN-ABSENT-IS-NOT-UNREADABLE (L-12973) — the tileset DOES NOT EXIST: its layer.json
     * answered 404/403. This is a REFUSAL, because attaching it produces a provider whose every
     * tile 404s, which Cesium reports as `relief=off` on flat ellipsoid ground rather than as an
     * error — the founder's Dubai session, where `gccstates` was chosen, all 152 buildings fell
     * back to seat 0 m, and `dubai` and `abudhabi` were sitting on R2 answering 200 the whole time.
     */
    | { readonly covers: false; readonly reason: 'tileset-absent'; readonly status: number }
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
 * Fetch a candidate tileset's layer.json and decide whether it covers the site.
 *
 * §TERRAIN-ABSENT-IS-NOT-UNREADABLE (L-12973). This used to collapse EVERY non-ok answer into
 * `covers: true / no-bounds-declared` — "never refuse one I could not read". That conflated two
 * different answers, which is the C57 §1.5 failure-vs-empty defect pointed at the one value here
 * that authorises attaching a provider:
 *
 *   · 404 / 403 — the tileset IS NOT THERE. Attaching it is strictly worse than skipping it,
 *     because Cesium's `fromUrl` resolves against a layer.json it cannot read and then 404s every
 *     tile, which surfaces as `relief=off … seat[finite=0 fallback=N]` on flat ellipsoid ground —
 *     not as an error. Measured 2026-09-06 at Dubai: candidate `gccstates` 404 (never baked),
 *     152 buildings seated at 0 m, while `dubai` and `abudhabi` answered 200 on R2 the whole time.
 *     So an ABSENT tileset must be REFUSED and the next candidate tried.
 *   · 5xx / network error / malformed JSON — the tileset may well exist and we simply could not
 *     read it this instant. Refusing on a transient would strip real terrain from a live site, so
 *     these still stand down and let Cesium be the authority, exactly as before.
 */
export async function terrainTilesetCoversSite(
    tilesetUrl: string,
    lon: number,
    lat: number,
    fetchImpl: (url: string) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }> = (u) => fetch(u),
): Promise<TilesetCoverageVerdict> {
    try {
        const res = await fetchImpl(layerJsonUrl(tilesetUrl));
        if (!res.ok) {
            const status = typeof res.status === 'number' ? res.status : 0;
            // ABSENT (404/410 gone, 403 not-public) — a real answer meaning "no tileset here".
            if (status === 404 || status === 410 || status === 403) {
                return { covers: false, reason: 'tileset-absent', status };
            }
            // Anything else (5xx, 0, unknown) is UNREADABLE, not absent — do not refuse on it.
            return { covers: true, bounds: null, reason: 'no-bounds-declared' };
        }
        const layer = (await res.json()) as TerrainLayerJsonLike;
        return tilesetBoundsCoverSite(layer, lon, lat);
    } catch {
        return { covers: true, bounds: null, reason: 'no-bounds-declared' };
    }
}
