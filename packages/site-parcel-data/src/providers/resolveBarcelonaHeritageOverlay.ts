// BARCELONA — `resolveBarcelonaHeritageOverlay`: the LIVE zone + the ONE impure seam wrapping the
// pure `bcnCatpatriFeatureInfo.ts` parser. Mirrors `resolveBalearsMuib.ts`'s shape (injected fetch,
// never throws, discriminated refusal) and `bcnRefosOVProvider.ts`'s Barcelona-specific proxy
// convention (same-origin path constant, NOT YET WIRED).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS RESOLVES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A point-in-time overlay READ of Barcelona's heritage catalogue (`WMSCATPATRI`, Llei 9/1993 del
// Patrimoni Cultural Català): is the query point inside a protected asset (BCIN/BCIL/BCIU — the
// `A`/`B`/`C` `Poligon_de_bé_...` layers) and/or inside a protection-buffer polygon (*entorn* /
// *conjunt protegit*, Art. 35/36). It answers ONE question — "what does the catalogue publish
// here" — and carries the catalogue's own words (`INTERVEN`) rather than interpreting them into a
// setback or a refusal; that interpretation is a downstream concern (a rule pack / dispatcher), not
// this provider's.
//
// ⛔ NOT WIRED. `BCN_CATPATRI_PATH` names the same-origin proxy route a browser would call (C57
// CSP — `w133.bcn.cat` must never be called directly from the client); no server route answers it
// yet. Until one exists, every resolution is `endpoint-unreachable`, which is the correct state —
// this file is schema + adapter, explicitly out of scope for gate/registry wiring.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FOUR HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. IT NEVER THROWS. Every miss, unreachable layer and malformed body is a typed outcome, so the
//     caller always has something honest to render.
//  2. AN EMPTY ANSWER IS SUCCESS, NOT A REFUSAL. Most of Barcelona is not heritage-protected, so
//     `effects: []` on `ok: true` is the COMMON case — unlike `resolveBalearsMuib` (every point IS
//     covered by *a* zone), there is no "must be covered" invariant here to violate.
//  3. FAILURE ≠ EMPTY, PER LAYER. Each of the layers queried can independently answer or fail to
//     answer; a layer that failed to answer is named in `unreachableLayers` and is NEVER silently
//     folded into "this layer published nothing" — §CONTEXT-DATA-HONESTY, L-422/457/467/469. Only
//     when EVERY layer fails to answer does the whole resolution refuse `endpoint-unreachable`.
//  4. ⛔ NO GEOMETRY, EVER. `geometryAvailable` is a literal `false` on every success — carried IN
//     THE DATA, not just in a comment, because `bcnCatpatriFeatureInfo.ts` established this WMS has
//     no channel that returns a boundary ring (verified this session). A caller wanting a drawable
//     buffer/asset outline must look elsewhere; this provider can only ever answer point-in/out.
//
// PURITY: the fetch is INJECTED (C58 §1.9); given the same bodies the parse is byte-deterministic.
// OTel spans per P8. Legal basis: Llei 9/1993 Art. 7-8 (statutory categories) / Art. 35/36
// (protection-buffer instruments) — established this session, cited here, not re-derived.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInBarcelona } from './barcelonaBbox.js';
import {
    parseBcnCatpatriFeatureInfo,
    bcnCatpatriIsServiceException,
    bcnHeritageStatutoryLetter,
    readBcnHeritageAssetFeature,
    readBcnHeritageBufferFeature,
    type BcnHeritageStatutoryLetter,
    type BcnHeritageAssetFeature,
    type BcnHeritageBufferFeature,
} from './bcnCatpatriFeatureInfo.js';

const tracer = trace.getTracer('pryzm.overlay.barcelona-heritage');

/** The same-origin proxy route a browser would call (never `w133.bcn.cat` directly — C57 CSP). */
export const BCN_CATPATRI_PATH = '/api/es-ct/bcn-catpatri-feature-info';

/** ⚠ UPSTREAM, for the proxy and for Node-side tooling ONLY. The browser must not call it. */
export const BCN_CATPATRI_SERVICE = 'https://w133.bcn.cat/WMSCATPATRI/service.svc/get';

/** Llei 9/1993 del Patrimoni Cultural Català — cited, not re-derived (established this session). */
export const BCN_HERITAGE_LEGAL_BASIS_ASSET = 'Llei 9/1993 (Patrimoni Cultural Català) Art. 7-8';
export const BCN_HERITAGE_LEGAL_BASIS_BUFFER = 'Llei 9/1993 (Patrimoni Cultural Català) Art. 35/36';

/**
 * ⛔ Carried in every successful resolution (property 4). This WMS's `GetFeatureInfo` never returns
 * geometry in any tried `INFO_FORMAT` — verified `text/xml` and `application/gml+xml; version=3.1`
 * byte-identical, attribute-bag only. See `bcnCatpatriFeatureInfo.ts` header for the full record.
 */
