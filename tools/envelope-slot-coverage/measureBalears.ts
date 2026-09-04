#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-SLOT-COVERAGE — THE ILLES BALEARS ARM (`es-ib`). Runs the SHIPPED Balears chain over
// REAL Catastro parcels in Manacor (INE 07033) and Palma (INE 07040) and reports, per the shared
// classifier, how many of the eight envelope slots resolve — F1 counted separately from F2, a
// service failure counted separately from both, and NOTHING signed.
//
//   npx tsx tools/envelope-slot-coverage/measureBalears.ts                 # 40 + 40 parcels
//   npx tsx tools/envelope-slot-coverage/measureBalears.ts --n 40 --seed 20260904 --gap 400
//   npx tsx tools/envelope-slot-coverage/measureBalears.ts --muni manacor --n 3   # smoke test
//
// "DON'T MEASURE DATASETS. MEASURE ACTUAL PARCELS." — the coordinator's line, and the reason this
// arm is ONLINE where `measureEs.ts` is offline: the Balears pack holds no zones (it is resolved
// LIVE per parcel from the MUIB fitxa), so the only way to know what a parcel gets is to put that
// parcel through the live chain. It extends the one-parcel precedent
// `packages/site-parcel-data/__tests__/balearsRealParcelEnvelope.test.ts` (7704702ED1870S) to ~80.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// REUSE, NEVER REINVENT — every leg is the repo's own code, imported
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  • PARCEL FRAME  `buildFrame` + `drawUniform` from `tools/cold-start-probe/catastroParcelFrame.mjs`
//    — the Catastro INSPIRE CP ATOM enclosure for the whole municipality, so the draw is UNIFORM
//    WITHOUT REPLACEMENT over the FULL parcel population (every parcel weighs 1), seeded.
//    ⚠ The brief named `wfsCP.aspx` as that file's mechanism; it is NOT — the file downloads the
//    per-municipality GML via the province ATOM and re-projects ETRS89/UTM → WGS84 itself. The
//    `wfsCP.aspx` bbox shape lives in its sibling `validateReprojection.mjs` (and in
//    `city-completion/parcelSampleProbe.mjs`) and is used HERE as the INDEPENDENT ORACLE, exactly
//    as that sibling uses it: the re-projected centroid is sent to a different host on a different
//    coordinate path and must return THE SAME cadastral reference. A naive bbox GetFeature with the
//    wrong axis order / typeName spelling is what answers HTTP 400.
//  • ZONE + FITXA  `resolveBalearsMuib(point, deps)` — the shipped resolver, with a `fetchImpl` that
//    answers the same-origin `/api/es/balears-muib` route by calling the SERVER'S OWN
//    `fetchBalearsMuibAtPoint` (`server/jurisdiction/balearsMuibProxy.js`). The upstream URL, the
//    fitxa-host SSRF guard and the http→https upgrade are therefore the production ones, imported —
//    no endpoint is invented here. The route's 200/502 contract is mirrored from `makeBalearsMuibHandler`.
//  • ENVELOPE      `balearsResolvedPack(record)` → `computeBuildableEnvelope` → `slotsFromEnvelope`,
//    with the same neutral 40 m square ring and edge classification the ES/PT arms use, so the
//    three arms publish comparable slot figures (the ring is not the subject; coverage is).
//  • CLASSIFIER    `classifyRefusal` over the shipped `balearsRefusal(reason)`'s own
//    `legallyGrounded` flag — the ratified F1/F2 seam. No rival vocabulary is minted here.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// TWO ARMS, BECAUSE THE SHIPPED CODE HAS TWO — and they are READ FROM THE SHIPPED CODE, not assumed
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  • `determination` — the L-449 gate. `BALEARS_ENVELOPE_VERIFIED = false`, so
//    `isEnvelopePublicationAuthorised('es-ib-balears')` is false and, by `measureEs.ts`'s own rule,
//    a pack that answers behind a SHUT gate is F1 ("no number reaches the panel as a determination").
//  • `indicative`   — the drawing arm. `envelopePublicationPosture('es-ib-balears')` is read LIVE;
//    when it is `open-top-indicative` and `rendererCanExpressOpenTop` holds, the editor's
//    `applyBalearsZoningThenFallback` (`apps/editor/src/ui/site/siteDispatch.ts`) DOES compute and
//    dispatch an envelope from the pack, stamped indicative (open top, no buildable right claimed).
//    ⚠ That function's own comment (≈ line 7870) still says the arm is "UNREACHABLE TODAY …
//    `OPEN_TOP_INDICATIVE_JURISDICTIONS` ships empty"; `openTopIndicative.ts` lists Balears
//    (§BALEARS-LISTING, 2026-08-03). The comment is stale; this harness trusts the function calls.
//  ⇒ "IF SIGNED" is numerically the `indicative` arm: a signature changes the STAMP on the solid,
//    not which slots the fitxa fills. Nothing here signs anything.
//
// ⚠ A SERVICE FAILURE IS NEVER A ZERO. Transient resolver reasons (`endpoint-unreachable`,
// `fitxa-unreachable`, per `balearsRefusalIsTransient`) are `service-failure` and leave every
// denominator; HTTP statuses per upstream host are printed so a refusal can be traced to its cause.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildableEnvelope, ZoningRecord } from '@pryzm/schemas';
// The PROVEN parcel frame — imported, never re-derived.
import { buildFrame, drawUniform, USER_AGENT as CATASTRO_UA } from '../cold-start-probe/catastroParcelFrame.mjs';
// The verified `STOREDQUERIE_ID=GetParcel` shape (matches `server/parcelZoningProxy.js`).
import { parcelByRefcatUrl } from '../murcia-parcel-probe/catastro.js';
// THE SERVER'S OWN proxy mapping — the upstream URL construction and the fitxa SSRF guard.
import {
    fetchBalearsMuibAtPoint,
    BALEARS_MUIB_PATH as SERVER_MUIB_PATH,
} from '../../server/jurisdiction/balearsMuibProxy.js';
import {
    resolveBalearsMuib,
    balearsRefusalIsTransient,
    BALEARS_MUIB_PATH,
    type BalearsMuibRefusalReason,
    type BalearsMuibResolution,
    type BalearsZoningFeature,
} from '../../packages/site-parcel-data/src/providers/resolveBalearsMuib.js';
import {
    parseBalearsFitxa,
    classifyBalearsFitxa,
    balearsDrawability,
} from '../../packages/site-parcel-data/src/providers/balearsMuibFitxa.js';
import {
    balearsResolvedPack,
    balearsRefusal,
    BALEARS_JURISDICTION_ID,
    BALEARS_ENVELOPE_VERIFIED,
} from '../../packages/site-parcel-data/src/rulepacks/esBalearsMuib.js';
import { isEnvelopePublicationAuthorised } from '../../packages/site-parcel-data/src/rulepacks/envelopeAuthorisation.js';
import {
    envelopePublicationPosture,
    mayDrawEnvelope,
    mayPublishAsDetermination,
    rendererCanExpressOpenTop,
} from '../../packages/site-parcel-data/src/rulepacks/openTopIndicative.js';
import { computeBuildableEnvelope } from '../../packages/site-parcel-data/src/ZoningRulesEngine.js';
import {
    classifyRefusal,
    ENVELOPE_SLOTS,
    renderMarkdown,
    report,
    type EnvelopeSlot,
    type PointClass,
    type PointResult,
} from './slots.js';
import { slotsFromEnvelope, squareRing, writeArtefact } from './shared.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The two municipalities the brief names. INE-5 + the ATOM title (name is authoritative there). */
const MUNIS = [
    { key: 'manacor', ine: '07033', name: 'MANACOR' },
    { key: 'palma', ine: '07040', name: 'PALMA' },
] as const;
type MuniKey = (typeof MUNIS)[number]['key'];

