// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — DATASET DISCOVERY · PURE PARSERS FOR SERVICE CAPABILITIES
//
// Pure string → object. No fetch. Every parser here is exercised in the test suite against BYTES
// CAPTURED FROM THE REAL SERVICES (`fixtures/`), which is what lets the whole tool run offline in CI
// and still be honest about what real publishers emit.
//
// WHY A HAND-ROLLED SCANNER AND NOT AN XML LIBRARY
//   • zero new dependencies in a `tools/` script (matches `tools/city-completion/`);
//   • capabilities documents are machine-generated and extremely regular;
//   • and the failure mode we care about is a SERVER that answers strangely, which a tolerant
//     scanner surfaces as a parse gap rather than an exception that loses the whole probe.
//
// ⚠ A PARSE GAP IS A GAP, NOT AN EMPTY. `parseWfsCapabilities` on a body it does not recognise
// returns `{ ok: false, reason }` — never `{ layers: [] }`. The two are different facts and the
// corpus has been burned four times by code that conflated them (L-422/457/467/469).
// ─────────────────────────────────────────────────────────────────────────────

/** Strip a namespace prefix from a tag name for matching: `wfs:FeatureType` → `FeatureType`. */
function tagRe(tag, flags = 'g') {
    return new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?${tag}>`, flags);
}
function firstText(xml, tag) {
    const m = tagRe(tag, '').exec(xml);
    return m ? decodeXml(m[1].trim()) : null;
}
function allText(xml, tag) {
    return [...xml.matchAll(tagRe(tag))].map((m) => decodeXml(m[1].trim()));
}
function decodeXml(s) {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, '&');
}
function nums(s) {
    return (s || '').trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
}
/**
 * The SERVICE version, read off the capabilities ROOT ELEMENT.
 * ⚠ A bare /version="([\d.]+)"/ matches the XML declaration `<?xml version="1.0"?>` first and
 * reports every service as version 1.0. Caught by the fixture test.
 */
function rootVersion(xml, rootTag) {
    const m = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${rootTag}\\b[^>]*?\\sversion\\s*=\\s*"([\\d.]+)"`).exec(xml);
    return m ? m[1] : null;
}

/**
 * WFS 1.0/1.1/2.0 GetCapabilities → the layer inventory.
 * WFS 2.0 publishes `ows:WGS84BoundingBox` (already lon/lat WGS84); WFS 1.0 publishes
 * `LatLongBoundingBox` (also WGS84, attribute form). Both handled.
 */
export function parseWfsCapabilities(xml, endpoint) {
    if (typeof xml !== 'string' || !/WFS_Capabilities/i.test(xml)) {
        return { ok: false, reason: 'body is not a WFS capabilities document', bodyHead: String(xml ?? '').slice(0, 200) };
    }
    const version = rootVersion(xml, 'WFS_Capabilities');
    const title = firstText(xml, 'Title');
    const listBlock = tagRe('FeatureTypeList', '').exec(xml)?.[1] ?? '';
    const blocks = [...listBlock.matchAll(tagRe('FeatureType'))].map((m) => m[1]);
    const layers = blocks.map((b) => {
        const name = firstText(b, 'Name');
        const wgs = tagRe('WGS84BoundingBox', '').exec(b)?.[1];
        let bboxWgs84 = null;
        if (wgs) {
            const lc = nums(firstText(wgs, 'LowerCorner'));
            const uc = nums(firstText(wgs, 'UpperCorner'));
            if (lc.length === 2 && uc.length === 2) bboxWgs84 = [lc[0], lc[1], uc[0], uc[1]];
        } else {
            const ll = /<(?:[A-Za-z0-9_.-]+:)?LatLongBoundingBox\b([^>]*)\/?>/.exec(b)?.[1];
            if (ll) {
                const g = (k) => Number(new RegExp(`${k}\\s*=\\s*"([^"]+)"`).exec(ll)?.[1]);
                const v = [g('minx'), g('miny'), g('maxx'), g('maxy')];
                if (v.every(Number.isFinite)) bboxWgs84 = v;
            }
        }
        return {
            name,
            title: firstText(b, 'Title'),
            abstract: firstText(b, 'Abstract'),
            keywords: allText(b, 'Keyword'),
            defaultCrs: firstText(b, 'DefaultCRS') ?? firstText(b, 'DefaultSRS') ?? firstText(b, 'SRS'),
            bboxWgs84,
            service: 'WFS',
            endpoint,
        };
    }).filter((l) => l.name);
    return { ok: true, service: 'WFS', version, title, endpoint, layers };
}

