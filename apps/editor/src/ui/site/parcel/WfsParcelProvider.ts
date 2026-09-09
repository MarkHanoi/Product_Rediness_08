// L-613 — a generic same-origin-proxy PARCEL provider factory.
//
// The Catastro adapter (CatastroParcelProvider.ts) is a thin fetch+parse of a same-origin proxy
// that returns `{ parcel: { ring, refcat, areaM2, address, source } }`. Every other wired cadastre
// (France IGN, Netherlands PDOK, Norway Kartverket, Germany NRW ALKIS) is served through
// `server/euCadastreProxy.js` in the EXACT SAME response shape, so a single parameterised factory
// covers all of them — the only per-country differences (endpoint, provenance id/label) live in
// the routing registry, not in bespoke client code.
//
// PURE (no THREE / Cesium / DOM). Resolves to null on ANY failure and NEVER throws — the map UI
// decides how to surface "no parcel here" (or the registry falls to the footprint).

import { trace } from '@opentelemetry/api';
import type { LatLon } from '../boundaryProjection.js';
import type { ParcelAreaOutcome, ParcelFeature, ParcelLookupOutcome, ParcelProvider } from './ParcelProvider.js';
import { fetchParcelAreaFromProxy } from './parcelAreaFetch.js';
import { computeParcelMetrics, computeParcelConfidence } from './parcelConfidence.js';

const _tracer = trace.getTracer('pryzm.parcel');

/** The raw JSON row the proxy returns (only the fields we read). */
interface ProxyParcel {
    readonly ring?: unknown;
    readonly refcat?: unknown;
    readonly areaM2?: unknown;
    readonly address?: unknown;
    readonly source?: unknown;
    // §L-640 Phase 1 — split areas + click→parcel signals (absent on older proxy builds → null).
    // WFS providers (FR/NL/NO/DE/CH) may return these when the EU cadastre proxy populates them;
    // pointToParcelM / candidateMarginM are OVC-specific (Spain) and will be null for WFS providers.
    readonly areaOfficialM2?: unknown;
    readonly areaSigM2?: unknown;
    readonly pointToParcelM?: unknown;
    readonly candidateMarginM?: unknown;
}

function toFiniteNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function parseRing(raw: unknown): LatLon[] {
    if (!Array.isArray(raw)) return [];
    const ring: LatLon[] = [];
    for (const p of raw) {
        if (!p || typeof p !== 'object') continue;
        const lat = toFiniteNum((p as { lat?: unknown }).lat);
        const lon = toFiniteNum((p as { lon?: unknown }).lon);
        if (lat === null || lon === null) continue;
        ring.push({ lat, lon });
    }
    return ring;
}

/**
 * Normalise a proxy `{ parcel }` payload into a `ParcelFeature`, or null on a miss/malformed
 * response. `fallbackSource` labels the provenance when the proxy omits `source`. Exported so the
 * parse is unit-testable in isolation from `fetch`.
 *
 * §L-640 Phase 1 — attaches metrics + honesty-gated confidence (kind:'cadastral') using the same
 * computeParcelMetrics/computeParcelConfidence from parcelConfidence.ts as CatastroParcelProvider.
 * No logic is duplicated. `pointToParcelM`/`candidateMarginM` are OVC-specific (Spain) and will
 * be null for WFS providers; `areaOfficialM2` is null when the proxy does not supply it (older
 * builds or sources that do not publish a registry area).
 */
