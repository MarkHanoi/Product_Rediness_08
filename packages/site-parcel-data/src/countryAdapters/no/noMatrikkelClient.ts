// E7-NO — NORWAY (NO) · impure seam #1 of 2: the Kartverket Matrikkelen WFS (GML 3.2.1).
//
// Norway needs TWO dialect clients because it has TWO national services in TWO transports,
// and §6-B's "never mint a rival" is about ONE authority per concept, not one file per
// country: this module is the ONLY place the cadastre is fetched, `noNapClient.ts` is the
// ONLY place the plan register is fetched, and both classify through the SAME L0
// `FetchOutcome` with the SAME refusal-prefix vocabulary.
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-01; transcripts in
// audit/europe-site-intel/2026-08-31/impl/lane-e7-no-transcripts/ — re-run them before
// "fixing" any of these):
//
//   1. GML ONLY. `GetCapabilities` advertises exactly two output formats —
//      `text/xml; subtype=gml/3.2.1` and `application/gml+xml; version=3.2`. There is NO
//      JSON arm. Every sibling adapter (EE/LT/PL/DK) reads JSON; Norway cannot. The XML is
//      scanned with the package's EXISTING pure scanner (`parsers/appGml/xmlScan.ts`,
//      lane E2b) — adopting it rather than minting a second scanner is exactly the E7 family
//      verdict's finding that "every genuinely-shared piece already has an authority".
//
//   2. ⛔ THE COUNT HEADER LIES. A GetFeature that returns real features reports
//      `numberMatched="unknown" numberReturned="0"`. MEASURED: bbox around Bergen
//      60.401356,5.324201 -> **3 `wfs:member` elements carrying teigs 167/714, 167/717,
//      167/718** with `numberReturned="0"` on the collection. A client that trusts the header
//      reports "no parcel here" on a parcel that IS there — the exact failure-vs-empty
//      conflation SS-CONTEXT-DATA-HONESTY forbids. THIS MODULE COUNTS MEMBERS AND NEVER READS
//      THE HEADER; {@link NO_TEIG_COUNT_HEADER_IS_UNRELIABLE} carries the fact as data so a
//      test can pin it.
//
//   3. WGS84 ENTRY WORKS, SERVER-SIDE. The service accepts
//      `bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,urn:ogc:def:crs:EPSG::4326` (urn = lat,lon
//      order) and reprojects. Geometry always comes back in the layer's native
//      `urn:ogc:def:crs:EPSG::25833` regardless — measured on the Bergen pull, where every
//      `gml:Point`/`gml:Polygon` carried `srsName="urn:ogc:def:crs:EPSG::25833"` and Bergen's
//      easting is NEGATIVE (-31841.977), correct for UTM33N west of the 15E meridian.
//      * SO THIS ADAPTER CONTAINS NO PROJECTION MATH AT ALL, in either direction: WGS84 goes
//      IN as a bbox, native metres come OUT, and the NAP plan query (client #2) is issued in
//      EPSG:25833 using the state's own `representasjonspunkt`. A hand-rolled UTM33 transform
//      would be silently wrong (C58 §1.4, the mml/dk lesson).
//
//   4. FAILURE SHAPE: a wrong feature-type name returns **HTTP 400** + an
//      `ows:ExceptionReport` naming it verbatim ("Feature type with name 'Teigg' is not
//      served by this WFS."). Classified TRANSIENT carrying the server's own text — a
//      misconfiguration must never read as "no data here".
//
//   5. COUNT CEILING: `CountDefault` is 1,000,000 (measured). This module always sends an
//      explicit small `count` — an unbounded national pull is not a click.
//
//   6. ⛔ BLOCKED TODAY BY A SHARED-FILE DEFECT — `parsers/appGml/xmlScan.ts` CANNOT READ THIS
//      GML AT ALL. EXECUTED 2026-09-01 against the pinned fixture:
//        reason "malformed-tag" · detail `invalid element name "app:område"` · offset 2033 ·
//        path /wfs:FeatureCollection[1]/wfs:member[1]/app:Teig[1]
//      The scanner's `NAME_RE = /^[A-Za-z_][A-Za-z0-9_.\-]*$/` is ASCII-only, but XML 1.0 §2.3
//      NameStartChar explicitly admits #xC0–#xD6 | #xD8–#xF6 | #xF8–#x2FF, i.e. å ø æ are LEGAL
//      XML names. Kartverket's `app:område` (the polygon container) and
//      `app:nøyaktighetsklasseTeig` are therefore well-formed and the scanner is wrong.
//      ⭐ THIS IS NOT A NORWAY PROBLEM — it blocks every national GML with accented element
//      names (NO/DK/SE/IS/DE at least). The fix is ONE LINE and it is queued for the
//      orchestrator in `impl/barrel-additions-no.txt`; this lane does NOT edit the shared file
//      (barrel protocol) and does NOT mint a second scanner (the standing review rule).
//      NO WORKAROUND EXISTS AT THE SERVICE: WFS `propertyName=` projection to the ASCII-named
//      subset was PROBED and is IGNORED — the response still carries `app:område` (measured,
//      3 members, same 11 KB body). So {@link noWfsGetMembers} detects this exact refusal and
//      re-labels it SELF-NAMINGLY, so nobody reads a PRYZM regex as a Kartverket outage. The
//      moment the one-liner lands, this arm works with no other change — and
//      `noAdapter.test.ts` pins the defect so the pin fails loudly when it does.
//
// RETRY (§6-B, stated rather than re-decided): this module adopts NO retry ladder. The
// package already has one — `src/net/retryWhileUnreachable.ts`, `FetchOutcome`-typed and
// tested — and it has ZERO consumers in `countryAdapters/` (E7 family verdict §7). Wrapping
// it here would make Norway the only adapter of five that retries, which is a policy decision
// for whoever owns transient-retry, not for a country lane. The refusals this module emits are
// already in `TRANSIENT_FETCH_REASONS`, so that owner can adopt it later without touching this
// file.
//
// Licence: NLOD (Norsk lisens for offentlige data) — free reuse incl. commercial, attribution
// to Kartverket. GREEN for GEOMETRY. ⚠ YELLOW for OWNERSHIP: the full Matrikkel attribute /
// ownership API at matrikkel.no is free but AGREEMENT-GATED; this WFS serves geometry +
// matrikkelnummer + flags and NO owner identity, and this adapter asks for nothing else.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { childNs, childrenNs, scanXml, textOf, type XmlElement } from '../../parsers/appGml/xmlScan.js';

