// L-613 — THE CLIENT-SIDE PARCEL PROVIDER REGISTRY.
//
// The map's "Select parcel" mode used to consume ONE hard-coded provider (Catastro/Spain), so a
// click outside Spain resolved nothing. This registry makes the SAME click resolve the right
// cadastre in every country that has an open one — and an honest OSM footprint everywhere else —
// by routing on the pure `resolveParcelJurisdiction` table in `@pryzm/site-parcel-data` (the
// national analogue of the way `siteDispatch` routes zoning on the city predicates).
//
// FLOW (never throws; a click is never dead):
//   1. resolve the jurisdiction for the click point (WGS84).
//   2. cadastral jurisdiction → hit its same-origin proxy provider; on a HIT return the real
//      parcel; on a MISS (outside the cadastre's territory / no parcel / upstream down) …
//   3. … fall back to the universal OSM FOOTPRINT — labelled `footprint (OSM)`, NEVER as a
//      cadastral parcel (C58 §1.4). Footprint-fallback jurisdictions (SA/other-Länder) go
//      straight here.
//
// The `ParcelFeature.source` each provider stamps ('catastro' · 'ign-fr' · 'pdok-nl' · 'geonorge-no'
// · 'alkis-nrw' · 'swisstopo-av' · 'footprint (OSM)') is the honest per-parcel provenance the info card renders.

import { trace } from '@opentelemetry/api';
import {
    resolveParcelJurisdiction,
    resolveParcelCandidates,
    resolveParcelWithFallback,
    type ParcelJurisdiction,
} from '@pryzm/site-parcel-data';
import type { ParcelFeature, ParcelProvider } from './ParcelProvider.js';
import { catastroParcelProvider } from './CatastroParcelProvider.js';
import { dkMatrikelParcelProvider } from './DkMatrikelParcelProvider.js';
import { makeWfsParcelProvider } from './WfsParcelProvider.js';
import { footprintParcelProvider } from './FootprintParcelProvider.js';

const _tracer = trace.getTracer('pryzm.parcel');

/** Lazily-built WFS proxy providers, cached by proxy path (one provider per cadastre). */
const _wfsCache = new Map<string, ParcelProvider>();

/** The cadastral provider for a jurisdiction (or null if it is a footprint-fallback jurisdiction). */
export function cadastralProviderFor(jur: ParcelJurisdiction): ParcelProvider | null {
    if (jur.kind !== 'cadastral' || !jur.proxyPath) return null;
    // Spain + Denmark keep their NAMED adapters (env-overridable endpoints); every other cadastre
    // is the generic same-origin-proxy provider. All share the identical `ParcelProvider` interface,
    // so the map's "Select parcel" click behaves the same regardless of which one answers.
    if (jur.providerId === 'catastro') return catastroParcelProvider;
    if (jur.providerId === 'matrikel-dk') return dkMatrikelParcelProvider;
    let p = _wfsCache.get(jur.proxyPath);
    if (!p) {
        p = makeWfsParcelProvider({ id: jur.providerId, label: jur.label, endpoint: jur.proxyPath });
        _wfsCache.set(jur.proxyPath, p);
    }
    return p;
}

/**
 * Resolve the cadastral + footprint providers for a WGS84 point. Exposed for callers that want to
 * inspect the routing (e.g. a coverage panel); the map consumes `registryParcelProvider` instead.
 */
export function resolveParcelProvider(lat: number, lon: number): {
    readonly jurisdiction: ParcelJurisdiction;
    readonly cadastral: ParcelProvider | null;
    readonly footprint: ParcelProvider;
} {
    const jurisdiction = resolveParcelJurisdiction(lat, lon);
    return { jurisdiction, cadastral: cadastralProviderFor(jurisdiction), footprint: footprintParcelProvider };
}

/** §L-12912 — the one attribution string for an OSM-footprint fallback (C57 §1.5 / §1.9). */
export const PARCEL_FOOTPRINT_ATTRIBUTION =
    'OpenStreetMap contributors — building footprint, not a cadastral parcel';

