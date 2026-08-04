// C58 §1.5 — the Málaga (INE 29067) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Málaga
// research-pending path. Mirrors `sevillaBbox.ts` / `cordobaBbox.ts` / `murciaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation. For Málaga the real answer is:
// PRYZM has NO rulepack, NO zone-identity resolver and NO transcribed ordinance at all — every
// parameterized attempt to read the municipal `muralPGOU:*` GeoServer layers (13 combinations
// across WFS versions/mount paths/CRS, plus WMS GetMap/GetFeatureInfo/GetLegendGraphic) fails with
// `ORA-28000: la cuenta está bloqueada` (Oracle account locked) — confirmed by control (3/3
// non-muralPGOU layers on the SAME GeoServer instance serve normally, 0/8 muralPGOU layers do).
// See `docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/
// FORENSIC-BLOCKER-AUDIT-2026-08-03.md` for the full record. Before this file, a Málaga click had
// no `isInMalaga` branch anywhere and fell straight through to `applyEstimatedZoning` — a
// FABRICATED generic envelope, not even a refusal (§L-663). This file closes ONLY that: routes to
// a cited "not yet researched" refusal, never a fabricated number.
//
// PROVENANCE OF THE NUMBERS: Dirección General del Catastro (Ministerio de Hacienda), INSPIRE
// Cadastral Parcels pre-defined-dataset ATOM feed for territorial office 29, read 2026-08-04:
//   https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/29/ES.SDGC.CP.atom_29.xml
// Entry title "29900-MALAGA" (⚠ 29900 is Catastro's own DGC/territorial-office code, NOT the INE
// code — the same trap `canariasMunicipalBboxes.ts` documents for Santa Cruz de Tenerife; the INE
// code carried below, 29067, is what `registeredJurisdictionIdForIne` and every other Spanish
// planning source in this repo key on). `georss:polygon` (GeoRSS-Simple, EPSG:4326, lat-lon decimal
// degrees): `36.6349348218562 -4.59051859717666 … 36.8954061882024 -4.25722269025506`, rounded
// OUTWARD to the nearest 0.001° (same convention `teldeBbox.ts` / `canariasMunicipalBboxes.ts` use)
// so the gate can only ever be too generous, never too tight.

/** Loose bounding box for the municipal term of Málaga (Catastro INSPIRE extent, rounded outward). */
export const MALAGA_BBOX = {
    minLat: 36.634,
    maxLat: 36.896,
    minLon: -4.591,
    maxLon: -4.257,
} as const;

/** True when a WGS84 point falls within the loose Málaga bounding box. */
export function isInMalaga(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= MALAGA_BBOX.minLat &&
        lat <= MALAGA_BBOX.maxLat &&
        lon >= MALAGA_BBOX.minLon &&
        lon <= MALAGA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Málaga. */
export const MALAGA_INE_CODE = '29067';