/**
 * Mirrors the UNEXPORTED `CITABLE_CODES` in `resolveBalearsMuib.ts` (the envelope-bearing codes whose
 * citation counts as citing THE NUMBER, not the page footer). For `ok` records the resolver's own
 * `record.articleRefs` is used verbatim and this list is only a cross-check; it is needed on its own
 * for fitxes the resolver fetched but refused before returning a record.
 */
const CITABLE_CODES = ['NP', 'HR', 'HT', 'O', 'E', 'RA', 'RF', 'RM', 'PE'] as const;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ARGS
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface Args {
    readonly n: number;
    readonly seed: number;
    readonly gapMs: number;
    readonly asOf: string;
    readonly muni: MuniKey | null;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const get = (k: string, d: string): string => {
        const i = argv.indexOf(k);
        return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
    };
    const muni = get('--muni', '');
    if (muni !== '' && !MUNIS.some((m) => m.key === muni)) {
        throw new Error(`--muni must be one of ${MUNIS.map((m) => m.key).join('|')}`);
    }
    return {
        n: Number(get('--n', '40')),
        seed: Number(get('--seed', '20260904')),
        gapMs: Number(get('--gap', '400')),
        // The same default the editor uses (`siteDispatch.ts`): today, ISO date. Injected so the
        // validity filter is auditable in the artefact.
        asOf: get('--asOf', new Date().toISOString().slice(0, 10)),
        muni: muni === '' ? null : (muni as MuniKey),
    };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────────────────────────────────────────────────────
// POLITE UPSTREAM FETCH — one gate for every outbound request, a per-run fitxa cache, an HTTP log
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface HttpLogRow {
    readonly host: string;
    readonly status: number | 'network' | 'timeout';
    readonly ms: number;
}
const httpLog: HttpLogRow[] = [];
let lastOutbound = 0;
let minGapMs = 400;

/** A minimal Response-like object: `ok`, `status`, `text()`, `json()` — all the proxy reads. */
interface ResponseLike {
    readonly ok: boolean;
    readonly status: number;
    readonly headers: { get(name: string): string | null };
    text(): Promise<string>;
    json(): Promise<unknown>;
}

function responseLike(status: number, body: string): ResponseLike {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => null },
        text: async () => body,
        json: async () => JSON.parse(body) as unknown,
    };
}

/** Same fitxa URL ⇒ one fetch per run. Many parcels share a zone; the Govern need not serve it 40×. */
const fitxaCache = new Map<string, ResponseLike>();

async function politeUpstreamFetch(input: string | URL | Request, init?: RequestInit): Promise<ResponseLike> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const host = new URL(url).hostname;
    const cached = host === 'muib.caib.es' ? fitxaCache.get(url) : undefined;
    if (cached) return cached;

    const gap = Date.now() - lastOutbound;
    if (gap < minGapMs) await sleep(minGapMs - gap);
    const t0 = Date.now();
    try {
        const res = await fetch(url, init);
        const body = await res.text();
        lastOutbound = Date.now();
        httpLog.push({ host, status: res.status, ms: Date.now() - t0 });
        const out = responseLike(res.status, body);
        if (host === 'muib.caib.es' && res.ok) fitxaCache.set(url, out);
        return out;
    } catch (e) {
        lastOutbound = Date.now();
        const aborted = (e as Error)?.name === 'AbortError';
        httpLog.push({ host, status: aborted ? 'timeout' : 'network', ms: Date.now() - t0 });
        throw e;
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE INJECTED SAME-ORIGIN ROUTE — `/api/es/balears-muib` answered by the server's own function
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface ProxyPayload {
    readonly qualificacions: unknown[] | null;
    readonly fitxa: { identitat: unknown; url: string; html: string } | null;
}
let lastPayload: ProxyPayload | null = null;

/**
 * Mirrors `makeBalearsMuibHandler` — 200 with the payload, 502 when the zoning layer did not
 * answer (`qualificacions === null`). The resolver's own bbox gate makes the 400/out-of-bounds
 * branches unreachable from here.
 */
const routeFetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    void init;
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(raw, 'http://localhost');
    if (u.pathname !== BALEARS_MUIB_PATH) {
        throw new Error(`unexpected route ${u.pathname} — the resolver should only call ${BALEARS_MUIB_PATH}`);
    }
    const lat = Number(u.searchParams.get('lat'));
    const lon = Number(u.searchParams.get('lon'));
    const payload = (await fetchBalearsMuibAtPoint(lat, lon, {
        fetchImpl: politeUpstreamFetch as unknown as typeof fetch,
    })) as ProxyPayload;
    lastPayload = payload;
    if (payload.qualificacions === null) {
        return responseLike(502, JSON.stringify({ error: 'MUIB did not answer' })) as unknown as Response;
    }
    return responseLike(200, JSON.stringify(payload)) as unknown as Response;
}) as unknown as typeof fetch;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE INDEPENDENT ORACLE — Catastro `wfsCP.aspx`, the shape from `validateReprojection.mjs:44-47`
// ──────────────────────────────────────────────────────────────────────────────────────────────

