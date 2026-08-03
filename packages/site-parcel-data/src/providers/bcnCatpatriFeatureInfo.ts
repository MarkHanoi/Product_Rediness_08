// BARCELONA — the `WMSCATPATRI` (Catàleg de patrimoni) GetFeatureInfo response parser. PURE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE SOURCE IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `w133.bcn.cat/WMSCATPATRI/service.svc/get` — a live, keyless municipal WMS (Hexagon/Intergraph
// GeoMedia WebMap), `GetCapabilities` verified 200/14,608B, 20 layers, publishing Barcelona's
// heritage catalogue under Llei 9/1993 (del Patrimoni Cultural Català) Art. 7-8 (statutory
// categories) and Art. 35/36 (protection-buffer instruments — legal basis established upstream
// this session, cited here, not re-derived).
//
// ⛔ THIS SERVICE IS WMS-ONLY. `SERVICE=WFS` on this endpoint returns
// `ServiceException code="InvalidParameterValue" locator="service"` — there is no WFS/
// `DescribeFeatureType` fallback. `DescribeLayer` also fails (`MissingParameterValue
// locator="sld_version"` — this server's `DescribeLayer` requires an SLD version it is never
// worth supplying just to learn a schema `GetFeatureInfo` already gives us). The schema below was
// read the only way this service offers: a live `GetFeatureInfo` at a point known to intersect a
// BCIN feature (Barcelona Cathedral, Barri Gòtic), verified against Capabilities' own layer names.
//
// ⭐ `GetCapabilities` DECLARES **EVERY LAYER `queryable="0"`.** That did not stop `GetFeatureInfo`
// from answering — Hexagon's WMS implementation answers `GetFeatureInfo` for point/polygon
// sublayers regardless of the advertised `queryable` flag, which is why the three declared
// `INFO_FORMAT`s were tried in order until one worked. Two of the three failed outright, not with
// an empty answer:
//   • `text/plain` → `ServiceException code="InvalidFormat"` (never advertised — REST wasn't the
//     issue, the FORMAT was).
//   • `text/xml` and `application/gml+xml; version=3.1` **both succeeded, and returned
//     byte-identical bodies** — this server does not vary its `GetFeatureInfo` output by
//     `INFO_FORMAT` beyond accepting the three it advertises (`text/xml`, `text/html`,
//     `application/gml+xml; version=3.1` — `text/html` was not exercised).
//
// The EARLIER empty `FeatureCollection` (Sagrada Família, and a first attempt at the Cathedral
// bbox) was the call SHAPE, confirmed two ways: (1) `GetMap` over the same layer at the Cathedral
// bbox rendered a real building-footprint polygon (44,911-byte PNG, not a blank tile) proving
// features exist and the layer/bbox/CRS were right; (2) re-querying `GetFeatureInfo` at a pixel
// (`I`/`J`) verified BY THAT RENDER to sit inside the polygon returned a feature immediately. The
// earlier misses had picked an `I`/`J` that, at that BBOX/WIDTH/HEIGHT, fell outside every
// polygon — an aim problem, not a data or format problem.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ONE HARD LIMIT: GetFeatureInfo NEVER RETURNS GEOMETRY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The response is Hexagon's own pseudo-GML (`xmlns="http://www.intergraph.com/geomedia/gml"`,
// NOT real `gml:` feature content beyond the wrapper) and carries `<Attribute>` name/value pairs
// ONLY — no `<gml:Polygon>`, no coordinate list, in ANY of the formats tried, including the
// nominally-geometric `application/gml+xml; version=3.1`. `GetMap` proves the layer draws real
// polygons (verified visually at the Cathedral), but this WMS has no channel that hands the ring
// back to a caller — point-in-polygon is evaluated SERVER-SIDE and only the attribute bag returns.
// Consequently a `BarcelonaHeritageOverlayFeature` (see the resolver) can answer "is this point
// inside a protected asset / buffer, and what does the catalogue say about it" — it CANNOT carry a
// drawable boundary. Downstream code must not assume otherwise.
//
// PURITY (C58 §1.9): given the same XML this module returns byte-identical output. No I/O, no
// `DOMParser` (tag-boundary tokenising, the same technique `balearsMuibFitxa.ts` uses for HTML),
// so it runs identically in the browser, in Node and in a test.

/** One `<Attribute Name="...">value</Attribute>` pair, exactly as printed (only XML-entity-decoded). */
export interface BcnCatpatriRawFeature {
    /** The `Layer Name="..."` this feature came from — the source's own layer identifier. */
    readonly layerName: string;
    /** Every `Attribute` on the feature, verbatim (only XML-entity-decoded), in source order. */
    readonly attributes: Readonly<Record<string, string>>;
}

