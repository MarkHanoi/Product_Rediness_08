// The Lorca (INE 30024) jurisdiction test (bbox). Mirrors `cartagenaBbox.ts` — a coarse WGS84
// point-in-municipal-bbox test used to route a plot to the Lorca path.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — see
// `docs/04-reference/jurisdictions/es/es-mc/30024-lorca/findings/CAPABILITY-RESEARCH-2026-08-04.md`
// for the full capability assessment. Lorca has the LARGEST municipal area of any Spanish
// municipality (~1,676 km², highly dispersed núcleos rurales/pedanías), so this box is
// deliberately loose.
//
// PROVENANCE OF THE NUMBERS: Nominatim (`nominatim.openstreetmap.org/search?city=Lorca&
// county=Murcia&country=Spain`), read live 2026-08-04 — `boundingbox: ["37.4210243",
// "37.9696417", "-2.0126512", "-1.3966156"]`, centre `37.6951954, -1.7722910` — rounded OUTWARD
// to hundredths so the gate can only ever be too generous, never too tight (the same convention
// `cartagenaBbox.ts` documents).
//
// ⚠ Lorca can support only a PARTIAL envelope engine (research verdict). PRYZM has NOT built a
// rule pack or a working parcel-level zone resolver here: the one candidate mechanism found —
// `urbanismoenredWS/FichaUrbanistica` inside the `callejero.lorca.es/VisorWebGIS/` production
// bundle — requires a runtime session token (`config/webgis.json?token=...`) this research pass's
// tooling could not obtain, and the legacy host `sit.lorca.es/Visor/` returned HTTP 503. See
// `esLorca.ts` for the cited refusal every Lorca parcel gets today.

/** Loose bounding box for the municipal term of Lorca (centre ≈ 37.6952 N, 1.7723 W). */
export const LORCA_BBOX = {
    minLat: 37.42,
    maxLat: 37.97,
    minLon: -2.02,
    maxLon: -1.39,
} as const;

/** True when a WGS84 point falls within the loose Lorca bounding box. */
export function isInLorca(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= LORCA_BBOX.minLat &&
        lat <= LORCA_BBOX.maxLat &&
        lon >= LORCA_BBOX.minLon &&
        lon <= LORCA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Lorca. */
export const LORCA_INE_CODE = '30024';
