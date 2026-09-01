// E7-NO — NORWAY (NO) · parcel arm: Kartverket Matrikkelen `app:Teig`.
//
// §J: `parcel: ParcelProvider — resolve(point|bbox) -> FetchOutcome<ParcelFeature>`.
// Schema mapping ONLY — no business logic. Geometry stays in the NATIVE CRS with the CRS
// carried on the object (E1a `NativeCrsGeometry` discipline).
//
// A TEIG IS NOT A PROPERTY, AND THE DISTINCTION IS LOAD-BEARING (SOSI, verbatim): a *teig* is
// one contiguous PARCEL OF LAND; a *matrikkelenhet* is the registered PROPERTY UNIT it belongs
// to. One matrikkelenhet can own several teiger (a farm with detached fields), and one teig can
// carry several matrikkelenheter (`teigMedFlereMatrikkelenheter`, served as a boolean —
// measured `false` on all three Bergen teigs). This module returns the TEIG and names its
// matrikkelnummer; it never asserts that the teig IS the property.
//
// MEASURED SCHEMA (GetFeature 2026-09-01, Bergen teiger 4601-167/714, /717, /718 — all three
// pinned in `__tests__/fixtures/no-nap-matrikkel/matrikkel-teig-bergen-4601-167.xml`):
//   identTeig/IdentTeig{teigId, navnerom, versjonId} · datafangstdato · oppdateringsdato ·
//   representasjonspunkt (gml:Point, EPSG:25833) · område (gml:Polygon, EPSG:25833) ·
//   kommunenummer · kommunenavn · matrikkelenhet/Matrikkelenhet{kommunenummer, gardsnummer,
//   bruksnummer, bruksnavn, matrikkelenhetstype, punktfeste, avklartEiere, avklartAndeler,
//   harAvtaleGrensePunktfeste, harAvtaleStedbundenRettighet, harGrunnforurensing,
//   harKulturminne, harRegistrertGrunnerverv, harRegistrertJordskifteKrevd, matrikkelenhetId,
//   uuidMatrikkelenhet} · matrikkelnummerTekst ("164/904") · teigMedFlereMatrikkelenheter ·
//   tvist · uregistrertJordsameie · avklartEiere · teigareal/Areal/lagretBeregnetAreal ·
//   noyaktighetsklasseTeig ("Gult") · uuidTeig.
//
// ⭐ `representasjonspunkt` IS THE STATE'S OWN REPRESENTATIVE POINT, and it is why this adapter
// contains no geometry math. EE had to replace a vertex-mean centroid with a server-side ring
// intersection because a computed centroid falls outside a concave parcel and silently queries
// the neighbour's plan. Norway serves the point itself, in the same CRS the plan service
// accepts — so the plan leg is a point query on a state-published point, with nothing derived.
//
// ⛔ NO OWNERSHIP. `avklartEiere` / `matrikkelenhetstype` / `punktfeste` are STATUS FLAGS, not
// owner identity. The full Matrikkel ownership API (matrikkel.no) is free but agreement-gated;
// this adapter neither calls it nor infers from these flags.
//
// ⛔ BLOCKED TODAY: see `noMatrikkelClient.ts` measured fact 6 — the shared XML scanner refuses
// `app:område`, so `noWfsGetMembers` returns a self-naming transient and this module's parse
// never runs against the live service. The PARSE ITSELF is complete and is tested against a
// hand-built element tree, so the arm is one shared-file line away from live.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { XmlElement } from '../../parsers/appGml/xmlScan.js';
import {
    appChild,
    appText,
    buildTeigNativeBboxUrl,
    buildTeigWgs84BboxUrl,
    noWfsGetMembers,
    readGmlExteriorRing,
    readGmlPos,
    NO_NATIVE_CRS,
    type NoFetchDeps,
} from './noMatrikkelClient.js';

const tracer = trace.getTracer('pryzm.siteintel.no');

/** Provider/provenance id for registry + attribution. */
export const NO_PARCEL_PROVIDER_ID = 'geonorge-no';
export const NO_PARCEL_PROVIDER_LABEL = 'Matrikkelen (Norway · Kartverket)';

/** The matrikkelenhet (registered property unit) a teig belongs to, as served. */
export interface NoMatrikkelenhet {
    /** `kommunenummer/gardsnummer/bruksnummer` — the national parcel-id scheme, verbatim. */
    readonly kommunenummer: string | null;
    readonly gardsnummer: string | null;
    readonly bruksnummer: string | null;
    readonly bruksnavn: string | null;
    /** `Grunneiendom` / `Festegrunn` / … — mirrored, never harmonised. */
    readonly matrikkelenhetstype: string | null;
    readonly matrikkelenhetId: string | null;
    readonly uuidMatrikkelenhet: string | null;
    /** Served status flags, verbatim strings ('true'/'false') — NOT owner identity. */
    readonly flags: Readonly<Record<string, string>>;
}