/**
 * WMS 1.1/1.3 GetCapabilities → the layer inventory.
 * ⚠ WMS layers nest, and a GROUP layer carries a `<Name>` its WFS does not serve. Córdoba's COACo
 * WMS advertises `areas`, `parcelario_urbanismo`, `actuaciones_tramitado` — all three answer WFS
 * with `Feature type unknown`. They are recorded with `wmsOnly: true` so the machine-readability
 * axis scores them honestly instead of crediting a name that serves no features.
 */
export function parseWmsCapabilities(xml, endpoint) {
    if (typeof xml !== 'string' || !/WMS_Capabilities|WMT_MS_Capabilities/i.test(xml)) {
        return { ok: false, reason: 'body is not a WMS capabilities document', bodyHead: String(xml ?? '').slice(0, 200) };
    }
    const version = rootVersion(xml, 'WMS_Capabilities') ?? rootVersion(xml, 'WMT_MS_Capabilities');
    // Split on the OPENING tags so nesting does not swallow siblings; each layer's own metadata sits
    // between its opening tag and the next opening/closing tag.
    const opens = [...xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?Layer\b([^>]*)>/g)];
    const layers = [];
    for (let i = 0; i < opens.length; i += 1) {
        const start = opens[i].index + opens[i][0].length;
        const end = i + 1 < opens.length ? opens[i + 1].index : xml.length;
        const b = xml.slice(start, end);
        const name = firstText(b, 'Name');
        if (!name) continue; // an unnamed container layer is not requestable
        const ex = tagRe('EX_GeographicBoundingBox', '').exec(b)?.[1];
        let bboxWgs84 = null;
        if (ex) {
            const v = [
                Number(firstText(ex, 'westBoundLongitude')), Number(firstText(ex, 'southBoundLatitude')),
                Number(firstText(ex, 'eastBoundLongitude')), Number(firstText(ex, 'northBoundLatitude')),
            ];
            if (v.every(Number.isFinite)) bboxWgs84 = v;
        } else {
            const ll = /<(?:[A-Za-z0-9_.-]+:)?LatLonBoundingBox\b([^>]*)\/?>/.exec(b)?.[1];
            if (ll) {
                const g = (k) => Number(new RegExp(`${k}\\s*=\\s*"([^"]+)"`).exec(ll)?.[1]);
                const v = [g('minx'), g('miny'), g('maxx'), g('maxy')];
                if (v.every(Number.isFinite)) bboxWgs84 = v;
            }
        }
        layers.push({
            name,
            title: firstText(b, 'Title'),
            abstract: firstText(b, 'Abstract'),
            keywords: allText(b, 'Keyword'),
            defaultCrs: firstText(b, 'CRS') ?? firstText(b, 'SRS'),
            bboxWgs84,
            queryable: /queryable\s*=\s*"1"/.test(opens[i][1]),
            service: 'WMS',
            endpoint,
        });
    }
    return { ok: true, service: 'WMS', version, title: firstText(xml, 'Title'), endpoint, layers };
}

/**
 * ArcGIS REST `?f=json` for a Feature/MapServer.
 * ⚠ THIS IS THE GMU PARSER. `fullExtent` arrives in the SERVICE'S OWN spatial reference, and it was
 * only by reprojecting it that George Mason University was told apart from Gerencia Municipal de
 * Urbanismo. The raw extent AND its CRS are both carried out so `classify.verifyLocality` can do
 * that reprojection — never one without the other.
 */
