// C58 §1.5 / C60 §3 — the Telde (INE 35026, Gran Canaria, Canarias) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Canarias SIPU
// adapter (`esCanariasSipu.ts` / `esTeldePgo2003.ts`). Mirrors `murciaBbox.ts` /
// `cordobaBbox.ts` / `barcelonaBbox.ts` — jurisdiction selection lives in adapters/data, never
// in the engine.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the caveat every sibling box
// carries). Here that caveat is unusually load-bearing: `CANARIAS_ENVELOPE_VERIFIED` is
// `false`, so EVERY parcel routed by this box receives a CITED REFUSAL and no number at all.
// Registering this box publishes nothing; it replaces a fabricated estimate with a "no".
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// §TELDE-BBOX-PROVENANCE — WHERE THESE FOUR NUMBERS COME FROM, AND IN WHICH CRS
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠⚠ THIS BOX WAS **SOURCED**, NOT DRAWN. A previous agent reached this exact point, refused to
// invent a rectangle, and handed the job over unapplied (`tools/canarias-envelope-max/
// REGISTRATION-DIFF.txt`). That refusal was CORRECT — an invented bbox silently produces wrong
// envelopes on real land — and it is why the numbers below carry a URL rather than a memory.
//
// ── PRIMARY SOURCE (the numbers themselves) ──────────────────────────────────────────────────
// Dirección General del Catastro (Ministerio de Hacienda), INSPIRE Cadastral Parcels
// pre-defined-dataset ATOM feed for the province of Las Palmas (35), read 2026-08-02:
//
//   https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/35/ES.SDGC.CP.atom_35.xml
//
// The `<entry>` titled `35026-TELDE Cadastral Parcels` (feed `<updated>2026-02-21</updated>`)
// publishes the dataset's extent as a GeoRSS-Simple rectangle, VERBATIM:
//
//   <georss:polygon>27.9278208577287 -15.5321313473077  27.9278208577287 -15.3582419203404
//                   28.0390049283886 -15.3582419203404  28.0390049283886 -15.5321313473077
//                   27.9278208577287 -15.5321313473077</georss:polygon>
//
//   → minLat 27.9278208577287   maxLat 28.0390049283886
//     minLon −15.5321313473077  maxLon −15.3582419203404
//
// ── ⚠⚠⚠ THE CRS, STATED EXPLICITLY, BECAUSE THIS IS THE CLASSIC SILENT FAILURE HERE ──────────
// TWO different CRSs appear in that one ATOM entry and confusing them is how this goes wrong:
//
//   • The `<georss:*>` element — the numbers ABOVE, and the only ones used here — is
//     **GeoRSS-Simple**, which the specification defines as WGS 84 DECIMAL DEGREES in
//     **LATITUDE-LONGITUDE order** (≡ EPSG:4326). The feed's own comment says so in-line:
//     *"optional GeoRSS-Simple bounding box of the pre-defined dataset. Must be lat lon"*.
//   • The entry ALSO carries `<category term="http://www.opengis.net/def/crs/EPSG/0/32628"
//     label="WGS84"/>` — **EPSG:32628, WGS 84 / UTM zone 28N, in METRES**. That is the CRS of
//     the downloadable GML payload, NOT of the georss box. It is also, exactly, the CRS the
//     Canarian SIPU packages ship `EDIF.shp` in.
//
// ⚠ SO: THE BOX BELOW IS **EPSG:4326 DEGREES**. Telde in EPSG:32628 is ≈ 458 000 E / 3 096 000 N.
// Feeding those metres to `isInTelde()` must FAIL, and `teldeRouting.test.ts` §CRS-GUARD asserts
// exactly that, because a bbox in the wrong CRS does not error — it silently answers "no" for
// every real parcel, or "yes" for open ocean.
//
// ⚠ Canarias does NOT use ETRS89; its official datum is **REGCAN95** (EPSG:4081 geographic /
// EPSG:4082 UTM-28N). REGCAN95, ETRS89 and WGS 84 agree to well under a metre in the Canaries,
// which is nothing at this box's ~111 m rounding — but the distinction is recorded so nobody
// later "corrects" a datum that was never wrong.
//
// ── INDEPENDENT CONFIRMATION 1 — a DIFFERENT PUBLISHER (§PROBE-CAN-BE-WRONG-THREE-WAYS) ──────
// OpenStreetMap relation **345437** (`boundary=administrative`, `admin_level=8`,
// `ine:municipio=35026`), read from Nominatim 2026-08-02:
//
//   minLat 27.9283414  maxLat 28.0388375  minLon −15.5319489  maxLon −15.3582810
//
// Agreement with Catastro, per edge: 58 m (minLat), 19 m (maxLat), 18 m (minLon), 4 m (maxLon).
// ⭐ AND THE CATASTRO BOX STRICTLY CONTAINS THE OSM BOX ON ALL FOUR EDGES — so adopting the
// Catastro extent cannot clip the municipal boundary the second source describes. The two also
// agree on the identity of the thing measured: the ATOM entry is titled `35026-TELDE` and the
// OSM relation tags `ine:municipio=35026`.
//
// ── INDEPENDENT CONFIRMATION 2 — a DIFFERENT SYSTEM, resolving REAL PARCELS ──────────────────
// Catastro's OVC web service (a different service from the INSPIRE download above) was asked to
// name the parcel at points spread across this box, 2026-08-02. Four of five returned parcels
// whose municipality the CADASTRE ITSELF names TELDE, and whose rustic referencia catastral
// BEGINS WITH THE INE CODE `35026`:
//
//   27.9973, −15.4181 → 8969903DS5997S  CL ROQUE                     TELDE (LAS PALMAS)
//   28.0200, −15.4300 → 35026A01300340  Pol. 13 Parc. 340 GALLEGO    TELDE (LAS PALMAS)
//   27.9400, −15.4100 → 35026A00409004  Pol.  4 Parc. 9004 AGUATONA  TELDE (LAS PALMAS)
//   27.9900, −15.3800 → 35026A00100056  Pol.  1 Parc.   56 HOSPITAL  TELDE (LAS PALMAS)
//
// ⭐ THE INE CODE IS INSIDE THE PARCEL IDENTIFIER. A Spanish rustic referencia catastral is
// `PP MMM A …` = province(2) ‖ municipality(3); `35` ‖ `026` = Telde. That is a THIRD, structural
// confirmation of the routing key, independent of both the ATOM title and the OSM tag.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// §TELDE-BBOX-SPILL — IT SPILLS, IT WAS MEASURED SPILLING, AND THAT IS STATED NOT HIDDEN
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// The fifth probe point, 27.9800 −15.5000 — INSIDE this box — returned `35031A00300115`,
// **VALSEQUILLO DE GRAN CANARIA (INE 35031)**, a different municipality with a different plan.
// Every rectangle over an irregular term does this (Murcia's sweeps in 50-odd pedanías; Córdoba's
// sweeps in five neighbours); the discipline is to BOUND the consequence, not to pretend it away:
//
//   1. ⚠ THE BOX IS NOT THE MUNICIPALITY TEST OF RECORD. The authoritative answer is the INE code,
//      and it is available from the data itself — Catastro's OVC reverse-geocode returns `<cp>`
//      (province) + `<cm>` (municipality-within-province), composed by `composeIneCode()` in
//      `murciaBbox.ts`. `registeredJurisdictionIdForIne('35031')` returns `null`, so a Valsequillo
//      parcel identified by code is NOT claimed by Telde's registration.
//   2. ⚠ AND A SPILLED CLICK STILL GETS A TRUE STATEMENT. What Telde's registration produces is
//      `canariasNoRulePackRefusal` — a refusal about what the Gobierno de Canarias PUBLISHES in
//      SIPU and what PRYZM therefore will not sign. It asserts nothing about any one
//      municipality's ordinance, so it cannot become a mis-citation on Valsequillo soil. This is
//      the §CATALUNYA-SPILL discipline settled the Córdoba way: by saying less.
//
// ⚠ AND THE BOX IS DELIBERATELY NOT TIGHTENED TO EXCLUDE VALSEQUILLO. A too-generous gate costs
// one extra cited refusal; a too-tight one silently drops a real Telde parcel back onto
// `applyEstimatedZoning` and its fabricated envelope (§L-663) — which is the defect being closed.
// Asymmetric costs, so the rounding below is OUTWARD ONLY.
//
// Strategic context — esCanariasSipu.ts, esTeldePgo2003.ts, tools/canarias-envelope-max/
// REGISTRATION-DIFF.txt, C58 §1.5, C60 §3, L-616, §CONTEXT-DATA-HONESTY (L-422/457/467/469).