function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Parse a `WMSCATPATRI` `GetFeatureInfo` response (verified byte-identical for `text/xml` and
 * `application/gml+xml; version=3.1`; `text/html` untested) into raw layer/attribute-bag
 * features. PURE — no DOM parser, tag-boundary regex only.
 *
 * Tolerant by construction: a malformed or truncated body yields `[]` rather than throwing, so a
 * transport-level corruption reads as "nothing parsed", never a crash. The caller (the resolver)
 * decides whether an empty parse means "no heritage here" or "the parser could not read it" using
 * the raw body length / a `ServiceException` sniff (`bcnCatpatriIsServiceException`) — this
 * function's job is only the parse.
 */
export function parseBcnCatpatriFeatureInfo(xml: string): BcnCatpatriRawFeature[] {
    if (typeof xml !== 'string' || xml.length === 0) return [];
    const out: BcnCatpatriRawFeature[] = [];
    const memberRe = /<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g;
    let memberMatch: RegExpExecArray | null;
    while ((memberMatch = memberRe.exec(xml)) !== null) {
        const memberBody = memberMatch[1] ?? '';
        const layerRe = /<Layer\s+Name="([^"]*)">([\s\S]*?)<\/Layer>/g;
        let layerMatch: RegExpExecArray | null;
        while ((layerMatch = layerRe.exec(memberBody)) !== null) {
            const layerName = decodeXmlEntities(layerMatch[1] ?? '');
            const body = layerMatch[2] ?? '';
            const attributes: Record<string, string> = {};
            const attrRe = /<Attribute\s+Name="([^"]*)"\s*(?:\/>|>([\s\S]*?)<\/Attribute>)/g;
            let attrMatch: RegExpExecArray | null;
            while ((attrMatch = attrRe.exec(body)) !== null) {
                const name = decodeXmlEntities(attrMatch[1] ?? '');
                const value = decodeXmlEntities(attrMatch[2] ?? '');
                attributes[name] = value;
            }
            out.push({ layerName, attributes });
        }
    }
    return out;
}

/**
 * Does this raw body carry an OGC `ServiceException` (bad request shape — LAYERS/FORMAT/etc.
 * rejected) rather than an empty-but-valid `FeatureCollection`? The two must never be read the
 * same way: a `ServiceException` is `endpoint-unreachable`-flavoured (the call was malformed, not
 * "no heritage here"); a well-formed empty `FeatureCollection` is a real negative.
 */
export function bcnCatpatriIsServiceException(xml: string): boolean {
    return typeof xml === 'string' && xml.includes('ServiceException');
}

/** Trim to `null` on empty — the house convention for "printed but blank" (`balearsMuibFitxa.ts`, `resolveBalearsMuib.ts`). */
function strOrNull(v: string | undefined): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
}

/**
 * `NIVELL` — the statutory category letter this catalogue prints DIRECTLY on the feature (verified
 * live: `A` on `Poligon_de_bé_cultural_d_interès_nacional__A_` at Barcelona Cathedral; `B` on
 * `Polígon_d_entorn_de_protecció_A` for an *entorn B* buffer). Closed to the five letters Llei
 * 9/1993 Art. 7-8 defines; anything else refuses to `null` rather than guessing.
 */
export type BcnHeritageStatutoryLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export function bcnHeritageStatutoryLetter(nivell: string | null): BcnHeritageStatutoryLetter | null {
    if (nivell === null) return null;
    const t = nivell.trim().toUpperCase();
    return t === 'A' || t === 'B' || t === 'C' || t === 'D' || t === 'E' ? t : null;
}

/**
 * The verbatim protected-asset attribute bag — field names are the SOURCE's own, read from the
 * live `Poligon_de_bé_cultural_d_interès_nacional__A_` (BCIN) feature. Structurally identical
 * `Poligon_de_bé_...` sublayers exist for B (`_local__B_`) and C (`_urbanístic__C_`) per
 * `GetCapabilities`' own layer tree — ⚠ THIS SHAPE IS ASSUMED FOR B/C BY SOURCE-FAMILY SYMMETRY
 * (same WMS, same `Poligon_de_bé_...` naming convention, same Hexagon attribute-bag transport),
 * NOT independently re-verified with a live B/C feature this session. D
 * (`Bé_d_interès_documental__D_`) and E (`Establiment_emblemàtic__E_`) carry NO `Poligon_de_...`
 * sublayer at all in Capabilities — they are POINT-only layers in this service, and their
 * attribute schema is UNVERIFIED (not queried this session; out of scope).
 */