export function parseWfsProxyResponse(json: unknown, fallbackSource: string): ParcelFeature | null {
    if (!json || typeof json !== 'object') return null;
    const parcel = (json as { parcel?: unknown }).parcel as ProxyParcel | null | undefined;
    if (!parcel || typeof parcel !== 'object') return null;

    const ring = parseRing(parcel.ring);
    if (ring.length < 3) return null;

    const refcat = typeof parcel.refcat === 'string' ? parcel.refcat : '';
    if (refcat.length === 0) return null;

    const areaM2 = toFiniteNum(parcel.areaM2) ?? 0;
    const address =
        typeof parcel.address === 'string' && parcel.address.length > 0 ? parcel.address : null;
    const source =
        typeof parcel.source === 'string' && parcel.source.length > 0 ? parcel.source : fallbackSource;

    // §L-640: pure geometry diagnostics + honesty-gated confidence.
    // WFS providers are real cadastral sources → kind:'cadastral'. pointToParcelM/candidateMarginM
    // are OVC-specific (Spain only) and are null here — no penalty: null is treated as "unavailable"
    // in computeParcelConfidence, not as "outside", so it does NOT downgrade the match tier.
    const metrics = computeParcelMetrics(ring);
    const confidence = computeParcelConfidence({
        ring,
        kind: 'cadastral',
        areaOfficialM2: toFiniteNum(parcel.areaOfficialM2),
        areaSigM2: metrics.areaSigM2,
        pointToParcelM: toFiniteNum(parcel.pointToParcelM),
        candidateMarginM: toFiniteNum(parcel.candidateMarginM),
    });

    return { ring, refcat, areaM2, address, source, metrics, confidence };
}

/**
 * Build a `ParcelProvider` that fetches the parcel under a WGS84 point from a same-origin proxy
 * (`${endpoint}?lon=&lat=`). Resolves to null on empty query, network error, non-OK, non-JSON, or
 * a miss — never throws (a P8 OTel span is opened per call).
 */