/**
 * §L-12912 — THE ONE attribution for a fetched parcel: the human label and region of the cadastre
 * that ACTUALLY answered, used by the map card BEFORE commit and by the provenance record AT
 * commit, so the two cannot disagree (C06 §13.3 one-producer).
 *
 * Resolution is by the parcel's own `source` (the provider id every leg stamps) against the
 * candidate rows enclosing the ring's first vertex — not by "the most specific row at this point".
 * The L-650 priority fallback means the most specific row can MISS and an enclosing one answer
 * (Eindhoven BE→NL, Kirkenes FI→NO); attributing by point alone would then name a cadastre that
 * never served the ring. The most-specific row is the fallback only when no row carries the
 * source. A footprint fallback never inherits a national cadastre's label. `fallbackLabel` (the
 * host's generic provider label) is returned only when nothing better is known — never a guess.
 */
export function resolveParcelAttribution(
    parcel: ParcelFeature,
    fallbackLabel: string | null,
): { readonly label: string | null; readonly regionCode: string | null } {
    if (/^footprint\b/i.test(parcel.source ?? '')) {
        return { label: PARCEL_FOOTPRINT_ATTRIBUTION, regionCode: null };
    }
    const first = parcel.ring[0];
    if (!first) return { label: fallbackLabel, regionCode: null };
    try {
        const candidates = resolveParcelCandidates(first.lat, first.lon);
        const bySource = candidates.find((c) => c.providerId === parcel.source);
        const row = bySource ?? resolveParcelJurisdiction(first.lat, first.lon);
        return { label: row.label || fallbackLabel, regionCode: row.regionCode ?? null };
    } catch (e) {
        // Routing is pure, but a throw here must never block a card or a commit the user asked
        // for. The generic label is honest if less specific — never a guessed national authority.
        console.warn('[gis] §L-12912 — parcel attribution routing failed; using the generic label:', e);
        return { label: fallbackLabel, regionCode: null };
    }
}

/**
 * THE provider the map uses. Dispatches every `fetchParcelAtPoint(lon, lat)` through the routing
 * registry: real cadastre where one is reachable, honest OSM footprint everywhere else. Never
 * throws; opens a P8 span carrying the resolved region/provider/kind.
 */
export const registryParcelProvider: ParcelProvider = {
    id: 'registry',
    // A generic label; the honest per-parcel provenance is `ParcelFeature.source`, which the card renders.
    label: 'Cadastral parcel / building footprint',

    async fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null> {
        const span = _tracer.startSpan('pryzm.parcel.registry.fetchParcelAtPoint');
        try {
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }
            span.setAttribute('pryzm.parcel.lon', lon);
            span.setAttribute('pryzm.parcel.lat', lat);
            span.setAttribute(
                'pryzm.parcel.candidates',
                resolveParcelCandidates(lat, lon).map((c) => c.providerId).join(','),
            );

            // PER-POINT PRIORITY-FALLBACK (L-650) — try each enclosing cadastre most-specific first,
            // falling THROUGH to the next when a provider misses. This is what fixes the coarse-bbox
            // border regressions: a proxy-pending NEW cadastre (BE/GB/IT/FI) that returns null hands
            // off to the enclosing LIVE one (Eindhoven BE→NL, Kirkenes FI→NO, Calais GB→FR) instead of
            // dropping straight to the footprint. Footprint-fallback jurisdictions have no cadastral
            // provider → they contribute nothing and the resolver continues.
            const hit = await resolveParcelWithFallback<ParcelFeature>(lat, lon, (jur) => {
                const cadastral = cadastralProviderFor(jur);
                return cadastral ? cadastral.fetchParcelAtPoint(lon, lat) : null;
            });
            if (hit) {
                span.setAttribute('pryzm.parcel.region', hit.jurisdiction.regionCode);
                span.setAttribute('pryzm.parcel.provider', hit.jurisdiction.providerId);
                span.setAttribute('pryzm.parcel.kind', hit.jurisdiction.kind);
                span.setAttribute('pryzm.parcel.hit', true);
                span.setAttribute('pryzm.parcel.resolvedBy', 'cadastral');
                return hit.parcel;
            }
            console.log(
                `[gis] parcel-registry: no cadastre answered at ` +
                `${lat.toFixed(5)},${lon.toFixed(5)} — falling back to the OSM footprint.`,
            );

            const footprint = await footprintParcelProvider.fetchParcelAtPoint(lon, lat);
            span.setAttribute('pryzm.parcel.hit', footprint !== null);
            span.setAttribute('pryzm.parcel.resolvedBy', footprint ? 'footprint' : 'none');
            return footprint;
        } finally {
            span.end();
        }
    },
};
