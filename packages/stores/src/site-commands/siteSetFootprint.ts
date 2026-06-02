// A.7.c.2 (Phase A · Sprint 2) — `site.setFootprint` command handler.
//
// Per [C19 §4.1] + §1.6: sets or replaces the BuildingFootprint.
// Containment + setback violations are surfaced as `warnings` per
// §1.6 (non-fatal lint at edit time, HARD fail at IFC export per
// C25 §1.4) — the command STILL succeeds.
//
// L3-layer: pure. No I/O. Uses the canonical
// `checkFootprintContainment` validator from @pryzm/site-validators
// (per [C50 §1.9] / "single source of truth" doctrine).

import {
    checkFootprintContainment,
    type EdgeClassification,
} from '@pryzm/site-validators';
import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteSetFootprintPayloadSchema,
    type SiteCommandResult,
    type SiteFootprintSetEvent,
} from './types.js';

/**
 * Execute `site.setFootprint`. Per [C19 §1.6] runs the containment +
 * setback compliance check; surfaces violations as `warnings` so the
 * Site Inspector can render the lint. The command STILL succeeds
 * (footprint commits to the store) — the hard fail happens at IFC
 * export time per C25 §1.4.
 *
 *   - Validates payload (Zod).
 *   - Rejects when no Site exists / siteId mismatch (`no-site`).
 *   - Runs containment + setback check via @pryzm/site-validators.
 *   - Commits the footprint to the store.
 *   - Returns the `site.footprint-set` event + optional `warnings`.
 */
export function siteSetFootprint(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteFootprintSetEvent> {
    let payload;
    try {
        payload = SiteSetFootprintPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.setFootprint payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.setFootprint: no Site with id '${payload.siteId}' is set`,
        };
    }

    // §1.6 containment check via the canonical L2 validator. Soft fail
    // — we capture the report and pass it back as `warnings`.
    const containment = checkFootprintContainment(
        payload.footprint.polygon,
        current.parcel.boundary.polygon,
        current.parcel.boundary.edgeClassifications as readonly EdgeClassification[],
        current.parcel.setbacks,
    );

    const next = { ...current, footprint: payload.footprint };
    store.set(next);

    const event: SiteFootprintSetEvent = {
        type: 'site.footprint-set',
        siteId: current.id,
        footprint: payload.footprint,
    };
    return {
        ok: true,
        event,
        site: next,
        ...(containment.ok ? {} : { warnings: { containment } }),
    };
}