export function makeWfsParcelProvider(cfg: {
    readonly id: string;
    readonly label: string;
    readonly endpoint: string;
}): ParcelProvider {
    async function fetchParcelOutcomeAtPoint(lon: number, lat: number): Promise<ParcelLookupOutcome> {
        const span = _tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
        span.setAttribute('pryzm.parcel.provider', cfg.id);
        try {
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                span.setAttribute('pryzm.parcel.hit', false);
                span.setAttribute('pryzm.parcel.outcome', 'miss');
                return { status: 'miss' };
            }
            span.setAttribute('pryzm.parcel.lon', lon);
            span.setAttribute('pryzm.parcel.lat', lat);

            const url =
                `${cfg.endpoint}?lon=${encodeURIComponent(String(lon))}` +
                `&lat=${encodeURIComponent(String(lat))}`;

            const unreachable = (reason: string): ParcelLookupOutcome => {
                console.warn(`[gis] ${cfg.id}: UNREACHABLE (not a miss) — ${reason}`);
                span.setAttribute('pryzm.parcel.hit', false);
                span.setAttribute('pryzm.parcel.outcome', 'unreachable');
                return { status: 'unreachable', reason };
            };

            let res: Response;
            try {
                res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
            } catch (err) {
                // ⛔ A network error is the SOURCE failing, never the land being empty.
                return unreachable(`network error contacting the parcel proxy: ${String(err)}`);
            }

            // ⚠ A non-OK is READ, not discarded: `euCadastreProxy` answers HTTP 503 with a JSON
            // body carrying `outcome:'unconfigured'` (a key the deployment does not hold). That is
            // still "we could not ask", so it lands on `unreachable` either way — but reading the
            // body first is what lets the console name WHICH, instead of a bare status line.
            let json: unknown = null;
            let jsonErr: unknown = null;
            try {
                json = await res.json();
            } catch (err) {
                jsonErr = err;
            }
            if (!res.ok) {
                const named = readServerOutcome(json);
                return unreachable(
                    `the parcel proxy returned ${res.status} ${res.statusText}` +
                    (named ? ` (${named})` : ''),
                );
            }
            if (jsonErr !== null) {
                return unreachable(`the parcel proxy's response was not JSON: ${String(jsonErr)}`);
            }

            // ⭐ THE SERVER ALREADY SAID WHICH IT IS — this is the only place that reads it.
            // `euCadastreProxy.js` has shipped `outcome: 'ok' | 'empty' | 'unreachable' |
            // 'unconfigured' | 'unknown-source' | 'bad-input' | 'out-of-area'` on this very route
            // since it was written; the client threw it away and returned `null` for all seven.
            // Absent (an older server, a cached body minted before this change) ⇒ the conservative
            // reading: fall through to the parse and treat "no parcel" as the miss it has always
            // claimed to be. Under-claiming is safe here; over-claiming would put a "source
            // unavailable" banner over land that is genuinely unregistered.
            const serverOutcome = readServerOutcome(json);
            if (serverOutcome === 'unreachable' || serverOutcome === 'unconfigured' ||
                serverOutcome === 'unknown-source') {
                const reason = (json && typeof json === 'object')
                    ? (json as { reason?: unknown }).reason
                    : undefined;
                return unreachable(
                    serverOutcome === 'unconfigured'
                        // NOT an outage and NOT a miss — the deployment holds no credential for
                        // this register, so nothing was ever asked. It rides the `unreachable` arm
                        // because the ONE thing it is not is an answer about the land.
                        ? `${cfg.label} needs a credential this deployment does not hold`
                        : typeof reason === 'string' && reason.length > 0
                            ? `${cfg.label} did not answer: ${reason}`
                            : `${cfg.label} did not answer.`,
                );
            }

            const parcel = parseWfsProxyResponse(json, cfg.id);
            span.setAttribute('pryzm.parcel.hit', parcel !== null);
            if (parcel) {
                span.setAttribute('pryzm.parcel.outcome', 'ok');
                span.setAttribute('pryzm.parcel.refcat', parcel.refcat);
                span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
                console.log(
                    `[gis] ${cfg.id}: parcel ${parcel.refcat} (~${parcel.areaM2.toFixed(0)} m², ${parcel.ring.length} pts)` +
                    (parcel.address ? ` @ ${parcel.address}` : ''),
                );
                return { status: 'ok', parcel };
            }
            span.setAttribute('pryzm.parcel.outcome', 'miss');
            console.log(`[gis] ${cfg.id}: no parcel at ${lat.toFixed(6)}, ${lon.toFixed(6)} `
                + '(a VERIFIED miss — the source answered and holds nothing here)');
            return { status: 'miss' };
        } finally {
            span.end();
        }
    }

    /**
     * C57 §1.14 — the AREA query for every same-origin-proxy cadastre.
     *
     * ⭐ THE ROUTE IS DERIVED, NOT CONFIGURED. Every proxy leg in this family is registered as
     * `/api/parcel/<cc>` and its area sibling as `/api/parcel/<cc>/area` (see
     * `server/jurisdiction/index.js`, where the `/area` form is registered BEFORE the bare `:cc`
     * so the param route cannot swallow it). Deriving the route means adding a country stays a
     * data addition in `@pryzm/site-parcel-data` — §1.13.2 — rather than a second config field
     * that a new leg can silently forget to set.
     *
     * ⛔ IT DOES NOT DECIDE WHETHER THE LEG CAN ANSWER. The SERVER owns that: a leg without
     * `areaQuery: true` returns `unsupported` and names itself, which this reports verbatim. A
     * client-side capability table would be a SECOND copy of that declaration and would rot the
     * first time the server gained a leg — silently, because the chip would simply stay dark.
     */
    async function fetchParcelsInArea(
        lon: number,
        lat: number,
        radiusM: number,
    ): Promise<ParcelAreaOutcome> {
        return fetchParcelAreaFromProxy(`${cfg.endpoint}/area`, cfg.id, cfg.label, lon, lat, radiusM);
    }

    return {
        id: cfg.id,
        label: cfg.label,
        // ⛔ A NARROWING VIEW, NEVER A SECOND FETCH (see `ParcelProvider.fetchParcelAtPoint`).
        async fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null> {
            const outcome = await fetchParcelOutcomeAtPoint(lon, lat);
            return outcome.status === 'ok' ? outcome.parcel : null;
        },
        fetchParcelOutcomeAtPoint,
        fetchParcelsInArea,
    };
}

/** The server's own `outcome` discriminator, or null when the body carries none. */
function readServerOutcome(json: unknown): string | null {
    if (!json || typeof json !== 'object') return null;
    const v = (json as { outcome?: unknown }).outcome;
    return typeof v === 'string' && v.length > 0 ? v : null;
}
