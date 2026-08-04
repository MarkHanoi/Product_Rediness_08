// §CANARIAS-88-REGISTRATION (2026-08-03) — municipal bboxes for the 87 non-Telde municipalities.
//
// PURE + tiny: a WGS84 point-in-municipal-bbox table used to route a plot to the Canarias SIPU
// adapter (`esCanariasSipu.ts`), the same shape as `teldeBbox.ts` (Telde's own box lives there and
// is NOT repeated here). Jurisdiction selection lives in adapters/data, never in the engine.
//
// A bbox is a COARSE proximity gate, NEVER an authorisation — see `teldeBbox.ts` for the full
// argument. Here it is unusually load-bearing for a second reason too: `CANARIAS_ENVELOPE_VERIFIED`
// (`esCanariasSipu.ts`) is `false`, so EVERY parcel routed by any box in this file receives a CITED
// REFUSAL and no number at all. Registering these boxes publishes nothing; it replaces a fabricated
// `estimated-default` envelope (§L-663) with an honest "no" for land PRYZM was previously silent on.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CANARIAS-88-PROVENANCE — WHERE THESE NUMBERS COME FROM, AND WHY THIS FILE EXISTS AT ALL
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `esCanariasSipu.ts` names 41 `CANARIAS_ROUTABLE_MUNICIPALITIES` (single determinable base
// instrument) and leaves the other 46 (+Telde) as a named MULTI-INSTRUMENT blocker
// (`CANARIAS_MULTI_INSTRUMENT_BLOCKER`) — but until this file, NEITHER group had a bbox, so NONE
// of them could be registered and EVERY Canarias parcel outside Telde fell through to
// `applyEstimatedZoning`'s fabricated generic envelope (3.0/1.5/3.0 m setbacks, FAR 2.0, 50 %
// coverage) — exactly the defect `TELDE_BBOX_SOURCE` closed for one municipality out of 88.
//
// Rather than derive 87 bespoke boxes from 87 different sources, this file uses the SAME
// publisher and the SAME dataset `teldeBbox.ts` already trusts, extended to the other 87 rows the
// dataset already contains:
//
// ── PRIMARY SOURCE ───────────────────────────────────────────────────────────────────────────
// Dirección General del Catastro (Ministerio de Hacienda), INSPIRE Cadastral Parcels
// pre-defined-dataset ATOM feeds for BOTH Canarias provinces, read 2026-08-03:
//
//   https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/35/ES.SDGC.CP.atom_35.xml
//     (Las Palmas — 34 entry elements: Gran Canaria, Fuerteventura, Lanzarote)
//   https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/38/ES.SDGC.CP.atom_38.xml
//     (Santa Cruz de Tenerife — 54 entry elements: Tenerife, La Palma, La Gomera, El Hierro)
//
// Together: 34 + 54 = 88 entries — EXACTLY the 88 Canarias municipalities, each carrying a
// georss:polygon extent in the same format TELDE_BBOX_SOURCE documents (GeoRSS-Simple,
// EPSG:4326, lat-lon decimal degrees; the linked GML payload is EPSG:32628 and is NOT what is
// read here — see teldeBbox.ts §TELDE-BBOX-PROVENANCE for the full CRS argument, which applies
// unchanged to every box below).
//
// Two entries are EXCLUDED here, each because it already has its OWN sourced, tested, more
// specific registration elsewhere: Telde (35026, teldeBbox.ts / esTeldePgo2003.ts) and El Sauzal
// (38041, esElSauzal.ts — a concurrently-landed article-cited transcription; see the note beside
// its skipped slot below). The remaining 86 are split by the census already computed in
// esCanariasSipu.ts: 40 into CANARIAS_ROUTABLE_MUNICIPAL_BBOXES (41 routable municipalities minus
// El Sauzal), 46 into CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES.
// canariasMunicipalBboxesTotality.test.ts proves the accounting: every name in
// CANARIAS_ROUTABLE_MUNICIPALITIES is EITHER in this table OR is El Sauzal (never neither, never
// double-counted), and 88 − 41 − 1(Telde) = 46 for the blocked table exactly.
//
// ── ROUNDING, SAME CONVENTION AS TELDE ───────────────────────────────────────────────────────
// Every box below is the feed's own extent rounded OUTWARD to the nearest 0.001 degree (roughly
// 111 m lat / 90-100 m lon in this latitude band) — never inward, so a box can only ever be too
// generous, never too tight (the Telde/Valsequillo §TELDE-BBOX-SPILL discipline: a spilled click
// still gets a TRUE, jurisdiction-agnostic statement — canariasNoRulePackRefusal /
// canariasMultiInstrumentRefusal never assert anything about a specific parcel's ordinance, so an
// over-wide box cannot mis-cite one).
//
// ── THE ONE STRUCTURAL TRAP, NAMED SO IT IS NEVER RE-DISCOVERED ─────────────────────────────
// registry.ts §JURISDICTION-ID-CARRIES-THE-INE states plainly: "Catastro's DGC code is the odd
// one out and is NOT what these ids carry... DGC 08196 and INE 08196 are different municipalities."
// Santa Cruz de Tenerife is exactly that trap: the 38-province ATOM feed titles its entry
// 38900-SANTA CRUZ DE TENERIFE, but 38900 is Catastro's own DGC/territorial-office numbering
// for the capital, NOT its INE code — the true INE municipal code is 38038. The `ine` field
// below for Santa Cruz de Tenerife is 38038 (so its jurisdiction id agrees with
// ineCodeForJurisdiction() and every other Spanish planning source keyed on INE); `dgcCode`
// carries Catastro's own 38900 so the citation trail stays honest about which number came from
// which system. No other entry in this file needed the same correction — checked against every
// title in both feeds; 38900/38038 is the only INE/DGC divergence found.
//
// ── NAMES ARE COSMETIC, NOT LOAD-BEARING ─────────────────────────────────────────────────────
// The Catastro ATOM title field ships the municipality name in plain uppercase ASCII with NO
// diacritics, and in at least one case (35010, Santa María de Guía de Gran Canaria) TRUNCATED
// at the source (SANTA MARIA DE GUIA DE GRAN CA). `name` below restores the standard Spanish
// form (accents, casing) for display; `sourceEntryTitle` keeps the feed's own uncorrected string
// so the correction is always checkable against the citation. The ROUTING key is `ine`, never
// `name` — a cosmetic slip in a display string cannot mis-route a parcel.
//
// Strategic context — teldeBbox.ts, esCanariasSipu.ts, registry.ts §JURISDICTION-ID-CARRIES-THE-
// INE, C58 §1.5, C60 §3, L-616, L-663, §CONTEXT-DATA-HONESTY (L-422/457/467/469).

/** Machine-readable citation for every box in this file. */
export const CANARIAS_MUNICIPAL_BBOX_SOURCE = {
    urls: [
        'https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/35/ES.SDGC.CP.atom_35.xml',
        'https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/38/ES.SDGC.CP.atom_38.xml',
    ],
    publisher: 'Dirección General del Catastro (Ministerio de Hacienda), INSPIRE download service',
    /** The CRS of the bbox numbers below: GeoRSS-Simple, decimal degrees, lat-lon order. */
    crsOfBboxCoordinates: 'EPSG:4326',
    /** The CRS of the downloadable GML payload in the same entries — NOT read here. */
    crsOfLinkedDataset: 'EPSG:32628',
    readOn: '2026-08-03',
} as const;

/** A WGS84 (EPSG:4326, degrees) loose bounding box — the same shape as `TELDE_BBOX`. */
export interface CanariasMunicipalBboxExtent {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

export interface CanariasMunicipalBboxEntry {
    /** The true INE municipal code (5 digits) — the routing/identity key. See the trap note above. */
    readonly ine: string;
    /** Catastro's own DGC/territorial-office code, ONLY when it diverges from `ine` (Santa Cruz de Tenerife). */
    readonly dgcCode?: string;
    /** Display name, standard Spanish form — cosmetic, never routed on. */
    readonly name: string;
    /** Lowercase, ASCII, hyphenated — the slug segment of `es-<ine>-<slug>`. */
    readonly jurisdictionSlug: string;
    readonly bbox: CanariasMunicipalBboxExtent;
    /** The feed's own uncorrected title text, kept so `name` is always checkable. */
    readonly sourceEntryTitle: string;
}

/** True when a WGS84 point falls within the given loose municipal bounding box. */
export function isWithinCanariasMunicipalBbox(
    bbox: CanariasMunicipalBboxExtent,
    lat: number,
    lon: number,
): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

/**
 * 40 of the 41 CANARIAS_ROUTABLE_MUNICIPALITIES (esCanariasSipu.ts), each with a sourced bbox.
 * The 41st, El Sauzal (INE 38041), is deliberately absent — see the comment beside its skipped
 * slot below — because it owns a richer, article-cited registration elsewhere (`esElSauzal.ts`).
 * canariasMunicipalBboxesTotality.test.ts asserts every OTHER name in that census is present here,
 * so the two lists cannot silently drift apart on anything but that one, named exception.
 */
export const CANARIAS_ROUTABLE_MUNICIPAL_BBOXES: readonly CanariasMunicipalBboxEntry[] = Object.freeze([
    {
        ine: '35001',
        name: 'Agaete',
        jurisdictionSlug: 'agaete',
        bbox: { minLat: 28.028, maxLat: 28.118, minLon: -15.75, maxLon: -15.649 },
        sourceEntryTitle: '35001-AGAETE',
    },
    {
        ine: '35003',
        name: 'Antigua',
        jurisdictionSlug: 'antigua',
        bbox: { minLat: 28.246, maxLat: 28.456, minLon: -14.062, maxLon: -13.848 },
        sourceEntryTitle: '35003-ANTIGUA',
    },
    {
        ine: '35005',
        name: 'Artenara',
        jurisdictionSlug: 'artenara',
        bbox: { minLat: 27.979, maxLat: 28.057, minLon: -15.773, maxLon: -15.614 },
        sourceEntryTitle: '35005-ARTENARA',
    },
    {
        ine: '35007',
        name: 'Betancuria',
        jurisdictionSlug: 'betancuria',
        bbox: { minLat: 28.375, maxLat: 28.496, minLon: -14.159, maxLon: -14.016 },
        sourceEntryTitle: '35007-BETANCURIA',
    },
    {
        ine: '35008',
        name: 'Firgas',
        jurisdictionSlug: 'firgas',
        bbox: { minLat: 28.076, maxLat: 28.145, minLon: -15.578, maxLon: -15.54 },
        sourceEntryTitle: '35008-FIRGAS',
    },
    {
        ine: '35014',
        name: 'Moya',
        jurisdictionSlug: 'moya',
        bbox: { minLat: 28.018, maxLat: 28.148, minLon: -15.626, maxLon: -15.558 },
        sourceEntryTitle: '35014-MOYA',
    },
    {
        ine: '35022',
        name: 'Santa Brigida',
        jurisdictionSlug: 'santa-brigida',
        bbox: { minLat: 28.006, maxLat: 28.059, minLon: -15.54, maxLon: -15.45 },
        sourceEntryTitle: '35022-SANTA BRIGIDA',
    },
    {
        ine: '35025',
        name: 'Tejeda',
        jurisdictionSlug: 'tejeda',
        bbox: { minLat: 27.911, maxLat: 28.02, minLon: -15.752, maxLon: -15.572 },
        sourceEntryTitle: '35025-TEJEDA',
    },
    {
        ine: '35029',
        name: 'Tinajo',
        jurisdictionSlug: 'tinajo',
        bbox: { minLat: 28.984, maxLat: 29.126, minLon: -13.809, maxLon: -13.638 },
        sourceEntryTitle: '35029-TINAJO',
    },
    {
        ine: '35031',
        name: 'Valsequillo de Gran Canaria',
        jurisdictionSlug: 'valsequillo-de-gran-canaria',
        bbox: { minLat: 27.949, maxLat: 28.015, minLon: -15.558, maxLon: -15.458 },
        sourceEntryTitle: '35031-VALSEQUILLO DE GRAN CANARIA',
    },
    {
        ine: '35032',
        name: 'Valleseco',
        jurisdictionSlug: 'valleseco',
        bbox: { minLat: 28.011, maxLat: 28.079, minLon: -15.614, maxLon: -15.555 },
        sourceEntryTitle: '35032-VALLESECO',
    },
    {
        ine: '35033',
        name: 'Vega de San Mateo',
        jurisdictionSlug: 'vega-de-san-mateo',
        bbox: { minLat: 27.957, maxLat: 28.039, minLon: -15.601, maxLon: -15.513 },
        sourceEntryTitle: '35033-VEGA DE SAN MATEO',
    },
    {
        ine: '38002',
        name: 'Agulo',
        jurisdictionSlug: 'agulo',
        bbox: { minLat: 28.115, maxLat: 28.205, minLon: -17.259, maxLon: -17.183 },
        sourceEntryTitle: '38002-AGULO',
    },
    {
        ine: '38003',
        name: 'Alajero',
        jurisdictionSlug: 'alajero',
        bbox: { minLat: 28.018, maxLat: 28.113, minLon: -17.297, maxLon: -17.193 },
        sourceEntryTitle: '38003-ALAJERO',
    },
    {
        ine: '38004',
        name: 'Arafo',
        jurisdictionSlug: 'arafo',
        bbox: { minLat: 28.326, maxLat: 28.392, minLon: -16.486, maxLon: -16.362 },
        sourceEntryTitle: '38004-ARAFO',
    },
    {
        ine: '38007',
        name: 'Barlovento',
        jurisdictionSlug: 'barlovento',
        bbox: { minLat: 28.754, maxLat: 28.847, minLon: -17.864, maxLon: -17.767 },
        sourceEntryTitle: '38007-BARLOVENTO',
    },
    {
        ine: '38010',
        name: 'Buenavista del Norte',
        jurisdictionSlug: 'buenavista-del-norte',
        bbox: { minLat: 28.271, maxLat: 28.394, minLon: -16.927, maxLon: -16.818 },
        sourceEntryTitle: '38010-BUENAVISTA DEL NORTE',
    },
    {
        ine: '38012',
        name: 'Fasnia',
        jurisdictionSlug: 'fasnia',
        bbox: { minLat: 28.192, maxLat: 28.306, minLon: -16.538, maxLon: -16.406 },
        sourceEntryTitle: '38012-FASNIA',
    },
    {
        ine: '38013',
        name: 'Frontera',
        jurisdictionSlug: 'frontera',
        bbox: { minLat: 27.711, maxLat: 27.826, minLon: -18.164, maxLon: -17.976 },
        sourceEntryTitle: '38013-FRONTERA',
    },
    {
        ine: '38014',
        name: 'Fuencaliente de La Palma',
        jurisdictionSlug: 'fuencaliente-de-la-palma',
        bbox: { minLat: 28.451, maxLat: 28.558, minLon: -17.888, maxLon: -17.794 },
        sourceEntryTitle: '38014-FUENCALIENTE DE LA PALMA',
    },
    {
        ine: '38016',
        name: 'Garafia',
        jurisdictionSlug: 'garafia',
        bbox: { minLat: 28.747, maxLat: 28.86, minLon: -17.99, maxLon: -17.844 },
        sourceEntryTitle: '38016-GARAFIA',
    },
    {
        ine: '38018',
        name: 'La Guancha',
        jurisdictionSlug: 'la-guancha',
        bbox: { minLat: 28.296, maxLat: 28.403, minLon: -16.684, maxLon: -16.607 },
        sourceEntryTitle: '38018-LA GUANCHA',
    },
    {
        ine: '38021',
        name: 'Hermigua',
        jurisdictionSlug: 'hermigua',
        bbox: { minLat: 28.106, maxLat: 28.184, minLon: -17.247, maxLon: -17.133 },
        sourceEntryTitle: '38021-HERMIGUA',
    },
    {
        ine: '38025',
        name: 'La Matanza de Acentejo',
        jurisdictionSlug: 'la-matanza-de-acentejo',
        bbox: { minLat: 28.408, maxLat: 28.467, minLon: -16.476, maxLon: -16.408 },
        sourceEntryTitle: '38025-LA MATANZA DE ACENTEJO',
    },
    {
        ine: '38029',
        name: 'Puntagorda',
        jurisdictionSlug: 'puntagorda',
        bbox: { minLat: 28.738, maxLat: 28.799, minLon: -18.009, maxLon: -17.89 },
        sourceEntryTitle: '38029-PUNTAGORDA',
    },
    {
        ine: '38030',
        name: 'Puntallana',
        jurisdictionSlug: 'puntallana',
        bbox: { minLat: 28.703, maxLat: 28.784, minLon: -17.84, maxLon: -17.723 },
        sourceEntryTitle: '38030-PUNTALLANA',
    },
    {
        ine: '38033',
        name: 'San Andres y Sauces',
        jurisdictionSlug: 'san-andres-y-sauces',
        bbox: { minLat: 28.743, maxLat: 28.819, minLon: -17.856, maxLon: -17.752 },
        sourceEntryTitle: '38033-SAN ANDRES Y SAUCES',
    },
    {
        ine: '38034',
        name: 'San Juan de La Rambla',
        jurisdictionSlug: 'san-juan-de-la-rambla',
        bbox: { minLat: 28.306, maxLat: 28.4, minLon: -16.656, maxLon: -16.592 },
        sourceEntryTitle: '38034-SAN JUAN DE LA RAMBLA',
    },
    {
        ine: '38040',
        name: 'Santiago del Teide',
        jurisdictionSlug: 'santiago-del-teide',
        bbox: { minLat: 28.226, maxLat: 28.317, minLon: -16.854, maxLon: -16.675 },
        sourceEntryTitle: '38040-SANTIAGO DEL TEIDE',
    },
    // ⚠ EL SAUZAL (INE 38041) IS DELIBERATELY ABSENT FROM THIS TABLE, THE SAME WAY TELDE IS. A
    // concurrently-landed, article-cited transcription (`esElSauzal.ts`, 17 packed `RE-ViUf-*`
    // zones read from the PGO's own Normativa Urbanística, Título X Cap. 3) is the more specific,
    // more researched registration for this municipality — the same precedence this whole registry
    // already gives a real pack over a generic coverage-gap entry. Duplicating it here would either
    // silently shadow the richer registration or throw at load (`envelopeAuthorisation.ts`'s
    // duplicate-gate guard caught exactly that during this session). El Sauzal is still ROUTABLE by
    // the census in `esCanariasSipu.ts` — `CANARIAS_ROUTABLE_MUNICIPALITIES` is intentionally left
    // unedited, since that is an objective fact about the SIPU catalogue, not a registration
    // bookkeeping choice — it is simply covered by its OWN, better registration instead of this
    // generic one. See `canariasMunicipalBboxesTotality.test.ts` for the accounting.
    {
        ine: '38042',
        name: 'Los Silos',
        jurisdictionSlug: 'los-silos',
        bbox: { minLat: 28.31, maxLat: 28.394, minLon: -16.836, maxLon: -16.792 },
        sourceEntryTitle: '38042-LOS SILOS',
    },
    {
        ine: '38044',
        name: 'El Tanque',
        jurisdictionSlug: 'el-tanque',
        bbox: { minLat: 28.282, maxLat: 28.37, minLon: -16.81, maxLon: -16.735 },
        sourceEntryTitle: '38044-EL TANQUE',
    },
    {
        ine: '38045',
        name: 'Tazacorte',
        jurisdictionSlug: 'tazacorte',
        bbox: { minLat: 28.591, maxLat: 28.661, minLon: -17.949, maxLon: -17.901 },
        sourceEntryTitle: '38045-TAZACORTE',
    },
    {
        ine: '38046',
        name: 'Tegueste',
        jurisdictionSlug: 'tegueste',
        bbox: { minLat: 28.49, maxLat: 28.547, minLon: -16.374, maxLon: -16.292 },
        sourceEntryTitle: '38046-TEGUESTE',
    },
    {
        ine: '38047',
        name: 'Tijarafe',
        jurisdictionSlug: 'tijarafe',
        bbox: { minLat: 28.65, maxLat: 28.753, minLon: -17.993, maxLon: -17.895 },
        sourceEntryTitle: '38047-TIJARAFE',
    },
    {
        ine: '38049',
        name: 'Valle Gran Rey',
        jurisdictionSlug: 'valle-gran-rey',
        bbox: { minLat: 28.077, maxLat: 28.154, minLon: -17.351, maxLon: -17.266 },
        sourceEntryTitle: '38049-VALLE GRAN REY',
    },
    {
        ine: '38050',
        name: 'Vallehermoso',
        jurisdictionSlug: 'vallehermoso',
        bbox: { minLat: 28.046, maxLat: 28.22, minLon: -17.349, maxLon: -17.226 },
        sourceEntryTitle: '38050-VALLEHERMOSO',
    },
    {
        ine: '38051',
        name: 'La Victoria de Acentejo',
        jurisdictionSlug: 'la-victoria-de-acentejo',
        bbox: { minLat: 28.389, maxLat: 28.444, minLon: -16.489, maxLon: -16.415 },
        sourceEntryTitle: '38051-LA VICTORIA DE ACENTEJO',
    },
    {
        ine: '38052',
        name: 'Vilaflor',
        jurisdictionSlug: 'vilaflor',
        bbox: { minLat: 28.103, maxLat: 28.209, minLon: -16.691, maxLon: -16.61 },
        sourceEntryTitle: '38052-VILAFLOR DE CHASNA',
    },
    {
        ine: '38053',
        name: 'Villa de Mazo',
        jurisdictionSlug: 'villa-de-mazo',
        bbox: { minLat: 28.521, maxLat: 28.635, minLon: -17.847, maxLon: -17.747 },
        sourceEntryTitle: '38053-VILLA DE MAZO',
    },
    {
        ine: '38054',
        name: 'El Pinar',
        jurisdictionSlug: 'el-pinar',
        bbox: { minLat: 27.634, maxLat: 27.733, minLon: -18.159, maxLon: -17.957 },
        sourceEntryTitle: '38054-EL PINAR DE EL HIERRO',
    },
]);

/**
 * The other 46 municipalities (88 total minus 41 routable minus 1 Telde) — MULTI-INSTRUMENT, no
 * vigencia source (CANARIAS_MULTI_INSTRUMENT_BLOCKER). Registered with a bbox too: an
 * undeterminable governing instrument is a DIFFERENT honest answer from an unsigned one, not a
 * reason to stay silent and let the parcel fall through to a fabricated estimate.
 */
export const CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES: readonly CanariasMunicipalBboxEntry[] = Object.freeze([
    {
        ine: '35002',
        name: 'Agüimes',
        jurisdictionSlug: 'aguimes',
        bbox: { minLat: 27.847, maxLat: 27.955, minLon: -15.546, maxLon: -15.38 },
        sourceEntryTitle: '35002-AGUIMES',
    },
    {
        ine: '35004',
        name: 'Arrecife',
        jurisdictionSlug: 'arrecife',
        bbox: { minLat: 28.951, maxLat: 29.008, minLon: -13.591, maxLon: -13.514 },
        sourceEntryTitle: '35004-ARRECIFE',
    },
    {
        ine: '35006',
        name: 'Arucas',
        jurisdictionSlug: 'arucas',
        bbox: { minLat: 28.082, maxLat: 28.156, minLon: -15.565, maxLon: -15.484 },
        sourceEntryTitle: '35006-ARUCAS',
    },
    {
        ine: '35009',
        name: 'Gáldar',
        jurisdictionSlug: 'galdar',
        bbox: { minLat: 28.02, maxLat: 28.172, minLon: -15.71, maxLon: -15.616 },
        sourceEntryTitle: '35009-GALDAR',
    },
    {
        ine: '35010',
        name: 'Santa María de Guía de Gran Canaria',
        jurisdictionSlug: 'santa-maria-de-guia-de-gran-canaria',
        bbox: { minLat: 28.038, maxLat: 28.173, minLon: -15.65, maxLon: -15.584 },
        sourceEntryTitle: '35010-SANTA MARIA DE GUIA DE GRAN CA',
    },
    {
        ine: '35011',
        name: 'Haría',
        jurisdictionSlug: 'haria',
        bbox: { minLat: 29.08, maxLat: 29.242, minLon: -13.529, maxLon: -13.418 },
        sourceEntryTitle: '35011-HARIA',
    },
    {
        ine: '35012',
        name: 'Ingenio',
        jurisdictionSlug: 'ingenio',
        bbox: { minLat: 27.901, maxLat: 27.958, minLon: -15.545, maxLon: -15.377 },
        sourceEntryTitle: '35012-INGENIO',
    },
    {
        ine: '35013',
        name: 'Mogán',
        jurisdictionSlug: 'mogan',
        bbox: { minLat: 27.754, maxLat: 27.95, minLon: -15.801, maxLon: -15.658 },
        sourceEntryTitle: '35013-MOGAN',
    },
    {
        ine: '35015',
        name: 'La Oliva',
        jurisdictionSlug: 'la-oliva',
        bbox: { minLat: 28.564, maxLat: 28.768, minLon: -14.045, maxLon: -13.81 },
        sourceEntryTitle: '35015-LA OLIVA',
    },
    {
        ine: '35016',
        name: 'Pájara',
        jurisdictionSlug: 'pajara',
        bbox: { minLat: 28.042, maxLat: 28.408, minLon: -14.51, maxLon: -14.057 },
        sourceEntryTitle: '35016-PAJARA',
    },
    {
        ine: '35017',
        name: 'Las Palmas de Gran Canaria',
        jurisdictionSlug: 'las-palmas-de-gran-canaria',
        bbox: { minLat: 27.841, maxLat: 28.182, minLon: -15.529, maxLon: -15.375 },
        sourceEntryTitle: '35017-LAS PALMAS DE GRAN CANARIA',
    },
    {
        ine: '35018',
        name: 'Puerto del Rosario',
        jurisdictionSlug: 'puerto-del-rosario',
        bbox: { minLat: 28.42, maxLat: 28.578, minLon: -14.091, maxLon: -13.823 },
        sourceEntryTitle: '35018-PUERTO DEL ROSARIO',
    },
    {
        ine: '35019',
        name: 'San Bartolomé',
        jurisdictionSlug: 'san-bartolome',
        bbox: { minLat: 28.941, maxLat: 29.029, minLon: -13.662, maxLon: -13.582 },
        sourceEntryTitle: '35019-SAN BARTOLOME',
    },
    {
        ine: '35020',
        name: 'San Bartolomé de Tirajana',
        jurisdictionSlug: 'san-bartolome-de-tirajana',
        bbox: { minLat: 27.734, maxLat: 27.967, minLon: -15.681, maxLon: -15.427 },
        sourceEntryTitle: '35020-SAN BARTOLOME DE TIRAJANA',
    },
    {
        ine: '35021',
        name: 'La Aldea de San Nicolás',
        jurisdictionSlug: 'la-aldea-de-san-nicolas',
        bbox: { minLat: 27.858, maxLat: 28.033, minLon: -15.836, maxLon: -15.734 },
        sourceEntryTitle: '35021-LA ALDEA DE SAN NICOLAS',
    },
    {
        ine: '35023',
        name: 'Santa Lucía de Tirajana',
        jurisdictionSlug: 'santa-lucia-de-tirajana',
        bbox: { minLat: 27.805, maxLat: 27.95, minLon: -15.558, maxLon: -15.408 },
        sourceEntryTitle: '35023-SANTA LUCIA DE TIRAJANA',
    },
    {
        ine: '35024',
        name: 'Teguise',
        jurisdictionSlug: 'teguise',
        bbox: { minLat: 28.98, maxLat: 29.418, minLon: -13.655, maxLon: -13.446 },
        sourceEntryTitle: '35024-TEGUISE',
    },
    {
        ine: '35027',
        name: 'Teror',
        jurisdictionSlug: 'teror',
        bbox: { minLat: 28.024, maxLat: 28.101, minLon: -15.57, maxLon: -15.503 },
        sourceEntryTitle: '35027-TEROR',
    },
    {
        ine: '35028',
        name: 'Tias',
        jurisdictionSlug: 'tias',
        bbox: { minLat: 28.916, maxLat: 29.008, minLon: -13.708, maxLon: -13.604 },
        sourceEntryTitle: '35028-TIAS',
    },
    {
        ine: '35030',
        name: 'Tuineje',
        jurisdictionSlug: 'tuineje',
        bbox: { minLat: 28.187, maxLat: 28.379, minLon: -14.161, maxLon: -13.921 },
        sourceEntryTitle: '35030-TUINEJE',
    },
    {
        ine: '35034',
        name: 'Yaiza',
        jurisdictionSlug: 'yaiza',
        bbox: { minLat: 28.837, maxLat: 29.038, minLon: -13.883, maxLon: -13.698 },
        sourceEntryTitle: '35034-YAIZA',
    },
    {
        ine: '38001',
        name: 'Adeje',
        jurisdictionSlug: 'adeje',
        bbox: { minLat: 28.065, maxLat: 28.215, minLon: -16.803, maxLon: -16.658 },
        sourceEntryTitle: '38001-ADEJE',
    },
    {
        ine: '38005',
        name: 'Arico',
        jurisdictionSlug: 'arico',
        bbox: { minLat: 28.093, maxLat: 28.289, minLon: -16.601, maxLon: -16.421 },
        sourceEntryTitle: '38005-ARICO',
    },
    {
        ine: '38006',
        name: 'Arona',
        jurisdictionSlug: 'arona',
        bbox: { minLat: 27.997, maxLat: 28.12, minLon: -16.739, maxLon: -16.636 },
        sourceEntryTitle: '38006-ARONA',
    },
    {
        ine: '38008',
        name: 'Breña Alta',
        jurisdictionSlug: 'brena-alta',
        bbox: { minLat: 28.614, maxLat: 28.69, minLon: -17.837, maxLon: -17.765 },
        sourceEntryTitle: '38008-BREÑA ALTA',
    },
    {
        ine: '38009',
        name: 'Breña Baja',
        jurisdictionSlug: 'brena-baja',
        bbox: { minLat: 28.596, maxLat: 28.665, minLon: -17.843, maxLon: -17.752 },
        sourceEntryTitle: '38009-BREÑA BAJA',
    },
    {
        ine: '38011',
        name: 'Candelaria',
        jurisdictionSlug: 'candelaria',
        bbox: { minLat: 28.337, maxLat: 28.416, minLon: -16.449, maxLon: -16.336 },
        sourceEntryTitle: '38011-CANDELARIA',
    },
    {
        ine: '38015',
        name: 'Garachico',
        jurisdictionSlug: 'garachico',
        bbox: { minLat: 28.27, maxLat: 28.382, minLon: -16.798, maxLon: -16.701 },
        sourceEntryTitle: '38015-GARACHICO',
    },
    {
        ine: '38017',
        name: 'Granadilla de Abona',
        jurisdictionSlug: 'granadilla-de-abona',
        bbox: { minLat: 28.024, maxLat: 28.22, minLon: -16.624, maxLon: -16.48 },
        sourceEntryTitle: '38017-GRANADILLA DE ABONA',
    },
    {
        ine: '38019',
        name: 'Guia de Isora',
        jurisdictionSlug: 'guia-de-isora',
        bbox: { minLat: 28.155, maxLat: 28.276, minLon: -16.842, maxLon: -16.673 },
        sourceEntryTitle: '38019-GUIA DE ISORA',
    },
    {
        ine: '38020',
        name: 'Güímar',
        jurisdictionSlug: 'guimar',
        bbox: { minLat: 28.232, maxLat: 28.338, minLon: -16.512, maxLon: -16.358 },
        sourceEntryTitle: '38020-GUIMAR',
    },
    {
        ine: '38022',
        name: 'Icod de los Vinos',
        jurisdictionSlug: 'icod-de-los-vinos',
        bbox: { minLat: 28.269, maxLat: 28.397, minLon: -16.746, maxLon: -16.632 },
        sourceEntryTitle: '38022-ICOD DE LOS VINOS',
    },
    {
        ine: '38023',
        name: 'San Cristóbal de La Laguna',
        jurisdictionSlug: 'san-cristobal-de-la-laguna',
        bbox: { minLat: 28.43, maxLat: 28.58, minLon: -16.412, maxLon: -16.266 },
        sourceEntryTitle: '38023-SAN CRISTOBAL DE LA LAGUNA',
    },
    {
        ine: '38024',
        name: 'Los Llanos de Aridane',
        jurisdictionSlug: 'los-llanos-de-aridane',
        bbox: { minLat: 28.55, maxLat: 28.676, minLon: -17.939, maxLon: -17.874 },
        sourceEntryTitle: '38024-LOS LLANOS DE ARIDANE',
    },
    {
        ine: '38026',
        name: 'La Orotava',
        jurisdictionSlug: 'la-orotava',
        bbox: { minLat: 28.198, maxLat: 28.425, minLon: -16.687, maxLon: -16.461 },
        sourceEntryTitle: '38026-LA OROTAVA',
    },
    {
        ine: '38027',
        name: 'El Paso',
        jurisdictionSlug: 'el-paso',
        bbox: { minLat: 28.551, maxLat: 28.763, minLon: -17.93, maxLon: -17.821 },
        sourceEntryTitle: '38027-EL PASO',
    },
    {
        ine: '38028',
        name: 'Puerto de la Cruz',
        jurisdictionSlug: 'puerto-de-la-cruz',
        bbox: { minLat: 28.389, maxLat: 28.422, minLon: -16.571, maxLon: -16.519 },
        sourceEntryTitle: '38028-PUERTO DE LA CRUZ',
    },
    {
        ine: '38031',
        name: 'Los Realejos',
        jurisdictionSlug: 'los-realejos',
        bbox: { minLat: 28.31, maxLat: 28.408, minLon: -16.628, maxLon: -16.555 },
        sourceEntryTitle: '38031-LOS REALEJOS',
    },
    {
        ine: '38032',
        name: 'El Rosario',
        jurisdictionSlug: 'el-rosario',
        bbox: { minLat: 28.395, maxLat: 28.47, minLon: -16.408, maxLon: -16.307 },
        sourceEntryTitle: '38032-EL ROSARIO',
    },
    {
        ine: '38035',
        name: 'San Miguel de Abona',
        jurisdictionSlug: 'san-miguel-de-abona',
        bbox: { minLat: 28.008, maxLat: 28.132, minLon: -16.645, maxLon: -16.596 },
        sourceEntryTitle: '38035-SAN MIGUEL DE ABONA',
    },
    {
        ine: '38036',
        name: 'San Sebastián de La Gomera',
        jurisdictionSlug: 'san-sebastian-de-la-gomera',
        bbox: { minLat: 28.028, maxLat: 28.159, minLon: -17.243, maxLon: -17.097 },
        sourceEntryTitle: '38036-SAN SEBASTIAN DE LA GOMERA',
    },
    {
        ine: '38037',
        name: 'Santa Cruz de la Palma',
        jurisdictionSlug: 'santa-cruz-de-la-palma',
        bbox: { minLat: 28.669, maxLat: 28.741, minLon: -17.848, maxLon: -17.751 },
        sourceEntryTitle: '38037-SANTA CRUZ DE LA PALMA',
    },
    {
        ine: '38039',
        name: 'Santa Úrsula',
        jurisdictionSlug: 'santa-ursula',
        bbox: { minLat: 28.371, maxLat: 28.442, minLon: -16.51, maxLon: -16.44 },
        sourceEntryTitle: '38039-SANTA URSULA',
    },
    {
        ine: '38043',
        name: 'Tacoronte',
        jurisdictionSlug: 'tacoronte',
        bbox: { minLat: 28.43, maxLat: 28.528, minLon: -16.432, maxLon: -16.372 },
        sourceEntryTitle: '38043-TACORONTE',
    },
    {
        ine: '38048',
        name: 'Valverde',
        jurisdictionSlug: 'valverde',
        bbox: { minLat: 27.69, maxLat: 27.851, minLon: -18.03, maxLon: -17.879 },
        sourceEntryTitle: '38048-VALVERDE',
    },
    {
        ine: '38038',
        dgcCode: '38900',
        name: 'Santa Cruz de Tenerife',
        jurisdictionSlug: 'santa-cruz-de-tenerife',
        bbox: { minLat: 28.409, maxLat: 28.595, minLon: -16.348, maxLon: -16.117 },
        sourceEntryTitle: '38900-SANTA CRUZ DE TENERIFE',
    },
]);
