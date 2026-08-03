// CATALUNYA — the pure reader for ACA's *espais fluvials* attribute schema, shared VERBATIM by
// `AIGUA_ZFP` (Zona de Flux Preferent) and `AIGUA_DPH` (Domini Públic Hidràulic).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE SOURCE IS — live-probed 2026-08-03, this session
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `sig.gencat.cat/ows/AIGUA/wms` (ACA — Agència Catalana de l'Aigua) is a public, keyless
// GeoServer-family WMS/WFS pair, GetCapabilities-confirmed live (674 layers). The SAME service
// also answers WFS 2.0.0 at `sig.gencat.cat/ows/AIGUA/wfs` — `GetCapabilities`,
// `DescribeFeatureType` and `GetFeature` all confirmed live, all returning real features. WFS was
// used for extraction here rather than WMS `GetFeatureInfo`, because GetFeatureInfo needs a pixel
// that already lands inside a (frequently metres-wide) river-corridor polygon — a coin flip
// without knowing the polygon first — while WFS answers a `BBOX` filter directly.
//
// ⚠ THE NATIVE CRS IS `EPSG:25831` (ETRS89 / UTM zone 31N), NOT `EPSG:4326`. Both layers ALSO
// publish `CRS:84`, `EPSG:23031`, `EPSG:3857` and `EPSG:4326` — but `EPSG:4326` under WMS 1.3.0 /
// WFS 2.0.0 strict axis order is **(lat, lon)**, confirmed from the layer's own
// `EX_GeographicBoundingBox` (`minx=39.71…` — that is a LATITUDE in the `minx` slot). Requesting
// `SRSNAME=EPSG:4326` on `GetFeature` DOES reproject correctly (verified — see the fixture), so the
// resolver in `resolveCatalunyaFloodOverlay.ts` asks for that directly rather than converting UTM
// itself, exactly as `resolveBalearsMuib.ts` never carries its own projection math either.
//
// ⭐ BOTH LAYERS SHARE ONE ATTRIBUTE SCHEMA, VERIFIED BYTE-FOR-BYTE VIA `DescribeFeatureType` ON
// BOTH TYPENAMES: `SHAPE, ID_ES, ID_P, DATA_MODIF, HISTORIA, CODI, Q, KM, NOM_AA, NOM_AV, ARPSI,
// OBJECTID` — same names, same types, same order (ZFP lists `ID_ES` before `ID_P`; DPH lists
// `CODI` before `ID_P`; that is the ONLY difference, and it is element ORDER in the XSD sequence,
// not a schema difference — this reader does not depend on ordering).
//
// ⛔ NO FIELD CARRIES A LEGAL-CATEGORY LABEL. "Is this ZFP or DPH" is answered by WHICH LAYER
// (WFS `TYPENAMES`) the feature came from, never by an attribute on the feature itself — the two
// endpoints are the only place that distinction lives, so the resolver must never merge features
// from both layers into one untyped bag before this fact is captured.
//
// FIELD MEANINGS (from the live payload — a real ZFP feature and a real DPH feature at the Besòs
// river mouth, Sant Adrià de Besòs, both cited `ARPSI=ES100060`, committed verbatim in
// `__tests__/fixtures/catalunya-aigua-besos-zfp-dph.json`):
//   - `ID_ES`     the *espai fluvial* delimitation study id, e.g. `ZH060_201908_001` — encodes the
//                 river code (`060`), the study's YYYYMM, and a sequence — NOT a stable per-parcel
//                 key across re-delimitations (a re-study changes the trailing token, C-DATA-HONESTY).
//   - `ID_P`      an internal project id on the delimitation study (`840`, `251`, …). Opaque.
//   - `DATA_MODIF`the delimitation's last-modified ISO datetime — the ONLY currency signal this
//                 schema publishes. There is no validity-interval pair like Balears' DINIVIGEN/
//                 DFIVIGEN, so "supersession" cannot be detected the way it is there.
//   - `HISTORIA`  a URL to a PDF *fitxa* of the delimitation study metadata (ACA's per-study
//                 record). Mirrors Balears `URL`→fitxa, but this draft does NOT fetch or parse it
//                 (out of scope here — §MISSING_CONSTRAINTS records that as a stated gap).
//   - `CODI`      the river/reach code (`060` = Besòs, `700`/`618` = other reaches seen live).
//   - `Q`         a hydraulic flow figure in m³/s where published (`444.3` on the DPH sample);
//                 `0` is COMMON and is NOT evidence of zero flow — many delimitation polygons
//                 (junction pieces, small tributary stubs) simply do not carry this value.
//   - `KM`        a river-km marker along the reach; `0` has the same "not populated" caveat as `Q`.
//   - `NOM_AA` / `NOM_AV` free-text upstream/downstream reference (e.g. `"Confluència amb riu
//                 Ripoll"` / `"Desembocadura a mar"`). Observed BLANK (a single space, not empty
//                 string) on many ZFP records — never assume non-blank.
//   - `ARPSI`     the EU Floods Directive (2007/60/CE) *Àrea de Risc Potencial Significatiu
//                 d'Inundació* code this delimitation belongs to, e.g. `ES100060` for the Besòs.
//                 This IS a legally meaningful cross-reference (SFRA membership), even though it is
//                 not a category label for ZFP-vs-DPH.
//   - `OBJECTID`  the layer-internal numeric feature id. Stable WITHIN one publication of the
//                 layer; not guaranteed stable across a re-publish (same caveat as `ID_ES`).
//
// PURITY: this file touches no network, no THREE, no DOM — the WFS response body is handed in.
// The impure fetch lives in `resolveCatalunyaFloodOverlay.ts` (C58 §1.9 injected-fetch seam).

/** The two live-probed layers this reader understands. `ZI` is a documented gap — see the resolver. */
export type CatalunyaEspaiFluvialLayer = 'AIGUA_ZFP' | 'AIGUA_DPH';

/** The verbatim ACA *espai fluvial* attributes. Field names are the source's own. */
export interface CatalunyaEspaiFluvialFeature {
    /** GeoJSON top-level feature id, e.g. `"AIGUA_ZFP.2025"`. Null when the bag carries none. */
    readonly gmlId: string | null;
    readonly ID_ES: string | null;
    readonly ID_P: string | null;
    /** ISO datetime string, verbatim — not parsed to a `Date` here (that is a resolver decision). */
    readonly DATA_MODIF: string | null;
    /** URL to the delimitation study's PDF fitxa. Not fetched by this reader. */
    readonly HISTORIA: string | null;
    readonly CODI: string | null;
    readonly Q: number | null;
    readonly KM: number | null;
    /** ⚠ Observed as a single space (`" "`), not an empty string, when unpublished. Not trimmed here. */
    readonly NOM_AA: string | null;
    readonly NOM_AV: string | null;
    /** EU Floods Directive SFRA code, e.g. `ES100060`. */
    readonly ARPSI: string | null;
    readonly OBJECTID: number | null;
}

function str(bag: Record<string, unknown>, key: string): string | null {
    const v = bag[key];
    if (typeof v === 'string') return v.length === 0 ? null : v; // NOT trimmed — see NOM_AA caveat.
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

function num(bag: Record<string, unknown>, key: string): number | null {
    const v = bag[key];
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Read one WFS GeoJSON `Feature` (the `OUTPUTFORMAT=application/json` shape this reader was built
 * and tested against) into the verbatim attribute record. PURE. Returns `null` when the input
 * carries no usable properties bag at all — never throws on a malformed feature.
 *
 * ⚠ Accepts a bare `properties`-shaped bag too (mirrors `readBalearsZoningFeature`'s tolerance),
 * so a future GML/ArcGIS-shaped source does not require a second reader.
 */
export function readCatalunyaEspaiFluvialFeature(
    feature: unknown,
): CatalunyaEspaiFluvialFeature | null {
    if (!feature || typeof feature !== 'object') return null;
    const raw = feature as { id?: unknown; properties?: unknown };
    const bag =
        (raw.properties && typeof raw.properties === 'object' ? raw.properties : null) ??
        (feature as Record<string, unknown>);
    const b = bag as Record<string, unknown>;

    const rec: CatalunyaEspaiFluvialFeature = {
        gmlId: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null,
        ID_ES: str(b, 'ID_ES'),
        ID_P: str(b, 'ID_P'),
        DATA_MODIF: str(b, 'DATA_MODIF'),
        HISTORIA: str(b, 'HISTORIA'),
        CODI: str(b, 'CODI'),
        Q: num(b, 'Q'),
        KM: num(b, 'KM'),
        NOM_AA: str(b, 'NOM_AA'),
        NOM_AV: str(b, 'NOM_AV'),
        ARPSI: str(b, 'ARPSI'),
        OBJECTID: num(b, 'OBJECTID'),
    };
    // A row with none of the identifying fields is not a usable feature (mirrors the Balears reader's
    // "carries no usable zone identity" guard).
    if (rec.gmlId === null && rec.ID_ES === null && rec.OBJECTID === null) return null;
    return rec;
}

/**
 * Read every feature in a WFS `FeatureCollection`-shaped body (or a bare array of features). PURE.
 * Unreadable rows are DROPPED, not thrown on — a body containing one malformed feature among many
 * good ones should not lose the good ones (same posture as `resolveBalearsMuib`'s `.filter`).
 */
export function readCatalunyaEspaiFluvialFeatureCollection(
    body: unknown,
): readonly CatalunyaEspaiFluvialFeature[] {
    const arr =
        body && typeof body === 'object' && Array.isArray((body as { features?: unknown }).features)
            ? ((body as { features: unknown[] }).features)
            : Array.isArray(body)
              ? (body as unknown[])
              : [];
    return arr
        .map(readCatalunyaEspaiFluvialFeature)
        .filter((f): f is CatalunyaEspaiFluvialFeature => f !== null);
}