type OracleOutcome = 'hit' | 'ref-mismatch' | 'empty' | `http-${number}` | 'network';

interface OracleResult {
    readonly outcome: OracleOutcome;
    readonly refs: readonly string[];
}

async function catastroGet(url: string): Promise<{ status: number | null; body: string }> {
    try {
        const r = await politeUpstreamFetch(url, { headers: { 'user-agent': CATASTRO_UA } });
        return { status: r.status, body: await r.text() };
    } catch {
        return { status: null, body: '' };
    }
}

async function oracleAt(ref: string, lat: number, lon: number): Promise<OracleResult> {
    const d = 0.00004;
    const url =
        'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=cp:CadastralParcel&srsName=EPSG:4326' +
        `&bbox=${(lat - d).toFixed(7)},${(lon - d).toFixed(7)},${(lat + d).toFixed(7)},${(lon + d).toFixed(7)}`;
    const r = await catastroGet(url);
    if (r.status === null) return { outcome: 'network', refs: [] };
    if (r.status !== 200) return { outcome: `http-${r.status}`, refs: [] };
    if (/No records founded for BBOX/i.test(r.body)) return { outcome: 'empty', refs: [] };
    const refs = [...r.body.matchAll(/gml:id="ES\.SDGC\.CP\.([^"]+)"/g)].map((m) => m[1]!);
    return { outcome: refs.includes(ref) ? 'hit' : 'ref-mismatch', refs };
}

/**
 * The parcel's own ring by REFCAT (EPSG:4326, `lat lon` axis order in the posList — verified live
 * in `parcelSampleProbe.mjs`), for a parcel whose mean-of-vertices centroid the oracle refused.
 */
async function ringByRefcat(ref: string): Promise<Array<{ lat: number; lon: number }> | null> {
    const r = await catastroGet(parcelByRefcatUrl(ref));
    if (r.status !== 200) return null;
    const member = r.body.split(/<cp:CadastralParcel\b/).slice(1).find((m) => m.includes(`ES.SDGC.CP.${ref}"`));
    const pos = member?.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/)?.[1];
    if (!pos) return null;
    const nums = pos.trim().split(/\s+/).map(Number);
    const ring: Array<{ lat: number; lon: number }> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        const a = nums[i]!, b = nums[i + 1]!;
        if (Number.isFinite(a) && Number.isFinite(b)) ring.push({ lat: a, lon: b });
    }
    return ring.length >= 3 ? ring : null;
}

function pointInRing(p: { lat: number; lon: number }, ring: ReadonlyArray<{ lat: number; lon: number }>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        if (a.lat > p.lat !== b.lat > p.lat) {
            const x = ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon;
            if (p.lon < x) inside = !inside;
        }
    }
    return inside;
}

/**
 * A point GUARANTEED inside the polygon: the area-weighted centroid when it is inside, else the
 * midpoint of the widest interior span on a horizontal scanline through the bbox middle (then a
 * few offset scanlines). Standard "representative point"; used ONLY for oracle-refused centroids.
 */
function interiorPoint(ring: ReadonlyArray<{ lat: number; lon: number }>): { lat: number; lon: number } | null {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
        const p = ring[i]!, q = ring[(i + 1) % n]!;
        const f = p.lon * q.lat - q.lon * p.lat;
        a += f; cx += (p.lon + q.lon) * f; cy += (p.lat + q.lat) * f;
    }
    a /= 2;
    if (Math.abs(a) > 1e-16) {
        const c = { lon: cx / (6 * a), lat: cy / (6 * a) };
        if (pointInRing(c, ring)) return c;
    }
    const lats = ring.map((p) => p.lat);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    for (const frac of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const y = minLat + (maxLat - minLat) * frac;
        const xs: number[] = [];
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const p = ring[i]!, q = ring[j]!;
            if (p.lat > y !== q.lat > y) xs.push(((q.lon - p.lon) * (y - p.lat)) / (q.lat - p.lat) + p.lon);
        }
        xs.sort((u, v) => u - v);
        let best: { lon: number; w: number } | null = null;
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const w = xs[k + 1]! - xs[k]!;
            if (!best || w > best.w) best = { lon: (xs[k]! + xs[k + 1]!) / 2, w };
        }
        if (best) return { lat: y, lon: best.lon };
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PER-PARCEL RECORD
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface ParcelRecord {
    readonly municipality: MuniKey;
    readonly ine: string;
    readonly refcat: string;
    readonly officialAreaM2: number | null;
    readonly point: { readonly lat: number; readonly lon: number };
    readonly pointSource: 'atom-centroid' | 'getparcel-interior';
    readonly oracle: {
        readonly atCentroid: OracleOutcome;
        readonly final: OracleOutcome;
        readonly refsAtPoint: readonly string[];
    };
    readonly muib: {
        readonly outcome: 'ok' | 'refused';
        readonly reason: BalearsMuibRefusalReason | null;
        readonly detail: string | null;
        readonly featuresAtPoint: number | null;
        readonly CODIMUIB: string | null;
        readonly CODIAJ: string | null;
        readonly NOM: string | null;
        readonly CODIPLA: string | null;
        readonly CODICLAS: string | null;
        readonly MUNICIPI: string | null;
        readonly IDENTITAT: number | null;
        readonly URL: string | null;
        readonly OBS: string | null;
        readonly DINIVIGEN: string | null;
    };
    readonly fitxa: {
        /** The proxy fetched the fitxa HTML (whatever the resolver then did with it). */
        readonly fetchedByProxy: boolean;
        /** The resolver got as far as PARSING it (ok, or a post-parse refusal). */
        readonly readByResolver: boolean;
        readonly identitatPrinted: string | null;
        readonly articleRefsOnParameters: readonly string[];
        readonly articleRefsAnywhere: readonly string[];
        readonly drawability: string | null;
        readonly codeCellsSeen: number | null;
        readonly codeCellsUnparsed: number | null;
    };
    readonly envelope: {
        readonly computed: boolean;
        readonly status: string | null;
        readonly confidence: string | null;
        readonly footprintIsUpperBound: boolean | null;
        readonly slots: readonly EnvelopeSlot[];
        readonly maxFloors: number | null;
        readonly maxHeight_m: number | null;
        readonly maxFAR: number | null;
        readonly maxCoverage: number | null;
    };
    readonly cls: { readonly determination: PointClass; readonly indicative: PointClass };
    readonly why: string;
}

