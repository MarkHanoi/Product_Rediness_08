// LANE ME-GULF — GULF (GCC) · the DECLARED-DEFERRAL registry for the parcel axis.
//
// [[identity-bootstrap-gate-offline-legislation-pattern]] · C74 §3.2/§3.3/§3.4/§3.8 · the SE
// (`seNgpGate.ts`) precedent, applied to the six probed Gulf jurisdictions of this lane.
//
// ⛔ THERE IS NO CADASTRE CLIENT IN THIS ADAPTER, AND THAT IS THE DELIVERABLE. Every Gulf parcel
// channel this lane probed (2026-09-02, re-probed 2026-09-03; transcripts under
// `audit/intl-parcels/2026-09-02/transcripts-me-gulf/`) is GATED or vantage-BLOCKED. Per the
// founder brief ("if a keyless parcel layer exists, WIRE it; else declared deferral naming the
// exact gate") and [[fake-more-capable-than-real]] (a client built from a spec cannot falsify the
// spec), this module ships NO URL builder that pretends to work and NO parser written against
// bytes nobody has fetched — only a self-announcing, measured, dated deferral per jurisdiction.
//
// ── C74 §3.2 — every refusal names itself with GULF_DEFERRED_TOKEN and stamps its span. ────────
// ── C74 §3.3 — "not configured" ≠ "rejected" ≠ "no channel": each descriptor states WHICH. ─────
// ── C74 §3.4 — each descriptor carries owner/declaredOn/reviewBy + a retirement condition, and
//    {@link assertGulfDeferralsNotExpired} THROWS BY NAME after reviewBy so a deferral cannot
//    silently become permanent architecture nobody chose. ────────────────────────────────────

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.gulf');

/**
 * The distinguished token every Gulf deferred refusal carries in its reason (C74 §3.2). Grep-able,
 * assertable, impossible to confuse with a real upstream failure. It rides on the L0 transient
 * token `endpoint-unreachable:` (TRANSIENT_FETCH_REASONS) — no new refusal-token SPELLING is minted
 * (L-12874): a Gulf deferral is emphatically TRANSIENT ("the source did not answer from here — a
 * credential or an in-region vantage would change the answer"), never `absent`.
 */
export const GULF_DEFERRED_TOKEN = 'gulf-gcc-gate-deferred';

/** How a Gulf parcel channel is closed to us — operationally distinct, from the closed set below. */
export type GulfGateClass =
    /** Data hosts drop foreign SYNs (TCP connect timeout); a CDN-fronted corporate site may answer. */
    | 'vantage-network-fence'
    /** An F5 / application WAF serves the human UI but rejects every machine path from our vantage. */
    | 'waf'
    /** The service answers, but every data folder needs an ArcGIS token from a national SSO/identity. */
    | 'token-sso'
    /** Parcel e-services sit behind a national eKey/identity login (fee schedule typically applies). */
    | 'ekey-identity'
    /** No open machine channel was proven either way from our vantage (hosts unreachable / NXDOMAIN). */
    | 'no-open-channel';

/** One jurisdiction's declared deferral — self-announcing, measured, dated (C74 §3.4). */
export interface GulfDeferral {
    /** Registry regionCode this deferral backs (`AE` · `AE-DU` · `AE-AZ` · `SA` · `KW` · `BH` · `OM`). */
    readonly regionCode: string;
    readonly jurisdictionName: string;
    readonly gateClass: GulfGateClass;
    /** The authoritative hosts/paths probed — verbatim, so a future live response can be compared. */
    readonly gatedEndpoints: readonly string[];
    /** The MEASURED signal that the gate is real, not assumed (status + a payload fact). */
    readonly evidence: string;
    /** Repo-relative path to the captured live probe transcript. */
    readonly transcript: string;
    readonly owner: string;
    readonly declaredOn: string;
    /** Assert-by date. After this, {@link assertGulfDeferralsNotExpired} throws (C74 §3.4). */
    readonly reviewBy: string;
    /** What must happen for this deferral to be RETIRED (the wire that would replace it). */
    readonly retiredBy: string;
}

const T = 'audit/intl-parcels/2026-09-02/transcripts-me-gulf';

