// The Las Torres de Cotillas (INE 30038) jurisdiction test (bbox). Mirrors `cartagenaBbox.ts` —
// a coarse WGS84 point-in-municipal-bbox test used to route a plot to the Las Torres de Cotillas
// path.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — see
// `docs/04-reference/jurisdictions/es/es-mc/30038-las-torres-de-cotillas/findings/
// CAPABILITY-RESEARCH-2026-08-04.md` for the full capability assessment.
//
// PROVENANCE OF THE NUMBERS: Nominatim (`nominatim.openstreetmap.org/search?city=Las+Torres+de+
// Cotillas&county=Murcia&country=Spain`), read live 2026-08-04 — `boundingbox: ["37.9954136",
// "38.0490299", "-1.3283177", "-1.2100560"]`, centre `38.0312689, -1.2416427` — rounded OUTWARD
// to hundredths so the gate can only ever be too generous, never too tight.
//
// ⚠ PRYZM has NOT built a rule pack or a working parcel-level zone resolver here: the one real
// parcel-level zoning API found (`api-sig.visualurb.es`, the "VisualUrb" commercial SaaS) is
// registered to municipality 30038 and confirmed reachable at the municipality-metadata endpoint,
// but every parcel-level call (`/Urbanismo/parcela/calificacion`, `/clasificacion`) returns
// HTTP 401 without a paid licence — a disclosed manual €121/report product, not a bulk/dev API.
// See `esLasTorresDeCotillas.ts` for the cited refusal every parcel here gets today.

/** Loose bounding box for the municipal term of Las Torres de Cotillas (centre ≈ 38.0313 N, 1.2416 W). */
export const LAS_TORRES_DE_COTILLAS_BBOX = {
    minLat: 37.99,
    maxLat: 38.05,
    minLon: -1.33,
    maxLon: -1.21,
} as const;

/** True when a WGS84 point falls within the loose Las Torres de Cotillas bounding box. */
export function isInLasTorresDeCotillas(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= LAS_TORRES_DE_COTILLAS_BBOX.minLat &&
        lat <= LAS_TORRES_DE_COTILLAS_BBOX.maxLat &&
        lon >= LAS_TORRES_DE_COTILLAS_BBOX.minLon &&
        lon <= LAS_TORRES_DE_COTILLAS_BBOX.maxLon
    );
}

/** The INE code for the municipality of Las Torres de Cotillas. */
export const LAS_TORRES_DE_COTILLAS_INE_CODE = '30038';
