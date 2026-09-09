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
import type { ParcelAreaOutcome, ParcelFeature, ParcelLookupOutcome, ParcelProvider } from './ParcelProvider.js';
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

    // ⛔ A NARROWING VIEW, NEVER A SECOND FETCH (see `ParcelProvider.fetchParcelAtPoint`).
    async fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null> {
        const outcome = await this.fetchParcelOutcomeAtPoint(lon, lat);
        return outcome.status === 'ok' ? outcome.parcel : null;
    },

    /**
     * §UPSTREAM-UNREACHABLE-IS-NOT-A-MISS — the honest arm the interface requires.
     *
     * ⭐ THE DISTINCTION IS REAL HERE TOO, and it was previously thrown away at the `catch`: an
     * OSM tile read that FAILS is not a place with no buildings. The footprint layer is the
     * universal last resort, so a flattened failure here is the last chance to tell the user their
     * click found nothing because nothing is there, rather than because a tile read fell over.
     */
    async fetchParcelOutcomeAtPoint(lon: number, lat: number): Promise<ParcelLookupOutcome> {
        const span = _tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
        span.setAttribute('pryzm.parcel.provider', 'footprint');
        try {
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                span.setAttribute('pryzm.parcel.hit', false);
                span.setAttribute('pryzm.parcel.outcome', 'miss');
                return { status: 'miss' };
            }
            span.setAttribute('pryzm.parcel.lon', lon);
            span.setAttribute('pryzm.parcel.lat', lat);

            let collection;
            try {
                collection = await fetchContextBuildings(lat, lon);
            } catch (err) {
                const reason = `the OSM footprint layer could not be read: ${String(err)}`;
                console.warn(`[gis] footprint: UNREACHABLE (not a miss) — ${reason}`);
                span.setAttribute('pryzm.parcel.hit', false);
                span.setAttribute('pryzm.parcel.outcome', 'unreachable');
                return { status: 'unreachable', reason };
            }

            const parcel = pickFootprintAtPoint(collection?.features ?? [], lon, lat);
            span.setAttribute('pryzm.parcel.hit', parcel !== null);
            if (parcel) {
                span.setAttribute('pryzm.parcel.outcome', 'ok');
                span.setAttribute('pryzm.parcel.refcat', parcel.refcat);
                console.log(
                    `[gis] footprint: OSM building outline ${parcel.refcat} (~${parcel.areaM2.toFixed(0)} m², ` +
                    `${parcel.ring.length} pts) — labelled as a footprint, NOT a cadastral parcel.`,
                );
                return { status: 'ok', parcel };
            }
            span.setAttribute('pryzm.parcel.outcome', 'miss');
            console.log(`[gis] footprint: no OSM building outline at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            return { status: 'miss' };
        } finally {
            span.end();
        }
    },

    /**
     * C57 §1.14 — ⛔ `unsupported`, AND THIS IS THE MOST IMPORTANT `unsupported` IN THE SYSTEM.
     *
     * The OSM building layer CAN enumerate an area — `fetchContextBuildings` does exactly that,
     * and this provider could trivially return every footprint in the box. It must not, and the
     * reason is C57 §1.13.4: a footprint is a BUILDING OUTLINE, not a cadastral parcel, and the
     * overlay this method serves is called "cadastral parcel boundaries".
     *
     * Drawing roof outlines under that label would be the [[fake-more-capable-than-real]] shape at
     * its most convincing: the lines would look exactly like a plausible parcel fabric, they would
     * be dense and well-registered, and NOTHING would look wrong — while every boundary shown was
     * a different legal object from the one claimed. A user measuring a setback against a roof
     * edge gets a wrong answer with no way to see it is wrong.
     *
     * So the honest answer is that PRYZM has no cadastral boundary source here, which is TRUE, and
     * is a completely different statement from "there are no parcels here".
     */
    async fetchParcelsInArea(): Promise<ParcelAreaOutcome> {
        return {
            status: 'unsupported',
            reason: 'No open cadastre is reachable here, so PRYZM has no parcel boundaries to '
                + 'draw. Building footprints are available for this area, but a roof outline is '
                + 'not a property boundary and PRYZM will not draw one as though it were.',
        };
    },
};
