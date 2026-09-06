// §FORMA-GROUND-URBAN-WHITE (L-12922, founder 2026-09-05 at Euston, London: "in urban areas — could we
// have this light brown colour white? Every village / city everywhere?") — reconciled with the
// founder's 2026-07-29 rule (§FORMA-CTX-LANDUSE-BASE: "rustic - mountain - light brown", so open
// country does NOT read like the city). The two rules are one rule with a condition:
//
//     the terrain base under a site that sits IN or BESIDE urban land is OFF-WHITE;
//     the terrain base under open country / mountains stays LIGHT BROWN.
//
// WHY the base and not only the drape: the urban landuse drape is painted at one scalar height per
// load and does not cover streets, squares, rail land or the gaps between landuse polygons — so the
// terrain base shows through everywhere the drape is not, and on relief wherever the drape is buried
// (Lisbon, L-12918 family). Tan in those gaps is what the founder sees as "light brown in the city".
//
// The decision is DATA-DRIVEN from the baked landuse the site already loads: a site whose origin
// lies inside an `urban` landuse polygon, or within URBAN_NEAR_M of one, is urban. A village is a
// residential polygon around its houses, so villages qualify; a farmhouse in open fields does not.
// Pure: no Cesium, no DOM — testable.

export const FORMA_GROUND_RURAL = '#D6C7A6';
/** The 2-D site map's own off-white land (siteMap2DStyle FORMA_PALETTE.land), so 2-D and 3-D agree. */
export const FORMA_GROUND_URBAN = '#F0EDE8';
/** A site this close to an urban landuse polygon is "in the village". */
export const URBAN_NEAR_M = 300;

export interface LanduseAreaLike {
    readonly kind: 'urban' | 'rural';
    /** Closed ring as [lon, lat]. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
}

export interface GroundColourVerdict {
    readonly arm: 'urban-inside' | 'urban-near' | 'rural' | 'no-landuse';
    readonly colour: string;
    /** Metres from the origin to the nearest urban polygon (0 when inside; Infinity when none). */
    readonly nearestUrbanM: number;
}

/** Ray-cast point-in-polygon on a lon/lat ring. Exported for §STREET-LIFE (contextStreetLife.ts),
 *  which decides pedestrian density by the same urban-polygon rule this file colours the ground by. */
export function pointInRing(lon: number, lat: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Distance in metres from (lon,lat) to the nearest VERTEX of the ring (local equirectangular). */
function nearestVertexM(lon: number, lat: number, ring: ReadonlyArray<readonly [number, number]>): number {
    const R = 6378137, D2R = Math.PI / 180, c = Math.cos(lat * D2R);
    let best = Infinity;
    for (const [x, y] of ring) {
        const dx = (x - lon) * D2R * R * c, dy = (y - lat) * D2R * R;
        const d = Math.hypot(dx, dy);
        if (d < best) best = d;
    }
    return best;
}

/**
 * The ground base colour for a site, from the landuse loaded around it. Never throws; an empty or
 * absent landuse set is `no-landuse` and keeps the rural default (an admission that nothing is
 * known, not a finding that the site is rural).
 */
export function formaGroundBaseColour(
    areas: ReadonlyArray<LanduseAreaLike> | null | undefined,
    lat: number,
    lon: number,
): GroundColourVerdict {
    if (!areas || areas.length === 0 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { arm: 'no-landuse', colour: FORMA_GROUND_RURAL, nearestUrbanM: Infinity };
    }
    let nearest = Infinity;
    for (const a of areas) {
        if (a.kind !== 'urban' || a.ring.length < 3) continue;
        if (pointInRing(lon, lat, a.ring)) return { arm: 'urban-inside', colour: FORMA_GROUND_URBAN, nearestUrbanM: 0 };
        const d = nearestVertexM(lon, lat, a.ring);
        if (d < nearest) nearest = d;
    }
    if (nearest <= URBAN_NEAR_M) return { arm: 'urban-near', colour: FORMA_GROUND_URBAN, nearestUrbanM: nearest };
    return { arm: 'rural', colour: FORMA_GROUND_RURAL, nearestUrbanM: nearest };
}
