// R1 — THE REACHABILITY PROBE. Run BEFORE the wiring change, and again after.
//
// THE QUESTION IT ANSWERS
// -----------------------
// `packages/site-parcel-data/src/providers/resolveBalearsMuib.ts` exists and a Manacor parcel is
// proved to draw OFFLINE (fixture-driven, `balearsRealParcelEnvelope.test.ts`). None of that says a
// USER can reach it. This probe measures the three independent things that stand between a click and
// a drawn envelope, and reports each one SEPARATELY:
//
//   A. UPSTREAM  — does GOIB MUIB answer at the real Manacor point, live, today?
//   B. TRANSPORT — can the BROWSER reach that upstream directly (CORS), or is a same-origin proxy
//                  genuinely required? ⚠ Do not add a proxy you do not need — measure it.
//   C. WIRING    — is there a same-origin route, and is the jurisdiction registered at all?
//
// ⛔ THE HONESTY RULE THIS PROBE IS BUILT AROUND (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
// A FAILURE and an EMPTY RESULT are the SAME VALUE unless something forces them apart. On this
// backend they are especially easy to confuse: ArcGIS answers a **clean HTTP 200 with an empty
// `features` array** both when the point genuinely carries no polygon AND when the query was wrong
// (the measured `CODIMUNI='07040'` → 0 features trap). So every upstream call here lands in exactly
// one of THREE terminal states, never two:
//
//     UNREACHABLE      transport failed, or HTTP was not OK, or the body was not JSON,
//                      or the body carried an Esri error object despite the 200
//     ANSWERED_EMPTY   the service answered, parsed, and covers nothing at this point
//     ANSWERED_N       the service answered with N features
//
// `featureCount` is `null` — never `0` — in the UNREACHABLE state. A `0` there would be the exact
// collapse this file exists to prevent.
//
// NO NETWORK VALUE IS INVENTED. Everything printed is either read from the response or read from the
// committed fixture (`__tests__/fixtures/balears-manacor-7704702ED1870S.json`), which was itself
// captured live. Nothing is defaulted.
//
// Usage:  node tools/balears-muib-probe/r1-reachability.mjs
// Writes: tools/balears-muib-probe/out/r1-reachability.json

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const SERVICE =
    'https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer';
const QUALIFICACIONS_LAYER = 10;
const TIMEOUT_MS = 20_000;

/** The committed, live-captured Manacor parcel. The probe reads its point — it does not invent one. */
const FIXTURE = resolve(
    REPO,
    'packages/site-parcel-data/__tests__/fixtures/balears-manacor-7704702ED1870S.json',
);

/**
 * One upstream call → exactly one of the three terminal states. NEVER throws, and never reports a
 * failure as a zero.
 */