/**
 * The six probed Gulf parcel jurisdictions, keyed by registry regionCode. Dubai and Abu Dhabi are
 * DISTINCT descriptors (distinct gate CLASSES — a vantage TCP-fence vs an F5 WAF) even though both
 * back the single `AE` footprint-fallback registry row: the row is one routing seat, the gate
 * provenance is per-emirate and named here so neither emirate's exact gate is lost (the founder
 * named both as spend targets).
 */
export const GULF_DEFERRALS: Readonly<Record<string, GulfDeferral>> = Object.freeze({
    'AE-DU': {
        regionCode: 'AE-DU',
        jurisdictionName: 'Dubai (emirate · Dubai Pulse / Dubai Municipality GIS)',
        gateClass: 'vantage-network-fence',
        gatedEndpoints: [
            'https://www.dubaipulse.gov.ae/',
            'https://geodubai.dm.gov.ae/arcgis/rest/services',
            'https://gis.dm.gov.ae/',
        ],
        evidence:
            'TCP connect timeout (~21 s, RC=28) on every authoritative data host, re-probed ' +
            '2026-09-03 from this environment — matching the 2026-09-02 French-IP sweep; the ' +
            'CDN-fronted corporate site www.dm.gov.ae answers HTTP 200 (Azure Front Door). AGOL ' +
            'past-the-viewer: the official org dubaimunicipalityitd exposes ONE public item (a ' +
            '"Dubai Municipality HQ" web map, operationalLayers=0, OSM basemap) and NO hosted ' +
            'parcel FeatureServer; a Dubai-parcel AGOL search surfaces only third-party demos ' +
            '(Urban_Sydney, gistec_agol reseller, jsaligoe_esri DEMO). No keyless parcel layer exists.',
        transcript: `${T}/dubai.txt`,
        owner: 'lane ME-GULF (geo-expansion wave)',
        declaredOn: '2026-09-02',
        reviewBy: '2027-03-02',
        retiredBy:
            'the same four data hosts re-probed from an in-UAE/GCC vantage (to separate geo-fence ' +
            'from outage), OR a Dubai Pulse account authorised for the dm-gis parcel datasets; then ' +
            'a client written against RECORDED BYTES from geodubai.dm.gov.ae, never against a spec',
    },
    'AE-AZ': {
        regionCode: 'AE-AZ',
        jurisdictionName: 'Abu Dhabi (emirate · data.abudhabi DKAN / DMT geoportal)',
        gateClass: 'waf',
        gatedEndpoints: [
            'https://data.abudhabi/opendata/data.json',
            'https://data.abudhabi/opendata/api/1/metastore/schemas/dataset/items',
            'https://geoportal.dmt.gov.ae/',
            'https://sdi.gsec.abudhabi/',
        ],
        evidence:
            'F5 BIG-IP WAF "Request Rejected" (support IDs 11709459135382448544 / …54836965) on ' +
            'data.json and search/type/dataset; the DKAN metastore REST API TCP-times-out (25 s); ' +
            '/api/1/search returns a 500-class "unexpected error"; all five legacy AD-SDI hosts ' +
            '(geoportal.dmt.gov.ae, sdi.gsec.abudhabi, geoportal.abudhabi.ae, www.abudhabimaps.ae, ' +
            'adgeospatial.gov.ae) are NXDOMAIN/unreachable; 0 official Abu Dhabi parcel FeatureServers ' +
            'on AGOL. UAE PASS (Emirates-ID national identity) is the expected credential class but ' +
            'nothing reachable presented a login to measure it. Re-probed 2026-09-03.',
        transcript: `${T}/abudhabi.txt`,
        owner: 'lane ME-GULF (geo-expansion wave)',
        declaredOn: '2026-09-02',
        reviewBy: '2027-03-02',
        retiredBy:
            'data.json + the DKAN metastore API re-probed from an in-UAE vantage (to separate the ' +
            'F5 geo-fence from a global block), the dataset licences read, and a UAE-PASS/credential ' +
            'class measured; then a DKAN client written against RECORDED BYTES',
    },
    SA: {
        regionCode: 'SA',
        jurisdictionName: 'Saudi Arabia (Balady / U-Maps national cadastre)',
        gateClass: 'token-sso',
        gatedEndpoints: [
            'https://umaps.momah.gov.sa/server/rest/services/umaps',
            'https://umaps.momah.gov.sa/server/rest/services/Hosted',
            'https://ssoapp.balady.gov.sa',
        ],
        evidence:
            'L-606 DELTA (the fence CHANGED CLASS): the ArcGIS Enterprise 11.5 root + portal now ' +
            'ANSWER a foreign IP (umaps.balady.gov.sa 301→umaps.momah.gov.sa; /server/rest/services ' +
            '→ folders [Hosted,umaps,Utilities]; /portal/sharing/rest → enterpriseVersion 11.5.0) — ' +
            'they did NOT in the L-606 WAF era. But every DATA folder returns ArcGIS ' +
            '{"error":{"code":499,"message":"Token Required"}} (re-probed x3, stable), and the viewer ' +
            'bundle authenticates against ssoapp.balady.gov.sa (Balady SSO / Nafath national identity). ' +
            'The old backend umapsudp.momrah.gov.sa is dead DNS. Re-probed 2026-09-03.',
        transcript: `${T}/saudi.txt`,
        owner: 'lane ME-GULF (geo-expansion wave)',
        declaredOn: '2026-09-02',
        reviewBy: '2027-03-02',
        retiredBy:
            'a Balady SSO account (Saudi Nafath national identity) OR a MOMRAH data agreement — an ' +
            'in-SA proxy alone NO LONGER suffices, the gate is credential-class not IP-class (this is ' +
            'the L-606 delta). Rules for SA are already banked NATIONALLY (2024 MOMRAH decision, ' +
            'SAUDI-MASTER-DATA-SOURCE-STUDY.md); only parcels+zoning geometry are behind this gate.',
    },
    KW: {
        regionCode: 'KW',
        jurisdictionName: 'Kuwait (PACI civil-information parcel/address layer)',
        gateClass: 'no-open-channel',
        gatedEndpoints: [
            'https://kuwaitfinder.paci.gov.kw/',
            'https://services.paci.gov.kw/arcgis/rest/services',
            'https://kuwaitportal.paci.gov.kw/arcgisportal/sharing/rest',
        ],
        evidence:
            'PACI portal hosts are TCP-unreachable / schannel cert-expired / connection-reset from ' +
            'our vantage; the one responsive host exposes no ArcGIS REST surface at guessable paths ' +
            '(302→/error/404); mapapi/geoportal/data.paci.gov.kw are NXDOMAIN. No parcel/zoning/' +
            'building channel proven; gate class unmeasurable from this vantage. Re-probed 2026-09-03.',
        transcript: `${T}/kw-bh-om.txt`,
        owner: 'lane ME-GULF (geo-expansion wave)',
        declaredOn: '2026-09-02',
        reviewBy: '2027-03-02',
        retiredBy:
            'the PACI hosts re-probed from an in-GCC vantage (KuwaitFinder’s public mobile app ' +
            'implies a queryable backend), then the KuwaitFinder API terms read',
    },
    BH: {
        regionCode: 'BH',
        jurisdictionName: 'Bahrain (SLRB Survey & Land Registration Bureau cadastre)',
        gateClass: 'ekey-identity',
        gatedEndpoints: ['https://www.slrb.gov.bh/', 'https://www.data.gov.bh/api/datasets/1.0/search/'],
        evidence:
            'SLRB corporate site answers HTTP 200 and names cadastral services routed through the ' +
            'national eKey login; every guessable GIS hostname (bahrainmaps.bh, gisbahrain.bh, ' +
            'gis.slrb.gov.bh, bsdi.bh) is NXDOMAIN; the open-data portal data.gov.bh holds only ' +
            'STATISTICS tables (q=parcel → 4 hits, all subdivision-regulation tables, no geometry; ' +
            'q=cadastral → 0). Re-probed 2026-09-03.',
        transcript: `${T}/kw-bh-om.txt`,
        owner: 'lane ME-GULF (geo-expansion wave)',
        declaredOn: '2026-09-02',
        reviewBy: '2027-03-02',
        retiredBy:
            'SLRB e-services accessed via the national eKey identity (fee schedule read), OR benayat.bh’s ' +
            'authenticated building-permit APIs probed; then a client written against recorded bytes',
    },
    OM: {
        regionCode: 'OM',
        jurisdictionName: 'Oman (NSDI / Ministry of Housing & Urban Planning krooki authority)',
        gateClass: 'no-open-channel',
        gatedEndpoints: ['https://onsdi.ncsi.gov.om/', 'https://www.housing.gov.om/'],
        evidence:
            'The Oman NSDI host onsdi.ncsi.gov.om resolves but drops foreign TCP (all paths ~21 s ' +
            'timeout); the Ministry of Housing & Urban Planning (the krooki/plot-certificate authority) ' +
            'WAF-403s; nsdi.gov.om/geoportal.gov.om/maps.gov.om are NXDOMAIN; data.gov.om is ' +
            'statistics-only. No parcel/zoning/building channel measurable; gate class UNKNOWN ' +
            '(agency-registration vs geo-fence) from this vantage. Re-probed 2026-09-03.',
        transcript: `${T}/kw-bh-om.txt`,
        owner: 'lane ME-GULF (geo-expansion wave)',
        declaredOn: '2026-09-02',
        reviewBy: '2027-03-02',
        retiredBy:
            'onsdi + housing.gov.om re-probed from an in-region vantage to classify the gate ' +
            '(registration vs geo-fence), then NSDI access arranged per its public materials',
    },
});

