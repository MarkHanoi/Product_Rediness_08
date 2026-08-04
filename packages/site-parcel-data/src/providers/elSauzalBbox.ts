// C58 §1.5 / C60 §3 — the El Sauzal (INE 38041, Tenerife, Canarias) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test, on the `teldeBbox.ts` / `cordobaBbox.ts`
// precedent — jurisdiction selection lives in adapters/data, never in the engine.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation. Here that caveat is unusually
// load-bearing, exactly as it is for Telde: `EL_SAUZAL_ENVELOPE_VERIFIED` (`esElSauzal.ts`) is
// `false`, so a parcel routed by this box would receive a cited refusal / gated result, not a
// number, until a human signs off.
//
// ── SOURCE ───────────────────────────────────────────────────────────────────────────────────
// Dirección General del Catastro (Ministerio de Hacienda), INSPIRE Cadastral Parcels
// pre-defined-dataset ATOM feed for the province of Santa Cruz de Tenerife (38), read 2026-08-03:
//
//   https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/38/ES.SDGC.CP.atom_38.xml
//
// The `<entry>` titled `38041-SAUZAL Cadastral Parcels` publishes the dataset's extent as a
// GeoRSS-Simple rectangle, VERBATIM:
//
//   <georss:polygon>28.4134734198295 -16.457214679688 28.4134734198295 -16.3962370448033
//                   28.487623233525 -16.3962370448033 28.487623233525 -16.457214679688
//                   28.4134734198295 -16.457214679688</georss:polygon>
//
//   → minLat 28.4134734198295   maxLat 28.487623233525
//     minLon -16.457214679688   maxLon -16.3962370448033
//
// ⚠ THE CRS: the `<georss:*>` numbers above are GeoRSS-Simple — WGS84 decimal degrees,
// lat-lon order (EPSG:4326) — per the feed's own inline comment ("Must be lat lon"). The entry
// also carries a `<category term=".../EPSG/0/32628" label="WGS84"/>` for the DOWNLOADABLE GML
// payload's CRS (metres) — NOT the CRS of the box coordinates above. Same two-CRS trap
// `teldeBbox.ts` documents; not conflated here either.
//
// Strategic context — `resolveElSauzalZone.ts`, `esElSauzal.ts`, C58 §1.5, C60 §3,
// §CONTEXT-DATA-HONESTY.

/** Machine-readable citation for `EL_SAUZAL_BBOX`, so the numbers travel with their source. */
export const EL_SAUZAL_BBOX_SOURCE = {
    url: 'https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/38/ES.SDGC.CP.atom_38.xml',
    publisher: 'Dirección General del Catastro (Ministerio de Hacienda), INSPIRE download service',
    entryTitle: '38041-SAUZAL Cadastral Parcels',
    /** ⚠ The CRS of the FOUR NUMBERS BELOW: GeoRSS-Simple, decimal degrees, lat-lon order. */
    crsOfBboxCoordinates: 'EPSG:4326',
    /** The CRS of the linked GML payload — NOT of the georss box above. */
    crsOfLinkedDataset: 'EPSG:32628',
    readOn: '2026-08-03',
} as const;

/**
 * Loose bounding box for the municipal term of El Sauzal (INE 38041, Tenerife).
 *
 * The Catastro INSPIRE extent above, rounded OUTWARD to whole thousandths of a degree (≈ 111 m
 * lat / ≈ 98 m lon at this latitude) — the `teldeBbox.ts` / `murciaBbox.ts` convention. Outward
 * on all four edges, so this box can only ever be too generous, never too tight.
 *
 * ⚠ COARSE PROXIMITY GATE, NOT AN AUTHORISATION.
 */
export const EL_SAUZAL_BBOX = {
    minLat: 28.413, // ⌊28.4134734198295⌋ to 0.001
    maxLat: 28.488, // ⌈28.487623233525⌉ to 0.001
    minLon: -16.458, // ⌊−16.457214679688⌋ to 0.001
    maxLon: -16.396, // ⌈−16.3962370448033⌉ to 0.001
} as const;

/** True when a WGS84 (EPSG:4326, degrees) point falls within the loose El Sauzal bounding box. */
export function isInElSauzal(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= EL_SAUZAL_BBOX.minLat &&
        lat <= EL_SAUZAL_BBOX.maxLat &&
        lon >= EL_SAUZAL_BBOX.minLon &&
        lon <= EL_SAUZAL_BBOX.maxLon
    );
}

/**
 * The INE code for the municipality of El Sauzal — the authoritative routing key, and the one
 * `EL_SAUZAL_JURISDICTION_ID` (`es-38041-el-sauzal`, `esElSauzal.ts`) is built from.
 */
export const EL_SAUZAL_INE_CODE = '38041';