export const BCN_HERITAGE_NO_GEOMETRY_CAVEAT =
    'WMSCATPATRI GetFeatureInfo returns attribute bags only — no boundary geometry is retrievable ' +
    'from this service (verified live, text/xml and application/gml+xml both attribute-only). ' +
    'This overlay answers point-in/point-out only; it cannot supply a drawable asset or buffer ring.';

/** One `Poligon_de_bé_...` (asset) layer this resolver queries by default. */
export interface BcnHeritageAssetLayerDef {
    readonly layerName: string;
    readonly letter: BcnHeritageStatutoryLetter;
    /** True only for layers whose schema was read from a LIVE feature this session. */
    readonly verified: boolean;
}

/**
 * The asset layers queried by default. `A` (BCIN) is schema-VERIFIED live at Barcelona Cathedral.
 * `B`/`C` share the identical `Poligon_de_bé_...` naming + Hexagon attribute-bag transport per
 * `GetCapabilities`'s own layer tree, so they are queried under the same reader — ⚠ their schema is
 * ASSUMED by source-family symmetry, not independently re-verified with a live feature this
 * session. `D`/`E` are deliberately EXCLUDED: `GetCapabilities` shows they carry no `Poligon_de_...`
 * sublayer at all (point-only in this service), so a polygon-schema reader cannot honestly cover
 * them; querying their point layers is out of scope for this task.
 */
export const BCN_HERITAGE_ASSET_LAYERS: readonly BcnHeritageAssetLayerDef[] = Object.freeze([
    { layerName: 'Poligon_de_bé_cultural_d_interès_nacional__A_', letter: 'A', verified: true },
    { layerName: 'Poligon_de_bé_cultural_d_interès_local__B_', letter: 'B', verified: false },
    { layerName: 'Poligon_de_bé_d_interès_urbanístic__C_', letter: 'C', verified: false },
]);

/** One protection-buffer layer this resolver queries by default. */
export interface BcnHeritageBufferLayerDef {
    readonly layerName: string;
    readonly verified: boolean;
}

/**
 * `Polígon_d_entorn_de_protecció_A` is schema-VERIFIED live at Barcelona Cathedral (3 overlapping
 * buffers returned). `Polígon_de_conjunt_protegit` is its sibling in the same
 * `Conjunt_o_entorn_protegit` group — ASSUMED identical by source-family symmetry, not
 * independently re-verified.
 */
export const BCN_HERITAGE_BUFFER_LAYERS: readonly BcnHeritageBufferLayerDef[] = Object.freeze([
    { layerName: 'Polígon_d_entorn_de_protecció_A', verified: true },
    { layerName: 'Polígon_de_conjunt_protegit', verified: false },
]);

/** A WGS84 query point. */
export interface BcnHeritageLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the resolver is unit-testable without the network. */
export interface BcnHeritageOverlayDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base (default `BCN_CATPATRI_PATH`). */
    readonly pathBase?: string;
    /** Override the default asset layer set (tests may narrow it to just the verified `A` layer). */
    readonly assetLayers?: readonly BcnHeritageAssetLayerDef[];
    /** Override the default buffer layer set. */
    readonly bufferLayers?: readonly BcnHeritageBufferLayerDef[];
}

/** Why a resolution refused OUTRIGHT (never returned any per-layer answer at all). */
export type BcnHeritageOverlayRefusalReason =
    /** The point is outside the loose Barcelona metropolitan bbox, or is not finite. */
    | 'out-of-barcelona'
    /** No `fetch` available, or EVERY queried layer failed to answer (transport-wide outage). */
    | 'endpoint-unreachable';

/** One resolved effect — a single asset or buffer feature covering the query point. */
export type BarcelonaHeritageOverlayEffect =
    | {
          readonly kind: 'protected-asset';
          readonly layerName: string;
          readonly statutoryLetter: BcnHeritageStatutoryLetter | null;
          readonly legalBasis: typeof BCN_HERITAGE_LEGAL_BASIS_ASSET;
          readonly feature: BcnHeritageAssetFeature;
      }
    | {
          readonly kind: 'protection-buffer';
          readonly layerName: string;
          readonly statutoryLetter: BcnHeritageStatutoryLetter | null;
          readonly legalBasis: typeof BCN_HERITAGE_LEGAL_BASIS_BUFFER;
          readonly feature: BcnHeritageBufferFeature;
      };

export type BarcelonaHeritageOverlayResolution =
    | {
          readonly ok: true;
          readonly effects: readonly BarcelonaHeritageOverlayEffect[];
          /** Layer names that were asked. Provenance — what was actually queried this call. */
          readonly queriedLayers: readonly string[];
          /**
           * ⭐ Layers that did NOT answer (property 3). Non-empty means this resolution is a
           * PARTIAL read — some layers may hide an effect this call could not see. Never silently
           * dropped into `effects` as "nothing there".
           */
          readonly unreachableLayers: readonly string[];
          /** ⛔ Always `false` — property 4. Carried in the data, not just documented. */
          readonly geometryAvailable: false;
          readonly caveat: typeof BCN_HERITAGE_NO_GEOMETRY_CAVEAT;
      }
    | { readonly ok: false; readonly reason: BcnHeritageOverlayRefusalReason; readonly detail?: string };