export function parseArcgisService(json, endpoint) {
    let o = json;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return { ok: false, reason: 'body is not JSON', bodyHead: String(json).slice(0, 200) }; } }
    if (!o || typeof o !== 'object') return { ok: false, reason: 'body is not a JSON object' };
    if (o.error) return { ok: false, reason: `ArcGIS error ${o.error.code}: ${o.error.message}`, arcgisError: o.error };
    if (!Array.isArray(o.layers) && !Array.isArray(o.tables) && !o.currentVersion) {
        return { ok: false, reason: 'JSON object is not an ArcGIS service descriptor' };
    }
    const srs = o.spatialReference?.latestWkid ?? o.spatialReference?.wkid ?? null;
    const fe = o.fullExtent;
    const serviceBboxNative = fe && [fe.xmin, fe.ymin, fe.xmax, fe.ymax].every(Number.isFinite)
        ? [fe.xmin, fe.ymin, fe.xmax, fe.ymax] : null;
    const serviceCrs = fe?.spatialReference?.latestWkid ?? fe?.spatialReference?.wkid ?? srs;
    const layers = (o.layers ?? []).map((l) => ({
        name: `${l.id}:${l.name}`,
        title: l.name,
        abstract: l.description ?? null,
        keywords: [],
        defaultCrs: serviceCrs ? `EPSG:${serviceCrs}` : null,
        bboxNative: serviceBboxNative,
        bboxNativeCrs: serviceCrs ? `EPSG:${serviceCrs}` : null,
        geometryType: l.geometryType ?? null,
        service: 'ArcGIS',
        endpoint,
    }));
    return {
        ok: true, service: 'ArcGIS', version: o.currentVersion ?? null,
        title: o.serviceDescription || o.documentInfo?.Title || null,
        owner: o.owner ?? null, copyright: o.copyrightText ?? null,
        serviceBboxNative, serviceCrs: serviceCrs ? `EPSG:${serviceCrs}` : null,
        endpoint, layers,
    };
}

/** GeoServer/other DescribeFeatureType XSD → typed attributes + the geometry element's type. */
export function parseDescribeFeatureType(xml) {
    if (typeof xml !== 'string' || !/schema|xsd|complexType/i.test(xml)) {
        return { ok: false, reason: 'body is not an XSD schema', bodyHead: String(xml ?? '').slice(0, 200) };
    }
    if (/ExceptionReport|ServiceException/i.test(xml)) {
        return { ok: false, reason: 'service returned an OWS exception', bodyHead: xml.slice(0, 300) };
    }
    const attributes = [...xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?element\b([^>]*)\/?>/g)]
        .map((m) => m[1])
        .map((a) => ({
            name: /\bname\s*=\s*"([^"]+)"/.exec(a)?.[1] ?? null,
            type: /\btype\s*=\s*"([^"]+)"/.exec(a)?.[1] ?? null,
            nillable: /nillable\s*=\s*"true"/.test(a),
        }))
        .filter((a) => a.name && a.type && !/^(?:[A-Za-z0-9_.-]+:)?_?Feature$/.test(a.name));
    const geom = attributes.find((a) => /Geometry|Surface|Curve|Point|Polygon|LineString/i.test(a.type || ''));
    return { ok: true, attributes, geometryType: geom?.type ?? null, geometryAttribute: geom?.name ?? null };
}

/** WFS `resultType=hits` → `numberMatched` / `numberOfFeatures`, or a typed failure. */
export function parseHits(xml) {
    if (typeof xml !== 'string') return { ok: false, reason: 'no body' };
    if (/ExceptionReport|ServiceException/i.test(xml)) {
        const t = firstText(xml, 'ExceptionText') ?? firstText(xml, 'ServiceException') ?? xml.slice(0, 200);
        return { ok: false, reason: `OWS exception: ${t}`, owsException: t };
    }
    const m = /number(?:Matched|OfFeatures)\s*=\s*"([^"]+)"/i.exec(xml);
    if (!m) return { ok: false, reason: 'no numberMatched/numberOfFeatures attribute in the response' };
    if (/unknown/i.test(m[1])) return { ok: false, reason: 'server answered numberMatched="unknown"' };
    const n = Number(m[1]);
    return Number.isFinite(n) ? { ok: true, count: n } : { ok: false, reason: `unparseable count "${m[1]}"` };
}
