// LANE E7-SE — SWEDEN (SE) · THE CREDENTIAL GATE, AS A MEASURED, SELF-ANNOUNCING SCAFFOLD.
//
// [[identity-bootstrap-gate-offline-legislation-pattern]] · C74 §3.2/§3.3/§3.4/§3.8.
//
// ⛔ THERE IS NO LANTMÄTERIET CLIENT IN THIS ADAPTER, AND THAT IS THE DELIVERABLE. The brief is
// explicit: "If it is identity-gated … ship the OFFLINE half … and a DEFERRED stub for the gated
// half — NEVER A FAKE CLIENT." So this module contains no URL builder that pretends to work, no
// response parser written against a specification nobody has fetched bytes from, and no injected
// `credential` parameter that would let a caller believe the leg is one config value away.
// [[fake-more-capable-than-real]]: a client built from a published spec cannot falsify the spec.
//
// WHAT WAS MEASURED, 2026-09-01, FROM THIS MACHINE (transcript 02):
//
//   GET https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v1/detaljplan/v1/search
//     → HTTP 401 · {"code":"900902","message":"Missing Credentials","description":"Invalid
//       Credentials. Make sure your API invocation call has a header: 'Authorization : Bearer
//       ACCESS_TOKEN' or 'Authorization : Basic ACCESS_TOKEN' or 'ApiKey : API_KEY'"}
//   GET …/visning/v1/detaljplan/v1/wms?request=GetCapabilities&version=1.1.1&service=WMS
//     → HTTP 401 · byte-identical body (sha256 9aed6cff…a42e9)
//   GET …/sokning/v1/fastighetsindelning/v1/search
//     → HTTP 401 · byte-identical body (same sha256 — one gate, three doors)
//   All three bodies are committed at
//   `__tests__/fixtures/se-lantmateriet-ngp-2026-09-01/` — the STATE'S OWN BYTES saying no.
//
// `900902` is the WSO2 API-Manager "Missing Credentials" code. The credential is obtained by
// registering a client in Lantmäteriet's API portal (`https://apimanager.lantmateriet.se/`,
// HTTP 302 to a login) and subscribing the client to the specific geodata product; the token is
// then OAuth2 client-credentials (or Basic). The 2025 HVD opening made the DATA free and CC BY
// 4.0 — it did NOT remove the client-registration step, and the sweep's own words for this are
// "registration gate recorded per SE/DK lesson — the data is NOT missing".
//
// ⭐ A SECOND, DIFFERENT REACHABILITY FACT, RECORDED BECAUSE IT LOOKS LIKE THE FIRST AND IS NOT:
// `opendata.lantmateriet.se` — the open-data host — has **AAAA only, no A record**
// (`2001:67c:268c:f110::2063`). From an IPv4-only egress it fails as
// `Could not resolve host` / connection timeout. That is a NETWORK-SIDE TRANSIENT of the
// CALLER, not a Swedish access gate and not an absence of data; conflating the two would put a
// PRYZM infrastructure limitation into a national coverage table. Recorded in
// impl/lane-e7-se.md §3 and NOT encoded as a gate below.
//
// ── C74 §3.2: THIS SCAFFOLD ANNOUNCES ITSELF AT ITS OWN BOUNDARY ──────────────────────────────
// Not "documented in the file header" — §0 of C74 exists because a header was accurate and
// ignored for months. Every refusal from this module carries the distinguished token
// `SE_NGP_DEFERRED_TOKEN` in its reason string AND sets `se.deferred = true` on its span, so the
// deferral is detectable from outside without reading this file.
//
// ── C74 §3.3: THE THREE STATES ARE THREE DIFFERENT VALUES ─────────────────────────────────────
// "not configured", "configured but rejected" and "no client exists" are NOT the same answer.
// This adapter is in the THIRD state, and says so in those words. It cannot enter the first two,
// because it accepts no credential — which is exactly why it cannot silently degrade into them.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.se');

/**
 * The distinguished token every deferred refusal carries (C74 §3.2). Grep-able, assertable, and
 * impossible to confuse with a real upstream failure.
 */
export const SE_NGP_DEFERRED_TOKEN = 'se-ngp-credential-gate-deferred';

