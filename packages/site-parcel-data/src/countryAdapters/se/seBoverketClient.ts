// LANE E7-SE — SWEDEN (SE) · THE ONE IMPURE SEAM: Boverket's Planbestämmelsekatalogen v2 API.
// E7-family conventions §6.A (`<cc><Dialect>Client.ts`): endpoints, measured quirks, a
// FetchOutcome-classified fetch, and pure URL builders. It knows NOTHING about rules.
//
// ⭐ THE LANE'S FIRST FINDING, AND IT OVERTURNS THE BRIEF'S PREMISE FOR HALF OF SWEDEN.
// The brief (and `sourceRegistry/index.ts:124`) record SE as "graded GREEN in the sweep but NO API
// endpoint URL was ever captured — an OAuth2/organisational-onboarding gate". That is TRUE of
// Lantmäteriet's NGP (geometry — see seParcelProvider.ts / sePlanProvider.ts, both DEFERRED with
// the 401 recorded). It is FALSE of Boverket's rule VOCABULARY. Discovery pass, 2026-09-01:
//
//   1. boverket.se/sv/om-boverket/oppna-data/planbestammelser/ links
//      `https://api-portal.boverket.se/reference#api=planbestammelsekatalogenv2` — an Azure APIM
//      developer portal whose own catalogue endpoint answers unauthenticated:
//      `GET https://api-portal.boverket.se/developer/apis?api-version=2022-04-01-preview`
//      → 7 APIs, and the row `planbestammelsekatalogenv2` carries **`"subscriptionRequired": false`**
//      with `"path": "planbestammelsekatalogen"`.
//   2. The gateway host resolves to `https://api.boverket.se` (and to the APIM default
//      `https://delat-prd-ams.azure-api.net`; both were probed, both answer identically).
//   3. `GET https://api.boverket.se/planbestammelsekatalogen/release/full/platt/aktuell` → **HTTP 200,
//      13,176,663 bytes, NO credentials of any kind**: release id 7, namn `20251201`, publicerad
//      `2025-12-01T10:39:00`, typ `{id:1, namn:"Juridisk"}`, **3,707 bestämmelser**.
//   So the SE row's gate is a GEOMETRY gate, not a RULES gate — the two halves were conflated
//   under one country grade. Recorded in impl/lane-e7-se.md §2; the sourceRegistry line that
//   states otherwise is queued in impl/barrel-additions-se.txt (this lane may not edit it).
//
// MEASURED TRANSPORT QUIRKS (probed 2026-09-01; re-run them before "fixing" any of this):
//
//   Q1. ⛔ **A 404 FROM THIS API IS USUALLY A GENUINE ABSENCE, NOT A FAILURE.** Asking for a
//       provision that does not exist answers **HTTP 404** with a JSON *string* body:
//         `"Bestämmelse med id 00000000-…-000000000000 saknas i aktuell publicerad release."`
//       and the värdedomän/release endpoints answer the same shape (`"Bestämmelsetyp med id 999
//       saknas."`, `"Efterfrågad release med id 9999 av katalogen saknas."`). Classifying every
//       `!res.ok` as transient — the reflex — would turn "this provision does not exist" into
//       "the source did not answer", which is the §CONTEXT-DATA-HONESTY conflation inverted.
//   Q2. …BUT NOT EVERY 404 IS. A path this adapter got wrong answers with the **APIM envelope**
//       `{ "statusCode": 404, "message": "Resource not found" }`, and a MALFORMED uuid answers
//       404 with an **EMPTY body and no content-type**. Both are misconfigurations on OUR side,
//       so both classify TRANSIENT (`upstream-failed:`): a route we got wrong is not a coverage
//       fact about Sweden. The discriminator is measured, not guessed — the absence bodies are
//       JSON strings (first non-space byte `"`), the failures are objects or empty.
//   Q3. Success bodies are `application/json; charset=utf-8`, UTF-8, Swedish diacritics served
//       raw (`å ä ö ³ ²`). Numbers are served as JSON numbers; dates as `YYYY-MM-DDT00:00:00`
//       local-naive strings with NO zone — sliced to `YYYY-MM-DD`, never parsed into a Date (L0
//       doctrine, provenance.ts `IsoDateStringSchema`).
//   Q4. The catalogue is RELEASE-VERSIONED. `/…/aktuell` is a moving target; `/release/{id}/…`
//       is stable. `SE_PBK_PINNED_RELEASE_ID` below pins the release this adapter's imported
//       vocabulary was taken from, so a Boverket republish surfaces as a NAMED mismatch rather
//       than as silently-shifted numbers.
//
// NO RIVAL (E7-family conventions §6.B): `FetchOutcome` / `fetchFound` / `fetchAbsent` /
// `fetchTransient` come from `@pryzm/schemas`; the refusal-reason prefixes are the L0 vocabulary
// (`endpoint-unreachable:` · `upstream-failed:` · `no-provision:`). NO second retry ladder is
// added — `src/net/retryWhileUnreachable.ts` exists, is FetchOutcome-typed and is tested; this
// adapter DELIBERATELY does not wrap its calls in it, because the only live leg is a static
// national catalogue the caller fetches once per session, and adding a retry here would be a
// policy decision taken at the wrong layer. A caller that wants retry composes that module.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.se');

