// §WMS-GETFEATUREINFO-CONTAINER — the reusable OGC WMS `GetFeatureInfo` point-query seam.
//
// WHAT THIS IS, AND WHY IT IS A SEPARATE FILE
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Cartagena is the first PRYZM jurisdiction whose zoning is published as a plain OGC WMS (not a
// WFS, not ArcGIS REST) — `ide.cartagena.es/wms_RPG0/wmservice.aspx`, a custom `.aspx`
// implementation that is nonetheless OGC-standard-compliant. `GetFeatureInfo` is the WMS
// equivalent of a WFS/ArcGIS point-intersect query: given a pixel inside a rendered map image, the
// server answers with the underlying feature's attributes. This file generalizes that ONE query
// shape (never fetches a rendered image; `INFO_FORMAT` requests GML/text attributes only) so a
// future WMS-only Spanish municipality can reuse it exactly as `containers/arcgisRest.ts` is
// reused for Esri-stack municipalities.
//
// THE ONE WMS-SPECIFIC WRINKLE: `GetFeatureInfo` is defined over a MAP IMAGE (a bbox + a pixel
// width/height + an x/y pixel coordinate inside it), not over a bare coordinate the way a WFS/
// ArcGIS point query is. This container hides that: the caller supplies a WGS84 point and a
// (tiny) query-window half-width; the container builds a 3×3-pixel image window centred on the
// point and queries pixel (1,1) — the centre — so the caller never has to think about map-image
// mechanics.
//
// PURITY: this is the ONE impure boundary (a network fetch); everything else in a caller should
// stay pure. NEVER THROWS from the caller's point of view — a transport/WMS-exception failure
// returns a typed `{ ok: false }` result instead.
//
// Strategic context — `docs/04-reference/jurisdictions/es/es-mc/30016-cartagena/findings/
// CAPABILITY-RESEARCH-2026-08-04.md` §1.2 (the live-tested breakthrough this container exists to
// generalize), C58 §1.4/§1.9/§1.10.

/** One resolved GetFeatureInfo attribute set, parsed from the response's GML/text field list. */
export interface WmsFeatureInfoFeature {
    readonly attributes: Record<string, string>;
}

export interface WmsFeatureInfoOk {
    readonly ok: true;
    readonly features: readonly WmsFeatureInfoFeature[];
}

export interface WmsFeatureInfoError {
    readonly ok: false;
    /** Human-readable transport/WMS-exception failure detail — logged, never rendered as law. */
    readonly detail: string;
}

export type WmsFeatureInfoResult = WmsFeatureInfoOk | WmsFeatureInfoError;

export interface WmsGetFeatureInfoOptions {
    readonly fetchImpl: typeof fetch;
    /** The service root, e.g. `.../wms_RPG0/wmservice.aspx` — no trailing `?`. */
    readonly serviceBase: string;
    readonly layers: string;
    readonly queryLayers: string;
    readonly lat: number;
    readonly lon: number;
    /** The spatial reference the QUERY POINT is expressed in. Default `4326` (WGS84). */
    readonly srs?: number;
    /**
     * Half-width of the synthetic query window, in `srs` UNITS (degrees when `srs` is 4326).
     * Small enough to stay inside one block/parcel, large enough that WMS pixel-snapping does not
     * miss it. Default ≈ 5 m at this latitude.
     */
    readonly halfWidth?: number;
    readonly infoFormat?: string;
    readonly version?: string;
    readonly timeoutMs?: number;
}

/** Parse the handful of GML/XML shapes real-world WMS servers answer with, tag-agnostically. */
function parseFeatures(body: string): readonly WmsFeatureInfoFeature[] {
    const features: WmsFeatureInfoFeature[] = [];
    // Match every `<Name>value</Name>`-shaped leaf tag inside each feature block. Real servers
    // vary their wrapping element name (`gml:featureMember`, `msGMLOutput`, a custom namespace),
    // so this splits on ANY element that itself contains no nested element — a leaf attribute —
    // and groups consecutive leaves between blank lines / feature-boundary markers.
    const blocks = body.split(/<\/?(?:gml:featureMember|msGMLOutput|FIELDS)[^>]*>/i).filter((b) => b.trim());
    for (const block of blocks) {
        const attrs: Record<string, string> = {};
        const leafRe = /<(?:\w+:)?([A-Za-z_][\w.-]*)>([^<]*)<\/(?:\w+:)?\1>/g;
        let m: RegExpExecArray | null;
        while ((m = leafRe.exec(block)) !== null) {
            const [, name, value] = m;
            if (name && value !== undefined) attrs[name] = value.trim();
        }
        if (Object.keys(attrs).length > 0) features.push({ attributes: attrs });
    }
    return features;
}

/**
 * Query an OGC WMS `GetFeatureInfo` at a WGS84 (or `srs`) point. **NEVER THROWS** — every
 * transport failure or WMS exception (`ServiceExceptionReport`) resolves to a typed
 * `{ ok: false, detail }`, never an exception and never silently treated as "no feature here".
 */
export async function queryWmsGetFeatureInfo(
    opts: WmsGetFeatureInfoOptions,
): Promise<WmsFeatureInfoResult> {
    const srs = opts.srs ?? 4326;
    const halfWidth = opts.halfWidth ?? 0.00005;
    const infoFormat = opts.infoFormat ?? 'text/xml';
    const version = opts.version ?? '1.1.1';
    const timeoutMs = opts.timeoutMs ?? 20_000;

    try {
        const bbox = [
            opts.lon - halfWidth,
            opts.lat - halfWidth,
            opts.lon + halfWidth,
            opts.lat + halfWidth,
        ].join(',');
        const url =
            `${opts.serviceBase}?SERVICE=WMS&VERSION=${version}&REQUEST=GetFeatureInfo` +
            `&LAYERS=${encodeURIComponent(opts.layers)}&QUERY_LAYERS=${encodeURIComponent(opts.queryLayers)}` +
            `&SRS=EPSG:${srs}&BBOX=${bbox}&WIDTH=3&HEIGHT=3&X=1&Y=1` +
            `&INFO_FORMAT=${encodeURIComponent(infoFormat)}&FEATURE_COUNT=5`;

        const res = await opts.fetchImpl(url, {
            headers: { Accept: 'application/xml, text/xml, */*' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

        const body = await res.text();
        if (/ServiceExceptionReport|<ServiceException/i.test(body)) {
            const m = /<ServiceException[^>]*>([^<]*)</i.exec(body);
            return { ok: false, detail: `WMS exception: ${m?.[1]?.trim() ?? 'unspecified'}` };
        }
        return { ok: true, features: parseFeatures(body) };
    } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
}
