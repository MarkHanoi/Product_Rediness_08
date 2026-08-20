// A.7.c (Phase A · Sprint 2) — `site.setParcelBoundary` command handler.
//
// Per [C19 §4.1] + §1.4 — one-shot polygon authoring. REJECTED if
// `Parcel.boundary.polygon` is already non-empty (the parcel polygon
// is immutable post-create; to change it the caller MUST issue a
// `site.replace` per §1.4).
//
// Validates §2.7 invariant 3: `edgeClassifications.length === polygon.length`.

// A.7.d — canonical pure-geometry validators are the single source of
// truth for parcel-polygon math (per C19 §2.7).
import {
    polygonArea,
    checkEdgeClassifications,
} from '@pryzm/site-validators';
import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteSetParcelBoundaryPayloadSchema,
    type SiteCommandResult,
    type SiteParcelBoundarySetEvent,
} from './types.js';

/**
 * Execute `site.setParcelBoundary`. One-shot per §1.4.
 *
 *   - Validates payload (Zod).
 *   - Rejects if no Site exists (returns `no-site`).
 *   - Rejects if the Parcel already has a non-empty polygon
 *     (returns `parcel-already-set` — §1.4 immutability).
 *   - Rejects if edgeClassifications.length ≠ polygon.length
 *     (returns `edge-classifications-mismatch` — §2.7).
 *   - Commits the new boundary and computes `area`.
 *   - Returns the `site.parcel-boundary-set` event.
 */
export function siteSetParcelBoundary(
    rawPayload: unknown,
    store: SiteModelStore,
): SiteCommandResult<SiteParcelBoundarySetEvent> {
    let payload;
    try {
        payload = SiteSetParcelBoundaryPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `site.setParcelBoundary payload invalid: ${(err as Error).message}`,
        };
    }

    const current = store.getSite();
    if (!current || current.id !== payload.siteId) {
        return {
            ok: false,
            reason: 'no-site',
            message: `site.setParcelBoundary: no Site with id '${payload.siteId}' is set`,
        };
    }

    // §1.4 immutability: REJECT if boundary already non-empty.
    if (current.parcel.boundary.polygon.length > 0) {
        return {
            ok: false,
            reason: 'parcel-already-set',
            message:
                `site.setParcelBoundary: parcel polygon is immutable post-create per C19 §1.4 — ` +
                `use site.replace to change it`,
        };
    }

    // §2.7 invariant 3 via the canonical validator.
    const edgeCheck = checkEdgeClassifications(
        payload.boundary.polygon,
        payload.boundary.edgeClassifications,
    );
    if (!edgeCheck.ok) {
        return {
            ok: false,
            reason: 'edge-classifications-mismatch',
            message: edgeCheck.message,
        };
    }

    const area = polygonArea(payload.boundary.polygon);

    // §L-1580 (C57 §1.4 / §2.2) — record the ring AND its attribution in ONE write.
    //
    // `undefined` (the caller supplied nothing) and `null` (the caller explicitly has no
    // provenance) both persist as `null`, which means NOT RECORDED. There is deliberately no
    // fabricated default here: stamping `source: 'user-authored'` on a ring whose origin we
    // do not know would make an unknown indistinguishable from a fact, which is the exact
    // failure C57 §1.4 and C84 EI-1b forbid. The absence is the honest value, and the UI
    // renders it in words.
    const provenance = payload.provenance ?? null;

    const next = {
        ...current,
        parcel: {
            ...current.parcel,
            boundary: payload.boundary,
            provenance,
            area,
        },
    };
    store.set(next);

    const event: SiteParcelBoundarySetEvent = {
        type: 'site.parcel-boundary-set',
        siteId: current.id,
        boundary: payload.boundary,
        area,
        provenance,
    };
    return { ok: true, event, site: next };
}