/**
 * The KEYLESS Boverket API gateway base for Planbestämmelsekatalogen v2 — PROBED LIVE
 * 2026-09-01, HTTP 200, no `Ocp-Apim-Subscription-Key`, no OAuth2, no registration.
 * (`https://delat-prd-ams.azure-api.net/planbestammelsekatalogen` is the same service under the
 * APIM default hostname; the vanity host is the one Boverket publishes and the one pinned here.)
 */
export const SE_PBK_BASE = 'https://api.boverket.se/planbestammelsekatalogen';

/**
 * The Boverket API-portal catalogue endpoint that PROVES the keylessness rather than asserting
 * it — `subscriptionRequired: false` on the `planbestammelsekatalogenv2` row. Recorded as a
 * source-registry probe target; this module never calls it at runtime.
 */
export const SE_PBK_PORTAL_CATALOGUE_URL =
    'https://api-portal.boverket.se/developer/apis?api-version=2022-04-01-preview';

/**
 * The catalogue release this adapter's imported vocabulary was taken from (Q4). `namn` is
 * Boverket's own release label; `publicerad` is its own publication stamp.
 */
export const SE_PBK_PINNED_RELEASE_ID = 7;
export const SE_PBK_PINNED_RELEASE_NAME = '20251201';
export const SE_PBK_PINNED_RELEASE_PUBLISHED = '2025-12-01';
/**
 * The release TYPE, verbatim — Boverket's own R5 normative-force word. `/vd/releasetyp` is a
 * CLOSED two-value list `{Juridisk | Teknisk}`; all seven published releases are `Juridisk`
 * (measured 2026-09-01), so the field is a real force axis, not a label.
 */
export const SE_PBK_PINNED_RELEASE_TYPE = 'Juridisk';

/**
 * Native CRS of Swedish national geodata — SWEREF 99 TM. Declared here for the same reason every
 * sibling adapter declares one: measure in the served CRS or not at all (§L3 ES-5 Madrid trap).
 * ⚠ NOTHING IN THIS ADAPTER CURRENTLY SERVES GEOMETRY — the catalogue is text-only and the NGP
 * geometry services are credential-gated. This constant is the seat, not a claim of coverage.
 */
export const SE_NATIVE_CRS = 'EPSG:3006';

/** Injectable dependencies so every leg is testable without the network. */
export interface SeBoverketDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/* ───────────────────────────── URL builders (pure) ────────────────────── */

/** `/release/{id}` — release metadata (id, namn, publicerad, typ). */
export function buildSePbkReleaseUrl(releaseId: number): string {
    return `${SE_PBK_BASE}/release/${releaseId}`;
}