export interface BcnHeritageAssetFeature {
    /** Internal numeric row id (verified: `"10541"` at the Cathedral). Distinct from `IDENTIFICA`. */
    readonly id: string | null;
    /** The catalogue's public entry number (verified: `"3053"` — Barcelona Cathedral). */
    readonly identifica: string | null;
    /** Two-digit district code (verified: `"01"` — Ciutat Vella). */
    readonly districte: string | null;
    /** The asset's name, as printed (verified, untrimmed source has a trailing space: `"CATEDRAL "`). */
    readonly denomin: string | null;
    readonly autor: string | null;
    readonly epoca: string | null;
    readonly estil: string | null;
    readonly usOrig: string | null;
    readonly usActual: string | null;
    readonly fotografi: string | null;
    readonly planols: string | null;
    readonly propietat: string | null;
    readonly descripcio: string | null;
    /** The catalogue's own protection régime / intervention text — the legally operative field. */
    readonly interven: string | null;
    /** ⭐ THE STATUTORY CATEGORY, verbatim (`"A"` at the Cathedral). See `bcnHeritageStatutoryLetter`. */
    readonly nivell: string | null;
}

/** Read one `Poligon_de_bé_...` (A/B/C-family) attribute bag into the typed record. PURE. */
export function readBcnHeritageAssetFeature(raw: BcnCatpatriRawFeature): BcnHeritageAssetFeature {
    const a = raw.attributes;
    return {
        id: strOrNull(a['ID']),
        identifica: strOrNull(a['IDENTIFICA']),
        districte: strOrNull(a['DISTRICTE']),
        denomin: strOrNull(a['DENOMIN']),
        autor: strOrNull(a['AUTOR']),
        epoca: strOrNull(a['EPOCA']),
        estil: strOrNull(a['ESTIL']),
        usOrig: strOrNull(a['US_ORIG']),
        usActual: strOrNull(a['US_ACTUAL']),
        fotografi: strOrNull(a['FOTOGRAFI']),
        planols: strOrNull(a['PLANOLS']),
        propietat: strOrNull(a['PROPIETAT']),
        descripcio: strOrNull(a['DESCRIPCIO']),
        interven: strOrNull(a['INTERVEN']),
        nivell: strOrNull(a['NIVELL']),
    };
}

/**
 * The verbatim protection-buffer attribute bag — field names are the source's own, read from the
 * live `Polígon_d_entorn_de_protecció_A` feature at the Cathedral (3 overlapping buffers returned:
 * *"CONJUNT ESPECIAL DEL SECTOR DE LA MURALLA ROMANA"* and two named *entorns*). Structurally the
 * `Polígon_de_conjunt_protegit` sibling layer is ASSUMED identical by source-family symmetry
 * (same group `Conjunt_o_entorn_protegit`, same transport) — not independently verified.
 */
export interface BcnHeritageBufferFeature {
    /** ⚠ NOT numeric here — verified format is a GeoMedia row GUID (`"AAQ9MPAB5AAAAq0AAF"`). */
    readonly id: string | null;
    readonly identifica: string | null;
    readonly districte: string | null;
    /** Present in the schema, empty on all 3 live rows this session. */
    readonly tipus: string | null;
    readonly denomin: string | null;
    readonly interven: string | null;
    /** ⭐ Statutory category the BUFFER carries (verified: `"B"` on all 3 live rows). */
    readonly nivell: string | null;
    /** ⭐ Buffer-specific: the *entorn* letter, when this row IS an *entorn* (verified: `"B"`, `""` on the *conjunt* row). */
    readonly tipEntorn: string | null;
}

/** Read one `Polígon_d_entorn_de_protecció_A` / `Polígon_de_conjunt_protegit` bag. PURE. */
export function readBcnHeritageBufferFeature(raw: BcnCatpatriRawFeature): BcnHeritageBufferFeature {
    const a = raw.attributes;
    return {
        id: strOrNull(a['ID']),
        identifica: strOrNull(a['IDENTIFICA']),
        districte: strOrNull(a['DISTRICTE']),
        tipus: strOrNull(a['TIPUS']),
        denomin: strOrNull(a['DENOMIN']),
        interven: strOrNull(a['INTERVEN']),
        nivell: strOrNull(a['NIVELL']),
        tipEntorn: strOrNull(a['TIP_ENTORN']),
    };
}