const tracer = trace.getTracer('pryzm.siteintel.no');

/* ────────────────────────────── endpoints + namespaces ─────────────────────────── */

/**
 * Kartverket Matrikkelen "Eiendomskart Teig" WFS. Keyless; PROBED LIVE 2026-09-01
 * (GetCapabilities WFS 2.0.0, 7 feature types; GetFeature at Bergen -> 3 real teigs).
 * ⚠ Browser use needs a same-origin proxy (C57 CSP) — `parcelProviders/registry.ts` already
 * records `/api/parcel/no` for exactly that; this base is the server/node origin.
 */
export const NO_MATRIKKEL_WFS_BASE =
    'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig';

/** The SOSI product namespace of the Teig feature type (from GetCapabilities, verbatim). */
export const NO_TEIG_NAMESPACE =
    'http://skjema.geonorge.no/SOSI/produktspesifikasjon/Matrikkelen-Eiendomskart-Teig/20211101';

const WFS_NS = 'http://www.opengis.net/wfs/2.0';
const GML_NS = 'http://www.opengis.net/gml/3.2';

/** The one feature type this adapter reads (of the 7 the service serves). */
export const NO_TEIG_TYPENAME = 'app:Teig';

/** Native CRS of every Norwegian national service in scope — ETRS89 / UTM zone 33N. */
export const NO_NATIVE_CRS = 'EPSG:25833';

/** The urn form the WFS returns on every geometry (measured), and the NAP query CRS. */
export const NO_NATIVE_URN = 'urn:ogc:def:crs:EPSG::25833';

/** The urn CRS token for lat,lon-ordered WGS84 bboxes the WFS reprojects server-side (measured). */
export const NO_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/**
 * MEASURED 2026-09-01: the collection reports `numberReturned="0"` on a response whose body
 * carries three `wfs:member` teigs. Carried as data (not a comment) so a test can pin it.
 */
export const NO_TEIG_COUNT_HEADER_IS_UNRELIABLE = true as const;

/* ────────────────────────────── outcome plumbing ───────────────────────────────── */

/** Injectable dependencies so every NO provider is unit-testable without the network. */
export interface NoFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** One `wfs:member` payload element, scanned but UNINTERPRETED (mapping lives one layer up). */
export interface NoGmlMember {
    /** The member's single payload element (e.g. `app:Teig`). */
    readonly element: XmlElement;
}

/**
 * The stable token every refusal caused by the ASCII-only-name scanner defect carries, so a
 * consumer (and a test) can tell "PRYZM cannot read this yet" from "Kartverket did not answer"
 * WITHOUT string-matching a sentence. Both are `transient` — both are retryable, and neither is
 * "no parcel here" — but only one of them is our own bug.
 */
