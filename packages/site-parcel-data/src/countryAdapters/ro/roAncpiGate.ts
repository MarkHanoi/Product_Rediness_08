// LANE RO — ROMANIA (RO) · GATE 1 (the SERVICE gate), as a MEASURED, SELF-ANNOUNCING scaffold.
//
// [[identity-bootstrap-gate-offline-legislation-pattern]] · [[context-data-honesty-family]] ·
// C74 §3.2/§3.3/§3.4/§3.8 · the SE (seNgpGate.ts, L-12879) precedent this lane's brief cites.
//
// ⛔ THERE IS NO ANCPI CLIENT IN THIS ADAPTER, AND THAT IS THE DELIVERABLE. The ANCPI geoportal
// (an ArcGIS Server 10.8 estate documented to serve INSPIRE Cadastral Parcels / Buildings as
// GeoJSON) is the right source — but its host DOES NOT RESOLVE from any vantage point available to
// this build, so there are NO SERVED BYTES to write a parser against. Shipping a GeoJSON→parcel
// parser built from the community-wrapper documentation would be exactly the
// [[fake-more-capable-than-real]] failure: a parser built from a spec cannot falsify the spec. So
// this module carries NO response parser, and roParcelProvider.ts's resolvers REFUSE.
//
// ── WHAT WAS MEASURED (two independent sessions, four independent vantage points) ──────────────
// Test point: Bucharest, lat 44.4268, lon 26.1025 (Piața Universității).
//
//   2026-09-02 (transcript ro-transcripts/ancpi-gate-probe.txt, §1–5):
//     • DNS-over-HTTPS geoportal.ancpi.ro @ Google (8.8.8.8)     → Status 3 (NXDOMAIN)
//     • DNS-over-HTTPS geoportal.ancpi.ro @ Cloudflare (1.1.1.1) → Status 3 (NXDOMAIN)
//     • curl https://geoportal.ancpi.ro/maps/rest/…/MapServer/1/query → curl exit 6 (could not
//       resolve host); same for /inspireview/rest/…/CP_View/MapServer/1/query
//     • CONTROL: apex ancpi.ro resolves (Status 0 → 104.18.9.54 / 104.18.8.54, Cloudflare) and
//       serves HTTP 200 — the ZONE is live, only the `geoportal` label is gone.
//
//   2026-09-03 (this lane, re-probe — transcript ro-transcripts/ancpi-gate-probe.txt §RE-PROBE):
//     • curl geoportal.ancpi.ro (sandbox egress)            → curl exit 6 (Could not resolve host)
//     • DNS-over-HTTPS geoportal.ancpi.ro @ Google          → {"Status":3} (NXDOMAIN), Authority
//       SOA iris.ns.cloudflare.com — i.e. the ancpi.ro zone answers, the subdomain does not exist
//     • CONTROL: www.ancpi.ro @ Google → {"Status":0} → 104.18.9.54 / 104.18.8.54 (still live)
//
// The gate is REACHABILITY, not credentials: geoportal.ancpi.ro currently has NO public A/AAAA
// record (NXDOMAIN, not a firewall/geofence 4xx and not a credential 401). Two days apart, four
// resolvers, one answer — a stable, reproducible gate, not a transient blip. Per
// §CONTEXT-DATA-HONESTY this is a TRANSIENT (the source did not answer), NEVER an `absent` (Romania
// has a cadastre; "no parcel here" would be a lie at national scale).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.ro');

/**
 * The distinguished token every deferred refusal carries (C74 §3.2). Grep-able, assertable, and
 * impossible to confuse with a real upstream failure.
 */
export const RO_ANCPI_DEFERRED_TOKEN = 'ro-ancpi-service-unreachable-deferred';

/**
 * The ANCPI endpoints as DOCUMENTED (community wrapper `tangojo/ancpi-wrapper-cli`
 * ancpi-gis-endpoints.md + notes.alinpanaitiu.com "Fetching land coordinates from Romania's
 * Geoportal", both read 2026-09-03). DOCUMENTED, not MEASURED — the host does not resolve, so none
 * of these has been exercised by this lane. Recorded as the pin a future lane fetches RECORDED
 * BYTES from, never as a working client. Layer 1 is Cadastral Parcel (Parcele cadastrale); the
 * national identifier field is `INSPIRE_ID` (e.g. `RO.83.40991.102507`), queried as
 * `?f=geojson&where=INSPIRE_ID='…'` or by point geometry
 * (`geometry={x,y}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects`).
 */
export const RO_ANCPI_ENDPOINTS = Object.freeze({
    /** eterra3 publish service, parcels layer (the one the alinpanaitiu note actually queried). */
    eterra3Parcels:
        'https://geoportal.ancpi.ro/maps/rest/services/eterra3_publish/MapServer/1/query',
    /** eterra3 publish service, buildings (Construcții) layer. */
    eterra3Buildings:
        'https://geoportal.ancpi.ro/maps/rest/services/eterra3_publish/MapServer/0/query',
    /** INSPIRE View CP (Cadastral Parcel) layer 1. */
    inspireCpView:
        'https://geoportal.ancpi.ro/inspireview/rest/services/CP/CP_View/MapServer/1/query',
});