/**
 * Machine-readable citation for `TELDE_BBOX`. Exported so a test can assert the numbers travel
 * WITH their source — an uncited bbox is indistinguishable from an invented one, which is the
 * whole failure this file exists to avoid.
 */
export const TELDE_BBOX_SOURCE = {
    /** The published extent these numbers were read from. */
    url: 'https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/35/ES.SDGC.CP.atom_35.xml',
    publisher: 'Dirección General del Catastro (Ministerio de Hacienda), INSPIRE download service',
    entryTitle: '35026-TELDE Cadastral Parcels',
    /** ⚠ The CRS of the FOUR NUMBERS BELOW: GeoRSS-Simple, decimal degrees, lat-lon order. */
    crsOfBboxCoordinates: 'EPSG:4326',
    /**
     * ⚠ The CRS of the DOWNLOADABLE PAYLOAD in the same ATOM entry — WGS 84 / UTM 28N, METRES.
     * Recorded so the two are never conflated. Also the CRS the SIPU `EDIF.shp` ships in.
     */
    crsOfLinkedDataset: 'EPSG:32628',
    readOn: '2026-08-02',
    /** Second, independent publisher; agrees to ≤ 58 m and is strictly CONTAINED by this box. */
    corroboration: 'OpenStreetMap relation 345437 (ine:municipio=35026) via Nominatim, 2026-08-02',
} as const;

