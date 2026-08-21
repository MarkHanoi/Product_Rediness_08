// §CTX-HEIGHT-ADOPTION (L-1663) — per-building ADOPTED context heights from real cadastral data.
//
// THE DEFECT: the baked Barcelona tiles carry no `height`/`building:levels` for the buildings on
// the Poblenou demo block (36345), so they extrude at the 9 m `assumed` default and render as the
// L-647 estimated-height ghosts — the founder's "they are wireframe" report. The REAL built floor
// counts EXIST: Catastro INSPIRE BU `GetBuildingPartByParcel` publishes `numberOfFloorsAboveGround`
// per building part (queried live 2026-08-21; raw GML under
// `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/findings/l1661/bupart-*.gml`).
//
// WHAT AN ADOPTION IS — AND IS NOT (§CONTEXT-DATA-HONESTY): each entry below carries a REAL
// storey count read from a named cadastral record, converted through the SAME assumed 3.2 m
// storey module every `building:levels` tag uses. The feature is therefore stamped
// `heightProvenance: 'derived-levels'` — the ladder's exact definition ("real storey COUNT × our
// assumed storey height") — NEVER `tagged` and NEVER `measured-lidar`. The building keeps the
// L-647 derived-height treatment; only its NUMBER stops being the 9 m fabrication. Context
// massing is presentation, not a legal determination (lane BCN1 brief), and every adoption is
// logged as adopted.
//
// ⚠ §DEMO-PATCH — THIS TABLE IS THE STOP-GAP, NOT THE FIX. The general fix already EXISTS as
// machinery: `tools/context-bake/heightSources.mjs` implements the Catastro ALTURAS join
// (`derived-levels` rung) for Spanish regions; what is missing is a Barcelona re-bake + R2
// publish, which is a founder-gated CI/deploy act (`tools/context-bake/bake.mjs`
// §MEASURED-HEIGHT-GATE + partial-publish semantics), not a client change.
// TODO(L-1663): run the Barcelona context re-bake with the Catastro height join, then DELETE
// this table — entries here are shadowed the moment the tiles carry real heights, because an
// adoption never overrides a `tagged`/`measured-lidar` tile height (see the guard below).

/** One adopted height: a WGS84 point inside the building's footprint + the cadastral floors. */
export interface ContextHeightAdoption {
    /** A point INSIDE the building footprint (WGS84). Containment, not distance, selects it. */
    readonly lat: number;
    readonly lon: number;
    /** Floors above ground — the MAX over the parcel's Catastro building parts. */
    readonly floorsAboveGround: number;
    /** The cadastral parcel whose BU record supplied the count (citable). */
    readonly refcat: string;
    /** Human-readable provenance for logs / the query panel. */
    readonly source: string;
}

/**
 * §DEMO-PATCH (L-1663) — the Poblenou demo block. Floor counts are the MAX
 * `numberOfFloorsAboveGround` over each parcel's building parts (parts measured 4/5/6 on both).
 */
export const CONTEXT_HEIGHT_ADOPTIONS: readonly ContextHeightAdoption[] = [
    {
        // Rambla del Poblenou 10 — parcel centroid (Catastro INSPIRE CP ring, 2026-08-21).
        lat: 41.3981329,
        lon: 2.2054181,
        floorsAboveGround: 6,
        refcat: '3634514DF3833D',
        source: 'Catastro INSPIRE BU GetBuildingPartByParcel (max numberOfFloorsAboveGround, 2026-08-21)',
    },
    {
        // Carrer del Perelló 60 — parcel centroid (Catastro INSPIRE CP ring, 2026-08-21).
        lat: 41.3982134,
        lon: 2.2056443,
        floorsAboveGround: 6,
        refcat: '3634515DF3833D',
        source: 'Catastro INSPIRE BU GetBuildingPartByParcel (max numberOfFloorsAboveGround, 2026-08-21)',
    },
];

/** Same assumed storey module as `contextBuildings.ts` `METRES_PER_LEVEL` (founder 2026-06-28). */
export const ADOPTION_METRES_PER_LEVEL = 3.2;

/** Even-odd ray cast over a GeoJSON ring ([lon, lat] pairs). Pure; boundary not special-cased. */
export function adoptionPointInRing(lon: number, lat: number, ring: ReadonlyArray<ReadonlyArray<number>>): boolean {
    let inside = false;
    for (let i = 0, n = ring.length; i < n; i++) {
        const [x1, y1] = ring[i]!;
        const [x2, y2] = ring[(i + 1) % n]!;
        if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
        if ((y1 > lat) !== (y2 > lat)) {
            const denom = (y2 - y1) || Number.EPSILON;
            const xInt = ((x2 - x1) * (lat - y1)) / denom + x1;
            if (lon < xInt) inside = !inside;
        }
    }
    return inside;
}

/** The minimal feature shape the adoption step needs — structural, so it can be applied by both
 *  collection producers without importing their types (no cycle). */
interface AdoptableFeature {
    geometry: { type: string; coordinates: number[][][] };
    properties: {
        heightM: number;
        heightProvenance?: string;
        floors?: number;
        /** Stamped by the adoption so the query panel / logs can cite the cadastral record. */
        adoptedHeightSource?: string;
    };
}

/**
 * Apply the adoption table to a freshly-built collection IN PLACE; returns how many features were
 * adopted (0 in every city without entries — the common case, one array scan).
 *
 * GUARDS (all honesty-motivated):
 *   • never overrides a `tagged` or `measured-lidar` height — real tile data beats the table, which
 *     is what lets the general bake fix silently retire these entries;
 *   • containment (point-in-footprint), never nearest-neighbour — a miss adopts nothing;
 *   • the adopted feature is stamped `derived-levels` + `adoptedHeightSource`, so it stays in the
 *     L-647 derived treatment and its origin is citable, never silently "real".
 */
export function applyContextHeightAdoptions(
    features: readonly AdoptableFeature[],
    adoptions: readonly ContextHeightAdoption[] = CONTEXT_HEIGHT_ADOPTIONS,
): number {
    if (adoptions.length === 0 || features.length === 0) return 0;
    let adopted = 0;
    for (const f of features) {
        const prov = f.properties.heightProvenance;
        if (prov === 'tagged' || prov === 'measured-lidar') continue; // real data wins, always.
        const outer = f.geometry.coordinates[0];
        if (!Array.isArray(outer) || outer.length < 4) continue;
        for (const a of adoptions) {
            if (!adoptionPointInRing(a.lon, a.lat, outer)) continue;
            f.properties.heightM = a.floorsAboveGround * ADOPTION_METRES_PER_LEVEL;
            f.properties.heightProvenance = 'derived-levels';
            f.properties.floors = a.floorsAboveGround;
            f.properties.adoptedHeightSource = `${a.refcat} — ${a.source}`;
            adopted++;
            break;
        }
    }
    if (adopted > 0) {
        console.log(
            `[gis][ctx] §CTX-HEIGHT-ADOPTION adopted ${adopted} context height(s) from cadastral ` +
                `floor counts (derived-levels — real storeys × assumed 3.2 m; §DEMO-PATCH L-1663, ` +
                `retired by the Catastro bake join).`,
        );
    }
    return adopted;
}