const POST_PARSE_REASONS: ReadonlySet<BalearsMuibRefusalReason> = new Set<BalearsMuibRefusalReason>([
    'fitxa-unparsable',
    'fitxa-identity-mismatch',
    'no-drawable-parameters',
]);

function featureOf(res: BalearsMuibResolution): BalearsZoningFeature | null {
    return res.ok ? res.record.feature : (res.feature ?? null);
}

/** One parcel through the SHIPPED chain. Never throws; every leg's failure is a typed field. */
async function probeParcel(
    muni: (typeof MUNIS)[number],
    p: { ref: string; areaM2: number | null; lat: number; lon: number },
    args: Args,
    posture: ReturnType<typeof envelopePublicationPosture>,
): Promise<ParcelRecord> {
    // (1) The oracle at the re-projected centroid; a refused centroid gets the parcel's own ring.
    let point = { lat: p.lat, lon: p.lon };
    let pointSource: ParcelRecord['pointSource'] = 'atom-centroid';
    const first = await oracleAt(p.ref, point.lat, point.lon);
    let final = first;
    if (first.outcome === 'ref-mismatch' || first.outcome === 'empty') {
        const ring = await ringByRefcat(p.ref);
        const ip = ring ? interiorPoint(ring) : null;
        if (ip) {
            point = { lat: +ip.lat.toFixed(7), lon: +ip.lon.toFixed(7) };
            pointSource = 'getparcel-interior';
            final = await oracleAt(p.ref, point.lat, point.lon);
        }
    }

    // (2) The shipped resolver, through the server's own proxy mapping.
    lastPayload = null;
    const res = await resolveBalearsMuib(point, { fetchImpl: routeFetch, asOf: args.asOf });
    const payload = lastPayload as ProxyPayload | null;
    const f = featureOf(res);

    // (3) The fitxa, parsed with the PURE parser wherever the proxy fetched one — so article
    //     citation is counted on every fitxa fetched, not only on the ones that became a record.
    const html = payload?.fitxa?.html ?? null;
    let fitxa: ParcelRecord['fitxa'] = {
        fetchedByProxy: html !== null,
        readByResolver: res.ok || (!res.ok && POST_PARSE_REASONS.has(res.reason)),
        identitatPrinted: null,
        articleRefsOnParameters: [],
        articleRefsAnywhere: [],
        drawability: null,
        codeCellsSeen: null,
        codeCellsUnparsed: null,
    };
    if (html !== null) {
        const parsed = parseBalearsFitxa(html);
        const P = classifyBalearsFitxa(parsed);
        const onParams = [...new Set(CITABLE_CODES.flatMap((c) => P[c]?.articleRefs ?? []))];
        if (res.ok) {
            const a = [...res.record.articleRefs].sort().join('|');
            const b = [...onParams].sort().join('|');
            if (a !== b) crossCheckMismatches.push(`${p.ref}: resolver [${a}] vs harness [${b}]`);
        }
        fitxa = {
            ...fitxa,
            identitatPrinted: parsed.identitat,
            articleRefsOnParameters: res.ok ? res.record.articleRefs : onParams,
            articleRefsAnywhere: parsed.articleRefsAll,
            drawability: res.ok ? res.record.drawability.tier : balearsDrawability(P).tier,
            codeCellsSeen: parsed.codeCellsSeen,
            codeCellsUnparsed: parsed.codeCellsUnparsed.length,
        };
    }

    // (4) The envelope — exactly the editor's drawing-arm call, on the harness's neutral ring.
    let envelope: ParcelRecord['envelope'] = {
        computed: false, status: null, confidence: null, footprintIsUpperBound: null, slots: [],
        maxFloors: null, maxHeight_m: null, maxFAR: null, maxCoverage: null,
    };
    let env: BuildableEnvelope | null = null;
    if (res.ok) {
        const pack = balearsResolvedPack(res.record);
        const zone = pack.zones[0]!;
        const zoning: ZoningRecord = {
            zoneCode: zone.code,
            zoneLabel: zone.label,
            jurisdictionId: BALEARS_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: zone.ordinanceRef ?? null,
            provenance: {
                source: 'goib-muib-fitxa',
                label: `GOIB MUIB normative fitxa — ${res.record.fitxaUrl}`,
                version: res.record.feature.DINIVIGEN ?? null,
                license: null,
                crs: 'EPSG:4326',
            },
        };
        env = computeBuildableEnvelope({
            parcelRing: squareRing(20),
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            zoning,
            rulePack: pack,
        });
        envelope = {
            computed: true,
            status: env.status,
            confidence: env.confidence ?? null,
            footprintIsUpperBound: env.footprintIsUpperBound ?? null,
            slots: slotsFromEnvelope(env),
            maxFloors: env.maxFloors,
            maxHeight_m: env.maxHeight_m,
            maxFAR: env.maxFAR,
            maxCoverage: env.maxCoverage,
        };
    }

    // (5) Classification — the ratified seam, on both arms.
    let det: PointClass, ind: PointClass, why: string;
    if (!res.ok) {
        if (balearsRefusalIsTransient(res.reason)) {
            det = ind = 'service-failure';
            why = `${res.reason}${res.detail ? ` — ${res.detail}` : ''}`;
        } else if (res.reason === 'no-zoning-here') {
            det = ind = 'no-plan-served';
            why = 'no-zoning-here — the QUALIFICACIONS layer answered and publishes no polygon here';
        } else {
            const refusal = balearsRefusal(res.reason, {
                zoneCode: f?.CODIMUIB ?? f?.CODIAJ ?? null,
                zoneLabel: f?.NOM ?? null,
                municipality: f?.MUNICIPI ?? null,
                detail: res.detail ?? null,
            });
            det = ind = classifyRefusal(refusal);
            why = `${res.reason} → ${refusal.code} (legallyGrounded=${refusal.legallyGrounded}): ${refusal.headline}`.slice(0, 400);
        }
    } else {
        const slots = envelope.slots;
        const authorised = isEnvelopePublicationAuthorised(BALEARS_JURISDICTION_ID);
        det = authorised ? (slots.length > 0 ? 'resolved' : 'f1-gap') : 'f1-gap';
        const indicativeDrawable = posture.posture === 'open-top-indicative' && rendererCanExpressOpenTop;
        ind = indicativeDrawable || posture.posture === 'determination'
            ? (slots.length > 0 && env?.status === 'ok' ? 'resolved' : 'f1-gap')
            : det;
        why =
            `ok · zone ${f?.CODIAJ ?? '?'} (${f?.CODIMUIB ?? '?'}) · fitxa identitat=${f?.IDENTITAT ?? '?'} · ` +
            `drawability ${res.record.drawability.tier} · articles on parameters [${res.record.articleRefs.join(', ')}] · ` +
            `env status ${env?.status ?? 'n/a'} · gate ${authorised ? 'OPEN' : 'SHUT'} · posture ${posture.posture}`;
    }

    return {
        municipality: muni.key,
        ine: muni.ine,
        refcat: p.ref,
        officialAreaM2: p.areaM2,
        point,
        pointSource,
        oracle: { atCentroid: first.outcome, final: final.outcome, refsAtPoint: final.refs },
        muib: {
            outcome: res.ok ? 'ok' : 'refused',
            reason: res.ok ? null : res.reason,
            detail: res.ok ? null : (res.detail ?? null),
            featuresAtPoint: payload?.qualificacions?.length ?? null,
            CODIMUIB: f?.CODIMUIB ?? null,
            CODIAJ: f?.CODIAJ ?? null,
            NOM: f?.NOM ?? null,
            CODIPLA: f?.CODIPLA ?? null,
            CODICLAS: f?.CODICLAS ?? null,
            MUNICIPI: f?.MUNICIPI ?? null,
            IDENTITAT: f?.IDENTITAT ?? null,
            URL: f?.URL ?? null,
            OBS: f?.OBS ?? null,
            DINIVIGEN: f?.DINIVIGEN ?? null,
        },
        fitxa,
        envelope,
        cls: { determination: det, indicative: ind },
        why,
    };
}

