// C58 §1.5 — the Granada (INE 18087) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Granada
// research-pending path. Mirrors `malagaBbox.ts` / `cordobaBbox.ts` / `murciaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation. For Granada the real answer is:
// ZERO investigation has happened — no planning source identified, no geometry endpoint found, no
// zone-classification method known. `docs/04-reference/jurisdictions/es/es-an/18087-granada/
// findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md` records the doc folder holds only the C63 Phase-1
// scaffold, never modified since. Before this file, a Granada click had no `isInGranada` branch
// anywhere and fell straight through to `applyEstimatedZoning` — a FABRICATED generic envelope,
// not even a refusal (§L-663). This file closes ONLY that: routes to a cited "not yet researched"
// refusal, never a fabricated number.
//
// PROVENANCE OF THE NUMBERS: Dirección General del Catastro (Ministerio de Hacienda), INSPIRE
// Cadastral Parcels pre-defined-dataset ATOM feed for territorial office 18, read 2026-08-04:
//   https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/18/ES.SDGC.CP.atom_18.xml
// Entry title "18900-GRANADA" (⚠ 18900 is Catastro's own DGC/territorial-office code, NOT the INE
// code — the INE code carried below, 18087, is what this repo keys on). `georss:polygon`
// (GeoRSS-Simple, EPSG:4326, lat-lon decimal degrees): `37.135504157573 -3.70017881501737 …
// 37.2252932585922 -3.49587224585529`, rounded OUTWARD to the nearest 0.001° so the gate can only
// ever be too generous, never too tight.

/** Loose bounding box for the municipal term of Granada (Catastro INSPIRE extent, rounded outward). */
export const GRANADA_BBOX = {
    minLat: 37.135,
    maxLat: 37.226,
    minLon: -3.701,
    maxLon: -3.495,
} as const;

/** True when a WGS84 point falls within the loose Granada bounding box. */
export function isInGranada(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= GRANADA_BBOX.minLat &&
        lat <= GRANADA_BBOX.maxLat &&
        lon >= GRANADA_BBOX.minLon &&
        lon <= GRANADA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Granada. */
export const GRANADA_INE_CODE = '18087';