export const NO_XMLSCAN_NON_ASCII_BLOCKER_TOKEN = 'xmlscan-ascii-only-element-name';

/**
 * PURE: recognise the scanner's ASCII-only-name refusal and return the offending qname, or
 * null when the refusal is something else. Matches the detail the scanner ACTUALLY emits —
 * `invalid element name "app:område"` — and only when the name contains a character the
 * scanner's class rejects but XML 1.0 §2.3 permits.
 */
export function nonAsciiNameFromScanDetail(reason: string, detail: string): string | null {
    if (reason !== 'malformed-tag') return null;
    const m = /invalid element name "([^"]*)"/.exec(detail);
    if (m === null) return null;
    const qname = m[1]!;
    const local = qname.includes(':') ? qname.slice(qname.indexOf(':') + 1) : qname;
    // Legal XML NameStartChar/NameChar beyond ASCII (the ranges the scanner's class omits).
    return /[À-ÖØ-öø-˿Ͱ-ͽͿ-῿]/.test(local)
        ? qname
        : null;
}

/**
 * Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back.
 * Kartverket names the offending type verbatim in this text (measured fact 4) — carrying it
 * into the outcome is what makes a wrong-typename refusal SELF-NAMING.
 */
export function extractOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport')) return null;
    const m = /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body);
    if (m) return m[1]!.trim();
    const bare = /<ExceptionText>([\s\S]*?)<\/ExceptionText>/.exec(body);
    return bare ? bare[1]!.trim() : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * The classified GET every Matrikkelen read goes through. Returns the scanned `wfs:member`
 * payload elements or a typed refusal — NEVER throws, and never lets an upstream failure
 * masquerade as an empty answer.
 *
 * ⛔ The member COUNT is taken from the scanned tree, never from `numberReturned` (measured
 * fact 2). That is the whole reason this function exists rather than a bare fetch + regex.
 */
export async function noWfsGetMembers(
    url: string,
    queryLabel: string,
    deps: NoFetchDeps = {},
): Promise<FetchOutcome<readonly NoGmlMember[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.wfsGetMembers',
        async (span): Promise<FetchOutcome<readonly NoGmlMember[]>> => {
            span.setAttribute('no.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                let res: Response;
                try {
                    res = await fetchImpl(url);
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                    return fetchTransient(
                        `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                    );
                }
                const body = await res.text().catch(() => '');
                if (!res.ok) {
                    const exc = extractOwsExceptionText(body);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                    );
                }
                // Kartverket can also answer HTTP 200 with an ExceptionReport for some inputs.
                const exc200 = extractOwsExceptionText(body);
                if (exc200 !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: ExceptionReport from ${url} — ${exc200}`);
                }
                const scan = scanXml(body);
                if (!scan.ok) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    const nonAscii = nonAsciiNameFromScanDetail(scan.reason, scan.detail);
                    if (nonAscii !== null) {
                        // ⛔ OUR defect, not Kartverket's — say so, and name the fix.
                        return fetchTransient(
                            `upstream-failed: ${NO_XMLSCAN_NON_ASCII_BLOCKER_TOKEN} — ` +
                                `parsers/appGml/xmlScan.ts refused the element name '${nonAscii}' as ` +
                                "'malformed-tag', but XML 1.0 §2.3 NameStartChar admits #xC0-#xD6 | " +
                                '#xD8-#xF6 | #xF8-#x2FF, so it is WELL-FORMED and the scanner is ' +
                                'ASCII-only. The Kartverket response is valid GML 3.2.1 and this is a ' +
                                'PRYZM-side blocker (one-line fix queued in barrel-additions-no.txt). ' +
                                `Scan said: ${scan.reason} at ${scan.path || '<root>'} (offset ${scan.offset}).`,
                        );
                    }
                    return fetchTransient(
                        `upstream-failed: malformed GML from ${url} — ${scan.reason} at ` +
                            `${scan.path || '<root>'} (offset ${scan.offset}): ${scan.detail}`,
                    );
                }
                const root = scan.root;
                if (root.ns !== WFS_NS || root.local !== 'FeatureCollection') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(
                        `upstream-failed: expected wfs:FeatureCollection from ${url}, got <${root.qname}>`,
                    );
                }
                // ⛔ MEASURED: `numberReturned` is "0" on responses carrying real members.
                // The tree is the authority; the header is not read at all.
                const members: NoGmlMember[] = [];
                for (const m of childrenNs(root, WFS_NS, 'member')) {
                    const payload = m.children.find((c) => c.ns === NO_TEIG_NAMESPACE);
                    if (payload !== undefined) members.push({ element: payload });
                }
                if (members.length === 0) {
                    // The source ANSWERED and there is genuinely nothing here — a durable
                    // coverage fact, distinct from every failure above.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-parcel: ${queryLabel}`);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute('no.members', members.length);
                return fetchFound(members as readonly NoGmlMember[]);
            } finally {
                span.end();
            }
        },
    );
}