async function call(url, { accept = 'application/json' } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
        const res = await fetch(url, {
            headers: {
                Accept: accept,
                // A browser sends an Origin on a cross-origin request; sending one is the only way
                // to observe whether the server would emit `Access-Control-Allow-Origin`.
                Origin: 'https://pryzm.fly.dev',
                'User-Agent': 'PRYZM-Balears-Reachability-Probe/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        const text = await res.text();
        const cors = res.headers.get('access-control-allow-origin');
        const base = {
            httpStatus: res.status,
            elapsedMs: Date.now() - started,
            corsAllowOrigin: cors, // null ⇒ header absent ⇒ a browser fetch would be BLOCKED
            bodyBytes: text.length,
        };
        if (!res.ok) {
            return { state: 'UNREACHABLE', why: `HTTP ${res.status}`, featureCount: null, ...base };
        }
        if (accept !== 'application/json') {
            return { state: 'ANSWERED', featureCount: null, ...base, text };
        }
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            return {
                state: 'UNREACHABLE',
                why: 'body was not JSON (an ArcGIS/HTML error page, not an empty answer)',
                featureCount: null,
                ...base,
            };
        }
        if (json && json.error) {
            // ⚠ HTTP 200 IS NOT SUCCESS ON ARCGIS. An Esri error object rides a 200 body.
            return {
                state: 'UNREACHABLE',
                why: `Esri error ${json.error.code ?? '?'}: ${json.error.message ?? 'unknown'}`,
                featureCount: null,
                ...base,
            };
        }
        const features = Array.isArray(json.features) ? json.features : null;
        if (features === null) {
            return {
                state: 'UNREACHABLE',
                why: 'JSON carried no `features` array — the shape is not the one this layer publishes',
                featureCount: null,
                ...base,
            };
        }
        return {
            state: features.length === 0 ? 'ANSWERED_EMPTY' : 'ANSWERED',
            featureCount: features.length,
            ...base,
            json,
        };
    } catch (err) {
        return {
            state: 'UNREACHABLE',
            why: `transport failed: ${err?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS} ms` : (err?.message ?? String(err))}`,
            featureCount: null,
            httpStatus: null,
            elapsedMs: Date.now() - started,
            corsAllowOrigin: null,
            bodyBytes: 0,
        };
    } finally {
        clearTimeout(timer);
    }
}

function pointQueryUrl(lat, lon) {
    const qs = new URLSearchParams({
        f: 'json',
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        outSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        where: '1=1',
    });
    return `${SERVICE}/${QUALIFICACIONS_LAYER}/query?${qs.toString()}`;
}

/**
 * ⚠ CORS IS ONLY HALF THE TRANSPORT QUESTION, AND MEASURING ONLY CORS IS HOW YOU CONCLUDE
 * "no proxy needed" WRONGLY. PRYZM ships its own CSP `connect-src` ALLOWLIST (C57, built by
 * `buildConnectSrc` in `server/securityHeaders.js`). A host the remote server would happily serve
 * cross-origin is still blocked by OUR policy unless it is in that list. So the list is READ from
 * the shipped source and the host is looked up in it — never assumed either way.
 */
function cspAllowsHost(host) {
    const p = resolve(REPO, 'server/securityHeaders.js');
    if (!existsSync(p)) return { measured: false, allowed: null, why: 'securityHeaders.js not found' };
    const txt = readFileSync(p, 'utf8');
    const inList = txt.includes(host);
    return {
        measured: true,
        allowed: inList,
        why: inList
            ? `"${host}" appears in server/securityHeaders.js`
            : `"${host}" does NOT appear in the connect-src allowlist in server/securityHeaders.js`,
    };
}

/** Mechanical wiring census — a `grep`, reported as a number, so "wired" is never assumed. */
function wiringCensus() {
    const files = {
        rulepackRegistry: 'packages/site-parcel-data/src/rulepacks/registry.ts',
        envelopeAuthorisation: 'packages/site-parcel-data/src/rulepacks/envelopeAuthorisation.ts',
        l449Gates: 'packages/site-parcel-data/src/l449CertificationGates.ts',
        serverEntry: 'server.js',
        siteDispatch: 'apps/editor/src/ui/site/siteDispatch.ts',
    };
    const out = {};
    for (const [k, rel] of Object.entries(files)) {
        const p = resolve(REPO, rel);
        if (!existsSync(p)) {
            out[k] = { exists: false, balearsMentions: null };
            continue;
        }
        const txt = readFileSync(p, 'utf8');
        out[k] = {
            exists: true,
            // `null` would be "could not read"; a real 0 is a measured absence.
            balearsMentions: (txt.match(/[Bb]alears|BALEARS/g) ?? []).length,
        };
    }
    return out;
}

async function main() {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const { lat, lon } = fixture.queryPoint;

    // ── A. UPSTREAM, at the real parcel's point ────────────────────────────────────────────────
    const zoning = await call(pointQueryUrl(lat, lon));

    // A CONTROL: a point in the open Mediterranean, inside the Balears bbox but on water. It MUST
    // come back ANSWERED_EMPTY. If the parcel point and the sea point produce the SAME state, this
    // probe has measured nothing — that is the collapse, and it is checked, not assumed.
    const seaControl = await call(pointQueryUrl(39.2, 2.4));

    // ── The fitxa (the page that actually carries the parameters) ──────────────────────────────
    const fitxaUrl = zoning.json?.features?.[0]?.attributes?.URL ?? null;
    const fitxa = fitxaUrl ? await call(fitxaUrl, { accept: 'text/html' }) : null;

    const attrs = zoning.json?.features?.[0]?.attributes ?? null;

    // ── The verdict, per axis, each stated as its own fact ─────────────────────────────────────
    const upstreamAnswers = zoning.state === 'ANSWERED' && (zoning.featureCount ?? 0) > 0;
    const zoningCsp = cspAllowsHost('ideib.caib.es');
    const fitxaCsp = cspAllowsHost('muib.caib.es');
    const fitxaIsPlainHttp = typeof fitxaUrl === 'string' && fitxaUrl.startsWith('http://');
    // A browser could reach a host directly ONLY if BOTH the remote sends ACAO AND our own CSP
    // allowlists it AND the scheme is not mixed content. Any one of the three failing ⇒ proxy.
    const browserCouldReachZoning = zoning.corsAllowOrigin !== null && zoningCsp.allowed === true;
    const browserCouldReachFitxa =
        (fitxa?.corsAllowOrigin ?? null) !== null && fitxaCsp.allowed === true && !fitxaIsPlainHttp;
    const proxyRequired = !(browserCouldReachZoning && browserCouldReachFitxa);

    const report = {
        probe: 'r1-reachability',
        runAt: new Date().toISOString(),
        parcel: {
            refcat: fixture.refcat,
            address: fixture.address,
            officialAreaM2: fixture.officialAreaM2,
            queryPoint: fixture.queryPoint,
        },
        A_upstream: {
            url: pointQueryUrl(lat, lon),
            state: zoning.state,
            why: zoning.why ?? null,
            httpStatus: zoning.httpStatus,
            featureCount: zoning.featureCount, // ⚠ null ⇒ UNREACHABLE. Never 0 for a failure.
            elapsedMs: zoning.elapsedMs,
            attributes: attrs,
            // Did the LIVE service still say what the committed fixture says? A drifted upstream is
            // a different fact from an unreachable one.
            matchesFixture:
                attrs === null
                    ? null
                    : attrs.CODIMUIB === fixture.muibAttributes.CODIMUIB &&
                      attrs.IDENTITAT === fixture.muibAttributes.IDENTITAT &&
                      attrs.CODIPLA === fixture.muibAttributes.CODIPLA,
            seaControl: {
                note: 'open sea inside the Balears bbox — MUST be ANSWERED_EMPTY, proving empty ≠ failure',
                state: seaControl.state,
                httpStatus: seaControl.httpStatus,
                featureCount: seaControl.featureCount,
                why: seaControl.why ?? null,
            },
            controlHeld:
                zoning.state === 'ANSWERED' &&
                seaControl.state === 'ANSWERED_EMPTY',
        },
        A2_fitxa: fitxa
            ? {
                  url: fitxaUrl,
                  state: fitxa.state,
                  why: fitxa.why ?? null,
                  httpStatus: fitxa.httpStatus,
                  bodyBytes: fitxa.bodyBytes,
                  corsAllowOrigin: fitxa.corsAllowOrigin,
                  // The parameter rows the adapter reads, quoted from the page itself.
                  sampleRows: (fitxa.text ?? '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/&nbsp;/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 600),
              }
            : { url: null, state: 'NOT_ATTEMPTED', why: 'no URL on the zoning feature' },
        B_transport: {
            question:
                'can the BROWSER call these two hosts directly, or is a same-origin proxy required?',
            zoningHost: {
                host: 'ideib.caib.es',
                corsAllowOrigin: zoning.corsAllowOrigin,
                cspAllowlisted: zoningCsp,
                browserCouldReach: browserCouldReachZoning,
            },
            fitxaHost: {
                host: 'muib.caib.es',
                corsAllowOrigin: fitxa?.corsAllowOrigin ?? null,
                cspAllowlisted: fitxaCsp,
                // ⚠ THE FITXA URL THE PUBLISHER ITSELF EMITS IS PLAIN `http://`. On an HTTPS page
                // that is MIXED CONTENT and is blocked by the browser before CORS is even consulted.
                plainHttpMixedContent: fitxaIsPlainHttp,
                browserCouldReach: browserCouldReachFitxa,
            },
            verdict: proxyRequired
                ? 'A SAME-ORIGIN PROXY IS REQUIRED — see the two host blocks for which condition fails.'
                : 'Both hosts are directly reachable from the browser; a proxy would be dead weight.',
        },
        C_wiring: wiringCensus(),
        VERDICT: {
            upstreamAnswersAtTheParcel: upstreamAnswers,
            proxyRequired,
        },
    };

    const outPath = resolve(HERE, 'out', 'r1-reachability.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
    console.error('probe crashed:', e);
    process.exit(1);
});