const crossCheckMismatches: string[] = [];

function toPoint(r: ParcelRecord, arm: 'determination' | 'indicative'): PointResult {
    const cls = r.cls[arm];
    return {
        lat: r.point.lat,
        lon: r.point.lon,
        cls,
        zoneLabel: r.muib.CODIAJ ?? r.muib.CODIMUIB ?? null,
        area: `${r.ine} ${r.municipality}`,
        slots: cls === 'resolved' ? r.envelope.slots : [],
        why: r.why,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REPORTING HELPERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)} %`);
const frac = (n: number, d: number): string => `${n} / ${d} (${pct(n, d)})`;

function histogram<T>(xs: readonly T[], key: (x: T) => string): Array<[string, number]> {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function headlineTable(rows: readonly ParcelRecord[]): string[] {
    const n = rows.length;
    const svc = rows.filter((r) => r.cls.determination === 'service-failure');
    const answered = rows.filter((r) => r.cls.determination !== 'service-failure');
    const withZone = answered.filter((r) => (r.muib.featuresAtPoint ?? 0) > 0);
    const zoneIdentified = answered.filter((r) => r.muib.CODIMUIB !== null || r.muib.CODIAJ !== null);
    const ok = answered.filter((r) => r.muib.outcome === 'ok');
    const fetched = answered.filter((r) => r.fitxa.fetchedByProxy);
    // ⚠ SR (rústic) features ALSO carry a `URL`, and the proxy fetches it — but that page is a rustic
    // category sheet, not a ZONE fitxa, and the resolver never reads it (`not-buildable-class` refuses
    // first). The citation question is about zone fitxes, so it is ALSO asked over SU/SB land only.
    const isBuildableClass = (r: ParcelRecord): boolean => r.muib.CODICLAS === 'SU' || r.muib.CODICLAS === 'SB';
    const fetchedSuSb = fetched.filter(isBuildableClass);
    const read = answered.filter((r) => r.fitxa.readByResolver);
    const citeOnParams = fetched.filter((r) => r.fitxa.articleRefsOnParameters.length > 0);
    const citeOnParamsSuSb = fetchedSuSb.filter((r) => r.fitxa.articleRefsOnParameters.length > 0);
    const citeAnywhere = fetched.filter((r) => r.fitxa.articleRefsAnywhere.length > 0);
    const citeAnywhereSuSb = fetchedSuSb.filter((r) => r.fitxa.articleRefsAnywhere.length > 0);
    const okCite = ok.filter((r) => r.fitxa.articleRefsOnParameters.length > 0);
    // Distinct by the fitxa URL the feature itself published (IDENTITAT is null on some SR rows).
    const distinct = new Map<string, ParcelRecord>();
    for (const r of fetched) if (r.muib.URL !== null && !distinct.has(r.muib.URL)) distinct.set(r.muib.URL, r);
    const distinctSuSb = [...distinct.values()].filter(isBuildableClass);
    const distinctCite = [...distinct.values()].filter((r) => r.fitxa.articleRefsOnParameters.length > 0).length;
    const distinctCiteSuSb = distinctSuSb.filter((r) => r.fitxa.articleRefsOnParameters.length > 0).length;
    const oracleHit = rows.filter((r) => r.oracle.final === 'hit');
    const relocated = rows.filter((r) => r.pointSource === 'getparcel-interior');
    const indResolved = answered.filter((r) => r.cls.indicative === 'resolved');
    return [
        '| measure | n / denominator |',
        '|---|---:|',
        `| parcels drawn (uniform, seed-stated, over the full municipal Catastro CP population) | ${n} |`,
        `| centroid CONFIRMED by the independent \`wfsCP.aspx\` oracle (same refcat returned at the point) | ${frac(oracleHit.length, n)} |`,
        `| … of which the point had to be relocated to a GetParcel interior point (concave/multipart) | ${relocated.length} |`,
        `| \`service-failure\` (an upstream did not answer — EXCLUDED below) | ${svc.length} |`,
        `| answered points | ${answered.length} |`,
        `| MUIB QUALIFICACIONS returned ≥ 1 polygon at the point | ${frac(withZone.length, answered.length)} |`,
        `| a zone identity reached the record/refusal (CODIMUIB or CODIAJ) | ${frac(zoneIdentified.length, answered.length)} |`,
        `| resolver \`ok\` (zone + fitxa + drawable parameters) | ${frac(ok.length, answered.length)} |`,
        `| fitxa HTML FETCHED by the proxy (first feature's own \`URL\`) — any land class | ${frac(fetched.length, answered.length)} |`,
        `| … of which on SU/SB land (a ZONE fitxa; SR pages are rustic category sheets the resolver never reads) | ${frac(fetchedSuSb.length, fetched.length)} |`,
        `| fitxa READ by the resolver (ok, or refused AFTER parsing) | ${frac(read.length, answered.length)} |`,
        `| fitxa cites an article ON an envelope-bearing parameter (NP/HR/HT/O/E/RA/RF/RM/PE) — per parcel, over ALL fitxes fetched | ${frac(citeOnParams.length, fetched.length)} |`,
        `| fitxa cites an article ON an envelope-bearing parameter — per parcel, over SU/SB fitxes fetched | ${frac(citeOnParamsSuSb.length, fetchedSuSb.length)} |`,
        `| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over ALL fitxes fetched | ${frac(citeAnywhere.length, fetched.length)} |`,
        `| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over SU/SB fitxes fetched | ${frac(citeAnywhereSuSb.length, fetchedSuSb.length)} |`,
        `| \`ok\` records whose \`articleRefs\` is non-empty — over \`ok\` | ${frac(okCite.length, ok.length)} |`,
        `| DISTINCT fitxes (by the feature's own \`URL\`) fetched — any class | ${distinct.size} |`,
        `| … of which cite an article on a parameter | ${frac(distinctCite, distinct.size)} |`,
        `| DISTINCT SU/SB fitxes fetched | ${distinctSuSb.length} |`,
        `| … of which cite an article on a parameter | ${frac(distinctCiteSuSb, distinctSuSb.length)} |`,
        `| \`resolved\` on the INDICATIVE arm (≥ 1 slot) | ${frac(indResolved.length, answered.length)} |`,
        `| \`resolved\` on the DETERMINATION arm (the shipped gate) | ${frac(answered.filter((r) => r.cls.determination === 'resolved').length, answered.length)} |`,
    ];
}