/**
 * C74 §3.4 — throws BY NAME once `todayIso` passes any descriptor's `reviewBy`, naming the owner,
 * the jurisdiction and the retirement condition, so the failure tells the reader what to do rather
 * than only that something is old. PURE. Do NOT extend a reviewBy to silence this — re-take the
 * decision (re-probe from an in-region vantage) explicitly.
 */
export function assertGulfDeferralsNotExpired(todayIso: string): void {
    const expired = Object.values(GULF_DEFERRALS).filter((d) => todayIso > d.reviewBy);
    if (expired.length > 0) {
        const lines = expired
            .map(
                (d) =>
                    `  • ${d.regionCode} (${d.jurisdictionName}) — declared ${d.declaredOn} by ${d.owner}, ` +
                    `reviewBy ${d.reviewBy}. Retire by: ${d.retiredBy}. Transcript: ${d.transcript}.`,
            )
            .join('\n');
        throw new Error(
            `[gulf] ${expired.length} Gulf parcel DEFERRAL(s) passed reviewBy (today ${todayIso}) and ` +
                `were not retired:\n${lines}\nRe-take each decision explicitly (re-probe from an ` +
                `in-region vantage) — do not extend a reviewBy to silence this.`,
        );
    }
}

/**
 * The ONE refusal every gated Gulf parcel leg returns (C74 §3.2). Transient — the source exists and
 * a credential / an in-region vantage would change the answer, so this is emphatically NOT `absent`
 * (calling a gated national cadastre "no parcel here" is the §CONTEXT-DATA-HONESTY conflation).
 * Rides the L0 `endpoint-unreachable:` token (L-12874 — no new spelling minted) and carries
 * {@link GULF_DEFERRED_TOKEN}; stamps `gulf.deferred=true` on its span.
 */