/** A resolved Norwegian teig — identity + native-CRS geometry, nothing invented. */
export interface NoCadastralTeig {
    /** `identTeig/teigId` — the durable teig identity. */
    readonly teigId: string | null;
    /** `uuidTeig` — the stable UUID. */
    readonly uuidTeig: string | null;
    /** `identTeig/versjonId`. */
    readonly versjonId: string | null;
    /** `matrikkelnummerTekst`, e.g. `164/904`. */
    readonly matrikkelnummerTekst: string | null;
    readonly kommunenummer: string | null;
    readonly kommunenavn: string | null;
    readonly matrikkelenhet: NoMatrikkelenhet | null;
    /** `teigareal/Areal/lagretBeregnetAreal` in m² — the register's own number, never derived. */
    readonly areaM2: number | null;
    /** `noyaktighetsklasseTeig` (e.g. `Gult`) — the register's boundary-quality class, verbatim. */
    readonly noyaktighetsklasse: string | null;
    /** True when the served teig carries MORE THAN ONE matrikkelenhet (SOSI flag, verbatim). */
    readonly teigMedFlereMatrikkelenheter: boolean | null;
    /** `datafangstdato` / `oppdateringsdato`, exactly as served (may carry a time part). */
    readonly datafangstdato: string | null;
    readonly oppdateringsdato: string | null;
    /**
     * The state's own representative point `[easting, northing]` in {@link crs}. THE plan-query
     * anchor — never a computed centroid.
     */
    readonly representasjonspunkt: readonly [number, number] | null;
    /** Outer ring in {@link crs} — [E,N] pairs exactly as served, never reprojected. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `representasjonspunkt` and `ring` (native-CRS-on-the-object discipline). */
    readonly crs: string;
    /** Provenance tag — always `geonorge-no`. */
    readonly source: string;
}

const BOOLEAN_FLAG_NAMES = [
    'punktfeste',
    'avklartEiere',
    'avklartAndeler',
    'harAvtaleGrensePunktfeste',
    'harAvtaleStedbundenRettighet',
    'harGrunnforurensing',
    'harKulturminne',
    'harRegistrertGrunnerverv',
    'harRegistrertJordskifteKrevd',
] as const;

function boolOf(raw: string | null): boolean | null {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
}