/**
 * Loose bounding box for the municipal term of Telde (INE 35026, Gran Canaria).
 *
 * The Catastro INSPIRE extent above, rounded OUTWARD to whole thousandths of a degree (≈ 111 m
 * lat / ≈ 98 m lon at this latitude) — the `murciaBbox.ts` convention, at a step suited to a
 * 12 × 17 km island municipality rather than the mainland's whole-hundredths. Outward on all four
 * edges, so this box can only ever be too generous, never too tight.
 *
 * ⚠ COARSE PROXIMITY GATE, NOT AN AUTHORISATION. See §TELDE-BBOX-SPILL above.
 */
export const TELDE_BBOX = {
    minLat: 27.927, // ⌊27.9278208577287⌋ to 0.001
    maxLat: 28.04, // ⌈28.0390049283886⌉ to 0.001
    minLon: -15.533, // ⌊−15.5321313473077⌋ to 0.001
    maxLon: -15.358, // ⌈−15.3582419203404⌉ to 0.001
} as const;

/** True when a WGS84 (EPSG:4326, degrees) point falls within the loose Telde bounding box. */
export function isInTelde(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= TELDE_BBOX.minLat &&
        lat <= TELDE_BBOX.maxLat &&
        lon >= TELDE_BBOX.minLon &&
        lon <= TELDE_BBOX.maxLon
    );
}

/**
 * The INE code for the municipality of Telde — the authoritative routing key, and the one the
 * bbox is only a cheap pre-filter for. It is also the `<INE>` segment of
 * `TELDE_JURISDICTION_ID` (`es-35026-telde`), which is what makes
 * `registeredJurisdictionIdForIne('35026')` resolve without a second table to keep in sync.
 */
export const TELDE_INE_CODE = '35026';