/** `/release/full/platt/{id}` — the whole catalogue, FLAT (one object per bestämmelse). */
export function buildSePbkFullFlatReleaseUrl(releaseId: number): string {
    return `${SE_PBK_BASE}/release/full/platt/${releaseId}`;
}

/**
 * `/bestammelse/platt/aktuell/{uuid}` — ONE provision from the CURRENT release, flat form.
 * The flat form is the one this adapter reads: the structured form nests the värdedomän values
 * behind `{id, namn, url}` objects, which carries no fact the flat form omits.
 */
export function buildSePbkProvisionUrl(uuid: string): string {
    return `${SE_PBK_BASE}/bestammelse/platt/aktuell/${encodeURIComponent(uuid)}`;
}

/** `/bestammelse/platt/{releaseId}/{uuid}` — ONE provision from a PINNED release. */
export function buildSePbkProvisionInReleaseUrl(releaseId: number, uuid: string): string {
    return `${SE_PBK_BASE}/bestammelse/platt/${releaseId}/${encodeURIComponent(uuid)}`;
}

/** `/vd/{domain}` — one of the closed värdedomän codelists. */
export function buildSePbkValueDomainUrl(domain: string): string {
    return `${SE_PBK_BASE}/vd/${domain}`;
}

/* ───────────────────────────── the one impure seam ────────────────────── */

/**
 * PURE: the Q1/Q2 discriminator. Boverket answers a missing object with **HTTP 404 and a JSON
 * STRING body** ("… saknas …"); it answers a wrong route with an APIM object envelope or with
 * nothing at all. Returns true only for the string shape — i.e. only for a DURABLE absence.
 *
 * Exported because this single decision is the difference between "Sweden does not define this
 * provision" and "PRYZM called the wrong URL", and a test must be able to hold it directly.
 */
export function isSePbkAbsenceBody(body: string): boolean {
    const s = body.trim();
    if (s.length < 2 || !s.startsWith('"')) return false;
    let parsed: unknown;
    try {
        parsed = JSON.parse(s);
    } catch {
        return false;
    }
    return typeof parsed === 'string' && /\bsaknas\b/i.test(parsed);
}

/**
 * The classified GET every Boverket read goes through. NEVER throws. Returns the parsed JSON
 * body, or a typed refusal that names itself:
 *   • 2xx + parseable JSON            → `found`
 *   • 404 + `"… saknas …"` string     → `absent`    (`no-provision:` — durable, not retryable)
 *   • 404 APIM envelope / empty body  → `transient` (`upstream-failed:` — OUR route was wrong)
 *   • any other non-2xx               → `transient` (`upstream-failed:`)
 *   • unparseable 2xx body            → `transient` (`upstream-failed:` — a served success that
 *                                       is not JSON is a service defect, never a coverage fact)
 *   • network throw / no fetch impl   → `transient` (`endpoint-unreachable:`)
 */
export async function seBoverketGetJson(
    url: string,
    queryLabel: string,
    deps: SeBoverketDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.se.boverketGetJson',
        async (span): Promise<FetchOutcome<unknown>> => {
            span.setAttribute('se.query', queryLabel);
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
                    if (res.status === 404 && isSePbkAbsenceBody(body)) {
                        span.setStatus({ code: SpanStatusCode.OK });
                        return fetchAbsent(
                            `no-provision: ${queryLabel} — Boverket "${body.trim().slice(1, -1)}"`,
                        );
                    }
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${url}` +
                            (body.trim() === '' ? ' (empty body)' : ` — "${body.slice(0, 120).trim()}"`),
                    );
                }
                try {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchFound(JSON.parse(body) as unknown);
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${url} served unparseable JSON ` +
                            `(${e instanceof Error ? e.message : String(e)})`,
                    );
                }
            } finally {
                span.end();
            }
        },
    );
}