/** The three NGP doors measured on 2026-09-01, with the identical 401 each returned. */
export const SE_NGP_GATED_ENDPOINTS = Object.freeze({
    detaljplanSearch:
        'https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v1/detaljplan/v1/search',
    detaljplanWms:
        'https://api.lantmateriet.se/distribution/geodatakatalog/visning/v1/detaljplan/v1/wms',
    fastighetsindelningSearch:
        'https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v1/fastighetsindelning/v1/search',
});

/** The WSO2 gate code and message, verbatim, so a future live response can be compared to it. */
export const SE_NGP_GATE_CODE = '900902';
export const SE_NGP_GATE_MESSAGE = 'Missing Credentials';

/**
 * C74 §3.4 — a scaffold carries an owner, a date and a gate, plus an assertion that fails when
 * the milestone passes without the retirement. `reviewBy` is not decoration: it is the date after
 * which {@link assertSeNgpDeferralNotExpired} THROWS, so a deferral cannot quietly become
 * permanent architecture nobody chose.
 */
export const SE_NGP_DEFERRAL = Object.freeze({
    owner: 'lane E7-SE (europe-site-intel wave)',
    declaredOn: '2026-09-01',
    /** What must happen for this module to be deleted. */
    retiredBy:
        'a Lantmäteriet API-portal client registered to a PRYZM organisation + a geodata-product ' +
        'subscription for "Detaljplan" and "Fastighetsindelning"; then an OAuth2 client-credentials ' +
        'client written against RECORDED BYTES from those services — never against the specification',
    /** Assert-by date. After this, the deferral is a decision that must be re-taken explicitly. */
    reviewBy: '2027-03-01',
    /** The measured evidence that the gate is real, not assumed. */
    evidence: '3 × HTTP 401 code 900902, bodies byte-identical (sha256 9aed6cff…a42e9), 2026-09-01',
});

/**
 * PURE: C74 §3.4's expiry assertion. Throws BY NAME once `todayIso` passes `reviewBy`, naming the
 * owner, the retirement condition and the endpoints — so the failure tells the reader what to do
 * rather than only that something is old.
 */
export function assertSeNgpDeferralNotExpired(todayIso: string): void {
    if (todayIso > SE_NGP_DEFERRAL.reviewBy) {
        throw new Error(
            `[se-ngp] the credential-gate DEFERRAL declared on ${SE_NGP_DEFERRAL.declaredOn} by ` +
                `${SE_NGP_DEFERRAL.owner} passed its reviewBy date ${SE_NGP_DEFERRAL.reviewBy} ` +
                `(today ${todayIso}) and was not retired. Retirement means: ${SE_NGP_DEFERRAL.retiredBy}. ` +
                `Gated endpoints: ${Object.values(SE_NGP_GATED_ENDPOINTS).join(' · ')}. ` +
                'Re-take the decision explicitly — do not extend this date to silence the assertion.',
        );
    }
}

/**
 * The ONE refusal every gated leg returns. Transient (the source did not answer — a credential
 * would change the answer, so this is emphatically NOT `absent`: Sweden has 11,662 digital
 * detaljplaner across 236 of 290 kommuner, and calling that "nothing here" would be the
 * §CONTEXT-DATA-HONESTY conflation at national scale).
 *
 * C74 §3.2 — the refusal names itself with {@link SE_NGP_DEFERRED_TOKEN} and stamps its span.
 */
export function seNgpDeferredRefusal<T>(leg: string, endpoint: string): FetchOutcome<T> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.se.ngpDeferred',
        (span): FetchOutcome<T> => {
            try {
                span.setAttribute('se.deferred', true);
                span.setAttribute('se.deferred.leg', leg);
                span.setAttribute('se.deferred.endpoint', endpoint);
                span.setStatus({ code: SpanStatusCode.ERROR, message: SE_NGP_DEFERRED_TOKEN });
                return fetchTransient(
                    `endpoint-unreachable: ${SE_NGP_DEFERRED_TOKEN} — PRYZM has NO client for the ` +
                        `Swedish ${leg} leg. ${endpoint} answered HTTP 401 code ${SE_NGP_GATE_CODE} ` +
                        `"${SE_NGP_GATE_MESSAGE}" on ${SE_NGP_DEFERRAL.declaredOn}; the data is CC BY 4.0 ` +
                        'and open, the CLIENT REGISTRATION is the gate. This is a declared deferral, ' +
                        'not a failed call and not an absence of Swedish data — see SE_NGP_DEFERRAL.',
                );
            } finally {
                span.end();
            }
        },
    );
}
