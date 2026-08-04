// The Molina de Segura (INE 30027) jurisdiction test (bbox). Mirrors `cartagenaBbox.ts` — a
// coarse WGS84 point-in-municipal-bbox test used to route a plot to the Molina de Segura path.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — see
// `docs/04-reference/jurisdictions/es/es-mc/30027-molina-de-segura/findings/
// CAPABILITY-RESEARCH-2026-08-04.md` for the full capability assessment.
//
// PROVENANCE OF THE NUMBERS: Nominatim (`nominatim.openstreetmap.org/search?city=Molina+de+
// Segura&county=Murcia&country=Spain`), read live 2026-08-04 — `boundingbox: ["38.0015804",
// "38.2716817", "-1.2734113", "-1.1314605"]`, centre `38.0572339, -1.2095298` — rounded OUTWARD
// to hundredths so the gate can only ever be too generous, never too tight.
//
// ⚠ PRYZM has NOT built a rule pack or a working parcel-level zone resolver here: the public
// zoning viewer ("P.G.M.O. Información territorial") is a third-party SaaS SPA
// (`citymap.tecnogeows.com`) whose backend API could not be enumerated by static fetch, and the
// two ordinance PDFs (Normas Urbanísticas, Fichas Urbanísticas) downloaded successfully but their
// per-zone tables are image/vector-drawn, not text-extractable. See `esMolinaDeSegura.ts` for the
// cited refusal every Molina de Segura parcel gets today.

/** Loose bounding box for the municipal term of Molina de Segura (centre ≈ 38.0572 N, 1.2095 W). */
export const MOLINA_DE_SEGURA_BBOX = {
    minLat: 38.0,
    maxLat: 38.28,
    minLon: -1.28,
    maxLon: -1.13,
} as const;

/** True when a WGS84 point falls within the loose Molina de Segura bounding box. */
export function isInMolinaDeSegura(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= MOLINA_DE_SEGURA_BBOX.minLat &&
        lat <= MOLINA_DE_SEGURA_BBOX.maxLat &&
        lon >= MOLINA_DE_SEGURA_BBOX.minLon &&
        lon <= MOLINA_DE_SEGURA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Molina de Segura. */
export const MOLINA_DE_SEGURA_INE_CODE = '30027';
