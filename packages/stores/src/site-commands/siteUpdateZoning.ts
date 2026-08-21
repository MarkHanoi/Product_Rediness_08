// A.7.c.2 (Phase A · Sprint 2) — `site.updateZoning` command handler.
//
// Per [C19 §4.1]: patches mutable parcel fields (zoning · setbacks ·
// maxFAR · maxHeight). The polygon is NOT touched (§1.4 immutability).
// All four sub-fields are optional — caller supplies only the deltas.
//
// L3-layer: pure. No I/O.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteUpdateZoningPayloadSchema,
    type SiteCommandResult,
    type SiteZoningUpdatedEvent,
} from './types.js';

/**
 * Execute `site.updateZoning`. Patches the parcel's mutable fields.
 *
 *   - Validates payload (Zod).
 *   - Rejects when no Site exists / siteId mismatch (`no-site`).
 *   - Per [C19 §1.4] the parcel polygon is NOT modified — only the
 *     mutable attributes change.
 *   - Returns the `site.zoning-updated` event carrying the post-patch
 *     parcel snapshot.
 */
export function siteUpdateZoning(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteZoningUpdatedEvent> {
    let payload;
    try {
        payload = SiteUpdateZoningPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.updateZoning payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.updateZoning: no Site with id '${payload.siteId}' is set`,
        };
    }

    // Compose the patched parcel. The polygon is preserved verbatim
    // (§1.4 immutability — we MUST NOT replace `boundary`).
    const nextParcel = {
        ...current.parcel,
        setbacks: payload.setbacks
            ? { ...current.parcel.setbacks, ...payload.setbacks }
            : current.parcel.setbacks,
        maxFAR:
            payload.maxFAR === undefined
                ? current.parcel.maxFAR
                : payload.maxFAR,
        maxHeight:
            payload.maxHeight === undefined
                ? current.parcel.maxHeight
                : payload.maxHeight,
        zoning: payload.zoning
            ? { ...current.parcel.zoning, ...payload.zoning }
            : current.parcel.zoning,
        // ADR-0270 option A / C58 §1.7a — persist the inset ring as the buildable TRUTH.
        // `undefined` = untouched (delta semantics, as every field above); an explicit `null`
        // CLEARS a stale envelope rather than leaving a ring that no longer describes this
        // parcel — which would be worse than none, because it still looks authoritative.
        buildableRing:
            payload.buildableRing === undefined
                ? (current.parcel.buildableRing ?? null)
                : payload.buildableRing,
        // §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — the FULL dated determination record,
        // same delta semantics as `buildableRing` (omitted = untouched · null = explicit clear).
        // `?? null` keeps legacy parcels (saved before the field existed) well-formed.
        buildableDetermination:
            payload.buildableDetermination === undefined
                ? (current.parcel.buildableDetermination ?? null)
                : payload.buildableDetermination,
    };

    const next = { ...current, parcel: nextParcel };
    store.set(next);

    const event: SiteZoningUpdatedEvent = {
        type: 'site.zoning-updated',
        siteId: current.id,
        parcel: nextParcel,
    };
    return { ok: true, event, site: next };
}
