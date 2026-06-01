// A.7.c (Phase A · Sprint 2) — `site.setParcelBoundary` command handler.
//
// Per [C19 §4.1] + §1.4 — one-shot polygon authoring. REJECTED if
// `Parcel.boundary.polygon` is already non-empty (the parcel polygon
// is immutable post-create; to change it the caller MUST issue a
// `site.replace` per §1.4).
//
// Validates §2.7 invariant 3: `edgeClassifications.length === polygon.length`.

import type { SiteModelStore } from '../SiteModelStore.js';
import {
    SiteSetParcelBoundaryPayloadSchema,
    type SiteCommandResult,
    type SiteParcelBoundarySetEvent,
} from './types.js';

function computeArea(polygon: ReadonlyArray<{ x: number; z: number }>): number {
    if (polygon.length < 3) return 0;
    let signed = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        signed += a.x * b.z - b.x * a.z;
    }
    return Math.abs(signed) / 2;
}

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

    // §2.7 cross-schema validation: edgeClassifications length MUST equal polygon length.
    if (
        payload.boundary.edgeClassifications.length !==
        payload.boundary.polygon.length
    ) {
        return {
            ok: false,
            reason: 'edge-classifications-mismatch',
            message:
                `site.setParcelBoundary: edgeClassifications.length ` +
                `(${payload.boundary.edgeClassifications.length}) MUST equal ` +
                `polygon.length (${payload.boundary.polygon.length}) per C19 §2.7`,
        };
    }

    const area = computeArea(payload.boundary.polygon);
    const next = {
        ...current,
        parcel: {
            ...current.parcel,
            boundary: payload.boundary,
            area,
        },
    };
    store.set(next);

    const event: SiteParcelBoundarySetEvent = {
        type: 'site.parcel-boundary-set',
        siteId: current.id,
        boundary: payload.boundary,
        area,
    };
    return { ok: true, event, site: next };
}
