// C58 §1.5 — the Cartagena (INE 30016) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Cartagena path.
// Mirrors `sevillaBbox.ts` / `murciaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — the real answer is decided at the
// parcel step (`resolveCartagenaZone.ts`, a live WMS `GetFeatureInfo` query against the
// currently-valid R0/1987 plan).
//
// ⚠ CARTAGENA IS ABSENT FROM THE NATIONAL CATASTRO INSPIRE FEED (`ES.SDGC.CP.atom_30.xml`, read
// 2026-08-04) — checked directly: entries jump 30015→30017, no `30016` row and no DGC-alias row
// (unlike the Málaga/Santa Cruz de Tenerife DGC-vs-INE pattern documented in `malagaBbox.ts` /
// `canariasMunicipalBboxes.ts`, where the municipality has a DIFFERENT numbered row). Cartagena is
// one of the small number of Spanish municipalities with its OWN delegated cadastral management,
// outside the national DGC's INSPIRE publication — so this box is NOT sourced from that feed.
//
// PROVENANCE OF THE NUMBERS: Nominatim (`nominatim.openstreetmap.org/search?city=Cartagena&
// county=Murcia&country=Spain`), read live 2026-08-04 — `boundingbox: ["37.5338600",
// "37.7308788","-1.2261481","-0.6479296"]`, centre `37.6155018, -0.9875110` — rounded OUTWARD to
// hundredths so the gate can only ever be too generous, never too tight (the same convention
// `sevillaBbox.ts`/`cordobaBbox.ts` document).
//
// ⚠ Cartagena's municipal term is ~558 km² and spills into La Unión, Fuente Álamo and other
// neighbouring municipalities' own terms. A spilled click still gets a true statement:
// `esCartagena.ts`'s refusal names only what PRYZM can and cannot say, never asserting a specific
// ordinance article on land it has not checked belongs to Cartagena.

/** Loose bounding box for the municipal term of Cartagena (centre ≈ 37.6155 N, 0.9875 W). */
export const CARTAGENA_BBOX = {
    minLat: 37.53,
    maxLat: 37.74,
    minLon: -1.23,
    maxLon: -0.64,
} as const;

/** True when a WGS84 point falls within the loose Cartagena bounding box. */
export function isInCartagena(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CARTAGENA_BBOX.minLat &&
        lat <= CARTAGENA_BBOX.maxLat &&
        lon >= CARTAGENA_BBOX.minLon &&
        lon <= CARTAGENA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Cartagena. */
export const CARTAGENA_INE_CODE = '30016';