/** The national cadastral identifier field on the ANCPI parcel layer (DOCUMENTED). */
export const RO_ANCPI_INSPIRE_ID_FIELD = 'INSPIRE_ID';

/**
 * C74 §3.4 — a scaffold carries an owner, a date and a gate, plus an assertion that fails when the
 * milestone passes without the retirement. `reviewBy` is not decoration: it is the date after which
 * {@link assertRoAncpiDeferralNotExpired} THROWS, so a deferral cannot quietly become permanent
 * architecture nobody chose.
 */
export const RO_ANCPI_DEFERRAL = Object.freeze({
    gate: 'GATE 1 — ANCPI geoportal host does not resolve (NXDOMAIN)',
    owner: 'lane RO (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** The measured evidence that the gate is real, not assumed. */
    evidence:
        'geoportal.ancpi.ro NXDOMAIN @ Google + Cloudflare DoH and curl exit 6, 2026-09-02 AND ' +
        '2026-09-03 (2 sessions, 4 vantage points); apex/www.ancpi.ro resolve (zone live, subdomain ' +
        'absent). Transcript: audit/europe-adapters-2/2026-09-02/ro-transcripts/ancpi-gate-probe.txt',
    /** What must happen for this module + the RO parcel provider to be wired for real. */
    retiredBy:
        'geoportal.ancpi.ro resolves publicly again AND a client written against RECORDED BYTES ' +
        'from eterra3_publish/MapServer/1 (INSPIRE_ID + GeoJSON ring) — never against the ' +
        'documentation — AND GATE 2 clears (ROU added to the national boundary set, ' +
        'roJurisdiction.ts RO_JURISDICTION_DEFERRAL).',
    /** Assert-by date. After this, the deferral is a decision that must be re-taken explicitly. */
    reviewBy: '2026-12-01',
    /** The re-check command, so the reviewer runs the probe, not a guess. */
    recheck:
        'curl -sk "https://dns.google/resolve?name=geoportal.ancpi.ro&type=A" — Status 0 with an ' +
        'Answer array means GATE 1 has cleared; Status 3 means it is still open.',
});

/**
 * PURE: C74 §3.4's expiry assertion. Throws BY NAME once `todayIso` passes `reviewBy`, naming the
 * owner, the retirement condition and the endpoints — so the failure tells the reader what to do
 * rather than only that something is old.
 */
export function assertRoAncpiDeferralNotExpired(todayIso: string): void {
    if (todayIso > RO_ANCPI_DEFERRAL.reviewBy) {
        throw new Error(
            `[ro-ancpi] the SERVICE-unreachable DEFERRAL declared on ${RO_ANCPI_DEFERRAL.declaredOn} ` +
                `by ${RO_ANCPI_DEFERRAL.owner} passed its reviewBy date ${RO_ANCPI_DEFERRAL.reviewBy} ` +
                `(today ${todayIso}) and was not retired. Retirement means: ${RO_ANCPI_DEFERRAL.retiredBy}. ` +
                `Re-run: ${RO_ANCPI_DEFERRAL.recheck}. ` +
                'Re-take the decision explicitly — do not extend this date to silence the assertion.',
        );
    }
}

/**
 * The ONE refusal every ANCPI leg returns. TRANSIENT (the source did not answer — the host would
 * resolve again and change the answer, so this is emphatically NOT `absent`: Romania has a national
 * cadastre, and calling that "nothing here" is the §CONTEXT-DATA-HONESTY conflation at national
 * scale). C74 §3.2 — the refusal names itself with {@link RO_ANCPI_DEFERRED_TOKEN} and stamps its
 * span with `ro.deferred = true`, so the deferral is detectable from outside without reading this
 * file.
 */
export function roAncpiDeferredRefusal<T>(leg: string, endpoint: string): FetchOutcome<T> {
    return tracer.startActiveSpan('pryzm.siteintel.ro.ancpiDeferred', (span): FetchOutcome<T> => {
        try {
            span.setAttribute('ro.deferred', true);
            span.setAttribute('ro.deferred.leg', leg);
            span.setAttribute('ro.deferred.endpoint', endpoint);
            span.setStatus({ code: SpanStatusCode.ERROR, message: RO_ANCPI_DEFERRED_TOKEN });
            return fetchTransient(
                `endpoint-unreachable: ${RO_ANCPI_DEFERRED_TOKEN} — PRYZM has NO client for the ` +
                    `Romanian ${leg} leg. ${endpoint} does not resolve (geoportal.ancpi.ro NXDOMAIN, ` +
                    `measured ${RO_ANCPI_DEFERRAL.declaredOn}); the cadastre exists and the host has ` +
                    'been live before, so this is a declared deferral, not a failed call and not an ' +
                    'absence of Romanian data — see RO_ANCPI_DEFERRAL.',
            );
        } finally {
            span.end();
        }
    });
}