function refusalHistogram(rows: readonly ParcelRecord[]): string[] {
    const h = histogram(rows, (r) => (r.muib.outcome === 'ok' ? 'ok' : r.muib.reason ?? '?'));
    const out = ['| resolver outcome (CLOSED vocabulary, `resolveBalearsMuib.ts`) | n | share of parcels |', '|---|---:|---:|'];
    for (const [k, v] of h) out.push(`| \`${k}\` | ${v} | ${pct(v, rows.length)} |`);
    return out;
}

function zoneHistogram(rows: readonly ParcelRecord[]): string[] {
    const withZone = rows.filter((r) => r.muib.CODIAJ !== null || r.muib.CODIMUIB !== null);
    const h = histogram(withZone, (r) => `${r.muib.CODIAJ ?? '?'} · ${r.muib.CODIMUIB ?? '?'} · ${r.muib.NOM ?? ''} · ${r.muib.CODICLAS ?? '?'}`);
    const out = ['| zone (CODIAJ · CODIMUIB · NOM · CODICLAS — verbatim) | parcels | outcomes |', '|---|---:|---|'];
    for (const [k, v] of h.slice(0, 40)) {
        const rs = withZone.filter((r) => `${r.muib.CODIAJ ?? '?'} · ${r.muib.CODIMUIB ?? '?'} · ${r.muib.NOM ?? ''} · ${r.muib.CODICLAS ?? '?'}` === k);
        const oc = histogram(rs, (r) => (r.muib.outcome === 'ok' ? `ok[${r.envelope.slots.length} slots]` : r.muib.reason ?? '?'))
            .map(([a, b]) => `${a}×${b}`).join(', ');
        out.push(`| ${k.replace(/\|/g, '\\|')} | ${v} | ${oc} |`);
    }
    if (h.length > 40) out.push(`| … ${h.length - 40} more zones | | |`);
    return out;
}