function numOf(raw: string | null): number | null {
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/**
 * PURE: one `app:Teig` element -> {@link NoCadastralTeig}, or null when it carries neither a
 * `teigId` nor a `matrikkelnummerTekst` (a teig with no identity is not a parcel).
 *
 * ⚠ The CRS is taken from the geometry's OWN `srsName` when it carries one, and falls back to
 * {@link NO_NATIVE_CRS} only when the element declares none — the CRS is never assumed away.
 */
export function parseNoTeigElement(el: XmlElement): NoCadastralTeig | null {
    const ident = appChild(el, 'identTeig');
    const identInner = ident !== null ? appChild(ident, 'IdentTeig') : null;
    const teigId = identInner !== null ? appText(identInner, 'teigId') : null;
    const matrikkelnummerTekst = appText(el, 'matrikkelnummerTekst');
    if (teigId === null && matrikkelnummerTekst === null) return null;

    const meWrap = appChild(el, 'matrikkelenhet');
    const me = meWrap !== null ? appChild(meWrap, 'Matrikkelenhet') : null;
    let matrikkelenhet: NoMatrikkelenhet | null = null;
    if (me !== null) {
        const flags: Record<string, string> = {};
        for (const name of BOOLEAN_FLAG_NAMES) {
            const v = appText(me, name);
            if (v !== null) flags[name] = v;
        }
        matrikkelenhet = {
            kommunenummer: appText(me, 'kommunenummer'),
            gardsnummer: appText(me, 'gardsnummer'),
            bruksnummer: appText(me, 'bruksnummer'),
            bruksnavn: appText(me, 'bruksnavn'),
            matrikkelenhetstype: appText(me, 'matrikkelenhetstype'),
            matrikkelenhetId: appText(me, 'matrikkelenhetId'),
            uuidMatrikkelenhet: appText(me, 'uuidMatrikkelenhet'),
            flags,
        };
    }

    const arealWrap = appChild(el, 'teigareal');
    const areal = arealWrap !== null ? appChild(arealWrap, 'Areal') : null;

    const rpWrap = appChild(el, 'representasjonspunkt');
    const rp = rpWrap !== null ? readGmlPos(rpWrap) : null;
    // `område` is the polygon container. Its NAME is what the shared scanner currently refuses
    // (client fact 6), so in practice this lookup only succeeds on a tree built by a fixed
    // scanner — the parse is written for that tree, not around the defect.
    const omradeWrap = appChild(el, 'område');
    const ringRead = omradeWrap !== null ? readGmlExteriorRing(omradeWrap) : readGmlExteriorRing(el);

    const crs = normaliseSrs(rp?.srsName ?? ringRead?.srsName ?? null) ?? NO_NATIVE_CRS;

    return {
        teigId,
        uuidTeig: appText(el, 'uuidTeig'),
        versjonId: identInner !== null ? appText(identInner, 'versjonId') : null,
        matrikkelnummerTekst,
        kommunenummer: appText(el, 'kommunenummer'),
        kommunenavn: appText(el, 'kommunenavn'),
        matrikkelenhet,
        areaM2: areal !== null ? numOf(appText(areal, 'lagretBeregnetAreal')) : null,
        // NOTE the ASCII spelling: the register serves `noyaktighetsklasseTeig` without the ø.
        noyaktighetsklasse: appText(el, 'noyaktighetsklasseTeig'),
        teigMedFlereMatrikkelenheter: boolOf(appText(el, 'teigMedFlereMatrikkelenheter')),
        datafangstdato: appText(el, 'datafangstdato'),
        oppdateringsdato: appText(el, 'oppdateringsdato'),
        representasjonspunkt: rp?.pos ?? null,
        ring: ringRead?.ring ?? [],
        crs,
        source: NO_PARCEL_PROVIDER_ID,
    };
}

/** `urn:ogc:def:crs:EPSG::25833` -> `EPSG:25833`; an already-short form passes through. */
export function normaliseSrs(srsName: string | null): string | null {
    if (srsName === null || srsName.trim() === '') return null;
    const m = /EPSG:{1,2}(\d+)$/.exec(srsName.trim());
    return m ? `EPSG:${m[1]}` : srsName.trim();
}

/**
 * Resolve the teiger at a WGS84 point via a tiny lat,lon urn-ordered bbox — the server
 * reprojects; this module does NO projection. Returns ALL teiger the window touched, in served
 * order: at a boundary a click legitimately touches several, and silently keeping the first
 * would be an invented choice.
 */
export async function resolveNoTeigerAtWgs84Point(
    lat: number,
    lon: number,
    deps: NoFetchDeps = {},
    halfWindowDeg = 0.0002,
): Promise<FetchOutcome<readonly NoCadastralTeig[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.resolveTeigerAtPoint',
        async (span): Promise<FetchOutcome<readonly NoCadastralTeig[]>> => {
            try {
                span.setAttribute('no.lat', lat);
                span.setAttribute('no.lon', lon);
                const d = halfWindowDeg;
                const url = buildTeigWgs84BboxUrl(lat - d, lon - d, lat + d, lon + d, 10);
                const outcome = await noWfsGetMembers(
                    url,
                    `app:Teig @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                    deps,
                );
                const result = membersToTeiger(outcome, `@${lat},${lon}`);
                span.setStatus(
                    result.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: result.reason }
                        : { code: SpanStatusCode.OK },
                );
                return result;
            } finally {
                span.end();
            }
        },
    );
}

/** Resolve the teiger at a NATIVE (E,N) EPSG:25833 point — same shape, no projection. */
export async function resolveNoTeigerAtNativePoint(
    easting: number,
    northing: number,
    deps: NoFetchDeps = {},
    halfWindowM = 5,
): Promise<FetchOutcome<readonly NoCadastralTeig[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.resolveTeigerAtNativePoint',
        async (span): Promise<FetchOutcome<readonly NoCadastralTeig[]>> => {
            try {
                const url = buildTeigNativeBboxUrl(
                    easting - halfWindowM,
                    northing - halfWindowM,
                    easting + halfWindowM,
                    northing + halfWindowM,
                    10,
                );
                const outcome = await noWfsGetMembers(
                    url,
                    `app:Teig @ ${NO_NATIVE_CRS} ${easting},${northing}`,
                    deps,
                );
                const result = membersToTeiger(outcome, `@${easting},${northing}`);
                span.setStatus(
                    result.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: result.reason }
                        : { code: SpanStatusCode.OK },
                );
                return result;
            } finally {
                span.end();
            }
        },
    );
}

function membersToTeiger(
    outcome: FetchOutcome<readonly { readonly element: XmlElement }[]>,
    label: string,
): FetchOutcome<readonly NoCadastralTeig[]> {
    if (outcome.status !== 'found') return outcome;
    const teiger: NoCadastralTeig[] = [];
    for (const m of outcome.value) {
        const parsed = parseNoTeigElement(m.element);
        if (parsed !== null) teiger.push(parsed);
    }
    if (teiger.length === 0) {
        // The transport found members but NONE carried an identity — that is a schema
        // surprise, not a coverage fact, so it is transient and it says so.
        return fetchTransient(
            `upstream-failed: ${outcome.value.length} wfs:member(s) but no app:Teig carried a ` +
                `teigId or matrikkelnummerTekst (${label})`,
        );
    }
    return { status: 'found', value: teiger };
}
