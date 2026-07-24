// L-613 — the UNIVERSAL footprint fallback provider.
//
// WHY THIS EXISTS
// ---------------
// A cadastral parcel service is reachable in only a handful of countries (Spain, France,
// Netherlands, Norway, NRW). Everywhere else — Saudi Arabia (geo-fenced), Denmark (token-gated),
// Germany outside NRW / Switzerland (licence-gated), the whole rest of the world — the map's
// "Select parcel" click would resolve NOTHING. This provider gives Spain-parity "click to select"
// GLOBALLY by falling back to the OSM building FOOTPRINT already fetched for the map's context
// layer: the polygon under the cursor becomes the plot boundary.
//
// ⚠ HONESTY (C58 §1.4) — a footprint is NOT a legal parcel. It is the building outline, not the
// land boundary, and it carries no cadastral reference. So this provider labels its output
// `source: 'footprint (OSM)'` and its `refcat` as an OSM id, NEVER as a cadastral reference. The
// info card renders that provenance verbatim. Presenting a footprint as a legal parcel is exactly
// the false-provenance failure this labelling prevents.
//
// PURE-ish: it reads the keyless OSM footprint loader (`fetchContextBuildings`) that the map
// already uses; no THREE / Cesium / DOM. Resolves to null when there is no footprint under the
// point (an honest "nothing here — draw instead"), and NEVER throws.

import { trace } from '@opentelemetry/api';
import type { ParcelFeature, ParcelProvider } from './ParcelProvider.js';
import { fetchContextBuildings } from '../../geospatial/contextBuildings.js';
// The PURE pick lives in footprintPick.ts (type-only context import) so it is testable without
// dragging in the context-buildings network graph (contextTiles → pmtiles).
import { pickFootprintAtPoint } from './footprintPick.js';

export { pickFootprintAtPoint } from './footprintPick.js';

const _tracer = trace.getTracer('pryzm.parcel');

/**
 * The universal footprint fallback `ParcelProvider`. `fetchParcelAtPoint` loads OSM footprints
 * around the click (the keyless context-buildings loader the map already uses) and returns the
 * footprint under the cursor as an honestly-labelled `ParcelFeature`, or null. Never throws.
 */
export const footprintParcelProvider: ParcelProvider = {
    id: 'footprint',
    label: 'Building footprint (OSM) — not a cadastral parcel',

    async fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null> {
        const span = _tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
        span.setAttribute('pryzm.parcel.provider', 'footprint');
        try {
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }
            span.setAttribute('pryzm.parcel.lon', lon);
            span.setAttribute('pryzm.parcel.lat', lat);

            let collection;
            try {
                collection = await fetchContextBuildings(lat, lon);
            } catch (err) {
                console.warn('[gis] footprint: context-buildings fetch failed', err);
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }

            const parcel = pickFootprintAtPoint(collection?.features ?? [], lon, lat);
            span.setAttribute('pryzm.parcel.hit', parcel !== null);
            if (parcel) {
                span.setAttribute('pryzm.parcel.refcat', parcel.refcat);
                console.log(
                    `[gis] footprint: OSM building outline ${parcel.refcat} (~${parcel.areaM2.toFixed(0)} m², ` +
                    `${parcel.ring.length} pts) — labelled as a footprint, NOT a cadastral parcel.`,
                );
            } else {
                console.log(`[gis] footprint: no OSM building outline at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            }
            return parcel;
        } finally {
            span.end();
        }
    },
};