function perParcelTable(rows: readonly ParcelRecord[]): string[] {
    const out = [
        '| muni | refcat | oracle | zone CODIAJ (CODIMUIB) | class | plan | identitat | outcome | slots (indicative arm) | articles on params | articles anywhere |',
        '|---|---|---|---|---|---|---:|---|---|---|---|',
    ];
    for (const r of rows) {
        out.push(
            `| ${r.municipality} | ${r.refcat} | ${r.oracle.final}${r.pointSource === 'getparcel-interior' ? ' (relocated)' : ''} | ` +
                `${r.muib.CODIAJ ?? '—'} (${r.muib.CODIMUIB ?? '—'}) | ${r.muib.CODICLAS ?? '—'} | ${r.muib.CODIPLA ?? '—'} | ` +
                `${r.muib.IDENTITAT ?? '—'} | ${r.muib.outcome === 'ok' ? 'ok' : r.muib.reason} → det:${r.cls.determination} / ind:${r.cls.indicative} | ` +
                `${r.envelope.computed ? (r.envelope.slots.join(', ') || '(0)') : '—'} | ` +
                `${r.fitxa.fetchedByProxy ? (r.fitxa.articleRefsOnParameters.join('; ') || '(none)') : '—'} | ` +
                `${r.fitxa.fetchedByProxy ? (r.fitxa.articleRefsAnywhere.join('; ') || '(none)') : '—'} |`,
        );
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const args = parseArgs();
    minGapMs = args.gapMs;
    const munis = args.muni ? MUNIS.filter((m) => m.key === args.muni) : [...MUNIS];

    // The shipped publication state, READ, not transcribed.
    const posture = envelopePublicationPosture(BALEARS_JURISDICTION_ID);
    const shipped = {
        BALEARS_ENVELOPE_VERIFIED,
        isEnvelopePublicationAuthorised: isEnvelopePublicationAuthorised(BALEARS_JURISDICTION_ID),
        posture: posture.posture,
        authorisationReason: posture.authorisationReason,
        mayDrawEnvelope: mayDrawEnvelope(BALEARS_JURISDICTION_ID),
        mayPublishAsDetermination: mayPublishAsDetermination(BALEARS_JURISDICTION_ID),
        rendererCanExpressOpenTop,
        proxyPathAgrees: SERVER_MUIB_PATH === BALEARS_MUIB_PATH,
    };
    process.stderr.write(`[es-ib] shipped state: ${JSON.stringify(shipped)}\n`);

    const all: ParcelRecord[] = [];
    const frameNotes: Record<string, string> = {};
    const frames: Record<string, { frame: string; points: PointResult[] }> = {};

    for (const muni of munis) {
        const t0 = Date.now();
        const f = await buildFrame(muni.ine, muni.name);
        if (!f.ok) {
            // A frame failure is a FAILURE of this step, reported with its reason — never an empty sample.
            frameNotes[muni.key] = `FRAME FAILED: ${f.reason} — ${f.message ?? ''}`;
            process.stderr.write(`[es-ib] ${muni.key}: ${frameNotes[muni.key]}\n`);
            continue;
        }
        const sample = drawUniform(f.parcels, args.n, args.seed);
        frameNotes[muni.key] =
            `${sample.length} REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed ${args.seed}) over ` +
            `${muni.name}'s FULL INSPIRE CP parcel population of ${f.parcelCount.toLocaleString()} parcels ` +
            `(ATOM enclosure A.ES.SDGC.CP.${muni.ine}.zip, ${(f.gmlBytes / 1e6).toFixed(1)} MB GML, ` +
            `${f.cached ? 'cached' : 'fetched'} ${new Date().toISOString().slice(0, 10)}; CRS read from the file: ` +
            `${f.parcels[0]?.srs ?? '?'}). Each parcel's re-projected centroid was cross-checked against the ` +
            'independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the ' +
            "server's own `fetchBalearsMuibAtPoint` mapping, `asOf` " + args.asOf + '.';
        process.stderr.write(
            `[es-ib] ${muni.key}: ${f.parcelCount.toLocaleString()} parcels in frame (${((Date.now() - t0) / 1000).toFixed(1)}s) → ${sample.length} drawn\n`,
        );

        const rows: ParcelRecord[] = [];
        for (let i = 0; i < sample.length; i++) {
            const p = sample[i]!;
            const r = await probeParcel(muni, p, args, posture);
            rows.push(r);
            all.push(r);
            process.stderr.write(
                `  ${muni.key.padEnd(8)} ${String(i + 1).padStart(2)}/${sample.length} ${r.refcat.padEnd(14)} ` +
                    `oracle=${r.oracle.final.padEnd(12)} ${(r.muib.outcome === 'ok' ? 'ok' : r.muib.reason ?? '?').padEnd(24)} ` +
                    `zone=${(r.muib.CODIAJ ?? '—').padEnd(10)} slots=${r.envelope.slots.length} art=[${r.fitxa.articleRefsOnParameters.join(',')}]\n`,
            );
            await sleep(args.gapMs);
        }
        frames[`${muni.key}/determination`] = { frame: `${frameNotes[muni.key]} ARM: determination (the shipped L-449 gate).`, points: rows.map((r) => toPoint(r, 'determination')) };
        frames[`${muni.key}/indicative`] = { frame: `${frameNotes[muni.key]} ARM: indicative draw (= "if signed" for slot counting).`, points: rows.map((r) => toPoint(r, 'indicative')) };
    }
    const pooled = `both municipalities pooled — ${all.length} real Catastro parcels.`;
    frames['ALL/determination'] = { frame: `${pooled} ARM: determination.`, points: all.map((r) => toPoint(r, 'determination')) };
    frames['ALL/indicative'] = { frame: `${pooled} ARM: indicative draw.`, points: all.map((r) => toPoint(r, 'indicative')) };

    // ── The markdown ────────────────────────────────────────────────────────────────────────────
    const md: string[] = [
        `# Illes Balears (Manacor 07033 + Palma 07040) — envelope slot coverage on REAL parcels, MEASURED ${new Date().toISOString().slice(0, 10)}`,
        '',
        `> Command: \`npx tsx tools/envelope-slot-coverage/measureBalears.ts --n ${args.n} --seed ${args.seed} --gap ${args.gapMs}${args.muni ? ` --muni ${args.muni}` : ''}\` (ONLINE — Catastro ATOM + wfsCP oracle, GOIB MUIB ArcGIS layer 10, muib.caib.es fitxes) · asOf ${args.asOf} · slots: ${ENVELOPE_SLOTS.join(', ')}`,
        '',
        '> ⛔ **NOTHING HERE IS SIGNED.** The shipped publication state was READ from the code at run time:',
        '>',
        `> \`BALEARS_ENVELOPE_VERIFIED\` = **${String(shipped.BALEARS_ENVELOPE_VERIFIED)}** · \`isEnvelopePublicationAuthorised('${BALEARS_JURISDICTION_ID}')\` = **${String(shipped.isEnvelopePublicationAuthorised)}** · ` +
            `\`envelopePublicationPosture\` = **\`${shipped.posture}\`** (authorisationReason \`${shipped.authorisationReason}\`) · \`mayDrawEnvelope\` = ${String(shipped.mayDrawEnvelope)} · ` +
            `\`mayPublishAsDetermination\` = **${String(shipped.mayPublishAsDetermination)}** · \`rendererCanExpressOpenTop\` = ${String(shipped.rendererCanExpressOpenTop)} · ` +
            `server proxy path == client path: ${String(shipped.proxyPathAgrees)}`,
        '>',
        '> **AS SHIPPED — determination arm: 0 numbers reach a user as a determination** (gate SHUT ⇒ every `ok` resolution is F1 by `measureEs.ts`\'s own rule). ' +
            (shipped.posture === 'open-top-indicative' && shipped.rendererCanExpressOpenTop
                ? '**AS SHIPPED — indicative arm: the editor DOES compute and draw an OPEN-TOP INDICATIVE solid from the fitxa\'s numbers** (`applyBalearsZoningThenFallback`, stamped `open-top-indicative`, claims no buildable right). ' +
                  '⚠ That function\'s comment near line 7870 (“BOTH ARE UNREACHABLE TODAY … `OPEN_TOP_INDICATIVE_JURISDICTIONS` ships empty”) is STALE — the registry lists Balears. '
                : '**Indicative arm: not drawable** (posture is not `open-top-indicative`, or the renderer cannot express an open top). ') +
            '**IF SIGNED:** the slot counts equal the indicative arm — a signature changes the stamp, not which slots the fitxa fills.',
        '',
    ];

    for (const muni of munis) {
        const rows = all.filter((r) => r.municipality === muni.key);
        md.push(`## ${muni.name} (INE ${muni.ine})`, '', `**Frame:** ${frameNotes[muni.key] ?? '(no frame)'}`, '');
        if (rows.length === 0) { md.push('_No parcels probed — see the frame note above._', ''); continue; }
        md.push('### Headline counts', '', ...headlineTable(rows), '');
        md.push('### Resolver outcome histogram', '', ...refusalHistogram(rows), '');
        md.push('### Zones seen', '', ...zoneHistogram(rows), '');
        for (const arm of ['determination', 'indicative'] as const) {
            const k = `${muni.key}/${arm}`;
            md.push(renderMarkdown(`Frame \`${k}\``, report(frames[k]!.points), frames[k]!.frame), '');
        }
    }

    md.push('## Both municipalities pooled', '');
    if (all.length > 0) {
        md.push('### Headline counts', '', ...headlineTable(all), '');
        md.push('### Resolver outcome histogram', '', ...refusalHistogram(all), '');
    }
    for (const arm of ['determination', 'indicative'] as const) {
        const k = `ALL/${arm}`;
        md.push(renderMarkdown(`Frame \`${k}\``, report(frames[k]!.points), frames[k]!.frame), '');
    }

    // The F1/F2 seam, made visible where it bites.
    const pnc = all.filter((r) => r.muib.reason === 'plan-not-current');
    if (pnc.length > 0) {
        const byMuni = histogram(pnc, (r) => r.municipality).map(([k, v]) => `${k} ${v}`).join(', ');
        md.push(
            '### ⚠ The ratified F1/F2 seam on `plan-not-current`',
            '',
            `\`balearsRefusal('plan-not-current')\` ships \`legallyGrounded: true\` (“grounded in the PUBLISHER'S OWN statement”), so \`classifyRefusal\` files the **${pnc.length}** such parcels (${byMuni}) as **F2 correct-null** and they LEAVE the answerable denominator. ` +
                'Read literally against the brief\'s F1 definition (“a plan governs, no mechanism — GAP”) these are land where a plan DOES govern and PRYZM has no current mechanism; the publisher merely says MUIB is out of date there. ' +
                'This harness does NOT re-class them (no rival vocabulary — `slots.ts` header), but it prints the alternative so nobody reads Palma\'s absence from the F1 build queue as coverage: ' +
                `if \`plan-not-current\` were read as F1, the pooled answerable denominator would be ${report(frames['ALL/indicative']!.points).answerablePoints + pnc.length} instead of ${report(frames['ALL/indicative']!.points).answerablePoints}, and the indicative slot coverage ` +
                `${(() => { const r = report(frames['ALL/indicative']!.points); const d = 8 * (r.answerablePoints + pnc.length); return d === 0 ? 'n/a' : `${((100 * r.slotsResolvedTotal) / d).toFixed(1)} %`; })()} instead of ` +
                `${(() => { const r = report(frames['ALL/indicative']!.points); return r.slotCoveragePct === null ? 'null' : `${r.slotCoveragePct.toFixed(1)} %`; })()}.`,
            '',
        );
    }

    // Upstream HTTP behaviour — so a refusal can be traced to its transport cause.
    md.push('### Upstream HTTP log (every outbound request this run made)', '', '| host | status | n | median ms |', '|---|---|---:|---:|');
    for (const [k, v] of histogram(httpLog, (h) => `${h.host} ${h.status}`)) {
        const [host, status] = k.split(' ');
        const ms = httpLog.filter((h) => `${h.host} ${h.status}` === k).map((h) => h.ms).sort((a, b) => a - b);
        md.push(`| ${host} | ${status} | ${v} | ${ms[Math.floor(ms.length / 2)] ?? 0} |`);
    }
    md.push(`| (fitxa cache) | served from per-run cache | ${all.filter((r) => r.fitxa.fetchedByProxy).length - httpLog.filter((h) => h.host === 'muib.caib.es').length} | |`, '');

    if (crossCheckMismatches.length > 0) {
        md.push('### ⚠ Article cross-check mismatches (resolver `articleRefs` vs harness re-parse)', '', ...crossCheckMismatches.map((s) => `- ${s}`), '');
    } else {
        md.push(`_Article cross-check: the resolver's \`articleRefs\` and this harness's re-parse of the same HTML agree on every \`ok\` record (${all.filter((r) => r.muib.outcome === 'ok').length})._`, '');
    }

    md.push('## Per-parcel records', '', ...perParcelTable(all), '');
    md.push(
        '---',
        '',
        '_Method notes._ (1) The parcel frame is the Catastro INSPIRE CP ATOM enclosure per municipality (`tools/cold-start-probe/catastroParcelFrame.mjs`), NOT `wfsCP.aspx`; `wfsCP.aspx` is the independent oracle (`validateReprojection.mjs` shape). ' +
            '(2) The zoning leg calls the SHIPPED `resolveBalearsMuib` with a `fetchImpl` that answers `/api/es/balears-muib` by calling the server\'s own `fetchBalearsMuibAtPoint` — the production upstream URL and fitxa SSRF guard, imported. ' +
            '(3) The envelope leg is the editor\'s drawing-arm call (`balearsResolvedPack` → `computeBuildableEnvelope`) on the harness\'s neutral 40 m square ring, so slot figures are comparable with the ES/PT arms; the real ring is NOT used for the slot count (the ring is not the subject). ' +
            '(4) F1/F2 is `classifyRefusal` over the shipped `balearsRefusal().legallyGrounded`; transient reasons are `service-failure`; `no-zoning-here` is `no-plan-served`. ' +
            '(5) Same fitxa URL is fetched once per run (per-run cache); all requests are sequential with a stated gap.',
    );

    writeArtefact('es-ib', { ...args, shipped }, frames, md.join('\n'));
    fs.writeFileSync(
        path.join(HERE, 'out', 'es-ib.parcels.json'),
        `${JSON.stringify({ version: '1.0', measuredAt: new Date().toISOString(), args, shipped, frameNotes, httpLog, crossCheckMismatches, parcels: all }, null, 2)}\n`,
        'utf8',
    );
    process.stdout.write(`${md.join('\n')}\n`);
}

void main().catch((e: unknown) => {
    process.stderr.write(`[envelope-slot-coverage/es-ib] FAILED: ${String((e as Error)?.stack ?? e)}\n`);
    // Exit 2 on a harness failure — a service outage must NEVER render as "0 % coverage".
    process.exit(2);
});