export function gulfDeferredRefusal<T>(regionCode: string, leg: string): FetchOutcome<T> {
    return tracer.startActiveSpan('pryzm.siteintel.gulf.deferred', (span): FetchOutcome<T> => {
        try {
            const d = GULF_DEFERRALS[regionCode];
            span.setAttribute('gulf.deferred', true);
            span.setAttribute('gulf.deferred.region', regionCode);
            span.setAttribute('gulf.deferred.leg', leg);
            if (d) span.setAttribute('gulf.deferred.gateClass', d.gateClass);
            span.setStatus({ code: SpanStatusCode.ERROR, message: GULF_DEFERRED_TOKEN });
            const gate = d
                ? `${d.jurisdictionName} is GATED (${d.gateClass}) — ${d.evidence} Gated endpoints: ` +
                  `${d.gatedEndpoints.join(' · ')}. Transcript: ${d.transcript}. Retire by: ${d.retiredBy}.`
                : `no Gulf deferral is registered for regionCode "${regionCode}".`;
            return fetchTransient(
                `endpoint-unreachable: ${GULF_DEFERRED_TOKEN} — PRYZM has NO parcel client for the ` +
                    `Gulf ${leg}. ${gate} This is a DECLARED DEFERRAL, not a failed call and not an ` +
                    `absence of data.`,
            );
        } finally {
            span.end();
        }
    });
}
