// C58 §1.5 — the Sevilla (INE 41091) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Sevilla
// path (`applySevillaZoningThenFallback`). Mirrors `valenciaBbox.ts` / `cordobaBbox.ts` /
// `murciaBbox.ts` / `madridBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — the real answer is decided at
// the parcel step. For Sevilla today that answer is: the city's own ArcGIS `Calificación`
// layer (25) resolves the real `zona_orden` for a point, but PRYZM has not transcribed the
// PGOU-2006 ordinance parameters, so every parcel gets a cited, zone-named REFUSAL
// (`esSevilla.ts`), never a fabricated estimate (`SEVILLA_ENVELOPE_VERIFIED` stays `false`).
//
// PROVENANCE OF THE NUMBERS: Nominatim (`nominatim.openstreetmap.org/search?city=Sevilla&
// country=Spain`), read live 2026-08-03 — `boundingbox: ["37.3002036","37.4529579",
// "-6.0329183","-5.8191571"]`, centre `37.3886303, -5.9953403` — rounded OUTWARD to whole
// hundredths so the gate can only ever be too generous, never too tight (the same convention
// `cordobaBbox.ts`/`murciaBbox.ts` document). A too-generous coarse gate costs one extra cited
// refusal on a neighbouring municipality's land; a too-tight one silently drops a real Sevilla
// parcel back onto the fabricated `applyEstimatedZoning` triple, which is the failure this box
// exists to close.
//
// ⚠ Sevilla's municipal term is bordered by Alcalá de Guadaíra, Dos Hermanas, San Juan de
// Aznalfarache, Camas, Santiponce, La Algaba, La Rinconada and Mairena del Aljarafe — every one
// a DIFFERENT municipality with its own general plan. This rectangle necessarily spills into
// parts of them. A spilled click still gets a true statement: `esSevilla.ts`'s refusal names
// only what PRYZM can and cannot say, never asserting a specific ordinance article on land it
// has not checked belongs to Sevilla — the same discipline `cordobaBbox.ts` documents for its
// own municipal-closure box.

/** Loose bounding box for the municipal term of Sevilla (centre ≈ 37.3886 N, 5.9953 W). */
export const SEVILLA_BBOX = {
    minLat: 37.3,
    maxLat: 37.46,
    minLon: -6.04,
    maxLon: -5.81,
} as const;

/** True when a WGS84 point falls within the loose Sevilla bounding box. */
export function isInSevilla(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SEVILLA_BBOX.minLat &&
        lat <= SEVILLA_BBOX.maxLat &&
        lon >= SEVILLA_BBOX.minLon &&
        lon <= SEVILLA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Sevilla. */
export const SEVILLA_INE_CODE = '41091';
