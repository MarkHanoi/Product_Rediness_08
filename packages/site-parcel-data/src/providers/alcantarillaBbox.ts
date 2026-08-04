// The Alcantarilla (INE 30005) jurisdiction test (bbox). Mirrors `cartagenaBbox.ts` — a coarse
// WGS84 point-in-municipal-bbox test used to route a plot to the Alcantarilla path.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — see
// `docs/04-reference/jurisdictions/es/es-mc/30005-alcantarilla/findings/
// CAPABILITY-RESEARCH-2026-08-04.md` for the full capability assessment.
//
// ⚠ INE CODE NOTE: the research file's own header cites "INE 30006", which is a transcription
// slip (the same class of correction `molinaDeSeguraBbox.ts`'s sibling research documents for
// 30026→30027) — Alcantarilla's INE code is **30005**. This module uses the corrected code.
//
// PROVENANCE OF THE NUMBERS: Nominatim (`nominatim.openstreetmap.org/search?city=Alcantarilla&
// county=Murcia&country=Spain`), read live 2026-08-04 — `boundingbox: ["37.9498492",
// "37.9919838", "-1.2734086", "-1.1908729"]`, centre `37.9680649, -1.2149543` — rounded OUTWARD
// to hundredths so the gate can only ever be too generous, never too tight.
//
// ⚠ UNLIKE the other three Región de Murcia targets in this pass, Alcantarilla has a LIVE,
// queryable regional WFS (`mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/ows`, layer
// `sitmurcia_plu_ze`) that returns real HILUCS-classified MultiPolygon land-use geometry for this
// municipality — CONFIRMED live 2026-08-04, 100 real features returned for
// `CQL_FILTER=Municipio='Alcantarilla'`. See `resolveAlcantarillaLanduse.ts`. That layer carries
// COARSE land use only (residential vs. open-space class), never a fine zone code or a numeric
// ordinance parameter — the two 1983 PGOU source documents that would carry those are hosted
// exclusively on SharePoint share links that return HTTP 403 to automated fetch. See
// `esAlcantarilla.ts` for the cited refusal every Alcantarilla parcel gets today.

/** Loose bounding box for the municipal term of Alcantarilla (centre ≈ 37.9681 N, 1.2150 W). */
export const ALCANTARILLA_BBOX = {
    minLat: 37.94,
    maxLat: 38.0,
    minLon: -1.28,
    maxLon: -1.19,
} as const;

/** True when a WGS84 point falls within the loose Alcantarilla bounding box. */
export function isInAlcantarilla(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= ALCANTARILLA_BBOX.minLat &&
        lat <= ALCANTARILLA_BBOX.maxLat &&
        lon >= ALCANTARILLA_BBOX.minLon &&
        lon <= ALCANTARILLA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Alcantarilla. */
export const ALCANTARILLA_INE_CODE = '30005';