/* ────────────────────────────── URL builders (pure) ────────────────────────────── */

/**
 * GetFeature over a WGS84 (lat,lon urn-ordered) bbox — the server reprojects (measured fact 3);
 * this module does NO projection.
 */
export function buildTeigWgs84BboxUrl(
    latMin: number,
    lonMin: number,
    latMax: number,
    lonMax: number,
    count: number,
): string {
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: NO_TEIG_TYPENAME,
        count: String(count),
        bbox: `${latMin},${lonMin},${latMax},${lonMax},${NO_WGS84_URN}`,
    });
    return `${NO_MATRIKKEL_WFS_BASE}?${p.toString()}`;
}

/**
 * GetFeature over a NATIVE (E,N) bbox in EPSG:25833. Projected EPSG axis order for 25833 is
 * easting-then-northing, and the urn form is honoured on input as well as output (measured).
 */
export function buildTeigNativeBboxUrl(
    eMin: number,
    nMin: number,
    eMax: number,
    nMax: number,
    count: number,
): string {
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: NO_TEIG_TYPENAME,
        count: String(count),
        bbox: `${eMin},${nMin},${eMax},${nMax},${NO_NATIVE_URN}`,
    });
    return `${NO_MATRIKKEL_WFS_BASE}?${p.toString()}`;
}

/* ────────────────────────────── GML tree readers (pure) ────────────────────────── */

/** Trimmed text of a direct `app:` child, or null when absent/empty. */
export function appText(el: XmlElement, local: string): string | null {
    const c = childNs(el, NO_TEIG_NAMESPACE, local);
    if (c === null) return null;
    const t = textOf(c);
    return t === '' ? null : t;
}

/** First direct `app:` child element, or null. */
export function appChild(el: XmlElement, local: string): XmlElement | null {
    return childNs(el, NO_TEIG_NAMESPACE, local);
}

/**
 * The first `gml:Point` under an element, as `[easting, northing]` plus the srsName it
 * carries. Returns null when absent or when either ordinate is not finite — never a partial
 * point, because half a coordinate silently placed is how a query lands on the neighbour.
 */
export function readGmlPos(
    el: XmlElement,
): { readonly pos: readonly [number, number]; readonly srsName: string | null } | null {
    const point = findDescendant(el, GML_NS, 'Point');
    if (point === null) return null;
    const pos = childNs(point, GML_NS, 'pos');
    if (pos === null) return null;
    const parts = textOf(pos).split(/\s+/).filter((s) => s !== '');
    if (parts.length < 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { pos: [x, y] as const, srsName: attrValue(point, 'srsName') };
}

/**
 * The first `gml:Polygon`'s exterior LinearRing as `[easting, northing]` pairs, with the
 * srsName the polygon declares. Coordinates are returned EXACTLY as served (closing vertex
 * kept, no reprojection, no winding fix) — the E1a native-CRS discipline.
 */
export function readGmlExteriorRing(el: XmlElement): {
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly srsName: string | null;
} | null {
    const poly = findDescendant(el, GML_NS, 'Polygon');
    if (poly === null) return null;
    const ext = childNs(poly, GML_NS, 'exterior');
    if (ext === null) return null;
    const lr = childNs(ext, GML_NS, 'LinearRing');
    if (lr === null) return null;
    const posList = childNs(lr, GML_NS, 'posList');
    if (posList === null) return null;
    const nums = textOf(posList).split(/\s+/).filter((s) => s !== '');
    const ring: Array<readonly [number, number]> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i]);
        const y = Number(nums[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        ring.push([x, y] as const);
    }
    if (ring.length < 3) return null;
    return { ring, srsName: attrValue(poly, 'srsName') };
}

function attrValue(el: XmlElement, local: string): string | null {
    for (const a of el.attrs) if (a.local === local && a.prefix === '') return a.value;
    return null;
}

/** Breadth-first descendant search by namespace + local name. Pure; bounded by the tree. */
function findDescendant(el: XmlElement, ns: string, local: string): XmlElement | null {
    const queue: XmlElement[] = [el];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const c of cur.children) {
            if (c.ns === ns && c.local === local) return c;
            queue.push(c);
        }
    }
    return null;
}