/** Build the (not-yet-wired) proxy URL for one layer at one point. */
function proxyUrl(base: string, point: BcnHeritageLatLon, layerName: string): string {
    return (
        `${base}?lat=${encodeURIComponent(String(point.lat))}` +
        `&lon=${encodeURIComponent(String(point.lon))}` +
        `&layer=${encodeURIComponent(layerName)}`
    );
}

interface LayerFetchResult {
    readonly layerName: string;
    readonly ok: boolean;
    readonly xml: string | null;
}

/** Fetch one layer's `GetFeatureInfo` body through the proxy. NEVER throws. */
async function fetchLayer(
    fetchImpl: typeof fetch,
    base: string,
    point: BcnHeritageLatLon,
    layerName: string,
): Promise<LayerFetchResult> {
    try {
        const res = await fetchImpl(proxyUrl(base, point, layerName), {
            method: 'GET',
            headers: { Accept: 'text/xml' },
        });
        if (!res || !res.ok) return { layerName, ok: false, xml: null };
        const xml = await res.text();
        if (bcnCatpatriIsServiceException(xml)) return { layerName, ok: false, xml };
        return { layerName, ok: true, xml };
    } catch (fetchErr) {
        console.warn(
            '[bcn-catpatri] layer fetch failed (non-fatal):',
            layerName,
            (fetchErr as Error)?.message ?? fetchErr,
        );
        return { layerName, ok: false, xml: null };
    }
}

/**
 * Resolve the Barcelona heritage overlay (protected assets + protection buffers) at a WGS84 point,
 * through the same-origin `/api/es-ct/bcn-catpatri-feature-info` proxy (not yet wired — every call
 * refuses `endpoint-unreachable` until a server route exists). ⛔ NEVER throws.
 *
 * P8 — emits `pryzm.overlay.resolveBarcelonaHeritageOverlay`.
 */
export async function resolveBarcelonaHeritageOverlay(
    point: BcnHeritageLatLon | null | undefined,
    deps: BcnHeritageOverlayDeps = {},
): Promise<BarcelonaHeritageOverlayResolution> {
    const span = tracer.startSpan('pryzm.overlay.resolveBarcelonaHeritageOverlay');
    span.setAttribute('provider', 'bcn-wmscatpatri');
    try {
        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInBarcelona(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-barcelona');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-barcelona' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable', detail: 'no fetch implementation available' };
        }

        const base = deps.pathBase ?? BCN_CATPATRI_PATH;
        const assetLayers = deps.assetLayers ?? BCN_HERITAGE_ASSET_LAYERS;
        const bufferLayers = deps.bufferLayers ?? BCN_HERITAGE_BUFFER_LAYERS;

        const [assetResults, bufferResults] = await Promise.all([
            Promise.all(assetLayers.map((l) => fetchLayer(fetchImpl, base, point, l.layerName))),
            Promise.all(bufferLayers.map((l) => fetchLayer(fetchImpl, base, point, l.layerName))),
        ]);

        const queriedLayers = [...assetLayers.map((l) => l.layerName), ...bufferLayers.map((l) => l.layerName)];
        const unreachableLayers = [...assetResults, ...bufferResults]
            .filter((r) => !r.ok)
            .map((r) => r.layerName);

        if (unreachableLayers.length === queriedLayers.length) {
            span.setAttribute('resultFields', 'endpoint-unreachable');
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'endpoint-unreachable',
                detail: 'no queried layer answered',
            };
        }

        const effects: BarcelonaHeritageOverlayEffect[] = [];

        for (const result of assetResults) {
            if (!result.ok || result.xml === null) continue;
            for (const raw of parseBcnCatpatriFeatureInfo(result.xml)) {
                const feature = readBcnHeritageAssetFeature(raw);
                effects.push({
                    kind: 'protected-asset',
                    layerName: raw.layerName,
                    statutoryLetter: bcnHeritageStatutoryLetter(feature.nivell),
                    legalBasis: BCN_HERITAGE_LEGAL_BASIS_ASSET,
                    feature,
                });
            }
        }
        for (const result of bufferResults) {
            if (!result.ok || result.xml === null) continue;
            for (const raw of parseBcnCatpatriFeatureInfo(result.xml)) {
                const feature = readBcnHeritageBufferFeature(raw);
                effects.push({
                    kind: 'protection-buffer',
                    layerName: raw.layerName,
                    statutoryLetter: bcnHeritageStatutoryLetter(feature.nivell),
                    legalBasis: BCN_HERITAGE_LEGAL_BASIS_BUFFER,
                    feature,
                });
            }
        }

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('effectCount', effects.length);
        span.setAttribute('unreachableLayerCount', unreachableLayers.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            effects,
            queriedLayers,
            unreachableLayers,
            geometryAvailable: false,
            caveat: BCN_HERITAGE_NO_GEOMETRY_CAVEAT,
        };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[bcn-catpatri] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable', detail: 'unexpected error' };
    } finally {
        span.end();
    }
}
